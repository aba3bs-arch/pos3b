-- =============================================================================
-- POS 3B — MÍNIMO para que Vales y Préstamos dejen de mostrar
-- "Faltan tablas de contabilidad"
--
-- Supabase → SQL Editor → pegar TODO → Run (debe salir Success) → F5 en la app
-- Si sigue el aviso: Settings → API → Reload schema / esperar 10 s → F5
--
-- Seguro re-ejecutar. SIN foreign keys a usuarios (no falla si el tipo de id
-- de usuarios no coincide).
-- =============================================================================

-- VALES
create table if not exists public.vales (
  id uuid primary key default gen_random_uuid(),
  sucursal_id text default 'MAIN',
  usuario_id uuid,
  nombre_empleado text not null,
  tipo text default 'indirecto',
  area text,
  monto numeric(12,2) not null default 0,
  motivo text,
  fecha date default current_date,
  folio text,
  requiere_autorizacion boolean default false,
  autorizado_por text,
  created_at timestamptz default now(),
  created_by text
);

alter table public.vales add column if not exists tipo text default 'indirecto';
alter table public.vales add column if not exists area text;
alter table public.vales add column if not exists folio text;
alter table public.vales add column if not exists requiere_autorizacion boolean default false;
alter table public.vales add column if not exists autorizado_por text;
alter table public.vales add column if not exists categoria text default 'consumo';
alter table public.vales add column if not exists subcategoria text;
alter table public.vales add column if not exists detalle text;
alter table public.vales add column if not exists estado_aprobacion text default 'aprobado';
alter table public.vales add column if not exists descuenta_nomina boolean default false;
alter table public.vales add column if not exists cargado_corte boolean default false;
alter table public.vales add column if not exists aprobado_at timestamptz;
alter table public.vales add column if not exists rechazado_por text;
alter table public.vales add column if not exists motivo_rechazo text;
alter table public.vales add column if not exists cobrado boolean default false;
alter table public.vales add column if not exists cobrado_at timestamptz;
alter table public.vales add column if not exists cobrado_por text;
alter table public.vales add column if not exists sucursal_ie text default 'MAIN';

create index if not exists idx_vales_suc_fecha on public.vales (sucursal_id, fecha desc);
create index if not exists idx_vales_gasolina_cobrado on public.vales (categoria, cobrado, fecha desc);

alter table public.vales enable row level security;
drop policy if exists "vales_anon_rw" on public.vales;
create policy "vales_anon_rw" on public.vales for all using (true) with check (true);

-- PRESTAMOS (empleados)
create table if not exists public.prestamos (
  id uuid primary key default gen_random_uuid(),
  sucursal_id text default 'MAIN',
  usuario_id uuid,
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

alter table public.prestamos add column if not exists cuota_semanal numeric(12,2) default 0;
alter table public.prestamos add column if not exists requiere_aprobacion_socio boolean default false;
alter table public.prestamos add column if not exists aprobado_admin_por text;
alter table public.prestamos add column if not exists aprobado_admin_at timestamptz;
alter table public.prestamos add column if not exists aprobado_socio_por text;
alter table public.prestamos add column if not exists aprobado_socio_at timestamptz;
alter table public.prestamos add column if not exists cargado_corte boolean default false;
alter table public.prestamos add column if not exists rechazado_por text;
alter table public.prestamos add column if not exists motivo_rechazo text;
alter table public.prestamos add column if not exists omitir_corte boolean default false;
alter table public.prestamos add column if not exists area_corte text;
alter table public.prestamos add column if not exists solicitud_tipo text;
alter table public.prestamos add column if not exists solicitud_monto numeric(12,2) default 0;
alter table public.prestamos add column if not exists solicitud_por text;
alter table public.prestamos add column if not exists solicitud_at timestamptz;
alter table public.prestamos add column if not exists solicitud_notas text;

alter table public.prestamos enable row level security;
drop policy if exists "prestamos_anon_rw" on public.prestamos;
create policy "prestamos_anon_rw" on public.prestamos for all using (true) with check (true);

-- PRESTAMOS INTERAREA
create table if not exists public.prestamos_interarea (
  id uuid primary key default gen_random_uuid(),
  sucursal_id text default 'MAIN',
  origen text not null check (origen in ('virtual', 'abarrotes', 'garage')),
  destino text not null check (destino in ('virtual', 'abarrotes', 'garage')),
  monto numeric(12,2) not null default 0,
  fecha date default current_date,
  notas text,
  estado text default 'activo',
  created_at timestamptz default now(),
  created_by text
);

alter table public.prestamos_interarea add column if not exists saldo numeric(12,2);
alter table public.prestamos_interarea add column if not exists abono numeric(12,2) default 0;
alter table public.prestamos_interarea add column if not exists cargado_corte boolean default false;
alter table public.prestamos_interarea add column if not exists gasto_id uuid;
alter table public.prestamos_interarea add column if not exists colectado_por text;
alter table public.prestamos_interarea add column if not exists colectado_at timestamptz;
alter table public.prestamos_interarea add column if not exists colectado_folio text;
alter table public.prestamos_interarea add column if not exists colectado_modulo text;
alter table public.prestamos_interarea add column if not exists liquidado_por text;
alter table public.prestamos_interarea add column if not exists liquidado_at timestamptz;
alter table public.prestamos_interarea add column if not exists liquidado_sucursal text;
alter table public.prestamos_interarea add column if not exists rc_recibido_por text;
alter table public.prestamos_interarea add column if not exists rc_recibido_at timestamptz;
alter table public.prestamos_interarea add column if not exists rc_monto numeric(12,2) default 0;

update public.prestamos_interarea
set saldo = coalesce(saldo, monto), abono = coalesce(abono, 0)
where saldo is null;

alter table public.prestamos_interarea enable row level security;
drop policy if exists "prestamos_interarea_anon_rw" on public.prestamos_interarea;
create policy "prestamos_interarea_anon_rw" on public.prestamos_interarea for all using (true) with check (true);

-- PRESTAMOS SUCURSALES
create table if not exists public.prestamos_sucursales (
  id uuid primary key default gen_random_uuid(),
  sucursal_origen text not null,
  sucursal_destino text not null,
  monto numeric(12,2) not null default 0,
  saldo numeric(12,2) not null default 0,
  abono numeric(12,2) default 0,
  fecha date default current_date,
  notas text,
  estado text not null default 'pendiente_cobro'
    check (estado in ('pendiente_cobro', 'liquidado', 'cancelado')),
  created_at timestamptz default now(),
  created_by text,
  constraint prestamos_sucursales_origen_destino_diff check (sucursal_origen <> sucursal_destino)
);

alter table public.prestamos_sucursales add column if not exists area_corte text;
alter table public.prestamos_sucursales add column if not exists cargado_corte boolean default false;
alter table public.prestamos_sucursales add column if not exists tipo text default 'sucursal';
alter table public.prestamos_sucursales add column if not exists gasto_id uuid;
alter table public.prestamos_sucursales add column if not exists colectado_por text;
alter table public.prestamos_sucursales add column if not exists colectado_at timestamptz;
alter table public.prestamos_sucursales add column if not exists colectado_folio text;
alter table public.prestamos_sucursales add column if not exists colectado_modulo text;

alter table public.prestamos_sucursales enable row level security;
drop policy if exists "prestamos_sucursales_anon_rw" on public.prestamos_sucursales;
create policy "prestamos_sucursales_anon_rw" on public.prestamos_sucursales for all using (true) with check (true);

-- NOTIFICACIONES CONTABILIDAD
create table if not exists public.contabilidad_notificaciones (
  id uuid primary key default gen_random_uuid(),
  sucursal_id text default 'MAIN',
  tipo text not null,
  ref_tabla text not null,
  ref_id uuid not null,
  titulo text not null,
  mensaje text,
  estado text default 'pendiente',
  leida boolean default false,
  created_at timestamptz default now(),
  atendida_por text,
  atendida_at timestamptz,
  area_buzon text
);

alter table public.contabilidad_notificaciones add column if not exists area_buzon text;

create index if not exists idx_cont_notif_pend on public.contabilidad_notificaciones (estado, created_at desc);

alter table public.contabilidad_notificaciones enable row level security;
drop policy if exists "cont_notif_anon_rw" on public.contabilidad_notificaciones;
create policy "cont_notif_anon_rw" on public.contabilidad_notificaciones for all using (true) with check (true);

-- CATÁLOGO TIPOS DE VALE (opcional; app funciona con localStorage si falta)
create table if not exists public.vales_categorias (
  id text primary key,
  label text not null,
  descuenta_nomina boolean not null default false,
  activo boolean not null default true,
  fijo boolean not null default false,
  subcategorias jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  created_by text
);

alter table public.vales_categorias add column if not exists subcategorias jsonb not null default '[]'::jsonb;

alter table public.vales_categorias enable row level security;
drop policy if exists "vales_categorias_anon_rw" on public.vales_categorias;
create policy "vales_categorias_anon_rw" on public.vales_categorias
  for all to anon, authenticated
  using (true) with check (true);

-- Hora límite vales (opcional)
create table if not exists public.pos_hora_limite_vale (
  id text primary key default 'GLOBAL',
  etiqueta text not null default '09:00',
  minutos int not null default 540,
  updated_at timestamptz not null default now()
);

alter table public.pos_hora_limite_vale enable row level security;
drop policy if exists pos_hora_limite_vale_anon_all on public.pos_hora_limite_vale;
create policy pos_hora_limite_vale_anon_all on public.pos_hora_limite_vale
  for all to anon, authenticated using (true) with check (true);

insert into public.pos_hora_limite_vale (id, etiqueta, minutos, updated_at)
values ('GLOBAL', '09:00', 540, now())
on conflict (id) do nothing;

notify pgrst, 'reload schema';
