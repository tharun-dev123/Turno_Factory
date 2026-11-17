import {
  AuthError,
  BusyError,
  ConflictError,
  ForbiddenError,
  DuplicateBarcodeError,
  InternalError,
  NetworkError,
  NotFoundError,
  TimeoutError,
  ValidationError,
} from '../../errors';
import { expireSession, onSessionExpired, readSession, writeSession } from '../../sessionStore';
import { createApiClient, mapApiError, type ApiClientConfig } from '../httpClient';

const config: ApiClientConfig = {
  baseUrl: 'https://script.google.com/macros/s/TEST/exec',
  readTimeoutMs: 40,
  writeTimeoutMs: 60,
  loginTimeoutMs: 40,
  maxRetries: 2,
  retryBackoffMs: [800, 2000],
  readBudgetMs: 10_000,
  writeBudgetMs: 10_000,
};

const reply = (body: unknown) => ({ text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) }) as unknown as Response;
const okReply = (data: unknown = {}) => reply({ ok: true, data });
const errReply = (code: string, message = 'msg', details: Record<string, unknown> = {}) => reply({ ok: false, error: { code, message, details } });

/** Fetch that never answers but honours the abort signal, like a real hung request. */
const hangingFetch = (_url: unknown, init?: RequestInit) =>
  new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
  });

function setup(fetchImpl: jest.Mock, overrides: Partial<ApiClientConfig> = {}) {
  const sleeps: number[] = [];
  const client = createApiClient(() => ({ ...config, ...overrides }), {
    fetch: fetchImpl as unknown as typeof fetch,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    random: () => 0.5, // jitter factor exactly 1.0
  });
  return { client, sleeps };
}

async function signIn(token = 'token-123') {
  await writeSession({ token, username: 'u', role: 'admin', expiresAt: new Date(Date.now() + 3_600_000).toISOString() });
}

beforeEach(async () => {
  await signIn();
});

describe('request format', () => {
  it('POSTs text/plain JSON with action, payload and token', async () => {
    const fetchMock = jest.fn(async () => okReply({ x: 1 }));
    const { client } = setup(fetchMock);
    const data = await client.call('cells.list', { a: 1 }, { kind: 'read' });
    expect(data).toEqual({ x: 1 });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(config.baseUrl);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Type']).toMatch(/^text\/plain/);
    expect(JSON.parse(init.body as string)).toEqual({ action: 'cells.list', payload: { a: 1 }, token: 'token-123' });
  });

  it('does not send a token for login and includes the requestId for writes', async () => {
    const fetchMock = jest.fn(async () => okReply());
    const { client } = setup(fetchMock);
    await client.call('auth.login', { username: 'a', password: 'b' }, { kind: 'login', auth: false });
    await client.call('cells.create', { payload: 'X' }, { kind: 'write', requestId: 'req-1' });
    const bodies = fetchMock.mock.calls.map((c) => JSON.parse((c as unknown as [string, RequestInit])[1].body as string));
    expect(bodies[0]).not.toHaveProperty('token');
    expect(bodies[1]).toMatchObject({ action: 'cells.create', requestId: 'req-1', token: 'token-123' });
  });

  it('fails clearly when no backend URL is configured', async () => {
    const { client } = setup(jest.fn(), { baseUrl: '' });
    await expect(client.call('cells.list', {}, { kind: 'read' })).rejects.toThrow(/not configured/);
  });
});

describe('error mapping (the JSON ok flag and code, never the HTTP status)', () => {
  it.each([
    ['DUPLICATE_BARCODE', DuplicateBarcodeError, { barcode: 'B1', existing: { id: '7', serialNumber: 7 } }],
    ['VALIDATION', ValidationError, { fieldErrors: { cellWeightG: 'Must be a number.' } }],
    ['NOT_FOUND', NotFoundError, {}],
    ['AUTH', AuthError, { reason: 'INVALID_CREDENTIALS' }],
    ['FORBIDDEN', ForbiddenError, { reason: 'READ_ONLY' }],
    ['CONFLICT', ConflictError, {}],
    ['BUSY', BusyError, {}],
    ['INTERNAL', InternalError, { recovery: 'ROLLED_BACK' }],
  ])('maps %s', (code, ErrorClass, details) => {
    const error = mapApiError({ code, message: 'm', details });
    expect(error).toBeInstanceOf(ErrorClass);
    expect(error.code).toBe(code);
  });

  it('carries details through', () => {
    const dup = mapApiError({ code: 'DUPLICATE_BARCODE', message: 'm', details: { barcode: 'B1', existing: { id: '7', serialNumber: 7 } } }) as DuplicateBarcodeError;
    expect(dup.existingSerialNumber).toBe(7);
    expect(dup.existingCellId).toBe('7');
    const val = mapApiError({ code: 'VALIDATION', message: 'm', details: { fieldErrors: { a: 'bad', b: 5 } } }) as ValidationError;
    expect(val.fieldErrors).toEqual({ a: 'bad' });
    expect((mapApiError({ code: 'INTERNAL', message: 'm', details: { recovery: 'PENDING' } }) as InternalError).recovery).toBe('PENDING');
    expect(mapApiError({ code: 'WAT', message: 'weird' }).code).toBe('UNKNOWN');
  });

  it('throws the mapped error even on HTTP-200 failures and does not retry definite answers', async () => {
    for (const [code, ErrorClass] of [
      ['DUPLICATE_BARCODE', DuplicateBarcodeError],
      ['VALIDATION', ValidationError],
      ['NOT_FOUND', NotFoundError],
      ['AUTH', AuthError],
      ['CONFLICT', ConflictError],
      ['INTERNAL', InternalError],
    ] as const) {
      const fetchMock = jest.fn(async () => errReply(code, 'nope', code === 'AUTH' ? { reason: 'INVALID_CREDENTIALS' } : {}));
      const { client, sleeps } = setup(fetchMock);
      await expect(client.call('cells.create', {}, { kind: 'write', requestId: 'req-1' })).rejects.toBeInstanceOf(ErrorClass);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(sleeps).toEqual([]);
    }
  });
});

describe('bounded retries', () => {
  it('retries a network error with backoff, then succeeds', async () => {
    const fetchMock = jest.fn().mockRejectedValueOnce(new TypeError('Network request failed')).mockResolvedValueOnce(okReply({ ok: 1 }));
    const { client, sleeps } = setup(fetchMock);
    await expect(client.call('cells.list', {}, { kind: 'read' })).resolves.toEqual({ ok: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleeps).toEqual([800]);
  });

  it('gives up after maxRetries and reports a NetworkError', async () => {
    const fetchMock = jest.fn().mockRejectedValue(new TypeError('Network request failed'));
    const { client, sleeps } = setup(fetchMock);
    await expect(client.call('cells.list', {}, { kind: 'read' })).rejects.toBeInstanceOf(NetworkError);
    expect(fetchMock).toHaveBeenCalledTimes(3); // 1 + 2 retries
    expect(sleeps).toEqual([800, 2000]);
  });

  it('retries BUSY and treats an HTML/non-JSON reply as a transient network error', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(errReply('BUSY', 'busy'))
      .mockResolvedValueOnce(reply('<html>Sign in</html>'))
      .mockResolvedValueOnce(okReply({ done: true }));
    const { client } = setup(fetchMock);
    await expect(client.call('cells.list', {}, { kind: 'read' })).resolves.toEqual({ done: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const html = jest.fn().mockResolvedValue(reply('<html>oops</html>'));
    await expect(setup(html).client.call('cells.list', {}, { kind: 'read' })).rejects.toBeInstanceOf(NetworkError);
    expect(html).toHaveBeenCalledTimes(3);
  });

  it('re-sends the SAME requestId and body on every retry of a write', async () => {
    const fetchMock = jest
      .fn()
      .mockRejectedValueOnce(new TypeError('Network request failed'))
      .mockResolvedValueOnce(errReply('BUSY'))
      .mockResolvedValueOnce(okReply({ cell: {} }));
    const { client } = setup(fetchMock);
    await client.call('cells.create', { payload: 'ABC' }, { kind: 'write', requestId: 'req-same-1' });
    const bodies = fetchMock.mock.calls.map((c) => (c as unknown as [string, RequestInit])[1].body);
    expect(bodies).toHaveLength(3);
    expect(new Set(bodies).size).toBe(1);
    expect(JSON.parse(bodies[0] as string).requestId).toBe('req-same-1');
  });

  it('never auto-retries a write that has no requestId', async () => {
    const fetchMock = jest.fn().mockRejectedValue(new TypeError('Network request failed'));
    const { client } = setup(fetchMock);
    await expect(client.call('cells.create', {}, { kind: 'write' })).rejects.toBeInstanceOf(NetworkError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('stops retrying when the time budget is spent', async () => {
    const fetchMock = jest.fn().mockRejectedValue(new TypeError('Network request failed'));
    const { client } = setup(fetchMock, { readBudgetMs: 500 });
    await expect(client.call('cells.list', {}, { kind: 'read' })).rejects.toBeInstanceOf(NetworkError);
    expect(fetchMock).toHaveBeenCalledTimes(1); // the 800 ms backoff would exceed the 500 ms budget
  });

  it('retries a login at most once', async () => {
    const fetchMock = jest.fn().mockRejectedValue(new TypeError('Network request failed'));
    const { client } = setup(fetchMock);
    await expect(client.call('auth.login', {}, { kind: 'login', auth: false })).rejects.toBeInstanceOf(NetworkError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('timeouts', () => {
  it('aborts a hung request and reports a TimeoutError (unconfirmed outcome)', async () => {
    const fetchMock = jest.fn(hangingFetch);
    const { client } = setup(fetchMock, { maxRetries: 0 });
    const started = Date.now();
    const error: unknown = await client.call('cells.list', {}, { kind: 'read' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TimeoutError);
    expect(error).toBeInstanceOf(NetworkError);
    expect((error as Error).message).toMatch(/not confirmed/i);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('retries after a timeout and succeeds when the server answers on the next attempt', async () => {
    const fetchMock = jest.fn(hangingFetch).mockImplementationOnce(hangingFetch).mockImplementationOnce(async () => okReply({ later: true }));
    const { client } = setup(fetchMock);
    await expect(client.call('cells.create', {}, { kind: 'write', requestId: 'req-timeout-1' })).resolves.toEqual({ later: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('uses the longer timeout for writes than for reads', async () => {
    const slow = (ms: number) => async () => {
      await new Promise((r) => setTimeout(r, ms));
      return okReply({ done: true });
    };
    // 50 ms reply: too slow for a 40 ms read, fine for a 60 ms write.
    await expect(setup(jest.fn(hangingFetch), { maxRetries: 0 }).client.call('cells.list', {}, { kind: 'read' })).rejects.toBeInstanceOf(TimeoutError);
    const writeFetch = jest.fn(slow(50));
    await expect(setup(writeFetch, { maxRetries: 0 }).client.call('cells.create', {}, { kind: 'write', requestId: 'r-1234567' })).resolves.toEqual({ done: true });
  });
});

describe('session handling', () => {
  it('signs out (and notifies the UI) when the backend says the token expired', async () => {
    const listener = jest.fn();
    const off = onSessionExpired(listener);
    const { client } = setup(jest.fn(async () => errReply('AUTH', 'Your session has expired.', { reason: 'TOKEN_EXPIRED' })));
    await expect(client.call('cells.list', {}, { kind: 'read' })).rejects.toBeInstanceOf(AuthError);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(await readSession()).toBeNull();
    off();
  });

  it('does not sign out on a wrong password', async () => {
    const listener = jest.fn();
    const off = onSessionExpired(listener);
    const { client } = setup(jest.fn(async () => errReply('AUTH', 'Invalid username or password.', { reason: 'INVALID_CREDENTIALS' })));
    await expect(client.call('auth.login', {}, { kind: 'login', auth: false })).rejects.toMatchObject({ reason: 'INVALID_CREDENTIALS' });
    expect(listener).not.toHaveBeenCalled();
    expect(await readSession()).not.toBeNull();
    off();
  });

  it('requires a session for protected calls and never contacts the server without one', async () => {
    const listener = jest.fn();
    const off = onSessionExpired(listener);
    await expireSession();
    listener.mockClear();

    const fetchMock = jest.fn();
    const { client } = setup(fetchMock);
    await expect(client.call('cells.list', {}, { kind: 'read' })).rejects.toBeInstanceOf(AuthError);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(listener).toHaveBeenCalledTimes(1);
    off();
  });
});
