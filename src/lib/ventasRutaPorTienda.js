import { montosPagoDesdeVentaRuta } from './compraGastoCorte.js';
import { normalizarCodigoTienda } from '../constants/sucursales.js';
import { inicioDia, finDia } from './corteCaja.js';

const MAX_PAGINAS = 30;
const TAMANO_PAGINA = 1000;

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export function ventaCancelada(venta) {
  return String(venta?.estado || '').toLowerCase() === 'cancelada';
}

/** Clave y nombre de la tienda/cliente al que se vendió. */
export function tiendaDeVentaRuta(venta) {
  const tipo = String(venta?.cliente_tipo || '').toLowerCase();
  if (!tipo || tipo === 'sucursal') {
    const cod = normalizarCodigoTienda(venta?.cliente_id) || String(venta?.cliente_id || '').toUpperCase();
    if (cod) return { clave: cod, nombre: venta?.cliente_nombre || cod, externo: false };
  }
  const nombre = String(venta?.cliente_nombre || venta?.cliente_id || 'Sin cliente').trim();
  return { clave: `EXT:${nombre.toUpperCase()}`, nombre, externo: true };
}

/**
 * Totales de efectivo y crédito por tienda a partir de ventas de ruta.
 * Las canceladas no cuentan. Mixto usa el desglose guardado en la venta.
 */
export function resumirVentasPorTienda(ventas, { tienda = '' } = {}) {
  const porTienda = new Map();
  const total = { ventas: 0, efectivo: 0, credito: 0, total: 0, canceladas: 0 };

  for (const v of ventas || []) {
    if (ventaCancelada(v)) {
      total.canceladas += 1;
      continue;
    }
    const t = tiendaDeVentaRuta(v);
    if (tienda && t.clave !== tienda) continue;
    const pago = montosPagoDesdeVentaRuta(v);
    const monto = r2(v.total);
    const efectivo = r2(pago.montoEfectivo);
    const credito = r2(pago.montoCredito);

    let fila = porTienda.get(t.clave);
    if (!fila) {
      fila = { clave: t.clave, nombre: t.nombre, externo: t.externo, ventas: 0, efectivo: 0, credito: 0, total: 0, detalle: [] };
      porTienda.set(t.clave, fila);
    }
    fila.ventas += 1;
    fila.efectivo = r2(fila.efectivo + efectivo);
    fila.credito = r2(fila.credito + credito);
    fila.total = r2(fila.total + monto);
    fila.detalle.push({ ...v, _efectivo: efectivo, _credito: credito });

    total.ventas += 1;
    total.efectivo = r2(total.efectivo + efectivo);
    total.credito = r2(total.credito + credito);
    total.total = r2(total.total + monto);
  }

  const filas = [...porTienda.values()].sort((a, b) => b.total - a.total);
  return { filas, total };
}

/** Tiendas presentes en las ventas (para el selector), canceladas excluidas. */
export function tiendasDeVentas(ventas) {
  const mapa = new Map();
  for (const v of ventas || []) {
    if (ventaCancelada(v)) continue;
    const t = tiendaDeVentaRuta(v);
    if (!mapa.has(t.clave)) mapa.set(t.clave, t.nombre);
  }
  return [...mapa.entries()]
    .map(([clave, nombre]) => ({ clave, nombre }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

/** Ventas de ruta del rango (días completos, hora de Nogales), paginadas. */
export async function listarVentasRutaPorRango(supabase, { desde, hasta } = {}) {
  if (!supabase) return { data: [] };
  const ini = inicioDia(desde).toISOString();
  const fin = finDia(hasta || desde).toISOString();
  const data = [];
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina += 1) {
    const { data: lote, error } = await supabase
      .from('ruta_ventas')
      .select('*')
      .gte('created_at', ini)
      .lte('created_at', fin)
      .order('created_at', { ascending: false })
      .range(pagina * TAMANO_PAGINA, (pagina + 1) * TAMANO_PAGINA - 1);
    if (error) return { data, error: error.message };
    data.push(...(lote || []));
    if (!lote || lote.length < TAMANO_PAGINA) break;
  }
  return { data };
}

function cargoDeRecoleccion(c) {
  return String(c?.carga_id || '').startsWith('rec:') || /transito:[0-9a-f-]{8,}/i.test(String(c?.notas || ''));
}

/**
 * Crédito acumulado = todo el crédito aún sin cobrar (mismos cargos pendientes que Créditos por pagar),
 * de cualquier fecha. Se separa lo que viene de ventas en ruta y lo que viene de Recolecciones.
 * @returns {{ porTienda: Map<string, {clave, nombre, externo, monto, ruta, recoleccion, folios}>, total: number, ruta: number, recoleccion: number }}
 */
export function resumirCreditoAcumulado(cargos) {
  const porTienda = new Map();
  const acc = { total: 0, ruta: 0, recoleccion: 0 };
  for (const c of cargos || []) {
    const monto = r2(c?.monto);
    if (!(monto > 0)) continue;
    const tipo = String(c?.cliente_tipo || 'sucursal').toLowerCase();
    let t;
    if (tipo === 'sucursal') {
      const cod = normalizarCodigoTienda(c?.cliente_id) || String(c?.cliente_id || '').toUpperCase();
      t = { clave: cod || 'SIN-TIENDA', nombre: c?.cliente_nombre || cod || 'Sin tienda', externo: false };
    } else {
      const nombre = String(c?.cliente_nombre || c?.cliente_id || 'Sin cliente').trim();
      t = { clave: `EXT:${nombre.toUpperCase()}`, nombre, externo: true };
    }
    let fila = porTienda.get(t.clave);
    if (!fila) {
      fila = { ...t, monto: 0, ruta: 0, recoleccion: 0, folios: 0 };
      porTienda.set(t.clave, fila);
    }
    const origen = cargoDeRecoleccion(c) ? 'recoleccion' : 'ruta';
    fila.monto = r2(fila.monto + monto);
    fila[origen] = r2(fila[origen] + monto);
    fila.folios += 1;
    acc.total = r2(acc.total + monto);
    acc[origen] = r2(acc[origen] + monto);
  }
  return { porTienda, ...acc };
}

/** Acumulado de la tienda elegida o, sin tienda, el de todas. */
export function acumuladoMostrado(acumulado, tienda = '') {
  const vacio = { monto: 0, ruta: 0, recoleccion: 0, folios: 0 };
  if (!acumulado) return vacio;
  if (tienda) return acumulado.porTienda.get(tienda) || vacio;
  return { monto: acumulado.total, ruta: acumulado.ruta, recoleccion: acumulado.recoleccion, folios: [...acumulado.porTienda.values()].reduce((s, f) => s + f.folios, 0) };
}

export function gastoVigente(gasto) {
  return !/cancel|rechaz|anulad/i.test(String(gasto?.estatus || ''));
}

export function totalGastos(gastos) {
  return r2((gastos || []).filter(gastoVigente).reduce((s, g) => s + (Number(g?.monto) || 0), 0));
}

/** Gastos de ruta (Venta en Ruta → Gastos) del rango. No trae la foto de evidencia. */
export async function listarGastosRutaPorRango(supabase, { desde, hasta } = {}) {
  if (!supabase) return { data: [] };
  const ini = inicioDia(desde).toISOString();
  const fin = finDia(hasta || desde).toISOString();
  const data = [];
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina += 1) {
    const { data: lote, error } = await supabase
      .from('transito_efectivo')
      .select('id, monto, fecha_hora, num_traspaso, descripcion_gasto, estatus, repartidor_id')
      .eq('tipo_movimiento', 'Gasto')
      .gte('fecha_hora', ini)
      .lte('fecha_hora', fin)
      .order('fecha_hora', { ascending: false })
      .range(pagina * TAMANO_PAGINA, (pagina + 1) * TAMANO_PAGINA - 1);
    if (error) return { data, error: error.message };
    data.push(...(lote || []));
    if (!lote || lote.length < TAMANO_PAGINA) break;
  }
  return { data };
}
