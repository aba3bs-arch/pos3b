-- Ajustes manuales de marcajes por administrador (opcional; el POS funciona sin estas columnas).
alter table public.asistencias add column if not exists ajustado_por text;

comment on column public.asistencias.ajustado_por is 'Nombre del administrador que corrigió o registró manualmente el marcaje';
