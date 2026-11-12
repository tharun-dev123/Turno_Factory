/**
 * OPTIONAL file: SelfTest.gs  (paste as a 7th script file, run once, then delete it)
 *
 * Runs the real backend end-to-end INSIDE Google Apps Script, without the web app URL, so it works even
 * before public access is allowed. It checks Google-specific behaviour: LockService, text formatting,
 * number storage, formula safety, idempotency and optimistic locking.
 *
 * It creates ten test cells (two main ones plus eight edge cases) and deletes them again. If the test is
 * interrupted, the next run first removes any leftover TEST cells (only barcodes it knows it creates), and a
 * crash during a run removes whatever that run created. It leaves two things behind (AuditLog rows and the
 * serial counter): run cleanupAfterSelfTest() afterwards, while the system is still empty, so the first real
 * cell is #1.
 */

var SELFTEST_TRICKY = ['+1-555', '-42', '@abc', '0012345', '2026-11-11', 'TRUE', '1E5', '=SUM(1,2)'];

/** True only for barcodes this self-test creates, so cleanup can never remove a real cell. */
function isSelfTestBarcode(barcode) {
  return barcode === '=1+1' || barcode.indexOf('SELFTEST-') === 0 || SELFTEST_TRICKY.indexOf(barcode) !== -1;
}

function runSelfTest() {
  var lines = [];
  var failed = 0;
  var createdIds = []; // test cells that still exist, removed in `finally` if the run is interrupted

  function check(name, ok, detail) {
    if (!ok) failed++;
    lines.push((ok ? 'PASS  ' : 'FAIL  ') + name + (ok ? '' : '   -> ' + detail));
  }

  function api(action, payload, extra) {
    var body = { action: action, payload: payload || {} };
    if (extra) Object.keys(extra).forEach(function (k) { body[k] = extra[k]; });
    return JSON.parse(doPost({ postData: { contents: JSON.stringify(body) } }).getContent());
  }

  function rid(tag) {
    return 'selftest-' + tag + '-' + Utilities.getUuid().slice(0, 8);
  }

  function cellsSheetRow(serial) {
    var sheet = openStore().cells;
    var row = findRowNumberBySerial(sheet, serial);
    return row ? sheet.getRange(row, 1, 1, CELL_HEADERS.length).getValues()[0] : null;
  }

  var token = issueToken(getProp(PROP.authUsername)).token;

  /** Create a test cell and remember it so it can be removed even if the run is interrupted. */
  function createTracked(payload, extra) {
    var res = api('cells.create', payload, extra);
    if (res.ok) createdIds.push(res.data.cell.id);
    return res;
  }
  function deleteTracked(id, requestId) {
    var res = api('cells.delete', { id: id }, { token: token, requestId: requestId });
    if (res.ok) createdIds = createdIds.filter(function (x) { return x !== id; });
    return res;
  }

  try {
    // 0. Remove leftovers from an earlier interrupted run (only known test barcodes)
    var existing = api('cells.list', {}, { token: token });
    if (existing.ok) {
      existing.data.cells.forEach(function (cell, i) {
        if (isSelfTestBarcode(cell.batteryBarcode)) {
          var removed = api('cells.delete', { id: cell.id }, { token: token, requestId: rid('preclean' + i) });
          lines.push('INFO  removed leftover test cell #' + cell.serialNumber + ' (' + cell.batteryBarcode + '): ' + (removed.ok ? 'ok' : JSON.stringify(removed)));
        }
      });
    }

    // 1. Health (no login)
    var health = api('health');
    check('health responds ok', health.ok === true, JSON.stringify(health));
    check('health: schema ok', health.ok && health.data.schema === 'ok', JSON.stringify(health));
    lines.push('INFO  validationMode = ' + (health.ok ? health.data.validationMode : '?'));

    // 2. Authentication
    var unauth = api('cells.list');
    check('protected action without token is rejected', !unauth.ok && unauth.error.code === 'AUTH', JSON.stringify(unauth));
    var list0 = api('cells.list', {}, { token: token });
    check('valid token can list', list0.ok === true, JSON.stringify(list0));
    check('list is empty before the test', list0.ok && list0.data.cells.length === 0, 'cells found: ' + (list0.ok ? list0.data.cells.length : '?'));

    // 3. Create (raw payload with surrounding whitespace is preserved)
    var payload1 = '  SELFTEST-' + Utilities.getUuid().slice(0, 8) + ' ';
    var req1 = rid('create1');
    var c1 = createTracked({ payload: payload1, source: 'scan', stationId: 'A-12', lineId: '04' }, { token: token, requestId: req1 });
    check('create succeeds', c1.ok === true, JSON.stringify(c1));
    var cell1 = c1.ok ? c1.data.cell : null;
    if (cell1) {
      check('serial number assigned by the server', typeof cell1.serialNumber === 'number' && cell1.serialNumber >= 1, JSON.stringify(cell1));
      check('barcode is the trimmed payload', cell1.batteryBarcode === payload1.replace(/^\s+|\s+$/g, ''), cell1.batteryBarcode);
      check('raw payload preserved exactly', cell1.rawPayload === payload1, JSON.stringify(cell1.rawPayload));
      check('pilot record is UNVERIFIED', cell1.validationStatus === 'UNVERIFIED' && cell1.validationMode === 'pilot', cell1.validationMode + '/' + cell1.validationStatus);
      var row1 = cellsSheetRow(cell1.serialNumber);
      check('sheet row has serial + barcode only', !!row1 && String(row1[0]) === String(cell1.serialNumber) && row1[1] === cell1.batteryBarcode && row1.slice(2).every(function (v) { return v === ''; }), JSON.stringify(row1));
    }

    // 4. Idempotent retry
    var replay = api('cells.create', { payload: payload1, source: 'scan' }, { token: token, requestId: req1 });
    check('retry with the same requestId is a replay (no second row)', replay.ok && replay.data.replayed === true, JSON.stringify(replay));

    // 5. Duplicate barcode
    var dup = api('cells.create', { payload: payload1, source: 'scan' }, { token: token, requestId: rid('dup') });
    check('duplicate barcode rejected', !dup.ok && dup.error.code === 'DUPLICATE_BARCODE', JSON.stringify(dup));

    // 6. Formula safety + identifiers kept as text
    var c2 = createTracked({ payload: '=1+1', source: 'manual' }, { token: token, requestId: rid('create2') });
    check('formula-like payload is accepted as text', c2.ok === true, JSON.stringify(c2));
    var cell2 = c2.ok ? c2.data.cell : null;
    if (cell2) {
      var row2 = cellsSheetRow(cell2.serialNumber);
      check('formula was NOT evaluated (stored as literal text)', !!row2 && row2[1] === '=1+1', JSON.stringify(row2 && row2[1]));
    }

    // 7. Invalid payloads
    check('empty payload rejected', api('cells.create', { payload: '   ' }, { token: token, requestId: rid('empty') }).error.code === 'VALIDATION', '');
    check('control character rejected', api('cells.create', { payload: 'AB\u0001CD' }, { token: token, requestId: rid('ctrl') }).error.code === 'VALIDATION', '');

    // 8. Update: columns, types, versioning
    if (cell1) {
      var up = api('cells.update', {
        id: cell1.id,
        expectedVersion: 1,
        patch: { sortingGrade: 'Grade A1', cellWeightG: 3120.4, cellLocalNumber: '007', dcir90Mohm: 0.63 },
      }, { token: token, requestId: rid('upd1') });
      check('update succeeds and bumps version', up.ok && up.data.cell.version === 2, JSON.stringify(up));
      var rowU = cellsSheetRow(cell1.serialNumber);
      check('Cell Weight (col D) stored as a number', !!rowU && typeof rowU[3] === 'number' && rowU[3] === 3120.4, JSON.stringify(rowU && rowU[3]));
      check('Cell Local Number (col G) kept as text "007"', !!rowU && rowU[6] === '007', JSON.stringify(rowU && rowU[6]));
      check('DCIR @90% (col K) stored as a number', !!rowU && rowU[10] === 0.63, JSON.stringify(rowU && rowU[10]));
      check('Sorting (col C) stored', !!rowU && rowU[2] === 'Grade A1', JSON.stringify(rowU && rowU[2]));

      var stale = api('cells.update', { id: cell1.id, expectedVersion: 1, patch: { cellWeightG: 9 } }, { token: token, requestId: rid('upd2') });
      check('stale update rejected with CONFLICT', !stale.ok && stale.error.code === 'CONFLICT', JSON.stringify(stale));
    }

    // 9. Reads
    if (cell1) {
      var got = api('cells.get', { id: cell1.id }, { token: token });
      check('get returns the cell', got.ok && got.data.cell.batteryBarcode === cell1.batteryBarcode, JSON.stringify(got));
      var found = api('cells.findByBarcode', { barcode: cell1.batteryBarcode }, { token: token });
      check('findByBarcode returns the cell', found.ok && found.data.cell && found.data.cell.id === cell1.id, JSON.stringify(found));
      var missing = api('cells.findByBarcode', { barcode: 'NO-SUCH-CODE' }, { token: token });
      check('findByBarcode returns null when absent', missing.ok && missing.data.cell === null, JSON.stringify(missing));
    }
    var list1 = api('cells.list', {}, { token: token });
    check('list contains both test cells', list1.ok && list1.data.cells.length === 2, JSON.stringify(list1.ok ? list1.data.cells.length : list1));

    // 10. Delete (+ audit) and idempotent delete retry
    [cell1, cell2].forEach(function (cell, i) {
      if (!cell) return;
      var reqId = rid('del' + i);
      var del = deleteTracked(cell.id, reqId);
      check('delete test cell ' + (i + 1), del.ok === true, JSON.stringify(del));
      if (i === 0) {
        var delAgain = api('cells.delete', { id: cell.id }, { token: token, requestId: reqId });
        check('repeated delete (same requestId) succeeds as a replay', delAgain.ok && delAgain.data.replayed === true, JSON.stringify(delAgain));
      }
    });
    var list2 = api('cells.list', {}, { token: token });
    check('list is empty again', list2.ok && list2.data.cells.length === 0, JSON.stringify(list2.ok ? list2.data.cells.length : list2));

    // 11. Text that Sheets tends to reinterpret must come back exactly as written, then be deleted
    SELFTEST_TRICKY.forEach(function (text, i) {
      var created = createTracked({ payload: text, source: 'manual' }, { token: token, requestId: rid('tricky' + i) });
      var stored = created.ok ? cellsSheetRow(created.data.cell.serialNumber) : null;
      check('stored literally: ' + text, created.ok && !!stored && stored[1] === text, JSON.stringify(created.ok ? stored && stored[1] : created));
      if (created.ok) deleteTracked(created.data.cell.id, rid('trickydel' + i));
    });
    var list3 = api('cells.list', {}, { token: token });
    check('list is empty after the edge-case tests', list3.ok && list3.data.cells.length === 0, JSON.stringify(list3.ok ? list3.data.cells.length : list3));

    var audit = openStore().audit;
    var actions = readRows(audit, AUDIT_HEADERS.length).map(function (r) { return String(r.values[AUDIT_COL.action]); });
    check('AuditLog recorded CREATE, UPDATE and DELETE', actions.indexOf('CREATE') !== -1 && actions.indexOf('UPDATE') !== -1 && actions.indexOf('DELETE') !== -1, actions.join(','));
    check('no half-finished write left behind', !getProp(PROP.journal), 'journal present');
  } catch (e) {
    failed++;
    lines.push('FAIL  the test stopped because of an unexpected error -> ' + e + (e && e.stack ? '\n' + e.stack : ''));
  } finally {
    // Remove anything this run created that is still there (e.g. after a crash).
    createdIds.slice().forEach(function (id, i) {
      try {
        var res = api('cells.delete', { id: id }, { token: token, requestId: rid('final' + i) });
        lines.push('INFO  removed test cell id ' + id + ' after an interruption: ' + (res.ok ? 'ok' : JSON.stringify(res)));
      } catch (cleanupError) {
        lines.push('WARN  could not remove test cell id ' + id + ': ' + cleanupError);
      }
    });
  }

  lines.push('');
  lines.push(failed === 0 ? 'RESULT: ALL CHECKS PASSED' : 'RESULT: ' + failed + ' CHECK(S) FAILED');
  lines.push('Next: run cleanupAfterSelfTest() so the first real cell is #1.');
  console.log('\n' + lines.join('\n'));
}

/**
 * Clears the AuditLog rows and resets the serial counter to 0, but ONLY when BatteryCells and CellMeta are
 * empty. Use it once, right after runSelfTest, before the system goes live. Do not use it afterwards.
 */
function cleanupAfterSelfTest() {
  var store = openStore();
  var state = loadState(store);
  if (state.cells.length > 0 || state.meta.length > 0) {
    throw new Error('Refusing to reset: BatteryCells or CellMeta still contain rows.');
  }
  var last = store.audit.getLastRow();
  if (last >= 2) store.audit.deleteRows(2, last - 1);
  var props = PropertiesService.getScriptProperties();
  props.setProperty(PROP.serialCounter, '0');
  props.deleteProperty(PROP.journal);
  console.log('Self-test data cleared. The next cell will be serial #1.');
}
