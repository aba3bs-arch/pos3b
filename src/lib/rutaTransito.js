/**
 * Efectivo en tránsito generado por Venta en Ruta.
 *
 * repartidor_id DEBE existir en public.repartidores (ej. rep_luis).
 * El POS a menudo manda UUID de usuarios o ids con prefijo `rt:`;
 * resolverRepartidorId() solo devuelve ids verificados en esa tabla.
 */

import { normalizarCodigoTienda } from '../constants/sucursales.js';
import { ahoraIsoNogales, slugRepartidorId } from './controlEfectivo.js';

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function normNombre(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function stripRtPrefix(id) {
  const s = String(id || '').trim();
  if (s.toLowerCase().startsWith('rt:')) return s.slice(3).trim();
  return s;
}

function esUuid(s) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s || ''));
}

/**
 * Resuelve un id válido de `repartidores` a partir de sesión POS / carga / nombre.
 * Nunca inventa ni confía en un id no presente en la tabla (evita FK 23503).
 */
export async function resolverRepartidorId(supabase, vendedorId, vendedorNombre, opts = {}) {
  const explicit = stripRtPrefix(opts.repartidorId);
  const prefer = stripRtPrefix(vendedorId);
  try {
    const { data: reps, error } = await supabase
      .from('repartidores')
      .select('id,nombre,activo')
      .order('id');
    if (error) return { ok: false, error: error.message };
    const all = (reps || []).filter((r) => r?.id);
    const activos = all.filter((r) => r.activo !== false);
    const pool = activos.length ? activos : all;

    const existe = (id) => {
      const s = String(id || '').trim();
      if (!s) return null;
      return all.find((r) => String(r.id) === s) || null;
    };

    // 1) Id Panel RT explícito (sesión / camión)
    if (explicit) {
      const hit = existe(explicit);
      if (hit) return { ok: true, id: String(hit.id) };
    }

    // 2) vendedorId ya es un id de repartidores
    if (prefer) {
      const hit = existe(prefer);
      if (hit) return { ok: true, id: String(hit.id) };
      // Variante slug (rep_test user vs rep_test_user)
      const slug = slugRepartidorId(prefer.startsWith('rep_') ? prefer.slice(4) : prefer);
      if (slug) {
        const bySlug = existe(slug);
        if (bySlug) return { ok: true, id: String(bySlug.id) };
      }
    }

    // 3) Por nombre (activos primero)
    const nombre = normNombre(vendedorNombre);
    if (nombre && nombre !== '-') {
      const byName = pool.find((r) => {
        const n = normNombre(r.nombre);
        return n === nombre || n.startsWith(`${nombre} `) || nombre.startsWith(`${n} `);
      });
      if (byName) return { ok: true, id: String(byName.id) };
      // Nombre → slug canónico
      const slug = slugRepartidorId(vendedorNombre);
      const bySlug = slug ? existe(slug) : null;
      if (bySlug) return { ok: true, id: String(bySlug.id) };
    }

    // 4) UUID de usuario POS → camión asignado → repartidor_id
    if (prefer && esUuid(prefer)) {
      try {
        const { data: cams } = await supabase
          .from('ruta_camiones')
          .select('repartidor_id, usuario_id, activo')
          .eq('usuario_id', prefer)
          .eq('activo', true)
          .limit(5);
        for (const c of cams || []) {
          const hit = existe(c?.repartidor_id);
          if (hit) return { ok: true, id: String(hit.id) };
        }
      } catch {
        /* tabla camiones opcional */
      }
      return {
        ok: false,
        error: `No hay recolector Panel RT enlazado al vendedor (usuario ${prefer.slice(0, 8)}…). `
          + 'Asigna el camión en Venta en Ruta → Camiones o crea el recolector en Panel RT.',
      };
    }

    // Nunca devolver un id no verificado (causaba transito_efectivo_repartidor_id_fkey).
    if (prefer || explicit) {
      return {
        ok: false,
        error: `El recolector «${explicit || prefer}» no existe en Panel RT (tabla repartidores). `
          + 'Corrige el id o vuelve a dar de alta el recolector.',
      };
    }
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
  return {
    ok: false,
    error: 'No se pudo resolver el recolector para el efectivo en tránsito. Revisa Panel RT.',
  };
}

export async function registrarEfectivoTransitoVentaRuta(supabase, {
  sucursalOrigen,
  monto,
  folioVenta,
  vendedorId,
  vendedorNombre,
  repartidorId,
  nota,
} = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  const m = round2(monto);
  if (!(m > 0)) return { ok: false, error: 'Monto inválido.' };
  const tienda = normalizarCodigoTienda(sucursalOrigen) || 'MAIN';
  const folio = String(folioVenta || '').trim() || `VR-${Date.now().toString(36).toUpperCase()}`;
  const resuelto = await resolverRepartidorId(supabase, vendedorId, vendedorNombre, { repartidorId });
  if (!resuelto.ok) return { ok: false, error: resuelto.error };
  const rid = resuelto.id;
  const row = {
    sucursal_origen: tienda === 'MAIN' ? 'MAIN' : tienda,
    repartidor_id: rid,
    cajero_nombre: String(vendedorNombre || 'Vendedor ruta').trim(),
    monto: m,
    num_traspaso: folio,
    foto_url: nota || `Venta en ruta ${folio}`,
    estatus: 'En Tránsito',
    tipo_movimiento: 'Venta Ruta',
    descripcion_gasto: 'Venta en ruta · efectivo en tránsito',
    fecha_hora: ahoraIsoNogales(),
    usuario_liquida: 'No Leído',
  };
  const { data, error } = await supabase.from('transito_efectivo').insert([row]).select('id').single();
  if (error) {
    const msg = error.message || String(error);
    if (/repartidor_id_fkey|foreign key/i.test(msg)) {
      return {
        ok: false,
        error: `Recolector inválido para tránsito («${rid}»). Verifica Panel RT → Recolectores.`,
      };
    }
    return { ok: false, error: msg };
  }
  return { ok: true, id: data?.id, repartidorId: rid };
}
