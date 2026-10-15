# Reparar retiros por Eliminar en Compras (2026-10-15)

## Por qué descontó inventario «si no se recibía»

La pestaña se llamaba **Por recibir** pero listaba **también recepciones ya hechas** (`recibida`).

- Pedido pendiente (`pedido`): Eliminar **nunca** movía inventario.
- Recepción ya hecha (`recibida`): el botón Eliminar (bug del 15-oct) **sí descontaba piso** y dejaba `RET-…` en Consultas.

Si borraste filas con estado `recibida` / `cerrada` (aunque estuvieran en esa pestaña), el sistema sí restó mercancía. Por eso ves productos en negativo y retiros `RET-5-1510-…` ~01:45.

## Por qué el SQL anterior «no revirtió»

El PREVIEW v1 solo buscaba `motivo ilike 'Eliminar recepción%'` / `meta.eliminar_compra`. Si no coincidía el texto, devolvía **0 filas** y el bloque REPARAR no hacía nada — los `RET-*-1510-*` seguían en la nube (Consultas: «nube …»).

## Qué hacer ahora (v2)

1. Supabase → **SQL Editor**.
2. Pega y ejecuta **todo** el archivo `supabase/reparar_retiros_eliminar_compra_2026_10_15.sql` (v2).
3. Revisa el bloque **DIAGNÓSTICO** y la tabla **CANDIDATOS** (debe listar los RET de esa madrugada).
4. El bloque **REPARAR** corre solo: restaura stock y **borra** esos movimientos.
5. En **Notices** debe aparecer: `OK · stock restaurado: N · retiros borrados: N`.
6. VERIFICACIÓN: restantes ≈ `0`.
7. En cada caja: **Limpiar caché** / recargar POS.

El v2 también toma la ráfaga `RET-*-1510-*` con `modo = 'piso'` entre ~08:20–09:30 UTC del 15-oct (≈01:20–02:30 local Sonora), aunque el motivo no diga «Eliminar recepción».

## Prevención (app)

- **Por recibir** = solo pedidos pendientes.
- **Historial recepciones** = ya recibidas.
- Eliminar **nunca** mueve inventario.
- Consultas oculta retiros marcados `eliminar_compra` si quedara alguno.
