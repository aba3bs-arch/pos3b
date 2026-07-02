import { normalizarCodigoTienda, etiquetaTienda, listarSucursalesOperativas } from '../constants/sucursales.js';
import { normalizarRol } from './roles.js';

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

export function pinRepartidorValido(pin, repartidorId, repartidores) {
  const rep = repartidores.find((r) => r.id === repartidorId);
  return Boolean(rep?.pin) && String(pin) === String(rep.pin);
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
      'id, sucursal_origen, cajero_nombre, monto, fecha_hora, num_traspaso, tipo_movimiento, descripcion_gasto',
    )
    .eq('repartidor_id', repartidorId)
    .eq('estatus', 'En Tránsito')
    .order('fecha_hora', { ascending: true });
  if (error) throw error;
  return (data || []).filter((m) => m.tipo_movimiento !== 'Gasto');
}

/** Agrupa movimientos en tránsito: tienda → día → filas */
export function agruparEnTransitoPorTiendaYDia(movimientos) {
  const porTienda = {};
  for (const m of movimientos || []) {
    const tienda = m.sucursal_origen || 'Sin tienda';
    const dia = fechaClaveDesdeIso(m.fecha_hora);
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
      return { dia, items, total, etiqueta: fmtFechaClave(dia) };
    });
    const totalTienda = diasData.reduce((a, d) => a + d.total, 0);
    return { tienda, dias: diasData, totalTienda };
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

export async function liquidarMovimientos(supabase, { ids, adminNombre, repartidorNombre }) {
  if (!ids?.length) return { ok: false, error: 'No hay movimientos para liquidar.' };
  const tLiq = ahoraIsoNogales();
  const sello = `Liquidación recibida por ${adminNombre} — ${repartidorNombre || ''}`;

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
  return { ok: true, count: ids.length };
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
