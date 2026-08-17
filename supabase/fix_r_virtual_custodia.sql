-- R Virtual: custodia de recolecciones/traspasos (recibir → cuenta del admin → entregar a ABB).
-- También da de alta cuentas RT para ABB / JLBB / Luis Enrique.

insert into public.rt_cuentas (id, nombre, activo)
values
  ('abb', 'ABB', true),
  ('jlbb', 'JLBB', true),
  ('luis-enrique', 'Luis Enrique', true)
on conflict (id) do update set nombre = excluded.nombre, activo = true;

create table if not exists public.r_virtual_custodia (
  id uuid primary key default gen_random_uuid(),
  origen text not null check (origen in ('transito', 'corte')),
  origen_id text not null,
  recolector_nombre text,
  recolector_clave text,
  monto numeric(12, 2) not null default 0,
  sucursal text,
  folio text,
  tipo_item text,
  detalle text,
  grupo_id uuid,
  estatus text not null default 'recibido' check (estatus in ('recibido', 'entregado_abb')),
  recibido_por text,
  recibido_cuenta_id text,
  recibido_at timestamptz not null default now(),
  entregado_a text,
  entregado_at timestamptz,
  created_at timestamptz not null default now(),
  unique (origen, origen_id)
);

create index if not exists idx_r_virtual_estatus on public.r_virtual_custodia (estatus, recibido_por);
create index if not exists idx_r_virtual_recolector on public.r_virtual_custodia (recolector_clave);

alter table public.r_virtual_custodia enable row level security;

drop policy if exists "r_virtual_custodia_anon_rw" on public.r_virtual_custodia;
create policy "r_virtual_custodia_anon_rw" on public.r_virtual_custodia for all using (true) with check (true);

drop policy if exists "r_virtual_custodia_auth_rw" on public.r_virtual_custodia;
create policy "r_virtual_custodia_auth_rw" on public.r_virtual_custodia for all to authenticated using (true) with check (true);

comment on table public.r_virtual_custodia is 'Custodia R Virtual: recolecciones/traspasos recibidos por un admin, pendientes de entregar a ABB.';
