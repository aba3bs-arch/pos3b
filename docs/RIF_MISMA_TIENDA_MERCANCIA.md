# RIF: misma tienda · compra de mercancía

En **Vales y Préstamos → RIF** puedes registrar dos tipos de Requisición Interna de Fondos:

1. **Entre tiendas** — fondo de una sucursal a otra (origen ≠ receptora).
2. **Misma tienda · compra mercancía** — fondo documentado **en la misma tienda** para comprar mercancía (no se mueve a otra sucursal).

## Misma tienda · mercancía

1. Abre **Vales y Préstamos → RIF**.
2. Elige **Misma tienda · compra mercancía**.
3. Captura responsable, monto, promesa de pago y **motivo** (obligatorio: qué se compra).
4. **Registrar RIF e imprimir** (firma del responsable).
5. Cuando regreses el fondo / cierras el pendiente: **Abonar** o **Liquidar**.

Si no se liquida a la hora promesa, se carga al **Corte de Abarrotes** como **Fondo requerido** (igual que el RIF entre tiendas).

## SQL (Supabase)

Si la columna `tipo` aún no existe:

```sql
-- supabase/fix_rifs_tipo_misma_tienda.sql
```

O re-ejecuta `supabase/fix_rifs.sql` (incluye `tipo` + `add column if not exists`).
