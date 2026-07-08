-- PIN de cubre turno por sucursal — sincroniza todas las cajas del mismo código de tienda.
-- Ejecutar en Supabase → SQL Editor → Run (obligatorio para que el PIN funcione en todas las cajas).
create table if not exists public.pos_pin_cubre_turno (
  sucursal_id text primary key,
  pin text not null default '',
  updated_at timestamptz not null default now()
);

comment on table public.pos_pin_cubre_turno is
  'PIN universal de cubre turno por sucursal (vacío = desactivado). Cache local: pos3b_pin_cubre_turno.';

alter table public.pos_pin_cubre_turno enable row level security;

drop policy if exists pos_pin_cubre_turno_anon_all on public.pos_pin_cubre_turno;
create policy pos_pin_cubre_turno_anon_all on public.pos_pin_cubre_turno
  for all to anon, authenticated
  using (true)
  with check (true);
