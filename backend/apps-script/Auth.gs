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
  if (/^\s|\s$/.test(password)) {
    // A pasted value often carries an invisible trailing space or line break. It would become part of the
    // stored password and the typed password would never match, so refuse it instead.
    throw new Error('ADMIN_PASSWORD starts or ends with a space or line break. Retype it in the box (do not paste), then run setupCredentials again.');
  }
  if (/[\u0000-\u001F\u007F]/.test(password)) {
    throw new Error('ADMIN_PASSWORD contains an invisible control character (for example a line break). Retype it, then run setupCredentials again.');
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
  console.log(
    'Credentials stored (hashed). Username: "' + username + '" (not case-sensitive). Password length: ' + password.length +
      ' characters. Temporary ADMIN_* properties were deleted. All sessions were signed out.',
  );
}

/** Usernames are compared without regard to case, so "admin" and "Admin" are the same account. */
function usernamesMatch(typed, stored) {
  return constantTimeEquals(String(typed).replace(/^\s+|\s+$/g, '').toLowerCase(), String(stored).toLowerCase());
}

/** Script Property that receives the latest rejected-login description (diagnostics only). */
var LAST_LOGIN_REJECTION_PROP = 'LAST_LOGIN_REJECTION';

/**
 * Describes a value's shape for diagnostics, never the value itself: length, character-type counts, and the
 * Unicode codes of any unusual characters (non-ASCII, control or invisible), e.g. U+2013 for an en-dash.
 */
function describePassword(password) {
  var classes = { lowercase: 0, uppercase: 0, digits: 0, spaces: 0, otherAscii: 0, nonAscii: 0 };
  for (var i = 0; i < password.length; i++) {
    var ch = password.charAt(i);
    var code = password.charCodeAt(i);
    if (code > 126) classes.nonAscii++;
    else if (ch >= 'a' && ch <= 'z') classes.lowercase++;
    else if (ch >= 'A' && ch <= 'Z') classes.uppercase++;
    else if (ch >= '0' && ch <= '9') classes.digits++;
    else if (/\s/.test(ch)) classes.spaces++;
    else classes.otherAscii++;
  }
  var unusual = [];
  for (var j = 0; j < password.length; j++) {
    var c = password.charCodeAt(j);
    if (c < 32 || c === 127 || c > 126) {
      var hex = 'U+' + ('0000' + c.toString(16).toUpperCase()).slice(-4);
      if (unusual.indexOf(hex) === -1) unusual.push(hex);
    }
  }
  return {
    length: password.length,
    hasEdgeWhitespace: /^\s|\s$/.test(password),
    characterClasses: classes,
    unusualCharacters: unusual,
  };
}

/**
 * When the Script Property LOGIN_DIAGNOSTICS is "on", logs a description of a rejected login to the
 * Executions log: the received username, whether it matched, and the password's length and character
 * classes (counts of lowercase / uppercase / digits / spaces / other / non-ASCII). The password itself and
 * its hash are never logged. Turn it off (delete the property) when finished.
 */
function logRejectedLogin(payload, storedUsername, usernameOk, passwordOk) {
  if (getProp(PROP.loginDiagnostics) !== 'on') return;
  var info = JSON.stringify({
    at: nowIso(),
    storedUsername: storedUsername,
    usernameMatches: usernameOk,
    passwordMatches: passwordOk,
    receivedUsername: describePassword(String(payload.username)),
    receivedPassword: describePassword(String(payload.password)),
  });
  console.log('LOGIN REJECTED ' + info);
  // Executions by anonymous callers (the phones) do not show logs in the editor, so also keep the latest
  // description in a Script Property the administrator can read under Project Settings.
  try {
    PropertiesService.getScriptProperties().setProperty(LAST_LOGIN_REJECTION_PROP, info);
  } catch (e) {
    console.error('Could not store LAST_LOGIN_REJECTION: ' + e);
  }
}

/**
 * Administrator diagnostic: checks a username/password pair against the stored credentials WITHOUT
 * logging in and without counting as a failed attempt.
 * Set the temporary properties CHECK_USERNAME and CHECK_PASSWORD, run this, read the log.
 * Both temporary properties are deleted afterwards. The password itself is never logged.
 */
function checkCredentials() {
  var props = PropertiesService.getScriptProperties();
  var typedUser = props.getProperty(PROP.checkUsername);
  var typedPassword = props.getProperty(PROP.checkPassword);
  props.deleteProperty(PROP.checkUsername);
  props.deleteProperty(PROP.checkPassword);

  if (typedUser === null || typedPassword === null) {
    throw new Error('Set the Script Properties CHECK_USERNAME and CHECK_PASSWORD, then run checkCredentials again.');
  }
  var storedUser = getProp(PROP.authUsername);
  var record = getProp(PROP.authPasswordRecord);
  if (!storedUser || !record) throw new Error('No credentials are stored. Run setupCredentials first.');

  var lockState = readLoginState();
  console.log(
    JSON.stringify({
      storedUsername: storedUser,
      usernameMatches: usernamesMatch(typedUser, storedUser),
      usernameMatchesExactCase: String(typedUser).replace(/^\s+|\s+$/g, '') === storedUser,
      passwordMatches: verifyPasswordRecord(typedPassword, record),
      checkedPasswordLength: typedPassword.length,
      checkedPasswordHasEdgeWhitespace: /^\s|\s$/.test(typedPassword),
      checkedPassword: describePassword(typedPassword),
      failedAttemptsInWindow: lockState.fails,
      lockedOut: lockState.lockedUntil > nowMs(),
    }),
  );
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
    var usernameOk = usernamesMatch(payload.username, storedUsername);
    // Stored passwords can never start or end with whitespace (setupCredentials refuses that), so leading and
    // trailing whitespace on a login attempt is ignored. It usually comes from pasting a password on a phone
    // together with a line break or spaces. Whitespace INSIDE the password is still significant.
    var trimmedPassword = payload.password.replace(/^\s+|\s+$/g, '');
    var passwordOk =
      verifyPasswordRecord(payload.password, record) ||
      (trimmedPassword !== payload.password && trimmedPassword.length > 0 && verifyPasswordRecord(trimmedPassword, record));

    if (!usernameOk || !passwordOk) {
      logRejectedLogin(payload, storedUsername, usernameOk, passwordOk);
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
