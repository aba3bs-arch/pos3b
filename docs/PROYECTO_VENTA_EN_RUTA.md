# Proyecto: Venta en Ruta (CEDIS)

**Estado:** rediseño operativo · 2026-08-20  
**Alcance:** comando **Venta en Ruta** · almacén **CEDIS Ruta** (aislado de MAIN)

---

## Flujo

```
Admin surte CEDIS Ruta
  → carga de camión (admin)
  → venta en ruta tipo POS (vendedor)
       · efectivo  → cuenta efectivo
       · crédito   → cuenta crédito (CxC)
  → cobranza (vendedor cobra créditos → efectivo)
  → liquidación (admin, sobrante regresa a CEDIS)
```

El vendedor **no modifica** inventario ni cuentas; solo consulta, vende, cobra y solicita capital.

---

## Roles

| Acción | Admin / Gerente | Vendedor (Repartidor) |
|--------|-----------------|------------------------|
| Surte almacén | Sí | No |
| Ver inventario | Sí | Solo lectura |
| Carga de camión | Sí | No |
| Venta POS | Sí | Sí |
| Cobranza créditos | Sí | Sí |
| Ver cuentas | Sí + ajuste | Solo lectura |
| Capital | Liberar / rechazar | Solicitar + foto ticket |
| Preinventario | Sí | Sí (plantilla catálogo) |

---

## Subcomandos

1. **Surte almacén** — ingresos/ajustes CEDIS Ruta  
2. **Inventario** — consulta (vendedor sin editar)  
3. **Carga de camión** — folio; baja CEDIS → camión  
4. **Venta en ruta** — POS efectivo/crédito  
5. **Cobranza** — abonos a CxC  
6. **Cuentas** — saldos efectivo y crédito  
7. **Capital / gastos** — solicitud → liberación → foto ticket  
8. **Preinventario** — plantilla del catálogo CEDIS (no altera stock)  

---

## SQL

1. `supabase/fix_venta_en_ruta.sql`  
2. `supabase/fix_precio_ruta_y_cxc.sql`  
3. `supabase/fix_venta_en_ruta_cuentas_capital.sql`  

---

## Criterio de éxito

- Admin surte → carga → venta POS funcional  
- Ventas asientan en cuenta efectivo o crédito  
- Vendedor no edita cuentas ni inventario  
- Cobranza de créditos por vendedor  
- Capital con liberación admin y justificación con foto  
- Preinventario por plantilla del catálogo de ruta  
