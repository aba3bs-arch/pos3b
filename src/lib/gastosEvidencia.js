/**
 * Gastos con evidencia — registro personal, pendientes hasta sellado → IE VIRTUAL.
 */
import { hoyYmdNogales } from './corteCaja.js';
import { registrarEgresoContVirtual } from './contVirtualEgresos.js';
import { crearNotificacion, TIPOS_NOTIF, marcarNotificacionAtendida } from './contabilidadNotificaciones.js';
import { etiquetaTienda, normalizarCodigoTienda } from '../constants/sucursales.js';
import { leerImagenProductoComoDataUrl } from './imagenProducto.js';
import { puedeGestionarUsuarios, normalizarRol } from './roles.js';

export const AVISO_FALTA_GASTOS_EVIDENCIA =
  'Ejecuta supabase/fix_gastos_evidencia.sql en Supabase para habilitar Registro de gastos.';

export const ESTADOS_GASTO_EVIDENCIA = ['pendiente', 'sellado', 'rechazado'];
export const MAX_ARCHIVOS_POR_GASTO = 4;
export const MAX_PDF_BYTES = 1.5 * 1024 * 1024;

const LS_GASTOS = 'pos3b_gastos_evidencia';
const LS_ARCHIVOS = 'pos3b_gastos_evidencia_archivos';

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function faltaTabla(error) {
  const msg = String(error?.message || '').toLowerCase();
  return error?.code === '42P01' || msg.includes('gastos_evidencia') || (msg.includes('schema cache') && msg.includes('gastos_evidencia'));
}

function leerLocalGastos() {
  try {
    const j = JSON.parse(localStorage.getItem(LS_GASTOS) || '[]');
    return Array.isArray(j) ? j : [];
  } catch {
    return [];
  }
}

function guardarLocalGastos(lista) {
  localStorage.setItem(LS_GASTOS, JSON.stringify(lista || []));
}

function leerLocalArchivos() {
  try {
    const j = JSON.parse(localStorage.getItem(LS_ARCHIVOS) || '[]');
    return Array.isArray(j) ? j : [];
  } catch {
    return [];
  }
}

function guardarLocalArchivos(lista) {
  localStorage.setItem(LS_ARCHIVOS, JSON.stringify(lista || []));
}

function approxBytesFromDataUrl(dataUrl) {
  const i = String(dataUrl || '').indexOf(',');
  const b64 = i >= 0 ? dataUrl.slice(i + 1) : dataUrl;
  return Math.ceil((b64.length * 3) / 4);
}

function normalizarCuenta(raw) {
  const c = String(raw || 'virtual').toLowerCase();
  if (c === 'garage') return 'garage';
  if (c === 'abarrotes') return 'abarrotes';
  return 'virtual';
}

export function puedeSellarGastosEvidencia(rol) {
  const r = normalizarRol(rol);
  return r === 'Administrador' || r === 'Gerente' || puedeGestionarUsuarios(rol);
}

export function fmtMontoGastoEvidencia(n) {
  return `$${round2(n).toFixed(2)}`;
}

export function etiquetaEstadoGastoEvidencia(estado) {
  if (estado === 'sellado') return 'Sellado → IE';
  if (estado === 'rechazado') return 'Rechazado';
  return 'Pendiente';
}

/** Lee imagen (cámara/galería) o PDF como data URL. */
export async function leerEvidenciaArchivo(file) {
  if (!file) throw new Error('No se eligió archivo.');
  const mime = String(file.type || '');
  const nombre = String(file.name || 'evidencia').slice(0, 120);

  if (mime.startsWith('image/')) {
    const dataUrl = await leerImagenProductoComoDataUrl(file, {
      maxSide: 1280,
      quality: 0.78,
      maxBytes: 900 * 1024,
    });
    return {
      tipo: 'image',
      nombre_archivo: nombre,
      mime: 'image/jpeg',
      contenido: dataUrl,
      bytes_aprox: approxBytesFromDataUrl(dataUrl),
    };
  }

  if (mime === 'application/pdf' || /\.pdf$/i.test(nombre)) {
    if (file.size > MAX_PDF_BYTES) {
      throw new Error('El PDF supera 1.5 MB. Comprime el archivo o súbelo en partes.');
    }
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('No se pudo leer el PDF.'));
      reader.readAsDataURL(file);
    });
    return {
      tipo: 'pdf',
      nombre_archivo: nombre.endsWith('.pdf') ? nombre : `${nombre}.pdf`,
      mime: 'application/pdf',
      contenido: dataUrl,
      bytes_aprox: approxBytesFromDataUrl(dataUrl),
    };
  }

  throw new Error('Solo se permiten fotos, capturas (JPG/PNG/WebP) o PDF.');
}

export async function registrarGastoEvidencia(supabase, row, user) {
  const monto = round2(row?.monto);
  const descripcion = String(row?.descripcion || '').trim();
  if (!(monto > 0)) return { ok: false, error: 'Indica un monto mayor a cero.' };
  if (!descripcion) return { ok: false, error: 'Escribe una descripción del gasto.' };
  if (!row?.categoria_id) return { ok: false, error: 'Elige la categoría de IE VIRTUAL.' };

  const usuarioId = String(user?.id || row?.usuario_id || '').trim();
  if (!usuarioId) return { ok: false, error: 'Usuario no identificado.' };

  const payload = {
    usuario_id: usuarioId,
    usuario_nombre: user?.nombre || row?.usuario_nombre || '—',
    sucursal_id: normalizarCodigoTienda(row?.sucursal_id || user?.sucursal_id) || 'MAIN',
    fecha: String(row?.fecha || hoyYmdNogales()).slice(0, 10),
    monto,
    descripcion,
    categoria_id: row.categoria_id,
    categoria_nombre: row.categoria_nombre || row.categoria_id,
    subcategoria_id: row.subcategoria_id || null,
    subcategoria_nombre: row.subcategoria_nombre || null,
    detalle_id: row.detalle_id || null,
    detalle_nombre: row.detalle_nombre || null,
    cuenta: normalizarCuenta(row.cuenta || 'virtual'),
    estado: 'pendiente',
  };

  if (!supabase) {
    const id = `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const lista = leerLocalGastos();
    const item = { ...payload, id, created_at: new Date().toISOString(), n_archivos: 0 };
    lista.unshift(item);
    guardarLocalGastos(lista);
    return { ok: true, id, data: item, soloLocal: true };
  }

  const { data, error } = await supabase.from('gastos_evidencia').insert([payload]).select('*').single();
  if (error) {
    if (faltaTabla(error)) {
      const id = `local-${Date.now()}`;
      const lista = leerLocalGastos();
      const item = { ...payload, id, created_at: new Date().toISOString(), n_archivos: 0 };
      lista.unshift(item);
      guardarLocalGastos(lista);
      return { ok: true, id, data: item, soloLocal: true, aviso: AVISO_FALTA_GASTOS_EVIDENCIA };
    }
    return { ok: false, error: error.message };
  }

  await crearNotificacion(supabase, {
    sucursal_id: payload.sucursal_id,
    tipo: TIPOS_NOTIF.GASTO_EVIDENCIA,
    ref_tabla: 'gastos_evidencia',
    ref_id: data.id,
    titulo: 'Gasto con evidencia pendiente',
    mensaje: `${payload.usuario_nombre} · ${etiquetaTienda(payload.sucursal_id)} · $${monto.toFixed(2)} · ${descripcion.slice(0, 80)}`,
  });

  return { ok: true, id: data.id, data };
}

export async function listarGastosEvidencia(
  supabase,
  { usuarioId = '', soloPendientes = false, desde = '', hasta = '', limite = 200 } = {},
) {
  if (!supabase) {
    let lista = leerLocalGastos();
    if (usuarioId) lista = lista.filter((g) => String(g.usuario_id) === String(usuarioId));
    if (soloPendientes) lista = lista.filter((g) => g.estado === 'pendiente');
    if (desde) lista = lista.filter((g) => String(g.fecha) >= desde);
    if (hasta) lista = lista.filter((g) => String(g.fecha) <= hasta);
    return { data: lista.slice(0, limite), aviso: null };
  }

  let q = supabase
    .from('gastos_evidencia')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limite);
  if (usuarioId) q = q.eq('usuario_id', String(usuarioId));
  if (soloPendientes) q = q.eq('estado', 'pendiente');
  if (desde) q = q.gte('fecha', desde);
  if (hasta) q = q.lte('fecha', hasta);

  const { data, error } = await q;
  if (error) {
    if (faltaTabla(error)) {
      let lista = leerLocalGastos();
      if (usuarioId) lista = lista.filter((g) => String(g.usuario_id) === String(usuarioId));
      if (soloPendientes) lista = lista.filter((g) => g.estado === 'pendiente');
      return { data: lista.slice(0, limite), aviso: AVISO_FALTA_GASTOS_EVIDENCIA };
    }
    return { data: [], error: error.message };
  }
  return { data: data || [], aviso: null };
}

export async function listarArchivosGastoEvidencia(supabase, gastoId) {
  if (!gastoId) return { data: [] };
  if (!supabase || String(gastoId).startsWith('local-')) {
    return { data: leerLocalArchivos().filter((a) => String(a.gasto_id) === String(gastoId)) };
  }
  const { data, error } = await supabase
    .from('gastos_evidencia_archivos')
    .select('id, gasto_id, tipo, nombre_archivo, mime, contenido, bytes_aprox, created_at')
    .eq('gasto_id', gastoId)
    .order('created_at', { ascending: true });
  if (error) {
    if (faltaTabla(error)) {
      return { data: leerLocalArchivos().filter((a) => String(a.gasto_id) === String(gastoId)), aviso: AVISO_FALTA_GASTOS_EVIDENCIA };
    }
    return { data: [], error: error.message };
  }
  return { data: data || [] };
}

export async function adjuntarEvidenciaGasto(supabase, gastoId, archivo, user) {
  if (!gastoId) return { ok: false, error: 'Gasto inválido.' };
  if (!archivo?.contenido) return { ok: false, error: 'Archivo vacío.' };

  const existentes = await listarArchivosGastoEvidencia(supabase, gastoId);
  if ((existentes.data || []).length >= MAX_ARCHIVOS_POR_GASTO) {
    return { ok: false, error: `Máximo ${MAX_ARCHIVOS_POR_GASTO} archivos por gasto.` };
  }

  // Solo pendientes pueden adjuntar (dueño o admin)
  let gasto = null;
  if (!supabase || String(gastoId).startsWith('local-')) {
    gasto = leerLocalGastos().find((g) => String(g.id) === String(gastoId));
  } else {
    const { data } = await supabase.from('gastos_evidencia').select('*').eq('id', gastoId).maybeSingle();
    gasto = data;
  }
  if (!gasto) return { ok: false, error: 'Gasto no encontrado.' };
  if (gasto.estado !== 'pendiente') return { ok: false, error: 'Solo se puede adjuntar evidencia a gastos pendientes.' };

  const esAdmin = puedeSellarGastosEvidencia(user?.rol);
  if (!esAdmin && String(gasto.usuario_id) !== String(user?.id)) {
    return { ok: false, error: 'Solo puedes adjuntar evidencia a tus propios gastos.' };
  }

  const payload = {
    gasto_id: gastoId,
    tipo: archivo.tipo || 'image',
    nombre_archivo: archivo.nombre_archivo || 'evidencia',
    mime: archivo.mime || 'image/jpeg',
    contenido: archivo.contenido,
    bytes_aprox: Number(archivo.bytes_aprox) || approxBytesFromDataUrl(archivo.contenido),
  };

  if (!supabase || String(gastoId).startsWith('local-')) {
    const id = `local-file-${Date.now()}`;
    const lista = leerLocalArchivos();
    lista.push({ ...payload, id, created_at: new Date().toISOString() });
    guardarLocalArchivos(lista);
    return { ok: true, id, soloLocal: true };
  }

  const { data, error } = await supabase.from('gastos_evidencia_archivos').insert([payload]).select('id').single();
  if (error) {
    if (faltaTabla(error)) {
      const id = `local-file-${Date.now()}`;
      const lista = leerLocalArchivos();
      lista.push({ ...payload, id, created_at: new Date().toISOString() });
      guardarLocalArchivos(lista);
      return { ok: true, id, soloLocal: true, aviso: AVISO_FALTA_GASTOS_EVIDENCIA };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true, id: data?.id };
}

export async function eliminarArchivoGastoEvidencia(supabase, archivoId, gastoId) {
  if (!archivoId) return { ok: false, error: 'Archivo inválido.' };
  if (!supabase || String(archivoId).startsWith('local-')) {
    guardarLocalArchivos(leerLocalArchivos().filter((a) => String(a.id) !== String(archivoId)));
    return { ok: true };
  }
  const { error } = await supabase.from('gastos_evidencia_archivos').delete().eq('id', archivoId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function eliminarGastoEvidencia(supabase, gastoId, user) {
  if (!gastoId) return { ok: false, error: 'Gasto inválido.' };

  let gasto = null;
  if (!supabase || String(gastoId).startsWith('local-')) {
    gasto = leerLocalGastos().find((g) => String(g.id) === String(gastoId));
  } else {
    const { data } = await supabase.from('gastos_evidencia').select('*').eq('id', gastoId).maybeSingle();
    gasto = data;
  }
  if (!gasto) return { ok: false, error: 'Gasto no encontrado.' };
  if (gasto.estado === 'sellado') return { ok: false, error: 'No se puede eliminar un gasto ya sellado en IE.' };

  const esAdmin = puedeSellarGastosEvidencia(user?.rol);
  if (!esAdmin && String(gasto.usuario_id) !== String(user?.id)) {
    return { ok: false, error: 'Solo puedes eliminar tus propios gastos pendientes.' };
  }

  if (!supabase || String(gastoId).startsWith('local-')) {
    guardarLocalGastos(leerLocalGastos().filter((g) => String(g.id) !== String(gastoId)));
    guardarLocalArchivos(leerLocalArchivos().filter((a) => String(a.gasto_id) !== String(gastoId)));
    return { ok: true };
  }

  const { error } = await supabase.from('gastos_evidencia').delete().eq('id', gastoId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

async function sellarUno(supabase, gasto, actor) {
  if (!gasto || gasto.estado !== 'pendiente') {
    return { ok: false, error: 'El gasto no está pendiente.' };
  }

  const ie = await registrarEgresoContVirtual(supabase, {
    sucursal_id: gasto.sucursal_id || 'MAIN',
    fecha: gasto.fecha || hoyYmdNogales(),
    categoria_id: gasto.categoria_id,
    categoria_nombre: gasto.categoria_nombre || gasto.categoria_id,
    subcategoria_id: gasto.subcategoria_id || null,
    subcategoria_nombre: gasto.subcategoria_nombre || null,
    detalle_id: gasto.detalle_id || null,
    detalle_nombre: gasto.detalle_nombre || null,
    monto: gasto.monto,
    descripcion: `Evidencia · ${gasto.usuario_nombre || '—'} · ${gasto.descripcion || ''}`.trim(),
    fuente: 'gasto_evidencia',
    ref_tabla: 'gastos_evidencia',
    ref_id: gasto.id,
    usuario_nombre: gasto.usuario_nombre || actor?.nombre || null,
    cuenta: normalizarCuenta(gasto.cuenta || 'virtual'),
  });

  if (!ie.ok && !ie.yaExiste) return { ok: false, error: ie.error || 'No se pudo registrar en IE VIRTUAL.' };

  const patch = {
    estado: 'sellado',
    sellado_por: actor?.nombre || '—',
    sellado_at: new Date().toISOString(),
    ie_egreso_id: ie.id || null,
    updated_at: new Date().toISOString(),
  };

  if (!supabase || String(gasto.id).startsWith('local-')) {
    const lista = leerLocalGastos().map((g) => (String(g.id) === String(gasto.id) ? { ...g, ...patch } : g));
    guardarLocalGastos(lista);
    return { ok: true, id: gasto.id, ie_egreso_id: ie.id, yaExiste: ie.yaExiste };
  }

  const { error } = await supabase.from('gastos_evidencia').update(patch).eq('id', gasto.id).eq('estado', 'pendiente');
  if (error) return { ok: false, error: error.message };

  await marcarNotificacionAtendida(supabase, 'gastos_evidencia', gasto.id, actor?.nombre || '—');

  return { ok: true, id: gasto.id, ie_egreso_id: ie.id, yaExiste: ie.yaExiste };
}

/** Sella uno o varios gastos pendientes → IE VIRTUAL. */
export async function sellarGastosEvidencia(supabase, gastoIds, actor) {
  if (!puedeSellarGastosEvidencia(actor?.rol)) {
    return { ok: false, error: 'Solo administrador o gerente pueden sellar gastos hacia IE VIRTUAL.' };
  }
  const ids = (gastoIds || []).map((x) => String(x)).filter(Boolean);
  if (!ids.length) return { ok: false, error: 'Selecciona al menos un gasto pendiente.' };

  const resultados = [];
  for (const id of ids) {
    let gasto = null;
    if (!supabase || id.startsWith('local-')) {
      gasto = leerLocalGastos().find((g) => String(g.id) === id);
    } else {
      const { data } = await supabase.from('gastos_evidencia').select('*').eq('id', id).maybeSingle();
      gasto = data;
    }
    if (!gasto) {
      resultados.push({ id, ok: false, error: 'No encontrado' });
      continue;
    }
    const r = await sellarUno(supabase, gasto, actor);
    resultados.push({ id, ...r });
  }

  const ok = resultados.filter((r) => r.ok).length;
  const fail = resultados.filter((r) => !r.ok);
  return {
    ok: fail.length === 0,
    sellados: ok,
    fallidos: fail.length,
    resultados,
    error: fail.length ? fail.map((f) => f.error).filter(Boolean).join('; ') : null,
  };
}

export async function rechazarGastoEvidencia(supabase, gastoId, actor, motivo = '') {
  if (!puedeSellarGastosEvidencia(actor?.rol)) {
    return { ok: false, error: 'Solo administrador o gerente pueden rechazar.' };
  }
  const patch = {
    estado: 'rechazado',
    motivo_rechazo: String(motivo || '').trim() || 'Rechazado',
    rechazado_por: actor?.nombre || '—',
    rechazado_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (!supabase || String(gastoId).startsWith('local-')) {
    const lista = leerLocalGastos().map((g) => (String(g.id) === String(gastoId) ? { ...g, ...patch } : g));
    guardarLocalGastos(lista);
    return { ok: true };
  }

  const { error } = await supabase.from('gastos_evidencia').update(patch).eq('id', gastoId).eq('estado', 'pendiente');
  if (error) return { ok: false, error: error.message };

  await marcarNotificacionAtendida(supabase, 'gastos_evidencia', gastoId, actor?.nombre || '—');
  return { ok: true };
}

export function totalPendienteGastos(filas) {
  return round2(
    (filas || [])
      .filter((g) => g.estado === 'pendiente')
      .reduce((a, g) => a + (Number(g.monto) || 0), 0),
  );
}
