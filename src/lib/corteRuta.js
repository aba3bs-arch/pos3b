/**
 * Corte de caja de Venta en Ruta (arqueo de ventas del camión).
 * Independiente del Corte de caja de tienda (tabla ventas / turnos).
 */

const LS = 'pos3b_cortes_ruta';

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function leerLocal() {
  try {
    const raw = localStorage.getItem(LS);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function guardarLocal(lista) {
  try {
    localStorage.setItem(LS, JSON.stringify(lista.slice(0, 200)));
  } catch {
    /* ignore */
  }
}

/** Extrae montos efectivo/crédito de una venta de ruta (incluye mixto). */
export function montosPagoVentaRuta(venta) {
  const mp = String(venta?.metodo_pago || '').toLowerCase();
  const total = round2(venta?.total);
  if (mp === 'efectivo') return { efectivo: total, credito: 0 };
  if (mp === 'credito') return { efectivo: 0, credito: total };
  if (mp === 'mixto') {
    const arts = Array.isArray(venta?.articulos) ? venta.articulos : [];
    const meta = arts.find((a) => a && a._pago_mixto);
    if (meta) {
      return {
        efectivo: round2(meta.efectivo),
        credito: round2(meta.credito),
      };
    }
    // Sin meta: no asumir todo crédito (rompe el arqueo).
    return { efectivo: total, credito: 0 };
  }
  return { efectivo: 0, credito: 0 };
}

/**
 * Desglose de ventas de ruta por tienda/cliente destino.
 * Clave: cliente_tipo + cliente_id; etiqueta = cliente_nombre o id.
 */
export function desgloseVentasRutaPorTienda(ventas = []) {
  const map = new Map();
  for (const v of ventas || []) {
    const tipo = String(v.cliente_tipo || 'sucursal').toLowerCase() === 'externo'
      ? 'externo'
      : 'sucursal';
    const id = String(v.cliente_id || '').trim() || '—';
    const key = `${tipo}:${id}`;
    const m = montosPagoVentaRuta(v);
    const totalV = round2(v.total);
    let row = map.get(key);
    if (!row) {
      row = {
        key,
        cliente_tipo: tipo,
        cliente_id: id,
        cliente_nombre: String(v.cliente_nombre || id).trim() || id,
        tickets: 0,
        total: 0,
        efectivo: 0,
        credito: 0,
      };
      map.set(key, row);
    }
    // Preferir nombre más descriptivo si llega después
    const nom = String(v.cliente_nombre || '').trim();
    if (nom && (row.cliente_nombre === id || nom.length > row.cliente_nombre.length)) {
      row.cliente_nombre = nom;
    }
    row.tickets += 1;
    row.total = round2(row.total + totalV);
    row.efectivo = round2(row.efectivo + m.efectivo);
    row.credito = round2(row.credito + m.credito);
  }
  return [...map.values()].sort((a, b) => {
    const na = String(a.cliente_nombre || a.cliente_id || '');
    const nb = String(b.cliente_nombre || b.cliente_id || '');
    return na.localeCompare(nb, 'es') || b.total - a.total;
  });
}

export function resumirVentasRutaParaCorte(ventas = []) {
  let tickets = 0;
  let total = 0;
  let efectivo = 0;
  let credito = 0;
  const porMetodo = { efectivo: 0, credito: 0, mixto: 0 };
  for (const v of ventas || []) {
    tickets += 1;
    total = round2(total + Number(v.total || 0));
    const m = montosPagoVentaRuta(v);
    efectivo = round2(efectivo + m.efectivo);
    credito = round2(credito + m.credito);
    const mp = String(v.metodo_pago || '').toLowerCase();
    if (mp === 'mixto') porMetodo.mixto = round2(porMetodo.mixto + Number(v.total || 0));
    else if (mp === 'credito') porMetodo.credito = round2(porMetodo.credito + Number(v.total || 0));
    else porMetodo.efectivo = round2(porMetodo.efectivo + Number(v.total || 0));
  }
  return {
    tickets,
    total,
    efectivoEsperado: efectivo,
    credito,
    porMetodo,
    porTienda: desgloseVentasRutaPorTienda(ventas),
  };
}

export function listarCortesRutaLocal({ cargaId, vendedorId, limit = 40 } = {}) {
  let list = leerLocal();
  if (cargaId) list = list.filter((c) => String(c.carga_id) === String(cargaId));
  if (vendedorId) list = list.filter((c) => String(c.vendedor_id || '') === String(vendedorId));
  return list.slice(0, limit);
}

/**
 * Payload para imprimir ticket de corte de caja de ruta (efectivo + crédito).
 * Compatible con htmlCorteCaja (usa `monto` en detalleMetodos).
 */
export function construirTicketCorteRuta(corte = {}, extras = {}) {
  const pm = extras.porMetodo || corte.por_metodo || {};
  const detalleMetodos = [
    { metodo: 'Efectivo', monto: round2(pm.efectivo) },
    { metodo: 'Crédito', monto: round2(pm.credito) },
    { metodo: 'Mixto', monto: round2(pm.mixto) },
  ].filter((x) => Number(x.monto) > 0);

  const porTienda = extras.porTienda || corte.por_tienda || [];
  const detalleTiendas = (Array.isArray(porTienda) ? porTienda : [])
    .map((t) => ({
      tienda: t.cliente_nombre || t.cliente_id || t.tienda || '—',
      tickets: Number(t.tickets) || 0,
      total: round2(t.total),
      efectivo: round2(t.efectivo),
      credito: round2(t.credito),
    }))
    .filter((t) => t.tickets > 0 || t.total > 0);

  const vendedor = corte.vendedor_nombre || extras.vendedorNombre || '—';
  const cerradoPor = corte.admin_nombre || extras.adminNombre || corte.usuario || extras.usuarioCierra || null;
  const camionTxt = corte.camion_etiqueta || extras.camionEtiqueta || null;
  const credito = round2(corte.credito ?? extras.credito ?? 0);
  const notasExtra = [
    camionTxt ? `Camión: ${camionTxt}` : null,
    corte.notas || extras.notas || null,
    credito > 0 ? `Crédito en ventas: $${credito.toFixed(2)}` : null,
    cerradoPor && vendedor && String(cerradoPor) !== String(vendedor)
      ? `Cerrado por: ${cerradoPor}`
      : null,
  ].filter(Boolean).join(' · ');

  return {
    fecha: corte.fecha || new Date().toISOString().slice(0, 10),
    sucursal: `RUTA · ${corte.carga_folio || extras.cargaFolio || ''}`.trim(),
    usuario: vendedor,
    turno: vendedor,
    tickets: Number(corte.tickets) || 0,
    cancelaciones: 0,
    totalBruto: round2(corte.total_ventas),
    totalCancelaciones: 0,
    total: round2(corte.total_ventas),
    efectivoEsperado: round2(corte.efectivo_esperado),
    efectivoContado: corte.efectivo_contado == null ? null : round2(corte.efectivo_contado),
    diferencia: corte.diferencia == null ? null : round2(corte.diferencia),
    detalleMetodos,
    detalleTiendas,
    notas: notasExtra || undefined,
  };
}

export function guardarCorteRutaLocal(row) {
  const id = row.id || `cruta_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const item = {
    id,
    created_at: row.created_at || new Date().toISOString(),
    fecha: row.fecha || new Date().toISOString().slice(0, 10),
    carga_id: row.carga_id || null,
    carga_folio: row.carga_folio || null,
    camion_id: row.camion_id || null,
    camion_etiqueta: row.camion_etiqueta || null,
    vendedor_id: row.vendedor_id || null,
    vendedor_nombre: row.vendedor_nombre || null,
    tickets: Number(row.tickets) || 0,
    total_ventas: round2(row.total_ventas),
    efectivo_esperado: round2(row.efectivo_esperado),
    credito: round2(row.credito),
    efectivo_contado: row.efectivo_contado == null || row.efectivo_contado === ''
      ? null
      : round2(row.efectivo_contado),
    diferencia:
      row.efectivo_contado == null || row.efectivo_contado === ''
        ? null
        : round2(Number(row.efectivo_contado) - Number(row.efectivo_esperado || 0)),
    por_metodo: row.por_metodo || {},
    por_tienda: Array.isArray(row.por_tienda) ? row.por_tienda : [],
    notas: row.notas || '',
    usuario: row.usuario || null,
    admin_id: row.admin_id || null,
    admin_nombre: row.admin_nombre || null,
  };
  const prev = leerLocal().filter((c) => c.id !== id);
  guardarLocal([item, ...prev]);
  return { ok: true, corte: item };
}

export async function intentarGuardarCorteRutaNube(supabase, row) {
  if (!supabase) return { ok: false, localOnly: true };
  const payload = {
    carga_id: row.carga_id || null,
    carga_folio: row.carga_folio || null,
    vendedor_id: row.vendedor_id || null,
    vendedor_nombre: row.vendedor_nombre || null,
    fecha: row.fecha,
    tickets: row.tickets,
    total_ventas: row.total_ventas,
    efectivo_esperado: row.efectivo_esperado,
    credito: row.credito,
    efectivo_contado: row.efectivo_contado,
    diferencia: row.diferencia,
    por_metodo: row.por_metodo || {},
    por_tienda: Array.isArray(row.por_tienda) ? row.por_tienda : [],
    notas: row.notas || null,
    usuario: row.usuario || null,
  };
  try {
    let { data, error } = await supabase
      .from('ruta_cortes_caja')
      .insert([payload])
      .select('*')
      .single();
    // Columna por_tienda aún no migrada: reintentar sin ella.
    if (error && /por_tienda/i.test(String(error.message || ''))) {
      const { por_tienda: _omit, ...sinTienda } = payload;
      const retry = await supabase
        .from('ruta_cortes_caja')
        .insert([sinTienda])
        .select('*')
        .single();
      data = retry.data;
      error = retry.error;
      if (!error) {
        return {
          ok: true,
          data,
          aviso: 'Corte en nube sin columna por_tienda. Ejecuta supabase/fix_ruta_cortes_caja_por_tienda.sql',
        };
      }
    }
    if (error) {
      // Tabla opcional: si no existe, solo local
      const msg = String(error.message || '').toLowerCase();
      if (error.code === '42P01' || msg.includes('does not exist') || msg.includes('schema cache')) {
        return { ok: false, localOnly: true, aviso: 'Corte guardado en este equipo (sin tabla nube ruta_cortes_caja).' };
      }
      return { ok: false, error: error.message };
    }
    return { ok: true, data };
  } catch (e) {
    return { ok: false, localOnly: true, error: e?.message };
  }
}
