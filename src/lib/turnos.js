import { normalizarRol } from './roles.js';
import { tieneAutorizacionFueraHorario } from './autorizacionTurnoFueraHorario.js';
import { esUsuarioCubreTurno } from './cubreTurno.js';
import { esPersonalCentralAdmin } from './usuariosAuth.js';

export const LS_TURNOS = 'pos3b_turnos_caja';
export const LS_TIPO_HORARIO = 'pos3b_tipo_horario';
export const LS_PATRONES_ROTACION_3 = 'pos3b_patrones_rotacion_3';
export const LS_TOLERANCIA_TURNOS = 'pos3b_tolerancia_turnos';
export const EVENTO_TURNOS = 'pos3b-turnos-actualizados';

export const TOLERANCIA_TURNOS_DEFAULT = {
  minutos_antes: 30,
  minutos_despues_fin: 30,
};

/** Tolerancia para marcar entrada/salida cubriendo otro turno (checador). */
export const TOLERANCIA_CHECADOR_OTRO_TURNO = {
  minutos_antes: 20,
  minutos_despues_fin: 20,
};

export const TIPOS_HORARIO = {
  '12x12': {
    id: '12x12',
    label: '12×12',
    descripcion: '2 turnos de 12 horas (diurno y nocturno) cubriendo las 24 h.',
    duracion: 12,
    inicioDefault: '07:00',
  },
  '8x24': {
    id: '8x24',
    label: '8×24',
    descripcion: '3 turnos de 8 horas (mañana, tarde y noche) cubriendo las 24 h.',
    duracion: 8,
    inicioDefault: '06:00',
  },
  personalizado: {
    id: 'personalizado',
    label: 'Personalizado',
    descripcion:
      'Define turnos libremente y asigna a cada empleado qué turno trabaja cada día (ej. 2 empleados 5 días L–V y uno rotativo 4 días).',
    duracion: null,
    inicioDefault: '07:00',
  },
};

export const TIPOS_HORARIO_LIST = [TIPOS_HORARIO['12x12'], TIPOS_HORARIO['8x24'], TIPOS_HORARIO.personalizado];

export const DIAS_SEMANA = [
  { id: 1, corto: 'Lun', largo: 'Lunes' },
  { id: 2, corto: 'Mar', largo: 'Martes' },
  { id: 3, corto: 'Mié', largo: 'Miércoles' },
  { id: 4, corto: 'Jue', largo: 'Jueves' },
  { id: 5, corto: 'Vie', largo: 'Viernes' },
  { id: 6, corto: 'Sáb', largo: 'Sábado' },
  { id: 0, corto: 'Dom', largo: 'Domingo' },
];

export const TURNOS_POR_DEFECTO = [
  { id: 'manana', nombre: 'Mañana', hora_inicio: '06:00', hora_fin: '14:00' },
  { id: 'tarde', nombre: 'Tarde', hora_inicio: '14:00', hora_fin: '22:00' },
  { id: 'noche', nombre: 'Noche', hora_inicio: '22:00', hora_fin: '06:00' },
];

/** Empleado autorizado en diurno y nocturno (gerente de piso, etc.). */
export const TURNO_AMBOS_ID = 'ambos';

export function esTurnoAmbos(turnoId) {
  return String(turnoId || '') === TURNO_AMBOS_ID;
}

function emitTurnos() {
  try {
    window.dispatchEvent(new CustomEvent(EVENTO_TURNOS));
  } catch {
    /* ignore */
  }
}

export function normalizarHora(h) {
  const m = String(h || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hh = Math.min(23, Math.max(0, parseInt(m[1], 10)));
  const mm = Math.min(59, Math.max(0, parseInt(m[2], 10)));
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function sumarHoras(hora, horasASumar) {
  const n = normalizarHora(hora);
  if (!n) return '08:00';
  const [hh, mm] = n.split(':').map(Number);
  let total = hh * 60 + mm + horasASumar * 60;
  total = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function plantillaTurnos12x12(inicioDiurno = '07:00') {
  const ini = normalizarHora(inicioDiurno) || '07:00';
  const finDiurno = sumarHoras(ini, 12);
  return [
    { id: 'diurno', nombre: 'Turno diurno', hora_inicio: ini, hora_fin: finDiurno },
    { id: 'nocturno', nombre: 'Turno nocturno', hora_inicio: finDiurno, hora_fin: ini },
  ];
}

export function plantillaTurnos8x24(inicioPrimer = '06:00') {
  const ini = normalizarHora(inicioPrimer) || '06:00';
  const fin1 = sumarHoras(ini, 8);
  const fin2 = sumarHoras(fin1, 8);
  return [
    { id: 'manana', nombre: 'Mañana (8 h)', hora_inicio: ini, hora_fin: fin1 },
    { id: 'tarde', nombre: 'Tarde (8 h)', hora_inicio: fin1, hora_fin: fin2 },
    { id: 'noche', nombre: 'Noche (8 h)', hora_inicio: fin2, hora_fin: ini },
  ];
}

export function leerConfigHorario() {
  try {
    const raw = localStorage.getItem(LS_TIPO_HORARIO);
    if (!raw) return { tipo: '12x12', inicio: TIPOS_HORARIO['12x12'].inicioDefault, subtipo: null };
    const cfg = JSON.parse(raw);
    const tipo = TIPOS_HORARIO[cfg.tipo] ? cfg.tipo : '12x12';
    const meta = TIPOS_HORARIO[tipo];
    return {
      tipo,
      subtipo: cfg.subtipo || null,
      inicio: normalizarHora(cfg.inicio) || meta.inicioDefault,
    };
  } catch {
    return { tipo: '12x12', inicio: TIPOS_HORARIO['12x12'].inicioDefault, subtipo: null };
  }
}

export function guardarConfigHorario(cfg) {
  const tipo = TIPOS_HORARIO[cfg?.tipo] ? cfg.tipo : '8x24';
  const meta = TIPOS_HORARIO[tipo];
  const prev = leerConfigHorario();
  const next = {
    tipo,
    subtipo: cfg?.subtipo !== undefined ? cfg.subtipo : prev.subtipo || null,
    inicio: normalizarHora(cfg?.inicio) || meta.inicioDefault,
  };
  if (tipo !== 'personalizado') next.subtipo = null;
  localStorage.setItem(LS_TIPO_HORARIO, JSON.stringify(next));
  emitTurnos();
  return next;
}

export function esRotacion3Activa(cfg = null) {
  const c = cfg || leerConfigHorario();
  return c.tipo === 'personalizado' && c.subtipo === 'rotacion_3';
}

/** Valores por defecto — Turno 2: miércoles a domingo (5 días) nocturno. */
export const PATRONES_ROTACION_3_DEFAULT = [
  {
    id: 'empleado_1',
    nombre: 'Turno 1',
    subtitulo: 'Lun–Vie · diurno (5 días)',
    dias: { 1: 'diurno', 2: 'diurno', 3: 'diurno', 4: 'diurno', 5: 'diurno' },
  },
  {
    id: 'empleado_2',
    nombre: 'Turno 2',
    subtitulo: 'Mié–Dom · nocturno (5 días)',
    dias: { 3: 'nocturno', 4: 'nocturno', 5: 'nocturno', 6: 'nocturno', 0: 'nocturno' },
  },
  {
    id: 'empleado_3',
    nombre: 'Turno 3',
    subtitulo: 'Sáb–Dom diurno · Lun–Mar nocturno (4 días)',
    dias: { 6: 'diurno', 0: 'diurno', 1: 'nocturno', 2: 'nocturno' },
  },
];

/** @deprecated use leerPatronesRotacion3() */
export const PATRONES_ROTACION_3 = PATRONES_ROTACION_3_DEFAULT;

function normalizarDiasPatron(dias) {
  const out = {};
  for (const [k, v] of Object.entries(dias || {})) {
    if (v === 'diurno' || v === 'nocturno') out[String(k)] = v;
  }
  return out;
}

function normalizarPatron(p) {
  const dias = normalizarDiasPatron(p?.dias);
  return {
    id: String(p?.id || ''),
    nombre: String(p?.nombre || p?.id || 'Turno'),
    dias,
    subtitulo: p?.subtitulo || resumenDiasPatron(dias),
  };
}

export function resumenDiasPatron(dias) {
  const map = normalizarDiasPatron(dias);
  const diurno = DIAS_SEMANA.filter((d) => map[String(d.id)] === 'diurno').map((d) => d.corto);
  const nocturno = DIAS_SEMANA.filter((d) => map[String(d.id)] === 'nocturno').map((d) => d.corto);
  const partes = [];
  if (diurno.length) partes.push(`${diurno.join(', ')} diurno`);
  if (nocturno.length) partes.push(`${nocturno.join(', ')} nocturno`);
  const labor = diurno.length + nocturno.length;
  if (labor < 7) partes.push(`${7 - labor} días descanso`);
  return partes.join(' · ') || 'Sin días asignados';
}

export function leerPatronesRotacion3() {
  try {
    const raw = localStorage.getItem(LS_PATRONES_ROTACION_3);
    if (!raw) return PATRONES_ROTACION_3_DEFAULT.map((p) => normalizarPatron(p));
    const list = JSON.parse(raw);
    if (!Array.isArray(list) || !list.length) return PATRONES_ROTACION_3_DEFAULT.map((p) => normalizarPatron(p));
    return list.map((p) => normalizarPatron(p));
  } catch {
    return PATRONES_ROTACION_3_DEFAULT.map((p) => normalizarPatron(p));
  }
}

export function guardarPatronesRotacion3(lista) {
  const next = (lista || []).map((p) => normalizarPatron(p)).filter((p) => p.id);
  if (next.length < 3) return { ok: false, error: 'Deben existir 3 patrones de rotación.' };
  localStorage.setItem(LS_PATRONES_ROTACION_3, JSON.stringify(next));
  emitTurnos();
  return { ok: true, patrones: next };
}

export function restaurarPatronesRotacion3Default() {
  return guardarPatronesRotacion3(PATRONES_ROTACION_3_DEFAULT);
}

export function actualizarDiaPatronRotacion(patronId, diaId, valor) {
  const list = leerPatronesRotacion3();
  const idx = list.findIndex((p) => p.id === patronId);
  if (idx < 0) return { ok: false, error: 'Patrón no encontrado.' };
  const dias = { ...list[idx].dias };
  const v = valor === 'diurno' || valor === 'nocturno' ? valor : null;
  if (v) dias[String(diaId)] = v;
  else delete dias[String(diaId)];
  list[idx] = { ...list[idx], dias, subtitulo: resumenDiasPatron(dias) };
  return guardarPatronesRotacion3(list);
}

export function patronRotacionPorId(patronId) {
  return leerPatronesRotacion3().find((p) => p.id === patronId) || null;
}

export function horarioDesdePatronRotacion(patronId) {
  const p = patronRotacionPorId(patronId);
  if (!p) return null;
  const dias = {};
  for (const [k, v] of Object.entries(p.dias)) {
    dias[String(k)] = String(v);
  }
  return { tipo: 'personalizado', subtipo: 'rotacion_3', patron: patronId, dias };
}

export function patronRotacionUsuario(user) {
  return parseTurnoHorario(user?.turno_horario)?.patron || null;
}

export function etiquetaCeldaRotacion(turnoId) {
  if (turnoId === 'diurno') return 'D';
  if (turnoId === 'nocturno') return 'N';
  return '—';
}

export function grillaSemanaPatron(diasMap) {
  return DIAS_SEMANA.map((d) => ({
    dia: d,
    turnoId: diasMap?.[String(d.id)] || diasMap?.[d.id] || null,
  }));
}

export function aplicarRotacion3Empleados(inicioDiurno = '07:00') {
  const ini = normalizarHora(inicioDiurno) || '07:00';
  const lista = plantillaTurnos12x12(ini).map((t) => ({
    ...t,
    nombre: t.id === 'diurno' ? 'Turno diurno' : 'Turno nocturno',
  }));
  guardarConfigHorario({ tipo: 'personalizado', subtipo: 'rotacion_3', inicio: ini });
  restaurarPatronesRotacion3Default();
  const r = guardarTurnos(lista);
  return { ...r, config: leerConfigHorario(), patrones: leerPatronesRotacion3() };
}

/** Actualiza en Supabase a quienes tengan asignado ese patrón. */
export async function sincronizarUsuariosConPatron(supabase, patronId) {
  if (!supabase || !patronId) return { ok: false, count: 0 };
  const horario = horarioDesdePatronRotacion(patronId);
  if (!horario) return { ok: false, count: 0 };
  const { data, error } = await supabase.from('usuarios').select('id,turno_horario');
  if (error) return { ok: false, error: error.message, count: 0 };
  const ids = (data || []).filter((u) => parseTurnoHorario(u.turno_horario)?.patron === patronId).map((u) => u.id);
  for (const id of ids) {
    await supabase.from('usuarios').update({ turno_horario: horario, turno_id: null }).eq('id', id);
  }
  return { ok: true, count: ids.length };
}

export async function sincronizarTodosPatronesRotacion(supabase) {
  if (!supabase) return { ok: false };
  let total = 0;
  for (const p of leerPatronesRotacion3()) {
    const r = await sincronizarUsuariosConPatron(supabase, p.id);
    if (r.ok) total += r.count || 0;
  }
  return { ok: true, count: total };
}

export function esHorarioPersonalizado(cfg = null) {
  const c = cfg || leerConfigHorario();
  return c.tipo === 'personalizado';
}

export function turnosParaTipo(tipo, inicio) {
  if (tipo === '12x12') return plantillaTurnos12x12(inicio);
  if (tipo === '8x24') return plantillaTurnos8x24(inicio);
  return leerTurnos();
}

export function aplicarPlantillaHorario(tipo, inicio) {
  if (tipo === 'personalizado') {
    guardarConfigHorario({ tipo: 'personalizado', inicio });
    return { ok: true, config: leerConfigHorario(), turnos: leerTurnos() };
  }
  const lista = turnosParaTipo(tipo, inicio);
  guardarConfigHorario({ tipo, inicio });
  const r = guardarTurnos(lista);
  return { ...r, config: leerConfigHorario() };
}

export function leerTurnos() {
  try {
    const raw = localStorage.getItem(LS_TURNOS);
    if (!raw) {
      const cfg = leerConfigHorario();
      if (cfg.tipo === '12x12') return plantillaTurnos12x12(cfg.inicio);
      if (cfg.tipo === '8x24') return plantillaTurnos8x24(cfg.inicio);
      return [...TURNOS_POR_DEFECTO];
    }
    const list = JSON.parse(raw);
    if (!Array.isArray(list) || !list.length) return [...TURNOS_POR_DEFECTO];
    return list.map((t) => ({
      id: String(t.id || '').trim() || 'turno',
      nombre: String(t.nombre || t.id || 'Turno').trim(),
      hora_inicio: normalizarHora(t.hora_inicio) || '08:00',
      hora_fin: normalizarHora(t.hora_fin) || '16:00',
    }));
  } catch {
    return [...TURNOS_POR_DEFECTO];
  }
}

export function guardarTurnos(lista) {
  const next = (lista || [])
    .map((t) => ({
      id: String(t.id || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_]/g, ''),
      nombre: String(t.nombre || '').trim(),
      hora_inicio: normalizarHora(t.hora_inicio),
      hora_fin: normalizarHora(t.hora_fin),
    }))
    .filter((t) => t.id && t.nombre);
  if (!next.length) return { ok: false, error: 'Debe haber al menos un turno.' };
  localStorage.setItem(LS_TURNOS, JSON.stringify(next));
  emitTurnos();
  return { ok: true, turnos: next };
}

function minutosDesdeMedianoche(hora) {
  const n = normalizarHora(hora);
  if (!n) return 0;
  const [hh, mm] = n.split(':').map(Number);
  return hh * 60 + mm;
}

/** Duración del turno en minutos (soporta cruce de medianoche). */
export function duracionTurnoMinutos(turno) {
  const ini = minutosDesdeMedianoche(turno?.hora_inicio);
  const fin = minutosDesdeMedianoche(turno?.hora_fin);
  if (ini === fin) return 24 * 60;
  if (fin > ini) return fin - ini;
  return 24 * 60 - ini + fin;
}

export function etiquetaDuracionTurno(turno) {
  const min = duracionTurnoMinutos(turno);
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

export function etiquetaEntradaSalida(turno) {
  if (!turno) return '—';
  return `Entrada ${turno.hora_inicio} · Salida ${turno.hora_fin}`;
}

function clampMinutosTolerancia(val, fallback) {
  const n = parseInt(val, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(180, Math.max(0, n));
}

export function leerToleranciaTurnos() {
  try {
    const raw = localStorage.getItem(LS_TOLERANCIA_TURNOS);
    if (!raw) return { ...TOLERANCIA_TURNOS_DEFAULT };
    const t = JSON.parse(raw);
    return {
      minutos_antes: clampMinutosTolerancia(t.minutos_antes, TOLERANCIA_TURNOS_DEFAULT.minutos_antes),
      minutos_despues_fin: clampMinutosTolerancia(t.minutos_despues_fin, TOLERANCIA_TURNOS_DEFAULT.minutos_despues_fin),
    };
  } catch {
    return { ...TOLERANCIA_TURNOS_DEFAULT };
  }
}

export function guardarToleranciaTurnos(cfg) {
  const next = {
    minutos_antes: clampMinutosTolerancia(cfg?.minutos_antes, TOLERANCIA_TURNOS_DEFAULT.minutos_antes),
    minutos_despues_fin: clampMinutosTolerancia(cfg?.minutos_despues_fin, TOLERANCIA_TURNOS_DEFAULT.minutos_despues_fin),
  };
  localStorage.setItem(LS_TOLERANCIA_TURNOS, JSON.stringify(next));
  emitTurnos();
  return next;
}

/** Turno con ventana ampliada para login (entrada anticipada y gracia al cierre). */
export function turnoConTolerancia(turno, tolerancia = null) {
  if (!turno) return null;
  const tol = tolerancia || leerToleranciaTurnos();
  const ini = minutosDesdeMedianoche(turno.hora_inicio);
  const fin = minutosDesdeMedianoche(turno.hora_fin);
  const DAY = 24 * 60;
  const newIni = ((ini - tol.minutos_antes) % DAY + DAY) % DAY;
  const newFin = ((fin + tol.minutos_despues_fin) % DAY + DAY) % DAY;
  return {
    ...turno,
    hora_inicio: `${String(Math.floor(newIni / 60)).padStart(2, '0')}:${String(newIni % 60).padStart(2, '0')}`,
    hora_fin: `${String(Math.floor(newFin / 60)).padStart(2, '0')}:${String(newFin % 60).padStart(2, '0')}`,
  };
}

/** ¿Puede el empleado entrar ahora según su turno asignado (con tolerancia)? */
export function horaEnVentanaLogin(turno, date = new Date(), tolerancia = null) {
  const t = turnoConTolerancia(turno, tolerancia);
  return t ? horaEnTurno(t, date) : false;
}

export function etiquetaVentanaLogin(turno, tolerancia = null) {
  const t = turnoConTolerancia(turno, tolerancia);
  if (!t) return '—';
  return `${t.hora_inicio}–${t.hora_fin}`;
}

/** ¿La hora (Nogales, Sonora) cae en este turno? (soporta turno nocturno que cruza medianoche) */
export function horaEnTurno(turno, date = new Date()) {
  let now;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Hermosillo',
      hour: 'numeric',
      minute: 'numeric',
      hourCycle: 'h23',
    }).formatToParts(date);
    const hour = Number(parts.find((p) => p.type === 'hour')?.value || 0);
    const minute = Number(parts.find((p) => p.type === 'minute')?.value || 0);
    now = hour * 60 + minute;
  } catch {
    now = date.getHours() * 60 + date.getMinutes();
  }
  const ini = minutosDesdeMedianoche(turno.hora_inicio);
  const fin = minutosDesdeMedianoche(turno.hora_fin);
  if (ini === fin) return true;
  if (ini < fin) return now >= ini && now < fin;
  return now >= ini || now < fin;
}

export function turnoActual(turnos = null, date = new Date()) {
  const list = turnos || leerTurnos();
  return list.find((t) => horaEnTurno(t, date)) || list[0] || null;
}

function minutosAhoraNogales(date = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Hermosillo',
      hour: 'numeric',
      minute: 'numeric',
      hourCycle: 'h23',
    }).formatToParts(date);
    const hour = Number(parts.find((p) => p.type === 'hour')?.value || 0);
    const minute = Number(parts.find((p) => p.type === 'minute')?.value || 0);
    return hour * 60 + minute;
  } catch {
    return date.getHours() * 60 + date.getMinutes();
  }
}

function enRangoMinutos(now, ini, fin) {
  if (ini === fin) return true;
  if (ini < fin) return now >= ini && now < fin;
  return now >= ini || now < fin;
}

/**
 * Turno que ya terminó oficialmente pero aún está en gracia
 * (minutos_despues_fin) — el que se está entregando.
 */
export function turnoEnEntrega(turnos = null, date = new Date(), tolerancia = null) {
  const list = turnos || leerTurnos();
  const tol = tolerancia || leerToleranciaTurnos();
  if (!tol.minutos_despues_fin) return null;
  const now = minutosAhoraNogales(date);

  for (const t of list) {
    if (horaEnTurno(t, date)) continue;
    const fin = minutosDesdeMedianoche(t.hora_fin);
    const vFin = (fin + tol.minutos_despues_fin) % (24 * 60);
    // Solo la franja DESPUÉS del cierre oficial (gracia), no la llegada temprana.
    if (!enRangoMinutos(now, fin, vFin)) continue;
    if (horaEnVentanaLogin(t, date, tol)) return t;
  }
  return null;
}

/** Turnos que se pueden cortar ahora: el en curso y, si hay gracia, el que se entrega. */
export function turnosDisponiblesParaCorte(turnos = null, date = new Date(), tolerancia = null) {
  const list = turnos || leerTurnos();
  const actual = turnoActual(list, date);
  const entrega = turnoEnEntrega(list, date, tolerancia);
  const out = [];
  if (entrega) out.push({ turno: entrega, motivo: 'entrega' });
  if (actual && (!entrega || String(actual.id) !== String(entrega.id))) {
    out.push({ turno: actual, motivo: 'actual' });
  }
  return out;
}

/** Nombre corto para UI (sin “12 h”, etc.). */
export function nombreTurnoLegible(turnoOrNombre, id) {
  const nombre = typeof turnoOrNombre === 'string' ? turnoOrNombre : turnoOrNombre?.nombre;
  const turnoId = id ?? (typeof turnoOrNombre === 'object' ? turnoOrNombre?.id : null);
  let n = String(nombre || '').trim().replace(/\s*\(\d+\s*h\)/gi, '').trim();
  if (!n || /^diurno$/i.test(n)) return 'Turno diurno';
  if (/^nocturno$/i.test(n)) return 'Turno nocturno';
  if (turnoId === 'diurno') return 'Turno diurno';
  if (turnoId === 'nocturno') return 'Turno nocturno';
  return n || '—';
}

export function etiquetaTurno(id, turnos = null) {
  if (esTurnoAmbos(id)) return 'Ambos turnos (diurno y nocturno)';
  const t = (turnos || leerTurnos()).find((x) => x.id === id);
  return t ? `${nombreTurnoLegible(t)} (entrada ${t.hora_inicio}, salida ${t.hora_fin})` : id || '—';
}

export function parseTurnoHorario(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Días efectivos del empleado (patrón en vivo o manual). */
export function diasHorarioUsuario(user) {
  const horario = parseTurnoHorario(user?.turno_horario);
  if (horario?.patron) {
    const p = patronRotacionPorId(horario.patron);
    if (p?.dias) {
      const dias = {};
      for (const [k, v] of Object.entries(p.dias)) dias[String(k)] = v;
      return dias;
    }
  }
  return horario?.dias && typeof horario.dias === 'object' ? { ...horario.dias } : {};
}

/** Turno asignado al empleado para un día concreto (personalizado) o fijo (12×12 / 8×24). */
export function turnoIdParaUsuario(user, date = new Date()) {
  const horario = parseTurnoHorario(user?.turno_horario);
  let dias = null;
  if (horario?.patron) {
    dias = patronRotacionPorId(horario.patron)?.dias;
  } else if (horario?.dias && typeof horario.dias === 'object') {
    dias = horario.dias;
  }
  if (dias) {
    const d = date.getDay();
    const id = dias[String(d)] ?? dias[d];
    return id ? String(id) : null;
  }
  const fijo = user?.turno_id;
  if (fijo && esTurnoAmbos(fijo)) return TURNO_AMBOS_ID;
  return fijo ? String(fijo) : null;
}

export function construirTurnoHorarioDesdeDias(diasMap, extra = {}) {
  const dias = {};
  for (const [k, v] of Object.entries(diasMap || {})) {
    if (v) dias[String(k)] = String(v);
  }
  return { tipo: 'personalizado', ...extra, dias };
}

export function resumenHorarioUsuario(user, turnos = null) {
  const horario = parseTurnoHorario(user?.turno_horario);
  if (horario?.patron) {
    const p = patronRotacionPorId(horario.patron);
    if (p) return `${p.nombre}: ${p.subtitulo}`;
  }
  const list = turnos || leerTurnos();
  const dias = diasHorarioUsuario(user);
  const keys = Object.keys(dias).filter((k) => dias[k]);
  if (!keys.length) {
    if (esTurnoAmbos(user?.turno_id)) return etiquetaTurno(TURNO_AMBOS_ID);
    return user?.turno_id ? etiquetaTurno(user.turno_id, list) : 'Sin turno';
  }
  const porTurno = {};
  for (const k of keys) {
    const tid = dias[k];
    porTurno[tid] = (porTurno[tid] || 0) + 1;
  }
  return Object.entries(porTurno)
    .map(([tid, n]) => `${n} días · ${list.find((t) => t.id === tid)?.nombre || tid}`)
    .join(' · ');
}

export function contarDiasLaboralesUsuario(user) {
  const dias = diasHorarioUsuario(user);
  return Object.values(dias).filter(Boolean).length;
}

export function ventaPerteneceTurno(venta, turno, dateFallback = null) {
  if (!turno) return false;
  if (venta?.turno_id && String(venta.turno_id) === String(turno.id)) return true;

  const nomV = String(venta?.turno_nombre || '').toLowerCase();
  const nomT = String(turno.nombre || '').toLowerCase();
  const idT = String(turno.id || '').toLowerCase();
  if (nomV) {
    if ((nomV.includes('nocturn') || nomV.includes('noche')) && (nomT.includes('nocturn') || nomT.includes('noche') || idT.includes('nocturn') || idT === 'noche')) {
      return true;
    }
    if ((nomV.includes('diurn') || nomV.includes('mañana') || nomV.includes('manana')) && (nomT.includes('diurn') || idT.includes('diurn') || idT === 'manana' || idT === 'mañana')) {
      return true;
    }
  }

  const when = venta?.created_at ? new Date(venta.created_at) : dateFallback;
  if (when && !Number.isNaN(when.getTime()) && horaEnTurno(turno, when)) return true;
  return false;
}

export function filtrarVentasPorTurno(ventas, turno) {
  if (!turno) return ventas || [];
  return (ventas || []).filter((v) => ventaPerteneceTurno(v, turno));
}

export function rolSujetoTurno(rol) {
  const r = normalizarRol(rol);
  return r === 'Cajero' || r === 'Repartidor';
}

/** ¿Puede el empleado iniciar sesión ahora? (cajero/repartidor solo en ventana de su turno + tolerancia). */
export function usuarioAutorizadoLogin(user, date = new Date(), turnos = null, sucursal = null) {
  if (esUsuarioCubreTurno(user)) return { ok: true, cubreTurno: true };
  const rol = normalizarRol(user?.rol);
  if (!rolSujetoTurno(rol)) return { ok: true };

  if (sucursal && tieneAutorizacionFueraHorario(user, sucursal, date)) {
    return { ok: true, autorizacionAdmin: true };
  }

  const list = turnos || leerTurnos();
  if (!list.length) {
    return { ok: false, error: 'No hay turno configurado. Pide al gerente que configure turnos en Configuración → Turnos de caja.' };
  }

  const asignado = turnoIdParaUsuario(user, date);
  if (!asignado) {
    const personalizado = parseTurnoHorario(user?.turno_horario);
    if (personalizado?.patron || personalizado?.dias) {
      const dia = DIAS_SEMANA.find((d) => d.id === date.getDay());
      return {
        ok: false,
        error: `Hoy (${dia?.largo || 'este día'}) es tu día de descanso. No puedes entrar al sistema.`,
      };
    }
    return {
      ok: false,
      error: 'No tienes turno asignado (Diurno o Nocturno). Pide al administrador que te asigne uno en Usuarios.',
    };
  }

  if (esTurnoAmbos(asignado)) return { ok: true };

  const turnoAsignado = list.find((t) => String(t.id) === String(asignado));
  if (!turnoAsignado) {
    return {
      ok: false,
      error: `Turno "${asignado}" no está en la configuración. Pide al administrador revisar Usuarios y Configuración → Turnos.`,
    };
  }

  if (horaEnVentanaLogin(turnoAsignado, date)) {
    return { ok: true };
  }

  const tol = leerToleranciaTurnos();
  const ventana = etiquetaVentanaLogin(turnoAsignado, tol);
  return {
    ok: false,
    error: `Fuera de horario. Tu turno es ${nombreTurnoLegible(turnoAsignado)} (${turnoAsignado.hora_inicio}–${turnoAsignado.hora_fin}). Puedes entrar entre ${ventana} (${tol.minutos_antes} min antes, ${tol.minutos_despues_fin} min después del cierre).`,
  };
}

/**
 * Checador: cajero/repartidor puede marcar en su turno (con tolerancia habitual) o cubrir
 * otro turno con ±20 min antes del inicio / después del cierre.
 */
export function usuarioAutorizadoChecador(user, date = new Date(), turnos = null, sucursal = null) {
  // Personal de Central (MAIN): siempre puede marcar entrada/salida en el reloj.
  if (esPersonalCentralAdmin(user)) return { ok: true, personalCentral: true };

  const rol = normalizarRol(user?.rol);
  if (!rolSujetoTurno(rol)) return { ok: true };

  if (sucursal && tieneAutorizacionFueraHorario(user, sucursal, date)) {
    return { ok: true, autorizacionAdmin: true };
  }

  const list = turnos || leerTurnos();
  if (!list.length) {
    return {
      ok: false,
      error: 'No hay turno configurado. Pide al gerente que configure turnos en Configuración → Turnos de caja.',
    };
  }

  const asignado = turnoIdParaUsuario(user, date);
  if (asignado && esTurnoAmbos(asignado)) return { ok: true };

  if (asignado) {
    const turnoAsignado = list.find((t) => String(t.id) === String(asignado));
    if (turnoAsignado && horaEnVentanaLogin(turnoAsignado, date)) {
      return { ok: true };
    }
  }

  const tolCruz = TOLERANCIA_CHECADOR_OTRO_TURNO;
  for (const turno of list) {
    if (asignado && String(turno.id) === String(asignado)) continue;
    if (horaEnVentanaLogin(turno, date, tolCruz)) {
      return {
        ok: true,
        coberturaTurno: true,
        turnoCubierto: turno.id,
        mensaje: `Marcaje en turno ${nombreTurnoLegible(turno)} (cobertura, ±${tolCruz.minutos_antes} min).`,
      };
    }
  }

  if (!asignado) {
    const personalizado = parseTurnoHorario(user?.turno_horario);
    if (personalizado?.patron || personalizado?.dias) {
      const dia = DIAS_SEMANA.find((d) => d.id === date.getDay());
      return {
        ok: false,
        error: `Hoy (${dia?.largo || 'este día'}) es tu día de descanso. Solo puedes marcar si estás cubriendo otro turno (±${tolCruz.minutos_antes} min antes o después).`,
      };
    }
    return {
      ok: false,
      error: 'No tienes turno asignado (Diurno o Nocturno). Pide al administrador que te asigne uno en Usuarios.',
    };
  }

  const turnoAsignado = list.find((t) => String(t.id) === String(asignado));
  if (!turnoAsignado) {
    return {
      ok: false,
      error: `Turno "${asignado}" no está en la configuración. Pide al administrador revisar Usuarios y Configuración → Turnos.`,
    };
  }

  const tol = leerToleranciaTurnos();
  const ventana = etiquetaVentanaLogin(turnoAsignado, tol);
  return {
    ok: false,
    error: `Fuera de horario. Tu turno es ${nombreTurnoLegible(turnoAsignado)} (${turnoAsignado.hora_inicio}–${turnoAsignado.hora_fin}, ventana ${ventana}). En el checador puedes marcar cubriendo otro turno con ±${tolCruz.minutos_antes} min, o pide autorización al administrador.`,
  };
}

/**
 * Cajero corta su turno en curso o el que se entrega (gracia post-cierre).
 * Gerente/Admin/Supervisor pueden cortar cualquiera.
 * Con autorización admin fuera de horario, puede cortar su turno asignado si está disponible.
 */
export function usuarioAutorizadoCorte(user, turno, date = new Date(), opts = {}) {
  if (!turno) return { ok: false, error: 'No hay turno configurado para esta hora.' };
  const rol = normalizarRol(user?.rol);
  if (['Administrador', 'Gerente', 'Supervisor'].includes(rol)) return { ok: true };

  const list = opts.turnos || leerTurnos();
  const disponibles = turnosDisponiblesParaCorte(list, date);
  const enLista = disponibles.some((d) => String(d.turno.id) === String(turno.id));
  const entrega = disponibles.find((d) => d.motivo === 'entrega')?.turno;
  const enEntrega = Boolean(entrega && String(entrega.id) === String(turno.id));

  if (!enLista) {
    const tol = leerToleranciaTurnos();
    return {
      ok: false,
      error:
        `Ese turno ya no se puede cortar. Durante ${tol.minutos_despues_fin} min después de la salida ` +
        `aún puedes cortar el turno que se entrega` +
        (entrega ? ` (${nombreTurnoLegible(entrega)})` : '') +
        `. Si el relevo llegó tarde, un administrador o gerente puede hacer el corte, ` +
        `o autorizar la entrada con PIN en el login.`,
    };
  }

  const sucursal = opts.sucursal;
  if (sucursal && tieneAutorizacionFueraHorario(user, sucursal, date)) {
    return { ok: true, autorizacionAdmin: true, enEntrega };
  }

  const asignado = turnoIdParaUsuario(user, date);
  if (!asignado) {
    const personalizado = parseTurnoHorario(user?.turno_horario);
    if (personalizado?.patron || personalizado?.dias) {
      const dia = DIAS_SEMANA.find((d) => d.id === date.getDay());
      const patron = personalizado.patron ? patronRotacionPorId(personalizado.patron)?.nombre : null;
      return {
        ok: false,
        error: patron
          ? `Hoy (${dia?.largo || 'este día'}) es descanso en ${patron}. No puedes hacer corte.`
          : `Hoy (${dia?.largo || 'este día'}) no tienes turno asignado. Revisa Configuración → Turnos.`,
      };
    }
    return {
      ok: false,
      error: 'Tu usuario no tiene turno asignado. Configúralo en Usuarios o Configuración → Turnos.',
    };
  }
  if (esTurnoAmbos(asignado)) return { ok: true, enEntrega };
  if (String(asignado) !== String(turno.id)) {
    return {
      ok: false,
      error: `Estás cortando ${nombreTurnoLegible(turno)}. Hoy te corresponde ${etiquetaTurno(asignado, list)}. ` +
        (enEntrega
          ? 'Si entregas este turno, usa el usuario del turno saliente o pide a un gerente/admin.'
          : 'Un gerente o administrador puede hacer el corte del turno que se entrega.'),
    };
  }
  return { ok: true, enEntrega };
}

export function nuevoIdTurno(nombre) {
  const base = String(nombre || 'turno')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  return base || `turno_${Date.now()}`;
}
