-- =============================================================================
-- POS 3B — Backfill: recolecciones 2026-08-22 y 2026-08-23 → Por recolectar
-- Ejecutar en Supabase → SQL Editor DESPUÉS de fix_prestamos_interarea_rc_virtual.sql
-- =============================================================================
-- Marca préstamos ligados a cortes RECOLECCION de esos días como por_recolectar,
-- sella colectado_* si faltaba y reabre los «recuperado» que no pasaron por RC
-- Virtual, para poder Ajustar / Recolectar en Vales y Préstamos.

do $$
declare
  d date;
  v_ini timestamptz;
  v_fin timestamptz;
begin
  foreach d in array array[date '2026-08-22', date '2026-08-23']
  loop
    v_ini := (d::text || ' 00:00:00')::timestamptz;
    v_fin := (d::text || ' 23:59:59.999')::timestamptz;

    update public.prestamos_interarea p
    set
      colectado_por = coalesce(p.colectado_por, c.usuario_nombre, 'Recolector'),
      colectado_at = coalesce(p.colectado_at, c.created_at),
      colectado_folio = coalesce(p.colectado_folio, c.folio),
      colectado_modulo = coalesce(p.colectado_modulo, lower(c.modulo), lower(p.origen))
    from public.cortes_contabilidad_cierres c
    where c.created_at >= v_ini
      and c.created_at <= v_fin
      and (
        upper(coalesce(c.turno, '')) like '%RECOLEC%'
        or lower(coalesce(c.detalle->>'tipo_cierre', '')) = 'recoleccion'
      )
      and lower(coalesce(c.detalle->>'tipo_cierre', '')) is distinct from 'recoleccion_temporal'
      and p.gasto_id is not null
      and (
        (c.detalle->'gastos_ids') ? p.gasto_id::text
        or exists (
          select 1
          from jsonb_array_elements(coalesce(c.detalle->'gastos', '[]'::jsonb)) g
          where g->>'id' = p.gasto_id::text
        )
      );

    update public.prestamos_interarea p
    set
      colectado_por = coalesce(p.colectado_por, c.usuario_nombre, 'Recolector'),
      colectado_at = coalesce(p.colectado_at, c.created_at),
      colectado_folio = coalesce(p.colectado_folio, c.folio),
      colectado_modulo = coalesce(p.colectado_modulo, lower(c.modulo), lower(p.origen))
    from public.cortes_contabilidad_cierres c
    where c.created_at >= v_ini
      and c.created_at <= v_fin
      and (
        upper(coalesce(c.turno, '')) like '%RECOLEC%'
        or lower(coalesce(c.detalle->>'tipo_cierre', '')) = 'recoleccion'
      )
      and lower(coalesce(c.detalle->>'tipo_cierre', '')) is distinct from 'recoleccion_temporal'
      and c.detalle::text ilike ('%PRESTAMO-IA:' || p.id::text || '%');

    update public.prestamos_interarea p
    set
      estado = 'por_recolectar',
      saldo = case
        when coalesce(p.abono, 0) > 0
             and (coalesce(p.monto, 0) - coalesce(p.abono, 0)) > 0.001
          then round((p.monto - p.abono)::numeric, 2)
        else greatest(coalesce(p.monto, 0), coalesce(p.saldo, 0))
      end,
      abono = case
        when coalesce(p.abono, 0) > 0
             and (coalesce(p.monto, 0) - coalesce(p.abono, 0)) > 0.001
          then p.abono
        when coalesce(p.estado, '') in ('recuperado', 'liquidado')
             and coalesce(p.saldo, 0) <= 0.001
             and coalesce(p.monto, 0) > 0
          then 0
        else coalesce(p.abono, 0)
      end,
      liquidado_por = null,
      liquidado_at = null,
      liquidado_sucursal = null,
      colectado_por = coalesce(p.colectado_por, 'Admin · backfill ' || d::text),
      colectado_at = coalesce(p.colectado_at, v_ini + interval '12 hours'),
      colectado_folio = coalesce(p.colectado_folio, 'BACKFILL-' || to_char(d, 'YYYY-MM-DD')),
      colectado_modulo = coalesce(p.colectado_modulo, lower(p.origen))
    where coalesce(p.rc_recibido_por, '') = ''
      and p.estado is distinct from 'cancelado'
      and (
        p.fecha = d
        or (p.colectado_at is not null and p.colectado_at >= v_ini and p.colectado_at <= v_fin)
      );

    update public.prestamos_interarea p
    set estado = 'por_recolectar'
    where p.estado in ('recuperar', 'activo')
      and coalesce(p.saldo, p.monto, 0) > 0
      and (
        p.fecha = d
        or (p.colectado_por is not null and p.colectado_at >= v_ini and p.colectado_at <= v_fin)
      );
  end loop;
end $$;

select
  id,
  fecha,
  origen,
  destino,
  monto,
  saldo,
  abono,
  estado,
  colectado_por,
  colectado_folio,
  colectado_at::date as colectado_dia,
  rc_recibido_por
from public.prestamos_interarea
where fecha in (date '2026-08-22', date '2026-08-23')
   or (
     colectado_at >= timestamptz '2026-08-22 00:00:00'
     and colectado_at <= timestamptz '2026-08-23 23:59:59.999'
   )
   or colectado_folio like 'BACKFILL-2026-08-2%'
order by created_at desc;
