-- =============================================================================
-- POS 3B — Gastos con evidencia (empleados → aprobación → IE VIRTUAL)
-- Ejecutar en Supabase → SQL Editor (seguro re-ejecutar)
-- =============================================================================

create table if not exists public.gastos_evidencia (
  id uuid primary key default gen_random_uuid(),
  usuario_id text not null,
  usuario_nombre text,
  sucursal_id text default 'MAIN',
  fecha date not null default (timezone('America/Hermosillo', now()))::date,
  monto numeric(12,2) not null check (monto > 0),
  descripcion text not null,
  categoria_id text not null,
  categoria_nombre text,
  subcategoria_id text,
  subcategoria_nombre text,
  detalle_id text,
  detalle_nombre text,
  cuenta text default 'virtual',
  estado text not null default 'pendiente',
  sellado_por text,
  sellado_at timestamptz,
  ie_egreso_id text,
  motivo_rechazo text,
  rechazado_por text,
  rechazado_at timestamptz,
  admin_aprobado_por text,
  admin_aprobado_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- estados: pendiente | pendiente_amr | sellado | rechazado
-- Gastos AMR: 1.º PIN ABB/JLBB/FJBB → pendiente_amr; 2.º PIN AMR → sellado

alter table public.gastos_evidencia add column if not exists admin_aprobado_por text;
alter table public.gastos_evidencia add column if not exists admin_aprobado_at timestamptz;

create index if not exists idx_gastos_evidencia_usuario
  on public.gastos_evidencia (usuario_id, created_at desc);

create index if not exists idx_gastos_evidencia_estado
  on public.gastos_evidencia (estado, created_at desc);

create index if not exists idx_gastos_evidencia_fecha
  on public.gastos_evidencia (fecha desc);

create table if not exists public.gastos_evidencia_archivos (
  id uuid primary key default gen_random_uuid(),
  gasto_id uuid not null references public.gastos_evidencia (id) on delete cascade,
  tipo text not null default 'image',
  nombre_archivo text,
  mime text,
  contenido text not null,
  bytes_aprox integer default 0,
  created_at timestamptz default now()
);

create index if not exists idx_gastos_evidencia_archivos_gasto
  on public.gastos_evidencia_archivos (gasto_id, created_at asc);

alter table public.gastos_evidencia enable row level security;
alter table public.gastos_evidencia_archivos enable row level security;

drop policy if exists "gastos_evidencia_anon_rw" on public.gastos_evidencia;
create policy "gastos_evidencia_anon_rw" on public.gastos_evidencia for all using (true) with check (true);

drop policy if exists "gastos_evidencia_auth_rw" on public.gastos_evidencia;
create policy "gastos_evidencia_auth_rw" on public.gastos_evidencia for all using (true) with check (true);

drop policy if exists "gastos_evidencia_archivos_anon_rw" on public.gastos_evidencia_archivos;
create policy "gastos_evidencia_archivos_anon_rw" on public.gastos_evidencia_archivos for all using (true) with check (true);

drop policy if exists "gastos_evidencia_archivos_auth_rw" on public.gastos_evidencia_archivos;
create policy "gastos_evidencia_archivos_auth_rw" on public.gastos_evidencia_archivos for all using (true) with check (true);
