-- POS 3B — Snapshots de conteo físico (reporte desde MAIN)
-- Supabase → SQL Editor → Run
--
-- NO crea tabla nueva: reutiliza movimientos_inventario con modo = 'conteo_snapshot'
-- y meta.ajuste_snapshot (JSON con todas las líneas contadas, incluidas sin diferencia).
--
-- Requisito previo: supabase/fix_movimientos_inventario.sql

-- Asegura tabla base (por si aún no existe en este proyecto)
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

alter table public.movimientos_inventario
  add column if not exists meta jsonb default '{}'::jsonb;

alter table public.movimientos_inventario enable row level security;

-- Solo lectura + alta. La bitácora NO se edita ni se borra desde el POS.
drop policy if exists "movimientos_inventario_anon_rw" on public.movimientos_inventario;
drop policy if exists "movimientos_inventario_anon_select" on public.movimientos_inventario;
drop policy if exists "movimientos_inventario_anon_insert" on public.movimientos_inventario;

create policy "movimientos_inventario_anon_select" on public.movimientos_inventario
  for select using (true);

create policy "movimientos_inventario_anon_insert" on public.movimientos_inventario
  for insert with check (true);

revoke update, delete on public.movimientos_inventario from anon, authenticated;
grant select, insert on public.movimientos_inventario to anon, authenticated;

create index if not exists idx_mov_inv_modo_fecha
  on public.movimientos_inventario (modo, sucursal_id, created_at desc);

comment on table public.movimientos_inventario is
  'Entradas, retiros, traspasos, cancelaciones, ajustes, cambios de precio y snapshots de conteo (modo conteo_snapshot).';

-- Tras Run, espera ~30 s y recarga el POS.
