/**
 * Crédito y cobranza de Venta en Ruta (cuentas por cobrar).
 */

import { conImpuesto, impuestoEfectivo } from './productoForm.js';

const LS_CXC = 'pos3b_ruta_cxc_movimientos';

export const AVISO_FALTA_CXC =
  'Falta la tabla de crédito/cobranza. En Supabase → SQL Editor ejecuta: supabase/fix_precio_ruta_y_cxc.sql';

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function faltaTabla(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return error?.code === '42P01' || msg.includes('ruta_cxc') || msg.includes('schema cache') || msg.includes('does not exist');
}

function leerLocal() {
  try {
    const j = JSON.parse(localStorage.getItem(LS_CXC) || '[]');
    return Array.isArray(j) ? j : [];
  } catch {
    return [];
  }
}

function guardarLocal(lista) {
  try {
    localStorage.setItem(LS_CXC, JSON.stringify(lista.slice(0, 3000)));
  } catch {
    /* ignore */
  }
}

function uid() {
  return `cxc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function claveCliente(tipo, id) {
  return `${String(tipo || 'sucursal')}:${String(id || '')}`;
}

/**
 * Precio CEDIS Ruta = precio de compra con impuestos del artículo.
 * No usa el precio de mostrador (venta). Fallback: compra sin + IVA, luego costo.
 */
export function precioCedisRuta(producto) {
  const con = Number(producto?.precio_compra_con);
  if (Number.isFinite(con) && con > 0) return round2(con);
  const sin = Number(producto?.precio_compra_sin);
  if (Number.isFinite(sin) && sin > 0) {
    return round2(conImpuesto(sin, impuestoEfectivo(producto?.impuesto)));
  }
  const costo = Number(producto?.costo);
  if (Number.isFinite(costo) && costo > 0) return round2(costo);
  return null;
}

export async function listarMovimientosCxc(supabase, { clienteTipo, clienteId, limit = 500 } = {}) {
  if (!supabase) {
    let list = leerLocal();
    if (clienteId) {
      list = list.filter(
        (m) => String(m.cliente_tipo) === String(clienteTipo || m.cliente_tipo) && String(m.cliente_id) === String(clienteId),
      );
    }
    return { data: list.slice(0, limit) };
  }
  let q = supabase.from('ruta_cxc_movimientos').select('*').order('created_at', { ascending: false }).limit(limit);
  if (clienteId) {
    q = q.eq('cliente_id', String(clienteId));
    if (clienteTipo) q = q.eq('cliente_tipo', clienteTipo);
  }
  const { data, error } = await q;
  if (error && faltaTabla(error)) {
    let list = leerLocal();
    if (clienteId) {
      list = list.filter(
        (m) => String(m.cliente_tipo) === String(clienteTipo || m.cliente_tipo) && String(m.cliente_id) === String(clienteId),
      );
    }
    return { data: list.slice(0, limit), aviso: AVISO_FALTA_CXC };
  }
  if (error) return { data: [], error: error.message };
  return { data: data || [] };
}

/** Saldo actual por cliente (cargos − abonos). */
export async function saldosCxcPorCliente(supabase) {
  const { data, error, aviso } = await listarMovimientosCxc(supabase, { limit: 3000 });
  if (error) return { data: [], error, aviso };
  const map = new Map();
  // Procesar del más antiguo al más reciente para saldo coherente, o sumar cargos/abonos
  const orden = [...(data || [])].sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
  for (const m of orden) {
    const k = claveCliente(m.cliente_tipo, m.cliente_id);
    if (!map.has(k)) {
      map.set(k, {
        cliente_tipo: m.cliente_tipo,
        cliente_id: m.cliente_id,
        cliente_nombre: m.cliente_nombre || m.cliente_id,
        cargos: 0,
        abonos: 0,
        saldo: 0,
      });
    }
    const row = map.get(k);
    const monto = round2(m.monto);
    if (m.tipo === 'cargo' || m.tipo === 'ajuste') {
      // ajuste positivo aumenta saldo
      if (m.tipo === 'ajuste' && Number(m.monto) < 0) {
        row.abonos = round2(row.abonos + Math.abs(monto));
      } else {
        row.cargos = round2(row.cargos + monto);
      }
    } else if (m.tipo === 'abono') {
      row.abonos = round2(row.abonos + monto);
    }
    if (m.cliente_nombre) row.cliente_nombre = m.cliente_nombre;
  }
  const out = [...map.values()].map((r) => ({
    ...r,
    saldo: round2(r.cargos - r.abonos),
  }));
  out.sort((a, b) => b.saldo - a.saldo || String(a.cliente_nombre).localeCompare(String(b.cliente_nombre), 'es'));
  return { data: out, aviso };
}

export async function saldoClienteCxc(supabase, clienteTipo, clienteId) {
  const { data } = await saldosCxcPorCliente(supabase);
  const row = (data || []).find(
    (r) => String(r.cliente_tipo) === String(clienteTipo) && String(r.cliente_id) === String(clienteId),
  );
  return round2(row?.saldo || 0);
}

async function insertarMovimiento(supabase, payload) {
  if (!supabase) {
    const list = leerLocal();
    const row = { ...payload, id: uid(), created_at: new Date().toISOString() };
    list.unshift(row);
    guardarLocal(list);
    return { ok: true, data: row, soloLocal: true };
  }
  const { data, error } = await supabase.from('ruta_cxc_movimientos').insert([payload]).select('*').single();
  if (error && faltaTabla(error)) {
    return insertarMovimiento(null, payload);
  }
  if (error) return { ok: false, error: error.message };
  return { ok: true, data };
}

/** Cargo por venta a crédito. */
export async function registrarCargoCreditoRuta(supabase, {
  clienteTipo,
  clienteId,
  clienteNombre,
  monto,
  ventaId,
  cargaId,
  usuarioNombre,
  notas,
} = {}) {
  const m = round2(monto);
  if (!(m > 0)) return { ok: false, error: 'Monto de crédito inválido.' };
  if (!clienteId) return { ok: false, error: 'Cliente inválido.' };
  const saldoAntes = await saldoClienteCxc(supabase, clienteTipo || 'sucursal', clienteId);
  const saldoDespues = round2(saldoAntes + m);
  return insertarMovimiento(supabase, {
    cliente_tipo: clienteTipo === 'externo' ? 'externo' : 'sucursal',
    cliente_id: String(clienteId),
    cliente_nombre: clienteNombre || String(clienteId),
    tipo: 'cargo',
    monto: m,
    saldo_despues: saldoDespues,
    venta_id: ventaId != null ? String(ventaId) : null,
    carga_id: cargaId != null ? String(cargaId) : null,
    metodo_pago: null,
    notas: notas || 'Venta en ruta a crédito',
    usuario_nombre: usuarioNombre || null,
  });
}

/** Abono / cobro de crédito. */
export async function registrarAbonoCobranzaRuta(supabase, {
  clienteTipo,
  clienteId,
  clienteNombre,
  monto,
  metodoPago = 'efectivo',
  notas,
  usuarioNombre,
} = {}) {
  const m = round2(monto);
  if (!(m > 0)) return { ok: false, error: 'Monto de cobro inválido.' };
  if (!clienteId) return { ok: false, error: 'Elige el cliente / sucursal.' };
  const saldoAntes = await saldoClienteCxc(supabase, clienteTipo || 'sucursal', clienteId);
  if (m > saldoAntes + 0.009) {
    return { ok: false, error: `El saldo por cobrar es ${saldoAntes.toFixed(2)}. No puedes cobrar más.` };
  }
  const saldoDespues = round2(saldoAntes - m);
  const mp = String(metodoPago || 'efectivo').toLowerCase();
  return insertarMovimiento(supabase, {
    cliente_tipo: clienteTipo === 'externo' ? 'externo' : 'sucursal',
    cliente_id: String(clienteId),
    cliente_nombre: clienteNombre || String(clienteId),
    tipo: 'abono',
    monto: m,
    saldo_despues: saldoDespues,
    venta_id: null,
    carga_id: null,
    metodo_pago: ['efectivo', 'transferencia', 'otro'].includes(mp) ? mp : 'efectivo',
    notas: notas || 'Cobranza de crédito',
    usuario_nombre: usuarioNombre || null,
  });
}
