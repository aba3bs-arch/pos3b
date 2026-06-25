export function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Suma gastos de cortes por empleado en un periodo (sáb–vie). */
export async function gastosDeduccionPorEmpleado(supabase, { sucursal, desde, hasta }) {
  if (!supabase) return { map: {}, error: null };
  const finTs = `${hasta}T23:59:59`;
  const { data, error } = await supabase
    .from('cortes_contabilidad_gastos')
    .select('usuario_id, monto, categoria, subcategoria, comentario, modulo, created_at')
    .eq('sucursal_id', sucursal || 'MAIN')
    .eq('descontado_nomina', false)
    .gte('created_at', desde)
    .lte('created_at', finTs)
    .not('usuario_id', 'is', null);

  if (error) {
    if (error.code === '42P01' || String(error.message).includes('descontado_nomina')) {
      const { data: d2, error: e2 } = await supabase
        .from('cortes_contabilidad_gastos')
        .select('usuario_id, monto, categoria, subcategoria, comentario, modulo, created_at')
        .eq('sucursal_id', sucursal || 'MAIN')
        .gte('created_at', desde)
        .lte('created_at', finTs)
        .not('usuario_id', 'is', null);
      if (e2) return { map: {}, error: e2.message };
      return { map: agruparGastos(d2), error: null };
    }
    return { map: {}, error: error.message };
  }
  return { map: agruparGastos(data), error: null };
}

function agruparGastos(rows) {
  const map = {};
  for (const g of rows || []) {
    const uid = String(g.usuario_id);
    if (!map[uid]) map[uid] = { total: 0, detalle: [] };
    const m = Number(g.monto) || 0;
    map[uid].total = round2(map[uid].total + m);
    map[uid].detalle.push(g);
  }
  return map;
}

export async function marcarGastosDescontadosNomina(supabase, { sucursal, desde, hasta, periodoId }) {
  if (!supabase || !periodoId) return { ok: true };
  const finTs = `${hasta}T23:59:59`;
  const payload = { descontado_nomina: true, periodo_nomina_id: periodoId };
  let q = supabase
    .from('cortes_contabilidad_gastos')
    .update(payload)
    .eq('sucursal_id', sucursal || 'MAIN')
    .eq('descontado_nomina', false)
    .gte('created_at', desde)
    .lte('created_at', finTs)
    .not('usuario_id', 'is', null);
  const { error } = await q;
  if (error && !String(error.message).includes('descontado_nomina')) return { ok: false, error: error.message };
  return { ok: true };
}
