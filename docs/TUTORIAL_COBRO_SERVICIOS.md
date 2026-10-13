# Tutorial · Cobro de servicios hasta Tesorería

Guía operativa del flujo de **CFE / servicios** (separado de mercancía) hasta el traspaso a **Tesorería (Cheche)**.

En la app: menú **Tutorial**, o el botón **Ver tutorial** en:

- Venta en Ruta → **Cobro servicios**
- RC/VentaRuta → **RC Servicios**
- RC/VentaRuta → **Tesorería**

Imágenes: `public/tutorial-cobro-servicios/`.

## Frase clave

**Servicio se cobra · cajero aprueba · RC liquida · Cheche recibe.**

## Pasos

1. **Catálogo** — Contabilidad → Panel RT → Servicios (CFE, montos, obligatorio).
2. **Cobrar (móvil)** — Venta en Ruta → Cobro servicios → servicio, tienda, monto → Solicitar cobro al cajero.
3. **PIN cajero** — Notificación en caja → aprobar → gasto en corte + ingreso al Fondo.
4. **Vía Recolecciones** — Traspaso con servicios obligatorios → movimiento `Cobro Servicio` en tránsito.
5. **RC Servicios** — Liquidar cobros pendientes (por tienda) → cuenta RT **Servicios**.
6. **Ledger Fondo** — Liquidar saldo del resumen por servicio → cuenta Servicios.
7. **Tesorería** — Enviar fondos Servicios → **Cheche** (admin / gerente).

## No mezclar

- Pendientes por liquidar = mercancía / Francisco.
- RC Servicios / Tesorería = solo pagos de servicio.
