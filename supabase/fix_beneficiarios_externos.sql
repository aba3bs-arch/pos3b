-- Arrendatarios (no son empleados). Fiado y anticipo de renta en Vales y Préstamos.
-- Supabase → SQL Editor → Run

create table if not exists public.beneficiarios_externos (
  id text primary key,
  nombre text not null,
  nota text,
  tipo text not null default 'arrendatario',
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  created_by text
);

alter table public.beneficiarios_externos enable row level security;

drop policy if exists "beneficiarios_externos_anon_rw" on public.beneficiarios_externos;
create policy "beneficiarios_externos_anon_rw" on public.beneficiarios_externos
  for all to anon, authenticated
  using (true)
  with check (true);

comment on table public.beneficiarios_externos is
  'Personas que no son empleados de las 3B (arrendatarios). Generan egreso por fiado o anticipo de renta; no van a nómina.';
