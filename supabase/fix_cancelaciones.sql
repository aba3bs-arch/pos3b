-- Ejecutar en Supabase → SQL Editor
-- Registra cancelaciones de tickets (restan del corte y devuelven inventario).

create table if not exists public.cancelaciones (
  id uuid primary key default gen_random_uuid(),
  venta_id uuid references public.ventas(id) on delete set null,
  sucursal_id text not null,
  usuario text,
  metodo_pago text,
  articulos jsonb not null default '[]'::jsonb,
  total numeric(12,2) not null default 0,
  motivo text,
  created_at timestamptz default now()
);

create index if not exists idx_cancelaciones_sucursal_fecha on public.cancelaciones (sucursal_id, created_at desc);
create index if not exists idx_cancelaciones_venta on public.cancelaciones (venta_id);

alter table public.cancelaciones enable row level security;
drop policy if exists "cancelaciones_anon_rw" on public.cancelaciones;
create policy "cancelaciones_anon_rw" on public.cancelaciones for all using (true) with check (true);

-- Tras Run, espera ~30 s antes de recargar la app (caché de Supabase).
