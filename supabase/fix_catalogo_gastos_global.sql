-- =============================================================================
-- POS 3B — Catálogo de gastos global (todas las sucursales)
-- Opcional: consolida categorías existentes bajo sucursal_id = 'GLOBAL'
-- Seguro re-ejecutar parcialmente (puede duplicar si ya migró).
-- =============================================================================

-- Insertar filas globales desde categorías por tienda (sin duplicar categoría+modulo)
insert into public.cortes_gasto_catalogo (sucursal_id, modulo, categoria, subcategorias)
select distinct on (modulo, categoria)
  'GLOBAL' as sucursal_id,
  modulo,
  categoria,
  subcategorias
from public.cortes_gasto_catalogo
where sucursal_id is distinct from 'GLOBAL'
order by modulo, categoria
on conflict (sucursal_id, modulo, categoria) do update
  set subcategorias = excluded.subcategorias;
