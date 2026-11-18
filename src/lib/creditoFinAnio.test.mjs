import assert from 'node:assert/strict';
import { puedeAccionVentaRuta, subcomandosVentaRutaVisibles } from './ventaEnRutaAcciones.js';
import {
  TIPO_DEJAR,
  TIPO_RETIRAR,
  inventarioDeMovimientos,
  creditoPendienteTrasRecoleccion,
  armarRegistroLiquidacion,
  cerrarLiquidacionFinAnio,
  cuentaAbiertaDeTienda,
  desgloseLiquidacion,
  detalleLiquidacion,
  liquidacionEnCurso,
  registrarAbonoFinAnio,
  inventarioPorSucursal,
  nombreCuentaFinAnio,
  planLiquidacion,
  saldosTarjetas,
  tiendasDeLaSesion,
  totalAntesDeLiquidar,
  totalTarjetas,
  resumenCuenta,
  resumenPorSucursal,
  codigoVisibleProducto,
  productoParaCargarFinAnio,
  sugerenciasCatalogoFinAnio,
  validarAbono,
  validarDejar,
  validarRetiro,
} from './creditoFinAnio.js';

const movs = [
  { tipo: TIPO_DEJAR, codigo: 'A1', nombre: 'Coca', cantidad: 10, importe: 200, cuenta_id: 'c1' },
  { tipo: TIPO_DEJAR, codigo: 'A1', nombre: 'Coca', cantidad: 5, importe: 100, cuenta_id: 'c1' },
  { tipo: TIPO_RETIRAR, codigo: 'A1', nombre: 'Coca', cantidad: 4, importe: 80, cuenta_id: 'c1' },
  { tipo: TIPO_DEJAR, codigo: 'B2', nombre: 'Agua', cantidad: 2, importe: 40, cuenta_id: 'c1', archived_at: '2026-01-01' },
];
const abonos = [
  { cuenta_id: 'c1', monto: 50 },
  { cuenta_id: 'c1', monto: 999, archived_at: '2026-01-01' },
];

const inv = inventarioDeMovimientos(movs);
assert.equal(inv.length, 1);
assert.equal(inv[0].cantidad, 11);
assert.equal(inv[0].valor, 220);

const res = resumenCuenta(movs, abonos);
assert.equal(res.dejado, 300);
assert.equal(res.retirado, 80);
assert.equal(res.saldoMercancia, 220);
assert.equal(res.abonado, 50);
assert.equal(res.saldo, 170);

const porSuc = resumenPorSucursal(
  [
    { id: 'c1', sucursal_id: '3b2', estado: 'abierta' },
    { id: 'c2', sucursal_id: '3B2', estado: 'cerrada' },
  ],
  [...movs, { tipo: TIPO_DEJAR, nombre: 'Sal', cantidad: 1, importe: 10, cuenta_id: 'c2' }],
  abonos,
);
const s3 = porSuc.get('3B2');
assert.equal(s3.cuentas, 2);
assert.equal(s3.abiertas, 1);
assert.equal(s3.saldoMercancia, 230);
assert.equal(s3.saldo, 180);

const invSuc = inventarioPorSucursal(
  [
    { id: 'c1', sucursal_id: '3b2' },
    { id: 'c2', sucursal_id: '3B2' },
  ],
  [...movs, { tipo: TIPO_DEJAR, codigo: 'S1', nombre: 'Sal', cantidad: 1, importe: 10, cuenta_id: 'c2' }],
);
const lineas3 = invSuc.get('3B2');
assert.equal(lineas3.length, 2);
assert.equal(lineas3.find((l) => l.nombre === 'Coca').cantidad, 11);
assert.equal(lineas3.find((l) => l.nombre === 'Sal').cantidad, 1);
assert.equal(invSuc.has('FUSION'), false);

const tiendas = ['FUSION', '3B2'];
const cuentasLiq = [
  { id: 'c1', sucursal_id: 'FUSION', estado: 'abierta' },
  { id: 'c2', sucursal_id: '3B2', estado: 'abierta' },
];
const movsLiq = [
  { tipo: TIPO_DEJAR, codigo: '93', nombre: 'Escupidor', cantidad: 4, importe: 400, cuenta_id: 'c1' },
  { tipo: TIPO_DEJAR, codigo: '80', nombre: 'Paloma', cantidad: 10, importe: 100, cuenta_id: 'c2' },
];
const abonosLiq = [{ cuenta_id: 'c1', monto: 50 }];
const tarjetas = saldosTarjetas(tiendas, cuentasLiq, movsLiq, abonosLiq);
assert.equal(tarjetas.find((t) => t.sucursalId === 'FUSION').total, 350);
assert.equal(tarjetas.find((t) => t.sucursalId === '3B2').total, 100);
const total = totalTarjetas(tarjetas);
assert.equal(total, 450);
assert.deepEqual(tiendasDeLaSesion(['FUSION', '3B3', '3B2', 'RUTA'], '3B3').tiendas, ['3B3']);
assert.equal(tiendasDeLaSesion(['FUSION', '3B3'], '3B3').soloSuTienda, true);
assert.equal(tiendasDeLaSesion(['FUSION', '3B3'], 'MAIN').soloSuTienda, false);
assert.deepEqual(tiendasDeLaSesion(['FUSION', '3B3'], 'MAIN').tiendas, ['FUSION', '3B3']);
assert.equal(totalAntesDeLiquidar(1000, 480), 1480);
assert.equal(totalAntesDeLiquidar(1000, 0), 1000);
assert.equal(creditoPendienteTrasRecoleccion(total, 150), 300);
const plan = planLiquidacion({
  tiendas, cuentas: cuentasLiq, movimientos: movsLiq, abonos: abonosLiq, monto: 400,
});
assert.equal(plan.ok, true);
assert.equal(plan.partes[0].sucursalId, 'FUSION');
assert.equal(plan.partes[0].monto, 350);
assert.equal(plan.partes[1].sucursalId, '3B2');
assert.equal(plan.partes[1].monto, 50);
assert.equal(plan.pendiente, 50);
assert.equal(plan.pendiente, Math.round((total - plan.aplicado) * 100) / 100);
const reg = armarRegistroLiquidacion({
  aplicado: plan.aplicado,
  pendiente: plan.pendiente,
  total: plan.total,
  partes: plan.partes,
  user: { nombre: 'Administrador principal' },
});
assert.equal(reg.monto, 400);
assert.equal(reg.pendiente, 50);
assert.equal(reg.total_antes, 450);
assert.equal(reg.created_by, 'Administrador principal');
assert.equal(detalleLiquidacion(reg.detalle).reduce((s, p) => s + p.monto, 0), 400);

const liqCurso = { id: 'L1', estado: 'abierta' };
const desglose = desgloseLiquidacion(liqCurso, [
  { id: 'a1', liquidacion_id: 'L1', cuenta_id: 'c1', monto: 100, created_at: '2026-11-17T18:00:00Z' },
  { id: 'a2', liquidacion_id: 'L1', cuenta_id: 'c1', monto: 50 },
  { id: 'a3', liquidacion_id: 'L1', cuenta_id: 'c2', monto: 40 },
  { id: 'a4', liquidacion_id: 'L2', cuenta_id: 'c1', monto: 999 },
], [
  { id: 'c1', sucursal_id: 'FUSION' },
  { id: 'c2', sucursal_id: '3B3' },
]);
assert.equal(desglose.find((t) => t.sucursal_id === 'FUSION').monto, 150);
assert.equal(desglose.find((t) => t.sucursal_id === 'FUSION').abonos.length, 2);
assert.equal(desglose.find((t) => t.sucursal_id === '3B3').monto, 40);
assert.equal(liquidacionEnCurso([{ id: 'c', estado: 'cerrada' }, { id: 'a', estado: 'abierta' }]).id, 'a');
assert.equal(liquidacionEnCurso([{ id: 'c', estado: 'cerrada' }]), null);
assert.equal(liquidacionEnCurso([{ id: 'vieja', monto: 90 }]), null);
assert.equal(liquidacionEnCurso([{ id: 'vacia', monto: 0 }]).id, 'vacia');

assert.match(planLiquidacion({
  tiendas, cuentas: cuentasLiq, movimientos: movsLiq, abonos: abonosLiq, monto: 999,
}).error, /no puede ser mayor/);

assert.equal(validarDejar({ nombre: '', cantidad: 1, precio: 1 }), 'Escribe el producto.');
assert.equal(validarDejar({ nombre: 'Sal', cantidad: 0, precio: 1 }), 'La cantidad debe ser mayor a cero.');
assert.equal(validarDejar({ nombre: 'Sal', cantidad: 1, precio: -1 }), 'El precio no puede ser negativo.');
assert.equal(validarDejar({ nombre: 'Sal', cantidad: 1, precio: 0 }), '');
assert.match(validarRetiro({ cantidad: 5, disponible: 4 }), /No hay tanta/);
assert.equal(validarRetiro({ cantidad: 4, disponible: 4 }), '');
assert.match(validarAbono(0), /mayor a cero/);
assert.equal(nombreCuentaFinAnio(new Date('2026-11-18T03:00:00Z')), 'Fin de año 2026');

const catalogo = [
  { id: '93', nombre: 'Escupidor de batalla', precio: 25 },
  { id: '7501', nombre: 'Emperador Zenzo Chocotella 93g', precio: 18 },
  { id: '7502', nombre: 'MADALENAS BIMBO 93G', precio: 20 },
  { id: '7503', nombre: 'Paloma', precio: 10, codigos_alt: ['93A'] },
];
const por93 = sugerenciasCatalogoFinAnio(catalogo, '93');
assert.equal(por93.length, 1);
assert.equal(por93[0].id, '93');
assert.equal(productoParaCargarFinAnio(catalogo, '93')?.nombre, 'Escupidor de batalla');
assert.equal(codigoVisibleProducto(por93[0]), '93');
assert.equal(productoParaCargarFinAnio(catalogo, 'emperador'), null);
const porNombre = sugerenciasCatalogoFinAnio(catalogo, 'bimbo');
assert.equal(porNombre.length, 1);
assert.equal(porNombre[0].id, '7502');
assert.equal(productoParaCargarFinAnio(catalogo, '93A')?.id, '7503');

assert.equal(puedeAccionVentaRuta('Administrador', '1', 'ruta_fin_anio'), true);
assert.equal(puedeAccionVentaRuta('Gerente', '2', 'ruta_fin_anio'), false);
assert.equal(puedeAccionVentaRuta('Cajero', '3', 'ruta_fin_anio'), false);
assert.equal(puedeAccionVentaRuta('Cajero', '3', 'ruta_fin_anio_abono'), false);
assert.equal(puedeAccionVentaRuta('Repartidor', '4', 'ruta_fin_anio'), false);
assert.equal(puedeAccionVentaRuta('Repartidor', '4', 'ruta_fin_anio_abono'), false);
assert.equal(puedeAccionVentaRuta('Repartidor', '4', 'ruta_fin_anio_mercancia'), false);
assert.equal(puedeAccionVentaRuta('Cajero', '3', 'ruta_fin_anio_mercancia'), false);
assert.ok(!subcomandosVentaRutaVisibles('Repartidor', '4').some((s) => s.id === 'ruta_fin_anio_mercancia'));
assert.ok(!subcomandosVentaRutaVisibles('Repartidor', '4').some((s) => s.id === 'ruta_fin_anio'));
assert.equal(puedeAccionVentaRuta('Gerente', '2', 'ruta_fin_anio_abono'), false);
assert.equal(puedeAccionVentaRuta('Administrador', '1', 'ruta_fin_anio_abono'), true);
assert.ok(!subcomandosVentaRutaVisibles('Administrador', '1').some((s) => s.id === 'ruta_fin_anio'));
assert.ok(!subcomandosVentaRutaVisibles('Cajero', '3').some((s) => s.id === 'ruta_fin_anio'));
assert.ok(!subcomandosVentaRutaVisibles('Cajero', '3').some((s) => s.id === 'ruta_fin_anio_abono'));

const cuentaCajero = cuentaAbiertaDeTienda(
  [
    { id: 'cerrada', sucursal_id: '3B3', estado: 'cerrada' },
    { id: 'chica', sucursal_id: '3B3', estado: 'abierta' },
    { id: 'grande', sucursal_id: '3B3', estado: 'abierta' },
    { id: 'otra', sucursal_id: 'FUSION', estado: 'abierta' },
  ],
  [
    { cuenta_id: 'chica', tipo: TIPO_DEJAR, importe: 100 },
    { cuenta_id: 'grande', tipo: TIPO_DEJAR, importe: 1000 },
    { cuenta_id: 'otra', tipo: TIPO_DEJAR, importe: 500 },
  ],
  [],
  '3B3',
);
assert.equal(cuentaCajero.id, 'grande');
assert.equal(cuentaAbiertaDeTienda([{ id: 'x', sucursal_id: '3B2', estado: 'cerrada' }], [], [], '3B2'), null);

function memoriaFinAnio() {
  const tables = {};
  let n = 1;
  return {
    tables,
    from(name) {
      const known = name.startsWith('credito_fin_anio_');
      if (!tables[name]) tables[name] = [];
      const rows = tables[name];
      const q = { filters: [], patch: null, inserted: null };
      const matched = () => rows.filter((r) => q.filters.every(([col, op, val]) => (
        op === 'is' ? r[col] == null : String(r[col]) === String(val)
      )));
      const chain = {
        select() { return chain; },
        is(col, val) { q.filters.push([col, 'is', val]); return chain; },
        order() { return chain; },
        eq(col, val) { q.filters.push([col, 'eq', val]); return chain; },
        limit() {
          return Promise.resolve(known ? { data: matched(), error: null } : { data: [], error: { message: 'no', code: '42P01' } });
        },
        insert(row) {
          if (!known) {
            q.inserted = { data: null, error: { message: 'relation does not exist', code: '42P01' } };
            return chain;
          }
          const src = Array.isArray(row) ? row[0] : row;
          const rec = { id: `id${n++}`, archived_at: null, created_at: new Date().toISOString(), ...src };
          rows.unshift(rec);
          q.inserted = { data: rec, error: null };
          return chain;
        },
        update(patch) { q.patch = patch; return chain; },
        single() {
          if (q.inserted) return Promise.resolve(q.inserted);
          const found = matched();
          if (q.patch) found.forEach((r) => Object.assign(r, q.patch));
          return Promise.resolve({ data: found[0] || null, error: found[0] ? null : { message: 'none' } });
        },
        then(resolve, reject) {
          if (q.inserted) return Promise.resolve(q.inserted).then(resolve, reject);
          const found = matched();
          if (q.patch) found.forEach((r) => Object.assign(r, q.patch));
          return Promise.resolve({ data: found, error: null }).then(resolve, reject);
        },
      };
      return chain;
    },
  };
}

const db = memoriaFinAnio();
const quien = { nombre: 'Admin' };
const cuentasMem = [
  { id: 'c1', sucursal_id: 'FUSION', estado: 'abierta' },
  { id: 'c2', sucursal_id: '3B2', estado: 'abierta' },
];
const movimientosMem = [
  { cuenta_id: 'c1', tipo: TIPO_DEJAR, importe: 300 },
  { cuenta_id: 'c2', tipo: TIPO_DEJAR, importe: 100 },
];
const primero = await registrarAbonoFinAnio(db, 'c1', {
  monto: 80, sucursalId: 'FUSION', tiendas, cuentas: cuentasMem, movimientos: movimientosMem, abonos: [],
}, quien);
const abonosTrasPrimero = db.tables.credito_fin_anio_abonos;
const segundo = await registrarAbonoFinAnio(db, 'c2', {
  monto: 40,
  sucursalId: '3B2',
  tiendas,
  cuentas: cuentasMem,
  movimientos: movimientosMem,
  abonos: [...abonosTrasPrimero],
}, quien);
assert.equal(primero.ok, true);
assert.equal(segundo.ok, true);
assert.equal(primero.liquidacionId, segundo.liquidacionId);
const linea = db.tables.credito_fin_anio_liquidaciones.find((r) => r.id === primero.liquidacionId);
assert.equal(linea.monto, 120);
assert.equal(linea.estado, 'abierta');
assert.equal(linea.pendiente, 280);
const tiendasLinea = desgloseLiquidacion(linea, db.tables.credito_fin_anio_abonos, cuentasMem);
assert.equal(tiendasLinea.find((t) => t.sucursal_id === 'FUSION').monto, 80);
assert.equal(tiendasLinea.find((t) => t.sucursal_id === '3B2').monto, 40);
const cierre = await cerrarLiquidacionFinAnio(db, linea.id);
assert.equal(cierre.ok, true);
const tercero = await registrarAbonoFinAnio(db, 'c1', {
  monto: 25,
  sucursalId: 'FUSION',
  tiendas,
  cuentas: cuentasMem,
  movimientos: movimientosMem,
  abonos: [...db.tables.credito_fin_anio_abonos],
}, quien);
assert.notEqual(tercero.liquidacionId, linea.id);
assert.equal(db.tables.credito_fin_anio_liquidaciones.find((r) => r.id === linea.id).monto, 120);
assert.equal(db.tables.credito_fin_anio_liquidaciones.find((r) => r.id === tercero.liquidacionId).monto, 25);

console.log('creditoFinAnio.test.mjs ok');
