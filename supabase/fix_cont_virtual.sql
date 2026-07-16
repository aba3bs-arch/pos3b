-- =============================================================================
-- POS 3B — Cont Virtual: categorías, subcategorías y egresos
-- Ejecutar en Supabase → SQL Editor. Seguro re-ejecutar.
-- =============================================================================

create table if not exists public.cont_virtual_categorias (
  id text primary key,
  nombre text not null,
  orden int not null default 0,
  activo boolean not null default true,
  fijo boolean not null default false,
  created_at timestamptz default now()
);

create table if not exists public.cont_virtual_subcategorias (
  id text primary key,
  categoria_id text not null references public.cont_virtual_categorias(id) on delete cascade,
  nombre text not null,
  orden int not null default 0,
  activo boolean not null default true,
  fijo boolean not null default false,
  created_at timestamptz default now()
);

create index if not exists idx_cont_virtual_sub_cat on public.cont_virtual_subcategorias (categoria_id);

create table if not exists public.cont_virtual_egresos (
  id uuid primary key default gen_random_uuid(),
  sucursal_id text not null default 'MAIN',
  fecha date not null default current_date,
  categoria_id text not null,
  categoria_nombre text,
  subcategoria_id text,
  subcategoria_nombre text,
  monto numeric(12,2) not null default 0,
  descripcion text,
  fuente text not null default 'manual',
  ref_tabla text,
  ref_id text,
  usuario_nombre text,
  created_at timestamptz default now()
);

create index if not exists idx_cont_virtual_egresos_fecha on public.cont_virtual_egresos (fecha desc);
create index if not exists idx_cont_virtual_egresos_suc on public.cont_virtual_egresos (sucursal_id, fecha desc);
create unique index if not exists idx_cont_virtual_egresos_ref
  on public.cont_virtual_egresos (ref_tabla, ref_id)
  where ref_tabla is not null and ref_id is not null;

alter table public.cont_virtual_categorias enable row level security;
alter table public.cont_virtual_subcategorias enable row level security;
alter table public.cont_virtual_egresos enable row level security;

drop policy if exists "cont_virtual_categorias_anon_rw" on public.cont_virtual_categorias;
create policy "cont_virtual_categorias_anon_rw" on public.cont_virtual_categorias for all using (true) with check (true);

drop policy if exists "cont_virtual_subcategorias_anon_rw" on public.cont_virtual_subcategorias;
create policy "cont_virtual_subcategorias_anon_rw" on public.cont_virtual_subcategorias for all using (true) with check (true);

drop policy if exists "cont_virtual_egresos_anon_rw" on public.cont_virtual_egresos;
create policy "cont_virtual_egresos_anon_rw" on public.cont_virtual_egresos for all using (true) with check (true);

-- Semillas fijas (vales Virtual + operativos)
insert into public.cont_virtual_categorias (id, nombre, orden, activo, fijo) values
  ('vales', 'Vales', 10, true, true),
  ('consumo', 'Consumo', 20, true, true),
  ('operativos', 'Gastos operativos', 30, true, true),
  ('prestamos', 'Préstamos', 40, true, true),
  ('manual', 'Otros / manual', 90, true, true)
on conflict (id) do update set nombre = excluded.nombre, fijo = true, activo = true;

insert into public.cont_virtual_subcategorias (id, categoria_id, nombre, orden, activo, fijo) values
  ('vales-gasolina', 'vales', 'Gasolina', 10, true, true),
  ('vales-herramienta', 'vales', 'Herramienta', 20, true, true),
  ('vales-accesorios', 'vales', 'Accesorios', 30, true, true),
  ('vales-consumo', 'vales', 'Consumo / personal', 40, true, true),
  ('consumo-empleado', 'consumo', 'Empleado', 10, true, true),
  ('consumo-oficina', 'consumo', 'Oficina', 20, true, true),
  ('operativos-suministros', 'operativos', 'Suministros', 10, true, true),
  ('operativos-servicios', 'operativos', 'Servicios', 20, true, true),
  ('operativos-mantenimiento', 'operativos', 'Mantenimiento', 30, true, true),
  ('operativos-otros', 'operativos', 'Otros', 40, true, true),
  ('prestamos-desembolso', 'prestamos', 'Desembolso', 10, true, true),
  ('manual-otros', 'manual', 'Otros', 10, true, true)
on conflict (id) do update set nombre = excluded.nombre, categoria_id = excluded.categoria_id, fijo = true, activo = true;

comment on table public.cont_virtual_egresos is
  'Libro de egresos Cont Virtual (manual + auto desde vales Virtual).';
