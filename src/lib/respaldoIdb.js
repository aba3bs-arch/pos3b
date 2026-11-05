/**
 * Copia de respaldo de borradores en IndexedDB (otro cupo que localStorage).
 * Si localStorage se llena o el navegador lo limpia, el conteo se recupera de aquí.
 * Todo es opcional: si IndexedDB no existe, no hace nada.
 */

const DB = 'pos3b_respaldo';
const STORE = 'borradores';

function abrir() {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null);
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function tx(db, modo, fn) {
  return new Promise((resolve) => {
    try {
      const t = db.transaction(STORE, modo);
      const out = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(out?.result ?? true);
      t.onerror = () => resolve(null);
      t.onabort = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function respaldarBorrador(clave, objeto) {
  const db = await abrir();
  if (!db) return false;
  const r = await tx(db, 'readwrite', (s) => s.put(JSON.parse(JSON.stringify(objeto)), clave));
  db.close();
  return r != null;
}

export async function borrarRespaldo(clave) {
  const db = await abrir();
  if (!db) return false;
  const r = await tx(db, 'readwrite', (s) => s.delete(clave));
  db.close();
  return r != null;
}

/** Respaldos cuya clave empieza con `prefijo`: [{ clave, valor }]. */
export async function listarRespaldos(prefijo) {
  const db = await abrir();
  if (!db) return [];
  const out = await new Promise((resolve) => {
    try {
      const t = db.transaction(STORE, 'readonly');
      const s = t.objectStore(STORE);
      const res = [];
      const cur = s.openCursor();
      cur.onsuccess = () => {
        const c = cur.result;
        if (!c) return;
        if (String(c.key).startsWith(prefijo)) res.push({ clave: String(c.key), valor: c.value });
        c.continue();
      };
      t.oncomplete = () => resolve(res);
      t.onerror = () => resolve([]);
      t.onabort = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
  db.close();
  return out;
}
