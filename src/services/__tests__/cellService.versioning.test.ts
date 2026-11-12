import AsyncStorage from '@react-native-async-storage/async-storage';

type CellServiceModule = typeof import('../cellService');

function loadService(): CellServiceModule {
  let service!: CellServiceModule;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- isolateModules needs a synchronous require
    service = require('../cellService');
  });
  return service;
}

// Mock-mode parity with the backend: version numbers and stale-update conflicts.
describe('cellService versioning (mock data source)', () => {
  let svc: CellServiceModule;

  beforeEach(async () => {
    await AsyncStorage.clear();
    svc = loadService();
  });

  it('starts every record at version 1 and increments on each update', async () => {
    const before = await svc.getCell('dummy-001');
    expect(before.version).toBe(1);
    const after = await svc.updateCell('dummy-001', { cellWeightG: 1, expectedVersion: 1 });
    expect(after.version).toBe(2);
  });

  it('rejects a stale expectedVersion with CONFLICT and changes nothing', async () => {
    await svc.updateCell('dummy-001', { cellWeightG: 100, expectedVersion: 1 });
    await expect(svc.updateCell('dummy-001', { cellWeightG: 200, expectedVersion: 1 })).rejects.toMatchObject({ code: 'CONFLICT' });
    expect((await svc.getCell('dummy-001')).cellWeightG).toBe(100);
    await expect(svc.updateCell('dummy-001', { cellWeightG: 200, expectedVersion: 2 })).resolves.toMatchObject({ version: 3 });
  });

  it('a newly registered cell has version 1', async () => {
    const outcome = await svc.registerScan('VERSION-1', 'scan');
    expect(outcome.status === 'registered' && outcome.cell.version).toBe(1);
  });

  it('adds version 1 to records saved before versioning existed', async () => {
    const legacy = { id: 'legacy-1', serialNumber: 1, batteryBarcode: 'OLD-1', rawPayload: 'OLD-1', validationMode: 'development' };
    await AsyncStorage.setItem('turno.mock.cells.v1', JSON.stringify([legacy]));
    await AsyncStorage.setItem('turno.mock.serialCounter.v1', '1');
    const fresh = loadService();
    expect((await fresh.getCell('legacy-1')).version).toBe(1);
  });
});
