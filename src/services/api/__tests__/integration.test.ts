/**
 * Client <-> backend contract test.
 *
 * The REAL app API client and repositories talk to the REAL Apps Script code (backend/apps-script/*.gs) running
 * in a Node vm against in-memory fakes of Google's services. This proves the two halves agree on the wire format,
 * error codes, idempotency and versioning. It does NOT prove behaviour on Google's infrastructure or on a phone.
 */
import { AuthError, ConflictError, DuplicateBarcodeError, ForbiddenError, NotFoundError, ValidationError } from '../../errors';
import { clearSession, readSession, writeSession } from '../../sessionStore';
import { createApiAuthBackend } from '../apiAuthBackend';
import { createApiCellRepository } from '../apiCellRepository';
import { createApiClient, type ApiClientConfig } from '../httpClient';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createBackend } = require('../../../../backend/apps-script/testkit/harness');

const config: ApiClientConfig = {
  baseUrl: 'https://script.google.com/macros/s/TEST/exec',
  readTimeoutMs: 80,
  writeTimeoutMs: 80,
  loginTimeoutMs: 80,
  maxRetries: 2,
  retryBackoffMs: [1, 1],
  readBudgetMs: 5000,
  writeBudgetMs: 5000,
};

type Backend = ReturnType<typeof createBackend>;
const reply = (text: string) => ({ text: async () => text }) as unknown as Response;

interface Harness {
  backend: Backend;
  repo: ReturnType<typeof createApiCellRepository>;
  auth: ReturnType<typeof createApiAuthBackend>;
  calls: { action: string; requestId?: string }[];
  /** Make the next N responses never arrive AFTER the server has processed the request. */
  loseResponses: (n: number, mode?: 'error' | 'hang') => void;
  /** Runs before the server processes request number `index` (0-based). */
  onCall: (fn: ((index: number) => void) | null) => void;
}

function createHarness(): Harness {
  const backend = createBackend();
  backend.clock.t = Date.now(); // the client checks session expiry against the real clock
  const calls: Harness['calls'] = [];
  let lose = 0;
  let loseMode: 'error' | 'hang' = 'error';
  let hook: ((index: number) => void) | null = null;

  const fetchImpl = async (_url: unknown, init?: RequestInit) => {
    hook?.(calls.length);
    const body = JSON.parse(init?.body as string);
    calls.push({ action: body.action, requestId: body.requestId });
    const text = backend.ctx.doPost({ postData: { contents: init?.body as string } }).getContent();
    if (lose > 0) {
      lose -= 1;
      if (loseMode === 'hang') {
        return new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))));
      }
      throw new TypeError('Network request failed'); // the server did the work, the reply was lost
    }
    return reply(text);
  };

  const client = createApiClient(() => config, { fetch: fetchImpl as unknown as typeof fetch, sleep: async () => undefined, random: () => 0.5 });
  return {
    backend,
    repo: createApiCellRepository(client),
    auth: createApiAuthBackend(client),
    calls,
    loseResponses: (n, mode = 'error') => {
      lose = n;
      loseMode = mode;
    },
    onCall: (fn) => {
      hook = fn;
    },
  };
}

async function signedIn(): Promise<Harness> {
  const h = createHarness();
  const result = await h.auth.login(h.backend.credentials.username, h.backend.credentials.password);
  await writeSession({ token: result.token, username: result.username, role: result.role === 'admin' ? 'admin' : 'viewer', expiresAt: result.expiresAt });
  return h;
}

async function signedInAdminCreate(h: Harness, barcode: string) {
  const result = await h.auth.login(h.backend.credentials.username, h.backend.credentials.password);
  await writeSession({ token: result.token, username: result.username, role: 'admin', expiresAt: result.expiresAt });
  await h.repo.create(newInput(barcode, `req-${barcode}`));
}

const newInput = (barcode: string, requestId?: string) => ({
  batteryBarcode: barcode.trim(),
  rawPayload: barcode,
  validationMode: 'development' as const,
  stationId: 'A-12',
  lineId: '04',
  requestId,
});

beforeEach(async () => {
  await clearSession();
});

describe('login', () => {
  it('signs in with the shared credentials and rejects wrong ones', async () => {
    const h = createHarness();
    const ok = await h.auth.login(h.backend.credentials.username, h.backend.credentials.password);
    expect(ok.token).toBeTruthy();
    await expect(h.auth.login(h.backend.credentials.username, 'wrong-password-123')).rejects.toBeInstanceOf(AuthError);
  });

  it('a protected call without signing in fails locally', async () => {
    const h = createHarness();
    await expect(h.repo.list()).rejects.toBeInstanceOf(AuthError);
    expect(h.calls).toHaveLength(0);
  });

  it('an expired token signs the user out', async () => {
    const h = await signedIn();
    expect(await h.repo.list()).toEqual([]);
    h.backend.advance(13 * 3600 * 1000);
    await expect(h.repo.list()).rejects.toMatchObject({ reason: 'TOKEN_EXPIRED' });
    expect(await readSession()).toBeNull();
  });
});

describe('roles', () => {
  const VIEWER = { username: 'floor.viewer', password: 'Viewer-Read-Only-77' };

  async function viewerSession(h: Harness) {
    h.backend.props.setProperty('VIEWER_USERNAME', VIEWER.username);
    h.backend.props.setProperty('VIEWER_PASSWORD', VIEWER.password);
    h.backend.ctx.setupViewerCredentials();
    const result = await h.auth.login(VIEWER.username, VIEWER.password);
    await writeSession({ token: result.token, username: result.username, role: result.role === 'admin' ? 'admin' : 'viewer', expiresAt: result.expiresAt });
    return result;
  }

  it('login returns the role: admin for the existing account, viewer for the Viewer account', async () => {
    const h = createHarness();
    expect((await h.auth.login(h.backend.credentials.username, h.backend.credentials.password)).role).toBe('admin');
    expect((await viewerSession(h)).role).toBe('viewer');
  });

  it('a Viewer can read but every write fails with ForbiddenError, is not retried, and changes nothing', async () => {
    const h = createHarness();
    await signedInAdminCreate(h, 'ROLE-E2E-1');
    const [cell] = await h.repo.list();
    await viewerSession(h);
    h.calls.length = 0;

    expect(await h.repo.list()).toHaveLength(1);
    expect((await h.repo.getById(cell.id))?.id).toBe(cell.id);

    await expect(h.repo.create(newInput('ROLE-E2E-2', 'req-viewer-create'))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(h.repo.update(cell.id, { cellWeightG: 5, expectedVersion: cell.version })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(h.repo.remove(cell.id, 'req-viewer-delete')).rejects.toBeInstanceOf(ForbiddenError);

    // One attempt per write: a FORBIDDEN answer is final and must not be retried.
    expect(h.calls.filter((c) => c.action !== 'cells.list' && c.action !== 'cells.get')).toHaveLength(3);
    expect(await h.repo.list()).toHaveLength(1);
    expect((await h.repo.getById(cell.id))?.version).toBe(cell.version);
    expect(await readSession()).not.toBeNull(); // not signed out
  });
});

describe('create / read', () => {
  it('registers a cell with only Serial Number and Battery Barcode, preserving the raw payload', async () => {
    const h = await signedIn();
    const cell = await h.repo.create(newInput('  QR-PAYLOAD-1 \n', 'req-int-create-1'));
    expect(cell).toMatchObject({
      serialNumber: 1,
      batteryBarcode: 'QR-PAYLOAD-1',
      rawPayload: '  QR-PAYLOAD-1 \n',
      validationMode: 'development', // pilot / UNVERIFIED is never presented as production
      version: 1,
      stationId: 'A-12',
      lineId: '04',
      sortingGrade: null,
      cellWeightG: null,
      cellVoltageV: null,
      acirMohm: null,
      cellLocalNumber: null,
      dischargeCapacity05CAh: null,
      dcir20Mohm: null,
      dcir50Mohm: null,
      dcir90Mohm: null,
    });
    expect(h.backend.sheets.cells.dump()[0]).toEqual(['1', 'QR-PAYLOAD-1', '', '', '', '', '', '', '', '', '', 'Under Review', '']);
    expect(await h.repo.getById('1')).toEqual(cell);
    expect(await h.repo.findByBarcode('QR-PAYLOAD-1')).toEqual(cell);
    expect(await h.repo.findByBarcode('missing')).toBeNull();
    expect(await h.repo.getById('99')).toBeNull();
    expect(await h.repo.list()).toEqual([cell]);
  });

  it('reports a duplicate barcode with the existing serial', async () => {
    const h = await signedIn();
    await h.repo.create(newInput('DUP-1', 'req-int-dup-1'));
    const error = await h.repo.create(newInput('DUP-1', 'req-int-dup-2')).catch((e) => e);
    expect(error).toBeInstanceOf(DuplicateBarcodeError);
    expect(error.existingSerialNumber).toBe(1);
  });

  it('rejects an unsafe payload', async () => {
    const h = await signedIn();
    await expect(h.repo.create(newInput('A\u0000B', 'req-int-bad-1'))).rejects.toBeInstanceOf(ValidationError);
    await expect(h.repo.create(newInput('X'.repeat(600), 'req-int-bad-2'))).rejects.toBeInstanceOf(ValidationError);
  });

  it('with strict production mode on the server (pilot off), nothing is registered', async () => {
    const h = await signedIn();
    h.backend.props.setProperty('VALIDATION_MODE', 'production');
    await expect(h.repo.create(newInput('ANY-1', 'req-int-prod-1'))).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(h.backend.sheets.cells.dump()).toHaveLength(0);
  });
});

describe('lost responses and retries (writes use the same requestId)', () => {
  it('a create whose reply was lost is retried and still produces exactly one row', async () => {
    const h = await signedIn();
    h.loseResponses(1);
    const cell = await h.repo.create(newInput('LOST-1', 'req-int-lost-1'));
    expect(cell.serialNumber).toBe(1);
    expect(h.backend.sheets.cells.dump()).toHaveLength(1);
    const creates = h.calls.filter((c) => c.action === 'cells.create');
    expect(creates).toHaveLength(2);
    expect(creates[1].requestId).toBe(creates[0].requestId);
  });

  it('a create that timed out (server did process it) is retried safely', async () => {
    const h = await signedIn();
    h.loseResponses(1, 'hang');
    const cell = await h.repo.create(newInput('TIMEOUT-1', 'req-int-timeout-1'));
    expect(cell.batteryBarcode).toBe('TIMEOUT-1');
    expect(h.backend.sheets.cells.dump()).toHaveLength(1);
  });

  it('when every reply is lost the error surfaces, and a later retry with the same requestId confirms the original write', async () => {
    const h = await signedIn();
    h.loseResponses(3); // 1 attempt + 2 retries all lose the reply
    await expect(h.repo.create(newInput('LOST-2', 'req-int-lost-2'))).rejects.toMatchObject({ code: 'NETWORK' });
    expect(h.backend.sheets.cells.dump()).toHaveLength(1); // the server did save it

    const confirmed = await h.repo.create(newInput('LOST-2', 'req-int-lost-2'));
    expect(confirmed.serialNumber).toBe(1);
    expect(h.backend.sheets.cells.dump()).toHaveLength(1);
  });

  it('retries a BUSY response with the same requestId and succeeds once the lock is free', async () => {
    const h = await signedIn();
    h.backend.lockState.held = true; // another execution holds the lock
    h.onCall((index) => {
      if (index >= 2) h.backend.lockState.held = false; // index 0 was the login, 1 the BUSY attempt: free it before the retry
    });
    const cell = await h.repo.create(newInput('BUSY-1', 'req-int-busy-1'));
    expect(cell.batteryBarcode).toBe('BUSY-1');
    const creates = h.calls.filter((c) => c.action === 'cells.create');
    expect(creates).toHaveLength(2);
    expect(creates[1].requestId).toBe(creates[0].requestId);
    expect(h.backend.sheets.cells.dump()).toHaveLength(1);
  });

  it('a delete whose reply was lost is retried and succeeds; a fresh delete of a missing cell is NOT_FOUND', async () => {
    const h = await signedIn();
    await h.repo.create(newInput('DEL-1', 'req-int-del-0'));
    h.loseResponses(1);
    await expect(h.repo.remove('1', 'req-int-del-1')).resolves.toBeUndefined();
    expect(h.backend.sheets.cells.dump()).toHaveLength(0);
    await expect(h.repo.remove('1', 'req-int-del-2')).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('update and optimistic locking', () => {
  it('maps every field to the right column and returns the new version', async () => {
    const h = await signedIn();
    const created = await h.repo.create(newInput('UPD-1', 'req-int-upd-0'));
    const updated = await h.repo.update(created.id, {
      sortingGrade: 'Grade A1',
      cellWeightG: 3120.4,
      cellVoltageV: 3.652,
      acirMohm: 0.42,
      cellLocalNumber: 'L4-CELL-088',
      dischargeCapacity05CAh: 50.2,
      dcir20Mohm: 0.68,
      dcir50Mohm: 0.65,
      dcir90Mohm: 0.63,
      expectedVersion: created.version,
      requestId: 'req-int-upd-1',
    });
    expect(updated.version).toBe(2);
    expect(h.backend.sheets.cells.dump()[0]).toEqual(['1', 'UPD-1', 'Grade A1', 3120.4, 3.652, 0.42, 'L4-CELL-088', 50.2, 0.68, 0.65, 0.63, 'Under Review', '']);
  });

  it('a new cell starts as Under Review and the reviewer can change it; Damaged needs remarks', async () => {
    const h = await signedIn();
    const created = await h.repo.create(newInput('VIS-1', 'req-int-vis-0'));
    expect(created).toMatchObject({ visualInspectionStatus: 'Under Review', remarks: null });

    await expect(
      h.repo.update(created.id, { visualInspectionStatus: 'Damaged', remarks: null, expectedVersion: created.version, requestId: 'req-int-vis-1' }),
    ).rejects.toMatchObject({ code: 'VALIDATION', fieldErrors: { remarks: expect.any(String) } });

    const updated = await h.repo.update(created.id, {
      visualInspectionStatus: 'Damaged',
      remarks: 'Dent near the terminal',
      expectedVersion: created.version,
      requestId: 'req-int-vis-2',
    });
    expect(updated).toMatchObject({ visualInspectionStatus: 'Damaged', remarks: 'Dent near the terminal', version: 2 });
    expect(h.backend.sheets.cells.dump()[0].slice(11)).toEqual(['Damaged', 'Dent near the terminal']);
  });

  it('rejects a stale update with a ConflictError instead of overwriting', async () => {
    const h = await signedIn();
    const created = await h.repo.create(newInput('CONF-1', 'req-int-conf-0'));
    await h.repo.update(created.id, { cellWeightG: 111, expectedVersion: 1, requestId: 'req-int-conf-1' });
    await expect(h.repo.update(created.id, { cellWeightG: 222, expectedVersion: 1, requestId: 'req-int-conf-2' })).rejects.toBeInstanceOf(ConflictError);
    expect((await h.repo.getById(created.id))?.cellWeightG).toBe(111);
  });

  it('an update whose reply was lost is not applied twice', async () => {
    const h = await signedIn();
    const created = await h.repo.create(newInput('UPD-LOST', 'req-int-ul-0'));
    h.loseResponses(1);
    const updated = await h.repo.update(created.id, { cellWeightG: 5, expectedVersion: 1, requestId: 'req-int-ul-1' });
    expect(updated.version).toBe(2);
    expect(h.backend.sheets.audit.dump().filter((r: string[]) => r[1] === 'UPDATE')).toHaveLength(1);
  });

  it('changes the barcode through a rescan and enforces uniqueness', async () => {
    const h = await signedIn();
    await h.repo.create(newInput('BC-1', 'req-int-bc-0'));
    await h.repo.create(newInput('BC-2', 'req-int-bc-1'));
    await expect(h.repo.update('1', { batteryBarcode: 'BC-2', rawPayload: 'BC-2', expectedVersion: 1, requestId: 'req-int-bc-2' })).rejects.toBeInstanceOf(DuplicateBarcodeError);
    const ok = await h.repo.update('1', { batteryBarcode: 'BC-NEW', rawPayload: ' BC-NEW ', expectedVersion: 1, requestId: 'req-int-bc-3' });
    expect(ok).toMatchObject({ batteryBarcode: 'BC-NEW', rawPayload: ' BC-NEW ' });
  });
});
