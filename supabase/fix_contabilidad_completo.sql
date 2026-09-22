-- =============================================================================
-- POS 3B — Contabilidad completa (idempotente)
-- Supabase → SQL Editor → pegar TODO → Run → F5 en la app
--
-- Incluye (en orden):
--   1) Nómina / vales / préstamos base + ampliación
--   2) Cortes contabilidad (estado, gastos, cierres, folios) + soft-delete
--   3) Cont Virtual / IE (categorías, egresos, detalle, ingresos, catálogo cortes)
--   4) Vales (aprobaciones, categorías, gasolina cobrado, hora límite)
--   5) Préstamos (sucursales, colecta, recuperación, omitir corte, RC, saldo)
--   6) RIF + notificaciones área
--   7) Gastos corte (aprobación, CUBRE/TAXIS → IE) + catálogo GLOBAL
--   8) Nómina columnas extra
--
-- Equivale a ejecutar:
--   fix_contabilidad.sql
--   fix_contabilidad_ampliacion.sql
--   fix_cortes_contabilidad.sql
--   fix_cortes_contabilidad_soft_delete.sql
--   fix_cont_virtual.sql
--   fix_cont_virtual_detalle.sql
--   fix_cont_virtual_ingresos.sql
--   fix_cont_virtual_en_catalogo_cortes.sql
--   fix_vales_prestamos_aprobaciones.sql
--   fix_vales_categorias.sql
--   fix_vales_gasolina_cobrado.sql
--   fix_hora_limite_vale.sql
--   fix_prestamos_sucursales.sql
--   fix_prestamos_sucursales_main.sql
--   fix_prestamos_area_colectado.sql
--   fix_prestamos_interarea_recuperacion.sql
--   fix_prestamos_omitir_corte.sql
--   fix_prestamos_solicitudes_movimiento.sql
--   fix_rifs.sql
--   fix_prestamos_interarea_saldo.sql
--   fix_prestamos_interarea_rc_virtual.sql
--   fix_gastos_corte_aprobacion.sql
--   fix_gastos_cubre_taxi_ie_virtual.sql
--   fix_catalogo_gastos_global.sql
--   fix_nomina_dias_pagador.sql
--   fix_nomina_saldo_arrastre.sql
--   fix_nomina_prestamos_recoleccion.sql
-- =============================================================================


-- ---------------------------------------------------------------------------
-- INCLUDE: fix_contabilidad.sql
-- ---------------------------------------------------------------------------
-- =============================================================================
-- POS 3B — Contabilidad: nómina, vales y préstamos
-- Supabase → SQL Editor → Run (seguro re-ejecutar)
--
-- Recomendado (todo Contabilidad + IE + cortes en un solo Run):
--   supabase/fix_contabilidad_completo.sql
-- =============================================================================

create table if not exists public.nomina_periodos (
  id uuid primary key default gen_random_uuid(),
  sucursal_id text default 'MAIN',
  periodo_inicio date not null,
  periodo_fin date not null,
  estado text default 'borrador',
  notas text,
  total numeric(14,2) default 0,
  pagador_filtro text,
  created_at timestamptz default now(),
  created_by text
);

create table if not exists public.nomina_lineas (
  id uuid primary key default gen_random_uuid(),
  periodo_id uuid not null references public.nomina_periodos(id) on delete cascade,
  usuario_id uuid references public.usuarios(id) on delete set null,
  nombre text not null,
  rol text,
  pagador_nomina text,
  sueldo_base numeric(12,2) default 0,
  bonificacion numeric(12,2) default 0,
  deducciones numeric(12,2) default 0,
  deduccion_gastos numeric(12,2) default 0,
  total numeric(12,2) default 0,
  notas text
);

create index if not exists idx_nomina_lineas_periodo on public.nomina_lineas (periodo_id);

create table if not exists public.vales (
  id uuid primary key default gen_random_uuid(),
  sucursal_id text default 'MAIN',
  usuario_id uuid references public.usuarios(id) on delete set null,
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

create table if not exists public.prestamos (
  id uuid primary key default gen_random_uuid(),
  sucursal_id text default 'MAIN',
  usuario_id uuid references public.usuarios(id) on delete set null,
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

create table if not exists public.cortes_gasto_catalogo (
  id uuid primary key default gen_random_uuid(),
  sucursal_id text default 'MAIN',
  modulo text not null check (modulo in ('virtual', 'abarrotes', 'garage')),
  categoria text not null,
  subcategorias jsonb default '[]'::jsonb,
  unique (sucursal_id, modulo, categoria)
);

alter table public.nomina_periodos enable row level security;
alter table public.nomina_lineas enable row level security;
alter table public.vales enable row level security;
alter table public.prestamos enable row level security;
alter table public.prestamos_interarea enable row level security;
alter table public.cortes_gasto_catalogo enable row level security;

drop policy if exists "nomina_periodos_anon_rw" on public.nomina_periodos;
create policy "nomina_periodos_anon_rw" on public.nomina_periodos for all using (true) with check (true);

drop policy if exists "nomina_lineas_anon_rw" on public.nomina_lineas;
create policy "nomina_lineas_anon_rw" on public.nomina_lineas for all using (true) with check (true);

drop policy if exists "vales_anon_rw" on public.vales;
create policy "vales_anon_rw" on public.vales for all using (true) with check (true);

drop policy if exists "prestamos_anon_rw" on public.prestamos;
create policy "prestamos_anon_rw" on public.prestamos for all using (true) with check (true);

drop policy if exists "prestamos_interarea_anon_rw" on public.prestamos_interarea;
create policy "prestamos_interarea_anon_rw" on public.prestamos_interarea for all using (true) with check (true);

drop policy if exists "cortes_catalogo_anon_rw" on public.cortes_gasto_catalogo;
create policy "cortes_catalogo_anon_rw" on public.cortes_gasto_catalogo for all using (true) with check (true);


-- ---------------------------------------------------------------------------
-- INCLUDE: fix_contabilidad_ampliacion.sql
-- ---------------------------------------------------------------------------
-- =============================================================================
-- POS 3B — Ampliación contabilidad (ejecutar después de fix_contabilidad.sql)
-- =============================================================================

alter table public.usuarios add column if not exists nomina_pagador text
  check (nomina_pagador is null or nomina_pagador in ('virtual', 'abarrotes', 'garage', 'ambos'));

alter table public.nomina_periodos add column if not exists pagador_filtro text;
alter table public.nomina_lineas add column if not exists pagador_nomina text;
alter table public.nomina_lineas add column if not exists deduccion_gastos numeric(12,2) default 0;

alter table public.vales add column if not exists tipo text default 'indirecto';
alter table public.vales add column if not exists area text;
alter table public.vales add column if not exists folio text;
alter table public.vales add column if not exists requiere_autorizacion boolean default false;
alter table public.vales add column if not exists autorizado_por text;

alter table public.cortes_contabilidad_gastos add column if not exists descontado_nomina boolean default false;
alter table public.cortes_contabilidad_gastos add column if not exists periodo_nomina_id uuid;

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

create table if not exists public.cortes_gasto_catalogo (
  id uuid primary key default gen_random_uuid(),
  sucursal_id text default 'MAIN',
  modulo text not null check (modulo in ('virtual', 'abarrotes', 'garage')),
  categoria text not null,
  subcategorias jsonb default '[]'::jsonb,
  unique (sucursal_id, modulo, categoria)
);

alter table public.prestamos_interarea enable row level security;
alter table public.cortes_gasto_catalogo enable row level security;

drop policy if exists "prestamos_interarea_anon_rw" on public.prestamos_interarea;
create policy "prestamos_interarea_anon_rw" on public.prestamos_interarea for all using (true) with check (true);

drop policy if exists "cortes_catalogo_anon_rw" on public.cortes_gasto_catalogo;
create policy "cortes_catalogo_anon_rw" on public.cortes_gasto_catalogo for all using (true) with check (true);


-- ---------------------------------------------------------------------------
-- INCLUDE: fix_cortes_contabilidad.sql
-- ---------------------------------------------------------------------------
-- =============================================================================
-- POS 3B — Cortes de contabilidad (Virtual, Abarrotes, Garage)
-- Independientes del Corte de caja del POS. Seguro re-ejecutar.
-- =============================================================================

create table if not exists public.cortes_contabilidad_estado (
  id uuid primary key default gen_random_uuid(),
  sucursal_id text not null default 'MAIN',
  modulo text not null check (modulo in ('virtual', 'abarrotes', 'garage')),
  estado jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now(),
  unique (sucursal_id, modulo)
);

create table if not exists public.cortes_contabilidad_gastos (
  id uuid primary key default gen_random_uuid(),
  sucursal_id text not null default 'MAIN',
  modulo text not null check (modulo in ('virtual', 'abarrotes', 'garage')),
  categoria text not null default 'GENERAL',
  subcategoria text default '',
  comentario text,
  monto numeric(12,2) not null default 0,
  usuario_id text,
  usuario_nombre text,
  cerrado boolean not null default false,
  created_at timestamptz default now()
);

create index if not exists idx_cortes_gastos_mod on public.cortes_contabilidad_gastos (sucursal_id, modulo, cerrado);

create table if not exists public.cortes_contabilidad_cierres (
  id uuid primary key default gen_random_uuid(),
  sucursal_id text not null default 'MAIN',
  modulo text not null check (modulo in ('virtual', 'abarrotes', 'garage')),
  folio text,
  turno text,
  usuario_id text,
  usuario_nombre text,
  caja_actual numeric(14,2) default 0,
  ventas numeric(14,2) default 0,
  detalle jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  deleted_at timestamptz,
  deleted_by text
);

-- Columnas por si la tabla ya existía sin soft-delete
alter table public.cortes_contabilidad_cierres add column if not exists deleted_at timestamptz;
alter table public.cortes_contabilidad_cierres add column if not exists deleted_by text;

create index if not exists idx_cortes_cierres_mod on public.cortes_contabilidad_cierres (sucursal_id, modulo, created_at desc);
create index if not exists idx_cortes_cierres_activos
  on public.cortes_contabilidad_cierres (sucursal_id, modulo, created_at desc)
  where deleted_at is null;
create index if not exists idx_cortes_cierres_eliminados
  on public.cortes_contabilidad_cierres (sucursal_id, modulo, deleted_at desc)
  where deleted_at is not null;

create table if not exists public.cortes_contabilidad_folios (
  sucursal_id text not null default 'MAIN',
  modulo text not null check (modulo in ('virtual', 'abarrotes', 'garage')),
  ultimo int not null default 0,
  prefijo text not null default 'X',
  primary key (sucursal_id, modulo)
);

alter table public.cortes_contabilidad_estado enable row level security;
alter table public.cortes_contabilidad_gastos enable row level security;
alter table public.cortes_contabilidad_cierres enable row level security;
alter table public.cortes_contabilidad_folios enable row level security;

drop policy if exists "cortes_estado_anon_rw" on public.cortes_contabilidad_estado;
create policy "cortes_estado_anon_rw" on public.cortes_contabilidad_estado for all using (true) with check (true);

drop policy if exists "cortes_gastos_anon_rw" on public.cortes_contabilidad_gastos;
create policy "cortes_gastos_anon_rw" on public.cortes_contabilidad_gastos for all using (true) with check (true);

drop policy if exists "cortes_cierres_anon_rw" on public.cortes_contabilidad_cierres;
create policy "cortes_cierres_anon_rw" on public.cortes_contabilidad_cierres for all using (true) with check (true);

drop policy if exists "cortes_folios_anon_rw" on public.cortes_contabilidad_folios;
create policy "cortes_folios_anon_rw" on public.cortes_contabilidad_folios for all using (true) with check (true);


-- ---------------------------------------------------------------------------
-- INCLUDE: fix_cortes_contabilidad_soft_delete.sql
-- ---------------------------------------------------------------------------
-- =============================================================================
-- POS 3B — Soft-delete de cierres de cortes contabilidad (papelera / restaurar)
-- Ejecutar en Supabase → SQL Editor (seguro re-ejecutar).
-- =============================================================================

alter table public.cortes_contabilidad_cierres
  add column if not exists deleted_at timestamptz;

alter table public.cortes_contabilidad_cierres
  add column if not exists deleted_by text;

create index if not exists idx_cortes_cierres_activos
  on public.cortes_contabilidad_cierres (sucursal_id, modulo, created_at desc)
  where deleted_at is null;

create index if not exists idx_cortes_cierres_eliminados
  on public.cortes_contabilidad_cierres (sucursal_id, modulo, deleted_at desc)
  where deleted_at is not null;


-- ---------------------------------------------------------------------------
-- INCLUDE: fix_cont_virtual.sql
-- ---------------------------------------------------------------------------
-- =============================================================================
-- POS 3B — Cont Virtual: categorías, subcategorías y egresos
-- Ejecutar en Supabase → SQL Editor. Seguro re-ejecutar.
--
-- Alternativa (recomendado): supabase/fix_contabilidad_completo.sql
-- =============================================================================

create table if not exists public.cont_virtual_categorias (
  id text primary key,
  nombre text not null,
  orden int not null default 0,
  activo boolean not null default true,
  fijo boolean not null default false,
  created_at timestamptz default now()
);

create table if not exists public.cont_virtual_subcategorias (
  id text primary key,
  categoria_id text not null references public.cont_virtual_categorias(id) on delete cascade,
  nombre text not null,
  orden int not null default 0,
  activo boolean not null default true,
  fijo boolean not null default false,
  created_at timestamptz default now()
);

create index if not exists idx_cont_virtual_sub_cat on public.cont_virtual_subcategorias (categoria_id);

create table if not exists public.cont_virtual_egresos (
  id uuid primary key default gen_random_uuid(),
  sucursal_id text not null default 'MAIN',
  fecha date not null default current_date,
  categoria_id text not null,
  categoria_nombre text,
  subcategoria_id text,
  subcategoria_nombre text,
  monto numeric(12,2) not null default 0,
  descripcion text,
  fuente text not null default 'manual',
  ref_tabla text,
  ref_id text,
  usuario_nombre text,
  created_at timestamptz default now()
);

create index if not exists idx_cont_virtual_egresos_fecha on public.cont_virtual_egresos (fecha desc);
create index if not exists idx_cont_virtual_egresos_suc on public.cont_virtual_egresos (sucursal_id, fecha desc);
create unique index if not exists idx_cont_virtual_egresos_ref
  on public.cont_virtual_egresos (ref_tabla, ref_id)
  where ref_tabla is not null and ref_id is not null;

-- Cuenta contable: virtual | garage (IE VIRTUAL con cuentas separadas)
alter table public.cont_virtual_egresos
  add column if not exists cuenta text not null default 'virtual';

create index if not exists idx_cont_virtual_egresos_cuenta on public.cont_virtual_egresos (cuenta, fecha desc);

alter table public.cont_virtual_categorias enable row level security;
alter table public.cont_virtual_subcategorias enable row level security;
alter table public.cont_virtual_egresos enable row level security;

drop policy if exists "cont_virtual_categorias_anon_rw" on public.cont_virtual_categorias;
create policy "cont_virtual_categorias_anon_rw" on public.cont_virtual_categorias for all using (true) with check (true);

drop policy if exists "cont_virtual_subcategorias_anon_rw" on public.cont_virtual_subcategorias;
create policy "cont_virtual_subcategorias_anon_rw" on public.cont_virtual_subcategorias for all using (true) with check (true);

drop policy if exists "cont_virtual_egresos_anon_rw" on public.cont_virtual_egresos;
create policy "cont_virtual_egresos_anon_rw" on public.cont_virtual_egresos for all using (true) with check (true);

-- Semillas fijas (vales Virtual + operativos)
insert into public.cont_virtual_categorias (id, nombre, orden, activo, fijo) values
  ('vales', 'Vales', 10, true, true),
  ('empleado', 'Empleado', 18, true, true),
  ('consumo', 'Consumo', 20, true, true),
  ('operativos', 'Gastos operativos', 30, true, true),
  ('cubre-turno', 'Cubre turno', 35, true, true),
  ('taxis', 'Taxis', 36, true, true),
  ('prestamos', 'Préstamos', 40, true, true),
  ('manual', 'Otros / manual', 90, true, true)
on conflict (id) do update set nombre = excluded.nombre, fijo = true, activo = true;

insert into public.cont_virtual_subcategorias (id, categoria_id, nombre, orden, activo, fijo) values
  ('vales-gasolina', 'vales', 'Gasolina', 10, true, true),
  ('vales-herramienta', 'vales', 'Herramienta', 20, true, true),
  ('vales-accesorios', 'vales', 'Accesorios', 30, true, true),
  ('vales-consumo', 'vales', 'Consumo / personal', 40, true, true),
  ('empleado-consumo', 'empleado', 'Consumo', 10, true, true),
  ('empleado-anticipo', 'empleado', 'Anticipo', 20, true, true),
  ('empleado-cubre', 'empleado', 'Cubre turnos', 30, true, true),
  ('empleado-faltante', 'empleado', 'Faltante', 40, true, true),
  ('empleado-nomina', 'empleado', 'Nomina Empleado', 50, true, true),
  ('empleado-otros', 'empleado', 'otros', 60, true, true),
  ('empleado-recargas', 'empleado', 'Recargas', 70, true, true),
  ('consumo-empleado', 'consumo', 'Empleado', 10, true, true),
  ('consumo-oficina', 'consumo', 'Oficina', 20, true, true),
  ('operativos-suministros', 'operativos', 'Suministros', 10, true, true),
  ('operativos-servicios', 'operativos', 'Servicios', 20, true, true),
  ('operativos-mantenimiento', 'operativos', 'Mantenimiento', 30, true, true),
  ('operativos-otros', 'operativos', 'Otros', 40, true, true),
  ('cubre-turno-pago', 'cubre-turno', 'Pago', 10, true, true),
  ('taxis-servicio', 'taxis', 'Servicio', 10, true, true),
  ('prestamos-desembolso', 'prestamos', 'Desembolso', 10, true, true),
  ('manual-otros', 'manual', 'Otros', 10, true, true)
on conflict (id) do update set nombre = excluded.nombre, categoria_id = excluded.categoria_id, fijo = true, activo = true;

comment on table public.cont_virtual_egresos is
  'Libro de egresos Cont Virtual (manual + auto desde vales Virtual y gastos CUBRE TURNO/TAXIS de Corte Virtual).';

-- Tercer nivel (Categoría → Subcategoría → Detalle). Ver también fix_cont_virtual_detalle.sql
create table if not exists public.cont_virtual_detalles (
  id text primary key,
  subcategoria_id text not null references public.cont_virtual_subcategorias(id) on delete cascade,
  nombre text not null,
  orden int not null default 0,
  activo boolean not null default true,
  fijo boolean not null default false,
  created_at timestamptz default now()
);

create index if not exists idx_cont_virtual_det_sub on public.cont_virtual_detalles (subcategoria_id);

alter table public.cont_virtual_egresos
  add column if not exists detalle_id text;

alter table public.cont_virtual_egresos
  add column if not exists detalle_nombre text;

alter table public.cont_virtual_detalles enable row level security;

drop policy if exists "cont_virtual_detalles_anon_rw" on public.cont_virtual_detalles;
create policy "cont_virtual_detalles_anon_rw" on public.cont_virtual_detalles for all using (true) with check (true);


-- ---------------------------------------------------------------------------
-- INCLUDE: fix_cont_virtual_detalle.sql
-- ---------------------------------------------------------------------------
-- =============================================================================
-- POS 3B — Tercer nivel del catálogo IE: detalle (sub-subcategoría)
-- Categoría → Subcategoría → Detalle
-- Ejecutar en Supabase → SQL Editor. Seguro re-ejecutar.
-- =============================================================================

create table if not exists public.cont_virtual_detalles (
  id text primary key,
  subcategoria_id text not null references public.cont_virtual_subcategorias(id) on delete cascade,
  nombre text not null,
  orden int not null default 0,
  activo boolean not null default true,
  fijo boolean not null default false,
  created_at timestamptz default now()
);

create index if not exists idx_cont_virtual_det_sub on public.cont_virtual_detalles (subcategoria_id);

alter table public.cont_virtual_egresos
  add column if not exists detalle_id text;

alter table public.cont_virtual_egresos
  add column if not exists detalle_nombre text;

alter table public.cont_virtual_detalles enable row level security;

drop policy if exists "cont_virtual_detalles_anon_rw" on public.cont_virtual_detalles;
create policy "cont_virtual_detalles_anon_rw" on public.cont_virtual_detalles for all using (true) with check (true);

comment on table public.cont_virtual_detalles is
  'Tercer nivel del catálogo IE (Virtual/Abarrotes): Categoría → Subcategoría → Detalle.';


-- ---------------------------------------------------------------------------
-- INCLUDE: fix_cont_virtual_ingresos.sql
-- ---------------------------------------------------------------------------
-- =============================================================================
-- POS 3B — Ingresos manuales para IE Virtual / IE Abarrotes
-- Ejecutar en Supabase → SQL Editor (seguro re-ejecutar)
-- =============================================================================

create table if not exists public.cont_virtual_ingresos (
  id uuid primary key default gen_random_uuid(),
  sucursal_id text not null default 'MAIN',
  fecha date not null default current_date,
  categoria_id text not null,
  categoria_nombre text,
  subcategoria_id text,
  subcategoria_nombre text,
  detalle_id text,
  detalle_nombre text,
  monto numeric(12,2) not null default 0,
  descripcion text,
  fuente text not null default 'manual',
  ref_tabla text,
  ref_id text,
  usuario_nombre text,
  cuenta text not null default 'virtual',
  created_at timestamptz default now()
);

create index if not exists idx_cont_virtual_ingresos_fecha
  on public.cont_virtual_ingresos (fecha desc);
create index if not exists idx_cont_virtual_ingresos_suc
  on public.cont_virtual_ingresos (sucursal_id, fecha desc);
create index if not exists idx_cont_virtual_ingresos_cuenta
  on public.cont_virtual_ingresos (cuenta, fecha desc);
create unique index if not exists idx_cont_virtual_ingresos_ref
  on public.cont_virtual_ingresos (ref_tabla, ref_id)
  where ref_tabla is not null and ref_id is not null;

alter table public.cont_virtual_ingresos enable row level security;
drop policy if exists "cont_virtual_ingresos_anon_rw" on public.cont_virtual_ingresos;
create policy "cont_virtual_ingresos_anon_rw" on public.cont_virtual_ingresos
  for all using (true) with check (true);

-- Semilla: categoría/sub para ingresos manuales (reutiliza catálogo existente)
insert into public.cont_virtual_categorias (id, nombre, orden, activo, fijo) values
  ('ingresos', 'Ingresos', 5, true, true)
on conflict (id) do update set nombre = excluded.nombre, activo = true, fijo = true;

insert into public.cont_virtual_subcategorias (id, categoria_id, nombre, orden, activo, fijo) values
  ('ingresos-manual', 'ingresos', 'Ingreso manual', 10, true, true),
  ('ingresos-otros', 'ingresos', 'Otros ingresos', 20, true, true)
on conflict (id) do update set nombre = excluded.nombre, activo = true, fijo = true;

comment on table public.cont_virtual_ingresos is
  'Ingresos capturados a mano en IE VIRTUAL / IE ABARROTES (además de recolecciones).';


-- ---------------------------------------------------------------------------
-- INCLUDE: fix_cont_virtual_en_catalogo_cortes.sql
-- ---------------------------------------------------------------------------
-- Flag: categoría de IE visible en el catálogo de gastos de cortes.
-- El admin decide en IE Virtual / IE Abarrotes (Más → Cuentas) si enviarla a cortes.
-- Ejecutar en SQL Editor de Supabase (seguro re-ejecutar).
-- NO requiere la columna "flujo".

alter table public.cont_virtual_categorias
  add column if not exists en_catalogo_cortes boolean default true;

comment on column public.cont_virtual_categorias.en_catalogo_cortes is
  'Si true, la categoría aparece en el catálogo de gastos de Corte Virtual/Abarrotes/Garage.';

-- Ingresos no van al catálogo de gastos de cortes (por id / nombre; sin usar flujo).
update public.cont_virtual_categorias
set en_catalogo_cortes = false
where lower(id) like 'ing-%'
   or lower(id) in ('ingresos', 'ing-recoleccion', 'ing-ventas', 'ing-manual')
   or lower(nombre) in ('ingresos', 'recoleccion', 'recolección', 'ventas', 'ingreso manual')
   or lower(nombre) like 'ingreso%';

-- Si ya existe la columna flujo (de fix_cont_virtual_ingresos.sql), también marcar por ahí.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'cont_virtual_categorias'
      and column_name = 'flujo'
  ) then
    update public.cont_virtual_categorias
    set en_catalogo_cortes = false
    where coalesce(flujo, 'egreso') = 'ingreso';
  end if;
end $$;

-- Empleado siempre disponible en cortes.
update public.cont_virtual_categorias
set en_catalogo_cortes = true
where lower(id) = 'empleado' or lower(nombre) = 'empleado';


-- ---------------------------------------------------------------------------
-- INCLUDE: fix_vales_prestamos_aprobaciones.sql
-- ---------------------------------------------------------------------------
-- =============================================================================
-- POS 3B — Aprobaciones vales/préstamos y notificaciones
-- Ejecutar en Supabase → SQL Editor (seguro re-ejecutar)
-- =============================================================================

alter table public.vales add column if not exists categoria text default 'consumo';
alter table public.vales add column if not exists estado_aprobacion text default 'aprobado';
alter table public.vales add column if not exists descuenta_nomina boolean default false;
alter table public.vales add column if not exists cargado_corte boolean default false;
alter table public.vales add column if not exists aprobado_at timestamptz;
alter table public.vales add column if not exists rechazado_por text;
alter table public.vales add column if not exists motivo_rechazo text;

alter table public.prestamos add column if not exists cuota_semanal numeric(12,2) default 0;
alter table public.prestamos add column if not exists requiere_aprobacion_socio boolean default false;
alter table public.prestamos add column if not exists aprobado_admin_por text;
alter table public.prestamos add column if not exists aprobado_admin_at timestamptz;
alter table public.prestamos add column if not exists aprobado_socio_por text;
alter table public.prestamos add column if not exists aprobado_socio_at timestamptz;
alter table public.prestamos add column if not exists cargado_corte boolean default false;
alter table public.prestamos add column if not exists rechazado_por text;
alter table public.prestamos add column if not exists motivo_rechazo text;

-- estados prestamo: pendiente_admin | pendiente_socio | activo | rechazado | liquidado

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
  atendida_at timestamptz
);

create index if not exists idx_cont_notif_pend on public.contabilidad_notificaciones (estado, created_at desc);

alter table public.contabilidad_notificaciones enable row level security;
drop policy if exists "cont_notif_anon_rw" on public.contabilidad_notificaciones;
create policy "cont_notif_anon_rw" on public.contabilidad_notificaciones for all using (true) with check (true);


-- ---------------------------------------------------------------------------
-- INCLUDE: fix_vales_categorias.sql
-- ---------------------------------------------------------------------------
-- Tipos de vale permanentes (extras creados por admin) + subcategorías + área de corte en préstamos.
-- Supabase → SQL Editor → Run

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

alter table public.vales_categorias
  add column if not exists subcategorias jsonb not null default '[]'::jsonb;

alter table public.vales_categorias enable row level security;

drop policy if exists "vales_categorias_anon_rw" on public.vales_categorias;
create policy "vales_categorias_anon_rw" on public.vales_categorias
  for all to anon, authenticated
  using (true)
  with check (true);

alter table public.prestamos add column if not exists area_corte text;

comment on column public.prestamos.area_corte is 'Módulo de corte donde se carga el desembolso: virtual | abarrotes | garage';

-- Subcategoría opcional al generar un vale (bajo el tipo/categoría).
alter table public.vales add column if not exists subcategoria text;

comment on column public.vales.subcategoria is 'Subcategoría opcional del tipo de vale (catálogo vales_categorias.subcategorias).';
comment on column public.vales_categorias.subcategorias is 'Array JSON [{id,label}] de subcategorías del tipo de vale.';


-- ---------------------------------------------------------------------------
-- INCLUDE: fix_vales_gasolina_cobrado.sql
-- ---------------------------------------------------------------------------
-- =============================================================================
-- POS 3B — Vales gasolina: cobrado = día laboral; no cobrado = falta en nómina
-- Ejecutar en Supabase → SQL Editor (seguro re-ejecutar)
-- =============================================================================

alter table public.vales add column if not exists cobrado boolean;
alter table public.vales add column if not exists cobrado_at timestamptz;
alter table public.vales add column if not exists cobrado_por text;

-- Vales ya existentes (sin valor): tratarlos como cobrados para no generar faltas retroactivas.
update public.vales
set cobrado = true
where categoria = 'gasolina'
  and estado_aprobacion = 'aprobado'
  and cobrado is null;

alter table public.vales alter column cobrado set default false;

update public.vales set cobrado = false where cobrado is null;

create index if not exists idx_vales_gasolina_cobrado on public.vales (categoria, cobrado, fecha desc);


-- ---------------------------------------------------------------------------
-- INCLUDE: fix_hora_limite_vale.sql
-- ---------------------------------------------------------------------------
-- =============================================================================
-- POS 3B — Hora límite de vales sin autorización (global, hora Sonora)
-- Ejecutar en Supabase → SQL Editor (seguro re-ejecutar)
-- =============================================================================
-- Antes: Configuración → Vales → Horario sin autorización.
-- Cada caja sincroniza al iniciar sesión (evita que una tienda quede en 09:00
-- mientras el admin ya puso 10:45 en otro equipo).

create table if not exists public.pos_hora_limite_vale (
  id text primary key default 'GLOBAL',
  etiqueta text not null default '09:00',
  minutos int not null default 540,
  updated_at timestamptz not null default now()
);

alter table public.pos_hora_limite_vale
  add column if not exists etiqueta text;

alter table public.pos_hora_limite_vale
  add column if not exists minutos int;

alter table public.pos_hora_limite_vale
  add column if not exists updated_at timestamptz;

alter table public.pos_hora_limite_vale enable row level security;

drop policy if exists pos_hora_limite_vale_anon_all on public.pos_hora_limite_vale;
create policy pos_hora_limite_vale_anon_all on public.pos_hora_limite_vale
  for all to anon, authenticated
  using (true)
  with check (true);

insert into public.pos_hora_limite_vale (id, etiqueta, minutos, updated_at)
values ('GLOBAL', '09:00', 540, now())
on conflict (id) do nothing;

comment on table public.pos_hora_limite_vale is
  'Hora límite (Sonora) para vales gasolina/herramienta/accesorios sin aprobación admin. Una sola fila GLOBAL.';


-- ---------------------------------------------------------------------------
-- INCLUDE: fix_prestamos_sucursales.sql
-- ---------------------------------------------------------------------------
-- =============================================================================
-- POS 3B — Préstamos entre sucursales
-- No se cargan al corte; quedan pendientes de cobro hasta liquidarse en la tienda origen.
-- =============================================================================

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

create index if not exists idx_prestamos_sucursales_origen
  on public.prestamos_sucursales (sucursal_origen, estado);

create index if not exists idx_prestamos_sucursales_destino
  on public.prestamos_sucursales (sucursal_destino, estado);

alter table public.prestamos_sucursales enable row level security;

drop policy if exists "prestamos_sucursales_anon_rw" on public.prestamos_sucursales;
create policy "prestamos_sucursales_anon_rw" on public.prestamos_sucursales
  for all using (true) with check (true);


-- ---------------------------------------------------------------------------
-- INCLUDE: fix_prestamos_sucursales_main.sql
-- ---------------------------------------------------------------------------
-- =============================================================================
-- POS 3B — Ampliar préstamos sucursales para envío MAIN → tienda
-- (opcional; el flujo funciona sin estas columnas)
-- =============================================================================

alter table public.prestamos_sucursales
  add column if not exists area_corte text;

alter table public.prestamos_sucursales
  add column if not exists cargado_corte boolean default false;

alter table public.prestamos_sucursales
  add column if not exists tipo text default 'sucursal';

comment on column public.prestamos_sucursales.tipo is
  'sucursal = préstamo tienda→tienda (cobro manual); main_envio = vale MAIN→tienda cargado al corte sin IE';


-- ---------------------------------------------------------------------------
-- INCLUDE: fix_prestamos_area_colectado.sql
-- ---------------------------------------------------------------------------
-- =============================================================================
-- POS 3B — Préstamos área / sucursal: gasto en corte de origen + quién colectó
-- Ejecutar en Supabase → SQL Editor (seguro re-ejecutar)
-- =============================================================================
-- Al registrar el préstamo se carga como gasto al corte de origen
-- (virtual, abarrotes o garage). Al recolectar ese corte, se guarda
-- quién colectó el dinero (recolector) en el préstamo.
-- Al liquidar un préstamo entre áreas se guarda quién lo liquidó y
-- desde qué sucursal.

alter table public.prestamos_interarea
  add column if not exists cargado_corte boolean default false;

alter table public.prestamos_interarea
  add column if not exists gasto_id uuid;

alter table public.prestamos_interarea
  add column if not exists colectado_por text;

alter table public.prestamos_interarea
  add column if not exists colectado_at timestamptz;

alter table public.prestamos_interarea
  add column if not exists colectado_folio text;

alter table public.prestamos_interarea
  add column if not exists colectado_modulo text;

comment on column public.prestamos_interarea.colectado_por is
  'Nombre de quien recolectó el corte donde el préstamo quedó como gasto.';

alter table public.prestamos_sucursales
  add column if not exists area_corte text;

alter table public.prestamos_sucursales
  add column if not exists cargado_corte boolean default false;

alter table public.prestamos_sucursales
  add column if not exists gasto_id uuid;

alter table public.prestamos_sucursales
  add column if not exists colectado_por text;

alter table public.prestamos_sucursales
  add column if not exists colectado_at timestamptz;

alter table public.prestamos_sucursales
  add column if not exists colectado_folio text;

alter table public.prestamos_sucursales
  add column if not exists colectado_modulo text;

comment on column public.prestamos_sucursales.colectado_por is
  'Nombre de quien recolectó el corte donde el préstamo quedó como gasto.';

alter table public.prestamos_interarea
  add column if not exists liquidado_por text;

alter table public.prestamos_interarea
  add column if not exists liquidado_at timestamptz;

alter table public.prestamos_interarea
  add column if not exists liquidado_sucursal text;

comment on column public.prestamos_interarea.liquidado_por is
  'Usuario que pasó el préstamo entre áreas a liquidado.';
comment on column public.prestamos_interarea.liquidado_sucursal is
  'Sucursal desde donde se hizo la liquidación.';

create index if not exists idx_prestamos_interarea_gasto
  on public.prestamos_interarea (gasto_id)
  where gasto_id is not null;

create index if not exists idx_prestamos_sucursales_gasto
  on public.prestamos_sucursales (gasto_id)
  where gasto_id is not null;


-- ---------------------------------------------------------------------------
-- INCLUDE: fix_prestamos_interarea_recuperacion.sql
-- ---------------------------------------------------------------------------
-- =============================================================================
-- POS 3B — Préstamos interárea: estados de recuperación automática
-- Ejecutar en Supabase → SQL Editor (seguro re-ejecutar)
-- =============================================================================
-- Estados de negocio (texto libre; la app los escribe):
--   recuperar       → deuda abierta; área de origen en negativo / por recuperar con ventas
--   por_recolectar  → se recolectó Virtual (u origen) con saldo aún pendiente
--   recuperado      → saldo 0 (auto al salir del negativo, o liquidación manual)
-- Compatibilidad: 'activo' se trata como recuperar; 'liquidado' como recuperado.
-- =============================================================================

comment on column public.prestamos_interarea.estado is
  'recuperar | por_recolectar | recuperado | activo | liquidado | cancelado';

-- Índice para sincronizar recuperación por origen + estado abierto
create index if not exists idx_prestamos_interarea_origen_estado
  on public.prestamos_interarea (sucursal_id, origen, estado);


-- ---------------------------------------------------------------------------
-- INCLUDE: fix_prestamos_omitir_corte.sql
-- ---------------------------------------------------------------------------
-- =============================================================================
-- POS 3B — Préstamos a usuarios MAIN: sin corte, solo nómina ($500/sem)
-- Ejecutar en Supabase → SQL Editor (seguro re-ejecutar)
-- =============================================================================

alter table public.prestamos
  add column if not exists omitir_corte boolean default false;

comment on column public.prestamos.omitir_corte is
  'Si true: préstamo de admin a usuario MAIN/indirecto; no carga a corte, sí descuenta en nómina ($500/sem).';


-- ---------------------------------------------------------------------------
-- INCLUDE: fix_prestamos_solicitudes_movimiento.sql
-- ---------------------------------------------------------------------------
-- Ejecutar en Supabase → SQL Editor
-- Solicitudes de abono / descuento / liquidación en préstamos a empleados.

alter table public.prestamos add column if not exists solicitud_tipo text;
alter table public.prestamos add column if not exists solicitud_monto numeric(12,2) default 0;
alter table public.prestamos add column if not exists solicitud_por text;
alter table public.prestamos add column if not exists solicitud_at timestamptz;
alter table public.prestamos add column if not exists solicitud_notas text;

comment on column public.prestamos.solicitud_tipo is 'abono | descuento | liquidacion | null';
comment on column public.prestamos.solicitud_monto is 'Monto solicitado pendiente de aprobación admin';


-- ---------------------------------------------------------------------------
-- INCLUDE: fix_rifs.sql
-- ---------------------------------------------------------------------------
-- =============================================================================
-- POS 3B — RIF (Requisición Interna de Fondos) + área en notificaciones (buzones)
-- Ejecutar en Supabase → SQL Editor (seguro re-ejecutar)
-- =============================================================================

create table if not exists public.rifs (
  id uuid primary key default gen_random_uuid(),
  folio text not null,
  -- intertienda | misma_tienda_mercancia
  tipo text not null default 'intertienda',
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

alter table public.rifs
  add column if not exists tipo text not null default 'intertienda';

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
  'Requisición Interna de Fondos: intertienda (origen→destino) o misma_tienda_mercancia (fondo para comprar mercancía); al vencer carga gasto Fondo requerido en corte abarrotes.';


-- ---------------------------------------------------------------------------
-- INCLUDE: fix_prestamos_interarea_saldo.sql
-- ---------------------------------------------------------------------------
-- Préstamos entre áreas: saldo / abono para abonar y liquidar
alter table public.prestamos_interarea add column if not exists saldo numeric(12,2);
alter table public.prestamos_interarea add column if not exists abono numeric(12,2) default 0;

update public.prestamos_interarea
set saldo = coalesce(saldo, monto),
    abono = coalesce(abono, 0)
where saldo is null;

-- RIF: saldo opcional para abonos parciales
alter table public.rifs add column if not exists saldo numeric(12,2);

update public.rifs
set saldo = coalesce(saldo, monto)
where estado = 'abierto' and saldo is null;


-- ---------------------------------------------------------------------------
-- INCLUDE: fix_prestamos_interarea_rc_virtual.sql
-- ---------------------------------------------------------------------------
-- =============================================================================
-- POS 3B — Recolección de préstamos entre áreas → RC Virtual
-- Ejecutar en Supabase → SQL Editor (seguro re-ejecutar)
-- =============================================================================
-- Al recolectar un préstamo en estado «por_recolectar» desde Vales y Préstamos,
-- el efectivo entra a RC Virtual (custodia + cuenta RT) y queda rastro de quién
-- lo recibió (rc_recibido_*).

-- Custodia RC Virtual: permitir origen préstamo entre áreas
-- (si aún no existe r_virtual_custodia, se omite; corre fix_r_virtual_custodia.sql)
do $$
declare
  cname text;
begin
  if to_regclass('public.r_virtual_custodia') is null then
    raise notice 'r_virtual_custodia no existe; omite constraint origen (ejecuta fix_r_virtual_custodia.sql)';
    return;
  end if;
  select con.conname into cname
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'r_virtual_custodia'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%origen%';
  if cname is not null then
    execute format('alter table public.r_virtual_custodia drop constraint %I', cname);
  end if;
  alter table public.r_virtual_custodia
    drop constraint if exists r_virtual_custodia_origen_check;
  alter table public.r_virtual_custodia
    add constraint r_virtual_custodia_origen_check
    check (origen in ('transito', 'corte', 'prestamo_interarea'));
exception
  when undefined_table then null;
end $$;

-- Rastro de recepción en RC Virtual sobre el préstamo
alter table public.prestamos_interarea
  add column if not exists rc_recibido_por text;

alter table public.prestamos_interarea
  add column if not exists rc_recibido_at timestamptz;

alter table public.prestamos_interarea
  add column if not exists rc_monto numeric(12, 2) default 0;

comment on column public.prestamos_interarea.rc_recibido_por is
  'Usuario que recolectó el préstamo hacia RC Virtual.';
comment on column public.prestamos_interarea.rc_recibido_at is
  'Fecha/hora de la última recolección del préstamo hacia RC Virtual.';
comment on column public.prestamos_interarea.rc_monto is
  'Monto acumulado enviado a RC Virtual desde este préstamo.';


-- ---------------------------------------------------------------------------
-- INCLUDE: fix_gastos_corte_aprobacion.sql
-- ---------------------------------------------------------------------------
-- =============================================================================
-- POS 3B — Consumos en cortes requieren aprobación del administrador
-- Ejecutar en Supabase → SQL Editor (seguro re-ejecutar)
-- =============================================================================

alter table public.cortes_contabilidad_gastos add column if not exists estado_aprobacion text default 'aprobado';
alter table public.cortes_contabilidad_gastos add column if not exists aprobado_por text;
alter table public.cortes_contabilidad_gastos add column if not exists aprobado_at timestamptz;
alter table public.cortes_contabilidad_gastos add column if not exists solicitado_por text;

-- Gastos históricos sin estado se consideran aprobados.
update public.cortes_contabilidad_gastos
set estado_aprobacion = 'aprobado'
where estado_aprobacion is null;

create index if not exists idx_cortes_gastos_aprobacion on public.cortes_contabilidad_gastos (estado_aprobacion, cerrado);


-- ---------------------------------------------------------------------------
-- INCLUDE: fix_gastos_cubre_taxi_ie_virtual.sql
-- ---------------------------------------------------------------------------
-- =============================================================================
-- POS 3B — CUBRE TURNO / TAXIS → IE VIRTUAL
-- Categorías de captura en Corte Virtual + categorías en libro IE VIRTUAL.
-- Seguro re-ejecutar.
-- =============================================================================

-- Catálogo de gastos Corte Virtual (global)
insert into public.cortes_gasto_catalogo (sucursal_id, modulo, categoria, subcategorias)
values
  ('GLOBAL', 'virtual', 'CUBRE TURNO', '["PAGO"]'::jsonb),
  ('GLOBAL', 'virtual', 'TAXIS', '["SERVICIO"]'::jsonb)
on conflict (sucursal_id, modulo, categoria) do update
  set subcategorias = excluded.subcategorias;

-- Libro IE VIRTUAL
insert into public.cont_virtual_categorias (id, nombre, orden, activo, fijo) values
  ('cubre-turno', 'Cubre turno', 35, true, true),
  ('taxis', 'Taxis', 36, true, true)
on conflict (id) do update set nombre = excluded.nombre, fijo = true, activo = true;

insert into public.cont_virtual_subcategorias (id, categoria_id, nombre, orden, activo, fijo) values
  ('cubre-turno-pago', 'cubre-turno', 'Pago', 10, true, true),
  ('taxis-servicio', 'taxis', 'Servicio', 10, true, true)
on conflict (id) do update set nombre = excluded.nombre, categoria_id = excluded.categoria_id, fijo = true, activo = true;


-- ---------------------------------------------------------------------------
-- INCLUDE: fix_catalogo_gastos_global.sql
-- ---------------------------------------------------------------------------
-- =============================================================================
-- POS 3B — Catálogo de gastos global (todas las sucursales)
-- Opcional: consolida categorías existentes bajo sucursal_id = 'GLOBAL'
-- Seguro re-ejecutar parcialmente (puede duplicar si ya migró).
-- =============================================================================

-- Insertar filas globales desde categorías por tienda (sin duplicar categoría+modulo)
insert into public.cortes_gasto_catalogo (sucursal_id, modulo, categoria, subcategorias)
select distinct on (modulo, categoria)
  'GLOBAL' as sucursal_id,
  modulo,
  categoria,
  subcategorias
from public.cortes_gasto_catalogo
where sucursal_id is distinct from 'GLOBAL'
order by modulo, categoria
on conflict (sucursal_id, modulo, categoria) do update
  set subcategorias = excluded.subcategorias;


-- ---------------------------------------------------------------------------
-- INCLUDE: fix_nomina_dias_pagador.sql
-- ---------------------------------------------------------------------------
-- =============================================================================
-- POS 3B — Nómina: días trabajados, inventario, pagador ambos
-- Ejecutar en Supabase → SQL Editor (seguro re-ejecutar)
-- =============================================================================

alter table public.usuarios drop constraint if exists usuarios_nomina_pagador_check;
alter table public.usuarios add constraint usuarios_nomina_pagador_check
  check (nomina_pagador is null or nomina_pagador in ('virtual', 'abarrotes', 'garage', 'ambos'));

alter table public.nomina_lineas add column if not exists dias_trabajados numeric(5,2) default 0;
alter table public.nomina_lineas add column if not exists cortes_periodo int default 0;
alter table public.nomina_lineas add column if not exists vales_gasolina int default 0;
alter table public.nomina_lineas add column if not exists sueldo_tarifa numeric(12,2) default 0;
alter table public.nomina_lineas add column if not exists deduccion_inventario numeric(12,2) default 0;


-- ---------------------------------------------------------------------------
-- INCLUDE: fix_nomina_saldo_arrastre.sql
-- ---------------------------------------------------------------------------
-- Saldo negativo de nómina: arrastre a la siguiente semana
alter table public.nomina_lineas add column if not exists deduccion_arrastre numeric(12,2) default 0;
alter table public.nomina_lineas add column if not exists saldo_pendiente numeric(12,2) default 0;


-- ---------------------------------------------------------------------------
-- INCLUDE: fix_nomina_prestamos_recoleccion.sql
-- ---------------------------------------------------------------------------
-- =============================================================================
-- POS 3B — Nómina: deducción préstamos + match consumos por nombre
-- Ejecutar en Supabase → SQL Editor (seguro re-ejecutar)
-- =============================================================================

alter table public.nomina_lineas add column if not exists deduccion_prestamos numeric(12,2) default 0;

alter table public.cortes_contabilidad_gastos add column if not exists descontado_nomina boolean default false;
alter table public.cortes_contabilidad_gastos add column if not exists periodo_nomina_id uuid;


-- ---------------------------------------------------------------------------
-- Ajuste final: cuenta IE admite virtual | garage | abarrotes (gasolina → MAIN)
-- ---------------------------------------------------------------------------
comment on column public.cont_virtual_egresos.cuenta is
  'Libro IE: virtual (IE VIRTUAL) | garage | abarrotes (IE ABARROTES). Gasolina siempre sucursal_id=MAIN.';

comment on column public.cont_virtual_ingresos.cuenta is
  'Libro IE ingresos: virtual | garage | abarrotes.';

create index if not exists idx_cont_virtual_egresos_suc_cuenta
  on public.cont_virtual_egresos (sucursal_id, cuenta, fecha desc);
