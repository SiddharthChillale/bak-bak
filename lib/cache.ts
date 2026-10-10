// Persistent audio cache (IndexedDB, extension origin). Sarvam bills per
// character, so replaying or seeking back over cached sentences must be free.
// Bytes and metadata live in separate stores so eviction can scan metadata
// without loading audio.

const DB_NAME = 'readaloud';
const BLOBS = 'audio';
const META = 'meta';

interface Meta {
  key: string;
  size: number;
  mime: string;
  lastUsed: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const d = req.result;
      d.createObjectStore(BLOBS);
      d.createObjectStore(META, { keyPath: 'key' }).createIndex('lastUsed', 'lastUsed');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });
  return dbPromise;
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
}

function result<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function cacheKey(parts: { model: string; speaker: string; pace: number; lang: string; text: string }) {
  const data = new TextEncoder().encode(JSON.stringify([parts.model, parts.speaker, parts.pace, parts.lang, parts.text]));
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  return Array.from(hash, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function cacheGet(key: string): Promise<{ bytes: Uint8Array; mime: string } | null> {
  const d = await db();
  const tx = d.transaction([BLOBS, META], 'readwrite');
  const bytesReq = tx.objectStore(BLOBS).get(key) as IDBRequest<ArrayBuffer | undefined>;
  const metaReq = tx.objectStore(META).get(key) as IDBRequest<Meta | undefined>;
  // Touch lastUsed from the request callback: awaiting first could let the transaction auto-commit.
  metaReq.onsuccess = () => {
    if (metaReq.result) tx.objectStore(META).put({ ...metaReq.result, lastUsed: Date.now() });
  };
  await done(tx);
  const bytes = bytesReq.result;
  const meta = metaReq.result;
  return bytes && meta ? { bytes: new Uint8Array(bytes), mime: meta.mime } : null;
}

let putsSinceEvict = 0;

export async function cachePut(key: string, bytes: Uint8Array, mime: string, limitBytes: number): Promise<void> {
  const d = await db();
  const tx = d.transaction([BLOBS, META], 'readwrite');
  tx.objectStore(BLOBS).put(bytes.slice().buffer, key);
  tx.objectStore(META).put({ key, size: bytes.byteLength, mime, lastUsed: Date.now() } satisfies Meta);
  await done(tx);
  if (++putsSinceEvict >= 20) {
    putsSinceEvict = 0;
    await evict(limitBytes);
  }
}

export async function evict(limitBytes: number): Promise<void> {
  const d = await db();
  const metas = await result(d.transaction(META).objectStore(META).index('lastUsed').getAll() as IDBRequest<Meta[]>);
  let total = metas.reduce((n, m) => n + m.size, 0);
  if (total <= limitBytes) return;
  const tx = d.transaction([BLOBS, META], 'readwrite');
  for (const m of metas) {
    if (total <= limitBytes * 0.9) break;
    tx.objectStore(BLOBS).delete(m.key);
    tx.objectStore(META).delete(m.key);
    total -= m.size;
  }
  await done(tx);
}

export async function cacheStats(): Promise<{ entries: number; bytes: number }> {
  const d = await db();
  const metas = await result(d.transaction(META).objectStore(META).getAll() as IDBRequest<Meta[]>);
  return { entries: metas.length, bytes: metas.reduce((n, m) => n + m.size, 0) };
}

export async function cacheClear(): Promise<void> {
  const d = await db();
  const tx = d.transaction([BLOBS, META], 'readwrite');
  tx.objectStore(BLOBS).clear();
  tx.objectStore(META).clear();
  await done(tx);
}
