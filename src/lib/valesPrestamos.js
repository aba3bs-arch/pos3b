import { normalizarRol } from './roles.js';
import { buscarUsuarioPorPinYSucursal } from './usuariosAuth.js';
import { beneficiarioValePermitido, valeRequiereAutorizacionAdmin } from './contabilidadConstants.js';

export function faltaTablaVales(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return error?.code === '42P01' || msg.includes('vales') || (msg.includes('schema cache') && msg.includes('vales'));
}

export function faltaTablaPrestamos(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return error?.code === '42P01' || msg.includes('prestamos') || (msg.includes('schema cache') && msg.includes('prestamos'));
}

export const AVISO_FALTA_CONTABILIDAD =
  'Faltan tablas de contabilidad. Ejecuta supabase/fix_contabilidad.sql en Supabase.';

export async function verificarPinAdministrador(supabase, pin, sucursal) {
  const { user, error } = await buscarUsuarioPorPinYSucursal(supabase, pin, sucursal);
  if (error || !user) return { ok: false, error: 'PIN incorrecto.' };
  if (normalizarRol(user.rol) !== 'Administrador') return { ok: false, error: 'Solo un administrador puede autorizar.' };
  return { ok: true, nombre: user.nombre };
}

let folioValeLocal = 0;

export async function siguienteFolioVale(supabase, sucursal) {
  if (!supabase) {
    folioValeLocal += 1;
    return `VAL-${String(folioValeLocal).padStart(4, '0')}`;
  }
  const { count } = await supabase.from('vales').select('id', { count: 'exact', head: true }).eq('sucursal_id', sucursal || 'MAIN');
  const n = (Number(count) || 0) + 1;
  return `VAL-${String(n).padStart(4, '0')}`;
}

export async function listarVales(supabase, opts = {}) {
  if (!supabase) return { data: [], error: null };
  const { sucursal, area, tipo, desde, hasta, limit = 200 } = opts;
  let q = supabase.from('vales').select('*').order('created_at', { ascending: false }).limit(limit);
  if (sucursal) q = q.eq('sucursal_id', sucursal);
  if (area) q = q.eq('area', area);
  if (tipo) q = q.eq('tipo', tipo);
  if (desde) q = q.gte('fecha', desde);
  if (hasta) q = q.lte('fecha', hasta);
  const { data, error } = await q;
  if (error && faltaTablaVales(error)) return { data: [], error: null, aviso: AVISO_FALTA_CONTABILIDAD };
  return { data: data || [], error: error?.message || null };
}

export async function registrarVale(supabase, row, opts = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  if (!beneficiarioValePermitido(row.nombre_empleado, row.area)) {
    return {
      ok: false,
      error: 'Solo vales para Luis Enrique (Abarrotes), Misael y Gonzalo (Virtual).',
    };
  }
  const requiereAuth = valeRequiereAutorizacionAdmin();
  const esAdmin = normalizarRol(opts.rolActor) === 'Administrador';
  let autorizadoPor = null;
  if (requiereAuth && !esAdmin) {
    if (!opts.pinAdmin) {
      return { ok: false, error: 'Después de las 9:00 el vale requiere autorización de un administrador (PIN).' };
    }
    const auth = await verificarPinAdministrador(supabase, opts.pinAdmin, row.sucursal_id);
    if (!auth.ok) return { ok: false, error: auth.error };
    autorizadoPor = auth.nombre;
  } else if (requiereAuth && esAdmin) {
    autorizadoPor = opts.nombreActor || 'Administrador';
  }

  const folio = row.folio || (await siguienteFolioVale(supabase, row.sucursal_id));
  const payload = {
    ...row,
    folio,
    requiere_autorizacion: requiereAuth,
    autorizado_por: autorizadoPor,
    tipo: row.tipo || 'indirecto',
  };

  const { data, error } = await supabase.from('vales').insert([payload]).select('*').single();
  if (error) {
    if (faltaTablaVales(error)) return { ok: false, error: AVISO_FALTA_CONTABILIDAD };
    return { ok: false, error: error.message };
  }
  return { ok: true, vale: data };
}

export async function listarPrestamos(supabase, opts = {}) {
  if (!supabase) return { data: [], error: null };
  const { sucursal, soloActivos, limit = 200 } = opts;
  let q = supabase.from('prestamos').select('*').order('created_at', { ascending: false }).limit(limit);
  if (sucursal) q = q.eq('sucursal_id', sucursal);
  if (soloActivos) q = q.eq('estado', 'activo');
  const { data, error } = await q;
  if (error && faltaTablaPrestamos(error)) return { data: [], error: null, aviso: AVISO_FALTA_CONTABILIDAD };
  return { data: data || [], error: error?.message || null };
}

export async function registrarPrestamo(supabase, row) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  const payload = {
    ...row,
    saldo: Number(row.monto_original) || 0,
    estado: 'activo',
  };
  const { error } = await supabase.from('prestamos').insert([payload]);
  if (error) {
    if (faltaTablaPrestamos(error)) return { ok: false, error: AVISO_FALTA_CONTABILIDAD };
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function abonarPrestamo(supabase, prestamo, montoAbono) {
  if (!supabase || !prestamo?.id) return { ok: false, error: 'Préstamo inválido.' };
  const abono = Math.max(0, Number(montoAbono) || 0);
  const saldoAntes = Number(prestamo.saldo) || 0;
  const saldo = Math.max(0, saldoAntes - abono);
  const { error } = await supabase
    .from('prestamos')
    .update({
      saldo,
      abono: (Number(prestamo.abono) || 0) + abono,
      estado: saldo <= 0 ? 'liquidado' : 'activo',
    })
    .eq('id', prestamo.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, saldo };
}

export async function listarPrestamosInterarea(supabase, opts = {}) {
  if (!supabase) return { data: [], error: null };
  const { sucursal, limit = 100 } = opts;
  let q = supabase.from('prestamos_interarea').select('*').order('created_at', { ascending: false }).limit(limit);
  if (sucursal) q = q.eq('sucursal_id', sucursal);
  const { data, error } = await q;
  if (error?.code === '42P01') return { data: [], aviso: 'Ejecuta fix_contabilidad_ampliacion.sql' };
  return { data: data || [], error: error?.message || null };
}

export async function registrarPrestamoInterarea(supabase, row) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  if (row.origen === row.destino) return { ok: false, error: 'Origen y destino deben ser distintos.' };
  const { error } = await supabase.from('prestamos_interarea').insert([{ ...row, estado: 'activo' }]);
  if (error?.code === '42P01') return { ok: false, error: 'Ejecuta fix_contabilidad_ampliacion.sql' };
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
