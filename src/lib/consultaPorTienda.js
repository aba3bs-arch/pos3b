import { SUCURSALES_BASE, etiquetaTienda, normalizarCodigoTienda } from '../constants/sucursales.js';
import { esCreditoCobrado } from './recoleccionTipos.js';
import { resumirInventarioCamion } from './resumenInventarioCamion.js';
import { montosVentaReporte } from './reporteVentasRuta.js';

const PAGE = 1000;
const TOPE = 50000;

function r2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function normNombre(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function faltaTabla(error) {
  const m = String(error?.message || error || '');
  return /does not exist|schema cache|could not find the table|relation .* does not exist/i.test(m);
}

function productosDeVenta(venta) {
  const arts = Array.isArray(venta?.articulos) ? venta.articulos : [];
  return arts.filter((a) => a && !a._pago_mixto && !a._lineas_camion && !a._recepcion_pendiente && (a.nombre || a.producto_id));
}

function claveTienda(venta) {
  const tipo = String(venta?.cliente_tipo || '').toLowerCase();
  if (tipo === 'externo') {
    const nombre = String(venta.cliente_nombre || venta.cliente_id || 'Cliente externo').trim();
    return { id: `ext:${venta.cliente_id || nombre}`, codigo: nombre, nombre };
  }
  const codigo = normalizarCodigoTienda(venta?.cliente_id) || String(venta?.cliente_id || '—').trim() || '—';
  return { id: codigo, codigo, nombre: etiquetaTienda(codigo) || venta?.cliente_nombre || codigo };
}

function duenoCarga(carga, repartidores) {
  const porId = new Map((repartidores || []).filter((r) => r?.id).map((r) => [String(r.id), r]));
  const porNombre = new Map();
  for (const r of repartidores || []) {
    const n = normNombre(r?.nombre);
    if (n && !porNombre.has(n)) porNombre.set(n, r);
  }
  const vid = String(carga?.vendedor_id || '');
  if (vid && porId.has(vid)) return porId.get(vid);
  const nombre = normNombre(carga?.vendedor_nombre);
  if (nombre && porNombre.has(nombre)) return porNombre.get(nombre);
  const etiqueta = String(carga?.vendedor_nombre || vid || 'Sin recolector').trim();
  return { id: `extra:${normNombre(etiqueta) || 'sin'}`, nombre: etiqueta, activo: true };
}

/**
 * Tablero de un recolector: inventario del camión en curso y ventas por tienda.
 * El total a liquidar es la venta de las tiendas marcadas. No mueve dinero.
 */
export function armarConsultaPorTienda({
  repartidorId,
  repartidores = [],
  cargas = [],
  ventas = [],
  lineas = [],
  productos = [],
  transito = [],
  ahora = null,
} = {}) {
  const rep = (repartidores || []).find((r) => String(r.id) === String(repartidorId))
    || { id: repartidorId, nombre: 'Recolector' };
  const abiertas = (cargas || []).filter((c) => {
    if (String(c?.estado || '').toLowerCase() !== 'en_ruta') return false;
    return String(duenoCarga(c, repartidores).id) === String(repartidorId);
  });
  const cargaIds = new Set(abiertas.map((c) => String(c.id)));
  const lineasRep = (lineas || []).filter((l) => cargaIds.has(String(l.carga_id)));
  const inventario = resumirInventarioCamion(lineasRep, productos);
  const ultima = abiertas
    .map((c) => c.created_at)
    .filter(Boolean)
    .sort()
    .at(-1) || null;

  const tiendas = new Map();
  const asegurar = (clave) => {
    if (!tiendas.has(clave.id)) {
      tiendas.set(clave.id, {
        id: clave.id,
        codigo: clave.codigo,
        nombre: clave.nombre,
        marcada: true,
        efectivo: 0,
        credito: 0,
        tickets: [],
        transito: [],
      });
    }
    return tiendas.get(clave.id);
  };

  for (const venta of ventas || []) {
    if (!cargaIds.has(String(venta?.carga_id || ''))) continue;
    const montos = montosVentaReporte(venta);
    const tienda = asegurar(claveTienda(venta));
    tienda.efectivo = r2(tienda.efectivo + montos.efectivo);
    tienda.credito = r2(tienda.credito + montos.credito);
    const arts = productosDeVenta(venta);
    tienda.tickets.push({
      id: String(venta.id || venta.folio),
      folio: venta.folio || '—',
      fecha: venta.created_at || null,
      metodo: String(venta.metodo_pago || '').toLowerCase() || 'efectivo',
      productos: arts.length,
      lineas: arts.map((a) => ({
        nombre: a.nombre || a.producto_id || 'Producto',
        cantidad: Number(a.cantidad) || 0,
        importe: r2(a.importe ?? (Number(a.precio) || 0) * (Number(a.cantidad) || 0)),
      })),
      subtotal: r2(venta.total),
    });
  }

  for (const mov of transito || []) {
    if (String(mov?.estatus || '') !== 'En Tránsito') continue;
    if (String(mov?.tipo_movimiento || '') === 'Gasto') continue;
    if (String(mov.repartidor_id || '') !== String(repartidorId)) continue;
    const codigo = normalizarCodigoTienda(mov.sucursal_origen) || String(mov.sucursal_origen || '—');
    const tienda = asegurar({ id: codigo, codigo, nombre: etiquetaTienda(codigo) || codigo });
    tienda.transito.push({
      id: String(mov.id),
      folio: mov.num_traspaso || '—',
      fecha: mov.fecha_hora || null,
      monto: r2(mov.monto),
      tipo: esCreditoCobrado(mov) ? 'credito' : (String(mov.tipo_movimiento || '') === 'Cobro Servicio' ? 'servicio' : 'efectivo'),
    });
  }

  const orden = (codigo) => {
    const i = SUCURSALES_BASE.indexOf(codigo);
    return i === -1 ? SUCURSALES_BASE.length : i;
  };
  const lista = [...tiendas.values()].map((t) => ({
    ...t,
    tickets: [...t.tickets].sort((a, b) => String(a.fecha || '').localeCompare(String(b.fecha || ''))),
    transito: [...t.transito].sort((a, b) => String(a.fecha || '').localeCompare(String(b.fecha || ''))),
    mov: t.tickets.length,
    venta: r2(t.efectivo + t.credito),
  })).sort((a, b) => orden(a.codigo) - orden(b.codigo) || String(a.codigo).localeCompare(String(b.codigo), 'es'));

  const suma = (campo) => r2(lista.reduce((s, t) => s + (Number(t[campo]) || 0), 0));
  return {
    repartidorId: String(repartidorId || ''),
    nombre: rep.nombre || 'Recolector',
    cargado: inventario.cargado,
    disponible: inventario.disponible,
    sinPrecio: inventario.sinPrecio,
    ultimaCarga: ultima,
    actualizado: ahora,
    efectivo: suma('efectivo'),
    credito: suma('credito'),
    venta: suma('venta'),
    mov: lista.reduce((s, t) => s + t.mov, 0),
    tiendas: lista,
  };
}

/** Incluye dueños de cargas abiertas que no están en la tabla de repartidores. */
export function completarRepartidores(repartidores, cargas) {
  const lista = (repartidores || []).filter((r) => r && r.activo !== false);
  const vistos = new Set(lista.map((r) => String(r.id)));
  for (const carga of cargas || []) {
    if (String(carga?.estado || '').toLowerCase() !== 'en_ruta') continue;
    const dueno = duenoCarga(carga, lista);
    if (!vistos.has(String(dueno.id))) {
      lista.push(dueno);
      vistos.add(String(dueno.id));
    }
  }
  return lista;
}

/** Recolector de la carga abierta más reciente, o el primero de la lista. */
export function recolectorInicial(repartidores, cargas) {
  const lista = repartidores || [];
  for (const carga of cargas || []) {
    if (String(carga?.estado || '').toLowerCase() !== 'en_ruta') continue;
    const dueno = duenoCarga(carga, lista);
    if (lista.some((r) => String(r.id) === String(dueno.id))) return String(dueno.id);
  }
  return String(lista[0]?.id || '');
}

export function totalMarcado(tablero) {
  const marcadas = (tablero?.tiendas || []).filter((t) => t.marcada);
  return {
    tiendas: marcadas.length,
    venta: r2(marcadas.reduce((s, t) => s + t.venta, 0)),
    efectivo: r2(marcadas.reduce((s, t) => s + t.efectivo, 0)),
    credito: r2(marcadas.reduce((s, t) => s + t.credito, 0)),
    transitoEfectivo: r2(marcadas.reduce(
      (s, t) => s + (t.transito || []).filter((m) => m.tipo === 'efectivo').reduce((a, m) => a + m.monto, 0),
      0,
    )),
  };
}

async function leerPaginas(hacer) {
  const rows = [];
  for (let from = 0; from < TOPE; from += PAGE) {
    const { data, error } = await hacer(from, from + PAGE - 1);
    if (error) {
      if (faltaTabla(error)) return { data: rows, aviso: error.message };
      return { data: rows, error: error.message };
    }
    rows.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return { data: rows };
}

/** Lee repartidores, cargas en ruta, líneas, ventas y tránsito. No escribe nada. */
export async function cargarConsultaPorTienda(supabase) {
  if (!supabase) return { ok: false, error: 'Sin conexión.', repartidores: [], cargas: [], ventas: [], lineas: [], transito: [] };

  const reps = await leerPaginas((from, to) => supabase
    .from('repartidores')
    .select('id, nombre, activo')
    .order('nombre')
    .range(from, to));
  if (reps.error) return { ok: false, error: reps.error, repartidores: [], cargas: [], ventas: [], lineas: [], transito: [] };

  const cargas = await leerPaginas((from, to) => supabase
    .from('ruta_cargas')
    .select('id, vendedor_id, vendedor_nombre, estado, folio, created_at')
    .eq('estado', 'en_ruta')
    .order('created_at', { ascending: false })
    .range(from, to));
  if (cargas.error) return { ok: false, error: cargas.error, repartidores: reps.data, cargas: [], ventas: [], lineas: [], transito: [] };

  const ids = (cargas.data || []).map((c) => c.id).filter(Boolean);
  const ventas = [];
  const lineas = [];
  let aviso = reps.aviso || cargas.aviso || '';
  for (let i = 0; i < ids.length; i += 80) {
    const slice = ids.slice(i, i + 80);
    const parteVentas = await leerPaginas((from, to) => supabase
      .from('ruta_ventas')
      .select('id, carga_id, folio, cliente_tipo, cliente_id, cliente_nombre, metodo_pago, total, articulos, created_at')
      .in('carga_id', slice)
      .order('created_at', { ascending: false })
      .range(from, to));
    if (parteVentas.error) return { ok: false, error: parteVentas.error, repartidores: reps.data, cargas: cargas.data, ventas: [], lineas: [], transito: [] };
    ventas.push(...parteVentas.data);
    const parteLineas = await leerPaginas((from, to) => supabase
      .from('ruta_carga_lineas')
      .select('id, carga_id, producto_id, precio, qty_cargada, qty_vendida, qty_devuelta')
      .in('carga_id', slice)
      .order('id')
      .range(from, to));
    if (parteLineas.error) return { ok: false, error: parteLineas.error, repartidores: reps.data, cargas: cargas.data, ventas, lineas: [], transito: [] };
    lineas.push(...parteLineas.data);
    aviso = aviso || parteVentas.aviso || parteLineas.aviso || '';
  }

  const transito = await leerPaginas((from, to) => supabase
    .from('transito_efectivo')
    .select('id, repartidor_id, monto, tipo_movimiento, estatus, num_traspaso, foto_url, descripcion_gasto, sucursal_origen, fecha_hora')
    .eq('estatus', 'En Tránsito')
    .order('fecha_hora', { ascending: false })
    .range(from, to));
  if (transito.error) return { ok: false, error: transito.error, repartidores: reps.data, cargas: cargas.data, ventas, lineas, transito: [] };

  return {
    ok: true,
    aviso: aviso || transito.aviso || null,
    repartidores: completarRepartidores(reps.data, cargas.data),
    cargas: cargas.data || [],
    ventas,
    lineas,
    transito: transito.data || [],
  };
}
