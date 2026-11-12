import { cellRepository } from '../repository';
import { clearPendingRequests, createCell, deleteCell, registerScan, updateCell } from '../cellService';
import { ConflictError, DuplicateBarcodeError, InternalError, NetworkError, NotFoundError, TimeoutError } from '../errors';
import type { CellRecord } from '@/models/cell';

// Replace the data source with a controllable fake (the real selection point is services/repository.ts).
jest.mock('../repository', () => ({
  cellRepository: {
    list: jest.fn(),
    getById: jest.fn(),
    findByBarcode: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  },
  authBackend: { login: jest.fn() },
}));

const repo = cellRepository as jest.Mocked<typeof cellRepository>;

const cell = (overrides: Partial<CellRecord> = {}): CellRecord =>
  ({
    id: '1',
    serialNumber: 1,
    batteryBarcode: 'ABC',
    rawPayload: 'ABC',
    validationMode: 'development',
    version: 1,
    ...overrides,
  }) as CellRecord;

const requestIdOf = (mock: jest.Mock, call: number): string => (mock.mock.calls[call][mock.mock.calls[call].length - 1] as { requestId: string }).requestId;
const removeRequestId = (call: number): string => repo.remove.mock.calls[call][1] as string;

beforeEach(() => {
  jest.resetAllMocks();
  clearPendingRequests();
});

describe('scanning / create', () => {
  it('re-uses the same requestId when the outcome of a scan was unknown and the cell is scanned again', async () => {
    repo.create.mockRejectedValueOnce(new TimeoutError()).mockResolvedValueOnce(cell());

    await expect(registerScan('ABC', 'scan')).rejects.toBeInstanceOf(NetworkError); // unknown outcome: no success shown
    const outcome = await registerScan('ABC', 'scan'); // operator scans the same cell again
    expect(outcome.status).toBe('registered');

    const first = (repo.create.mock.calls[0][0] as { requestId: string }).requestId;
    const second = (repo.create.mock.calls[1][0] as { requestId: string }).requestId;
    expect(first).toBeTruthy();
    expect(second).toBe(first);
  });

  it('uses a fresh requestId for the next, different scan (and after a success)', async () => {
    repo.create.mockResolvedValue(cell());
    await registerScan('ABC', 'scan');
    await registerScan('ABC', 'scan');
    await registerScan('XYZ', 'scan');
    const ids = repo.create.mock.calls.map((c) => (c[0] as { requestId: string }).requestId);
    expect(new Set(ids).size).toBe(3);
  });

  it('keeps the pending id through BUSY/INTERNAL responses but not after a definite answer', async () => {
    repo.create
      .mockRejectedValueOnce(new InternalError('x', 'ROLLED_BACK'))
      .mockRejectedValueOnce(new DuplicateBarcodeError('ABC', { id: '1', serialNumber: 1 }))
      .mockResolvedValueOnce(cell());
    repo.findByBarcode.mockResolvedValue(cell());

    await expect(registerScan('ABC', 'scan')).rejects.toBeInstanceOf(InternalError);
    const duplicate = await registerScan('ABC', 'scan');
    expect(duplicate.status).toBe('duplicate');
    await registerScan('ABC', 'scan'); // a definite answer settled the request: new id

    const ids = repo.create.mock.calls.map((c) => (c[0] as { requestId: string }).requestId);
    expect(ids[1]).toBe(ids[0]);
    expect(ids[2]).not.toBe(ids[1]);
  });

  it('never reports success for a failed write', async () => {
    repo.create.mockRejectedValue(new NetworkError());
    await expect(registerScan('ABC', 'scan')).rejects.toBeInstanceOf(NetworkError);
    await expect(createCell({ rawPayload: 'ABC', source: 'scan' })).rejects.toBeInstanceOf(NetworkError);
  });

  it('does not contact the data source for empty or unsafe payloads', async () => {
    for (const payload of ['', '   ', 'AB\u0000C', 'A\nB', 'x'.repeat(513)]) {
      expect((await registerScan(payload, 'scan')).status).toBe('invalid');
    }
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('preserves the raw payload and sends no measurement values', async () => {
    repo.create.mockResolvedValue(cell());
    await registerScan('  RAW-WITH-SPACES \n', 'scan');
    const input = repo.create.mock.calls[0][0];
    expect(input.rawPayload).toBe('  RAW-WITH-SPACES \n');
    expect(input.batteryBarcode).toBe('RAW-WITH-SPACES');
    expect(input.cellWeightG).toBeUndefined();
  });
});

describe('update', () => {
  it('passes the loaded version and a requestId to the data source', async () => {
    repo.update.mockResolvedValue(cell({ version: 2 }));
    await updateCell('1', { cellWeightG: 10, expectedVersion: 1 });
    expect(repo.update).toHaveBeenCalledWith('1', expect.objectContaining({ cellWeightG: 10, expectedVersion: 1, requestId: expect.any(String) }));
  });

  it('re-uses the requestId for an identical re-submission after an unknown outcome', async () => {
    repo.update.mockRejectedValueOnce(new TimeoutError()).mockResolvedValueOnce(cell({ version: 2 }));
    await expect(updateCell('1', { cellWeightG: 10, expectedVersion: 1 })).rejects.toBeInstanceOf(NetworkError);
    await updateCell('1', { cellWeightG: 10, expectedVersion: 1 });
    expect(requestIdOf(repo.update as jest.Mock, 1)).toBe(requestIdOf(repo.update as jest.Mock, 0));
  });

  it('uses a new requestId when the edit itself changed, and surfaces a stale-version conflict', async () => {
    repo.update.mockRejectedValueOnce(new TimeoutError()).mockRejectedValueOnce(new ConflictError()).mockResolvedValueOnce(cell({ version: 3 }));
    await expect(updateCell('1', { cellWeightG: 10, expectedVersion: 1 })).rejects.toBeInstanceOf(NetworkError);
    await expect(updateCell('1', { cellWeightG: 11, expectedVersion: 1 })).rejects.toBeInstanceOf(ConflictError);
    await updateCell('1', { cellWeightG: 11, expectedVersion: 2 });
    const ids = repo.update.mock.calls.map((c) => c[1].requestId);
    expect(new Set(ids).size).toBe(3);
  });

  it('validates fields before contacting the data source', async () => {
    await expect(updateCell('1', { cellWeightG: -5, expectedVersion: 1 })).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(repo.update).not.toHaveBeenCalled();
  });
});

describe('delete', () => {
  it('sends a requestId and re-uses it when retrying after an unknown outcome', async () => {
    repo.remove.mockRejectedValueOnce(new TimeoutError()).mockResolvedValueOnce(undefined);
    await expect(deleteCell('1')).rejects.toBeInstanceOf(NetworkError);
    await deleteCell('1');
    expect(removeRequestId(1)).toBe(removeRequestId(0));
  });

  it('treats NOT_FOUND after an earlier unconfirmed attempt as success', async () => {
    repo.remove.mockRejectedValueOnce(new TimeoutError()).mockRejectedValueOnce(new NotFoundError());
    await expect(deleteCell('1')).rejects.toBeInstanceOf(NetworkError);
    await expect(deleteCell('1')).resolves.toBeUndefined();
  });

  it('still reports NOT_FOUND when there was no earlier attempt', async () => {
    repo.remove.mockRejectedValueOnce(new NotFoundError());
    await expect(deleteCell('1')).rejects.toBeInstanceOf(NotFoundError);
  });
});
