/**
 * Crédito por cobrar de Venta en Ruta.
 * Cargos por venta a crédito; el cajero paga con PIN → gasto abarrotes + efectivo en tránsito.
 */

import { buscarUsuarioPorPinYSucursal } from './usuariosAuth.js';
import { normalizarRol, rolSistemaEfectivo } from './roles.js';
import { registrarEfectivoTransitoVentaRuta } from './rutaTransito.js';

const LS_CXC = 'pos3b_ruta_cxc_movimientos';

export const AVISO_FALTA_CXC =
  'Falta la tabla de crédito/cobranza. En Supabase ejecuta supabase/fix_autofin_y_venta_ruta_completo.sql (o fix_precio_ruta_y_cxc.sql + fix_venta_ruta_pos_v2.sql).';

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

/** @deprecated — usar precioRutaEspecial de ventaEnRuta.js */
export function precioCedisRuta(producto) {
  const p = Number(producto?.precio_ruta);
  if (Number.isFinite(p) && p > 0) return round2(p);
  return null;
}

export async function listarMovimientosCxc(supabase, { clienteTipo, clienteId, limit = 500, soloPendientes } = {}) {
  if (!supabase) {
    let list = leerLocal();
    if (clienteId) {
      list = list.filter(
        (m) => String(m.cliente_tipo) === String(clienteTipo || m.cliente_tipo) && String(m.cliente_id) === String(clienteId),
      );
    }
    if (soloPendientes) list = list.filter((m) => m.tipo === 'cargo' && String(m.estatus || 'pendiente') === 'pendiente');
    return { data: list.slice(0, limit) };
  }
  let q = supabase.from('ruta_cxc_movimientos').select('*').order('created_at', { ascending: false }).limit(limit);
  if (clienteId) {
    q = q.eq('cliente_id', String(clienteId));
    if (clienteTipo) q = q.eq('cliente_tipo', clienteTipo);
  }
  if (soloPendientes) {
    q = q.eq('tipo', 'cargo').eq('estatus', 'pendiente');
  }
  const { data, error } = await q;
  if (error && faltaTabla(error)) {
    let list = leerLocal();
    if (soloPendientes) list = list.filter((m) => m.tipo === 'cargo' && String(m.estatus || 'pendiente') === 'pendiente');
    return { data: list.slice(0, limit), aviso: AVISO_FALTA_CXC };
  }
  if (error && /estatus/i.test(String(error.message || ''))) {
    const retry = await supabase.from('ruta_cxc_movimientos').select('*').order('created_at', { ascending: false }).limit(limit);
    if (retry.error) return { data: [], error: retry.error.message };
    let rows = retry.data || [];
    if (soloPendientes) {
      rows = rows.filter((m) => m.tipo === 'cargo' && !m.pagado_at);
    }
    return { data: rows, aviso: AVISO_FALTA_CXC };
  }
  if (error) return { data: [], error: error.message };
  return { data: data || [] };
}

/** Créditos pendientes para el cajero (filtros folio / fecha / monto). */
export async function listarCreditosPendientesRuta(supabase, { sucursalId, folio, fechaDesde, fechaHasta, montoMin, montoMax, limit = 200 } = {}) {
  const { data, error, aviso } = await listarMovimientosCxc(supabase, { soloPendientes: true, limit: 1000 });
  if (error) return { data: [], error, aviso };
  let rows = (data || []).filter((m) => m.tipo === 'cargo' && String(m.estatus || 'pendiente') === 'pendiente');
  if (sucursalId) {
    const suc = String(sucursalId).toUpperCase();
    rows = rows.filter((m) => String(m.cliente_tipo) === 'sucursal' && String(m.cliente_id).toUpperCase() === suc);
  }
  if (folio) {
    const f = String(folio).trim().toUpperCase();
    rows = rows.filter((m) => String(m.folio_venta || m.notas || '').toUpperCase().includes(f) || String(m.venta_id || '').toUpperCase().includes(f));
  }
  if (fechaDesde) {
    rows = rows.filter((m) => String(m.created_at || '').slice(0, 10) >= fechaDesde);
  }
  if (fechaHasta) {
    rows = rows.filter((m) => String(m.created_at || '').slice(0, 10) <= fechaHasta);
  }
  if (montoMin != null && montoMin !== '') {
    rows = rows.filter((m) => Number(m.monto) >= Number(montoMin));
  }
  if (montoMax != null && montoMax !== '') {
    rows = rows.filter((m) => Number(m.monto) <= Number(montoMax));
  }
  return { data: rows.slice(0, limit), aviso };
}

/** Créditos ya cobrados (pagados con PIN de cajero) — reporte de consultas. */
export async function listarCreditosCobradosRuta(supabase, {
  sucursalId,
  folio,
  fechaDesde,
  fechaHasta,
  limit = 200,
} = {}) {
  const { data, error, aviso } = await listarMovimientosCxc(supabase, { limit: 2000 });
  if (error) return { data: [], error, aviso };
  let rows = (data || []).filter((m) => {
    if (m.tipo !== 'cargo') return false;
    const est = String(m.estatus || '').toLowerCase();
    if (est === 'pagado') return true;
    if (m.pagado_at) return true;
    return false;
  });
  if (sucursalId) {
    const suc = String(sucursalId).toUpperCase();
    rows = rows.filter((m) => String(m.cliente_tipo) === 'sucursal' && String(m.cliente_id).toUpperCase() === suc);
  }
  if (folio) {
    const f = String(folio).trim().toUpperCase();
    rows = rows.filter(
      (m) =>
        String(m.folio_venta || m.notas || '').toUpperCase().includes(f) ||
        String(m.venta_id || '').toUpperCase().includes(f),
    );
  }
  if (fechaDesde) {
    rows = rows.filter((m) => String(m.pagado_at || m.created_at || '').slice(0, 10) >= fechaDesde);
  }
  if (fechaHasta) {
    rows = rows.filter((m) => String(m.pagado_at || m.created_at || '').slice(0, 10) <= fechaHasta);
  }
  rows.sort((a, b) => String(b.pagado_at || b.created_at || '').localeCompare(String(a.pagado_at || a.created_at || '')));
  return { data: rows.slice(0, limit), aviso };
}

export async function saldosCxcPorCliente(supabase) {
  const { data, error, aviso } = await listarMovimientosCxc(supabase, { limit: 3000 });
  if (error) return { data: [], error, aviso };
  const map = new Map();
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
      if (m.tipo === 'ajuste' && Number(m.monto) < 0) row.abonos = round2(row.abonos + Math.abs(monto));
      else row.cargos = round2(row.cargos + monto);
    } else if (m.tipo === 'abono') {
      row.abonos = round2(row.abonos + monto);
    }
    if (m.cliente_nombre) row.cliente_nombre = m.cliente_nombre;
  }
  const out = [...map.values()].map((r) => ({ ...r, saldo: round2(r.cargos - r.abonos) }));
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
  if (error && faltaTabla(error)) return insertarMovimiento(null, payload);
  if (error && /estatus|folio_venta|pagado/i.test(String(error.message || ''))) {
    const slim = { ...payload };
    delete slim.estatus;
    delete slim.folio_venta;
    delete slim.pagado_por;
    delete slim.pagado_at;
    delete slim.gasto_id;
    const retry = await supabase.from('ruta_cxc_movimientos').insert([slim]).select('*').single();
    if (retry.error) return { ok: false, error: retry.error.message };
    return { ok: true, data: retry.data, aviso: AVISO_FALTA_CXC };
  }
  if (error) return { ok: false, error: error.message };
  return { ok: true, data };
}

export async function registrarCargoCreditoRuta(supabase, {
  clienteTipo,
  clienteId,
  clienteNombre,
  monto,
  ventaId,
  cargaId,
  folioVenta,
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
    folio_venta: folioVenta || null,
    metodo_pago: null,
    estatus: 'pendiente',
    notas: notas || 'Venta en ruta a crédito',
    usuario_nombre: usuarioNombre || null,
  });
}

/**
 * Verifica PIN de cajero en la sucursal (o admin).
 */
export async function verificarPinCajero(supabase, pin, sucursal) {
  const { user, error, avisoSucursal } = await buscarUsuarioPorPinYSucursal(supabase, pin, sucursal);
  if (error) return { ok: false, error };
  if (!user) {
    return { ok: false, error: avisoSucursal ? 'PIN no válido en esta sucursal.' : 'PIN incorrecto.' };
  }
  const r = rolSistemaEfectivo(user.rol);
  if (r !== 'Cajero' && r !== 'Administrador' && r !== 'Gerente' && normalizarRol(user.rol) !== 'Supervisor') {
    return { ok: false, error: 'Este PIN no es de cajero (ni admin/gerente).' };
  }
  return { ok: true, user };
}

/**
 * Reparte un monto a pagar entre cargos pendientes (FIFO por fecha).
 * Permite pago parcial del último cargo tocado.
 * @returns {{ ok: true, partes: Array<{ cargo: object, monto: number, parcial: boolean }> } | { ok: false, error: string }}
 */
export function repartirMontoEntreCargos(cargos, montoPagar) {
  const totalDisp = round2(
    (cargos || []).reduce((s, c) => s + (Number(c.monto) || 0), 0),
  );
  const monto = round2(montoPagar);
  if (!(monto > 0)) return { ok: false, error: 'Ingresa un monto mayor a 0.' };
  if (!(totalDisp > 0)) return { ok: false, error: 'No hay créditos pendientes en la selección.' };
  if (monto > totalDisp + 0.001) {
    return { ok: false, error: `El monto no puede superar el acumulado (${totalDisp.toFixed(2)}).` };
  }

  const orden = [...(cargos || [])].sort(
    (a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0)
      || String(a.id || '').localeCompare(String(b.id || '')),
  );
  let resto = monto;
  const partes = [];
  for (const cargo of orden) {
    if (resto <= 0.001) break;
    const cargoMonto = round2(cargo.monto);
    if (!(cargoMonto > 0)) continue;
    const aplica = round2(Math.min(resto, cargoMonto));
    if (!(aplica > 0)) continue;
    partes.push({ cargo, monto: aplica, parcial: aplica < cargoMonto - 0.001 });
    resto = round2(resto - aplica);
  }
  if (!partes.length) return { ok: false, error: 'No se pudo aplicar el monto a ningún crédito.' };
  return { ok: true, partes, montoAplicado: round2(monto - resto), totalDisponible: totalDisp };
}

/**
 * Cajero paga crédito(s) con PIN.
 * → gasto en corte abarrotes "credito liquidado"
 * → efectivo cobrado a tránsito
 * → marca CxC pagado + abono (o reduce saldo del cargo si es parcial)
 *
 * `montoPagar` opcional: paga solo esa cantidad (FIFO entre los cargos seleccionados).
 */
export async function pagarCreditosRutaConPin(supabase, {
  movimientoIds,
  pin,
  sucursal,
  /** Cajero ya autenticado al abrir el módulo (omite pedir PIN otra vez). */
  cajeroUser = null,
  /** Monto a liquidar (parcial permitido). Si se omite, paga todo lo seleccionado. */
  montoPagar = null,
} = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  const ids = [...new Set((movimientoIds || []).map(String).filter(Boolean))];
  if (!ids.length) return { ok: false, error: 'Selecciona al menos un crédito.' };
  let auth;
  if (cajeroUser?.id || cajeroUser?.nombre) {
    auth = { ok: true, user: cajeroUser };
  } else {
    auth = await verificarPinCajero(supabase, pin, sucursal);
    if (!auth.ok) return auth;
  }

  const { data: movs, error } = await supabase.from('ruta_cxc_movimientos').select('*').in('id', ids);
  if (error) return { ok: false, error: error.message };
  const pendientes = (movs || []).filter(
    (m) => m.tipo === 'cargo' && String(m.estatus || 'pendiente') === 'pendiente',
  );
  if (!pendientes.length) return { ok: false, error: 'No hay créditos pendientes en la selección.' };

  const totalSel = round2(pendientes.reduce((s, c) => s + (Number(c.monto) || 0), 0));
  const montoObj = montoPagar == null || montoPagar === ''
    ? totalSel
    : round2(montoPagar);
  const reparto = repartirMontoEntreCargos(pendientes, montoObj);
  if (!reparto.ok) return reparto;

  const resultados = [];
  for (const parte of reparto.partes) {
    const cargo = parte.cargo;
    const monto = parte.monto;
    const parcial = parte.parcial;
    const sucGasto = String(cargo.cliente_tipo) === 'sucursal' ? String(cargo.cliente_id) : sucursal;
    const folio = cargo.folio_venta || cargo.venta_id || cargo.id;
    const etiqueta = parcial ? 'credito liquidado parcial' : 'credito liquidado';

    // 1) Gasto en corte abarrotes
    const gastoPayload = {
      sucursal_id: sucGasto,
      modulo: 'abarrotes',
      categoria: 'CREDITO RUTA',
      subcategoria: 'LIQUIDADO',
      comentario: `${etiqueta} · ${folio} · ${cargo.cliente_nombre || ''}`.trim(),
      monto,
      usuario_nombre: auth.user?.nombre || null,
      cerrado: false,
      descontado_nomina: false,
      estado_aprobacion: 'aprobado',
      solicitado_por: auth.user?.nombre || null,
    };
    let { data: gasto, error: eGasto } = await supabase
      .from('cortes_contabilidad_gastos')
      .insert([gastoPayload])
      .select('id')
      .single();
    if (eGasto && /estado_aprobacion|solicitado_por|descontado_nomina/i.test(String(eGasto.message || ''))) {
      const slim = { ...gastoPayload };
      delete slim.estado_aprobacion;
      delete slim.solicitado_por;
      delete slim.descontado_nomina;
      ({ data: gasto, error: eGasto } = await supabase.from('cortes_contabilidad_gastos').insert([slim]).select('id').single());
    }
    if (eGasto) return { ok: false, error: `Gasto corte: ${eGasto.message}` };

    // 2) Efectivo cobrado → tránsito
    const tr = await registrarEfectivoTransitoVentaRuta(supabase, {
      sucursalOrigen: sucGasto,
      monto,
      folioVenta: `CXC-${folio}${parcial ? '-P' : ''}`,
      vendedorId: cargo.usuario_nombre || 'ruta',
      vendedorNombre: auth.user?.nombre,
      nota: `Crédito ${parcial ? 'parcial' : 'liquidado'} ${folio} · cajero ${auth.user?.nombre}`,
    });
    if (!tr.ok) return { ok: false, error: tr.error || 'No se registró en tránsito.' };

    // 3) Actualizar cargo + abono
    const saldoAntes = await saldoClienteCxc(supabase, cargo.cliente_tipo, cargo.cliente_id);
    const saldoDespues = round2(Math.max(0, saldoAntes - monto));
    const ahora = new Date().toISOString();

    if (parcial) {
      const restoCargo = round2(Number(cargo.monto) - monto);
      let { error: ePatch } = await supabase
        .from('ruta_cxc_movimientos')
        .update({
          monto: restoCargo,
          notas: `${cargo.notas || 'Venta en ruta a crédito'} · abono parcial ${monto.toFixed(2)}`.trim(),
        })
        .eq('id', cargo.id);
      if (ePatch) return { ok: false, error: ePatch.message };
    } else {
      const patchCargo = {
        estatus: 'pagado',
        pagado_por: auth.user?.nombre || null,
        pagado_at: ahora,
        gasto_id: gasto?.id || null,
      };
      let { error: ePatch } = await supabase.from('ruta_cxc_movimientos').update(patchCargo).eq('id', cargo.id);
      if (ePatch && /estatus|pagado|gasto_id/i.test(String(ePatch.message || ''))) {
        ePatch = null; // columnas faltantes: seguir con abono
      }
      if (ePatch) return { ok: false, error: ePatch.message };
    }

    await insertarMovimiento(supabase, {
      cliente_tipo: cargo.cliente_tipo,
      cliente_id: cargo.cliente_id,
      cliente_nombre: cargo.cliente_nombre,
      tipo: 'abono',
      monto,
      saldo_despues: saldoDespues,
      venta_id: cargo.venta_id,
      carga_id: cargo.carga_id,
      folio_venta: cargo.folio_venta || folio,
      metodo_pago: 'efectivo',
      estatus: 'pagado',
      notas: `Pago cajero · ${etiqueta} · ${folio}`,
      usuario_nombre: auth.user?.nombre || null,
      pagado_por: auth.user?.nombre || null,
      pagado_at: ahora,
      gasto_id: gasto?.id || null,
    });

    if (!parcial && cargo.venta_id) {
      await supabase
        .from('ruta_ventas')
        .update({ estado_credito: 'pagado', transito_id: String(tr.id) })
        .eq('id', cargo.venta_id);
    }

    resultados.push({
      cargoId: cargo.id,
      gastoId: gasto?.id,
      transitoId: tr.id,
      monto,
      parcial,
    });
  }

  return {
    ok: true,
    pagados: resultados,
    cajero: auth.user?.nombre,
    montoPagado: reparto.montoAplicado,
    parcial: resultados.some((r) => r.parcial) || round2(reparto.montoAplicado) < totalSel,
  };
}

/** @deprecated — el cobro lo hace el cajero con PIN */
export async function registrarAbonoCobranzaRuta() {
  return { ok: false, error: 'Usa Cobranza: el cajero paga créditos de ruta con su PIN.' };
}
