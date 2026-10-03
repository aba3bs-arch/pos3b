/**
 * Asistencias para nómina: misma regla que el resumen del Checador.
 * Día trabajado = jornada cerrada (ENTRADA + SALIDA). Solo entrada no cuenta.
 * Los retardos se muestran como info; ya no restan días pagados.
 */
import { indiceEmpleados, normalizarNombreEmpleado, resolverClaveEmpleado } from './nominaMatch.js';
import { leerTurnos, turnoIdParaUsuario, esTurnoAmbos } from './turnos.js';
import {
  diasCompletosPorEntradaSalida,
  MAX_HORAS_PAR_ENTRADA_SALIDA,
  normalizarTipoMarcaje,
  ymdLocalDesdeIso,
} from './resumenDiasAsistencia.js';

/** @deprecated Ya no se usa para restar días; se conserva por compat / UI. */
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
 * Carga ENTRADA + SALIDA del periodo (con margen para salidas nocturnas)
 * y las agrupa por empleado. Misma base que el resumen del Checador.
 * @returns {{ map: Record<string, Array>, error: string|null }}
 */
export async function asistenciasPorEmpleado(supabase, { desde, hasta, empleados = [], todasSucursales = true, sucursal }) {
  if (!supabase) return { map: {}, error: null };
  const iniTs = `${desde}T00:00:00`;
  // Margen para emparejar salida del turno nocturno después del viernes.
  const finBase = new Date(`${hasta}T23:59:59`);
  const finExtend = Number.isNaN(finBase.getTime())
    ? `${hasta}T23:59:59`
    : new Date(finBase.getTime() + MAX_HORAS_PAR_ENTRADA_SALIDA * 3600 * 1000);
  const finTs = finExtend instanceof Date
    ? `${ymdLocal(finExtend)}T${String(finExtend.getHours()).padStart(2, '0')}:${String(finExtend.getMinutes()).padStart(2, '0')}:${String(finExtend.getSeconds()).padStart(2, '0')}`
    : finExtend;

  let q = supabase
    .from('asistencias')
    .select('id, usuario_id, nombre, sucursal_id, tipo, created_at')
    .gte('created_at', iniTs)
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
    const tipo = normalizarTipoMarcaje(row.tipo);
    if (!tipo) continue;
    const rowMatch = {
      ...row,
      nombre: limpiarNombreAsistencia(row.nombre),
    };
    const clave = resolverClaveEmpleado(rowMatch, indice);
    if (!clave) continue;
    const created = row.created_at ? new Date(row.created_at) : null;
    if (!created || Number.isNaN(created.getTime())) continue;
    const fecha = ymdLocal(created);
    if (!porEmpleado[clave]) porEmpleado[clave] = [];
    porEmpleado[clave].push({
      id: row.id,
      tipo,
      fecha,
      created_at: created.toISOString(),
      sucursal_id: row.sucursal_id || null,
    });
  }

  // Adjuntar metadatos del periodo para filtrar al calcular.
  const map = {};
  for (const [clave, list] of Object.entries(porEmpleado)) {
    list.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    list._periodoDesde = desde;
    list._periodoHasta = hasta;
    map[clave] = list;
  }
  return { map, error: null, desde, hasta };
}

/**
 * Días trabajados = jornadas cerradas (ENTRADA+SALIDA), igual que Checador.
 * Retardos solo informativos (no restan días).
 * @returns {{ diasTrabajados: number, asistencias: number, retardos: number, detalle: Array, diasYmd: string[] }}
 */
export function calcularDiasDesdeAsistencias(empleado, marcajes = [], {
  turnos = null,
  graciaMin = GRACIA_RETARDO_MINUTOS,
  desde = null,
  hasta = null,
} = {}) {
  const list = Array.isArray(marcajes) ? marcajes : [];
  const periodoDesde = desde || list._periodoDesde || null;
  const periodoHasta = hasta || list._periodoHasta || null;

  const diasCerrados = diasCompletosPorEntradaSalida(list);
  let diasYmd = [...diasCerrados].sort();
  if (periodoDesde && periodoHasta) {
    diasYmd = diasYmd.filter((d) => d >= periodoDesde && d <= periodoHasta);
  }

  // Primera ENTRADA de cada día cerrado → retardo informativo.
  const listTurnos = turnos || leerTurnos();
  const primeraEntradaPorDia = new Map();
  for (const m of list) {
    if (normalizarTipoMarcaje(m.tipo) !== 'ENTRADA') continue;
    const ymd = m.fecha || ymdLocalDesdeIso(m.created_at);
    if (!ymd || !diasCerrados.has(ymd)) continue;
    if (periodoDesde && ymd < periodoDesde) continue;
    if (periodoHasta && ymd > periodoHasta) continue;
    const prev = primeraEntradaPorDia.get(ymd);
    if (!prev || String(m.created_at) < String(prev.created_at)) {
      primeraEntradaPorDia.set(ymd, m);
    }
  }

  let retardos = 0;
  const detalle = [];
  for (const ymd of diasYmd) {
    const entrada = primeraEntradaPorDia.get(ymd);
    const when = entrada ? new Date(entrada.created_at) : null;
    const turno = when ? turnoParaRetardo(empleado, when, listTurnos) : null;
    const retardo = when ? esRetardoEntrada(turno, when, graciaMin) : false;
    if (retardo) retardos += 1;
    detalle.push({
      fecha: ymd,
      created_at: entrada?.created_at || null,
      retardo,
      cuenta: true,
      turno_id: turno?.id || null,
      hora_inicio: turno?.hora_inicio || null,
    });
  }

  return {
    diasTrabajados: diasYmd.length,
    // asistencias = días con jornada cerrada (alineado al checador)
    asistencias: diasYmd.length,
    retardos,
    detalle,
    diasYmd,
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
