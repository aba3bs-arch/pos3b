import { listarSucursalesOperativas, etiquetaTienda, normalizarCodigoTienda } from '../constants/sucursales.js';
import { esAdministradorPrincipal, nombreEsAdminPrincipal } from './adminPrincipal.js';
import { crearNotificacion, TIPOS_NOTIF, marcarNotificacionAtendida } from './contabilidadNotificaciones.js';
import { normalizarRol } from './roles.js';

export const AVISO_FALTA_CONTRATACION =
  'Falta la tabla de contratación. Ejecuta supabase/fix_contratacion.sql en Supabase.';

export const QUERY_CONTRATACION = 'contratacion';
export const EDAD_MAYORIA = 18;
/** Edad mínima para cubre turno (16–17 requieren permiso de padres). */
export const EDAD_MIN_CUBRE = 16;
/** Calificación mínima FA3B-003 para bolsa / contratación. */
export const EVALUACION_MIN_PCT = 60;
export const DOC_EVALUACION_CONTRATACION = 'FA3B-003';

export const NOTA_HONESTIDAD_EVALUACION =
  'Contesta con honestidad y sin ayuda. Esta evaluación es para saber dónde deberemos apoyarte más. En la entrevista contestarás otra evaluación similar si el sistema detecta que recibiste ayuda.';

export const TIPOS_CONTRATACION = [
  { id: 'planta', label: 'De planta', desc: 'Empleo fijo en tienda (mayoría de edad requerida).' },
  { id: 'cubre_turno', label: 'Cubre turno', desc: 'Coberturas temporales por día o turno (desde 16 años).' },
];

export const ESTADOS_CONTRATACION = [
  { id: 'nueva', label: 'Nueva' },
  { id: 'en_seguimiento', label: 'En seguimiento' },
  { id: 'redirigida', label: 'Redirigida' },
  { id: 'entrevista', label: 'Entrevista' },
  { id: 'aceptada', label: 'Aceptada' },
  { id: 'rechazada', label: 'Rechazada' },
  { id: 'descartada', label: 'Descartada' },
  { id: 'bolsa_de_trabajo', label: 'Bolsa de trabajo' },
  { id: 'no_califica', label: 'No califica' },
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
  foto_url: '',
  perfil_laboral: {
    disponibilidad_horario: null,
    tiene_celular: null,
    casado: null,
    deberes_permiten_turno: null,
    sin_drogas: null,
    sin_vicio_juego: null,
    dispuesto_fin_semana: null,
    sabe_computadora: null,
    permiso_padres: null,
  },
  evaluacion_respuestas: {},
  acepta_privacidad: false,
};

/** Aviso de privacidad del portal de postulación (LFPDPPP — uso interno RH). */
export const AVISO_PRIVACIDAD_CONTRATACION = [
  'Los datos personales que proporciones (nombre, teléfono, dirección, foto, perfil laboral y evaluación) se usarán únicamente para evaluar tu postulación de empleo y, en su caso, contactarte.',
  'Tus datos no serán vendidos, rentados ni divulgados a terceros ajenos al proceso de contratación. Solo personal autorizado de la empresa podrá consultarlos.',
  'Conservaremos la información el tiempo necesario para el proceso de selección y requisitos laborales aplicables. Puedes solicitar acceso, corrección o cancelación de tus datos contactando a la empresa.',
  'Al marcar la casilla de aceptación, confirms que leíste este aviso y autorizas el tratamiento descrito.',
].join(' ');

export const TEXTO_CASILLA_PRIVACIDAD =
  'He leído el aviso de privacidad y acepto compartir mi información con la empresa para el proceso de contratación. Entiendo que mis datos no serán divulgados a terceros ajenos a ese proceso.';

export function validarAceptacionPrivacidad(form) {
  if (form?.acepta_privacidad !== true) {
    return {
      ok: false,
      error: 'Debes aceptar el aviso de privacidad para continuar con tu postulación.',
    };
  }
  return { ok: true };
}

/**
 * Perfil laboral del negocio — checklist que el aspirante debe cumplir.
 * Experiencia no es requisito.
 */
export const PERFIL_LABORAL_ITEMS = [
  {
    id: 'disponibilidad_horario',
    label: '¿Tienes disponibilidad de horario para el turno que te interesa?',
    requiere: true,
  },
  {
    id: 'tiene_celular',
    label: '¿Cuentas con teléfono celular propio para comunicación?',
    requiere: true,
  },
  {
    id: 'casado',
    label: '¿Estás casado(a) o en unión con responsabilidades de hogar?',
    requiere: null, // informativo; si sí, exige deberes_permiten_turno
  },
  {
    id: 'deberes_permiten_turno',
    label: 'Si estás casado(a): ¿tus deberes te permiten laborar el turno?',
    requiere: 'si_casado',
  },
  {
    id: 'sin_drogas',
    label: '¿Confirmas que no usas drogas?',
    requiere: true,
  },
  {
    id: 'sin_vicio_juego',
    label: '¿Confirmas que no tienes vicio del juego?',
    requiere: true,
  },
  {
    id: 'dispuesto_fin_semana',
    label: '¿Estás dispuesto(a) a trabajar en fin de semana?',
    requiere: true,
  },
  {
    id: 'sabe_computadora',
    label: '¿Sabes usar computadora (básico: teclado, mouse, programas simples)?',
    requiere: true,
  },
  {
    id: 'permiso_padres',
    label: 'Si tienes 16 o 17 años (cubre turno): ¿cuentas con permiso de tus padres para laborar?',
    requiere: 'menor_cubre',
  },
];

/**
 * Banco FA3B-003.
 * Sección 1 (inteligencia): respuestas objetivas — gate de las primeras 5.
 * Secciones 2–4: respuestas preferidas de perfil laboral / actitud.
 */
export const EVALUACION_FA3B003 = {
  codigo: DOC_EVALUACION_CONTRATACION,
  nota: NOTA_HONESTIDAD_EVALUACION,
  secciones: [
    {
      id: 's1',
      titulo: 'Sección 1: Inteligencia General',
      gate: true,
      preguntas: [
        {
          id: 's1q1',
          texto: '¿Cuál es el siguiente número en la secuencia: 1, 2, 4, 8, 16?',
          opciones: [
            { id: 'a', texto: '32' },
            { id: 'b', texto: '36' },
            { id: 'c', texto: '40' },
            { id: 'd', texto: '48' },
          ],
          correcta: 'a',
        },
        {
          id: 's1q2',
          texto: 'Un automóvil viaja de Ciudad A a Ciudad B a 80 km/h. ¿Cuántas horas tarda en recorrer 240 km?',
          opciones: [
            { id: 'a', texto: '2' },
            { id: 'b', texto: '3' },
            { id: 'c', texto: '4' },
            { id: 'd', texto: '5' },
          ],
          correcta: 'b',
        },
        {
          id: 's1q3',
          texto: '¿Cuál es el significado de la palabra "analizar"?',
          opciones: [
            { id: 'a', texto: 'Descomponer en partes' },
            { id: 'b', texto: 'Unir en un todo' },
            { id: 'c', texto: 'Evaluar críticamente' },
            { id: 'd', texto: 'Ignorar completamente' },
          ],
          correcta: 'a',
        },
        {
          id: 's1q4',
          texto: '¿Cuántos lados tiene un hexágono?',
          opciones: [
            { id: 'a', texto: '4' },
            { id: 'b', texto: '5' },
            { id: 'c', texto: '6' },
            { id: 'd', texto: '7' },
          ],
          correcta: 'c',
        },
        {
          id: 's1q5',
          texto: '¿Cuál es el resultado de 12 × 9?',
          opciones: [
            { id: 'a', texto: '100' },
            { id: 'b', texto: '108' },
            { id: 'c', texto: '116' },
            { id: 'd', texto: '124' },
          ],
          correcta: 'b',
        },
      ],
    },
    {
      id: 's2',
      titulo: 'Sección 2: Personalidad',
      gate: false,
      preguntas: [
        {
          id: 's2q1',
          texto: '¿Te sientes cómodo hablando en público?',
          opciones: [
            { id: 'a', texto: 'Sí' },
            { id: 'b', texto: 'No' },
            { id: 'c', texto: 'Dependiendo de la situación' },
            { id: 'd', texto: 'No estoy seguro' },
          ],
          correctas: ['a', 'c'],
        },
        {
          id: 's2q2',
          texto: '¿Cómo manejas el estrés en el trabajo?',
          opciones: [
            { id: 'a', texto: 'Me estreso mucho' },
            { id: 'b', texto: 'Me mantengo calmado' },
            { id: 'c', texto: 'Busco apoyo en otros' },
            { id: 'd', texto: 'Me tomo un descanso' },
          ],
          correctas: ['b', 'c', 'd'],
        },
        {
          id: 's2q3',
          texto: '¿Eres una persona organizada?',
          opciones: [
            { id: 'a', texto: 'Sí' },
            { id: 'b', texto: 'No' },
            { id: 'c', texto: 'Algunas veces' },
            { id: 'd', texto: 'No estoy seguro' },
          ],
          correctas: ['a', 'c'],
        },
        {
          id: 's2q4',
          texto: '¿Te gustan los cambios repentinos?',
          opciones: [
            { id: 'a', texto: 'Sí' },
            { id: 'b', texto: 'No' },
            { id: 'c', texto: 'Dependiendo de la situación' },
            { id: 'd', texto: 'No estoy seguro' },
          ],
          correctas: ['a', 'c'],
        },
        {
          id: 's2q5',
          texto: '¿Eres una persona perfeccionista?',
          opciones: [
            { id: 'a', texto: 'Sí' },
            { id: 'b', texto: 'No' },
            { id: 'c', texto: 'Algunas veces' },
            { id: 'd', texto: 'No estoy seguro' },
          ],
          correctas: ['a', 'c'],
        },
      ],
    },
    {
      id: 's3',
      titulo: 'Sección 3: Habilidades Sociales',
      gate: false,
      preguntas: [
        {
          id: 's3q1',
          texto: '¿Cómo manejarías una situación en la que un compañero de trabajo no está colaborando?',
          opciones: [
            { id: 'a', texto: 'Hablaría con él directamente' },
            { id: 'b', texto: 'Informaría a un superior' },
            { id: 'c', texto: 'Ignoraría la situación' },
            { id: 'd', texto: 'Buscaría ayuda de otros' },
          ],
          correctas: ['a', 'b', 'd'],
        },
        {
          id: 's3q2',
          texto: '¿Qué harías si un cliente se queja sobre un producto?',
          opciones: [
            { id: 'a', texto: 'Escucharía atentamente y ofrecería una solución' },
            { id: 'b', texto: 'Discutiría con el cliente' },
            { id: 'c', texto: 'Ignoraría la queja' },
            { id: 'd', texto: 'Transferiría la llamada a otro' },
          ],
          correcta: 'a',
        },
        {
          id: 's3q3',
          texto: '¿Eres bueno para trabajar en equipo?',
          opciones: [
            { id: 'a', texto: 'Sí' },
            { id: 'b', texto: 'No' },
            { id: 'c', texto: 'Algunas veces' },
            { id: 'd', texto: 'No estoy seguro' },
          ],
          correctas: ['a', 'c'],
        },
        {
          id: 's3q4',
          texto: '¿Cómo manejas conflictos en el trabajo?',
          opciones: [
            { id: 'a', texto: 'Los evito' },
            { id: 'b', texto: 'Los enfrento directamente' },
            { id: 'c', texto: 'Busco ayuda de otros' },
            { id: 'd', texto: 'Me tomo un descanso' },
          ],
          correctas: ['b', 'c'],
        },
        {
          id: 's3q5',
          texto: '¿Eres una persona comunicativa?',
          opciones: [
            { id: 'a', texto: 'Sí' },
            { id: 'b', texto: 'No' },
            { id: 'c', texto: 'Algunas veces' },
            { id: 'd', texto: 'No estoy seguro' },
          ],
          correctas: ['a', 'c'],
        },
      ],
    },
    {
      id: 's4',
      titulo: 'Sección 4: Motivación y Actitud Laboral',
      gate: false,
      preguntas: [
        {
          id: 's4q1',
          texto: '¿Qué te motiva a ir al trabajo cada día?',
          opciones: [
            { id: 'a', texto: 'El salario' },
            { id: 'b', texto: 'La satisfacción personal' },
            { id: 'c', texto: 'El reconocimiento' },
            { id: 'd', texto: 'La seguridad laboral' },
          ],
          correctas: ['b', 'c', 'd'],
        },
        {
          id: 's4q2',
          texto: '¿Estás dispuesto a aprender nuevas habilidades para mejorar tu desempeño laboral?',
          opciones: [
            { id: 'a', texto: 'Sí' },
            { id: 'b', texto: 'No' },
            { id: 'c', texto: 'Dependiendo de la situación' },
            { id: 'd', texto: 'No estoy seguro' },
          ],
          correcta: 'a',
        },
        {
          id: 's4q3',
          texto: '¿Te sientes comprometido con tu trabajo?',
          opciones: [
            { id: 'a', texto: 'Sí' },
            { id: 'b', texto: 'No' },
            { id: 'c', texto: 'Algunas veces' },
            { id: 'd', texto: 'No estoy seguro' },
          ],
          correctas: ['a', 'c'],
        },
        {
          id: 's4q4',
          texto: '¿Qué harías si no te gustara tu trabajo?',
          opciones: [
            { id: 'a', texto: 'Buscaría un nuevo empleo' },
            { id: 'b', texto: 'Me esforzaría por mejorar' },
            { id: 'c', texto: 'Me quejaría con otros' },
            { id: 'd', texto: 'Me rendiría' },
          ],
          correcta: 'b',
        },
        {
          id: 's4q5',
          texto: '¿Eres una persona proactiva en el trabajo?',
          opciones: [
            { id: 'a', texto: 'Sí' },
            { id: 'b', texto: 'No' },
            { id: 'c', texto: 'Algunas veces' },
            { id: 'd', texto: 'No estoy seguro' },
          ],
          correctas: ['a', 'c'],
        },
      ],
    },
  ],
};

export function listarPreguntasEvaluacionFa3b003() {
  return EVALUACION_FA3B003.secciones.flatMap((s) =>
    s.preguntas.map((p) => ({ ...p, seccionId: s.id, seccionTitulo: s.titulo, gate: Boolean(s.gate) })),
  );
}

function respuestaAceptada(pregunta, valor) {
  const v = String(valor || '').toLowerCase();
  if (!v) return false;
  if (pregunta.correcta) return v === String(pregunta.correcta).toLowerCase();
  const list = Array.isArray(pregunta.correctas) ? pregunta.correctas : [];
  return list.some((c) => String(c).toLowerCase() === v);
}

/**
 * Califica FA3B-003.
 * - Si las primeras 5 (Sec. 1) están TODAS mal → no califica (ni bolsa ni contratación).
 * - En caso contrario, requiere ≥ EVALUACION_MIN_PCT %.
 */
export function calificarEvaluacionFa3b003(respuestas = {}) {
  const preguntas = listarPreguntasEvaluacionFa3b003();
  const total = preguntas.length || 1;
  let correctas = 0;
  const detalle = [];
  const primeras5 = preguntas.filter((p) => p.gate).slice(0, 5);
  let primeras5Ok = 0;

  for (const p of preguntas) {
    const resp = respuestas[p.id];
    const ok = respuestaAceptada(p, resp);
    if (ok) correctas += 1;
    detalle.push({ id: p.id, respuesta: resp || null, ok });
  }
  for (const p of primeras5) {
    if (respuestaAceptada(p, respuestas[p.id])) primeras5Ok += 1;
  }

  const primeras5TodasMal = primeras5.length > 0 && primeras5Ok === 0;
  const scorePct = Math.round((correctas / total) * 1000) / 10;
  const calificaPorScore = scorePct >= EVALUACION_MIN_PCT;
  const califica = !primeras5TodasMal && calificaPorScore;

  let motivo = null;
  if (primeras5TodasMal) {
    motivo = 'Las primeras 5 preguntas (inteligencia general) se contestaron incorrectamente. No califica para contratación ni bolsa de trabajo.';
  } else if (!calificaPorScore) {
    motivo = `Calificación ${scorePct}% por debajo del mínimo (${EVALUACION_MIN_PCT}%).`;
  }

  return {
    codigo: DOC_EVALUACION_CONTRATACION,
    total,
    correctas,
    score_pct: scorePct,
    primeras5_correctas: primeras5Ok,
    primeras5_todas_mal: primeras5TodasMal,
    califica,
    motivo,
    respuestas: { ...respuestas },
    detalle,
    nota: NOTA_HONESTIDAD_EVALUACION,
  };
}

export function perfilLaboralVacio() {
  return { ...FORM_CONTRATACION_VACIO.perfil_laboral };
}

/**
 * Valida checklist de perfil laboral según tipo y edad.
 */
export function validarPerfilLaboral(perfil, { tipo, edad } = {}) {
  const p = perfil && typeof perfil === 'object' ? perfil : {};
  const edadN = edad != null ? Number(edad) : null;
  const esMenorCubre =
    tipo === 'cubre_turno' && edadN != null && edadN >= EDAD_MIN_CUBRE && edadN < EDAD_MAYORIA;

  // Campos obligatorios contestados (sí/no)
  const obligatorios = [
    'disponibilidad_horario',
    'tiene_celular',
    'casado',
    'sin_drogas',
    'sin_vicio_juego',
    'dispuesto_fin_semana',
    'sabe_computadora',
  ];
  for (const id of obligatorios) {
    if (p[id] !== true && p[id] !== false) {
      return { ok: false, incompleto: true, error: 'Completa todas las preguntas del perfil laboral.', fallos: [] };
    }
  }
  if (p.casado === true && p.deberes_permiten_turno !== true && p.deberes_permiten_turno !== false) {
    return { ok: false, incompleto: true, error: 'Indica si tus deberes te permiten laborar el turno.', fallos: [] };
  }
  if (esMenorCubre && p.permiso_padres !== true && p.permiso_padres !== false) {
    return { ok: false, incompleto: true, error: 'Indica si cuentas con permiso de tus padres.', fallos: [] };
  }

  const fallos = [];
  if (p.disponibilidad_horario !== true) {
    fallos.push('Se requiere disponibilidad de horario.');
  }
  if (p.tiene_celular !== true) {
    fallos.push('Se requiere teléfono celular propio.');
  }
  if (p.casado === true && p.deberes_permiten_turno !== true) {
    fallos.push('Si estás casado(a), tus deberes deben permitirte laborar el turno.');
  }
  if (p.sin_drogas !== true) {
    fallos.push('Debes confirmar que no usas drogas.');
  }
  if (p.sin_vicio_juego !== true) {
    fallos.push('Debes confirmar que no tienes vicio del juego.');
  }
  if (p.dispuesto_fin_semana !== true) {
    fallos.push('Se requiere disposición a trabajar en fin de semana.');
  }
  if (p.sabe_computadora !== true) {
    fallos.push('Se requiere saber usar computadora.');
  }
  if (esMenorCubre && p.permiso_padres !== true) {
    fallos.push('Menores de 18 (desde 16) en cubre turno necesitan permiso de padres.');
  }

  if (fallos.length) {
    return {
      ok: false,
      incompleto: false,
      cumple: false,
      error: fallos[0],
      fallos,
    };
  }
  return { ok: true, incompleto: false, cumple: true, fallos: [] };
}

/**
 * Decide estado inicial: bolsa_de_trabajo si eval + perfil OK; si no, no_califica.
 */
export function decidirEstadoPostulacion({ evaluacion, perfilOk }) {
  if (!evaluacion?.califica || !perfilOk) {
    return {
      estado: 'no_califica',
      motivo: !evaluacion?.califica
        ? (evaluacion?.motivo || 'No alcanzó la calificación mínima.')
        : 'No cumple el perfil laboral del negocio.',
    };
  }
  return {
    estado: 'bolsa_de_trabajo',
    motivo: `Califica (${evaluacion.score_pct}%) y cumple perfil laboral → bolsa de trabajo.`,
  };
}

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

/** Filtro inicial: planta exige mayoría de edad; cubre turno desde 16. */
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
  if (tipo === 'cubre_turno') {
    if (edadN == null) {
      return { ok: false, error: 'Indica tu edad (cubre turno desde 16 años).' };
    }
    if (edadN < EDAD_MIN_CUBRE) {
      return {
        ok: false,
        error: `Para cubre turno debes tener al menos ${EDAD_MIN_CUBRE} años.`,
      };
    }
  }
  if (edadN != null && (edadN < EDAD_MIN_CUBRE || edadN > 80)) {
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
  // Experiencia no es requisito del perfil laboral del negocio.
  if (!String(form.disponibilidad_turno || '').trim()) {
    return { ok: false, error: 'Indica tu disponibilidad de turno.' };
  }
  return { ok: true, edad: filtro.edad, nombre, apellidos, telefono };
}

export function validarFotoAspirante(fotoUrl) {
  const s = String(fotoUrl || '').trim();
  if (!s) return { ok: false, error: 'Tómate o sube una foto para tu solicitud.' };
  if (!s.startsWith('data:image/')) {
    return { ok: false, error: 'La foto no es válida. Vuelve a tomarla.' };
  }
  return { ok: true };
}

export function validarRespuestasEvaluacion(respuestas) {
  const preguntas = listarPreguntasEvaluacionFa3b003();
  for (const p of preguntas) {
    if (!String(respuestas?.[p.id] || '').trim()) {
      return { ok: false, error: 'Responde todas las preguntas de la evaluación.' };
    }
  }
  return { ok: true };
}

function payloadDesdeForm(form, opts = {}) {
  const priv = validarAceptacionPrivacidad(form);
  if (!priv.ok) return priv;

  const val = validarFormularioContratacion(form);
  if (!val.ok) return { ok: false, error: val.error };

  const foto = validarFotoAspirante(form.foto_url);
  if (!foto.ok) return foto;

  const perfilCheck = validarPerfilLaboral(form.perfil_laboral, {
    tipo: form.tipo,
    edad: val.edad,
  });
  if (perfilCheck.incompleto) {
    return { ok: false, error: perfilCheck.error };
  }

  const evalCheck = validarRespuestasEvaluacion(form.evaluacion_respuestas);
  if (!evalCheck.ok) return evalCheck;

  const evaluacion = calificarEvaluacionFa3b003(form.evaluacion_respuestas || {});
  const perfilOk = Boolean(perfilCheck.cumple);
  const decision = decidirEstadoPostulacion({ evaluacion, perfilOk });

  const sucursales = Array.isArray(form.sucursales_interes)
    ? form.sucursales_interes.map((s) => normalizarCodigoTienda(s)).filter(Boolean)
    : [];

  const perfilPayload = {
    ...(form.perfil_laboral || {}),
    cumple: perfilOk,
    fallos: perfilCheck.fallos || [],
  };

  const aceptadaAt = form.privacidad_aceptada_at || new Date().toISOString();

  return {
    ok: true,
    decision,
    payload: {
      tipo: form.tipo,
      estado: decision.estado,
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
      foto_url: String(form.foto_url || '').trim(),
      perfil_laboral: perfilPayload,
      evaluacion,
      evaluacion_pct: evaluacion.score_pct,
      evaluacion_califica: evaluacion.califica,
      acepta_privacidad: true,
      privacidad_aceptada_at: aceptadaAt,
      privacidad_version: 'contratacion-v1',
      notas_admin: decision.motivo || null,
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
  const estadoLabel = etiquetaEstadoContratacion(data.estado);
  const pct = data.evaluacion_pct != null ? ` · eval ${data.evaluacion_pct}%` : '';
  await crearNotificacion(supabase, {
    sucursal_id: 'MAIN',
    tipo: TIPOS_NOTIF.CONTRATACION,
    ref_tabla: 'pos_contratacion_solicitudes',
    ref_id: data.id,
    titulo: `Nueva postulación (${tipoLabel}) · ${estadoLabel}`,
    mensaje: `${nombre} · tel ${data.telefono}${pct} · Responsable: Andrés`,
  });

  return { ok: true, solicitud: data, decision: built.decision };
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

  if (['aceptada', 'rechazada', 'descartada', 'entrevista', 'bolsa_de_trabajo', 'no_califica'].includes(payload.estado)) {
    await marcarNotificacionAtendida(supabase, 'pos_contratacion_solicitudes', id, user?.nombre);
  }
  return { ok: true, solicitud: data };
}

export async function enviarABolsaDeTrabajo(supabase, row, user, nota = '') {
  if (!row?.id) return { ok: false, error: 'Solicitud inválida.' };
  if (row.evaluacion_califica === false || row.evaluacion?.primeras5_todas_mal) {
    return {
      ok: false,
      error: 'No se puede enviar a bolsa: la evaluación no califica (primeras 5 mal o score insuficiente).',
    };
  }
  const texto = nota || 'Enviado a bolsa de trabajo';
  return agregarSeguimientoContratacion(supabase, row, user, texto, 'bolsa_de_trabajo');
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

/**
 * Mapea una solicitud de contratación → campos del alta RH ABA3B.
 * PIN / RFC / NSS / banco quedan vacíos para completar en RH.
 */
export function formRhDesdeSolicitudContratacion(row) {
  if (!row) return null;
  const tipoRh = String(row.tipo || '').toLowerCase() === 'cubre_turno' ? 'cubre_turno' : 'tienda';
  const sucursales = (Array.isArray(row.sucursales_interes) ? row.sucursales_interes : [])
    .map((s) => normalizarCodigoTienda(s))
    .filter(Boolean);
  const notas = [
    row.experiencia && `Experiencia: ${row.experiencia}`,
    row.puestos_anteriores && `Puestos anteriores: ${row.puestos_anteriores}`,
    row.grado_estudios && `Estudios: ${row.grado_estudios}${row.carrera ? ` · ${row.carrera}` : ''}`,
    row.anios_experiencia != null && row.anios_experiencia !== ''
      ? `Años experiencia: ${row.anios_experiencia}`
      : null,
    row.disponibilidad_turno && `Disponibilidad turno: ${row.disponibilidad_turno}`,
    row.expectativa_sueldo && `Sueldo esperado: ${row.expectativa_sueldo}`,
    row.motivacion && `Motivación: ${row.motivacion}`,
    row.referencias && `Referencias: ${row.referencias}`,
    row.telefono_alt && `Tel. alterno: ${row.telefono_alt}`,
    row.tiene_transporte != null ? `Transporte: ${row.tiene_transporte ? 'sí' : 'no'}` : null,
    row.licencia_conducir != null ? `Licencia: ${row.licencia_conducir ? 'sí' : 'no'}` : null,
    row.disponibilidad_inmediata != null
      ? `Disponibilidad inmediata: ${row.disponibilidad_inmediata ? 'sí' : 'no'}`
      : null,
    row.evaluacion_pct != null ? `Evaluación FA3B-003: ${row.evaluacion_pct}%` : null,
    row.evaluacion_califica != null ? `Califica evaluación: ${row.evaluacion_califica ? 'sí' : 'no'}` : null,
    row.perfil_laboral?.cumple != null ? `Perfil laboral: ${row.perfil_laboral.cumple ? 'cumple' : 'no cumple'}` : null,
    row.id && `Origen contratación: ${row.id}`,
  ]
    .filter(Boolean)
    .join('\n');

  const patch = {
    nombre: String(row.nombre || '').trim(),
    apellidos: String(row.apellidos || '').trim(),
    tipo_empleado: tipoRh,
    fecha_nacimiento: row.fecha_nacimiento ? String(row.fecha_nacimiento).slice(0, 10) : '',
    telefono: String(row.telefono || '').trim(),
    telefono_emergencia: String(row.telefono_alt || '').trim(),
    email: String(row.email || '').trim(),
    direccion: String(row.direccion || '').trim(),
    colonia: String(row.colonia || '').trim(),
    ciudad: String(row.ciudad || '').trim(),
    estado_mx: String(row.estado_mx || '').trim(),
    cp: String(row.cp || '').trim(),
    curp: String(row.curp || '').trim().toUpperCase(),
    notas,
    puesto: tipoRh === 'cubre_turno' ? 'Cubre turnos' : 'Cajero',
    rol_sistema: tipoRh === 'cubre_turno' ? '' : 'Cajero',
  };

  if (tipoRh === 'cubre_turno') {
    patch.sucursal_id = '';
    patch.ct_sucursales = sucursales.length ? sucursales : listarSucursalesOperativas();
    patch.ct_solo_dia = String(row.disponibilidad_turno || '').toLowerCase() === 'diurno';
  } else {
    patch.sucursal_id = sucursales[0] || '';
  }

  return patch;
}
