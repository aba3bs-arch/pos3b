/**
 * Carga todos los vínculos proveedor ↔ producto.
 * PostgREST corta en ~1000 filas; sin paginación los vínculos nuevos
 * (p. ej. el catálogo CUETES en CEDIS) no entran al mapa y el departamento sale vacío.
 */
export const VINCULOS_PAGE_SIZE = 1000;

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ proveedorId?: string|null }} [opts]
 * @returns {Promise<{ ok: true, data: object[] } | { ok: false, error: any, data: object[] }>}
 */
export async function cargarTodosLosVinculosProveedor(supabase, opts = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.', data: [] };

  const proveedorId = opts.proveedorId ? String(opts.proveedorId) : '';
  const all = [];
  let from = 0;

  for (;;) {
    let q = supabase.from('proveedor_producto').select('proveedor_id, producto_id');
    if (proveedorId) q = q.eq('proveedor_id', proveedorId);
    const to = from + VINCULOS_PAGE_SIZE - 1;
    const { data, error } = await q.order('producto_id').range(from, to);
    if (error) return { ok: false, error, data: all };
    const batch = data || [];
    all.push(...batch);
    if (batch.length < VINCULOS_PAGE_SIZE) break;
    from += VINCULOS_PAGE_SIZE;
  }

  return { ok: true, data: all };
}
