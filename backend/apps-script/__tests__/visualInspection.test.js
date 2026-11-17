const { createBackend } = require('../testkit/harness');

const VIEWER = { username: 'floor.viewer', password: 'Viewer-Read-Only-77' };

function update(b, id, expectedVersion, patch, extra = {}) {
  return b.call('cells.update', { id, expectedVersion, patch }, { requestId: b.nextId(), ...extra });
}

function seed(b, payload = 'VI-1') {
  const res = b.create(payload);
  expect(res.ok).toBe(true);
  return res.data.cell;
}

describe('visual inspection: defaults', () => {
  it('starts every new cell as "Under Review" with no remarks', () => {
    const b = createBackend();
    const cell = seed(b);
    expect(cell).toMatchObject({ visualInspectionStatus: 'Under Review', remarks: null });
    expect(b.sheets.cells.dump()[0].slice(10, 12)).toEqual(['Under Review', '']);
  });

  it('does not let the create call choose a status or remarks', () => {
    const b = createBackend();
    const res = b.call('cells.create', { payload: 'VI-X', source: 'scan', visualInspectionStatus: 'Good' }, { requestId: b.nextId() });
    expect(res).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
  });

  it('reads a blank or unrecognised sheet value as "Under Review"', () => {
    const b = createBackend();
    const cell = seed(b);
    b.sheets.cells.values.set('2,11', '');
    expect(b.call('cells.get', { id: cell.id }).data.cell.visualInspectionStatus).toBe('Under Review');
    b.sheets.cells.values.set('2,11', 'Maybe');
    expect(b.call('cells.get', { id: cell.id }).data.cell.visualInspectionStatus).toBe('Under Review');
  });
});

describe('visual inspection: status', () => {
  it.each(['Good', 'Under Review'])('accepts "%s" without remarks', (status) => {
    const b = createBackend();
    const cell = seed(b);
    const res = update(b, cell.id, 1, { visualInspectionStatus: status });
    expect(res.ok).toBe(true);
    expect(res.data.cell).toMatchObject({ visualInspectionStatus: status, remarks: null, version: 2 });
  });

  it.each(['Damaged', 'Rejected'])('accepts "%s" when remarks are provided in the same request', (status) => {
    const b = createBackend();
    const cell = seed(b);
    const res = update(b, cell.id, 1, { visualInspectionStatus: status, remarks: '  Dent on the side  ' });
    expect(res.ok).toBe(true);
    expect(res.data.cell).toMatchObject({ visualInspectionStatus: status, remarks: 'Dent on the side' });
    expect(b.sheets.cells.dump()[0].slice(10, 12)).toEqual([status, 'Dent on the side']);
  });

  it.each(['Damaged', 'Rejected'])('rejects "%s" without remarks and changes nothing', (status) => {
    const b = createBackend();
    const cell = seed(b);
    for (const patch of [{ visualInspectionStatus: status }, { visualInspectionStatus: status, remarks: null }, { visualInspectionStatus: status, remarks: '   ' }]) {
      const res = update(b, cell.id, 1, patch);
      expect(res).toMatchObject({ ok: false, error: { code: 'VALIDATION', details: { fieldErrors: { remarks: expect.any(String) } } } });
    }
    expect(b.sheets.cells.dump()[0].slice(10, 12)).toEqual(['Under Review', '']);
    expect(b.sheets.meta.dump()[0][10]).toBe(1);
  });

  it('rejects any value outside the four statuses, including null and wrong case', () => {
    const b = createBackend();
    const cell = seed(b);
    for (const value of [null, '', 'good', 'Pending', 'Under  Review', 5, true]) {
      const res = update(b, cell.id, 1, { visualInspectionStatus: value });
      expect(res).toMatchObject({ ok: false, error: { code: 'VALIDATION', details: { fieldErrors: { visualInspectionStatus: expect.any(String) } } } });
    }
    expect(b.sheets.cells.dump()[0][10]).toBe('Under Review');
  });
});

describe('visual inspection: remarks', () => {
  it('cannot be cleared while the cell stays Damaged', () => {
    const b = createBackend();
    const cell = seed(b);
    update(b, cell.id, 1, { visualInspectionStatus: 'Damaged', remarks: 'Cracked casing' });
    const res = update(b, cell.id, 2, { remarks: null });
    expect(res).toMatchObject({ ok: false, error: { code: 'VALIDATION', details: { fieldErrors: { remarks: expect.any(String) } } } });
    expect(b.call('cells.get', { id: cell.id }).data.cell.remarks).toBe('Cracked casing');
  });

  it('is kept when the status later moves to Good, and can then be cleared', () => {
    const b = createBackend();
    const cell = seed(b);
    update(b, cell.id, 1, { visualInspectionStatus: 'Damaged', remarks: 'Cracked casing' });
    const good = update(b, cell.id, 2, { visualInspectionStatus: 'Good' });
    expect(good.data.cell).toMatchObject({ visualInspectionStatus: 'Good', remarks: 'Cracked casing' });
    const cleared = update(b, cell.id, 3, { remarks: null });
    expect(cleared.data.cell).toMatchObject({ visualInspectionStatus: 'Good', remarks: null });
  });

  it('applies the rule to an unrelated edit of a cell that is already Damaged without remarks', () => {
    const b = createBackend();
    const cell = seed(b);
    b.sheets.cells.values.set('2,11', 'Damaged'); // set directly in the sheet, bypassing the API
    const res = update(b, cell.id, 1, { cellWeightG: 100 });
    expect(res).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
  });

  it('allows up to 500 characters, line breaks and tabs, and rejects more or other control characters', () => {
    const b = createBackend();
    const cell = seed(b);
    expect(update(b, cell.id, 1, { remarks: 'a'.repeat(500) }).ok).toBe(true);
    expect(update(b, cell.id, 2, { remarks: 'line one\nline two\tend' }).ok).toBe(true);
    for (const remarks of ['a'.repeat(501), 'bad\u0000char', 'bell\u0007', 42]) {
      expect(update(b, cell.id, 3, { remarks })).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    }
  });

  it('stores text that looks like a formula literally', () => {
    const b = createBackend();
    const cell = seed(b);
    const res = update(b, cell.id, 1, { visualInspectionStatus: 'Rejected', remarks: '=SUM(1,2) is not a reason' });
    expect(res.ok).toBe(true);
    expect(res.data.cell.remarks).toBe('=SUM(1,2) is not a reason');
    expect(b.call('cells.get', { id: cell.id }).data.cell.remarks).toBe('=SUM(1,2) is not a reason');
  });
});

describe('visual inspection: audit and permissions', () => {
  it('records the status change in the audit log (before and after)', () => {
    const b = createBackend();
    const cell = seed(b);
    update(b, cell.id, 1, { visualInspectionStatus: 'Rejected', remarks: 'Swollen' });
    const last = b.sheets.audit.dump().pop();
    expect(last[1]).toBe('UPDATE');
    expect(JSON.parse(last[4])).toMatchObject({ visualInspectionStatus: 'Under Review', remarks: null });
    expect(JSON.parse(last[5])).toMatchObject({ visualInspectionStatus: 'Rejected', remarks: 'Swollen' });
  });

  it('lets a Viewer read both fields but never change them', () => {
    const b = createBackend();
    const cell = seed(b);
    update(b, cell.id, 1, { visualInspectionStatus: 'Damaged', remarks: 'Dent' });
    b.props.setProperty('VIEWER_USERNAME', VIEWER.username);
    b.props.setProperty('VIEWER_PASSWORD', VIEWER.password);
    b.ctx.setupViewerCredentials();
    const viewer = b.send({ action: 'auth.login', payload: VIEWER }).data.token;

    const read = b.send({ action: 'cells.get', payload: { id: cell.id }, token: viewer });
    expect(read.data.cell).toMatchObject({ visualInspectionStatus: 'Damaged', remarks: 'Dent' });

    const write = b.send({
      action: 'cells.update',
      payload: { id: cell.id, expectedVersion: 2, patch: { visualInspectionStatus: 'Good' } },
      token: viewer,
      requestId: b.nextId(),
    });
    expect(write).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    expect(b.call('cells.get', { id: cell.id }).data.cell.visualInspectionStatus).toBe('Damaged');
  });
});

describe('visual inspection: sheet setup', () => {
  it('adds a dropdown that only allows the four statuses to column K', () => {
    const b = createBackend();
    const v = b.sheets.cells.validations.find((x) => x.col === 11);
    expect(v).toBeDefined();
    expect(v.rule).toMatchObject({ values: ['Good', 'Damaged', 'Under Review', 'Rejected'], dropdown: true, allowInvalid: false });
  });

  it('reports a clear schema error (instead of corrupting data) when an old sheet has not been migrated yet', () => {
    const b = createBackend();
    b.sheets.cells.values.delete('1,11');
    b.sheets.cells.values.delete('1,12');
    const res = b.call('cells.list');
    expect(res).toMatchObject({ ok: false, error: { code: 'INTERNAL', details: { sheet: 'BatteryCells', column: 11 } } });
  });
});
