-- Ámbito de proveedores: tienda vs CEDIS (catálogos separados).
-- Ejecutar en Supabase → SQL Editor.

alter table public.proveedores
  add column if not exists ambito text not null default 'tienda';

-- Valores válidos.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'proveedores_ambito_check'
  ) then
    alter table public.proveedores
      add constraint proveedores_ambito_check
      check (ambito in ('tienda', 'cedis'));
  end if;
end $$;

comment on column public.proveedores.ambito is
  'tienda = proveedores de sucursales; cedis = proveedores exclusivos del almacén CEDIS. No se mezclan.';

-- El proveedor del catálogo CEDIS / Venta en Ruta siempre es ámbito cedis.
update public.proveedores
set ambito = 'cedis'
where upper(trim(nombre)) = 'CEDIS LAS 3B';

create index if not exists idx_proveedores_ambito
  on public.proveedores (ambito);
