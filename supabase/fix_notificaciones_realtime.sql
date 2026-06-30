-- =============================================================================
-- POS 3B — Realtime en contabilidad_notificaciones (alertas al admin)
-- Ejecutar en Supabase → SQL Editor (seguro re-ejecutar)
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
    raise notice 'No se pudo agregar a supabase_realtime: %', sqlerrm;
end $$;
