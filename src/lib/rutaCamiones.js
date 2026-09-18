/**
 * Camiones de Venta en Ruta — un camión activo por repartidor (usuario y/o Panel RT).
 */

export const AVISO_FALTA_RUTA_CAMIONES =
  'Falta la tabla de camiones. En Supabase ejecuta supabase/fix_ruta_camiones.sql';

function faltaTabla(error) {
  const m = String(error?.message || error || '').toLowerCase();
  return m.includes('does not exist')
    || m.includes('schema cache')
    || m.includes('could not find the table')
    || (m.includes('relation') && m.includes('does not exist'));
}

function slugCodigoCamion(s) {
  const base = String(s || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 24);
  return base || '';
}

export function etiquetaCamion(c) {
  if (!c) return '—';
  const cod = String(c.codigo || '').trim();
  const alias = String(c.alias || '').trim();
  const placa = String(c.placa || '').trim();
  const partes = [];
  if (cod) partes.push(cod);
  if (alias && alias.toLowerCase() !== cod.toLowerCase()) partes.push(alias);
  else if (placa) partes.push(placa);
  return partes.join(' · ') || c.id || 'Camión';
}

export async function listarCamionesRuta(supabase, { soloActivos = false } = {}) {
  if (!supabase) return { data: [], aviso: null };
  let q = supabase
    .from('ruta_camiones')
    .select('id, codigo, placa, alias, usuario_id, repartidor_id, activo, notas, created_at, updated_at')
    .order('codigo');
  if (soloActivos) q = q.eq('activo', true);
  const { data, error } = await q;
  if (error && faltaTabla(error)) return { data: [], aviso: AVISO_FALTA_RUTA_CAMIONES };
  if (error) return { data: [], error: error.message };
  return { data: data || [] };
}

export async function obtenerCamionPorUsuario(supabase, usuarioId) {
  if (!supabase || !usuarioId) return { data: null };
  const { data, error } = await supabase
    .from('ruta_camiones')
    .select('*')
    .eq('usuario_id', String(usuarioId))
    .eq('activo', true)
    .maybeSingle();
  if (error && faltaTabla(error)) return { data: null, aviso: AVISO_FALTA_RUTA_CAMIONES };
  if (error) return { data: null, error: error.message };
  return { data: data || null };
}

export async function obtenerCamionPorRepartidorRt(supabase, repartidorId) {
  if (!supabase || !repartidorId) return { data: null };
  const { data, error } = await supabase
    .from('ruta_camiones')
    .select('*')
    .eq('repartidor_id', String(repartidorId))
    .eq('activo', true)
    .maybeSingle();
  if (error && faltaTabla(error)) return { data: null, aviso: AVISO_FALTA_RUTA_CAMIONES };
  if (error) return { data: null, error: error.message };
  return { data: data || null };
}

/**
 * Resuelve el camión activo del vendedor de sesión (usuario y/o Panel RT).
 */
export async function resolverCamionVendedor(supabase, vendedor = {}) {
  if (!supabase) return { data: null };
  const uid = vendedor.usuario_id || (vendedor.id && !String(vendedor.id).startsWith('rt:') ? vendedor.id : null);
  const rid = vendedor.repartidor_id || null;
  if (uid) {
    const r = await obtenerCamionPorUsuario(supabase, uid);
    if (r.data || r.error || r.aviso) return r;
  }
  if (rid) return obtenerCamionPorRepartidorRt(supabase, rid);
  return { data: null };
}

export async function crearCamionRuta(supabase, {
  codigo,
  placa,
  alias,
  usuarioId,
  repartidorId,
  notas,
} = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  const cod = slugCodigoCamion(codigo) || slugCodigoCamion(alias) || slugCodigoCamion(placa);
  if (!cod) return { ok: false, error: 'Indica un código o alias para el camión.' };
  const uid = usuarioId ? String(usuarioId).trim() : null;
  const rid = repartidorId ? String(repartidorId).trim() : null;
  if (!uid && !rid) {
    return { ok: false, error: 'Asigna el camión a un usuario Repartidor o a un recolector del Panel RT.' };
  }

  const row = {
    codigo: cod,
    placa: String(placa || '').trim() || null,
    alias: String(alias || '').trim() || null,
    usuario_id: uid,
    repartidor_id: rid,
    activo: true,
    notas: String(notas || '').trim() || null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('ruta_camiones')
    .insert([row])
    .select('*')
    .single();
  if (error && faltaTabla(error)) return { ok: false, error: AVISO_FALTA_RUTA_CAMIONES };
  if (error) {
    const m = String(error.message || '');
    if (/idx_ruta_camiones_codigo|duplicate|unique/i.test(m)) {
      return { ok: false, error: `Ya existe un camión con código «${cod}».` };
    }
    if (/idx_ruta_camiones_usuario/i.test(m)) {
      return { ok: false, error: 'Ese usuario ya tiene un camión activo asignado.' };
    }
    if (/idx_ruta_camiones_repartidor/i.test(m)) {
      return { ok: false, error: 'Ese recolector del Panel RT ya tiene un camión activo.' };
    }
    return { ok: false, error: m };
  }
  return { ok: true, camion: data };
}

export async function actualizarCamionRuta(supabase, id, patch = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  const cid = String(id || '').trim();
  if (!cid) return { ok: false, error: 'Camión inválido.' };

  const next = { updated_at: new Date().toISOString() };
  if (patch.codigo != null) {
    const cod = slugCodigoCamion(patch.codigo);
    if (!cod) return { ok: false, error: 'Código inválido.' };
    next.codigo = cod;
  }
  if (patch.placa !== undefined) next.placa = String(patch.placa || '').trim() || null;
  if (patch.alias !== undefined) next.alias = String(patch.alias || '').trim() || null;
  if (patch.notas !== undefined) next.notas = String(patch.notas || '').trim() || null;
  if (patch.activo !== undefined) next.activo = Boolean(patch.activo);
  if (patch.usuarioId !== undefined) {
    next.usuario_id = patch.usuarioId ? String(patch.usuarioId).trim() : null;
  }
  if (patch.repartidorId !== undefined) {
    next.repartidor_id = patch.repartidorId ? String(patch.repartidorId).trim() : null;
  }
  if (next.usuario_id === null && next.repartidor_id === null
    && (patch.usuarioId !== undefined || patch.repartidorId !== undefined)) {
    // al editar, si quitan ambos, exigir al menos uno (salvo desactivar)
    if (patch.activo !== false) {
      return { ok: false, error: 'El camión debe tener usuario o recolector Panel RT asignado.' };
    }
  }

  const { data, error } = await supabase
    .from('ruta_camiones')
    .update(next)
    .eq('id', cid)
    .select('*')
    .single();
  if (error && faltaTabla(error)) return { ok: false, error: AVISO_FALTA_RUTA_CAMIONES };
  if (error) {
    const m = String(error.message || '');
    if (/unique|duplicate/i.test(m)) {
      return { ok: false, error: 'Conflicto: código o asignación ya en uso por otro camión activo.' };
    }
    return { ok: false, error: m };
  }
  return { ok: true, camion: data };
}

export async function desactivarCamionRuta(supabase, id) {
  return actualizarCamionRuta(supabase, id, { activo: false });
}

export async function reactivarCamionRuta(supabase, id) {
  return actualizarCamionRuta(supabase, id, { activo: true });
}

/** Soft-check helpers for unit tests (no DB). */
export function validarCamionForm({ codigo, alias, placa, usuarioId, repartidorId } = {}) {
  const cod = slugCodigoCamion(codigo) || slugCodigoCamion(alias) || slugCodigoCamion(placa);
  if (!cod) return { ok: false, error: 'Indica un código o alias para el camión.' };
  if (!usuarioId && !repartidorId) {
    return { ok: false, error: 'Asigna el camión a un usuario Repartidor o a un recolector del Panel RT.' };
  }
  return { ok: true, codigo: cod };
}

export { slugCodigoCamion };
