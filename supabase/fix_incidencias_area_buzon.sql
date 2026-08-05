-- =============================================================================
-- POS 3B — Área de buzón en incidencias (virtual | abarrotes | garage)
-- Ejecutar en Supabase → SQL Editor (seguro re-ejecutar)
-- =============================================================================

alter table public.pos_incidencias
  add column if not exists area text;

create index if not exists idx_pos_incidencias_area
  on public.pos_incidencias (area, estado, created_at desc);

comment on column public.pos_incidencias.area is
  'Buzón destino del reporte: virtual | abarrotes | garage';
