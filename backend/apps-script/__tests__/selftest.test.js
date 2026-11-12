const { createBackend } = require('../testkit/harness');

// SelfTest.gs is meant to be pasted into Apps Script and run there. Here it is exercised against the local
// simulation only to prove the test script itself is correct (it does not prove Google behaviour).
describe('SelfTest.gs', () => {
  it('passes all checks on a healthy backend, then cleanup resets the system for go-live', () => {
    const b = createBackend({ extraFiles: ['SelfTest.gs'] });
    b.ctx.runSelfTest();
    const report = b.logs.join('\n');
    expect(report).toContain('RESULT: ALL CHECKS PASSED');
    expect(report).not.toMatch(/^FAIL/m);

    expect(b.props.getProperty('SERIAL_COUNTER')).toBe('10'); // 2 main test cells + 8 edge-case cells
    expect(b.sheets.audit.dump().length).toBeGreaterThan(0);

    b.ctx.cleanupAfterSelfTest();
    expect(b.props.getProperty('SERIAL_COUNTER')).toBe('0');
    expect(b.sheets.audit.dump()).toHaveLength(0);
    expect(b.create('FIRST-REAL-CELL').data.cell.serialNumber).toBe(1);
  });

  it('reports failures instead of hiding them', () => {
    const b = createBackend({ extraFiles: ['SelfTest.gs'], validationMode: null }); // strict mode rejects scans
    b.ctx.runSelfTest();
    expect(b.logs.join('\n')).toMatch(/RESULT: \d+ CHECK\(S\) FAILED/);
  });

  it('cleanup refuses to run while cells exist', () => {
    const b = createBackend({ extraFiles: ['SelfTest.gs'] });
    b.create('KEEP-ME');
    expect(() => b.ctx.cleanupAfterSelfTest()).toThrow(/Refusing to reset/);
    expect(b.sheets.cells.dump()).toHaveLength(1);
  });

  it('removes leftover TEST cells from an interrupted earlier run, but never a real cell', () => {
    const b = createBackend({ extraFiles: ['SelfTest.gs'] });
    b.create('@abc'); // known test barcode left behind earlier
    b.create('SELFTEST-leftover1');
    b.ctx.runSelfTest();
    const report = b.logs.join('\n');
    expect(report).toContain('removed leftover test cell');
    expect(report).toContain('RESULT: ALL CHECKS PASSED');
    expect(b.sheets.cells.dump()).toHaveLength(0);

    const c = createBackend({ extraFiles: ['SelfTest.gs'] });
    c.create('REAL-CELL-1'); // a real cell must never be touched
    c.ctx.runSelfTest();
    expect(c.logs.join('\n')).toMatch(/FAIL  list is empty before the test/);
    expect(c.sheets.cells.dump().map((r) => r[1])).toEqual(['REAL-CELL-1']);
  });

  it('reports an unexpected error and removes what the interrupted run created', () => {
    const b = createBackend({ extraFiles: ['SelfTest.gs'] });
    const original = b.ctx.findRowNumberBySerial;
    let armed = true;
    b.ctx.findRowNumberBySerial = (...args) => {
      if (armed) {
        armed = false;
        throw new Error('simulated Google hiccup');
      }
      return original(...args);
    };
    b.ctx.runSelfTest();
    const report = b.logs.join('\n');
    expect(report).toMatch(/FAIL  the test stopped because of an unexpected error -> Error: simulated Google hiccup/);
    expect(report).toContain('removed test cell id');
    expect(report).toMatch(/RESULT: 1 CHECK\(S\) FAILED/);
    expect(b.sheets.cells.dump()).toHaveLength(0);
    expect(b.sheets.meta.dump()).toHaveLength(0);
  });
});
