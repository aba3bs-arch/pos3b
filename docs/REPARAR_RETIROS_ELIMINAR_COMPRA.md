# Reparar retiros por Eliminar en Compras (2026-10-15)

## Qué pasó
Al usar **Eliminar** en Compras → Por recibir sobre recepciones ya hechas, la app descontó inventario y dejó retiros `RET-…` en Consultas (todas las sucursales afectadas).

## Qué hacer ahora (una vez, en Supabase)

1. Abre **Supabase → SQL Editor**.
2. Carga `supabase/reparar_retiros_eliminar_compra_2026_10_15.sql`.
3. Ejecuta el bloque **PREVIEW** y confirma que son los retiros de «Eliminar recepción».
4. Descomenta el bloque `DO $$ … $$` de **REPARAR** y ejecútalo.
5. Corre la **VERIFICACIÓN** (debe dar `0` restantes).
6. En cada caja: **Limpiar caché** / recargar el POS para ver stock y Consultas al día.

El script:
- Devuelve las piezas al piso (`aplicar_delta_stock_ubicacion` con delta positivo).
- **Borra** esos movimientos de `movimientos_inventario` para que no salgan en Consultas.

## Prevención (código)
`Eliminar` en Por recibir **ya no mueve inventario**: solo quita el registro del historial. Devolver mercancía de venta en ruta sigue en **Cancelación / Devolución**.
