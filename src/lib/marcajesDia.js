import { ymdNogalesFromDate } from './corteCaja.js';

/** Un empleado solo puede tener una ENTRADA y una SALIDA por día (hora Sonora). */
export const TIPOS_MARCAJE = ['ENTRADA', 'SALIDA'];

export function diaMarcaje(iso) {
  return ymdNogalesFromDate(iso instanceof Date ? iso : new Date(iso));
}

/** Rango [desde, hasta) del día en Sonora (UTC−7 fijo) como ISO UTC. */
export function rangoDiaMarcajeIso(ymd) {
  const ini = new Date(`${ymd}T00:00:00-07:00`);
  if (Number.isNaN(ini.getTime())) return null;
  const fin = new Date(ini.getTime() + 24 * 60 * 60 * 1000);
  return { desde: ini.toISOString(), hasta: fin.toISOString() };
}

function norm(s) {
  return String(s || '').trim().toLowerCase();
}

/** Mismo empleado: por usuario_id; sin id (cubre turno / registros viejos) por nombre. */
export function esMismoEmpleadoMarcaje(marcaje, empleado) {
  const idM = marcaje?.usuario_id != null && marcaje.usuario_id !== '' ? String(marcaje.usuario_id) : '';
  const idE = empleado?.id != null && empleado.id !== '' ? String(empleado.id) : '';
  if (idM && idE) return idM === idE;
  if (idM || idE) return !idM && norm(marcaje?.nombre) === norm(empleado?.nombre) && Boolean(norm(empleado?.nombre));
  return Boolean(norm(empleado?.nombre)) && norm(marcaje?.nombre) === norm(empleado?.nombre);
}

export function marcajesDelEmpleadoEnDia(rows, empleado, ymd, { excluirId = null } = {}) {
  return (rows || []).filter(
    (m) =>
      m &&
      (excluirId == null || String(m.id) !== String(excluirId)) &&
      diaMarcaje(m.created_at) === ymd &&
      esMismoEmpleadoMarcaje(m, empleado),
  );
}

export function estadoMarcajesDia(rows, empleado, ymd, opts) {
  const delDia = marcajesDelEmpleadoEnDia(rows, empleado, ymd, opts);
  const entrada = delDia.find((m) => m.tipo === 'ENTRADA') || null;
  const salida = delDia.find((m) => m.tipo === 'SALIDA') || null;
  return { entrada, salida, completo: Boolean(entrada && salida) };
}

function horaTxt(iso) {
  try {
    return new Date(iso).toLocaleTimeString('es-MX', {
      timeZone: 'America/Hermosillo',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

/** ¿Se puede registrar `tipo` para ese empleado en el día de `createdAt`? */
export function validarMarcajeUnicoPorDia(rows, empleado, tipo, createdAt = new Date(), opts) {
  if (!TIPOS_MARCAJE.includes(tipo)) return { ok: false, error: 'Tipo de marcaje no válido.' };
  const ymd = diaMarcaje(createdAt);
  if (!ymd) return { ok: false, error: 'Fecha de marcaje no válida.' };
  const est = estadoMarcajesDia(rows, empleado, ymd, opts);
  const previo = tipo === 'ENTRADA' ? est.entrada : est.salida;
  if (previo) {
    const nombre = empleado?.nombre ? `${empleado.nombre}: ` : '';
    return {
      ok: false,
      duplicado: previo,
      error: `${nombre}ya tiene una ${tipo === 'ENTRADA' ? 'entrada' : 'salida'} ese día (${horaTxt(previo.created_at)}). Solo se permite una entrada y una salida por día.`,
    };
  }
  return { ok: true };
}
