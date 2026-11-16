import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
};

const {
  crearArrendatario,
  desactivarArrendatario,
  esConceptoArrendatario,
  esPrestamoArrendatario,
  listarArrendatariosActivos,
  notasPrestamoArrendatario,
  arrendatarioDesdeSelect,
  idSelectArrendatario,
} = await import('./beneficiariosExternos.js');
const { valeDescuentaNomina } = await import('./valesCategorias.js');
const { resolverDescuentaNominaVale } = await import('./valesCatalogoIe.js');

const a = crearArrendatario({ nombre: '  Local Centro  ', nota: 'Renta local 2' });
assert.equal(a.ok, true);
assert.match(a.beneficiario.id, /^arr-/);
assert.equal(a.beneficiario.nombre, 'Local Centro');
assert.equal(crearArrendatario({ nombre: 'local centro' }).ok, false);
assert.equal(crearArrendatario({ nombre: 'ab' }).ok, false);

const activos = listarArrendatariosActivos();
assert.equal(activos.length, 1);
assert.equal(arrendatarioDesdeSelect(idSelectArrendatario(a.beneficiario.id))?.nombre, 'Local Centro');

const off = desactivarArrendatario(a.beneficiario.id);
assert.equal(off.ok, true);
assert.equal(listarArrendatariosActivos().length, 0);

assert.equal(esConceptoArrendatario('fiado'), true);
assert.equal(esConceptoArrendatario('anticipo-renta'), true);
assert.equal(esConceptoArrendatario('consumo'), false);
assert.equal(valeDescuentaNomina('fiado'), false);
assert.equal(valeDescuentaNomina('anticipo-renta'), false);
assert.equal(resolverDescuentaNominaVale('anticipo-renta'), false);
assert.equal(resolverDescuentaNominaVale('fiado'), false);

const notas = notasPrestamoArrendatario('anticipo-renta', 'semana 12');
assert.match(notas, /\[ARRENDATARIO\] Anticipo de renta/);
assert.match(notas, /semana 12/);
assert.equal(esPrestamoArrendatario({ notas, nombre_empleado: 'Local Centro', usuario_id: null }), true);
assert.equal(esPrestamoArrendatario({ notas: 'préstamo normal', nombre_empleado: 'Ana' }), false);

console.log('beneficiariosExternos.test.mjs ok');
