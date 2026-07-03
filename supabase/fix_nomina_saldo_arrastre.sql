-- Saldo negativo de nómina: arrastre a la siguiente semana
alter table public.nomina_lineas add column if not exists deduccion_arrastre numeric(12,2) default 0;
alter table public.nomina_lineas add column if not exists saldo_pendiente numeric(12,2) default 0;
