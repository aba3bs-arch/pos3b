-- =============================================================================
-- POS 3B — Evidencia fotográfica de gastos de Venta en Ruta (RC/VentaRuta)
-- Ejecutar en Supabase → SQL Editor (seguro re-ejecutar)
-- =============================================================================

alter table public.transito_efectivo
  add column if not exists evidencia_url text;

comment on column public.transito_efectivo.evidencia_url is
  'Foto del ticket / nota de remisión (data URL JPEG) para gastos registrados en Venta en Ruta.';

-- Conceptos largos (categoría + nota)
do $$
begin
  alter table public.transito_efectivo
    alter column descripcion_gasto type text;
exception
  when others then null;
end $$;
