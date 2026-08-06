# Proyecto: Venta en Ruta (CEDIS)

**Estado:** decisiones confirmadas · implementación Fase A en curso  
**Fecha:** 2026-08-06  
**Alcance:** comando **Venta en Ruta** · almacén **CEDIS Ruta** (aislado de MAIN)

---

## Decisiones confirmadas

| # | Tema | Decisión |
|---|------|----------|
| 1 | Stock inicial | **CEDIS Ruta inicia vacío** (ingresos propios; no toma stock de MAIN) |
| 2 | Destino de venta | **Sucursales propias** + opción **clientes no propios (externos)** |
| 3 | Modalidad | **Solo venta directa** (sin preventa) |
| 4 | Formas de pago | **Efectivo** y **crédito** |
| 5 | Traspasos | **Ocultos en este flujo** (no se usan para surtir) |
| 6 | Nombre del almacén | **CEDIS Ruta** |

---

## Flujo

```
CEDIS Ruta (vacío al inicio)
  → ingreso a almacén
  → carga de camión
  → venta directa (sucursal propia o cliente externo)
  → liquidación (efectivo + crédito; sobrante regresa a CEDIS Ruta)
```

**No interfiere con MAIN.cedis ni con piso de tiendas. No usa traspasos.**

---

## Subcomandos Fase A (MVP)

1. **CEDIS Ruta** — existencias del almacén aislado (ingreso / retiro / consulta)
2. **Carga de camión** — arma folio; baja CEDIS Ruta → inventario de la carga
3. **Venta en ruta** — vende desde la carga (efectivo / crédito; sucursal o externo)
4. **Liquidación** — cuadre; sobrante vuelve a CEDIS Ruta; cierra carga
5. **Clientes de ruta** — externos (no propios)
6. **Consultas** — cargas, ventas, liquidaciones

Fase B (después): rutas/vendedores formales, merma detallada, impresión, reportes avanzados.

---

## Criterio de éxito

- Comando visible y usable
- Stock CEDIS Ruta independiente de MAIN
- Carga → venta (efectivo/crédito) → liquidación con historial
- Traspasos no aparecen dentro de este flujo; en MAIN se indica que el surtido es por Venta en Ruta
