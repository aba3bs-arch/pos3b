import test from 'node:test';
import assert from 'node:assert/strict';
import { consolidarRuta } from '../consolidacionRuta.js';
import { construirHallazgos, ordenarAlertas } from './motor.js';
import { planificarSincronizacion, validarCambioEstado } from './plan.js';

const AHORA = new Date('2026-10-27T20:00:00Z');
const venta = {
  id: 'v1', carga_id: 'c1', folio: 'VR-123-M', cliente_tipo: 'sucursal', cliente_id: 'Fusión', cliente_nombre: 'Fusión',
  metodo_pago: 'mixto', total: 100, created_at: '2026-10-25T10:00:00Z', vendedor_nombre: 'Luis', compra_id: 'pedido1',
  articulos: [{ producto_id: 'p1', nombre: 'Arroz', cantidad: 5 }, { _pago_mixto: true, efectivo: 40, credito: 60 }],
};
const base = () => ({
  ventas: [venta], cargas: [{ id: 'c1', vendedor_id: 'u1', vendedor_nombre: 'Luis' }],
  compras: [{ id: 'pedido1', sucursal_id: 'Fusión', estado: 'recibida' }],
  movimientos: [{ id: 'm1', tipo: 'entrada', sucursal_id: 'Fusión', producto_id: 'p1', cantidad: 5, meta: { compra_id: 'pedido1' } }],
  gastos: [{ id: 'g1', categoria: 'PROVEEDORES', sucursal_id: 'FUSION', comentario: 'Venta VR-123-ME', monto: 40 }],
  cxc: [{ id: 'cargo1', venta_id: 'v1', tipo: 'cargo', monto: 60, estatus: 'pendiente' }],
  transitos: [{ id: 't1', num_traspaso: 'VR-123-ME', monto: 40, tipo_movimiento: 'Venta Ruta', estatus: 'En Tránsito' }],
});
const hallazgosDe = (data) => construirHallazgos(consolidarRuta(data).entregas, { ahora: AHORA });

test('venta que cuadra no genera hallazgos', () => {
  const { hallazgos, enProceso } = hallazgosDe(base());
  assert.deepEqual(hallazgos, []);
  assert.deepEqual(enProceso, []);
});

test('gasto de Abarrotes distinto al efectivo es crítico y normaliza la tienda', () => {
  const data = base(); data.gastos[0].monto = 25;
  const { hallazgos: [h] } = hallazgosDe(data);
  assert.equal(h.control, 'C2'); assert.equal(h.severidad, 'critica');
  assert.equal(h.sucursal_id, 'FUSION');
  assert.deepEqual([h.esperado, h.registrado, h.diferencia, h.unidad], [40, 25, -15, 'MXN']);
  assert.equal(h.venta_folio, 'VR-123-M');
});

test('crédito sin cargo es crítico (C5)', () => {
  const data = base(); data.cxc = [];
  const h = hallazgosDe(data).hallazgos.find((x) => x.control === 'C5');
  assert.equal(h.severidad, 'critica'); assert.equal(h.diferencia, -60);
});

test('mercancía faltante en la recepción es C9 en piezas', () => {
  const data = base(); data.movimientos[0].cantidad = 3;
  const h = hallazgosDe(data).hallazgos.find((x) => x.control === 'C9');
  assert.deepEqual([h.esperado, h.registrado, h.unidad], [5, 3, 'pzas']);
});

test('recepción pendiente dentro de la ventana de gracia queda en proceso, sin alerta', () => {
  const data = base(); data.compras[0].estado = 'pedido'; data.movimientos = []; data.gastos = [];
  data.ventas = [{ ...venta, created_at: '2026-10-27T15:00:00Z' }];
  const { hallazgos, enProceso } = hallazgosDe(data);
  assert.deepEqual(hallazgos, []);
  assert.ok(enProceso.some((x) => x.mensaje === 'Recepción pendiente'));
});

test('recepción pendiente pasada la ventana alerta y sube a alta tras el doble de la ventana', () => {
  const data = base(); data.compras[0].estado = 'pedido'; data.movimientos = []; data.gastos = [];
  const normal = hallazgosDe(data).hallazgos;
  assert.ok(normal.some((h) => h.control === 'C2' && h.severidad === 'critica'));
  assert.equal(normal.find((h) => h.mensaje === 'Recepción pendiente').severidad, 'alta');
  data.ventas = [{ ...venta, created_at: '2026-10-26T12:00:00Z' }];
  assert.equal(hallazgosDe(data).hallazgos.find((h) => h.mensaje === 'Recepción pendiente').severidad, 'media');
});

test('texto desconocido se clasifica como C0 y no se pierde', () => {
  const { hallazgos: [h] } = construirHallazgos([{ id: 'x', folio: 'F', fecha: '2026-10-20T00:00:00Z', alertas: ['Algo nuevo'], productos: [] }], { ahora: AHORA });
  assert.equal(h.control, 'C0'); assert.equal(h.severidad, 'media');
});

test('la clave es estable entre corridas', () => {
  const data = base(); data.gastos[0].monto = 25;
  assert.equal(hallazgosDe(data).hallazgos[0].clave, hallazgosDe(data).hallazgos[0].clave);
});

const guardada = (h, extra = {}) => ({ id: `a-${h.clave}`, ...h, estado: 'abierta', ultima_vez_at: AHORA.toISOString(), ...extra });

test('sincronización: primera corrida inserta y marca críticas nuevas', () => {
  const data = base(); data.gastos[0].monto = 25;
  const { hallazgos } = hallazgosDe(data);
  const plan = planificarSincronizacion({ hallazgos, ventasRevisadas: ['v1'], ahora: AHORA });
  assert.equal(plan.insertar.length, hallazgos.length);
  assert.equal(plan.nuevasCriticas.length, 1);
});

test('sincronización idempotente: repetir la corrida no inserta ni actualiza ni vuelve a avisar', () => {
  const data = base(); data.gastos[0].monto = 25;
  const { hallazgos } = hallazgosDe(data);
  const plan = planificarSincronizacion({ existentes: hallazgos.map((h) => guardada(h)), hallazgos, ventasRevisadas: ['v1'], ahora: AHORA });
  assert.deepEqual([plan.insertar.length, plan.actualizar.length, plan.autoResolver.length, plan.nuevasCriticas.length], [0, 0, 0, 0]);
});

test('alerta que ya cuadra se auto-resuelve solo si la corrida fue completa', () => {
  const data = base(); data.gastos[0].monto = 25;
  const { hallazgos } = hallazgosDe(data);
  const existentes = hallazgos.map((h) => guardada(h));
  const completa = planificarSincronizacion({ existentes, hallazgos: [], ventasRevisadas: ['v1'], ahora: AHORA });
  assert.equal(completa.autoResolver.length, 1);
  const incompleta = planificarSincronizacion({ existentes, hallazgos: [], ventasRevisadas: ['v1'], completa: false, ahora: AHORA });
  assert.equal(incompleta.autoResolver.length, 0);
  const otraVenta = planificarSincronizacion({ existentes, hallazgos: [], ventasRevisadas: ['v9'], ahora: AHORA });
  assert.equal(otraVenta.autoResolver.length, 0);
});

test('justificada se respeta; si cambia el importe se reabre; resuelta que reaparece se reabre', () => {
  const data = base(); data.gastos[0].monto = 25;
  const [h] = hallazgosDe(data).hallazgos;
  const justificada = guardada(h, { estado: 'justificada' });
  assert.equal(planificarSincronizacion({ existentes: [justificada], hallazgos: [h], ventasRevisadas: ['v1'], ahora: AHORA }).actualizar.length, 0);
  const otro = { ...h, registrado: 10, diferencia: -30 };
  const reabre = planificarSincronizacion({ existentes: [justificada], hallazgos: [otro], ventasRevisadas: ['v1'], ahora: AHORA });
  assert.equal(reabre.actualizar[0].patch.estado, 'abierta');
  const resuelta = guardada(h, { estado: 'resuelta' });
  const re = planificarSincronizacion({ existentes: [resuelta], hallazgos: [h], ventasRevisadas: ['v1'], ahora: AHORA });
  assert.equal(re.actualizar[0].patch.estado, 'abierta'); assert.equal(re.nuevasCriticas.length, 1);
});

test('permisos: crítica solo Administrador, justificar exige nota, Gerente gestiona no críticas', () => {
  assert.match(validarCambioEstado({ estado: 'resuelta', nota: 'corregido', rol: 'Gerente', severidad: 'critica' }), /administrador/i);
  assert.equal(validarCambioEstado({ estado: 'resuelta', nota: 'corregido en caja', rol: 'Administrador', severidad: 'critica' }), null);
  assert.match(validarCambioEstado({ estado: 'justificada', nota: 'ok', rol: 'Administrador', severidad: 'alta' }), /nota/i);
  assert.equal(validarCambioEstado({ estado: 'en_revision', rol: 'Gerente', severidad: 'alta' }), null);
  assert.match(validarCambioEstado({ estado: 'en_revision', rol: 'Auditor', severidad: 'media' }), /permiso/i);
  assert.equal(validarCambioEstado({ estado: 'xx', rol: 'Administrador', severidad: 'baja' }), 'Estado no válido.');
});

test('ordenarAlertas: crítica primero y luego la más reciente', () => {
  const r = ordenarAlertas([
    { id: 1, severidad: 'media', ultima_vez_at: '2026-10-27' }, { id: 2, severidad: 'critica', ultima_vez_at: '2026-10-01' },
    { id: 3, severidad: 'critica', ultima_vez_at: '2026-10-20' },
  ]);
  assert.deepEqual(r.map((a) => a.id), [3, 2, 1]);
});
