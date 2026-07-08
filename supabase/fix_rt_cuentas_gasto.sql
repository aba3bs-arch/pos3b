-- Gastos desde cuentas RT (Francisco / Andrés) + enlace a contabilidad.
-- Ejecutar en Supabase → SQL Editor (seguro re-ejecutar).

alter table public.rt_movimientos_cuenta drop constraint if exists rt_movimientos_cuenta_tipo_check;

alter table public.rt_movimientos_cuenta
  add constraint rt_movimientos_cuenta_tipo_check
  check (tipo in ('liquidacion', 'transferencia_enviada', 'transferencia_recibida', 'gasto'));

alter table public.rt_movimientos_cuenta add column if not exists gasto_contabilidad_id uuid;

create index if not exists idx_rt_mov_gasto_contab on public.rt_movimientos_cuenta (gasto_contabilidad_id)
  where gasto_contabilidad_id is not null;

comment on column public.rt_movimientos_cuenta.gasto_contabilidad_id is 'Referencia a cortes_contabilidad_gastos cuando tipo = gasto.';
