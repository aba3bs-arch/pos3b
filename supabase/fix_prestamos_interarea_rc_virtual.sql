-- =============================================================================
-- POS 3B — Recolección de préstamos entre áreas → RC Virtual
-- Ejecutar en Supabase → SQL Editor (seguro re-ejecutar)
-- =============================================================================
-- Al recolectar un préstamo en estado «por_recolectar» desde Vales y Préstamos,
-- el efectivo entra a RC Virtual (custodia + cuenta RT) y queda rastro de quién
-- lo recibió (rc_recibido_*).

-- Custodia RC Virtual: permitir origen préstamo entre áreas
do $$
declare
  cname text;
begin
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
exception
  when undefined_table then null;
end $$;

alter table public.r_virtual_custodia
  drop constraint if exists r_virtual_custodia_origen_check;

alter table public.r_virtual_custodia
  add constraint r_virtual_custodia_origen_check
  check (origen in ('transito', 'corte', 'prestamo_interarea'));

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
