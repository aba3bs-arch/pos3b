/** Contenido del manual del administrador — usado en Ayuda y docs/MANUAL_ADMINISTRADOR.md */
export const MANUAL_ADMIN_VERSION = '1.0 · POS CONTROL 3B';

export const MANUAL_ADMIN_SECCIONES = [
  {
    id: 'intro',
    title: '1. Rol del administrador',
    body: `El **Administrador** es el único rol con acceso total al sistema. Solo tú puedes:

- Crear, editar y eliminar **usuarios** (empleados con PIN)
- Asignar **turnos** diurno/nocturno a cajeros (anti-fraude)
- Dar de alta **proveedores** nuevos
- Acceder a **Configuración** completa (turnos, impresión, periféricos, tiendas)
- Ver y operar **todos los módulos** del menú lateral

**Gerente** y **Supervisor** operan la tienda pero no gestionan usuarios. **Auditor** hace inventario y reportes sin cobrar. **Cajero** solo vende y hace corte de su turno.`,
  },
  {
    id: 'puesta-marcha',
    title: '2. Puesta en marcha (primera vez)',
    body: `### 2.1 Supabase (base de datos en la nube)

1. Crea un proyecto en [supabase.com](https://supabase.com)
2. En **SQL Editor**, ejecuta el archivo \`supabase/fix_supabase_todas_columnas.sql\` (copia todo el contenido → Run)
3. Espera ~30 segundos antes de usar la app
4. Si hay errores de usuarios o turnos, ejecuta también:
   - \`supabase/fix_usuarios_rol_check.sql\`
   - \`supabase/fix_turnos_seguridad.sql\`

### 2.2 Archivo .env en la PC del servidor

\`\`\`
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-clave-anon
\`\`\`

Opcional — fijar tienda en esta PC:
\`\`\`
VITE_SUCURSAL_FIJA=3B5
\`\`\`

### 2.3 Arrancar la aplicación

\`\`\`
npm install
npm run dev
\`\`\`

Abre \`http://localhost:5173\`. Para celular en la misma Wi‑Fi: \`http://IP-DE-LA-PC:5173\`

### 2.4 Verificar tablas

En la carpeta del proyecto:
\`\`\`
node scripts/check-tablas.mjs
\`\`\`
Debe mostrar **11 OK**. Si alguna falla, ejecuta el SQL indicado.`,
  },
  {
    id: 'acceso-sucursales',
    title: '3. Acceso, PIN y sucursales',
    body: `### 3.1 Pantalla de login

- Cada empleado entra con su **PIN** (6 dígitos recomendados)
- El PIN es válido solo en la **sucursal** asignada al usuario
- Antes del login, selecciona la **tienda** correcta en la pantalla de acceso

### 3.2 Tiendas (sucursales)

Tiendas base: **MAIN** (pruebas), **FUSION**, **3B2**, **3B5**, **3B6**, **3B7**, **3B9**, **3B10**.

En **Configuración → Tienda y sucursales** puedes:
- Agregar tiendas nuevas
- **Fijar tienda en este equipo** — la caja solo registrará ventas de esa sucursal (recomendado en cada PC de tienda)
- Desbloquear tienda (solo admin) si necesitas cambiar temporalmente

### 3.3 Bloqueo por .env

Si defines \`VITE_SUCURSAL_FIJA=3B5\` en \`.env\`, la tienda queda bloqueada desde el despliegue. Útil para evitar ventas en sucursal equivocada.`,
  },
  {
    id: 'usuarios',
    title: '4. Usuarios y roles',
    body: `Módulo: **Usuarios** (solo visible para Administrador)

### 4.1 Alta de empleado

1. Nombre completo
2. **PIN** de acceso (único por sucursal)
3. **Sucursal** asignada
4. **Rol**: Cajero, Auditor, Repartidor, Supervisor, Gerente o Administrador
5. **Turno** (Diurno / Nocturno / Sin turno): obligatorio para cajeros que cobran y hacen corte

### 4.2 Roles — qué puede hacer cada uno

| Rol | Acceso principal |
|-----|------------------|
| Cajero | Ventas, corte de su turno, checador |
| Repartidor | Checador, consulta en ruta |
| Auditor | Inventario, compras, consultas, reportes (sin ventas) |
| Supervisor | Operación completa sin usuarios ni config |
| Gerente | Operación + Configuración (sin usuarios) |
| Administrador | **Todo** |

### 4.3 Cambiar PIN, rol, sucursal o turno

En la tabla **Equipo registrado** edita directamente. Solo el administrador puede cambiar **turno** (evita que cajeros se cambien para mezclar feria).

### 4.4 Error al crear usuario

- \`usuarios_rol_check\` → ejecuta \`fix_usuarios_rol_check.sql\`
- \`turno_horario\` → ejecuta \`fix_turnos_seguridad.sql\`
- PIN duplicado → usa otro PIN en esa sucursal`,
  },
  {
    id: 'turnos',
    title: '5. Turnos diurno y nocturno',
    body: `### 5.1 Concepto

- Turnos de **12 horas**: Diurno (día) y Nocturno (noche)
- El cajero **diurno no entra** en horario nocturno y viceversa
- Cada **venta** queda ligada al turno activo
- El **corte de caja** solo suma ventas del turno correspondiente
- Un corte por **tienda + fecha + turno**

### 5.2 Configurar horarios

**Configuración → Turnos de caja**:
- Plantilla **12×12** (recomendada): define hora inicio/fin de Diurno y Nocturno
- Plantilla personalizada o rotación 3 empleados (avanzado)

### 5.3 Asignar turno a empleados

**Usuarios → Turno** en alta/edición, o **Configuración → Turnos** para asignación masiva.

### 5.4 Anti-fraude

- Solo **Administrador** cambia turnos
- Si un cajero intenta entrar fuera de su turno, el sistema lo rechaza
- La app revisa cada 60 segundos; si cambia el turno del día, cierra sesión automáticamente`,
  },
  {
    id: 'productos',
    title: '6. Catálogo de productos',
    body: `Módulo: **Productos → Catálogo**

### 6.1 Campos importantes

- **Código / ID**: debe coincidir con el **código de barras** para escaneo
- **Nombre**, descripción, foto
- **Departamento** (categoría): GENERAL, Abarrotes, Bebidas, etc.
- **Precio compra** sin/con IVA, **ganancia %**, **precio venta**
- **Stock** y **stock mínimo**
- **En venta** / **Favoritos** (botones rápidos en Ventas)

### 6.2 Importar catálogo

Descarga la **plantilla CSV**, llena en Excel y sube. Columnas: codigo, nombre, precio, stock, categoria, etc.

### 6.3 Proveedores en producto

Vincula SKU del proveedor al producto. **Solo admin** crea proveedores nuevos (+ Nuevo proveedor).

### 6.4 Valor del inventario

La tarjeta superior muestra el **total del inventario en tienda a precio de venta**, más costo de compra y margen. También visible en **Inicio**.

### 6.5 Error al guardar producto

Si aparece error de columnas o \`costo\`: ejecuta \`fix_supabase_todas_columnas.sql\` y recarga con Ctrl+F5.`,
  },
  {
    id: 'inventario',
    title: '7. Ajuste de inventario',
    body: `Módulo: **Productos → Ajuste de inventario**

### 7.1 Inventario libre

- Entrada, retiro o traspaso de un producto
- **Escaneo** de código de barras (lector USB HID)
- Indica cantidad y motivo → Aplicar movimiento

### 7.2 Por departamento (conteo físico)

1. Elige departamento → **Iniciar conteo**
2. Por cada artículo: existencia, cantidad contada, diferencia (faltante/sobrante)
3. **Siguiente artículo** (Enter): si dejas vacío, asume que cuadra con existencia
4. **Ver resumen**: piezas y valor en pesos de faltantes/sobrantes
5. **Aplicar ajuste** → genera **folio** (ej. AJU-20260621-0001)
6. Imprime el folio para auditoría

### 7.3 Entrada múltiple

Varios productos en una sola operación (recepción, conteo rápido).

### 7.4 Historial

Los movimientos se guardan en el equipo (localStorage). Consulta también en **Consultas → Movimientos inventario**.`,
  },
  {
    id: 'ventas-corte',
    title: '8. Ventas y corte de caja',
    body: `### 8.1 Ventas

- Escanea o busca producto → agrega al carrito → **Cobrar**
- Métodos de pago configurables (efectivo MXN/USD, tarjeta, etc.)
- Tipo de cambio en **Configuración**
- Al cobrar se descuenta stock y se registra turno + cajero

### 8.2 Corte de caja

- Al terminar turno, el cajero hace **Corte de caja**
- Solo cierra **su turno** (diurno o nocturno)
- Admin, gerente y supervisor pueden cortar cualquier turno
- **Cancelaciones**: devuelven producto al inventario y restan del corte

### 8.3 Inicio — panel operativo

Valor de inventario, ventas del día, ticket promedio, alertas de stock bajo (< 5 unidades).`,
  },
  {
    id: 'compras',
    title: '9. Compras y proveedores',
    body: `### 9.1 Proveedores (solo admin crea nuevos)

Módulo **Proveedores**: alta, edición, vínculo producto ↔ proveedor.

### 9.2 Flujo de compra

1. **Compras** → elige proveedor
2. **Generar pedido** (sugerencias por stock bajo y ventas) — no mueve inventario
3. Al llegar mercancía: **Recibir** escaneando códigos
4. **Confirmar recepción** → suma stock automáticamente

### 9.3 Impresión

Pedido y recepción se pueden imprimir desde el módulo (Configuración → Impresión).`,
  },
  {
    id: 'consultas-reportes',
    title: '10. Consultas, estadísticas y reportes',
    body: `### 10.1 Consultas

- Ventas por fecha, producto, sucursal
- Movimientos de inventario
- Cortes de caja históricos

### 10.2 Estadísticas

Gráficas y resúmenes de ventas.

### 10.3 Reportes

- Descargar inventario en **CSV**
- Imprimir listado de stock
- Reportes operativos

### 10.4 Checador

- **Precios**: escanea código → muestra precio y stock al cliente
- **Reloj**: entrada/salida de empleados con PIN`,
  },
  {
    id: 'configuracion',
    title: '11. Configuración del sistema',
    body: `Módulo: **Configuración** (admin y gerente; usuarios solo admin)

### 11.1 Marca y tickets

- Nombre del negocio, logo, pie de ticket

### 11.2 Tipo de cambio

Para cobros en USD en mostrador.

### 11.3 Métodos de pago

Activa/desactiva efectivo, tarjeta, transferencia, etc.

### 11.4 Impresión

- Ancho de papel (58mm, 80mm, carta)
- Qué documentos imprimir (venta, corte, inventario, compras…)
- **Impresión de prueba**

### 11.5 Periféricos

- **Escáner HID** (USB): funciona como teclado; registra en Configuración
- Impresora térmica serial/USB (Web Serial / Web USB en Chrome/Edge)
- Terminal de pago (registro manual)

### 11.6 Turnos de caja

Ver sección 5 de este manual.`,
  },
  {
    id: 'supabase-mantenimiento',
    title: '12. Mantenimiento Supabase (SQL)',
    body: `Scripts en la carpeta \`supabase/\` del proyecto:

| Archivo | Cuándo usarlo |
|---------|----------------|
| \`fix_supabase_todas_columnas.sql\` | **Principal** — columnas faltantes, productos, ventas, usuarios |
| \`fix_turnos_seguridad.sql\` | Turnos, ventas por turno, logins |
| \`fix_usuarios_rol_check.sql\` | No deja crear roles Auditor, Gerente, etc. |
| \`fix_usuarios_sucursal.sql\` | Columna sucursal_id en usuarios |
| \`migracion_completa.sql\` | Instalación desde cero |
| \`seed_usuarios_sucursales.sql\` | Usuarios de prueba |

**Procedimiento:** Supabase → SQL Editor → pegar script completo → Run → esperar 30 s → Ctrl+F5 en la app.

**Verificación local:** \`node scripts/check-tablas.mjs\``,
  },
  {
    id: 'escritorio',
    title: '14. Modo escritorio Windows',
    body: `Puedes usar el POS como app de caja de **dos formas** (detalle en \`docs/ESCRITORIO_WINDOWS.md\`):

### Opción A — Navegador (rápida)
- Doble clic en **iniciar-pos.bat** en la carpeta del proyecto
- Arranque con Windows: \`scripts/instalar-inicio-automatico.ps1 -Modo navegador\`

### Opción B — Electron (.exe)
- Generar: \`npm run electron:build\` → \`release/POS-3B-1.0.0-portable.exe\`
- Doble clic en **iniciar-pos-electron.bat** o el .exe directamente
- Arranque con Windows: \`scripts/instalar-inicio-automatico.ps1 -Modo electron\`

**Recomendación:** prueba primero Opción A; si te convence, genera el .exe para la caja.`,
  },
  {
    id: 'netlify',
    title: '15. Publicar en Netlify (acceso remoto)',
    body: `Para ver la caja desde **otra red** (celular, casa), publica la app en Netlify. Guia completa: \`docs/NETLIFY.md\`

### Resumen
1. Sube el proyecto a GitHub (sin el archivo \`.env\`) o compila y arrastra la carpeta \`dist\`
2. [app.netlify.com](https://app.netlify.com) → nuevo sitio
3. Variables de entorno (obligatorias):
   - \`VITE_SUPABASE_URL\`
   - \`VITE_SUPABASE_ANON_KEY\`
4. Deploy → abre la URL (ej. \`https://pos-3b.netlify.app\`)
5. Entra con PIN de Administrador o Auditor y la sucursal de la caja

La PC de la caja puede seguir con \`iniciar-pos.bat\`; remoto y caja usan el mismo Supabase.`,
  },
  {
    id: 'problemas',
    title: '13. Solución de problemas',
    body: `| Problema | Solución |
|----------|----------|
| No puedo crear usuarios | Ejecuta \`fix_usuarios_rol_check.sql\` y \`fix_turnos_seguridad.sql\` |
| Error columnas productos / costo | \`fix_supabase_todas_columnas.sql\` + Ctrl+F5 |
| Cajero no entra — turno incorrecto | Revisa turno en Usuarios; horarios en Configuración |
| PIN no funciona | Verifica sucursal en login y sucursal del usuario |
| Escáner no funciona | Cursor en campo de búsqueda; lector HID USB |
| App en celular no abre | Misma Wi‑Fi, \`npm run dev\` con host activo, firewall |
| Inventario no cuadra | Conteo por departamento + folio; revisa movimientos en Consultas |
| Ventas en sucursal equivocada | Fija tienda en Configuración o \`VITE_SUCURSAL_FIJA\` |

**Soporte técnico:** conserva folios de ajuste (AJU-…), capturas de error y resultado de \`check-tablas.mjs\`.`,
  },
];
