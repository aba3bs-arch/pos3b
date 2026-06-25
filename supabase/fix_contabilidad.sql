-- =============================================================================
-- POS 3B — Contabilidad: nómina, vales y préstamos
-- Supabase → SQL Editor → Run (seguro re-ejecutar)
-- =============================================================================

-- Rol Técnico (ejecutar también fix_usuarios_rol_check.sql actualizado)

create table if not exists public.nomina_periodos (
  id uuid primary key default gen_random_uuid(),
  sucursal_id text default 'MAIN',
  periodo_inicio date not null,
  periodo_fin date not null,
  estado text default 'borrador',
  notas text,
  total numeric(14,2) default 0,
  created_at timestamptz default now(),
  created_by text
);

create table if not exists public.nomina_lineas (
  id uuid primary key default gen_random_uuid(),
  periodo_id uuid not null references public.nomina_periodos(id) on delete cascade,
  usuario_id uuid references public.usuarios(id) on delete set null,
  nombre text not null,
  rol text,
  sueldo_base numeric(12,2) default 0,
  bonificacion numeric(12,2) default 0,
  deducciones numeric(12,2) default 0,
  total numeric(12,2) default 0,
  notas text
);

create index if not exists idx_nomina_lineas_periodo on public.nomina_lineas (periodo_id);

create table if not exists public.vales (
  id uuid primary key default gen_random_uuid(),
  sucursal_id text default 'MAIN',
  usuario_id uuid references public.usuarios(id) on delete set null,
  nombre_empleado text not null,
  monto numeric(12,2) not null default 0,
  motivo text,
  fecha date default current_date,
  created_at timestamptz default now(),
  created_by text
);

create table if not exists public.prestamos (
  id uuid primary key default gen_random_uuid(),
  sucursal_id text default 'MAIN',
  usuario_id uuid references public.usuarios(id) on delete set null,
  nombre_empleado text not null,
  monto_original numeric(12,2) not null default 0,
  saldo numeric(12,2) not null default 0,
  abono numeric(12,2) default 0,
  fecha date default current_date,
  estado text default 'activo',
  notas text,
  created_at timestamptz default now(),
  created_by text
);

alter table public.nomina_periodos enable row level security;
alter table public.nomina_lineas enable row level security;
alter table public.vales enable row level security;
alter table public.prestamos enable row level security;

drop policy if exists "nomina_periodos_anon_rw" on public.nomina_periodos;
create policy "nomina_periodos_anon_rw" on public.nomina_periodos for all using (true) with check (true);

drop policy if exists "nomina_lineas_anon_rw" on public.nomina_lineas;
create policy "nomina_lineas_anon_rw" on public.nomina_lineas for all using (true) with check (true);

drop policy if exists "vales_anon_rw" on public.vales;
create policy "vales_anon_rw" on public.vales for all using (true) with check (true);

drop policy if exists "prestamos_anon_rw" on public.prestamos;
create policy "prestamos_anon_rw" on public.prestamos for all using (true) with check (true);
