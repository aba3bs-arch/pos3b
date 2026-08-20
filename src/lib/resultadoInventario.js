/**
 * Resultado manual de inventario para el bono.
 *
 * Campos:
 * 1. Total de inventario (manual — solo Admin/Auditor)
 * 2. Faltante de inventario (manual — solo Admin/Auditor)
 * 2b. Bonificación (manual — solo Admin/Auditor; se descuenta del faltante)
 * 3. Inv. después del ajuste (auto) = total − faltante neto
 * 4. Merma % (auto) = faltante neto ÷ total × 100
 *    faltante neto = max(0, faltante − bonificación)
 *
 * Persistencia: localStorage + nube pos_resultados_inventario.
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

export function parseNumInventario(raw) {
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
 * Calcula campos automáticos a partir de total, faltante y bonificación.
 * Bonificación se descuenta del faltante (faltante neto) para merma y bono.
 */
export function calcularResultadoInventarioCampos(totalInventario, faltante, bonificacion = 0) {
  const total = Number(totalInventario);
  const fal = Number(faltante);
  const bonRaw = Number(bonificacion);
  const bon = Number.isFinite(bonRaw) ? round2(Math.max(0, bonRaw)) : 0;

  if (!Number.isFinite(total) || !Number.isFinite(fal)) {
    return {
      totalInventario: Number.isFinite(total) ? round2(total) : null,
      faltante: Number.isFinite(fal) ? round2(Math.max(0, fal)) : null,
      bonificacion: bon,
      faltanteNeto: null,
      invDespuesAjuste: null,
      pctMerma: null,
    };
  }

  const totalR = round2(total);
  const falR = round2(Math.max(0, fal));
  const faltanteNeto = round2(Math.max(0, falR - bon));
  const invDespues = round2(totalR - faltanteNeto);
  const pctMerma = totalR > 0
    ? round2((faltanteNeto / totalR) * 100)
    : (faltanteNeto > 0 ? 100 : 0);

  return {
    totalInventario: totalR,
    faltante: falR,
    bonificacion: bon,
    faltanteNeto,
    invDespuesAjuste: invDespues,
    pctMerma,
  };
}

/** @deprecated usar calcularResultadoInventarioCampos */
export function calcularMermaYEfectividad(valorManual, valorSistema) {
  const total = Number.isFinite(Number(valorSistema)) ? Number(valorSistema) : Number(valorManual);
  const faltante = Number.isFinite(Number(valorSistema)) && Number.isFinite(Number(valorManual))
    ? Math.max(0, Number(valorSistema) - Number(valorManual))
    : null;
  const c = calcularResultadoInventarioCampos(total, faltante, 0);
  return {
    valorManual: c.totalInventario,
    valorSistema: c.totalInventario,
    valorContadoSistema: null,
    diferenciaManualVsSistema: null,
    faltante: c.faltante,
    pctMerma: c.pctMerma,
    invDespuesAjuste: c.invDespuesAjuste,
    bonificacion: c.bonificacion,
    faltanteNeto: c.faltanteNeto,
    diferenciaConteoVsManual: null,
    pctEfectividad: null,
  };
}

function leerLocalRaw(clave) {
  try {
    const raw = localStorage.getItem(clave);
    if (raw == null) return null;
    // Compat: versiones anteriores guardaban solo el número como string (= total)
    if (/^\s*-?\d+(\.\d+)?\s*$/.test(raw) || (raw[0] !== '{' && raw[0] !== '[')) {
      const n = parseNumInventario(raw);
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
  const total = parseNumInventario(
    row.valor_contado ?? row.valorContado ?? row.total_inventario ?? row.totalInventario,
  );
  if (total == null) return null;

  let faltante = parseNumInventario(row.valor_faltante ?? row.valorFaltante ?? row.faltante);
  // Compat: si solo había total contado vs sistema, reconstruir faltante
  if (faltante == null) {
    const sistema = parseNumInventario(row.valor_sistema ?? row.valorSistema);
    if (sistema != null && sistema >= total) faltante = round2(sistema - total);
  }

  const bonificacion = parseNumInventario(
    row.valor_bonificacion ?? row.valorBonificacion ?? row.bonificacion,
  ) ?? 0;

  const calc = calcularResultadoInventarioCampos(total, faltante ?? 0, bonificacion);
  const invDespues = parseNumInventario(
    row.valor_despues_ajuste ?? row.valorDespuesAjuste ?? row.invDespuesAjuste,
  );

  return {
    id: row.id || null,
    sucursal_id: normalizarCodigoTienda(row.sucursal_id || sucursal) || '',
    desde: String(row.desde || desde || '').slice(0, 10),
    hasta: String(row.hasta || hasta || '').slice(0, 10),
    /** Campo 1 — total de inventario (manual) */
    valor_contado: calc.totalInventario,
    total_inventario: calc.totalInventario,
    /** Campo 2 — faltante bruto (manual) */
    valor_faltante: faltante != null ? calc.faltante : null,
    /** Bonificación (manual; se descuenta del faltante) */
    valor_bonificacion: calc.bonificacion,
    /** Faltante neto = faltante − bonificación */
    valor_faltante_neto: calc.faltanteNeto,
    /** Campo 3 — inv. después del ajuste (auto) */
    valor_despues_ajuste: invDespues != null ? round2(invDespues) : calc.invDespuesAjuste,
    /** Campo 4 — merma % (auto, sobre faltante neto) */
    pct_merma: calc.pctMerma,
    valor_sistema: parseNumInventario(row.valor_sistema ?? row.valorSistema),
    valor_contado_sistema: parseNumInventario(row.valor_contado_sistema ?? row.valorContadoSistema),
    pct_efectividad: parseNumInventario(row.pct_efectividad ?? row.pctEfectividad),
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
 * Guarda (o borra si total y faltante vacíos) el resultado manual.
 * Requiere tienda concreta (no "Todas"). Solo Admin/Auditor deben llamarlo.
 *
 * @param {object} opts
 * @param {string|number} opts.totalInventario — Campo 1 (manual)
 * @param {string|number} opts.faltante — Campo 2 (manual)
 * @param {string|number} [opts.bonificacion] — Bonificación (manual; descuenta del faltante)
 */
export async function guardarResultadoInventario(supabase, {
  sucursal,
  desde,
  hasta,
  totalInventario,
  faltante,
  bonificacion = 0,
  /** Compat API anterior */
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
  const total = parseNumInventario(totalInventario ?? valorContado);
  const fal = parseNumInventario(faltante);
  const bon = parseNumInventario(bonificacion) ?? 0;

  if (total == null && fal == null) {
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

  if (total == null) {
    return { ok: false, error: 'Captura el total de inventario (campo 1).' };
  }
  if (fal == null) {
    return { ok: false, error: 'Captura el faltante de inventario (campo 2).' };
  }
  if (fal < 0) {
    return { ok: false, error: 'El faltante no puede ser negativo.' };
  }
  if (fal > total) {
    return { ok: false, error: 'El faltante no puede ser mayor que el total de inventario.' };
  }
  if (bon < 0) {
    return { ok: false, error: 'La bonificación no puede ser negativa.' };
  }

  const calc = calcularResultadoInventarioCampos(total, fal, bon);
  const updated_at = new Date().toISOString();
  const registro = {
    sucursal_id: suc,
    desde,
    hasta,
    valor_contado: calc.totalInventario,
    valor_sistema: parseNumInventario(valorSistema),
    valor_contado_sistema: parseNumInventario(valorContadoSistema),
    valor_faltante: calc.faltante,
    valor_bonificacion: calc.bonificacion,
    valor_despues_ajuste: calc.invDespuesAjuste,
    pct_merma: calc.pctMerma,
    pct_efectividad: null,
    usuario: usuario || null,
    nota: nota || null,
    updated_at,
  };

  escribirLocal(clave, {
    ...registro,
    valor_faltante_neto: calc.faltanteNeto,
    fuente: 'local',
  });

  if (!supabase) {
    emitirEvento({ sucursal: suc, desde, hasta, registro });
    return {
      ok: true,
      registro: {
        ...registro,
        valor_faltante_neto: calc.faltanteNeto,
        fuente: 'local',
      },
    };
  }

  try {
    const { data, error } = await supabase
      .from('pos_resultados_inventario')
      .upsert(registro, { onConflict: 'sucursal_id,desde,hasta' })
      .select('*')
      .maybeSingle();

    if (error) {
      const msg = String(error.message || '').toLowerCase();
      // Reintentar sin columnas nuevas si aún no se ejecutó el SQL actualizado
      if (msg.includes('valor_bonificacion') || msg.includes('valor_despues_ajuste')) {
        const sinCols = { ...registro };
        if (msg.includes('valor_bonificacion') || true) {
          // intentar primero sin bonificacion; luego sin despues_ajuste si hace falta
        }
        delete sinCols.valor_bonificacion;
        let retry = await supabase
          .from('pos_resultados_inventario')
          .upsert(sinCols, { onConflict: 'sucursal_id,desde,hasta' })
          .select('*')
          .maybeSingle();
        if (retry.error && String(retry.error.message || '').toLowerCase().includes('valor_despues_ajuste')) {
          delete sinCols.valor_despues_ajuste;
          retry = await supabase
            .from('pos_resultados_inventario')
            .upsert(sinCols, { onConflict: 'sucursal_id,desde,hasta' })
            .select('*')
            .maybeSingle();
        }
        if (!retry.error) {
          const guardado = normalizarRegistro(
            { ...(retry.data || registro), valor_bonificacion: calc.bonificacion },
            { sucursal: suc, desde, hasta },
          );
          escribirLocal(clave, { ...guardado, fuente: 'nube' });
          emitirEvento({ sucursal: suc, desde, hasta, registro: guardado });
          return {
            ok: true,
            registro: { ...guardado, fuente: 'nube' },
            aviso: 'Faltan columnas nuevas: vuelve a ejecutar supabase/fix_resultados_inventario.sql',
          };
        }
      }
      if (faltaTabla(error)) {
        emitirEvento({ sucursal: suc, desde, hasta, registro });
        return {
          ok: true,
          registro: {
            ...registro,
            valor_faltante_neto: calc.faltanteNeto,
            fuente: 'local',
          },
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
    return {
      ok: false,
      error: e?.message || String(e),
      registro: {
        ...registro,
        valor_faltante_neto: calc.faltanteNeto,
        fuente: 'local',
      },
    };
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
  if (exacto.registro?.pct_merma != null) return exacto;

  if (!supabase) {
    const candidatos = [];
    try {
      for (let i = 0; i < localStorage.length; i += 1) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith(`${LS_RESULTADO_INV_PREFIX}${suc}_`)) continue;
        const match = k.match(new RegExp(`^${LS_RESULTADO_INV_PREFIX}${suc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}_(\\d{4}-\\d{2}-\\d{2})_(\\d{4}-\\d{2}-\\d{2})$`));
        if (!match) continue;
        const d0 = match[1];
        const d1 = match[2];
        if (d1 < desde || d0 > hasta) continue;
        const reg = normalizarRegistro(leerLocalRaw(k), { sucursal: suc, desde: d0, hasta: d1 });
        if (reg?.pct_merma != null) candidatos.push(reg);
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
      .filter((r) => r && r.pct_merma != null);
    if (!rows.length) return { ok: true, registro: null };

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
