-- Destinos de cada cuenta de IE: a qué módulos se envía desde «Cuentas y subcuentas» → Enviar.
-- Valores separados por coma: abarrotes, virtual, garage, vales, registro_gastos.
-- NULL = comportamiento anterior (cortes según en_catalogo_cortes; Vales y Registro de gastos sí).
-- Ejecutar en Supabase → SQL Editor (seguro re-ejecutar).

alter table public.cont_virtual_categorias
  add column if not exists destinos_catalogo text;

comment on column public.cont_virtual_categorias.destinos_catalogo is
  'Módulos a los que se envía la cuenta: abarrotes,virtual,garage,vales,registro_gastos. NULL = comportamiento previo.';

notify pgrst, 'reload schema';
