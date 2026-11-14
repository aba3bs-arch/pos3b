/** Helpers para marcajes del reloj checador (asistencias). */
import { diaMarcaje, rangoDiaMarcajeIso, validarMarcajeUnicoPorDia } from './marcajesDia.js';

const MSG_DUPLICADO = 'Solo se permite una entrada y una salida por día para cada empleado.';
const MSG_INDICE_ADMIN =
  'La base de datos todavía impide más de una entrada o salida por día. En Supabase ejecuta el SQL de supabase/asistencias_un_marcaje_por_dia.sql para que el administrador pueda registrar varias.';

function errorMarcajeDuplicado(unicoPorDia) {
  return { ok: false, error: unicoPorDia ? MSG_DUPLICADO : MSG_INDICE_ADMIN, duplicado: true };
}

function esErrorDuplicado(error) {
  return error?.code === '23505' || /duplicate key|unique constraint/i.test(String(error?.message || ''));
}

/** Marcajes del empleado en un día (hora Sonora), en cualquier tienda. Lanza si falla la consulta. */
export async function listarMarcajesEmpleadoDia(supabase, empleado, ymd) {
  const rango = rangoDiaMarcajeIso(ymd);
  if (!supabase || !rango || !(empleado?.id || empleado?.nombre)) return [];
  const base = () =>
    supabase
      .from('asistencias')
      .select('id,usuario_id,nombre,tipo,created_at,sucursal_id')
      .gte('created_at', rango.desde)
      .lt('created_at', rango.hasta)
      .limit(50);
  const consultas = [];
  if (empleado.id) {
    consultas.push(base().eq('usuario_id', empleado.id));
    if (empleado.nombre) consultas.push(base().is('usuario_id', null).eq('nombre', empleado.nombre));
  } else {
    consultas.push(base().eq('nombre', empleado.nombre));
  }
  const res = await Promise.all(consultas);
  const err = res.find((r) => r.error)?.error;
  if (err) throw err;
  const vistos = new Set();
  return res.flatMap((r) => r.data || []).filter((m) => (vistos.has(m.id) ? false : vistos.add(m.id)));
}

async function validarUnicoPorDiaEnBd(supabase, empleado, tipo, createdAt, opts) {
  let rows;
  try {
    rows = await listarMarcajesEmpleadoDia(supabase, empleado, diaMarcaje(createdAt));
  } catch (e) {
    return { ok: false, error: `No se pudo verificar tus marcajes de hoy: ${e.message || e}` };
  }
  return validarMarcajeUnicoPorDia(rows, empleado, tipo, createdAt, opts);
}

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

export async function actualizarMarcajeAsistencia(supabase, id, {
  tipo,
  created_at,
  ajustado_por = null,
  unicoPorDia = true,
}) {
  if (!supabase || !id) return { ok: false, error: 'Datos incompletos.' };
  const payload = {};
  if (tipo === 'ENTRADA' || tipo === 'SALIDA') payload.tipo = tipo;
  if (created_at) payload.created_at = created_at;
  if (ajustado_por) payload.ajustado_por = ajustado_por;
  if (!Object.keys(payload).length) return { ok: false, error: 'Nada que actualizar.' };

  if (unicoPorDia && (payload.tipo || payload.created_at)) {
    const { data: actual } = await supabase
      .from('asistencias')
      .select('id,usuario_id,nombre,tipo,created_at')
      .eq('id', id)
      .maybeSingle();
    if (actual) {
      const check = await validarUnicoPorDiaEnBd(
        supabase,
        { id: actual.usuario_id, nombre: actual.nombre },
        payload.tipo || actual.tipo,
        payload.created_at || actual.created_at,
        { excluirId: id },
      );
      if (!check.ok) return { ok: false, error: check.error };
    }
  }

  let { error } = await supabase.from('asistencias').update(payload).eq('id', id);
  if (error?.message?.includes('ajustado_por')) {
    const { ajustado_por: _omit, ...rest } = payload;
    ({ error } = await supabase.from('asistencias').update(rest).eq('id', id));
  }
  if (error && esErrorDuplicado(error)) return errorMarcajeDuplicado(unicoPorDia);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function crearMarcajeAsistencia(supabase, {
  usuario_id,
  nombre,
  sucursal_id,
  tipo,
  created_at,
  ajustado_por = null,
  unicoPorDia = true,
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
  if (unicoPorDia) {
    const check = await validarUnicoPorDiaEnBd(supabase, { id: usuario_id, nombre }, tipo, row.created_at);
    if (!check.ok) return { ok: false, error: check.error, duplicado: Boolean(check.duplicado) };
  }
  // Omitir usuario_id si no hay empleado fijo (cubre turno); evita fallos con NOT NULL / FK.
  if (usuario_id) row.usuario_id = usuario_id;
  if (ajustado_por) row.ajustado_por = ajustado_por;
  let { error } = await supabase.from('asistencias').insert([row]);
  if (error?.message?.includes('ajustado_por')) {
    delete row.ajustado_por;
    ({ error } = await supabase.from('asistencias').insert([row]));
  }
  if (error && esErrorDuplicado(error)) return errorMarcajeDuplicado(unicoPorDia);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function eliminarMarcajeAsistencia(supabase, id) {
  if (!supabase || !id) return { ok: false, error: 'Registro no válido.' };
  const { error } = await supabase.from('asistencias').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
