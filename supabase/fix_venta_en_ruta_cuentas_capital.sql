-- =============================================================================
-- POS 3B — Venta en Ruta: cuentas efectivo, capital y preinventario
-- Ejecutar en Supabase → SQL Editor (seguro re-ejecutar)
-- Requiere: fix_venta_en_ruta.sql y fix_precio_ruta_y_cxc.sql
-- =============================================================================

-- Cuenta de efectivo de ruta (ventas efectivo, cobranzas, capital liberado)
create table if not exists public.ruta_efectivo_movimientos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null, -- ingreso | egreso
  origen text not null, -- venta | cobranza | capital | ajuste | liquidacion
  monto numeric(12,2) not null check (monto > 0),
  saldo_despues numeric(12,2),
  ref_tabla text,
  ref_id text,
  notas text,
  usuario_nombre text,
  created_at timestamptz default now()
);
create index if not exists idx_ruta_efectivo_fecha on public.ruta_efectivo_movimientos (created_at desc);
create index if not exists idx_ruta_efectivo_origen on public.ruta_efectivo_movimientos (origen, created_at desc);

-- Solicitudes de capital para gastos del vendedor de ruta
create table if not exists public.ruta_capital_solicitudes (
  id uuid primary key default gen_random_uuid(),
  vendedor_id text,
  vendedor_nombre text not null,
  monto numeric(12,2) not null check (monto > 0),
  motivo text,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'liberado', 'justificado', 'rechazado', 'cancelado')),
  liberado_por text,
  liberado_at timestamptz,
  foto_ticket_url text,
  justificado_at timestamptz,
  justificado_notas text,
  rechazado_por text,
  rechazado_at timestamptz,
  rechazo_motivo text,
  created_at timestamptz default now()
);
create index if not exists idx_ruta_capital_estado on public.ruta_capital_solicitudes (estado, created_at desc);
create index if not exists idx_ruta_capital_vendedor on public.ruta_capital_solicitudes (vendedor_id, created_at desc);

-- Preinventario de ruta (plantilla / sesión sobre catálogo CEDIS Ruta)
create table if not exists public.ruta_preinventario_sesiones (
  id uuid primary key default gen_random_uuid(),
  nombre text,
  vendedor_id text,
  vendedor_nombre text,
  lineas jsonb not null default '[]',
  resumen jsonb,
  estado text not null default 'abierta' check (estado in ('abierta', 'cerrada')),
  created_at timestamptz default now(),
  cerrado_at timestamptz
);
create index if not exists idx_ruta_preinv_fecha on public.ruta_preinventario_sesiones (created_at desc);

alter table public.ruta_efectivo_movimientos enable row level security;
alter table public.ruta_capital_solicitudes enable row level security;
alter table public.ruta_preinventario_sesiones enable row level security;

drop policy if exists "ruta_efectivo_anon" on public.ruta_efectivo_movimientos;
create policy "ruta_efectivo_anon" on public.ruta_efectivo_movimientos for all using (true) with check (true);
drop policy if exists "ruta_capital_anon" on public.ruta_capital_solicitudes;
create policy "ruta_capital_anon" on public.ruta_capital_solicitudes for all using (true) with check (true);
drop policy if exists "ruta_preinv_anon" on public.ruta_preinventario_sesiones;
create policy "ruta_preinv_anon" on public.ruta_preinventario_sesiones for all using (true) with check (true);

comment on table public.ruta_efectivo_movimientos is
  'Cuenta efectivo de Venta en Ruta. Solo se mueve por ventas, cobranza, capital o ajustes de admin.';
comment on table public.ruta_capital_solicitudes is
  'Capital para gastos: vendedor solicita → admin libera → vendedor justifica con foto del ticket.';
comment on table public.ruta_preinventario_sesiones is
  'Preinventario del vendedor de ruta (no modifica stock teórico).';
