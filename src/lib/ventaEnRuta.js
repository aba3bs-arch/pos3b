/**
 * Venta en Ruta POS v2
 * MAIN (CEDIS) → carga camión → POS móvil → efectivo en tránsito / crédito CxC
 * → pedido en Compras para la sucursal.
 */

import { etiquetaTienda, listarSucursalesOperativas, normalizarCodigoTienda, ALMACEN_CENTRAL } from '../constants/sucursales.js';
import {
  aplicarMovimientoInventario,
  leerProductoInventarioFresco,
} from './inventarioMovimientos.js';
import { stockAlmacenCentral, asegurarMapaStock, buildPatchStock } from './inventarioMultitienda.js';
import { esRolRepartidor, normalizarRol } from './roles.js';
import { registrarCargoCreditoRuta } from './rutaCxc.js';
import { registrarEfectivoTransitoVentaRuta } from './rutaTransito.js';
import { puedeAccionVentaRuta } from './ventaEnRutaAcciones.js';
import { buscarUsuarioPorPinYSucursal } from './usuariosAuth.js';
import { listarRepartidores } from './controlEfectivo.js';

export { registrarEfectivoTransitoVentaRuta } from './rutaTransito.js';

function normNombrePersona(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

const LS_CLIENTES = 'pos3b_ruta_clientes';
const LS_CARGAS = 'pos3b_ruta_cargas';
const LS_LINEAS = 'pos3b_ruta_carga_lineas';
const LS_VENTAS = 'pos3b_ruta_ventas';

export const AVISO_FALTA_VENTA_RUTA =
  'Faltan tablas de Venta en Ruta. En Supabase ejecuta supabase/fix_autofin_y_venta_ruta_completo.sql (o fix_venta_en_ruta.sql + fix_precio_ruta_y_cxc.sql + fix_venta_ruta_pos_v2.sql).';

export const NOMBRE_ALMACEN_RUTA = 'CEDIS · centro de distribución';

/**
 * Asegura que stock_sucursales.CEDIS.cedis refleje stock_cedis / MAIN.cedis legado
 * antes de descontar (el RPC antiguo a veces partía de 0 y no tocaba el almacén real).
 */
export async function sincronizarStockCedisProducto(supabase, producto) {
  if (!supabase || !producto?.id) return { ok: false, error: 'Sin producto.' };
  const map = asegurarMapaStock(producto, ALMACEN_CENTRAL);
  const cedisMap = Math.floor(Number(map[ALMACEN_CENTRAL]?.cedis) || 0);
  const rawMap = producto.stock_sucursales && typeof producto.stock_sucursales === 'object'
    ? producto.stock_sucursales
    : {};
  const rawCedis = Math.floor(Number(rawMap?.[ALMACEN_CENTRAL]?.cedis) || 0);
  const rawMain = Math.floor(Number(rawMap?.MAIN?.cedis) || 0);
  const legacy = Math.floor(Number(producto.stock_cedis) || 0);
  const necesitaSync = cedisMap !== rawCedis || rawMain > 0 || (legacy > rawCedis && cedisMap !== legacy);
  if (!necesitaSync && cedisMap === legacy) {
    return { ok: true, producto, stock: cedisMap, sync: false };
  }
  const patch = {
    stock_sucursales: map,
    stock_cedis: Math.max(0, cedisMap),
  };
  const { error } = await supabase.from('productos').update(patch).eq('id', producto.id);
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    producto: { ...producto, ...patch },
    stock: cedisMap,
    sync: true,
    patch,
  };
}

/**
 * Descuenta piezas del almacén CEDIS para una carga de camión.
 * Preferencia: movimiento atómico; si falta RPC, patch JSON de respaldo.
 */
export async function descontarCedisParaCarga(supabase, {
  producto,
  cantidad,
  motivo,
  usuario,
  folio,
} = {}) {
  const qty = Math.floor(Math.abs(Number(cantidad) || 0));
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  if (!producto?.id || !(qty > 0)) return { ok: false, error: 'Producto o cantidad inválidos.' };

  const fresco = await leerProductoInventarioFresco(supabase, producto.id);
  if (!fresco.ok) return fresco;

  const sync = await sincronizarStockCedisProducto(supabase, fresco.producto);
  if (!sync.ok) return sync;
  const prod = sync.producto;
  const disponible = stockAlmacenCentral(prod);
  if (disponible < qty) {
    return {
      ok: false,
      error: `Stock insuficiente en CEDIS (hay ${disponible}, pides ${qty}).`,
    };
  }

  const mov = await aplicarMovimientoInventario(supabase, {
    tipo: 'retiro',
    productoOrigen: { ...producto, ...prod },
    cantidad: qty,
    motivo: motivo || `Carga camión ruta ${folio || ''} · CEDIS`,
    usuario: usuario || '—',
    sucursal: ALMACEN_CENTRAL,
    sucursalOperacion: ALMACEN_CENTRAL,
    modo: 'cedis',
    folio: folio || undefined,
    meta: folio ? { carga_folio: folio, origen: 'ruta_carga' } : { origen: 'ruta_carga' },
  });
  if (mov.ok) {
    const esperado = Math.max(0, disponible - qty);
    const despues = Number(mov.stock_despues);
    // Si el RPC partió de 0 (mapa vacío / SQL viejo), corregir al valor real.
    if (!Number.isFinite(despues) || despues !== esperado) {
      const patch = buildPatchStock(
        { ...prod, ...(mov.patch || {}) },
        ALMACEN_CENTRAL,
        'cedis',
        esperado,
        ALMACEN_CENTRAL,
      );
      const { error } = await supabase.from('productos').update(patch).eq('id', producto.id);
      if (error) return { ok: false, error: error.message || String(error) };
      return {
        ok: true,
        patch,
        producto: { ...prod, ...patch },
        stock_antes: disponible,
        stock_despues: esperado,
        corregido: true,
      };
    }
    return {
      ok: true,
      patch: mov.patch,
      producto: mov.producto || { ...prod, ...mov.patch },
      stock_antes: mov.stock_antes,
      stock_despues: mov.stock_despues,
    };
  }

  if (!mov.faltaRpc) return mov;

  // Respaldo sin RPC: escribir stock_sucursales.CEDIS.cedis directo.
  const objetivo = Math.max(0, disponible - qty);
  const patch = buildPatchStock(prod, ALMACEN_CENTRAL, 'cedis', objetivo, ALMACEN_CENTRAL);
  const { error } = await supabase.from('productos').update(patch).eq('id', producto.id);
  if (error) return { ok: false, error: error.message || String(error) };
  return {
    ok: true,
    patch,
    producto: { ...prod, ...patch },
    stock_antes: disponible,
    stock_despues: objetivo,
    fallbackJson: true,
    aviso: mov.error || null,
  };
}

/**
 * Devuelve piezas al CEDIS (cancelación de carga / ingreso inverso).
 */
export async function devolverCedisDesdeCarga(supabase, {
  producto,
  cantidad,
  motivo,
  usuario,
  folio,
} = {}) {
  const qty = Math.floor(Math.abs(Number(cantidad) || 0));
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  if (!producto?.id || !(qty > 0)) return { ok: false, error: 'Producto o cantidad inválidos.' };

  const fresco = await leerProductoInventarioFresco(supabase, producto.id);
  if (!fresco.ok) return fresco;
  const sync = await sincronizarStockCedisProducto(supabase, fresco.producto);
  if (!sync.ok) return sync;
  const prod = sync.producto;
  const antes = stockAlmacenCentral(prod);

  const mov = await aplicarMovimientoInventario(supabase, {
    tipo: 'entrada',
    productoOrigen: { ...producto, ...prod },
    cantidad: qty,
    motivo: motivo || `Cancelación carga ruta ${folio || ''} · → CEDIS`,
    usuario: usuario || '—',
    sucursal: ALMACEN_CENTRAL,
    sucursalOperacion: ALMACEN_CENTRAL,
    modo: 'cedis',
    folio: folio || undefined,
    meta: folio ? { carga_folio: folio, origen: 'ruta_carga_cancel' } : { origen: 'ruta_carga_cancel' },
  });
  if (mov.ok) {
    const esperado = antes + qty;
    const despues = Number(mov.stock_despues);
    if (!Number.isFinite(despues) || despues !== esperado) {
      const patch = buildPatchStock(
        { ...prod, ...(mov.patch || {}) },
        ALMACEN_CENTRAL,
        'cedis',
        esperado,
        ALMACEN_CENTRAL,
      );
      const { error } = await supabase.from('productos').update(patch).eq('id', producto.id);
      if (error) return { ok: false, error: error.message || String(error) };
      return {
        ok: true,
        patch,
        producto: { ...prod, ...patch },
        stock_antes: antes,
        stock_despues: esperado,
        corregido: true,
      };
    }
    return {
      ok: true,
      patch: mov.patch,
      producto: mov.producto || { ...prod, ...mov.patch },
      stock_antes: mov.stock_antes,
      stock_despues: mov.stock_despues,
    };
  }
  if (!mov.faltaRpc) return mov;

  const objetivo = antes + qty;
  const patch = buildPatchStock(prod, ALMACEN_CENTRAL, 'cedis', objetivo, ALMACEN_CENTRAL);
  const { error } = await supabase.from('productos').update(patch).eq('id', producto.id);
  if (error) return { ok: false, error: error.message || String(error) };
  return {
    ok: true,
    patch,
    producto: { ...prod, ...patch },
    stock_antes: antes,
    stock_despues: objetivo,
    fallbackJson: true,
    aviso: mov.error || null,
  };
}

/**
 * Cancela una carga en ruta: devuelve a CEDIS lo disponible (no vendido) y marca cancelada.
 */
export async function cancelarCargaRuta(supabase, {
  cargaId,
  usuarioNombre,
  rol,
  userId,
  motivo,
} = {}) {
  if (!puedeAccionVentaRuta(rol, userId, 'ruta_carga')) {
    return { ok: false, error: 'Sin privilegio para cancelar cargas de camión.' };
  }
  const id = String(cargaId || '').trim();
  if (!id) return { ok: false, error: 'Falta la carga.' };
  if (!supabase) return { ok: false, error: 'Sin conexión.' };

  const { data: carga, error: eCarga } = await supabase
    .from('ruta_cargas')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (eCarga && faltaTabla(eCarga)) return { ok: false, error: AVISO_FALTA_VENTA_RUTA };
  if (eCarga) return { ok: false, error: eCarga.message };
  if (!carga) return { ok: false, error: 'Carga no encontrada.' };

  const estado = String(carga.estado || '').toLowerCase();
  if (estado === 'cancelada') return { ok: false, error: 'Esta carga ya está cancelada.' };
  if (estado === 'liquidada') return { ok: false, error: 'No se puede cancelar una carga liquidada.' };

  const lin = await lineasDeCarga(supabase, id);
  if (lin.error) return { ok: false, error: lin.error };
  const lineas = lin.data || [];
  const vendidas = lineas.filter((l) => (Number(l.qty_vendida) || 0) > 0);
  if (vendidas.length) {
    return {
      ok: false,
      error: `Hay ventas en esta carga (${vendidas.length} producto(s)). No se puede cancelar; liquida o ajusta primero.`,
    };
  }

  const folio = carga.folio || id;
  const patches = [];
  for (const l of lineas) {
    const qty = disponibleEnLineaCarga(l);
    if (!(qty > 0)) continue;
    const prod = { id: l.producto_id, nombre: l.producto_nombre || l.producto_id };
    const mov = await devolverCedisDesdeCarga(supabase, {
      producto: prod,
      cantidad: qty,
      motivo: motivo || `Cancelación carga ${folio} · → CEDIS`,
      usuario: usuarioNombre || '—',
      folio,
    });
    if (!mov.ok) {
      return { ok: false, error: `CEDIS · ${prod.nombre}: ${mov.error}`, parcial: true, patches };
    }
    if (mov.patch) patches.push({ id: prod.id, ...mov.patch, nombre: prod.nombre });
    const { error: eUp } = await supabase
      .from('ruta_carga_lineas')
      .update({
        qty_devuelta: (Number(l.qty_devuelta) || 0) + qty,
      })
      .eq('id', l.id);
    if (eUp) return { ok: false, error: eUp.message, parcial: true, patches };
  }

  const notasExtra = [
    String(carga.notas || '').trim(),
    `Cancelada ${new Date().toISOString().slice(0, 16).replace('T', ' ')} · ${usuarioNombre || '—'}`,
    motivo ? `Motivo: ${motivo}` : null,
  ].filter(Boolean).join(' · ');

  const { data: updated, error: eUpd } = await supabase
    .from('ruta_cargas')
    .update({ estado: 'cancelada', notas: notasExtra || null })
    .eq('id', id)
    .select('*')
    .single();
  if (eUpd) return { ok: false, error: eUpd.message, parcial: true, patches };

  return { ok: true, carga: updated, patches };
}

/**
 * Reporte de ingresos a ruta (cargas desde CEDIS) con líneas de producto.
 * Es lo que se ve en Venta en Ruta → Consultas → Ingresos.
 */
export async function listarReporteIngresosCargaRuta(supabase, { limit = 40, estado = null } = {}) {
  const r = await listarCargasRuta(supabase, { limit, estado: estado || undefined });
  if (r.error) return { data: [], error: r.error, aviso: r.aviso };
  const cargas = r.data || [];
  const out = [];
  for (const c of cargas) {
    const lin = await lineasDeCarga(supabase, c.id);
    const lineas = lin.data || [];
    let piezas = 0;
    let total = 0;
    for (const l of lineas) {
      const q = Number(l.qty_cargada) || 0;
      piezas += q;
      total += round2((Number(l.precio) || 0) * q);
    }
    out.push({
      ...c,
      lineas,
      piezas,
      total: round2(total),
      tipo_reporte: 'ingreso_ruta',
      etiqueta: 'Ingreso a camión (salida CEDIS)',
    });
  }
  return { data: out, aviso: r.aviso || null };
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}
function round3(n) {
  return Math.round((Number(n) || 0) * 1000) / 1000;
}
function faltaTabla(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return error?.code === '42P01' || msg.includes('schema cache') || msg.includes('does not exist');
}
function leerLS(key, fallback = []) {
  try {
    const j = JSON.parse(localStorage.getItem(key) || 'null');
    return j ?? fallback;
  } catch {
    return fallback;
  }
}
function guardarLS(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {
    /* quota */
  }
}
function uid(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
function folioCarga() {
  const d = new Date();
  const ymd = d.toISOString().slice(0, 10).replace(/-/g, '');
  return `CR-${ymd}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;
}
function folioVenta() {
  return `VR-${Date.now().toString(36).toUpperCase()}`;
}

export function puedeAdministrarVentaRuta(rol) {
  const r = normalizarRol(rol);
  return r === 'Administrador' || r === 'Gerente';
}

/**
 * Usuarios activos con rol Repartidor (o plantilla Repartidor).
 */
export async function listarUsuariosRepartidores(supabase) {
  if (!supabase) return { data: [] };
  const { data, error } = await supabase
    .from('usuarios')
    .select('id, nombre, rol, sucursal_id, activo')
    .order('nombre')
    .limit(500);
  if (error) return { data: [], error: error.message };
  const list = (data || []).filter((u) => u?.activo !== false && esRolRepartidor(u.rol));
  return { data: list };
}

/**
 * Destinatarios de Carga de camión = recolectores activos del Panel RT.
 * Cada alta en Panel RT → Recolectores aparece aquí automáticamente.
 * Si el nombre coincide con un usuario POS, se enlaza (usuario_id).
 */
export async function listarRecolectoresCargaRuta(supabase) {
  if (!supabase) return { data: [], aviso: null };
  let rtList = [];
  try {
    rtList = await listarRepartidores(supabase);
  } catch (e) {
    return { data: [], error: e?.message || String(e) };
  }

  const { data: usuariosRaw, error: eUsu } = await supabase
    .from('usuarios')
    .select('id, nombre, rol, sucursal_id, activo')
    .order('nombre')
    .limit(500);
  if (eUsu) return { data: [], error: eUsu.message };

  const usuarios = (usuariosRaw || []).filter((u) => u?.activo !== false);
  const byName = new Map();
  for (const u of usuarios) {
    const k = normNombrePersona(u.nombre);
    if (k && !byName.has(k)) byName.set(k, u);
  }

  const out = (rtList || [])
    .filter((rt) => rt?.id && rt.activo !== false)
    .map((rt) => {
      const uMatch = byName.get(normNombrePersona(rt.nombre));
      const usuarioId = uMatch ? String(uMatch.id) : null;
      return {
        id: String(rt.id),
        nombre: rt.nombre || rt.id,
        rol: uMatch?.rol || 'Repartidor',
        sucursal_id: uMatch?.sucursal_id || null,
        fuente: usuarioId ? 'rt+usuario' : 'rt',
        usuario_id: usuarioId,
        repartidor_id: String(rt.id),
        etiqueta: usuarioId
          ? `${rt.nombre} · Panel RT`
          : `${rt.nombre} · Panel RT`,
      };
    })
    .sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es'));

  return { data: out };
}

/** @deprecated usar listarRecolectoresCargaRuta */
export async function listarUsuariosParaCargaRuta(supabase) {
  return listarRecolectoresCargaRuta(supabase);
}

/**
 * Vendedores para login POS: usuarios Repartidor + recolectores del Panel RT
 * (tabla repartidores), enlazados por nombre cuando hay usuario.
 */
export async function listarVendedoresSesionRuta(supabase) {
  if (!supabase) return { data: [], aviso: null };
  const [usuariosRes, rtList] = await Promise.all([
    supabase.from('usuarios').select('id, nombre, rol, sucursal_id, activo').order('nombre').limit(500),
    listarRepartidores(supabase).catch(() => []),
  ]);
  if (usuariosRes.error) return { data: [], error: usuariosRes.error.message };

  const usuarios = (usuariosRes.data || []).filter((u) => u?.activo !== false);
  const byName = new Map();
  for (const u of usuarios) {
    const k = normNombrePersona(u.nombre);
    if (k && !byName.has(k)) byName.set(k, u);
  }

  const out = [];
  const seen = new Set();

  for (const u of usuarios) {
    if (!esRolRepartidor(u.rol)) continue;
    const id = String(u.id);
    seen.add(id);
    out.push({
      id,
      nombre: u.nombre || id,
      rol: u.rol,
      sucursal_id: u.sucursal_id,
      fuente: 'usuario',
      usuario_id: id,
      repartidor_id: null,
      etiqueta: u.nombre || id,
    });
  }

  for (const rt of rtList || []) {
    if (!rt?.id || rt.activo === false) continue;
    const uMatch = byName.get(normNombrePersona(rt.nombre));
    const usuarioId = uMatch ? String(uMatch.id) : null;
    const id = usuarioId || `rt:${rt.id}`;
    if (seen.has(id) || (usuarioId && seen.has(usuarioId))) {
      // Ya listado como Repartidor: anotar vínculo RT
      const prev = out.find((x) => String(x.usuario_id) === String(usuarioId) || String(x.id) === String(usuarioId));
      if (prev) {
        prev.repartidor_id = String(rt.id);
        prev.etiqueta = `${prev.nombre} · RT`;
      }
      continue;
    }
    seen.add(id);
    out.push({
      id,
      nombre: rt.nombre || rt.id,
      rol: uMatch?.rol || 'Repartidor',
      sucursal_id: uMatch?.sucursal_id || null,
      fuente: usuarioId ? 'usuario+rt' : 'rt',
      usuario_id: usuarioId,
      repartidor_id: String(rt.id),
      etiqueta: usuarioId ? `${rt.nombre} · RT` : `${rt.nombre} · Panel RT`,
    });
  }

  out.sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es'));
  return { data: out };
}

/** Administradores / gerentes para autenticar el corte de caja de ruta. */
export async function listarAdministradoresCorteRuta(supabase) {
  if (!supabase) return { data: [] };
  const { data, error } = await supabase
    .from('usuarios')
    .select('id, nombre, rol, sucursal_id, activo')
    .order('nombre')
    .limit(500);
  if (error) return { data: [], error: error.message };
  const list = (data || []).filter((u) => {
    if (u?.activo === false) return false;
    const r = normalizarRol(u.rol);
    return r === 'Administrador' || r === 'Gerente';
  });
  return { data: list };
}

/**
 * PIN del vendedor para POS: usuario (usuarios.pin) o recolector Panel RT (repartidores.pin).
 */
export async function verificarPinVendedorSesionRuta(supabase, {
  pin,
  vendedorId,
  sucursal,
  vendedores = null,
} = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  const p = String(pin || '').trim();
  const idSel = String(vendedorId || '').trim();
  if (!p) return { ok: false, error: 'Ingresa el PIN del vendedor.' };
  if (!idSel) return { ok: false, error: 'Selecciona el vendedor.' };

  let lista = vendedores;
  if (!Array.isArray(lista)) {
    const r = await listarVendedoresSesionRuta(supabase);
    if (r.error) return { ok: false, error: r.error };
    lista = r.data || [];
  }
  const sel = lista.find((v) => String(v.id) === idSel);
  if (!sel) return { ok: false, error: 'Vendedor no encontrado.' };

  // Panel RT puro: PIN en tabla repartidores
  if (sel.fuente === 'rt' && sel.repartidor_id) {
    try {
      const { data: rt, error } = await supabase
        .from('repartidores')
        .select('id, nombre, pin, activo')
        .eq('id', sel.repartidor_id)
        .maybeSingle();
      if (error) return { ok: false, error: error.message };
      if (!rt || rt.activo === false) return { ok: false, error: 'Recolector inactivo.' };
      if (String(rt.pin || '') !== p) return { ok: false, error: 'PIN incorrecto.' };
      return {
        ok: true,
        user: {
          id: sel.id,
          nombre: rt.nombre || sel.nombre,
          rol: 'Repartidor',
          fuente: 'rt',
          usuario_id: null,
          repartidor_id: String(rt.id),
        },
      };
    } catch (e) {
      return { ok: false, error: e?.message || String(e) };
    }
  }

  // Usuario (con o sin vínculo RT)
  const uid = String(sel.usuario_id || sel.id);
  const { data, error } = await supabase
    .from('usuarios')
    .select('id, nombre, rol, sucursal_id, activo')
    .eq('pin', p)
    .limit(20);
  if (error) {
    const auth = await buscarUsuarioPorPinYSucursal(supabase, p, sucursal, { aceptarPersonalCentral: true });
    if (auth.error) return { ok: false, error: auth.error };
    if (!auth.user) {
      return {
        ok: false,
        error: auth.avisoSucursal ? 'PIN no válido en esta sucursal.' : 'PIN incorrecto.',
      };
    }
    if (String(auth.user.id) !== uid) {
      return { ok: false, error: 'El PIN no corresponde al vendedor seleccionado.' };
    }
    return {
      ok: true,
      user: {
        id: auth.user.id,
        nombre: auth.user.nombre,
        rol: auth.user.rol,
        sucursal_id: auth.user.sucursal_id,
        fuente: sel.fuente || 'usuario',
        usuario_id: auth.user.id,
        repartidor_id: sel.repartidor_id || null,
      },
    };
  }

  const list = (data || []).filter((u) => u?.activo !== false);
  const match = list.find((u) => String(u.id) === uid);
  if (!match) {
    if (list.length) return { ok: false, error: 'El PIN no corresponde al vendedor seleccionado.' };
    return { ok: false, error: 'PIN incorrecto.' };
  }
  return {
    ok: true,
    user: {
      id: match.id,
      nombre: match.nombre,
      rol: match.rol,
      sucursal_id: match.sucursal_id,
      fuente: sel.fuente || 'usuario',
      usuario_id: match.id,
      repartidor_id: sel.repartidor_id || null,
    },
  };
}

/**
 * PIN de administrador/gerente para abrir el corte de ruta.
 */
export async function verificarPinAdminCorteRuta(supabase, {
  pin,
  adminId,
  sucursal,
} = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  const p = String(pin || '').trim();
  const idEsperado = String(adminId || '').trim();
  if (!p) return { ok: false, error: 'Ingresa el PIN del administrador.' };
  if (!idEsperado) return { ok: false, error: 'Selecciona el administrador.' };

  const auth = await buscarUsuarioPorPinYSucursal(supabase, p, sucursal, { aceptarPersonalCentral: true });
  if (auth.error) return { ok: false, error: auth.error };
  if (!auth.user) {
    return {
      ok: false,
      error: auth.avisoSucursal ? 'PIN no válido en esta sucursal.' : 'PIN incorrecto.',
    };
  }
  if (String(auth.user.id) !== idEsperado) {
    return { ok: false, error: 'El PIN no corresponde al administrador seleccionado.' };
  }
  const r = normalizarRol(auth.user.rol);
  if (r !== 'Administrador' && r !== 'Gerente') {
    return { ok: false, error: 'Solo Administrador o Gerente pueden hacer el corte de ruta.' };
  }
  if (auth.user.activo === false) return { ok: false, error: 'Usuario inactivo.' };
  return {
    ok: true,
    user: {
      id: auth.user.id,
      nombre: auth.user.nombre,
      rol: auth.user.rol,
      sucursal_id: auth.user.sucursal_id,
    },
  };
}

/** @deprecated usar verificarPinVendedorSesionRuta */
export async function verificarPinRepartidorRuta(supabase, opts = {}) {
  return verificarPinVendedorSesionRuta(supabase, {
    pin: opts.pin,
    vendedorId: opts.repartidorId || opts.vendedorId,
    sucursal: opts.sucursal,
  });
}

/** Precio especial de ruta (sin impuestos). */
export function precioRutaEspecial(producto) {
  const p = Number(producto?.precio_ruta);
  if (Number.isFinite(p) && p > 0) return round2(p);
  return null;
}

/** @deprecated alias */
export function precioCedisRuta(producto) {
  return precioRutaEspecial(producto);
}

export function listarDestinosVentaRuta(clientesExternos = []) {
  const propias = listarSucursalesOperativas().map((s) => ({
    tipo: 'sucursal',
    id: s,
    nombre: etiquetaTienda(s),
    propio: true,
  }));
  const externos = (clientesExternos || [])
    .filter((c) => c.activo !== false)
    .map((c) => ({
      tipo: 'externo',
      id: String(c.id),
      nombre: c.nombre,
      propio: false,
      credito_limite: Number(c.credito_limite) || 0,
    }));
  return [...propias, ...externos];
}

export function disponibleEnLineaCarga(lin) {
  return round3(
    Math.max(
      0,
      (Number(lin?.qty_cargada) || 0) - (Number(lin?.qty_vendida) || 0) - (Number(lin?.qty_devuelta) || 0),
    ),
  );
}

/**
 * Une líneas de una o varias cargas en inventario de preinventario (1 fila por producto).
 * El teórico (`_disp_camion`) es la suma de disponible en todas las cargas.
 * @param {Array} lineas — filas ruta_carga_lineas (pueden venir de varias cargas)
 * @param {{ productoPorId?: Map, inventario?: Array }} [opts]
 */
export function inventarioCamionDesdeLineas(lineas, { productoPorId = null, inventario = [] } = {}) {
  const byId = new Map();
  for (const lin of lineas || []) {
    const pid = String(lin.producto_id || '');
    if (!pid) continue;
    const disp = disponibleEnLineaCarga(lin);
    const cargada = Number(lin.qty_cargada) || 0;
    const vendida = Number(lin.qty_vendida) || 0;
    const devuelta = Number(lin.qty_devuelta) || 0;
    const prev = byId.get(pid);
    if (!prev) {
      const base = productoPorId?.get(pid)
        || (inventario || []).find((p) => String(p.id) === pid)
        || {};
      byId.set(pid, {
        ...base,
        id: pid,
        nombre: lin.producto_nombre || base.nombre || pid,
        cat: base.cat || 'GENERAL',
        _qty_cargada: cargada,
        _qty_vendida: vendida,
        _qty_devuelta: devuelta,
        _disp_camion: disp,
        _num_cargas: 1,
      });
    } else {
      prev._qty_cargada += cargada;
      prev._qty_vendida += vendida;
      prev._qty_devuelta += devuelta;
      prev._disp_camion = round3(prev._disp_camion + disp);
      prev._num_cargas += 1;
      if (!prev.nombre && lin.producto_nombre) prev.nombre = lin.producto_nombre;
    }
  }
  return [...byId.values()];
}

/**
 * Carga líneas de varias cargas en paralelo y las consolida para preinventario.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Array<{id:string}>} cargas
 */
export async function lineasDeVariasCargas(supabase, cargas) {
  const list = (cargas || []).filter((c) => c?.id);
  if (!list.length) return { data: [], porCarga: [] };
  const resultados = await Promise.all(
    list.map(async (c) => {
      const r = await lineasDeCarga(supabase, c.id);
      return {
        cargaId: c.id,
        folio: c.folio || '',
        lineas: r.data || [],
        aviso: r.aviso || null,
        error: r.error || null,
      };
    }),
  );
  const aviso = resultados.find((r) => r.aviso)?.aviso || null;
  const error = resultados.find((r) => r.error)?.error || null;
  const flat = resultados.flatMap((r) => r.lineas);
  return { data: flat, porCarga: resultados, aviso, error };
}

/**
 * Catálogo POS del camión: 1 fila por producto con existencia consolidada
 * (todas las cargas en ruta) y precio de línea o precio_ruta.
 */
export function catalogoPosCamionDesdeLineas(lineas, { productoPorId = null, inventario = [] } = {}) {
  const inv = inventarioCamionDesdeLineas(lineas, { productoPorId, inventario });
  const precioPorId = new Map();
  for (const lin of lineas || []) {
    const pid = String(lin.producto_id || '');
    const pr = Number(lin.precio) || 0;
    if (!pid || !(pr > 0)) continue;
    const prev = precioPorId.get(pid);
    if (prev == null || pr > prev) precioPorId.set(pid, pr);
  }
  return inv
    .map((p) => {
      const base = productoPorId?.get(String(p.id))
        || (inventario || []).find((x) => String(x.id) === String(p.id))
        || {};
      const precioLin = precioPorId.get(String(p.id)) || 0;
      const precio = precioLin > 0 ? precioLin : precioRutaEspecial(base);
      return {
        id: String(p.id),
        nombre: p.nombre || base.nombre || p.id,
        cat: p.cat || base.cat || 'GENERAL',
        foto_url: base.foto_url || base.foto || p.foto_url || null,
        precio: Number(precio) || 0,
        disponible: Number(p._disp_camion) || 0,
      };
    })
    .filter((p) => p.disponible > 0 && p.precio > 0);
}

/**
 * Reparte una cantidad a vender entre líneas del mismo producto (FIFO del array).
 * @returns {{ ok: true, asignaciones: Array<{ linea, qty, cargaId }> } | { ok: false, error: string }}
 */
export function asignarVentaALineasProducto(lineasDelProducto, cantidad) {
  const need = Math.floor(Math.abs(Number(cantidad) || 0));
  if (!(need > 0)) return { ok: false, error: 'Cantidad inválida.' };
  let restante = need;
  const asignaciones = [];
  for (const lin of lineasDelProducto || []) {
    if (restante <= 0) break;
    const disp = disponibleEnLineaCarga(lin);
    if (!(disp > 0)) continue;
    const take = Math.min(Math.floor(disp), restante);
    if (!(take > 0)) continue;
    asignaciones.push({
      linea: lin,
      qty: take,
      cargaId: lin.carga_id || null,
    });
    restante -= take;
  }
  if (restante > 0) {
    const totalDisp = round3(
      (lineasDelProducto || []).reduce((s, l) => s + disponibleEnLineaCarga(l), 0),
    );
    return { ok: false, error: `En camión solo hay ${totalDisp}.` };
  }
  return { ok: true, asignaciones };
}

// ─── Clientes externos ────────────────────────────────────────────

export async function listarClientesRuta(supabase) {
  if (!supabase) return { data: leerLS(LS_CLIENTES, []) };
  const { data, error } = await supabase.from('ruta_clientes').select('*').order('nombre');
  if (error && faltaTabla(error)) return { data: leerLS(LS_CLIENTES, []), aviso: AVISO_FALTA_VENTA_RUTA };
  if (error) return { data: [], error: error.message };
  return { data: data || [] };
}

export async function guardarClienteRuta(supabase, row) {
  const payload = {
    nombre: String(row.nombre || '').trim(),
    direccion: row.direccion || null,
    telefono: row.telefono || null,
    credito_limite: round2(row.credito_limite),
    activo: row.activo !== false,
    notas: row.notas || null,
  };
  if (!payload.nombre) return { ok: false, error: 'Nombre requerido.' };
  if (!supabase) {
    const list = leerLS(LS_CLIENTES, []);
    if (row.id) {
      guardarLS(LS_CLIENTES, list.map((c) => (String(c.id) === String(row.id) ? { ...c, ...payload } : c)));
      return { ok: true, id: row.id, soloLocal: true };
    }
    const id = uid('cli');
    list.unshift({ ...payload, id, created_at: new Date().toISOString() });
    guardarLS(LS_CLIENTES, list);
    return { ok: true, id, soloLocal: true };
  }
  if (row.id) {
    const { error } = await supabase.from('ruta_clientes').update(payload).eq('id', row.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true, id: row.id };
  }
  const { data, error } = await supabase.from('ruta_clientes').insert([payload]).select('id').single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data?.id };
}

// ─── Precios ruta (admin) ─────────────────────────────────────────

export async function guardarPrecioRutaProducto(supabase, productoId, precio, { rol, userId } = {}) {
  if (!puedeAccionVentaRuta(rol, userId, 'ruta_precios')) {
    return { ok: false, error: 'Sin privilegio para ajustar precios de ruta.' };
  }
  const pid = String(productoId || '');
  const p = round2(precio);
  if (!pid) return { ok: false, error: 'Producto inválido.' };
  if (!(p >= 0)) return { ok: false, error: 'Precio inválido.' };
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  const { error } = await supabase.from('productos').update({ precio_ruta: p }).eq('id', pid);
  if (error) return { ok: false, error: error.message };
  return { ok: true, precio: p };
}

// ─── Cargas (descuenta MAIN · CEDIS) ───────────────────────────────

export async function listarCargasRuta(supabase, { estado, vendedorId, camionId, limit = 80 } = {}) {
  if (!supabase) {
    let list = leerLS(LS_CARGAS, []);
    if (estado) list = list.filter((c) => c.estado === estado);
    if (camionId) list = list.filter((c) => String(c.camion_id) === String(camionId));
    else if (vendedorId) list = list.filter((c) => String(c.vendedor_id) === String(vendedorId));
    return { data: list.slice(0, limit) };
  }
  let q = supabase.from('ruta_cargas').select('*').order('created_at', { ascending: false }).limit(limit);
  if (estado) q = q.eq('estado', estado);
  if (camionId) q = q.eq('camion_id', String(camionId));
  else if (vendedorId) q = q.eq('vendedor_id', String(vendedorId));
  const { data, error } = await q;
  if (error && faltaTabla(error)) {
    let list = leerLS(LS_CARGAS, []);
    if (estado) list = list.filter((c) => c.estado === estado);
    if (camionId) list = list.filter((c) => String(c.camion_id) === String(camionId));
    else if (vendedorId) list = list.filter((c) => String(c.vendedor_id) === String(vendedorId));
    return { data: list.slice(0, limit), aviso: AVISO_FALTA_VENTA_RUTA };
  }
  // Columna camion_id aún no existe: caer a filtro por vendedor
  if (error && camionId && /camion_id|schema cache|column/i.test(String(error.message || ''))) {
    return listarCargasRuta(supabase, { estado, vendedorId, limit });
  }
  if (error) return { data: [], error: error.message };
  return { data: data || [] };
}

export async function lineasDeCarga(supabase, cargaId) {
  if (!cargaId) return { data: [] };
  if (!supabase) {
    return { data: leerLS(LS_LINEAS, []).filter((l) => String(l.carga_id) === String(cargaId)) };
  }
  const { data, error } = await supabase.from('ruta_carga_lineas').select('*').eq('carga_id', cargaId);
  if (error && faltaTabla(error)) {
    return {
      data: leerLS(LS_LINEAS, []).filter((l) => String(l.carga_id) === String(cargaId)),
      aviso: AVISO_FALTA_VENTA_RUTA,
    };
  }
  if (error) return { data: [], error: error.message };
  return { data: data || [] };
}

/**
 * Crea carga y descuenta inventario de CEDIS (centro de distribución).
 * Destinatario: recolector Panel RT (repartidor_id) y/o usuario POS enlazado.
 * @param {Array<{productoId, nombre, precio, cantidad}>} lineas
 */
export async function crearCargaRuta(supabase, {
  vendedorNombre,
  vendedorId,
  repartidorId,
  camionId,
  notas,
  lineas,
  usuarioNombre,
  rol,
  userId,
  inventario = [],
} = {}) {
  if (!puedeAccionVentaRuta(rol, userId, 'ruta_carga')) {
    return { ok: false, error: 'Sin privilegio para cargar el camión desde CEDIS.' };
  }
  const rtId = String(repartidorId || '').trim();
  let repId = String(vendedorId || '').trim();
  let repNombre = String(vendedorNombre || '').trim();

  if (supabase && rtId) {
    try {
      const { data: rt, error: eRt } = await supabase
        .from('repartidores')
        .select('id, nombre, activo')
        .eq('id', rtId)
        .maybeSingle();
      if (eRt) return { ok: false, error: eRt.message };
      if (!rt || rt.activo === false) {
        return { ok: false, error: 'El recolector del Panel RT no existe o está inactivo.' };
      }
      if (!repNombre) repNombre = rt.nombre || rtId;
      // Preferir usuario POS enlazado por nombre; si no, usar id del recolector RT
      if (!repId || String(repId).startsWith('rt:')) {
        const { data: usuarios } = await supabase
          .from('usuarios')
          .select('id, nombre, activo')
          .order('nombre')
          .limit(500);
        const match = (usuarios || []).find(
          (u) => u?.activo !== false && normNombrePersona(u.nombre) === normNombrePersona(rt.nombre),
        );
        repId = match ? String(match.id) : String(rt.id);
        if (match?.nombre) repNombre = match.nombre;
      }
    } catch (e) {
      return { ok: false, error: e?.message || String(e) };
    }
  } else if (supabase && repId) {
    const { data: uRep, error: eRep } = await supabase
      .from('usuarios')
      .select('id, nombre, rol, activo')
      .eq('id', repId)
      .maybeSingle();
    if (eRep) return { ok: false, error: eRep.message };
    if (!uRep || uRep.activo === false) {
      // Puede ser id de Panel RT guardado directo
      const { data: rt } = await supabase
        .from('repartidores')
        .select('id, nombre, activo')
        .eq('id', repId)
        .maybeSingle();
      if (!rt || rt.activo === false) {
        return { ok: false, error: 'El recolector / usuario seleccionado no existe o está inactivo.' };
      }
      if (!repNombre) repNombre = rt.nombre || repId;
    } else if (!repNombre) {
      repNombre = uRep.nombre || repId;
    }
  }

  if (!repId || !repNombre) {
    return { ok: false, error: 'Selecciona el recolector / repartidor destinatario de la carga.' };
  }
  const items = (lineas || [])
    .map((l) => ({
      productoId: String(l.productoId || l.producto_id || ''),
      nombre: l.nombre || l.producto_nombre || '',
      precio: round2(l.precio),
      cantidad: Math.floor(Math.abs(Number(l.cantidad) || 0)),
    }))
    .filter((l) => l.productoId && l.cantidad > 0);
  if (!items.length) return { ok: false, error: 'Agrega al menos un producto a la carga.' };
  if (!supabase) return { ok: false, error: 'Se requiere conexión a Supabase para descontar CEDIS.' };

  const folio = folioCarga();
  const payloadCarga = {
    folio,
    vendedor_id: repId,
    vendedor_nombre: repNombre,
    fecha: new Date().toISOString().slice(0, 10),
    estado: 'en_ruta',
    notas: notas || null,
  };
  const cid = camionId ? String(camionId).trim() : '';
  if (cid) payloadCarga.camion_id = cid;

  let { data: row, error } = await supabase
    .from('ruta_cargas')
    .insert([payloadCarga])
    .select('*')
    .single();
  // Si aún no existe la columna camion_id, reintentar sin ella
  if (error && cid && /camion_id|schema cache|column/i.test(String(error.message || ''))) {
    delete payloadCarga.camion_id;
    ({ data: row, error } = await supabase
      .from('ruta_cargas')
      .insert([payloadCarga])
      .select('*')
      .single());
  }
  if (error && faltaTabla(error)) return { ok: false, error: AVISO_FALTA_VENTA_RUTA };
  if (error) return { ok: false, error: error.message };

  const cargaId = row.id;
  const porId = new Map((inventario || []).map((p) => [String(p.id), p]));
  const patches = [];
  let aviso = null;

  for (const it of items) {
    const prod = porId.get(it.productoId) || { id: it.productoId, nombre: it.nombre };
    const mov = await descontarCedisParaCarga(supabase, {
      producto: prod,
      cantidad: it.cantidad,
      motivo: `Carga camión ruta ${folio} · CEDIS → ${repNombre}`,
      usuario: usuarioNombre || '—',
      folio,
    });
    if (!mov.ok) {
      return { ok: false, error: `CEDIS · ${it.nombre || it.productoId}: ${mov.error}`, cargaId, folio };
    }
    if (mov.patch) patches.push({ id: it.productoId, ...mov.patch, nombre: it.nombre });
    if (mov.aviso || mov.fallbackJson) {
      aviso = mov.aviso || 'Stock CEDIS actualizado (modo respaldo). Ejecuta supabase/fix_stock_delta_atomico.sql.';
    }
    const { error: eLin } = await supabase.from('ruta_carga_lineas').insert([{
      carga_id: cargaId,
      producto_id: it.productoId,
      producto_nombre: it.nombre,
      precio: it.precio,
      qty_cargada: it.cantidad,
      qty_vendida: 0,
      qty_devuelta: 0,
    }]);
    if (eLin) return { ok: false, error: eLin.message, cargaId, folio };
  }
  return { ok: true, carga: row, patches, aviso };
}

// ─── Efectivo en tránsito: ver rutaTransito.js (reexport arriba) ───

// ─── Pedido en Compras (lista para recibir) ───────────────────────

export async function crearPedidoCompraDesdeVentaRuta(supabase, {
  sucursalId,
  folioVenta: folio,
  articulos,
  total,
  vendedorNombre,
} = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  const suc = normalizarCodigoTienda(sucursalId);
  if (!suc || suc === 'MAIN' || suc === 'CEDIS') return { ok: false, error: 'Sucursal inválida para pedido.' };
  const items_pedido = (articulos || []).map((a) => ({
    id: a.producto_id || a.productoId,
    nombre: a.nombre,
    qty_pedido: Math.floor(Number(a.cantidad) || 0),
    costo_est: round2(a.precio),
    stock_teorico: 0,
  })).filter((i) => i.id && i.qty_pedido > 0);
  if (!items_pedido.length) return { ok: false, error: 'Sin artículos para el pedido.' };

  const { data, error } = await supabase
    .from('compras')
    .insert([{
      proveedor_id: null,
      sucursal_id: suc,
      total: round2(total),
      notas: `Venta en ruta ${folio} · ${vendedorNombre || ''}`.trim(),
      estado: 'pedido',
      items_pedido,
      items: [],
    }])
    .select('id')
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data?.id };
}

// ─── Ventas POS ───────────────────────────────────────────────────

export async function listarVentasRuta(supabase, { cargaId, limit = 200 } = {}) {
  if (!supabase) {
    let list = leerLS(LS_VENTAS, []);
    if (cargaId) list = list.filter((v) => String(v.carga_id) === String(cargaId));
    return { data: list.slice(0, limit) };
  }
  let q = supabase.from('ruta_ventas').select('*').order('created_at', { ascending: false }).limit(limit);
  if (cargaId) q = q.eq('carga_id', cargaId);
  const { data, error } = await q;
  if (error && faltaTabla(error)) {
    let list = leerLS(LS_VENTAS, []);
    if (cargaId) list = list.filter((v) => String(v.carga_id) === String(cargaId));
    return { data: list.slice(0, limit), aviso: AVISO_FALTA_VENTA_RUTA };
  }
  if (error) return { data: [], error: error.message };
  return { data: data || [] };
}

/**
 * Cierra una venta POS de ruta (un folio por sucursal/cliente).
 * Existencia = todo el camión (cargas en_ruta); `cargaId` es opcional (compat).
 * Sin cargaId se usa el inventario consolidado del repartidor / cargas activas.
 */
export async function registrarVentaRuta(supabase, {
  cargaId,
  vendedorId,
  clienteTipo,
  clienteId,
  clienteNombre,
  metodoPago,
  articulos,
  vendedorNombre,
  montoEfectivo: optsMontoEfectivo = 0,
  montoCredito: optsMontoCredito = 0,
} = {}) {
  if (!supabase) return { ok: false, error: 'Se requiere conexión.' };
  const mp = String(metodoPago || '').toLowerCase();
  if (mp !== 'efectivo' && mp !== 'credito' && mp !== 'mixto') {
    return { ok: false, error: 'Método: efectivo, crédito o mixto.' };
  }
  const tipoCli = String(clienteTipo || '') === 'externo' ? 'externo' : 'sucursal';
  if (!clienteId) return { ok: false, error: 'Elige sucursal o cliente.' };

  const arts = (articulos || [])
    .map((a) => ({
      producto_id: String(a.productoId || a.producto_id || ''),
      nombre: a.nombre || '',
      precio: round2(a.precio),
      cantidad: Math.floor(Math.abs(Number(a.cantidad) || 0)),
    }))
    .filter((a) => a.producto_id && a.cantidad > 0)
    .map((a) => ({ ...a, importe: round2(a.precio * a.cantidad) }));
  if (!arts.length) return { ok: false, error: 'Agrega productos a la venta.' };
  const total = round2(arts.reduce((s, a) => s + a.importe, 0));

  let montoEfe = round2(optsMontoEfectivo);
  let montoCre = round2(optsMontoCredito);
  if (mp === 'efectivo') {
    montoEfe = total;
    montoCre = 0;
  } else if (mp === 'credito') {
    montoEfe = 0;
    montoCre = total;
  } else {
    // mixto
    if (!(montoEfe >= 0) || !(montoCre >= 0)) {
      return { ok: false, error: 'En mixto indica montos de efectivo y crédito.' };
    }
    if (Math.abs(round2(montoEfe + montoCre) - total) > 0.02) {
      return { ok: false, error: `Mixto debe sumar ${total.toFixed(2)} (efectivo + crédito).` };
    }
    if (montoEfe <= 0 && montoCre <= 0) {
      return { ok: false, error: 'Mixto: al menos un monto debe ser mayor a 0.' };
    }
  }

  let lineas = [];
  let cargasList = [];
  const cargaFija = String(cargaId || '').trim();
  if (cargaFija) {
    const linRes = await lineasDeCarga(supabase, cargaFija);
    if (linRes.error) return { ok: false, error: linRes.error };
    lineas = linRes.data || [];
    cargasList = [{ id: cargaFija }];
  } else {
    const filtros = { estado: 'en_ruta', limit: 80 };
    if (vendedorId) filtros.vendedorId = vendedorId;
    const cRes = await listarCargasRuta(supabase, filtros);
    if (cRes.error) return { ok: false, error: cRes.error };
    cargasList = cRes.data || [];
    if (!cargasList.length) {
      return { ok: false, error: 'No hay mercancía en ruta. Carga el camión primero.' };
    }
    const lr = await lineasDeVariasCargas(supabase, cargasList);
    if (lr.error) return { ok: false, error: lr.error };
    lineas = lr.data || [];
  }

  const byProd = new Map();
  for (const l of lineas) {
    const pid = String(l.producto_id || '');
    if (!pid) continue;
    if (!byProd.has(pid)) byProd.set(pid, []);
    byProd.get(pid).push(l);
  }

  const allAsign = [];
  for (const a of arts) {
    const lines = byProd.get(a.producto_id) || [];
    if (!lines.length) {
      return { ok: false, error: `${a.nombre || a.producto_id} no está en el camión.` };
    }
    const asg = asignarVentaALineasProducto(lines, a.cantidad);
    if (!asg.ok) {
      return { ok: false, error: `${a.nombre || a.producto_id}: ${asg.error}` };
    }
    for (const x of asg.asignaciones) {
      allAsign.push(x);
    }
  }

  const primaryCargaId = cargaFija
    || String(allAsign[0]?.cargaId || cargasList[0]?.id || '').trim();
  if (!primaryCargaId) {
    return { ok: false, error: 'No se pudo asociar la venta a una carga en ruta.' };
  }

  const folio = folioVenta();
  const ventaPayload = {
    carga_id: primaryCargaId,
    folio,
    cliente_tipo: tipoCli,
    cliente_id: String(clienteId),
    cliente_nombre: clienteNombre || String(clienteId),
    metodo_pago: mp,
    total,
    articulos: mp === 'mixto'
      ? [...arts, { _pago_mixto: true, efectivo: montoEfe, credito: montoCre }]
      : arts,
    vendedor_nombre: vendedorNombre || null,
    estado_credito: montoCre > 0 ? 'pendiente' : null,
  };

  const { data: ventaRow, error } = await supabase
    .from('ruta_ventas')
    .insert([ventaPayload])
    .select('*')
    .single();
  if (error && faltaTabla(error)) {
    // Schema viejo sin estado_credito
    const slim = { ...ventaPayload };
    delete slim.estado_credito;
    const retry = await supabase.from('ruta_ventas').insert([slim]).select('*').single();
    if (retry.error) return { ok: false, error: retry.error.message };
    Object.assign(ventaPayload, retry.data);
  } else if (error) {
    return { ok: false, error: error.message };
  }

  const venta = ventaRow || ventaPayload;

  // Descuenta existencia del camión (puede tocar varias líneas / cargas)
  const vendidoPorLinea = new Map();
  for (const asg of allAsign) {
    const id = asg.linea?.id;
    if (!id) continue;
    vendidoPorLinea.set(id, (vendidoPorLinea.get(id) || 0) + asg.qty);
  }
  for (const [linId, qtyAdd] of vendidoPorLinea) {
    const lin = lineas.find((l) => String(l.id) === String(linId));
    if (!lin) continue;
    const nueva = round3((Number(lin.qty_vendida) || 0) + qtyAdd);
    const { error: eUp } = await supabase.from('ruta_carga_lineas').update({ qty_vendida: nueva }).eq('id', linId);
    if (eUp) return { ok: false, error: eUp.message };
  }

  let compraId = null;
  let transitoId = null;
  const avisos = [];

  async function enlazarVenta(extra = {}) {
    const patch = { ...extra };
    if (compraId) patch.compra_id = compraId;
    if (transitoId) patch.transito_id = String(transitoId);
    if (!Object.keys(patch).length) return;
    const { error: eLink } = await supabase.from('ruta_ventas').update(patch).eq('id', venta.id);
    if (eLink) avisos.push(`enlace venta: ${eLink.message}`);
  }

  // Sucursal propia → pedido pendiente de recepción
  if (tipoCli === 'sucursal') {
    const ped = await crearPedidoCompraDesdeVentaRuta(supabase, {
      sucursalId: clienteId,
      folioVenta: folio,
      articulos: arts,
      total,
      vendedorNombre,
    });
    if (!ped.ok) return { ok: false, error: ped.error || 'No se creó el pedido en Compras.' };
    compraId = ped.id;
    // Enlazar de inmediato: si falla tránsito/CxC después, no perder compra_id
    await enlazarVenta();
  }

  if (montoEfe > 0) {
    const tr = await registrarEfectivoTransitoVentaRuta(supabase, {
      sucursalOrigen: tipoCli === 'sucursal' ? clienteId : ALMACEN_CENTRAL,
      monto: montoEfe,
      folioVenta: folio,
      vendedorId,
      vendedorNombre,
      nota: `Venta ruta ${folio} · ${mp === 'mixto' ? `mixto efectivo ${montoEfe}` : 'efectivo'} · ${clienteNombre || clienteId}`,
    });
    if (!tr.ok) {
      await enlazarVenta();
      return {
        ok: false,
        error: tr.error || 'No se registró efectivo en tránsito.',
        compraId,
        venta: { ...venta, compra_id: compraId },
        avisos: avisos.length ? avisos : undefined,
      };
    }
    transitoId = tr.id;
  }

  if (montoCre > 0) {
    const cxc = await registrarCargoCreditoRuta(supabase, {
      clienteTipo: tipoCli,
      clienteId,
      clienteNombre: clienteNombre || String(clienteId),
      monto: montoCre,
      ventaId: venta.id,
      cargaId: primaryCargaId,
      folioVenta: folio,
      usuarioNombre: vendedorNombre,
      notas: mp === 'mixto'
        ? `Venta ${folio} · mixto crédito ${montoCre}`
        : `Venta ${folio}`,
    });
    if (!cxc.ok) {
      await enlazarVenta();
      return {
        ok: false,
        error: cxc.error || 'No se registró el crédito.',
        compraId,
        venta: { ...venta, compra_id: compraId },
        avisos: avisos.length ? avisos : undefined,
      };
    }
  }

  await enlazarVenta();

  return {
    ok: true,
    venta: { ...venta, compra_id: compraId, transito_id: transitoId },
    cuenta: mp === 'mixto' ? 'mixto' : mp === 'credito' ? 'credito' : 'efectivo',
    compraId,
    transitoId,
    montoEfectivo: montoEfe,
    montoCredito: montoCre,
    cargaId: primaryCargaId,
    avisos: avisos.length ? avisos : undefined,
  };
}

// Stubs / compat: liquidación vieja ya no es el flujo principal
export async function listarLiquidacionesRuta() {
  return { data: [] };
}
export async function liquidarCargaRuta() {
  return { ok: false, error: 'La liquidación de efectivo se hace en Recolecciones / Liquidación (efectivo en tránsito).' };
}
export async function listarStockCedisRuta() {
  return { data: [], aviso: 'El almacén de ruta es MAIN · CEDIS. Usa Productos / inventario central.' };
}
export async function stockProductoCedisRuta() {
  return 0;
}
export async function moverStockCedisRuta() {
  return { ok: false, error: 'Usa carga de camión (descuenta MAIN) o Ajuste de inventario.' };
}
