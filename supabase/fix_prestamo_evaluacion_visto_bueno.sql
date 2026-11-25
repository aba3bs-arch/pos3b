-- Evaluación de 5 factores al dar visto bueno de un préstamo a empleado.
-- ABB y FJBB la ven al autorizar. Ejecutar en Supabase → SQL Editor.

alter table public.prestamos
  add column if not exists evaluacion_visto_bueno jsonb;

comment on column public.prestamos.evaluacion_visto_bueno is
  'Calificación del visto bueno (5 factores y porcentaje). Mínimo 85% para pasar a ABB/FJBB.';
