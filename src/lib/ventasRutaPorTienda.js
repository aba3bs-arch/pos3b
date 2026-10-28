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

// ── Corte por última liquidación del recolector ─────────────────────────────

function normNombre(s) {
  return String(s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
}

function sinPrefijoRt(id) {
  const s = String(id || '').trim();
  return s.toLowerCase().startsWith('rt:') ? s.slice(3).trim() : s;
}

/** Repartidor (recolector) dueño de una carga, por id (con o sin `rt:`) y si no, por nombre. */
export function repartidorDeCarga(carga, repartidores) {
  if (!carga) return null;
  const lista = repartidores || [];
  const id = sinPrefijoRt(carga.vendedor_id);
  if (id) {
    const hit = lista.find((r) => String(r.id) === id);
    if (hit) return String(hit.id);
  }
  const nombre = normNombre(carga.vendedor_nombre);
  if (nombre && nombre !== '-') {
    const hit = lista.find((r) => {
      const n = normNombre(r.nombre);
      return n === nombre || n.startsWith(`${nombre} `) || nombre.startsWith(`${n} `);
    });
    if (hit) return String(hit.id);
  }
  return null;
}

/**
 * Quita las ventas que ya entraron en una liquidación: las de cada recolector con fecha
 * posterior a su última liquidación. Ventas sin recolector identificable no se tocan.
 * @param {Map<string, string>} cortes repartidorId → ISO de la última liquidación
 */
export function ventasPosterioresALiquidacion(ventas, { cargasPorId, repartidores, cortes } = {}) {
  const kept = [];
  let excluidas = 0;
  let sinRecolector = 0;
  for (const v of ventas || []) {
    const rep = repartidorDeCarga(cargasPorId?.get(String(v.carga_id)), repartidores);
    if (!rep) {
      sinRecolector += 1;
      kept.push(v);
      continue;
    }
    const corte = cortes?.get(rep);
    if (corte && new Date(v.created_at).getTime() <= new Date(corte).getTime()) {
      excluidas += 1;
      continue;
    }
    kept.push(v);
  }
  return { ventas: kept, excluidas, sinRecolector };
}

/** Gastos ya descontados en una liquidación (anteriores al corte de su recolector) no cuentan. */
export function gastosPosterioresALiquidacion(gastos, cortes) {
  return (gastos || []).filter((g) => {
    const corte = cortes?.get(String(g.repartidor_id || ''));
    return !corte || new Date(g.fecha_hora).getTime() > new Date(corte).getTime();
  });
}

/** Contexto para el corte: recolectores, su última liquidación y las cargas de las ventas. */
export async function cargarContextoLiquidacion(supabase, ventas) {
  if (!supabase) return { repartidores: [], cortes: new Map(), cargasPorId: new Map() };
  const { data: reps } = await supabase.from('repartidores').select('id, nombre');
  const repartidores = reps || [];

  const cortes = new Map();
  await Promise.all(repartidores.map(async (r) => {
    const { data } = await supabase
      .from('transito_efectivo')
      .select('fecha_liquidacion')
      .eq('repartidor_id', r.id)
      .eq('estatus', 'Liquidado')
      .neq('tipo_movimiento', 'Gasto')
      .not('fecha_liquidacion', 'is', null)
      .order('fecha_liquidacion', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data?.fecha_liquidacion) cortes.set(String(r.id), data.fecha_liquidacion);
  }));

  const ids = [...new Set((ventas || []).map((v) => v.carga_id).filter(Boolean).map(String))];
  const cargasPorId = new Map();
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await supabase
      .from('ruta_cargas')
      .select('id, vendedor_id, vendedor_nombre')
      .in('id', ids.slice(i, i + 100));
    for (const c of data || []) cargasPorId.set(String(c.id), c);
  }
  return { repartidores, cortes, cargasPorId };
}
