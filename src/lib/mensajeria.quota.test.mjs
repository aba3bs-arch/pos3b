import assert from 'node:assert/strict';

const LS_CACHE = 'pos3b_mensajes_cache_v1';
const LS_SOLICITUDES = 'pos3b_soporte_solicitudes_v1';
const OTRA = 'pos3b_otra_cosa';

function crearStorage(cuota) {
  const store = new Map();
  const bytes = () => {
    let n = 0;
    for (const [k, v] of store) n += k.length + String(v).length;
    return n;
  };
  const storage = {
    getItem(k) {
      return store.has(k) ? store.get(k) : null;
    },
    setItem(k, v) {
      const valor = String(v);
      const prev = store.has(k) ? store.get(k) : null;
      const siguiente = bytes() - (prev != null ? k.length + prev.length : 0) + k.length + valor.length;
      if (siguiente > cuota) {
        const err = new Error(
          `Failed to execute 'setItem' on 'Storage': setting the value of '${k}' exceeded the quota.`,
        );
        err.name = 'QuotaExceededError';
        throw err;
      }
      store.set(k, valor);
    },
    removeItem(k) {
      store.delete(k);
    },
    store,
  };
  return storage;
}

function instalar(cuota) {
  const storage = crearStorage(cuota);
  globalThis.localStorage = storage;
  globalThis.window = { dispatchEvent() {} };
  return storage;
}

const cajero = { id: 'cajero-1', nombre: 'Ana Ruiz', rol: 'Cajero', sucursal_id: '3B2' };

const { enviarMensaje, marcarCanalLeido, leerMensajesLocales, fusionarMensajes, abrirSolicitudSoporte, canalSucursal } = await import('./mensajeria.js');

{
  const largo = 'a'.repeat(800);
  const fusion = fusionarMensajes(
    [{ id: '1', canal: 'grupo', texto: largo, created_at: '2026-01-01T00:00:00.000Z', pendiente: true }],
    [{ id: '1', canal: 'grupo', texto: 'corto', created_at: '2026-01-01T00:00:00.000Z', pendiente: false }],
  );
  assert.equal(fusion[0].texto, largo);
  assert.equal(fusion[0].pendiente, false);
}

{
  const storage = instalar(20000);
  storage.store.set(OTRA, 'conservar');
  const viejos = Array.from({ length: 120 }, (_, i) => ({
    id: `viejo-${i}`,
    canal: canalSucursal('3B2'),
    texto: 'x'.repeat(400),
    autor_id: 'cajero-1',
    autor_nombre: 'Ana',
    created_at: `2026-01-01T00:${String(i % 60).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}.000Z`,
  }));
  storage.store.set(LS_CACHE, JSON.stringify({ mensajes: viejos, leidos: {} }));
  const enviado = await enviarMensaje(null, {
    user: cajero,
    sucursal: '3B2',
    canal: canalSucursal('3B2'),
    texto: 'mensaje nuevo de la caja',
  });
  assert.equal(enviado.ok, true);
  assert.equal(enviado.mensaje.texto, 'mensaje nuevo de la caja');
  assert.equal(storage.getItem(OTRA), 'conservar');
  const guardados = JSON.parse(storage.getItem(LS_CACHE)).mensajes;
  assert.ok(guardados.length <= 40);
  assert.ok(guardados.some((m) => m.texto === 'mensaje nuevo de la caja'));
  assert.equal(leerMensajesLocales(cajero, '3B2').some((m) => m.id === enviado.mensaje.id), true);
}

{
  // El origen ya no acepta ni un byte más. Abrir el chat no debe lanzar.
  const storage = instalar(50);
  storage.store.set(OTRA, 'x'.repeat(50));
  storage.store.set(LS_CACHE, JSON.stringify({
    mensajes: [{ id: 'gordo', canal: 'sucursal__3B2', texto: 'y'.repeat(5000), created_at: '2026-01-01T00:00:00.000Z' }],
    leidos: {},
  }));
  assert.doesNotThrow(() => marcarCanalLeido(cajero, canalSucursal('3B2')));
  const enviado = await enviarMensaje(null, {
    user: cajero,
    sucursal: '3B2',
    canal: canalSucursal('3B2'),
    texto: 'sigue en pantalla',
  });
  assert.equal(enviado.ok, true);
  assert.equal(enviado.mensaje.texto, 'sigue en pantalla');
  const sol = await abrirSolicitudSoporte(null, {
    user: cajero,
    sucursal: '3B2',
    canal: 'soporte__3B2',
    texto: 'no imprime',
  });
  assert.equal(sol.estado, 'abierta');
  assert.equal(storage.getItem(OTRA), 'x'.repeat(50));
  assert.equal(storage.store.has(LS_SOLICITUDES), false);
}
