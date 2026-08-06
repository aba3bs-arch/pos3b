-- =============================================================================
-- POS 3B — Ingresos manuales para IE Virtual / IE Abarrotes
-- Ejecutar en Supabase → SQL Editor (seguro re-ejecutar)
-- =============================================================================

create table if not exists public.cont_virtual_ingresos (
  id uuid primary key default gen_random_uuid(),
  sucursal_id text not null default 'MAIN',
  fecha date not null default current_date,
  categoria_id text not null,
  categoria_nombre text,
  subcategoria_id text,
  subcategoria_nombre text,
  detalle_id text,
  detalle_nombre text,
  monto numeric(12,2) not null default 0,
  descripcion text,
  fuente text not null default 'manual',
  ref_tabla text,
  ref_id text,
  usuario_nombre text,
  cuenta text not null default 'virtual',
  created_at timestamptz default now()
);

create index if not exists idx_cont_virtual_ingresos_fecha
  on public.cont_virtual_ingresos (fecha desc);
create index if not exists idx_cont_virtual_ingresos_suc
  on public.cont_virtual_ingresos (sucursal_id, fecha desc);
create index if not exists idx_cont_virtual_ingresos_cuenta
  on public.cont_virtual_ingresos (cuenta, fecha desc);
create unique index if not exists idx_cont_virtual_ingresos_ref
  on public.cont_virtual_ingresos (ref_tabla, ref_id)
  where ref_tabla is not null and ref_id is not null;

alter table public.cont_virtual_ingresos enable row level security;
drop policy if exists "cont_virtual_ingresos_anon_rw" on public.cont_virtual_ingresos;
create policy "cont_virtual_ingresos_anon_rw" on public.cont_virtual_ingresos
  for all using (true) with check (true);

-- Semilla: categoría/sub para ingresos manuales (reutiliza catálogo existente)
insert into public.cont_virtual_categorias (id, nombre, orden, activo, fijo) values
  ('ingresos', 'Ingresos', 5, true, true)
on conflict (id) do update set nombre = excluded.nombre, activo = true, fijo = true;

insert into public.cont_virtual_subcategorias (id, categoria_id, nombre, orden, activo, fijo) values
  ('ingresos-manual', 'ingresos', 'Ingreso manual', 10, true, true),
  ('ingresos-otros', 'ingresos', 'Otros ingresos', 20, true, true)
on conflict (id) do update set nombre = excluded.nombre, activo = true, fijo = true;

comment on table public.cont_virtual_ingresos is
  'Ingresos capturados a mano en IE VIRTUAL / IE ABARROTES (además de recolecciones).';
