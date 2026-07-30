/**
 * Traspasos de inventario simplificados:
 * - MAIN (CEDIS) → sucursal (piso)
 * - sucursal (piso) → sucursal (piso)
 * Flujo: enviar (descuenta origen) → recibir (suma destino) · solicitar.
 */
import {
  ALMACEN_CENTRAL,
  esAlmacenCentral,
  stockEnUbicacion,
  asegurarMapaStock,
  normalizarMapaStockCedisUnico,
  sucursalParaUbicacion,
} from './inventarioMultitienda.js';
import { etiquetaTienda, listarSucursalesOperativas, normalizarCodigoTienda } from '../constants/sucursales.js';
import { guardarMovimientoLocal } from './inventarioMovimientos.js';

const LS = 'pos3b_inventario_traspasos';
const LS_FOLIO = 'pos3b_folio_traspaso_seq';

export const AVISO_SQL_TRASPASOS =
  'Para sincronizar traspasos entre equipos ejecuta supabase/fix_inventario_traspasos.sql en Supabase.';

function faltaTabla(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return (
    error?.code === '42P01' ||
    msg.includes('inventario_traspasos') ||
    (msg.includes('schema cache') && msg.includes('traspaso'))
  );
}

export function generarFolioTrp() {
  let seq = 1;
  try {
    const raw = localStorage.getItem(LS_FOLIO);
    const o = raw ? JSON.parse(raw) : {};
    seq = Math.max(1, (Number(o.seq) || 0) + 1);
    localStorage.setItem(LS_FOLIO, JSON.stringify({ seq }));
  } catch {
    seq = Math.floor(Math.random() * 9000) + 1;
  }
  const ancho = seq <= 9999 ? 4 : String(seq).length;
  return `trp-${String(seq).padStart(ancho, '0')}`;
}

function leerLocal() {
  try {
    const raw = localStorage.getItem(LS);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function guardarLocal(list) {
  localStorage.setItem(LS, JSON.stringify(list.slice(0, 400)));
}

export function etiquetaOrigenTraspaso(codigo) {
  if (esAlmacenCentral(codigo)) return 'Almacén principal';
  return etiquetaTienda(codigo);
}

export function destinosPermitidosPara(origenId) {
  const origen = normalizarCodigoTienda(origenId);
  // Solo MAIN→sucursal o sucursal→sucursal (nunca a MAIN).
  return listarSucursalesOperativas().filter((s) => s !== origen);
}

export function validarRutaTraspaso(origenId, destinoId) {
  const o = normalizarCodigoTienda(origenId);
  const d = normalizarCodigoTienda(destinoId);
  if (!o || !d) return { ok: false, error: 'Selecciona origen y destino.' };
  if (o === d) return { ok: false, error: 'Origen y destino deben ser distintos.' };
  if (esAlmacenCentral(d)) {
    return { ok: false, error: 'No se puede traspasar hacia el almacén (MAIN). Solo MAIN→sucursal o sucursal→sucursal.' };
  }
  if (!esAlmacenCentral(o) && !listarSucursalesOperativas().includes(o)) {
    return { ok: false, error: 'Sucursal de origen no válida.' };
  }
  if (!listarSucursalesOperativas().includes(d)) {
    return { ok: false, error: 'Sucursal destino no válida.' };
  }
  return {
    ok: true,
    origen_id: o,
    destino_id: d,
    ubicacion_origen: esAlmacenCentral(o) ? 'cedis' : 'piso',
    ubicacion_destino: 'piso',
  };
}

function stockVistaProducto(producto, sucursal, ubicacion) {
  return stockEnUbicacion(producto, sucursal, ubicacion, sucursal);
}

function patchDeltaUbicacion(producto, sucursal, ubicacion, delta, sucursalActiva) {
  const ctx = sucursalActiva || sucursal;
  const antes = stockEnUbicacion(producto, sucursal, ubicacion, ctx);
  const qty = Math.floor(Number(delta));
  const despues = antes + qty;
  if (despues < 0) {
    return { ok: false, error: `Stock insuficiente (hay ${antes}, pides ${Math.abs(qty)}).`, antes };
  }
  const map = { ...asegurarMapaStock(producto, ctx) };
  const sucStock = sucursalParaUbicacion(sucursal, ubicacion);
  if (!map[sucStock]) map[sucStock] = { cedis: 0, piso: 0 };
  map[sucStock][ubicacion] = despues;
  const normalized = normalizarMapaStockCedisUnico(map);
  const patch = { stock_sucursales: normalized };
  const act = normalizarCodigoTienda(sucursalActiva);
  if (act && normalized[act]) patch.stock = normalized[act].piso;
  patch.stock_cedis = Math.max(0, Number(normalized[ALMACEN_CENTRAL]?.cedis) || 0);
  return { ok: true, patch, antes, despues };
}

async function upsertTraspaso(supabase, row, { requireCloud = false } = {}) {
  if (supabase) {
    const { data, error } = await supabase.from('inventario_traspasos').upsert(row).select('*').single();
    if (!error) return { ok: true, data, fuente: 'nube' };
    if (!faltaTabla(error)) return { ok: false, error: error.message };
    if (requireCloud) {
      return {
        ok: false,
        error:
          'No se pudo guardar el traspaso en la nube. Ejecuta supabase/fix_inventario_traspasos.sql en Supabase. ' +
          'Sin esa tabla la tienda destino NO verá el envío y el stock no se sumará al recibir.',
      };
    }
  } else if (requireCloud) {
    return { ok: false, error: 'Sin conexión a Supabase. El traspaso no se puede sincronizar entre tiendas.' };
  }
  const list = leerLocal();
  const i = list.findIndex((t) => t.id === row.id);
  if (i >= 0) list[i] = row;
  else list.unshift(row);
  guardarLocal(list);
  return { ok: true, data: row, fuente: 'local', aviso: AVISO_SQL_TRASPASOS };
}

export async function listarTraspasos(supabase, { sucursal, rol } = {}) {
  const suc = normalizarCodigoTienda(sucursal);
  if (supabase) {
    const { data, error } = await supabase
      .from('inventario_traspasos')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(300);
    if (!error) {
      const all = data || [];
      if (!suc) return { data: all, fuente: 'nube' };
      return {
        data: all.filter((t) => t.origen_id === suc || t.destino_id === suc),
        fuente: 'nube',
      };
    }
    if (!faltaTabla(error)) return { data: [], error: error.message, fuente: 'nube' };
  }
  let list = leerLocal();
  if (suc) list = list.filter((t) => t.origen_id === suc || t.destino_id === suc);
  return { data: list, fuente: 'local', aviso: AVISO_SQL_TRASPASOS };
}

/** Envíos pendientes de recibir en esta sucursal. */
export function filtrarParaRecibir(traspasos, sucursal) {
  const suc = normalizarCodigoTienda(sucursal);
  return (traspasos || []).filter((t) => t.tipo === 'envio' && t.estado === 'enviado' && t.destino_id === suc);
}

/** Solicitudes que debo atender (yo soy el origen). */
export function filtrarSolicitudesPendientes(traspasos, sucursal) {
  const suc = normalizarCodigoTienda(sucursal);
  return (traspasos || []).filter((t) => t.tipo === 'solicitud' && t.estado === 'solicitud' && t.origen_id === suc);
}

/** Mis solicitudes hechas (yo soy destino). */
export function filtrarMisSolicitudes(traspasos, sucursal) {
  const suc = normalizarCodigoTienda(sucursal);
  return (traspasos || []).filter((t) => t.tipo === 'solicitud' && t.destino_id === suc);
}

export async function crearSolicitudTraspaso(supabase, opts = {}) {
  const {
    origenId,
    destinoId,
    lineas = [],
    notas = '',
    usuario,
  } = opts;
  // Solicitud: destino pide a origen. origen = quien debe enviar; destino = quien recibe.
  const ruta = validarRutaTraspaso(origenId, destinoId);
  if (!ruta.ok) return ruta;
  const items = (lineas || [])
    .map((l) => ({
      producto_id: String(l.producto_id || l.id || ''),
      nombre: l.nombre || l.producto_nombre || '',
      cantidad: Math.floor(Number(l.cantidad) || 0),
      precio: Number(l.precio) || 0,
      costo: Number(l.costo) || 0,
    }))
    .filter((l) => l.producto_id && l.cantidad > 0);
  if (!items.length) return { ok: false, error: 'Agrega al menos un producto a la solicitud.' };

  const row = {
    id: crypto.randomUUID?.() || `loc-${Date.now()}`,
    folio: generarFolioTrp(),
    tipo: 'solicitud',
    estado: 'solicitud',
    origen_id: ruta.origen_id,
    destino_id: ruta.destino_id,
    ubicacion_origen: ruta.ubicacion_origen,
    ubicacion_destino: ruta.ubicacion_destino,
    notas: String(notas || '').trim() || null,
    usuario_crea: usuario || null,
    usuario_envia: null,
    usuario_recibe: null,
    solicitud_id: null,
    lineas: items,
    created_at: new Date().toISOString(),
    enviado_at: null,
    recibido_at: null,
  };
  return upsertTraspaso(supabase, row, { requireCloud: true });
}

export async function enviarTraspaso(supabase, opts = {}) {
  const {
    origenId,
    destinoId,
    lineas = [],
    notas = '',
    usuario,
    inventario = [],
    solicitudId = null,
  } = opts;
  const ruta = validarRutaTraspaso(origenId, destinoId);
  if (!ruta.ok) return ruta;

  const items = (lineas || [])
    .map((l) => ({
      producto_id: String(l.producto_id || l.id || ''),
      nombre: l.nombre || l.producto_nombre || '',
      cantidad: Math.floor(Number(l.cantidad) || 0),
      precio: Number(l.precio) || 0,
      costo: Number(l.costo) || 0,
    }))
    .filter((l) => l.producto_id && l.cantidad > 0);
  if (!items.length) return { ok: false, error: 'Agrega al menos un producto.' };

  // Descontar stock en origen (guardar patches por si hay que revertir)
  const vivos = new Map((inventario || []).map((p) => [String(p.id), { ...p }]));
  const descuentos = [];
  for (const item of items) {
    const prod = vivos.get(item.producto_id);
    if (!prod) return { ok: false, error: `Producto ${item.producto_id} no encontrado.` };
    const calc = patchDeltaUbicacion(
      prod,
      ruta.origen_id,
      ruta.ubicacion_origen,
      -item.cantidad,
      ruta.origen_id,
    );
    if (!calc.ok) {
      return {
        ok: false,
        error: `${item.nombre || item.producto_id}: ${calc.error}`,
      };
    }
    if (!supabase) return { ok: false, error: 'Sin conexión a Supabase para actualizar stock.' };
    const { error } = await supabase.from('productos').update(calc.patch).eq('id', item.producto_id);
    if (error) return { ok: false, error: error.message };
    descuentos.push({
      producto_id: item.producto_id,
      revertPatch: {
        stock_sucursales: prod.stock_sucursales,
        stock: prod.stock,
        stock_cedis: prod.stock_cedis,
      },
    });
    vivos.set(item.producto_id, { ...prod, ...calc.patch });
    item.stock_origen_antes = calc.antes;
    item.stock_origen_despues = calc.despues;
  }

  const folio = generarFolioTrp();
  const row = {
    id: crypto.randomUUID?.() || `loc-${Date.now()}`,
    folio,
    tipo: 'envio',
    estado: 'enviado',
    origen_id: ruta.origen_id,
    destino_id: ruta.destino_id,
    ubicacion_origen: ruta.ubicacion_origen,
    ubicacion_destino: ruta.ubicacion_destino,
    notas: String(notas || '').trim() || null,
    usuario_crea: usuario || null,
    usuario_envia: usuario || null,
    usuario_recibe: null,
    solicitud_id: solicitudId || null,
    lineas: items,
    created_at: new Date().toISOString(),
    enviado_at: new Date().toISOString(),
    recibido_at: null,
  };

  // Obligatorio en nube: si solo queda local, 3B5 (u otra caja) nunca podrá recibir.
  const saved = await upsertTraspaso(supabase, row, { requireCloud: true });
  if (!saved.ok) {
    for (const d of descuentos) {
      await supabase.from('productos').update(d.revertPatch).eq('id', d.producto_id);
    }
    return saved;
  }

  // Cerrar solicitud origen si aplica
  if (solicitudId && supabase) {
    await supabase
      .from('inventario_traspasos')
      .update({ estado: 'enviado', enviado_at: row.enviado_at })
      .eq('id', solicitudId)
      .eq('tipo', 'solicitud');
  } else if (solicitudId) {
    const list = leerLocal().map((t) =>
      t.id === solicitudId ? { ...t, estado: 'enviado', enviado_at: row.enviado_at } : t,
    );
    guardarLocal(list);
  }

  for (const item of items) {
    guardarMovimientoLocal(
      {
        tipo: 'traspaso',
        modo: 'ubicacion',
        folio,
        producto_id: item.producto_id,
        producto_nombre: item.nombre,
        cantidad: item.cantidad,
        stock_antes: item.stock_origen_antes,
        stock_despues: item.stock_origen_despues,
        motivo: `Traspaso salida ${folio} → ${etiquetaOrigenTraspaso(ruta.destino_id)}`,
        usuario: usuario || '—',
        sucursal: ruta.origen_id,
        sucursal_origen: ruta.origen_id,
        sucursal_destino: ruta.destino_id,
        ubicacion_origen: ruta.ubicacion_origen,
        ubicacion_destino: ruta.ubicacion_destino,
        traspaso_origen: etiquetaOrigenTraspaso(ruta.origen_id),
        traspaso_destino: etiquetaOrigenTraspaso(ruta.destino_id),
        created_at: new Date().toISOString(),
      },
      supabase,
    );
  }

  return {
    ok: true,
    traspaso: saved.data,
    aviso: saved.aviso,
    mensaje: `Traspaso ${folio} enviado a ${etiquetaOrigenTraspaso(ruta.destino_id)}. Pendiente de recibir.`,
  };
}

export async function recibirTraspaso(supabase, opts = {}) {
  const { traspasoId, usuario, inventario = [] } = opts;
  if (!traspasoId) return { ok: false, error: 'Sin traspaso.' };

  let doc = null;
  if (supabase) {
    const { data, error } = await supabase.from('inventario_traspasos').select('*').eq('id', traspasoId).maybeSingle();
    if (!error) doc = data;
    else if (!faltaTabla(error)) return { ok: false, error: error.message };
  }
  if (!doc) doc = leerLocal().find((t) => t.id === traspasoId) || null;
  if (!doc) return { ok: false, error: 'Traspaso no encontrado.' };
  if (doc.estado !== 'enviado') return { ok: false, error: `No se puede recibir (estado: ${doc.estado}).` };

  const vivos = new Map((inventario || []).map((p) => [String(p.id), { ...p }]));
  const lineas = Array.isArray(doc.lineas) ? doc.lineas : [];

  for (const item of lineas) {
    let prod = vivos.get(String(item.producto_id));
    if (!prod && supabase) {
      const { data } = await supabase.from('productos').select('*').eq('id', item.producto_id).maybeSingle();
      prod = data;
    }
    if (!prod) return { ok: false, error: `Producto ${item.producto_id} no encontrado al recibir.` };
    const calc = patchDeltaUbicacion(
      prod,
      doc.destino_id,
      doc.ubicacion_destino || 'piso',
      item.cantidad,
      doc.destino_id,
    );
    if (!calc.ok) return { ok: false, error: `${item.nombre}: ${calc.error}` };
    if (!supabase) return { ok: false, error: 'Sin conexión a Supabase para actualizar stock.' };
    const { error } = await supabase.from('productos').update(calc.patch).eq('id', item.producto_id);
    if (error) return { ok: false, error: error.message };
    vivos.set(String(item.producto_id), { ...prod, ...calc.patch });
    item.stock_destino_antes = calc.antes;
    item.stock_destino_despues = calc.despues;

    guardarMovimientoLocal(
      {
        tipo: 'traspaso',
        modo: 'ubicacion',
        folio: doc.folio,
        producto_id: item.producto_id,
        producto_nombre: item.nombre,
        cantidad: item.cantidad,
        stock_antes: calc.antes,
        stock_despues: calc.despues,
        motivo: `Traspaso recepción ${doc.folio} ← ${etiquetaOrigenTraspaso(doc.origen_id)}`,
        usuario: usuario || '—',
        sucursal: doc.destino_id,
        sucursal_origen: doc.origen_id,
        sucursal_destino: doc.destino_id,
        ubicacion_origen: doc.ubicacion_origen,
        ubicacion_destino: doc.ubicacion_destino,
        traspaso_origen: etiquetaOrigenTraspaso(doc.origen_id),
        traspaso_destino: etiquetaOrigenTraspaso(doc.destino_id),
        created_at: new Date().toISOString(),
      },
      supabase,
    );
  }

  const updated = {
    ...doc,
    lineas,
    estado: 'recibido',
    usuario_recibe: usuario || null,
    recibido_at: new Date().toISOString(),
  };
  const saved = await upsertTraspaso(supabase, updated, { requireCloud: true });
  if (!saved.ok) return saved;
  return {
    ok: true,
    traspaso: saved.data,
    mensaje: `Traspaso ${doc.folio} recibido en ${etiquetaOrigenTraspaso(doc.destino_id)}.`,
    productosActualizados: [...vivos.values()],
  };
}

export async function cancelarTraspaso(supabase, { traspasoId, usuario } = {}) {
  // Solo solicitudes o envíos no recibidos; si ya descontó stock al enviar, habría que revertir — solo permitir cancelar solicitud.
  let doc = null;
  if (supabase) {
    const { data } = await supabase.from('inventario_traspasos').select('*').eq('id', traspasoId).maybeSingle();
    doc = data;
  }
  if (!doc) doc = leerLocal().find((t) => t.id === traspasoId);
  if (!doc) return { ok: false, error: 'No encontrado.' };
  if (doc.tipo === 'envio' && doc.estado === 'enviado') {
    return { ok: false, error: 'Un envío ya despachado no se cancela aquí; debe recibirlo el destino o anularse en central.' };
  }
  if (doc.estado === 'recibido') return { ok: false, error: 'Ya fue recibido.' };
  const updated = { ...doc, estado: 'cancelado', notas: `${doc.notas || ''} · canceló ${usuario || ''}`.trim() };
  return upsertTraspaso(supabase, updated);
}

export function stockOrigenDisponible(producto, origenId) {
  const o = normalizarCodigoTienda(origenId);
  const ubi = esAlmacenCentral(o) ? 'cedis' : 'piso';
  return stockVistaProducto(producto, o, ubi);
}

export function stockDestinoDisponible(producto, destinoId) {
  const d = normalizarCodigoTienda(destinoId);
  return stockVistaProducto(producto, d, 'piso');
}
