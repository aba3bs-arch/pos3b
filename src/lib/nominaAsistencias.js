import { indiceEmpleados, normalizarNombreEmpleado, resolverClaveEmpleado } from './nominaMatch.js';
import { leerTurnos, turnoIdParaUsuario, esTurnoAmbos } from './turnos.js';

/** Tras este número de retardos en el periodo, los siguientes cheques tarde ya no cuentan como día. */
export const RETARDOS_LIMITE_ASISTENCIA = 5;

/** Minutos de gracia después de hora_inicio antes de marcar retardo. */
export const GRACIA_RETARDO_MINUTOS = 5;

function ymdLocal(date) {
  const d = date instanceof Date ? date : new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function minutosDesdeMedianoche(hora) {
  const parts = String(hora || '')
    .trim()
    .split(':')
    .map((x) => Number(x));
  if (!Number.isFinite(parts[0])) return null;
  return (parts[0] || 0) * 60 + (parts[1] || 0);
}

function limpiarNombreAsistencia(nombre) {
  return String(nombre || '')
    .replace(/\s*\(cubre\s*turno\)\s*$/i, '')
    .trim();
}

/**
 * True si la ENTRADA es después de hora_inicio + gracia.
 * Turnos nocturnos: se compara contra la hora de inicio del mismo día calendario del marcaje.
 */
export function esRetardoEntrada(turno, dateEntrada, graciaMin = GRACIA_RETARDO_MINUTOS) {
  if (!turno?.hora_inicio || !dateEntrada) return false;
  const minInicio = minutosDesdeMedianoche(turno.hora_inicio);
  if (minInicio == null) return false;
  const d = dateEntrada instanceof Date ? dateEntrada : new Date(dateEntrada);
  const minEntrada = d.getHours() * 60 + d.getMinutes();
  return minEntrada > minInicio + Math.max(0, Number(graciaMin) || 0);
}

function turnoParaRetardo(empleado, dateEntrada, turnos) {
  const list = turnos || leerTurnos();
  if (!list.length) return null;
  const asignado = turnoIdParaUsuario(empleado, dateEntrada);
  if (asignado && !esTurnoAmbos(asignado)) {
    return list.find((t) => String(t.id) === String(asignado)) || null;
  }
  // Ambos / sin turno fijo: el turno cuyo inicio está más cerca antes de la entrada.
  const minEntrada = dateEntrada.getHours() * 60 + dateEntrada.getMinutes();
  let mejor = null;
  let mejorDiff = Infinity;
  for (const t of list) {
    const ini = minutosDesdeMedianoche(t.hora_inicio);
    if (ini == null) continue;
    let diff = minEntrada - ini;
    if (diff < -12 * 60) diff += 24 * 60;
    if (diff < 0) continue;
    if (diff < mejorDiff) {
      mejorDiff = diff;
      mejor = t;
    }
  }
  return mejor || list[0];
}

/**
 * Carga ENTRADAS del periodo y las agrupa por empleado (primera del día).
 * @returns {{ map: Record<string, Array<{ fecha: string, created_at: string, retardo?: boolean }>>, error: string|null }}
 */
export async function asistenciasPorEmpleado(supabase, { desde, hasta, empleados = [], todasSucursales = true, sucursal }) {
  if (!supabase) return { map: {}, error: null };
  const finTs = `${hasta}T23:59:59`;
  let q = supabase
    .from('asistencias')
    .select('id, usuario_id, nombre, sucursal_id, tipo, created_at')
    .eq('tipo', 'ENTRADA')
    .gte('created_at', desde)
    .lte('created_at', finTs)
    .order('created_at', { ascending: true });
  if (!todasSucursales && sucursal) q = q.eq('sucursal_id', sucursal);

  const { data, error } = await q;
  if (error) {
    if (error.code === '42P01' || String(error.message || '').includes('asistencias')) {
      return { map: {}, error: null, sinTabla: true };
    }
    return { map: {}, error: error.message };
  }

  const indice = indiceEmpleados(empleados);
  const porEmpleado = {};

  for (const row of data || []) {
    const rowMatch = {
      ...row,
      nombre: limpiarNombreAsistencia(row.nombre),
    };
    const clave = resolverClaveEmpleado(rowMatch, indice);
    if (!clave) continue;
    const created = row.created_at ? new Date(row.created_at) : null;
    if (!created || Number.isNaN(created.getTime())) continue;
    const fecha = ymdLocal(created);
    if (!porEmpleado[clave]) porEmpleado[clave] = {};
    // Primera ENTRADA del día (la más temprana) define asistencia/retardo.
    if (!porEmpleado[clave][fecha] || created < new Date(porEmpleado[clave][fecha].created_at)) {
      porEmpleado[clave][fecha] = {
        fecha,
        created_at: created.toISOString(),
        sucursal_id: row.sucursal_id || null,
      };
    }
  }

  const map = {};
  for (const [clave, porFecha] of Object.entries(porEmpleado)) {
    map[clave] = Object.values(porFecha).sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
  }
  return { map, error: null };
}

/**
 * Calcula días trabajados desde asistencias del checador.
 * - Cheque tarde cuenta como asistencia.
 * - A partir del 5º retardo en el periodo, ese día (y siguientes retardos) ya no cuentan.
 * @returns {{ diasTrabajados: number, asistencias: number, retardos: number, detalle: Array }}
 */
export function calcularDiasDesdeAsistencias(empleado, entradas = [], { turnos = null, graciaMin = GRACIA_RETARDO_MINUTOS, limiteRetardos = RETARDOS_LIMITE_ASISTENCIA } = {}) {
  const listTurnos = turnos || leerTurnos();
  const ordenadas = [...(entradas || [])].sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
  let retardos = 0;
  let diasTrabajados = 0;
  const detalle = [];

  for (const entrada of ordenadas) {
    const when = new Date(entrada.created_at);
    const turno = turnoParaRetardo(empleado, when, listTurnos);
    const retardo = esRetardoEntrada(turno, when, graciaMin);
    if (retardo) retardos += 1;

    let cuenta = true;
    if (retardo && retardos >= limiteRetardos) {
      // 5º retardo en adelante: ya no cuenta como día trabajado.
      cuenta = false;
    }
    if (cuenta) diasTrabajados += 1;

    detalle.push({
      fecha: entrada.fecha,
      created_at: entrada.created_at,
      retardo,
      cuenta,
      turno_id: turno?.id || null,
      hora_inicio: turno?.hora_inicio || null,
    });
  }

  return {
    diasTrabajados,
    asistencias: ordenadas.length,
    retardos,
    detalle,
  };
}

export function resolverAsistenciasEmpleado(empleado, asistenciasMap) {
  if (!empleado || !asistenciasMap) return [];
  const id = String(empleado.id);
  if (asistenciasMap[id]) return asistenciasMap[id];
  const nom = normalizarNombreEmpleado(empleado.nombre);
  if (nom && asistenciasMap[`nom:${nom}`]) return asistenciasMap[`nom:${nom}`];
  return [];
}
