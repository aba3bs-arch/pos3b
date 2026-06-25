-- IVA 8% por defecto (frontera) y ganancia 30% en productos existentes sin margen.
alter table public.productos alter column impuesto set default 8;
alter table public.productos alter column ganancia_pct set default 30;

update public.productos set impuesto = 8 where impuesto is null or impuesto = 16;
update public.productos set ganancia_pct = 30 where ganancia_pct is null or ganancia_pct = 0;

-- Redondear precio al consumidor a pesos enteros
update public.productos set precio = round(precio) where precio is not null;

comment on column public.productos.impuesto is 'IVA % (default 8 en frontera).';
comment on column public.productos.ganancia_pct is 'Margen % sobre costo sin IVA (default 30).';
