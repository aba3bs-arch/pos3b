-- Códigos de barras alternos en el mismo producto (artículo provisional / reetiquetado).
-- Supabase → SQL Editor → Run.

alter table public.productos
  add column if not exists codigos_alt text[] not null default '{}';

comment on column public.productos.codigos_alt is
  'Códigos de barras adicionales del mismo producto (no reemplazan productos.id).';

-- Índice GIN para búsquedas por código alterno en servidor (opcional / futuro).
create index if not exists productos_codigos_alt_gin
  on public.productos using gin (codigos_alt);

notify pgrst, 'reload schema';
