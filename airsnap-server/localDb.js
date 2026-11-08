/**
 * ============================================================
 *  Local database — a small Firestore stand-in
 * ============================================================
 *  Lets the server run fully WITHOUT Firebase admin credentials
 *  (Docker, a friend's laptop, offline demos). Users, credits,
 *  ledger, promo codes and hives live in memory and are saved
 *  to a JSON file so they survive restarts.
 *
 *  Turned on only when LOCAL_DB_FILE is set AND there is no
 *  FIREBASE_SERVICE_ACCOUNT (see auth.js). Render keeps using
 *  real Firestore.
 *
 *  Implements just the Firestore surface this codebase uses:
 *    db.collection(name).doc(id?) / .where(f, op, v) / .orderBy(f, dir)
 *      / .limit(n) / .get() / .add(data)
 *    doc.get() / .set(data, {merge}) / .update(data) / .delete()
 *      / .collection(sub)
 *    db.runTransaction(fn) — all reads before writes (like the real
 *      SDK), commit only if fn resolves, transactions run one at a time.
 *    FieldValue.serverTimestamp() / .increment(n)
 *  Timestamps serialize like Firestore's ({ _seconds, _nanoseconds }).
 * ============================================================
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ── Values ───────────────────────────────────────────────
class LocalTimestamp {
  constructor(millis) { this._ms = millis; }
  static now() { return new LocalTimestamp(Date.now()); }
  get seconds() { return Math.floor(this._ms / 1000); }
  get nanoseconds() { return (this._ms % 1000) * 1e6; }
  toMillis() { return this._ms; }
  toDate() { return new Date(this._ms); }
  valueOf() { return this._ms; }
  toJSON() { return { _seconds: this.seconds, _nanoseconds: this.nanoseconds }; }
}

const SERVER_TS = Object.freeze({ __localServerTimestamp: true });
class Increment { constructor(n) { this.n = Number(n) || 0; } }

const FieldValue = {
  serverTimestamp: () => SERVER_TS,
  increment: (n) => new Increment(n),
};

const READ_AFTER_WRITE =
  'Firestore transactions require all reads to be executed before all writes.';

function clone(v) {
  if (v instanceof LocalTimestamp) return new LocalTimestamp(v.toMillis());
  if (Array.isArray(v)) return v.map(clone);
  if (v && typeof v === 'object') {
    const out = {};
    for (const [k, x] of Object.entries(v)) out[k] = clone(x);
    return out;
  }
  return v;
}

// Turn saved { _seconds, _nanoseconds } back into timestamps.
function revive(v) {
  if (Array.isArray(v)) return v.map(revive);
  if (v && typeof v === 'object') {
    const keys = Object.keys(v);
    if (keys.length === 2 && '_seconds' in v && '_nanoseconds' in v) {
      return new LocalTimestamp(v._seconds * 1000 + Math.round(v._nanoseconds / 1e6));
    }
    const out = {};
    for (const [k, x] of Object.entries(v)) out[k] = revive(x);
    return out;
  }
  return v;
}

function resolveValue(next, prev) {
  if (next === SERVER_TS) return LocalTimestamp.now();
  if (next instanceof Increment) return (Number(prev) || 0) + next.n;
  return clone(next);
}

function comparable(v) {
  if (v instanceof LocalTimestamp) return v.toMillis();
  return v;
}

function matches(data, [field, op, value]) {
  const a = comparable(data[field]);
  const b = comparable(value);
  switch (op) {
    case '==': return a === b;
    case '!=': return a !== b;
    case '<': return a < b;
    case '<=': return a <= b;
    case '>': return a > b;
    case '>=': return a >= b;
    case 'in': return Array.isArray(b) && b.includes(a);
    case 'array-contains': return Array.isArray(data[field]) && data[field].includes(value);
    default: throw new Error(`localDb: unsupported where operator "${op}"`);
  }
}

function autoId() {
  return crypto.randomBytes(15).toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, 20);
}

// ── Database ─────────────────────────────────────────────
function createLocalDb({ file } = {}) {
  const docs = new Map(); // "col/id/sub/id" -> data

  if (file && fs.existsSync(file)) {
    try {
      const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
      for (const [p, data] of Object.entries(saved.docs || {})) docs.set(p, revive(data));
      console.log(`[localDb] loaded ${docs.size} documents from ${file}`);
    } catch (e) {
      console.warn(`[localDb] could not read ${file} (${e.message}) — starting empty`);
    }
  }

  // Debounced, atomic save to disk.
  let saveTimer = null;
  function saveNow() {
    if (!file) return;
    clearTimeout(saveTimer);
    saveTimer = null;
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const tmp = `${file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ version: 1, docs: Object.fromEntries(docs) }));
      fs.renameSync(tmp, file);
    } catch (e) {
      console.warn(`[localDb] save failed: ${e.message}`);
    }
  }
  function scheduleSave() {
    if (!file || saveTimer) return;
    saveTimer = setTimeout(saveNow, 250);
  }
  if (file) {
    process.once('exit', saveNow);
    for (const sig of ['SIGINT', 'SIGTERM']) {
      process.once(sig, () => { saveNow(); process.exit(0); });
    }
  }

  // ── Low-level ops ──────────────────────────────────────
  function snapOf(p) {
    const data = docs.get(p);
    return {
      id: p.split('/').pop(),
      exists: data !== undefined,
      ref: docRef(p),
      data: () => (data === undefined ? undefined : clone(data)),
      get: (field) => (data === undefined ? undefined : clone(data[field])),
    };
  }

  function writeSet(p, data, options = {}) {
    const prev = options.merge ? (docs.get(p) || {}) : {};
    const next = { ...clone(prev) };
    for (const [k, v] of Object.entries(data || {})) next[k] = resolveValue(v, prev[k]);
    docs.set(p, next);
  }

  function writeUpdate(p, data) {
    const prev = docs.get(p);
    if (prev === undefined) {
      const err = new Error(`5 NOT_FOUND: No document to update: ${p}`);
      err.code = 5;
      throw err;
    }
    const next = clone(prev);
    for (const [k, v] of Object.entries(data || {})) next[k] = resolveValue(v, prev[k]);
    docs.set(p, next);
  }

  function writeDelete(p) {
    docs.delete(p);
  }

  function runQuery({ colPath, filters, order, lim }) {
    let rows = [];
    for (const [p, data] of docs) {
      if (p.slice(0, p.lastIndexOf('/')) !== colPath) continue;
      if (filters.every((f) => matches(data, f))) rows.push(p);
    }
    if (order.length) {
      rows.sort((pa, pb) => {
        const a = docs.get(pa);
        const b = docs.get(pb);
        for (const [field, dir] of order) {
          const x = comparable(a[field]);
          const y = comparable(b[field]);
          if (x === y) continue;
          if (x === undefined) return 1;
          if (y === undefined) return -1;
          const cmp = x < y ? -1 : 1;
          return dir === 'desc' ? -cmp : cmp;
        }
        return 0;
      });
    }
    if (Number.isFinite(lim)) rows = rows.slice(0, lim);
    const snaps = rows.map(snapOf);
    return {
      empty: snaps.length === 0,
      size: snaps.length,
      docs: snaps,
      forEach: (cb) => snaps.forEach(cb),
    };
  }

  // ── References ─────────────────────────────────────────
  function docRef(p) {
    return {
      _kind: 'doc',
      path: p,
      id: p.split('/').pop(),
      collection: (name) => colRef(`${p}/${name}`),
      get: async () => snapOf(p),
      set: async (data, options) => { writeSet(p, data, options); scheduleSave(); },
      create: async (data) => {
        if (docs.has(p)) throw new Error(`6 ALREADY_EXISTS: ${p}`);
        writeSet(p, data); scheduleSave();
      },
      update: async (data) => { writeUpdate(p, data); scheduleSave(); },
      delete: async () => { writeDelete(p); scheduleSave(); },
    };
  }

  function queryRef(spec) {
    return {
      _kind: 'query',
      _spec: spec,
      where: (field, op, value) => queryRef({ ...spec, filters: [...spec.filters, [field, op, value]] }),
      orderBy: (field, dir = 'asc') => queryRef({ ...spec, order: [...spec.order, [field, dir]] }),
      limit: (n) => queryRef({ ...spec, lim: n }),
      get: async () => runQuery(spec),
    };
  }

  function colRef(colPath) {
    return {
      ...queryRef({ colPath, filters: [], order: [], lim: Infinity }),
      id: colPath.split('/').pop(),
      path: colPath,
      doc: (id) => {
        const docId = id === undefined ? autoId() : String(id);
        if (!docId || docId.includes('/')) throw new Error(`Invalid document id "${docId}"`);
        return docRef(`${colPath}/${docId}`);
      },
      add: async (data) => {
        const ref = docRef(`${colPath}/${autoId()}`);
        writeSet(ref.path, data);
        scheduleSave();
        return ref;
      },
    };
  }

  // ── Transactions (serialized) ──────────────────────────
  let txChain = Promise.resolve();
  function runTransaction(fn) {
    const run = async () => {
      const writes = [];
      const tx = {
        get(ref) {
          if (writes.length) return Promise.reject(new Error(READ_AFTER_WRITE));
          return Promise.resolve(ref._kind === 'doc' ? snapOf(ref.path) : runQuery(ref._spec));
        },
        set(ref, data, options) { writes.push(() => writeSet(ref.path, data, options)); return tx; },
        create(ref, data) {
          writes.push(() => {
            if (docs.has(ref.path)) throw new Error(`6 ALREADY_EXISTS: ${ref.path}`);
            writeSet(ref.path, data);
          });
          return tx;
        },
        update(ref, data) { writes.push(() => writeUpdate(ref.path, data)); return tx; },
        delete(ref) { writes.push(() => writeDelete(ref.path)); return tx; },
      };
      const result = await fn(tx);
      // Validate (updates on missing docs throw) before touching real data.
      const backup = new Map(docs);
      try {
        for (const w of writes) w();
      } catch (e) {
        docs.clear();
        for (const [k, v] of backup) docs.set(k, v);
        throw e;
      }
      if (writes.length) scheduleSave();
      return result;
    };
    const p = txChain.then(run, run);
    txChain = p.catch(() => {});
    return p;
  }

  return {
    collection: (name) => colRef(name),
    runTransaction,
    _flush: saveNow,
    _size: () => docs.size,
  };
}

module.exports = { createLocalDb, FieldValue, LocalTimestamp, READ_AFTER_WRITE };
