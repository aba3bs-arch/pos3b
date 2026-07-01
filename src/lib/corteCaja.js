import { consultarVentas } from './ventasQuery.js';

const LS_CORTES = 'pos3b_cortes_caja';

export function inicioDia(isoDate) {
  const d = isoDate ? new Date(`${isoDate}T12:00:00`) : new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function finDia(isoDate) {
  const d = isoDate ? new Date(`${isoDate}T12:00:00`) : new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

/** Clasifica metodo_pago guardado en ventas */
export function clasificarPago(metodoPago) {
  const m = String(metodoPago || '').toLowerCase();
  if (m.startsWith('efectivo')) return 'efectivo';
  if (m.includes('tarjeta')) return 'tarjeta';
  if (m.includes('transfer')) return 'transferencia';
  if (m.includes('qr')) return 'qr';
  return 'otros';
}

export const RUBROS_CORROBORACION = [
  { id: 'tarjeta', label: 'Tarjeta' },
  { id: 'transferencia', label: 'Transferencia' },
  { id: 'qr', label: 'QR / digital' },
];

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Arma objeto de corroboración: esperado (sistema), contado y diferencia por rubro. */
export function armarCorroboracion(grupos = {}, contados = {}) {
  const out = {};
  for (const { id } of RUBROS_CORROBORACION) {
    const esperado = round2(grupos[id] || 0);
    const raw = contados[id];
    const contado = raw === '' || raw == null || Number.isNaN(Number(raw)) ? null : round2(raw);
    out[id] = {
      esperado,
      contado,
      diferencia: contado != null ? round2(contado - esperado) : null,
    };
  }
  return out;
}

export function etiquetaGrupoPago(grupo) {
  const map = {
    efectivo: 'Efectivo',
    tarjeta: 'Tarjeta',
    transferencia: 'Transferencia',
    qr: 'QR / digital',
    otros: 'Otros',
  };
  return map[grupo] || grupo;
}

export function resumirVentas(ventas) {
  const porMetodo = {};
  const grupos = { efectivo: 0, tarjeta: 0, transferencia: 0, qr: 0, otros: 0 };
  let total = 0;
  let tickets = 0;

  for (const v of ventas || []) {
    const t = Number(v.total) || 0;
    total += t;
    tickets += 1;
    const mp = String(v.metodo_pago || 'Sin método');
    porMetodo[mp] = (porMetodo[mp] || 0) + t;
    const g = clasificarPago(mp);
    grupos[g] = (grupos[g] || 0) + t;
  }

  const detalleMetodos = Object.entries(porMetodo)
    .map(([metodo, monto]) => ({ metodo, monto }))
    .sort((a, b) => b.monto - a.monto);

  return {
    total,
    tickets,
    grupos,
    efectivoEsperado: grupos.efectivo,
    electronico: grupos.tarjeta + grupos.transferencia + grupos.qr + grupos.otros,
    detalleMetodos,
  };
}

export function leerCortesLocales() {
  try {
    const raw = localStorage.getItem(LS_CORTES);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function guardarCorteLocal(corte) {
  const prev = leerCortesLocales();
  const next = [{ ...corte, id: corte.id || `corte_${Date.now()}` }, ...prev].slice(0, 120);
  localStorage.setItem(LS_CORTES, JSON.stringify(next));
  return next;
}

export function filtrarCortesLocales(cortes, opts = {}) {
  const { desde, hasta, sucursal, usuario, corteId, tipoDiferencia } = opts;
  let list = [...(cortes || [])];
  if (desde) {
    const d = String(desde).slice(0, 10);
    list = list.filter((c) => String(c.fecha || '').slice(0, 10) >= d);
  }
  if (hasta) {
    const h = String(hasta).slice(0, 10);
    list = list.filter((c) => String(c.fecha || '').slice(0, 10) <= h);
  }
  if (sucursal) list = list.filter((c) => String(c.sucursal || c.sucursal_id || '') === sucursal);
  if (usuario?.trim()) {
    const u = usuario.trim().toLowerCase();
    list = list.filter((c) => String(c.usuario || '').toLowerCase().includes(u));
  }
  if (corteId) list = list.filter((c) => String(c.id) === String(corteId));
  if (tipoDiferencia === 'cuadrado') list = list.filter((c) => Math.abs(Number(c.diferencia) || 0) < 0.01);
  if (tipoDiferencia === 'faltante') list = list.filter((c) => Number(c.diferencia) < -0.01);
  if (tipoDiferencia === 'sobrante') list = list.filter((c) => Number(c.diferencia) > 0.01);
  return list.sort((a, b) => {
    const ta = new Date(a.hora || a.created_at || a.fecha).getTime();
    const tb = new Date(b.hora || b.created_at || b.fecha).getTime();
    return tb - ta;
  });
}

export async function corteYaRegistrado(supabase, { sucursal, fecha, turnoId }) {
  if (!turnoId) return { existe: false };
  const locales = leerCortesLocales().filter(
    (c) => String(c.sucursal || c.sucursal_id) === String(sucursal) && String(c.fecha).slice(0, 10) === String(fecha).slice(0, 10) && String(c.turno_id) === String(turnoId),
  );
  if (locales.length) return { existe: true, corte: locales[0], origen: 'local' };

  if (!supabase) return { existe: false };

  const { data, error } = await supabase
    .from('cortes_caja')
    .select('id,usuario,created_at,turno_nombre,efectivo_contado,diferencia')
    .eq('sucursal_id', sucursal)
    .eq('fecha', String(fecha).slice(0, 10))
    .eq('turno_id', turnoId)
    .maybeSingle();

  if (error) {
    if (String(error.message).includes('turno_id') || String(error.message).includes('schema cache')) {
      return { existe: locales.length > 0, corte: locales[0], origen: 'local', aviso: 'Ejecuta supabase/fix_turnos.sql para validar cortes por turno en la nube.' };
    }
    return { existe: false, error: error.message };
  }
  if (data) return { existe: true, corte: data, origen: 'nube' };
  return { existe: false };
}

export async function guardarCorte(supabase, corte, usuarioId = null) {
  const dup = await corteYaRegistrado(supabase, {
    sucursal: corte.sucursal,
    fecha: corte.fecha,
    turnoId: corte.turno_id,
  });
  if (dup.existe) {
    return {
      ok: false,
      error: `Ya existe un corte para ${corte.turno_nombre || corte.turno_id} en esta tienda y fecha (${dup.origen}).`,
    };
  }

  const row = {
    sucursal_id: corte.sucursal,
    usuario: corte.usuario,
    usuario_id: usuarioId || null,
    fecha: corte.fecha,
    turno_id: corte.turno_id || null,
    turno_nombre: corte.turno_nombre || null,
    total_ventas: corte.totalVentas,
    tickets: corte.tickets,
    efectivo_esperado: corte.efectivoEsperado,
    efectivo_contado: corte.efectivoContado,
    diferencia: corte.diferencia,
    electronico: corte.electronico,
    grupos: corte.grupos || {},
    detalle_metodos: corte.detalleMetodos || [],
    corroboracion: corte.corroboracion || {},
    notas: corte.notas || '',
  };
  let cloudId = null;
  if (supabase) {
    const { data, error } = await supabase.from('cortes_caja').insert([row]).select('id').single();
    if (error) {
      if (error.code === '23505') {
        return { ok: false, error: 'Ya se registró un corte para este turno en la nube.' };
      }
      if (!String(error.message).includes('turno_id')) {
        return { ok: false, error: error.message };
      }
    } else if (data?.id) {
      cloudId = data.id;
    }
  }
  const local = guardarCorteLocal({ ...corte, id: cloudId || corte.id || `corte_${Date.now()}`, cloudId });
  return { ok: true, id: cloudId, local };
}

export async function consultarCortes(supabase, opts = {}) {
  const { desde, hasta, sucursal, usuario, corteId, tipoDiferencia, limit = 200 } = opts;
  const locales = filtrarCortesLocales(leerCortesLocales(), opts);

  if (!supabase) {
    return { data: locales, error: null, soloLocal: true };
  }

  let q = supabase.from('cortes_caja').select('*').order('created_at', { ascending: false }).limit(limit);
  if (sucursal) q = q.eq('sucursal_id', sucursal);
  if (desde) q = q.gte('fecha', String(desde).slice(0, 10));
  if (hasta) q = q.lte('fecha', String(hasta).slice(0, 10));
  if (usuario?.trim()) q = q.ilike('usuario', `%${usuario.trim()}%`);
  if (corteId) q = q.eq('id', corteId);

  const { data, error } = await q;
  if (error) {
    if (error.message?.includes('relation') || error.code === '42P01') {
      return { data: locales, error: null, soloLocal: true, aviso: 'Ejecuta supabase/fix_cortes_caja.sql para guardar cortes en la nube.' };
    }
    return { data: locales, error: error.message, soloLocal: false };
  }

  let list = (data || []).map((c) => ({
    id: c.id,
    fecha: c.fecha,
    sucursal: c.sucursal_id,
    sucursal_id: c.sucursal_id,
    usuario: c.usuario,
    hora: c.created_at,
    created_at: c.created_at,
    totalVentas: Number(c.total_ventas) || 0,
    tickets: c.tickets || 0,
    efectivoEsperado: Number(c.efectivo_esperado) || 0,
    efectivoContado: Number(c.efectivo_contado) || 0,
    diferencia: Number(c.diferencia) || 0,
    electronico: Number(c.electronico) || 0,
    grupos: c.grupos || {},
    detalleMetodos: Array.isArray(c.detalle_metodos) ? c.detalle_metodos : [],
    corroboracion: c.corroboracion && typeof c.corroboracion === 'object' ? c.corroboracion : {},
    turno_id: c.turno_id,
    turno_nombre: c.turno_nombre,
    notas: c.notas || '',
    origen: 'nube',
  }));

  if (tipoDiferencia === 'cuadrado') list = list.filter((c) => Math.abs(c.diferencia) < 0.01);
  if (tipoDiferencia === 'faltante') list = list.filter((c) => c.diferencia < -0.01);
  if (tipoDiferencia === 'sobrante') list = list.filter((c) => c.diferencia > 0.01);

  if (list.length === 0 && locales.length > 0) {
    return { data: locales.map((c) => ({ ...c, origen: 'local' })), error: null, soloLocal: true };
  }

  return { data: list, error: null, soloLocal: false };
}

export async function cargarVentasDelDia(supabase, { sucursal, fecha }) {
  const ini = inicioDia(fecha);
  const fin = finDia(fecha);
  const { data, error, sinFecha, aviso } = await consultarVentas(supabase, {
    columns: 'id,total,metodo_pago,vendedor,sucursal_id,created_at',
    desde: ini,
    hasta: fin,
    sucursal,
    limit: 2000,
  });
  if (error) return { ventas: [], error, aviso: null };
  return { ventas: data, error: null, aviso: sinFecha ? aviso : null };
}
