import assert from 'node:assert/strict';
import {
  TIPO_NOTIF_CONSUMO_LIMITE,
  configEmpleadoConsumo,
  debeTomarCandadoRemoto,
  esRegistroConsumo,
  evaluarLimiteConsumo,
  evaluarRegistroConsumo,
  normalizarCandadoCancelarConsumo,
  notificacionConsumoLimiteParaUsuario,
  quitarEmpleadoCandadoConsumo,
} from './candadoCancelarConsumo.js';

assert.equal(esRegistroConsumo({ categoria: 'EMPLEADO', subcategoria: 'CONSUMO' }), true);
assert.equal(esRegistroConsumo({ categoria: 'consumo', subcategoria: 'vales-consumo' }), true);
assert.equal(esRegistroConsumo({ categoria: 'EMPLEADO', subcategoria: 'FALTANTE' }), false);
assert.equal(esRegistroConsumo({ categoria: 'gasolina' }), false);

const cfg = normalizarCandadoCancelarConsumo({
  empleados: {
    'u-luz': { id: 'u-luz', nombre: 'Luz Zazueta', limite: 150 },
    'u-gaby': { nombre: 'Gabriela Janette', limite: '' },
    'u-malo': { nombre: 'Sin tope', limite: -5 },
    'u-frania': { id: 'u-frania', nombre: 'Frania Pahola', registrar: 'bloqueado' },
  },
});
assert.equal(cfg.empleados['u-luz'].registrar, 'limite');
assert.equal(cfg.empleados['u-luz'].limite, 150);
assert.equal(cfg.empleados['u-gaby'].registrar, 'bloqueado');
assert.equal(cfg.empleados['u-gaby'].limite, null);
assert.equal(cfg.empleados['u-malo'].registrar, 'bloqueado');
assert.equal(cfg.empleados['u-frania'].registrar, 'bloqueado');

assert.equal(configEmpleadoConsumo(cfg, { usuarioId: 'u-luz' }).nombre, 'Luz Zazueta');
assert.equal(configEmpleadoConsumo(cfg, { nombre: 'Luz Zazueta' }).id, 'u-luz');
assert.equal(configEmpleadoConsumo(cfg, { nombre: 'Otra persona' }), null);

const bloqueo = evaluarRegistroConsumo(cfg, { usuarioId: 'u-frania' }, { monto: 10 });
assert.equal(bloqueo.ok, false);
assert.equal(bloqueo.motivo, 'permiso');
assert.match(bloqueo.error, /no tiene permiso de registrar consumo/);
assert.equal(evaluarRegistroConsumo(cfg, { nombre: 'Nadie' }, { monto: 999 }).ok, true);

const tope = evaluarRegistroConsumo(cfg, { usuarioId: 'u-luz' }, { acumulado: 100, monto: 80 });
assert.equal(tope.ok, false);
assert.equal(tope.motivo, 'limite');
assert.equal(tope.disponible, 50);
assert.match(tope.error, /excede el límite permitido/);
assert.match(tope.error, /150\.00/);
assert.equal(evaluarRegistroConsumo(cfg, { usuarioId: 'u-luz' }, { acumulado: 100, monto: 40 }).ok, true);
assert.equal(evaluarLimiteConsumo({ limite: 150, acumulado: 100, monto: 40 }).ok, true);
assert.equal(evaluarLimiteConsumo({ limite: null, acumulado: 999, monto: 1 }).ok, true);
assert.equal(evaluarLimiteConsumo({ limite: 0, acumulado: 0, monto: 1, nombre: 'Ana' }).ok, false);

const aviso = {
  tipo: TIPO_NOTIF_CONSUMO_LIMITE,
  ref_id: 'u-luz',
  titulo: 'Consumo no aprobado',
  mensaje: 'Luz Zazueta no tiene consumo aprobado. Su consumo excedió el límite.',
};
assert.equal(notificacionConsumoLimiteParaUsuario(aviso, { id: 'u-luz', nombre: 'Otra' }), true);
assert.equal(notificacionConsumoLimiteParaUsuario(aviso, { id: 'caja', nombre: 'Luz Zazueta' }), true);
assert.equal(notificacionConsumoLimiteParaUsuario(aviso, { id: 'caja', nombre: 'Ana Ruiz' }), false);

const local = { empleados: { a: { id: 'a', nombre: 'Frania' } } };
const vacio = { empleados: {} };
const remoto = { empleados: { a: { id: 'a', nombre: 'Frania', limite: 100 } } };
assert.equal(debeTomarCandadoRemoto(local, vacio, { localAt: '2026-11-21T01:00:00Z', remotoAt: '2026-11-21T00:00:00Z' }), false);
assert.equal(debeTomarCandadoRemoto(vacio, remoto, { localAt: null, remotoAt: '2026-11-21T01:00:00Z' }), true);
assert.equal(debeTomarCandadoRemoto(local, remoto, { localAt: '2026-11-21T02:00:00Z', remotoAt: '2026-11-21T01:00:00Z' }), false);

const sinFrania = quitarEmpleadoCandadoConsumo(cfg, 'u-luz');
assert.equal(sinFrania.empleados['u-luz'], undefined);
assert.equal(sinFrania.empleados['u-gaby'].nombre, 'Gabriela Janette');
assert.equal(evaluarLimiteConsumo({
  limite: configEmpleadoConsumo(sinFrania, { usuarioId: 'u-luz' })?.limite ?? null,
  acumulado: 0,
  monto: 500,
}).ok, true);

console.log('candadoCancelarConsumo.test.mjs ok');
