# POS en escritorio Windows — dos formas

Puedes usar el POS como “app de caja” de **dos maneras**. Prueba ambas y elige la que mejor funcione en tu tienda.

---

## Opción A — Navegador + servidor local (rápida de probar)

**Qué es:** Compila la app, levanta un mini-servidor en la PC y abre Chrome/Edge sin barra de direcciones.

### Uso diario

1. Doble clic en **`iniciar-pos.bat`** (raíz del proyecto)  
   **o** ejecuta:
   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts\iniciar-pos-navegador.ps1
   ```
2. Se abre una ventana tipo app en `http://127.0.0.1:4173`

### Celular o tablet en la misma Wi-Fi

1. Doble clic en **`iniciar-pos-red.bat`**
2. En la consola verás la URL para el celular (ej. `http://192.168.1.50:5173`)
3. Abre esa URL en Chrome o Safari del movil (misma red Wi-Fi)
4. Si Windows pregunta por el Firewall, permite **Node.js** en red privada

### Arranque automático al encender la PC

```powershell
powershell -ExecutionPolicy Bypass -File scripts\instalar-inicio-automatico.ps1 -Modo navegador
```

Para quitar:
```powershell
powershell -ExecutionPolicy Bypass -File scripts\quitar-inicio-automatico.ps1
```

### Ventajas / desventajas

| Ventajas | Desventajas |
|----------|-------------|
| Fácil de actualizar (`npm run build`) | Necesita Node.js instalado |
| Escáner USB HID igual que en Chrome | Queda un proceso `node` en segundo plano |
| Sin instalar .exe | |

---

## Opción B — Electron (.exe portable)

**Qué es:** Un ejecutable Windows que abre el POS en su propia ventana (sin navegador visible).

### Requisitos previos

1. Archivo **`.env`** con Supabase configurado (se empaqueta al compilar)
2. Node.js en la PC donde **generas** el .exe (no hace falta en caja si solo copias el exe)

### Generar el .exe

```bash
npm install
npm run electron:build
```

El archivo queda en:
```
release/POS-3B-1.0.0-portable.exe
```

Cópialo a la PC de la caja y ejecútalo con doble clic.

### Desarrollo / prueba Electron sin empaquetar

```bash
npm run electron:dev
```

### Arranque automático con el .exe

1. Genera el portable (`npm run electron:build`)
2. Instala en Inicio:
   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts\instalar-inicio-automatico.ps1 -Modo electron
   ```

### Ventajas / desventajas

| Ventajas | Desventajas |
|----------|-------------|
| Un solo .exe, sensación de app nativa | Hay que recompilar tras cambios |
| No necesita Node en la caja | Tamaño ~150 MB aprox. |
| Icono propio en barra de tareas | Supabase URL queda fija al compilar |

---

## Configuración recomendada en caja

1. En **Configuración → Tienda**, **fija la sucursal** en esa PC  
   **o** en `.env` antes de compilar:
   ```
   VITE_SUCURSAL_FIJA=3B5
   ```
2. Escáner USB: conecta y escanea con el cursor en el campo de búsqueda (Ventas / Inventario)
3. Impresión: Chrome/Edge o Electron; configura en **Configuración → Impresión**

---

## ¿Cuál elegir?

| Situación | Recomendación |
|-----------|---------------|
| Pruebas rápidas, mismo PC de desarrollo | **Opción A** (`iniciar-pos.bat`) |
| Caja fija, quieres icono .exe | **Opción B** (Electron portable) |
| Actualizas el POS seguido | **Opción A** (solo `npm run build`) |
| Entregas a varias tiendas sin Node | **Opción B** |

---

## Solución de problemas

| Problema | Qué hacer |
|----------|-----------|
| Pantalla en blanco (Electron) | Verifica `.env` y vuelve a `npm run electron:build` |
| No abre Chrome | Instala Chrome o Edge; el script usa el que encuentre |
| Puerto 4173 ocupado | Cierra otros `node` en Administrador de tareas |
| Política de ejecución PowerShell | Usa `-ExecutionPolicy Bypass` como en los ejemplos |
