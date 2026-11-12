/**
 * File 3 of 6: Auth.gs  (shared-credential login, signed expiring tokens, lockout)
 *
 * Secrets live in Script Properties only. Nothing here is stored in a sheet.
 * Limitation: Apps Script web apps cannot read request headers, so the token travels in the
 * JSON body over HTTPS.
 */

// ---------------------------------------------------------------------------------------------
// Administrator setup (run from the Apps Script editor, never from the app)
// ---------------------------------------------------------------------------------------------

function hashPassword(password, saltHex, rounds) {
  var h = sha256Hex(saltHex + ':' + password);
  for (var i = 1; i < rounds; i++) {
    h = sha256Hex(h + saltHex);
  }
  return h;
}

/**
 * Reads the temporary properties ADMIN_USERNAME and ADMIN_PASSWORD, stores only a salted hash,
 * then deletes the plain-text properties. Also signs out every existing session.
 */
function setupCredentials() {
  var props = PropertiesService.getScriptProperties();
  var username = String(props.getProperty(PROP.adminUsername) || '').replace(/^\s+|\s+$/g, '');
  var password = String(props.getProperty(PROP.adminPassword) || '');

  if (username.length < 3) {
    throw new Error('Set Script Property ADMIN_USERNAME (at least 3 characters), then run setupCredentials again.');
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error('Set Script Property ADMIN_PASSWORD (at least ' + MIN_PASSWORD_LENGTH + ' characters), then run setupCredentials again.');
  }
  if (password.toLowerCase() === username.toLowerCase()) {
    throw new Error('The password must differ from the username.');
  }

  var salt = randomHex(16);
  var record = ['v1', PASSWORD_HASH_ROUNDS, salt, hashPassword(password, salt, PASSWORD_HASH_ROUNDS)].join('$');
  var values = {};
  values[PROP.authUsername] = username;
  values[PROP.authPasswordRecord] = record;
  props.setProperties(values);
  props.deleteProperty(PROP.adminPassword);
  props.deleteProperty(PROP.adminUsername);
  bumpTokenEpoch();
  props.deleteProperty(PROP.loginState);
  console.log('Credentials stored (hashed). Temporary ADMIN_* properties were deleted. All sessions were signed out.');
}

function verifyPasswordRecord(password, record) {
  var parts = String(record || '').split('$');
  if (parts.length !== 4 || parts[0] !== 'v1') return false;
  var rounds = parseInt(parts[1], 10);
  if (!isFinite(rounds) || rounds < 1) return false;
  return constantTimeEquals(hashPassword(password, parts[2], rounds), parts[3]);
}

function getTokenEpoch() {
  return getIntProp(PROP.tokenEpoch, 1);
}

function bumpTokenEpoch() {
  PropertiesService.getScriptProperties().setProperty(PROP.tokenEpoch, String(getTokenEpoch() + 1));
}

/** Signs every phone out immediately (invalidates all issued tokens). */
function signOutEveryone() {
  bumpTokenEpoch();
  console.log('All sessions invalidated.');
}

/** Replaces the token signing secret (also signs everyone out). */
function rotateTokenSecret() {
  PropertiesService.getScriptProperties().setProperty(PROP.tokenSecret, randomHex(32));
  bumpTokenEpoch();
  console.log('Token secret rotated. All sessions invalidated.');
}

function clearLoginLockout() {
  PropertiesService.getScriptProperties().deleteProperty(PROP.loginState);
  console.log('Login lockout cleared.');
}

// ---------------------------------------------------------------------------------------------
// Lockout (global: there is a single shared account and no reliable client address)
// ---------------------------------------------------------------------------------------------

function readLoginState() {
  var raw = getProp(PROP.loginState);
  if (!raw) return { fails: 0, windowStart: 0, lockedUntil: 0 };
  try {
    var parsed = JSON.parse(raw);
    return {
      fails: parseInt(parsed.fails, 10) || 0,
      windowStart: parseInt(parsed.windowStart, 10) || 0,
      lockedUntil: parseInt(parsed.lockedUntil, 10) || 0,
    };
  } catch (e) {
    return { fails: 0, windowStart: 0, lockedUntil: 0 };
  }
}

function writeLoginState(state) {
  PropertiesService.getScriptProperties().setProperty(PROP.loginState, JSON.stringify(state));
}

function assertNotLockedOut(state) {
  var now = nowMs();
  if (state.lockedUntil > now) {
    fail('AUTH', 'Too many failed sign-in attempts. Try again later.', {
      reason: 'LOCKED_OUT',
      retryAfterSeconds: Math.ceil((state.lockedUntil - now) / 1000),
    });
  }
}

function recordFailedLogin(state) {
  var now = nowMs();
  var maxFails = getIntProp(PROP.maxFailedLogins, 5);
  var lockoutMs = getIntProp(PROP.lockoutMinutes, 15) * 60 * 1000;
  var windowStart = state.windowStart && now - state.windowStart < lockoutMs ? state.windowStart : now;
  var fails = windowStart === state.windowStart ? state.fails + 1 : 1;
  var next = { fails: fails, windowStart: windowStart, lockedUntil: 0 };
  if (fails >= maxFails) {
    next.lockedUntil = now + lockoutMs;
    next.fails = 0;
    next.windowStart = 0;
  }
  writeLoginState(next);
}

// ---------------------------------------------------------------------------------------------
// Login + tokens
// ---------------------------------------------------------------------------------------------

function handleLogin(payload) {
  if (!isPlainObject(payload) || typeof payload.username !== 'string' || typeof payload.password !== 'string') {
    fail('VALIDATION', 'Username and password are required.', { fieldErrors: { username: 'Required.', password: 'Required.' } });
  }
  if (payload.username.length > 128 || payload.password.length > 256) {
    fail('AUTH', 'Invalid username or password.', { reason: 'INVALID_CREDENTIALS' });
  }

  var storedUsername = getProp(PROP.authUsername);
  var record = getProp(PROP.authPasswordRecord);
  if (!storedUsername || !record) {
    fail('INTERNAL', 'The backend is not configured: run setupCredentials().', {});
  }

  return withScriptLock(function () {
    var state = readLoginState();
    assertNotLockedOut(state);

    // Always evaluate both checks so timing does not reveal which one failed.
    var usernameOk = constantTimeEquals(payload.username.replace(/^\s+|\s+$/g, ''), storedUsername);
    var passwordOk = verifyPasswordRecord(payload.password, record);

    if (!usernameOk || !passwordOk) {
      recordFailedLogin(state);
      var after = readLoginState();
      if (after.lockedUntil > nowMs()) assertNotLockedOut(after);
      fail('AUTH', 'Invalid username or password.', { reason: 'INVALID_CREDENTIALS' });
    }

    if (state.fails > 0 || state.lockedUntil > 0) PropertiesService.getScriptProperties().deleteProperty(PROP.loginState);
    return issueToken(storedUsername);
  });
}

function issueToken(username) {
  var secret = getProp(PROP.tokenSecret);
  if (!secret) fail('INTERNAL', 'The backend is not configured: run initializeBackend().', {});
  var issuedAt = nowMs();
  var expiresAt = issuedAt + getIntProp(PROP.sessionHours, 12) * 3600 * 1000;
  var body = b64urlEncode(JSON.stringify({ u: username, iat: issuedAt, exp: expiresAt, ep: getTokenEpoch() }));
  var token = body + '.' + hmacSha256B64Url(body, secret);
  return { token: token, expiresAt: isoFromMs(expiresAt), username: username };
}

/** Throws an AUTH error unless the token is valid, unexpired and from the current epoch. */
function requireAuth(token) {
  var secret = getProp(PROP.tokenSecret);
  if (!secret) fail('INTERNAL', 'The backend is not configured: run initializeBackend().', {});
  if (typeof token !== 'string' || token.length === 0 || token.length > 1024) {
    fail('AUTH', 'Please sign in.', { reason: 'TOKEN_INVALID' });
  }
  var parts = token.split('.');
  if (parts.length !== 2) fail('AUTH', 'Please sign in.', { reason: 'TOKEN_INVALID' });

  if (!constantTimeEquals(hmacSha256B64Url(parts[0], secret), parts[1])) {
    fail('AUTH', 'Please sign in.', { reason: 'TOKEN_INVALID' });
  }

  var claims;
  try {
    claims = JSON.parse(b64urlDecode(parts[0]));
  } catch (e) {
    fail('AUTH', 'Please sign in.', { reason: 'TOKEN_INVALID' });
  }
  if (!claims || claims.ep !== getTokenEpoch()) {
    fail('AUTH', 'Your session is no longer valid. Please sign in again.', { reason: 'TOKEN_INVALID' });
  }
  if (typeof claims.exp !== 'number' || claims.exp <= nowMs()) {
    fail('AUTH', 'Your session has expired. Please sign in again.', { reason: 'TOKEN_EXPIRED' });
  }
  return claims;
}
