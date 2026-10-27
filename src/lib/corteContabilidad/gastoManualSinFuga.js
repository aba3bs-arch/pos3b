import { equivalentesCodigoTienda, normalizarCodigoTienda } from '../../constants/sucursales.js';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function norm(s) {
  return String(s || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const CATEGORIAS_EXENTAS = /(EMPLEADO|VALE|INVERSION|ENVIO MAIN|NOMINA|CUBRE|CONSUMO|ANTICIPO|FALTANTE|RECARGA)/;

const RE_MERCANCIA_MANUAL =
  /(CIGARR|MARLBORO|MALBORO|PALL\s?MALL|SMOKING|VENTA EN RUTA|RECOLECTOR|MERCANCIA|PROVEEDOR)/;

export function categoriaGastoExentaValidacionFuga(categoria) {
  const cat = norm(categoria);
  if (!cat) return false;
  if (cat.includes('PROVEEDOR')) return true;
  return CATEGORIAS_EXENTAS.test(cat);
}

/**
 * Gasto manual de Abarrotes que en realidad es mercancía / venta en ruta
 * capturado como «gastos operativos / otros» para saltarse Compras (fuga).
 */
export function gastoManualEsMercanciaEnOtraCategoria(gasto) {
  if (categoriaGastoExentaValidacionFuga(gasto?.categoria)) return false;
  const texto = norm(`${gasto?.subcategoria || ''} ${gasto?.comentario || ''}`);
  return RE_MERCANCIA_MANUAL.test(texto);
}

/** Monto en efectivo que generará gasto al recibir un pedido de venta en ruta (null si es crédito). */
export function montoEfectivoPedidoRuta(compra) {
  const notas = String(compra?.notas || '');
  const total = round2(compra?.total);
  if (/metodo\s+credito/i.test(notas)) return null;
  if (/metodo\s+mixto/i.test(notas)) {
    const m = notas.match(/efe\s+([0-9]+(?:\.[0-9]+)?)/i);
    const efe = m ? round2(m[1]) : 0;
    return efe > 0 ? efe : null;
  }
  return total > 0 ? total : null;
}

export function pedidoRutaCoincideConGasto(compra, monto) {
  const efe = montoEfectivoPedidoRuta(compra);
  if (efe == null) return false;
  return Math.abs(efe - round2(monto)) <= 0.01;
}

export function mensajeGastoManualMercancia() {
  return (
    'Esto es mercancía / venta en ruta: no se puede capturar como gasto manual en «Otros».\n\n' +
    'Recíbela en Compras (Por recibir): al recibirla, el sistema carga solo el gasto PROVEEDORES al corte ' +
    'y entra el inventario. Así no hay fugas y todas las sucursales operan igual.'
  );
}

export function mensajeGastoManualPedidoPendiente(pedido) {
  const folio = String(pedido?.notas || '').match(/VR-[A-Z0-9-]+/i)?.[0] || '';
  return (
    `Hay un pedido de venta en ruta pendiente por recibir en Compras por este monto${folio ? ` (${folio})` : ''}.\n\n` +
    'No lo captures como gasto manual: recíbelo en Compras y el gasto se carga solo al corte ' +
    '(así también entra el inventario y no hay fuga).'
  );
}

export async function buscarPedidoRutaPendienteParaGasto(supabase, { sucursal, monto } = {}) {
  if (!supabase || !(round2(monto) > 0)) return null;
  const sid = normalizarCodigoTienda(sucursal);
  if (!sid) return null;
  const vars = equivalentesCodigoTienda(sid);
  const { data, error } = await supabase
    .from('compras')
    .select('id, notas, total, estado, sucursal_id')
    .in('sucursal_id', vars.length ? vars : [sid])
    .eq('estado', 'pedido')
    .ilike('notas', '%Venta en ruta%')
    .limit(100);
  if (error) return null;
  return (data || []).find((c) => pedidoRutaCoincideConGasto(c, monto)) || null;
}

/**
 * Valida un gasto manual de Abarrotes. Devuelve `{ ok: true }` o `{ ok: false, error }`.
 */
export async function validarGastoManualSinFuga(supabase, { sucursal, modulo, gasto } = {}) {
  if (String(modulo || '').toLowerCase() !== 'abarrotes') return { ok: true };
  if (categoriaGastoExentaValidacionFuga(gasto?.categoria)) return { ok: true };

  if (gastoManualEsMercanciaEnOtraCategoria(gasto)) {
    return { ok: false, error: mensajeGastoManualMercancia(), mercanciaManual: true };
  }

  const pedido = await buscarPedidoRutaPendienteParaGasto(supabase, { sucursal, monto: gasto?.monto });
  if (pedido) {
    return { ok: false, error: mensajeGastoManualPedidoPendiente(pedido), pedidoRutaPendiente: true };
  }
  return { ok: true };
}
