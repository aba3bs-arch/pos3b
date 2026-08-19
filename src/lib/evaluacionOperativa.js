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
 * Banco amplio de preguntas orales / de conocimiento.
 * Basadas en las normas operativas del Check List.
 */
export const BANCO_PREGUNTAS_EVALUACION = [
  // Generales / disciplina
  {
    id: 'g1',
    seccion: '1',
    texto: 'Menciona las 5 primeras normas operativas (o las secciones principales del check list).',
    guia: 'Disciplina, Estandarización, Limpieza, Orden, Clasificación…',
  },
  {
    id: 'g2',
    seccion: '1',
    texto: '¿En qué se basa el check list operativo?',
    guia: 'En las normas operativas FA3B-017 (disciplina, procesos, limpieza, orden…).',
  },
  {
    id: 'g3',
    seccion: '1',
    texto: '¿Para qué sirve registrar la asistencia y cumplir horarios de entrada/salida?',
    guia: 'Disciplina 1.1–1.2: control de visitas y turnos.',
  },
  {
    id: 'g4',
    seccion: '1',
    texto: '¿Qué pasa si no se respetan los descansos asignados?',
    guia: 'Incumplimiento de norma 1.3; afecta operación y personal.',
  },
  // Procesos
  {
    id: 'p1',
    seccion: '2',
    texto: '¿Qué es un preinventario y para qué sirve?',
    guia: 'Conteo previo para detectar faltantes/sobrantes antes de abasto o cierre (2.1).',
  },
  {
    id: 'p2',
    seccion: '2',
    texto: 'Describe el proceso de venta en mostrador (pasos básicos).',
    guia: 'Atender, escanear/registrar, cobrar, entregar ticket, descontar inventario (2.2).',
  },
  {
    id: 'p3',
    seccion: '2',
    texto: '¿Cómo se registra una compra de proveedor en el sistema?',
    guia: 'Proceso de compras 2.3: recibir, verificar ticket, ingresar cantidades.',
  },
  {
    id: 'p4',
    seccion: '2',
    texto: '¿Cuándo y cómo se solicita abasto a la central / MAIN?',
    guia: 'Proceso 2.4: lista de faltantes y solicitud formal.',
  },
  {
    id: 'p5',
    seccion: '2',
    texto: 'Si el ticket de compra no coincide con lo recibido, ¿qué debes hacer?',
    guia: 'Reportar diferencia (negativa/positiva), no ingresar a ciegas.',
  },
  {
    id: 'p6',
    seccion: '2',
    texto: 'Menciona al menos 3 procesos estandarizados que debes dominar en tienda.',
    guia: 'Preinventario, venta, compras, solicitud de abasto.',
  },
  // Limpieza
  {
    id: 'l1',
    seccion: '3',
    texto: '¿Qué áreas de limpieza revisa el check list? Menciona al menos 4.',
    guia: 'Piso de venta, máquinas, estantes/vitrinas, caja, banqueta/patio/baño.',
  },
  {
    id: 'l2',
    seccion: '3',
    texto: '¿Con qué frecuencia se debe desempolvar la mercancía?',
    guia: 'Según rutina del turno; norma 3.4 exige mantenerla limpia.',
  },
  {
    id: 'l3',
    seccion: '3',
    texto: '¿Por qué es importante la limpieza del área de máquinas?',
    guia: 'Imagen, seguridad y funcionamiento (3.2).',
  },
  {
    id: 'l4',
    seccion: '3',
    texto: '¿Qué incluye la limpieza de banqueta, patio y baño?',
    guia: 'Exterior e instalaciones sanitarias accesibles y presentables (3.6).',
  },
  {
    id: 'l5',
    seccion: '3',
    texto: 'Al abrir el turno, ¿qué puntos de limpieza debes verificar primero?',
    guia: 'Caja, piso de venta y área visible al cliente.',
  },
  // Orden
  {
    id: 'o1',
    seccion: '4',
    texto: 'Menciona algunos de los puntos de la norma 4 (Orden).',
    guia: 'Exhibición, mermas, acomodo según planos/caducidad, caja, anuncios.',
  },
  {
    id: 'o2',
    seccion: '4',
    texto: '¿Cómo se acomoda la mercancía según fecha de caducidad?',
    guia: 'FIFO: lo que caduca primero al frente (4.3 / caducados).',
  },
  {
    id: 'o3',
    seccion: '4',
    texto: '¿Qué revisas en mercancía caduca exhibida?',
    guia: 'Retirar o clasificar; no vender caducado (4.2 / 5.1).',
  },
  {
    id: 'o4',
    seccion: '4',
    texto: '¿Por qué debe estar ordenada el área de caja?',
    guia: 'Agilidad de cobro, control de efectivo y buena imagen (4.4).',
  },
  {
    id: 'o5',
    seccion: '4',
    texto: '¿Qué haces con anuncios y publicidad dañados o vencidos?',
    guia: 'Acomodar o retirar (4.5).',
  },
  // Clasificación
  {
    id: 'c1',
    seccion: '5',
    texto: '¿Cómo se clasifica la mercancía caducada o dañada?',
    guia: 'Por proveedor (5.1 / 5.2).',
  },
  {
    id: 'c2',
    seccion: '5',
    texto: '¿Qué se hace con la mercancía almacenada?',
    guia: 'Acomodarla por proveedor (5.3).',
  },
  {
    id: 'c3',
    seccion: '5',
    texto: '¿Cómo se clasifican los tickets de compra?',
    guia: 'Por proveedor y fecha (5.6).',
  },
  {
    id: 'c4',
    seccion: '5',
    texto: '¿Qué significa “separar lo que no se usa en tienda”?',
    guia: 'Sacar artículos ajenos u obsoletos del piso/almacén (5.4).',
  },
  // Abasto
  {
    id: 'a1',
    seccion: '6',
    texto: '¿Qué es “rellenar huecos” en estantes y refrigeradores?',
    guia: 'Completar faltantes visibles para no perder venta (6.1).',
  },
  {
    id: 'a2',
    seccion: '6',
    texto: '¿Para qué sirve la lista de mercancía faltante?',
    guia: 'Base de la solicitud de abasto (6.2 / 6.5).',
  },
  {
    id: 'a3',
    seccion: '6',
    texto: 'Después de recibir mercancía, ¿qué debes hacer en el sistema?',
    guia: 'Ingresar compras al sistema (6.3).',
  },
  {
    id: 'a4',
    seccion: '6',
    texto: '¿La tienda debe contar con utensilios de limpieza? ¿Cuáles ejemplos?',
    guia: 'Sí (6.4): trapeador, jalador, recogedor, trapos, etc.',
  },
  // Mantenimiento
  {
    id: 'm1',
    seccion: '7',
    texto: '¿Qué revisas en máquinas (estado y funcionamiento)?',
    guia: 'Que operen, sin fallas visibles (7.1).',
  },
  {
    id: 'm2',
    seccion: '7',
    texto: 'Si hay luces fundidas o quebradas, ¿qué haces?',
    guia: 'Reportar falla de mantenimiento (7.2 / 8.3).',
  },
  {
    id: 'm3',
    seccion: '7',
    texto: '¿Qué incluye la revisión de ventanas, puertas y candados?',
    guia: 'Seguridad del local: cierren, sin daños, candados útiles (7.3).',
  },
  {
    id: 'm4',
    seccion: '7',
    texto: 'Menciona fallas de infraestructura que debes reportar.',
    guia: 'Pisos, techos, goteras, fugas de agua, baños (7.4).',
  },
  {
    id: 'm5',
    seccion: '7',
    texto: 'Antes de vender, ¿qué verificas del punto de venta?',
    guia: 'Equipo encendido y rollos/tickets disponibles (7.5).',
  },
  // Comunicación
  {
    id: 'k1',
    seccion: '8',
    texto: '¿Qué tipo de incidencias debes reportar al supervisor / buzón?',
    guia: 'Personal, abasto, mantenimiento, moneda virtual, POS (8.1–8.5).',
  },
  {
    id: 'k2',
    seccion: '8',
    texto: 'Si falla el sistema de moneda virtual, ¿qué haces?',
    guia: 'Reportar de inmediato (8.4); no improvisar sin aviso.',
  },
  {
    id: 'k3',
    seccion: '8',
    texto: '¿Por qué es importante reportar incidencias de personal?',
    guia: 'Norma 8.1: continuidad del turno y disciplina.',
  },
  // Servicio / observación
  {
    id: 's1',
    seccion: 'svc',
    texto: 'Observa y describe cómo es el servicio al cliente que brinda el encargado / empleado.',
    guia: 'Saludo, rapidez, amabilidad, manejo de quejas.',
    tipo: 'observacion',
  },
  {
    id: 's2',
    seccion: 'svc',
    texto: '¿Cómo atenderías a un cliente molesto por un producto caduco o mal cobrado?',
    guia: 'Escuchar, corregir según política, reportar si aplica.',
  },
  {
    id: 's3',
    seccion: 'svc',
    texto: '¿Qué actitud debes mantener en el piso de venta frente al cliente?',
    guia: 'Presentación, atención y orden del área visible.',
  },
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
 * Intenta cubrir varias secciones.
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
  const secciones = barajar(Object.keys(porSec));
  const elegidas = [];
  const usados = new Set();

  // Una por sección distinta primero
  for (const sec of secciones) {
    if (elegidas.length >= n) break;
    const cand = barajar(porSec[sec]).find((p) => !usados.has(p.id));
    if (cand) {
      elegidas.push(cand);
      usados.add(cand.id);
    }
  }
  // Completar al azar
  const resto = barajar(banco.filter((p) => !usados.has(p.id)));
  for (const p of resto) {
    if (elegidas.length >= n) break;
    elegidas.push(p);
    usados.add(p.id);
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
