-- =============================================================================
-- Corte de caja — corroboración tarjeta / transferencia / QR
-- Ejecutar en Supabase → SQL Editor (seguro re-ejecutar)
-- =============================================================================

alter table public.cortes_caja add column if not exists corroboracion jsonb default '{}'::jsonb;

comment on column public.cortes_caja.corroboracion is
  'Montos contados vs sistema por rubro: tarjeta, transferencia, qr';
