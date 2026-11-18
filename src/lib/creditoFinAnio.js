/**
 * Crédito de fin de año dejado en sucursales.
 * Tablas propias. No escribe ventas, CxC de ruta, recolección ni stock del camión.
 */

export const TIPO_DEJAR = 'dejar';
export const TIPO_RETIRAR = 'retirar';
export const ESTADO_ABIERTA = 'abierta';
export const ESTADO_CERRADA = 'cerrada';

export const AVISO_FALTA_CREDITO_FIN_ANIO =
  'Faltan las tablas de crédito de fin de año. En Supabase → SQL Editor ejecuta supabase/fix_credito_fin_anio.sql.';

const TABLA_CUENTAS = 'credito_fin_anio_cuentas';
const TABLA_MOV = 'credito_fin_anio_mov';
const TABLA_ABONOS = 'credito_fin_anio_abonos';

export function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function round3(n) {
  return Math.round((Number(n) || 0) * 1000) / 1000;
}

export function importeLinea(cantidad, precio) {
  return round2((Number(cantidad) || 0) * (Number(precio) || 0));
}

export function claveProducto(mov) {
  const cod = String(mov?.codigo || '').trim().toUpperCase();
  const nom = String(mov?.nombre || '').trim().toLowerCase();
  return `${cod}|${nom}`;
}

export function anioFinAnio(ahora = new Date()) {
  const y = ahora.toLocaleString('en-US', { timeZone: 'America/Phoenix', year: 'numeric' });
  const n = Number(y);
  return Number.isFinite(n) ? n : ahora.getFullYear();
}

export function nombreCuentaFinAnio(ahora = new Date()) {
  return `Fin de año ${anioFinAnio(ahora)}`;
}

function vivo(row) {
  return row && !row.archived_at;
}

export function inventarioDeMovimientos(movimientos) {
  const map = new Map();
  for (const m of movimientos || []) {
    if (!vivo(m)) continue;
    const k = claveProducto(m);
    const prev = map.get(k) || {
      clave: k,
      codigo: String(m.codigo || '').trim(),
      nombre: String(m.nombre || '').trim(),
      cantidad: 0,
      valor: 0,
    };
    const signo = m.tipo === TIPO_RETIRAR ? -1 : 1;
    prev.cantidad = round3(prev.cantidad + signo * (Number(m.cantidad) || 0));
    prev.valor = round2(prev.valor + signo * (Number(m.importe) || 0));
    if (!prev.codigo && m.codigo) prev.codigo = String(m.codigo).trim();
    map.set(k, prev);
  }
  return [...map.values()]
    .filter((l) => Math.abs(l.cantidad) > 0.0001 || Math.abs(l.valor) > 0.001)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

export function resumenCuenta(movimientos, abonos) {
  let dejado = 0;
  let retirado = 0;
  for (const m of movimientos || []) {
    if (!vivo(m)) continue;
    const imp = Number(m.importe) || 0;
    if (m.tipo === TIPO_RETIRAR) retirado += imp;
    else dejado += imp;
  }
  let abonado = 0;
  for (const a of abonos || []) {
    if (!vivo(a)) continue;
    abonado += Number(a.monto) || 0;
  }
  const saldoMercancia = round2(dejado - retirado);
  abonado = round2(abonado);
  return {
    dejado: round2(dejado),
    retirado: round2(retirado),
    saldoMercancia,
    abonado,
    saldo: round2(saldoMercancia - abonado),
  };
}

export function resumenPorSucursal(cuentas, movimientos, abonos) {
  const porCuentaMov = new Map();
  const porCuentaAbono = new Map();
  for (const m of movimientos || []) {
    if (!vivo(m)) continue;
    const id = String(m.cuenta_id || '');
    if (!porCuentaMov.has(id)) porCuentaMov.set(id, []);
    porCuentaMov.get(id).push(m);
  }
  for (const a of abonos || []) {
    if (!vivo(a)) continue;
    const id = String(a.cuenta_id || '');
    if (!porCuentaAbono.has(id)) porCuentaAbono.set(id, []);
    porCuentaAbono.get(id).push(a);
  }
  const out = new Map();
  for (const c of cuentas || []) {
    if (!vivo(c)) continue;
    const sid = String(c.sucursal_id || '').toUpperCase();
    const prev = out.get(sid) || {
      sucursalId: sid,
      cuentas: 0,
      abiertas: 0,
      saldoMercancia: 0,
      abonado: 0,
      saldo: 0,
    };
    const r = resumenCuenta(porCuentaMov.get(String(c.id)) || [], porCuentaAbono.get(String(c.id)) || []);
    prev.cuentas += 1;
    if (c.estado !== ESTADO_CERRADA) prev.abiertas += 1;
    prev.saldoMercancia = round2(prev.saldoMercancia + r.saldoMercancia);
    prev.abonado = round2(prev.abonado + r.abonado);
    prev.saldo = round2(prev.saldo + r.saldo);
    out.set(sid, prev);
  }
  return out;
}

export function validarDejar({ nombre, cantidad, precio }) {
  if (!String(nombre || '').trim()) return 'Escribe el producto.';
  if (!(Number(cantidad) > 0)) return 'La cantidad debe ser mayor a cero.';
  if (Number(precio) < 0 || !Number.isFinite(Number(precio))) return 'El precio no puede ser negativo.';
  return '';
}

export function validarRetiro({ cantidad, disponible }) {
  if (!(Number(cantidad) > 0)) return 'La cantidad debe ser mayor a cero.';
  if (round3(Number(cantidad) - Number(disponible)) > 0) return 'No hay tanta mercancía en esta cuenta.';
  return '';
}

export function validarAbono(monto) {
  if (!(Number(monto) > 0)) return 'El abono debe ser mayor a cero.';
  return '';
}

export function validarCuenta({ sucursalId, nombre }) {
  if (!String(sucursalId || '').trim()) return 'Elige la sucursal.';
  if (!String(nombre || '').trim()) return 'Escribe el nombre de la cuenta.';
  return '';
}

function faltaTabla(error) {
  const msg = String(error?.message || error || '');
  return /schema cache|does not exist|could not find the table|relation .*credito_fin_anio/i.test(msg);
}

function nombreDe(user, nombre) {
  return String(nombre || user?.nombre || user?.email || 'Sistema').trim() || 'Sistema';
}

async function listarTabla(supabase, tabla) {
  if (!supabase) return { data: [], error: 'Sin conexión.' };
  const { data, error } = await supabase
    .from(tabla)
    .select('*')
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(2000);
  if (error && faltaTabla(error)) return { data: [], aviso: AVISO_FALTA_CREDITO_FIN_ANIO, faltaTabla: true };
  if (error) return { data: [], error: error.message || 'No se pudo leer el registro.' };
  return { data: data || [] };
}

export function listarCuentasFinAnio(supabase) {
  return listarTabla(supabase, TABLA_CUENTAS);
}

export function listarMovimientosFinAnio(supabase) {
  return listarTabla(supabase, TABLA_MOV);
}

export function listarAbonosFinAnio(supabase) {
  return listarTabla(supabase, TABLA_ABONOS);
}

export async function crearCuentaFinAnio(supabase, { sucursalId, nombre, notas, user }) {
  const errorVal = validarCuenta({ sucursalId, nombre });
  if (errorVal) return { ok: false, error: errorVal };
  const { data, error } = await supabase
    .from(TABLA_CUENTAS)
    .insert({
      sucursal_id: String(sucursalId).trim().toUpperCase(),
      nombre: String(nombre).trim(),
      notas: String(notas || '').trim() || null,
      estado: ESTADO_ABIERTA,
      created_by: nombreDe(user),
    })
    .select('*')
    .single();
  if (error && faltaTabla(error)) return { ok: false, error: AVISO_FALTA_CREDITO_FIN_ANIO };
  if (error) return { ok: false, error: error.message || 'No se pudo abrir la cuenta.' };
  return { ok: true, data };
}

export async function editarCuentaFinAnio(supabase, id, { nombre, notas, estado }) {
  if (!id) return { ok: false, error: 'Falta la cuenta.' };
  const patch = {};
  if (nombre != null) {
    if (!String(nombre).trim()) return { ok: false, error: 'Escribe el nombre de la cuenta.' };
    patch.nombre = String(nombre).trim();
  }
  if (notas != null) patch.notas = String(notas).trim() || null;
  if (estado != null) patch.estado = estado === ESTADO_CERRADA ? ESTADO_CERRADA : ESTADO_ABIERTA;
  const { error } = await supabase.from(TABLA_CUENTAS).update(patch).eq('id', id);
  if (error) return { ok: false, error: error.message || 'No se pudo guardar la cuenta.' };
  return { ok: true };
}

export async function archivarCuentaFinAnio(supabase, id) {
  if (!id) return { ok: false, error: 'Falta la cuenta.' };
  const { error } = await supabase.from(TABLA_CUENTAS).update({ archived_at: new Date().toISOString() }).eq('id', id);
  if (error) return { ok: false, error: error.message || 'No se pudo quitar la cuenta.' };
  return { ok: true };
}

export async function dejarMercanciaFinAnio(supabase, cuentaId, linea, user) {
  const errorVal = validarDejar(linea || {});
  if (errorVal) return { ok: false, error: errorVal };
  if (!cuentaId) return { ok: false, error: 'Abre una cuenta primero.' };
  const cantidad = round3(linea.cantidad);
  const precio = round2(linea.precio);
  const { error } = await supabase.from(TABLA_MOV).insert({
    cuenta_id: cuentaId,
    tipo: TIPO_DEJAR,
    codigo: String(linea.codigo || '').trim() || null,
    nombre: String(linea.nombre).trim(),
    cantidad,
    precio,
    importe: importeLinea(cantidad, precio),
    notas: String(linea.notas || '').trim() || null,
    created_by: nombreDe(user),
  });
  if (error && faltaTabla(error)) return { ok: false, error: AVISO_FALTA_CREDITO_FIN_ANIO };
  if (error) return { ok: false, error: error.message || 'No se pudo dejar la mercancía.' };
  return { ok: true };
}

export async function retirarMercanciaFinAnio(supabase, cuentaId, linea, disponible, user) {
  const errorVal = validarRetiro({ cantidad: linea?.cantidad, disponible });
  if (errorVal) return { ok: false, error: errorVal };
  if (!cuentaId) return { ok: false, error: 'Abre una cuenta primero.' };
  if (Number(linea?.precio) < 0) return { ok: false, error: 'El precio no puede ser negativo.' };
  const cantidad = round3(linea.cantidad);
  const precio = round2(linea.precio);
  const { error } = await supabase.from(TABLA_MOV).insert({
    cuenta_id: cuentaId,
    tipo: TIPO_RETIRAR,
    codigo: String(linea.codigo || '').trim() || null,
    nombre: String(linea.nombre || '').trim() || 'Producto',
    cantidad,
    precio,
    importe: importeLinea(cantidad, precio),
    notas: String(linea.notas || '').trim() || null,
    created_by: nombreDe(user),
  });
  if (error) return { ok: false, error: error.message || 'No se pudo retirar la mercancía.' };
  return { ok: true };
}

export async function editarMovimientoFinAnio(supabase, id, linea) {
  if (!id) return { ok: false, error: 'Falta el movimiento.' };
  const errorVal = validarDejar(linea || {});
  if (errorVal) return { ok: false, error: errorVal };
  const cantidad = round3(linea.cantidad);
  const precio = round2(linea.precio);
  const { error } = await supabase.from(TABLA_MOV).update({
    codigo: String(linea.codigo || '').trim() || null,
    nombre: String(linea.nombre).trim(),
    cantidad,
    precio,
    importe: importeLinea(cantidad, precio),
    notas: String(linea.notas || '').trim() || null,
  }).eq('id', id);
  if (error) return { ok: false, error: error.message || 'No se pudo editar el movimiento.' };
  return { ok: true };
}

export async function archivarMovimientoFinAnio(supabase, id) {
  if (!id) return { ok: false, error: 'Falta el movimiento.' };
  const { error } = await supabase.from(TABLA_MOV).update({ archived_at: new Date().toISOString() }).eq('id', id);
  if (error) return { ok: false, error: error.message || 'No se pudo quitar el movimiento.' };
  return { ok: true };
}

export async function registrarAbonoFinAnio(supabase, cuentaId, { monto, notas }, user) {
  const errorVal = validarAbono(monto);
  if (errorVal) return { ok: false, error: errorVal };
  if (!cuentaId) return { ok: false, error: 'Abre una cuenta primero.' };
  const { error } = await supabase.from(TABLA_ABONOS).insert({
    cuenta_id: cuentaId,
    monto: round2(monto),
    notas: String(notas || '').trim() || null,
    created_by: nombreDe(user),
  });
  if (error && faltaTabla(error)) return { ok: false, error: AVISO_FALTA_CREDITO_FIN_ANIO };
  if (error) return { ok: false, error: error.message || 'No se pudo registrar el abono.' };
  return { ok: true };
}

export async function editarAbonoFinAnio(supabase, id, { monto, notas }) {
  if (!id) return { ok: false, error: 'Falta el abono.' };
  const errorVal = validarAbono(monto);
  if (errorVal) return { ok: false, error: errorVal };
  const { error } = await supabase.from(TABLA_ABONOS).update({
    monto: round2(monto),
    notas: String(notas || '').trim() || null,
  }).eq('id', id);
  if (error) return { ok: false, error: error.message || 'No se pudo editar el abono.' };
  return { ok: true };
}

export async function archivarAbonoFinAnio(supabase, id) {
  if (!id) return { ok: false, error: 'Falta el abono.' };
  const { error } = await supabase.from(TABLA_ABONOS).update({ archived_at: new Date().toISOString() }).eq('id', id);
  if (error) return { ok: false, error: error.message || 'No se pudo quitar el abono.' };
  return { ok: true };
}
