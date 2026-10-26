# Activación de créditos y pagos de Venta en Ruta

El cambio de la aplicación requiere activar la operación transaccional en el Supabase existente. Publicar solamente el frontend no instala funciones SQL. Hasta activar la función, Cobranza muestra que falta la actualización y no ejecuta el antiguo pago por escrituras separadas.

1. Guardar un respaldo de la base de datos.
2. En el SQL Editor del proyecto Supabase utilizado por el POS, ejecutar `fix_ruta_cxc_pagos_atomicos.sql`. Requiere las tablas existentes de ruta, tránsito y contabilidad y las columnas de `fix_venta_ruta_pos_v2.sql`. El script es transaccional y se puede repetir. No reconstruye ni borra operaciones históricas.
3. Publicar la actualización de la aplicación. Evitar operar con pestañas que conservan la versión anterior.
4. Ejecutar `auditoria_ruta_cxc.sql`, que solo consulta datos. Revisar sus resultados por folio, sucursal, vendedor y fecha contra el dinero efectivamente recibido. No volver a pagar ni reconstruir en bloque los registros señalados: pueden contener pagos reales o cargos eliminados intencionalmente.
5. Verificar un crédito completo, uno parcial y un pago de Recolecciones en una sucursal de prueba. Confirmar el mismo importe en gasto, tránsito y abono, el remanente correcto y que el segundo intento de la misma operación no duplique movimientos. Verificar también FUSION y una sucursal con movimientos antiguos.

El script también impide crear cargos nuevos duplicados por venta o ficha. Los duplicados históricos detienen el cobro hasta ser conciliados.

El pago guarda todo el lote en una transacción y bloquea los cargos mientras se procesa. La misma solicitud devuelve la confirmación original si se repite. Si se pierde la conexión, conservar la selección y el monto y reintentar la misma operación en la pantalla. La protección de la solicitud se conserva durante esa apertura de pantalla; tras recargar, consultar el saldo y los movimientos antes de iniciar otro pago parcial. Un cargo completamente pagado se rechaza aunque llegue con otra solicitud.

El repartidor se resuelve a partir del vendedor de la carga o del crédito; en Recolecciones se conserva el de la ficha. Cuando la ficha y el crédito tienen saldos distintos, el pago se detiene para conciliarlos. Los registros previos no se corrigen automáticamente.

Las pruebas locales verifican transacciones, reintentos, reversión de lotes, parciales, alias, paginación y fallos de conexión. No sustituyen la comprobación de permisos, esquema real, concurrencia entre conexiones ni conciliación de los folios afectados en producción. La venta completa todavía coordina inventario y pedido de Compras en pasos separados; estos cambios hacen transaccional el cobro de créditos, no toda la operación del POS.

Validación local: `node --test src/lib/rutaCxc*.test.mjs src/lib/rutaTransito.test.mjs`.
