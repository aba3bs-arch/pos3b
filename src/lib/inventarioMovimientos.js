const LS_MOVIMIENTOS = 'pos3b_movimientos_inventario';

export const TIPOS_MOVIMIENTO = [
  { id: 'entrada', label: 'Entrada', signo: 1, desc: 'Suma unidades al inventario' },
  { id: 'retiro', label: 'Retiro', signo: -1, desc: 'Resta unidades (merma, uso interno, etc.)' },
  { id: 'traspaso', label: 'Traspaso', signo: 0, desc: 'Mueve unidades de un SKU a otro' },
];

export function leerMovimientosLocal() {
  try {
    const raw = localStorage.getItem(LS_MOVIMIENTOS);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function guardarMovimientoLocal(row) {
  const prev = leerMovimientosLocal();
  const next = [{ ...row, id: row.id || `mov_${Date.now()}` }, ...prev].slice(0, 200);
  localStorage.setItem(LS_MOVIMIENTOS, JSON.stringify(next));
  return next;
}

export async function aplicarMovimientoInventario(supabase, opts) {
  const { tipo, productoOrigen, cantidad, productoDestino, motivo, usuario, sucursal, modo, departamento } = opts;
  const qty = Math.floor(Number(cantidad));
  if (!supabase) return { ok: false, error: 'Sin conexión a Supabase.' };
  if (!productoOrigen?.id) return { ok: false, error: 'Selecciona un producto.' };
  if (!qty || qty < 1) return { ok: false, error: 'La cantidad debe ser al menos 1.' };

  const stockOrigen = Number(productoOrigen.stock) || 0;

  if (tipo === 'traspaso') {
    if (!productoDestino?.id) return { ok: false, error: 'Selecciona el producto destino del traspaso.' };
    if (productoDestino.id === productoOrigen.id) return { ok: false, error: 'Origen y destino deben ser productos distintos.' };
    if (stockOrigen < qty) {
      return { ok: false, error: `Stock insuficiente en origen (hay ${stockOrigen}, pides ${qty}).` };
    }
    const stockDest = Number(productoDestino.stock) || 0;
    const nuevoOrigen = stockOrigen - qty;
    const nuevoDest = stockDest + qty;

    const { error: e1 } = await supabase.from('productos').update({ stock: nuevoOrigen }).eq('id', productoOrigen.id);
    if (e1) return { ok: false, error: e1.message };
    const { error: e2 } = await supabase.from('productos').update({ stock: nuevoDest }).eq('id', productoDestino.id);
    if (e2) {
      await supabase.from('productos').update({ stock: stockOrigen }).eq('id', productoOrigen.id);
      return { ok: false, error: `Error en destino: ${e2.message}. Se revirtió el origen.` };
    }

    const log = guardarMovimientoLocal({
      tipo,
      modo,
      departamento: departamento || productoOrigen.cat,
      producto_id: productoOrigen.id,
      producto_nombre: productoOrigen.nombre,
      producto_destino_id: productoDestino.id,
      producto_destino_nombre: productoDestino.nombre,
      cantidad: qty,
      stock_antes: stockOrigen,
      stock_despues: nuevoOrigen,
      stock_dest_antes: stockDest,
      stock_dest_despues: nuevoDest,
      motivo: motivo?.trim() || '',
      usuario: usuario || '—',
      sucursal: sucursal || '',
      created_at: new Date().toISOString(),
    });
    return {
      ok: true,
      mensaje: `Traspaso: ${qty} uds. de "${productoOrigen.nombre}" → "${productoDestino.nombre}".`,
      log,
    };
  }

  const signo = tipo === 'entrada' ? 1 : -1;
  const nuevo = stockOrigen + signo * qty;
  if (nuevo < 0) {
    return { ok: false, error: `No hay suficiente stock (hay ${stockOrigen}, retiras ${qty}).` };
  }

  const { error } = await supabase.from('productos').update({ stock: nuevo }).eq('id', productoOrigen.id);
  if (error) return { ok: false, error: error.message };

  const log = guardarMovimientoLocal({
    tipo,
    modo,
    departamento: departamento || productoOrigen.cat,
    producto_id: productoOrigen.id,
    producto_nombre: productoOrigen.nombre,
    cantidad: qty,
    stock_antes: stockOrigen,
    stock_despues: nuevo,
    motivo: motivo?.trim() || '',
    usuario: usuario || '—',
    sucursal: sucursal || '',
    created_at: new Date().toISOString(),
  });

  const verbo = tipo === 'entrada' ? 'Entrada' : 'Retiro';
  return {
    ok: true,
    mensaje: `${verbo} de ${qty} uds. en "${productoOrigen.nombre}". Stock: ${stockOrigen} → ${nuevo}.`,
    log,
  };
}

/** Varias entradas de inventario en un solo paso (recepción / conteo). */
export async function aplicarEntradasMasivas(supabase, opts) {
  const { lineas, inventario, motivo, usuario, sucursal } = opts;
  if (!supabase) return { ok: false, error: 'Sin conexión a Supabase.' };
  const lista = (lineas || []).filter((l) => l?.productoId && Number(l.cantidad) > 0);
  if (!lista.length) return { ok: false, error: 'Agrega al menos un producto con cantidad.' };

  let log = leerMovimientosLocal();
  let aplicados = 0;
  const errores = [];

  for (const { productoId, cantidad } of lista) {
    const productoOrigen = (inventario || []).find((p) => p.id === productoId);
    if (!productoOrigen) {
      errores.push(`${productoId}: no encontrado`);
      continue;
    }
    const r = await aplicarMovimientoInventario(supabase, {
      tipo: 'entrada',
      productoOrigen,
      cantidad,
      motivo,
      usuario,
      sucursal,
      modo: 'masivo',
      departamento: productoOrigen.cat,
    });
    if (!r.ok) {
      errores.push(`${productoOrigen.nombre}: ${r.error}`);
      continue;
    }
    aplicados += 1;
    log = r.log || log;
    productoOrigen.stock = Number(productoOrigen.stock) + Math.floor(Number(cantidad));
  }

  if (!aplicados) return { ok: false, error: errores.join('\n') || 'No se aplicó ninguna entrada.' };
  return {
    ok: true,
    aplicados,
    errores,
    log,
    mensaje:
      errores.length > 0
        ? `Entrada masiva: ${aplicados} producto(s) OK. ${errores.length} con error.`
        : `Entrada masiva aplicada: ${aplicados} producto(s).`,
  };
}
