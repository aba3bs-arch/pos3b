-- =============================================================================
-- POS 3B — Traspasos de inventario (enviar / recibir / solicitar)
-- Solo MAIN→sucursal o sucursal→sucursal. Seguro re-ejecutar.
-- =============================================================================

create table if not exists public.inventario_traspasos (
  id uuid primary key default gen_random_uuid(),
  folio text not null,
  tipo text not null default 'envio',
  -- envio | solicitud
  estado text not null default 'borrador',
  -- borrador | enviado | recibido | cancelado | solicitud | rechazado
  origen_id text not null,
  destino_id text not null,
  ubicacion_origen text not null default 'piso',
  ubicacion_destino text not null default 'piso',
  notas text,
  usuario_crea text,
  usuario_envia text,
  usuario_recibe text,
  solicitud_id uuid,
  lineas jsonb not null default '[]'::jsonb,
  created_at timestamptz default now(),
  enviado_at timestamptz,
  recibido_at timestamptz
);

create index if not exists idx_inv_traspasos_destino_estado
  on public.inventario_traspasos (destino_id, estado, created_at desc);
create index if not exists idx_inv_traspasos_origen_estado
  on public.inventario_traspasos (origen_id, estado, created_at desc);
create index if not exists idx_inv_traspasos_folio
  on public.inventario_traspasos (folio);

alter table public.inventario_traspasos enable row level security;

drop policy if exists "inventario_traspasos_anon_rw" on public.inventario_traspasos;
create policy "inventario_traspasos_anon_rw"
  on public.inventario_traspasos for all using (true) with check (true);
