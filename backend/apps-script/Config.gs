/**
 * Turno Battery Scanner - Apps Script backend
 * File 1 of 6: Config.gs  (constants, sheet layout, Script Properties names)
 *
 * Paste all six .gs files and appsscript.json into the Apps Script editor of the
 * company-owned Google account. Do not put any secret in these files: secrets live in
 * Script Properties only (see PROP below).
 */

var API_VERSION = '1.0.0';

var SHEET_NAMES = { cells: 'BatteryCells', meta: 'CellMeta', audit: 'AuditLog' };

/** BatteryCells: exact 11-column order (A..K). Do not reorder. */
var CELL_HEADERS = [
  'Serial Number', // A
  'Battery Barcode', // B
  'Sorting', // C
  'Cell Weight', // D
  'Cell Voltage', // E
  'ACIR', // F
  'Cell Local Number', // G
  '0.5C DCh capacities', // H
  'DCIR @20%', // I
  'DCIR @50%', // J
  'DCIR @90%', // K
];

var META_HEADERS = [
  'Serial Number',
  'RawPayload',
  'ValidationMode',
  'ValidationStatus',
  'ScannedAt',
  'CreatedAt',
  'UpdatedAt',
  'StationId',
  'LineId',
  'RequestId',
  'Version',
];

var AUDIT_HEADERS = ['Timestamp', 'Action', 'SerialNumber', 'Barcode', 'BeforeJSON', 'AfterJSON', 'RequestId'];

/** 0-based column positions inside a BatteryCells row. */
var COL = {
  serial: 0,
  barcode: 1,
  sorting: 2,
  weight: 3,
  voltage: 4,
  acir: 5,
  localNumber: 6,
  capacity: 7,
  dcir20: 8,
  dcir50: 9,
  dcir90: 10,
};

var META_COL = {
  serial: 0,
  rawPayload: 1,
  validationMode: 2,
  validationStatus: 3,
  scannedAt: 4,
  createdAt: 5,
  updatedAt: 6,
  stationId: 7,
  lineId: 8,
  requestId: 9,
  version: 10,
};

var AUDIT_COL = { timestamp: 0, action: 1, serial: 2, barcode: 3, before: 4, after: 5, requestId: 6 };

/** Editable cell fields: API key -> BatteryCells column. Text columns are stored as text. */
var TEXT_FIELDS = [
  { key: 'sortingGrade', col: COL.sorting },
  { key: 'cellLocalNumber', col: COL.localNumber },
];
var NUMERIC_FIELDS = [
  { key: 'cellWeightG', col: COL.weight },
  { key: 'cellVoltageV', col: COL.voltage },
  { key: 'acirMohm', col: COL.acir },
  { key: 'dischargeCapacity05CAh', col: COL.capacity },
  { key: 'dcir20Mohm', col: COL.dcir20 },
  { key: 'dcir50Mohm', col: COL.dcir50 },
  { key: 'dcir90Mohm', col: COL.dcir90 },
];

/** Columns of BatteryCells that must be plain text (identifiers). */
var CELL_TEXT_COLUMNS = [COL.serial, COL.barcode, COL.sorting, COL.localNumber];

var LIMITS = {
  /** Safety bound only. It is NOT a barcode length rule (the real format is still unconfirmed). */
  maxPayloadLength: 512,
  maxTextFieldLength: 64,
  maxIdLength: 32,
  maxRequestBodyChars: 20000,
  lockWaitMs: 12000,
  maxFutureScanSkewMs: 5 * 60 * 1000,
};

/** Script Properties used by this backend. */
var PROP = {
  // Set by the administrator:
  spreadsheetId: 'SPREADSHEET_ID',
  validationMode: 'VALIDATION_MODE', // 'pilot' enables pilot mode; anything else = strict production (rules pending)
  adminUsername: 'ADMIN_USERNAME', // temporary, deleted by setupCredentials()
  adminPassword: 'ADMIN_PASSWORD', // temporary, deleted by setupCredentials()
  checkUsername: 'CHECK_USERNAME', // temporary, read and deleted by checkCredentials()
  checkPassword: 'CHECK_PASSWORD', // temporary, read and deleted by checkCredentials()
  sessionHours: 'SESSION_HOURS', // optional, default 12
  maxFailedLogins: 'MAX_FAILED_LOGINS', // optional, default 5
  lockoutMinutes: 'LOCKOUT_MINUTES', // optional, default 15
  loginDiagnostics: 'LOGIN_DIAGNOSTICS', // optional: "on" logs a description (never the value) of rejected logins
  // Managed by the backend itself:
  authUsername: 'AUTH_USERNAME',
  authPasswordRecord: 'AUTH_PASSWORD_RECORD',
  tokenSecret: 'TOKEN_SECRET',
  tokenEpoch: 'TOKEN_EPOCH',
  serialCounter: 'SERIAL_COUNTER',
  loginState: 'LOGIN_STATE',
  journal: 'JOURNAL',
};

var PASSWORD_HASH_ROUNDS = 1000;
var MIN_PASSWORD_LENGTH = 12;

function getProp(name) {
  return PropertiesService.getScriptProperties().getProperty(name);
}

function getIntProp(name, fallback) {
  var raw = getProp(name);
  var value = raw === null || raw === undefined || raw === '' ? NaN : parseInt(raw, 10);
  return isFinite(value) && value > 0 ? value : fallback;
}

/** 'pilot' only when the administrator explicitly set VALIDATION_MODE=pilot. */
function getValidationMode() {
  return getProp(PROP.validationMode) === 'pilot' ? 'pilot' : 'production';
}
