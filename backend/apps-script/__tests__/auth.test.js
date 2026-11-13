const { createBackend } = require('../testkit/harness');

const HOUR = 3600 * 1000;

describe('health', () => {
  it('answers without authentication and reports mode and schema', () => {
    const b = createBackend();
    const res = b.send({ action: 'health' });
    expect(res.ok).toBe(true);
    expect(res.data).toMatchObject({ status: 'ok', apiVersion: '1.0.0', validationMode: 'pilot', schema: 'ok' });
  });

  it('GET returns only a harmless status', () => {
    const b = createBackend();
    const out = JSON.parse(b.ctx.doGet().getContent());
    expect(out).toEqual({ ok: true, data: { status: 'ok', apiVersion: '1.0.0' } });
  });

  it('reports a schema problem instead of failing', () => {
    const b = createBackend();
    b.sheets.cells.values.set('1,2', 'Wrong header');
    expect(b.send({ action: 'health' }).data.schema).toBe('error');
  });
});

describe('request envelope', () => {
  it('rejects bad JSON, non-objects, unknown actions and oversized bodies', () => {
    const b = createBackend();
    expect(b.send('not json')).toMatchObject({ ok: false, error: { code: 'VALIDATION', details: { reason: 'BAD_JSON' } } });
    expect(b.send('[1,2]')).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    expect(b.send({ action: 'cells.nuke' })).toMatchObject({ ok: false, error: { details: { reason: 'UNKNOWN_ACTION' } } });
    expect(b.send({ action: 'constructor' })).toMatchObject({ ok: false, error: { details: { reason: 'UNKNOWN_ACTION' } } });
    expect(b.send(JSON.stringify({ action: 'health', pad: 'x'.repeat(30000) }))).toMatchObject({ ok: false });
    expect(b.send('')).toMatchObject({ ok: false });
  });

  it('never leaks internal error text', () => {
    const b = createBackend();
    b.props.deleteProperty('SPREADSHEET_ID');
    b.login();
    const res = b.call('cells.list');
    expect(res.ok).toBe(false);
    expect(res.error.code).toBe('INTERNAL');
    expect(JSON.stringify(res)).not.toMatch(/stack|at Object|TypeError/);
  });
});

describe('auth.login', () => {
  it('returns a token that expires in 12 hours', () => {
    const b = createBackend();
    const res = b.login();
    expect(res.ok).toBe(true);
    expect(res.data.username).toBe(b.credentials.username);
    expect(res.data.token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(new Date(res.data.expiresAt).getTime()).toBe(b.clock.t + 12 * HOUR);
  });

  it('rejects a wrong password or username with the same generic error', () => {
    const b = createBackend();
    const wrongPassword = b.send({ action: 'auth.login', payload: { username: b.credentials.username, password: 'nope-nope-nope' } });
    const wrongUser = b.send({ action: 'auth.login', payload: { username: 'someone', password: b.credentials.password } });
    for (const res of [wrongPassword, wrongUser]) {
      expect(res).toMatchObject({ ok: false, error: { code: 'AUTH', message: 'Invalid username or password.', details: { reason: 'INVALID_CREDENTIALS' } } });
    }
  });

  it('requires both fields', () => {
    const b = createBackend();
    expect(b.send({ action: 'auth.login', payload: {} })).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    expect(b.send({ action: 'auth.login', payload: { username: 1, password: 2 } })).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
  });

  it('locks out after repeated failures, even for the right password, then recovers', () => {
    const b = createBackend();
    const bad = () => b.send({ action: 'auth.login', payload: { username: b.credentials.username, password: 'wrong-wrong-wrong' } });
    for (let i = 0; i < 4; i += 1) expect(bad().error.details.reason).toBe('INVALID_CREDENTIALS');
    const fifth = bad();
    expect(fifth.error.details.reason).toBe('LOCKED_OUT');
    expect(fifth.error.details.retryAfterSeconds).toBeGreaterThan(0);

    const locked = b.login();
    expect(locked).toMatchObject({ ok: false, error: { code: 'AUTH', details: { reason: 'LOCKED_OUT' } } });

    b.advance(16 * 60 * 1000);
    expect(b.login().ok).toBe(true);
  });

  it('a successful login resets the failure counter', () => {
    const b = createBackend();
    const bad = () => b.send({ action: 'auth.login', payload: { username: b.credentials.username, password: 'wrong-wrong-wrong' } });
    for (let i = 0; i < 4; i += 1) bad();
    expect(b.login().ok).toBe(true);
    for (let i = 0; i < 4; i += 1) expect(bad().error.details.reason).toBe('INVALID_CREDENTIALS');
  });

  it('is BUSY (not a crash) when the lock cannot be obtained', () => {
    const b = createBackend();
    b.lockState.held = true;
    expect(b.login()).toMatchObject({ ok: false, error: { code: 'BUSY' } });
  });
});

describe('token protection', () => {
  it('rejects every protected action without a valid token', () => {
    const b = createBackend();
    const actions = ['cells.list', 'cells.get', 'cells.findByBarcode', 'cells.create', 'cells.update', 'cells.delete'];
    for (const action of actions) {
      expect(b.send({ action, payload: {} })).toMatchObject({ ok: false, error: { code: 'AUTH', details: { reason: 'TOKEN_INVALID' } } });
      expect(b.send({ action, payload: {}, token: 'abc.def' })).toMatchObject({ ok: false, error: { code: 'AUTH' } });
    }
  });

  it('rejects a tampered token', () => {
    const b = createBackend();
    const { token } = b.login().data;
    const [body, sig] = token.split('.');
    const forgedBody = Buffer.from(JSON.stringify({ u: 'x', iat: 0, exp: 9e15, ep: 1 })).toString('base64url');
    expect(b.send({ action: 'cells.list', token: `${forgedBody}.${sig}` }).error.code).toBe('AUTH');
    expect(b.send({ action: 'cells.list', token: `${body}.${sig.slice(0, -2)}xx` }).error.code).toBe('AUTH');
    expect(b.send({ action: 'cells.list', token }).ok).toBe(true);
  });

  it('rejects an expired token with TOKEN_EXPIRED', () => {
    const b = createBackend();
    b.login();
    b.advance(12 * HOUR + 1000);
    expect(b.call('cells.list')).toMatchObject({ ok: false, error: { code: 'AUTH', details: { reason: 'TOKEN_EXPIRED' } } });
  });

  it('signOutEveryone and rotateTokenSecret invalidate existing tokens', () => {
    const b = createBackend();
    b.login();
    expect(b.call('cells.list').ok).toBe(true);
    b.ctx.signOutEveryone();
    expect(b.call('cells.list').error.code).toBe('AUTH');

    b.login();
    expect(b.call('cells.list').ok).toBe(true);
    b.ctx.rotateTokenSecret();
    expect(b.call('cells.list').error.code).toBe('AUTH');
  });
});

describe('credential storage', () => {
  it('stores only a salted hash and deletes the temporary properties', () => {
    const b = createBackend();
    expect(b.props.getProperty('ADMIN_PASSWORD')).toBeNull();
    expect(b.props.getProperty('ADMIN_USERNAME')).toBeNull();
    const record = b.props.getProperty('AUTH_PASSWORD_RECORD');
    expect(record).toMatch(/^v1\$\d+\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
    expect(record).not.toContain(b.credentials.password);
  });

  it('refuses weak or missing credentials', () => {
    const b = createBackend({ configure: false });
    b.props.setProperty('SPREADSHEET_ID', 'test-spreadsheet-id');
    expect(() => b.ctx.setupCredentials()).toThrow(/ADMIN_USERNAME/);
    b.props.setProperty('ADMIN_USERNAME', 'factory');
    b.props.setProperty('ADMIN_PASSWORD', 'short');
    expect(() => b.ctx.setupCredentials()).toThrow(/at least 12/);
    b.props.setProperty('ADMIN_PASSWORD', 'factory');
    expect(() => b.ctx.setupCredentials()).toThrow();
  });

  it('is an INTERNAL error (not a login) when credentials were never configured', () => {
    const b = createBackend({ configure: false });
    expect(b.login()).toMatchObject({ ok: false, error: { code: 'INTERNAL' } });
  });

  it('never writes passwords or tokens to any sheet', () => {
    const b = createBackend();
    const { token } = b.login().data;
    b.create('SECRET-CHECK-1');
    const everything = JSON.stringify(Object.values(b.sheets).map((s) => s.dump()));
    expect(everything).not.toContain(token);
    expect(everything).not.toContain(b.credentials.password);
    expect(everything).not.toContain(b.props.getProperty('TOKEN_SECRET'));
    expect(everything).not.toContain(b.props.getProperty('AUTH_PASSWORD_RECORD'));
  });
});

describe('credential robustness', () => {
  function configured(username, password) {
    const b = createBackend({ configure: false });
    b.props.setProperty('ADMIN_USERNAME', username);
    b.props.setProperty('ADMIN_PASSWORD', password);
    b.ctx.initializeBackend();
    return b;
  }

  it('the username is not case-sensitive', () => {
    const b = configured('Admin', 'TurnoDemo2026Scan');
    b.ctx.setupCredentials();
    for (const username of ['Admin', 'admin', 'ADMIN', '  admin ']) {
      expect(b.send({ action: 'auth.login', payload: { username, password: 'TurnoDemo2026Scan' } }).ok).toBe(true);
    }
    expect(b.send({ action: 'auth.login', payload: { username: 'admin2', password: 'TurnoDemo2026Scan' } }).ok).toBe(false);
  });

  it('the password stays case-sensitive', () => {
    const b = configured('Admin', 'TurnoDemo2026Scan');
    b.ctx.setupCredentials();
    expect(b.send({ action: 'auth.login', payload: { username: 'Admin', password: 'turnodemo2026scan' } }).ok).toBe(false);
  });

  it.each([
    ['a trailing space', 'TurnoDemo2026Scan '],
    ['a leading space', ' TurnoDemo2026Scan'],
    ['a trailing line break', 'TurnoDemo2026Scan\n'],
    ['an inner line break', 'TurnoDemo\n2026Scan'],
  ])('refuses a password with %s instead of storing it invisibly', (_label, password) => {
    const b = configured('Admin', password);
    expect(() => b.ctx.setupCredentials()).toThrow(/space or line break|control character/);
    expect(b.props.getProperty('AUTH_PASSWORD_RECORD')).toBeNull();
    expect(b.props.getProperty('ADMIN_PASSWORD')).not.toBeNull(); // left in place so it can be corrected
  });

  it('logs the username and password length (never the password) after setup', () => {
    const b = configured('Admin', 'TurnoDemo2026Scan');
    b.ctx.setupCredentials();
    const log = b.logs.join('\n');
    expect(log).toContain('Username: "Admin"');
    expect(log).toContain('Password length: 17 characters');
    expect(log).not.toContain('TurnoDemo2026Scan');
  });

  it('checkCredentials reports matches without logging in, counting a failure, or revealing the password', () => {
    const b = configured('Admin', 'TurnoDemo2026Scan');
    b.ctx.setupCredentials();
    const run = (user, password) => {
      b.logs.length = 0;
      b.props.setProperty('CHECK_USERNAME', user);
      b.props.setProperty('CHECK_PASSWORD', password);
      b.ctx.checkCredentials();
      expect(b.props.getProperty('CHECK_USERNAME')).toBeNull();
      expect(b.props.getProperty('CHECK_PASSWORD')).toBeNull();
      expect(b.logs.join('\n')).not.toContain(password);
      return JSON.parse(b.logs[b.logs.length - 1]);
    };
    expect(run('admin', 'TurnoDemo2026Scan')).toMatchObject({ usernameMatches: true, usernameMatchesExactCase: false, passwordMatches: true });
    expect(run('Admin', 'TurnoDemo2026Scan ')).toMatchObject({ passwordMatches: false, checkedPasswordHasEdgeWhitespace: true });
    expect(run('Admin', 'wrong-password-1')).toMatchObject({ passwordMatches: false, failedAttemptsInWindow: 0, lockedOut: false });
    expect(() => b.ctx.checkCredentials()).toThrow(/CHECK_USERNAME/);
  });
});

describe('login diagnostics', () => {
  function setup() {
    const b = createBackend({ configure: false });
    b.props.setProperty('ADMIN_USERNAME', 'Admin');
    b.props.setProperty('ADMIN_PASSWORD', 'TurnoScan-2026ab');
    b.ctx.initializeBackend();
    b.ctx.setupCredentials();
    b.logs.length = 0;
    return b;
  }

  it('logs and stores nothing about rejected logins unless LOGIN_DIAGNOSTICS is on', () => {
    const b = setup();
    b.send({ action: 'auth.login', payload: { username: 'Admin', password: 'TurnoScan–2026ab' } });
    expect(b.logs.join('\n')).not.toContain('LOGIN REJECTED');
    expect(b.props.getProperty('LAST_LOGIN_REJECTION')).toBeNull();
  });

  it('flags invisible characters (e.g. a zero-width space) by code', () => {
    const b = setup();
    b.props.setProperty('LOGIN_DIAGNOSTICS', 'on');
    b.send({ action: 'auth.login', payload: { username: 'Admin\u200B', password: 'TurnoScan-2026ab' } });
    const info = JSON.parse(b.props.getProperty('LAST_LOGIN_REJECTION'));
    expect(info.usernameMatches).toBe(false);
    expect(info.receivedUsername.unusualCharacters).toEqual(['U+200B']);
  });

  it('describes a rejected password by length and character classes, never its value', () => {
    const b = setup();
    b.props.setProperty('LOGIN_DIAGNOSTICS', 'on');
    // an en-dash instead of a hyphen, as some phone keyboards produce
    const sent = 'TurnoScan–2026ab';
    b.send({ action: 'auth.login', payload: { username: ' admin ', password: sent } });
    const line = b.logs.find((l) => l.startsWith('LOGIN REJECTED'));
    expect(line).toBeTruthy();
    expect(line).not.toContain(sent);
    expect(line).not.toContain('TurnoScan');
    expect(line).not.toContain('admin');
    const info = JSON.parse(line.replace('LOGIN REJECTED ', ''));
    expect(info).toMatchObject({
      storedUsername: 'Admin',
      usernameMatches: true,
      passwordMatches: false,
      receivedUsername: { length: 7, hasEdgeWhitespace: true, characterClasses: { lowercase: 5, spaces: 2 } },
      receivedPassword: {
        length: 16,
        hasEdgeWhitespace: false,
        characterClasses: { nonAscii: 1, otherAscii: 0, digits: 4 },
        unusualCharacters: ['U+2013'],
      },
    });
    // The same description is kept in a Script Property (phone runs have no visible logs).
    expect(JSON.parse(b.props.getProperty('LAST_LOGIN_REJECTION'))).toEqual(info);
  });

  it('checkCredentials reports the same character-class description for comparison', () => {
    const b = setup();
    b.props.setProperty('CHECK_USERNAME', 'Admin');
    b.props.setProperty('CHECK_PASSWORD', 'TurnoScan-2026ab');
    b.ctx.checkCredentials();
    const info = JSON.parse(b.logs[b.logs.length - 1]);
    expect(info.checkedPassword).toEqual({
      length: 16,
      hasEdgeWhitespace: false,
      characterClasses: { lowercase: 9, uppercase: 2, digits: 4, spaces: 0, otherAscii: 1, nonAscii: 0 },
      unusualCharacters: [],
    });
    expect(b.logs.join('\n')).not.toContain('TurnoScan');
  });
});

describe('pasted passwords', () => {
  function setup() {
    const b = createBackend({ configure: false });
    b.props.setProperty('ADMIN_USERNAME', 'Admin');
    b.props.setProperty('ADMIN_PASSWORD', 'abcd1234567890X@');
    b.ctx.initializeBackend();
    b.ctx.setupCredentials();
    return b;
  }
  const login = (b, password) => b.send({ action: 'auth.login', payload: { username: 'Admin', password } });

  it.each([
    ['a trailing line break + spaces (phone paste)', 'abcd1234567890X@\n  '],
    ['leading spaces + line break', '  \nabcd1234567890X@'],
    ['a trailing tab', 'abcd1234567890X@\t'],
    ['a Windows line ending', 'abcd1234567890X@\r\n'],
  ])('accepts the right password with %s', (_label, password) => {
    expect(login(setup(), password).ok).toBe(true);
  });

  it('still rejects a password that only differs inside, or is only whitespace', () => {
    const b = setup();
    expect(login(b, 'abcd 1234567890X@').ok).toBe(false);
    expect(login(b, 'abcd1234567890X').ok).toBe(false);
    expect(login(b, '   \n ').ok).toBe(false);
  });
});
