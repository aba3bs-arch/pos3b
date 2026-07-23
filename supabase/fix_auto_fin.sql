-- =============================================================================
-- POS 3B — Auto Fin: créditos de autofinanciamiento
-- Ejecutar en Supabase → SQL Editor. Seguro re-ejecutar.
-- =============================================================================

create table if not exists public.auto_fin_creditos (
  id uuid primary key default gen_random_uuid(),
  sucursal_id text not null default 'MAIN',
  cliente_id text,
  cliente_nombre text not null,
  cliente_telefono text,
  descripcion text,
  precio numeric(12,2) not null default 0,
  enganche numeric(12,2) not null default 0,
  monto_financiar numeric(12,2) not null default 0,
  frecuencia text not null default 'semanal' check (frecuencia in ('semanal', 'quincenal', 'mensual')),
  num_cuotas int not null default 1,
  con_interes boolean not null default false,
  tasa_interes numeric(8,4) not null default 0,
  interes_total numeric(12,2) not null default 0,
  total_pagar numeric(12,2) not null default 0,
  cuota_monto numeric(12,2) not null default 0,
  fecha_inicio date not null default current_date,
  estado text not null default 'activo' check (estado in ('activo', 'liquidado', 'cancelado')),
  notas text,
  usuario_nombre text,
  created_at timestamptz default now()
);

create index if not exists idx_auto_fin_creditos_estado on public.auto_fin_creditos (estado, created_at desc);
create index if not exists idx_auto_fin_creditos_cliente on public.auto_fin_creditos (cliente_nombre);

create table if not exists public.auto_fin_cuotas (
  id uuid primary key default gen_random_uuid(),
  credito_id uuid not null references public.auto_fin_creditos(id) on delete cascade,
  numero int not null,
  fecha_vencimiento date not null,
  monto numeric(12,2) not null default 0,
  capital numeric(12,2) not null default 0,
  interes numeric(12,2) not null default 0,
  pagado numeric(12,2) not null default 0,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'parcial', 'pagada', 'vencida')),
  created_at timestamptz default now(),
  unique (credito_id, numero)
);

create index if not exists idx_auto_fin_cuotas_credito on public.auto_fin_cuotas (credito_id, numero);

create table if not exists public.auto_fin_pagos (
  id uuid primary key default gen_random_uuid(),
  credito_id uuid not null references public.auto_fin_creditos(id) on delete cascade,
  cuota_id uuid references public.auto_fin_cuotas(id) on delete set null,
  fecha date not null default current_date,
  monto numeric(12,2) not null default 0,
  metodo text,
  nota text,
  usuario_nombre text,
  created_at timestamptz default now()
);

create index if not exists idx_auto_fin_pagos_credito on public.auto_fin_pagos (credito_id, fecha desc);

alter table public.auto_fin_creditos enable row level security;
alter table public.auto_fin_cuotas enable row level security;
alter table public.auto_fin_pagos enable row level security;

drop policy if exists "auto_fin_creditos_anon_rw" on public.auto_fin_creditos;
create policy "auto_fin_creditos_anon_rw" on public.auto_fin_creditos for all using (true) with check (true);

drop policy if exists "auto_fin_cuotas_anon_rw" on public.auto_fin_cuotas;
create policy "auto_fin_cuotas_anon_rw" on public.auto_fin_cuotas for all using (true) with check (true);

drop policy if exists "auto_fin_pagos_anon_rw" on public.auto_fin_pagos;
create policy "auto_fin_pagos_anon_rw" on public.auto_fin_pagos for all using (true) with check (true);

comment on table public.auto_fin_creditos is 'Autofinanciamiento Contabilidad → Auto Fin (vehículos y préstamos)';

-- Extensión préstamos (también en fix_auto_fin_prestamos.sql)
alter table public.auto_fin_creditos add column if not exists tipo text not null default 'vehiculo';
alter table public.auto_fin_creditos add column if not exists beneficiario_tipo text not null default 'cliente';
alter table public.auto_fin_creditos add column if not exists empleado_id text;
alter table public.auto_fin_creditos add column if not exists empleado_nombre text;
alter table public.auto_fin_creditos add column if not exists prestamo_id uuid;
create index if not exists idx_auto_fin_creditos_tipo on public.auto_fin_creditos (tipo, estado, created_at desc);