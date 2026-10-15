-- =============================================================================
-- POS 3B — Reparar retiros por «Eliminar» en Compras (v2 — más amplio)
-- =============================================================================
-- Por qué falló el script anterior:
--   El PREVIEW solo buscaba motivo «Eliminar recepción%» / meta.eliminar_compra.
--   Si el motivo vino distinto o el acento no coincidió, devolvió 0 filas y
--   REPARAR no hizo nada. Los RET-*-1510-* de ~01:45 siguen en Consultas.
--
-- Qué hace este script (Supabase → SQL Editor, rol postgres):
--   A) DIAGNÓSTICO: ver qué hay en esa hora (motivos reales)
--   B) CANDIDATOS: marca filas a reparar (eliminar_compra Ó Eliminar… Ó
--      ráfaga RET-*-1510-* en la ventana de la madrugada del 15-oct)
--   C) REPARAR: restaura stock (+) y BORRA esos movimientos (desaparecen de Consultas)
--   D) VERIFICACIÓN
--
-- Ejecuta TODO el archivo de una sola vez (A→D). Es idempotente si ya borraste:
--   candidatos vacíos → no toca nada.
-- =============================================================================

-- ── A) DIAGNÓSTICO (siempre corre; solo lectura) ────────────────────────────
select
  coalesce(meta->>'folio', '') as folio,
  motivo,
  usuario,
  sucursal_id,
  count(*) as filas,
  sum(coalesce(cantidad, 0)) as piezas,
  min(created_at) as desde,
  max(created_at) as hasta
from public.movimientos_inventario
where tipo = 'retiro'
  and created_at >= timestamptz '2026-10-15 06:00:00+00'
  and created_at <  timestamptz '2026-10-15 14:00:00+00'
group by 1, 2, 3, 4
order by filas desc, desde
limit 80;

-- ── B) Candidatos → tabla temporal ──────────────────────────────────────────
drop table if exists _fix_retiros_eliminar_compra;
create temporary table _fix_retiros_eliminar_compra as
select
  m.id,
  m.sucursal_id,
  m.producto_id,
  m.producto_nombre,
  m.cantidad,
  m.ubicacion,
  m.motivo,
  m.usuario,
  m.meta,
  m.modo,
  m.created_at,
  coalesce(m.meta->>'folio', '') as folio
from public.movimientos_inventario m
where m.tipo = 'retiro'
  and m.created_at >= timestamptz '2026-10-14 00:00:00+00'
  and m.created_at <  timestamptz '2026-10-16 23:59:00+00'
  and (
    -- Marcadores del bug Eliminar recepción
    (m.meta ? 'eliminar_compra')
    or (m.meta -> 'eliminar_compra') = 'true'::jsonb
    or coalesce(m.meta->>'eliminar_compra', '') in ('true', 't', '1', 'yes')
    or m.motivo ilike '%Eliminar%recep%'
    or m.motivo ilike '%Eliminar%Compras%'
    or m.motivo ilike '%Eliminar recepción%'
    -- Ráfaga 15-oct ~01:45 local (Sonora UTC−7 → ≈08:45 UTC).
    -- Eliminar usaba modo='piso'; retiros manuales usan masivo/movimiento.
    or (
      coalesce(m.meta->>'folio', '') ~* '^RET-[A-Z0-9]+-1510-[0-9]+$'
      and coalesce(m.modo, '') = 'piso'
      and m.created_at >= timestamptz '2026-10-15 08:20:00+00'
      and m.created_at <  timestamptz '2026-10-15 09:30:00+00'
    )
  );

select
  'CANDIDATOS' as etapa,
  count(*) as filas,
  count(distinct sucursal_id) as sucursales,
  count(distinct producto_id) as productos,
  sum(coalesce(cantidad, 0)) as piezas
from _fix_retiros_eliminar_compra;

select *
from _fix_retiros_eliminar_compra
order by created_at, sucursal_id, producto_id
limit 200;

-- ── C) REPARAR (restaura stock + borra evidencia en Consultas) ───────────────
do $$
declare
  r record;
  v_qty integer;
  v_ubi text;
  v_restored integer := 0;
  v_deleted integer := 0;
  v_skipped integer := 0;
  v_err text;
  v_n integer;
begin
  select count(*) into v_n from _fix_retiros_eliminar_compra;
  if v_n = 0 then
    raise notice 'Sin candidatos: no hay nada que reparar (¿ya corriste esto?).';
    return;
  end if;

  raise notice 'Reparando % movimiento(s)…', v_n;

  for r in
    select * from _fix_retiros_eliminar_compra order by created_at
  loop
    v_qty := floor(abs(coalesce(r.cantidad, 0)))::integer;
    v_ubi := lower(coalesce(nullif(trim(r.ubicacion), ''), 'piso'));
    if v_ubi not in ('piso', 'cedis') then
      v_ubi := 'piso';
    end if;

    if v_qty > 0 and r.producto_id is not null and coalesce(trim(r.sucursal_id), '') <> '' then
      begin
        perform public.aplicar_delta_stock_ubicacion(
          r.producto_id::text,
          upper(trim(r.sucursal_id)),
          v_ubi,
          v_qty
        );
        v_restored := v_restored + 1;
      exception when others then
        v_err := sqlerrm;
        raise notice 'No se pudo restaurar % @ % (qty %): %',
          r.producto_id, r.sucursal_id, v_qty, v_err;
        v_skipped := v_skipped + 1;
      end;
    else
      v_skipped := v_skipped + 1;
    end if;

    -- Owner/SQL Editor puede DELETE aunque el POS sea append-only (RLS anon).
    delete from public.movimientos_inventario where id = r.id;
    v_deleted := v_deleted + 1;
  end loop;

  raise notice 'OK · stock restaurado: % · retiros borrados: % · omitidos/errores: %',
    v_restored, v_deleted, v_skipped;
end $$;

-- ── D) VERIFICACIÓN ─────────────────────────────────────────────────────────
select count(*) as candidatos_temp_restantes
from _fix_retiros_eliminar_compra c
where exists (
  select 1 from public.movimientos_inventario m where m.id = c.id
);

select count(*) as retiros_eliminar_o_rafaga_restantes
from public.movimientos_inventario m
where m.tipo = 'retiro'
  and m.created_at >= timestamptz '2026-10-15 06:00:00+00'
  and m.created_at <  timestamptz '2026-10-15 12:00:00+00'
  and (
    m.meta ? 'eliminar_compra'
    or m.motivo ilike '%Eliminar%'
    or coalesce(m.meta->>'folio', '') ~* '^RET-[A-Z0-9]+-1510-[0-9]+$'
  );

-- Tras OK: en cada caja → Limpiar caché / recargar POS.
-- En Notices del SQL Editor debes ver: «OK · stock restaurado: N · retiros borrados: N»
