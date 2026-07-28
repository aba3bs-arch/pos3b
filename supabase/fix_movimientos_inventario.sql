-- Ejecutar en Supabase → SQL Editor
-- Bitácora de movimientos de inventario (visible en Consultas desde cualquier caja).

create table if not exists public.movimientos_inventario (
  id uuid primary key default gen_random_uuid(),
  tipo text not null,
  modo text,
  producto_id text,
  producto_nombre text,
  producto_destino_id text,
  producto_destino_nombre text,
  cantidad numeric(12,3) default 0,
  stock_antes numeric(12,3),
  stock_despues numeric(12,3),
  stock_dest_antes numeric(12,3),
  stock_dest_despues numeric(12,3),
  precio_antes numeric(12,2),
  precio_despues numeric(12,2),
  ubicacion text,
  departamento text,
  motivo text,
  usuario text,
  sucursal_id text not null,
  meta jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_mov_inv_sucursal_fecha
  on public.movimientos_inventario (sucursal_id, created_at desc);
create index if not exists idx_mov_inv_producto
  on public.movimientos_inventario (producto_id, created_at desc);
create index if not exists idx_mov_inv_tipo_fecha
  on public.movimientos_inventario (tipo, created_at desc);

alter table public.movimientos_inventario enable row level security;
drop policy if exists "movimientos_inventario_anon_rw" on public.movimientos_inventario;
create policy "movimientos_inventario_anon_rw" on public.movimientos_inventario
  for all using (true) with check (true);

comment on table public.movimientos_inventario is
  'Entradas, retiros, traspasos, cancelaciones, ajustes y cambios de precio para Consultas.';

-- Tras Run, espera ~30 s y recarga el POS.
