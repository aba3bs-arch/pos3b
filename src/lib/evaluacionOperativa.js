/**
 * Evaluación Operativa FA3B-014 — auditor evalúa personal de tienda.
 * Preguntas al empleado: banco basado en normas FA3B-017 (Check List), selección aleatoria.
 */

import { PLANTILLA_CHECKLIST_FA3B017 } from './checklistOperativo.js';
import { normalizarCodigoTienda } from '../constants/sucursales.js';

export const AVISO_FALTA_EVALUACION =
  'Ejecuta supabase/fix_evaluacion_operativa.sql en Supabase (tabla evaluacion_operativa).';

export const DOC_EVALUACION = 'FA3B-014 Rev A';

/** Bloques de piso de venta alineados al formulario (pts del PDF). */
export const BLOQUES_PISO_EVALUACION = [
  {
    id: 'procesos',
    titulo: 'Abarrotes y procesos',
    ptsMax: 25,
    seccionIds: ['2'],
  },
  {
    id: 'limpieza',
    titulo: 'Limpieza',
    ptsMax: 25,
    seccionIds: ['3'],
  },
  {
    id: 'orden',
    titulo: 'Orden y mercancía',
    ptsMax: 10,
    seccionIds: ['4'],
  },
  {
    id: 'mantenimiento',
    titulo: 'Mantenimiento',
    ptsMax: 15,
    seccionIds: ['7'],
  },
];

/** Ítems extras de abasto/comunicación (observación, sin pts propios; van en comentarios). */
export const BLOQUE_EXTRA_OBSERVACION = {
  id: 'extra',
  titulo: 'Abasto y comunicación (observación)',
  ptsMax: 0,
  seccionIds: ['6', '8'],
};

export const PTS_TICKETS = 5;
export const PTS_PREGUNTAS = 20;
export const PTS_TOTAL = 100;
export const NUM_PREGUNTAS_ALEATORIAS = 5;
export const PTS_POR_PREGUNTA = PTS_PREGUNTAS / NUM_PREGUNTAS_ALEATORIAS;

/** Ítems de piso por bloque (desde plantilla FA3B-017). */
export function itemsPisoPorBloque() {
  const bySec = Object.fromEntries(PLANTILLA_CHECKLIST_FA3B017.map((s) => [s.id, s]));
  const mapBloque = (b) => {
    const items = [];
    for (const sid of b.seccionIds) {
      const sec = bySec[sid];
      if (!sec) continue;
      for (const it of sec.items) {
        items.push({
          codigo: it.codigo,
          texto: it.texto,
          seccion: sec.nombre,
          seccionId: sec.id,
        });
      }
    }
    return { ...b, items };
  };
  return [...BLOQUES_PISO_EVALUACION.map(mapBloque), mapBloque(BLOQUE_EXTRA_OBSERVACION)];
}

/**
 * Banco de preguntas orales / de conocimiento (FA3B-014).
 * Cubren las 8 secciones del Check List FA3B-017 + servicio.
 * Campos: id, seccion, codigo (norma), texto, guia, tipo (conocimiento|situacion|observacion)
 */
export const BANCO_PREGUNTAS_EVALUACION = [
  // ——— 1 DISCIPLINA ———
  { id: 'g1', seccion: '1', codigo: '1', texto: 'Menciona las secciones principales del check list / normas operativas.', guia: 'Disciplina, Estandarización de procesos, Limpieza, Orden, Clasificación, Abasto, Mantenimiento, Comunicación.', tipo: 'conocimiento' },
  { id: 'g2', seccion: '1', codigo: '1', texto: '¿En qué se basa el check list operativo?', guia: 'En las normas operativas FA3B-017 (disciplina, procesos, limpieza, orden…).', tipo: 'conocimiento' },
  { id: 'g3', seccion: '1', codigo: '1.1', texto: '¿Para qué sirve el registro de asistencia / visitas a tienda?', guia: '1.1: control de quién está en turno y evidencia de disciplina.', tipo: 'conocimiento' },
  { id: 'g4', seccion: '1', codigo: '1.2', texto: '¿Qué debes hacer si llegas tarde al turno?', guia: 'Avisar y registrar asistencia real; no omitir el checador (1.2).', tipo: 'situacion' },
  { id: 'g5', seccion: '1', codigo: '1.3', texto: '¿Puedes tomar descansos fuera del horario asignado? ¿Por qué?', guia: 'No: cumplir descansos asignados (1.3) para no dejar la tienda sola.', tipo: 'situacion' },
  { id: 'g6', seccion: '1', codigo: '1.1', texto: '¿Quién debe checar entrada y salida en el sistema?', guia: 'El mismo empleado del turno; no checar por otra persona (1.1–1.2).', tipo: 'conocimiento' },

  // ——— 2 PROCESOS ———
  { id: 'p1', seccion: '2', codigo: '2.1', texto: '¿Qué es un preinventario y para qué sirve?', guia: 'Conteo previo para detectar faltantes/sobrantes antes de abasto o cierre (2.1).', tipo: 'conocimiento' },
  { id: 'p2', seccion: '2', codigo: '2.1', texto: '¿En qué momento del turno conviene hacer o revisar el preinventario?', guia: 'Al inicio o al preparar abasto; no dejarlo sin tiempo al cierre (2.1).', tipo: 'situacion' },
  { id: 'p3', seccion: '2', codigo: '2.2', texto: 'Describe el proceso de venta en mostrador (pasos básicos).', guia: 'Atender → escanear/registrar → cobrar → ticket → descontar inventario (2.2).', tipo: 'conocimiento' },
  { id: 'p4', seccion: '2', codigo: '2.2', texto: 'Si el escáner no lee un código, ¿qué haces para no detener la venta?', guia: 'Captura manual, verificar precio; reportar falla POS si persiste (2.2 / 8.5).', tipo: 'situacion' },
  { id: 'p5', seccion: '2', codigo: '2.3', texto: '¿Cómo se registra una compra de proveedor en el sistema?', guia: 'Recibir → confrontar ticket → ingresar cantidades correctas (2.3 / 6.3).', tipo: 'conocimiento' },
  { id: 'p6', seccion: '2', codigo: '2.3', texto: 'Si el ticket de compra no coincide con lo recibido, ¿qué haces?', guia: 'Anotar dif. neg./pos. y reportar; no ingresar a ciegas (FA3B-014 tickets).', tipo: 'situacion' },
  { id: 'p7', seccion: '2', codigo: '2.4', texto: '¿Cuándo y cómo se solicita abasto a la central / MAIN?', guia: 'Con lista de faltantes y solicitud formal de abarrotes (2.4 / 6.2 / 6.5).', tipo: 'conocimiento' },
  { id: 'p8', seccion: '2', codigo: '2', texto: 'Menciona al menos 3 procesos estandarizados que debes dominar en tienda.', guia: 'Preinventario, venta, compras, solicitud de abasto (sección 2).', tipo: 'conocimiento' },
  { id: 'p9', seccion: '2', codigo: '2.3', texto: '¿Por qué no debes aceptar un ticket sin contar la mercancía?', guia: 'Puede haber faltantes; hay que confrontar ticket vs físico (2.3).', tipo: 'situacion' },

  // ——— 3 LIMPIEZA ———
  { id: 'l1', seccion: '3', codigo: '3', texto: '¿Qué áreas de limpieza revisa el check list? Menciona al menos 4.', guia: 'Piso de venta, máquinas, estantes/vitrinas, caja, banqueta/patio/baño (3.1–3.6).', tipo: 'conocimiento' },
  { id: 'l2', seccion: '3', codigo: '3.4', texto: '¿Qué significa “desempolvar mercancía” y por qué importa?', guia: 'Quitar polvo del producto exhibido; imagen y rotación (3.4).', tipo: 'conocimiento' },
  { id: 'l3', seccion: '3', codigo: '3.2', texto: '¿Por qué es importante la limpieza del área de máquinas?', guia: 'Imagen, seguridad y que las máquinas funcionen (3.2).', tipo: 'conocimiento' },
  { id: 'l4', seccion: '3', codigo: '3.6', texto: '¿Qué incluye la limpieza de banqueta, patio y baño?', guia: 'Exterior limpio y baño usable/presentable (3.6).', tipo: 'conocimiento' },
  { id: 'l5', seccion: '3', codigo: '3.5', texto: 'Al abrir el turno, ¿qué puntos de limpieza verificas primero?', guia: 'Caja, piso de venta y zona visible al cliente (3.1 / 3.5).', tipo: 'situacion' },
  { id: 'l6', seccion: '3', codigo: '3.3', texto: '¿Cómo dejas los estantes y vitrinas al terminar el acomodo?', guia: 'Limpios, sin polvo ni empaques vacíos (3.3).', tipo: 'conocimiento' },
  { id: 'l7', seccion: '3', codigo: '3.1', texto: 'Hay un derrame en el piso de venta: ¿qué haces de inmediato?', guia: 'Señalizar/limpiar ya; no dejar riesgo para el cliente (3.1).', tipo: 'situacion' },

  // ——— 4 ORDEN ———
  { id: 'o1', seccion: '4', codigo: '4', texto: 'Menciona algunos de los puntos de la norma 4 (Orden).', guia: 'Exhibición, mermas, acomodo según planos, caja, anuncios (4.1–4.5).', tipo: 'conocimiento' },
  { id: 'o2', seccion: '4', codigo: '4.3', texto: '¿Cómo se acomoda la mercancía según fecha de caducidad / planos?', guia: 'FIFO: lo que caduca primero al frente; respetar planos (4.3).', tipo: 'conocimiento' },
  { id: 'o3', seccion: '4', codigo: '4.2', texto: '¿Qué revisas al “checar mermas”?', guia: 'Producto dañado/caduco; separarlo y no dejarlo en exhibición (4.2).', tipo: 'conocimiento' },
  { id: 'o4', seccion: '4', codigo: '4.4', texto: '¿Por qué debe estar ordenada el área de caja?', guia: 'Cobro ágil, control de efectivo e imagen (4.4).', tipo: 'conocimiento' },
  { id: 'o5', seccion: '4', codigo: '4.5', texto: '¿Qué haces con anuncios o publicidad dañados o vencidos?', guia: 'Acomodar o retirar (4.5).', tipo: 'situacion' },
  { id: 'o6', seccion: '4', codigo: '4.1', texto: '¿Qué es una buena exhibición de mercancías?', guia: 'Frente lleno, limpio, precio visible, sin huecos (4.1 / 6.1).', tipo: 'conocimiento' },
  { id: 'o7', seccion: '4', codigo: '4.3', texto: 'Encuentras producto nuevo detrás y caduco al frente: ¿qué corriges?', guia: 'Rotar FIFO o retirar si ya venció (4.3 / 5.1).', tipo: 'situacion' },

  // ——— 5 CLASIFICACIÓN ———
  { id: 'c1', seccion: '5', codigo: '5.1', texto: '¿Cómo se clasifica la mercancía caducada?', guia: 'Por proveedor (5.1); no mezclar con venta.', tipo: 'conocimiento' },
  { id: 'c2', seccion: '5', codigo: '5.2', texto: '¿Cómo se clasifica la mercancía dañada?', guia: 'Por proveedor (5.2); reportar merma.', tipo: 'conocimiento' },
  { id: 'c3', seccion: '5', codigo: '5.3', texto: '¿Cómo se acomoda la mercancía almacenada?', guia: 'Por proveedor, ordenada y accesible (5.3).', tipo: 'conocimiento' },
  { id: 'c4', seccion: '5', codigo: '5.4', texto: '¿Qué significa “separar lo que no se usa en tienda”?', guia: 'Sacar objetos ajenos/obsoletos del piso o almacén (5.4).', tipo: 'conocimiento' },
  { id: 'c5', seccion: '5', codigo: '5.6', texto: '¿Cómo se clasifican los tickets de compra?', guia: 'Por proveedor y fecha (5.6).', tipo: 'conocimiento' },
  { id: 'c6', seccion: '5', codigo: '5.1', texto: 'Encuentras un producto caducado en anaquel: ¿pasos exactos?', guia: 'Retirar → clasificar por proveedor → no vender → reportar (5.1 / 4.2).', tipo: 'situacion' },
  { id: 'c7', seccion: '5', codigo: '5.6', texto: '¿Dónde y cómo guardas los tickets de compra del día?', guia: 'Ordenados por proveedor y fecha para auditoría (5.6).', tipo: 'situacion' },

  // ——— 6 ABASTO ———
  { id: 'a1', seccion: '6', codigo: '6.1', texto: '¿Qué es “rellenar huecos” en estantes y refrigeradores?', guia: 'Completar faltantes visibles para no perder venta (6.1).', tipo: 'conocimiento' },
  { id: 'a2', seccion: '6', codigo: '6.2', texto: '¿Para qué sirve la lista de mercancía faltante?', guia: 'Base de la solicitud de abasto / abarrotes (6.2 / 6.5).', tipo: 'conocimiento' },
  { id: 'a3', seccion: '6', codigo: '6.3', texto: 'Después de recibir mercancía, ¿qué debes hacer en el sistema?', guia: 'Ingresar la compra con cantidades correctas (6.3).', tipo: 'conocimiento' },
  { id: 'a4', seccion: '6', codigo: '6.4', texto: '¿La tienda debe contar con utensilios de limpieza? Da 3 ejemplos.', guia: 'Sí (6.4): trapeador, jalador, recogedor, trapos, etc.', tipo: 'conocimiento' },
  { id: 'a5', seccion: '6', codigo: '6.5', texto: '¿Qué información lleva una buena solicitud de abarrotes?', guia: 'Productos faltantes, cantidades, tienda y urgencia (6.5).', tipo: 'conocimiento' },
  { id: 'a6', seccion: '6', codigo: '6.1', texto: 'El refrigerador tiene huecos visibles: ¿qué haces durante el turno?', guia: 'Rellenar desde almacén; si no hay stock, anotar en faltantes (6.1 / 6.2).', tipo: 'situacion' },
  { id: 'a7', seccion: '6', codigo: '6.3', texto: 'Llegó mercancía pero no hay tiempo de ingresarla: ¿qué riesgo hay?', guia: 'Inventario incorrecto y diferencias en tickets; priorizar ingreso (6.3).', tipo: 'situacion' },

  // ——— 7 MANTENIMIENTO ———
  { id: 'm1', seccion: '7', codigo: '7.1', texto: '¿Qué revisas en máquinas (estado y funcionamiento)?', guia: 'Que enciendan/operen sin fallas evidentes (7.1).', tipo: 'conocimiento' },
  { id: 'm2', seccion: '7', codigo: '7.2', texto: 'Si hay luces fundidas o quebradas, ¿qué haces?', guia: 'Reportar falla de mantenimiento (7.2 / 8.3).', tipo: 'situacion' },
  { id: 'm3', seccion: '7', codigo: '7.3', texto: '¿Qué incluye la revisión de ventanas, puertas y candados?', guia: 'Que cierren, sin daños; candados útiles (7.3).', tipo: 'conocimiento' },
  { id: 'm4', seccion: '7', codigo: '7.4', texto: 'Menciona fallas de infraestructura que debes reportar.', guia: 'Pisos, techos, goteras, fugas de agua, baños (7.4).', tipo: 'conocimiento' },
  { id: 'm5', seccion: '7', codigo: '7.5', texto: 'Antes de vender, ¿qué verificas del punto de venta?', guia: 'Equipo ok y rollos/tickets disponibles (7.5).', tipo: 'conocimiento' },
  { id: 'm6', seccion: '7', codigo: '7.5', texto: 'Se acaba el rollo de ticket a media venta: ¿qué debiste preparar?', guia: 'Revisar stock de rollos al abrir (7.5); tener repuesto a la mano.', tipo: 'situacion' },
  { id: 'm7', seccion: '7', codigo: '7.4', texto: 'Detectas una gotera cerca de mercancía: ¿qué haces?', guia: 'Proteger producto, reportar mantenimiento, no dejar riesgo (7.4 / 8.3).', tipo: 'situacion' },

  // ——— 8 COMUNICACIÓN ———
  { id: 'k1', seccion: '8', codigo: '8', texto: '¿Qué tipos de incidencias debes reportar (buzón / supervisor)?', guia: 'Personal, abasto, mantenimiento, moneda virtual, POS (8.1–8.5).', tipo: 'conocimiento' },
  { id: 'k2', seccion: '8', codigo: '8.4', texto: 'Si falla el sistema de moneda virtual, ¿qué haces?', guia: 'Reportar de inmediato (8.4); no improvisar sin aviso.', tipo: 'situacion' },
  { id: 'k3', seccion: '8', codigo: '8.1', texto: '¿Por qué es importante reportar incidencias de personal?', guia: 'Continuidad del turno y disciplina (8.1).', tipo: 'conocimiento' },
  { id: 'k4', seccion: '8', codigo: '8.2', texto: 'Se agotó un producto de alta rotación y no hay en almacén: ¿qué reportas?', guia: 'Incidencia de abasto + lista de faltantes (8.2 / 6.2).', tipo: 'situacion' },
  { id: 'k5', seccion: '8', codigo: '8.5', texto: 'El punto de venta se congela o no imprime: ¿qué canal usas?', guia: 'Reportar falla POS (8.5); no dejar ventas sin registro.', tipo: 'situacion' },
  { id: 'k6', seccion: '8', codigo: '8.3', texto: 'Una máquina deja de funcionar a mitad del turno: ¿qué reportas?', guia: 'Falla de mantenimiento / máquina (8.3 / 7.1) por buzón o supervisor.', tipo: 'situacion' },

  // ——— SERVICIO ———
  { id: 's1', seccion: 'svc', codigo: 'svc', texto: 'Observa y califica el servicio al cliente que brinda el encargado / empleado.', guia: 'Saludo, rapidez, amabilidad, manejo de fila y quejas.', tipo: 'observacion' },
  { id: 's2', seccion: 'svc', codigo: 'svc', texto: '¿Cómo atenderías a un cliente molesto por un producto caduco o mal cobrado?', guia: 'Escuchar, corregir según política, reportar si aplica.', tipo: 'situacion' },
  { id: 's3', seccion: 'svc', codigo: 'svc', texto: '¿Qué actitud debes mantener en el piso de venta frente al cliente?', guia: 'Presentación, atención y orden del área visible.', tipo: 'conocimiento' },
  { id: 's4', seccion: 'svc', codigo: 'svc', texto: 'Hay fila en caja y un proveedor entregando a la vez: ¿cómo priorizas?', guia: 'Atender al cliente primero; coordinar recepción sin abandonar la caja.', tipo: 'situacion' },
  { id: 's5', seccion: 'svc', codigo: 'svc', texto: 'Un cliente pide un producto que no está en anaquel pero sí en almacén: ¿qué haces?', guia: 'Buscarlo, ofrecerlo y rellenar hueco después (servicio + 6.1).', tipo: 'situacion' },
];

function faltaTabla(error) {
  const msg = String(error?.message || '').toLowerCase();
  return (
    error?.code === '42P01'
    || msg.includes('evaluacion_operativa')
    || (msg.includes('schema cache') && msg.includes('evaluacion'))
  );
}

export function hoyYmdLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Fisher–Yates shuffle (copia). */
export function barajar(lista) {
  const a = [...(lista || [])];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Selecciona N preguntas aleatorias del banco.
 * - Cubre secciones distintas
 * - Incluye al menos 1 situacional (si hay)
 * - Máximo 1 de observación
 */
export function seleccionarPreguntasAleatorias(n = NUM_PREGUNTAS_ALEATORIAS, opts = {}) {
  const banco = BANCO_PREGUNTAS_EVALUACION.filter((p) => {
    if (opts.incluirObservacion === false && p.tipo === 'observacion') return false;
    return true;
  });
  const porSec = {};
  for (const p of banco) {
    const k = p.seccion || 'x';
    if (!porSec[k]) porSec[k] = [];
    porSec[k].push(p);
  }
  const elegidas = [];
  const usados = new Set();

  const tomar = (p) => {
    if (!p || usados.has(p.id) || elegidas.length >= n) return false;
    elegidas.push(p);
    usados.add(p.id);
    return true;
  };

  // 1) Preferir una situacional
  const situacionales = barajar(banco.filter((p) => p.tipo === 'situacion'));
  if (situacionales.length) tomar(situacionales[0]);

  // 2) Una por sección distinta
  for (const sec of barajar(Object.keys(porSec))) {
    if (elegidas.length >= n) break;
    const cand = barajar(porSec[sec]).find((p) => !usados.has(p.id) && p.tipo !== 'observacion');
    tomar(cand);
  }

  // 3) Completar (evitar más de una observación)
  const yaObs = elegidas.some((p) => p.tipo === 'observacion');
  const resto = barajar(banco.filter((p) => {
    if (usados.has(p.id)) return false;
    if (yaObs && p.tipo === 'observacion') return false;
    return true;
  }));
  for (const p of resto) {
    if (elegidas.length >= n) break;
    if (p.tipo === 'observacion' && elegidas.some((x) => x.tipo === 'observacion')) continue;
    tomar(p);
  }

  return elegidas.slice(0, n).map((p, i) => ({
    ...p,
    orden: i + 1,
    ptsMax: PTS_POR_PREGUNTA,
    pts: null,
    respuesta_oral: '',
    notas_auditor: '',
  }));
}

export function puntajeBloquePiso(bloque, respuestasPiso = {}) {
  const items = bloque.items || [];
  const max = Number(bloque.ptsMax) || 0;
  if (!items.length || max <= 0) return { pts: 0, max, cumple: 0, total: items.length };
  const total = items.length;
  let cumple = 0;
  for (const it of items) {
    if (respuestasPiso[it.codigo] === 'si') cumple += 1;
  }
  const pts = Math.round(((cumple / total) * max) * 100) / 100;
  return { pts, max, cumple, total };
}

export function puntajeTickets(filas = []) {
  // 5 pts si hay al menos una fila revisada sin diferencias graves, o prorrateo simple
  const validas = (filas || []).filter((f) => String(f.proveedor || '').trim() || String(f.fecha || '').trim());
  if (!validas.length) return { pts: 0, max: PTS_TICKETS, revisados: 0 };
  let ok = 0;
  for (const f of validas) {
    const difNeg = Number(f.dif_neg) || 0;
    const difPos = Number(f.dif_pos) || 0;
    // Cumple revisión si se capturó; resta si hay diferencia negativa sin justificar
    if (difNeg <= 0) ok += 1;
    else if (difPos > 0 || String(f.nota || '').trim()) ok += 0.5;
  }
  const pts = Math.round(((ok / validas.length) * PTS_TICKETS) * 100) / 100;
  return { pts: Math.min(PTS_TICKETS, pts), max: PTS_TICKETS, revisados: validas.length };
}

export function puntajePreguntas(preguntas = []) {
  let pts = 0;
  let contestadas = 0;
  for (const p of preguntas || []) {
    if (p.pts != null && p.pts !== '') {
      pts += Math.min(PTS_POR_PREGUNTA, Math.max(0, Number(p.pts) || 0));
      contestadas += 1;
    }
  }
  return {
    pts: Math.round(pts * 100) / 100,
    max: PTS_PREGUNTAS,
    contestadas,
    total: (preguntas || []).length,
  };
}

export function calcularPuntuacion({
  bloques = [],
  respuestasPiso = {},
  tickets = [],
  preguntas = [],
} = {}) {
  const desglose = {};
  let pisoPts = 0;
  let pisoMax = 0;
  for (const b of bloques) {
    const r = puntajeBloquePiso(b, respuestasPiso);
    desglose[b.id] = r;
    pisoPts += r.pts;
    pisoMax += r.max;
  }
  const t = puntajeTickets(tickets);
  const p = puntajePreguntas(preguntas);
  const total = Math.round((pisoPts + t.pts + p.pts) * 100) / 100;
  const max = Math.round((pisoMax + t.max + p.max) * 100) / 100;
  const pct = max > 0 ? Math.round((total / max) * 1000) / 10 : 0;
  return {
    pisoPts: Math.round(pisoPts * 100) / 100,
    pisoMax,
    tickets: t,
    preguntas: p,
    desglose,
    total,
    max: max || PTS_TOTAL,
    pct,
  };
}

export function evaluacionVacia({
  sucursalId,
  auditorNombre,
  auditorId,
  fecha,
} = {}) {
  const bloques = itemsPisoPorBloque();
  return {
    sucursal_id: normalizarCodigoTienda(sucursalId) || '',
    fecha: fecha || hoyYmdLocal(),
    encargado_nombre: '',
    encargado_id: null,
    auditor_nombre: auditorNombre || '',
    auditor_id: auditorId || null,
    estado: 'borrador',
    tickets: [{ fecha: '', proveedor: '', cant_ticket: '', cant_ingresada: '', dif_neg: '', dif_pos: '', nota: '' }],
    respuestas_piso: {},
    preguntas: seleccionarPreguntasAleatorias(),
    comentarios: '',
    firma_auditor: '',
    firma_encargado: '',
    firma_asesor: '',
    puntuacion: null,
    bloques,
  };
}

export async function listarEvaluaciones(supabase, { sucursalId = null, limit = 40 } = {}) {
  if (!supabase) return { data: [], error: 'Sin conexión.' };
  let q = supabase
    .from('evaluacion_operativa')
    .select('id, sucursal_id, fecha, encargado_nombre, auditor_nombre, estado, puntuacion_total, puntuacion_pct, created_at')
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  if (sucursalId) q = q.eq('sucursal_id', normalizarCodigoTienda(sucursalId));
  const { data, error } = await q;
  if (faltaTabla(error)) return { data: [], aviso: AVISO_FALTA_EVALUACION };
  if (error) return { data: [], error: error.message };
  return { data: data || [] };
}

export async function obtenerEvaluacion(supabase, id) {
  if (!supabase || !id) return { ok: false, error: 'ID inválido.' };
  const { data, error } = await supabase.from('evaluacion_operativa').select('*').eq('id', id).maybeSingle();
  if (faltaTabla(error)) return { ok: false, error: AVISO_FALTA_EVALUACION, aviso: AVISO_FALTA_EVALUACION };
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'No encontrada.' };
  return { ok: true, data: hidratarEvaluacion(data) };
}

function hidratarEvaluacion(row) {
  const bloques = itemsPisoPorBloque();
  const detalle = row.detalle && typeof row.detalle === 'object' ? row.detalle : {};
  return {
    id: row.id,
    sucursal_id: row.sucursal_id,
    fecha: String(row.fecha || '').slice(0, 10),
    encargado_nombre: row.encargado_nombre || '',
    encargado_id: row.encargado_id || null,
    auditor_nombre: row.auditor_nombre || '',
    auditor_id: row.auditor_id || null,
    estado: row.estado || 'borrador',
    tickets: Array.isArray(detalle.tickets) ? detalle.tickets : [],
    respuestas_piso: detalle.respuestas_piso || {},
    preguntas: Array.isArray(detalle.preguntas) ? detalle.preguntas : [],
    comentarios: row.comentarios || detalle.comentarios || '',
    firma_auditor: detalle.firma_auditor || '',
    firma_encargado: detalle.firma_encargado || '',
    firma_asesor: detalle.firma_asesor || '',
    puntuacion: detalle.puntuacion || null,
    puntuacion_total: row.puntuacion_total,
    puntuacion_pct: row.puntuacion_pct,
    bloques,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function guardarEvaluacion(supabase, draft, { cerrar = false } = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  const suc = normalizarCodigoTienda(draft.sucursal_id);
  if (!suc) return { ok: false, error: 'Indica la tienda.' };
  if (!String(draft.encargado_nombre || '').trim()) {
    return { ok: false, error: 'Indica el encargado / empleado evaluado.' };
  }

  const bloques = draft.bloques?.length ? draft.bloques : itemsPisoPorBloque();
  const score = calcularPuntuacion({
    bloques,
    respuestasPiso: draft.respuestas_piso || {},
    tickets: draft.tickets || [],
    preguntas: draft.preguntas || [],
  });

  const detalle = {
    tickets: draft.tickets || [],
    respuestas_piso: draft.respuestas_piso || {},
    preguntas: draft.preguntas || [],
    comentarios: draft.comentarios || '',
    firma_auditor: draft.firma_auditor || '',
    firma_encargado: draft.firma_encargado || '',
    firma_asesor: draft.firma_asesor || '',
    puntuacion: score,
    doc: DOC_EVALUACION,
  };

  const payload = {
    sucursal_id: suc,
    fecha: String(draft.fecha || hoyYmdLocal()).slice(0, 10),
    encargado_nombre: String(draft.encargado_nombre || '').trim(),
    encargado_id: draft.encargado_id || null,
    auditor_nombre: String(draft.auditor_nombre || '').trim(),
    auditor_id: draft.auditor_id || null,
    estado: cerrar ? 'cerrado' : (draft.estado === 'cerrado' ? 'cerrado' : 'borrador'),
    comentarios: draft.comentarios || '',
    puntuacion_total: score.total,
    puntuacion_pct: score.pct,
    detalle,
    updated_at: new Date().toISOString(),
  };
  if (cerrar) payload.cerrado_at = new Date().toISOString();

  if (draft.id) {
    const { data, error } = await supabase
      .from('evaluacion_operativa')
      .update(payload)
      .eq('id', draft.id)
      .select('*')
      .single();
    if (faltaTabla(error)) return { ok: false, error: AVISO_FALTA_EVALUACION, aviso: AVISO_FALTA_EVALUACION };
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: hidratarEvaluacion(data), score };
  }

  const { data, error } = await supabase
    .from('evaluacion_operativa')
    .insert([{ ...payload, created_at: new Date().toISOString() }])
    .select('*')
    .single();
  if (faltaTabla(error)) return { ok: false, error: AVISO_FALTA_EVALUACION, aviso: AVISO_FALTA_EVALUACION };
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: hidratarEvaluacion(data), score };
}

export async function eliminarEvaluacion(supabase, id) {
  if (!supabase || !id) return { ok: false, error: 'ID inválido.' };
  const { error } = await supabase.from('evaluacion_operativa').delete().eq('id', id);
  if (faltaTabla(error)) return { ok: false, error: AVISO_FALTA_EVALUACION };
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
