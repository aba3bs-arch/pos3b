/**
 * Gastos con evidencia — registro personal, pendientes hasta sellado → IE VIRTUAL.
 */
import { hoyYmdNogales } from './corteCaja.js';
import { registrarEgresoContVirtual } from './contVirtualEgresos.js';
import { crearNotificacion, TIPOS_NOTIF, marcarNotificacionAtendida } from './contabilidadNotificaciones.js';
import { etiquetaTienda, normalizarCodigoTienda } from '../constants/sucursales.js';
import { leerImagenProductoComoDataUrl } from './imagenProducto.js';
import { puedeGestionarUsuarios, normalizarRol } from './roles.js';
import { esAdministradorPrincipal, nombreEsAdminPrincipal } from './adminPrincipal.js';
import { esAprobadorRecoleccionIe } from './contabilidadConstants.js';

export const AVISO_FALTA_GASTOS_EVIDENCIA =
  'Ejecuta supabase/fix_gastos_evidencia.sql en Supabase para habilitar Registro de gastos.';

export const ESTADOS_GASTO_EVIDENCIA = ['pendiente', 'pendiente_amr', 'sellado', 'rechazado'];
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

/** Adjuntos / ayuda: admin o gerente. */
export function puedeSellarGastosEvidencia(rol) {
  const r = normalizarRol(rol);
  return r === 'Administrador' || r === 'Gerente' || puedeGestionarUsuarios(rol);
}

/** Gasto registrado por AMR / Andrés. */
export function gastoEvidenciaEsDeAmr(gasto) {
  return nombreEsAdminPrincipal(gasto?.usuario_nombre);
}

/** ABB, JLBB o FJBB: aprueban gastos de empleados (no AMR). */
export function esAprobadorGastosSocio(user) {
  return esAprobadorRecoleccionIe(user?.nombre);
}

/** Puede ver bandeja de aprobación en su dispositivo. */
export function puedeVerBandejaAprobacionGastos(user) {
  return esAprobadorGastosSocio(user) || esAdministradorPrincipal(user);
}

/**
 * ¿Este usuario (sesión en su celular/dispositivo) puede actuar sobre este gasto?
 * - Empleados pendientes → ABB / JLBB / FJBB (1 PIN → IE)
 * - AMR en pendiente → ABB / JLBB / FJBB (1.º PIN)
 * - AMR en pendiente_amr → AMR (2.º PIN → IE)
 */
export function puedeAprobarGastoEvidencia(user, gasto) {
  if (!user || !gasto) return false;
  const est = String(gasto.estado || '');
  if (est === 'sellado' || est === 'rechazado') return false;

  if (gastoEvidenciaEsDeAmr(gasto)) {
    if (est === 'pendiente') return esAprobadorGastosSocio(user);
    if (est === 'pendiente_amr') return esAdministradorPrincipal(user);
    return false;
  }

  return est === 'pendiente' && esAprobadorGastosSocio(user);
}

export function gastoPendienteDeAprobacion(gasto) {
  const est = String(gasto?.estado || '');
  return est === 'pendiente' || est === 'pendiente_amr';
}

/** Qué hace el botón de aprobación según quién y el estado. */
export function accionAprobacionGasto(user, gasto) {
  if (!puedeAprobarGastoEvidencia(user, gasto)) return null;
  if (gastoEvidenciaEsDeAmr(gasto)) {
    if (gasto.estado === 'pendiente') return 'firmar_admin';
    if (gasto.estado === 'pendiente_amr') return 'firmar_amr';
  }
  return 'sellar';
}

/** @deprecated usar puedeVerBandejaAprobacionGastos / puedeAprobarGastoEvidencia */
export function puedeAprobarGastosEvidenciaAmr(user) {
  return esAdministradorPrincipal(user);
}

/**
 * Valida el PIN de la sesión actual (mismo dispositivo/usuario logueado).
 * No permite usar el PIN de otra persona.
 */
async function autenticarPinPropioSesion(supabase, pin, actor) {
  const p = String(pin || '').trim();
  if (!p) return { ok: false, error: 'Indica tu PIN para aprobar desde este dispositivo.' };
  if (!actor?.id && !actor?.nombre) {
    return { ok: false, error: 'Sesión no identificada. Entra con tu usuario en este dispositivo.' };
  }

  if (!supabase) {
    return { ok: true, user: actor, nombre: actor?.nombre || '—' };
  }

  const { data, error } = await supabase.from('usuarios').select('*').eq('pin', p);
  if (error) return { ok: false, error: error.message };
  const candidatos = data || [];
  if (!candidatos.length) return { ok: false, error: 'PIN incorrecto.' };

  const actorId = String(actor.id || '');
  const match =
    candidatos.find((u) => actorId && String(u.id) === actorId) ||
    candidatos.find((u) => String(u.nombre || '').toLowerCase() === String(actor.nombre || '').toLowerCase());

  if (!match) {
    return {
      ok: false,
      error: 'Ese PIN no es el de tu sesión. Aprueba desde tu propio dispositivo o celular con tu usuario.',
    };
  }

  return { ok: true, user: match, nombre: match.nombre };
}

export function fmtMontoGastoEvidencia(n) {
  return `$${round2(n).toFixed(2)}`;
}

export function etiquetaEstadoGastoEvidencia(estado) {
  if (estado === 'sellado') return 'Sellado → IE';
  if (estado === 'rechazado') return 'Rechazado';
  if (estado === 'pendiente_amr') return 'Falta PIN AMR';
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
    if (soloPendientes) lista = lista.filter((g) => gastoPendienteDeAprobacion(g));
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
  if (soloPendientes) q = q.in('estado', ['pendiente', 'pendiente_amr']);
  if (desde) q = q.gte('fecha', desde);
  if (hasta) q = q.lte('fecha', hasta);

  const { data, error } = await q;
  if (error) {
    if (faltaTabla(error)) {
      let lista = leerLocalGastos();
      if (usuarioId) lista = lista.filter((g) => String(g.usuario_id) === String(usuarioId));
      if (soloPendientes) lista = lista.filter((g) => gastoPendienteDeAprobacion(g));
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
  if (gasto.estado !== 'pendiente' && gasto.estado !== 'pendiente_amr') {
    return { ok: false, error: 'Solo se puede adjuntar evidencia a gastos pendientes.' };
  }

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

async function firmarAdminAmrUno(supabase, gasto, actor) {
  if (!gasto || gasto.estado !== 'pendiente' || !gastoEvidenciaEsDeAmr(gasto)) {
    return { ok: false, error: 'Este gasto no espera el PIN de admin (ABB/JLBB/FJBB).' };
  }
  const patch = {
    estado: 'pendiente_amr',
    admin_aprobado_por: actor?.nombre || '—',
    admin_aprobado_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (!supabase || String(gasto.id).startsWith('local-')) {
    const lista = leerLocalGastos().map((g) => (String(g.id) === String(gasto.id) ? { ...g, ...patch } : g));
    guardarLocalGastos(lista);
    return { ok: true, id: gasto.id, paso: 'admin', pendienteAmr: true };
  }

  const { error } = await supabase
    .from('gastos_evidencia')
    .update(patch)
    .eq('id', gasto.id)
    .eq('estado', 'pendiente');
  if (error) {
    if (String(error.message || '').toLowerCase().includes('admin_aprobado')) {
      return {
        ok: false,
        error: 'Falta migrar columnas. Ejecuta supabase/fix_gastos_evidencia.sql (admin_aprobado_por / pendiente_amr).',
      };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true, id: gasto.id, paso: 'admin', pendienteAmr: true };
}

async function sellarUno(supabase, gasto, actor, { estadoEsperado = 'pendiente' } = {}) {
  if (!gasto || gasto.estado !== estadoEsperado) {
    return { ok: false, error: 'El gasto no está listo para sellar a IE.' };
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

  const selladoPor = gasto.admin_aprobado_por
    ? `${gasto.admin_aprobado_por} + ${actor?.nombre || 'AMR'}`
    : actor?.nombre || '—';

  const patch = {
    estado: 'sellado',
    sellado_por: selladoPor,
    sellado_at: new Date().toISOString(),
    ie_egreso_id: ie.id || null,
    updated_at: new Date().toISOString(),
  };

  if (!supabase || String(gasto.id).startsWith('local-')) {
    const lista = leerLocalGastos().map((g) => (String(g.id) === String(gasto.id) ? { ...g, ...patch } : g));
    guardarLocalGastos(lista);
    return { ok: true, id: gasto.id, ie_egreso_id: ie.id, yaExiste: ie.yaExiste, paso: 'sellado' };
  }

  const { error } = await supabase
    .from('gastos_evidencia')
    .update(patch)
    .eq('id', gasto.id)
    .eq('estado', estadoEsperado);
  if (error) return { ok: false, error: error.message };

  await marcarNotificacionAtendida(supabase, 'gastos_evidencia', gasto.id, selladoPor);

  return { ok: true, id: gasto.id, ie_egreso_id: ie.id, yaExiste: ie.yaExiste, paso: 'sellado' };
}

/**
 * Aprueba / sella gastos con el PIN del usuario en sesión (su dispositivo).
 * - Empleados: 1 PIN (ABB/JLBB/FJBB) → IE
 * - AMR: 1.º PIN admin → pendiente_amr; 2.º PIN AMR → IE
 * @param {{ pin?: string }} opts
 */
export async function sellarGastosEvidencia(supabase, gastoIds, actor, opts = {}) {
  if (!puedeVerBandejaAprobacionGastos(actor)) {
    return {
      ok: false,
      error: 'Solo ABB, JLBB, FJBB o AMR pueden aprobar, cada uno desde su dispositivo.',
    };
  }

  const auth = await autenticarPinPropioSesion(supabase, opts.pin, actor);
  if (!auth.ok) return { ok: false, error: auth.error || 'PIN incorrecto.' };

  const aprobador = auth.user || actor;
  if (!puedeVerBandejaAprobacionGastos(aprobador)) {
    return { ok: false, error: 'Tu usuario no está autorizado para aprobar estos gastos.' };
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
    const accion = accionAprobacionGasto(aprobador, gasto);
    if (!accion) {
      resultados.push({
        id,
        ok: false,
        error: gastoEvidenciaEsDeAmr(gasto)
          ? gasto.estado === 'pendiente'
            ? 'Primero debe firmar ABB, JLBB o FJBB con su PIN.'
            : 'Falta el 2.º PIN de AMR en su dispositivo.'
          : 'Este gasto lo aprueban ABB, JLBB o FJBB con su PIN.',
      });
      continue;
    }

    let r;
    if (accion === 'firmar_admin') {
      r = await firmarAdminAmrUno(supabase, gasto, aprobador);
    } else if (accion === 'firmar_amr') {
      r = await sellarUno(supabase, gasto, aprobador, { estadoEsperado: 'pendiente_amr' });
    } else {
      r = await sellarUno(supabase, gasto, aprobador, { estadoEsperado: 'pendiente' });
    }
    resultados.push({ id, accion, ...r });
  }

  const ok = resultados.filter((r) => r.ok).length;
  const fail = resultados.filter((r) => !r.ok);
  const selladosIe = resultados.filter((r) => r.ok && r.paso === 'sellado').length;
  const firmasAdmin = resultados.filter((r) => r.ok && r.paso === 'admin').length;
  return {
    ok: fail.length === 0,
    sellados: selladosIe,
    firmasAdmin,
    procesados: ok,
    fallidos: fail.length,
    resultados,
    aprobadoPor: auth.nombre || aprobador?.nombre,
    error: fail.length ? fail.map((f) => f.error).filter(Boolean).join('; ') : null,
  };
}

/**
 * Rechaza un gasto pendiente / pendiente_amr. Mismas reglas de quién puede actuar.
 * @param {{ pin?: string }} opts
 */
export async function rechazarGastoEvidencia(supabase, gastoId, actor, motivo = '', opts = {}) {
  if (!puedeVerBandejaAprobacionGastos(actor)) {
    return { ok: false, error: 'Sin permiso para rechazar gastos.' };
  }

  const auth = await autenticarPinPropioSesion(supabase, opts.pin, actor);
  if (!auth.ok) return { ok: false, error: auth.error || 'PIN incorrecto.' };

  const aprobador = auth.user || actor;

  let gasto = null;
  if (!supabase || String(gastoId).startsWith('local-')) {
    gasto = leerLocalGastos().find((g) => String(g.id) === String(gastoId));
  } else {
    const { data } = await supabase.from('gastos_evidencia').select('*').eq('id', gastoId).maybeSingle();
    gasto = data;
  }
  if (!gasto) return { ok: false, error: 'Gasto no encontrado.' };
  if (!puedeAprobarGastoEvidencia(aprobador, gasto)) {
    return {
      ok: false,
      error: 'No te corresponde rechazar este gasto en su estado actual.',
    };
  }

  const estadoAntes = gasto.estado;
  const patch = {
    estado: 'rechazado',
    motivo_rechazo: String(motivo || '').trim() || 'Rechazado',
    rechazado_por: aprobador?.nombre || auth.nombre || '—',
    rechazado_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (!supabase || String(gastoId).startsWith('local-')) {
    const lista = leerLocalGastos().map((g) => (String(g.id) === String(gastoId) ? { ...g, ...patch } : g));
    guardarLocalGastos(lista);
    return { ok: true };
  }

  const { error } = await supabase
    .from('gastos_evidencia')
    .update(patch)
    .eq('id', gastoId)
    .eq('estado', estadoAntes);
  if (error) return { ok: false, error: error.message };

  await marcarNotificacionAtendida(supabase, 'gastos_evidencia', gastoId, patch.rechazado_por);
  return { ok: true };
}

export function totalPendienteGastos(filas) {
  return round2(
    (filas || [])
      .filter((g) => gastoPendienteDeAprobacion(g))
      .reduce((a, g) => a + (Number(g.monto) || 0), 0),
  );
}
