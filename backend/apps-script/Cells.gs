/**
 * File 5 of 6: Cells.gs  (cell CRUD handlers)
 *
 * Every mutation: takes the script lock, recovers/repairs state, honours requestId idempotency,
 * writes through a journal, and records an AuditLog row as the commit marker.
 */

var CREATE_ALLOWED_KEYS = { payload: true, source: true, scannedAt: true, stationId: true, lineId: true };

function requireSource(value) {
  if (value === undefined || value === null) return 'scan';
  if (value !== 'scan' && value !== 'manual') {
    fail('VALIDATION', 'The source must be "scan" or "manual".', { fieldErrors: { source: 'Invalid.' } });
  }
  return value;
}

function duplicateError(barcode, row) {
  var serial = serialKey(row.values[COL.serial]);
  return new ApiError('DUPLICATE_BARCODE', 'This battery barcode is already registered.', {
    barcode: barcode,
    existing: { id: serial, serialNumber: parseInt(serial, 10) },
  });
}

function internalNotSaved(recovery) {
  return new ApiError(
    'INTERNAL',
    recovery === 'PENDING'
      ? 'The operation failed and could not be fully undone. The administrator must run repairIntegrity().'
      : 'The operation could not be completed. Nothing was saved. Please try again.',
    { recovery: recovery },
  );
}

// ---------------------------------------------------------------------------------------------
// Reads (no lock needed)
// ---------------------------------------------------------------------------------------------

function handleList() {
  var store = openStore();
  var state = loadState(store);
  var cells = state.cells.map(function (cellRow) {
    var metaRow = findBySerial(state.meta, serialKey(cellRow.values[COL.serial]));
    return composeCell(cellRow.values, metaRow ? metaRow.values : null);
  });
  return { cells: cells };
}

function handleGet(payload) {
  var id = requireCellId(isPlainObject(payload) ? payload.id : undefined);
  var store = openStore();
  var cell = composeFromState(loadState(store), id);
  if (!cell) fail('NOT_FOUND', 'Cell not found. It may have been deleted.', { id: id });
  return { cell: cell };
}

function handleFindByBarcode(payload) {
  var barcode = isPlainObject(payload) ? payload.barcode : undefined;
  if (typeof barcode !== 'string' || barcode.length > LIMITS.maxPayloadLength) {
    fail('VALIDATION', 'A barcode is required.', { fieldErrors: { barcode: 'Required.' } });
  }
  var trimmed = barcode.replace(/^\s+|\s+$/g, '');
  if (trimmed === '') fail('VALIDATION', 'A barcode is required.', { fieldErrors: { barcode: 'Required.' } });
  var store = openStore();
  var state = loadState(store);
  var row = findCellByBarcode(state.cells, trimmed);
  return { cell: row ? composeFromState(state, serialKey(row.values[COL.serial])) : null };
}

// ---------------------------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------------------------

function handleCreate(payload, body) {
  var requestId = requireRequestId(body.requestId);
  if (!isPlainObject(payload)) fail('VALIDATION', 'The request payload is required.', {});

  var unexpected = {};
  Object.keys(payload).forEach(function (key) {
    if (!CREATE_ALLOWED_KEYS[key]) unexpected[key] = 'Not accepted when registering a cell.';
  });
  if (Object.keys(unexpected).length > 0) {
    fail('VALIDATION', 'Only the scanned code can be provided when registering a cell.', { fieldErrors: unexpected });
  }

  var source = requireSource(payload.source);
  sanitizePayload(payload.payload); // structural checks before taking the lock
  var stationId = optionalShortText(payload.stationId, 'stationId');
  var lineId = optionalShortText(payload.lineId, 'lineId');
  var scannedAt = resolveScannedAt(payload.scannedAt);

  return withScriptLock(function () {
    var store = openStore();
    var state = prepareForWrite(store);

    var done = findCompletedRequest(store, requestId);
    if (done) {
      if (done.action !== 'CREATE') {
        fail('VALIDATION', 'This requestId was already used for a different operation.', { reason: 'REQUEST_ID_REUSED' });
      }
      var replay = composeFromState(state, done.serial);
      if (!replay && done.afterJson) replay = JSON.parse(done.afterJson);
      return { cell: replay, replayed: true };
    }

    var check = validatePayloadForMode(payload.payload);

    var duplicate = findCellByBarcode(state.cells, check.barcode);
    if (duplicate) throw duplicateError(check.barcode, duplicate);

    var serial = allocateSerial(state);
    var now = nowIso();
    // "Created At" (column M) is stamped here by the server clock, in IST, so it cannot be set or changed by the app.
    // (CellMeta keeps the same instant as a UTC timestamp for the app.)
    var cellValues = buildCellValues(serial, check.barcode, { createdAt: istFromMs(Date.parse(now)) });
    var metaValues = [
      String(serial),
      source === 'scan' ? payload.payload : '',
      check.validationMode,
      check.validationStatus,
      scannedAt,
      now,
      now,
      stationId,
      lineId,
      requestId,
      1,
    ];

    var cell;
    journalBegin({ requestId: requestId, action: 'CREATE', serial: serial });
    try {
      // CellMeta first, then BatteryCells (the visible record), then the audit commit marker.
      writeMetaRow(store, nextRowNumber(store.meta), metaValues);
      writeCellsRow(store, nextRowNumber(store.cells), cellValues);
      cell = composeCell(cellValues, metaValues);
      appendAudit(store, 'CREATE', serial, check.barcode, null, cell, requestId);
    } catch (err) {
      console.error('CREATE failed, rolling back: ' + err);
      var recovery = 'ROLLED_BACK';
      try {
        deleteRowsBySerial(store, serial);
        journalClear();
      } catch (rollbackErr) {
        console.error('CREATE rollback failed: ' + rollbackErr);
        recovery = 'PENDING';
      }
      throw internalNotSaved(recovery);
    }
    journalClear();
    return { cell: cell, replayed: false };
  });
}

// ---------------------------------------------------------------------------------------------
// Update (optimistic locking via CellMeta.Version)
// ---------------------------------------------------------------------------------------------

function handleUpdate(payload, body) {
  var requestId = requireRequestId(body.requestId);
  if (!isPlainObject(payload)) fail('VALIDATION', 'The request payload is required.', {});
  var id = requireCellId(payload.id);

  var expectedVersion = payload.expectedVersion;
  if (typeof expectedVersion !== 'number' || expectedVersion % 1 !== 0 || expectedVersion < 1) {
    fail('VALIDATION', 'expectedVersion is required.', { fieldErrors: { expectedVersion: 'Required.' } });
  }

  var patch = validatePatch(payload.patch);
  var newBarcode = null;
  if (payload.newBarcode !== undefined && payload.newBarcode !== null) {
    if (!isPlainObject(payload.newBarcode)) fail('VALIDATION', 'newBarcode is invalid.', { fieldErrors: { newBarcode: 'Invalid.' } });
    sanitizePayload(payload.newBarcode.payload);
    newBarcode = { payload: payload.newBarcode.payload, source: requireSource(payload.newBarcode.source) };
  }

  return withScriptLock(function () {
    var store = openStore();
    var state = prepareForWrite(store);

    var done = findCompletedRequest(store, requestId);
    if (done) {
      if (done.action !== 'UPDATE' || done.serial !== id) {
        fail('VALIDATION', 'This requestId was already used for a different operation.', { reason: 'REQUEST_ID_REUSED' });
      }
      var current = composeFromState(state, id);
      if (!current) fail('NOT_FOUND', 'Cell not found. It may have been deleted.', { id: id });
      return { cell: current, replayed: true };
    }

    var cellRow = findBySerial(state.cells, id);
    if (!cellRow) fail('NOT_FOUND', 'Cell not found. It may have been deleted.', { id: id });
    var metaRow = findBySerial(state.meta, id);
    var currentVersion = parseInt(metaRow.values[META_COL.version], 10) || 1;
    var before = composeCell(cellRow.values, metaRow.values);

    if (currentVersion !== expectedVersion) {
      fail('CONFLICT', 'This cell was changed by someone else. Reload it and try again.', {
        currentVersion: currentVersion,
        current: before,
      });
    }

    var check = null;
    if (newBarcode) {
      check = validatePayloadForMode(newBarcode.payload);
      var clash = findCellByBarcode(state.cells, check.barcode);
      if (clash && serialKey(clash.values[COL.serial]) !== id) throw duplicateError(check.barcode, clash);
    }

    var newCellValues = cellRow.values.slice();
    var i;
    for (i = 0; i < TEXT_FIELDS.length; i++) {
      if (Object.prototype.hasOwnProperty.call(patch, TEXT_FIELDS[i].key)) {
        var text = patch[TEXT_FIELDS[i].key];
        newCellValues[TEXT_FIELDS[i].col] = text === null ? '' : text;
      }
    }
    for (i = 0; i < NUMERIC_FIELDS.length; i++) {
      if (Object.prototype.hasOwnProperty.call(patch, NUMERIC_FIELDS[i].key)) {
        var num = patch[NUMERIC_FIELDS[i].key];
        newCellValues[NUMERIC_FIELDS[i].col] = num === null ? '' : num;
      }
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'visualInspectionStatus')) {
      newCellValues[COL.visualStatus] = patch.visualInspectionStatus;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'remarks')) {
      newCellValues[COL.remarks] = patch.remarks === null ? '' : patch.remarks;
    }
    // Rule applies to the RESULTING state, so changing only the status (or clearing only the remarks) is checked too.
    var resultingStatus = normalizeVisualStatus(newCellValues[COL.visualStatus]);
    var resultingRemarks = String(newCellValues[COL.remarks] === undefined ? '' : newCellValues[COL.remarks]).replace(/^\s+|\s+$/g, '');
    if (REMARKS_REQUIRED_STATUSES.indexOf(resultingStatus) !== -1 && resultingRemarks === '') {
      fail('VALIDATION', 'Remarks are required when the status is ' + resultingStatus + '.', {
        fieldErrors: { remarks: 'Required when the status is ' + resultingStatus + '.' },
      });
    }
    if (check) newCellValues[COL.barcode] = check.barcode;

    var newMetaValues = metaRow.values.slice();
    newMetaValues[META_COL.version] = currentVersion + 1;
    newMetaValues[META_COL.updatedAt] = nowIso();
    newMetaValues[META_COL.requestId] = requestId;
    if (check) {
      newMetaValues[META_COL.rawPayload] = newBarcode.source === 'scan' ? newBarcode.payload : '';
      newMetaValues[META_COL.validationMode] = check.validationMode;
      newMetaValues[META_COL.validationStatus] = check.validationStatus;
    }

    var after;
    journalBegin({
      requestId: requestId,
      action: 'UPDATE',
      serial: id,
      beforeCellsRow: cellRow.values,
      beforeMetaRow: metaRow.values,
    });
    try {
      writeCellsRow(store, cellRow.row, newCellValues);
      writeMetaRow(store, metaRow.row, newMetaValues);
      after = composeCell(newCellValues, newMetaValues);
      appendAudit(store, 'UPDATE', id, after.batteryBarcode, before, after, requestId);
    } catch (err) {
      console.error('UPDATE failed, rolling back: ' + err);
      var recovery = 'ROLLED_BACK';
      try {
        writeCellsRow(store, cellRow.row, cellRow.values);
        writeMetaRow(store, metaRow.row, metaRow.values);
        journalClear();
      } catch (rollbackErr) {
        console.error('UPDATE rollback failed: ' + rollbackErr);
        recovery = 'PENDING';
      }
      throw internalNotSaved(recovery);
    }
    journalClear();
    return { cell: after, replayed: false };
  });
}

// ---------------------------------------------------------------------------------------------
// Delete (audit first, then remove the records)
// ---------------------------------------------------------------------------------------------

function handleDelete(payload, body) {
  var requestId = requireRequestId(body.requestId);
  if (!isPlainObject(payload)) fail('VALIDATION', 'The request payload is required.', {});
  var id = requireCellId(payload.id);

  return withScriptLock(function () {
    var store = openStore();
    var state = prepareForWrite(store);

    var done = findCompletedRequest(store, requestId);
    if (done) {
      if (done.action !== 'DELETE' || done.serial !== id) {
        fail('VALIDATION', 'This requestId was already used for a different operation.', { reason: 'REQUEST_ID_REUSED' });
      }
      return { deleted: true, id: id, replayed: true };
    }

    var cellRow = findBySerial(state.cells, id);
    if (!cellRow) fail('NOT_FOUND', 'Cell not found. It may have been deleted.', { id: id });
    var metaRow = findBySerial(state.meta, id);
    var before = composeCell(cellRow.values, metaRow ? metaRow.values : null);

    journalBegin({
      requestId: requestId,
      action: 'DELETE',
      serial: id,
      beforeCellsRow: cellRow.values,
      beforeMetaRow: metaRow ? metaRow.values : null,
    });

    // 1) Audit the full record BEFORE deleting anything.
    try {
      appendAudit(store, 'DELETE', id, before.batteryBarcode, before, null, requestId);
    } catch (err) {
      console.error('DELETE audit failed; nothing was deleted: ' + err);
      var cleared = true;
      try {
        journalClear();
      } catch (e2) {
        cleared = false;
      }
      throw internalNotSaved(cleared ? 'ROLLED_BACK' : 'PENDING');
    }

    // 2) The delete is now committed. If removal fails, the journal rolls it forward on the next write.
    try {
      deleteRowsBySerial(store, id);
    } catch (err) {
      console.error('DELETE removal failed; will be rolled forward: ' + err);
      throw new ApiError('INTERNAL', 'The record could not be fully deleted yet. Please retry; it will be completed.', {
        recovery: 'PENDING',
      });
    }
    journalClear();
    return { deleted: true, id: id, replayed: false };
  });
}
