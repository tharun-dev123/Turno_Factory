/**
 * File 2 of 6: Utils.gs  (clock, errors, JSON output, encoding, input validation)
 */

/** Replaceable clock (tests override __clock.now). */
var __clock = {
  now: function () {
    return Date.now();
  },
};

function nowMs() {
  return __clock.now();
}

function isoFromMs(ms) {
  return new Date(ms).toISOString();
}

function nowIso() {
  return isoFromMs(nowMs());
}

/**
 * Formats a time as Indian Standard Time for people reading the sheet, e.g. "2026-11-17 13:47:05 IST".
 * IST is a fixed UTC+05:30 (India has no daylight saving), so no time zone database is needed.
 */
function istFromMs(ms) {
  var shifted = new Date(ms + (5 * 60 + 30) * 60 * 1000).toISOString(); // 2026-11-17T13:47:05.223Z
  return shifted.slice(0, 10) + ' ' + shifted.slice(11, 19) + ' IST';
}

// ---------------------------------------------------------------------------------------------
// Errors. Codes: DUPLICATE_BARCODE, VALIDATION, NOT_FOUND, AUTH, FORBIDDEN, CONFLICT, BUSY, INTERNAL
// ---------------------------------------------------------------------------------------------

function ApiError(code, message, details) {
  this.name = 'ApiError';
  this.code = code;
  this.message = message;
  this.details = details || {};
}
ApiError.prototype = Object.create(Error.prototype);
ApiError.prototype.constructor = ApiError;

function fail(code, message, details) {
  throw new ApiError(code, message, details);
}

function successBody(data) {
  return { ok: true, data: data === undefined ? {} : data };
}

function errorBody(code, message, details) {
  return { ok: false, error: { code: code, message: message, details: details || {} } };
}

function toErrorBody(err) {
  if (err instanceof ApiError) return errorBody(err.code, err.message, err.details);
  // Never leak internals to the client; log them for the administrator instead.
  console.error('Unhandled error: ' + (err && err.stack ? err.stack : err));
  return errorBody('INTERNAL', 'The server could not complete the request.', {});
}

function jsonOutput(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}

// ---------------------------------------------------------------------------------------------
// Encoding / crypto helpers
// ---------------------------------------------------------------------------------------------

function toHex(bytes) {
  var out = '';
  for (var i = 0; i < bytes.length; i++) {
    var b = bytes[i] & 0xff;
    out += (b < 16 ? '0' : '') + b.toString(16);
  }
  return out;
}

function sha256Hex(text) {
  return toHex(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8));
}

function randomHex(byteCount) {
  var out = '';
  while (out.length < byteCount * 2) {
    out += Utilities.getUuid().replace(/-/g, '');
  }
  return out.substring(0, byteCount * 2);
}

function b64urlEncode(text) {
  return Utilities.base64EncodeWebSafe(text, Utilities.Charset.UTF_8).replace(/=+$/, '');
}

function b64urlDecode(text) {
  var remainder = text.length % 4;
  var padded = remainder === 0 ? text : text + '===='.substring(remainder);
  return Utilities.newBlob(Utilities.base64DecodeWebSafe(padded)).getDataAsString();
}

function hmacSha256B64Url(message, secret) {
  var sig = Utilities.computeHmacSha256Signature(message, secret);
  return Utilities.base64EncodeWebSafe(sig).replace(/=+$/, '');
}

/** Compares strings without returning early on the first difference. */
function constantTimeEquals(a, b) {
  var x = String(a);
  var y = String(b);
  var diff = x.length ^ y.length;
  var len = Math.max(x.length, y.length);
  for (var i = 0; i < len; i++) {
    diff |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
  }
  return diff === 0;
}

// ---------------------------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------------------------

var CONTROL_CHARS = /[\u0000-\u001F\u007F]/;
/** Control characters except tab, line feed and carriage return (allowed inside Remarks). */
var REMARKS_BAD_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Validates a decoded QR payload (or a manually typed barcode) and returns the trimmed value.
 * Rejects empty, control-character and excessively long input. It does NOT enforce any barcode length,
 * format or regex: the real label format is still unconfirmed.
 */
function sanitizePayload(payload) {
  if (typeof payload !== 'string') {
    fail('VALIDATION', 'The scanned code must be text.', { reason: 'NOT_TEXT', fieldErrors: { payload: 'Must be text.' } });
  }
  if (payload.length > LIMITS.maxPayloadLength) {
    fail('VALIDATION', 'The scanned code is too long.', { reason: 'TOO_LONG', fieldErrors: { payload: 'Too long.' } });
  }
  var trimmed = payload.replace(/^\s+|\s+$/g, '');
  if (trimmed === '') {
    fail('VALIDATION', 'The scanned code is empty.', { reason: 'EMPTY', fieldErrors: { payload: 'Empty.' } });
  }
  if (CONTROL_CHARS.test(trimmed)) {
    fail('VALIDATION', 'The scanned code contains control characters.', {
      reason: 'CONTROL_CHARACTERS',
      fieldErrors: { payload: 'Contains control characters.' },
    });
  }
  return trimmed;
}

/**
 * Applies the server-controlled validation mode.
 *  - pilot: any sanitized payload is accepted and flagged UNVERIFIED (enabled only via Script Properties).
 *  - production: strict rules are NOT defined yet, so every payload is rejected until samples are verified.
 */
function validatePayloadForMode(rawPayload) {
  var barcode = sanitizePayload(rawPayload);
  if (getValidationMode() === 'pilot') {
    return { barcode: barcode, validationMode: 'pilot', validationStatus: 'UNVERIFIED' };
  }
  fail(
    'VALIDATION',
    'Production barcode validation is not configured yet. The administrator must enable pilot mode or provide verified QR samples.',
    { reason: 'PRODUCTION_RULES_PENDING' },
  );
}

function requireRequestId(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9-]{8,64}$/.test(value)) {
    fail('VALIDATION', 'A valid requestId is required.', { reason: 'BAD_REQUEST_ID', fieldErrors: { requestId: 'Invalid.' } });
  }
  return value;
}

/** Cell ids are serial numbers: digits only. */
function requireCellId(value) {
  var id = typeof value === 'number' ? String(value) : value;
  if (typeof id !== 'string' || !/^[0-9]{1,12}$/.test(id)) {
    fail('VALIDATION', 'A valid cell id is required.', { reason: 'BAD_ID', fieldErrors: { id: 'Invalid.' } });
  }
  return String(parseInt(id, 10));
}

function optionalShortText(value, fieldName) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string' || value.length > LIMITS.maxIdLength || CONTROL_CHARS.test(value)) {
    fail('VALIDATION', fieldName + ' is invalid.', { fieldErrors: (function () { var o = {}; o[fieldName] = 'Invalid.'; return o; })() });
  }
  return value.replace(/^\s+|\s+$/g, '');
}

/** Client scan time is accepted only when valid and not in the future; otherwise the server time is used. */
function resolveScannedAt(value) {
  var now = nowMs();
  if (typeof value === 'string') {
    var parsed = Date.parse(value);
    if (isFinite(parsed) && parsed <= now + LIMITS.maxFutureScanSkewMs) return isoFromMs(parsed);
  }
  return isoFromMs(now);
}

function toNumberOrNull(value) {
  if (value === '' || value === null || value === undefined) return null;
  if (typeof value === 'number') return isFinite(value) ? value : null;
  if (typeof value === 'string') {
    var trimmed = value.replace(/^\s+|\s+$/g, '');
    if (trimmed === '') return null;
    var n = Number(trimmed);
    return isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Validates an edit patch. Only the nine optional measurement/classification fields are editable;
 * the serial number and system fields can never be changed through a patch.
 */
function validatePatch(patch) {
  if (patch === undefined || patch === null) return {};
  if (!isPlainObject(patch)) fail('VALIDATION', 'The patch must be an object.', { reason: 'BAD_PATCH' });

  var allowed = {};
  var i;
  for (i = 0; i < TEXT_FIELDS.length; i++) allowed[TEXT_FIELDS[i].key] = 'text';
  for (i = 0; i < NUMERIC_FIELDS.length; i++) allowed[NUMERIC_FIELDS[i].key] = 'number';
  allowed.visualInspectionStatus = 'status';
  allowed.remarks = 'remarks';

  var errors = {};
  var clean = {};
  Object.keys(patch).forEach(function (key) {
    var kind = allowed[key];
    var value = patch[key];
    if (!kind) {
      errors[key] = 'This field cannot be edited.';
      return;
    }
    if (kind === 'status') {
      // Exactly one of the four statuses: null, blank or unknown values are rejected.
      if (typeof value !== 'string' || VISUAL_STATUSES.indexOf(value) === -1) {
        errors[key] = 'Must be one of: ' + VISUAL_STATUSES.join(', ') + '.';
      } else {
        clean[key] = value;
      }
    } else if (kind === 'remarks') {
      // Longer than other text fields; line breaks and tabs are allowed, other control characters are not.
      if (value === null) clean[key] = null;
      else if (typeof value !== 'string' || value.length > LIMITS.maxRemarksLength || REMARKS_BAD_CHARS.test(value)) {
        errors[key] = 'Invalid text (max ' + LIMITS.maxRemarksLength + ' characters, no control characters).';
      } else {
        var remarksTrimmed = value.replace(/^\s+|\s+$/g, '');
        clean[key] = remarksTrimmed === '' ? null : remarksTrimmed;
      }
    } else if (kind === 'number') {
      if (value === null) clean[key] = null;
      else if (typeof value !== 'number' || !isFinite(value)) errors[key] = 'Must be a number.';
      else if (value < 0) errors[key] = 'Cannot be negative.';
      else clean[key] = value;
    } else {
      if (value === null) clean[key] = null;
      else if (typeof value !== 'string' || value.length > LIMITS.maxTextFieldLength || CONTROL_CHARS.test(value)) {
        errors[key] = 'Invalid text (max ' + LIMITS.maxTextFieldLength + ' characters, no control characters).';
      } else {
        var trimmed = value.replace(/^\s+|\s+$/g, '');
        clean[key] = trimmed === '' ? null : trimmed;
      }
    }
  });

  if (Object.keys(errors).length > 0) {
    fail('VALIDATION', 'Please correct the highlighted fields.', { fieldErrors: errors });
  }
  return clean;
}
