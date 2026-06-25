import { estadoDefault } from './calc.js';

export const AVISO_FALTA_CORTES =
  'Faltan tablas de cortes contabilidad. En Supabase → SQL Editor ejecuta: supabase/fix_cortes_contabilidad.sql';

const PREFIJOS = { virtual: 'V', abarrotes: 'AB', garage: 'G' };

function lsKey(sucursal, modulo, tipo) {
  return `pos3b_corte_${tipo}_${modulo}_${sucursal || 'MAIN'}`;
}

function faltaTabla(error, hint) {
  const msg = String(error?.message || error || '').toLowerCase();
  return error?.code === '42P01' || msg.includes(hint) || (msg.includes('schema cache') && msg.includes(hint));
}

export async function cargarEstadoCorte(supabase, sucursal, modulo) {
  const def = estadoDefault(modulo);
  if (!supabase) {
    try {
      const raw = localStorage.getItem(lsKey(sucursal, modulo, 'estado'));
      return { estado: raw ? { ...def, ...JSON.parse(raw) } : def, soloLocal: true };
    } catch {
      return { estado: def, soloLocal: true };
    }
  }
  const { data, error } = await supabase
    .from('cortes_contabilidad_estado')
    .select('estado')
    .eq('sucursal_id', sucursal || 'MAIN')
    .eq('modulo', modulo)
    .maybeSingle();
  if (error && faltaTabla(error, 'cortes_contabilidad')) {
    return { estado: def, aviso: AVISO_FALTA_CORTES, soloLocal: true };
  }
  if (error) return { estado: def, error: error.message };
  const estado = { ...def, ...(data?.estado || {}) };
  if (modulo === 'garage' && estado.maquinas) {
    estado.maquinas = { ...estadoDefault('garage').maquinas, ...estado.maquinas };
  }
  return { estado, soloLocal: false };
}

export async function guardarEstadoCorte(supabase, sucursal, modulo, estado) {
  if (!supabase) {
    localStorage.setItem(lsKey(sucursal, modulo, 'estado'), JSON.stringify(estado));
    return { ok: true, soloLocal: true };
  }
  const row = {
    sucursal_id: sucursal || 'MAIN',
    modulo,
    estado,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('cortes_contabilidad_estado').upsert(row, { onConflict: 'sucursal_id,modulo' });
  if (error && faltaTabla(error, 'cortes_contabilidad')) {
    localStorage.setItem(lsKey(sucursal, modulo, 'estado'), JSON.stringify(estado));
    return { ok: true, aviso: AVISO_FALTA_CORTES, soloLocal: true };
  }
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function listarGastosTurno(supabase, sucursal, modulo) {
  if (!supabase) {
    try {
      const raw = localStorage.getItem(lsKey(sucursal, modulo, 'gastos'));
      return { data: raw ? JSON.parse(raw) : [] };
    } catch {
      return { data: [] };
    }
  }
  const { data, error } = await supabase
    .from('cortes_contabilidad_gastos')
    .select('*')
    .eq('sucursal_id', sucursal || 'MAIN')
    .eq('modulo', modulo)
    .eq('cerrado', false)
    .order('created_at', { ascending: true });
  if (error && faltaTabla(error, 'cortes_contabilidad_gastos')) {
    try {
      const raw = localStorage.getItem(lsKey(sucursal, modulo, 'gastos'));
      return { data: raw ? JSON.parse(raw) : [], aviso: AVISO_FALTA_CORTES };
    } catch {
      return { data: [], aviso: AVISO_FALTA_CORTES };
    }
  }
  return { data: data || [], error: error?.message || null };
}

export async function agregarGastoTurno(supabase, sucursal, modulo, gasto) {
  const row = {
    sucursal_id: sucursal || 'MAIN',
    modulo,
    categoria: gasto.categoria || 'GENERAL',
    subcategoria: gasto.subcategoria || '',
    comentario: gasto.comentario || '',
    monto: Number(gasto.monto) || 0,
    usuario_id: gasto.usuario_id || null,
    usuario_nombre: gasto.usuario_nombre || null,
    cerrado: false,
  };
  if (!supabase) {
    const { data: prev } = await listarGastosTurno(null, sucursal, modulo);
    const next = [...(prev || []), { ...row, id: `local-${Date.now()}`, created_at: new Date().toISOString() }];
    localStorage.setItem(lsKey(sucursal, modulo, 'gastos'), JSON.stringify(next));
    return { ok: true, data: next };
  }
  const { data, error } = await supabase.from('cortes_contabilidad_gastos').insert([row]).select('*').single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data };
}

export async function eliminarGastoTurno(supabase, id, sucursal, modulo) {
  if (!supabase) {
    const { data: prev } = await listarGastosTurno(null, sucursal, modulo);
    const next = (prev || []).filter((g) => String(g.id) !== String(id));
    localStorage.setItem(lsKey(sucursal, modulo, 'gastos'), JSON.stringify(next));
    return { ok: true };
  }
  const { error } = await supabase.from('cortes_contabilidad_gastos').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function limpiarGastosTurno(supabase, sucursal, modulo) {
  if (!supabase) {
    localStorage.setItem(lsKey(sucursal, modulo, 'gastos'), '[]');
    return { ok: true };
  }
  const { error } = await supabase
    .from('cortes_contabilidad_gastos')
    .update({ cerrado: true })
    .eq('sucursal_id', sucursal || 'MAIN')
    .eq('modulo', modulo)
    .eq('cerrado', false);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function peekFolio(supabase, sucursal, modulo) {
  const prefijo = PREFIJOS[modulo] || 'X';
  if (!supabase) {
    const key = lsKey(sucursal, modulo, 'folio');
    const n = (Number(localStorage.getItem(key)) || 0) + 1;
    if (modulo === 'abarrotes') return `AB-${String(n).padStart(3, '0')}`;
    return `${prefijo}-${String(n).padStart(3, '0')}`;
  }
  const sid = sucursal || 'MAIN';
  const { data: row } = await supabase
    .from('cortes_contabilidad_folios')
    .select('ultimo')
    .eq('sucursal_id', sid)
    .eq('modulo', modulo)
    .maybeSingle();
  const n = (Number(row?.ultimo) || 0) + 1;
  if (modulo === 'abarrotes') return `AB-${String(n).padStart(3, '0')}`;
  return `${prefijo}-${String(n).padStart(3, '0')}`;
}

export async function siguienteFolio(supabase, sucursal, modulo) {
  const prefijo = PREFIJOS[modulo] || 'X';
  if (!supabase) {
    const key = lsKey(sucursal, modulo, 'folio');
    const n = (Number(localStorage.getItem(key)) || 0) + 1;
    localStorage.setItem(key, String(n));
    if (modulo === 'abarrotes') return `AB-${String(n).padStart(3, '0')}`;
    return `${prefijo}-${String(n).padStart(3, '0')}`;
  }
  const sid = sucursal || 'MAIN';
  const { data: row } = await supabase
    .from('cortes_contabilidad_folios')
    .select('ultimo')
    .eq('sucursal_id', sid)
    .eq('modulo', modulo)
    .maybeSingle();
  const ultimo = (Number(row?.ultimo) || 0) + 1;
  await supabase.from('cortes_contabilidad_folios').upsert(
    { sucursal_id: sid, modulo, ultimo, prefijo },
    { onConflict: 'sucursal_id,modulo' },
  );
  if (modulo === 'abarrotes') return `AB-${String(ultimo).padStart(3, '0')}`;
  return `${prefijo}-${String(ultimo).padStart(3, '0')}`;
}

export async function registrarCierreCorte(supabase, payload) {
  if (!supabase) {
    const key = lsKey(payload.sucursal_id, payload.modulo, 'historial');
    let hist = [];
    try {
      hist = JSON.parse(localStorage.getItem(key) || '[]');
    } catch {
      hist = [];
    }
    hist.unshift({ ...payload, id: `local-${Date.now()}`, created_at: new Date().toISOString() });
    localStorage.setItem(key, JSON.stringify(hist.slice(0, 100)));
    return { ok: true, soloLocal: true };
  }
  const { error } = await supabase.from('cortes_contabilidad_cierres').insert([payload]);
  if (error && faltaTabla(error, 'cortes_contabilidad_cierres')) {
    return { ok: false, error: AVISO_FALTA_CORTES };
  }
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function listarCierresCorte(supabase, sucursal, modulo, limit = 30) {
  if (!supabase) {
    try {
      const raw = localStorage.getItem(lsKey(sucursal, modulo, 'historial'));
      return { data: raw ? JSON.parse(raw).slice(0, limit) : [] };
    } catch {
      return { data: [] };
    }
  }
  const { data, error } = await supabase
    .from('cortes_contabilidad_cierres')
    .select('*')
    .eq('sucursal_id', sucursal || 'MAIN')
    .eq('modulo', modulo)
    .order('created_at', { ascending: false })
    .limit(limit);
  return { data: data || [], error: error?.message || null };
}
