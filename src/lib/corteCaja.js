import { consultarVentas } from './ventasQuery.js';

const LS_CORTES = 'pos3b_cortes_caja';

/** Nogales, Sonora: UTC−7 fijo (sin horario de verano). */
export const TZ_CAJA = 'America/Hermosillo';
const OFFSET_HORAS_NOGALES = 7;

function ymdNogalesFromDate(date = new Date()) {
  try {
    return date.toLocaleDateString('en-CA', { timeZone: TZ_CAJA });
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function hoyYmdNogales() {
  return ymdNogalesFromDate(new Date());
}

/**
 * Interpreta YYYY-MM-DD + hora local de Nogales como instante UTC.
 * Evita que el huso del PC desfase el corte respecto al reloj de la app.
 */
export function dateFromNogales(ymd, hour = 0, minute = 0, second = 0, ms = 0) {
  const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return new Date(NaN);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  return new Date(Date.UTC(y, mo - 1, d, hour + OFFSET_HORAS_NOGALES, minute, second, ms));
}

export function addDaysYmd(ymd, days) {
  const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return hoyYmdNogales();
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + Number(days || 0)));
  return dt.toISOString().slice(0, 10);
}

export function inicioDia(isoDate) {
  const ymd = isoDate && /^\d{4}-\d{2}-\d{2}$/.test(isoDate) ? isoDate : hoyYmdNogales();
  return dateFromNogales(ymd, 0, 0, 0, 0);
}

export function finDia(isoDate) {
  const ymd = isoDate && /^\d{4}-\d{2}-\d{2}$/.test(isoDate) ? isoDate : hoyYmdNogales();
  return dateFromNogales(ymd, 23, 59, 59, 999);
}

function minutosHora(hora) {
  const n = String(hora || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!n) return 0;
  return Number(n[1]) * 60 + Number(n[2]);
}

/** Turno que cruza medianoche (ej. nocturno 19:00–07:00). */
export function turnoCruzaMedianoche(turno) {
  if (!turno?.hora_inicio || !turno?.hora_fin) return false;
  const ini = minutosHora(turno.hora_inicio);
  const fin = minutosHora(turno.hora_fin);
  return ini !== fin && ini > fin;
}

/**
 * Ventana de consulta del corte.
 * - Turno diurno: día calendario Nogales.
 * - Turno nocturno: desde hora_inicio del día elegido hasta hora_fin del día siguiente.
 */
export function rangoConsultaCorte(fecha, turno = null) {
  const ymd = fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : hoyYmdNogales();
  if (turno && turnoCruzaMedianoche(turno)) {
    const [hi, mi] = String(turno.hora_inicio).split(':').map(Number);
    const [hf, mf] = String(turno.hora_fin).split(':').map(Number);
    const ini = dateFromNogales(ymd, hi, mi || 0, 0, 0);
    const fin = new Date(dateFromNogales(addDaysYmd(ymd, 1), hf, mf || 0, 0, 0).getTime() - 1);
    return { ini, fin, modo: 'turno_nocturno' };
  }
  return { ini: inicioDia(ymd), fin: finDia(ymd), modo: 'dia' };
}

/**
 * Fecha de corte sugerida según el turno activo en hora Nogales.
 * En la madrugada del nocturno (antes de hora_fin) usa el día en que empezó el turno.
 */
export function fechaCorteSugerida(turno = null, now = new Date()) {
  const hoy = ymdNogalesFromDate(now);
  if (!turno || !turnoCruzaMedianoche(turno)) return hoy;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: TZ_CAJA,
      hour: 'numeric',
      minute: 'numeric',
      hourCycle: 'h23',
    }).formatToParts(now);
    const hour = Number(parts.find((p) => p.type === 'hour')?.value || 0);
    const minute = Number(parts.find((p) => p.type === 'minute')?.value || 0);
    const nowMin = hour * 60 + minute;
    const iniMin = minutosHora(turno.hora_inicio);
    // En turnos nocturnos (cruzan medianoche), el corte corresponde al día
    // en que INICIA el turno:
    // - noche activa (>= inicio): hoy
    // - madrugada o día (< inicio): ayer
    if (nowMin < iniMin) return addDaysYmd(hoy, -1);
  } catch {
    /* ignore */
  }
  return hoy;
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

/** Actualiza un corte ya guardado en localStorage (por id). */
export function actualizarCorteLocal(corte) {
  const prev = leerCortesLocales();
  const id = String(corte?.id || '');
  if (!id) return guardarCorteLocal(corte);
  let found = false;
  const next = prev.map((c) => {
    if (String(c.id) !== id && String(c.cloudId || '') !== id) return c;
    found = true;
    return { ...c, ...corte, id: c.id || corte.id, cloudId: c.cloudId || corte.cloudId || null };
  });
  if (!found) next.unshift({ ...corte, id: corte.id || `corte_${Date.now()}` });
  const trimmed = next.slice(0, 120);
  localStorage.setItem(LS_CORTES, JSON.stringify(trimmed));
  return trimmed;
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
  if (locales.length) {
    const c = locales[0];
    const cloudId = c.cloudId && String(c.cloudId).includes('-') ? c.cloudId : null;
    const id = cloudId || c.id;
    return {
      existe: true,
      corte: {
        id,
        usuario: c.usuario,
        created_at: c.hora || c.created_at,
        turno_nombre: c.turno_nombre,
        efectivo_contado: c.efectivoContado ?? c.efectivo_contado,
        diferencia: c.diferencia,
        notas: c.notas || '',
        corroboracion: c.corroboracion || {},
        total_ventas: c.totalVentas ?? c.total_ventas,
        tickets: c.tickets,
        efectivo_esperado: c.efectivoEsperado ?? c.efectivo_esperado,
        electronico: c.electronico,
      },
      origen: cloudId ? 'nube' : 'local',
    };
  }

  if (!supabase) return { existe: false };

  const { data, error } = await supabase
    .from('cortes_caja')
    .select(
      'id,usuario,created_at,turno_nombre,efectivo_contado,diferencia,notas,corroboracion,total_ventas,tickets,efectivo_esperado,electronico,grupos,detalle_metodos',
    )
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

function rowCorteDesdePayload(corte, usuarioId = null) {
  return {
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
      error: `Ya existe un corte para ${corte.turno_nombre || corte.turno_id} en esta tienda y fecha (${dup.origen}). Usa «Corregir corte» para actualizarlo.`,
    };
  }

  const row = rowCorteDesdePayload(corte, usuarioId);
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

/**
 * Corrige un corte ya registrado (mismo id / mismo turno+fecha).
 * Actualiza montos de arqueo, corroboración, totales del sistema y notas.
 */
export async function corregirCorte(supabase, corte, usuarioId = null, corteId = null) {
  const id = corteId || corte?.id;
  if (!id) {
    return { ok: false, error: 'No hay corte existente para corregir.' };
  }

  const row = rowCorteDesdePayload(corte, usuarioId);
  // No cambiar sucursal/fecha/turno al corregir: solo montos y notas.
  const patch = {
    usuario: row.usuario,
    usuario_id: row.usuario_id,
    total_ventas: row.total_ventas,
    tickets: row.tickets,
    efectivo_esperado: row.efectivo_esperado,
    efectivo_contado: row.efectivo_contado,
    diferencia: row.diferencia,
    electronico: row.electronico,
    grupos: row.grupos,
    detalle_metodos: row.detalle_metodos,
    corroboracion: row.corroboracion,
    notas: row.notas,
  };

  if (supabase && String(id).includes('-')) {
    const { error } = await supabase.from('cortes_caja').update(patch).eq('id', id);
    if (error) {
      // Fallback si falta columna corroboracion
      if (String(error.message).includes('corroboracion')) {
        const { corroboracion: _c, ...sinCorr } = patch;
        const r2 = await supabase.from('cortes_caja').update(sinCorr).eq('id', id);
        if (r2.error) return { ok: false, error: r2.error.message };
      } else {
        return { ok: false, error: error.message };
      }
    }
  }

  const local = actualizarCorteLocal({
    ...corte,
    id,
    cloudId: String(id).includes('-') ? id : corte.cloudId || null,
    hora: new Date().toISOString(),
    corregido_at: new Date().toISOString(),
  });
  return { ok: true, id, local, corregido: true };
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

function ymdFromIso(iso) {
  if (!iso) return '';
  const s = String(iso);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return d.toLocaleDateString('en-CA', { timeZone: TZ_CAJA });
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

function montoTarjetaAbarrotesDetalle(detalle) {
  const d = detalle && typeof detalle === 'object' ? detalle : {};
  return round2(d.tarjeta);
}

/**
 * Pagos con tarjeta capturados en Corte Abarrotes (contabilidad),
 * para reflejarlos en Consultas → Cajas de cobro junto a los cortes POS.
 */
export async function consultarTarjetasAbarrotes(supabase, opts = {}) {
  const { desde, hasta, sucursal, limit = 400 } = opts;
  const d0 = desde ? String(desde).slice(0, 10) : null;
  const d1 = hasta ? String(hasta).slice(0, 10) : null;
  const out = [];
  let aviso = null;

  const pushCierre = (c, origen = 'nube') => {
    const tarjeta = montoTarjetaAbarrotesDetalle(c?.detalle);
    if (!(tarjeta > 0)) return;
    const tipo = String(c?.detalle?.tipo_cierre || c?.turno || '').toLowerCase();
    if (tipo.includes('recoleccion')) return;
    const fecha = ymdFromIso(c.created_at) || ymdFromIso(c.fecha) || '';
    if (d0 && fecha && fecha < d0) return;
    if (d1 && fecha && fecha > d1) return;
    out.push({
      id: `abarrotes_tarjeta_${c.id}`,
      origenId: c.id,
      tipoCaja: 'abarrotes_tarjeta',
      fecha,
      sucursal: c.sucursal_id,
      sucursal_id: c.sucursal_id,
      usuario: c.usuario_nombre || 'Abarrotes',
      hora: c.created_at,
      created_at: c.created_at,
      totalVentas: tarjeta,
      tickets: 0,
      efectivoEsperado: 0,
      efectivoContado: 0,
      diferencia: 0,
      electronico: tarjeta,
      tarjetaAbarrotes: tarjeta,
      grupos: { efectivo: 0, tarjeta, transferencia: 0, qr: 0, otros: 0 },
      detalleMetodos: [{ metodo: 'Tarjeta abarrotes', monto: tarjeta }],
      corroboracion: {},
      turno_id: null,
      turno_nombre: 'Abarrotes · Tarjeta',
      folio_abarrotes: c.folio || null,
      notas: c.detalle?.comentarios || '',
      origen,
    });
  };

  if (!supabase) {
    try {
      const keys = Object.keys(localStorage).filter((k) => k.startsWith('pos3b_corte_historial_abarrotes_'));
      for (const key of keys) {
        const sucKey = key.replace('pos3b_corte_historial_abarrotes_', '');
        if (sucursal && sucKey !== sucursal) continue;
        let hist = [];
        try {
          hist = JSON.parse(localStorage.getItem(key) || '[]');
        } catch {
          hist = [];
        }
        for (const c of hist.filter((h) => !h?.deleted_at).slice(0, limit)) pushCierre(c, 'local');
      }
    } catch {
      /* ignore */
    }
    out.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    return { data: out, aviso: null, soloLocal: true };
  }

  let q = supabase
    .from('cortes_contabilidad_cierres')
    .select('id,sucursal_id,modulo,folio,turno,usuario_nombre,created_at,detalle,ventas,caja_actual,deleted_at')
    .eq('modulo', 'abarrotes')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (sucursal) q = q.eq('sucursal_id', sucursal);
  if (d0) q = q.gte('created_at', `${d0}T00:00:00`);
  if (d1) q = q.lte('created_at', `${d1}T23:59:59.999`);

  let { data, error } = await q;
  if (error && /deleted_at/i.test(String(error.message || '')) && /does not exist|could not find|schema cache|column/i.test(String(error.message || ''))) {
    let q2 = supabase
      .from('cortes_contabilidad_cierres')
      .select('id,sucursal_id,modulo,folio,turno,usuario_nombre,created_at,detalle,ventas,caja_actual')
      .eq('modulo', 'abarrotes')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (sucursal) q2 = q2.eq('sucursal_id', sucursal);
    if (d0) q2 = q2.gte('created_at', `${d0}T00:00:00`);
    if (d1) q2 = q2.lte('created_at', `${d1}T23:59:59.999`);
    ({ data, error } = await q2);
  }
  if (error) {
    const msg = String(error.message || '');
    if (error.code === '42P01' || /cortes_contabilidad|does not exist|schema cache/i.test(msg)) {
      aviso = 'Falta historial de Corte Abarrotes en nube (cortes_contabilidad_cierres).';
      return { data: out, aviso, soloLocal: true };
    }
    return { data: [], error: error.message, aviso: null };
  }
  for (const c of (data || []).filter((row) => !row?.deleted_at)) pushCierre(c, 'nube');
  out.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  return { data: out, aviso, soloLocal: false };
}

/** Tarjeta abarrotes del día (cierres + corte abierto) para saldos de caja. */
export async function tarjetaAbarrotesDelDia(supabase, { sucursal, fecha } = {}) {
  const ymd = fecha ? String(fecha).slice(0, 10) : hoyYmdNogales();
  const suc = sucursal || null;
  let total = 0;
  const items = [];

  const r = await consultarTarjetasAbarrotes(supabase, {
    desde: ymd,
    hasta: ymd,
    sucursal: suc,
    limit: 80,
  });
  for (const row of r.data || []) {
    total = round2(total + (Number(row.tarjetaAbarrotes) || 0));
    items.push(row);
  }

  // Corte abierto (aún no cerrado): también cuenta para el día en curso.
  if (supabase && suc) {
    try {
      const { data } = await supabase
        .from('cortes_contabilidad_estado')
        .select('estado,updated_at')
        .eq('sucursal_id', suc)
        .eq('modulo', 'abarrotes')
        .maybeSingle();
      const tarjetaAbierta = montoTarjetaAbarrotesDetalle(data?.estado);
      if (tarjetaAbierta > 0) {
        const ya = items.some((i) => Math.abs(Number(i.tarjetaAbarrotes) - tarjetaAbierta) < 0.01);
        if (!ya) {
          total = round2(total + tarjetaAbierta);
          items.push({
            id: `abarrotes_tarjeta_abierto_${suc}_${ymd}`,
            tipoCaja: 'abarrotes_tarjeta',
            fecha: ymd,
            sucursal: suc,
            usuario: 'Abarrotes (abierto)',
            tarjetaAbarrotes: tarjetaAbierta,
            electronico: tarjetaAbierta,
            turno_nombre: 'Abarrotes · Tarjeta (abierto)',
            created_at: data?.updated_at || new Date().toISOString(),
            abierto: true,
          });
        }
      }
    } catch {
      /* ignore */
    }
  } else if (suc) {
    try {
      const raw = localStorage.getItem(`pos3b_corte_estado_abarrotes_${suc}`);
      const estado = raw ? JSON.parse(raw) : null;
      const tarjetaAbierta = montoTarjetaAbarrotesDetalle(estado);
      if (tarjetaAbierta > 0) {
        total = round2(total + tarjetaAbierta);
        items.push({
          id: `abarrotes_tarjeta_abierto_${suc}_${ymd}`,
          tipoCaja: 'abarrotes_tarjeta',
          fecha: ymd,
          sucursal: suc,
          usuario: 'Abarrotes (abierto)',
          tarjetaAbarrotes: tarjetaAbierta,
          electronico: tarjetaAbierta,
          turno_nombre: 'Abarrotes · Tarjeta (abierto)',
          created_at: new Date().toISOString(),
          abierto: true,
        });
      }
    } catch {
      /* ignore */
    }
  }

  return { total, items, aviso: r.aviso || null };
}
