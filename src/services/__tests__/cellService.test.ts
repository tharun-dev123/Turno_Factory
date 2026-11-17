import AsyncStorage from '@react-native-async-storage/async-storage';

// NOTE: services are re-loaded per test with jest.isolateModules, so error classes differ between loads;
// errors are asserted by their stable `code` instead of instanceof.

type CellServiceModule = typeof import('../cellService');

/** Load a fresh copy of the service + mock repository (fresh in-memory cache, same AsyncStorage). */
function loadService(): CellServiceModule {
  let service!: CellServiceModule;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- isolateModules needs a synchronous require
    service = require('../cellService');
  });
  return service;
}

describe('cellService (mock data source)', () => {
  let svc: CellServiceModule;

  beforeEach(async () => {
    await AsyncStorage.clear();
    svc = loadService();
  });

  describe('read / list / search / stats', () => {
    it('seeds about 20 realistic cells, newest first', async () => {
      const cells = await svc.listCells();
      expect(cells).toHaveLength(20);
      expect(cells[0].serialNumber).toBe(20);
      expect(cells[19].serialNumber).toBe(1);
    });

    it('includes complete records, records with missing measurements, and varied statuses', async () => {
      const cells = await svc.listCells();
      expect(cells.some((c) => c.cellWeightG !== null && c.dcir90Mohm !== null)).toBe(true);
      expect(cells.some((c) => c.cellWeightG === null && c.cellLocalNumber === null)).toBe(true);
      expect(new Set(cells.map((c) => c.qcStatus)).size).toBeGreaterThan(1);
      expect(new Set(cells.map((c) => c.visualInspectionStatus)).size).toBeGreaterThan(1);
    });

    it('gets a cell by id and throws NotFoundError for unknown ids', async () => {
      const cell = await svc.getCell('dummy-001');
      expect(cell.serialNumber).toBe(1);
      await expect(svc.getCell('nope')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('searches by partial barcode, case-insensitively', async () => {
      const results = await svc.searchCells('chg702022741');
      expect(results.map((c) => c.batteryBarcode)).toEqual(['02KCBE516100CHG702022741']);
    });

    it('searches by serial number in several forms', async () => {
      for (const q of ['#001', '001', '1', 'Serial #1']) {
        const results = await svc.searchCells(q);
        expect(results.some((c) => c.serialNumber === 1)).toBe(true);
      }
    });

    it('returns everything for an empty query and nothing for no match', async () => {
      expect(await svc.searchCells('   ')).toHaveLength(20);
      expect(await svc.searchCells('ZZZ-NO-MATCH')).toEqual([]);
    });

    it('reports stats', async () => {
      const stats = await svc.getStats();
      expect(stats.total).toBe(20);
      expect(stats.addedLast24h).toBeGreaterThan(0);
      expect(stats.addedToday).toBeGreaterThanOrEqual(0);
    });
  });

  describe('create / registerScan', () => {
    it('registers a new payload, preserving the raw payload and tagging development validation', async () => {
      const raw = '  NEW-CELL-001\n';
      const outcome = await svc.registerScan(raw, 'scan');
      expect(outcome.status).toBe('registered');
      if (outcome.status !== 'registered') return;
      expect(outcome.cell.batteryBarcode).toBe('NEW-CELL-001');
      expect(outcome.cell.rawPayload).toBe(raw);
      expect(outcome.cell.validationMode).toBe('development');
      expect(outcome.cell.serialNumber).toBe(21);
      expect(outcome.cell.stationId).toBe('A-12');
      expect(outcome.cell.lineId).toBe('04');
      expect(await svc.isBarcodeRegistered('NEW-CELL-001')).toBe(true);
    });

    it('stores no raw payload for manual entry', async () => {
      const outcome = await svc.registerScan('MANUAL-1', 'manual');
      expect(outcome.status === 'registered' && outcome.cell.rawPayload).toBeNull();
    });

    it('rejects an already registered barcode as a duplicate and keeps scanning possible', async () => {
      const outcome = await svc.registerScan('02KCBE516100DHG702113060', 'scan');
      expect(outcome.status).toBe('duplicate');
      if (outcome.status === 'duplicate') expect(outcome.existing?.serialNumber).toBe(1);
      expect(await svc.listCells()).toHaveLength(20);
      const next = await svc.registerScan('ANOTHER-NEW', 'scan');
      expect(next.status).toBe('registered');
    });

    it('treats two identical simultaneous scans atomically (one registers, one is duplicate)', async () => {
      const [a, b] = await Promise.all([svc.registerScan('RACE-1', 'scan'), svc.registerScan('RACE-1', 'scan')]);
      expect([a.status, b.status].sort()).toEqual(['duplicate', 'registered']);
      expect(await svc.listCells()).toHaveLength(21);
    });

    it('reports an empty payload as invalid without creating a record', async () => {
      const outcome = await svc.registerScan('   ', 'scan');
      expect(outcome.status).toBe('invalid');
      expect(await svc.listCells()).toHaveLength(20);
    });

    it('createCell throws typed errors', async () => {
      await expect(svc.createCell({ rawPayload: '', source: 'manual' })).rejects.toMatchObject({ code: 'VALIDATION' });
      await expect(svc.createCell({ rawPayload: '02KCBE516100DHG702113060', source: 'scan' })).rejects.toMatchObject({ code: 'DUPLICATE_BARCODE' });
      await expect(
        svc.createCell({ rawPayload: 'X-NEG', source: 'scan', cellWeightG: -1 }),
      ).rejects.toMatchObject({ code: 'VALIDATION' });
    });
  });

  describe('update', () => {
    it('updates editable fields and bumps updatedAt, leaving serial and barcode alone', async () => {
      const before = await svc.getCell('dummy-001');
      const after = await svc.updateCell('dummy-001', {
        cellWeightG: 3200.5,
        remarks: '  Checked by QA  ',
        cellLocalNumber: '',
      });
      expect(after.cellWeightG).toBe(3200.5);
      expect(after.remarks).toBe('Checked by QA');
      expect(after.cellLocalNumber).toBeNull();
      expect(after.serialNumber).toBe(before.serialNumber);
      expect(after.batteryBarcode).toBe(before.batteryBarcode);
      expect(after.updatedAt >= before.updatedAt).toBe(true);
    });

    it('rejects invalid field values with field errors', async () => {
      await expect(svc.updateCell('dummy-001', { cellVoltageV: -3 })).rejects.toMatchObject({
        fieldErrors: { cellVoltageV: expect.any(String) },
      });
      await expect(svc.updateCell('dummy-001', { acirMohm: Number.NaN })).rejects.toMatchObject({ code: 'VALIDATION' });
    });

    it('changes the barcode through newBarcode, preserving the raw payload', async () => {
      const updated = await svc.updateCell('dummy-001', { newBarcode: { rawPayload: 'RESCANNED-1', source: 'scan' } });
      expect(updated.batteryBarcode).toBe('RESCANNED-1');
      expect(updated.rawPayload).toBe('RESCANNED-1');
    });

    it('rejects changing the barcode to one owned by another cell', async () => {
      await expect(
        svc.updateCell('dummy-001', { newBarcode: { rawPayload: '02KCBE516100CHG702021596', source: 'manual' } }),
      ).rejects.toMatchObject({ code: 'DUPLICATE_BARCODE' });
    });

    it('allows re-saving a cell with its own barcode', async () => {
      const cell = await svc.getCell('dummy-001');
      const updated = await svc.updateCell('dummy-001', {
        newBarcode: { rawPayload: cell.batteryBarcode, source: 'scan' },
      });
      expect(updated.batteryBarcode).toBe(cell.batteryBarcode);
    });

    it('throws NotFoundError for unknown ids', async () => {
      await expect(svc.updateCell('nope', { cellWeightG: 1 })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });

  describe('delete', () => {
    it('deletes a cell and does not reuse its serial number', async () => {
      await svc.deleteCell('dummy-020');
      await expect(svc.getCell('dummy-020')).rejects.toMatchObject({ code: 'NOT_FOUND' });
      expect(await svc.listCells()).toHaveLength(19);

      const outcome = await svc.registerScan('AFTER-DELETE', 'scan');
      expect(outcome.status === 'registered' && outcome.cell.serialNumber).toBe(21);
    });

    it('throws NotFoundError when deleting an unknown cell', async () => {
      await expect(svc.deleteCell('nope')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });

  describe('persistence', () => {
    it('keeps created, edited and deleted records after an app restart', async () => {
      await svc.registerScan('PERSIST-1', 'scan');
      await svc.updateCell('dummy-002', { cellWeightG: 1234.5 });
      await svc.deleteCell('dummy-003');

      const restarted = loadService(); // fresh in-memory cache, same AsyncStorage
      const cells = await restarted.listCells();
      expect(cells).toHaveLength(20); // 20 + 1 created - 1 deleted
      expect(cells.some((c) => c.batteryBarcode === 'PERSIST-1')).toBe(true);
      expect((await restarted.getCell('dummy-002')).cellWeightG).toBe(1234.5);
      await expect(restarted.getCell('dummy-003')).rejects.toMatchObject({ code: 'NOT_FOUND' });

      const next = await restarted.registerScan('PERSIST-2', 'scan');
      expect(next.status === 'registered' && next.cell.serialNumber).toBe(22);
    });
  });
});
