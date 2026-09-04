-- Unifica tienda Fusión / FUSIÓN → FUSION (código canónico sin acento).
-- Ejecutar en Supabase → SQL Editor.
-- Evita el desfase en Conciliaciones (cobros vs gastos Smoking).

update public.transito_efectivo
set sucursal_origen = 'FUSION'
where sucursal_origen in ('Fusión', 'FUSIÓN', 'Fusion', 'fusion');

-- Si hay otras tablas con el mismo nombre histórico:
update public.cortes_contabilidad_gastos
set sucursal_id = 'FUSION'
where sucursal_id in ('Fusión', 'FUSIÓN', 'Fusion', 'fusion');

update public.cortes_contabilidad_cierres
set sucursal_id = 'FUSION'
where sucursal_id in ('Fusión', 'FUSIÓN', 'Fusion', 'fusion');

update public.usuarios
set sucursal_id = 'FUSION'
where sucursal_id in ('Fusión', 'FUSIÓN', 'Fusion', 'fusion');
