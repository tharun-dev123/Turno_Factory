const { createBackend } = require('../testkit/harness');

const MANUFACTURER_COL = 13; // 0-based index of column N in a BatteryCells row
const VIEWER = { username: 'floor.viewer', password: 'Viewer-Read-Only-77' };

function update(b, id, expectedVersion, patch) {
  return b.call('cells.update', { id, expectedVersion, patch }, { requestId: b.nextId() });
}

describe('Manufacturer (column N)', () => {
  it('is the last column of BatteryCells and has a dropdown with exactly the two manufacturers', () => {
    const b = createBackend();
    expect(b.sheets.cells._get(1, 14)).toBe('Manufacturer');
    const v = b.sheets.cells.validations.find((x) => x.col === 14);
    expect(v).toBeDefined();
    expect(v.rule).toMatchObject({ values: ['GREAT POWER 100', 'EVE 230'], dropdown: true, allowInvalid: false });
  });

  it('is empty for a new cell', () => {
    const b = createBackend();
    const res = b.create('MF-1');
    expect(res.data.cell.manufacturer).toBeNull();
    expect(b.sheets.cells.dump()[0][MANUFACTURER_COL]).toBe('');
  });

  it.each(['GREAT POWER 100', 'EVE 230'])('accepts "%s", stores it as text and returns it', (name) => {
    const b = createBackend();
    const cell = b.create('MF-2').data.cell;
    const res = update(b, cell.id, 1, { manufacturer: name });
    expect(res.ok).toBe(true);
    expect(res.data.cell).toMatchObject({ manufacturer: name, version: 2 });
    expect(b.sheets.cells.dump()[0][MANUFACTURER_COL]).toBe(name);
    expect(b.call('cells.get', { id: cell.id }).data.cell.manufacturer).toBe(name);
  });

  it('can be cleared with null', () => {
    const b = createBackend();
    const cell = b.create('MF-3').data.cell;
    update(b, cell.id, 1, { manufacturer: 'EVE 230' });
    const res = update(b, cell.id, 2, { manufacturer: null });
    expect(res.data.cell.manufacturer).toBeNull();
    expect(b.sheets.cells.dump()[0][MANUFACTURER_COL]).toBe('');
  });

  it('rejects anything that is not exactly one of the two values, and changes nothing', () => {
    const b = createBackend();
    const cell = b.create('MF-4').data.cell;
    for (const value of ['', 'eve 230', 'EVE', 'GREAT POWER', 'Great Power 100', ' EVE 230', 'CATL 100', 230, true]) {
      const res = update(b, cell.id, 1, { manufacturer: value });
      expect(res).toMatchObject({ ok: false, error: { code: 'VALIDATION', details: { fieldErrors: { manufacturer: expect.any(String) } } } });
    }
    expect(b.sheets.cells.dump()[0][MANUFACTURER_COL]).toBe('');
    expect(b.sheets.meta.dump()[0][10]).toBe(1);
  });

  it('cannot be set while registering a cell', () => {
    const b = createBackend();
    const res = b.call('cells.create', { payload: 'MF-5', source: 'scan', manufacturer: 'EVE 230' }, { requestId: b.nextId() });
    expect(res).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
  });

  it('reads an unrecognised value typed directly in the sheet as "none"', () => {
    const b = createBackend();
    const cell = b.create('MF-6').data.cell;
    b.sheets.cells.values.set('2,14', 'Somebody Else');
    expect(b.call('cells.get', { id: cell.id }).data.cell.manufacturer).toBeNull();
  });

  it('is kept when other fields are edited, and is audited', () => {
    const b = createBackend();
    const cell = b.create('MF-7').data.cell;
    update(b, cell.id, 1, { manufacturer: 'GREAT POWER 100' });
    update(b, cell.id, 2, { cellWeightG: 3100 });
    expect(b.call('cells.get', { id: cell.id }).data.cell).toMatchObject({ manufacturer: 'GREAT POWER 100', cellWeightG: 3100 });
    const audit = b.sheets.audit.dump().filter((r) => r[1] === 'UPDATE')[0];
    expect(JSON.parse(audit[4])).toMatchObject({ manufacturer: null });
    expect(JSON.parse(audit[5])).toMatchObject({ manufacturer: 'GREAT POWER 100' });
  });

  it('lets a Viewer read it but not change it', () => {
    const b = createBackend();
    const cell = b.create('MF-8').data.cell;
    update(b, cell.id, 1, { manufacturer: 'EVE 230' });
    b.props.setProperty('VIEWER_USERNAME', VIEWER.username);
    b.props.setProperty('VIEWER_PASSWORD', VIEWER.password);
    b.ctx.setupViewerCredentials();
    const viewer = b.send({ action: 'auth.login', payload: VIEWER }).data.token;
    expect(b.send({ action: 'cells.get', payload: { id: cell.id }, token: viewer }).data.cell.manufacturer).toBe('EVE 230');
    const write = b.send({ action: 'cells.update', payload: { id: cell.id, expectedVersion: 2, patch: { manufacturer: 'GREAT POWER 100' } }, token: viewer, requestId: b.nextId() });
    expect(write).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    expect(b.call('cells.get', { id: cell.id }).data.cell.manufacturer).toBe('EVE 230');
  });
});
