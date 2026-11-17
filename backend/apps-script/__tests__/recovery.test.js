const { createBackend } = require('../testkit/harness');

const auditActions = (b) => b.sheets.audit.dump().map((r) => r[1]);
const isAuditWrite = (action) => (_range, values) => Array.isArray(values) && values[0] && values[0][1] === action;
const update = (b, id, v, patch, requestId = b.nextId()) => b.call('cells.update', { id, expectedVersion: v, patch }, { requestId });
const remove = (b, id, requestId = b.nextId()) => b.call('cells.delete', { id }, { requestId });

describe('create: partial-write handling', () => {
  it('rolls back and reports failure (never success) when the audit write fails', () => {
    const b = createBackend();
    b.login();
    b.sheets.audit.failNext('setValues', { when: isAuditWrite('CREATE') });

    const res = b.create('PART-1', 'partial-create-01');
    expect(res).toMatchObject({ ok: false, error: { code: 'INTERNAL', details: { recovery: 'ROLLED_BACK' } } });
    expect(res.error.message).toMatch(/Nothing was saved/);

    expect(b.sheets.cells.dump()).toHaveLength(0);
    expect(b.sheets.meta.dump()).toHaveLength(0);
    expect(b.props.getProperty('JOURNAL')).toBeNull();
    expect(b.lockState.held).toBe(false);

    // The retry with the SAME requestId succeeds exactly once (a serial gap is acceptable).
    const retry = b.create('PART-1', 'partial-create-01');
    expect(retry).toMatchObject({ ok: true, data: { replayed: false, cell: { batteryBarcode: 'PART-1', serialNumber: 2 } } });
    expect(b.sheets.cells.dump()).toHaveLength(1);
    expect(auditActions(b)).toEqual(['CREATE']);
  });

  it('rolls back the CellMeta row when the BatteryCells write fails', () => {
    const b = createBackend();
    b.login();
    b.sheets.cells.failNext('setValues', { when: (range) => range.numCols === 13 && range.row >= 2 });
    const res = b.create('PART-2');
    expect(res).toMatchObject({ ok: false, error: { code: 'INTERNAL', details: { recovery: 'ROLLED_BACK' } } });
    expect(b.sheets.meta.dump()).toHaveLength(0);
    expect(b.sheets.cells.dump()).toHaveLength(0);
  });

  it('keeps a journal when even the rollback fails, flags it, and recovers on the next write', () => {
    const b = createBackend();
    b.login();
    b.sheets.audit.failNext('setValues', { when: isAuditWrite('CREATE') });
    b.sheets.cells.failNext('deleteRow'); // rollback cannot remove the row either

    const res = b.create('PART-3', 'partial-create-03');
    expect(res).toMatchObject({ ok: false, error: { code: 'INTERNAL', details: { recovery: 'PENDING' } } });
    expect(b.props.getProperty('JOURNAL')).not.toBeNull();
    expect(b.lockState.held).toBe(false);

    // Next write: the journal is rolled back before anything else happens.
    const next = b.create('AFTER-RECOVERY');
    expect(next.ok).toBe(true);
    expect(b.props.getProperty('JOURNAL')).toBeNull();
    expect(b.sheets.cells.dump().map((r) => r[1])).toEqual(['AFTER-RECOVERY']);
    expect(b.sheets.meta.dump().map((r) => r[0])).toEqual([String(next.data.cell.serialNumber)]);
    expect(auditActions(b)).toEqual(['RECOVERY_ROLLBACK_CREATE', 'CREATE']);

    // The failed request can be retried safely and creates the cell once.
    expect(b.create('PART-3', 'partial-create-03').ok).toBe(true);
    expect(b.sheets.cells.dump().map((r) => r[1])).toEqual(['AFTER-RECOVERY', 'PART-3']);
  });

  it('treats a journal whose create was already audited as committed (no rollback)', () => {
    const b = createBackend();
    const created = b.create('KEEP-1', 'keep-create-001').data.cell;
    // Simulate a crash after the audit commit marker but before journalClear().
    b.props.setProperty('JOURNAL', JSON.stringify({ requestId: 'keep-create-001', action: 'CREATE', serial: created.serialNumber }));
    expect(b.create('NEXT-1').ok).toBe(true);
    expect(b.sheets.cells.dump().map((r) => r[1])).toEqual(['KEEP-1', 'NEXT-1']);
    expect(auditActions(b)).toEqual(['CREATE', 'CREATE']);
    expect(b.props.getProperty('JOURNAL')).toBeNull();
  });

  it('discards an unreadable journal instead of blocking all writes', () => {
    const b = createBackend();
    b.props.setProperty('JOURNAL', '{not json');
    expect(b.create('OK-1').ok).toBe(true);
    expect(b.props.getProperty('JOURNAL')).toBeNull();
  });
});

describe('update: partial-write handling', () => {
  it('restores the previous values and version when the audit write fails', () => {
    const b = createBackend();
    b.create('UP-1');
    update(b, '1', 1, { cellWeightG: 10, remarks: 'A' });
    const before = JSON.stringify([b.sheets.cells.dump(), b.sheets.meta.dump()]);

    b.sheets.audit.failNext('setValues', { when: isAuditWrite('UPDATE') });
    const res = update(b, '1', 2, { cellWeightG: 99, remarks: 'Z' });
    expect(res).toMatchObject({ ok: false, error: { code: 'INTERNAL', details: { recovery: 'ROLLED_BACK' } } });

    expect(JSON.stringify([b.sheets.cells.dump(), b.sheets.meta.dump()])).toBe(before);
    expect(b.call('cells.get', { id: '1' }).data.cell).toMatchObject({ cellWeightG: 10, remarks: 'A', version: 2 });
    expect(b.props.getProperty('JOURNAL')).toBeNull();
  });

  it('restores the BatteryCells row when the CellMeta write fails', () => {
    const b = createBackend();
    b.create('UP-2');
    b.sheets.meta.failNext('setValues');
    const res = update(b, '1', 1, { cellWeightG: 5 });
    expect(res.ok).toBe(false);
    expect(b.sheets.cells.dump()[0][2]).toBe('');
    expect(b.call('cells.get', { id: '1' }).data.cell.version).toBe(1);
  });

  it('rolls back an interrupted update on the next write', () => {
    const b = createBackend();
    b.create('UP-3');
    const cellsRow = b.sheets.cells.dump()[0];
    const metaRow = b.sheets.meta.dump()[0];
    // Simulate a crash mid-update: new values written, no audit row, journal still present.
    b.sheets.cells.values.set('2,3', 777);
    b.sheets.meta.values.set('2,11', 2);
    b.props.setProperty('JOURNAL', JSON.stringify({ requestId: 'crashed-update-1', action: 'UPDATE', serial: '1', beforeCellsRow: cellsRow, beforeMetaRow: metaRow }));

    expect(b.create('TRIGGER-RECOVERY').ok).toBe(true);
    expect(b.sheets.cells.dump()[0][2]).toBe('');
    expect(b.sheets.meta.dump()[0][10]).toBe(1);
    expect(auditActions(b)).toContain('RECOVERY_ROLLBACK_UPDATE');
  });
});

describe('delete: partial-write handling', () => {
  it('deletes nothing and fails when the audit write fails', () => {
    const b = createBackend();
    b.create('DL-1');
    b.sheets.audit.failNext('setValues', { when: isAuditWrite('DELETE') });
    const res = remove(b, '1');
    expect(res).toMatchObject({ ok: false, error: { code: 'INTERNAL', details: { recovery: 'ROLLED_BACK' } } });
    expect(b.sheets.cells.dump()).toHaveLength(1);
    expect(b.sheets.meta.dump()).toHaveLength(1);
    expect(b.props.getProperty('JOURNAL')).toBeNull();
  });

  it('rolls forward an audited delete whose removal failed, on retry with the same requestId', () => {
    const b = createBackend();
    b.create('DL-2');
    b.sheets.cells.failNext('deleteRow');
    const first = remove(b, '1', 'delete-partial-01');
    expect(first).toMatchObject({ ok: false, error: { code: 'INTERNAL', details: { recovery: 'PENDING' } } });
    expect(b.props.getProperty('JOURNAL')).not.toBeNull();

    const retry = remove(b, '1', 'delete-partial-01');
    expect(retry).toMatchObject({ ok: true, data: { deleted: true, replayed: true } });
    expect(b.sheets.cells.dump()).toHaveLength(0);
    expect(b.sheets.meta.dump()).toHaveLength(0);
    expect(b.props.getProperty('JOURNAL')).toBeNull();
    expect(auditActions(b).filter((a) => a === 'DELETE')).toHaveLength(1);
    expect(auditActions(b)).toContain('RECOVERY_ROLLFORWARD_DELETE');
  });

  it('completes a half-finished delete on the next unrelated write', () => {
    const b = createBackend();
    b.create('DL-3');
    b.sheets.meta.failNext('deleteRow'); // cells row goes, meta row stays
    expect(remove(b, '1', 'delete-partial-02').ok).toBe(false);
    expect(b.create('NEXT-1').ok).toBe(true);
    expect(b.sheets.meta.dump().map((r) => r[0])).toEqual(['2']);
    expect(b.sheets.cells.dump().map((r) => r[1])).toEqual(['NEXT-1']);
  });
});

describe('integrity repair', () => {
  it('re-creates a missing CellMeta row (and audits it) before the next write', () => {
    const b = createBackend();
    b.create('FIX-1');
    b.sheets.meta.deleteRow(2); // someone deleted the meta row by hand
    expect(b.sheets.meta.dump()).toHaveLength(0);

    expect(b.create('FIX-2').ok).toBe(true);
    const list = b.call('cells.list').data.cells;
    expect(list.map((c) => c.batteryBarcode)).toEqual(['FIX-1', 'FIX-2']);
    expect(list[0]).toMatchObject({ rawPayload: '', validationStatus: 'UNVERIFIED', version: 1 });
    expect(auditActions(b)).toContain('REPAIR_MISSING_META');
  });

  it('removes an orphan CellMeta row (cell deleted by hand) and logs it', () => {
    const b = createBackend();
    b.create('FIX-3');
    b.create('FIX-4');
    b.sheets.cells.deleteRow(2);
    expect(b.sheets.meta.dump()).toHaveLength(2);

    b.ctx.repairIntegrity();
    expect(b.sheets.meta.dump().map((r) => r[0])).toEqual(['2']);
    expect(auditActions(b)).toContain('REPAIR_ORPHAN_META');
  });

  it('reads tolerate a cell without meta (defaults) instead of failing', () => {
    const b = createBackend();
    b.create('FIX-5');
    b.sheets.meta.deleteRow(2);
    const cell = b.call('cells.get', { id: '1' }).data.cell;
    expect(cell).toMatchObject({ batteryBarcode: 'FIX-5', version: 1, rawPayload: '' });
  });
});

describe('manual edits made directly in the sheet', () => {
  it('numbers typed into measurement columns are read back as numbers, text is ignored', () => {
    const b = createBackend();
    b.create('MAN-1');
    b.sheets.cells.values.set('2,3', 3120.5); // C Cell Weight typed by an admin
    b.sheets.cells.values.set('2,4', 'not a number'); // D Cell Voltage typed wrongly
    const cell = b.call('cells.get', { id: '1' }).data.cell;
    expect(cell.cellWeightG).toBe(3120.5);
    expect(cell.cellVoltageV).toBeNull();
  });

  it('a barcode typed manually by an admin is respected by the duplicate check', () => {
    const b = createBackend();
    b.create('FIRST');
    b.sheets.cells.values.set('3,1', '2');
    b.sheets.cells.values.set('3,2', 'ADMIN-TYPED');
    expect(b.create('ADMIN-TYPED')).toMatchObject({ ok: false, error: { code: 'DUPLICATE_BARCODE', details: { existing: { id: '2' } } } });
    expect(b.create('NEW-ONE').data.cell.serialNumber).toBe(3); // serial continues after the manual row
  });
});
