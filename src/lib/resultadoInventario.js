/**
 * Resultado manual de inventario (total $ contado en físico).
 * Persistencia: localStorage + nube pos_resultados_inventario.
 * Usado por el reporte (comparación / efectividad) y por el bono (merma %).
 */
import { normalizarCodigoTienda } from '../constants/sucursales.js';

export const LS_RESULTADO_INV_PREFIX = 'pos3b_resultado_inv_';
export const EVENTO_RESULTADO_INVENTARIO = 'pos3b-resultado-inventario-updated';

export const AVISO_FALTA_RESULTADOS_INV_SQL =
  'Ejecuta supabase/fix_resultados_inventario.sql en Supabase para sincronizar el resultado de inventario entre cajas y usarlo en el bono.';

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function faltaTabla(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return (
    error?.code === '42P01'
    || msg.includes('pos_resultados_inventario')
    || (msg.includes('schema cache') && msg.includes('resultado'))
  );
}

function parseNum(raw) {
  if (raw == null || String(raw).trim() === '') return null;
  const n = Number(String(raw).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** Clave local por tienda + periodo. */
export function claveResultadoInventario(sucursal, desde, hasta) {
  const suc = normalizarCodigoTienda(sucursal) || 'TODAS';
  return `${LS_RESULTADO_INV_PREFIX}${suc}_${desde || ''}_${hasta || ''}`;
}

/**
 * Merma y efectividad a partir del total manual vs sistema / contado en líneas.
 * @param {number} valorManual
 * @param {number} valorSistema
 * @param {number} [valorContadoSistema] suma $ del conteo aplicado en sistema
 */
export function calcularMermaYEfectividad(valorManual, valorSistema, valorContadoSistema = null) {
  const manual = Number(valorManual);
  const sistema = Number(valorSistema);
  const contadoSis = valorContadoSistema == null ? null : Number(valorContadoSistema);

  if (!Number.isFinite(manual)) {
    return {
      valorManual: null,
      valorSistema: Number.isFinite(sistema) ? round2(sistema) : null,
      valorContadoSistema: Number.isFinite(contadoSis) ? round2(contadoSis) : null,
      diferenciaManualVsSistema: null,
      faltante: null,
      pctMerma: null,
      diferenciaConteoVsManual: null,
      pctEfectividad: null,
    };
  }

  const sistemaOk = Number.isFinite(sistema) && sistema > 0;
  const diferencia = sistemaOk ? round2(manual - sistema) : null;
  const faltante = sistemaOk ? round2(Math.max(0, sistema - manual)) : null;
  const pctMerma = sistemaOk && faltante != null
    ? round2((faltante / sistema) * 100)
    : null;

  let diferenciaConteoVsManual = null;
  let pctEfectividad = null;
  if (Number.isFinite(contadoSis) && manual > 0) {
    diferenciaConteoVsManual = round2(contadoSis - manual);
    const desvioPct = (Math.abs(contadoSis - manual) / manual) * 100;
    pctEfectividad = round2(Math.max(0, Math.min(100, 100 - desvioPct)));
  }

  return {
    valorManual: round2(manual),
    valorSistema: sistemaOk ? round2(sistema) : (Number.isFinite(sistema) ? round2(sistema) : null),
    valorContadoSistema: Number.isFinite(contadoSis) ? round2(contadoSis) : null,
    diferenciaManualVsSistema: diferencia,
    faltante,
    pctMerma,
    diferenciaConteoVsManual,
    pctEfectividad,
  };
}

function leerLocalRaw(clave) {
  try {
    const raw = localStorage.getItem(clave);
    if (raw == null) return null;
    // Compat: versiones anteriores guardaban solo el número como string
    if (/^\s*-?\d+(\.\d+)?\s*$/.test(raw) || (raw[0] !== '{' && raw[0] !== '[')) {
      const n = parseNum(raw);
      if (n == null) return null;
      return { valor_contado: n };
    }
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== 'object') return null;
    return obj;
  } catch {
    return null;
  }
}

function escribirLocal(clave, registro) {
  try {
    if (!registro || registro.valor_contado == null) {
      localStorage.removeItem(clave);
      return;
    }
    localStorage.setItem(clave, JSON.stringify(registro));
  } catch {
    /* ignore */
  }
}

function emitirEvento(detail) {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent(EVENTO_RESULTADO_INVENTARIO, { detail }));
  } catch {
    /* ignore */
  }
}

function normalizarRegistro(row, { sucursal, desde, hasta } = {}) {
  if (!row) return null;
  const valor = parseNum(row.valor_contado ?? row.valorContado);
  if (valor == null) return null;
  return {
    id: row.id || null,
    sucursal_id: normalizarCodigoTienda(row.sucursal_id || sucursal) || '',
    desde: String(row.desde || desde || '').slice(0, 10),
    hasta: String(row.hasta || hasta || '').slice(0, 10),
    valor_contado: round2(valor),
    valor_sistema: parseNum(row.valor_sistema ?? row.valorSistema),
    valor_contado_sistema: parseNum(row.valor_contado_sistema ?? row.valorContadoSistema),
    valor_faltante: parseNum(row.valor_faltante ?? row.valorFaltante),
    pct_merma: parseNum(row.pct_merma ?? row.pctMerma),
    pct_efectividad: parseNum(row.pct_efectividad ?? row.pctEfectividad),
    usuario: row.usuario || null,
    nota: row.nota || null,
    updated_at: row.updated_at || null,
    fuente: row.fuente || 'local',
  };
}

/**
 * Carga el resultado manual para una tienda y periodo.
 * Preferencia: nube → local.
 */
export async function cargarResultadoInventario(supabase, { sucursal, desde, hasta } = {}) {
  const suc = normalizarCodigoTienda(sucursal);
  if (!suc || !desde || !hasta) {
    return { ok: true, registro: null, aviso: 'Elige una tienda y un periodo para capturar el resultado.' };
  }

  const clave = claveResultadoInventario(suc, desde, hasta);
  const local = normalizarRegistro(leerLocalRaw(clave), { sucursal: suc, desde, hasta });

  if (!supabase) {
    return { ok: true, registro: local ? { ...local, fuente: 'local' } : null };
  }

  try {
    const { data, error } = await supabase
      .from('pos_resultados_inventario')
      .select('*')
      .eq('sucursal_id', suc)
      .eq('desde', desde)
      .eq('hasta', hasta)
      .maybeSingle();

    if (error) {
      if (faltaTabla(error)) {
        return {
          ok: true,
          registro: local ? { ...local, fuente: 'local' } : null,
          aviso: AVISO_FALTA_RESULTADOS_INV_SQL,
          sinTabla: true,
        };
      }
      return {
        ok: false,
        error: error.message,
        registro: local ? { ...local, fuente: 'local' } : null,
      };
    }

    if (data) {
      const remoto = normalizarRegistro(data, { sucursal: suc, desde, hasta });
      if (remoto) {
        escribirLocal(clave, { ...remoto, fuente: 'nube' });
        return { ok: true, registro: { ...remoto, fuente: 'nube' } };
      }
    }

    return { ok: true, registro: local ? { ...local, fuente: 'local' } : null };
  } catch (e) {
    return {
      ok: false,
      error: e?.message || String(e),
      registro: local ? { ...local, fuente: 'local' } : null,
    };
  }
}

/**
 * Guarda (o borra si valor vacío) el resultado manual.
 * Requiere tienda concreta (no "Todas").
 */
export async function guardarResultadoInventario(supabase, {
  sucursal,
  desde,
  hasta,
  valorContado,
  valorSistema = null,
  valorContadoSistema = null,
  usuario = null,
  nota = null,
} = {}) {
  const suc = normalizarCodigoTienda(sucursal);
  if (!suc) {
    return { ok: false, error: 'Elige una tienda (no "Todas") para guardar el resultado.' };
  }
  if (!desde || !hasta) {
    return { ok: false, error: 'Falta el periodo del reporte.' };
  }

  const clave = claveResultadoInventario(suc, desde, hasta);
  const valor = parseNum(valorContado);

  if (valor == null) {
    try {
      localStorage.removeItem(clave);
    } catch {
      /* ignore */
    }
    if (supabase) {
      try {
        const { error } = await supabase
          .from('pos_resultados_inventario')
          .delete()
          .eq('sucursal_id', suc)
          .eq('desde', desde)
          .eq('hasta', hasta);
        if (error && !faltaTabla(error)) {
          return { ok: false, error: error.message };
        }
        if (error && faltaTabla(error)) {
          emitirEvento({ sucursal: suc, desde, hasta, registro: null });
          return { ok: true, borrado: true, aviso: AVISO_FALTA_RESULTADOS_INV_SQL, sinTabla: true };
        }
      } catch (e) {
        return { ok: false, error: e?.message || String(e) };
      }
    }
    emitirEvento({ sucursal: suc, desde, hasta, registro: null });
    return { ok: true, borrado: true };
  }

  const calc = calcularMermaYEfectividad(valor, valorSistema, valorContadoSistema);
  const updated_at = new Date().toISOString();
  const registro = {
    sucursal_id: suc,
    desde,
    hasta,
    valor_contado: calc.valorManual,
    valor_sistema: calc.valorSistema,
    valor_contado_sistema: calc.valorContadoSistema,
    valor_faltante: calc.faltante,
    pct_merma: calc.pctMerma,
    pct_efectividad: calc.pctEfectividad,
    usuario: usuario || null,
    nota: nota || null,
    updated_at,
  };

  escribirLocal(clave, { ...registro, fuente: 'local' });

  if (!supabase) {
    emitirEvento({ sucursal: suc, desde, hasta, registro });
    return { ok: true, registro: { ...registro, fuente: 'local' } };
  }

  try {
    const { data, error } = await supabase
      .from('pos_resultados_inventario')
      .upsert(registro, { onConflict: 'sucursal_id,desde,hasta' })
      .select('*')
      .maybeSingle();

    if (error) {
      if (faltaTabla(error)) {
        emitirEvento({ sucursal: suc, desde, hasta, registro });
        return {
          ok: true,
          registro: { ...registro, fuente: 'local' },
          aviso: AVISO_FALTA_RESULTADOS_INV_SQL,
          sinTabla: true,
        };
      }
      return { ok: false, error: error.message, registro: { ...registro, fuente: 'local' } };
    }

    const guardado = normalizarRegistro(data || registro, { sucursal: suc, desde, hasta });
    escribirLocal(clave, { ...guardado, fuente: 'nube' });
    emitirEvento({ sucursal: suc, desde, hasta, registro: guardado });
    return { ok: true, registro: { ...guardado, fuente: 'nube' } };
  } catch (e) {
    emitirEvento({ sucursal: suc, desde, hasta, registro });
    return { ok: false, error: e?.message || String(e), registro: { ...registro, fuente: 'local' } };
  }
}

/**
 * Busca el resultado de inventario que aplica al periodo del bono (solapamiento de fechas).
 * Preferencia: coincidencia exacta de rango → mayor solape → más reciente.
 */
export async function resultadoInventarioParaBono(supabase, { sucursal, desde, hasta } = {}) {
  const suc = normalizarCodigoTienda(sucursal);
  if (!suc || !desde || !hasta) return { ok: true, registro: null };

  const exacto = await cargarResultadoInventario(supabase, { sucursal: suc, desde, hasta });
  if (exacto.registro) return exacto;

  if (!supabase) {
    // Escaneo local: cualquier clave de esta tienda que solape el periodo
    const candidatos = [];
    try {
      for (let i = 0; i < localStorage.length; i += 1) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith(`${LS_RESULTADO_INV_PREFIX}${suc}_`)) continue;
        // suc_desde_hasta — fechas YYYY-MM-DD al final de la clave
        const match = k.match(new RegExp(`^${LS_RESULTADO_INV_PREFIX}${suc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}_(\\d{4}-\\d{2}-\\d{2})_(\\d{4}-\\d{2}-\\d{2})$`));
        if (!match) continue;
        const d0 = match[1];
        const d1 = match[2];
        if (d1 < desde || d0 > hasta) continue;
        const reg = normalizarRegistro(leerLocalRaw(k), { sucursal: suc, desde: d0, hasta: d1 });
        if (reg) candidatos.push(reg);
      }
    } catch {
      /* ignore */
    }
    if (!candidatos.length) return { ok: true, registro: null };
    candidatos.sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
    return { ok: true, registro: { ...candidatos[0], fuente: 'local' } };
  }

  try {
    const { data, error } = await supabase
      .from('pos_resultados_inventario')
      .select('*')
      .eq('sucursal_id', suc)
      .lte('desde', hasta)
      .gte('hasta', desde)
      .order('updated_at', { ascending: false })
      .limit(20);

    if (error) {
      if (faltaTabla(error)) {
        return { ok: true, registro: null, aviso: AVISO_FALTA_RESULTADOS_INV_SQL, sinTabla: true };
      }
      return { ok: false, error: error.message, registro: null };
    }

    const rows = (data || [])
      .map((r) => normalizarRegistro(r))
      .filter(Boolean);
    if (!rows.length) return { ok: true, registro: null };

    // Preferir el que más días solapa con el periodo del bono
    const score = (r) => {
      const a = r.desde > desde ? r.desde : desde;
      const b = r.hasta < hasta ? r.hasta : hasta;
      if (b < a) return 0;
      const dias = Math.round((new Date(`${b}T12:00:00`) - new Date(`${a}T12:00:00`)) / 864e5) + 1;
      const exact = r.desde === desde && r.hasta === hasta ? 1000 : 0;
      return exact + dias;
    };
    rows.sort((a, b) => score(b) - score(a) || String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
    return { ok: true, registro: { ...rows[0], fuente: 'nube' } };
  } catch (e) {
    return { ok: false, error: e?.message || String(e), registro: null };
  }
}
