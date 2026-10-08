// All of Finity's data lives in this one IndexedDB database, on the device only.

const DB_NAME = 'finity';
const DB_VERSION = 1;

export const STORES = ['kv', 'items', 'shelf', 'events'] as const;
export type StoreName = (typeof STORES)[number];

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('kv');
      db.createObjectStore('items', { keyPath: 'id' });
      db.createObjectStore('shelf', { keyPath: 'id' });
      db.createObjectStore('events', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function done<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function store(name: StoreName, mode: IDBTransactionMode = 'readonly'): Promise<IDBObjectStore> {
  return (await open()).transaction(name, mode).objectStore(name);
}

export async function get<T>(name: StoreName, key: string): Promise<T | undefined> {
  return done((await store(name)).get(key)) as Promise<T | undefined>;
}

export async function all<T>(name: StoreName): Promise<T[]> {
  return done((await store(name)).getAll()) as Promise<T[]>;
}

export async function put(name: StoreName, value: unknown, key?: string): Promise<void> {
  await done((await store(name, 'readwrite')).put(value, key));
}

export async function putMany(name: StoreName, values: unknown[]): Promise<void> {
  if (!values.length) return;
  const tx = (await open()).transaction(name, 'readwrite');
  const os = tx.objectStore(name);
  for (const v of values) os.put(v);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function del(name: StoreName, key: string): Promise<void> {
  await done((await store(name, 'readwrite')).delete(key));
}

export async function delMany(name: StoreName, keys: string[]): Promise<void> {
  if (!keys.length) return;
  const tx = (await open()).transaction(name, 'readwrite');
  const os = tx.objectStore(name);
  for (const k of keys) os.delete(k);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export interface Backup {
  app: 'finity';
  version: 1;
  exportedAt: string;
  kv: Record<string, unknown>;
  items: unknown[];
  shelf: unknown[];
  events: unknown[];
}

export async function exportAll(): Promise<Backup> {
  const kvStore = await store('kv');
  const keys = (await done(kvStore.getAllKeys())) as string[];
  const values = await done(kvStore.getAll());
  const kv: Record<string, unknown> = {};
  keys.forEach((k, i) => (kv[k] = values[i]));
  return {
    app: 'finity',
    version: 1,
    exportedAt: new Date().toISOString(),
    kv,
    items: await all('items'),
    shelf: await all('shelf'),
    events: await all('events'),
  };
}

export async function importAll(backup: Backup): Promise<void> {
  if (backup?.app !== 'finity' || backup.version !== 1) throw new Error('This is not a Finity backup file.');
  const db = await open();
  const tx = db.transaction([...STORES], 'readwrite');
  for (const name of STORES) tx.objectStore(name).clear();
  for (const [k, v] of Object.entries(backup.kv ?? {})) tx.objectStore('kv').put(v, k);
  for (const name of ['items', 'shelf', 'events'] as const) {
    for (const v of backup[name] ?? []) tx.objectStore(name).put(v);
  }
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function wipeAll(): Promise<void> {
  const db = await open();
  db.close();
  dbPromise = null;
  await done(indexedDB.deleteDatabase(DB_NAME));
}
