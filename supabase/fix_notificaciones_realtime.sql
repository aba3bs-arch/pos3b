-- =============================================================================
-- POS 3B — Realtime en contabilidad_notificaciones (+ solicitudes Fondo)
-- Ejecutar en Supabase → SQL Editor (seguro re-ejecutar)
-- Necesario para que la caja de sucursal vea cobros de servicio al instante.
-- =============================================================================

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemename = 'public'
      and tablename = 'contabilidad_notificaciones'
  ) then
    alter publication supabase_realtime add table public.contabilidad_notificaciones;
  end if;
exception
  when others then
    raise notice 'No se pudo agregar contabilidad_notificaciones a realtime: %', sqlerrm;
end $$;

do $$
begin
  if to_regclass('public.ruta_fondo_solicitudes') is null then
    raise notice 'ruta_fondo_solicitudes aún no existe; omite realtime de Fondo.';
  elsif not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemename = 'public'
      and tablename = 'ruta_fondo_solicitudes'
  ) then
    alter publication supabase_realtime add table public.ruta_fondo_solicitudes;
  end if;
exception
  when others then
    raise notice 'No se pudo agregar ruta_fondo_solicitudes a realtime: %', sqlerrm;
end $$;
