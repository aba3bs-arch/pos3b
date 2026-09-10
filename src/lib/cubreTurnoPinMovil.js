/**
 * PIN personal del CT para su celular (app / PWA).
 * - No es el PIN universal de tienda ni el PIN temporal de una cobertura.
 * - Solo sirve en dispositivo móvil y queda anclado al primer equipo que use.
 * - Con ese PIN el CT entra a Checador → Cubre turnos a ver/aceptar solicitudes.
 */
import { detectarMobile } from './notificacionesDispositivo.js';
import { obtenerIdDispositivoLocal } from './dispositivoUsuario.js';
import { generarPinCubreTurnoAleatorio, normalizarPinComparacion } from './cubreTurno.js';

export function esDispositivoMovilCt() {
  return detectarMobile();
}

export function generarPinMovilCt() {
  return generarPinCubreTurnoAleatorio();
}

function extrasDe(emp) {
  return emp?.extras && typeof emp.extras === 'object' ? { ...emp.extras } : {};
}

function nombreCt(emp) {
  if (emp?.nombre_completo) return String(emp.nombre_completo).trim();
  return [emp?.nombre, emp?.apellidos].filter(Boolean).join(' ').trim();
}

/**
 * Asegura extras.ct_pin_movil en el expediente RH del CT.
 * No regenera si ya existe (salvo forzar).
 */
export async function asegurarPinMovilCt(supabase, empleado, { forzar = false } = {}) {
  if (!supabase || !empleado?.id) return { ok: false, error: 'CT inválido.' };
  const ex = extrasDe(empleado);
  const actual = normalizarPinComparacion(ex.ct_pin_movil);
  if (actual && !forzar) {
    return {
      ok: true,
      pin: actual,
      yaExiste: true,
      dispositivoId: ex.ct_dispositivo_id || null,
    };
  }
  let pin = generarPinMovilCt();
  // Evitar choque trivial con el mismo expediente (reintentos cortos).
  for (let i = 0; i < 5 && pin === actual; i += 1) pin = generarPinMovilCt();
  const next = {
    ...ex,
    ct_pin_movil: pin,
    // al regenerar, liberar anclaje previo
    ...(forzar ? { ct_dispositivo_id: null, ct_dispositivo_at: null } : {}),
  };
  const { data, error } = await supabase
    .from('rh_empleados')
    .update({ extras: next, updated_at: new Date().toISOString() })
    .eq('id', empleado.id)
    .select('id, nombre, apellidos, nombre_completo, telefono, extras, estado, tipo_empleado')
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, pin, empleado: data, regenerado: Boolean(forzar && actual) };
}

/**
 * Valida PIN personal CT. Solo en móvil; ancla dispositivo en el primer uso.
 */
export async function validarPinMovilCt(supabase, pin) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  const p = normalizarPinComparacion(pin);
  if (!p) return { ok: false };

  if (!esDispositivoMovilCt()) {
    return {
      ok: false,
      error:
        'El PIN personal del CT solo funciona en tu celular (app o navegador móvil). '
        + 'En caja de tienda usa el PIN de cubre turno de Configuración o el PIN temporal de la cobertura.',
      soloMovil: true,
    };
  }

  const { data, error } = await supabase
    .from('rh_empleados')
    .select('id, nombre, apellidos, nombre_completo, telefono, extras, estado, tipo_empleado, sucursal_id')
    .eq('tipo_empleado', 'cubre_turno')
    .eq('estado', 'activo')
    .limit(300);
  if (error) return { ok: false, error: error.message };

  const emp = (data || []).find((e) => normalizarPinComparacion(extrasDe(e).ct_pin_movil) === p);
  if (!emp) return { ok: false };

  const deviceId = obtenerIdDispositivoLocal();
  const ex = extrasDe(emp);
  const anclado = String(ex.ct_dispositivo_id || '').trim();

  if (anclado && anclado !== deviceId) {
    return {
      ok: false,
      error:
        'Este PIN de CT ya está vinculado a otro celular. '
        + 'Si cambiaste de teléfono, pide en RH que liberen / regeneren tu PIN móvil.',
      dispositivoAjeno: true,
    };
  }

  if (!anclado) {
    const next = {
      ...ex,
      ct_dispositivo_id: deviceId,
      ct_dispositivo_at: new Date().toISOString(),
    };
    const { error: upErr } = await supabase
      .from('rh_empleados')
      .update({ extras: next, updated_at: new Date().toISOString() })
      .eq('id', emp.id);
    if (upErr) return { ok: false, error: upErr.message };
    emp.extras = next;
  }

  return {
    ok: true,
    empleado: emp,
    usuario: construirUsuarioCtMovil(emp),
  };
}

export function construirUsuarioCtMovil(empleado) {
  const ex = extrasDe(empleado);
  return {
    id: null,
    rh_id: empleado.id,
    nombre: nombreCt(empleado) || 'Cubre turno',
    telefono: String(empleado.telefono || '').replace(/\D/g, ''),
    rol: 'Cajero',
    sucursal_id: empleado.sucursal_id || 'MAIN',
    esCubreTurno: true,
    esCtMovil: true,
    ctRhId: empleado.id,
    ctPinMovil: true,
    dispositivo_id: ex.ct_dispositivo_id || obtenerIdDispositivoLocal(),
  };
}

/** Libera anclaje de dispositivo (RH / admin). */
export async function liberarDispositivoPinMovilCt(supabase, rhId) {
  if (!supabase || !rhId) return { ok: false, error: 'CT inválido.' };
  const { data: prev, error } = await supabase
    .from('rh_empleados')
    .select('id, extras')
    .eq('id', rhId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!prev) return { ok: false, error: 'CT no encontrado.' };
  const ex = extrasDe(prev);
  const next = { ...ex };
  delete next.ct_dispositivo_id;
  delete next.ct_dispositivo_at;
  const { error: upErr } = await supabase
    .from('rh_empleados')
    .update({ extras: next, updated_at: new Date().toISOString() })
    .eq('id', rhId);
  if (upErr) return { ok: false, error: upErr.message };
  return { ok: true };
}
