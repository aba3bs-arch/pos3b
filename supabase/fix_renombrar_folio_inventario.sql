-- Permite corregir meta.folio de movimientos_inventario SOLO en una sucursal.
-- (La bitácora sigue sin DELETE; no se reescribe cantidad ni stock.)
-- Ejecutar en Supabase → SQL Editor.

create or replace function public.renombrar_folio_movimiento_inventario(
  p_sucursal text,
  p_folio_old text,
  p_folio_new text
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer := 0;
begin
  if coalesce(trim(p_sucursal), '') = '' then
    raise exception 'sucursal vacía';
  end if;
  if coalesce(trim(p_folio_old), '') = '' or coalesce(trim(p_folio_new), '') = '' then
    raise exception 'folio vacío';
  end if;
  if p_folio_old = p_folio_new then
    return 0;
  end if;

  update public.movimientos_inventario
  set meta = jsonb_set(coalesce(meta, '{}'::jsonb), '{folio}', to_jsonb(p_folio_new), true)
  where sucursal_id = p_sucursal
    and coalesce(meta->>'folio', '') = p_folio_old;

  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.renombrar_folio_movimiento_inventario(text, text, text) from public;
grant execute on function public.renombrar_folio_movimiento_inventario(text, text, text) to anon, authenticated;

comment on function public.renombrar_folio_movimiento_inventario(text, text, text) is
  'Corrige el folio de un ingreso/retiro en una sucursal (folios duplicados entre tiendas).';
