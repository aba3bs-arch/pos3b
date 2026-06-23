/** Cantidad sugerida según stock actual y mínimo configurado. */
export function sugerirQtyPedido(p, umbralCatalogo, vendidoPeriodo = 0) {
  const stock = Number(p.stock) || 0;
  const min =
    p.stock_minimo != null && !Number.isNaN(Number(p.stock_minimo))
      ? Math.max(0, Number(p.stock_minimo))
      : Math.max(1, Number(umbralCatalogo) || 8);

  const ventasBoost = vendidoPeriodo > 0 ? Math.ceil(vendidoPeriodo * 0.35) : 0;
  const objetivoBase = Math.max(min * 2, min + 6, Number(umbralCatalogo) + 4);
  const objetivo = objetivoBase + ventasBoost;

  if (stock >= min && stock >= objetivo * 0.85) return 0;
  return Math.max(1, Math.round(objetivo - stock));
}

export function costoEstimadoProducto(p) {
  const pr = Number(p.precio) || 0;
  return Math.round(pr * 0.7 * 100) / 100;
}

/** Suma unidades vendidas por producto.id en un listado de ventas. */
export function ventasPorProductoDesdeVentas(ventas) {
  const map = {};
  for (const v of ventas || []) {
    const arts = Array.isArray(v.articulos) ? v.articulos : [];
    for (const a of arts) {
      const id = a.id ?? a.codigo ?? a.producto_id;
      if (!id) continue;
      const key = String(id);
      const q = Number(a.qty ?? a.cantidad ?? 1) || 1;
      map[key] = (map[key] || 0) + q;
    }
  }
  return map;
}

/** Ventas por producto y por día (YYYY-MM-DD). */
export function ventasPorProductoPorDia(ventas) {
  const map = {};
  for (const v of ventas || []) {
    const day = v.created_at ? String(v.created_at).slice(0, 10) : 'sin-fecha';
    for (const a of v.articulos || []) {
      const id = a.id ?? a.codigo ?? a.producto_id;
      if (!id) continue;
      const key = String(id);
      if (!map[key]) map[key] = {};
      const q = Number(a.qty ?? a.cantidad ?? 1) || 1;
      map[key][day] = (map[key][day] || 0) + q;
    }
  }
  return map;
}

/** Últimos N días calendario (más reciente al final). */
export function ultimosDias(n = 7) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export function etiquetaDiaCorto(iso) {
  if (!iso || iso === 'sin-fecha') return '—';
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric' });
}
