import { listarSucursalesOperativas, etiquetaTienda, normalizarCodigoTienda } from '../constants/sucursales.js';
import { esAdministradorPrincipal, nombreEsAdminPrincipal } from './adminPrincipal.js';
import { crearNotificacion, TIPOS_NOTIF, marcarNotificacionAtendida } from './contabilidadNotificaciones.js';
import { normalizarRol } from './roles.js';

export const AVISO_FALTA_CONTRATACION =
  'Falta la tabla de contratación. Ejecuta supabase/fix_contratacion.sql en Supabase.';

export const QUERY_CONTRATACION = 'contratacion';
export const EDAD_MAYORIA = 18;

export const TIPOS_CONTRATACION = [
  { id: 'planta', label: 'De planta', desc: 'Empleo fijo en tienda (mayoría de edad requerida).' },
  { id: 'cubre_turno', label: 'Cubre turno', desc: 'Coberturas temporales por día o turno.' },
];

export const ESTADOS_CONTRATACION = [
  { id: 'nueva', label: 'Nueva' },
  { id: 'en_seguimiento', label: 'En seguimiento' },
  { id: 'redirigida', label: 'Redirigida' },
  { id: 'entrevista', label: 'Entrevista' },
  { id: 'aceptada', label: 'Aceptada' },
  { id: 'rechazada', label: 'Rechazada' },
  { id: 'descartada', label: 'Descartada' },
];

export const GRADOS_ESTUDIOS = [
  'Sin estudios formales',
  'Primaria',
  'Secundaria',
  'Preparatoria / Bachillerato',
  'Carrera técnica',
  'Licenciatura (en curso)',
  'Licenciatura (concluida)',
  'Posgrado',
];

export const DISPONIBILIDAD_TURNO = [
  { id: 'diurno', label: 'Diurno' },
  { id: 'nocturno', label: 'Nocturno' },
  { id: 'ambos', label: 'Ambos turnos' },
];

export const FORM_CONTRATACION_VACIO = {
  tipo: '',
  nombre: '',
  apellidos: '',
  edad: '',
  fecha_nacimiento: '',
  telefono: '',
  telefono_alt: '',
  email: '',
  direccion: '',
  colonia: '',
  ciudad: '',
  estado_mx: '',
  cp: '',
  grado_estudios: '',
  carrera: '',
  anios_experiencia: '',
  experiencia: '',
  puestos_anteriores: '',
  disponibilidad_turno: 'ambos',
  sucursales_interes: [],
  tiene_transporte: false,
  licencia_conducir: false,
  disponibilidad_inmediata: true,
  expectativa_sueldo: '',
  curp: '',
  motivacion: '',
  referencias: '',
};

function faltaTabla(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return (
    error?.code === '42P01'
    || msg.includes('pos_contratacion_solicitudes')
    || (msg.includes('relation') && msg.includes('does not exist'))
    || (msg.includes('schema cache') && msg.includes('pos_contratacion'))
  );
}

export function etiquetaEstadoContratacion(estado) {
  return ESTADOS_CONTRATACION.find((e) => e.id === estado)?.label || estado || '—';
}

export function etiquetaTipoContratacion(tipo) {
  return TIPOS_CONTRATACION.find((t) => t.id === tipo)?.label || tipo || '—';
}

export function nombreCompletoAspirante(row) {
  return [row?.nombre, row?.apellidos].filter(Boolean).join(' ').trim() || 'Aspirante';
}

/** ¿La URL actual es el portal público de contratación? */
export function esModoContratacionPublica(location = typeof window !== 'undefined' ? window.location : null) {
  if (!location) return false;
  try {
    const q = new URLSearchParams(location.search || '');
    if (q.get(QUERY_CONTRATACION) === '1' || q.get('aplicar') === '1') return true;
    const hash = String(location.hash || '').toLowerCase();
    if (hash.includes('contratacion') || hash.includes('aplicar')) return true;
  } catch {
    /* ignore */
  }
  return false;
}

/** Enlace absoluto para aspirantes (QR / compartir). */
export function urlPortalContratacion(origin = typeof window !== 'undefined' ? window.location.origin : '') {
  const base = String(origin || '').replace(/\/$/, '') || '';
  return `${base}/?${QUERY_CONTRATACION}=1`;
}

/** Imagen QR (servicio público; si falla, el enlace sigue sirviendo). */
export function urlQrContratacion(enlace = urlPortalContratacion()) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=8&data=${encodeURIComponent(enlace)}`;
}

export function edadDesdeFechaNacimiento(fecha, hoy = new Date()) {
  if (!fecha) return null;
  const d = new Date(`${fecha}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  let edad = hoy.getFullYear() - d.getFullYear();
  const m = hoy.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < d.getDate())) edad -= 1;
  return edad;
}

export function edadEfectivaAspirante(form) {
  const porFecha = edadDesdeFechaNacimiento(form?.fecha_nacimiento);
  if (porFecha != null && porFecha >= 0) return porFecha;
  const n = Math.floor(Number(form?.edad));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Filtro inicial: planta exige mayoría de edad. */
export function validarFiltroTipoEdad({ tipo, edad, fecha_nacimiento }) {
  if (tipo !== 'planta' && tipo !== 'cubre_turno') {
    return { ok: false, error: 'Elige si buscas plaza de planta o cubre turno.' };
  }
  const edadN = edadEfectivaAspirante({ edad, fecha_nacimiento });
  if (tipo === 'planta') {
    if (edadN == null) {
      return { ok: false, error: 'Indica tu edad o fecha de nacimiento (de planta requiere mayoría de edad).' };
    }
    if (edadN < EDAD_MAYORIA) {
      return {
        ok: false,
        error: `Para plaza de planta debes tener al menos ${EDAD_MAYORIA} años. Puedes postularte como cubre turno si aplica.`,
      };
    }
  }
  if (edadN != null && (edadN < 15 || edadN > 80)) {
    return { ok: false, error: 'Revisa la edad indicada.' };
  }
  return { ok: true, edad: edadN };
}

export function validarFormularioContratacion(form) {
  const filtro = validarFiltroTipoEdad(form);
  if (!filtro.ok) return filtro;

  const nombre = String(form.nombre || '').trim();
  const apellidos = String(form.apellidos || '').trim();
  const telefono = String(form.telefono || '').replace(/\D/g, '');
  if (nombre.length < 2) return { ok: false, error: 'Escribe tu nombre.' };
  if (apellidos.length < 2) return { ok: false, error: 'Escribe tus apellidos.' };
  if (telefono.length < 10) return { ok: false, error: 'Teléfono a 10 dígitos mínimo.' };
  if (!String(form.direccion || '').trim()) return { ok: false, error: 'Indica tu dirección.' };
  if (!String(form.ciudad || '').trim()) return { ok: false, error: 'Indica tu ciudad.' };
  if (!String(form.grado_estudios || '').trim()) return { ok: false, error: 'Selecciona tu grado de estudios.' };
  if (!String(form.experiencia || '').trim() && !(Number(form.anios_experiencia) > 0)) {
    return { ok: false, error: 'Cuéntanos tu experiencia laboral (o indica años de experiencia).' };
  }
  if (!String(form.disponibilidad_turno || '').trim()) {
    return { ok: false, error: 'Indica tu disponibilidad de turno.' };
  }
  return { ok: true, edad: filtro.edad, nombre, apellidos, telefono };
}

function payloadDesdeForm(form, opts = {}) {
  const val = validarFormularioContratacion(form);
  if (!val.ok) return { ok: false, error: val.error };

  const sucursales = Array.isArray(form.sucursales_interes)
    ? form.sucursales_interes.map((s) => normalizarCodigoTienda(s)).filter(Boolean)
    : [];

  return {
    ok: true,
    payload: {
      tipo: form.tipo,
      estado: 'nueva',
      nombre: val.nombre,
      apellidos: val.apellidos,
      edad: val.edad,
      fecha_nacimiento: form.fecha_nacimiento || null,
      telefono: val.telefono,
      telefono_alt: String(form.telefono_alt || '').replace(/\D/g, '') || null,
      email: String(form.email || '').trim() || null,
      direccion: String(form.direccion || '').trim(),
      colonia: String(form.colonia || '').trim() || null,
      ciudad: String(form.ciudad || '').trim(),
      estado_mx: String(form.estado_mx || '').trim() || null,
      cp: String(form.cp || '').trim() || null,
      grado_estudios: String(form.grado_estudios || '').trim(),
      carrera: String(form.carrera || '').trim() || null,
      anios_experiencia: Math.max(0, Number(form.anios_experiencia) || 0),
      experiencia: String(form.experiencia || '').trim() || null,
      puestos_anteriores: String(form.puestos_anteriores || '').trim() || null,
      disponibilidad_turno: form.disponibilidad_turno || 'ambos',
      sucursales_interes: sucursales,
      tiene_transporte: Boolean(form.tiene_transporte),
      licencia_conducir: Boolean(form.licencia_conducir),
      disponibilidad_inmediata: form.disponibilidad_inmediata !== false,
      expectativa_sueldo: String(form.expectativa_sueldo || '').trim() || null,
      curp: String(form.curp || '').trim().toUpperCase() || null,
      motivacion: String(form.motivacion || '').trim() || null,
      referencias: String(form.referencias || '').trim() || null,
      notas_admin: null,
      asignado_a_id: null,
      asignado_a_nombre: 'Admin principal',
      seguimiento: [],
      origen: opts.origen || 'enlace',
      updated_at: new Date().toISOString(),
    },
  };
}

export async function enviarSolicitudContratacion(supabase, form, opts = {}) {
  const built = payloadDesdeForm(form, opts);
  if (!built.ok) return built;
  if (!supabase) return { ok: false, error: 'Sin conexión. Intenta más tarde.' };

  const { data, error } = await supabase
    .from('pos_contratacion_solicitudes')
    .insert([built.payload])
    .select('*')
    .single();

  if (error && faltaTabla(error)) return { ok: false, error: AVISO_FALTA_CONTRATACION };
  if (error) return { ok: false, error: error.message };

  const nombre = nombreCompletoAspirante(data);
  const tipoLabel = etiquetaTipoContratacion(data.tipo);
  await crearNotificacion(supabase, {
    sucursal_id: 'MAIN',
    tipo: TIPOS_NOTIF.CONTRATACION,
    ref_tabla: 'pos_contratacion_solicitudes',
    ref_id: data.id,
    titulo: `Nueva postulación (${tipoLabel})`,
    mensaje: `${nombre} · tel ${data.telefono} · Responsable: Andrés`,
  });

  return { ok: true, solicitud: data };
}

/**
 * Quién puede ver una solicitud:
 * - Admin principal: todas
 * - Otro admin: solo si está asignado a él
 */
export function puedeVerSolicitudContratacion(row, user) {
  if (!row || !user) return false;
  if (esAdministradorPrincipal(user)) return true;
  if (normalizarRol(user.rol) !== 'Administrador') return false;
  const idUser = String(user.id || '');
  const nom = String(user.nombre || '');
  if (row.asignado_a_id && String(row.asignado_a_id) === idUser) return true;
  if (row.asignado_a_nombre && nombreEsAdminPrincipal(row.asignado_a_nombre) === false) {
    // Comparación flexible por nombre
    const a = String(row.asignado_a_nombre || '').trim().toLowerCase();
    const b = nom.trim().toLowerCase();
    if (a && b && (a === b || a.includes(b) || b.includes(a))) return true;
  }
  return false;
}

export function puedeGestionarContratacion(user) {
  if (!user) return false;
  if (esAdministradorPrincipal(user)) return true;
  return normalizarRol(user.rol) === 'Administrador';
}

export async function listarSolicitudesContratacion(supabase, user, opts = {}) {
  if (!supabase) return { data: [], error: 'Sin conexión.' };
  if (!puedeGestionarContratacion(user)) return { data: [], error: 'Sin permiso.' };

  let q = supabase
    .from('pos_contratacion_solicitudes')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(opts.limit || 120);

  if (opts.estado && opts.estado !== 'todas') q = q.eq('estado', opts.estado);
  if (opts.tipo && opts.tipo !== 'todas') q = q.eq('tipo', opts.tipo);

  const { data, error } = await q;
  if (error && faltaTabla(error)) return { data: [], aviso: AVISO_FALTA_CONTRATACION };
  if (error) return { data: [], error: error.message };

  const lista = (data || []).filter((row) => puedeVerSolicitudContratacion(row, user));
  return { data: lista };
}

function entradaSeguimiento(user, texto, estado) {
  return {
    at: new Date().toISOString(),
    por_id: user?.id || null,
    por: user?.nombre || 'Admin',
    texto: String(texto || '').trim() || null,
    estado: estado || null,
  };
}

export async function actualizarSolicitudContratacion(supabase, id, patch, user) {
  if (!supabase || !id) return { ok: false, error: 'Datos incompletos.' };
  if (!puedeGestionarContratacion(user)) return { ok: false, error: 'Sin permiso.' };

  const payload = {
    ...patch,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from('pos_contratacion_solicitudes')
    .update(payload)
    .eq('id', id)
    .select('*')
    .single();

  if (error && faltaTabla(error)) return { ok: false, error: AVISO_FALTA_CONTRATACION };
  if (error) return { ok: false, error: error.message };

  if (['aceptada', 'rechazada', 'descartada', 'entrevista'].includes(payload.estado)) {
    await marcarNotificacionAtendida(supabase, 'pos_contratacion_solicitudes', id, user?.nombre);
  }
  return { ok: true, solicitud: data };
}

export async function agregarSeguimientoContratacion(supabase, row, user, texto, estado = null) {
  if (!row?.id) return { ok: false, error: 'Solicitud inválida.' };
  const prev = Array.isArray(row.seguimiento) ? row.seguimiento : [];
  const next = [...prev, entradaSeguimiento(user, texto, estado || row.estado)];
  const patch = {
    seguimiento: next,
    notas_admin: texto ? String(texto).trim() : row.notas_admin,
  };
  if (estado) patch.estado = estado;
  else if (row.estado === 'nueva') patch.estado = 'en_seguimiento';
  return actualizarSolicitudContratacion(supabase, row.id, patch, user);
}

/** Solo admin principal puede redirigir a otro administrador. */
export async function redirigirSolicitudContratacion(supabase, row, user, adminDestino, nota = '') {
  if (!esAdministradorPrincipal(user)) {
    return { ok: false, error: 'Solo el administrador principal puede redirigir postulaciones.' };
  }
  if (!adminDestino?.id) return { ok: false, error: 'Elige un administrador destino.' };

  const prev = Array.isArray(row.seguimiento) ? row.seguimiento : [];
  const texto = nota || `Redirigida a ${adminDestino.nombre}`;
  const next = [
    ...prev,
    entradaSeguimiento(user, texto, 'redirigida'),
  ];

  const res = await actualizarSolicitudContratacion(
    supabase,
    row.id,
    {
      estado: 'redirigida',
      asignado_a_id: String(adminDestino.id),
      asignado_a_nombre: String(adminDestino.nombre || 'Administrador'),
      redirigido_por_id: String(user.id || ''),
      redirigido_por_nombre: String(user.nombre || ''),
      redirigido_at: new Date().toISOString(),
      seguimiento: next,
      notas_admin: texto,
    },
    user,
  );
  if (!res.ok) return res;

  await crearNotificacion(supabase, {
    sucursal_id: 'MAIN',
    tipo: TIPOS_NOTIF.CONTRATACION,
    ref_tabla: 'pos_contratacion_solicitudes',
    ref_id: row.id,
    titulo: 'Postulación redirigida',
    mensaje: `${nombreCompletoAspirante(row)} · asignada a ${adminDestino.nombre} · Responsable: ${adminDestino.nombre}`,
  });

  return res;
}

export async function listarAdminsParaRedirigir(supabase, userActual) {
  if (!supabase) return { data: [] };
  const { data, error } = await supabase
    .from('usuarios')
    .select('id, nombre, rol, activo, sucursal_id')
    .order('nombre', { ascending: true })
    .limit(80);
  if (error) return { data: [], error: error.message };
  const yo = String(userActual?.id || '');
  const admins = (data || []).filter((u) => {
    if (u.activo === false) return false;
    if (normalizarRol(u.rol) !== 'Administrador') return false;
    if (String(u.id) === yo) return false;
    return true;
  });
  return { data: admins };
}

export function sucursalesInteresLabels(lista) {
  const ids = Array.isArray(lista) ? lista : [];
  if (!ids.length) return 'Sin preferencia';
  return ids.map((s) => etiquetaTienda(s)).join(', ');
}

export function opcionesSucursalesContratacion() {
  return listarSucursalesOperativas().map((id) => ({ id, label: etiquetaTienda(id) }));
}
