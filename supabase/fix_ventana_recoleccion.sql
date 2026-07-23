-- Ventana horaria de recolección por sucursal (hora Sonora).
-- Permite aplicar el mismo horario a todas las tiendas o solo a las seleccionadas.
create table if not exists public.pos_ventana_recoleccion (
  sucursal_id text primary key,
  hora_inicio int not null default 8 check (hora_inicio >= 0 and hora_inicio <= 22),
  hora_fin int not null default 20 check (hora_fin >= 1 and hora_fin <= 23),
  updated_at timestamptz not null default now(),
  constraint pos_ventana_recoleccion_rango check (hora_fin > hora_inicio)
);

alter table public.pos_ventana_recoleccion enable row level security;

drop policy if exists pos_ventana_recoleccion_anon_all on public.pos_ventana_recoleccion;
create policy pos_ventana_recoleccion_anon_all on public.pos_ventana_recoleccion
  for all to anon, authenticated
  using (true)
  with check (true);

comment on table public.pos_ventana_recoleccion is
  'Horario de cobro de efectivo por tienda. Cada caja sincroniza su sucursal_id al iniciar sesión.';
