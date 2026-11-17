import { ValidationError, NotFoundError } from '../../errors';
import { createApiAuthBackend } from '../apiAuthBackend';
import { createApiCellRepository } from '../apiCellRepository';
import type { ApiClient } from '../httpClient';
import type { ApiCell } from '../types';

const dto = (overrides: Partial<ApiCell> = {}): ApiCell => ({
  id: '7',
  serialNumber: 7,
  batteryBarcode: 'ABC-7',
  rawPayload: ' ABC-7 ',
  validationMode: 'pilot',
  validationStatus: 'UNVERIFIED',
  cellWeightG: null,
  cellVoltageV: null,
  acirMohm: null,
  cellLocalNumber: null,
  dischargeCapacity05CAh: null,
  dcir20Mohm: null,
  dcir50Mohm: null,
  dcir90Mohm: null,
  visualInspectionStatus: 'Under Review',
  remarks: null,
  stationId: 'A-12',
  lineId: '04',
  scannedAt: '2026-11-11T10:00:00.000Z',
  createdAt: '2026-11-11T10:00:01.000Z',
  updatedAt: '2026-11-11T10:00:01.000Z',
  version: 3,
  ...overrides,
});

function fakeClient(result: unknown = {}) {
  const call = jest.fn(async (_action: string, _payload: Record<string, unknown>, _options: unknown): Promise<unknown> => result);
  return { client: { call } as unknown as ApiClient, call };
}

describe('API cell repository', () => {
  it('maps backend cells to the app model (pilot records are never "production")', async () => {
    const { client } = fakeClient({ cells: [dto(), dto({ id: '8', serialNumber: 8, rawPayload: '', cellLocalNumber: 'L4-1', cellWeightG: 3120.4 })] });
    const [first, second] = await createApiCellRepository(client).list();
    expect(first).toMatchObject({
      id: '7',
      serialNumber: 7,
      batteryBarcode: 'ABC-7',
      rawPayload: ' ABC-7 ',
      validationMode: 'development',
      syncStatus: 'synced',
      qcStatus: 'pending',
      visualInspectionStatus: 'Under Review', remarks: null,
      version: 3,
    });
    expect(second).toMatchObject({ rawPayload: null, cellLocalNumber: 'L4-1', cellWeightG: 3120.4 });
  });

  it('maps the visual inspection fields and falls back to "Under Review" for a missing or unknown status', async () => {
    const { client } = fakeClient({
      cells: [
        dto({ visualInspectionStatus: 'Damaged', remarks: 'Dent' }),
        dto({ id: '8', serialNumber: 8, visualInspectionStatus: 'whatever' }),
        { ...dto({ id: '9', serialNumber: 9 }), visualInspectionStatus: undefined, remarks: undefined } as unknown as ApiCell,
      ],
    });
    const [a, b, c] = await createApiCellRepository(client).list();
    expect(a).toMatchObject({ visualInspectionStatus: 'Damaged', remarks: 'Dent' });
    expect(b).toMatchObject({ visualInspectionStatus: 'Under Review', remarks: null });
    expect(c).toMatchObject({ visualInspectionStatus: 'Under Review', remarks: null });
  });

  it('sends the visual inspection fields in the update patch', async () => {
    const { client, call } = fakeClient({ cell: dto({ visualInspectionStatus: 'Rejected', remarks: 'Swollen' }) });
    await createApiCellRepository(client).update('7', { visualInspectionStatus: 'Rejected', remarks: 'Swollen', expectedVersion: 3, requestId: 'r-1' });
    expect(call).toHaveBeenCalledWith('cells.update', { id: '7', expectedVersion: 3, patch: { visualInspectionStatus: 'Rejected', remarks: 'Swollen' } }, expect.anything());
  });

  it('only a production-VERIFIED record is marked production', async () => {
    const { client } = fakeClient({ cell: dto({ validationMode: 'production', validationStatus: 'VERIFIED' }) });
    expect((await createApiCellRepository(client).getById('7'))?.validationMode).toBe('production');
    const { client: c2 } = fakeClient({ cell: dto({ validationMode: 'production', validationStatus: 'UNVERIFIED' }) });
    expect((await createApiCellRepository(c2).getById('7'))?.validationMode).toBe('development');
  });

  it('getById returns null for NOT_FOUND, findByBarcode returns null for no match', async () => {
    const notFound = { call: jest.fn(async () => { throw new NotFoundError(); }) } as unknown as ApiClient;
    expect(await createApiCellRepository(notFound).getById('9')).toBeNull();
    const { client } = fakeClient({ cell: null });
    expect(await createApiCellRepository(client).findByBarcode('nope')).toBeNull();
  });

  it('sends a scan as the raw payload with a requestId and no measurement fields', async () => {
    const { client, call } = fakeClient({ cell: dto() });
    await createApiCellRepository(client).create({
      batteryBarcode: 'ABC-7',
      rawPayload: ' ABC-7 ',
      validationMode: 'development', // never sent: the server decides
      stationId: 'A-12',
      lineId: '04',
      scannedAt: '2026-11-11T10:00:00.000Z',
      requestId: 'req-create-1',
    });
    expect(call).toHaveBeenCalledWith(
      'cells.create',
      { payload: ' ABC-7 ', source: 'scan', scannedAt: '2026-11-11T10:00:00.000Z', stationId: 'A-12', lineId: '04' },
      { kind: 'write', requestId: 'req-create-1' },
    );
  });

  it('sends a manual entry as source=manual', async () => {
    const { client, call } = fakeClient({ cell: dto() });
    await createApiCellRepository(client).create({ batteryBarcode: 'TYPED-1', rawPayload: null, validationMode: 'development', stationId: null, lineId: null, requestId: 'req-create-2' });
    expect(call.mock.calls[0][1]).toEqual({ payload: 'TYPED-1', source: 'manual' });
  });

  it('refuses to register with measurement fields and never calls the server', async () => {
    const { client, call } = fakeClient();
    await expect(
      createApiCellRepository(client).create({ batteryBarcode: 'X', rawPayload: 'X', validationMode: 'development', stationId: null, lineId: null, cellWeightG: 3000 }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(call).not.toHaveBeenCalled();
  });

  it('generates a requestId when none is supplied', async () => {
    const { client, call } = fakeClient({ cell: dto() });
    await createApiCellRepository(client).create({ batteryBarcode: 'X', rawPayload: 'X', validationMode: 'development', stationId: null, lineId: null });
    expect((call.mock.calls[0] as unknown[])[2]).toMatchObject({ kind: 'write', requestId: expect.stringMatching(/^[0-9a-f-]{36}$/) });
  });

  it('sends only the edited fields plus expectedVersion', async () => {
    const { client, call } = fakeClient({ cell: dto({ version: 4 }) });
    await createApiCellRepository(client).update('7', { cellWeightG: 3120.4, cellLocalNumber: null, expectedVersion: 3, requestId: 'req-upd-1' });
    expect(call).toHaveBeenCalledWith(
      'cells.update',
      { id: '7', expectedVersion: 3, patch: { cellWeightG: 3120.4, cellLocalNumber: null } },
      { kind: 'write', requestId: 'req-upd-1' },
    );
  });

  it('sends a barcode change as newBarcode (scan keeps the raw payload, manual does not)', async () => {
    const { client, call } = fakeClient({ cell: dto() });
    const repo = createApiCellRepository(client);
    await repo.update('7', { batteryBarcode: 'NEW', rawPayload: ' NEW ', expectedVersion: 1, requestId: 'req-upd-2' });
    await repo.update('7', { batteryBarcode: 'TYPED', rawPayload: null, expectedVersion: 1, requestId: 'req-upd-3' });
    expect((call.mock.calls[0][1] as { newBarcode: unknown }).newBarcode).toEqual({ payload: ' NEW ', source: 'scan' });
    expect((call.mock.calls[1][1] as { newBarcode: unknown }).newBarcode).toEqual({ payload: 'TYPED', source: 'manual' });
  });

  it('requires the loaded version and rejects NaN before contacting the server', async () => {
    const { client, call } = fakeClient();
    const repo = createApiCellRepository(client);
    await expect(repo.update('7', { cellWeightG: 1 })).rejects.toBeInstanceOf(ValidationError);
    await expect(repo.update('7', { cellWeightG: Number.NaN, expectedVersion: 1 })).rejects.toBeInstanceOf(ValidationError);
    expect(call).not.toHaveBeenCalled();
  });

  it('deletes with a requestId', async () => {
    const { client, call } = fakeClient({ deleted: true });
    await createApiCellRepository(client).remove('7', 'req-del-1');
    expect(call).toHaveBeenCalledWith('cells.delete', { id: '7' }, { kind: 'write', requestId: 'req-del-1' });
  });
});

describe('API auth backend', () => {
  it('sends credentials without a session token', async () => {
    const { client, call } = fakeClient({ token: 't', expiresAt: 'x', username: 'u' });
    const result = await createApiAuthBackend(client).login('u', 'p');
    expect(result.token).toBe('t');
    expect(call).toHaveBeenCalledWith('auth.login', { username: 'u', password: 'p' }, { kind: 'login', auth: false });
  });
});
