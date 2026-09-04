/** Contenido del manual del administrador — Ayuda → Manual administrador */
export const MANUAL_ADMIN_VERSION = '2.2 · POS CONTROL 3B';

export const MANUAL_ADMIN_SECCIONES = [
  {
    id: 'intro',
    title: '1. Rol del administrador',
    keywords: ['administrador', 'permisos', 'acceso total', 'gerente', 'supervisor', 'cajero', 'auditor'],
    body: `El **Administrador** es el único rol con **acceso total** al sistema. Solo tú puedes:

- Crear, editar y eliminar **usuarios** (empleados con PIN)
- Asignar **turnos** diurno/nocturno a cajeros (control anti-fraude)
- Dar de alta **proveedores** nuevos en catálogo
- Configurar **privilegios** por rol o por usuario (qué módulos ve cada quien)
- Acceder a **Configuración** completa: turnos, impresión, periféricos, tiendas, sonidos
- Gestionar **inventario multitienda** (todas las sucursales y almacén central MAIN)
- Ver y operar **todos los módulos** del menú lateral

**Gerente** opera la tienda y configura el sistema, pero **no** gestiona usuarios ni proveedores nuevos. Puede cambiar de tienda y usar el panel de inventario multitienda.

**Supervisor** opera ventas, productos, compras y reportes sin tocar usuarios ni configuración avanzada.

**Auditor** hace inventario, consultas y reportes **sin cobrar** en mostrador.

**Cajero** solo vende, hace corte de **su turno** y usa el checador.

**Repartidor** consulta precios en ruta (checador).`,
  },
  {
    id: 'puesta-marcha',
    title: '2. Puesta en marcha (primera vez)',
    keywords: ['supabase', 'instalacion', 'env', 'npm', 'sql', 'primera vez', 'check-tablas'],
    body: `### 2.1 Supabase (base de datos en la nube)

1. Crea un proyecto en [supabase.com](https://supabase.com)
2. En **SQL Editor**, ejecuta \`supabase/fix_supabase_todas_columnas.sql\` (copia todo → Run)
3. Ejecuta también \`supabase/fix_stock_ubicaciones.sql\` para inventario por tienda (CEDIS, piso, stock_sucursales)
4. Espera ~30 segundos antes de usar la app
5. Si hay errores de usuarios o turnos:
   - \`supabase/fix_usuarios_rol_check.sql\`
   - \`supabase/fix_turnos_seguridad.sql\`
   - \`supabase/fix_usuarios_sucursal.sql\`

### 2.2 Variables de entorno (.env o Netlify)

\`\`\`
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-clave-anon
\`\`\`

Opcional — fijar tienda en esta PC o despliegue:
\`\`\`
VITE_SUCURSAL_FIJA=3B5
\`\`\`

En Netlify también puedes usar \`public/pos3b-config.js\` para la URL y la clave sin recompilar.

### 2.3 Arrancar en la PC de la caja

\`\`\`
npm install
npm run dev
\`\`\`

Abre \`http://localhost:5173\`. Celular en la misma Wi‑Fi: \`http://IP-DE-LA-PC:5173\`

O usa **iniciar-pos.bat** / modo Electron (ver sección 16).

### 2.4 Verificar tablas

\`\`\`
node scripts/check-tablas.mjs
\`\`\`

Debe mostrar **11 OK**. Si alguna falla, ejecuta el SQL que indique el script.`,
  },
  {
    id: 'acceso-sucursales',
    title: '3. Acceso, PIN y sucursales',
    keywords: ['login', 'pin', 'tienda', 'sucursal', 'main', 'fusion', 'fijar tienda', 'bloqueo'],
    body: `### 3.1 Pantalla de login

- Cada empleado entra con su **PIN**
- El PIN es válido en la **sucursal** asignada al usuario en Usuarios
- Antes del login, selecciona la **tienda** correcta
- Opcional: **Fijar tienda en este equipo** para que la caja no cambie sucursal por error

### 3.2 Tiendas (sucursales)

Tiendas base: **MAIN** (central de administración), **CEDIS** (almacén), **FUSION**, **3B2**, **3B5**, **3B6**, **3B7**, **3B9**, **3B10**.

En el selector son dos entradas distintas:
- **Central de administración (MAIN)** — panel admin
- **CEDIS · almacén central** — inventario / traspasos

El administrador puede elegir cualquiera e ingresar con su PIN.

En **Configuración → Tienda y sucursales**:
- Agregar tiendas nuevas (código alfanumérico)
- Ver tienda activa
- Desbloquear tienda fijada en el navegador (cierra sesión)

### 3.3 Cambiar tienda como administrador

En el **header** (arriba a la derecha) verás un **selector de tienda** si eres Administrador o Gerente. Al cambiarlo:
- Ventas, inventario visible y cortes usan esa sucursal
- No necesitas cerrar sesión ni entrar módulo por módulo

### 3.4 MAIN = Almacén central

**MAIN** no es una tienda de venta: es la **central de administración**.
**CEDIS** es el **almacén central** (inventario). Ahí recibes mercancía y distribuyes a las tiendas con traspasos. Acceso: selector → **CEDIS · almacén central** → PIN de administrador (o personal de almacén).`,
  },
  {
    id: 'usuarios',
    title: '4. Usuarios y roles',
    keywords: ['usuarios', 'pin', 'empleado', 'alta', 'baja', 'rol', 'sucursal asignada', 'reingreso', 'recontratable', 'rh aba3b'],
    body: `Módulo: **Usuarios** (solo Administrador)

### 4.1 Alta de empleado

1. **Nombre** completo
2. **PIN** de acceso (único por sucursal)
3. **Sucursal** asignada
4. **Rol**: Cajero, Auditor, Repartidor, Supervisor, Gerente o Administrador
5. **Turno** (Diurno / Nocturno): obligatorio para cajeros que cobran

### 4.2 Tabla Equipo registrado

Edita PIN, rol, sucursal y turno en línea. Solo el administrador puede cambiar **turno** (evita fraude en caja).

### 4.3 Roles — resumen de acceso

| Rol | Acceso principal |
|-----|------------------|
| Cajero | Ventas, corte de su turno, checador |
| Repartidor | Checador |
| Auditor | Inventario, compras, consultas, reportes (sin ventas) |
| Supervisor | Operación sin usuarios ni config |
| Gerente | Operación + Configuración (sin usuarios) |
| Administrador | **Todo** |

### 4.4 Privilegios personalizados

En **Configuración → Privilegios por rol o usuario** puedes restringir o ampliar módulos del menú para un rol o un empleado en particular. Si no configuras nada, se usan los permisos por defecto del rol.

### 4.5 Errores al crear usuario

- \`usuarios_rol_check\` → \`fix_usuarios_rol_check.sql\`
- \`turno_horario\` → \`fix_turnos_seguridad.sql\`
- PIN duplicado en la misma sucursal → usa otro PIN

### 4.6 Baja de empleado (nómina, turnos, usuarios y RH ABA3B)

La baja se hace en **Usuarios → Dar de baja** o en **RH ABA3B → Perfil → Dar de baja**. En ambos casos:

1. Elige **motivo** y si **puede reingresar** (recontratable)
2. Confirma. El empleado **deja de aparecer** en:
   - **Nómina**
   - **Configuración → Empleados por turno**
   - **Usuarios** (salvo que marques *Ver dados de baja*)
3. El expediente queda en **RH ABA3B → Inactivos / bajas**
4. Ya no puede iniciar sesión con su PIN

**Reingreso (alta de nuevo):**

- Si es **recontratable**: en RH ABA3B o Usuarios usa **Reingresar alta / Reactivar**. Vuelve a nómina, turnos y Usuarios.
- Si **no es recontratable** (o ya no puede ser contratado): hace falta el **PIN del administrador principal** para volver a darlo de alta.`,
  },
  {
    id: 'turnos',
    title: '5. Turnos diurno y nocturno',
    keywords: ['turno', 'diurno', 'nocturno', '12 horas', 'horario', 'anti-fraude', 'corte'],
    body: `### 5.1 Concepto

- Turnos de **12 horas**: **Turno diurno** y **Turno nocturno**
- El cajero diurno **no entra** en horario nocturno y viceversa
- Cada venta queda con el turno activo
- El corte solo suma ventas de ese turno
- Un corte por **tienda + fecha + turno**

### 5.2 Configurar horarios

**Configuración → Turnos de caja**:
- Plantilla **12×12**: la **entrada del turno diurno** debe ser de mañana (p. ej. **07:00** u **08:00**), no 20:00
- Correcto: diurno 08:00–20:00 · nocturno 20:00–08:00
- Incorrecto (intercambiados): diurno 20:00–08:00 · nocturno 08:00–20:00 — la app lo detecta y ofrece **Corregir horarios ahora**
- Rotación 3 empleados (avanzado)
- Sincronizar empleados con el patrón

### 5.3 Asignar turno

**Usuarios → Turno** al crear/editar, o asignación masiva en Configuración.

### 5.4 Seguridad

- Solo **Administrador** cambia turnos de empleados
- La app revisa cada 60 s; si el turno del día cambia, cierra sesión al cajero que ya no debe estar`,
  },
  {
    id: 'inventario-multitienda',
    title: '6. Inventario multitienda y MAIN',
    keywords: ['inventario', 'multitienda', 'main', 'almacen central', 'cedis', 'piso', 'stock', 'traspaso', 'distribuir'],
    body: `### 6.1 Cómo está organizado el stock

Cada producto guarda inventario en \`stock_sucursales\` (JSON por tienda):

- **cedis**: almacén / bodega de la tienda
- **piso**: mostrador (lo que se vende en Ventas)

**MAIN** solo usa el CEDIS central (almacén de toda la cadena).

### 6.2 Panel Inventario multitienda

**Configuración** (arriba, Admin/Gerente) → **Inventario multitienda**:

1. **Tienda donde operar**: elige MAIN o cualquier sucursal
2. **Entradas, retiros y traspasos**: sin cambiar de módulo
3. **Stock en todas las tiendas**: tabla con CEDIS y piso de cada sucursal + almacén central

### 6.3 Entrada al almacén central

1. Configuración → Inventario multitienda
2. Tienda: **Almacén central (MAIN)**
3. Modo **Inventario libre** → **Entrada**
4. Escanea producto, cantidad, motivo → Aplicar

### 6.4 Distribuir a una tienda

1. Modo **Traspaso**
2. Tipo: **Almacén central → Tienda**
3. Elige tienda destino
4. Agrega productos y cantidades → Aplicar traspaso

### 6.5 Operar una tienda específica

- Cambia tienda en el **header**, o
- En el panel multitienda elige la tienda en el selector

Las **ventas** siempre descuentan del **piso** de la tienda activa. Las **compras** al recibir mercancía suman al **CEDIS** de esa tienda.

### 6.6 SQL obligatorio

Si ves error de columnas \`stock_cedis\` o \`stock_sucursales\`, ejecuta \`supabase/fix_stock_ubicaciones.sql\` en Supabase.`,
  },
  {
    id: 'productos',
    title: '7. Catálogo de productos',
    keywords: ['productos', 'catalogo', 'codigo barras', 'precio', 'departamento', 'importar', 'csv', 'etiquetas', 'negativos', 'privilegios'],
    body: `Módulo: **Productos** (menú ⋮ en la lista)

### 7.1 Campos importantes

- **Código / ID**: debe coincidir con el **código de barras** para escaneo
- **Nombre**, descripción, foto
- **Departamento** (categoría)
- **Precio compra**, ganancia %, **precio venta**, IVA
- **Stock** (piso de la tienda activa) y **stock mínimo**
- **En venta** / **Favoritos** (botones rápidos en Ventas)

### 7.2 Menú de operaciones (⋮)

Cada ítem se activa o quita en **Configuración → Privilegios → Productos — menú ⋮**:

- Nuevo producto, ajuste de inventario, traspasos, preinventario
- Mover productos, etiquetas, importar / exportar, fotos
- Vaciar inventario, administrador de precios, inventario vs ventas
- **Ver inventario negativo** (existencias teóricas en rojo). **Auditor** lo tiene por defecto; otros roles se marcan en privilegios
- Eliminar productos

### 7.3 Importar catálogo

Descarga plantilla CSV → llena en Excel → sube. Revisa duplicados antes de confirmar.

### 7.4 Proveedores en producto

Vincula SKU del proveedor. **Solo admin** crea proveedores nuevos.

### 7.5 Valor del inventario

Tarjeta superior e **Inicio** muestran valor a precio de venta de la **tienda activa**.`,
  },
  {
    id: 'ajuste-inventario',
    title: '8. Ajuste de inventario (detalle)',
    keywords: ['entrada', 'retiro', 'traspaso', 'conteo', 'departamento', 'folio', 'escaneo', 'masivo'],
    body: `**Productos → Ajuste de inventario** (o panel multitienda en Configuración)

### 8.1 Inventario libre

- **Entrada**: suma al CEDIS (en MAIN suma al almacén central)
- **Retiro**: resta del piso de venta (en MAIN resta del CEDIS central)
- Escaneo con lector USB (HID)
- Indica cantidad y motivo

### 8.2 Por departamento (conteo físico)

1. Elige departamento → **Iniciar conteo**
2. Por artículo: existencia, cantidad contada, diferencia
3. **Siguiente artículo** (Enter): vacío = cuadra con existencia
4. **Ver resumen** → **Aplicar ajuste** → folio **AJU-YYYYMMDD-####**
5. Imprime folio para auditoría

### 8.3 Entrada múltiple

Varios productos en una operación (recepción rápida).

### 8.4 Traspasos

| Tipo | Uso |
|------|-----|
| CEDIS → Piso | Surtir mostrador desde bodega de la tienda |
| Piso → CEDIS | Regresar sobrantes al almacén |
| Almacén central → Tienda | Distribuir desde MAIN |
| Tienda → Tienda | CEDIS origen → CEDIS destino |

### 8.5 Historial

Movimientos en localStorage del equipo. También **Consultas → Movimientos inventario**.`,
  },
  {
    id: 'ventas-corte',
    title: '9. Ventas y corte de caja',
    keywords: ['ventas', 'cobrar', 'carrito', 'efectivo', 'dolar', 'tipo cambio', 'corte', 'cancelacion'],
    body: `### 9.1 Ventas

- Escanea o busca → carrito → **Cobrar**
- Métodos de pago en Configuración (efectivo MXN/USD, tarjeta…)
- Tipo de cambio en **Configuración**
- Descuenta **piso** de la tienda activa
- Registra vendedor, turno y sucursal

### 9.2 Sonidos (opcional)

En Configuración puedes activar sonido al escanear en Ventas y al pasar el mouse en el menú.

### 9.3 Corte de caja

- Cajero cierra **solo su turno**
- Admin, gerente y supervisor pueden cortar cualquier turno
- Un corte por tienda + fecha + turno
- **Cancelaciones** devuelven stock al piso y restan del corte

### 9.4 Inicio — panel operativo

Ventas del día, ticket promedio, alertas de stock bajo. El cajero no ve valor total del inventario; admin/auditor sí.`,
  },
  {
    id: 'compras',
    title: '10. Compras y proveedores',
    keywords: ['compras', 'proveedor', 'pedido', 'recepcion', 'orden'],
    body: `### 10.1 Proveedores

Módulo **Proveedores**. **Solo administrador** da de alta proveedores nuevos (nombre, contacto, teléfono, email, RFC, dirección, tipo de compra, notas).

Si faltan columnas al guardar, ejecuta en Supabase: \`supabase/fix_proveedores_columnas.sql\`.

### 10.2 Flujo de compra

1. **Compras** → elige proveedor
2. **Generar pedido** (sugerencias por stock y ventas) — no mueve inventario
3. Al llegar mercancía: **Recibir** escaneando
4. **Confirmar recepción** → suma al **CEDIS** de la tienda activa

### 10.3 Impresión

Pedido y recepción desde el módulo si la impresión está activa en Configuración.`,
  },
  {
    id: 'consultas-reportes',
    title: '11. Consultas, estadísticas y reportes',
    keywords: ['consultas', 'reportes', 'estadisticas', 'csv', 'checador', 'precios'],
    body: `### 11.1 Consultas

- Ventas por fecha, producto, sucursal
- **Precios → Ventas vs inventario**: compara lo cobrado en cada ticket con el precio actual del catálogo (útil si la caja cobró $0 o un precio distinto)
- Movimientos de inventario
- Cortes históricos
- Filtro por tienda cuando hay varias sucursales

### 11.2 Estadísticas y Reportes

Gráficas, descarga CSV de inventario, listados imprimibles.

En **Reportes → Reporte de inventario**, el **campo 2 (faltante)** se divide entre **3** y se descuenta en **Nómina** a cada empleado de esa tienda (la tercera parte corresponde al cubre turnos). Hay que **guardar** el resultado en el reporte para que la nómina de esa semana lo tome.

### 11.3 Checador

- **Precios**: escanea → precio y stock (cliente en piso)
- **Reloj**: entrada/salida con PIN
- **Plan horario**: calendario semanal de todas las tiendas (admin, o privilegio en Configuración). Arrastra bloques, cambia color, marca descansos y asígnalos a un **CT** (cubre turnos). Los nombres salen de **Usuarios**. Requiere \`supabase/fix_plan_horario.sql\` para sincronizar entre cajas.`,
  },
  {
    id: 'configuracion',
    title: '12. Configuración del sistema',
    keywords: ['configuracion', 'logo', 'ticket', 'impresora', 'escaner', 'metodos pago', 'sonidos', 'privilegios'],
    body: `Módulo: **Configuración**

### 12.1 Marca y tickets

Nombre del negocio, logo, pie de ticket.

### 12.2 Operación

- **Tipo de cambio** (USD → MXN)
- **Tienda activa** / agregar sucursales
- **Sonidos** del menú y del escaneo en Ventas

### 12.3 Privilegios (solo admin)

Personaliza módulos visibles por **rol** o por **usuario**.

En **Productos — menú ⋮** configuras cada opción del menú de tres puntos (ajuste, traspasos, negativos, precios, etc.). El **Auditor** ve inventario negativo por defecto.

En **Checador — Plan horario** otorgas el calendario semanal de turnos/descansos/CT a roles que no sean administrador.

### 12.4 Métodos de pago

Activa/desactiva efectivo, tarjeta, transferencia, etc.

### 12.5 Impresión

- Ancho de papel (58 mm, 80 mm, carta)
- Documentos automáticos (venta, corte, inventario, compras)
- Impresión de prueba

### 12.6 Periféricos

- Escáner HID USB (como teclado)
- Impresora térmica Web Serial / Web USB (Chrome, Edge)
- Terminal de pago (registro manual)

### 12.7 Turnos de caja

Plantillas 12×12, rotación, asignación masiva — ver sección 5.`,
  },
  {
    id: 'supabase-mantenimiento',
    title: '13. Mantenimiento Supabase (SQL)',
    keywords: ['sql', 'supabase', 'migracion', 'columnas', 'error base datos'],
    body: `Scripts en \`supabase/\`:

| Archivo | Cuándo usarlo |
|---------|----------------|
| \`fix_supabase_todas_columnas.sql\` | **Principal** — columnas faltantes |
| \`fix_stock_ubicaciones.sql\` | Inventario CEDIS, piso, multitienda |
| \`fix_turnos_seguridad.sql\` | Turnos y ventas por turno |
| \`fix_usuarios_rol_check.sql\` | Roles Auditor, Gerente, etc. |
| \`fix_usuarios_sucursal.sql\` | sucursal_id en usuarios |
| \`fix_cancelaciones.sql\` | Cancelaciones en corte |
| \`fix_proyeccion_faltante.sql\` | Remociones de carrito + consultas de precio (proyección faltante) |
| \`fix_plan_horario.sql\` | Plan horario del Checador (turnos, descansos y CT) |
| \`fix_movimientos_inventario.sql\` | Bitácora de movimientos de inventario (Consultas) |
| \`migracion_completa.sql\` | Instalación desde cero |

**Procedimiento:** SQL Editor → pegar script → Run → esperar 30 s → Ctrl+F5.

**Verificación:** \`node scripts/check-tablas.mjs\``,
  },
  {
    id: 'problemas',
    title: '14. Solución de problemas',
    keywords: ['error', 'no funciona', 'pin', 'turno', 'escaner', 'wifi', 'columnas'],
    body: `| Problema | Solución |
|----------|----------|
| No puedo crear usuarios | \`fix_usuarios_rol_check.sql\` + \`fix_turnos_seguridad.sql\` |
| Error columnas productos / stock | \`fix_supabase_todas_columnas.sql\` + \`fix_stock_ubicaciones.sql\` |
| Cajero no entra — turno incorrecto | Usuarios → Turno; Configuración → horarios |
| PIN no funciona | Sucursal en login = sucursal del usuario |
| Escáner no responde | Cursor en campo búsqueda; lector HID |
| Celular no abre la app | Misma Wi‑Fi o URL Netlify |
| Inventario no cuadra | Conteo por departamento + folio AJU |
| Ventas en tienda equivocada | Fijar tienda o \`VITE_SUCURSAL_FIJA\` |
| No veo inventario multitienda | Rol Admin/Gerente; ejecutar SQL stock |

Conserva folios **AJU-…**, capturas de error y salida de \`check-tablas.mjs\`.`,
  },
  {
    id: 'escritorio',
    title: '15. Modo escritorio Windows',
    keywords: ['electron', 'windows', 'bat', 'inicio automatico', 'exe'],
    body: `### Opción A — Navegador

- **iniciar-pos.bat** en la carpeta del proyecto
- Inicio con Windows: \`scripts/instalar-inicio-automatico.ps1 -Modo navegador\`

### Opción B — Electron (.exe)

- \`npm run electron:build\` → \`release/POS-3B-1.0.0-portable.exe\`
- **iniciar-pos-electron.bat**
- Inicio automático: \`scripts/instalar-inicio-automatico.ps1 -Modo electron\`

Recomendación: prueba primero el navegador; luego genera el .exe para la caja.`,
  },
  {
    id: 'netlify',
    title: '16. Publicar en Netlify (acceso remoto)',
    keywords: ['netlify', 'github', 'deploy', 'remoto', 'celular', 'internet'],
    body: `Para acceder desde **otra red** (casa, celular con datos):

1. Código en GitHub (sin \`.env\` con secretos en el repo público)
2. [app.netlify.com](https://app.netlify.com) → sitio conectado al repo
3. Variables: \`VITE_SUPABASE_URL\`, \`VITE_SUPABASE_ANON_KEY\`
4. O configura \`public/pos3b-config.js\` en el deploy
5. Entra con PIN de Administrador y la sucursal correcta

La PC de caja puede seguir en local; ambos usan el mismo Supabase.`,
  },
  {
    id: 'rutina-diaria',
    title: '17. Rutina diaria recomendada (admin)',
    keywords: ['rutina', 'dia', 'checklist', 'apertura', 'cierre'],
    body: `### Apertura

- Verificar **turno activo** y cajeros asignados
- Revisar **tipo de cambio** y métodos de pago
- Confirmar **tienda** correcta en header o caja fijada
- Revisar alertas de **stock bajo** en Inicio

### Durante el día

- Recibir mercancía: Compras o entrada masiva / MAIN
- Surtir piso: traspaso CEDIS → Piso
- Distribuir desde central: MAIN → Tienda

### Cierre

- Cada turno hace su **corte**
- Revisar cancelaciones y diferencias
- Conteo por departamento si hay faltantes
- Consultas → ventas del día por sucursal

### Semanal

- Exportar inventario CSV (Reportes)
- Revisar usuarios activos y PINs
- Backup: exportar catálogo desde Productos`,
  },
  {
    id: 'rt-gastos-recolecciones',
    title: '18. Contabilidad RT: gastos y liberar efectivo',
    keywords: [
      'rt',
      'francisco',
      'andres',
      'fjbb',
      'amr',
      'gasto',
      'recoleccion',
      'liberar',
      'liquidacion',
      'transito',
      'panel rt',
    ],
    body: `Manual detallado también en \`docs/MANUAL_RT_GASTOS_RECOLECCIONES.md\`.

### Cuentas RT

- **Francisco** ↔ origen de gasto **Cuenta FJBB**
- **Andrés** ↔ origen de gasto **Cuenta AMR**

Saldo disponible = liquidaciones + transferencias recibidas − transferencias enviadas − gastos registrados **desde la cuenta RT**.

### Ciclo del gasto del recolector

1. Contabilidad → Panel RT → **Gastos**: autorizar monto, descripción y **origen** (Cuenta FJBB / Cuenta AMR o tienda).
2. Recolector acepta con PIN en Recolecciones → Gastos.
3. El gasto **no baja** al hacer pickup en tienda.
4. Al **liberar** o liquidar en oficina se descuenta del neto y se sella (\`LIQ_APLICADA\`). Ya no vuelve a restar.

### Neto en tránsito (Cuentas RT)

Solo restan **gastos activos** (después de la última liquidación, sin sello). Gastos viejos no deben generar neto negativo “fantasma”.

### Liberar

Panel RT → Gastos / liberar → elegir recolector y cuentas RT para mercancía y servicios → **Liberar neto**.`,
  },
  {
    id: 'cortes-recolecciones-alertas',
    title: '19. Cortes, recolecciones, alertas y pagaré',
    keywords: [
      'corte',
      'virtual',
      'recoleccion',
      'recolectar',
      'caja chica',
      'gastos',
      'bonos',
      'alerta',
      'pagare',
      'dinero en recuperacion',
      'abono',
      'liquidar',
      'cerrar corte',
    ],
    body: `Instructivo completo en \`docs/INSTRUCTIVO_CORTES_RECOLECCIONES_ALERTAS.md\`.

### Regla de oro (para que cuadre)

1. Meter **todos** los gastos del periodo, **incluyendo bonos** pagados de caja.
2. **Cerrar el corte**.
3. **Recolectar** para dejar la **caja chica actual en $0.00**.

Los gastos del periodo se envían a IE **al recolectar**, no al cerrar turno. Si falta un gasto o bono, la caja no cuadra.

### Alerta DINERO EN RECUPERACIÓN

Aparece con deuda (pagaré / préstamo de área) o caja en negativo. Muestra **Negativo** restante y **Recuperado** por venta.

| Acción | Quién |
|---|---|
| **Pagaré** (ticket ×2) | Admin / Gerente / Recolector |
| **Abono** / **Liquidar** | Cajero / Admin / Gerente (nunca cubre turno) |

Si la venta ya cubrió el negativo, la alerta **permanece** hasta que el cajero liquide o abone.

### Checklist recolector

- Tienda y área correctas
- Todos los gastos capturados (incl. bonos)
- Alerta atendida (pagaré / liquidar si aplica)
- Cerrar corte → Recolección → **Recolectar**
- Confirmar: caja chica en $0.00`,
  },
];
