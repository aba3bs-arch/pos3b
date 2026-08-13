-- POS 3B: reactivar categoria Empleado (cortes Virtual / Abarrotes / Garage + nomina)
-- Ejecutar en Supabase SQL Editor si EMPLEADO no aparece o se rompio al editar el catalogo.
-- La app tambien repara sola al cargar el catalogo IE.

insert into public.cont_virtual_categorias (id, nombre, orden, activo, fijo)
values ('empleado', 'Empleado', 18, true, true)
on conflict (id) do update
set
  nombre = excluded.nombre,
  orden = excluded.orden,
  fijo = true,
  activo = true;

insert into public.cont_virtual_subcategorias (id, categoria_id, nombre, orden, activo, fijo)
values
  ('empleado-consumo', 'empleado', 'Consumo', 10, true, true),
  ('empleado-anticipo', 'empleado', 'Anticipo', 20, true, true),
  ('empleado-cubre', 'empleado', 'Cubre turnos', 30, true, true),
  ('empleado-faltante', 'empleado', 'Faltante', 40, true, true),
  ('empleado-nomina', 'empleado', 'Nomina Empleado', 50, true, true),
  ('empleado-otros', 'empleado', 'otros', 60, true, true),
  ('empleado-recargas', 'empleado', 'Recargas', 70, true, true)
on conflict (id) do update
set
  nombre = excluded.nombre,
  categoria_id = excluded.categoria_id,
  orden = excluded.orden,
  fijo = true,
  activo = true;

select c.id as categoria_id, c.nombre, c.activo, s.id as sub_id, s.nombre as sub_nombre, s.activo as sub_activo
from public.cont_virtual_categorias c
left join public.cont_virtual_subcategorias s on s.categoria_id = c.id
where c.id = 'empleado'
order by s.orden;
