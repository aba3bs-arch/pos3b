-- =============================================================================
-- POS 3B — Clientes máquinas (externos: renta + moneda virtual + cortes)
-- Ejecutar en Supabase → SQL Editor (seguro re-ejecutar)
-- =============================================================================

create table if not exists public.clientes_maquinas (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  nombre text not null,
  negocio text,
  contacto text,
  telefono text,
  notas text,
  activo boolean not null default true,
  moneda_base numeric(12,2) not null default 10000,
  pct_descuento numeric(6,4) not null default 0.15,
  pct_empresa numeric(6,4) not null default 0.60,
  pct_cliente numeric(6,4) not null default 0.40,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_clientes_maquinas_activo
  on public.clientes_maquinas (activo, nombre);

create table if not exists public.clientes_maquinas_moneda (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes_maquinas (id) on delete cascade,
  fecha date not null default (timezone('America/Hermosillo', now()))::date,
  monto_base numeric(12,2) not null,
  pct_descuento numeric(6,4) not null,
  tras_descuento numeric(12,2) not null,
  monto_empresa numeric(12,2) not null,
  monto_cliente numeric(12,2) not null,
  notas text,
  usuario_nombre text,
  ie_egreso_empresa_id text,
  ie_ingreso_cliente_id text,
  created_at timestamptz default now()
);

create index if not exists idx_clientes_maquinas_moneda_cli
  on public.clientes_maquinas_moneda (cliente_id, created_at desc);

alter table public.clientes_maquinas enable row level security;
alter table public.clientes_maquinas_moneda enable row level security;

drop policy if exists "clientes_maquinas_anon_rw" on public.clientes_maquinas;
create policy "clientes_maquinas_anon_rw" on public.clientes_maquinas for all using (true) with check (true);

drop policy if exists "clientes_maquinas_auth_rw" on public.clientes_maquinas;
create policy "clientes_maquinas_auth_rw" on public.clientes_maquinas for all using (true) with check (true);

drop policy if exists "clientes_maquinas_moneda_anon_rw" on public.clientes_maquinas_moneda;
create policy "clientes_maquinas_moneda_anon_rw" on public.clientes_maquinas_moneda for all using (true) with check (true);

drop policy if exists "clientes_maquinas_moneda_auth_rw" on public.clientes_maquinas_moneda;
create policy "clientes_maquinas_moneda_auth_rw" on public.clientes_maquinas_moneda for all using (true) with check (true);
