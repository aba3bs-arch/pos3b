-- POS 3B — Auto Fin prestamos (una linea por sentencia)
-- Supabase SQL Editor: borra todo, pega esto y Run

alter table public.auto_fin_creditos add column if not exists tipo text default 'vehiculo';
alter table public.auto_fin_creditos add column if not exists beneficiario_tipo text default 'cliente';
alter table public.auto_fin_creditos add column if not exists empleado_id text;
alter table public.auto_fin_creditos add column if not exists empleado_nombre text;
alter table public.auto_fin_creditos add column if not exists prestamo_id uuid;
update public.auto_fin_creditos set tipo = 'vehiculo' where tipo is null;
update public.auto_fin_creditos set beneficiario_tipo = 'cliente' where beneficiario_tipo is null;
create index if not exists idx_auto_fin_creditos_tipo on public.auto_fin_creditos (tipo, estado, created_at desc);
create index if not exists idx_auto_fin_creditos_empleado on public.auto_fin_creditos (empleado_id);
create index if not exists idx_auto_fin_creditos_prestamo on public.auto_fin_creditos (prestamo_id);
