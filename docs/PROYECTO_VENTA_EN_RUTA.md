# Proyecto: Venta en Ruta (POS)

**Estado:** POS v2 · 2026-08-20  
**Alcance:** MAIN · CEDIS → camión → POS móvil → tránsito / CxC / Compras

---

## Flujo

```
Admin ajusta precio_ruta (sin impuestos)
Admin carga camión (descuenta MAIN · CEDIS)
Repartidor vende en POS (scan) · 1 folio por sucursal
  · efectivo → transito_efectivo (hasta liquidación)
  · crédito  → ruta_cxc (pendiente)
Sucursal recibe mercancía en Compras (pedido pendiente)
Cajero paga crédito con PIN
  · gasto corte abarrotes «credito liquidado»
  · efectivo cobrado → transito_efectivo
Liquidación de tránsito = flujo Recolecciones / Liquidación
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

---

## Deprecado (ya no usa la app)

- `cedis_ruta_stock` / movimientos  
- `ruta_efectivo_movimientos`  
- `ruta_capital_solicitudes`  
- `ruta_preinventario_sesiones`  
- Cobranza por el repartidor  
