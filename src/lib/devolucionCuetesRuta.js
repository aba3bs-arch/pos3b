/**
 * Devolución de cuetes dejados en la tienda (crédito de fin de año).
 * No es una venta de ruta: al aprobar sale de la cuenta de la sucursal
 * y las piezas regresan al camión del repartidor (baja qty_vendida).
 */

import { etiquetaTienda, normalizarCodigoTienda } from '../constants/sucursales.js';
import {
  crearNotificacion,
  marcarNotificacionAtendida,
  TIPOS_NOTIF,
} from './contabilidadNotificaciones.js';
import {
  aplicarPlanDevolucionCamion,
  planDevolucionCamion,
  revertirAjusteCamion,
} from './creditoFinAnioCamion.js';
import {
  claveProducto,
  inventarioDeMovimientos,
  listarCuentasFinAnio,
  listarMovimientosFinAnio,
  retirarMercanciaFinAnio,
  round2,
  round3,
  TIPO_DEJAR,
} from './creditoFinAnio.js';
import { lineasDeVariasCargas, listarCargasRuta } from './ventaEnRuta.js';

const AVISO_FALTA_CANCELACIONES =
  'Falta la tabla de cancelaciones de ruta. En Supabase ejecuta supabase/fix_ruta_cancelaciones.sql';

export function esDevolucionCuetes(id) {
  return String(id || '').startsWith('cuetes:');
}

export function esCancelacionCuetes(sol) {
  return sol?.meta?.tipo === 'cuetes' || String(sol?.metodo_pago || '').toLowerCase() === 'cuetes';
}

function normalizarNombre(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function nombresCoinciden(a, b) {
  const x = normalizarNombre(a);
  const y = normalizarNombre(b);
  if (!x || !y) return false;
  if (x === y) return true;
  if (x.length >= 4 && y.includes(x)) return true;
  if (y.length >= 4 && x.includes(y)) return true;
  return false;
}

function precioMedio(linea) {
  const cant = Number(linea?.cantidad) || 0;
  if (!(cant > 0)) return 0;
  return round2((Number(linea.valor) || 0) / cant);
}

function folioDe(op) {
  const suc = normalizarCodigoTienda(op?.sucursalId) || String(op?.sucursalId || 'MAIN').toUpperCase();
  const cod = String(op?.codigo || 'CUETE').trim() || 'CUETE';
  return `CUETES-${suc}-${cod}`.slice(0, 80);
}

function ultimoDejo(movs, clave) {
  return (movs || [])
    .filter((m) => m && m.tipo === TIPO_DEJAR && !m.archived_at && claveProducto(m) === clave)
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))[0] || null;
}

/** Mercancía de cuetes que sigue en cada cuenta abierta. Una opción por producto. */
export function opcionesDevolucionCuetes(cuentas, movimientos) {
  const out = [];
  for (const cuenta of cuentas || []) {
    if (!cuenta || cuenta.archived_at || cuenta.estado === 'cerrada') continue;
    const movs = (movimientos || []).filter((m) => String(m.cuenta_id) === String(cuenta.id));
    for (const linea of inventarioDeMovimientos(movs)) {
      const cantidad = Math.floor(Number(linea.cantidad) + 0.0001);
      if (!(cantidad > 0)) continue;
      const dejo = ultimoDejo(movs, linea.clave);
      const precio = precioMedio(linea);
      const suc = normalizarCodigoTienda(cuenta.sucursal_id) || String(cuenta.sucursal_id || '').toUpperCase();
      const op = {
        id: `cuetes:${cuenta.id}:${linea.clave}`,
        tipo: 'cuetes',
        cuentaId: cuenta.id,
        sucursalId: suc,
        clave: linea.clave,
        codigo: linea.codigo,
        nombre: linea.nombre,
        cantidad,
        precio,
        valor: round2(precio * cantidad),
        repartidorNombre: String(dejo?.created_by || '').trim(),
      };
      op.folio = folioDe(op);
      op.etiqueta = [
        'Cuetes',
        etiquetaTienda(suc) || suc || 'Tienda',
        [op.codigo, op.nombre].filter(Boolean).join(' '),
        `${cantidad} pza`,
        op.repartidorNombre || '',
      ].filter(Boolean).join(' · ');
      out.push(op);
    }
  }
  return out.sort((a, b) => String(a.etiqueta).localeCompare(String(b.etiqueta), 'es'));
}

function nombreDeLineas(lineas, porCarga) {
  for (const lin of lineas || []) {
    const c = porCarga.get(String(lin.carga_id)) || {};
    const n = String(c.vendedor_nombre || c.camion_etiqueta || '').trim();
    if (n) return n;
  }
  return '';
}

/**
 * Elige las líneas en ruta de las que se baja qty_vendida.
 * Primero el camión del repartidor que dejó el cuete.
 * Si el nombre no coincide y solo hay un camión con ese código vendido, usa ese.
 */
export function planDevolucionCueteAlCamion(cargas, lineas, { productoId, repartidorNombre, cantidad } = {}) {
  const pid = String(productoId || '').trim();
  const qty = Math.floor(Math.abs(Number(cantidad) || 0));
  if (!pid || !(qty > 0)) return { ok: false, error: 'Falta el producto o la cantidad de cuetes.' };

  const porCarga = new Map((cargas || []).map((c) => [String(c.id), c]));
  const vendidas = (lineas || []).filter(
    (l) => String(l.producto_id) === pid && (Number(l.qty_vendida) || 0) > 0,
  );
  const deNombre = String(repartidorNombre || '').trim()
    ? vendidas.filter((l) => nombresCoinciden(repartidorNombre, porCarga.get(String(l.carga_id))?.vendedor_nombre))
    : [];

  let candidatas = deNombre;
  if (!candidatas.length) {
    const porVendedor = new Map();
    for (const l of vendidas) {
      const c = porCarga.get(String(l.carga_id)) || {};
      const key = String(c.vendedor_id || c.vendedor_nombre || c.camion_id || c.id || 'camion');
      if (!porVendedor.has(key)) {
        porVendedor.set(key, { nombre: c.vendedor_nombre || c.camion_etiqueta || 'Camión', lineas: [] });
      }
      porVendedor.get(key).lineas.push(l);
    }
    if (porVendedor.size === 1) {
      candidatas = [...porVendedor.values()][0].lineas;
    } else if (porVendedor.size > 1) {
      const lista = [...porVendedor.values()].map((v) => v.nombre).join(', ');
      return {
        ok: false,
        error: `Hay cuetes de ${pid} vendidos en varios camiones (${lista}). No se devuelve a medias.`,
      };
    } else {
      const quien = String(repartidorNombre || '').trim();
      return {
        ok: false,
        error: quien
          ? `El camión de ${quien} no tiene ${qty} de ${pid} como vendido. La mercancía sigue en la tienda.`
          : `Ningún camión en ruta tiene vendido el código ${pid}.`,
      };
    }
  }

  const plan = planDevolucionCamion(candidatas, pid, qty);
  if (plan.pendiente > 0 || !plan.asignaciones.length) {
    const quien = nombreDeLineas(candidatas, porCarga) || repartidorNombre || 'el camión';
    return {
      ok: false,
      error: `En el camión de ${quien} no alcanzan ${qty} piezas vendidas de ${pid}. La mercancía sigue en la tienda.`,
    };
  }
  return {
    ok: true,
    asignaciones: plan.asignaciones,
    camionNombre: nombreDeLineas(plan.asignaciones.map((a) => a.linea), porCarga) || String(repartidorNombre || '').trim(),
    piezas: qty,
  };
}

function filaPendiente(op, { motivo, solicitadoPor, solicitadoPorId } = {}) {
  const suc = normalizarCodigoTienda(op.sucursalId) || 'MAIN';
  return {
    estado: 'pendiente',
    venta_id: null,
    folio_venta: op.folio || folioDe(op),
    carga_id: null,
    cliente_tipo: 'sucursal',
    cliente_id: suc,
    cliente_nombre: `${etiquetaTienda(suc) || suc} · ${op.nombre || op.codigo || 'Cuete'}`,
    metodo_pago: 'cuetes',
    total: round2(op.valor),
    monto_efectivo: 0,
    monto_credito: 0,
    articulos: [{
      producto_id: op.codigo,
      nombre: op.nombre,
      cantidad: op.cantidad,
      precio: op.precio,
    }],
    transito_id: null,
    compra_id: null,
    vendedor_nombre: op.repartidorNombre || null,
    sucursal_id: suc,
    motivo: String(motivo || '').trim() || null,
    solicitado_por: solicitadoPor || null,
    solicitado_por_id: solicitadoPorId != null ? String(solicitadoPorId) : null,
    meta: {
      tipo: 'cuetes',
      cuenta_id: op.cuentaId,
      clave: op.clave,
      codigo: op.codigo,
      nombre: op.nombre,
      cantidad: op.cantidad,
      precio: op.precio,
      repartidor_nombre: op.repartidorNombre || '',
    },
    updated_at: new Date().toISOString(),
  };
}

async function opcionVigente(supabase, opcion) {
  const [cuentas, movs] = await Promise.all([
    listarCuentasFinAnio(supabase),
    listarMovimientosFinAnio(supabase),
  ]);
  if (cuentas.error) return { ok: false, error: cuentas.error };
  if (movs.error) return { ok: false, error: movs.error };
  const viva = opcionesDevolucionCuetes(cuentas.data, movs.data)
    .find((o) => String(o.id) === String(opcion?.id) || (
      String(o.cuentaId) === String(opcion?.cuentaId) && String(o.clave) === String(opcion?.clave)
    ));
  if (!viva) return { ok: false, error: 'Esa mercancía de cuetes ya no está en la tienda.' };
  return { ok: true, opcion: viva };
}

async function planEnCamion(supabase, op) {
  const c = await listarCargasRuta(supabase, { estado: 'en_ruta', limit: 40 });
  if (c.error) return { ok: false, error: c.error };
  const lr = await lineasDeVariasCargas(supabase, c.data || []);
  if (lr.error) return { ok: false, error: lr.error };
  return planDevolucionCueteAlCamion(c.data || [], lr.data || [], {
    productoId: op.codigo,
    repartidorNombre: op.repartidorNombre,
    cantidad: op.cantidad,
  });
}

export async function solicitarDevolucionCuetes(supabase, {
  opcion,
  motivo = '',
  solicitadoPor = null,
  solicitadoPorId = null,
} = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  if (!esDevolucionCuetes(opcion?.id) && !opcion?.cuentaId) {
    return { ok: false, error: 'Selecciona la mercancía de cuetes.' };
  }
  const vigente = await opcionVigente(supabase, opcion);
  if (!vigente.ok) return vigente;
  const op = vigente.opcion;

  const plan = await planEnCamion(supabase, op);
  if (!plan.ok) return plan;

  const { data: prev, error: ePrev } = await supabase
    .from('ruta_cancelaciones')
    .select('id, meta, estado')
    .eq('estado', 'pendiente')
    .limit(80);
  if (ePrev) {
    const msg = String(ePrev.message || '');
    if (/schema cache|does not exist|ruta_cancelaciones/i.test(msg)) {
      return { ok: false, error: AVISO_FALTA_CANCELACIONES };
    }
    return { ok: false, error: ePrev.message };
  }
  const ya = (prev || []).find((s) => (
    s?.meta?.tipo === 'cuetes'
    && String(s.meta.cuenta_id) === String(op.cuentaId)
    && String(s.meta.clave) === String(op.clave)
  ));
  if (ya) return { ok: false, error: 'Ya hay una devolución de esos cuetes pendiente de aprobación.' };

  const row = filaPendiente(op, { motivo, solicitadoPor, solicitadoPorId });
  const { data, error } = await supabase
    .from('ruta_cancelaciones')
    .insert([row])
    .select('*')
    .single();
  if (error) {
    const msg = String(error.message || '');
    if (/schema cache|does not exist|ruta_cancelaciones/i.test(msg)) {
      return { ok: false, error: AVISO_FALTA_CANCELACIONES };
    }
    return { ok: false, error: error.message };
  }

  const notif = await crearNotificacion(supabase, {
    sucursal_id: 'MAIN',
    tipo: TIPOS_NOTIF.RUTA_CANCELACION_PIN,
    ref_tabla: 'ruta_cancelaciones',
    ref_id: data.id,
    titulo: `Devolver cuetes ${row.folio_venta} · ${op.cantidad} pza`,
    mensaje:
      `${solicitadoPor || 'Usuario'} solicita devolver cuetes de ${etiquetaTienda(row.sucursal_id) || row.sucursal_id}: `
      + `${op.cantidad} pza de ${op.nombre || op.codigo}.\n`
      + `Regresan al camión de ${plan.camionNombre || op.repartidorNombre || 'el repartidor'}.\n`
      + (row.motivo ? `Motivo: ${row.motivo}\n` : '')
      + 'Aprueba con PIN: se quitan de la cuenta de la tienda y vuelven al camión.',
  });

  return { ok: true, data, notificacionId: notif?.id || null, aviso: notif?.aviso || null, camionNombre: plan.camionNombre };
}

export async function aprobarDevolucionCuetes(supabase, sol, auth) {
  const meta = sol?.meta || {};
  const pedido = {
    id: `cuetes:${meta.cuenta_id}:${meta.clave}`,
    cuentaId: meta.cuenta_id,
    clave: meta.clave,
    codigo: meta.codigo,
    cantidad: meta.cantidad,
    repartidorNombre: meta.repartidor_nombre || sol.vendedor_nombre || '',
  };
  const vigente = await opcionVigente(supabase, pedido);
  if (!vigente.ok) return vigente;
  const op = vigente.opcion;
  const pedida = Math.floor(Math.abs(Number(meta.cantidad) || 0));
  if (!(pedida > 0)) return { ok: false, error: 'La cantidad de cuetes no es válida.' };
  if (Math.floor(op.cantidad + 0.0001) < pedida) {
    return {
      ok: false,
      error: `En la tienda ya solo quedan ${op.cantidad} pza de ${op.nombre || op.codigo}. No se aprobó la devolución.`,
    };
  }
  const disponible = op.cantidad;
  op.cantidad = pedida;
  op.valor = round2(pedida * (Number(meta.precio) || op.precio || 0));
  op.precio = Number(meta.precio) || op.precio;
  op.repartidorNombre = pedido.repartidorNombre || op.repartidorNombre;

  const plan = await planEnCamion(supabase, op);
  if (!plan.ok) return plan;

  const aplicado = await aplicarPlanDevolucionCamion(supabase, plan.asignaciones);
  if (!aplicado.ok) return aplicado;

  const retiro = await retirarMercanciaFinAnio(supabase, op.cuentaId, {
    codigo: op.codigo,
    nombre: op.nombre,
    cantidad: pedida,
    precio: op.precio,
    notas: `Devolución al camión · ${sol.folio_venta || ''}`.trim(),
  }, disponible, { nombre: auth?.user?.nombre || auth?.nombre || 'Admin' });
  if (!retiro.ok) {
    await revertirAjusteCamion(supabase, aplicado.cambios || plan.asignaciones);
    return { ok: false, error: retiro.error || 'No se pudo quitar el cuete de la cuenta de la tienda.' };
  }

  const resultado = {
    cuetes: true,
    folio: sol.folio_venta,
    piezas: plan.piezas,
    camionNombre: plan.camionNombre,
    camion: plan.asignaciones.map((a) => ({
      lineaId: a.linea?.id,
      productoId: op.codigo,
      nombre: op.nombre,
      qtyRestar: a.qty,
    })),
    cuenta: { sucursal: op.sucursalId, codigo: op.codigo, cantidad: pedida },
  };

  const ahora = new Date().toISOString();
  const { error: eUp } = await supabase
    .from('ruta_cancelaciones')
    .update({
      estado: 'aprobado',
      admin_id: auth?.user?.id != null ? String(auth.user.id) : null,
      admin_nombre: auth?.user?.nombre || auth?.nombre || null,
      aprobado_at: ahora,
      resultado,
      updated_at: ahora,
    })
    .eq('id', sol.id);
  if (eUp) {
    return {
      ok: false,
      error: `El cuete ya regresó al camión, pero no se pudo marcar la solicitud: ${eUp.message}`,
      parcial: resultado,
    };
  }

  await marcarNotificacionAtendida(
    supabase,
    'ruta_cancelaciones',
    sol.id,
    auth?.user?.nombre || auth?.nombre || 'Admin',
  );

  return {
    ok: true,
    data: { ...sol, estado: 'aprobado' },
    resultado,
    admin: auth?.user?.nombre || auth?.nombre,
  };
}
