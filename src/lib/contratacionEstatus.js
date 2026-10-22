import { etiquetaTienda, normalizarCodigoTienda } from '../constants/sucursales.js';
import {
  actualizarSolicitudContratacion,
  entradaSeguimiento,
  etiquetaTipoContratacion,
  puedeGestionarContratacion,
} from './contratacion.js';

export const AVISO_FALTA_ESTATUS_CONTRATACION =
  'Falta actualizar la tabla de contratación para el estatus. Ejecuta supabase/fix_contratacion_estatus.sql en Supabase.';

const TZ = 'America/Hermosillo';

export const ETAPAS_PROCESO = [
  { id: 'postulacion', label: 'Postulación y evaluación' },
  { id: 'revision', label: 'Revisión' },
  { id: 'entrevista', label: 'Entrevista' },
  { id: 'contratacion', label: 'Contratación' },
  { id: 'inicio', label: 'Inicio de labores' },
];

const ESTADOS_RECHAZO = new Set(['rechazada', 'descartada', 'no_califica']);

export function etiquetaEtapa(id) {
  return ETAPAS_PROCESO.find((e) => e.id === id)?.label || id || '—';
}

export function hoyClaveContratacion(ahora = new Date()) {
  return ahora.toLocaleDateString('en-CA', { timeZone: TZ });
}

export function fmtFechaContratacion(valor) {
  if (!valor) return '';
  const s = String(valor);
  const soloFecha = /^\d{4}-\d{2}-\d{2}$/.test(s.slice(0, 10)) && s.length <= 10;
  try {
    const d = soloFecha ? new Date(`${s}T12:00:00`) : new Date(s);
    if (Number.isNaN(d.getTime())) return s;
    return d.toLocaleDateString('es-MX', {
      timeZone: soloFecha ? undefined : TZ,
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return s;
  }
}

export function fmtFechaHoraContratacion(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('es-MX', {
      timeZone: TZ,
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(iso);
  }
}

/** ISO → valor para `<input type="datetime-local">` en hora de Nogales. */
export function isoAInputDatetime(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('sv-SE', { timeZone: TZ }).slice(0, 16).replace(' ', 'T');
  } catch {
    return '';
  }
}

/** Valor de `<input type="datetime-local">` (hora de Nogales, UTC-7 sin DST) → ISO. */
export function inputDatetimeAIso(valor) {
  const v = String(valor || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return null;
  const d = new Date(`${v}:00-07:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function esSolicitudRechazada(row) {
  return ESTADOS_RECHAZO.has(row?.estado);
}

/** Etapa donde se cortó el proceso (la guardada, o una por defecto según el estado). */
export function etapaDeRechazo(row) {
  const guardada = row?.rechazo_etapa;
  if (ETAPAS_PROCESO.some((e) => e.id === guardada)) return guardada;
  return row?.estado === 'no_califica' ? 'postulacion' : 'revision';
}

function indiceEtapaActual(row, hoy) {
  switch (row?.estado) {
    case 'entrevista':
      return 2;
    case 'aceptada': {
      if (!row.inicio_labores) return 4;
      return String(row.inicio_labores).slice(0, 10) <= hoy ? 5 : 4;
    }
    default:
      return 1;
  }
}

function detallesDe(etapaId, row) {
  const out = [];
  if (etapaId === 'postulacion') {
    if (row.tipo) out.push(`Plaza: ${etiquetaTipoContratacion(row.tipo)}`);
    const suc = (Array.isArray(row.sucursales_interes) ? row.sucursales_interes : [])
      .map((s) => etiquetaTienda(normalizarCodigoTienda(s) || s))
      .filter(Boolean);
    if (suc.length) out.push(`Sucursal: ${suc.join(', ')}`);
  }
  if (etapaId === 'entrevista') {
    if (row.entrevista_lugar) out.push(`Lugar: ${row.entrevista_lugar}`);
    if (row.entrevista_mensaje) out.push(row.entrevista_mensaje);
  }
  if (etapaId === 'inicio') {
    if (row.inicio_sucursal) {
      out.push(`Sucursal: ${etiquetaTienda(normalizarCodigoTienda(row.inicio_sucursal) || row.inicio_sucursal)}`);
    }
    if (row.inicio_horario) out.push(`Horario: ${row.inicio_horario}`);
  }
  return out;
}

function fechaDe(etapaId, row) {
  if (etapaId === 'postulacion') return row.created_at ? fmtFechaContratacion(row.created_at) : '';
  if (etapaId === 'entrevista') return fmtFechaHoraContratacion(row.entrevista_fecha);
  if (etapaId === 'contratacion') return fmtFechaContratacion(row.contratacion_fecha);
  if (etapaId === 'inicio') return fmtFechaContratacion(row.inicio_labores);
  return '';
}

function resumenDe(row, { rechazado, idxActual, hoy }) {
  if (rechazado) {
    const etapa = etiquetaEtapa(etapaDeRechazo(row));
    return {
      tono: 'mal',
      titulo: 'Tu proceso no continuó',
      texto: `El proceso se detuvo en la etapa «${etapa}».`,
      detalle: row.rechazo_motivo || '',
    };
  }
  if (idxActual >= 5) {
    return { tono: 'ok', titulo: '¡Bienvenido(a) al equipo!', texto: 'Ya iniciaste labores. Gracias por ser parte de nosotros.', detalle: '' };
  }
  if (row.estado === 'aceptada') {
    return row.inicio_labores
      ? {
        tono: 'ok',
        titulo: '¡Fuiste contratado(a)!',
        texto: `Inicias labores el ${fmtFechaContratacion(row.inicio_labores)}.`,
        detalle: '',
      }
      : {
        tono: 'ok',
        titulo: '¡Fuiste contratado(a)!',
        texto: 'Pronto te confirmaremos tu fecha de inicio de labores.',
        detalle: '',
      };
  }
  if (row.estado === 'entrevista') {
    return row.entrevista_fecha
      ? {
        tono: 'info',
        titulo: 'Tienes una entrevista',
        texto: `${fmtFechaHoraContratacion(row.entrevista_fecha)}${row.entrevista_lugar ? ` · ${row.entrevista_lugar}` : ''}.`,
        detalle: '',
      }
      : {
        tono: 'info',
        titulo: 'Pasaste a entrevista',
        texto: 'Te contactaremos para confirmar fecha, hora y lugar.',
        detalle: '',
      };
  }
  if (row.estado === 'nueva') {
    return { tono: 'info', titulo: 'Recibimos tu postulación', texto: 'El equipo de contratación la revisará y te llamará al teléfono que registraste.', detalle: '' };
  }
  return { tono: 'info', titulo: 'Estamos revisando tu postulación', texto: 'Tu perfil está en revisión. Te avisaremos cuando haya novedades.', detalle: '' };
}

/**
 * Línea de tiempo que ven candidato y encargado (misma lógica para los dos).
 * Funciona con los candidatos actuales: se deriva de `estado` aunque no tengan datos de estatus.
 */
export function construirLineaTiempo(row, { hoy = hoyClaveContratacion() } = {}) {
  if (!row) return null;
  const rechazado = esSolicitudRechazada(row);
  const idxActual = rechazado ? -1 : indiceEtapaActual(row, hoy);
  const idxRechazo = rechazado ? ETAPAS_PROCESO.findIndex((e) => e.id === etapaDeRechazo(row)) : -1;

  const pasos = ETAPAS_PROCESO.map((e, i) => {
    let estado;
    if (rechazado) {
      estado = i < idxRechazo ? 'hecho' : i === idxRechazo ? 'rechazado' : 'omitido';
    } else {
      estado = i < idxActual ? 'hecho' : i === idxActual ? 'actual' : 'pendiente';
    }
    const mostrarDatos = estado === 'hecho' || estado === 'actual' || estado === 'rechazado';
    return {
      id: e.id,
      label: e.label,
      estado,
      fecha: mostrarDatos ? fechaDe(e.id, row) : '',
      detalles: mostrarDatos ? detallesDe(e.id, row) : [],
    };
  });

  const mensajes = (Array.isArray(row.estatus_mensajes) ? row.estatus_mensajes : [])
    .filter((m) => m && String(m.texto || '').trim())
    .sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));

  return {
    pasos,
    resumen: resumenDe(row, { rechazado, idxActual, hoy }),
    rechazado,
    rechazo: rechazado
      ? {
        etapa: etapaDeRechazo(row),
        etapaLabel: etiquetaEtapa(etapaDeRechazo(row)),
        motivo: row.rechazo_motivo || '',
        at: row.rechazo_at || null,
      }
      : null,
    mensajes,
  };
}

/** Texto corto para la lista del encargado. */
export function etiquetaEtapaActual(row) {
  const linea = construirLineaTiempo(row);
  if (!linea) return '';
  if (linea.rechazado) return `Rechazado · ${linea.rechazo.etapaLabel}`;
  const actual = linea.pasos.find((p) => p.estado === 'actual');
  if (!actual) return 'Proceso completo';
  return actual.label;
}

export function urlEstatusContratacion(
  codigo = '',
  origin = typeof window !== 'undefined' ? window.location.origin : '',
) {
  const base = String(origin || '').replace(/\/$/, '');
  const params = new URLSearchParams({ contratacion: '1', estatus: '1' });
  if (codigo) params.set('codigo', codigo);
  return `${base}/?${params.toString()}`;
}

export function esModoConsultaEstatus(location = typeof window !== 'undefined' ? window.location : null) {
  if (!location) return false;
  try {
    return new URLSearchParams(location.search || '').get('estatus') === '1';
  } catch {
    return false;
  }
}

export function leerCodigoEstatusDesdeUrl(location = typeof window !== 'undefined' ? window.location : null) {
  if (!location) return '';
  try {
    return String(new URLSearchParams(location.search || '').get('codigo') || '').trim().toUpperCase();
  } catch {
    return '';
  }
}

function faltaEstatus(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return (
    /column .* does not exist|could not find the .* column|schema cache/.test(msg)
    && /(entrevista|contratacion_fecha|inicio_|rechazo_|estatus_mensajes|codigo_seguimiento)/.test(msg)
  );
}

function faltaRpc(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return error?.code === 'PGRST202' || error?.code === '42883' || msg.includes('could not find the function');
}

const COLS_PUBLICAS =
  'codigo_seguimiento, nombre, telefono, tipo, estado, created_at, updated_at, sucursales_interes, entrevista_fecha, entrevista_lugar, entrevista_mensaje, contratacion_fecha, inicio_labores, inicio_sucursal, inicio_horario, rechazo_etapa, rechazo_motivo, rechazo_at, estatus_mensajes';

/** Consulta pública del candidato: código de seguimiento + teléfono. */
export async function consultarEstatusPostulacion(supabase, codigo, telefono) {
  if (!supabase) return { ok: false, error: 'Sin conexión. Intenta más tarde.' };
  const cod = String(codigo || '').trim().toUpperCase();
  const tel = String(telefono || '').replace(/\D/g, '').slice(-10);
  if (cod.length < 4) return { ok: false, error: 'Escribe tu código de seguimiento.' };
  if (tel.length < 10) return { ok: false, error: 'Escribe tu teléfono a 10 dígitos.' };

  const { data, error } = await supabase.rpc('pos_contratacion_consultar_estatus', {
    p_codigo: cod,
    p_telefono: tel,
  });
  if (!error) {
    if (!data) {
      return { ok: false, noEncontrado: true, error: 'No encontramos una postulación con ese código y teléfono. Revisa los datos.' };
    }
    return { ok: true, solicitud: data };
  }
  if (!faltaRpc(error)) return { ok: false, error: error.message };

  const { data: rows, error: e2 } = await supabase
    .from('pos_contratacion_solicitudes')
    .select(COLS_PUBLICAS)
    .eq('codigo_seguimiento', cod)
    .limit(1);
  if (e2) {
    return { ok: false, error: faltaEstatus(e2) ? AVISO_FALTA_ESTATUS_CONTRATACION : e2.message };
  }
  const fila = rows?.[0];
  const telFila = String(fila?.telefono || '').replace(/\D/g, '').slice(-10);
  if (!fila || telFila !== tel) {
    return { ok: false, noEncontrado: true, error: 'No encontramos una postulación con ese código y teléfono. Revisa los datos.' };
  }
  const { telefono: _omitido, ...publico } = fila;
  return { ok: true, solicitud: publico };
}

function nuevoId() {
  return `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

async function guardar(supabase, row, user, patch, textoSeguimiento, estadoSeg = null) {
  if (!puedeGestionarContratacion(user)) return { ok: false, error: 'Sin permiso.' };
  const prev = Array.isArray(row.seguimiento) ? row.seguimiento : [];
  const payload = { ...patch };
  if (textoSeguimiento) {
    payload.seguimiento = [...prev, entradaSeguimiento(user, textoSeguimiento, estadoSeg || patch.estado || row.estado)];
  }
  const res = await actualizarSolicitudContratacion(supabase, row.id, payload, user);
  if (!res.ok && faltaEstatus({ message: res.error })) {
    return { ok: false, error: AVISO_FALTA_ESTATUS_CONTRATACION };
  }
  return res;
}

/** Quita la marca de rechazo al avanzar de nuevo el proceso. */
const SIN_RECHAZO = { rechazo_etapa: null, rechazo_motivo: null, rechazo_at: null };

export function pasarARevision(supabase, row, user) {
  return guardar(supabase, row, user, { estado: 'en_seguimiento', ...SIN_RECHAZO }, 'Pasó a revisión', 'en_seguimiento');
}

export function programarEntrevista(supabase, row, user, { fechaHora, lugar = '', mensaje = '' } = {}) {
  const iso = inputDatetimeAIso(fechaHora);
  if (!iso) return Promise.resolve({ ok: false, error: 'Elige fecha y hora de la entrevista.' });
  return guardar(
    supabase,
    row,
    user,
    {
      estado: 'entrevista',
      entrevista_fecha: iso,
      entrevista_lugar: String(lugar || '').trim() || null,
      entrevista_mensaje: String(mensaje || '').trim() || null,
      ...SIN_RECHAZO,
    },
    `Entrevista: ${fmtFechaHoraContratacion(iso)}${lugar ? ` · ${lugar}` : ''}`,
    'entrevista',
  );
}

export function quitarEntrevista(supabase, row, user) {
  return guardar(
    supabase,
    row,
    user,
    {
      entrevista_fecha: null,
      entrevista_lugar: null,
      entrevista_mensaje: null,
      ...(row.estado === 'entrevista' ? { estado: 'en_seguimiento' } : {}),
    },
    'Se quitó la entrevista',
  );
}

export function marcarContratado(supabase, row, user, { fecha = '' } = {}) {
  const f = String(fecha || '').slice(0, 10) || hoyClaveContratacion();
  return guardar(
    supabase,
    row,
    user,
    { estado: 'aceptada', contratacion_fecha: f, ...SIN_RECHAZO },
    `Contratado (${f})`,
    'aceptada',
  );
}

export function quitarContratacion(supabase, row, user) {
  return guardar(
    supabase,
    row,
    user,
    {
      contratacion_fecha: null,
      inicio_labores: null,
      inicio_sucursal: null,
      inicio_horario: null,
      ...(row.estado === 'aceptada' ? { estado: row.entrevista_fecha ? 'entrevista' : 'en_seguimiento' } : {}),
    },
    'Se quitó la contratación',
  );
}

export function guardarInicioLabores(supabase, row, user, { fecha, sucursal = '', horario = '' } = {}) {
  const f = String(fecha || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return Promise.resolve({ ok: false, error: 'Elige el día de inicio de labores.' });
  const patch = {
    estado: 'aceptada',
    inicio_labores: f,
    inicio_sucursal: String(sucursal || '').trim() || null,
    inicio_horario: String(horario || '').trim() || null,
    ...SIN_RECHAZO,
  };
  if (!row.contratacion_fecha) patch.contratacion_fecha = hoyClaveContratacion();
  return guardar(supabase, row, user, patch, `Inicio de labores: ${f}`, 'aceptada');
}

export function quitarInicioLabores(supabase, row, user) {
  return guardar(
    supabase,
    row,
    user,
    { inicio_labores: null, inicio_sucursal: null, inicio_horario: null },
    'Se quitó el inicio de labores',
  );
}

export function rechazarCandidato(supabase, row, user, { etapa, motivo = '' } = {}) {
  if (!ETAPAS_PROCESO.some((e) => e.id === etapa)) {
    return Promise.resolve({ ok: false, error: 'Elige en qué etapa se rechaza.' });
  }
  return guardar(
    supabase,
    row,
    user,
    {
      estado: etapa === 'postulacion' && row.estado === 'no_califica' ? 'no_califica' : 'rechazada',
      rechazo_etapa: etapa,
      rechazo_motivo: String(motivo || '').trim() || null,
      rechazo_at: row.rechazo_at || new Date().toISOString(),
    },
    `Rechazado en ${etiquetaEtapa(etapa)}${motivo ? `: ${motivo}` : ''}`,
    'rechazada',
  );
}

export function editarRechazo(supabase, row, user, { etapa, motivo = '' } = {}) {
  if (!ETAPAS_PROCESO.some((e) => e.id === etapa)) {
    return Promise.resolve({ ok: false, error: 'Elige en qué etapa se rechaza.' });
  }
  return guardar(
    supabase,
    row,
    user,
    { rechazo_etapa: etapa, rechazo_motivo: String(motivo || '').trim() || null },
    `Rechazo actualizado: ${etiquetaEtapa(etapa)}${motivo ? ` · ${motivo}` : ''}`,
  );
}

export function reabrirProceso(supabase, row, user) {
  const estado = row.inicio_labores || row.contratacion_fecha
    ? 'aceptada'
    : row.entrevista_fecha
      ? 'entrevista'
      : 'en_seguimiento';
  return guardar(supabase, row, user, { estado, ...SIN_RECHAZO }, 'Proceso reabierto', estado);
}

function mensajesDe(row) {
  return Array.isArray(row?.estatus_mensajes) ? row.estatus_mensajes : [];
}

export function agregarMensajeEstatus(supabase, row, user, texto) {
  const t = String(texto || '').trim();
  if (!t) return Promise.resolve({ ok: false, error: 'Escribe el mensaje para el candidato.' });
  const msg = { id: nuevoId(), at: new Date().toISOString(), texto: t, por: user?.nombre || 'Contratación' };
  return guardar(supabase, row, user, { estatus_mensajes: [...mensajesDe(row), msg] }, `Mensaje al candidato: ${t}`);
}

export function editarMensajeEstatus(supabase, row, user, id, texto) {
  const t = String(texto || '').trim();
  if (!t) return Promise.resolve({ ok: false, error: 'El mensaje no puede quedar vacío.' });
  const next = mensajesDe(row).map((m) => (m.id === id ? { ...m, texto: t, editado_at: new Date().toISOString() } : m));
  return guardar(supabase, row, user, { estatus_mensajes: next }, 'Mensaje al candidato editado');
}

export function eliminarMensajeEstatus(supabase, row, user, id) {
  const next = mensajesDe(row).filter((m) => m.id !== id);
  return guardar(supabase, row, user, { estatus_mensajes: next }, 'Mensaje al candidato eliminado');
}

export async function eliminarSolicitudContratacion(supabase, row, user) {
  if (!supabase || !row?.id) return { ok: false, error: 'Solicitud inválida.' };
  if (!puedeGestionarContratacion(user)) return { ok: false, error: 'Sin permiso.' };
  const { error } = await supabase.from('pos_contratacion_solicitudes').delete().eq('id', row.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
