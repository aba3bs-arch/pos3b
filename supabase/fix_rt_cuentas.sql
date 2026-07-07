-- Cuentas de efectivo RT (Francisco / Andrés) y movimientos diarios.

create table if not exists public.rt_cuentas (
  id text primary key,
  nombre text not null,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.rt_movimientos_cuenta (
  id uuid primary key default gen_random_uuid(),
  cuenta_id text not null references public.rt_cuentas(id),
  tipo text not null check (tipo in ('liquidacion', 'transferencia_enviada', 'transferencia_recibida')),
  monto numeric(12, 2) not null check (monto > 0),
  fecha timestamptz not null default now(),
  usuario text,
  notas text,
  grupo_id uuid,
  cuenta_relacionada text references public.rt_cuentas(id),
  repartidor_nombre text,
  liquidacion_movimientos jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_rt_mov_cuenta_fecha on public.rt_movimientos_cuenta(cuenta_id, fecha desc);
create index if not exists idx_rt_mov_grupo on public.rt_movimientos_cuenta(grupo_id);

insert into public.rt_cuentas (id, nombre, activo)
values ('francisco', 'Francisco', true), ('andres', 'Andrés', true)
on conflict (id) do update set nombre = excluded.nombre, activo = true;

alter table public.rt_cuentas enable row level security;
alter table public.rt_movimientos_cuenta enable row level security;

drop policy if exists "rt_cuentas_anon_rw" on public.rt_cuentas;
create policy "rt_cuentas_anon_rw" on public.rt_cuentas for all using (true) with check (true);

drop policy if exists "rt_movimientos_anon_rw" on public.rt_movimientos_cuenta;
create policy "rt_movimientos_anon_rw" on public.rt_movimientos_cuenta for all using (true) with check (true);

comment on table public.rt_cuentas is 'Cuentas de efectivo colectado en liquidaciones RT (Francisco, Andrés).';
comment on table public.rt_movimientos_cuenta is 'Libro diario: liquidaciones y transferencias entre cuentas RT.';
