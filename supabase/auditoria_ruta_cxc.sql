-- Diagnóstico de solo lectura. Ejecutar después de fix_ruta_cxc_pagos_atomicos.sql.
-- Ninguna consulta elimina, reconstruye ni vuelve a cobrar movimientos.

-- 1. Ventas con importe a crédito y sin cargo CxC vinculado.
with ventas as (
 select v.*, case when v.metodo_pago='credito' then v.total else
   coalesce((select (a->>'credito')::numeric from jsonb_array_elements(v.articulos) a
     where a->>'_pago_mixto'='true' limit 1),0) end as esperado
 from public.ruta_ventas v where v.metodo_pago in ('credito','mixto')
)
select v.id,v.folio,v.cliente_id,v.esperado,v.estado_credito,v.created_at
from ventas v where v.esperado>0 and not exists (
 select 1 from public.ruta_cxc_movimientos c where c.tipo='cargo' and c.venta_id=v.id::text
) order by v.created_at;

-- 2. Posibles cargos duplicados por venta o ficha. Revisar antes de cualquier reparación.
select coalesce(venta_id,carga_id) referencia, count(*) cargos,
 array_agg(id) ids, sum(monto) monto
from public.ruta_cxc_movimientos where tipo='cargo' and (venta_id is not null or carga_id like 'rec:%')
group by coalesce(venta_id,carga_id) having count(*)>1;

-- 3. Cargos pagados sin abono identificable (incluye coincidencias históricas).
select c.id,c.folio_venta,c.cliente_id,c.monto,c.pagado_at,c.gasto_id
from public.ruta_cxc_movimientos c where c.tipo='cargo'
 and (c.estatus='pagado' or c.pagado_at is not null)
 and not exists(select 1 from public.ruta_cxc_movimientos a where a.tipo='abono' and (
   a.cargo_id=c.id or (a.cliente_tipo=c.cliente_tipo and
   (case when a.cliente_tipo='sucursal' then public.ruta_cxc_codigo(a.cliente_id) else a.cliente_id end)=
   (case when c.cliente_tipo='sucursal' then public.ruta_cxc_codigo(c.cliente_id) else c.cliente_id end)
   and (a.venta_id=c.venta_id or a.gasto_id=c.gasto_id or
     (a.folio_venta=c.folio_venta and c.folio_venta is not null)))
 ));

-- 4. Abonos sin gasto o sin cargo vinculado. Los anteriores al cambio pueden no tener cargo_id.
select a.id,a.cliente_id,a.monto,a.folio_venta,a.cargo_id,a.gasto_id
from public.ruta_cxc_movimientos a left join public.cortes_contabilidad_gastos g on g.id=a.gasto_id
where a.tipo='abono' and (g.id is null or a.cargo_id is null);

-- 5. Fichas pendientes sin CxC o con remanentes diferentes (posibles parciales históricos).
select t.id,t.num_traspaso,t.sucursal_origen,t.monto monto_ficha,c.id cargo_id,c.monto monto_cargo,c.estatus
from public.transito_efectivo t left join public.ruta_cxc_movimientos c
 on c.tipo='cargo' and (c.carga_id='rec:'||t.id::text or c.notas like '%transito:'||t.id::text||'%')
where t.estatus='Por Cobrar' and t.tipo_movimiento='Entrega Crédito'
 and (c.id is null or c.monto<>t.monto or c.pagado_at is not null or c.estatus='pagado');
