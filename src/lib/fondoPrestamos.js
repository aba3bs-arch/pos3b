import { esAndresMarrero, normalizarRol } from './roles.js';
import { esAbb, esFjbb, nombreCoincidePatrones } from './contabilidadConstants.js';
import { crearNotificacion, marcarNotificacionAtendida, TIPOS_NOTIF } from './contabilidadNotificaciones.js';

/** Esperando visto bueno del gerente o del administrador principal. */
export const ESTADO_VISTO_BUENO = 'pendiente_visto_bueno';
/** Visto bueno dado. Esperando a ABB o FJBB. */
export const ESTADO_ABB_FJBB = 'pendiente_abb_fjbb';

export const ESTADOS_PRESTAMO_EMPLEADO_LISTA = [
  'pendiente_admin',
  'pendiente_socio',
  ESTADO_VISTO_BUENO,
  ESTADO_ABB_FJBB,
  'activo',
  'liquidado',
];

const PATRONES_ABB = ['abb', 'antonio'];
const PATRONES_FJBB = ['fjbb', 'fbbb', 'francisco'];
const PATRONES_JLBB = ['jlbb', 'jose luis', 'josé luis'];

export function esPrestamoFondo(p) {
  if (!p) return false;
  if (p.estado === ESTADO_VISTO_BUENO || p.estado === ESTADO_ABB_FJBB) return true;
  return p.omitir_corte === true && p.estado !== 'pendiente_admin';
}

/** Gerente, Andrés Marrero o el administrador principal. */
export function puedeDarVistoBuenoPrestamo(user) {
  if (!user) return false;
  if (user.es_admin_principal === true) return true;
  if (esAndresMarrero(user)) return true;
  return normalizarRol(user.rol) === 'Gerente';
}

/** ABB o FJBB autorizan. Andrés y el administrador principal también, para no quedar bloqueados. */
export function puedeAutorizarPrestamoAbbFjbb(user) {
  if (!user) return false;
  if (user.es_admin_principal === true) return true;
  if (esAndresMarrero(user)) return true;
  const nombre = user.nombre || user.name || '';
  return esAbb(nombre) || esFjbb(nombre);
}

export function esJlbb(nombre) {
  return nombreCoincidePatrones(nombre, PATRONES_JLBB);
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Saldo del fondo: lo que volvió por nómina menos lo desembolsado.
 * Si aún no hay movimientos, se calcula con los préstamos activos y liquidados.
 */
export function resumenFondoPrestamos(movimientos, prestamos) {
  const movs = Array.isArray(movimientos) ? movimientos : [];
  const lista = (prestamos || []).filter((p) => p && p.estado !== 'rechazado' && p.estado !== 'cancelado');
  let desembolsado = 0;
  let reingresado = 0;
  if (movs.length) {
    for (const m of movs) {
      const monto = Number(m.monto) || 0;
      if (m.tipo === 'desembolso') desembolsado += monto;
      if (m.tipo === 'reingreso_nomina') reingresado += monto;
    }
  } else {
    for (const p of lista) {
      if (p.estado === 'activo' || p.estado === 'liquidado') {
        desembolsado += Number(p.monto_original) || 0;
        reingresado += Number(p.abono) || 0;
      }
    }
  }
  const porRecuperar = lista
    .filter((p) => p.estado === 'activo')
    .reduce((s, p) => s + (Number(p.saldo) || 0), 0);
  return {
    desembolsado: round2(desembolsado),
    reingresado: round2(reingresado),
    saldo: round2(reingresado - desembolsado),
    porRecuperar: round2(porRecuperar),
  };
}

async function idsUsuarios(supabase, patrones) {
  if (!supabase) return [];
  const { data, error } = await supabase.from('usuarios').select('id,nombre,activo,es_admin_principal').limit(800);
  if (error || !data) return [];
  return data
    .filter((u) => u && u.es_admin_principal !== true && u.activo !== false && nombreCoincidePatrones(u.nombre, patrones))
    .map((u) => String(u.id));
}

export async function registrarMovimientoFondo(supabase, row) {
  if (!supabase || !(Number(row?.monto) > 0)) return { ok: true };
  const payload = {
    prestamo_id: row.prestamoId || row.prestamo_id || null,
    tipo: row.tipo,
    monto: round2(row.monto),
    nombre_empleado: row.nombreEmpleado || row.nombre_empleado || null,
    notas: row.notas || null,
    created_by: row.createdBy || row.created_by || null,
  };
  const { error } = await supabase.from('fondo_prestamos_mov').insert([payload]);
  if (error) {
    const msg = String(error.message || '').toLowerCase();
    if (error.code === '42P01' || msg.includes('fondo_prestamos_mov') || msg.includes('schema cache')) {
      return { ok: true, aviso: 'Falta la tabla fondo_prestamos_mov. Ejecuta supabase/fix_fondo_prestamos.sql.' };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function listarMovimientosFondo(supabase) {
  if (!supabase) return { data: [], error: null };
  const { data, error } = await supabase
    .from('fondo_prestamos_mov')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(400);
  if (error) {
    const msg = String(error.message || '').toLowerCase();
    if (error.code === '42P01' || msg.includes('fondo_prestamos_mov') || msg.includes('schema cache')) {
      return { data: [], error: null, aviso: 'Ejecuta supabase/fix_fondo_prestamos.sql para guardar el reingreso de nómina.' };
    }
    return { data: [], error: error.message };
  }
  return { data: data || [], error: null };
}

async function actualizarPrestamo(supabase, id, patch) {
  let { data, error } = await supabase.from('prestamos').update(patch).eq('id', id).select('*').single();
  if (error && /omitir_corte|schema cache|column/i.test(String(error.message || ''))) {
    const { omitir_corte: _o, ...sin } = patch;
    ({ data, error } = await supabase.from('prestamos').update(sin).eq('id', id).select('*').single());
  }
  return { data, error };
}

export async function darVistoBuenoPrestamo(supabase, prestamoId, { user, nombre } = {}) {
  if (!puedeDarVistoBuenoPrestamo(user)) {
    return { ok: false, error: 'El visto bueno lo da el gerente o el administrador principal.' };
  }
  if (!supabase || !prestamoId) return { ok: false, error: 'Préstamo inválido.' };
  const { data: p, error: e0 } = await supabase.from('prestamos').select('*').eq('id', prestamoId).single();
  if (e0 || !p) return { ok: false, error: 'Préstamo no encontrado.' };
  if (p.estado !== ESTADO_VISTO_BUENO && p.estado !== 'pendiente_admin') {
    return { ok: false, error: 'Este préstamo no está esperando visto bueno.' };
  }
  const quien = nombre || user?.nombre || 'Gerente';
  const { data, error } = await actualizarPrestamo(supabase, prestamoId, {
    estado: ESTADO_ABB_FJBB,
    aprobado_admin_por: quien,
    aprobado_admin_at: new Date().toISOString(),
    omitir_corte: true,
    cargado_corte: false,
  });
  if (error) return { ok: false, error: error.message };
  await marcarNotificacionAtendida(supabase, 'prestamos', prestamoId, quien);
  const monto = Number(p.monto_original) || 0;
  const usuarioIds = await idsUsuarios(supabase, [...PATRONES_ABB, ...PATRONES_FJBB]);
  await crearNotificacion(supabase, {
    sucursal_id: p.sucursal_id,
    tipo: TIPOS_NOTIF.PRESTAMO_ABB_FJBB,
    ref_tabla: 'prestamos',
    ref_id: p.id,
    titulo: `Préstamo para autorizar · ${p.nombre_empleado}`,
    mensaje: `$${monto.toFixed(2)} · visto bueno de ${quien}. Falta autorización de ABB o FJBB. No va a corte.`,
  }, { usuarioIds });
  return {
    ok: true,
    prestamo: data,
    mensaje: 'Visto bueno registrado. Se avisó a ABB y FJBB para que autoricen el préstamo.',
  };
}

export async function autorizarPrestamoAbbFjbb(supabase, prestamoId, { user, nombre } = {}) {
  if (!puedeAutorizarPrestamoAbbFjbb(user)) {
    return { ok: false, error: 'La autorización la dan ABB o FJBB.' };
  }
  if (!supabase || !prestamoId) return { ok: false, error: 'Préstamo inválido.' };
  const { data: p, error: e0 } = await supabase.from('prestamos').select('*').eq('id', prestamoId).single();
  if (e0 || !p) return { ok: false, error: 'Préstamo no encontrado.' };
  if (p.estado !== ESTADO_ABB_FJBB && p.estado !== 'pendiente_socio') {
    return { ok: false, error: 'Este préstamo no está esperando a ABB o FJBB.' };
  }
  const quien = nombre || user?.nombre || 'ABB';
  const { data, error } = await actualizarPrestamo(supabase, prestamoId, {
    estado: 'activo',
    aprobado_socio_por: quien,
    aprobado_socio_at: new Date().toISOString(),
    omitir_corte: true,
    cargado_corte: false,
  });
  if (error) return { ok: false, error: error.message };
  await marcarNotificacionAtendida(supabase, 'prestamos', prestamoId, quien);
  const monto = Number(p.monto_original) || 0;
  await registrarMovimientoFondo(supabase, {
    prestamoId: p.id,
    tipo: 'desembolso',
    monto,
    nombreEmpleado: p.nombre_empleado,
    notas: `Autorizado por ${quien}`,
    createdBy: quien,
  });
  const usuarioIds = await idsUsuarios(supabase, PATRONES_JLBB);
  await crearNotificacion(supabase, {
    sucursal_id: p.sucursal_id,
    tipo: TIPOS_NOTIF.PRESTAMO_TESORERO,
    ref_tabla: 'prestamos',
    ref_id: p.id,
    titulo: `Fondo de préstamos · ${p.nombre_empleado}`,
    mensaje: `$${monto.toFixed(2)} autorizado por ${quien}. JLBB: quedó en Tesorería → Fondo de préstamos. El descuento de nómina reingresa a este fondo.`,
  }, { usuarioIds });
  return {
    ok: true,
    prestamo: data,
    mensaje: 'Préstamo autorizado. Se avisó a JLBB. Quedó en el fondo de préstamos y se descuenta en nómina. No va a corte ni a contabilidad.',
  };
}

export async function registrarReingresoNomina(supabase, { prestamo, monto, createdBy } = {}) {
  return registrarMovimientoFondo(supabase, {
    prestamoId: prestamo?.id,
    tipo: 'reingreso_nomina',
    monto,
    nombreEmpleado: prestamo?.nombre_empleado,
    notas: 'Descuento de nómina',
    createdBy: createdBy || 'Nómina',
  });
}
