# Desplegar POS 3B en Netlify

Abre el POS desde **cualquier red** (celular, casa, otra oficina) con la misma base de datos Supabase.

---

## Requisitos

1. Cuenta en [netlify.com](https://www.netlify.com) (gratis)
2. Credenciales de **Supabase** (las del archivo `.env` local)
3. Opcional: repositorio en **GitHub** (recomendado para actualizar con un push)

---

## Metodo A — Arrastrar carpeta (mas rapido, sin GitHub)

### 1. Compilar en tu PC

```powershell
cd C:\Users\and_m\Desktop\pos-3b
npm run build
```

Debe existir la carpeta `dist` sin errores.

> Las variables `VITE_*` se leen de tu `.env` **al compilar**. Si cambias `.env`, vuelve a ejecutar `npm run build` antes de subir.

### 2. Subir a Netlify

1. Entra a [app.netlify.com/drop](https://app.netlify.com/drop)
2. Arrastra la carpeta **`dist`** (no todo el proyecto, solo `dist`)
3. Netlify te da una URL como `https://algo-random.netlify.app`

### 3. Probar en el celular

Abre la URL, inicia sesion con tu PIN y elige la sucursal.

**Limitacion:** cada vez que cambies el codigo debes volver a `npm run build` y arrastrar `dist` otra vez.

---

## Metodo B — Con GitHub (recomendado)

### 1. Subir codigo a GitHub

Si aun no tienes repo:

```powershell
cd C:\Users\and_m\Desktop\pos-3b
git add .
git commit -m "POS 3B listo para Netlify"
git remote add origin https://github.com/TU-USUARIO/pos-3b.git
git push -u origin main
```

No subas el archivo `.env` (ya esta en `.gitignore`).

### 2. Crear sitio en Netlify

1. [app.netlify.com](https://app.netlify.com) → **Add new site** → **Import an existing project**
2. Conecta **GitHub** y elige el repo `pos-3b`
3. Netlify lee `netlify.toml` automaticamente:
   - **Build command:** `npm run build`
   - **Publish directory:** `dist`

### 3. Variables de entorno (obligatorio)

Antes del primer deploy, en **Site configuration** → **Environment variables** → **Add a variable**:

| Nombre | Valor |
|--------|--------|
| `VITE_SUPABASE_URL` | la de tu `.env` |
| `VITE_SUPABASE_ANON_KEY` | la de tu `.env` |

Opcional:

| Nombre | Valor |
|--------|--------|
| `VITE_SUCURSAL_FIJA` | `3B5` (o tu tienda) |

Aplica a **Production** (y Preview si quieres).

### 4. Deploy

Pulsa **Deploy site**. En 1–3 minutos tendras una URL como:

```
https://pos-3b.netlify.app
```

Puedes cambiar el nombre en **Domain management** → **Options** → **Edit site name**.

### 5. Actualizar despues

Cada `git push` a la rama conectada vuelve a desplegar solo.

Si cambias variables en `.env`, actualizalas en Netlify y **Trigger deploy** → **Clear cache and deploy site**.

---

## Metodo C — Terminal (CLI)

```powershell
cd C:\Users\and_m\Desktop\pos-3b
npx netlify-cli login
npx netlify-cli init
```

Cuando pregunte por variables, agrega `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.

Produccion:

```powershell
npx netlify-cli deploy --prod
```

---

## Usar desde el celular

1. Abre la URL de Netlify en Chrome o Safari
2. Inicia sesion con tu PIN (Administrador, Auditor, Gerente, etc.)
3. Elige la sucursal de la caja que quieres vigilar

La PC de la tienda puede seguir con `iniciar-pos.bat` o `iniciar-pos-red.bat` (misma red); remoto y caja usan el **mismo Supabase**.

---

## Que funciona en Netlify vs en la caja local

| Funcion | Netlify (remoto) | PC caja |
|---------|------------------|---------|
| Ventas, consultas, reportes | Si | Si |
| Inventario en Supabase | Si | Si |
| Escaner USB HID | No | Si |
| Impresion termica local | Limitado | Si |
| Movimientos inventario solo en localStorage de la caja | No | Si |

---

## Problemas frecuentes

| Problema | Solucion |
|----------|----------|
| Pantalla "configura Supabase" | Revisa variables en Netlify y redeploy |
| Login no funciona | Mismo PIN y sucursal que en Usuarios |
| Build falla | En local ejecuta `npm run build` y corrige errores |
| Pagina en blanco | Las variables `VITE_*` deben existir **antes** del build en Netlify |
| Metodo A (arrastrar dist) sin variables en build | Compila en PC **con** `.env` presente, luego sube `dist` |

---

## Dominio propio (opcional)

En Netlify → **Domain management** → **Add a domain** puedes usar algo como `pos.tutienda.com`.
