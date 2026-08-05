-- =============================================================================
-- POS 3B — RIF (Requisición Interna de Fondos) + área en notificaciones (buzones)
-- Ejecutar en Supabase → SQL Editor (seguro re-ejecutar)
-- =============================================================================

create table if not exists public.rifs (
  id uuid primary key default gen_random_uuid(),
  folio text not null,
  sucursal_origen text not null,
  sucursal_destino text not null,
  responsable_nombre text not null,
  responsable_usuario_id text,
  monto numeric(12,2) not null default 0,
  motivo text,
  hora_promesa timestamptz not null,
  estado text not null default 'abierto',
  -- abierto | liquidado | vencido | cancelado
  emitido_por text,
  emitido_por_id text,
  emitido_at timestamptz default now(),
  liquidado_por text,
  liquidado_at timestamptz,
  gasto_id uuid,
  gasto_eliminado boolean default false,
  created_at timestamptz default now()
);

create index if not exists idx_rifs_origen_estado on public.rifs (sucursal_origen, estado, hora_promesa);
create index if not exists idx_rifs_folio on public.rifs (folio);
create unique index if not exists idx_rifs_folio_unico on public.rifs (folio);

alter table public.rifs enable row level security;
drop policy if exists "rifs_anon_rw" on public.rifs;
create policy "rifs_anon_rw" on public.rifs for all using (true) with check (true);

-- Buzones Virtual / Abarrotes / Garage: columna opcional en notificaciones
alter table public.contabilidad_notificaciones
  add column if not exists area_buzon text;

create index if not exists idx_cont_notif_area
  on public.contabilidad_notificaciones (area_buzon, estado, created_at desc);

comment on table public.rifs is
  'Requisición Interna de Fondos: origen→destino, promesa de pago; al vencer carga gasto Fondo requerido en corte abarrotes.';
