import { normalizarCodigoTienda, etiquetaTienda, listarSucursalesOperativas } from '../constants/sucursales.js';
import { normalizarRol } from './roles.js';
import { enRangoYmd } from './fechas.js';

const TIPOS_TRASPASO = ['Recolección', 'Entrega Crédito'];
const TZ = 'America/Hermosillo';

const SERVICIO_CFE_DEFAULT = {
  clave: 'CFE',
  nombre: 'CFE Luz',
  monto_default: 50,
  tipo: 'Fijo',
  frecuencia: 'Diario',
  obligatorio: true,
  activo: true,
};

/** Nombre de tienda en control_efectivo (Streamlit) desde código POS. */
export function sucursalParaControlEfectivo(codigo) {
  const c = normalizarCodigoTienda(codigo);
  if (!c || c === 'MAIN') return null;
  if (c === 'FUSION') return 'Fusión';
  return c;
}

/** Tiendas operativas para selectores de recolector / liquidación. */
export function listarTiendasEfectivo() {
  return listarSucursalesOperativas()
    .map((codigo) => ({
      codigo,
      nombre: sucursalParaControlEfectivo(codigo),
      etiqueta: etiquetaTienda(codigo),
    }))
    .filter((t) => t.nombre);
}

export function fmtMonto(n) {
  return `$${Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function ahoraIsoNogales() {
  return new Date().toISOString();
}

export function fechaClaveDesdeIso(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ });
  } catch {
    return String(iso).slice(0, 10);
  }
}

export function fmtFechaClave(clave) {
  if (!clave || !/^\d{4}-\d{2}-\d{2}$/.test(clave)) return clave || '—';
  const [y, m, d] = clave.split('-');
  return `${d}/${m}/${y}`;
}

export function fmtFechaHora(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-MX', {
      timeZone: TZ,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function hoyClaveNogales() {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ });
}

/** Día de agrupación: recolección (fecha_hora) o liquidación (fecha_liquidacion). */
export function claveDiaReporte(m, diaDe = 'recoleccion') {
  if (diaDe === 'liquidacion') return fechaClaveDesdeIso(m.fecha_liquidacion || m.fecha_hora);
  return fechaClaveDesdeIso(m.fecha_hora);
}

export function filtrarMovimientosPorFecha(movs, { desde, hasta, diaDe = 'recoleccion' } = {}) {
  if (!desde && !hasta) return movs || [];
  return (movs || []).filter((m) => enRangoYmd(claveDiaReporte(m, diaDe), desde, hasta));
}

/** Liquidaciones selladas de un recolector (filtro por fecha de liquidación). */
export async function listarLiquidacionesRepartidor(supabase, repartidorId, { desde, hasta } = {}) {
  const { data, error } = await supabase
    .from('transito_efectivo')
    .select(
      'id, sucursal_origen, cajero_nombre, monto, fecha_hora, num_traspaso, tipo_movimiento, descripcion_gasto, estatus, fecha_liquidacion, usuario_liquida',
    )
    .eq('repartidor_id', repartidorId)
    .eq('estatus', 'Liquidado')
    .order('fecha_liquidacion', { ascending: false });
  if (error) throw error;
  const rows = data || [];
  return filtrarMovimientosPorFecha(rows, { desde, hasta, diaDe: 'liquidacion' });
}

/** Selección inicial: todo si hay un solo día; si hay varios, ninguno (el usuario elige días). */
export function inicializarSeleccionLiquidacion(movimientos) {
  const init = {};
  const diasUnicos = new Set((movimientos || []).map((m) => fechaClaveDesdeIso(m.fecha_hora)));
  const marcar = diasUnicos.size <= 1;
  for (const m of movimientos || []) {
    init[m.id] = marcar;
  }
  return init;
}

export function normalizarFolio(folio) {
  return String(folio || '')
    .trim()
    .toUpperCase();
}

export function puedeLiquidarRecolecciones(rol) {
  const r = normalizarRol(rol);
  return r === 'Administrador' || r === 'Gerente';
}

export function claveRegistroCobro(clave) {
  return `${clave}-COBRO`;
}

export function claveRegistroPendiente(clave) {
  return `${clave}-PENDIENTE`;
}

function inicioFinPeriodoServicio(frecuencia) {
  const hoy = new Date();
  const hoyClave = hoy.toLocaleDateString('en-CA', { timeZone: TZ });
  if (frecuencia === 'Semanal') {
    const local = new Date(hoy.toLocaleString('en-US', { timeZone: TZ }));
    const day = local.getDay();
    const diff = day === 0 ? 6 : day - 1;
    const lunes = new Date(local);
    lunes.setDate(local.getDate() - diff);
    const domingo = new Date(lunes);
    domingo.setDate(lunes.getDate() + 6);
    const fmt = (d) => d.toLocaleDateString('en-CA', { timeZone: TZ });
    return { inicio: fmt(lunes), fin: fmt(domingo) };
  }
  return { inicio: hoyClave, fin: hoyClave };
}

function isoRangoDia(inicioClave, finClave) {
  return {
    desde: `${inicioClave}T00:00:00-07:00`,
    hasta: `${finClave}T23:59:59-07:00`,
  };
}

export async function listarRepartidores(supabase) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('repartidores')
    .select('id, nombre, pin, activo')
    .eq('activo', true)
    .order('nombre');
  if (error) throw error;
  return data || [];
}

export async function listarRepartidoresTodos(supabase) {
  if (!supabase) return [];
  const { data, error } = await supabase.from('repartidores').select('id, nombre, pin, activo').order('nombre');
  if (error) throw error;
  return data || [];
}

export function slugRepartidorId(nombre) {
  const base = String(nombre || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40);
  return base ? `rep_${base}` : '';
}

export async function crearRepartidor(supabase, { id, nombre, pin }) {
  const rid = String(id || slugRepartidorId(nombre)).trim();
  const nom = String(nombre || '').trim();
  const p = String(pin || '').trim();
  if (!rid) return { ok: false, error: 'ID de recolector inválido.' };
  if (!nom) return { ok: false, error: 'Escribe el nombre.' };
  if (!/^\d{4}$/.test(p)) return { ok: false, error: 'PIN debe ser 4 dígitos.' };
  const { error } = await supabase.from('repartidores').insert({ id: rid, nombre: nom, pin: p, activo: true });
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: rid };
}

export async function actualizarRepartidor(supabase, id, { nombre, pin, activo }) {
  if (!id) return { ok: false, error: 'Recolector no válido.' };
  const patch = {};
  if (nombre != null) patch.nombre = String(nombre).trim();
  if (pin != null) {
    const p = String(pin).trim();
    if (!/^\d{4}$/.test(p)) return { ok: false, error: 'PIN debe ser 4 dígitos.' };
    patch.pin = p;
  }
  if (activo != null) patch.activo = Boolean(activo);
  const { error } = await supabase.from('repartidores').update(patch).eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function eliminarRepartidor(supabase, id) {
  return actualizarRepartidor(supabase, id, { activo: false });
}

/** Elimina el recolector de la base si no tiene movimientos en tránsito. */
export async function eliminarRepartidorPermanente(supabase, id) {
  if (!id) return { ok: false, error: 'Recolector inválido.' };
  const { count, error: cErr } = await supabase
    .from('transito_efectivo')
    .select('id', { count: 'exact', head: true })
    .eq('repartidor_id', id);
  if (cErr) return { ok: false, error: cErr.message };
  if (count > 0) {
    return {
      ok: false,
      error: `No se puede eliminar: tiene ${count} movimiento(s) vinculado(s). Desactívalo en su lugar.`,
    };
  }
  const { error } = await supabase.from('repartidores').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export function pinRepartidorValido(pin, repartidorId, repartidores) {
  const rep = repartidores.find((r) => r.id === repartidorId);
  return Boolean(rep?.pin) && String(pin) === String(rep.pin);
}

function normNombreRepartidor(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Intenta vincular usuario POS con registro en repartidores por nombre. */
export function resolverRepartidorPorNombre(nombre, repartidores = []) {
  const n = normNombreRepartidor(nombre);
  if (!n || !repartidores.length) return null;
  const exact = repartidores.find((r) => normNombreRepartidor(r.nombre) === n);
  if (exact) return exact.id;
  for (const r of repartidores) {
    const rn = normNombreRepartidor(r.nombre);
    if (rn && (n.includes(rn) || rn.includes(n))) return r.id;
  }
  return null;
}

export async function listarServiciosCobro(supabase) {
  if (!supabase) return [SERVICIO_CFE_DEFAULT];
  try {
    const { data, error } = await supabase.from('servicios_cobro').select('*').eq('activo', true).order('nombre');
    if (error) throw error;
    if (data?.length) return data;
  } catch {
    /* tabla opcional */
  }
  return [SERVICIO_CFE_DEFAULT];
}

export async function listarServiciosCobroAdmin(supabase) {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase.from('servicios_cobro').select('*').order('nombre');
    if (error) throw error;
    return data || [];
  } catch {
    return [];
  }
}

export async function crearServicioCobro(supabase, payload) {
  const clave = String(payload.clave || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');
  const nombre = String(payload.nombre || '').trim();
  const monto = Number(payload.monto_default);
  if (!clave) return { ok: false, error: 'Clave requerida (ej. CFE).' };
  if (!nombre) return { ok: false, error: 'Nombre requerido.' };
  if (!(monto > 0)) return { ok: false, error: 'Monto inválido.' };
  const { error } = await supabase.from('servicios_cobro').insert({
    clave,
    nombre,
    monto_default: monto,
    tipo: payload.tipo || 'Fijo',
    frecuencia: payload.frecuencia || 'Diario',
    obligatorio: payload.obligatorio !== false,
    activo: true,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function actualizarServicioCobro(supabase, id, payload) {
  if (!id) return { ok: false, error: 'Servicio inválido.' };
  const patch = {};
  if (payload.nombre != null) patch.nombre = String(payload.nombre).trim();
  if (payload.monto_default != null) {
    const m = Number(payload.monto_default);
    if (!(m > 0)) return { ok: false, error: 'Monto inválido.' };
    patch.monto_default = m;
  }
  if (payload.tipo != null) patch.tipo = payload.tipo;
  if (payload.frecuencia != null) patch.frecuencia = payload.frecuencia;
  if (payload.obligatorio != null) patch.obligatorio = Boolean(payload.obligatorio);
  if (payload.activo != null) patch.activo = Boolean(payload.activo);
  const { error } = await supabase.from('servicios_cobro').update(patch).eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function desactivarServicioCobro(supabase, id) {
  return actualizarServicioCobro(supabase, id, { activo: false });
}

function servicioEnVigencia(srv, fechaClave) {
  const hoy = fechaClave || new Date().toLocaleDateString('en-CA', { timeZone: TZ });
  const ini = srv.vigencia_inicio ? String(srv.vigencia_inicio).slice(0, 10) : null;
  const fin = srv.vigencia_fin ? String(srv.vigencia_fin).slice(0, 10) : null;
  if (ini && hoy < ini) return false;
  if (fin && hoy > fin) return false;
  return srv.activo !== false;
}

export async function consultarRegistrosServicioTienda(supabase, tienda, clave, frecuencia = 'Diario') {
  const { inicio, fin } = inicioFinPeriodoServicio(frecuencia);
  const { desde, hasta } = isoRangoDia(inicio, fin);
  const claves = [
    claveRegistroCobro(clave),
    claveRegistroPendiente(clave),
    `${clave}-FIJO`,
    'CFE-FIJO',
    'CFE-PENDIENTE',
  ];
  const { data, error } = await supabase
    .from('transito_efectivo')
    .select('id, num_traspaso, monto, fecha_hora, estatus, foto_url, cajero_nombre')
    .eq('sucursal_origen', tienda)
    .eq('tipo_movimiento', 'Cobro Servicio')
    .in('num_traspaso', [...new Set(claves)])
    .gte('fecha_hora', desde)
    .lte('fecha_hora', hasta);
  if (error) throw error;
  return data || [];
}

export async function servicioResueltoEnTienda(supabase, tienda, srv) {
  const clave = srv.clave;
  const registros = await consultarRegistrosServicioTienda(supabase, tienda, clave, srv.frecuencia || 'Diario');
  const okClaves = new Set([claveRegistroCobro(clave), `${clave}-FIJO`]);
  const pendClaves = new Set([claveRegistroPendiente(clave)]);
  if (clave === 'CFE') {
    okClaves.add('CFE-FIJO');
    pendClaves.add('CFE-PENDIENTE');
  }
  const cobrado = registros.filter((r) => okClaves.has(r.num_traspaso));
  const reportadoNoCobro = registros.filter((r) => pendClaves.has(r.num_traspaso));
  return { cobrado, reportadoNoCobro, registros };
}

export async function serviciosObligatoriosPendientesTienda(supabase, tienda) {
  const servicios = (await listarServiciosCobro(supabase)).filter((s) => s.obligatorio !== false && servicioEnVigencia(s));
  const pendientes = [];
  for (const srv of servicios) {
    const { cobrado, reportadoNoCobro } = await servicioResueltoEnTienda(supabase, tienda, srv);
    if (!cobrado.length && !reportadoNoCobro.length) pendientes.push(srv);
  }
  return pendientes;
}

export function construirDatosCobroServicio({
  tienda,
  repartidorId,
  cajero,
  claveServicio,
  monto,
  servicioEtiqueta,
  nota = '',
  estatus = 'En Tránsito',
}) {
  return {
    sucursal_origen: tienda,
    repartidor_id: repartidorId,
    cajero_nombre: String(cajero || '').trim(),
    monto: Number(monto),
    num_traspaso: claveServicio,
    foto_url: nota.trim() || `Cobro ${servicioEtiqueta}`,
    estatus,
    tipo_movimiento: 'Cobro Servicio',
    descripcion_gasto: `Bolsa servicios — ${servicioEtiqueta}`,
    fecha_hora: ahoraIsoNogales(),
    usuario_liquida: estatus === 'En Tránsito' ? 'No Leído' : null,
  };
}

export async function registrarCobroServicio(supabase, { tienda, repartidorId, cajero, srv, monto, pin, repartidores }) {
  if (!pinRepartidorValido(pin, repartidorId, repartidores)) {
    return { ok: false, error: 'PIN de recolector incorrecto.' };
  }
  if (!cajero?.trim()) return { ok: false, error: 'Escribe el nombre del cajero.' };
  const m = Number(monto);
  if (!(m > 0)) return { ok: false, error: 'Monto inválido.' };
  const datos = construirDatosCobroServicio({
    tienda,
    repartidorId,
    cajero,
    claveServicio: claveRegistroCobro(srv.clave),
    monto: m,
    servicioEtiqueta: srv.nombre,
    nota: `Cobro ${srv.nombre} ${fmtFechaClave(fechaClaveDesdeIso(ahoraIsoNogales()))}`,
  });
  const { error } = await supabase.from('transito_efectivo').insert(datos);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function registrarServicioNoCobrado(supabase, { tienda, repartidorId, cajero, srv, motivo, pin, repartidores }) {
  if (!pinRepartidorValido(pin, repartidorId, repartidores)) {
    return { ok: false, error: 'PIN de recolector incorrecto.' };
  }
  if (!motivo?.trim()) return { ok: false, error: 'Indica el motivo por el que no se cobró.' };
  const datos = construirDatosCobroServicio({
    tienda,
    repartidorId,
    cajero,
    claveServicio: claveRegistroPendiente(srv.clave),
    monto: Number(srv.monto_default) || 0,
    servicioEtiqueta: `${srv.nombre} Pendiente`,
    nota: `NO COBRADO: ${motivo.trim()}`,
    estatus: 'Por Cobrar',
  });
  const { error } = await supabase.from('transito_efectivo').insert(datos);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export function construirDatosTraspaso({ tienda, repartidorId, cajero, folio, monto, esEfectivo }) {
  const folioLimpio = normalizarFolio(folio);
  const nota = esEfectivo ? `Traspaso ${folioLimpio} en EFECTIVO` : `Traspaso ${folioLimpio} a CRÉDITO`;
  return {
    sucursal_origen: tienda,
    repartidor_id: repartidorId,
    cajero_nombre: String(cajero || '').trim(),
    monto: Number(monto),
    num_traspaso: folioLimpio,
    foto_url: nota,
    estatus: esEfectivo ? 'En Tránsito' : 'Por Cobrar',
    tipo_movimiento: esEfectivo ? 'Recolección' : 'Entrega Crédito',
    descripcion_gasto: esEfectivo ? 'Efectivo' : 'Crédito',
    fecha_hora: ahoraIsoNogales(),
    usuario_liquida: esEfectivo ? 'No Leído' : null,
  };
}

export async function buscarTraspasosPorFolios(supabase, folios) {
  const limpios = [...new Set(folios.map(normalizarFolio).filter(Boolean))];
  if (!limpios.length) return {};
  const { data, error } = await supabase
    .from('transito_efectivo')
    .select('id, num_traspaso, estatus, tipo_movimiento, monto, sucursal_origen')
    .in('num_traspaso', limpios)
    .in('tipo_movimiento', TIPOS_TRASPASO);
  if (error) throw error;
  const agrupado = {};
  for (const reg of data || []) {
    const clave = normalizarFolio(reg.num_traspaso);
    if (!agrupado[clave]) agrupado[clave] = [];
    agrupado[clave].push(reg);
  }
  return agrupado;
}

export function mensajeFolioDuplicado(folio, registros, excluirId = null) {
  for (const reg of registros || []) {
    if (excluirId && reg.id === excluirId) continue;
    const est = reg.estatus || '';
    const tienda = reg.sucursal_origen || '';
    const monto = Number(reg.monto || 0);
    if (est === 'Por Cobrar') {
      return `El folio ${folio} ya está a CRÉDITO (${fmtMonto(monto)} en ${tienda}). Cóbralo en Cobrar crédito.`;
    }
    if (est === 'En Tránsito') {
      return `El folio ${folio} ya existe En Tránsito (${fmtMonto(monto)} en ${tienda}).`;
    }
    if (est === 'Liquidado') {
      return `El folio ${folio} ya fue liquidado (${fmtMonto(monto)}).`;
    }
    return `El folio ${folio} ya existe (estatus: ${est}).`;
  }
  return null;
}

export async function registrarTraspasos(supabase, filas, opts) {
  const { tienda, repartidorId, cajero, esEfectivo } = opts;
  const validas = filas.filter((f) => normalizarFolio(f.folio) && Number(f.monto) > 0);
  if (!validas.length) return { ok: false, error: 'Agrega al menos un folio con monto.' };
  if (!cajero?.trim()) return { ok: false, error: 'Escribe el nombre del cajero.' };

  const pendientesSrv = await serviciosObligatoriosPendientesTienda(supabase, tienda);
  if (pendientesSrv.length) {
    return {
      ok: false,
      error: `Primero registra los servicios obligatorios: ${pendientesSrv.map((s) => s.nombre).join(', ')}`,
    };
  }

  const folios = validas.map((f) => normalizarFolio(f.folio));
  const dupMap = await buscarTraspasosPorFolios(supabase, folios);
  for (const f of validas) {
    const fol = normalizarFolio(f.folio);
    const msg = mensajeFolioDuplicado(fol, dupMap[fol]);
    if (msg) return { ok: false, error: msg };
  }

  const registros = validas.map((f) =>
    construirDatosTraspaso({
      tienda,
      repartidorId,
      cajero,
      folio: f.folio,
      monto: f.monto,
      esEfectivo,
    }),
  );

  const { error } = await supabase.from('transito_efectivo').insert(registros);
  if (error) return { ok: false, error: error.message };
  return { ok: true, count: registros.length };
}

export async function listarCreditosPendientes(supabase, tienda) {
  if (!supabase || !tienda) return [];
  const { data, error } = await supabase
    .from('transito_efectivo')
    .select('id, num_traspaso, monto, cajero_nombre, fecha_hora, descripcion_gasto')
    .eq('sucursal_origen', tienda)
    .eq('estatus', 'Por Cobrar')
    .eq('tipo_movimiento', 'Entrega Crédito')
    .order('fecha_hora', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function cobrarCreditosSeleccionados(supabase, { ids, repartidorId, cajero, pendientes }) {
  if (!ids?.length) return { ok: false, error: 'Selecciona al menos un folio.' };
  if (!cajero?.trim()) return { ok: false, error: 'Escribe el nombre del cajero.' };

  const sel = (pendientes || []).filter((p) => ids.includes(p.id));
  if (!sel.length) return { ok: false, error: 'Folios no encontrados.' };

  const foliosLista = sel.map((p) => `${p.num_traspaso}: ${fmtMonto(p.monto)}`).join(', ');
  for (const p of sel) {
    const { error } = await supabase
      .from('transito_efectivo')
      .update({
        estatus: 'En Tránsito',
        repartidor_id: repartidorId,
        cajero_nombre: cajero.trim(),
        foto_url: `Crédito cobrado. Desglose: ${foliosLista}`,
        tipo_movimiento: 'Recolección',
        usuario_liquida: 'No Leído',
      })
      .eq('id', p.id);
    if (error) return { ok: false, error: error.message };
  }

  const total = sel.reduce((a, p) => a + Number(p.monto || 0), 0);
  return { ok: true, count: sel.length, total };
}

export async function listarEnTransitoPorRepartidor(supabase, repartidorId) {
  const { data, error } = await supabase
    .from('transito_efectivo')
    .select(
      'id, sucursal_origen, cajero_nombre, monto, fecha_hora, num_traspaso, tipo_movimiento, descripcion_gasto, repartidor_id, repartidores(nombre)',
    )
    .eq('repartidor_id', repartidorId)
    .eq('estatus', 'En Tránsito')
    .order('fecha_hora', { ascending: true });
  if (error) throw error;
  return (data || []).filter((m) => m.tipo_movimiento !== 'Gasto');
}

/** Todo el efectivo en tránsito (todas las tiendas / recolectores). */
export async function listarTodoEnTransito(supabase, { repartidorId } = {}) {
  if (!supabase) return [];
  let q = supabase
    .from('transito_efectivo')
    .select(
      'id, sucursal_origen, repartidor_id, repartidores(nombre), cajero_nombre, monto, fecha_hora, num_traspaso, tipo_movimiento, descripcion_gasto',
    )
    .eq('estatus', 'En Tránsito')
    .order('fecha_hora', { ascending: false })
    .limit(500);
  if (repartidorId) q = q.eq('repartidor_id', repartidorId);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).filter((m) => m.tipo_movimiento !== 'Gasto');
}

export function inicioSemanaYmd(ymd) {
  const d = parseYmdLocal(ymd);
  if (!d) return ymd || '';
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return toYmdLocal(d);
}

function parseYmdLocal(ymd) {
  const [y, m, day] = String(ymd || '').slice(0, 10).split('-').map(Number);
  if (!y || !m || !day) return null;
  return new Date(y, m - 1, day);
}

function toYmdLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function etiquetaMesYmd(ym) {
  const [y, m] = String(ym || '').split('-').map(Number);
  if (!y || !m) return ym || '—';
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString('es-MX', { month: 'short', year: 'numeric' });
}

/** Resumen por tienda; incluye catálogo operativo con $0 si no hay movimientos. */
export function resumenPorTiendaConCatalogo(movimientos, tiendasCatalogo = []) {
  const map = new Map();
  for (const t of tiendasCatalogo) {
    const nombre = typeof t === 'string' ? t : t.nombre;
    if (nombre) map.set(nombre, { tienda: nombre, codigo: t.codigo || nombre, total: 0, count: 0, items: [] });
  }
  for (const m of movimientos || []) {
    const tienda = m.sucursal_origen || 'Sin tienda';
    if (!map.has(tienda)) map.set(tienda, { tienda, codigo: tienda, total: 0, count: 0, items: [] });
    const row = map.get(tienda);
    row.total += Number(m.monto || 0);
    row.count += 1;
    row.items.push(m);
  }
  return [...map.values()]
    .map((r) => ({ ...r, total: Math.round(r.total * 100) / 100 }))
    .sort((a, b) => b.total - a.total || a.tienda.localeCompare(b.tienda, 'es'));
}

export function agruparMovimientosPorPeriodo(movimientos, periodo, { diaDe = 'recoleccion' } = {}) {
  const map = {};
  for (const m of movimientos || []) {
    const ymd = claveDiaReporte(m, diaDe);
    if (!ymd) continue;
    let key;
    let etiqueta;
    if (periodo === 'dia') {
      key = ymd;
      etiqueta = fmtFechaClave(ymd);
    } else if (periodo === 'semana') {
      key = inicioSemanaYmd(ymd);
      etiqueta = `Semana ${fmtFechaClave(key)}`;
    } else if (periodo === 'mes') {
      key = ymd.slice(0, 7);
      etiqueta = etiquetaMesYmd(key);
    } else if (periodo === 'anual') {
      key = ymd.slice(0, 4);
      etiqueta = key;
    } else {
      key = ymd;
      etiqueta = fmtFechaClave(ymd);
    }
    if (!map[key]) map[key] = { key, etiqueta, total: 0, count: 0, items: [] };
    map[key].total += Number(m.monto || 0);
    map[key].count += 1;
    map[key].items.push(m);
  }
  return Object.values(map)
    .map((r) => ({ ...r, total: Math.round(r.total * 100) / 100 }))
    .sort((a, b) => String(b.key).localeCompare(String(a.key)));
}

/** Agrupa movimientos en tránsito: tienda → día → filas */
export function agruparEnTransitoPorTiendaYDia(movimientos, { diaDe = 'recoleccion' } = {}) {
  const porTienda = {};
  for (const m of movimientos || []) {
    const tienda = m.sucursal_origen || 'Sin tienda';
    const dia = claveDiaReporte(m, diaDe);
    if (!porTienda[tienda]) porTienda[tienda] = {};
    if (!porTienda[tienda][dia]) porTienda[tienda][dia] = [];
    porTienda[tienda][dia].push(m);
  }
  const tiendas = Object.keys(porTienda).sort();
  return tiendas.map((tienda) => {
    const dias = Object.keys(porTienda[tienda]).sort().reverse();
    const diasData = dias.map((dia) => {
      const items = porTienda[tienda][dia];
      const total = items.reduce((a, x) => a + Number(x.monto || 0), 0);
      const resumen = resumenTotalesPorTipo(items);
      return { dia, items, total, etiqueta: fmtFechaClave(dia), resumen };
    });
    const totalTienda = diasData.reduce((a, d) => a + d.total, 0);
    return { tienda, dias: diasData, totalTienda };
  });
}

/**
 * Reporte matriz: filas = tienda, columnas = fecha.
 * Incluye resumen por día para seleccionar varios días a liquidar juntos.
 */
export function reporteRecoleccionTiendaFecha(movimientos, { diaDe = 'recoleccion' } = {}) {
  const celda = {};
  const tiendasSet = new Set();
  const diasSet = new Set();

  for (const m of movimientos || []) {
    const tienda = m.sucursal_origen || 'Sin tienda';
    const dia = claveDiaReporte(m, diaDe);
    tiendasSet.add(tienda);
    diasSet.add(dia);
    const k = `${tienda}\0${dia}`;
    if (!celda[k]) celda[k] = { total: 0, count: 0, items: [] };
    celda[k].total += Number(m.monto || 0);
    celda[k].count += 1;
    celda[k].items.push(m);
  }

  const dias = [...diasSet].sort().reverse();
  const tiendas = [...tiendasSet].sort();
  const hoy = hoyClaveNogales();

  const filas = tiendas.map((tienda) => {
    const porDia = {};
    let totalTienda = 0;
    for (const dia of dias) {
      const c = celda[`${tienda}\0${dia}`] || { total: 0, count: 0, items: [] };
      porDia[dia] = c;
      totalTienda += c.total;
    }
    return { tienda, porDia, totalTienda };
  });

  const totalesPorDia = {};
  for (const dia of dias) {
    totalesPorDia[dia] = filas.reduce((a, f) => a + (f.porDia[dia]?.total || 0), 0);
  }

  const resumenDias = dias.map((dia) => {
    const items = (movimientos || []).filter((m) => claveDiaReporte(m, diaDe) === dia);
    const tiendasEnDia = new Set(items.map((m) => m.sucursal_origen || 'Sin tienda'));
    const resumen = resumenTotalesPorTipo(items);
    return {
      dia,
      etiqueta: fmtFechaClave(dia),
      esHoy: dia === hoy,
      total: totalesPorDia[dia] || 0,
      count: items.length,
      tiendas: tiendasEnDia.size,
      items,
      resumen,
    };
  });

  const granTotal = (movimientos || []).reduce((a, m) => a + Number(m.monto || 0), 0);

  return { dias, tiendas, filas, totalesPorDia, resumenDias, granTotal, hoy };
}

/** Agrupa por día (todas las tiendas) para vista cronológica. */
export function agruparEnTransitoPorDia(movimientos, { diaDe = 'recoleccion' } = {}) {
  const porDia = {};
  for (const m of movimientos || []) {
    const dia = claveDiaReporte(m, diaDe);
    if (!porDia[dia]) porDia[dia] = [];
    porDia[dia].push(m);
  }
  const hoy = hoyClaveNogales();
  return Object.keys(porDia)
    .sort()
    .reverse()
    .map((dia) => {
      const items = porDia[dia];
      const total = items.reduce((a, x) => a + Number(x.monto || 0), 0);
      const porTienda = {};
      for (const m of items) {
        const t = m.sucursal_origen || 'Sin tienda';
        if (!porTienda[t]) porTienda[t] = [];
        porTienda[t].push(m);
      }
      return {
        dia,
        etiqueta: fmtFechaClave(dia),
        esHoy: dia === hoy,
        items,
        total,
        resumen: resumenTotalesPorTipo(items),
        tiendas: Object.keys(porTienda)
          .sort()
          .map((tienda) => ({
            tienda,
            items: porTienda[tienda],
            total: porTienda[tienda].reduce((a, x) => a + Number(x.monto || 0), 0),
          })),
      };
    });
}

export function resumenTotalesPorTipo(items) {
  const merc = items.filter((m) => m.tipo_movimiento === 'Recolección' || m.tipo_movimiento === 'Entrega Crédito');
  const srv = items.filter((m) => m.tipo_movimiento === 'Cobro Servicio');
  return {
    mercancia: merc.reduce((a, m) => a + Number(m.monto || 0), 0),
    servicios: srv.reduce((a, m) => a + Number(m.monto || 0), 0),
  };
}

export async function liquidarMovimientos(supabase, { ids, adminNombre, repartidorNombre, cuentaRtId, montoLiquidacion }) {
  if (!ids?.length) return { ok: false, error: 'No hay movimientos para liquidar.' };
  const tLiq = ahoraIsoNogales();
  const sello = `Liquidación recibida por ${adminNombre} — ${repartidorNombre || ''}`;

  let montoTotal = Number(montoLiquidacion) || 0;
  if (montoTotal <= 0) {
    const { data: rowsMonto } = await supabase.from('transito_efectivo').select('monto').in('id', ids);
    montoTotal = (rowsMonto || []).reduce((a, r) => a + Number(r.monto || 0), 0);
  }

  for (const id of ids) {
    const { data: prev } = await supabase.from('transito_efectivo').select('foto_url').eq('id', id).maybeSingle();
    const bitacora = [prev?.foto_url, sello].filter(Boolean).join(' | ');
    const { error } = await supabase
      .from('transito_efectivo')
      .update({
        estatus: 'Liquidado',
        usuario_liquida: adminNombre,
        fecha_liquidacion: tLiq,
        foto_url: bitacora,
      })
      .eq('id', id);
    if (error) return { ok: false, error: error.message };
  }

  if (cuentaRtId && montoTotal > 0) {
    const { acreditarLiquidacionCuentaRt } = await import('./rtCuentas.js');
    const cred = await acreditarLiquidacionCuentaRt(supabase, {
      cuentaId: cuentaRtId,
      movimientoIds: ids,
      montoTotal,
      usuarioNombre: adminNombre,
      repartidorNombre,
    });
    if (!cred.ok) return { ok: false, error: cred.error, count: ids.length, parcial: true };
  }

  return { ok: true, count: ids.length, montoTotal, cuentaRtId: cuentaRtId || null };
}

export async function listarAlertasRecoleccion(supabase) {
  const { data, error } = await supabase
    .from('transito_efectivo')
    .select('id, sucursal_origen, num_traspaso, monto, repartidor_id, repartidores(nombre)')
    .eq('estatus', 'En Tránsito')
    .eq('usuario_liquida', 'No Leído')
    .order('fecha_hora', { ascending: false })
    .limit(30);
  if (error) throw error;
  return data || [];
}

export async function marcarAlertaVista(supabase, id) {
  const { error } = await supabase.from('transito_efectivo').update({ usuario_liquida: '' }).eq('id', id);
  if (error) throw error;
}

function filaTiendaVacia(tienda) {
  return {
    tienda,
    count: 0,
    recoleccion: 0,
    servicios: 0,
    credito: 0,
    enTransito: 0,
    liquidado: 0,
    porCobrar: 0,
    total: 0,
    movRecoleccion: 0,
    movServicios: 0,
    movCredito: 0,
  };
}

/** Movimientos de recolección/traspaso para reportes contables. */
export async function listarMovimientosRecoleccionContabilidad(supabase, { desde, hasta, estatus, repartidorId, tienda } = {}) {
  if (!supabase) return [];
  let q = supabase
    .from('transito_efectivo')
    .select(
      'id, sucursal_origen, repartidor_id, repartidores(nombre), cajero_nombre, monto, fecha_hora, num_traspaso, tipo_movimiento, estatus, descripcion_gasto, fecha_liquidacion, usuario_liquida',
    )
    .in('tipo_movimiento', ['Recolección', 'Entrega Crédito', 'Cobro Servicio'])
    .order('fecha_hora', { ascending: false });
  if (desde) q = q.gte('fecha_hora', `${desde}T00:00:00-07:00`);
  if (hasta) q = q.lte('fecha_hora', `${hasta}T23:59:59-07:00`);
  if (estatus) q = q.eq('estatus', estatus);
  if (repartidorId) q = q.eq('repartidor_id', repartidorId);
  if (tienda) q = q.eq('sucursal_origen', tienda);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

/** Reporte general agrupado por tienda (contabilidad). */
export function reporteGeneralPorTienda(movimientos, tiendasCatalogo = null) {
  const porTienda = {};
  for (const m of movimientos || []) {
    const t = m.sucursal_origen || 'Sin tienda';
    if (!porTienda[t]) porTienda[t] = filaTiendaVacia(t);
    const r = porTienda[t];
    const monto = Number(m.monto || 0);
    r.count += 1;
    r.total += monto;
    if (m.tipo_movimiento === 'Recolección') {
      r.recoleccion += monto;
      r.movRecoleccion += 1;
    } else if (m.tipo_movimiento === 'Cobro Servicio') {
      r.servicios += monto;
      r.movServicios += 1;
    } else if (m.tipo_movimiento === 'Entrega Crédito') {
      r.credito += monto;
      r.movCredito += 1;
    }
    if (m.estatus === 'En Tránsito') r.enTransito += monto;
    else if (m.estatus === 'Liquidado') r.liquidado += monto;
    else if (m.estatus === 'Por Cobrar') r.porCobrar += monto;
  }

  if (tiendasCatalogo?.length) {
    for (const t of tiendasCatalogo) {
      const nombre = typeof t === 'string' ? t : t.nombre;
      if (nombre && !porTienda[nombre]) porTienda[nombre] = filaTiendaVacia(nombre);
    }
  }

  const filas = Object.values(porTienda).sort((a, b) => a.tienda.localeCompare(b.tienda, 'es'));
  const totales = filas.reduce(
    (acc, f) => ({
      count: acc.count + f.count,
      recoleccion: acc.recoleccion + f.recoleccion,
      servicios: acc.servicios + f.servicios,
      credito: acc.credito + f.credito,
      enTransito: acc.enTransito + f.enTransito,
      liquidado: acc.liquidado + f.liquidado,
      porCobrar: acc.porCobrar + f.porCobrar,
      total: acc.total + f.total,
      movRecoleccion: acc.movRecoleccion + f.movRecoleccion,
      movServicios: acc.movServicios + f.movServicios,
      movCredito: acc.movCredito + f.movCredito,
    }),
    filaTiendaVacia('TOTAL'),
  );
  totales.tienda = 'TOTAL';
  return { filas, totales };
}

export function inicioMesClaveNogales() {
  const hoy = hoyClaveNogales();
  const [y, m] = hoy.split('-');
  return `${y}-${m}-01`;
}

/** Todos los movimientos (incluye gastos) para administración. */
export async function listarMovimientosTransitoAdmin(supabase, { desde, hasta, repartidorId, tienda, limite = 200 } = {}) {
  if (!supabase) return [];
  let q = supabase
    .from('transito_efectivo')
    .select(
      'id, sucursal_origen, repartidor_id, repartidores(nombre), cajero_nombre, monto, fecha_hora, num_traspaso, tipo_movimiento, estatus, descripcion_gasto, foto_url',
    )
    .order('fecha_hora', { ascending: false })
    .limit(limite);
  if (desde) q = q.gte('fecha_hora', `${desde}T00:00:00-07:00`);
  if (hasta) q = q.lte('fecha_hora', `${hasta}T23:59:59-07:00`);
  if (repartidorId) q = q.eq('repartidor_id', repartidorId);
  if (tienda) q = q.eq('sucursal_origen', tienda);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function eliminarMovimientoTransito(supabase, id) {
  if (!id) return { ok: false, error: 'Registro inválido.' };
  const { error } = await supabase.from('transito_efectivo').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function saldoEnTransitoRepartidor(supabase, repartidorId) {
  const { data, error } = await supabase
    .from('transito_efectivo')
    .select('id, monto, tipo_movimiento, estatus, num_traspaso, sucursal_origen, fecha_hora')
    .eq('repartidor_id', repartidorId)
    .in('estatus', ['En Tránsito', 'Liquidado', 'Por Aceptar']);
  if (error) throw error;
  const rows = data || [];
  const enTransito = rows.filter((m) => m.estatus === 'En Tránsito' && m.tipo_movimiento !== 'Gasto');
  const gastos = rows.filter((m) => m.tipo_movimiento === 'Gasto' && m.estatus === 'Liquidado');
  const pendientes = rows.filter((m) => m.tipo_movimiento === 'Gasto' && m.estatus === 'Por Aceptar');
  const ingresos = enTransito.reduce((a, m) => a + Number(m.monto || 0), 0);
  const egresos = gastos.reduce((a, m) => a + Number(m.monto || 0), 0);
  const reservado = pendientes.reduce((a, m) => a + Number(m.monto || 0), 0);
  const total = ingresos - egresos;
  const disponible = total - reservado;
  return {
    movimientos: enTransito,
    gastos,
    pendientes,
    ingresos,
    egresos,
    reservado,
    total,
    disponible,
    count: enTransito.length,
  };
}

/** Gastos autorizados por contabilidad, pendientes de aceptación del recolector. */
export async function listarGastosPendientesRecolector(supabase, repartidorId) {
  if (!supabase || !repartidorId) return [];
  const { data, error } = await supabase
    .from('transito_efectivo')
    .select(
      'id, sucursal_origen, cajero_nombre, monto, fecha_hora, num_traspaso, descripcion_gasto, repartidor_id, repartidores(nombre)',
    )
    .eq('repartidor_id', repartidorId)
    .eq('tipo_movimiento', 'Gasto')
    .eq('estatus', 'Por Aceptar')
    .order('fecha_hora', { ascending: false });
  if (error) throw error;
  return data || [];
}

/** Gastos aceptados por el recolector (descuentan del efectivo en tránsito). */
export async function listarGastosLiquidadosRecolector(supabase, { repartidorId } = {}) {
  if (!supabase) return [];
  let q = supabase
    .from('transito_efectivo')
    .select(
      'id, sucursal_origen, repartidor_id, repartidores(nombre), cajero_nombre, monto, fecha_hora, num_traspaso, tipo_movimiento, descripcion_gasto, estatus, fecha_liquidacion, usuario_liquida',
    )
    .eq('tipo_movimiento', 'Gasto')
    .eq('estatus', 'Liquidado')
    .order('fecha_liquidacion', { ascending: false })
    .limit(500);
  if (repartidorId) q = q.eq('repartidor_id', repartidorId);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

/**
 * Gastos ya aceptados por el recolector que aún descuentan del efectivo en tránsito
 * (posteriores a la última liquidación sellada de recolecciones).
 */
export async function listarGastosActivosParaLiquidacion(supabase, repartidorId) {
  if (!supabase || !repartidorId) return [];
  const { data: lastLiq, error: e1 } = await supabase
    .from('transito_efectivo')
    .select('fecha_liquidacion')
    .eq('repartidor_id', repartidorId)
    .eq('estatus', 'Liquidado')
    .neq('tipo_movimiento', 'Gasto')
    .not('fecha_liquidacion', 'is', null)
    .order('fecha_liquidacion', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (e1) throw e1;

  let q = supabase
    .from('transito_efectivo')
    .select(
      'id, sucursal_origen, repartidor_id, repartidores(nombre), cajero_nombre, monto, fecha_hora, num_traspaso, tipo_movimiento, descripcion_gasto, estatus, fecha_liquidacion, usuario_liquida',
    )
    .eq('repartidor_id', repartidorId)
    .eq('tipo_movimiento', 'Gasto')
    .eq('estatus', 'Liquidado')
    .order('fecha_liquidacion', { ascending: true });
  if (lastLiq?.fecha_liquidacion) {
    q = q.gt('fecha_liquidacion', lastLiq.fecha_liquidacion);
  }
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function registrarGastoRecolector(supabase, { repartidorId, monto, descripcion, adminNombre, tienda }) {
  const m = Number(monto);
  if (!(m > 0)) return { ok: false, error: 'Monto inválido.' };
  if (!descripcion?.trim()) return { ok: false, error: 'Describe el gasto.' };
  const saldo = await saldoEnTransitoRepartidor(supabase, repartidorId);
  if (m + saldo.reservado > saldo.total + 0.001) {
    return {
      ok: false,
      error: `El gasto (${fmtMonto(m)}) supera el saldo disponible (${fmtMonto(saldo.disponible)}).`,
    };
  }
  const rep = (await listarRepartidoresTodos(supabase)).find((r) => r.id === repartidorId);
  const datos = {
    sucursal_origen: tienda || 'Oficina',
    repartidor_id: repartidorId,
    cajero_nombre: adminNombre || 'Contabilidad',
    monto: m,
    num_traspaso: `GASTO-${Date.now().toString(36).toUpperCase()}`,
    foto_url: descripcion.trim(),
    estatus: 'Por Aceptar',
    tipo_movimiento: 'Gasto',
    descripcion_gasto: descripcion.trim(),
    fecha_hora: ahoraIsoNogales(),
    usuario_liquida: 'Pendiente',
  };
  const { error } = await supabase.from('transito_efectivo').insert(datos);
  if (error) return { ok: false, error: error.message };
  return { ok: true, recolector: rep?.nombre, pendiente: true };
}

export async function aceptarGastosRecolector(supabase, { ids, repartidorId, recolectorNombre }) {
  if (!ids?.length) return { ok: false, error: 'Selecciona al menos un gasto.' };
  const { data, error } = await supabase
    .from('transito_efectivo')
    .select('id, monto, estatus, tipo_movimiento, repartidor_id, descripcion_gasto, foto_url')
    .in('id', ids)
    .eq('repartidor_id', repartidorId)
    .eq('tipo_movimiento', 'Gasto')
    .eq('estatus', 'Por Aceptar');
  if (error) return { ok: false, error: error.message };
  const rows = data || [];
  if (!rows.length) return { ok: false, error: 'No hay gastos pendientes para aceptar.' };
  const montoTotal = rows.reduce((a, m) => a + Number(m.monto || 0), 0);
  const saldo = await saldoEnTransitoRepartidor(supabase, repartidorId);
  const reservadoOtros = (saldo.reservado || 0) - montoTotal;
  if (montoTotal + reservadoOtros > saldo.total + 0.001) {
    return { ok: false, error: `El saldo en tránsito (${fmtMonto(saldo.total)}) ya no alcanza para estos gastos.` };
  }
  const ahora = ahoraIsoNogales();
  for (const row of rows) {
    const { error: upErr } = await supabase
      .from('transito_efectivo')
      .update({
        estatus: 'Liquidado',
        usuario_liquida: recolectorNombre || 'Recolector',
        fecha_liquidacion: ahora,
        foto_url: `${row.foto_url || row.descripcion_gasto || ''} · Aceptado por ${recolectorNombre || 'recolector'}`.trim(),
      })
      .eq('id', row.id)
      .eq('estatus', 'Por Aceptar');
    if (upErr) return { ok: false, error: upErr.message };
  }
  return { ok: true, count: rows.length, total: montoTotal };
}

export async function cancelarGastoPendiente(supabase, id) {
  if (!id) return { ok: false, error: 'Gasto inválido.' };
  const { data, error } = await supabase
    .from('transito_efectivo')
    .select('id, estatus, tipo_movimiento')
    .eq('id', id)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data || data.tipo_movimiento !== 'Gasto' || data.estatus !== 'Por Aceptar') {
    return { ok: false, error: 'Solo se pueden cancelar gastos pendientes de aceptación.' };
  }
  const { error: delErr } = await supabase.from('transito_efectivo').delete().eq('id', id);
  if (delErr) return { ok: false, error: delErr.message };
  return { ok: true };
}

export async function liberarEfectivoRepartidor(supabase, { repartidorId, adminNombre, ids, cuentaRtId }) {
  let movs = [];
  if (ids?.length) {
    const { data, error } = await supabase
      .from('transito_efectivo')
      .select('id, monto, estatus, tipo_movimiento')
      .in('id', ids)
      .eq('repartidor_id', repartidorId)
      .eq('estatus', 'En Tránsito');
    if (error) return { ok: false, error: error.message };
    movs = (data || []).filter((m) => m.tipo_movimiento !== 'Gasto');
  } else {
    movs = await listarEnTransitoPorRepartidor(supabase, repartidorId);
  }
  if (!movs.length) return { ok: false, error: 'No hay efectivo en tránsito para liberar.' };
  const rep = (await listarRepartidoresTodos(supabase)).find((r) => r.id === repartidorId);
  const montoTotal = movs.reduce((a, m) => a + Number(m.monto || 0), 0);
  return liquidarMovimientos(supabase, {
    ids: movs.map((m) => m.id),
    adminNombre: adminNombre || 'Contabilidad',
    repartidorNombre: rep?.nombre || '',
    cuentaRtId,
    montoLiquidacion: montoTotal,
  });
}
