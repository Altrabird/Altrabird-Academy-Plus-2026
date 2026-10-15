/**
 * photos.js — the teacher's own background pictures.
 *
 * Photos are far too big for the one localStorage document, so they live in
 * IndexedDB as Blobs and a screen only stores "photo:<id>". Like the Image
 * tool, every picture is shrunk on this computer first and never uploaded.
 * If IndexedDB is unavailable every call rejects and the picker says so.
 */

const DB_NAME = 'altrabirdPhotos';
const STORE = 'photos';
const MAX_EDGE = 1920;          // a 1080p projector never needs more

let dbPromise = null;
const urls = new Map();         // id -> object URL, made once per session

function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error('IndexedDB is not available')); return; }
      const request = window.indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    dbPromise.catch(() => { dbPromise = null; });
  }
  return dbPromise;
}

async function run(mode, action) {
  const database = await db();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE, mode);
    const request = action(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(request && request.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** Shrink a picture to projector size and re-encode it as JPEG. */
async function shrink(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  if (typeof bitmap.close === 'function') bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob(
    (blob) => (blob ? resolve(blob) : reject(new Error('could not encode the picture'))),
    'image/jpeg', 0.86,
  ));
}

const newId = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const photos = {
  /** [{ id, name, addedAt }] newest first, without the picture data. */
  async list() {
    const all = await run('readonly', (store) => store.getAll());
    return (all || []).map(({ id, name, addedAt }) => ({ id, name, addedAt }))
      .sort((a, b) => b.addedAt - a.addedAt);
  },

  async add(file) {
    const blob = await shrink(file);
    const record = { id: newId(), name: String(file.name || 'Picture').slice(0, 60), addedAt: Date.now(), blob };
    await run('readwrite', (store) => store.put(record));
    return record.id;
  },

  /** Store a picture under a known id (used when importing a screen file). */
  async put(id, blob, name = 'Imported picture') {
    await run('readwrite', (store) => store.put({ id, name, addedAt: Date.now(), blob }));
    return id;
  },

  async blob(id) {
    const record = await run('readonly', (store) => store.get(id));
    return record ? record.blob : null;
  },

  async url(id) {
    if (urls.has(id)) return urls.get(id);
    const blob = await this.blob(id);
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    urls.set(id, url);
    return url;
  },

  async remove(id) {
    await run('readwrite', (store) => store.delete(id));
    if (urls.has(id)) { URL.revokeObjectURL(urls.get(id)); urls.delete(id); }
  },
};

/** Blob <-> data URL, for carrying pictures inside an exported file. */
export function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Decoded by hand rather than fetch(), so the app makes no request of any kind. */
export function dataURLToBlob(url) {
  const [head, body] = String(url).split(',', 2);
  const type = (head.match(/^data:([^;,]+)/) || [])[1] || 'application/octet-stream';
  const binary = atob(body || '');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}
