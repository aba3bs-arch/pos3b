/**
 * Check List operativo FA3B-017 Rev A (Buenos Aires / tiendas).
 * Una sesión por sucursal + fecha + turno (TD | TN | SUP).
 */

export const AVISO_FALTA_CHECKLIST =
  'Ejecuta supabase/fix_checklist_operativo.sql en Supabase (tablas checklist_sesiones y checklist_respuestas).';

export const TURNOS_CHECKLIST = [
  { id: 'TD', label: 'Turno día (TD)' },
  { id: 'TN', label: 'Turno noche (TN)' },
  { id: 'SUP', label: 'Supervisor (SUP)' },
];

export const ESTADOS_CHECKLIST = [
  { id: 'ok', label: 'Cumple', simbolo: '✔' },
  { id: 'no', label: 'No cumple', simbolo: '✘' },
  { id: 'reportar', label: 'Reportar', simbolo: 'R' },
];

/** Plantilla fija FA3B-017 — no editable por cajero. */
export const PLANTILLA_CHECKLIST_FA3B017 = [
  {
    id: '1',
    nombre: 'DISCIPLINA',
    items: [
      { codigo: '1.1', texto: 'Registro de asistencia (Registro de visitas a tienda)' },
      { codigo: '1.2', texto: 'Cumple con los Horarios de entrada y salida?' },
      { codigo: '1.3', texto: 'Cumple con sus descansos asignados?' },
    ],
  },
  {
    id: '2',
    nombre: 'ESTANDARIZACION DE PROCESOS',
    items: [
      { codigo: '2.1', texto: 'Procesos de PreInventario' },
      { codigo: '2.2', texto: 'Proceso de ventas' },
      { codigo: '2.3', texto: 'Proceso de Compras' },
      { codigo: '2.4', texto: 'Proceso de Solicitud de Abasto' },
    ],
  },
  {
    id: '3',
    nombre: 'LIMPIEZA',
    items: [
      { codigo: '3.1', texto: 'Limpieza de piso de venta' },
      { codigo: '3.2', texto: 'Limpieza del area de MAQUINAS' },
      { codigo: '3.3', texto: 'Limpieza de estantes y vitrinas' },
      { codigo: '3.4', texto: 'Desempolvar mercancia' },
      { codigo: '3.5', texto: 'Limpieza del Area de Caja' },
      { codigo: '3.6', texto: 'Limpieza de banquetas, patio y Baño' },
    ],
  },
  {
    id: '4',
    nombre: 'ORDEN',
    items: [
      { codigo: '4.1', texto: 'Exhibicion de Mercancias' },
      { codigo: '4.2', texto: 'Checar Mermas' },
      { codigo: '4.3', texto: 'Acomodo de mercancia segun planos' },
      { codigo: '4.4', texto: 'Ordenar area de caja' },
      { codigo: '4.5', texto: 'Acomodar Anuncios y publicidad' },
    ],
  },
  {
    id: '5',
    nombre: 'CLASIFICACION',
    items: [
      { codigo: '5.1', texto: 'Mercancia caducada (clasificar por proveedor)' },
      { codigo: '5.2', texto: 'Mercancia Danada (clasificar por proveedor)' },
      { codigo: '5.3', texto: 'Acomodar Mercancia almacenada (por proveedor)' },
      { codigo: '5.4', texto: 'Separa lo que no se usa en tienda' },
      { codigo: '5.6', texto: 'Clasificar tickets de compra por proveedor y fecha' },
    ],
  },
  {
    id: '6',
    nombre: 'ABASTO',
    items: [
      { codigo: '6.1', texto: 'Rellenar huecos (estantes y Refrigeradores)' },
      { codigo: '6.2', texto: 'Hacer Lista de Mercancia Faltante' },
      { codigo: '6.3', texto: 'Ingresar compras al sistema' },
      { codigo: '6.4', texto: 'Cuenta con utensilios de limpieza?' },
      { codigo: '6.5', texto: 'Solicitud de Abarrotes' },
    ],
  },
  {
    id: '7',
    nombre: 'MANTENIMIENTO',
    items: [
      { codigo: '7.1', texto: 'Maquinas (estado y funcionamiento)' },
      { codigo: '7.2', texto: 'Luces Fundidas, quebradas o dañadas' },
      { codigo: '7.3', texto: 'Ventanas, puertas y candados' },
      { codigo: '7.4', texto: 'Pisos, techos, goteras, fuga de agua, baños' },
      { codigo: '7.5', texto: 'Puntos de venta, rollos, tickets' },
    ],
  },
  {
    id: '8',
    nombre: 'COMUNICACION',
    items: [
      { codigo: '8.1', texto: 'Reporto incidencias de personal?' },
      { codigo: '8.2', texto: 'Reporto incidencias de abasto?' },
      { codigo: '8.3', texto: 'Reporto fallas de mantenimiento?' },
      { codigo: '8.4', texto: 'Reporto fallas en el sistema moneda virtual?' },
      { codigo: '8.5', texto: 'Reporto fallas del punto de venta?' },
    ],
  },
];

export function totalItemsPlantilla() {
  return PLANTILLA_CHECKLIST_FA3B017.reduce((n, s) => n + s.items.length, 0);
}

export function hoyYmdLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Sugiere TD (antes 15:00) o TN. */
export function turnoSugeridoAhora(date = new Date()) {
  return date.getHours() < 15 ? 'TD' : 'TN';
}

function faltaTabla(error) {
  const msg = String(error?.message || '').toLowerCase();
  return (
    error?.code === '42P01'
    || msg.includes('checklist_')
    || (msg.includes('schema cache') && msg.includes('checklist'))
  );
}

export function progresoChecklist(respuestasMap) {
  const total = totalItemsPlantilla();
  let marcados = 0;
  let ok = 0;
  let no = 0;
  let reportar = 0;
  for (const sec of PLANTILLA_CHECKLIST_FA3B017) {
    for (const it of sec.items) {
      const est = respuestasMap[it.codigo]?.estado;
      if (est === 'ok' || est === 'no' || est === 'reportar') {
        marcados += 1;
        if (est === 'ok') ok += 1;
        else if (est === 'no') no += 1;
        else reportar += 1;
      }
    }
  }
  return { total, marcados, ok, no, reportar, pct: total ? Math.round((marcados / total) * 100) : 0 };
}

export async function obtenerOCrearSesionChecklist(supabase, {
  sucursalId,
  fecha,
  turno,
  usuarioId,
  usuarioNombre,
}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  const suc = String(sucursalId || '').trim().toUpperCase();
  const ymd = String(fecha || hoyYmdLocal()).slice(0, 10);
  const t = String(turno || 'TD').toUpperCase();
  if (!suc) return { ok: false, error: 'Sucursal requerida.' };
  if (!['TD', 'TN', 'SUP'].includes(t)) return { ok: false, error: 'Turno inválido.' };

  const existing = await supabase
    .from('checklist_sesiones')
    .select('*')
    .eq('sucursal_id', suc)
    .eq('fecha', ymd)
    .eq('turno', t)
    .maybeSingle();

  if (existing.error && faltaTabla(existing.error)) {
    return { ok: false, error: AVISO_FALTA_CHECKLIST, aviso: AVISO_FALTA_CHECKLIST };
  }
  if (existing.error) return { ok: false, error: existing.error.message };
  if (existing.data) {
    const resp = await listarRespuestasSesion(supabase, existing.data.id);
    return { ok: true, sesion: existing.data, respuestas: resp.data || {}, aviso: resp.aviso };
  }

  const { data, error } = await supabase
    .from('checklist_sesiones')
    .insert({
      sucursal_id: suc,
      fecha: ymd,
      turno: t,
      estado: 'borrador',
      usuario_id: usuarioId || null,
      usuario_nombre: usuarioNombre || '',
      comentarios: '',
    })
    .select('*')
    .single();

  if (error && faltaTabla(error)) {
    return { ok: false, error: AVISO_FALTA_CHECKLIST, aviso: AVISO_FALTA_CHECKLIST };
  }
  if (error) return { ok: false, error: error.message };
  return { ok: true, sesion: data, respuestas: {} };
}

export async function listarRespuestasSesion(supabase, sesionId) {
  if (!supabase || !sesionId) return { data: {} };
  const { data, error } = await supabase
    .from('checklist_respuestas')
    .select('*')
    .eq('sesion_id', sesionId);
  if (error && faltaTabla(error)) return { data: {}, aviso: AVISO_FALTA_CHECKLIST };
  if (error) return { data: {}, error: error.message };
  const map = {};
  for (const r of data || []) {
    map[r.item_codigo] = r;
  }
  return { data: map };
}

export async function guardarRespuestaChecklist(supabase, {
  sesionId,
  itemCodigo,
  seccionId,
  estado,
  comentario = '',
}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  if (!sesionId || !itemCodigo) return { ok: false, error: 'Datos incompletos.' };
  const est = estado === '' || estado == null ? null : String(estado);
  if (est && !['ok', 'no', 'reportar'].includes(est)) {
    return { ok: false, error: 'Estado inválido.' };
  }

  if (!est) {
    const { error } = await supabase
      .from('checklist_respuestas')
      .delete()
      .eq('sesion_id', sesionId)
      .eq('item_codigo', itemCodigo);
    if (error && faltaTabla(error)) return { ok: false, error: AVISO_FALTA_CHECKLIST, aviso: AVISO_FALTA_CHECKLIST };
    if (error) return { ok: false, error: error.message };
    return { ok: true, deleted: true };
  }

  const row = {
    sesion_id: sesionId,
    item_codigo: itemCodigo,
    seccion_id: seccionId || '',
    estado: est,
    comentario: String(comentario || '').trim(),
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from('checklist_respuestas')
    .upsert(row, { onConflict: 'sesion_id,item_codigo' })
    .select('*')
    .maybeSingle();
  if (error && faltaTabla(error)) return { ok: false, error: AVISO_FALTA_CHECKLIST, aviso: AVISO_FALTA_CHECKLIST };
  if (error) return { ok: false, error: error.message };
  return { ok: true, data };
}

export async function guardarComentariosSesion(supabase, sesionId, comentarios) {
  if (!supabase || !sesionId) return { ok: false, error: 'Sin sesión.' };
  const { error } = await supabase
    .from('checklist_sesiones')
    .update({ comentarios: String(comentarios || '').trim(), updated_at: new Date().toISOString() })
    .eq('id', sesionId);
  if (error && faltaTabla(error)) return { ok: false, error: AVISO_FALTA_CHECKLIST, aviso: AVISO_FALTA_CHECKLIST };
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function cerrarSesionChecklist(supabase, sesionId) {
  if (!supabase || !sesionId) return { ok: false, error: 'Sin sesión.' };
  const resp = await listarRespuestasSesion(supabase, sesionId);
  const prog = progresoChecklist(resp.data || {});
  if (prog.marcados < prog.total) {
    return {
      ok: false,
      error: `Faltan ${prog.total - prog.marcados} puntos por marcar (${prog.marcados}/${prog.total}).`,
    };
  }
  const { data, error } = await supabase
    .from('checklist_sesiones')
    .update({
      estado: 'cerrado',
      cerrado_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', sesionId)
    .select('*')
    .single();
  if (error && faltaTabla(error)) return { ok: false, error: AVISO_FALTA_CHECKLIST, aviso: AVISO_FALTA_CHECKLIST };
  if (error) return { ok: false, error: error.message };
  return { ok: true, sesion: data };
}

export async function reabrirSesionChecklist(supabase, sesionId) {
  if (!supabase || !sesionId) return { ok: false, error: 'Sin sesión.' };
  const { data, error } = await supabase
    .from('checklist_sesiones')
    .update({
      estado: 'borrador',
      cerrado_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sesionId)
    .select('*')
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, sesion: data };
}

export async function listarSesionesChecklist(supabase, {
  sucursalId = null,
  desde = null,
  hasta = null,
  limit = 40,
} = {}) {
  if (!supabase) return { data: [] };
  let q = supabase
    .from('checklist_sesiones')
    .select('*')
    .order('fecha', { ascending: false })
    .order('turno', { ascending: true })
    .limit(limit);
  if (sucursalId) q = q.eq('sucursal_id', String(sucursalId).toUpperCase());
  if (desde) q = q.gte('fecha', String(desde).slice(0, 10));
  if (hasta) q = q.lte('fecha', String(hasta).slice(0, 10));
  const { data, error } = await q;
  if (error && faltaTabla(error)) return { data: [], aviso: AVISO_FALTA_CHECKLIST };
  if (error) return { data: [], error: error.message };
  return { data: data || [] };
}

export function etiquetaEstado(estado) {
  return ESTADOS_CHECKLIST.find((e) => e.id === estado)?.simbolo || '—';
}

export function labelTurno(turno) {
  return TURNOS_CHECKLIST.find((t) => t.id === turno)?.label || turno;
}
