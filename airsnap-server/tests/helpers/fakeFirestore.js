/**
 * Minimal in-memory Firestore stand-in for unit-testing userStore.js /
 * promoStore.js without credentials. Mirrors the bits of the real SDK
 * those modules rely on — including the rule that a transaction must do
 * ALL reads before ANY write (the real SDK throws synchronously on
 * tx.get() once a write is queued).
 *
 * Usage (before requiring the stores):
 *   const fake = require('./helpers/fakeFirestore').install();
 *   const userStore = require('../userStore');
 */

const path = require('path');

const READ_AFTER_WRITE =
  'Firestore transactions require all reads to be executed before all writes.';

const SERVER_TS = Object.freeze({ __serverTimestamp: true });
class Increment { constructor(n) { this.n = n; } }
const FieldValue = {
  serverTimestamp: () => SERVER_TS,
  increment: (n) => new Increment(n),
};

function createFakeDb() {
  const docs = new Map(); // full path -> plain data
  let autoId = 0;

  const resolveSet = (data) => {
    const out = {};
    for (const [k, v] of Object.entries(data)) {
      if (v === SERVER_TS) out[k] = Date.now();
      else if (v instanceof Increment) out[k] = v.n;
      else out[k] = v;
    }
    return out;
  };
  const applyUpdate = (p, data) => {
    const cur = docs.get(p);
    if (!cur) throw new Error(`NOT_FOUND: no document to update: ${p}`);
    const next = { ...cur };
    for (const [k, v] of Object.entries(data)) {
      if (v === SERVER_TS) next[k] = Date.now();
      else if (v instanceof Increment) next[k] = (Number(cur[k]) || 0) + v.n;
      else next[k] = v;
    }
    docs.set(p, next);
  };
  const snapOf = (p) => {
    const data = docs.get(p);
    return {
      id: p.split('/').pop(),
      exists: data !== undefined,
      data: () => (data ? { ...data } : undefined),
    };
  };
  const runQuery = (colPath, filters, lim) => {
    const out = [];
    for (const [p, data] of docs) {
      if (p.slice(0, p.lastIndexOf('/')) !== colPath) continue;
      if (filters.every(([f, v]) => data[f] === v)) out.push(snapOf(p));
      if (out.length >= lim) break;
    }
    return { empty: out.length === 0, size: out.length, docs: out };
  };

  function docRef(p) {
    return {
      _kind: 'doc',
      path: p,
      id: p.split('/').pop(),
      collection: (name) => colRef(`${p}/${name}`),
      get: async () => snapOf(p),
      set: async (data) => { docs.set(p, resolveSet(data)); },
      update: async (data) => { applyUpdate(p, data); },
      delete: async () => { docs.delete(p); },
    };
  }
  function queryRef(colPath, filters, lim) {
    return {
      _kind: 'query',
      path: colPath,
      filters,
      lim,
      where: (f, _op, v) => queryRef(colPath, [...filters, [f, v]], lim),
      orderBy: () => queryRef(colPath, filters, lim),
      limit: (n) => queryRef(colPath, filters, n),
      get: async () => runQuery(colPath, filters, lim),
    };
  }
  function colRef(colPath) {
    const q = queryRef(colPath, [], Infinity);
    return {
      ...q,
      doc: (id) => {
        const docId = id === undefined ? `auto${++autoId}` : String(id);
        if (!docId || docId.includes('/')) {
          throw new Error(`Invalid document id "${docId}"`);
        }
        return docRef(`${colPath}/${docId}`);
      },
    };
  }

  async function runTransaction(fn) {
    const writes = [];
    const tx = {
      get(ref) {
        if (writes.length) throw new Error(READ_AFTER_WRITE);
        return Promise.resolve(
          ref._kind === 'doc' ? snapOf(ref.path) : runQuery(ref.path, ref.filters, ref.lim),
        );
      },
      set(ref, data) { writes.push(() => docs.set(ref.path, resolveSet(data))); return tx; },
      update(ref, data) { writes.push(() => applyUpdate(ref.path, data)); return tx; },
      delete(ref) { writes.push(() => docs.delete(ref.path)); return tx; },
    };
    const result = await fn(tx);
    for (const w of writes) w(); // commit only if the callback resolved
    return result;
  }

  return {
    collection: (name) => colRef(name),
    runTransaction,
    _docs: docs,
    _reset: () => docs.clear(),
  };
}

/**
 * Swap ../../auth.js in the require cache for a stub backed by the fake DB.
 * Must run before userStore / promoStore are required.
 */
function install() {
  const db = createFakeDb();
  const authPath = require.resolve(path.join(__dirname, '..', '..', 'auth.js'));
  require.cache[authPath] = {
    id: authPath,
    filename: authPath,
    loaded: true,
    exports: {
      getDb: () => db,
      getFieldValue: () => FieldValue,
      initFirebase: () => {},
      isAdminEmail: () => false,
    },
  };
  return db;
}

module.exports = { install, createFakeDb, FieldValue, READ_AFTER_WRITE };
