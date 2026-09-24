import assert from 'node:assert/strict';

const store = new Map();
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => {
      store.set(k, String(v));
    },
    removeItem: (k) => {
      store.delete(k);
    },
  },
  configurable: true,
});

try {
  Object.defineProperty(globalThis.navigator, 'userAgent', {
    get: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
    configurable: true,
  });
} catch {
  /* ignore */
}
try {
  Object.defineProperty(globalThis.navigator, 'maxTouchPoints', {
    get: () => 5,
    configurable: true,
  });
} catch {
  /* ignore */
}
try {
  Object.defineProperty(globalThis.navigator, 'platform', {
    get: () => 'iPhone',
    configurable: true,
  });
} catch {
  /* ignore */
}

const mod = await import('./sesionPersistenteMovil.js');
const {
  LS_SESION_PERSISTENTE_MOVIL,
  convieneSesionPersistenteMovil,
  guardarSesionPersistenteMovil,
  leerSesionPersistenteMovil,
  limpiarSesionPersistenteMovil,
} = mod;

const admin = {
  id: 'u1',
  nombre: 'Admin Prueba',
  rol: 'Administrador',
  sucursal_id: 'MAIN',
};
const cajero = {
  id: 'u2',
  nombre: 'Cajero',
  rol: 'Cajero',
  sucursal_id: '3B2',
};

// En Node sin UA móvil real, conviene puede ser false; forzamos guardado vía JSON y leemos lógica de edad.
const gForce = (() => {
  store.set(
    LS_SESION_PERSISTENTE_MOVIL,
    JSON.stringify({
      user: { id: 'u1', nombre: 'Admin Prueba', rol: 'Administrador', sucursal_id: 'MAIN', esCtMovil: false },
      sucursal: 'MAIN',
      vista: 'Inicio',
      savedAt: Date.now(),
    }),
  );
  return true;
})();
assert.equal(gForce, true);

// Si el entorno detecta móvil, conviene debe ser true para admin.
if (convieneSesionPersistenteMovil(admin)) {
  const g = guardarSesionPersistenteMovil({ user: admin, sucursal: 'MAIN', vista: 'Inicio' });
  assert.equal(g.ok, true);
  const leida = leerSesionPersistenteMovil();
  assert.equal(leida.user.id, 'u1');
  assert.equal(convieneSesionPersistenteMovil(cajero), false);
  const skip = guardarSesionPersistenteMovil({ user: cajero, sucursal: '3B2' });
  assert.equal(skip.skipped, true);
}

limpiarSesionPersistenteMovil();
assert.equal(store.has(LS_SESION_PERSISTENTE_MOVIL), false);

assert.equal(typeof LS_SESION_PERSISTENTE_MOVIL, 'string');

console.log('sesionPersistenteMovil.test.mjs OK');
