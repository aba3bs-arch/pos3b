# Web Push (VAPID) — alertas con la app cerrada

Avisos al **Administrador / Gerente** aunque el POS esté cerrado (Android Chrome / PWA; iPhone con app en pantalla de inicio y iOS 16.4+).

## 1. SQL

En Supabase → **SQL Editor**, ejecuta:

`supabase/fix_push_subscriptions.sql`

## 2. Generar claves VAPID

En tu PC (PowerShell):

```powershell
npx web-push generate-vapid-keys
```

Copia **Public Key** y **Private Key**.

## 3. Variables en el POS (front)

En `.env` (local) y en Netlify → Environment variables:

```
VITE_VAPID_PUBLIC_KEY=la_public_key_aqui
```

Vuelve a compilar / redesplegar después (`npm run build`).

## 4. Secrets de la Edge Function

Supabase → **Edge Functions** → Secrets (o CLI):

```
VAPID_PUBLIC_KEY=<misma public key>
VAPID_PRIVATE_KEY=<private key>
VAPID_SUBJECT=mailto:tu-correo@tudominio.com
```

`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` ya vienen en el proyecto hosted.

## 5. Desplegar la función

Con [Supabase CLI](https://supabase.com/docs/guides/cli):

```powershell
supabase login
supabase link --project-ref TU_PROJECT_REF
supabase functions deploy enviar-push
```

O sube la carpeta `supabase/functions/enviar-push` desde el dashboard.

## 6. Activar en el celular

1. Entra al POS como **Administrador** o **Gerente**
2. Pulsa **🔔 Activar alertas**
3. Acepta el permiso del sistema
4. En iPhone: instala la PWA (Compartir → Añadir a pantalla de inicio) y activa desde ahí

Cada dispositivo Admin/Gerente queda registrado en `pos_push_subscriptions`.

## 7. Probar

- Botón **Probar notificación** / **🔔 OK** envía también un push remoto
- Crear un vale / incidencia / cobro post-liquidación también dispara `enviar-push`

## Notas

- Sin `VITE_VAPID_PUBLIC_KEY` el POS sigue con alertas solo con la app abierta (comportamiento anterior)
- Endpoints inválidos (410/404) se borran solos
- No subas la **Private Key** al repositorio ni a Netlify (solo secret de Supabase)
