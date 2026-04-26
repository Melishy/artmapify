// Persists the most recently uploaded source image in IndexedDB so that
// accidental reloads don't lose the user's work. A single slot is used; the
// previous entry is overwritten each time.

const DB_NAME = "artmapify";
const DB_VERSION = 1;
const STORE = "source";
const KEY = "current";

interface CachedSource {
  name: string;
  type: string;
  blob: Blob;
  savedAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
  });
}

export async function saveSourceFile(file: File): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const entry: CachedSource = {
    name: file.name,
    type: file.type || "application/octet-stream",
    blob: file.slice(0, file.size, file.type),
    savedAt: Date.now(),
  };
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(entry, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB write failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB write aborted"));
  });
  db.close();
}

export async function loadSourceFile(): Promise<File | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const db = await openDb();
    const entry = await new Promise<CachedSource | undefined>(
      (resolve, reject) => {
        const tx = db.transaction(STORE, "readonly");
        const req = tx.objectStore(STORE).get(KEY);
        req.onsuccess = () => resolve(req.result as CachedSource | undefined);
        req.onerror = () =>
          reject(req.error ?? new Error("IndexedDB read failed"));
      },
    );
    db.close();
    if (!entry) return null;
    return new File([entry.blob], entry.name, {
      type: entry.type,
      lastModified: entry.savedAt,
    });
  } catch {
    return null;
  }
}

export async function clearSourceFile(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(tx.error ?? new Error("IndexedDB delete failed"));
    });
    db.close();
  } catch {
    /* ignore */
  }
}
