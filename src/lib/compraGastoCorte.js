/**
 * Al aceptar/recibir una compra (herramienta Compras / venta en ruta),
 * carga el gasto PROVEEDORES al corte de Abarrotes de esa tienda.
 *
 * Excepción: Venta en Ruta a CRÉDITO (o la parte crédito de MIXTO) NO genera gasto
 * al recibir inventario. El gasto «CREDITO RUTA · LIQUIDADO» solo nace al cobro
 * (pagarCreditosRutaConPin). Recolecciones CREDITO ya usa «Entrega Crédito» (no Gasto).
 */
import { normalizarCodigoTienda } from '../constants/sucursales.js';
import { agregarGastoTurno } from './corteContabilidad/store.js';

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Pedidos nacidos del POS Venta en Ruta (notas «Venta en ruta …»). */
export function esCompraVentaEnRuta(compra) {
  return /venta\s+en\s+ruta/i.test(String(compra?.notas || ''));
}

/** Extrae folio VR-… de las notas del pedido/compra. */
export function folioVentaRutaDesdeNotas(notas) {
  const m = String(notas || '').match(/\b(VR-[A-Z0-9-]+)\b/i);
  return m ? String(m[1]).toUpperCase() : null;
}

/**
 * Lee método de pago embebido en notas (`· metodo credito|efectivo|mixto`).
 * Compat con pedidos viejos sin esa etiqueta.
 */
export function metodoPagoDesdeNotasCompra(notas) {
  const m = String(notas || '').match(/\bmetodo\s*[:=]?\s*(credito|crédito|efectivo|mixto)\b/i);
  if (!m) return null;
  const v = String(m[1] || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (v === 'credito') return 'credito';
  if (v === 'mixto') return 'mixto';
  if (v === 'efectivo') return 'efectivo';
  return null;
}

/**
 * Desglose mixto embebido en notas del pedido:
 * `· metodo mixto · efe 300 · cre 60` (también acepta efectivo/crédito).
 * @returns {{ efectivo: number, credito: number }|null}
 */
export function montosMixtoDesdeNotasCompra(notas) {
  const blob = String(notas || '');
  const efeM = blob.match(/\befe\s*[:=]?\s*\$?\s*([0-9]+(?:[.,][0-9]+)?)/i)
    || blob.match(/\befectivo\s*[:=]?\s*\$?\s*([0-9]+(?:[.,][0-9]+)?)/i);
  const creM = blob.match(/\bcre\s*[:=]?\s*\$?\s*([0-9]+(?:[.,][0-9]+)?)/i)
    || blob.match(/\bcr[eé]dito\s*[:=]?\s*\$?\s*([0-9]+(?:[.,][0-9]+)?)/i);
  if (!efeM && !creM) return null;
  const efectivo = efeM ? round2(String(efeM[1]).replace(',', '.')) : 0;
  const credito = creM ? round2(String(creM[1]).replace(',', '.')) : 0;
  if (efectivo + credito <= 0) return null;
  return { efectivo, credito };
}

/** Normaliza articulos (array o JSON string) y encuentra meta `_pago_mixto`. */
export function metaPagoMixtoDesdeArticulos(articulos) {
  let arts = articulos;
  if (typeof arts === 'string') {
    try {
      arts = JSON.parse(arts);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(arts)) return null;
  const mix = arts.find((a) => a && (a._pago_mixto === true || a._pago_mixto === 1 || a._pago_mixto === 'true'));
  if (!mix) return null;
  return {
    efectivo: round2(mix.efectivo ?? mix.monto_efectivo ?? 0),
    credito: round2(mix.credito ?? mix.monto_credito ?? 0),
  };
}

/**
 * Montos efectivo/crédito desde la venta de ruta (o notas).
 * Mixto sin desglose: NO asume todo efectivo (eso cobraba de más el crédito).
 * @returns {{ metodo: string, montoEfectivo: number, montoCredito: number, venta: object|null }}
 */
export function montosPagoDesdeVentaRuta(venta, totalFallback = 0) {
  const total = round2(venta?.total ?? totalFallback);
  const mpRaw = String(venta?.metodo_pago || '').toLowerCase();
  const mp = mpRaw || metodoPagoDesdeNotasCompra(venta?.notas) || '';
  const fromNotasMontos = montosMixtoDesdeNotasCompra(venta?.notas);

  if (mp === 'credito') {
    return { metodo: 'credito', montoEfectivo: 0, montoCredito: total, venta: venta || null };
  }
  if (mp === 'efectivo') {
    return { metodo: 'efectivo', montoEfectivo: total, montoCredito: 0, venta: venta || null };
  }
  if (mp === 'mixto') {
    const mix = metaPagoMixtoDesdeArticulos(venta?.articulos);
    let efe = round2(mix?.efectivo ?? venta?.monto_efectivo ?? 0);
    let cre = round2(mix?.credito ?? venta?.monto_credito ?? 0);
    if (efe + cre <= 0 && fromNotasMontos) {
      efe = fromNotasMontos.efectivo;
      cre = fromNotasMontos.credito;
    }
    if (efe + cre <= 0 && total > 0) {
      // Sin desglose: no cargar el total como efectivo (el crédito se cobraría dos veces).
      // Si hay CxC pendiente, tratar como crédito; si no, omitir gasto hasta resolver.
      if (String(venta?.estado_credito || '').toLowerCase() === 'pendiente') {
        return { metodo: 'mixto', montoEfectivo: 0, montoCredito: total, venta: venta || null };
      }
      return { metodo: 'mixto', montoEfectivo: 0, montoCredito: total, venta: venta || null };
    }
    return { metodo: 'mixto', montoEfectivo: efe, montoCredito: cre, venta: venta || null };
  }
  const fromNotas = metodoPagoDesdeNotasCompra(venta?.notas);
  if (fromNotas === 'credito') {
    return { metodo: 'credito', montoEfectivo: 0, montoCredito: total, venta: venta || null };
  }
  if (fromNotas === 'mixto') {
    if (fromNotasMontos) {
      return {
        metodo: 'mixto',
        montoEfectivo: fromNotasMontos.efectivo,
        montoCredito: fromNotasMontos.credito,
        venta: venta || null,
      };
    }
    return { metodo: 'mixto', montoEfectivo: 0, montoCredito: total, venta: venta || null };
  }
  return { metodo: mp || 'efectivo', montoEfectivo: total, montoCredito: 0, venta: venta || null };
}

const SELECT_VENTA_RUTA_FULL =
  'id, folio, metodo_pago, total, articulos, estado_credito, compra_id, notas';
const SELECT_VENTA_RUTA_MIN =
  'id, folio, metodo_pago, total, articulos, notas';

async function fetchVentaRutaRow(supabase, filterCol, filterVal) {
  let q = await supabase
    .from('ruta_ventas')
    .select(SELECT_VENTA_RUTA_FULL)
    .eq(filterCol, filterVal)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!q.error && q.data) return q.data;
  // Schema viejo / columnas opcionales: reintentar select mínimo.
  if (q.error) {
    q = await supabase
      .from('ruta_ventas')
      .select(SELECT_VENTA_RUTA_MIN)
      .eq(filterCol, filterVal)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!q.error && q.data) return q.data;
  }
  return null;
}

/** Busca la venta en ruta ligada a la compra (compra_id o folio en notas). */
export async function resolverVentaRutaDeCompra(supabase, compra) {
  if (!supabase || !compra) return null;
  const compraId = compra.id != null ? String(compra.id) : null;
  if (compraId) {
    const byCompra = await fetchVentaRutaRow(supabase, 'compra_id', compraId);
    if (byCompra) return byCompra;
  }
  const folio = folioVentaRutaDesdeNotas(compra.notas);
  if (folio) {
    const byFolio = await fetchVentaRutaRow(supabase, 'folio', folio);
    if (byFolio) return byFolio;
  }
  return null;
}

/**
 * Decide si al recibir la compra debe ir gasto al corte y por cuánto.
 * Crédito puro → sin gasto. Mixto → solo efectivo. Efectivo / compra normal → total.
 */
export function decidirGastoRecepcionCompra({ compra, totalTicket, venta = null } = {}) {
  const total = round2(totalTicket);
  const esRuta = esCompraVentaEnRuta(compra);
  if (!esRuta) {
    return { cargar: true, monto: total, motivo: 'compra_normal' };
  }

  const metodoNotas = metodoPagoDesdeNotasCompra(compra?.notas);
  // Preferir venta; si no hay, usar notas del pedido (incl. efe/cre de mixto).
  const pago = venta
    ? montosPagoDesdeVentaRuta(
      {
        ...venta,
        // Notas de la compra suelen traer efe/cre aunque la venta no resuelva meta.
        notas: [venta?.notas, compra?.notas].filter(Boolean).join(' · '),
      },
      total,
    )
    : montosPagoDesdeVentaRuta(
      { metodo_pago: metodoNotas || 'efectivo', total, notas: compra?.notas },
      total,
    );

  if (pago.metodo === 'credito' || (pago.montoCredito > 0 && pago.montoEfectivo <= 0.001)) {
    return {
      cargar: false,
      monto: 0,
      motivo: 'credito',
      metodo: 'credito',
      montoCredito: pago.montoCredito || total,
      montoEfectivo: 0,
    };
  }

  if (pago.metodo === 'mixto') {
    const efe = round2(pago.montoEfectivo);
    if (efe <= 0.001) {
      return {
        cargar: false,
        monto: 0,
        motivo: 'credito',
        metodo: 'mixto',
        montoCredito: pago.montoCredito,
        montoEfectivo: 0,
      };
    }
    return {
      cargar: true,
      monto: efe,
      motivo: 'mixto_efectivo',
      metodo: 'mixto',
      montoCredito: pago.montoCredito,
      montoEfectivo: efe,
    };
  }

  return {
    cargar: true,
    monto: total,
    motivo: 'efectivo',
    metodo: pago.metodo || 'efectivo',
    montoEfectivo: total,
    montoCredito: 0,
  };
}

/**
 * Arma el payload de gasto para el corte Abarrotes.
 * Incluye el folio CMP en comentario (y folios_inventario) para consolidación / Smoking.
 */
export function payloadGastoDesdeCompra({
  compra,
  folioCompra,
  totalTicket,
  proveedorNombre,
  usuarioNombre,
  comentarioExtra = null,
} = {}) {
  const esRuta = esCompraVentaEnRuta(compra);
  const prov = String(
    proveedorNombre
    || compra?.proveedores?.nombre
    || '',
  ).trim();
  const subcategoria = (prov || (esRuta ? 'VENTA EN RUTA' : 'MERCANCIA')).toUpperCase();
  const folio = String(folioCompra || '').trim();
  const partes = [
    esRuta ? 'COMPRA VENTA EN RUTA' : 'COMPRA RECIBIDA',
    folio || null,
    prov || null,
    comentarioExtra || null,
  ].filter(Boolean);
  const comentario = partes.join(' · ');
  return {
    categoria: 'PROVEEDORES',
    subcategoria,
    comentario,
    monto: round2(totalTicket),
    usuario_nombre: usuarioNombre || null,
    folios_inventario: folio || undefined,
  };
}

/**
 * Inserta el gasto de la compra en cortes_contabilidad_gastos (módulo abarrotes, turno abierto).
 * Idempotente por folio CMP en comentario.
 * Omite crédito (gasto solo al cobro de crédito).
 */
export async function cargarGastoCompraACorteAbarrotes(supabase, {
  compra,
  sucursal,
  folioCompra,
  totalTicket,
  proveedorNombre,
  usuarioNombre,
  rolActor,
} = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  const sid = normalizarCodigoTienda(sucursal || compra?.sucursal_id) || 'MAIN';
  const folio = String(folioCompra || '').trim();
  const montoTicket = round2(totalTicket);
  if (!(montoTicket > 0)) return { ok: false, error: 'Monto del ticket inválido para el gasto.' };
  if (!folio) return { ok: false, error: 'Falta folio de inventario de la compra.' };

  let venta = null;
  if (esCompraVentaEnRuta(compra)) {
    try {
      venta = await resolverVentaRutaDeCompra(supabase, compra);
    } catch {
      venta = null;
    }
  }

  const decision = decidirGastoRecepcionCompra({
    compra,
    totalTicket: montoTicket,
    venta,
  });

  if (!decision.cargar) {
    return {
      ok: true,
      omitido: decision.motivo || 'credito',
      metodo: decision.metodo || 'credito',
      montoCredito: decision.montoCredito || montoTicket,
      sucursalId: sid,
      aviso:
        'Recepción a crédito: inventario OK. El gasto irá al corte solo al cobrar el crédito (Cobranza ruta).',
    };
  }

  const monto = round2(decision.monto);
  if (!(monto > 0)) {
    return { ok: true, omitido: 'monto_cero', sucursalId: sid };
  }

  // Evitar duplicar si ya se cargó este folio al corte.
  const { data: prev, error: errPrev } = await supabase
    .from('cortes_contabilidad_gastos')
    .select('id, comentario, monto, cerrado')
    .eq('sucursal_id', sid)
    .eq('modulo', 'abarrotes')
    .ilike('comentario', `%${folio}%`)
    .limit(5);
  if (errPrev && errPrev.code !== '42P01') {
    return { ok: false, error: errPrev.message };
  }
  const ya = (prev || []).find((g) => {
    const com = String(g.comentario || '');
    return com.toUpperCase().includes(String(folio).toUpperCase());
  });
  if (ya) {
    return { ok: true, yaExistia: true, data: ya, sucursalId: sid };
  }

  const extra =
    decision.motivo === 'mixto_efectivo'
      ? `efectivo mixto $${monto.toFixed(2)}`
      : null;

  const gasto = payloadGastoDesdeCompra({
    compra,
    folioCompra: folio,
    totalTicket: monto,
    proveedorNombre,
    usuarioNombre,
    comentarioExtra: extra,
  });

  const res = await agregarGastoTurno(supabase, sid, 'abarrotes', gasto, {
    nombreActor: usuarioNombre || null,
    rolActor: rolActor || null,
  });
  if (!res.ok) {
    if (res.duplicado) {
      return {
        ok: true,
        yaExistia: true,
        data: res.duplicados?.[0] || null,
        sucursalId: sid,
        aviso: res.error || null,
      };
    }
    return { ok: false, error: res.error || 'No se pudo cargar el gasto al corte de abarrotes.' };
  }
  return {
    ok: true,
    data: Array.isArray(res.data) ? res.data[res.data.length - 1] : res.data,
    sucursalId: sid,
    modulo: 'abarrotes',
    metodo: decision.metodo || null,
    montoEfectivo: decision.montoEfectivo ?? monto,
    montoCredito: decision.montoCredito || 0,
  };
}
