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
