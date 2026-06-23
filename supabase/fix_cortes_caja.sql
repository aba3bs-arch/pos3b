-- Ejecutar en Supabase → SQL Editor
-- Guarda cortes de caja en la nube (Consultas los lista y filtra).

create table if not exists public.cortes_caja (
  id uuid primary key default gen_random_uuid(),
  sucursal_id text not null,
  usuario text,
  usuario_id uuid references public.usuarios(id) on delete set null,
  fecha date not null default (now() at time zone 'utc')::date,
  total_ventas numeric(12,2) default 0,
  tickets integer default 0,
  efectivo_esperado numeric(12,2) default 0,
  efectivo_contado numeric(12,2) default 0,
  diferencia numeric(12,2) default 0,
  electronico numeric(12,2) default 0,
  grupos jsonb default '{}'::jsonb,
  detalle_metodos jsonb default '[]'::jsonb,
  notas text,
  created_at timestamptz default now()
);

create index if not exists idx_cortes_sucursal_fecha on public.cortes_caja (sucursal_id, fecha desc);
create index if not exists idx_cortes_created on public.cortes_caja (created_at desc);

alter table public.cortes_caja enable row level security;
drop policy if exists "cortes_caja_anon_rw" on public.cortes_caja;
create policy "cortes_caja_anon_rw" on public.cortes_caja for all using (true) with check (true);

comment on table public.cortes_caja is 'Cortes de caja por tienda; consultables en módulo Consultas.';
