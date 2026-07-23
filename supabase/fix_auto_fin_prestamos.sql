-- =============================================================================
-- POS 3B — Auto Fin: soporte para financiar préstamos
-- Ejecutar en Supabase → SQL Editor (después de fix_auto_fin.sql). Seguro re-ejecutar.
-- =============================================================================

alter table public.auto_fin_creditos
  add column if not exists tipo text not null default 'vehiculo';

alter table public.auto_fin_creditos
  add column if not exists beneficiario_tipo text not null default 'cliente';

alter table public.auto_fin_creditos
  add column if not exists empleado_id text;

alter table public.auto_fin_creditos
  add column if not exists empleado_nombre text;

alter table public.auto_fin_creditos
  add column if not exists prestamo_id uuid;

-- Restringir valores (si ya hay check previo, no falla el add column)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'auto_fin_creditos_tipo_check'
  ) then
    alter table public.auto_fin_creditos
      add constraint auto_fin_creditos_tipo_check
      check (tipo in ('vehiculo', 'prestamo'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'auto_fin_creditos_beneficiario_check'
  ) then
    alter table public.auto_fin_creditos
      add constraint auto_fin_creditos_beneficiario_check
      check (beneficiario_tipo in ('cliente', 'empleado'));
  end if;
exception when others then
  null;
end $$;

create index if not exists idx_auto_fin_creditos_tipo on public.auto_fin_creditos (tipo, estado, created_at desc);
create index if not exists idx_auto_fin_creditos_empleado on public.auto_fin_creditos (empleado_id);
create index if not exists idx_auto_fin_creditos_prestamo on public.auto_fin_creditos (prestamo_id);

comment on column public.auto_fin_creditos.tipo is 'vehiculo = autofinanciamiento auto; prestamo = financiamiento de préstamo';
comment on column public.auto_fin_creditos.prestamo_id is 'Opcional: vínculo a prestamos.id si se financió un préstamo existente';
