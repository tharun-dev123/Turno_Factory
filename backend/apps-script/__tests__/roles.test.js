const { createBackend } = require('../testkit/harness');

const VIEWER = { username: 'floor.viewer', password: 'Viewer-Read-Only-77' };

function withViewer(options) {
  const b = createBackend(options);
  b.props.setProperty('VIEWER_USERNAME', VIEWER.username);
  b.props.setProperty('VIEWER_PASSWORD', VIEWER.password);
  b.ctx.setupViewerCredentials();
  return b;
}

/** Logs in as a role and returns its token. */
function tokenFor(b, creds) {
  const res = b.send({ action: 'auth.login', payload: creds });
  expect(res.ok).toBe(true);
  return res.data;
}

/** Builds a validly signed token with arbitrary claims (as an older or buggy server could have issued). */
function signedToken(b, claims) {
  const body = b.ctx.b64urlEncode(JSON.stringify(claims));
  return `${body}.${b.ctx.hmacSha256B64Url(body, b.props.getProperty('TOKEN_SECRET'))}`;
}

function seedCell(b) {
  const created = b.create('ROLE-SEED-1');
  expect(created.ok).toBe(true);
  return created.data.cell;
}

describe('setupViewerCredentials', () => {
  it('stores only a salted hash and deletes the temporary properties', () => {
    const b = withViewer();
    expect(b.props.getProperty('VIEWER_USERNAME')).toBeNull();
    expect(b.props.getProperty('VIEWER_PASSWORD')).toBeNull();
    const record = b.props.getProperty('VIEWER_AUTH_PASSWORD_RECORD');
    expect(record).toMatch(/^v1\$\d+\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
    expect(record).not.toContain(VIEWER.password);
    expect(b.logs.join('\n')).not.toContain(VIEWER.password);
  });

  it('leaves the Admin credentials and existing Admin sessions untouched', () => {
    const b = createBackend();
    const adminToken = tokenFor(b, b.credentials).token;
    const recordBefore = b.props.getProperty('AUTH_PASSWORD_RECORD');
    const epochBefore = b.props.getProperty('TOKEN_EPOCH');
    b.props.setProperty('VIEWER_USERNAME', VIEWER.username);
    b.props.setProperty('VIEWER_PASSWORD', VIEWER.password);
    b.ctx.setupViewerCredentials();
    expect(b.props.getProperty('AUTH_PASSWORD_RECORD')).toBe(recordBefore);
    expect(b.props.getProperty('TOKEN_EPOCH')).toBe(epochBefore);
    expect(b.send({ action: 'cells.list', token: adminToken }).ok).toBe(true);
  });

  it('refuses weak input, a missing Admin account, and the Admin username', () => {
    const noAdmin = createBackend({ configure: false });
    noAdmin.props.setProperty('VIEWER_USERNAME', VIEWER.username);
    noAdmin.props.setProperty('VIEWER_PASSWORD', VIEWER.password);
    expect(() => noAdmin.ctx.setupViewerCredentials()).toThrow(/setupCredentials/);

    const b = createBackend();
    expect(() => b.ctx.setupViewerCredentials()).toThrow(/VIEWER_USERNAME/);
    b.props.setProperty('VIEWER_USERNAME', VIEWER.username);
    b.props.setProperty('VIEWER_PASSWORD', 'short');
    expect(() => b.ctx.setupViewerCredentials()).toThrow(/at least 12/);
    b.props.setProperty('VIEWER_PASSWORD', ' leading-space-pw');
    expect(() => b.ctx.setupViewerCredentials()).toThrow(/space or line break/);
    b.props.setProperty('VIEWER_USERNAME', b.credentials.username.toUpperCase());
    b.props.setProperty('VIEWER_PASSWORD', VIEWER.password);
    expect(() => b.ctx.setupViewerCredentials()).toThrow(/differ from the Admin username/);
    expect(b.props.getProperty('VIEWER_AUTH_PASSWORD_RECORD')).toBeNull();
  });

  it('setupCredentials refuses an Admin username that equals the Viewer username', () => {
    const b = withViewer();
    b.props.setProperty('ADMIN_USERNAME', VIEWER.username);
    b.props.setProperty('ADMIN_PASSWORD', 'Another-Strong-Pass-1');
    expect(() => b.ctx.setupCredentials()).toThrow(/differ from the Viewer username/);
  });
});

describe('login and token role', () => {
  it('returns role admin for the existing account and role viewer for the Viewer account', () => {
    const b = withViewer();
    const admin = tokenFor(b, b.credentials);
    const viewer = tokenFor(b, VIEWER);
    expect(admin).toMatchObject({ username: b.credentials.username, role: 'admin' });
    expect(viewer).toMatchObject({ username: VIEWER.username, role: 'viewer' });
    const claim = (token) => JSON.parse(b.ctx.b64urlDecode(token.split('.')[0])).r;
    expect(claim(admin.token)).toBe('admin');
    expect(claim(viewer.token)).toBe('viewer');
  });

  it('does not accept the Viewer password for the Admin username or the reverse', () => {
    const b = withViewer();
    const bad = [
      { username: b.credentials.username, password: VIEWER.password },
      { username: VIEWER.username, password: b.credentials.password },
    ];
    for (const payload of bad) {
      expect(b.send({ action: 'auth.login', payload })).toMatchObject({ ok: false, error: { code: 'AUTH', details: { reason: 'INVALID_CREDENTIALS' } } });
    }
  });

  it('the Viewer username is case-insensitive and tolerates pasted whitespace like Admin', () => {
    const b = withViewer();
    const res = b.send({ action: 'auth.login', payload: { username: ` ${VIEWER.username.toUpperCase()} `, password: `${VIEWER.password}\n` } });
    expect(res).toMatchObject({ ok: true, data: { role: 'viewer' } });
  });

  it('there is no Viewer login until Viewer credentials are configured', () => {
    const b = createBackend();
    expect(b.send({ action: 'auth.login', payload: VIEWER })).toMatchObject({ ok: false, error: { code: 'AUTH' } });
  });

  it('a token cannot be upgraded by editing its role claim', () => {
    const b = withViewer();
    const { token } = tokenFor(b, VIEWER);
    const [body, sig] = token.split('.');
    const claims = JSON.parse(b.ctx.b64urlDecode(body));
    const forged = `${Buffer.from(JSON.stringify({ ...claims, r: 'admin' })).toString('base64url')}.${sig}`;
    expect(b.send({ action: 'cells.create', payload: { payload: 'X-1', source: 'scan' }, token: forged, requestId: b.nextId() })).toMatchObject({
      ok: false,
      error: { code: 'AUTH' },
    });
  });
});

describe('permissions', () => {
  it('Admin keeps full access: create, read, update and delete', () => {
    const b = withViewer();
    const { token } = tokenFor(b, b.credentials);
    const call = (action, payload, extra = {}) => b.send({ action, payload, token, ...extra });
    const cell = call('cells.create', { payload: 'ADMIN-FLOW-1', source: 'scan' }, { requestId: b.nextId() }).data.cell;
    expect(call('cells.list', {}).data.cells).toHaveLength(1);
    expect(call('cells.get', { id: cell.id }).ok).toBe(true);
    expect(call('cells.findByBarcode', { barcode: cell.batteryBarcode }).ok).toBe(true);
    const updated = call('cells.update', { id: cell.id, expectedVersion: cell.version, patch: { cellWeightG: 12.5 } }, { requestId: b.nextId() });
    expect(updated.ok).toBe(true);
    expect(call('cells.delete', { id: cell.id }, { requestId: b.nextId() }).ok).toBe(true);
  });

  it('Viewer can read everything', () => {
    const b = withViewer();
    const cell = seedCell(b);
    const { token } = tokenFor(b, VIEWER);
    const call = (action, payload) => b.send({ action, payload, token });
    expect(call('cells.list', {}).data.cells).toHaveLength(1);
    expect(call('cells.get', { id: cell.id }).data.cell.id).toBe(cell.id);
    expect(call('cells.findByBarcode', { barcode: cell.batteryBarcode }).ok).toBe(true);
  });

  it('Viewer cannot create, update or delete, and the sheets stay untouched', () => {
    const b = withViewer();
    const cell = seedCell(b);
    const snapshot = JSON.stringify(Object.values(b.sheets).map((s) => s.dump()));
    const acquisitionsBefore = b.lockState.acquisitions;
    const { token } = tokenFor(b, VIEWER);
    const acquisitionsAfterLogin = b.lockState.acquisitions;
    const attempts = [
      ['cells.create', { payload: 'VIEWER-NEW-1', source: 'scan' }],
      ['cells.update', { id: cell.id, expectedVersion: cell.version, patch: { cellWeightG: 99 } }],
      ['cells.update', { id: cell.id, expectedVersion: cell.version, patch: { sortingGrade: 'A' } }],
      ['cells.delete', { id: cell.id }],
    ];
    for (const [action, payload] of attempts) {
      const res = b.send({ action, payload, token, requestId: b.nextId() });
      expect(res).toMatchObject({ ok: false, error: { code: 'FORBIDDEN', details: { reason: 'READ_ONLY' } } });
    }
    expect(JSON.stringify(Object.values(b.sheets).map((s) => s.dump()))).toBe(snapshot);
    expect(b.lockState.acquisitions).toBe(acquisitionsAfterLogin); // forbidden calls never take the write lock
    expect(acquisitionsAfterLogin).toBeGreaterThan(acquisitionsBefore);
    expect(b.props.getProperty('JOURNAL')).toBeNull();
  });

  it('the permission check runs before payload validation (no information leaks to a Viewer)', () => {
    const b = withViewer();
    const { token } = tokenFor(b, VIEWER);
    expect(b.send({ action: 'cells.create', payload: {}, token }).error.code).toBe('FORBIDDEN');
    expect(b.send({ action: 'cells.delete', token }).error.code).toBe('FORBIDDEN');
  });

  it('an unauthenticated caller still gets AUTH, not FORBIDDEN', () => {
    const b = withViewer();
    expect(b.send({ action: 'cells.delete', payload: {} }).error.code).toBe('AUTH');
  });

  it('an action registered without roles is Admin only', () => {
    const b = withViewer();
    b.ctx.ACTIONS['cells.future'] = { auth: true, handler: () => ({ done: true }) };
    expect(b.send({ action: 'cells.future', token: tokenFor(b, VIEWER).token }).error.code).toBe('FORBIDDEN');
    expect(b.send({ action: 'cells.future', token: tokenFor(b, b.credentials).token }).ok).toBe(true);
  });
});

describe('fail closed and backward compatibility', () => {
  const base = (b) => ({ u: b.credentials.username, iat: b.clock.t, exp: b.clock.t + 3600 * 1000, ep: Number(b.props.getProperty('TOKEN_EPOCH')) });

  it.each([
    ['no role claim (token issued before roles existed)', undefined],
    ['an unknown role', 'superuser'],
    ['an empty role', ''],
    ['a non-string role', 1],
    ['a differently cased role', 'Admin'],
  ])('treats a signed token with %s as a Viewer', (_label, role) => {
    const b = withViewer();
    const claims = base(b);
    if (role !== undefined) claims.r = role;
    const token = signedToken(b, claims);
    expect(b.send({ action: 'cells.list', token }).ok).toBe(true);
    expect(b.send({ action: 'cells.create', payload: { payload: 'LEGACY-1', source: 'scan' }, token, requestId: b.nextId() })).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    });
  });

  it('a token issued before roles stays valid for reading, and signing in again restores Admin', () => {
    const b = createBackend();
    const legacy = signedToken(b, base(b));
    expect(b.send({ action: 'cells.list', token: legacy }).ok).toBe(true);
    expect(b.send({ action: 'cells.delete', payload: { id: '1' }, token: legacy, requestId: b.nextId() }).error.code).toBe('FORBIDDEN');
    expect(b.create('AFTER-RELOGIN-1').ok).toBe(true); // harness logs in again and receives an Admin token
  });

  it('issueToken without an explicit admin role issues a Viewer token', () => {
    const b = createBackend();
    expect(b.ctx.issueToken('someone').role).toBe('viewer');
    expect(b.ctx.issueToken('someone', 'root').role).toBe('viewer');
    expect(b.ctx.issueToken('someone', 'admin').role).toBe('admin');
  });

  it('deploying the role-aware code does not change the token epoch', () => {
    const b = createBackend();
    expect(b.props.getProperty('TOKEN_EPOCH')).toBe('2'); // bumped once by setupCredentials, never by role code
  });
});

describe('lockout per username', () => {
  const bad = (b, username) => b.send({ action: 'auth.login', payload: { username, password: 'wrong-wrong-wrong' } });

  it('locking out the Viewer does not lock out Admin', () => {
    const b = withViewer();
    for (let i = 0; i < 4; i += 1) expect(bad(b, VIEWER.username).error.details.reason).toBe('INVALID_CREDENTIALS');
    expect(bad(b, VIEWER.username).error.details.reason).toBe('LOCKED_OUT');
    expect(b.send({ action: 'auth.login', payload: VIEWER }).error.details.reason).toBe('LOCKED_OUT');
    expect(b.send({ action: 'auth.login', payload: b.credentials })).toMatchObject({ ok: true, data: { role: 'admin' } });
  });

  it('locking out Admin does not lock out the Viewer', () => {
    const b = withViewer();
    for (let i = 0; i < 5; i += 1) bad(b, b.credentials.username);
    expect(b.send({ action: 'auth.login', payload: b.credentials }).error.details.reason).toBe('LOCKED_OUT');
    expect(b.send({ action: 'auth.login', payload: VIEWER })).toMatchObject({ ok: true, data: { role: 'viewer' } });
  });

  it('guessing unknown usernames locks only that shared bucket, never Admin or Viewer', () => {
    const b = withViewer();
    for (let i = 0; i < 5; i += 1) bad(b, `nobody${i}`);
    expect(bad(b, 'nobody-else').error.details.reason).toBe('LOCKED_OUT');
    expect(b.send({ action: 'auth.login', payload: b.credentials }).ok).toBe(true);
    expect(b.send({ action: 'auth.login', payload: VIEWER }).ok).toBe(true);
  });

  it('a successful Viewer login resets only the Viewer counter, and the lockout expires', () => {
    const b = withViewer();
    for (let i = 0; i < 4; i += 1) bad(b, VIEWER.username);
    expect(b.send({ action: 'auth.login', payload: VIEWER }).ok).toBe(true);
    for (let i = 0; i < 4; i += 1) expect(bad(b, VIEWER.username).error.details.reason).toBe('INVALID_CREDENTIALS');
    bad(b, VIEWER.username);
    b.advance(16 * 60 * 1000);
    expect(b.send({ action: 'auth.login', payload: VIEWER }).ok).toBe(true);
  });

  it('clearLoginLockout clears every bucket', () => {
    const b = withViewer();
    for (let i = 0; i < 5; i += 1) bad(b, VIEWER.username);
    b.ctx.clearLoginLockout();
    expect(b.send({ action: 'auth.login', payload: VIEWER }).ok).toBe(true);
  });
});
