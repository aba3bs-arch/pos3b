/**
 * Retardos del bono: entrada del reloj contra la hora del turno.
 * Tolerancia por defecto 15 min. Con 3 retardos en el periodo se pierde la parte de ese factor.
 */
import { cargarMarcajesResumen, diaLaborableParaBono, listarYmdInclusive } from './resumenDiasAsistencia.js';
import { leerPlanHorarioLocal, sincronizarPlanHorarioDesdeNube } from './planHorarioSync.js';
import { leerTurnos, turnoIdParaUsuario, esTurnoAmbos } from './turnos.js';
import { sincronizarTurnosDesdeNube } from './turnosSync.js';

function minutosDesdeMedianoche(hora) {
  const parts = String(hora || '').trim().split(':').map((x) => Number(x));
  if (!Number.isFinite(parts[0])) return null;
  return (parts[0] || 0) * 60 + (parts[1] || 0);
}

function partesHermosillo(date) {
  const d = date instanceof Date ? date : new Date(date);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Hermosillo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(d);
  const pick = (type) => parts.find((p) => p.type === type)?.value || '';
  return {
    ymd: `${pick('year')}-${pick('month')}-${pick('day')}`,
    minutos: Number(pick('hour')) * 60 + Number(pick('minute')),
  };
}

/** Llegó después de la hora de entrada más la tolerancia. El turno de noche cruza medianoche. */
export function esRetardoBono(horaInicio, isoEntrada, toleranciaMin = 15) {
  const minInicio = minutosDesdeMedianoche(horaInicio);
  if (minInicio == null || !isoEntrada) return false;
  const minEntrada = partesHermosillo(isoEntrada).minutos;
  if (!Number.isFinite(minEntrada)) return false;
  let diff = minEntrada - minInicio;
  if (diff < -12 * 60) diff += 24 * 60;
  return diff > Math.max(0, Number(toleranciaMin) || 0);
}

function turnoDelDia(empleado, ymd, turnos) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  const date = new Date(y, m - 1, d, 12, 0, 0);
  const list = Array.isArray(turnos) ? turnos : [];
  const asignado = turnoIdParaUsuario(empleado, date);
  if (asignado && !esTurnoAmbos(asignado)) {
    return list.find((t) => String(t.id) === String(asignado)) || null;
  }
  return null;
}

/**
 * Cuenta retardos del periodo. Un día sin entrada no es retardo (la falta ya quita el bono).
 * @returns {{ retardos: number, detalle: Array }}
 */
export function contarRetardosPeriodo({
  empleado,
  marcajes = [],
  desde,
  hasta,
  turnos = [],
  plan = null,
  toleranciaMin = 15,
  descansosAutSet = null,
  hoy = null,
} = {}) {
  const dias = listarYmdInclusive(desde, hasta);
  const entradas = (marcajes || []).filter((m) => String(m?.tipo || '').toUpperCase() === 'ENTRADA' && m?.created_at);
  let retardos = 0;
  const detalle = [];
  for (const ymd of dias) {
    if (!diaLaborableParaBono(empleado, ymd, { plan, descansosAutSet, hoy: hoy || hasta })) continue;
    const delDia = entradas
      .filter((m) => partesHermosillo(m.created_at).ymd === ymd)
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    if (!delDia.length) continue;
    const turno = turnoDelDia(empleado, ymd, turnos);
    if (!turno?.hora_inicio) continue;
    const tarde = esRetardoBono(turno.hora_inicio, delDia[0].created_at, toleranciaMin);
    if (tarde) retardos += 1;
    detalle.push({
      fecha: ymd,
      horaInicio: turno.hora_inicio,
      created_at: delDia[0].created_at,
      retardo: tarde,
    });
  }
  return { retardos, detalle };
}

export function ajusteRetardoBono(pack, porClave = {}) {
  const regla = (pack?.reglas || []).find((r) => r.id === 'retardos' && r.porEmpleado);
  if (!regla) return { pesoRetardo: 0, umbralRetardos: 3, retardosPorClave: {} };
  return {
    pesoRetardo: Number(regla.pesoPct) || 0,
    umbralRetardos: Number(pack?.config?.reglas?.retardos?.maxRetardos) || 3,
    retardosPorClave: porClave || {},
  };
}

/** Retardos del reloj por empleado de la plantilla, en el periodo del bono. */
export async function cargarRetardosBono(supabase, {
  sucursal,
  desde,
  hasta,
  plantilla = [],
  config = null,
} = {}) {
  const regla = config?.reglas?.retardos;
  if (!regla?.activo || !supabase || !desde || !hasta) return {};
  const toleranciaMin = Number(regla.toleranciaMinutos) || 15;
  try {
    await Promise.all([
      sincronizarTurnosDesdeNube(supabase, sucursal),
      sincronizarPlanHorarioDesdeNube(supabase),
    ]);
  } catch {
    /* el cache local sigue sirviendo */
  }
  const turnos = leerTurnos(sucursal);
  const plan = leerPlanHorarioLocal();
  const marc = await cargarMarcajesResumen(supabase, {
    desdeIso: `${desde}T00:00:00-07:00`,
    hastaIso: `${hasta}T23:59:59-07:00`,
    sucursalId: sucursal,
  });
  const porClave = {};
  for (const u of plantilla || []) {
    const id = u?.id != null ? String(u.id) : '';
    if (!id) continue;
    const rows = (marc?.data || []).filter((m) => String(m.usuario_id || '') === id);
    const c = contarRetardosPeriodo({
      empleado: u,
      marcajes: rows,
      desde,
      hasta,
      turnos,
      plan,
      toleranciaMin,
    });
    porClave[`id:${id}`] = c.retardos;
  }
  return porClave;
}
