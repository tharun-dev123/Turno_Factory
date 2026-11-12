const { createBackend } = require('../testkit/harness');

const NINE_EMPTY = {
  sortingGrade: null,
  cellWeightG: null,
  cellVoltageV: null,
  acirMohm: null,
  cellLocalNumber: null,
  dischargeCapacity05CAh: null,
  dcir20Mohm: null,
  dcir50Mohm: null,
  dcir90Mohm: null,
};

function update(b, id, expectedVersion, patch = {}, extra = {}) {
  const { requestId, ...rest } = extra;
  return b.call('cells.update', { id, expectedVersion, patch, ...rest }, { requestId: requestId || b.nextId() });
}
function remove(b, id, requestId) {
  return b.call('cells.delete', { id }, { requestId: requestId || b.nextId() });
}

describe('sheet layout', () => {
  it('creates the three tabs with the exact headers, in the exact column order', () => {
    const b = createBackend();
    const header = (sheet, n) => Array.from({ length: n }, (_, i) => sheet._get(1, i + 1));
    expect(header(b.sheets.cells, 11)).toEqual([
      'Serial Number',
      'Battery Barcode',
      'Sorting',
      'Cell Weight',
      'Cell Voltage',
      'ACIR',
      'Cell Local Number',
      '0.5C DCh capacities',
      'DCIR @20%',
      'DCIR @50%',
      'DCIR @90%',
    ]);
    expect(header(b.sheets.meta, 11)).toEqual([
      'Serial Number',
      'RawPayload',
      'ValidationMode',
      'ValidationStatus',
      'ScannedAt',
      'CreatedAt',
      'UpdatedAt',
      'StationId',
      'LineId',
      'RequestId',
      'Version',
    ]);
    expect(header(b.sheets.audit, 7)).toEqual(['Timestamp', 'Action', 'SerialNumber', 'Barcode', 'BeforeJSON', 'AfterJSON', 'RequestId']);
  });

  it('formats identifier columns as text and is safe to re-run', () => {
    const b = createBackend();
    b.ctx.initializeBackend();
    b.ctx.initializeBackend();
    const cells = b.sheets.cells;
    for (const col of [1, 2, 3, 7]) expect(cells.formats.get(`5,${col}`)).toBe('@'); // A, B, C, G
    for (const col of [4, 5, 6, 8, 9, 10, 11]) expect(cells.formats.get(`5,${col}`)).toBeUndefined(); // measurements stay numeric
    expect(cells.protections).toHaveLength(1);
    expect(cells.frozenRows).toBe(1);
  });

  it('refuses to overwrite a different existing layout and flags it at runtime', () => {
    const b = createBackend();
    b.sheets.cells.values.set('1,3', 'Cell Weight'); // swapped column C and D
    b.sheets.cells.values.set('1,4', 'Sorting');
    expect(() => b.ctx.initializeBackend()).toThrow(/Sorting|Cell Weight/);
    const res = b.call('cells.list');
    expect(res).toMatchObject({ ok: false, error: { code: 'INTERNAL', details: { sheet: 'BatteryCells', column: 3, expected: 'Sorting', found: 'Cell Weight' } } });
  });

  it('reports a missing tab', () => {
    const b = createBackend();
    b.spreadsheet.sheets.delete('AuditLog');
    expect(b.call('cells.list')).toMatchObject({ ok: false, error: { code: 'INTERNAL', details: { sheet: 'AuditLog' } } });
  });
});

describe('cells.create', () => {
  it('populates only Serial Number and Battery Barcode; the other nine fields stay empty', () => {
    const b = createBackend();
    const res = b.create('  ABC-123 ');
    expect(res.ok).toBe(true);
    expect(res.data.replayed).toBe(false);
    expect(res.data.cell).toMatchObject({
      id: '1',
      serialNumber: 1,
      batteryBarcode: 'ABC-123',
      rawPayload: '  ABC-123 ', // exact raw payload preserved
      validationMode: 'pilot',
      validationStatus: 'UNVERIFIED',
      version: 1,
      ...NINE_EMPTY,
    });

    const [row] = b.sheets.cells.dump();
    expect(row).toEqual(['1', 'ABC-123', '', '', '', '', '', '', '', '', '']);
  });

  it('writes CellMeta (raw payload, mode, status, version) and an AuditLog CREATE row', () => {
    const b = createBackend();
    const requestId = 'create-req-0001';
    b.call('cells.create', { payload: 'RAW-1', source: 'scan', stationId: 'A-12', lineId: '04', scannedAt: '2026-11-11T09:59:00.000Z' }, { requestId });
    const [meta] = b.sheets.meta.dump();
    expect(meta[0]).toBe('1');
    expect(meta[1]).toBe('RAW-1');
    expect(meta[2]).toBe('pilot');
    expect(meta[3]).toBe('UNVERIFIED');
    expect(meta[4]).toBe('2026-11-11T09:59:00.000Z');
    expect(meta[7]).toBe('A-12');
    expect(meta[8]).toBe('04');
    expect(meta[9]).toBe(requestId);
    expect(meta[10]).toBe(1);

    const [audit] = b.sheets.audit.dump();
    expect(audit[1]).toBe('CREATE');
    expect(audit[2]).toBe('1');
    expect(audit[3]).toBe('RAW-1');
    expect(audit[4]).toBe('');
    expect(JSON.parse(audit[5]).batteryBarcode).toBe('RAW-1');
    expect(audit[6]).toBe(requestId);
  });

  it('stores no raw payload for a manually typed barcode', () => {
    const b = createBackend();
    b.call('cells.create', { payload: 'TYPED-1', source: 'manual' }, { requestId: b.nextId() });
    expect(b.sheets.meta.dump()[0][1]).toBe('');
  });

  it('clamps a future or invalid scan time to the server time', () => {
    const b = createBackend();
    const res = b.call('cells.create', { payload: 'T-1', scannedAt: '2099-01-01T00:00:00.000Z' }, { requestId: b.nextId() });
    expect(res.data.cell.scannedAt).toBe(new Date(b.clock.t).toISOString());
    const res2 = b.call('cells.create', { payload: 'T-2', scannedAt: 'garbage' }, { requestId: b.nextId() });
    expect(res2.data.cell.scannedAt).toBe(new Date(b.clock.t).toISOString());
  });

  it('rejects an exact or whitespace-variant duplicate with the existing serial, and writes nothing', () => {
    const b = createBackend();
    b.create('DUP-1');
    const exact = b.create('DUP-1');
    const spaced = b.create('  DUP-1\n');
    for (const res of [exact, spaced]) {
      expect(res).toMatchObject({
        ok: false,
        error: { code: 'DUPLICATE_BARCODE', details: { barcode: 'DUP-1', existing: { id: '1', serialNumber: 1 } } },
      });
    }
    expect(b.sheets.cells.dump()).toHaveLength(1);
    expect(b.sheets.meta.dump()).toHaveLength(1);
    expect(b.sheets.audit.dump()).toHaveLength(1);
  });

  it('keeps identifiers as text: leading zeros survive and formulas are never evaluated', () => {
    const b = createBackend();
    b.create('0012345');
    b.create('=HYPERLINK("http://evil.example","x")');
    b.create('+1-555');
    const rows = b.sheets.cells.dump();
    expect(rows[0][1]).toBe('0012345');
    expect(rows[1][1]).toBe('=HYPERLINK("http://evil.example","x")');
    expect(rows[2][1]).toBe('+1-555');
    expect(JSON.stringify(b.sheets.meta.dump())).not.toContain('FORMULA_EVALUATED');
    expect(JSON.stringify(b.sheets.audit.dump())).not.toContain('FORMULA_EVALUATED');
  });

  describe('payload validation (no invented barcode format)', () => {
    const bad = (payload) => {
      const b = createBackend();
      const res = b.create({ payload, source: 'scan' });
      return { res, b };
    };

    it.each([
      ['empty', '', 'EMPTY'],
      ['whitespace only', '   \n\t ', 'EMPTY'],
      ['a control character', 'AB\u0000CD', 'CONTROL_CHARACTERS'],
      ['an inner newline', 'AB\nCD', 'CONTROL_CHARACTERS'],
      ['an escape character', 'AB\u001bCD', 'CONTROL_CHARACTERS'],
      ['DEL', 'AB\u007fCD', 'CONTROL_CHARACTERS'],
      ['an oversized payload', 'X'.repeat(513), 'TOO_LONG'],
    ])('rejects %s', (_label, payload, reason) => {
      const { res, b } = bad(payload);
      expect(res).toMatchObject({ ok: false, error: { code: 'VALIDATION', details: { reason } } });
      expect(b.sheets.cells.dump()).toHaveLength(0);
      expect(b.sheets.meta.dump()).toHaveLength(0);
      expect(b.props.getProperty('SERIAL_COUNTER')).toBe('0'); // no serial burned
    });

    it('rejects non-text payloads', () => {
      for (const payload of [null, 42, { a: 1 }, ['x'], undefined]) {
        expect(bad(payload).res).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
      }
    });

    it('accepts any other non-empty payload, whatever its length or characters', () => {
      const b = createBackend();
      for (const payload of ['A', '12', 'x'.repeat(512), 'https://example.com/?a=b', '電池条码-01', 'lower and UPPER 123 !@#$%^&*()']) {
        expect(b.create(payload).ok).toBe(true);
      }
      expect(b.sheets.cells.dump()).toHaveLength(6);
    });
  });

  it('rejects measurement fields, a client serial, and a client-supplied validation mode', () => {
    const b = createBackend();
    for (const extra of [{ cellWeightG: 3000 }, { sortingGrade: 'A' }, { serialNumber: 99 }, { validationMode: 'production' }, { version: 5 }]) {
      const res = b.create({ payload: 'X-1', source: 'scan', ...extra });
      expect(res).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    }
    expect(b.sheets.cells.dump()).toHaveLength(0);
  });

  it('requires a valid requestId', () => {
    const b = createBackend();
    for (const requestId of [undefined, '', 'short', 'has spaces in it!!', 'x'.repeat(65)]) {
      expect(b.call('cells.create', { payload: 'R-1' }, { requestId })).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    }
  });
});

describe('literal text safety (Google Sheets may reinterpret text)', () => {
  it('detects a formula that Sheets evaluated and rewrites it as literal text', () => {
    const b = createBackend();
    const res = b.create('=1+1');
    expect(res.ok).toBe(true);
    expect(b.sheets.cells.dump()[0][1]).toBe('=1+1'); // not 2, not "#FORMULA_EVALUATED(...)"
    expect(b.sheets.cells.opLog).toContain('setRichTextValue'); // the verify-and-repair path ran
    expect(b.call('cells.findByBarcode', { barcode: '=1+1' }).data.cell.serialNumber).toBe(1);
    expect(b.create('=1+1').error.code).toBe('DUPLICATE_BARCODE'); // still unique-checked as literal text
  });

  it('repairs numbers, dates and +/-/@ text even if plain-text cells are not honoured', () => {
    const b = createBackend();
    for (const sheet of Object.values(b.sheets)) sheet.hostile = true;
    const payloads = ['+1-555', '-42', '@abc', '0012345', '2026-11-11', '1E5', '=SUM(1,2)'];
    payloads.forEach((p) => expect(b.create(p).ok).toBe(true));
    expect(b.sheets.cells.dump().map((r) => r[1])).toEqual(payloads);
    expect(JSON.stringify(b.sheets.meta.dump())).not.toMatch(/MANGLED|FORMULA_EVALUATED/);
    expect(JSON.stringify(b.sheets.audit.dump())).not.toMatch(/MANGLED|FORMULA_EVALUATED/);
    expect(b.sheets.meta.dump().map((r) => r[1])).toEqual(payloads); // raw payload preserved exactly too
  });

  it('refuses (and rolls back) when a value cannot be stored literally', () => {
    const b = createBackend();
    b.login();
    for (const sheet of Object.values(b.sheets)) sheet.richTextBroken = true;
    const res = b.create('=1+1');
    expect(res).toMatchObject({ ok: false, error: { code: 'INTERNAL', details: { recovery: 'ROLLED_BACK' } } });
    expect(b.sheets.cells.dump()).toHaveLength(0);
    expect(b.sheets.meta.dump()).toHaveLength(0);
    expect(b.props.getProperty('JOURNAL')).toBeNull();
    // Ordinary codes still work.
    expect(b.create('NORMAL-1').ok).toBe(true);
  });

  it('applies to edits too: a text field cannot smuggle a formula into the sheet', () => {
    const b = createBackend();
    b.create('EDIT-1');
    const res = b.call('cells.update', { id: '1', expectedVersion: 1, patch: { sortingGrade: '=HYPERLINK("x")', cellLocalNumber: '+5' } }, { requestId: b.nextId() });
    expect(res.ok).toBe(true);
    const [row] = b.sheets.cells.dump();
    expect(row[2]).toBe('=HYPERLINK("x")');
    expect(row[6]).toBe('+5');
  });
});

describe('validation mode is controlled by the server', () => {
  it('rejects every payload when pilot mode is not enabled (strict production rules are not defined yet)', () => {
    for (const mode of [null, 'production', 'Pilot', 'PILOT', 'true', '']) {
      const b = createBackend({ validationMode: mode });
      expect(b.send({ action: 'health' }).data.validationMode).toBe('production');
      expect(b.create('ANY-PAYLOAD')).toMatchObject({
        ok: false,
        error: { code: 'VALIDATION', details: { reason: 'PRODUCTION_RULES_PENDING' } },
      });
      expect(b.sheets.cells.dump()).toHaveLength(0);
    }
  });

  it('marks pilot records UNVERIFIED and lets the administrator switch modes via Script Properties', () => {
    const b = createBackend({ validationMode: null });
    expect(b.create('A-1').ok).toBe(false);
    b.props.setProperty('VALIDATION_MODE', 'pilot');
    const res = b.create('A-1');
    expect(res.data.cell).toMatchObject({ validationMode: 'pilot', validationStatus: 'UNVERIFIED' });
    b.props.setProperty('VALIDATION_MODE', 'production');
    expect(b.create('A-2').ok).toBe(false);
  });
});

describe('serial numbers', () => {
  it('are sequential, server-generated, and never reused after deletion', () => {
    const b = createBackend();
    const serials = [];
    ['S-1', 'S-2', 'S-3'].forEach((p) => serials.push(b.create(p).data.cell.serialNumber));
    expect(serials).toEqual([1, 2, 3]);

    expect(remove(b, '3').ok).toBe(true);
    expect(b.create('S-4').data.cell.serialNumber).toBe(4); // 3 is not reused
    expect(remove(b, '1').ok).toBe(true);
    expect(b.create('S-5').data.cell.serialNumber).toBe(5);
    expect(b.props.getProperty('SERIAL_COUNTER')).toBe('5');
  });

  it('are not burned by duplicates or invalid payloads, only by real creates', () => {
    const b = createBackend();
    b.create('D-1');
    b.create('D-1');
    b.create('');
    expect(b.create('D-2').data.cell.serialNumber).toBe(2);
  });

  it('cannot be changed through update', () => {
    const b = createBackend();
    b.create('U-1');
    const res = update(b, '1', 1, { serialNumber: 77 });
    expect(res).toMatchObject({ ok: false, error: { code: 'VALIDATION', details: { fieldErrors: { serialNumber: expect.any(String) } } } });
  });

  it('continue after the highest existing row if the counter property is ever lost', () => {
    const b = createBackend();
    b.create('L-1');
    b.create('L-2');
    b.props.deleteProperty('SERIAL_COUNTER');
    expect(b.create('L-3').data.cell.serialNumber).toBe(3);
  });
});

describe('concurrency (LockService)', () => {
  it('holds the lock during the whole critical section: an overlapping write gets BUSY', () => {
    const b = createBackend();
    b.login();
    let inner = null;
    b.sheets.cells.onOp = (op, range) => {
      if (op === 'setValues' && range.numCols === 11 && !inner) {
        inner = b.create('OVERLAP-2'); // arrives while the first request is mid-write
      }
    };
    const first = b.create('OVERLAP-1');
    expect(first.ok).toBe(true);
    expect(inner).toMatchObject({ ok: false, error: { code: 'BUSY', details: { retryable: true } } });

    b.sheets.cells.onOp = null;
    expect(b.create('OVERLAP-2').ok).toBe(true); // retry after the first finished
    expect(b.sheets.cells.dump().map((r) => r[1])).toEqual(['OVERLAP-1', 'OVERLAP-2']);
  });

  it('two requests for the same barcode: exactly one wins, the other is a duplicate', () => {
    const b = createBackend();
    const results = [b.create('RACE-1'), b.create('RACE-1')];
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.error.code === 'DUPLICATE_BARCODE')).toHaveLength(1);
    expect(b.sheets.cells.dump()).toHaveLength(1);
  });

  it('every write acquires and releases the lock, including failing ones', () => {
    const b = createBackend();
    b.login();
    const before = { a: b.lockState.acquisitions, r: b.lockState.releases };
    b.create('LOCK-1'); // ok
    b.create('LOCK-1'); // duplicate
    update(b, '1', 1, { cellWeightG: 1 }); // ok
    update(b, '1', 1, { cellWeightG: 2 }); // conflict
    remove(b, '1'); // ok
    remove(b, '1'); // not found
    const acquired = b.lockState.acquisitions - before.a;
    expect(acquired).toBe(6);
    expect(b.lockState.releases - before.r).toBe(acquired);
    expect(b.lockState.held).toBe(false);
  });

  it('reads do not need the lock; writes report BUSY while another execution holds it', () => {
    const b = createBackend();
    b.create('BUSY-1');
    b.lockState.held = true;
    expect(b.call('cells.list').ok).toBe(true);
    expect(b.create('BUSY-2')).toMatchObject({ ok: false, error: { code: 'BUSY' } });
    expect(update(b, '1', 1, { cellWeightG: 1 })).toMatchObject({ ok: false, error: { code: 'BUSY' } });
    expect(remove(b, '1')).toMatchObject({ ok: false, error: { code: 'BUSY' } });
    b.lockState.held = false;
    expect(b.sheets.cells.dump()).toHaveLength(1);
  });
});

describe('idempotency (requestId)', () => {
  it('returns the original result when a completed create is retried, writing nothing more', () => {
    const b = createBackend();
    const first = b.create('IDEM-1', 'idem-create-0001');
    const retry = b.create('IDEM-1', 'idem-create-0001');
    expect(retry.ok).toBe(true);
    expect(retry.data.replayed).toBe(true);
    expect(retry.data.cell.serialNumber).toBe(first.data.cell.serialNumber);
    expect(b.sheets.cells.dump()).toHaveLength(1);
    expect(b.sheets.audit.dump()).toHaveLength(1);
    expect(b.props.getProperty('SERIAL_COUNTER')).toBe('1');
  });

  it('still returns the original create after the cell was edited or deleted meanwhile', () => {
    const b = createBackend();
    b.create('IDEM-2', 'idem-create-0002');
    update(b, '1', 1, { cellWeightG: 10 });
    expect(b.create('IDEM-2', 'idem-create-0002').data.cell.serialNumber).toBe(1);
    remove(b, '1');
    const afterDelete = b.create('IDEM-2', 'idem-create-0002');
    expect(afterDelete).toMatchObject({ ok: true, data: { replayed: true, cell: { serialNumber: 1 } } });
    expect(b.sheets.cells.dump()).toHaveLength(0);
  });

  it('does not double-apply a retried update', () => {
    const b = createBackend();
    b.create('IDEM-3');
    const first = update(b, '1', 1, { cellWeightG: 100 }, { requestId: 'idem-update-0003' });
    const retry = update(b, '1', 1, { cellWeightG: 100 }, { requestId: 'idem-update-0003' });
    expect(first.data.cell.version).toBe(2);
    expect(retry).toMatchObject({ ok: true, data: { replayed: true, cell: { version: 2, cellWeightG: 100 } } });
    expect(b.sheets.audit.dump().filter((r) => r[1] === 'UPDATE')).toHaveLength(1);
  });

  it('treats a retried delete as success, while a fresh delete of a missing cell is NOT_FOUND', () => {
    const b = createBackend();
    b.create('IDEM-4');
    expect(remove(b, '1', 'idem-delete-0004').data.replayed).toBe(false);
    expect(remove(b, '1', 'idem-delete-0004')).toMatchObject({ ok: true, data: { deleted: true, replayed: true } });
    expect(remove(b, '1', 'idem-delete-other')).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
    expect(b.sheets.audit.dump().filter((r) => r[1] === 'DELETE')).toHaveLength(1);
  });

  it('rejects reuse of a requestId for a different operation', () => {
    const b = createBackend();
    b.create('IDEM-5', 'idem-shared-0005');
    expect(update(b, '1', 1, { cellWeightG: 1 }, { requestId: 'idem-shared-0005' })).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION', details: { reason: 'REQUEST_ID_REUSED' } },
    });
    expect(remove(b, '1', 'idem-shared-0005')).toMatchObject({ ok: false, error: { details: { reason: 'REQUEST_ID_REUSED' } } });
  });
});

describe('cells.update', () => {
  it('maps every editable field to the correct column (A..K) and stores numbers as numbers', () => {
    const b = createBackend();
    b.create('MAP-1');
    const res = update(b, '1', 1, {
      sortingGrade: 'Grade A1',
      cellWeightG: 3120.4,
      cellVoltageV: 3.652,
      acirMohm: 0.42,
      cellLocalNumber: '007',
      dischargeCapacity05CAh: 50.2,
      dcir20Mohm: 0.68,
      dcir50Mohm: 0.65,
      dcir90Mohm: 0.63,
    });
    expect(res.ok).toBe(true);

    const [row] = b.sheets.cells.dump();
    // A Serial, B Barcode, C Sorting, D Weight, E Voltage, F ACIR, G Local number, H 0.5C, I/J/K DCIR
    expect(row).toEqual(['1', 'MAP-1', 'Grade A1', 3120.4, 3.652, 0.42, '007', 50.2, 0.68, 0.65, 0.63]);
    expect(typeof row[3]).toBe('number');
    expect(typeof row[6]).toBe('string'); // identifier kept as text ('007', not 7)

    expect(res.data.cell).toMatchObject({
      sortingGrade: 'Grade A1',
      cellWeightG: 3120.4,
      cellVoltageV: 3.652,
      acirMohm: 0.42,
      cellLocalNumber: '007',
      dischargeCapacity05CAh: 50.2,
      dcir20Mohm: 0.68,
      dcir50Mohm: 0.65,
      dcir90Mohm: 0.63,
    });
    expect(b.call('cells.get', { id: '1' }).data.cell).toEqual(res.data.cell);
  });

  it('bumps the version and updatedAt, and audits before/after', () => {
    const b = createBackend();
    const created = b.create('UPD-1').data.cell;
    b.advance(60_000);
    const res = update(b, '1', 1, { cellWeightG: 5 });
    expect(res.data.cell.version).toBe(2);
    expect(res.data.cell.createdAt).toBe(created.createdAt);
    expect(res.data.cell.updatedAt).not.toBe(created.updatedAt);

    const audit = b.sheets.audit.dump().find((r) => r[1] === 'UPDATE');
    expect(JSON.parse(audit[4])).toMatchObject({ cellWeightG: null, version: 1 });
    expect(JSON.parse(audit[5])).toMatchObject({ cellWeightG: 5, version: 2 });
    expect(b.sheets.meta.dump()[0][10]).toBe(2);
  });

  it('clears fields with null or empty text, and trims text', () => {
    const b = createBackend();
    b.create('UPD-2');
    update(b, '1', 1, { cellWeightG: 9, sortingGrade: '  A1  ', cellLocalNumber: 'L4' });
    const res = update(b, '1', 2, { cellWeightG: null, sortingGrade: '   ', cellLocalNumber: null });
    expect(res.data.cell).toMatchObject({ cellWeightG: null, sortingGrade: null, cellLocalNumber: null });
    expect(b.sheets.cells.dump()[0]).toEqual(['1', 'UPD-2', '', '', '', '', '', '', '', '', '']);
  });

  it('rejects invalid values and unknown fields without changing anything', () => {
    const b = createBackend();
    b.create('UPD-3');
    const cases = [
      [{ cellWeightG: -1 }, 'cellWeightG'],
      [{ cellVoltageV: '3.2' }, 'cellVoltageV'],
      // NaN / Infinity cannot occur here: JSON.stringify turns them into null (the client rejects them first).
      [{ acirMohm: true }, 'acirMohm'],
      [{ dcir20Mohm: {} }, 'dcir20Mohm'],
      [{ sortingGrade: 5 }, 'sortingGrade'],
      [{ cellLocalNumber: 'x'.repeat(65) }, 'cellLocalNumber'],
      [{ cellLocalNumber: 'a\u0000b' }, 'cellLocalNumber'],
      [{ batteryBarcode: 'HACK' }, 'batteryBarcode'],
      [{ version: 99 }, 'version'],
    ];
    for (const [patch, field] of cases) {
      const res = update(b, '1', 1, patch);
      expect(res).toMatchObject({ ok: false, error: { code: 'VALIDATION', details: { fieldErrors: { [field]: expect.any(String) } } } });
    }
    expect(b.sheets.cells.dump()[0]).toEqual(['1', 'UPD-3', '', '', '', '', '', '', '', '', '']);
    expect(b.sheets.meta.dump()[0][10]).toBe(1);
  });

  it('requires expectedVersion', () => {
    const b = createBackend();
    b.create('UPD-4');
    for (const v of [undefined, null, '1', 0, 1.5, -1]) {
      expect(update(b, '1', v, { cellWeightG: 1 })).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    }
  });

  it('rejects a stale update with CONFLICT instead of overwriting another operator', () => {
    const b = createBackend();
    b.create('CONF-1');
    // Operator A and operator B both loaded version 1.
    const a = update(b, '1', 1, { cellWeightG: 111 });
    expect(a.ok).toBe(true);
    const staleB = update(b, '1', 1, { cellVoltageV: 3.3, cellWeightG: 222 });
    expect(staleB).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', details: { currentVersion: 2, current: { cellWeightG: 111, version: 2 } } },
    });
    expect(b.sheets.cells.dump()[0][3]).toBe(111); // A's change survived
    expect(b.sheets.cells.dump()[0][4]).toBe(''); // B's change was not applied
    // B reloads (version 2) and succeeds.
    expect(update(b, '1', 2, { cellVoltageV: 3.3 }).ok).toBe(true);
  });

  it('changes the barcode (rescan) with raw payload kept, and enforces uniqueness', () => {
    const b = createBackend();
    b.create('BC-1');
    b.create('BC-2');
    const dup = update(b, '1', 1, {}, { newBarcode: { payload: 'BC-2', source: 'manual' } });
    expect(dup).toMatchObject({ ok: false, error: { code: 'DUPLICATE_BARCODE', details: { existing: { id: '2' } } } });

    const ok = update(b, '1', 1, {}, { newBarcode: { payload: '  NEW-RAW \n', source: 'scan' } });
    expect(ok.data.cell).toMatchObject({ batteryBarcode: 'NEW-RAW', rawPayload: '  NEW-RAW \n', version: 2 });

    const self = update(b, '1', 2, {}, { newBarcode: { payload: 'NEW-RAW', source: 'manual' } });
    expect(self.ok).toBe(true);
    expect(self.data.cell.rawPayload).toBe('');

    expect(update(b, '1', 3, {}, { newBarcode: { payload: '', source: 'scan' } }).error.code).toBe('VALIDATION');
    expect(update(b, '1', 3, {}, { newBarcode: { payload: 'A\u0001', source: 'scan' } }).error.code).toBe('VALIDATION');
  });

  it('returns NOT_FOUND for an unknown cell', () => {
    const b = createBackend();
    expect(update(b, '42', 1, { cellWeightG: 1 })).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
    expect(update(b, 'abc', 1, { cellWeightG: 1 })).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
  });
});

describe('cells.delete', () => {
  it('audits the full record before removing it from both sheets', () => {
    const b = createBackend();
    b.create('DEL-1');
    update(b, '1', 1, { cellWeightG: 12.5 });
    const res = remove(b, '1', 'delete-req-0001');
    expect(res).toMatchObject({ ok: true, data: { deleted: true, id: '1' } });

    expect(b.sheets.cells.dump()).toHaveLength(0);
    expect(b.sheets.meta.dump()).toHaveLength(0);

    const audit = b.sheets.audit.dump().find((r) => r[1] === 'DELETE');
    expect(audit[2]).toBe('1');
    expect(audit[3]).toBe('DEL-1');
    expect(JSON.parse(audit[4])).toMatchObject({ batteryBarcode: 'DEL-1', cellWeightG: 12.5, version: 2 });
    expect(audit[5]).toBe('');
    expect(audit[6]).toBe('delete-req-0001');
    expect(b.call('cells.get', { id: '1' }).error.code).toBe('NOT_FOUND');
  });

  it('writes the audit row before the first delete operation', () => {
    const b = createBackend();
    b.create('DEL-2');
    const order = [];
    b.sheets.audit.onOp = (op, _r, values) => op === 'setValues' && values[0][1] === 'DELETE' && order.push('audit');
    b.sheets.cells.onOp = (op) => op === 'deleteRow' && order.push('delete-cells');
    b.sheets.meta.onOp = (op) => op === 'deleteRow' && order.push('delete-meta');
    remove(b, '1');
    expect(order).toEqual(['audit', 'delete-cells', 'delete-meta']);
  });

  it('only deletes the targeted cell', () => {
    const b = createBackend();
    ['K-1', 'K-2', 'K-3'].forEach((p) => b.create(p));
    remove(b, '2');
    expect(b.sheets.cells.dump().map((r) => r[1])).toEqual(['K-1', 'K-3']);
    expect(b.sheets.meta.dump().map((r) => r[0])).toEqual(['1', '3']);
  });
});

describe('reads', () => {
  it('lists, gets and finds by barcode', () => {
    const b = createBackend();
    ['R-1', 'R-2'].forEach((p) => b.create(p));
    const list = b.call('cells.list');
    expect(list.data.cells.map((c) => c.batteryBarcode)).toEqual(['R-1', 'R-2']);
    expect(b.call('cells.get', { id: 2 }).data.cell.batteryBarcode).toBe('R-2');
    expect(b.call('cells.get', { id: '9' }).error.code).toBe('NOT_FOUND');
    expect(b.call('cells.get', { id: '../1' }).error.code).toBe('VALIDATION');

    expect(b.call('cells.findByBarcode', { barcode: ' R-1 ' }).data.cell.serialNumber).toBe(1);
    expect(b.call('cells.findByBarcode', { barcode: 'nope' }).data).toEqual({ cell: null });
    expect(b.call('cells.findByBarcode', { barcode: '' }).error.code).toBe('VALIDATION');
    expect(b.call('cells.findByBarcode', {}).error.code).toBe('VALIDATION');
  });

  it('returns an empty list for an empty sheet', () => {
    const b = createBackend();
    expect(b.call('cells.list').data).toEqual({ cells: [] });
  });
});
