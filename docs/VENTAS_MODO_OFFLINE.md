# Ventas en modo offline

Cuando se cae internet en la **caja de la sucursal** (una caja por tienda):

1. Aparece la etiqueta **MODO OFFLINE** (banner rojo + badge en el header).
2. **Solo Ventas** queda habilitado. Inventario, cortes, vales, etc. se bloquean.
3. Cada cobro se guarda en una **cola local** y se imprime el ticket con normalidad.
4. Al recuperar red, la app **sincroniza sola** las ventas pendientes (insert + descuento de stock).

## Notas

- El catálogo usado offline es la **última copia** bajada mientras había internet.
- No recargues la página sin red: el login necesita Supabase.
- “Limpiar caché” **no borra** la cola de ventas offline ni el catálogo de respaldo.
