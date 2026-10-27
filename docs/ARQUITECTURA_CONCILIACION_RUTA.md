# Arquitectura: Conciliación de Venta en Ruta (control de fugas por alertas)

**Estado:** propuesta de diseño (sin código de aplicación todavía)
**Objetivo:** que cada venta de ruta quede comprobada contra inventario, efectivo, crédito y gasto de Abarrotes, y que cualquier diferencia genere una **alerta persistente** con responsable y seguimiento.

---

## 1. Principio

> Nadie captura nada nuevo. El submódulo **solo compara** lo que el flujo automático ya escribe, y levanta una alerta cuando un eslabón no existe o no cuadra.

Cada venta de ruta a una sucursal propia debe dejar esta cadena completa:

```
Camión (inventario) ──► Venta VR-xxx ──┬─ Efectivo ──► RC / transito_efectivo ──► Liquidación
                                       │            └► Pedido en Compras ──► Recepción ──► Gasto PROVEEDORES (Abarrotes)
                                       └─ Crédito  ──► ruta_cxc_movimientos (cargo)
                                                    └► Cobro con PIN ──► abono + gasto CRÉDITO (Abarrotes) + efectivo a tránsito
```

Una alerta es "un eslabón de esta cadena que falta, sobra o tiene otro monto".

---

## 2. Lo que ya existe y se reutiliza

| Pieza | Archivo | Qué aporta |
|---|---|---|
| Motor de cruce | `src/lib/consolidacionRuta.js` (`consolidarRuta`) | Función pura: recibe filas y devuelve por venta efectivo/crédito/gasto/inventario con `alertas[]`. Ya está probada (`consolidacionRuta.test.mjs`). |
| Pantalla | `src/modules/ConsolidacionRuta.jsx` | Consulta manual por día/semana/rango, por repartidor, CSV. |
| Subcomando | `ruta_consolidacion` en `ventaEnRutaAcciones.js` | Privilegio ya asignado (Admin, Gerente, Auditor). |
| Folios | `foliosPago.js` (`familiaFoliosPago`) | Une folio de operación, efectivo y crédito de una misma venta. |
| Gastos de recepción | `compraGastoCorte.js` | Genera el gasto PROVEEDORES al recibir el pedido. |
| Notificaciones | `contabilidadNotificaciones.js` + Edge Function `enviar-push` | Buzón y push a Admin/Gerente. |
| Incidencias | `pos_incidencias` | Seguimiento de casos con estado y resolución. |

**Decisión:** no se reescribe el motor. El submódulo nuevo es una capa de **persistencia, ciclo de vida y avisos** encima de `consolidarRuta`, más los controles que hoy faltan (sección 4).

### Límites de la consolidación actual (lo que no cubre)

1. **Es solo consulta manual.** Si nadie la abre, nadie se entera. No guarda nada.
2. **Sin ciclo de vida:** una diferencia no se puede marcar como revisada, justificada o resuelta.
3. **Sin ventana de gracia:** "Recepción pendiente" aparece desde el minuto cero, aunque la venta sea de hace 5 minutos.
4. **Auditoría física del camión solo en el dispositivo** (`listarAuditoriasCamionLocal`, localStorage). No es evidencia central.
5. **Consultas sin cota:** `compras` se filtra solo por `notas ilike '%Venta en ruta%'` (todo el historial) y `gastos`/`movimientos` solo tienen límite inferior de fecha.
6. **Sin conciliación diaria agregada por tienda** (todas las ventas del día contra todos los gastos del corte).
7. **Sin severidad:** una diferencia de $0.50 y una venta sin gasto pesan igual.

---

## 3. Modelo de datos (nuevo, mínimo)

Un solo SQL nuevo: `supabase/fix_ruta_conciliacion.sql` (idempotente, mismo estilo que los demás).

### 3.1 `ruta_conciliacion_alertas`

| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `clave` | text **unique** | Huella estable: `codigoControl|venta_id|detalle`. Evita duplicar la alerta en cada corrida. |
| `control` | text | Código del control (C1…C12, sección 4). |
| `severidad` | text | `critica` · `alta` · `media` · `baja`. |
| `estado` | text | `abierta` · `en_revision` · `justificada` · `resuelta` · `auto_resuelta`. |
| `sucursal_id` | text | Normalizado con `normalizarCodigoTienda` (FUSION, 3B7…). |
| `repartidor_id` / `repartidor_nombre` | text | Para agrupar por responsable. |
| `venta_id`, `venta_folio`, `carga_id`, `compra_id` | text | Enlaces de trazabilidad. |
| `esperado`, `registrado`, `diferencia` | numeric(12,2) | Importes (o piezas, según `unidad`). |
| `unidad` | text | `MXN` o `pzas`. |
| `detalle` | jsonb | Evidencia: filas que se compararon (folios de gasto, ids de tránsito, productos). |
| `primera_vez_at`, `ultima_vez_at` | timestamptz | Cuándo se vio por primera y última vez. |
| `resuelta_at`, `resuelta_por`, `nota_resolucion` | | Cierre manual. |
| `notificada_at` | timestamptz | Para no repetir push. |

Índices: `(estado, severidad, ultima_vez_at desc)`, `(sucursal_id, estado)`, `(venta_id)`. RLS con el mismo modelo abierto que el resto de tablas de ruta.

### 3.2 `ruta_conciliacion_corridas` (bitácora)

Una fila por ejecución: `id`, `tipo` (`manual` · `evento` · `barrido`), `desde`, `hasta`, `ventas_revisadas`, `alertas_nuevas`, `alertas_resueltas`, `duracion_ms`, `ejecutada_por`, `created_at`. Sirve para demostrar que el control corre y cuándo fue la última vez.

### 3.3 `ruta_conciliacion_cierres` (sello diario, fase 3)

Foto firmada de un día por tienda: totales de venta, efectivo, crédito, gasto y diferencia, con quien lo revisó. Reutiliza la idea de `sellarConciliacion` de `conciliacionesAbarrotes.js`.

---

## 4. Catálogo de controles

Cada control es una función pura `(datos) → alertas[]` en `src/lib/rutaConciliacion/controles/`. Los marcados **(existente)** ya salen de `consolidarRuta`; solo se mapean a un código y severidad.

### Efectivo

| # | Control | Regla | Severidad |
|---|---|---|---|
| C1 | Efectivo vendido vs tránsito | `efectivo de la venta` = `Σ transito_efectivo (Venta Ruta)` por folio. **(existente)** | alta |
| C2 | Efectivo vendido vs gasto de Abarrotes | `efectivo de la venta` = `Σ gasto PROVEEDORES` con el folio, en la sucursal destino. **(existente)** | **crítica** |
| C3 | Efectivo en tránsito vencido | Registro `En Tránsito` más de N horas sin liquidar. **(nuevo)** | alta |
| C4 | Duplicados de efectivo/gasto | Más de un tránsito o gasto para la misma venta. **(existente)** | media |

### Crédito

| # | Control | Regla | Severidad |
|---|---|---|---|
| C5 | Crédito vendido vs cargos | `crédito de la venta` = `saldo pendiente + abonos` en `ruta_cxc_movimientos`. **(existente)** | **crítica** |
| C6 | Cobro de crédito vs gasto CRÉDITO | `Σ abonos` = `Σ gasto categoría CRÉDITO` ligado por `gasto_id` o folio. **(existente)** | **crítica** |
| C7 | Cobro de crédito vs tránsito | `Σ abonos` = `Σ transito_efectivo (Cobro Crédito)`. **(existente)** | alta |
| C8 | Crédito vencido sin cobrar | Cargo pendiente con más de N días. **(nuevo, informativo)** | baja → media |

### Inventario

| # | Control | Regla | Severidad |
|---|---|---|---|
| C9 | Mercancía vendida vs ingresada | Por producto: `Σ vendido` = `Σ movimientos_inventario entrada` de la sucursal ligados al pedido. **(existente)** | alta |
| C10 | Recepción pendiente / sin pedido | Venta a sucursal propia sin pedido en Compras, o pedido sin recibir pasada la ventana de gracia. **(existente, falta ventana)** | media → alta con la edad |
| C11 | Conservación del camión | Por carga y producto: `cargada − vendida − devuelta ≥ 0` y saldo teórico = último conteo físico. Saldo negativo = inconsistencia. **(parcial)** | alta |
| C12 | Conteo físico vs teórico | Faltante de la auditoría física valuado a costo. Requiere guardar auditorías en la nube (sección 7, fase 2). **(nuevo)** | alta / crítica por monto |

### Estructurales

| # | Control | Regla | Severidad |
|---|---|---|---|
| C13 | Desglose de pago inválido | Efectivo + crédito ≠ total de la venta, o mixto sin desglose. **(existente)** | alta |
| C14 | Gasto manual sobre mercancía de ruta | Gasto OTROS/operativo cuyo monto coincide con un pedido de ruta pendiente (ya existe `validarGastoManualSinFuga`; aquí se audita lo que ya pasó). **(nuevo)** | **crítica** |
| C15 | Arqueo de caja del repartidor | `efectivo_contado − efectivo_esperado` en `ruta_cortes_caja`. **(existente, sin alerta)** | alta |

**Tolerancia:** diferencias de ≤ $0.01 se ignoran (ya es la regla del motor). Una constante `TOLERANCIA_MXN` única, no por control.

**Ventanas de gracia** (configurables en un solo objeto, valores iniciales sugeridos):

| Concepto | Ventana |
|---|---|
| Recepción de pedido | 24 h desde la venta |
| Efectivo en tránsito | 48 h |
| Crédito sin cobrar | 15 días |
| Cierre de carga sin liquidar | 24 h |

Antes de cumplirse la ventana el hallazgo se muestra como "en proceso" (gris), no como alerta.

---

## 5. Flujo de ejecución

```
              ┌────────────── cargarDatosConciliacion (acotado a fechas) ──────────────┐
 disparador → │ ventas · cargas · compras · movimientos · gastos · cxc · tránsito ·    │ → consolidarRuta()
              │ cortes de caja · líneas de carga                                       │       │
              └────────────────────────────────────────────────────────────────────────┘       ▼
                                                                            controles C1…C15 → hallazgos[]
                                                                                                 │
                                    upsert por `clave` ◄─────────────────────────────────────────┘
                                         │
        nueva → INSERT abierta + notificación       ya existía → UPDATE ultima_vez_at
        ya no aparece → estado auto_resuelta        reaparece tras resuelta → reabrir
```

### Disparadores (de menor a mayor cobertura)

1. **Manual:** botón "Conciliar" (lo que hace hoy Consolidación) que además persiste.
2. **Por evento (ligero, solo la venta afectada):** al terminar recepción de compra, cobro de crédito, liquidación de efectivo o cierre de carga, se reevalúa esa venta y se auto-resuelven sus alertas si ya cuadra.
3. **Barrido programado:** al abrir el módulo y cada X minutos mientras el Admin/Gerente tenga sesión (mismo patrón del monitor de `contabilidadNotificaciones.js`), revisa las ventas de los últimos 7 días + cualquier alerta abierta. Opcional después: `pg_cron` o Edge Function para correr aunque nadie tenga la app abierta.

### Reglas de oro del motor

- **Solo lectura sobre datos operativos.** Escribe únicamente en las tablas `ruta_conciliacion_*`.
- **Idempotente:** correr 10 veces produce el mismo estado.
- **Enlaces por id o folio, nunca por aproximación de importe o nombre** (misma regla que la consolidación actual).
- **Tiendas normalizadas** con `normalizarCodigoTienda`/`equivalentesCodigoTienda`; evita falsas alertas por Fusión/FUSION o 3B7.
- **Fuente incompleta = no se concluye.** Si falla una consulta, la corrida se marca incompleta y no auto-resuelve nada.
- **Cancelaciones:** ventas canceladas o con `_cancelada` quedan fuera (ya lo hace `activa()`).

---

## 6. Alertas: cómo se enteran las personas

| Severidad | Dónde se ve | Aviso |
|---|---|---|
| Crítica | Tablero del submódulo (rojo) + buzón de contabilidad | Push inmediato a Admin y Gerente |
| Alta | Tablero + buzón | Resumen push una vez al día |
| Media | Tablero | Contador en el menú |
| Baja | Tablero (colapsado) | Ninguno |

- Insignia con el número de alertas abiertas en el subcomando del hub de Venta en Ruta y en el menú lateral.
- El push se manda una sola vez por alerta (`notificada_at`), reutilizando `crearNotificacion` y `enviar-push`. Se vuelve a mandar solo si la severidad sube.
- Una alerta crítica puede abrir automáticamente un caso en `pos_incidencias` (opcional) para reutilizar su seguimiento.

---

## 7. Interfaz (submódulo "Conciliación" dentro de Venta en Ruta)

Nuevo subcomando `ruta_conciliacion` (o evolución de `ruta_consolidacion`; ver preguntas abiertas). Cuatro vistas:

1. **Tablero**
   - Semáforo por tienda y por repartidor.
   - Tres tarjetas del día: **Efectivo** (vendido / en tránsito / liquidado / en gasto), **Crédito** (vendido / cargado / cobrado / pendiente), **Inventario** (vendido / ingresado / saldo del camión).
   - Lista de alertas abiertas ordenadas por severidad y antigüedad.
2. **Detalle de venta**
   - La cadena de la sección 1 con cada eslabón en verde/rojo/gris y sus importes lado a lado. Reutiliza `DetalleVenta` de `ConsolidacionRuta.jsx`.
3. **Alertas**
   - Filtros: tienda, repartidor, control, severidad, estado, fechas.
   - Acciones: tomar en revisión, justificar (nota obligatoria), resolver, reabrir. Todo con usuario y hora.
   - Exportar CSV.
4. **Cierre diario por tienda** (fase 3): el día cuadra o no, y se sella.

### Permisos
- Ver y operar: Admin, Gerente. Ver: Auditor.
- Justificar o resolver una alerta **crítica**: solo Admin.
- El repartidor y el cajero no ven este submódulo.

---

## 8. Estructura de código propuesta

```
src/lib/rutaConciliacion/
  config.js              tolerancias, ventanas de gracia, severidades
  datos.js               cargarDatosConciliacion (consultas acotadas y paginadas)
  controles/
    efectivo.js          C1 C2 C3 C4
    credito.js           C5 C6 C7 C8
    inventario.js        C9 C10 C11 C12
    estructurales.js     C13 C14 C15
  motor.js               arma hallazgos[] llamando consolidarRuta + controles
  alertas.js             upsert por clave, auto-resolución, reapertura, notificación
  *.test.mjs             una prueba por control + idempotencia + tiendas normalizadas
src/modules/ConciliacionRuta.jsx   (+ .css)
supabase/fix_ruta_conciliacion.sql
```

Las pruebas siguen el patrón existente (`node:assert`, `.mjs`, datos en memoria): cada control se prueba con una venta que cuadra, una que no, una cancelada y una de Fusión con grafía distinta.

---

## 9. Fases de entrega

| Fase | Contenido | Resultado |
|---|---|---|
| **1. Alertas persistentes** | SQL de alertas y corridas; motor con C1, C2, C5, C6, C7, C9, C10, C13 reutilizando `consolidarRuta`; botón Conciliar; lista de alertas con estados; insignia en menú; consultas acotadas por fecha. | Ya se puede ver y dar seguimiento a las fugas de efectivo, crédito y gasto. |
| **2. Avisos y cobertura** | Push por severidad; ventanas de gracia; disparo por evento; barrido periódico; C3, C4, C8, C14, C15; guardar auditorías físicas del camión en la nube y activar C11 y C12. | Se enteran solos, sin abrir el módulo. |
| **3. Cierre y tablero** | Tablero por tienda y repartidor; cierre diario sellado; histórico de corridas; bitácora de resoluciones. | Evidencia diaria de que no hubo fugas. |

---

## 10. Riesgos y decisiones a tomar

1. **Auditoría física en localStorage:** hoy solo existe en el dispositivo del recolector. Sin moverla a la nube, C12 (el control más fuerte contra faltantes de mercancía) no es confiable. Hay que crear una tabla de auditorías del camión.
2. **Dependencia de tablas:** el cobro de créditos requiere `transito_efectivo`, `ruta_cxc_movimientos` y `ruta_cxc_pagos_solicitudes` en Supabase; sin ellas C5 a C7 no tienen datos.
3. **Gasto de efectivo nace en la recepción, no en la venta.** Por eso C2 necesita la ventana de gracia; de lo contrario, toda venta reciente alertaría.
4. **El crédito no genera gasto hasta cobrarse** (por diseño actual). C6 solo compara lo ya cobrado.
5. **Volumen:** las consultas deben acotarse por fecha y paginarse; el barrido no debe leer todo el historial (cuidado con el Disk IO ya documentado en `supabase/diagnostico_disk_io.sql`).
6. **Falsos positivos:** cada alerta debe permitir "justificada" con nota; de lo contrario el equipo dejará de confiar en el tablero.

### Preguntas abiertas

- ¿Se **evoluciona** el subcomando Consolidación actual o se crea **Conciliación** aparte y se retira aquel?
- ¿Ventanas de gracia sugeridas (24 h recepción, 48 h tránsito, 15 días crédito) son correctas?
- ¿Quién recibe push de alertas críticas: solo Admin o también Gerente de cada sucursal?
- ¿Un faltante de inventario a partir de qué monto se considera crítico?
- ¿Las alertas deben bloquear algo (por ejemplo, cerrar la carga o liquidar efectivo) o solo avisar?
