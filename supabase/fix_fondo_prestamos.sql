-- Fondo de préstamos (Tesorería). Reingreso de lo descontado en nómina.
-- Ejecutar en Supabase → SQL Editor. Se puede volver a correr.

create table if not exists public.fondo_prestamos_mov (
  id uuid primary key default gen_random_uuid(),
  prestamo_id uuid,
  tipo text not null,
  monto numeric(12,2) not null,
  nombre_empleado text,
  notas text,
  created_by text,
  created_at timestamptz default now()
);

create index if not exists idx_fondo_prestamos_mov_fecha
  on public.fondo_prestamos_mov (created_at desc);

alter table public.fondo_prestamos_mov enable row level security;
drop policy if exists "fondo_prestamos_mov_anon_rw" on public.fondo_prestamos_mov;
create policy "fondo_prestamos_mov_anon_rw" on public.fondo_prestamos_mov
  for all using (true) with check (true);
