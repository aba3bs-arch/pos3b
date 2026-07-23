-- =============================================================================
-- POS 3B — Inversión oficina → proveedor (recuperable en corte de tienda)
-- 1) Oficina registra egreso en IE VIRTUAL / IE ABARROTES
-- 2) Queda pendiente de cobro en la sucursal destino
-- 3) Al cobrar en el corte se descuenta de la caja de la tienda
-- =============================================================================

create table if not exists public.inversiones_oficina_proveedor (
  id uuid primary key default gen_random_uuid(),
  sucursal_origen text not null default 'MAIN',
  libro text not null default 'antonio'
    check (libro in ('antonio', 'francisco')),
  cuenta text not null default 'virtual'
    check (cuenta in ('virtual', 'garage', 'abarrotes')),
  sucursal_destino text not null,
  modulo_corte text not null default 'abarrotes'
    check (modulo_corte in ('virtual', 'abarrotes', 'garage')),
  proveedor_nombre text,
  monto numeric(12,2) not null default 0 check (monto > 0),
  saldo numeric(12,2) not null default 0,
  abono numeric(12,2) not null default 0,
  fecha date not null default current_date,
  notas text,
  estado text not null default 'pendiente_cobro'
    check (estado in ('pendiente_cobro', 'liquidado', 'cancelado')),
  egreso_ie_id text,
  created_by text,
  created_at timestamptz default now(),
  constraint inversiones_oficina_destino_ok check (char_length(trim(sucursal_destino)) > 0)
);

create index if not exists idx_inversiones_oficina_destino_estado
  on public.inversiones_oficina_proveedor (sucursal_destino, estado);

create index if not exists idx_inversiones_oficina_libro_estado
  on public.inversiones_oficina_proveedor (libro, estado);

create table if not exists public.inversiones_oficina_proveedor_abonos (
  id uuid primary key default gen_random_uuid(),
  inversion_id uuid not null references public.inversiones_oficina_proveedor(id) on delete cascade,
  monto numeric(12,2) not null check (monto > 0),
  fecha date not null default current_date,
  sucursal_id text not null,
  modulo text not null check (modulo in ('virtual', 'abarrotes', 'garage')),
  gasto_corte_id uuid,
  usuario_nombre text,
  created_at timestamptz default now()
);

create index if not exists idx_inversiones_oficina_abonos_inv
  on public.inversiones_oficina_proveedor_abonos (inversion_id);

alter table public.inversiones_oficina_proveedor enable row level security;
alter table public.inversiones_oficina_proveedor_abonos enable row level security;

drop policy if exists inversiones_oficina_proveedor_anon_rw on public.inversiones_oficina_proveedor;
create policy inversiones_oficina_proveedor_anon_rw on public.inversiones_oficina_proveedor
  for all to anon, authenticated
  using (true)
  with check (true);

drop policy if exists inversiones_oficina_abonos_anon_rw on public.inversiones_oficina_proveedor_abonos;
create policy inversiones_oficina_abonos_anon_rw on public.inversiones_oficina_proveedor_abonos
  for all to anon, authenticated
  using (true)
  with check (true);

comment on table public.inversiones_oficina_proveedor is
  'Efectivo de oficina pagado a proveedor; se recupera descontando caja en el corte de la tienda destino.';
