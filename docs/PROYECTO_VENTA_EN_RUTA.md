# Proyecto: Venta en Ruta (POS)

**Estado:** POS v2 · 2026-08-20  
**Alcance:** MAIN · CEDIS → camión → POS móvil → tránsito / CxC / Compras

---

## Flujo

```
Admin ajusta precio_ruta (sin impuestos)
Admin crea camión y lo asigna a recolector (Panel RT / Repartidor)
Admin carga camión desde MAIN · CEDIS (1 carga abierta por camión; recargas suman)
Repartidor vende en POS (PIN) · 1 folio por sucursal
  · efectivo → RC Abarrotes (fallback: transito_efectivo)
  · crédito  → ruta_cxc (pendiente)
Sucursal recibe mercancía en Compras (pedido pendiente)
Cajero solicita el cobro del crédito (PIN de cajero)
  · el vendedor de ruta recibe el aviso y lo aprueba con SU PIN (o lo rechaza)
  · solo al aprobar: gasto corte abarrotes «credito liquidado»
  · efectivo cobrado → tránsito / RC (a nombre del vendedor)
  · créditos de Recolecciones (sin vendedor de ruta) se cobran directo, como antes
Liquidación de efectivo = Recolecciones / Liquidación (hub)
Cierre de carga = Consultas → Liquidar (o tras Corte de caja) → estado liquidada
  · si queda mercancía, se devuelve a CEDIS
```

---

## Subcomandos

| Quién | Subcomando |
|-------|------------|
| Admin/Gerente | Carga camión, Precios ruta, Clientes externos, Consultas |
| Repartidor | POS venta en ruta |
| Cajero | Contabilidad → Cobranza (PIN) |

---

## SQL

1. `fix_venta_en_ruta.sql` (cargas / ventas / clientes)  
2. `fix_precio_ruta_y_cxc.sql`  
3. `fix_venta_ruta_pos_v2.sql`  
4. `fix_ruta_cxc_aprobaciones.sql` (aprobación del vendedor al cobrar créditos; requiere `fix_tabla_creditos.sql` y `fix_ruta_cxc_pagos_atomicos.sql`)  

---

## Deprecado (ya no usa la app)

- `cedis_ruta_stock` / movimientos  
- `ruta_efectivo_movimientos`  
- `ruta_capital_solicitudes`  
- `ruta_preinventario_sesiones`  
- Cobranza por el repartidor  
