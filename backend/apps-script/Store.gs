/**
 * File 4 of 6: Store.gs  (spreadsheet access, locking, serials, audit, journal, repair, initialization)
 */

// ---------------------------------------------------------------------------------------------
// Locking
// ---------------------------------------------------------------------------------------------

/** Runs fn while holding the script-wide lock. Returns BUSY (retryable) if the lock cannot be obtained. */
function withScriptLock(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(LIMITS.lockWaitMs)) {
    fail('BUSY', 'The server is busy. Please try again in a moment.', { retryable: true });
  }
  try {
    return fn();
  } finally {
    try {
      lock.releaseLock();
    } catch (e) {
      console.error('releaseLock failed: ' + e);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Opening the spreadsheet and validating the schema
// ---------------------------------------------------------------------------------------------

function requireSheet(ss, name) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) fail('INTERNAL', 'Sheet "' + name + '" is missing. The administrator must run initializeBackend().', { sheet: name });
  return sheet;
}

function assertHeaders(sheet, expected, name) {
  var actual = sheet.getRange(1, 1, 1, expected.length).getValues()[0];
  for (var i = 0; i < expected.length; i++) {
    var found = String(actual[i] === undefined ? '' : actual[i]).replace(/^\s+|\s+$/g, '');
    if (found !== expected[i]) {
      fail('INTERNAL', 'The spreadsheet layout does not match the expected schema: sheet "' + name + '", column ' + (i + 1) + ' should be "' + expected[i] + '" but is "' + found + '".', {
        sheet: name,
        column: i + 1,
        expected: expected[i],
        found: found,
      });
    }
  }
}

function openStore() {
  var id = getProp(PROP.spreadsheetId);
  if (!id) fail('INTERNAL', 'The backend is not configured: SPREADSHEET_ID is missing.', {});
  var ss;
  try {
    ss = SpreadsheetApp.openById(id);
  } catch (e) {
    console.error('openById failed: ' + e);
    fail('INTERNAL', 'The spreadsheet could not be opened.', {});
  }
  var store = {
    ss: ss,
    cells: requireSheet(ss, SHEET_NAMES.cells),
    meta: requireSheet(ss, SHEET_NAMES.meta),
    audit: requireSheet(ss, SHEET_NAMES.audit),
  };
  assertHeaders(store.cells, CELL_HEADERS, SHEET_NAMES.cells);
  assertHeaders(store.meta, META_HEADERS, SHEET_NAMES.meta);
  assertHeaders(store.audit, AUDIT_HEADERS, SHEET_NAMES.audit);
  return store;
}

// ---------------------------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------------------------

/** Returns [{ row: <sheet row number>, values: [...] }, ...] for all data rows. */
function readRows(sheet, width) {
  var last = sheet.getLastRow();
  if (last < 2) return [];
  var values = sheet.getRange(2, 1, last - 1, width).getValues();
  var rows = [];
  for (var i = 0; i < values.length; i++) rows.push({ row: i + 2, values: values[i] });
  return rows;
}

function serialKey(value) {
  return String(value === undefined || value === null ? '' : value).replace(/^\s+|\s+$/g, '');
}

function isBlankRow(values) {
  for (var i = 0; i < values.length; i++) if (String(values[i]) !== '') return false;
  return true;
}

function loadState(store) {
  var cells = readRows(store.cells, CELL_HEADERS.length).filter(function (r) {
    return !isBlankRow(r.values);
  });
  var meta = readRows(store.meta, META_HEADERS.length).filter(function (r) {
    return !isBlankRow(r.values);
  });
  return { cells: cells, meta: meta };
}

function findBySerial(rows, serial) {
  for (var i = 0; i < rows.length; i++) if (serialKey(rows[i].values[0]) === String(serial)) return rows[i];
  return null;
}

function findCellByBarcode(rows, barcode) {
  for (var i = 0; i < rows.length; i++) if (String(rows[i].values[COL.barcode]) === barcode) return rows[i];
  return null;
}

function emptyToNull(value) {
  return value === '' || value === undefined ? null : value;
}

/** A blank (or unrecognised) sheet value reads as the default, so every cell always has exactly one valid status. */
function normalizeVisualStatus(value) {
  var text = String(value === undefined || value === null ? '' : value).replace(/^\s+|\s+$/g, '');
  return VISUAL_STATUSES.indexOf(text) === -1 ? DEFAULT_VISUAL_STATUS : text;
}

/** Builds the API representation of a cell from its BatteryCells row and CellMeta row. */
function composeCell(cellValues, metaValues) {
  var m = metaValues || [];
  var serial = serialKey(cellValues[COL.serial]);
  return {
    id: serial,
    serialNumber: parseInt(serial, 10),
    batteryBarcode: String(cellValues[COL.barcode]),
    rawPayload: m.length ? String(m[META_COL.rawPayload]) : '',
    validationMode: m.length ? String(m[META_COL.validationMode]) : '',
    validationStatus: m.length ? String(m[META_COL.validationStatus]) : 'UNVERIFIED',
    cellWeightG: toNumberOrNull(cellValues[COL.weight]),
    cellVoltageV: toNumberOrNull(cellValues[COL.voltage]),
    acirMohm: toNumberOrNull(cellValues[COL.acir]),
    cellLocalNumber: emptyToNull(cellValues[COL.localNumber]) === null ? null : String(cellValues[COL.localNumber]),
    dischargeCapacity05CAh: toNumberOrNull(cellValues[COL.capacity]),
    dcir20Mohm: toNumberOrNull(cellValues[COL.dcir20]),
    dcir50Mohm: toNumberOrNull(cellValues[COL.dcir50]),
    dcir90Mohm: toNumberOrNull(cellValues[COL.dcir90]),
    visualInspectionStatus: normalizeVisualStatus(cellValues[COL.visualStatus]),
    remarks: emptyToNull(cellValues[COL.remarks]) === null ? null : String(cellValues[COL.remarks]),
    stationId: m.length && m[META_COL.stationId] !== '' ? String(m[META_COL.stationId]) : null,
    lineId: m.length && m[META_COL.lineId] !== '' ? String(m[META_COL.lineId]) : null,
    scannedAt: m.length ? String(m[META_COL.scannedAt]) : '',
    createdAt: m.length ? String(m[META_COL.createdAt]) : '',
    updatedAt: m.length ? String(m[META_COL.updatedAt]) : '',
    version: m.length ? parseInt(m[META_COL.version], 10) || 1 : 1,
  };
}

function composeFromState(state, serial) {
  var cellRow = findBySerial(state.cells, serial);
  if (!cellRow) return null;
  var metaRow = findBySerial(state.meta, serial);
  return composeCell(cellRow.values, metaRow ? metaRow.values : null);
}

// ---------------------------------------------------------------------------------------------
// Writing (identifiers are written as text; valid measurements as numbers)
// ---------------------------------------------------------------------------------------------

function nextRowNumber(sheet) {
  var next = sheet.getLastRow() + 1;
  if (next > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), 100);
  return next;
}

/**
 * Returns the indexes of text values that did not come back from the sheet exactly as written.
 * Google Sheets can still turn some text into a formula, number or date when it is written with setValues
 * (for example a code that starts with "=" or that looks like a number), even in a plain-text cell.
 */
function readBackMismatches(sheet, rowNumber, values) {
  var range = sheet.getRange(rowNumber, 1, 1, values.length);
  var read = range.getValues()[0];
  var formulas = range.getFormulas()[0];
  var bad = [];
  for (var i = 0; i < values.length; i++) {
    var intended = values[i];
    if (typeof intended !== 'string' || intended === '') continue;
    var isFormula = formulas[i] !== undefined && formulas[i] !== '';
    if (isFormula || typeof read[i] !== 'string' || read[i] !== intended) bad.push(i);
  }
  return bad;
}

/**
 * Writes one row and VERIFIES it. Any text value that Sheets altered is rewritten as a literal rich-text
 * value and checked again. If a value still cannot be stored exactly, it is cleared and an error is thrown,
 * so the calling operation rolls back instead of saving a corrupted or formula-bearing value.
 */
function writeRowVerified(sheet, rowNumber, values) {
  sheet.getRange(rowNumber, 1, 1, values.length).setValues([values]);
  var bad = readBackMismatches(sheet, rowNumber, values);
  if (bad.length === 0) return;

  bad.forEach(function (i) {
    var cell = sheet.getRange(rowNumber, i + 1);
    cell.setNumberFormat('@');
    cell.setRichTextValue(SpreadsheetApp.newRichTextValue().setText(values[i]).build());
  });

  var stillBad = readBackMismatches(sheet, rowNumber, values);
  if (stillBad.length > 0) {
    stillBad.forEach(function (i) {
      sheet.getRange(rowNumber, i + 1).clearContent();
    });
    throw new Error('A value could not be stored as literal text in ' + sheet.getName() + ' column ' + (stillBad[0] + 1) + '.');
  }
}

/** Writes a BatteryCells row (array of 13 values). Text columns are forced to plain text first. */
function writeCellsRow(store, rowNumber, values) {
  var sheet = store.cells;
  sheet.getRange(rowNumber, COL.serial + 1, 1, 2).setNumberFormat('@'); // A:B
  sheet.getRange(rowNumber, COL.localNumber + 1, 1, 1).setNumberFormat('@'); // F
  sheet.getRange(rowNumber, COL.visualStatus + 1, 1, 3).setNumberFormat('@'); // K:M
  writeRowVerified(sheet, rowNumber, values);
}

function writeMetaRow(store, rowNumber, values) {
  var sheet = store.meta;
  sheet.getRange(rowNumber, 1, 1, META_COL.version).setNumberFormat('@'); // A:J as text
  writeRowVerified(sheet, rowNumber, values);
}

function buildCellValues(serial, barcode, fields) {
  var f = fields || {};
  var row = [];
  for (var i = 0; i < CELL_HEADERS.length; i++) row.push('');
  row[COL.serial] = String(serial);
  row[COL.barcode] = barcode;
  row[COL.localNumber] = f.cellLocalNumber === undefined || f.cellLocalNumber === null ? '' : String(f.cellLocalNumber);
  row[COL.visualStatus] = f.visualInspectionStatus === undefined || f.visualInspectionStatus === null ? DEFAULT_VISUAL_STATUS : String(f.visualInspectionStatus);
  row[COL.remarks] = f.remarks === undefined || f.remarks === null ? '' : String(f.remarks);
  row[COL.createdAt] = f.createdAt === undefined || f.createdAt === null ? '' : String(f.createdAt);
  for (var n = 0; n < NUMERIC_FIELDS.length; n++) {
    var v = f[NUMERIC_FIELDS[n].key];
    row[NUMERIC_FIELDS[n].col] = typeof v === 'number' && isFinite(v) ? v : '';
  }
  return row;
}

function findRowNumberBySerial(sheet, serial) {
  var last = sheet.getLastRow();
  if (last < 2) return 0;
  var col = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < col.length; i++) if (serialKey(col[i][0]) === String(serial)) return i + 2;
  return 0;
}

function deleteRowsBySerial(store, serial) {
  var cellsRow = findRowNumberBySerial(store.cells, serial);
  if (cellsRow) store.cells.deleteRow(cellsRow);
  var metaRow = findRowNumberBySerial(store.meta, serial);
  if (metaRow) store.meta.deleteRow(metaRow);
}

// ---------------------------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------------------------

function appendAudit(store, action, serial, barcode, before, after, requestId) {
  var sheet = store.audit;
  var row = nextRowNumber(sheet);
  sheet.getRange(row, 1, 1, AUDIT_HEADERS.length).setNumberFormat('@');
  writeRowVerified(sheet, row, [
    nowIso(),
    action,
    serial === null || serial === undefined ? '' : String(serial),
    barcode || '',
    before ? JSON.stringify(before) : '',
    after ? JSON.stringify(after) : '',
    requestId || '',
  ]);
}

var COMPLETED_ACTIONS = { CREATE: true, UPDATE: true, DELETE: true };

/** Finds a previously completed mutating request (the audit row is the commit marker). */
function findCompletedRequest(store, requestId) {
  var rows = readRows(store.audit, AUDIT_HEADERS.length);
  for (var i = rows.length - 1; i >= 0; i--) {
    var v = rows[i].values;
    if (String(v[AUDIT_COL.requestId]) === requestId && COMPLETED_ACTIONS[String(v[AUDIT_COL.action])]) {
      return { action: String(v[AUDIT_COL.action]), serial: serialKey(v[AUDIT_COL.serial]), afterJson: String(v[AUDIT_COL.after]) };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Serial numbers (server-only, persistent, never reused)
// ---------------------------------------------------------------------------------------------

function maxSerialIn(rows) {
  var max = 0;
  for (var i = 0; i < rows.length; i++) {
    var n = parseInt(serialKey(rows[i].values[0]), 10);
    if (isFinite(n) && n > max) max = n;
  }
  return max;
}

function allocateSerial(state) {
  var counter = getIntProp(PROP.serialCounter, 0);
  var next = Math.max(counter, maxSerialIn(state.cells), maxSerialIn(state.meta)) + 1;
  PropertiesService.getScriptProperties().setProperty(PROP.serialCounter, String(next));
  return next;
}

// ---------------------------------------------------------------------------------------------
// Journal: crash/partial-write recovery. Always called while holding the script lock.
// ---------------------------------------------------------------------------------------------

function journalBegin(entry) {
  entry.startedAt = nowIso();
  PropertiesService.getScriptProperties().setProperty(PROP.journal, JSON.stringify(entry));
}

function journalClear() {
  PropertiesService.getScriptProperties().deleteProperty(PROP.journal);
}

function restoreRowsFromJournal(store, entry) {
  var cellsRow = findRowNumberBySerial(store.cells, entry.serial);
  if (cellsRow && entry.beforeCellsRow) writeCellsRow(store, cellsRow, entry.beforeCellsRow);
  var metaRow = findRowNumberBySerial(store.meta, entry.serial);
  if (metaRow && entry.beforeMetaRow) writeMetaRow(store, metaRow, entry.beforeMetaRow);
}

/**
 * Completes or rolls back an interrupted operation.
 *  - CREATE / UPDATE: if the audit row exists the operation had committed; otherwise roll it back.
 *  - DELETE: the audit row is written first, so an audited delete is rolled forward.
 * Throws (keeping the journal) if recovery itself fails, so no new write proceeds on a damaged state.
 */
function recoverJournal(store) {
  var raw = getProp(PROP.journal);
  if (!raw) return false;

  var entry;
  try {
    entry = JSON.parse(raw);
  } catch (e) {
    journalClear();
    console.error('Discarded an unreadable journal entry.');
    return false;
  }

  var audited = findCompletedRequest(store, entry.requestId);
  var auditedForThis = audited && audited.action === entry.action && audited.serial === String(entry.serial);

  if (entry.action === 'CREATE') {
    if (!auditedForThis) {
      deleteRowsBySerial(store, entry.serial);
      appendAudit(store, 'RECOVERY_ROLLBACK_CREATE', entry.serial, '', null, null, entry.requestId);
    }
  } else if (entry.action === 'UPDATE') {
    if (!auditedForThis) {
      restoreRowsFromJournal(store, entry);
      appendAudit(store, 'RECOVERY_ROLLBACK_UPDATE', entry.serial, '', null, null, entry.requestId);
    }
  } else if (entry.action === 'DELETE') {
    if (auditedForThis) {
      deleteRowsBySerial(store, entry.serial);
      appendAudit(store, 'RECOVERY_ROLLFORWARD_DELETE', entry.serial, '', null, null, entry.requestId);
    }
  }
  journalClear();
  return true;
}

/**
 * Detects and repairs inconsistent state between BatteryCells and CellMeta:
 *  - a CellMeta row with no BatteryCells row is removed (and logged);
 *  - a BatteryCells row with no CellMeta row gets a default meta row (and is logged).
 * Returns the (possibly reloaded) state.
 */
function repairState(store, state) {
  var changed = false;

  state.meta.slice().forEach(function (metaRow) {
    if (!findBySerial(state.cells, serialKey(metaRow.values[0]))) {
      appendAudit(store, 'REPAIR_ORPHAN_META', serialKey(metaRow.values[0]), '', metaRow.values, null, '');
      var rowNumber = findRowNumberBySerial(store.meta, serialKey(metaRow.values[0]));
      if (rowNumber) store.meta.deleteRow(rowNumber);
      changed = true;
    }
  });

  state.cells.forEach(function (cellRow) {
    var serial = serialKey(cellRow.values[COL.serial]);
    if (!findBySerial(state.meta, serial)) {
      var now = nowIso();
      var values = [serial, '', '', 'UNVERIFIED', now, now, now, '', '', '', 1];
      writeMetaRow(store, nextRowNumber(store.meta), values);
      appendAudit(store, 'REPAIR_MISSING_META', serial, String(cellRow.values[COL.barcode]), null, values, '');
      changed = true;
    }
  });

  return changed ? loadState(store) : state;
}

/** Standard preamble for every mutation (call while holding the lock). */
function prepareForWrite(store) {
  recoverJournal(store);
  return repairState(store, loadState(store));
}

// ---------------------------------------------------------------------------------------------
// Administrator initialization
// ---------------------------------------------------------------------------------------------

function ensureSheetWithHeaders(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (sheet.getMaxColumns() < headers.length) sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  } else {
    assertHeaders(sheet, headers, name); // never overwrite an existing, different layout
  }
  sheet.setFrozenRows(1);
  return sheet;
}

function setTextFormatForColumns(sheet, columns) {
  var rows = Math.max(sheet.getMaxRows() - 1, 1);
  columns.forEach(function (col) {
    sheet.getRange(2, col + 1, rows, 1).setNumberFormat('@');
  });
}

/**
 * One-time (and safe to re-run) setup. Run it from the Apps Script editor after setting the
 * SPREADSHEET_ID Script Property.
 */
function initializeBackend() {
  var id = getProp(PROP.spreadsheetId);
  if (!id) throw new Error('Set the Script Property SPREADSHEET_ID first.');
  var ss = SpreadsheetApp.openById(id);

  var cells = ensureSheetWithHeaders(ss, SHEET_NAMES.cells, CELL_HEADERS);
  var meta = ensureSheetWithHeaders(ss, SHEET_NAMES.meta, META_HEADERS);
  var audit = ensureSheetWithHeaders(ss, SHEET_NAMES.audit, AUDIT_HEADERS);

  setTextFormatForColumns(cells, CELL_TEXT_COLUMNS);
  applyVisualStatusDropdown(cells);
  setTextFormatForColumns(meta, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  setTextFormatForColumns(audit, [0, 1, 2, 3, 4, 5, 6]);

  [cells, meta, audit].forEach(function (sheet) {
    var description = 'Header row - do not edit';
    var already = sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE).some(function (p) {
      return p.getDescription() === description;
    });
    if (already) return;
    var protection = sheet.getRange(1, 1, 1, sheet.getLastColumn()).protect();
    protection.setDescription(description);
    protection.setWarningOnly(true);
  });

  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty(PROP.tokenSecret)) props.setProperty(PROP.tokenSecret, randomHex(32));
  if (!props.getProperty(PROP.tokenEpoch)) props.setProperty(PROP.tokenEpoch, '1');

  var state = loadState({ cells: cells, meta: meta, audit: audit });
  var current = getIntProp(PROP.serialCounter, 0);
  props.setProperty(PROP.serialCounter, String(Math.max(current, maxSerialIn(state.cells), maxSerialIn(state.meta))));

  console.log('Backend initialized. Validation mode: ' + getValidationMode() + '. Credentials configured: ' + (props.getProperty(PROP.authPasswordRecord) ? 'yes' : 'NO (run setupCredentials)'));
}

/** Restricts column L (Cell Status) to the four allowed values, as a dropdown. Safe to re-run. */
function applyVisualStatusDropdown(sheet) {
  var rows = Math.max(sheet.getMaxRows() - 1, 1);
  var rule = SpreadsheetApp.newDataValidation().requireValueInList(VISUAL_STATUSES, true).setAllowInvalid(false).build();
  sheet.getRange(2, COL.visualStatus + 1, rows, 1).setDataValidation(rule);
}

/** Admin tool: run the same journal recovery and repair a write would perform. */
function repairIntegrity() {
  var store = openStore();
  withScriptLock(function () {
    prepareForWrite(store);
  });
  console.log('Integrity check finished.');
}
