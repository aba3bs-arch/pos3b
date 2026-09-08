-- =============================================================================
-- POS 3B — PIN de acceso Socio 3B (sin nómina / sin RH)
-- Ejecutar en Supabase → SQL Editor (seguro re-ejecutar)
-- =============================================================================

alter table public.clientes_maquinas
  add column if not exists pin_acceso text;

comment on column public.clientes_maquinas.pin_acceso is
  'PIN de acceso al POS (rol Cliente / Socio 3B). No crea expediente RH ni entra a nómina.';

-- Un PIN activo no debe repetirse entre socios
create unique index if not exists idx_clientes_maquinas_pin_acceso
  on public.clientes_maquinas (pin_acceso)
  where pin_acceso is not null and length(trim(pin_acceso)) > 0;
