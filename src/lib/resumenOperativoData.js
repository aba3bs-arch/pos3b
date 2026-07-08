import { consultarVentas } from './ventasQuery.js';
import { clasificarPago } from './corteCaja.js';
import { listarMovimientosInventario } from './consultasInventario.js';
import { costoUnitarioInventario, resumirValorInventario } from './valorInventario.js';
import { inventarioParaSucursal } from './inventarioMultitienda.js';
import { etiquetaTienda, esAlmacenCentral, listarSucursalesOperativas } from '../constants/sucursales.js';
import { rangoDesdePreset, PRESETS_FECHA_PRODUCTO } from './consultasInventario.js';
import { COLORES_TIENDA, sumaVentas, sumaGastos, estiloPastel } from './estadisticasData.js';
import { leerMetaVentasMes, claveMesActual } from './metaVentasMes.js';

export { PRESETS_FECHA_PRODUCTO, rangoDesdePreset, estiloPastel, COLORES_TIENDA };

function toDateStart(ymd) {
  return new Date(`${ymd}T00:00:00`);
}

function toDateEnd(ymd) {
  return new Date(`${ymd}T23:59:59.999`);
}

function hoyYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function inicioMesYmd(fecha = new Date()) {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-01`;
}

function diasEnMes(fecha = new Date()) {
  return new Date(fecha.getFullYear(), fecha.getMonth() + 1, 0).getDate();
}

function diaDelMes(fecha = new Date()) {
  return fecha.getDate();
}

function filtrarTienda(rows, sucursal, campo = 'sucursal_id') {
  if (!sucursal) return (rows || []).filter((r) => !esAlmacenCentral(r[campo]));
  return (rows || []).filter((r) => r[campo] === sucursal);
}

function mapaTiendaInit(tiendas) {
  const m = {};
  for (const t of tiendas) m[t] = { id: t, label: etiquetaTienda(t) };
  return m;
}

export function resumirVentasPorTiendaPago(ventas, tiendas) {
  const base = mapaTiendaInit(tiendas);
  for (const t of tiendas) {
    base[t] = { ...base[t], total: 0, efectivo: 0, tarjeta: 0, electronico: 0, tickets: 0 };
  }
  for (const v of ventas || []) {
    const t = v.sucursal_id;
    if (!base[t]) continue;
    const monto = Number(v.total) || 0;
    base[t].total += monto;
    base[t].tickets += 1;
    const g = clasificarPago(v.metodo_pago);
    if (g === 'efectivo') base[t].efectivo += monto;
    else if (g === 'tarjeta') base[t].tarjeta += monto;
    else base[t].electronico += monto;
  }
  return Object.values(base).sort((a, b) => b.total - a.total);
}

export function ticketPromedioGlobal(ventas) {
  const n = (ventas || []).length;
  if (!n) return 0;
  return sumaVentas(ventas) / n;
}

export function resumirInventarioPorTienda(inventario, tiendas) {
  return tiendas.map((suc, i) => {
    const items = inventarioParaSucursal(inventario, suc);
    const res = resumirValorInventario(items);
    return {
      id: suc,
      label: etiquetaTienda(suc),
      valorVenta: res.valorVenta,
      valorCosto: res.valorCosto,
      unidades: res.unidades,
      skus: res.skusConStock,
      color: COLORES_TIENDA[i % COLORES_TIENDA.length],
    };
  });
}

export function resumirMermaPorTienda(movimientos, inventario, tiendas) {
  const cat = Object.fromEntries((inventario || []).map((p) => [String(p.id), p]));
  const porTienda = {};
  for (const t of tiendas) porTienda[t] = { id: t, label: etiquetaTienda(t), unidades: 0, valor: 0 };

  for (const m of movimientos || []) {
    if (m.tipo !== 'retiro') continue;
    const suc = m.sucursal || m.sucursal_operacion;
    if (!suc || !porTienda[suc]) continue;
    const qty = Math.abs(Number(m.cantidad) || 0);
    const prod = cat[String(m.producto_id)];
    const costo = prod ? costoUnitarioInventario(prod) : 0;
    porTienda[suc].unidades += qty;
    porTienda[suc].valor += qty * costo;
  }

  return Object.values(porTienda).map((row, i) => {
    const inv = resumirValorInventario(inventarioParaSucursal(inventario, row.id));
    const base = inv.valorCosto || 1;
    return {
      ...row,
      inventarioCosto: inv.valorCosto,
      pct: base > 0 ? (row.valor / base) * 100 : 0,
      color: COLORES_TIENDA[i % COLORES_TIENDA.length],
    };
  });
}

export function resumirIncidencias(incidencias) {
  const porEstado = {};
  const porCategoria = {};
  const porTienda = {};
  for (const inc of incidencias || []) {
    const est = inc.estado || 'sin_estado';
    const cat = inc.categoria || 'sin_categoria';
    const suc = inc.sucursal_id || 'MAIN';
    porEstado[est] = (porEstado[est] || 0) + 1;
    porCategoria[cat] = (porCategoria[cat] || 0) + 1;
    porTienda[suc] = (porTienda[suc] || 0) + 1;
  }
  return {
    total: (incidencias || []).length,
    porEstado: Object.entries(porEstado).map(([id, count]) => ({ id, label: id.replace(/_/g, ' '), count })),
    porCategoria: Object.entries(porCategoria).map(([id, count]) => ({ id, label: id.replace(/_/g, ' '), count })),
    porTienda: Object.entries(porTienda)
      .map(([id, count]) => ({ id, label: etiquetaTienda(id), count }))
      .sort((a, b) => b.count - a.count),
  };
}

export function agruparGastosRtPorTienda(rows) {
  const map = {};
  for (const g of rows || []) {
    const raw = g.sucursal_origen || 'Oficina';
    const t = listarSucursalesOperativas().find((s) => etiquetaTienda(s) === raw || s === raw) || raw;
    map[t] = (map[t] || 0) + (Number(g.monto) || 0);
  }
  return Object.entries(map)
    .map(([id, total], i) => ({
      id,
      label: typeof id === 'string' && id.length <= 6 ? etiquetaTienda(id) : id,
      total,
      color: COLORES_TIENDA[i % COLORES_TIENDA.length],
    }))
    .sort((a, b) => b.total - a.total);
}

export function calcularProyeccionMes(ventasMes, meta, fecha = new Date()) {
  const acumulado = sumaVentas(ventasMes);
  const dia = diaDelMes(fecha);
  const dias = diasEnMes(fecha);
  const proyeccion = dia > 0 ? (acumulado / dia) * dias : 0;
  const pctMetaAcum = meta > 0 ? (acumulado / meta) * 100 : null;
  const pctMetaProy = meta > 0 ? (proyeccion / meta) * 100 : null;
  return { acumulado, proyeccion, dia, dias, meta, pctMetaAcum, pctMetaProy };
}

export function serieBarras(items, campo = 'total', maxOverride) {
  const max = maxOverride || Math.max(...items.map((x) => Number(x[campo]) || 0), 1);
  return items.map((x) => ({
    ...x,
    pctBar: ((Number(x[campo]) || 0) / max) * 100,
  }));
}

export function pastelDesdeMapa(map, labelFn = (k) => k) {
  const list = Object.entries(map).map(([id, total]) => ({ id, label: labelFn(id), total }));
  list.sort((a, b) => b.total - a.total);
  const sum = list.reduce((a, x) => a + x.total, 0) || 1;
  let start = 0;
  return list.map((x, i) => {
    const pct = (x.total / sum) * 100;
    const slice = { ...x, pct, color: COLORES_TIENDA[i % COLORES_TIENDA.length], pieStart: start, pieEnd: start + pct };
    start += pct;
    return slice;
  });
}

export async function cargarResumenOperativo(supabase, { desde, hasta, sucursal, inventario = [] }) {
  if (!supabase) return { ok: false, error: 'Sin conexión' };

  const tiendas = listarSucursalesOperativas();
  const desdeDt = toDateStart(desde);
  const hastaDt = toDateEnd(hasta);
  const hoy = hoyYmd();
  const mesIni = inicioMesYmd();
  const mesClave = claveMesActual();

  const ventasRes = await consultarVentas(supabase, {
    columns: 'total,created_at,sucursal_id,metodo_pago',
    desde: toDateStart(mesIni),
    hasta: hastaDt,
    sucursal: sucursal || null,
    limit: 8000,
    orderAsc: true,
  });

  const ventasPeriodoRes = await consultarVentas(supabase, {
    columns: 'total,created_at,sucursal_id,metodo_pago',
    desde: desdeDt,
    hasta: hastaDt,
    sucursal: sucursal || null,
    limit: 8000,
    orderAsc: true,
  });

  const ventasHoyRes = await consultarVentas(supabase, {
    columns: 'total,created_at,sucursal_id,metodo_pago',
    desde: toDateStart(hoy),
    hasta: toDateEnd(hoy),
    sucursal: sucursal || null,
    limit: 2000,
  });

  let gastosCortes = [];
  let gastosRt = [];
  let incidencias = [];
  let compras = [];
  let nomina = [];
  let cubreTurnos = [];
  const errores = [];

  try {
    let q = supabase
      .from('cortes_contabilidad_gastos')
      .select('monto,created_at,sucursal_id,modulo,categoria')
      .gte('created_at', desdeDt.toISOString())
      .lte('created_at', hastaDt.toISOString());
    if (sucursal) q = q.eq('sucursal_id', sucursal);
    const { data, error } = await q.limit(4000);
    if (error) errores.push(error.message);
    else gastosCortes = data || [];
  } catch (e) {
    errores.push(String(e.message || e));
  }

  try {
    let q = supabase
      .from('transito_efectivo')
      .select('monto,sucursal_origen,fecha_liquidacion,descripcion_gasto')
      .eq('tipo_movimiento', 'Gasto')
      .eq('estatus', 'Liquidado')
      .gte('fecha_liquidacion', desdeDt.toISOString())
      .lte('fecha_liquidacion', hastaDt.toISOString());
    const { data, error } = await q.limit(2000);
    if (error) errores.push(error.message);
    else gastosRt = data || [];
  } catch (e) {
    errores.push(String(e.message || e));
  }

  try {
    let q = supabase
      .from('pos_incidencias')
      .select('id,estado,categoria,sucursal_id,created_at')
      .gte('created_at', desdeDt.toISOString())
      .lte('created_at', hastaDt.toISOString());
    if (sucursal) q = q.eq('sucursal_id', sucursal);
    const { data, error } = await q.limit(3000);
    if (error) errores.push(error.message);
    else incidencias = data || [];
  } catch (e) {
    errores.push(String(e.message || e));
  }

  try {
    let q = supabase
      .from('compras')
      .select('total,sucursal_id,estado,created_at,proveedor_nombre')
      .eq('estado', 'recibida')
      .gte('created_at', desdeDt.toISOString())
      .lte('created_at', hastaDt.toISOString());
    if (sucursal) q = q.eq('sucursal_id', sucursal);
    const { data, error } = await q.limit(2000);
    if (error) errores.push(error.message);
    else compras = data || [];
  } catch (e) {
    errores.push(String(e.message || e));
  }

  try {
    const { data, error } = await supabase
      .from('nomina_periodos')
      .select('id,total,periodo_inicio,periodo_fin,estado')
      .lte('periodo_inicio', hasta)
      .gte('periodo_fin', desde)
      .limit(50);
    if (error) errores.push(error.message);
    else nomina = data || [];
  } catch (e) {
    errores.push(String(e.message || e));
  }

  try {
    let q = supabase
      .from('logins')
      .select('id,created_at,sucursal,evento')
      .eq('evento', 'CUBRE_TURNO')
      .gte('created_at', desdeDt.toISOString())
      .lte('created_at', hastaDt.toISOString());
    if (sucursal) q = q.eq('sucursal', sucursal);
    const { data, error } = await q.limit(2000);
    if (error) errores.push(error.message);
    else cubreTurnos = data || [];
  } catch (e) {
    /* logins opcional */
  }

  const ventasMes = filtrarTienda(ventasRes.data || []);
  const ventasPeriodo = filtrarTienda(ventasPeriodoRes.data || []);
  const ventasHoy = filtrarTienda(ventasHoyRes.data || []);
  gastosCortes = filtrarTienda(gastosCortes);
  incidencias = filtrarTienda(incidencias);
  compras = filtrarTienda(compras);

  const tiendasVista = sucursal ? [sucursal] : tiendas;
  const meta = leerMetaVentasMes(sucursal || '', new Date(`${mesClave}-01`));
  const proyeccion = calcularProyeccionMes(ventasMes, meta);

  const movimientos = listarMovimientosInventario({ desde, hasta, sucursal: sucursal || undefined, tipo: 'retiro' });

  const totalVentasPeriodo = sumaVentas(ventasPeriodo);
  const totalVentasHoy = sumaVentas(ventasHoy);
  const totalGastosCortes = sumaGastos(gastosCortes);
  const totalGastosRt = sumaGastos(gastosRt);
  const totalCompras = compras.reduce((a, c) => a + (Number(c.total) || 0), 0);
  const totalNomina = nomina.reduce((a, n) => a + (Number(n.total) || 0), 0);
  const totalEgresos = totalGastosCortes + totalGastosRt + totalCompras + totalNomina;
  const gananciaNeta = totalVentasPeriodo - totalEgresos;

  const gastosComparativa = pastelDesdeMapa(
    {
      'Cortes contabilidad': totalGastosCortes,
      'Gastos recolectores (RT)': totalGastosRt,
      'Compras proveedores': totalCompras,
      Nómina: totalNomina,
    },
    (k) => k,
  );

  return {
    ok: true,
    mesClave,
    ventasMes,
    ventasPeriodo,
    ventasHoy,
    gastosCortes,
    gastosRt,
    incidencias,
    compras,
    nomina,
    cubreTurnos,
    meta,
    proyeccion,
    tiendasVista,
    ventasPorTienda: resumirVentasPorTiendaPago(ventasPeriodo, tiendasVista),
    inventarioPorTienda: resumirInventarioPorTienda(inventario, tiendasVista),
    mermaPorTienda: resumirMermaPorTienda(movimientos, inventario, tiendasVista),
    gastosRtPorTienda: agruparGastosRtPorTienda(gastosRt),
    incidenciasResumen: resumirIncidencias(incidencias),
    ticketPromedio: ticketPromedioGlobal(ventasPeriodo),
    totales: {
      ventasPeriodo: totalVentasPeriodo,
      ventasHoy: totalVentasHoy,
      gastosCortes: totalGastosCortes,
      gastosRt: totalGastosRt,
      compras: totalCompras,
      nomina: totalNomina,
      egresos: totalEgresos,
      gananciaNeta,
      cubreTurnos: cubreTurnos.length,
    },
    gastosComparativa,
    errores,
    aviso: ventasRes.aviso,
  };
}
