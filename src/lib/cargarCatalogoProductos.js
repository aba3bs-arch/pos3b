/**
 * Carga todo el catálogo `productos`.
 * Supabase/PostgREST limita ~1000 filas por request; sin paginación
 * los productos nuevos fuera de ese tope “desaparecen” del UI.
 */
export const PRODUCTOS_PAGE_SIZE = 1000;

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<{ ok: true, data: object[] } | { ok: false, error: any, data: object[] }>}
 */
export async function cargarTodosLosProductos(supabase) {
  if (!supabase) return { ok: false, error: 'Sin conexión.', data: [] };

  const all = [];
  let from = 0;

  for (;;) {
    const to = from + PRODUCTOS_PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from('productos')
      .select('*')
      .order('nombre')
      .range(from, to);

    if (error) return { ok: false, error, data: all };

    const batch = data || [];
    all.push(...batch);
    if (batch.length < PRODUCTOS_PAGE_SIZE) break;
    from += PRODUCTOS_PAGE_SIZE;
  }

  return { ok: true, data: all };
}
