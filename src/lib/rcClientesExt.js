/**
 * Registro de clientes externos.
 * El inventario del camión no se parte: aquí solo queda el crédito dejado
 * y lo cobrado (abono o crédito cobrado). Las sucursales 3B no entran.
 */

import { montosPagoDesdeVentaRuta, ventaPendienteRecepcion } from './compraGastoCorte.js';
import { tiendaDeVentaRuta, ventaCancelada } from './ventasRutaPorTienda.js';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function pagado(venta, cargo) {
  if (String(venta?.estado_credito || '').toLowerCase() === 'pagado') return true;
  if (!cargo) return false;
  return Boolean(cargo.pagado_at) || String(cargo.estatus || '').toLowerCase() === 'pagado';
}

function esExterno(row) {
  if (!row) return false;
  if (String(row.cliente_tipo || '').toLowerCase() === 'externo') return true;
  return Boolean(tiendaDeVentaRuta(row).externo);
}

/**
 * Agrupa ventas y movimientos de cobranza de clientes externos.
 * @returns {{ clientes: object[], totales: { efectivo: number, credito: number, cobrado: number, pendiente: number } }}
 */
export function armarRegistroClientesExt(ventas = [], movimientos = []) {
  const abonosPorVenta = new Map();
  const abonosSueltos = [];
  const cargoPorVenta = new Map();
  const cargosSueltos = [];
  const abonosPorCargo = new Map();
  for (const mov of movimientos || []) {
    if (!esExterno(mov)) continue;
    if (mov.tipo === 'abono') {
      const ventaId = String(mov.venta_id || '');
      const cargoId = String(mov.cargo_id || '');
      if (ventaId) {
        const lista = abonosPorVenta.get(ventaId) || [];
        lista.push(mov);
        abonosPorVenta.set(ventaId, lista);
      } else if (cargoId) {
        const lista = abonosPorCargo.get(cargoId) || [];
        lista.push(mov);
        abonosPorCargo.set(cargoId, lista);
      } else abonosSueltos.push(mov);
    } else if (mov.tipo === 'cargo') {
      const ventaId = String(mov.venta_id || '');
      if (!ventaId) cargosSueltos.push(mov);
      else if (!cargoPorVenta.has(ventaId)) cargoPorVenta.set(ventaId, mov);
    }
  }

  const clientes = new Map();
  const grupo = (clave, nombre) => {
    if (!clientes.has(clave)) {
      clientes.set(clave, {
        clave,
        nombre: nombre || clave,
        efectivo: 0,
        credito: 0,
        cobrado: 0,
        pendiente: 0,
        tickets: [],
      });
    }
    const g = clientes.get(clave);
    if (nombre) g.nombre = nombre;
    return g;
  };

  for (const venta of ventas || []) {
    if (!venta || ventaCancelada(venta) || ventaPendienteRecepcion(venta)) continue;
    if (String(venta.estado_credito || '').toLowerCase() === 'anulado') continue;
    if (!esExterno(venta)) continue;
    const tienda = tiendaDeVentaRuta(venta);
    const pago = montosPagoDesdeVentaRuta(venta);
    const efectivo = round2(pago.montoEfectivo);
    const credito = round2(pago.montoCredito);
    if (!(efectivo > 0) && !(credito > 0)) continue;
    const g = grupo(tienda.clave, tienda.nombre);
    g.efectivo = round2(g.efectivo + efectivo);
    if (!(credito > 0)) continue;
    const deVenta = abonosPorVenta.get(String(venta.id)) || [];
    const sumaAbonos = round2(deVenta.reduce((s, a) => s + (Number(a.monto) || 0), 0));
    const cargo = cargoPorVenta.get(String(venta.id));
    let cobrado = Math.min(credito, sumaAbonos);
    const cobros = deVenta
      .filter((a) => Number(a.monto) > 0)
      .map((a) => ({
        id: String(a.id || ''),
        monto: round2(a.monto),
        fecha: a.created_at || null,
        nota: a.notas || 'Abono',
      }));
    if (pagado(venta, cargo) && cobrado + 0.009 < credito) {
      const resto = round2(credito - cobrado);
      cobrado = credito;
      cobros.push({
        id: `cobro:${venta.id}`,
        monto: resto,
        fecha: cargo?.pagado_at || venta.created_at || null,
        nota: 'Crédito cobrado',
      });
    }
    const pendiente = round2(Math.max(0, credito - cobrado));
    g.credito = round2(g.credito + credito);
    g.cobrado = round2(g.cobrado + cobrado);
    g.pendiente = round2(g.pendiente + pendiente);
    g.tickets.push({
      id: String(venta.id),
      origen: 'venta',
      clienteId: String(venta.cliente_id || ''),
      folio: venta.folio || '',
      fecha: venta.created_at || null,
      credito,
      cobrado,
      pendiente,
      cobros,
    });
  }

  for (const cargo of cargosSueltos) {
    const tienda = tiendaDeVentaRuta({
      cliente_tipo: 'externo',
      cliente_id: cargo.cliente_id,
      cliente_nombre: cargo.cliente_nombre,
    });
    const g = grupo(tienda.clave, cargo.cliente_nombre || tienda.nombre);
    const monto = round2(cargo.monto);
    if (!(monto > 0)) continue;
    const deCargo = abonosPorCargo.get(String(cargo.id)) || [];
    const sumaAbonos = round2(deCargo.reduce((s, a) => s + (Number(a.monto) || 0), 0));
    let cobrado = Math.min(monto, sumaAbonos);
    const cobros = deCargo
      .filter((a) => Number(a.monto) > 0)
      .map((a) => ({
        id: String(a.id || ''),
        monto: round2(a.monto),
        fecha: a.created_at || a.pagado_at || null,
        nota: a.notas || 'Abono',
      }));
    const ya = pagado(null, cargo);
    if (ya && cobrado + 0.009 < monto) {
      const resto = round2(monto - cobrado);
      cobrado = monto;
      cobros.push({
        id: `cobro:${cargo.id}`,
        monto: resto,
        fecha: cargo.pagado_at || cargo.created_at || null,
        nota: 'Crédito cobrado',
      });
    }
    const pendiente = round2(Math.max(0, monto - cobrado));
    g.credito = round2(g.credito + monto);
    g.cobrado = round2(g.cobrado + cobrado);
    g.pendiente = round2(g.pendiente + pendiente);
    g.tickets.push({
      id: String(cargo.id || cargo.folio_venta || g.tickets.length),
      origen: 'cargo',
      clienteId: String(cargo.cliente_id || ''),
      folio: cargo.folio_venta || '',
      fecha: cargo.created_at || null,
      credito: monto,
      cobrado,
      pendiente,
      cobros,
    });
  }

  for (const abono of abonosSueltos) {
    const tienda = tiendaDeVentaRuta({
      cliente_tipo: 'externo',
      cliente_id: abono.cliente_id,
      cliente_nombre: abono.cliente_nombre,
    });
    const g = grupo(tienda.clave, abono.cliente_nombre || tienda.nombre);
    const monto = round2(abono.monto);
    if (!(monto > 0)) continue;
    g.cobrado = round2(g.cobrado + monto);
    g.pendiente = round2(Math.max(0, g.credito - g.cobrado));
    g.tickets.push({
      id: `abono:${abono.id}`,
      origen: 'abono',
      clienteId: String(abono.cliente_id || ''),
      folio: abono.folio_venta || '',
      fecha: abono.created_at || null,
      credito: 0,
      cobrado: monto,
      pendiente: 0,
      cobros: [{ id: String(abono.id || ''), monto, fecha: abono.created_at || null, nota: abono.notas || 'Abono' }],
    });
  }

  const lista = [...clientes.values()]
    .map((g) => ({
      ...g,
      tickets: g.tickets.sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || ''))),
    }))
    .sort((a, b) => b.pendiente - a.pendiente || a.nombre.localeCompare(b.nombre, 'es'));
  const totales = lista.reduce((acum, g) => ({
    efectivo: round2(acum.efectivo + g.efectivo),
    credito: round2(acum.credito + g.credito),
    cobrado: round2(acum.cobrado + g.cobrado),
    pendiente: round2(acum.pendiente + g.pendiente),
  }), { efectivo: 0, credito: 0, cobrado: 0, pendiente: 0 });
  return { clientes: lista, totales };
}

async function paginar(supabase, tabla, select, afinar) {
  const out = [];
  for (let desde = 0; desde < 20000; desde += 500) {
    let q = supabase.from(tabla).select(select).range(desde, desde + 499);
    if (afinar) q = afinar(q);
    const { data, error } = await q;
    if (error) return { data: out, error: error.message || 'No se pudo leer.' };
    out.push(...(data || []));
    if (!data || data.length < 500) break;
  }
  return { data: out };
}

export async function listarRegistroClientesExt(supabase) {
  const vacio = armarRegistroClientesExt([], []);
  if (!supabase) return { ok: false, error: 'Sin conexión.', registro: vacio };
  const ventas = await paginar(
    supabase,
    'ruta_ventas',
    'id,folio,cliente_id,cliente_tipo,cliente_nombre,metodo_pago,total,estado,estado_credito,created_at,articulos',
    (q) => q.eq('cliente_tipo', 'externo').order('created_at', { ascending: false }),
  );
  if (ventas.error) return { ok: false, error: ventas.error, registro: vacio };
  const columnas = 'id,venta_id,folio_venta,cliente_id,cliente_tipo,cliente_nombre,monto,created_at,tipo,estatus,pagado_at,notas,cargo_id';
  let movimientos = await paginar(
    supabase,
    'ruta_cxc_movimientos',
    columnas,
    (q) => q.eq('cliente_tipo', 'externo').order('created_at', { ascending: false }),
  );
  if (movimientos.error && /cargo_id/i.test(movimientos.error)) {
    movimientos = await paginar(
      supabase,
      'ruta_cxc_movimientos',
      columnas.replace(',cargo_id', ''),
      (q) => q.eq('cliente_tipo', 'externo').order('created_at', { ascending: false }),
    );
  }
  if (movimientos.error) return { ok: false, error: movimientos.error, registro: vacio };
  return { ok: true, registro: armarRegistroClientesExt(ventas.data, movimientos.data) };
}

/** Cobros ya registrados, del más reciente al más antiguo. */
export function cobrosDelRegistro(registro) {
  const lista = [];
  for (const cliente of registro?.clientes || []) {
    for (const ticket of cliente.tickets || []) {
      for (const cobro of ticket.cobros || []) {
        lista.push({
          id: cobro.id,
          monto: round2(cobro.monto),
          fecha: cobro.fecha || null,
          nota: cobro.nota || 'Abono',
          folio: ticket.folio || '',
          cliente: cliente.nombre,
          clienteClave: cliente.clave,
        });
      }
    }
  }
  lista.sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')) || String(b.id).localeCompare(String(a.id)));
  return lista;
}

/**
 * Reparte un cobro entre créditos pendientes, del más antiguo al más nuevo.
 * El último crédito tocado puede quedar parcial.
 */
export function planCobroClienteExt(tickets = [], montoPagar) {
  const orden = [...(tickets || [])]
    .filter((t) => round2(t?.pendiente) > 0)
    .sort((a, b) => String(a.fecha || '').localeCompare(String(b.fecha || '')) || String(a.id).localeCompare(String(b.id)));
  const total = round2(orden.reduce((s, t) => s + round2(t.pendiente), 0));
  const monto = round2(montoPagar);
  if (!(monto > 0)) return { ok: false, error: 'Ingresa un monto mayor a 0.' };
  if (!(total > 0)) return { ok: false, error: 'No hay crédito pendiente en la selección.' };
  if (monto > total + 0.001) {
    return { ok: false, error: `El monto no puede superar el pendiente (${total.toFixed(2)}).` };
  }
  let resto = monto;
  const partes = [];
  for (const ticket of orden) {
    if (resto <= 0.001) break;
    const pendiente = round2(ticket.pendiente);
    const aplica = round2(Math.min(resto, pendiente));
    if (!(aplica > 0)) continue;
    partes.push({
      id: String(ticket.id),
      folio: ticket.folio || '',
      monto: aplica,
      parcial: aplica < pendiente - 0.001,
      pendiente,
    });
    resto = round2(resto - aplica);
  }
  if (!partes.length) return { ok: false, error: 'No se pudo aplicar el monto.' };
  return { ok: true, partes, montoAplicado: round2(monto - resto), total };
}

async function insertarAbono(supabase, row) {
  const intento = async (payload) => supabase.from('ruta_cxc_movimientos').insert([payload]).select('id').maybeSingle();
  let { data, error } = await intento(row);
  if (error && /cargo_id|pagado_por|pagado_at|folio_venta|estatus|metodo_pago|saldo_despues|schema cache/i.test(error.message || '')) {
    const base = {
      cliente_tipo: row.cliente_tipo,
      cliente_id: row.cliente_id,
      cliente_nombre: row.cliente_nombre,
      tipo: 'abono',
      monto: row.monto,
      venta_id: row.venta_id,
      notas: row.notas,
      usuario_nombre: row.usuario_nombre,
    };
    ({ data, error } = await intento(base));
  }
  if (error) return { ok: false, error: error.message || 'No se guardó el cobro.' };
  return { ok: true, id: data?.id || null };
}

async function marcarCargosDeVenta(supabase, ventaId, quien, ahora) {
  const q = await supabase
    .from('ruta_cxc_movimientos')
    .select('id,estatus,pagado_at,tipo')
    .eq('venta_id', String(ventaId))
    .eq('tipo', 'cargo');
  if (q.error || !q.data?.length) return;
  for (const cargo of q.data) {
    if (cargo.pagado_at || String(cargo.estatus || '').toLowerCase() === 'pagado') continue;
    await supabase.from('ruta_cxc_movimientos').update({
      estatus: 'pagado',
      pagado_por: quien,
      pagado_at: ahora,
    }).eq('id', cargo.id);
  }
}

/**
 * Registra un abono o el cobro total de créditos de un cliente externo.
 * No pasa por el corte de la sucursal: el control queda en este registro.
 */
export async function registrarCobroClienteExt(supabase, {
  ticketIds,
  monto,
  nota,
  usuarioNombre,
} = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  const ids = [...new Set((ticketIds || []).map(String).filter(Boolean))];
  if (!ids.length) return { ok: false, error: 'Elige al menos un crédito.' };
  const reg = await listarRegistroClientesExt(supabase);
  if (!reg.ok) return { ok: false, error: reg.error || 'No se pudo leer el registro.' };

  const elegidos = [];
  let clave = '';
  for (const cliente of reg.registro.clientes) {
    for (const ticket of cliente.tickets) {
      if (!ids.includes(String(ticket.id)) || !(ticket.pendiente > 0)) continue;
      if (ticket.origen !== 'venta' && ticket.origen !== 'cargo') continue;
      if (clave && clave !== cliente.clave) return { ok: false, error: 'Cobra un cliente a la vez.' };
      clave = cliente.clave;
      elegidos.push({ ...ticket, clienteNombre: cliente.nombre });
    }
  }
  if (!elegidos.length) return { ok: false, error: 'Esos créditos ya no tienen pendiente. Actualiza la pantalla.' };
  if (!String(elegidos[0].clienteId || '').trim()) return { ok: false, error: 'Falta el cliente del crédito.' };
  const plan = planCobroClienteExt(elegidos, monto);
  if (!plan.ok) return plan;

  const ahora = new Date().toISOString();
  const quien = String(usuarioNombre || '').trim() || 'RC/Clientes ext.';
  const notaBase = String(nota || '').trim();
  const aplicados = [];

  for (const parte of plan.partes) {
    const ticket = elegidos.find((t) => String(t.id) === String(parte.id));
    const texto = notaBase || (parte.parcial ? 'Abono' : 'Crédito cobrado');
    const ins = await insertarAbono(supabase, {
      cliente_tipo: 'externo',
      cliente_id: String(ticket.clienteId),
      cliente_nombre: ticket.clienteNombre,
      tipo: 'abono',
      monto: parte.monto,
      saldo_despues: 0,
      venta_id: ticket.origen === 'venta' ? String(ticket.id) : null,
      cargo_id: ticket.origen === 'cargo' ? String(ticket.id) : null,
      folio_venta: ticket.folio || null,
      metodo_pago: 'efectivo',
      estatus: 'pagado',
      notas: texto,
      usuario_nombre: quien,
      pagado_por: quien,
      pagado_at: ahora,
    });
    if (!ins.ok) {
      return {
        ok: false,
        error: aplicados.length
          ? `Se registró parte del cobro y falló el siguiente: ${ins.error}`
          : ins.error,
        aplicados,
      };
    }
    if (!parte.parcial) {
      if (ticket.origen === 'venta') {
        await supabase.from('ruta_ventas').update({ estado_credito: 'pagado' }).eq('id', ticket.id);
        await marcarCargosDeVenta(supabase, ticket.id, quien, ahora);
      } else {
        await supabase.from('ruta_cxc_movimientos').update({
          estatus: 'pagado',
          pagado_por: quien,
          pagado_at: ahora,
        }).eq('id', ticket.id);
      }
    }
    aplicados.push({
      id: parte.id,
      folio: parte.folio,
      monto: parte.monto,
      parcial: parte.parcial,
      nota: texto,
    });
  }
  return {
    ok: true,
    aplicados,
    monto: plan.montoAplicado,
    cliente: elegidos[0].clienteNombre,
  };
}
