/**
 * Cortes (Abarrotes / Virtual / Garage): gastos, faltantes y consumos a nombre de un empleado
 * pasados 45 min del fin de su turno solo se pueden cargar con el NIP de ese empleado
 * (el que se elige en EMPLEADO o se menciona en subcategoría / comentario).
 */
import { esTurnoAmbos, leerTurnos, normalizarHora, parseTurnoHorario, turnoIdParaUsuario } from './turnos.js';
import { normalizarRol } from './roles.js';
import { esUsuarioCubreTurno } from './cubreTurno.js';
import { normalizarNombrePersona } from './empleadosVisibles.js';
import { rolPuedeAutorizarFueraHorario, tieneAutorizacionFueraHorario } from './autorizacionTurnoFueraHorario.js';
import { tieneExtensionSesionTurno } from './extensionSesionTurno.js';
import { usuarioEstaActivo } from './usuariosAuth.js';

export const GRACIA_CARGO_FUERA_TURNO_MIN = 45;
const DIA_MIN = 24 * 60;

function minutosHora(h) {
  const n = normalizarHora(h);
  if (!n) return null;
  const [hh, mm] = n.split(':').map(Number);
  return hh * 60 + mm;
}

function minutosAhoraNogales(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Hermosillo',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(date);
  const h = Number(parts.find((p) => p.type === 'hour')?.value || 0);
  const m = Number(parts.find((p) => p.type === 'minute')?.value || 0);
  return h * 60 + m;
}

function horarioTienePorDias(emp) {
  const h = parseTurnoHorario(emp?.turno_horario);
  return Boolean(h?.patron || (h?.dias && typeof h.dias === 'object'));
}

/** ¿`rel` (min desde la medianoche del día de asignación) cae en [inicio, fin + gracia]? */
function enVentanaConGracia(turno, rel, graciaMin) {
  const ini = minutosHora(turno?.hora_inicio);
  const fin = minutosHora(turno?.hora_fin);
  if (ini == null || fin == null) return false;
  const dur = ini === fin ? DIA_MIN : ((fin - ini) + DIA_MIN) % DIA_MIN;
  return rel >= ini && rel <= ini + dur + graciaMin;
}

/**
 * ¿Aplica la restricción a este empleado y está dentro de su turno (+45 min)?
 * - aplica=false: no se puede/no corresponde evaluar (admin, cubre turno, sin turno asignado, turno "ambos").
 * - dentro=true: puede cargarse sin NIP.
 */
export function estadoTurnoEmpleadoParaCargo(emp, {
  date = new Date(),
  turnos = null,
  sucursal = null,
  graciaMin = GRACIA_CARGO_FUERA_TURNO_MIN,
} = {}) {
  const no = (motivo) => ({ aplica: false, dentro: true, motivo });
  if (!emp) return no('sin_empleado');
  const rol = normalizarRol(emp.rol);
  if (rol !== 'Cajero' && rol !== 'Repartidor') return no('rol_sin_turno');
  if (esUsuarioCubreTurno(emp)) return no('cubre_turno');

  const lista = turnos || leerTurnos(sucursal);
  if (!lista?.length) return no('sin_turnos_configurados');

  const ayer = new Date(date.getTime() - DIA_MIN * 60 * 1000);
  const idHoy = turnoIdParaUsuario(emp, date);
  const idAyer = turnoIdParaUsuario(emp, ayer);
  if (!idHoy && !idAyer && !emp.turno_id && !horarioTienePorDias(emp)) return no('sin_turno_asignado');
  if ((idHoy && esTurnoAmbos(idHoy)) || (idAyer && esTurnoAmbos(idAyer))) return no('ambos_turnos');

  if (
    sucursal && (
      tieneAutorizacionFueraHorario(emp, sucursal, date)
      || tieneExtensionSesionTurno(emp, sucursal, date)
    )
  ) {
    return { aplica: true, dentro: true, motivo: 'autorizado' };
  }

  const ahora = minutosAhoraNogales(date);
  const evaluar = (id, rel) => {
    if (!id) return false;
    const turno = lista.find((t) => String(t.id) === String(id));
    return turno ? enVentanaConGracia(turno, rel, graciaMin) : false;
  };
  if (evaluar(idHoy, ahora) || evaluar(idAyer, ahora + DIA_MIN)) {
    return { aplica: true, dentro: true, motivo: 'en_turno' };
  }
  return { aplica: true, dentro: false, motivo: idHoy || idAyer ? 'fuera_de_turno' : 'descanso' };
}

function esEmpleadoRealDeTienda(e) {
  const id = String(e?.id ?? '');
  return Boolean(id) && !id.startsWith('indirect:') && !id.startsWith('consumo-pin:');
}

/** Empleados cuyo nombre aparece en el texto (nombre completo, o nombre de pila como palabra). */
export function empleadosMencionadosEnTexto(texto, empleados = []) {
  const t = normalizarNombrePersona(texto);
  if (!t) return [];
  const tokens = new Set(t.split(' ').filter(Boolean));
  return (empleados || []).filter((e) => {
    if (!esEmpleadoRealDeTienda(e)) return false;
    const nom = normalizarNombrePersona(e.nombre);
    if (!nom) return false;
    if (nom.length >= 4 && ` ${t} `.includes(` ${nom} `)) return true;
    const pila = nom.split(' ')[0];
    return pila.length >= 3 && tokens.has(pila);
  });
}

/**
 * Empleados a los que se carga el movimiento (elegido en EMPLEADO + mencionados en
 * categoría / subcategoría / comentario) que están fuera de turno (+45 min).
 */
export function empleadosQueRequierenPinPorCargo({
  seleccionado = null,
  textos = [],
  empleados = [],
  sucursal = null,
  date = new Date(),
  turnos = null,
  graciaMin = GRACIA_CARGO_FUERA_TURNO_MIN,
} = {}) {
  const candidatos = [];
  const vistos = new Set();
  const push = (e) => {
    if (!e || !esEmpleadoRealDeTienda(e)) return;
    const k = String(e.id);
    if (vistos.has(k)) return;
    vistos.add(k);
    candidatos.push(e);
  };
  push(seleccionado);
  for (const e of empleadosMencionadosEnTexto((textos || []).filter(Boolean).join(' '), empleados)) push(e);

  const out = [];
  for (const e of candidatos) {
    const est = estadoTurnoEmpleadoParaCargo(e, { date, turnos, sucursal, graciaMin });
    if (est.aplica && !est.dentro) out.push({ empleado: e, motivo: est.motivo });
  }
  return out;
}

/**
 * Valida el NIP: debe ser el del empleado. Un administrador/gerente también puede autorizar
 * (por si el nombre en el comentario es incidental o el empleado no está presente).
 */
export async function verificarPinCargoFueraTurno(supabase, pin, empleado) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  const p = String(pin || '').trim();
  const nombre = empleado?.nombre || 'el empleado';
  if (!p) return { ok: false, error: `Fuera de turno: ingresa el NIP de ${nombre}.` };
  const { data, error } = await supabase
    .from('usuarios')
    .select('id, nombre, pin, rol, sucursal_id, activo')
    .eq('pin', p);
  if (error) return { ok: false, error: error.message };
  const activos = (data || []).filter((u) => usuarioEstaActivo(u));
  const propio = activos.find((u) => String(u.id) === String(empleado?.id));
  if (propio) return { ok: true, autorizo: propio.nombre, esAdmin: false };
  const admin = activos.find((u) => rolPuedeAutorizarFueraHorario(u.rol));
  if (admin) return { ok: true, autorizo: admin.nombre, esAdmin: true };
  return { ok: false, error: `NIP incorrecto. Fuera de turno solo se carga con el NIP de ${nombre}.` };
}

export function textoAvisoFueraTurno(empleado, motivo) {
  const nombre = empleado?.nombre || 'El empleado';
  if (motivo === 'descanso') return `${nombre} no tiene turno hoy.`;
  return `${nombre} ya pasó 45 min de su turno.`;
}
