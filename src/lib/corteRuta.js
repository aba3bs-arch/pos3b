/**
 * Corte de caja de Venta en Ruta (arqueo de ventas del camión).
 * Independiente del Corte de caja de tienda (tabla ventas / turnos).
 */

const LS = 'pos3b_cortes_ruta';

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function leerLocal() {
  try {
    const raw = localStorage.getItem(LS);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function guardarLocal(lista) {
  try {
    localStorage.setItem(LS, JSON.stringify(lista.slice(0, 200)));
  } catch {
    /* ignore */
  }
}

/** Extrae montos efectivo/crédito de una venta de ruta (incluye mixto). */
export function montosPagoVentaRuta(venta) {
  const mp = String(venta?.metodo_pago || '').toLowerCase();
  const total = round2(venta?.total);
  if (mp === 'efectivo') return { efectivo: total, credito: 0 };
  if (mp === 'credito') return { efectivo: 0, credito: total };
  if (mp === 'mixto') {
    const arts = Array.isArray(venta?.articulos) ? venta.articulos : [];
    const meta = arts.find((a) => a && a._pago_mixto);
    if (meta) {
      return {
        efectivo: round2(meta.efectivo),
        credito: round2(meta.credito),
      };
    }
    return { efectivo: 0, credito: total };
  }
  return { efectivo: 0, credito: 0 };
}

export function resumirVentasRutaParaCorte(ventas = []) {
  let tickets = 0;
  let total = 0;
  let efectivo = 0;
  let credito = 0;
  const porMetodo = { efectivo: 0, credito: 0, mixto: 0 };
  for (const v of ventas || []) {
    tickets += 1;
    total = round2(total + Number(v.total || 0));
    const m = montosPagoVentaRuta(v);
    efectivo = round2(efectivo + m.efectivo);
    credito = round2(credito + m.credito);
    const mp = String(v.metodo_pago || '').toLowerCase();
    if (mp === 'mixto') porMetodo.mixto = round2(porMetodo.mixto + Number(v.total || 0));
    else if (mp === 'credito') porMetodo.credito = round2(porMetodo.credito + Number(v.total || 0));
    else porMetodo.efectivo = round2(porMetodo.efectivo + Number(v.total || 0));
  }
  return {
    tickets,
    total,
    efectivoEsperado: efectivo,
    credito,
    porMetodo,
  };
}

export function listarCortesRutaLocal({ cargaId, vendedorId, limit = 40 } = {}) {
  let list = leerLocal();
  if (cargaId) list = list.filter((c) => String(c.carga_id) === String(cargaId));
  if (vendedorId) list = list.filter((c) => String(c.vendedor_id || '') === String(vendedorId));
  return list.slice(0, limit);
}

export function guardarCorteRutaLocal(row) {
  const id = row.id || `cruta_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const item = {
    id,
    created_at: row.created_at || new Date().toISOString(),
    fecha: row.fecha || new Date().toISOString().slice(0, 10),
    carga_id: row.carga_id || null,
    carga_folio: row.carga_folio || null,
    vendedor_id: row.vendedor_id || null,
    vendedor_nombre: row.vendedor_nombre || null,
    tickets: Number(row.tickets) || 0,
    total_ventas: round2(row.total_ventas),
    efectivo_esperado: round2(row.efectivo_esperado),
    credito: round2(row.credito),
    efectivo_contado: row.efectivo_contado == null || row.efectivo_contado === ''
      ? null
      : round2(row.efectivo_contado),
    diferencia:
      row.efectivo_contado == null || row.efectivo_contado === ''
        ? null
        : round2(Number(row.efectivo_contado) - Number(row.efectivo_esperado || 0)),
    por_metodo: row.por_metodo || {},
    notas: row.notas || '',
    usuario: row.usuario || null,
  };
  const prev = leerLocal().filter((c) => c.id !== id);
  guardarLocal([item, ...prev]);
  return { ok: true, corte: item };
}

export async function intentarGuardarCorteRutaNube(supabase, row) {
  if (!supabase) return { ok: false, localOnly: true };
  try {
    const { data, error } = await supabase
      .from('ruta_cortes_caja')
      .insert([{
        carga_id: row.carga_id || null,
        carga_folio: row.carga_folio || null,
        vendedor_id: row.vendedor_id || null,
        vendedor_nombre: row.vendedor_nombre || null,
        fecha: row.fecha,
        tickets: row.tickets,
        total_ventas: row.total_ventas,
        efectivo_esperado: row.efectivo_esperado,
        credito: row.credito,
        efectivo_contado: row.efectivo_contado,
        diferencia: row.diferencia,
        por_metodo: row.por_metodo || {},
        notas: row.notas || null,
        usuario: row.usuario || null,
      }])
      .select('*')
      .single();
    if (error) {
      // Tabla opcional: si no existe, solo local
      const msg = String(error.message || '').toLowerCase();
      if (error.code === '42P01' || msg.includes('does not exist') || msg.includes('schema cache')) {
        return { ok: false, localOnly: true, aviso: 'Corte guardado en este equipo (sin tabla nube ruta_cortes_caja).' };
      }
      return { ok: false, error: error.message };
    }
    return { ok: true, data };
  } catch (e) {
    return { ok: false, localOnly: true, error: e?.message };
  }
}
