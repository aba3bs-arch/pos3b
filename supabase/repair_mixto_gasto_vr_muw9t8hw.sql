-- Repair: cobro mixto (ej. VR-MUW9T8HW = $300 efectivo + $60 crédito)
-- Bug: al recibir se cargó gasto PROVEEDORES por el total ($360) en vez de solo efectivo ($300).
-- El crédito ya está en CxC; no duplicar.
--
-- 1) Localizar:
select id, sucursal_id, modulo, monto, comentario, cerrado, created_at
from public.cortes_contabilidad_gastos
where modulo = 'abarrotes'
  and (
    comentario ilike '%efectivo mixto $360%'
    or comentario ilike '%VR-MUW9T8HW%'
  )
order by created_at desc;

-- 2) Corregir monto a $300 (ajusta el filtro si el id es distinto):
update public.cortes_contabilidad_gastos
set
  monto = 300,
  comentario = regexp_replace(
    coalesce(comentario, ''),
    'efectivo mixto \$360(\.00)?',
    'efectivo mixto $300.00',
    'i'
  )
where modulo = 'abarrotes'
  and monto = 360
  and comentario ilike '%efectivo mixto $360%';
