/**
 * Local test harness for the Apps Script backend.
 *
 * Loads the real .gs files into a Node `vm` context and provides in-memory fakes of the Google services
 * the backend uses (SpreadsheetApp, PropertiesService, LockService, Utilities, ContentService).
 *
 * IMPORTANT: this proves the backend LOGIC against faithful fakes. It does not prove behaviour on Google's
 * infrastructure (quotas, latency, real lock contention, real Sheets formatting). That needs a manual test
 * against the deployed web app.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const GS_FILES = ['Config.gs', 'Utils.gs', 'Auth.gs', 'Store.gs', 'Cells.gs', 'Main.gs'];

const toSignedBytes = (buffer) => Array.from(buffer).map((b) => (b > 127 ? b - 256 : b));
const toBuffer = (input) =>
  typeof input === 'string' ? Buffer.from(input, 'utf8') : Buffer.from(input.map((b) => b & 0xff));

function createUtilities() {
  const encodeWebSafe = (input) =>
    toBuffer(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'); // keeps '=' padding, like Apps Script
  return {
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    Charset: { UTF_8: 'UTF-8' },
    computeDigest: (_alg, value) => toSignedBytes(crypto.createHash('sha256').update(toBuffer(value)).digest()),
    computeHmacSha256Signature: (value, key) =>
      toSignedBytes(crypto.createHmac('sha256', toBuffer(key)).update(toBuffer(value)).digest()),
    base64EncodeWebSafe: encodeWebSafe,
    base64DecodeWebSafe: (text) => {
      const std = String(text).replace(/-/g, '+').replace(/_/g, '/');
      if (std.length % 4 !== 0) throw new Error('Invalid base64 (missing padding)');
      return toSignedBytes(Buffer.from(std, 'base64'));
    },
    newBlob: (data) => ({
      getBytes: () => (typeof data === 'string' ? toSignedBytes(Buffer.from(data, 'utf8')) : data),
      getDataAsString: () => toBuffer(data).toString('utf8'),
    }),
    getUuid: () => crypto.randomUUID(),
  };
}

class FakeRange {
  constructor(sheet, row, col, numRows, numCols) {
    Object.assign(this, { sheet, row, col, numRows, numCols });
  }
  getValues() {
    this.sheet._enter('getValues', this);
    const out = [];
    for (let r = 0; r < this.numRows; r++) {
      const line = [];
      for (let c = 0; c < this.numCols; c++) line.push(this.sheet._get(this.row + r, this.col + c));
      out.push(line);
    }
    return out;
  }
  setValues(values) {
    this.sheet._enter('setValues', this, values);
    if (values.length !== this.numRows || values.some((line) => line.length !== this.numCols)) {
      throw new Error('FakeRange.setValues: dimension mismatch');
    }
    for (let r = 0; r < this.numRows; r++) {
      for (let c = 0; c < this.numCols; c++) this.sheet._set(this.row + r, this.col + c, values[r][c]);
    }
    return this;
  }
  clearContent() {
    this.sheet._enter('clearContent', this);
    for (let r = 0; r < this.numRows; r++) {
      for (let c = 0; c < this.numCols; c++) {
        this.sheet.values.delete(`${this.row + r},${this.col + c}`);
        this.sheet.formulas.delete(`${this.row + r},${this.col + c}`);
      }
    }
    return this;
  }
  getFormulas() {
    const out = [];
    for (let r = 0; r < this.numRows; r++) {
      const line = [];
      for (let c = 0; c < this.numCols; c++) line.push(this.sheet.formulas.get(`${this.row + r},${this.col + c}`) || '');
      out.push(line);
    }
    return out;
  }
  setRichTextValue(rich) {
    this.sheet._enter('setRichTextValue', this, rich);
    // Rich text is stored literally (never parsed as a formula/number/date), unless the test breaks it.
    this.sheet._set(this.row, this.col, rich.text, { literal: !this.sheet.richTextBroken });
    return this;
  }
  setNumberFormat(format) {
    this.sheet._enter('setNumberFormat', this, format);
    for (let r = 0; r < this.numRows; r++) {
      for (let c = 0; c < this.numCols; c++) this.sheet.formats.set(`${this.row + r},${this.col + c}`, format);
    }
    return this;
  }
  setDataValidation(rule) {
    this.sheet._enter('setDataValidation', this, rule);
    this.sheet.validations.push({ row: this.row, col: this.col, numRows: this.numRows, numCols: this.numCols, rule });
    return this;
  }
  protect() {
    const protection = {
      description: '',
      warningOnly: false,
      setDescription(d) {
        this.description = d;
        return this;
      },
      getDescription() {
        return this.description;
      },
      setWarningOnly(v) {
        this.warningOnly = v;
        return this;
      },
    };
    this.sheet.protections.push(protection);
    return protection;
  }
}

class FakeSheet {
  constructor(name, { maxRows = 1000, maxCols = 11 } = {}) {
    this.name = name;
    this.values = new Map(); // "r,c" -> value
    this.formats = new Map(); // "r,c" -> format
    this.maxRows = maxRows;
    this.maxCols = maxCols;
    this.frozenRows = 0;
    this.protections = [];
    this.validations = []; // data-validation rules applied to ranges
    this.faults = [];
    this.formulas = new Map(); // "r,c" -> formula text (cells Sheets interpreted as formulas)
    this.hostile = false; // test switch: Sheets mangles text even in plain-text cells
    this.richTextBroken = false; // test switch: rich text is parsed too
    this.onOp = null;
    this.opLog = [];
  }
  getName() {
    return this.name;
  }
  getMaxRows() {
    return this.maxRows;
  }
  getMaxColumns() {
    return this.maxCols;
  }
  getLastRow() {
    let last = 0;
    for (const [key, value] of this.values) {
      if (value !== '' && value !== undefined) last = Math.max(last, Number(key.split(',')[0]));
    }
    return last;
  }
  getLastColumn() {
    let last = 0;
    for (const [key, value] of this.values) {
      if (value !== '' && value !== undefined) last = Math.max(last, Number(key.split(',')[1]));
    }
    return last;
  }
  getRange(row, col, numRows = 1, numCols = 1) {
    if (row < 1 || col < 1 || row + numRows - 1 > this.maxRows || col + numCols - 1 > this.maxCols) {
      throw new Error(`Range out of bounds on ${this.name}: r${row} c${col} ${numRows}x${numCols}`);
    }
    return new FakeRange(this, row, col, numRows, numCols);
  }
  deleteRows(row, count) {
    for (let i = 0; i < count; i += 1) this.deleteRow(row);
  }
  deleteRow(row) {
    this._enter('deleteRow', { row });
    const shift = (map) => {
      const next = new Map();
      for (const [key, value] of map) {
        const [r, c] = key.split(',').map(Number);
        if (r === row) continue;
        next.set(`${r > row ? r - 1 : r},${c}`, value);
      }
      return next;
    };
    this.values = shift(this.values);
    this.formats = shift(this.formats);
  }
  insertRowsAfter(_after, count) {
    this.maxRows += count;
  }
  insertColumnsAfter(_after, count) {
    this.maxCols += count;
  }
  setFrozenRows(n) {
    this.frozenRows = n;
  }
  getProtections() {
    return this.protections;
  }

  // ---- fault injection / observation (tests only) ----
  failNext(op, { times = 1, when = null, message = `Injected ${op} failure` } = {}) {
    this.faults.push({ op, remaining: times, when, message });
  }
  _enter(op, range, extra) {
    this.opLog.push(op);
    if (this.onOp) this.onOp(op, range, extra);
    const fault = this.faults.find((f) => f.op === op && f.remaining > 0 && (!f.when || f.when(range, extra)));
    if (fault) {
      fault.remaining -= 1;
      throw new Error(fault.message);
    }
  }
  _get(r, c) {
    const v = this.values.get(`${r},${c}`);
    return v === undefined ? '' : v;
  }
  /** Mimics Sheets: General cells coerce numeric strings to numbers and evaluate '=' formulas; '@' cells keep text. */
  _set(r, c, value, { literal = false } = {}) {
    const key = `${r},${c}`;
    const format = this.formats.get(key);
    this.formulas.delete(key);
    let stored = value;
    if (literal) {
      stored = value;
    } else if (typeof value === 'string' && value.startsWith('=')) {
      // Observed on real Google Sheets: setValues evaluates "=..." text even in a plain-text ('@') cell.
      stored = `#FORMULA_EVALUATED(${value})`;
      this.formulas.set(key, value);
    } else if (format === '@' && !this.hostile) {
      stored = typeof value === 'number' ? String(value) : value;
    } else if (typeof value === 'string') {
      if (value.trim() !== '' && Number.isFinite(Number(value))) stored = Number(value);
      else if (this.hostile && /^[+\-@]/.test(value)) stored = `#MANGLED(${value})`;
    }
    this.values.set(key, stored);
  }
  /** Raw 2D dump of data rows (excluding the header row), for assertions. */
  dump() {
    const last = this.getLastRow();
    const out = [];
    for (let r = 2; r <= last; r++) {
      const line = [];
      for (let c = 1; c <= this.maxCols; c++) line.push(this._get(r, c));
      out.push(line);
    }
    return out;
  }
}

class FakeSpreadsheet {
  constructor(id) {
    this.id = id;
    this.sheets = new Map();
  }
  getSheetByName(name) {
    return this.sheets.get(name) || null;
  }
  insertSheet(name) {
    const sheet = new FakeSheet(name);
    this.sheets.set(name, sheet);
    return sheet;
  }
}

function createFakeProperties(initial = {}) {
  const store = new Map(Object.entries(initial));
  const api = {
    getProperty: (k) => (store.has(k) ? store.get(k) : null),
    setProperty: (k, v) => {
      store.set(k, String(v));
      return api;
    },
    setProperties: (obj) => {
      Object.entries(obj).forEach(([k, v]) => store.set(k, String(v)));
      return api;
    },
    deleteProperty: (k) => {
      store.delete(k);
      return api;
    },
    getKeys: () => Array.from(store.keys()),
    getProperties: () => Object.fromEntries(store),
  };
  return api;
}

/**
 * @param {object} options
 * @param {'pilot'|'production'|null} [options.validationMode] value for the VALIDATION_MODE Script Property
 * @param {boolean} [options.configure] run initializeBackend + setupCredentials
 */
function createBackend(options = {}) {
  const { validationMode = 'pilot', configure = true, extraFiles = [] } = options;
  const credentials = { username: 'factory.shared', password: 'Correct-Horse-Battery-99' };
  const spreadsheetId = 'test-spreadsheet-id';

  const spreadsheet = new FakeSpreadsheet(spreadsheetId);
  spreadsheet.insertSheet('BatteryCells'); // the user already created this tab (empty)

  const props = createFakeProperties({ SPREADSHEET_ID: spreadsheetId });
  if (validationMode) props.setProperty('VALIDATION_MODE', validationMode);

  const lockState = { held: false, acquisitions: 0, releases: 0 };
  const errors = [];
  const logs = [];

  const ctx = vm.createContext({
    SpreadsheetApp: {
      ProtectionType: { RANGE: 'RANGE' },
      newDataValidation: () => {
        const rule = { values: [], dropdown: false, allowInvalid: true };
        const builder = {
          requireValueInList(values, dropdown) {
            rule.values = values.slice();
            rule.dropdown = dropdown;
            return this;
          },
          setAllowInvalid(v) {
            rule.allowInvalid = v;
            return this;
          },
          build: () => rule,
        };
        return builder;
      },
      newRichTextValue: () => {
        const builder = {
          text: '',
          setText(t) {
            this.text = t;
            return this;
          },
          build() {
            return { text: this.text };
          },
        };
        return builder;
      },
      openById: (id) => {
        if (id !== spreadsheetId) throw new Error('Unknown spreadsheet');
        return spreadsheet;
      },
    },
    PropertiesService: { getScriptProperties: () => props },
    LockService: {
      getScriptLock: () => ({
        tryLock: () => {
          if (lockState.held) return false;
          lockState.held = true;
          lockState.acquisitions += 1;
          return true;
        },
        releaseLock: () => {
          lockState.held = false;
          lockState.releases += 1;
        },
        hasLock: () => lockState.held,
      }),
    },
    ContentService: {
      MimeType: { JSON: 'JSON' },
      createTextOutput: (text) => ({
        text,
        mime: null,
        setMimeType(m) {
          this.mime = m;
          return this;
        },
        getContent() {
          return this.text;
        },
      }),
    },
    Utilities: createUtilities(),
    console: {
      log: (...a) => logs.push(a.join(' ')),
      error: (...a) => errors.push(a.join(' ')),
    },
  });

  const source = [...GS_FILES, ...extraFiles].map((f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n');
  new vm.Script(source, { filename: 'apps-script-bundle.js' }).runInContext(ctx);

  // Controllable clock (starts 11 Nov 2026 10:00 UTC).
  const clock = { t: Date.UTC(2026, 10, 11, 10, 0, 0) };
  ctx.__clock.now = () => clock.t;

  if (configure) {
    props.setProperty('ADMIN_USERNAME', credentials.username);
    props.setProperty('ADMIN_PASSWORD', credentials.password);
    ctx.initializeBackend();
    ctx.setupCredentials();
  }

  const sheets = () => ({
    cells: spreadsheet.getSheetByName('BatteryCells'),
    meta: spreadsheet.getSheetByName('CellMeta'),
    audit: spreadsheet.getSheetByName('AuditLog'),
  });

  /** Sends a request through doPost exactly like the web app would and returns the parsed JSON body. */
  function send(body) {
    const output = ctx.doPost({ postData: { contents: typeof body === 'string' ? body : JSON.stringify(body) } });
    return JSON.parse(output.getContent());
  }

  const backend = {
    ctx,
    props,
    credentials,
    clock,
    lockState,
    errors,
    logs,
    spreadsheet,
    get sheets() {
      return sheets();
    },
    send,
    token: null,
    advance(ms) {
      clock.t += ms;
    },
    login(creds = credentials) {
      const res = send({ action: 'auth.login', payload: creds });
      if (res.ok) backend.token = res.data.token;
      return res;
    },
    /** Authenticated call. Writes get a fresh requestId unless one is given. */
    call(action, payload = {}, extra = {}) {
      if (!backend.token) {
        const res = backend.login();
        if (!res.ok) throw new Error(`Test login failed: ${JSON.stringify(res)}`);
      }
      return send({ action, payload, token: backend.token, ...extra });
    },
    nextId: (() => {
      let n = 0;
      return () => `req-${String(++n).padStart(6, '0')}-${crypto.randomUUID().slice(0, 8)}`;
    })(),
    create(payload, requestId) {
      return backend.call('cells.create', typeof payload === 'string' ? { payload, source: 'scan' } : payload, {
        requestId: requestId || backend.nextId(),
      });
    },
  };
  return backend;
}

module.exports = { createBackend, FakeSheet };
