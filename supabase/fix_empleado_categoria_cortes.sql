-- POS 3B — Reactivar categoría Empleado (cortes Virtual / Abarrotes / Garage + nómina)
-- Ejecutar en Supabase si EMPLEADO no aparece o se "rompió" al editar el catálogo.
-- La app también repara sola al cargar el catálogo IE.

insert into public.cont_virtual_categorias (id, nombre, orden, activo, fijo) values
  ('empleado', 'Empleado 🤵', 18, true, true)
on conflict (id) do update
  set nombre = excluded.nombre,
      orden = excluded.orden,
      fijo = true,
      activo = true;

insert into public.cont_virtual_subcategorias (id, categoria_id, nombre, orden, activo, fijo) values
  ('empleado-consumo', 'empleado', 'Consumo 🥫', 10, true, true),
  ('empleado-anticipo', 'empleado', 'Anticipo $', 20, true, true),
  ('empleado-cubre', 'empleado', 'Cubre turnos 👭', 30, true, true),
  ('empleado-faltante', 'empleado', 'Faltante ❎', 40, true, true),
  ('empleado-nomina', 'empleado', 'Nomina Empleado 💰', 50, true, true),
  ('empleado-otros', 'empleado', 'otros ‼️', 60, true, true),
  ('empleado-recargas', 'empleado', 'Recargas 📱', 70, true, true)
on conflict (id) do update
  set nombre = excluded.nombre,
      categoria_id = excluded.categoria_id,
      orden = excluded.orden,
      fijo = true,
      activo = true;
