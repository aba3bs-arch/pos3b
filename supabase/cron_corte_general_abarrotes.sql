-- ============================================================================
-- Corte de caja general de Abarrotes (CGA-00001…) PROGRAMADO EN EL SERVIDOR
--
-- Antes: el corte de ayer se generaba la primera vez que alguien abría la app
-- (o el Libro diario) después de medianoche.
-- Ahora: pg_cron llama cada noche a la Edge Function `corte-general-abarrotes`,
-- que usa la misma lógica del POS. La app sigue como respaldo (es idempotente).
--
-- ORDEN (ver supabase/corte_general_cron_setup.md):
--   1) Desplegar la función y crear el secret CRON_SECRET.
--   2) Editar las 2 variables de la sección 3 (project ref y secreto) y ejecutar TODO este archivo.
--   3) Probar con la sección 5.
-- Horario: America/Hermosillo = UTC-7 todo el año (sin horario de verano).
--   00:10 hora Nogales = 07:10 UTC   (corrida principal)
--   03:10 hora Nogales = 10:10 UTC   (reintento por si algo falló; no duplica nada)
-- ============================================================================

-- 1) Extensiones (si falla, actívalas en Database → Extensions: pg_cron y pg_net)
create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists supabase_vault;

-- 2) Un solo corte general por tienda y día (evita duplicados si la app y el servidor coinciden)
do $$
declare
  v_dup int;
begin
  select count(*) into v_dup from (
    select sucursal_id, detalle->>'fecha_negocio' as fecha
    from public.cortes_contabilidad_cierres
    where modulo = 'abarrotes'
      and detalle->>'tipo_cierre' = 'cierre_diario'
      and deleted_at is null
    group by 1, 2
    having count(*) > 1
  ) d;
  if v_dup > 0 then
    raise exception 'Hay % tienda(s)/día con más de un corte general. Revisa con: select sucursal_id, detalle->>''fecha_negocio'', count(*) from public.cortes_contabilidad_cierres where modulo=''abarrotes'' and detalle->>''tipo_cierre''=''cierre_diario'' and deleted_at is null group by 1,2 having count(*)>1;', v_dup;
  end if;
end $$;

create unique index if not exists cortes_cierres_diario_unico
  on public.cortes_contabilidad_cierres (sucursal_id, (detalle->>'fecha_negocio'))
  where modulo = 'abarrotes'
    and detalle->>'tipo_cierre' = 'cierre_diario'
    and deleted_at is null;

-- 3) Dirección de la función y secreto compartido (se guardan cifrados en Vault)
--    >>> CAMBIA estos dos valores antes de ejecutar <<<
do $$
declare
  v_url    text := 'https://TU_PROJECT_REF.supabase.co/functions/v1/corte-general-abarrotes';
  v_secret text := 'CAMBIA_ESTE_SECRETO_POR_UNA_CLAVE_LARGA_Y_ALEATORIA';
  v_id uuid;
begin
  if v_url like '%TU_PROJECT_REF%' or v_secret like 'CAMBIA_ESTE_SECRETO%' then
    raise exception 'Edita v_url (tu project ref) y v_secret (el mismo valor que CRON_SECRET en la función) antes de ejecutar.';
  end if;

  select id into v_id from vault.secrets where name = 'corte_general_url';
  if v_id is null then
    perform vault.create_secret(v_url, 'corte_general_url', 'URL de la Edge Function corte-general-abarrotes');
  else
    perform vault.update_secret(v_id, v_url);
  end if;

  select id into v_id from vault.secrets where name = 'corte_general_secret';
  if v_id is null then
    perform vault.create_secret(v_secret, 'corte_general_secret', 'CRON_SECRET de corte-general-abarrotes');
  else
    perform vault.update_secret(v_id, v_secret);
  end if;
end $$;

-- 4) Programación (cron.schedule con el mismo nombre actualiza el trabajo, no lo duplica)
select cron.schedule(
  'corte-general-abarrotes-0010',
  '10 7 * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'corte_general_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'corte_general_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $job$
);

select cron.schedule(
  'corte-general-abarrotes-0310-reintento',
  '10 10 * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'corte_general_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'corte_general_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $job$
);

-- 5) PRUEBA MANUAL (ejecútala sola, después de los pasos anteriores).
--    La función revisa desde el 13 nov 2026 hasta ayer; si ya existen los cortes responde creados = 0.
--
-- select net.http_post(
--   url := (select decrypted_secret from vault.decrypted_secrets where name = 'corte_general_url'),
--   headers := jsonb_build_object(
--     'Content-Type', 'application/json',
--     'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'corte_general_secret')
--   ),
--   body := '{}'::jsonb,
--   timeout_milliseconds := 120000
-- ) as request_id;
--
-- Respuesta de la función (espera unos segundos):
-- select id, status_code, content::text, created from net._http_response order by created desc limit 5;
--
-- Cortes generales creados:
-- select sucursal_id, folio, detalle->>'fecha_negocio' as fecha, ventas, caja_actual, created_at
-- from public.cortes_contabilidad_cierres
-- where modulo = 'abarrotes' and detalle->>'tipo_cierre' = 'cierre_diario' and deleted_at is null
-- order by detalle->>'fecha_negocio' desc, sucursal_id;

-- 6) SEGUIMIENTO
-- select jobname, schedule, active from cron.job where jobname like 'corte-general-abarrotes%';
-- select j.jobname, d.status, d.return_message, d.start_time
-- from cron.job_run_details d join cron.job j using (jobid)
-- where j.jobname like 'corte-general-abarrotes%' order by d.start_time desc limit 10;

-- 7) PARA QUITARLO
-- select cron.unschedule('corte-general-abarrotes-0010');
-- select cron.unschedule('corte-general-abarrotes-0310-reintento');
