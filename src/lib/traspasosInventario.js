/**
 * Traspasos de inventario simplificados:
 * - MAIN (CEDIS) → sucursal (piso)
 * - sucursal (piso) → sucursal (piso)
 * Flujo: enviar (descuenta origen) → recibir (suma destino) · solicitar.
 */
import {
  esAlmacenCentral,
  stockEnUbicacion,
} from './inventarioMultitienda.js';
import { etiquetaTienda, listarSucursalesOperativas, normalizarCodigoTienda } from '../constants/sucursales.js';
import { guardarMovimientoLocal, aplicarDeltaStockAtomico } from './inventarioMovimientos.js';

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
  if (esAlmacenCentral(codigo)) return 'CEDIS · almacén';
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

/**
 * Aplica delta de stock con RPC atómica (no reescribe el JSON completo).
 */
async function aplicarDeltaProductoVerificado(supabase, opts) {
  const { productoId, sucursal, ubicacion, delta } = opts;
  if (!supabase) return { ok: false, error: 'Sin conexión a Supabase para actualizar stock.' };
  const d = Math.floor(Number(delta) || 0);
  const r = await aplicarDeltaStockAtomico(supabase, {
    productoId,
    sucursal,
    ubicacion: ubicacion || 'piso',
    delta: d,
  });
  if (!r.ok) return r;
  return {
    ok: true,
    calc: { antes: r.antes, despues: r.despues, patch: r.patch },
    producto: r.producto || { id: productoId, ...r.patch },
    // Compensación segura: delta inverso (no reescribir mapa viejo).
    revertDelta: -d,
    revertSucursal: sucursal,
    revertUbicacion: ubicacion || 'piso',
  };
}

async function revertirDeltasAtomicos(supabase, items) {
  for (const d of items || []) {
    await aplicarDeltaStockAtomico(supabase, {
      productoId: d.producto_id,
      sucursal: d.revertSucursal,
      ubicacion: d.revertUbicacion,
      delta: d.revertDelta,
    });
  }
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
  if (!supabase) return { ok: false, error: 'Sin conexión a Supabase para actualizar stock.' };

  const descuentos = [];
  for (const item of items) {
    const r = await aplicarDeltaProductoVerificado(supabase, {
      productoId: item.producto_id,
      sucursal: ruta.origen_id,
      ubicacion: ruta.ubicacion_origen,
      delta: -item.cantidad,
      sucursalActiva: ruta.origen_id,
    });
    if (!r.ok) {
      await revertirDeltasAtomicos(supabase, descuentos);
      return { ok: false, error: `${item.nombre || item.producto_id}: ${r.error}` };
    }
    descuentos.push({
      producto_id: item.producto_id,
      revertDelta: r.revertDelta,
      revertSucursal: r.revertSucursal,
      revertUbicacion: r.revertUbicacion,
    });
    item.stock_origen_antes = r.calc.antes;
    item.stock_origen_despues = r.calc.despues;
    item._productoActualizado = r.producto;
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
    lineas: items.map(({ _productoActualizado, ...rest }) => rest),
    created_at: new Date().toISOString(),
    enviado_at: new Date().toISOString(),
    recibido_at: null,
  };

  // Obligatorio en nube: si solo queda local, el destino nunca podrá recibir.
  const saved = await upsertTraspaso(supabase, row, { requireCloud: true });
  if (!saved.ok) {
    await revertirDeltasAtomicos(supabase, descuentos);
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
    mensaje: `Traspaso ${folio} enviado a ${etiquetaOrigenTraspaso(ruta.destino_id)}. Pendiente de recibir en destino (ahí se suman las piezas).`,
    productosActualizados: items.map((i) => i._productoActualizado).filter(Boolean),
  };
}

export async function recibirTraspaso(supabase, opts = {}) {
  const { traspasoId, usuario } = opts;
  if (!traspasoId) return { ok: false, error: 'Sin traspaso.' };
  if (!supabase) return { ok: false, error: 'Sin conexión a Supabase.' };

  let doc = null;
  const { data, error } = await supabase.from('inventario_traspasos').select('*').eq('id', traspasoId).maybeSingle();
  if (error && !faltaTabla(error)) return { ok: false, error: error.message };
  if (!error) doc = data;
  if (!doc) doc = leerLocal().find((t) => t.id === traspasoId) || null;
  if (!doc) return { ok: false, error: 'Traspaso no encontrado.' };
  if (doc.estado !== 'enviado') return { ok: false, error: `No se puede recibir (estado: ${doc.estado}).` };

  const lineas = Array.isArray(doc.lineas) ? doc.lineas : [];
  if (!lineas.length) return { ok: false, error: 'El traspaso no tiene líneas de productos.' };

  const productosActualizados = [];
  const lineasOut = [];
  const aplicados = [];

  const revertirAplicados = async () => {
    await revertirDeltasAtomicos(supabase, aplicados);
  };

  for (const item of lineas) {
    const pid = String(item.producto_id || '');
    const qty = Math.floor(Number(item.cantidad) || 0);
    if (!pid || qty < 1) continue;

    const r = await aplicarDeltaProductoVerificado(supabase, {
      productoId: pid,
      sucursal: doc.destino_id,
      ubicacion: doc.ubicacion_destino || 'piso',
      delta: qty,
    });
    if (!r.ok) {
      await revertirAplicados();
      return { ok: false, error: `${item.nombre || pid}: ${r.error}` };
    }

    aplicados.push({
      producto_id: pid,
      revertDelta: r.revertDelta,
      revertSucursal: r.revertSucursal,
      revertUbicacion: r.revertUbicacion,
    });

    const linea = {
      ...item,
      producto_id: pid,
      cantidad: qty,
      stock_destino_antes: r.calc.antes,
      stock_destino_despues: r.calc.despues,
    };
    lineasOut.push(linea);
    productosActualizados.push(r.producto);
  }

  if (!lineasOut.length) return { ok: false, error: 'Ninguna línea válida para recibir.' };

  const updated = {
    ...doc,
    lineas: lineasOut,
    estado: 'recibido',
    usuario_recibe: usuario || null,
    recibido_at: new Date().toISOString(),
  };
  const saved = await upsertTraspaso(supabase, updated, { requireCloud: true });
  if (!saved.ok) {
    await revertirAplicados();
    return saved;
  }

  for (const linea of lineasOut) {
    guardarMovimientoLocal(
      {
        tipo: 'traspaso',
        modo: 'ubicacion',
        folio: doc.folio,
        producto_id: linea.producto_id,
        producto_nombre: linea.nombre,
        cantidad: linea.cantidad,
        stock_antes: linea.stock_destino_antes,
        stock_despues: linea.stock_destino_despues,
        motivo: `Traspaso recepción ${doc.folio} ← ${etiquetaOrigenTraspaso(doc.origen_id)}`,
        usuario: usuario || '—',
        sucursal: doc.destino_id,
        sucursal_origen: doc.origen_id,
        sucursal_destino: doc.destino_id,
        ubicacion_origen: doc.ubicacion_origen,
        ubicacion_destino: doc.ubicacion_destino || 'piso',
        traspaso_origen: etiquetaOrigenTraspaso(doc.origen_id),
        traspaso_destino: etiquetaOrigenTraspaso(doc.destino_id),
        created_at: new Date().toISOString(),
      },
      supabase,
    );
  }

  const piezas = lineasOut.reduce((s, l) => s + (Number(l.cantidad) || 0), 0);
  return {
    ok: true,
    traspaso: saved.data,
    mensaje:
      `Traspaso ${doc.folio} recibido en ${etiquetaOrigenTraspaso(doc.destino_id)}: ` +
      `+${piezas} pieza(s) al piso. ` +
      lineasOut.map((l) => `${l.nombre || l.producto_id}: ${l.stock_destino_antes} → ${l.stock_destino_despues}`).join('; '),
    productosActualizados,
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
