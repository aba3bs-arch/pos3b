# Corte general de Abarrotes programado en el servidor

El corte general (folios CGA-00001…) se genera cada noche con `pg_cron` + una Edge Function, sin depender de que alguien abra la app. La función ejecuta la **misma lógica del POS** (`src/lib/corteAbarrotesDiario.js`) empaquetada en un archivo.

## Pasos (una sola vez)

1. **Elige un secreto** largo y aleatorio (ej. 40 caracteres). Lo usarás en los pasos 2 y 4.
2. **Secret de la función:** Supabase → Edge Functions → Secrets → `CRON_SECRET = <tu secreto>`
   (o `supabase secrets set CRON_SECRET=<tu secreto>`).
3. **Desplegar la función** (igual que `enviar-push`):
   ```powershell
   supabase functions deploy corte-general-abarrotes --no-verify-jwt
   ```
   La función se protege con el header `x-cron-secret`, por eso no usa JWT.
4. **SQL:** abre `supabase/cron_corte_general_abarrotes.sql`, cambia en la sección 3 `TU_PROJECT_REF` y el secreto (el mismo del paso 1) y ejecútalo completo en el SQL Editor.
5. **Probar:** ejecuta la prueba manual de la sección 5 del SQL y revisa la respuesta en `net._http_response` (`ok: true`).

## Cómo funciona

- 00:10 hora Nogales (07:10 UTC) corre el corte de **ayer** para todas las tiendas; 03:10 hora Nogales hay un reintento. Si el corte de un día ya existe no hace nada.
- Un índice único evita dos cortes generales para la misma tienda y día (si coinciden la app y el servidor, el segundo se rechaza sin daño).
- La app conserva su comprobación al iniciar sesión como respaldo.
- Si cambia `corteAbarrotesDiario.js` (o algo que importe), regenera y vuelve a desplegar:
  ```powershell
  node scripts/build-edge-corte-general.mjs
  supabase functions deploy corte-general-abarrotes --no-verify-jwt
  ```

## Si algo falla

- `select jobname, status, return_message from cron.job_run_details ...` (sección 6 del SQL).
- `select * from net._http_response order by created desc limit 5;` muestra el código y el JSON de la función (`errores` lista tienda y día).
- 401 → el secreto de Vault no coincide con `CRON_SECRET`. 500 → revisa `errores` en la respuesta y los logs de la función.
