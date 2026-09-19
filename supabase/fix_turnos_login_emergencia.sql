-- =============================================================================
-- POS 3B — Recuperar login tras seed/tolerancia de turnos
-- Ejecutar en Supabase → SQL Editor si cajeros quedan "Fuera de horario".
-- No cambia las horas de los turnos; solo amplía la ventana de entrada a ±2 h.
-- =============================================================================

update public.pos_turnos_config
set
  tolerancia = '{"minutos_antes":120,"minutos_despues_fin":120}'::jsonb,
  updated_at = now();

notify pgrst, 'reload schema';

select
  true as ok,
  sucursal_id,
  tolerancia
from public.pos_turnos_config
order by sucursal_id;
