# Desplegar POS 3B en Vercel

Así puedes abrir el POS desde **cualquier red** (celular, casa, otra oficina) con la misma base de datos Supabase.

---

## Requisitos

1. Cuenta en [vercel.com](https://vercel.com) (gratis)
2. Proyecto en **GitHub** (recomendado) o subida directa desde la CLI
3. Credenciales de **Supabase** (las mismas del archivo `.env` local)

---

## Paso 1 — Subir el código a GitHub

Si aún no tienes repo:

```bash
cd C:\Users\and_m\Desktop\pos-3b
git init
git add .
git commit -m "POS 3B listo para Vercel"
```

Crea un repositorio en GitHub y conéctalo (o usa la web de GitHub para subir la carpeta).

**No subas** el archivo `.env` (ya está en `.gitignore`).

---

## Paso 2 — Importar en Vercel

1. Entra a [vercel.com/new](https://vercel.com/new)
2. **Import** tu repositorio `pos-3b`
3. Vercel detecta Vite automáticamente. Debe quedar:
   - **Framework:** Vite
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
4. Antes de **Deploy**, abre **Environment Variables** y agrega:

| Nombre | Valor |
|--------|--------|
| `VITE_SUPABASE_URL` | `https://tu-proyecto.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | tu clave anon de Supabase |

Opcional (fijar tienda en la URL publicada):

| Nombre | Valor |
|--------|--------|
| `VITE_SUCURSAL_FIJA` | `3B5` (o la tienda que quieras) |

5. Pulsa **Deploy** y espera 1–2 minutos.

---

## Paso 3 — Usar la app en línea

Te dará una URL como:

```
https://pos-3b.vercel.app
```

Desde cualquier dispositivo:

1. Abre esa URL en Chrome o Edge
2. Inicia sesión con tu PIN (Administrador o Auditor)
3. Elige la sucursal de la caja que quieres vigilar
4. Usa **Consultas**, **Reportes**, **Inicio**, etc.

La **caja en tienda** puede seguir usando `iniciar-pos.bat` o el `.exe` local; ambos leen el **mismo Supabase**.

---

## Actualizar después de cambios

Cada vez que hagas `git push` a la rama conectada, Vercel vuelve a desplegar solo.

Si cambias variables en `.env`, actualízalas también en:

**Vercel → tu proyecto → Settings → Environment Variables → Redeploy**

---

## Despliegue sin GitHub (CLI)

```bash
npm i -g vercel
cd C:\Users\and_m\Desktop\pos-3b
vercel login
vercel
```

Cuando pregunte por variables, añade `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.

Producción:

```bash
vercel --prod
```

---

## Qué funciona en Vercel vs en la caja local

| Función | Vercel (remoto) | PC caja |
|---------|-----------------|---------|
| Ventas, consultas, reportes | Sí | Sí |
| Inventario en Supabase | Sí | Sí |
| Escáner USB HID | No (usa la caja) | Sí |
| Impresión térmica local | Limitado | Sí |
| Movimientos inventario solo en localStorage de la caja | No | Sí |

---

## Problemas frecuentes

| Problema | Solución |
|----------|----------|
| Pantalla “configura Supabase” | Revisa variables en Vercel y haz **Redeploy** |
| Login no funciona | Misma sucursal y PIN que en Usuarios |
| Build falla | En local ejecuta `npm run build` y corrige errores |
| Página en blanco | Variables `VITE_*` deben existir **antes** del build |

---

## Dominio propio (opcional)

En Vercel → **Settings → Domains** puedes agregar algo como `pos.tutienda.com`.
