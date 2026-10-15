-- =============================================================================
-- POS 3B — Reparar retiros accidentales por «Eliminar» en Compras → Por recibir
-- =============================================================================
-- Contexto (2026-10-15 ~01:45): al borrar historial de recepciones se descontó
-- piso en varias sucursales y quedaron RET-… en Consultas → Ajuste de inventario.
--
-- Este script (Supabase → SQL Editor, como postgres):
--   1) PREVIEW: lista los retiros a reparar
--   2) REPARAR: devuelve stock (delta +) y BORRA esos movimientos de la bitácora
--      para que no aparezcan en Consultas.
--
-- SAFE: solo toca filas con motivo «Eliminar recepción…» o meta.eliminar_compra.
-- Idempotente a medias: si ya corriste el paso y se borraron, el preview queda vacío.
-- =============================================================================

-- ── 0) Ventana de fechas (UTC). Ajusta si hace falta. ───────────────────────
-- México UTC−6 ≈ 01:45 local → ~07:45 UTC. Ampliamos 14→16 oct por seguridad.

-- ── 1) PREVIEW (ejecuta primero y revisa) ───────────────────────────────────
select
  id,
  sucursal_id,
  producto_id,
  producto_nombre,
  cantidad,
  ubicacion,
  motivo,
  usuario,
  meta->>'folio' as folio,
  meta->>'eliminar_compra' as eliminar_compra,
  created_at
from public.movimientos_inventario
where tipo = 'retiro'
  and (
    motivo ilike 'Eliminar recepción%'
    or coalesce(meta->>'eliminar_compra', '') in ('true', 't', '1')
  )
  and created_at >= timestamptz '2026-10-14 00:00:00+00'
  and created_at <  timestamptz '2026-10-16 18:00:00+00'
order by created_at, sucursal_id, producto_id;

-- Resumen por sucursal
select
  sucursal_id,
  count(*) as retiros,
  sum(coalesce(cantidad, 0)) as piezas
from public.movimientos_inventario
where tipo = 'retiro'
  and (
    motivo ilike 'Eliminar recepción%'
    or coalesce(meta->>'eliminar_compra', '') in ('true', 't', '1')
  )
  and created_at >= timestamptz '2026-10-14 00:00:00+00'
  and created_at <  timestamptz '2026-10-16 18:00:00+00'
group by sucursal_id
order by sucursal_id;

-- ── 2) REPARAR (descomenta el bloque DO $$ … $$ y corre) ───────────────────
-- Devuelve inventario y elimina la evidencia en Consultas.
/*
do $$
declare
  r record;
  v_qty integer;
  v_ubi text;
  v_restored integer := 0;
  v_deleted integer := 0;
  v_skipped integer := 0;
  v_err text;
begin
  for r in
    select *
    from public.movimientos_inventario
    where tipo = 'retiro'
      and (
        motivo ilike 'Eliminar recepción%'
        or coalesce(meta->>'eliminar_compra', '') in ('true', 't', '1')
      )
      and created_at >= timestamptz '2026-10-14 00:00:00+00'
      and created_at <  timestamptz '2026-10-16 18:00:00+00'
    order by created_at
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
        raise notice 'No se pudo restaurar % @ %: %', r.producto_id, r.sucursal_id, v_err;
        v_skipped := v_skipped + 1;
        -- Aun así borramos el movimiento erróneo de Consultas
      end;
    else
      v_skipped := v_skipped + 1;
    end if;

    delete from public.movimientos_inventario where id = r.id;
    v_deleted := v_deleted + 1;
  end loop;

  raise notice 'Reparación OK · stock restaurado: % · movimientos borrados: % · omitidos/errores: %',
    v_restored, v_deleted, v_skipped;
end $$;
*/

-- ── 3) VERIFICACIÓN (tras reparar: debe devolver 0 filas) ──────────────────
select count(*) as retiros_eliminar_compra_restantes
from public.movimientos_inventario
where tipo = 'retiro'
  and (
    motivo ilike 'Eliminar recepción%'
    or coalesce(meta->>'eliminar_compra', '') in ('true', 't', '1')
  )
  and created_at >= timestamptz '2026-10-14 00:00:00+00'
  and created_at <  timestamptz '2026-10-16 18:00:00+00';

-- Notas:
-- · La bitácora es append-only para anon/authenticated; el SQL Editor (owner) sí puede DELETE.
-- · Tras correr: recarga el POS / limpia caché en cada caja para ver stock y Consultas al día.
-- · Caché local (pos3b_movimientos_inventario) en un equipo puede mostrar restos hasta Limpiar caché.
