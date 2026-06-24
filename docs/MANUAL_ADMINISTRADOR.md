# Manual del Administrador — POS CONTROL 3B

**Versión 1.0** · Documento de referencia para el rol **Administrador**

---

Este manual describe la configuración, operación y mantenimiento del sistema POS CONTROL 3B desde la cuenta de **Administrador** — el único rol con acceso total.

> También disponible dentro de la app: **Ayuda → Manual administrador** (solo visible si iniciaste sesión como Administrador).

---

<!-- El contenido detallado se mantiene en src/content/manualAdminSections.js y se muestra en la app. -->

Para la versión interactiva con búsqueda e impresión a PDF, usa el módulo **Ayuda** en el POS.

## Índice

1. Rol del administrador  
2. Puesta en marcha (primera vez)  
3. Acceso, PIN y sucursales  
4. Usuarios y roles  
5. Turnos diurno y nocturno  
6. Catálogo de productos  
7. Ajuste de inventario  
8. Ventas y corte de caja  
9. Compras y proveedores  
10. Consultas, estadísticas y reportes  
11. Configuración del sistema  
12. Mantenimiento Supabase (SQL)  
13. Solución de problemas  

---

## 1. Rol del administrador

El **Administrador** es el único rol con acceso total al sistema. Solo tú puedes:

- Crear, editar y eliminar **usuarios** (empleados con PIN)
- Asignar **turnos** diurno/nocturno a cajeros (anti-fraude)
- Dar de alta **proveedores** nuevos
- Acceder a **Configuración** completa (turnos, impresión, periféricos, tiendas)
- Ver y operar **todos los módulos** del menú lateral

**Gerente** y **Supervisor** operan la tienda pero no gestionan usuarios. **Auditor** hace inventario y reportes sin cobrar. **Cajero** solo vende y hace corte de su turno.

---

## 2. Puesta en marcha (primera vez)

### 2.1 Supabase (base de datos)

1. Crea un proyecto en [supabase.com](https://supabase.com)
2. En **SQL Editor**, ejecuta `supabase/fix_supabase_todas_columnas.sql`
3. Espera ~30 segundos
4. Si hay errores de usuarios o turnos, ejecuta también:
   - `supabase/fix_usuarios_rol_check.sql`
   - `supabase/fix_turnos_seguridad.sql`

### 2.2 Archivo .env

```
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-clave-anon
```

Opcional — fijar tienda en esta PC: `VITE_SUCURSAL_FIJA=3B5`

### 2.3 Arrancar

```
npm install
npm run dev
```

Abre `http://localhost:5173`. Celular en misma Wi‑Fi: `http://IP-DE-LA-PC:5173`

### 2.4 Verificar

```
node scripts/check-tablas.mjs
```

Debe mostrar **11 OK**.

---

## 3. Acceso, PIN y sucursales

- Cada empleado entra con su **PIN** en la **sucursal** asignada
- Tiendas base: MAIN, FUSION, 3B2, 3B5, 3B6, 3B7, 3B9, 3B10
- **Configuración → Tienda**: agregar tiendas, fijar tienda en este equipo
- `VITE_SUCURSAL_FIJA` en `.env` bloquea la tienda desde el despliegue

---

## 4. Usuarios y roles

Módulo **Usuarios** (solo Administrador):

| Rol | Acceso |
|-----|--------|
| Cajero | Ventas, corte de su turno |
| Auditor | Inventario, reportes (sin ventas) |
| Supervisor | Operación sin usuarios |
| Gerente | Operación + Configuración |
| Administrador | Todo |

Alta: nombre, PIN, sucursal, rol, turno (cajeros). Solo admin cambia turnos.

---

## 5. Turnos diurno y nocturno

- 12 h: Diurno / Nocturno
- Cajero diurno no entra de noche y viceversa
- Ventas y cortes ligados al turno
- **Configuración → Turnos de caja** + **Usuarios → Turno**

---

## 6. Catálogo de productos

**Productos → Catálogo**: código (= barras), precios, IVA, departamento, stock, favoritos. Importación CSV. Valor de inventario en tarjeta superior.

---

## 7. Ajuste de inventario

- **Libre**: escaneo, entrada/retiro/traspaso
- **Por departamento**: conteo físico, siguiente artículo, resumen, folio AJU-…
- **Entrada múltiple**: recepciones masivas

---

## 8. Ventas y corte

Ventas con escaneo; corte por turno; cancelaciones devuelven stock. **Inicio** muestra KPIs del día.

---

## 9. Compras y proveedores

Solo admin crea proveedores. Flujo: pedido → recepción escaneada → stock actualizado.

---

## 10. Consultas y reportes

Ventas, movimientos inventario, cortes, CSV, impresión. Checador de precios y reloj.

---

## 11. Configuración

Marca, tipo de cambio, métodos de pago, impresión, periféricos (escáner HID, térmica), turnos.

---

## 12. SQL de mantenimiento

| Script | Uso |
|--------|-----|
| fix_supabase_todas_columnas.sql | Principal |
| fix_turnos_seguridad.sql | Turnos |
| fix_usuarios_rol_check.sql | Roles |

---

## 13. Problemas frecuentes

| Problema | Solución |
|----------|----------|
| No crear usuarios | fix_usuarios_rol_check.sql |
| Error productos/costo | fix_supabase_todas_columnas.sql + Ctrl+F5 |
| Turno incorrecto | Usuarios + Configuración |
| Celular no conecta | Misma Wi‑Fi, host:true, firewall |

---

*POS CONTROL 3B — Manual administrador v1.0*
