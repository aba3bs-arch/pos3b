import { indiceEmpleados, resolverClaveEmpleado } from './nominaMatch.js';
import { gastoDescuentaNomina } from './corteContabilidad/catalogoGastos.js';

export const MODULOS_CORTE_NOMINA = ['virtual', 'abarrotes', 'garage'];

export function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Gastos de cortes que deben descontarse en nómina (CONSUMO + vales consumo). */
export function gastoCuentaEnNomina(g) {
  if (gastoDescuentaNomina(g.modulo, g.categoria)) return true;
  const cat = String(g.categoria || '').trim().toUpperCase();
  if (cat !== 'VALES') return false;
  const sub = String(g.subcategoria || '').trim().toUpperCase();
  return sub.includes('CONSUMO') || sub.includes('PERSONAL');
}

function gastoAprobadoParaNomina(g) {
  const est = g.estado_aprobacion || 'aprobado';
  return est === 'aprobado';
}

/** Suma gastos de cortes (virtual, abarrotes, garage) por empleado en un periodo. */
export async function gastosDeduccionPorEmpleado(supabase, { sucursal, desde, hasta, empleados = [] }) {
  if (!supabase) return { map: {}, error: null };
  const finTs = `${hasta}T23:59:59`;
  const indice = indiceEmpleados(empleados);

  const { data, error } = await supabase
    .from('cortes_contabilidad_gastos')
    .select(
      'usuario_id, usuario_nombre, monto, categoria, subcategoria, comentario, modulo, created_at, estado_aprobacion, descontado_nomina',
    )
    .eq('sucursal_id', sucursal || 'MAIN')
    .eq('descontado_nomina', false)
    .gte('created_at', desde)
    .lte('created_at', finTs);

  if (error) {
    if (error.code === '42P01' || String(error.message).includes('descontado_nomina')) {
      const { data: d2, error: e2 } = await supabase
        .from('cortes_contabilidad_gastos')
        .select('usuario_id, usuario_nombre, monto, categoria, subcategoria, comentario, modulo, created_at, estado_aprobacion')
        .eq('sucursal_id', sucursal || 'MAIN')
        .gte('created_at', desde)
        .lte('created_at', finTs);
      if (e2) return { map: {}, error: e2.message };
      return { map: agruparGastosPorEmpleado(d2, indice), error: null };
    }
    return { map: {}, error: error.message };
  }
  return { map: agruparGastosPorEmpleado(data, indice), error: null };
}

function agruparGastosPorEmpleado(rows, indice) {
  const map = {};
  for (const g of rows || []) {
    if (!gastoCuentaEnNomina(g)) continue;
    if (!gastoAprobadoParaNomina(g)) continue;
    const clave = resolverClaveEmpleado(g, indice);
    if (!clave) continue;
    if (!map[clave]) map[clave] = { total: 0, detalle: [], porModulo: {} };
    const m = Number(g.monto) || 0;
    map[clave].total = round2(map[clave].total + m);
    map[clave].detalle.push(g);
    const mod = g.modulo || 'virtual';
    map[clave].porModulo[mod] = round2((map[clave].porModulo[mod] || 0) + m);
  }
  return map;
}

export async function marcarGastosDescontadosNomina(supabase, { sucursal, desde, hasta, periodoId, empleados = [] }) {
  if (!supabase || !periodoId) return { ok: true };
  const finTs = `${hasta}T23:59:59`;
  const indice = indiceEmpleados(empleados);
  const claves = new Set(Object.keys(indice.porId));

  const { data, error: eRead } = await supabase
    .from('cortes_contabilidad_gastos')
    .select('id, usuario_id, usuario_nombre, categoria, subcategoria, modulo, estado_aprobacion')
    .eq('sucursal_id', sucursal || 'MAIN')
    .eq('descontado_nomina', false)
    .gte('created_at', desde)
    .lte('created_at', finTs);

  if (eRead) {
    if (String(eRead.message).includes('descontado_nomina')) return { ok: true };
    return { ok: false, error: eRead.message };
  }

  const ids = (data || [])
    .filter((g) => {
      if (!gastoCuentaEnNomina(g)) return false;
      if (!gastoAprobadoParaNomina(g)) return false;
      const clave = resolverClaveEmpleado(g, indice);
      return clave && claves.has(clave);
    })
    .map((g) => g.id);

  if (!ids.length) return { ok: true };

  const payload = { descontado_nomina: true, periodo_nomina_id: periodoId };
  const { error } = await supabase.from('cortes_contabilidad_gastos').update(payload).in('id', ids);
  if (error && !String(error.message).includes('descontado_nomina')) return { ok: false, error: error.message };
  return { ok: true };
}
