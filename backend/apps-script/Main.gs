/**
 * File 6 of 6: Main.gs  (web app entry points and the action router)
 *
 * One POST endpoint. Request body (sent as text/plain JSON):
 *   { "action": "...", "token": "...", "requestId": "...", "payload": { ... } }
 * Response (always HTTP 200; inspect "ok"):
 *   { "ok": true, "data": { ... } }  |  { "ok": false, "error": { "code", "message", "details" } }
 */

/**
 * `roles` lists who may call a protected action. Every read is open to both roles. Anything that changes data
 * is Admin only, and an entry without `roles` defaults to Admin only (fail closed).
 */
// Plain strings (equal to ROLE_ADMIN / ROLE_VIEWER in Config.gs) so this file does not depend on file load order.
var READ_ROLES = ['admin', 'viewer'];
var WRITE_ROLES = ['admin'];

var ACTIONS = {
  health: { auth: false, handler: handleHealth },
  'auth.login': { auth: false, handler: handleLogin },
  'cells.list': { auth: true, roles: READ_ROLES, handler: handleList },
  'cells.get': { auth: true, roles: READ_ROLES, handler: handleGet },
  'cells.findByBarcode': { auth: true, roles: READ_ROLES, handler: handleFindByBarcode },
  'cells.create': { auth: true, roles: WRITE_ROLES, handler: handleCreate },
  'cells.update': { auth: true, roles: WRITE_ROLES, handler: handleUpdate },
  'cells.delete': { auth: true, roles: WRITE_ROLES, handler: handleDelete },
};

function handleHealth() {
  var schema = 'ok';
  try {
    openStore();
  } catch (e) {
    schema = 'error';
  }
  return {
    status: 'ok',
    apiVersion: API_VERSION,
    serverTime: nowIso(),
    validationMode: getValidationMode(),
    schema: schema,
  };
}

/** Pure router (no Apps Script service objects), used by doPost and by tests. */
function handleRequest(body) {
  if (!isPlainObject(body)) fail('VALIDATION', 'The request must be a JSON object.', { reason: 'BAD_REQUEST' });
  var entry = typeof body.action === 'string' && Object.prototype.hasOwnProperty.call(ACTIONS, body.action) ? ACTIONS[body.action] : null;
  if (!entry) fail('VALIDATION', 'Unknown action.', { reason: 'UNKNOWN_ACTION' });
  if (entry.auth) {
    var claims = requireAuth(body.token);
    var allowed = entry.roles || WRITE_ROLES;
    // Checked before any payload validation or locking, so a forbidden call can never touch the sheets.
    if (allowed.indexOf(claims.role) === -1) {
      fail('FORBIDDEN', 'Your account has read-only access and cannot make changes.', { reason: 'READ_ONLY' });
    }
  }
  var payload = body.payload === undefined || body.payload === null ? {} : body.payload;
  return entry.handler(payload, body);
}

function doPost(e) {
  try {
    var raw = e && e.postData && typeof e.postData.contents === 'string' ? e.postData.contents : '';
    if (raw.length === 0 || raw.length > LIMITS.maxRequestBodyChars) {
      fail('VALIDATION', 'The request body is missing or too large.', { reason: 'BAD_REQUEST' });
    }
    var parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (parseError) {
      fail('VALIDATION', 'The request body is not valid JSON.', { reason: 'BAD_JSON' });
    }
    return jsonOutput(successBody(handleRequest(parsed)));
  } catch (err) {
    return jsonOutput(toErrorBody(err));
  }
}

/** Browser sanity check only; the app uses POST. Exposes nothing sensitive. */
function doGet() {
  return jsonOutput(successBody({ status: 'ok', apiVersion: API_VERSION }));
}

/** Administrator helper: prints non-secret configuration status to the execution log. */
function showStatus() {
  var props = PropertiesService.getScriptProperties();
  console.log(
    JSON.stringify({
      apiVersion: API_VERSION,
      spreadsheetIdSet: !!props.getProperty(PROP.spreadsheetId),
      validationMode: getValidationMode(),
      credentialsConfigured: !!props.getProperty(PROP.authPasswordRecord),
      tokenSecretSet: !!props.getProperty(PROP.tokenSecret),
      serialCounter: props.getProperty(PROP.serialCounter),
      journalPending: !!props.getProperty(PROP.journal),
      sessionHours: getIntProp(PROP.sessionHours, 12),
    }),
  );
}
