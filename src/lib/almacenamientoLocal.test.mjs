import assert from 'node:assert/strict';
import { esErrorCuota, guardarLocalSeguro } from './almacenamientoLocal.js';

function storageConCuota(limite, seed = {}) {
  const datos = { ...seed };
  const usado = () => Object.entries(datos).reduce((s, [k, v]) => s + k.length + v.length, 0);
  return {
    get length() { return Object.keys(datos).length; },
    key: (i) => Object.keys(datos)[i] ?? null,
    getItem: (k) => (k in datos ? datos[k] : null),
    removeItem: (k) => { delete datos[k]; },
    setItem(k, v) {
      const previo = k in datos ? k.length + datos[k].length : 0;
      if (usado() - previo + k.length + String(v).length > limite) {
        const e = new Error('The quota has been exceeded.');
        e.name = 'QuotaExceededError';
        throw e;
      }
      datos[k] = String(v);
    },
  };
}

assert.equal(esErrorCuota({ name: 'QuotaExceededError' }), true);
assert.equal(esErrorCuota(new Error('otra cosa')), false);

{
  const st = storageConCuota(1000);
  const r = guardarLocalSeguro('a', 'x'.repeat(100), st);
  assert.deepEqual(r, { ok: true, liberadas: 0 });
}

{
  // Lleno de catálogo offline: libera el catálogo y guarda el conteo.
  const st = storageConCuota(1000, { pos3b_catalogo_offline_3B6: 'c'.repeat(900), pos3b_tipo_cambio: '18' });
  const r = guardarLocalSeguro('pos3b_ruta_auditoria_borrador_cam1', 'y'.repeat(300), st);
  assert.equal(r.ok, true);
  assert.equal(r.liberadas, 1);
  assert.equal(st.getItem('pos3b_catalogo_offline_3B6'), null);
  assert.equal(st.getItem('pos3b_tipo_cambio'), '18');
}

{
  // Lleno de cosas que no se pueden borrar: avisa en vez de fallar en silencio.
  const st = storageConCuota(500, { pos3b_ventas_offline_cola: 'v'.repeat(480) });
  const r = guardarLocalSeguro('k', 'z'.repeat(200), st);
  assert.equal(r.ok, false);
  assert.equal(st.getItem('pos3b_ventas_offline_cola').length, 480);
}

assert.equal(guardarLocalSeguro('k', 'v', null).ok, false);
console.log('almacenamientoLocal.test.mjs ok');
