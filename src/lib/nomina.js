const LS_SUELDOS = 'pos3b_nomina_sueldos_default';

export function totalLineaNomina(linea) {
  const base = Number(linea.sueldo_base) || 0;
  const bon = Number(linea.bonificacion) || 0;
  const ded = Number(linea.deducciones) || 0;
  return Math.max(0, base + bon - ded);
}

export function leerSueldosDefault() {
  try {
    const raw = localStorage.getItem(LS_SUELDOS);
    const o = raw ? JSON.parse(raw) : {};
    return o && typeof o === 'object' ? o : {};
  } catch {
    return {};
  }
}

export function guardarSueldoDefault(usuarioId, monto) {
  const map = leerSueldosDefault();
  map[String(usuarioId)] = Number(monto) || 0;
  localStorage.setItem(LS_SUELDOS, JSON.stringify(map));
}

export function lineasDesdeEmpleados(empleados, sueldosMap = {}) {
  return (empleados || []).map((u) => {
    const sueldo = Number(sueldosMap[u.id] ?? leerSueldosDefault()[String(u.id)] ?? 0);
    const linea = {
      usuario_id: u.id,
      nombre: u.nombre || '—',
      rol: u.rol || '—',
      sueldo_base: sueldo,
      bonificacion: 0,
      deducciones: 0,
      notas: '',
    };
    return { ...linea, total: totalLineaNomina(linea) };
  });
}

export function faltaTablaNomina(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return (
    error?.code === '42P01' ||
    msg.includes('nomina_periodos') ||
    msg.includes('nomina_lineas') ||
    (msg.includes('schema cache') && msg.includes('nomina'))
  );
}

export const AVISO_FALTA_NOMINA =
  'Faltan tablas de nómina. En Supabase → SQL Editor ejecuta: supabase/fix_contabilidad.sql';

export async function listarPeriodosNomina(supabase, opts = {}) {
  if (!supabase) return { data: [], error: null, soloLocal: true };
  const { sucursal, limit = 30 } = opts;
  let q = supabase.from('nomina_periodos').select('*').order('periodo_fin', { ascending: false }).limit(limit);
  if (sucursal) q = q.eq('sucursal_id', sucursal);
  const { data, error } = await q;
  if (error && faltaTablaNomina(error)) {
    return { data: [], error: null, aviso: AVISO_FALTA_NOMINA, soloLocal: true };
  }
  return { data: data || [], error: error?.message || null, soloLocal: false };
}

export async function guardarPeriodoNomina(supabase, payload) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  const { periodo, lineas } = payload;
  const total = (lineas || []).reduce((a, l) => a + totalLineaNomina(l), 0);

  const { data: per, error: e1 } = await supabase
    .from('nomina_periodos')
    .insert([
      {
        sucursal_id: periodo.sucursal_id,
        periodo_inicio: periodo.periodo_inicio,
        periodo_fin: periodo.periodo_fin,
        estado: periodo.estado || 'cerrado',
        notas: periodo.notas || null,
        total,
        created_by: periodo.created_by || null,
      },
    ])
    .select('id')
    .single();

  if (e1) {
    if (faltaTablaNomina(e1)) return { ok: false, error: AVISO_FALTA_NOMINA };
    return { ok: false, error: e1.message };
  }

  const filas = (lineas || []).map((l) => ({
    periodo_id: per.id,
    usuario_id: l.usuario_id || null,
    nombre: l.nombre,
    rol: l.rol || null,
    sueldo_base: Number(l.sueldo_base) || 0,
    bonificacion: Number(l.bonificacion) || 0,
    deducciones: Number(l.deducciones) || 0,
    total: totalLineaNomina(l),
    notas: l.notas || null,
  }));

  for (const l of lineas || []) {
    if (l.usuario_id) guardarSueldoDefault(l.usuario_id, l.sueldo_base);
  }

  const { error: e2 } = await supabase.from('nomina_lineas').insert(filas);
  if (e2) return { ok: false, error: e2.message };
  return { ok: true, id: per.id, total };
}

export async function cargarLineasPeriodo(supabase, periodoId) {
  if (!supabase || !periodoId) return { data: [], error: null };
  const { data, error } = await supabase.from('nomina_lineas').select('*').eq('periodo_id', periodoId).order('nombre');
  return { data: data || [], error: error?.message || null };
}
