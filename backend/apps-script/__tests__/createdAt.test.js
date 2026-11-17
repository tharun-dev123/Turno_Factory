const { createBackend } = require('../testkit/harness');

const CREATED_AT_COL = 12; // 0-based index of column M in a BatteryCells row

function update(b, id, expectedVersion, patch) {
  return b.call('cells.update', { id, expectedVersion, patch }, { requestId: b.nextId() });
}

describe('Created At (column M)', () => {
  it('is the last column of BatteryCells', () => {
    const b = createBackend();
    expect(b.sheets.cells._get(1, 13)).toBe('Created At');
  });

  it('is stamped in Indian Standard Time (UTC+05:30) when a cell is registered', () => {
    const b = createBackend(); // the test clock starts at 2026-11-11 10:00:00 UTC
    const res = b.create('CA-1');
    expect(res.ok).toBe(true);
    expect(b.sheets.cells.dump()[0][CREATED_AT_COL]).toBe('2026-11-11 15:30:00 IST');
  });

  it('is the same instant as CellMeta.CreatedAt and the cell record (those stay in UTC for the app)', () => {
    const b = createBackend();
    const res = b.create('CA-1B');
    expect(res.data.cell.createdAt).toBe('2026-11-11T10:00:00.000Z');
    expect(b.sheets.meta.dump()[0][5]).toBe('2026-11-11T10:00:00.000Z');
    expect(b.sheets.cells.dump()[0][CREATED_AT_COL]).toBe('2026-11-11 15:30:00 IST');
  });

  it('moves to the next calendar day when IST is past midnight', () => {
    const b = createBackend();
    b.advance(10 * 3_600_000); // 20:00 UTC = 01:30 IST the next day
    b.create('CA-1C');
    expect(b.sheets.cells.dump()[0][CREATED_AT_COL]).toBe('2026-11-12 01:30:00 IST');
  });

  it('uses the time of registration, not the scan time sent by the phone', () => {
    const b = createBackend();
    b.call('cells.create', { payload: 'CA-2', source: 'scan', scannedAt: '2026-11-11T09:00:00.000Z' }, { requestId: b.nextId() });
    expect(b.sheets.cells.dump()[0][CREATED_AT_COL]).not.toBe('2026-11-11T09:00:00.000Z');
  });

  it('gives each new cell its own, later timestamp', () => {
    const b = createBackend();
    b.create('CA-3');
    b.advance(60_000);
    b.create('CA-4');
    expect(b.sheets.cells.dump().map((r) => r[CREATED_AT_COL])).toEqual(['2026-11-11 15:30:00 IST', '2026-11-11 15:31:00 IST']);
  });

  it('never changes when the cell is edited', () => {
    const b = createBackend();
    b.create('CA-5');
    const before = b.sheets.cells.dump()[0][CREATED_AT_COL];
    b.advance(3_600_000);
    expect(update(b, '1', 1, { cellWeightG: 10 }).ok).toBe(true);
    expect(update(b, '1', 2, { visualInspectionStatus: 'Good' }).ok).toBe(true);
    expect(b.sheets.cells.dump()[0][CREATED_AT_COL]).toBe(before);
  });

  it('cannot be set or changed through the API', () => {
    const b = createBackend();
    b.create('CA-6');
    const patch = update(b, '1', 1, { createdAt: '2000-01-01T00:00:00.000Z' });
    expect(patch).toMatchObject({ ok: false, error: { code: 'VALIDATION', details: { fieldErrors: { createdAt: expect.any(String) } } } });
    const create = b.call('cells.create', { payload: 'CA-7', source: 'scan', createdAt: '2000-01-01T00:00:00.000Z' }, { requestId: b.nextId() });
    expect(create).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
  });

  it('is not duplicated when a create request is retried with the same requestId', () => {
    const b = createBackend();
    const requestId = b.nextId();
    b.call('cells.create', { payload: 'CA-8', source: 'scan' }, { requestId });
    const first = b.sheets.cells.dump()[0][CREATED_AT_COL];
    b.advance(5_000);
    const retry = b.call('cells.create', { payload: 'CA-8', source: 'scan' }, { requestId });
    expect(retry.data.replayed).toBe(true);
    expect(b.sheets.cells.dump()).toHaveLength(1);
    expect(b.sheets.cells.dump()[0][CREATED_AT_COL]).toBe(first);
  });

  it('is stored as plain text so Sheets does not turn it into a date', () => {
    const b = createBackend();
    b.create('CA-9');
    expect(typeof b.sheets.cells.dump()[0][CREATED_AT_COL]).toBe('string');
    expect(b.sheets.cells.formats.get('2,13')).toBe('@');
  });
});
