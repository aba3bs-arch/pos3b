/**
 * Capital para gastos del vendedor de ruta.
 * Flujo: solicitar → admin libera → vendedor justifica con foto del ticket.
 */

import { AVISO_FALTA_CUENTAS_RUTA, puedeAdministrarVentaRuta, registrarEgresoEfectivoRuta } from './rutaCuentas.js';

const LS_CAPITAL = 'pos3b_ruta_capital_solicitudes';

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function faltaTabla(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return error?.code === '42P01' || msg.includes('schema cache') || msg.includes('does not exist') || msg.includes('ruta_capital');
}

function leerLocal() {
  try {
    const j = JSON.parse(localStorage.getItem(LS_CAPITAL) || '[]');
    return Array.isArray(j) ? j : [];
  } catch {
    return [];
  }
}

function guardarLocal(lista) {
  try {
    localStorage.setItem(LS_CAPITAL, JSON.stringify(lista.slice(0, 1000)));
  } catch {
    /* ignore */
  }
}

function uid() {
  return `cap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function listarCapitalRuta(supabase, { estado, vendedorId, limit = 100 } = {}) {
  if (!supabase) {
    let list = leerLocal();
    if (estado) list = list.filter((r) => r.estado === estado);
    if (vendedorId) list = list.filter((r) => String(r.vendedor_id) === String(vendedorId));
    return { data: list.slice(0, limit) };
  }
  let q = supabase.from('ruta_capital_solicitudes').select('*').order('created_at', { ascending: false }).limit(limit);
  if (estado) q = q.eq('estado', estado);
  if (vendedorId) q = q.eq('vendedor_id', String(vendedorId));
  const { data, error } = await q;
  if (error && faltaTabla(error)) {
    let list = leerLocal();
    if (estado) list = list.filter((r) => r.estado === estado);
    if (vendedorId) list = list.filter((r) => String(r.vendedor_id) === String(vendedorId));
    return { data: list.slice(0, limit), aviso: AVISO_FALTA_CUENTAS_RUTA };
  }
  if (error) return { data: [], error: error.message };
  return { data: data || [] };
}

export async function solicitarCapitalRuta(supabase, { monto, motivo, vendedorId, vendedorNombre } = {}) {
  const m = round2(monto);
  if (!(m > 0)) return { ok: false, error: 'Indica un monto válido.' };
  const nombre = String(vendedorNombre || '').trim();
  if (!nombre) return { ok: false, error: 'Falta el nombre del vendedor.' };
  const row = {
    vendedor_id: vendedorId != null ? String(vendedorId) : null,
    vendedor_nombre: nombre,
    monto: m,
    motivo: String(motivo || '').trim() || null,
    estado: 'pendiente',
  };
  if (!supabase) {
    const full = { ...row, id: uid(), created_at: new Date().toISOString() };
    const list = leerLocal();
    list.unshift(full);
    guardarLocal(list);
    return { ok: true, data: full, soloLocal: true };
  }
  const { data, error } = await supabase.from('ruta_capital_solicitudes').insert([row]).select('*').single();
  if (error && faltaTabla(error)) return solicitarCapitalRuta(null, { monto, motivo, vendedorId, vendedorNombre });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data };
}

export async function liberarCapitalRuta(supabase, { id, rol, liberadoPor } = {}) {
  if (!puedeAdministrarVentaRuta(rol)) {
    return { ok: false, error: 'Solo administrador o gerente pueden liberar capital.' };
  }
  if (!id) return { ok: false, error: 'Solicitud inválida.' };

  let sol;
  if (!supabase || String(id).startsWith('cap_')) {
    sol = leerLocal().find((r) => String(r.id) === String(id));
  } else {
    const { data, error } = await supabase.from('ruta_capital_solicitudes').select('*').eq('id', id).maybeSingle();
    if (error && faltaTabla(error)) {
      sol = leerLocal().find((r) => String(r.id) === String(id));
    } else if (error) return { ok: false, error: error.message };
    else sol = data;
  }
  if (!sol) return { ok: false, error: 'Solicitud no encontrada.' };
  if (String(sol.estado) !== 'pendiente') return { ok: false, error: 'La solicitud no está pendiente.' };

  const egreso = await registrarEgresoEfectivoRuta(supabase, {
    monto: sol.monto,
    origen: 'capital',
    refTabla: 'ruta_capital_solicitudes',
    refId: sol.id,
    notas: `Capital liberado · ${sol.vendedor_nombre}${sol.motivo ? ` · ${sol.motivo}` : ''}`,
    usuarioNombre: liberadoPor,
  });
  if (!egreso.ok) return egreso;

  const patch = {
    estado: 'liberado',
    liberado_por: liberadoPor || null,
    liberado_at: new Date().toISOString(),
  };

  if (!supabase || String(id).startsWith('cap_')) {
    const list = leerLocal().map((r) => (String(r.id) === String(id) ? { ...r, ...patch } : r));
    guardarLocal(list);
    return { ok: true, data: list.find((r) => String(r.id) === String(id)), aviso: egreso.aviso };
  }
  const { data, error } = await supabase.from('ruta_capital_solicitudes').update(patch).eq('id', id).select('*').single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data, aviso: egreso.aviso };
}

export async function rechazarCapitalRuta(supabase, { id, rol, rechazadoPor, motivo } = {}) {
  if (!puedeAdministrarVentaRuta(rol)) {
    return { ok: false, error: 'Solo administrador o gerente pueden rechazar capital.' };
  }
  if (!id) return { ok: false, error: 'Solicitud inválida.' };
  const patch = {
    estado: 'rechazado',
    rechazado_por: rechazadoPor || null,
    rechazado_at: new Date().toISOString(),
    rechazo_motivo: String(motivo || '').trim() || null,
  };
  if (!supabase || String(id).startsWith('cap_')) {
    const list = leerLocal().map((r) => (String(r.id) === String(id) && r.estado === 'pendiente' ? { ...r, ...patch } : r));
    guardarLocal(list);
    return { ok: true, data: list.find((r) => String(r.id) === String(id)) };
  }
  const { data, error } = await supabase
    .from('ruta_capital_solicitudes')
    .update(patch)
    .eq('id', id)
    .eq('estado', 'pendiente')
    .select('*')
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data };
}

export async function justificarCapitalRuta(supabase, {
  id,
  fotoTicketUrl,
  notas,
  vendedorId,
  vendedorNombre,
} = {}) {
  if (!id) return { ok: false, error: 'Solicitud inválida.' };
  const foto = String(fotoTicketUrl || '').trim();
  if (!foto) return { ok: false, error: 'Sube la foto del ticket para justificar el gasto.' };

  let sol;
  if (!supabase || String(id).startsWith('cap_')) {
    sol = leerLocal().find((r) => String(r.id) === String(id));
  } else {
    const { data, error } = await supabase.from('ruta_capital_solicitudes').select('*').eq('id', id).maybeSingle();
    if (error && faltaTabla(error)) sol = leerLocal().find((r) => String(r.id) === String(id));
    else if (error) return { ok: false, error: error.message };
    else sol = data;
  }
  if (!sol) return { ok: false, error: 'Solicitud no encontrada.' };
  if (String(sol.estado) !== 'liberado') {
    return { ok: false, error: 'Solo se justifica capital ya liberado por administración.' };
  }
  if (vendedorId && sol.vendedor_id && String(sol.vendedor_id) !== String(vendedorId)) {
    return { ok: false, error: 'Esta solicitud pertenece a otro vendedor.' };
  }

  const patch = {
    estado: 'justificado',
    foto_ticket_url: foto,
    justificado_at: new Date().toISOString(),
    justificado_notas: String(notas || '').trim() || null,
  };

  if (!supabase || String(id).startsWith('cap_')) {
    const list = leerLocal().map((r) => (String(r.id) === String(id) ? { ...r, ...patch } : r));
    guardarLocal(list);
    return { ok: true, data: list.find((r) => String(r.id) === String(id)) };
  }
  const { data, error } = await supabase.from('ruta_capital_solicitudes').update(patch).eq('id', id).select('*').single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data, vendedorNombre };
}
