-- Ejecutar en Supabase → SQL Editor
-- Señales para proyección de faltante de inventario (carrito + checador de precios).

create table if not exists public.carrito_remociones (
  id uuid primary key default gen_random_uuid(),
  sucursal_id text not null,
  usuario text,
  producto_id text,
  nombre text,
  precio numeric(12,2) not null default 0,
  qty numeric(12,3) not null default 1,
  monto numeric(12,2) not null default 0,
  created_at timestamptz default now()
);

create index if not exists idx_carrito_remociones_sucursal_fecha
  on public.carrito_remociones (sucursal_id, created_at desc);

alter table public.carrito_remociones enable row level security;
drop policy if exists "carrito_remociones_anon_rw" on public.carrito_remociones;
create policy "carrito_remociones_anon_rw" on public.carrito_remociones for all using (true) with check (true);

create table if not exists public.consultas_precio (
  id uuid primary key default gen_random_uuid(),
  sucursal_id text not null,
  usuario text,
  producto_id text,
  nombre text,
  precio numeric(12,2) not null default 0,
  stock_mostrado numeric(12,3),
  qty numeric(12,3) not null default 1,
  monto numeric(12,2) not null default 0,
  created_at timestamptz default now()
);

create index if not exists idx_consultas_precio_sucursal_fecha
  on public.consultas_precio (sucursal_id, created_at desc);

alter table public.consultas_precio enable row level security;
drop policy if exists "consultas_precio_anon_rw" on public.consultas_precio;
create policy "consultas_precio_anon_rw" on public.consultas_precio for all using (true) with check (true);

-- Tras Run, espera ~30 s antes de recargar la app (caché de Supabase).
