import { normalizarCodigoTienda } from '../constants/sucursales.js';
import { normalizarRol } from './roles.js';

const TIPOS_TRASPASO = ['Recolección', 'Entrega Crédito'];

/** Nombre de tienda en control_efectivo (Streamlit) desde código POS. */
export function sucursalParaControlEfectivo(codigo) {
  const c = normalizarCodigoTienda(codigo);
  if (!c || c === 'MAIN') return null;
  if (c === 'FUSION') return 'Fusión';
  return c;
}

export function fmtMonto(n) {
  return `$${Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function ahoraIsoNogales() {
  return new Date().toISOString();
}

export function normalizarFolio(folio) {
  return String(folio || '')
    .trim()
    .toUpperCase();
}

export function puedeLiquidarRecolecciones(rol) {
  return normalizarRol(rol) === 'Administrador';
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
      return `El folio ${folio} ya está a CRÉDITO (${fmtMonto(monto)} en ${tienda}). Cóbralo en la pestaña Cobrar crédito.`;
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
    .select('id, num_traspaso, monto, cajero_nombre, fecha_hora')
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
    .select('id, sucursal_origen, cajero_nombre, monto, fecha_hora, num_traspaso, tipo_movimiento, descripcion_gasto')
    .eq('repartidor_id', repartidorId)
    .eq('estatus', 'En Tránsito')
    .order('fecha_hora', { ascending: true });
  if (error) throw error;
  return (data || []).filter((m) => m.tipo_movimiento !== 'Gasto');
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
