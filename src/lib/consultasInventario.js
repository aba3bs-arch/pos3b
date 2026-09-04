import { leerMovimientosLocal, AVISO_FALTA_MOVIMIENTOS_SQL, reintentarMovimientosPendientes, folioDesdeCompraId } from './inventarioMovimientos.js';
import { filtrarProductosPorTexto } from './buscarProductoTexto.js';
import { normalizarCodigoTienda } from '../constants/sucursales.js';
import { consultarVentas } from './ventasQuery.js';
import { leerAjustesInventario } from './conteoDepartamento.js';
import { inicioDia, finDia } from './corteCaja.js';

export const FILTROS_EVENTO_PRODUCTO = [
  { id: 'todos', label: 'Todos' },
  { id: 'existencia', label: 'Existencia' },
  { id: 'entradas', label: 'Entradas' },
  { id: 'salidas', label: 'Salidas' },
  { id: 'ajustes', label: 'Ajustes' },
  { id: 'precios', label: 'Cambios de precio' },
  { id: 'cancelaciones', label: 'Cancelaciones' },
  { id: 'negativo', label: 'Stock negativo' },
];

export const FILTROS_TIPO_MOVIMIENTO = [
  { id: '', label: 'Todos los tipos' },
  { id: 'entrada', label: 'Ingreso de inventario' },
  { id: 'retiro', label: 'Retiro de inventario' },
  { id: 'traspaso', label: 'Traspaso' },
  { id: 'venta', label: 'Salida por venta' },
  { id: 'cancelacion', label: 'Cancelación (regreso)' },
  { id: 'cambio_precio', label: 'Cambio de precio' },
  { id: 'ajuste', label: 'Ajuste / conteo' },
];

export function etiquetaTipoMovimiento(tipo, modo) {
  if (tipo === 'cambio_precio') return 'Cambio de precio';
  if (tipo === 'cancelacion' || (tipo === 'entrada' && modo === 'cancelacion')) return 'Entrada (cancelación)';
  if (tipo === 'entrada') {
    if (modo === 'compra') return 'Entrada (compra)';
    if (modo === 'masivo') return 'Ingreso de inventario';
    if (modo === 'conteo_departamento') return 'Ajuste (+ conteo)';
    return 'Entrada';
  }
  if (tipo === 'retiro') {
    if (modo === 'venta') return 'Salida (venta)';
    if (modo === 'vaciado_inventario') return 'Vaciado inventario';
    if (modo === 'conteo_departamento') return 'Ajuste (− conteo)';
    return 'Retiro';
  }
  if (tipo === 'traspaso') return 'Traspaso';
  if (tipo === 'venta') return 'Venta';
  if (tipo === 'ajuste') return 'Ajuste';
  return tipo || '—';
}

function esStockNegativo(e) {
  const a = Number(e.stock_antes);
  const d = Number(e.stock_despues);
  return (Number.isFinite(a) && a < 0) || (Number.isFinite(d) && d < 0);
}

function enRango(iso, desde, hasta) {
  if (!iso) return true;
  const t = new Date(iso).getTime();
  if (desde) {
    const d = new Date(desde);
    d.setHours(0, 0, 0, 0);
    if (t < d.getTime()) return false;
  }
  if (hasta) {
    const h = new Date(hasta);
    h.setHours(23, 59, 59, 999);
    if (t > h.getTime()) return false;
  }
  return true;
}

function movimientoTocaSucursal(m, suc) {
  if (!suc) return true;
  const s = normalizarCodigoTienda(suc);
  const candidatos = [
    m.sucursal,
    m.sucursal_id,
    m.sucursal_origen,
    m.sucursal_destino,
    m.meta?.sucursal_origen,
    m.meta?.sucursal_destino,
  ]
    .filter(Boolean)
    .map((c) => normalizarCodigoTienda(c));
  // Sin sucursal en el movimiento: no ocultar (histórico / datos incompletos).
  if (!candidatos.length) return true;
  return candidatos.includes(s);
}

export function listarMovimientosInventario(opts = {}) {
  const { desde, hasta, productoId, tipo, sucursal } = opts;
  let list = leerMovimientosLocal();
  if (productoId) {
    const pid = String(productoId);
    list = list.filter(
      (m) => String(m.producto_id) === pid || String(m.producto_destino_id) === pid,
    );
  }
  if (tipo) list = list.filter((m) => coincideTipoFiltro(m, tipo));
  if (sucursal) list = list.filter((m) => movimientoTocaSucursal(m, sucursal));
  list = list.filter((m) => enRango(m.created_at, desde, hasta));
  return list;
}

function coincideTipoFiltro(m, tipo) {
  if (!tipo) return true;
  if (tipo === 'cancelacion') return m.modo === 'cancelacion' || m.tipo === 'cancelacion';
  if (tipo === 'venta') return m.modo === 'venta' || m.tipo === 'venta';
  if (tipo === 'ajuste') {
    return esMovimientoAjuste(m);
  }
  if (tipo === 'cambio_precio') return m.tipo === 'cambio_precio';
  return m.tipo === tipo;
}

function fromCloudRow(r) {
  const meta = r.meta && typeof r.meta === 'object' ? r.meta : {};
  return {
    id: r.id,
    cloudId: r.id,
    tipo: r.tipo,
    modo: r.modo,
    producto_id: r.producto_id,
    producto_nombre: r.producto_nombre,
    producto_destino_id: r.producto_destino_id,
    producto_destino_nombre: r.producto_destino_nombre,
    cantidad: Number(r.cantidad) || 0,
    stock_antes: r.stock_antes,
    stock_despues: r.stock_despues,
    stock_dest_antes: r.stock_dest_antes,
    stock_dest_despues: r.stock_dest_despues,
    precio_antes: r.precio_antes,
    precio_despues: r.precio_despues,
    ubicacion: r.ubicacion,
    departamento: r.departamento,
    motivo: r.motivo,
    usuario: r.usuario,
    sucursal: r.sucursal_id,
    folio: meta.folio || null,
    subtipo: meta.subtipo || null,
    traspaso_origen: meta.traspaso_origen || null,
    traspaso_destino: meta.traspaso_destino || null,
    sucursal_origen: meta.sucursal_origen || null,
    sucursal_destino: meta.sucursal_destino || null,
    ubicacion_origen: meta.ubicacion_origen || null,
    ubicacion_destino: meta.ubicacion_destino || null,
    meta,
    created_at: r.created_at,
    origen: 'nube',
  };
}

function artsOf(row) {
  let a = row?.articulos;
  if (typeof a === 'string') {
    try {
      a = JSON.parse(a);
    } catch {
      a = [];
    }
  }
  return Array.isArray(a) ? a : [];
}

function movimientosDesdeVentas(ventas) {
  const out = [];
  for (const v of ventas || []) {
    const suc = v.sucursal_id || '';
    for (const a of artsOf(v)) {
      const qty = Number(a.qty ?? a.cantidad ?? 1) || 1;
      const precio = Number(a.precio) || 0;
      out.push({
        id: `venta_${v.id}_${a.id}`,
        tipo: 'retiro',
        modo: 'venta',
        producto_id: a.id,
        producto_nombre: a.nombre || a.id,
        cantidad: qty,
        stock_antes: null,
        stock_despues: null,
        subtotal: precio * qty,
        motivo: `Venta · ${v.metodo_pago || ''} · ticket ${String(v.id).slice(0, 8)}`.trim(),
        usuario: v.vendedor || '—',
        sucursal: suc,
        created_at: v.created_at,
        origen: 'ventas',
      });
    }
  }
  return out;
}

function movimientosDesdeCancelaciones(cancelaciones) {
  const out = [];
  for (const c of cancelaciones || []) {
    const suc = c.sucursal_id || c.sucursal || '';
    for (const a of artsOf(c)) {
      const qty = Number(a.qty ?? a.cantidad ?? 1) || 1;
      const precio = Number(a.precio) || 0;
      out.push({
        id: `cancel_${c.id}_${a.id}`,
        tipo: 'entrada',
        modo: 'cancelacion',
        producto_id: a.id,
        producto_nombre: a.nombre || a.id,
        cantidad: qty,
        stock_antes: null,
        stock_despues: null,
        precio,
        subtotal: precio * qty,
        motivo: `Cancelación${c.motivo ? ` · ${c.motivo}` : ''}`.trim(),
        usuario: c.usuario || '—',
        sucursal: suc,
        created_at: c.created_at || c.hora,
        origen: 'cancelaciones',
      });
    }
  }
  return out;
}

function itemsCompra(row) {
  let items = row?.items;
  if (typeof items === 'string') {
    try {
      items = JSON.parse(items);
    } catch {
      items = [];
    }
  }
  if (!Array.isArray(items) || !items.length) {
    let pedido = row?.items_pedido;
    if (typeof pedido === 'string') {
      try {
        pedido = JSON.parse(pedido);
      } catch {
        pedido = [];
      }
    }
    if (Array.isArray(pedido)) {
      return pedido
        .map((p) => ({
          id: p.id,
          nombre: p.nombre,
          qty: Number(p.qty ?? p.qty_pedido ?? p.qty_recibido) || 0,
          costo: Number(p.costo ?? p.costo_est) || 0,
        }))
        .filter((p) => p.qty > 0);
    }
    return [];
  }
  return items.map((p) => ({
    ...p,
    qty: Number(p.qty ?? p.cantidad ?? p.qty_recibido) || 0,
    costo: Number(p.costo ?? p.costo_est) || 0,
  }));
}

/** Recepciones de compra → entradas de inventario (aunque falte movimientos_inventario). */
function movimientosDesdeCompras(compras) {
  const out = [];
  for (const c of compras || []) {
    const estado = String(c.estado || '').toLowerCase();
    if (estado && estado !== 'recibida' && estado !== 'recibido' && estado !== 'cerrada') continue;
    const suc = c.sucursal_id || c.sucursal || '';
    const created = c.created_at || c.fecha;
    const notas = String(c.notas || '');
    const folioNotas = (notas.match(/Folio inv\s+([A-Z0-9-]+)/i) || [])[1];
    const folioCompra = folioNotas || folioDesdeCompraId(c.id);
    for (const a of itemsCompra(c)) {
      const qty = Number(a.qty ?? a.cantidad ?? a.qty_recibido) || 0;
      if (qty <= 0) continue;
      out.push({
        id: `compra_${c.id}_${a.id}`,
        tipo: 'entrada',
        modo: 'compra',
        folio: folioCompra,
        producto_id: a.id,
        producto_nombre: a.nombre || a.id,
        cantidad: qty,
        stock_antes: null,
        stock_despues: null,
        precio: Number(a.costo ?? a.costo_est) || 0,
        subtotal: qty * (Number(a.costo ?? a.costo_est) || 0),
        motivo: `Compra/recepción · ${c.notas || c.id || ''}`.trim(),
        usuario: c.usuario || c.vendedor || '—',
        sucursal: suc,
        created_at: created,
        origen: 'compras',
        meta: { folio: folioCompra, compra_id: c.id },
      });
    }
  }
  return out;
}

function movimientosDesdeAjustesLocales() {
  const out = [];
  for (const aj of leerAjustesInventario()) {
    const created = aj.created_at || aj.hora;
    const suc = aj.sucursal || '';
    for (const l of aj.lineas || []) {
      const dif = Number(l.diferencia);
      if (!dif) continue;
      out.push({
        id: `ajuste_${aj.folio || aj.id}_${l.productoId || l.codigo}`,
        tipo: dif > 0 ? 'entrada' : 'retiro',
        modo: 'conteo_departamento',
        folio: aj.folio,
        departamento: aj.departamento,
        producto_id: l.productoId || l.codigo,
        producto_nombre: l.nombre,
        cantidad: Math.abs(dif),
        stock_antes: l.existencia,
        stock_despues: l.contadaNum,
        motivo: `Conteo físico ${aj.departamento || ''} · ${aj.folio || ''}`.trim(),
        usuario: aj.usuario || '—',
        sucursal: suc,
        created_at: created,
        origen: 'ajustes_local',
      });
    }
  }
  return out;
}

function dedupeMovimientos(list) {
  const seen = new Map(); // key -> index in out
  const out = [];
  const mark = (key, idx) => {
    if (key) seen.set(key, idx);
  };
  for (const m of list) {
    const origenLocal = m.meta?.origen_local_id || (m.origen === 'local' || m.pendiente_nube ? m.id : null);
    const folio = m.folio || m.meta?.folio || '';
    const suc = normalizarCodigoTienda(m.sucursal || '') || '';
    const pid = String(m.producto_id || '');
    const t = new Date(m.created_at || 0).getTime();
    const bucket = Math.floor(t / 120000); // 2 min
    const folioKey = folio ? `folio|${folio}|${pid}|${m.tipo || ''}|${Number(m.cantidad) || 0}` : null;
    // Identidad estable primero (nube / origen local / folio de lote) para no perder ni duplicar.
    const key =
      m.cloudId ||
      (m.origen === 'nube' ? m.id : null) ||
      (origenLocal ? `local|${origenLocal}` : null) ||
      folioKey ||
      (m.tipo === 'traspaso'
        ? `trp|${folio}|${pid}|${m.sucursal_origen || ''}|${m.sucursal_destino || ''}|${Number(m.cantidad) || 0}|${bucket}`
        : `${m.tipo}|${m.modo || ''}|${pid}|${suc}|${Number(m.cantidad) || 0}|${bucket}`);

    if (seen.has(key)) {
      const idx = seen.get(key);
      const prev = out[idx];
      // Si el movimiento de nube no trae costo, hereda el de compras (costo_est del ticket).
      const prevSinPrecio = !(Number(prev?.precio) > 0) && !(Number(prev?.subtotal) > 0);
      const nuevoConPrecio = Number(m?.precio) > 0 || Number(m?.subtotal) > 0;
      if (prevSinPrecio && nuevoConPrecio) {
        out[idx] = {
          ...prev,
          precio: m.precio != null ? m.precio : prev.precio,
          subtotal: m.subtotal != null ? m.subtotal : prev.subtotal,
        };
      }
      continue;
    }
    const idx = out.length;
    out.push(m);
    mark(key, idx);
    if (origenLocal) mark(`local|${origenLocal}`, idx);
    if (folioKey) mark(folioKey, idx);
  }
  return out;
}

/**
 * Reporte unificado de movimientos de inventario para Consultas.
 * Combina: nube + local + ventas + cancelaciones + ajustes de conteo.
 */
export async function cargarReporteMovimientosInventario(supabase, opts = {}) {
  const {
    desde = null,
    hasta = null,
    productoId = null,
    tipo = null,
    sucursal = null,
    q = '',
  } = opts;

  const suc = sucursal ? normalizarCodigoTienda(sucursal) : null;
  // Misma ventana que la pestaña Ventas (medianoche local del equipo) para no “perder” tickets.
  const ini = desde
    ? (() => {
        const d = new Date(`${String(desde).slice(0, 10)}T00:00:00`);
        return Number.isNaN(d.getTime()) ? inicioDia(desde) : d;
      })()
    : null;
  const fin = hasta
    ? (() => {
        const d = new Date(`${String(hasta).slice(0, 10)}T23:59:59.999`);
        return Number.isNaN(d.getTime()) ? finDia(hasta) : d;
      })()
    : null;
  const avisos = [];
  const stats = { nube: 0, local: 0, ventas: 0, cancelaciones: 0, compras: 0, ajustes: 0 };
  let faltaTablaNube = false;

  // Antes de armar el reporte: sube pendientes para que Consultas vea compras/ingresos.
  if (supabase) {
    try {
      const sync = await reintentarMovimientosPendientes(supabase, { limite: 100 });
      if (sync.aviso) avisos.push(sync.aviso);
      if (sync.subidos > 0 && sync.restantes > 0) {
        avisos.push(`Se subieron ${sync.subidos} movimiento(s) pendientes; quedan ${sync.restantes} por sincronizar.`);
      } else if (sync.restantes > 0) {
        avisos.push(
          `Hay ${sync.restantes} movimiento(s) de inventario pendientes de subir a la nube. El stock ya cambió; no borres la caché local.`,
        );
      }
    } catch (e) {
      avisos.push(`Reintento de movimientos: ${e?.message || e}`);
    }
  }

  try {
    let nube = [];
    if (supabase) {
      let query = supabase
        .from('movimientos_inventario')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(productoId ? 2000 : 3000);
      // Filtro de sucursal en cliente (incluye traspasos origen/destino en meta).
      if (ini) query = query.gte('created_at', ini.toISOString());
      if (fin) query = query.lte('created_at', fin.toISOString());
      if (productoId) {
        const pid = String(productoId).replace(/[(),]/g, '');
        if (pid) {
          query = query.or(`producto_id.eq.${pid},producto_destino_id.eq.${pid}`);
        }
      }
      const { data, error } = await query;
      if (error) {
        const msg = String(error.message || '');
        if (/movimientos_inventario|schema cache|does not exist|could not find/i.test(msg)) {
          faltaTablaNube = true;
          avisos.push(AVISO_FALTA_MOVIMIENTOS_SQL);
        } else {
          avisos.push(`Nube: ${msg}`);
        }
      } else {
        nube = (data || []).map(fromCloudRow);
        if (suc) nube = nube.filter((m) => movimientoTocaSucursal(m, suc));
        stats.nube = nube.length;
      }
    }

    const locales = listarMovimientosInventario({
      desde,
      hasta,
      productoId,
      sucursal: suc,
    }).map((m) => ({ ...m, origen: m.origen || 'local' }));
    stats.local = locales.length;

    let ventasDeriv = [];
    let cancelDeriv = [];
    let comprasDeriv = [];
    if (supabase && ini && fin) {
      const ventasRes = await consultarVentas(supabase, {
        columns: 'id,total,metodo_pago,vendedor,sucursal_id,articulos,created_at',
        desde: ini,
        hasta: fin,
        sucursal: suc,
        limit: 3000,
        orderAsc: false,
      });
      if (ventasRes.error) avisos.push(`Ventas: ${ventasRes.error}`);
      if (ventasRes.aviso) avisos.push(ventasRes.aviso);
      ventasDeriv = movimientosDesdeVentas(ventasRes.data || []);
      stats.ventas = ventasDeriv.length;

      try {
        let cq = supabase
          .from('cancelaciones')
          .select('id,sucursal_id,usuario,articulos,motivo,created_at,total')
          .gte('created_at', ini.toISOString())
          .lte('created_at', fin.toISOString())
          .order('created_at', { ascending: false })
          .limit(2000);
        if (suc) cq = cq.eq('sucursal_id', suc);
        const { data: canc, error: eCanc } = await cq;
        if (eCanc) {
          if (!/cancelaciones|does not exist|schema cache/i.test(String(eCanc.message || ''))) {
            avisos.push(`Cancelaciones: ${eCanc.message}`);
          }
        } else {
          cancelDeriv = movimientosDesdeCancelaciones(canc || []);
          stats.cancelaciones = cancelDeriv.length;
        }
      } catch (e) {
        avisos.push(`Cancelaciones: ${e?.message || e}`);
      }

      try {
        let pq = supabase
          .from('compras')
          .select('id,sucursal_id,sucursal,estado,items,items_pedido,notas,created_at,fecha,total')
          .gte('created_at', ini.toISOString())
          .lte('created_at', fin.toISOString())
          .order('created_at', { ascending: false })
          .limit(1000);
        if (suc) pq = pq.eq('sucursal_id', suc);
        const { data: comps, error: eComp } = await pq;
        if (eComp) {
          if (!/compras|does not exist|schema cache/i.test(String(eComp.message || ''))) {
            avisos.push(`Compras: ${eComp.message}`);
          }
        } else {
          comprasDeriv = movimientosDesdeCompras(comps || []);
          stats.compras = comprasDeriv.length;
        }
      } catch (e) {
        avisos.push(`Compras: ${e?.message || e}`);
      }
    } else if (!supabase) {
      avisos.push('Sin conexión a Supabase: solo se muestran movimientos locales de este equipo.');
    } else if (!ini || !fin) {
      avisos.push('Selecciona un periodo (desde/hasta) para cargar ventas, cancelaciones y compras.');
    }

    const ajustesDeriv = movimientosDesdeAjustesLocales().filter((m) => {
      if (suc && !movimientoTocaSucursal(m, suc)) return false;
      if (productoId && String(m.producto_id) !== String(productoId)) return false;
      return enRango(m.created_at, desde, hasta);
    });
    stats.ajustes = ajustesDeriv.length;

    let merged = dedupeMovimientos([
      ...nube,
      ...locales,
      ...ventasDeriv,
      ...cancelDeriv,
      ...comprasDeriv,
      ...ajustesDeriv,
    ]);

    if (tipo) merged = merged.filter((m) => coincideTipoFiltro(m, tipo));
    if (productoId) {
      const pid = String(productoId);
      merged = merged.filter(
        (m) => String(m.producto_id) === pid || String(m.producto_destino_id) === pid,
      );
    }
    const texto = String(q || '').trim().toLowerCase();
    if (texto) {
      merged = merged.filter((m) => {
        const blob = `${m.producto_id || ''} ${m.producto_nombre || ''} ${m.producto_destino_nombre || ''} ${m.motivo || ''} ${m.usuario || ''} ${m.folio || ''} ${m.traspaso_origen || ''} ${m.traspaso_destino || ''}`.toLowerCase();
        return blob.includes(texto) || String(m.producto_id || '') === texto;
      });
    }

    merged.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

    avisos.unshift(
      `Fuentes: nube ${stats.nube} · local ${stats.local} · ventas ${stats.ventas} · cancel. ${stats.cancelaciones} · compras ${stats.compras} · ajustes ${stats.ajustes} → ${merged.length} fila(s)`,
    );
    if (faltaTablaNube && (stats.ventas > 0 || stats.cancelaciones > 0 || stats.compras > 0)) {
      avisos.push(
        'Mientras falta la tabla SQL, igual deben verse salidas por venta, cancelaciones y entradas por compra. Traspasos/ajustes/precios de otras cajas requieren ejecutar el SQL.',
      );
    }

    return {
      data: merged,
      avisos,
      stats,
      faltaTablaNube,
      resumen: {
        total: merged.length,
        entradas: merged.filter((m) => m.tipo === 'entrada' || m.modo === 'cancelacion').length,
        salidas: merged.filter((m) => m.tipo === 'retiro' || m.tipo === 'venta' || m.modo === 'venta').length,
        traspasos: merged.filter((m) => m.tipo === 'traspaso').length,
        ajustes: merged.filter((m) => m.modo === 'conteo_departamento' || m.modo === 'masivo' || m.modo === 'vaciado_inventario').length,
        precios: merged.filter((m) => m.tipo === 'cambio_precio').length,
        cancelaciones: merged.filter((m) => m.modo === 'cancelacion').length,
        compras: merged.filter((m) => m.modo === 'compra').length,
      },
    };
  } catch (e) {
    return {
      data: [],
      avisos: [`Error al cargar movimientos: ${e?.message || e}`],
      stats,
      faltaTablaNube: false,
      resumen: { total: 0, entradas: 0, salidas: 0, traspasos: 0, ajustes: 0, precios: 0, cancelaciones: 0, compras: 0 },
    };
  }
}

/** Agrupa ventas como los cortes: fecha + turno + sucursal. */
export function agruparVentasConsulta(ventas, { turnoFiltro = '' } = {}) {
  const ymdLocal = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const map = new Map();
  for (const v of ventas || []) {
    const fecha = ymdLocal(v.created_at);
    const turnoId = v.turno_id ? String(v.turno_id) : '';
    const turnoNombre = v.turno_nombre || turnoId || 'Sin turno';
    if (turnoFiltro) {
      const tf = String(turnoFiltro).toLowerCase();
      const blob = `${turnoId} ${turnoNombre}`.toLowerCase();
      if (!blob.includes(tf) && turnoId !== turnoFiltro) continue;
    }
    const suc = normalizarCodigoTienda(v.sucursal_id) || '—';
    const key = `${fecha}|${suc}|${turnoId || turnoNombre}`;
    if (!map.has(key)) {
      map.set(key, {
        id: key,
        fecha,
        sucursal: suc,
        turno_id: turnoId || null,
        turno_nombre: turnoNombre,
        tickets: 0,
        total: 0,
        vendedores: new Set(),
        metodos: {},
        ventas: [],
      });
    }
    const g = map.get(key);
    g.tickets += 1;
    g.total += Number(v.total) || 0;
    if (v.vendedor) g.vendedores.add(v.vendedor);
    const mp = String(v.metodo_pago || 'Sin método');
    g.metodos[mp] = (g.metodos[mp] || 0) + (Number(v.total) || 0);
    g.ventas.push(v);
  }
  return [...map.values()]
    .map((g) => ({
      ...g,
      vendedores: [...g.vendedores],
      detalleMetodos: Object.entries(g.metodos)
        .map(([metodo, monto]) => ({ metodo, monto }))
        .sort((a, b) => b.monto - a.monto),
      ticketPromedio: g.tickets ? g.total / g.tickets : 0,
    }))
    .sort((a, b) => {
      if (a.fecha !== b.fecha) return String(b.fecha).localeCompare(String(a.fecha));
      return String(a.turno_nombre).localeCompare(String(b.turno_nombre), 'es');
    });
}

export function ventasConProducto(ventas, productoId) {
  const pid = String(productoId);
  const out = [];
  for (const v of ventas || []) {
    const arts = v.articulos || [];
    const line = arts.find((a) => String(a.id) === pid);
    if (!line) continue;
    const qty = Number(line.qty) || 1;
    const precio = Number(line.precio) || 0;
    out.push({
      id: `venta_${v.id}`,
      tipo: 'venta',
      created_at: v.created_at,
      cantidad: qty,
      stock_antes: null,
      stock_despues: null,
      usuario: v.vendedor,
      sucursal: v.sucursal_id,
      motivo: `Venta · ${v.metodo_pago || ''}`.trim(),
      subtotal: precio * qty,
      venta_id: v.id,
      producto_nombre: line.nombre,
    });
  }
  return out.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
}

function eventoDesdeMovimiento(m, productoId) {
  const pid = String(productoId);
  const esDestino = String(m.producto_destino_id) === pid;
  return {
    id: m.id,
    tipo: m.tipo,
    created_at: m.created_at,
    cantidad: m.cantidad,
    stock_antes: esDestino ? m.stock_dest_antes : m.stock_antes,
    stock_despues: esDestino ? m.stock_dest_despues : m.stock_despues,
    usuario: m.usuario,
    sucursal: m.sucursal,
    motivo: m.motivo,
    modo: m.modo,
    producto_nombre: esDestino ? m.producto_destino_nombre : m.producto_nombre,
    producto_destino_nombre: m.producto_destino_nombre,
    detalle:
      m.tipo === 'traspaso'
        ? `${m.producto_nombre} → ${m.producto_destino_nombre}`
        : m.producto_nombre,
  };
}

function dedupeVentasConMovimientos(eventosMov, eventosVenta) {
  return eventosVenta.filter((v) => {
    const t = new Date(v.created_at).getTime();
    return !eventosMov.some(
      (m) =>
        m.modo === 'venta' &&
        Math.abs(new Date(m.created_at).getTime() - t) < 120000 &&
        Number(m.cantidad) === Number(v.cantidad),
    );
  });
}

export function timelineProducto(productoId, ventas, movimientos, filtroEvento = 'todos') {
  const pid = String(productoId);
  const movs = (movimientos || []).filter(
    (m) => String(m.producto_id) === pid || String(m.producto_destino_id) === pid,
  );
  const eventosMov = movs.map((m) => eventoDesdeMovimiento(m, pid));
  const eventosVenta = dedupeVentasConMovimientos(eventosMov, ventasConProducto(ventas, pid));

  let eventos = [...eventosMov, ...eventosVenta].sort(
    (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0),
  );

  return eventos.filter((e) => coincideFiltroEventoProducto(e, filtroEvento));
}

function coincideFiltroEventoProducto(e, filtroEvento) {
  if (!filtroEvento || filtroEvento === 'todos') return true;
  if (filtroEvento === 'existencia') return e.stock_antes != null || e.stock_despues != null;
  if (filtroEvento === 'entradas') {
    return e.tipo === 'entrada' || (e.tipo === 'traspaso' && Number(e.stock_despues) > Number(e.stock_antes));
  }
  if (filtroEvento === 'salidas') {
    return (
      e.tipo === 'retiro' ||
      e.tipo === 'venta' ||
      e.modo === 'venta' ||
      (e.tipo === 'traspaso' && Number(e.stock_despues) < Number(e.stock_antes))
    );
  }
  if (filtroEvento === 'ajustes') return esMovimientoAjuste(e);
  if (filtroEvento === 'precios') return e.tipo === 'cambio_precio' || e.modo === 'precio';
  if (filtroEvento === 'cancelaciones') return e.modo === 'cancelacion' || e.tipo === 'cancelacion';
  if (filtroEvento === 'negativo') return esStockNegativo(e);
  return true;
}

export function filtrarMovimientosPorEvento(movimientos, filtroEvento) {
  if (!filtroEvento || filtroEvento === 'todos') return movimientos || [];
  const fake = (movimientos || []).map((m) => eventoDesdeMovimiento(m, m.producto_id));
  return fake
    .filter((e) => coincideFiltroEventoProducto(e, filtroEvento))
    .map((e) => movimientos.find((m) => m.id === e.id))
    .filter(Boolean);
}

export function buscarProductos(inventario, q) {
  const t = String(q || '').trim();
  if (!t) return [];
  return filtrarProductosPorTexto(inventario, t);
}

export const PRESETS_FECHA_PRODUCTO = [
  { id: 'hoy', label: 'Día (hoy)' },
  { id: 'semana', label: 'Semana actual' },
  { id: '7d', label: 'Últimos 7 días' },
  { id: 'mes', label: 'Mes actual' },
  { id: 'mes_ant', label: 'Mes anterior' },
  { id: '6m', label: 'Últimos 6 meses' },
  { id: 'rango', label: 'Rango de fechas' },
];

/** Presets de periodo para Consultas → Inventarios. */
export const PRESETS_CONSULTAS_INVENTARIO = [
  { id: 'hoy', label: 'Día' },
  { id: 'semana', label: 'Semana' },
  { id: 'mes', label: 'Mes' },
  { id: '6m', label: 'Últimos 6 meses' },
  { id: 'rango', label: 'Rango de fechas' },
];

export const FILTROS_HISTORIAL_TIPO = [
  { id: '', label: 'Todos los tipos' },
  { id: 'ingreso', label: 'Ingreso' },
  { id: 'retiro', label: 'Retiro' },
  { id: 'ajuste', label: 'Ajuste' },
];

const MODOS_AJUSTE = new Set([
  'masivo',
  'departamento',
  'conteo_departamento',
  'conteo_correccion',
  'ubicacion',
  'vaciado_inventario',
  'libre',
  'movimiento',
]);

export function esMovimientoAjuste(m) {
  if (!m) return false;
  if (m.tipo === 'ajuste' || m.tipo === 'traspaso') return true;
  return MODOS_AJUSTE.has(m.modo);
}

export function matchHistorialTipo(m, filtro) {
  if (!filtro) return true;
  if (filtro === 'ingreso') return m.tipo === 'entrada';
  if (filtro === 'retiro') return m.tipo === 'retiro';
  if (filtro === 'ajuste') return esMovimientoAjuste(m);
  return true;
}

export function filtrarHistorialReciente(movimientos, opts = {}) {
  const { tipo, desde, hasta } = opts;
  return (movimientos || [])
    .filter((m) => matchHistorialTipo(m, tipo))
    .filter((m) => enRango(m.created_at, desde, hasta));
}

function toYmd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function rangoDesdePreset(preset) {
  const hoy = new Date();
  const hasta = toYmd(hoy);
  if (preset === 'hoy') return { desde: hasta, hasta };
  if (preset === 'semana') {
    const day = hoy.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const ini = new Date(hoy);
    ini.setDate(hoy.getDate() + diff);
    return { desde: toYmd(ini), hasta };
  }
  if (preset === '7d') return { desde: toYmd(new Date(hoy.getTime() - 7 * 864e5)), hasta };
  if (preset === 'mes') return { desde: toYmd(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), hasta };
  if (preset === 'mes_ant') {
    const ini = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
    const fin = new Date(hoy.getFullYear(), hoy.getMonth(), 0);
    return { desde: toYmd(ini), hasta: toYmd(fin) };
  }
  if (preset === '6m') {
    const d = new Date(hoy);
    d.setMonth(d.getMonth() - 6);
    return { desde: toYmd(d), hasta };
  }
  return null;
}
