import { esAndresMarrero, normalizarRol } from './roles.js';
import { esAbb, esFjbb, nombreCoincidePatrones } from './contabilidadConstants.js';
import { crearNotificacion, marcarNotificacionAtendida, TIPOS_NOTIF } from './contabilidadNotificaciones.js';

/** Esperando visto bueno del gerente o del administrador principal. */
export const ESTADO_VISTO_BUENO = 'pendiente_visto_bueno';
/** Visto bueno dado. Esperando a ABB o FJBB. */
export const ESTADO_ABB_FJBB = 'pendiente_abb_fjbb';
/** ABB o FJBB ya autorizaron. JLBB desembolsa desde el capital. */
export const ESTADO_DESEMBOLSO = 'pendiente_desembolso';
export const METODO_PAGO_NOMINA = 'Descuento en nómina';

export const ESTADOS_PRESTAMO_EMPLEADO_LISTA = [
  'pendiente_admin',
  'pendiente_socio',
  ESTADO_VISTO_BUENO,
  ESTADO_ABB_FJBB,
  ESTADO_DESEMBOLSO,
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

/** JLBB desembolsa. Andrés y el administrador principal también pueden. */
export function puedeDesembolsarPrestamo(user) {
  if (!user) return false;
  if (user.es_admin_principal === true) return true;
  if (esAndresMarrero(user)) return true;
  return esJlbb(user.nombre || user.name || '');
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Capital disponible = capital aportado − desembolsos + cuotas que ya reingresaron.
 * El historial viejo de préstamos no entra en esta cuenta.
 */
export function resumenFondoPrestamos(movimientos) {
  const movs = Array.isArray(movimientos) ? movimientos : [];
  let capitalAportado = 0;
  let desembolsado = 0;
  let reingresado = 0;
  for (const m of movs) {
    const monto = Number(m.monto) || 0;
    if (m.tipo === 'capital') capitalAportado += monto;
    if (m.tipo === 'desembolso') desembolsado += monto;
    if (m.tipo === 'reingreso_nomina') reingresado += monto;
  }
  return {
    capitalAportado: round2(capitalAportado),
    desembolsado: round2(desembolsado),
    reingresado: round2(reingresado),
    capital: round2(capitalAportado - desembolsado + reingresado),
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
  let actual = { ...patch };
  let data = null;
  let error = null;
  for (let i = 0; i < 4; i += 1) {
    ({ data, error } = await supabase.from('prestamos').update(actual).eq('id', id).select('*').single());
    if (!error) return { data, error: null };
    const msg = String(error.message || '');
    const col = msg.match(/'([^']+)'/)?.[1];
    if (!col || !(col in actual) || !/schema cache|column/i.test(msg)) break;
    const { [col]: _quitada, ...resto } = actual;
    actual = resto;
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
    estado: ESTADO_DESEMBOLSO,
    aprobado_socio_por: quien,
    aprobado_socio_at: new Date().toISOString(),
    omitir_corte: true,
    cargado_corte: false,
  });
  if (error) return { ok: false, error: error.message };
  await marcarNotificacionAtendida(supabase, 'prestamos', prestamoId, quien);
  const monto = Number(p.monto_original) || 0;
  const usuarioIds = await idsUsuarios(supabase, PATRONES_JLBB);
  await crearNotificacion(supabase, {
    sucursal_id: p.sucursal_id,
    tipo: TIPOS_NOTIF.PRESTAMO_TESORERO,
    ref_tabla: 'prestamos',
    ref_id: p.id,
    titulo: `Desembolso de préstamo · ${p.nombre_empleado}`,
    mensaje: `$${monto.toFixed(2)} · ${p.num_cuotas || ''} cuotas · descuento en nómina. Autorizó ${quien}. JLBB: desembolsar desde el capital del fondo.`,
  }, { usuarioIds });
  return {
    ok: true,
    prestamo: data,
    mensaje: 'Autorizado. Se avisó a JLBB para el desembolso. El dinero sale del capital del fondo, no del corte.',
  };
}

export async function aportarCapitalFondo(supabase, monto, { user, nombre } = {}) {
  if (!puedeDesembolsarPrestamo(user)) {
    return { ok: false, error: 'El capital del fondo lo registra JLBB.' };
  }
  const cantidad = round2(monto);
  if (!(cantidad > 0)) return { ok: false, error: 'Indica el capital a registrar.' };
  const quien = nombre || user?.nombre || 'JLBB';
  return registrarMovimientoFondo(supabase, {
    tipo: 'capital',
    monto: cantidad,
    notas: 'Capital del fondo',
    createdBy: quien,
  });
}

export async function desembolsarPrestamo(supabase, prestamoId, { user, nombre } = {}) {
  if (!puedeDesembolsarPrestamo(user)) {
    return { ok: false, error: 'El desembolso lo hace JLBB.' };
  }
  if (!supabase || !prestamoId) return { ok: false, error: 'Préstamo inválido.' };
  const { data: p, error: e0 } = await supabase.from('prestamos').select('*').eq('id', prestamoId).single();
  if (e0 || !p) return { ok: false, error: 'Préstamo no encontrado.' };
  if (p.estado !== ESTADO_DESEMBOLSO) {
    return { ok: false, error: 'Este préstamo no está listo para desembolso.' };
  }
  const monto = Number(p.monto_original) || 0;
  if (!(monto > 0)) return { ok: false, error: 'El monto del préstamo no es válido.' };
  const movs = await listarMovimientosFondo(supabase);
  if (movs.error) return { ok: false, error: movs.error };
  const capital = resumenFondoPrestamos(movs.data).capital;
  if (capital + 0.001 < monto) {
    return {
      ok: false,
      error: `El capital del fondo ($${capital.toFixed(2)}) no alcanza para desembolsar $${monto.toFixed(2)}.`,
    };
  }
  const quien = nombre || user?.nombre || 'JLBB';
  const mov = await registrarMovimientoFondo(supabase, {
    prestamoId: p.id,
    tipo: 'desembolso',
    monto,
    nombreEmpleado: p.nombre_empleado,
    notas: `${METODO_PAGO_NOMINA} · ${p.num_cuotas || ''} cuotas`,
    createdBy: quien,
  });
  if (!mov.ok) return mov;
  const { data, error } = await actualizarPrestamo(supabase, prestamoId, {
    estado: 'activo',
    omitir_corte: true,
    cargado_corte: false,
    desembolsado_por: quien,
    desembolsado_at: new Date().toISOString(),
  });
  if (error) return { ok: false, error: error.message };
  await marcarNotificacionAtendida(supabase, 'prestamos', prestamoId, quien);
  return {
    ok: true,
    prestamo: data,
    capital: round2(capital - monto),
    mensaje: `Desembolso de $${monto.toFixed(2)} a ${p.nombre_empleado}. Salió del capital del fondo. Las cuotas de nómina regresan a ese capital.`,
  };
}

export async function registrarReingresoNomina(supabase, { prestamo, monto, createdBy, notas } = {}) {
  if (!supabase || !prestamo?.id || !(Number(monto) > 0)) return { ok: true };
  const { data, error } = await supabase
    .from('fondo_prestamos_mov')
    .select('id')
    .eq('prestamo_id', prestamo.id)
    .eq('tipo', 'desembolso')
    .limit(1);
  if (error) {
    const msg = String(error.message || '').toLowerCase();
    if (error.code === '42P01' || msg.includes('fondo_prestamos_mov') || msg.includes('schema cache')) return { ok: true };
    return { ok: false, error: error.message };
  }
  if (!data?.length) return { ok: true };
  return registrarMovimientoFondo(supabase, {
    prestamoId: prestamo.id,
    tipo: 'reingreso_nomina',
    monto,
    nombreEmpleado: prestamo.nombre_empleado,
    notas: notas || 'Cuota de nómina. Resta el saldo del préstamo y suma al capital.',
    createdBy: createdBy || 'Nómina',
  });
}

export function etiquetaMovimientoFondo(tipo) {
  if (tipo === 'capital') return 'Capital';
  if (tipo === 'desembolso') return 'Desembolso';
  if (tipo === 'reingreso_nomina') return 'Reingreso de nómina';
  return tipo || 'Registro';
}

async function leerMovimientoFondo(supabase, id) {
  const { data, error } = await supabase.from('fondo_prestamos_mov').select('*').eq('id', id).maybeSingle();
  if (error) return { data: null, error };
  return { data, error: null };
}

async function ajustarSaldoPorReingreso(supabase, prestamoId, delta) {
  if (!prestamoId || !delta) return;
  const { data: p } = await supabase.from('prestamos').select('id,saldo,abono').eq('id', prestamoId).maybeSingle();
  if (!p) return;
  const saldo = Math.max(0, round2((Number(p.saldo) || 0) + delta));
  const abono = Math.max(0, round2((Number(p.abono) || 0) - delta));
  await actualizarPrestamo(supabase, prestamoId, {
    saldo,
    abono,
    estado: saldo <= 0.001 ? 'liquidado' : 'activo',
  });
}

export async function editarMovimientoFondo(supabase, id, patch = {}, { user } = {}) {
  if (!puedeDesembolsarPrestamo(user)) return { ok: false, error: 'JLBB puede editar estos registros.' };
  const actual = await leerMovimientoFondo(supabase, id);
  if (actual.error) return { ok: false, error: actual.error.message };
  if (!actual.data) return { ok: false, error: 'Registro no encontrado.' };
  const antes = Number(actual.data.monto) || 0;
  const monto = patch.monto != null ? round2(patch.monto) : antes;
  if (!(monto > 0)) return { ok: false, error: 'El monto debe ser mayor a cero.' };
  const upd = {
    monto,
    notas: patch.notas != null ? patch.notas : actual.data.notas,
    nombre_empleado: patch.nombreEmpleado != null ? patch.nombreEmpleado : actual.data.nombre_empleado,
  };
  const { error } = await supabase.from('fondo_prestamos_mov').update(upd).eq('id', id);
  if (error) return { ok: false, error: error.message };
  if (actual.data.tipo === 'reingreso_nomina') {
    await ajustarSaldoPorReingreso(supabase, actual.data.prestamo_id, round2(antes - monto));
  }
  return { ok: true };
}

export async function eliminarMovimientoFondo(supabase, id, { user } = {}) {
  if (!puedeDesembolsarPrestamo(user)) return { ok: false, error: 'JLBB puede eliminar estos registros.' };
  const actual = await leerMovimientoFondo(supabase, id);
  if (actual.error) return { ok: false, error: actual.error.message };
  if (!actual.data) return { ok: false, error: 'Registro no encontrado.' };
  const mov = actual.data;
  const { error } = await supabase.from('fondo_prestamos_mov').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  if (mov.tipo === 'reingreso_nomina') {
    await ajustarSaldoPorReingreso(supabase, mov.prestamo_id, Number(mov.monto) || 0);
  }
  if (mov.tipo === 'desembolso' && mov.prestamo_id) {
    await actualizarPrestamo(supabase, mov.prestamo_id, {
      estado: ESTADO_DESEMBOLSO,
      desembolsado_por: null,
      desembolsado_at: null,
    });
  }
  return { ok: true };
}

export async function editarPrestamoEnFondo(supabase, prestamoId, { saldo, numCuotas } = {}, { user } = {}) {
  if (!puedeDesembolsarPrestamo(user)) return { ok: false, error: 'JLBB puede editar estos préstamos.' };
  const saldoN = round2(saldo);
  if (saldoN < 0) return { ok: false, error: 'El saldo no puede ser negativo.' };
  const patch = {
    saldo: saldoN,
    estado: saldoN <= 0.001 ? 'liquidado' : 'activo',
  };
  const cuotas = Math.floor(Number(numCuotas));
  if (cuotas > 0) patch.num_cuotas = cuotas;
  const { error } = await actualizarPrestamo(supabase, prestamoId, patch);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function quitarPrestamoDelFondo(supabase, prestamoId, { user } = {}) {
  if (!puedeDesembolsarPrestamo(user)) return { ok: false, error: 'JLBB puede eliminar estos préstamos.' };
  if (!prestamoId) return { ok: false, error: 'Préstamo inválido.' };
  const { error: eMov } = await supabase.from('fondo_prestamos_mov').delete().eq('prestamo_id', prestamoId);
  if (eMov) {
    const msg = String(eMov.message || '').toLowerCase();
    if (!(eMov.code === '42P01' || msg.includes('fondo_prestamos_mov'))) return { ok: false, error: eMov.message };
  }
  const { error } = await actualizarPrestamo(supabase, prestamoId, { estado: 'cancelado', saldo: 0 });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
