-- Ejecutar en Supabase → SQL Editor (una vez). Ajusta políticas según tu modelo de seguridad.

-- Si tu tabla ventas no tiene marca de tiempo, ejecuta:
-- alter table public.ventas add column if not exists created_at timestamptz default now();

create table if not exists public.ventas (

  id uuid primary key default gen_random_uuid(),

  vendedor text,

  sucursal_id text,

  total numeric(12,2),

  metodo_pago text,

  articulos jsonb default '[]'::jsonb,

  created_at timestamptz default now()

);



alter table public.ventas enable row level security;

drop policy if exists "ventas_anon_rw" on public.ventas;

create policy "ventas_anon_rw" on public.ventas for all using (true) with check (true);



create table if not exists public.logins (

  id uuid primary key default gen_random_uuid(),

  usuario_id uuid references public.usuarios(id) on delete set null,

  nombre text,
  sucursal text,
  evento text,
  created_at timestamptz default now()

-- Compras: pedido (sin inventario) vs recibida (carga stock). Productos: mínimo para sugerencia.
);



alter table public.logins enable row level security;

drop policy if exists "logins_anon_rw" on public.logins;

create policy "logins_anon_rw" on public.logins for all using (true) with check (true);



-- ---------------------------------------------------------------------------

-- Clientes, proveedores, compras

-- ---------------------------------------------------------------------------



create table if not exists public.clientes (


  nombre text not null,
-- Reloj checador: entrada / salida por empleado (PIN = misma tabla usuarios que el login)
  telefono text,

  usuario_id uuid,

  rfc text,

  notas text,

  created_at timestamptz default now()

);


create table if not exists public.proveedores (
comment on table public.asistencias is 'Marcajes de reloj checador por tienda; usuario_id opcional si existe en usuarios';

  nombre text not null,

  contacto text,

  telefono text,

  email text,

  notas text,

  created_at timestamptz default now()

);



create table if not exists public.compras (

  id uuid primary key default gen_random_uuid(),

  proveedor_id uuid references public.proveedores(id) on delete set null,

  sucursal_id text,

  fecha date default (now() at time zone 'utc')::date,

  total numeric(12,2) default 0,

  notas text,

  items jsonb default '[]'::jsonb,

  created_at timestamptz default now()

);



alter table public.clientes enable row level security;

alter table public.proveedores enable row level security;

alter table public.compras enable row level security;



drop policy if exists "clientes_anon_rw" on public.clientes;

create policy "clientes_anon_rw" on public.clientes for all using (true) with check (true);

drop policy if exists "proveedores_anon_rw" on public.proveedores;

create policy "proveedores_anon_rw" on public.proveedores for all using (true) with check (true);

drop policy if exists "compras_anon_rw" on public.compras;

create policy "compras_anon_rw" on public.compras for all using (true) with check (true);



alter table public.compras add column if not exists estado text default 'recibida';

alter table public.compras add column if not exists items_pedido jsonb default '[]'::jsonb;



comment on column public.compras.estado is 'recibida = ya sumó inventario; pedido = orden enviada, pendiente de recepción';

comment on column public.compras.items_pedido is 'Líneas planeadas al proveedor (JSON). items = lo recibido al cerrar.';



alter table public.productos add column if not exists stock_minimo integer default 6;



-- N:M proveedor ↔ producto (código de producto = productos.id)

create table if not exists public.proveedor_producto (

  id uuid primary key default gen_random_uuid(),

  proveedor_id uuid not null references public.proveedores(id) on delete cascade,

  producto_id text not null,

  sku_proveedor text,

  created_at timestamptz default now(),

  unique (proveedor_id, producto_id)

);



create index if not exists idx_pp_proveedor on public.proveedor_producto(proveedor_id);

create index if not exists idx_pp_producto on public.proveedor_producto(producto_id);



alter table public.proveedor_producto enable row level security;

drop policy if exists "proveedor_producto_anon_rw" on public.proveedor_producto;

create policy "proveedor_producto_anon_rw" on public.proveedor_producto for all using (true) with check (true);



-- Reloj checador: entrada / salida (PIN = tabla usuarios)

create table if not exists public.asistencias (

  id uuid primary key default gen_random_uuid(),

  usuario_id uuid references public.usuarios(id) on delete set null,

  nombre text not null,

  sucursal_id text not null,

  tipo text not null check (tipo in ('ENTRADA', 'SALIDA')),

  created_at timestamptz default now()

);



create index if not exists idx_asistencias_sucursal_creado on public.asistencias (sucursal_id, created_at desc);



alter table public.asistencias enable row level security;

drop policy if exists "asistencias_anon_rw" on public.asistencias;

create policy "asistencias_anon_rw" on public.asistencias for all using (true) with check (true);



comment on table public.asistencias is 'Marcajes de reloj checador por tienda';


