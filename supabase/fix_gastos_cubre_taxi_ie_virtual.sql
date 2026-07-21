-- =============================================================================
-- POS 3B — CUBRE TURNO / TAXIS → IE VIRTUAL
-- Categorías de captura en Corte Virtual + categorías en libro IE VIRTUAL.
-- Seguro re-ejecutar.
-- =============================================================================

-- Catálogo de gastos Corte Virtual (global)
insert into public.cortes_gasto_catalogo (sucursal_id, modulo, categoria, subcategorias)
values
  ('GLOBAL', 'virtual', 'CUBRE TURNO', '["PAGO"]'::jsonb),
  ('GLOBAL', 'virtual', 'TAXIS', '["SERVICIO"]'::jsonb)
on conflict (sucursal_id, modulo, categoria) do update
  set subcategorias = excluded.subcategorias;

-- Libro IE VIRTUAL
insert into public.cont_virtual_categorias (id, nombre, orden, activo, fijo) values
  ('cubre-turno', 'Cubre turno', 35, true, true),
  ('taxis', 'Taxis', 36, true, true)
on conflict (id) do update set nombre = excluded.nombre, fijo = true, activo = true;

insert into public.cont_virtual_subcategorias (id, categoria_id, nombre, orden, activo, fijo) values
  ('cubre-turno-pago', 'cubre-turno', 'Pago', 10, true, true),
  ('taxis-servicio', 'taxis', 'Servicio', 10, true, true)
on conflict (id) do update set nombre = excluded.nombre, categoria_id = excluded.categoria_id, fijo = true, activo = true;
