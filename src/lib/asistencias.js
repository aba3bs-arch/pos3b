/** Helpers para marcajes del reloj checador (asistencias). */

export function fechaHoraLocalDesdeIso(iso) {
  if (!iso) return { fecha: '', hora: '' };
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return {
    fecha: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    hora: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

export function isoDesdeFechaHoraLocal(fecha, hora) {
  if (!fecha || !hora) return null;
  const d = new Date(`${fecha}T${hora}:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export async function actualizarMarcajeAsistencia(supabase, id, { tipo, created_at, ajustado_por = null }) {
  if (!supabase || !id) return { ok: false, error: 'Datos incompletos.' };
  const payload = {};
  if (tipo === 'ENTRADA' || tipo === 'SALIDA') payload.tipo = tipo;
  if (created_at) payload.created_at = created_at;
  if (ajustado_por) payload.ajustado_por = ajustado_por;
  if (!Object.keys(payload).length) return { ok: false, error: 'Nada que actualizar.' };
  const { error } = await supabase.from('asistencias').update(payload).eq('id', id);
  if (error) {
    if (error.message?.includes('ajustado_por')) {
      const { ajustado_por: _omit, ...rest } = payload;
      const { error: err2 } = await supabase.from('asistencias').update(rest).eq('id', id);
      if (err2) return { ok: false, error: err2.message };
      return { ok: true };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function crearMarcajeAsistencia(supabase, {
  usuario_id,
  nombre,
  sucursal_id,
  tipo,
  created_at,
  ajustado_por = null,
}) {
  if (!supabase || !nombre || !sucursal_id || !tipo) {
    return { ok: false, error: 'Completa empleado, tienda y tipo.' };
  }
  const row = {
    nombre,
    sucursal_id,
    tipo,
    created_at: created_at || new Date().toISOString(),
  };
  // Omitir usuario_id si no hay empleado fijo (cubre turno); evita fallos con NOT NULL / FK.
  if (usuario_id) row.usuario_id = usuario_id;
  if (ajustado_por) row.ajustado_por = ajustado_por;
  let { error } = await supabase.from('asistencias').insert([row]);
  if (error?.message?.includes('ajustado_por')) {
    delete row.ajustado_por;
    ({ error } = await supabase.from('asistencias').insert([row]));
  }
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function eliminarMarcajeAsistencia(supabase, id) {
  if (!supabase || !id) return { ok: false, error: 'Registro no válido.' };
  const { error } = await supabase.from('asistencias').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
