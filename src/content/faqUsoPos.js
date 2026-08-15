/** Preguntas frecuentes de uso del POS — el asistente las prioriza sobre el manual largo. */
export const FAQ_USO_POS = [
  {
    id: 'faq-cobrar',
    title: 'Cómo cobrar una venta',
    keywords: ['cobrar', 'venta', 'carrito', 'escanear', 'ticket', 'efectivo', 'tarjeta', 'cambio'],
    body: `En el menú abre **Ventas**.

1. Revisa arriba que la **tienda** sea la correcta.
2. Pon el cursor en buscar y **escanea** el código, o escribe el nombre y elige el producto.
3. Ajusta la cantidad en el carrito. Si te equivocaste, quita la línea.
4. Toca **Cobrar**.
5. Elige cómo paga el cliente (efectivo, tarjeta u otro método activo).
6. En efectivo: **Monto exacto** o elige el billete; el sistema calcula el **cambio** en pesos. En dólares usa el tipo de cambio de Configuración.
7. Toca **Finalizar venta**. Baja el inventario del **piso** y queda el ticket.

Los **Favoritos** (marcados en Productos) aparecen como botones rápidos.`,
  },
  {
    id: 'faq-corte',
    title: 'Cómo hacer el corte de caja',
    keywords: ['corte', 'caja', 'cerrar', 'turno', 'arqueo', 'diferencia'],
    body: `Al terminar tu turno abre **Corte de caja**.

- El **cajero** solo puede cortar **su turno** (diurno o nocturno).
- Gerente, supervisor y administrador pueden cortar cualquier turno.
- Hay **un corte por tienda, fecha y turno**.
- El corte suma las ventas de ese turno. Las **cancelaciones** devuelven stock al piso y restan del corte.

Cuenta el efectivo, captura lo que hay en caja y cierra. Si hay diferencia, anótala; no dejes el turno abierto.`,
  },
  {
    id: 'faq-pin',
    title: 'El PIN no funciona o no puedo entrar',
    keywords: ['pin', 'entrar', 'login', 'turno', 'sucursal', 'bloqueado', 'acceso'],
    body: `Prueba en este orden:

1. **Tienda correcta** en la pantalla de entrada (el PIN vale en la sucursal asignada al usuario).
2. **Turno**: el cajero diurno no entra en horario nocturno y al revés. Revisa Usuarios → Turno y Configuración → Turnos de caja.
3. Si el PIN lo cambió el administrador, usa el nuevo.
4. Solo el **administrador** crea o edita usuarios en **Usuarios**.

Si ves error de turno, espera al horario que te toca o pide al admin cambiar tu turno.`,
  },
  {
    id: 'faq-precio-caja',
    title: 'El precio en caja no es el del producto',
    keywords: ['precio', 'caja', 'perfil', 'cero', '0.00', 'carrito', 'inventario', 'distinto'],
    body: `La caja cobra el **precio guardado** del producto (campo precio), no un recálculo al vuelo.

Si el perfil muestra un precio y el carrito otro (o **$0.00**):

1. Abre **Productos**, busca el artículo y confirma el **precio de venta**.
2. **Guarda** el producto aunque el número se vea bien (así queda fijo en catálogo).
3. En **Consultas → Precios → Ventas vs inventario** ves tickets que se cobraron distinto al inventario de hoy. Filtra **Vendidos a $0** y **Precio muy bajo**.
4. Ojo: ventas viejas pueden diferir porque el precio **cambió después**; eso no es un error de aquella caja.

Si el catálogo tiene precio **$0** y sí hay costo (ejemplo: ganancia en −100%), la próxima venta puede salir mal: corrige y guarda el precio al público.`,
  },
  {
    id: 'faq-consultas-precios',
    title: 'Dónde ver si las ventas se cobraron al precio del inventario',
    keywords: ['consultas', 'reporte', 'precios', 'comparar', 'inventario', 'diferencia'],
    body: `**Consultas → Precios → Ventas vs inventario**.

Elige fechas y sucursal. El reporte carga todas las ventas del rango y compara cada línea con el precio **actual** del catálogo.

Usa los filtros:
- **Solo diferencias**
- **Vendidos a $0**
- **Precio muy bajo** (cobrado a menos del 40% del precio de hoy)
- **Catálogo en $0** (se vendió con precio, pero hoy el producto está en cero)

Toca un producto para ver tickets de ejemplo (folio, cajero, sucursal).`,
  },
  {
    id: 'faq-traspaso',
    title: 'Cómo surtir piso o mandar mercancía a otra tienda',
    keywords: ['traspaso', 'cedis', 'piso', 'surtir', 'main', 'almacen', 'tienda'],
    body: `En **Productos → Ajuste de inventario** o **Configuración → Inventario multitienda** (admin/gerente):

| Tipo | Para qué |
|------|----------|
| CEDIS → Piso | Surtir el mostrador desde la bodega de la misma tienda |
| Piso → CEDIS | Regresar sobrante a bodega |
| Almacén central → Tienda | Distribuir desde **MAIN** |
| Tienda → Tienda | De un CEDIS a otro |

Las **ventas** descuentan del **piso** de la tienda activa. Las **compras** al recibir suman al **CEDIS**.`,
  },
  {
    id: 'faq-compras',
    title: 'Cómo hacer un pedido y recibir mercancía',
    keywords: ['compras', 'pedido', 'proveedor', 'recibir', 'recepcion'],
    body: `1. **Compras** → elige proveedor.
2. **Generar pedido** (sugerencias por stock y ventas). Eso aún no mueve inventario.
3. Cuando llegue la mercancía: **Recibir** escaneando.
4. **Confirmar recepción** → suma al **CEDIS** de la tienda activa.

Solo el **administrador** da de alta proveedores nuevos.`,
  },
  {
    id: 'faq-tienda',
    title: 'Cómo cambiar de tienda',
    keywords: ['tienda', 'sucursal', 'cambiar', 'fijar', 'main', 'header'],
    body: `Administrador y gerente cambian de tienda en el **selector de arriba a la derecha**. Ventas, inventario y cortes usan esa sucursal.

En cada caja se puede **fijar la tienda en este equipo** para que nadie cobre en otra sucursal por error.

**MAIN** no es tienda de mostrador: es el **almacén central**. Ahí se recibe a granel y se reparte con traspasos.`,
  },
  {
    id: 'faq-prestamos',
    title: 'Préstamos entre áreas o sucursales',
    keywords: ['prestamo', 'abonar', 'liquidar', 'area', 'sucursal', 'cajero', 'vales'],
    body: `En **Vales y préstamos** se registran préstamos de área o sucursal.

- **Cajeros** pueden ver e imprimir, pero **no** abonan, liquidan ni editan esos préstamos (solo Administrador y Gerente).
- Al registrar un préstamo entre áreas/sucursales puede ir a recolección como gasto del origen.
- En recolección queda quién **colectó**. Al liquidar, quién liquidó y desde qué tienda.`,
  },
  {
    id: 'faq-asistente',
    title: 'Cómo usar este asistente',
    keywords: ['asistente', 'ayuda', 'ia', 'inteligencia', 'manual'],
    body: `Pregunta en español cómo usar el POS: cobrar, corte, PIN, precios, traspasos, compras, turnos, etc.

El asistente responde con el **manual de Las 3B**. Si el administrador activa la IA en la nube (Groq u OpenAI), las respuestas se redactan solas; si no, busca en el mismo manual de la app.

No inventa precios ni mueve inventario. Para números de ventas usa **Consultas**.`,
  },
];
