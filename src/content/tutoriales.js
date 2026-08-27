/** Contenido del módulo Tutorial (POS). Imágenes en /public/tutorial-negativos/ */

export const TUTORIALES = [
  {
    id: 'negativos-pagare',
    titulo: 'Negativos, Pagaré, Abonos y Liquidaciones',
    resumen:
      'Cómo manejar la alerta DINERO EN RECUPERACIÓN: abono, liquidar, pagaré solo en recolección, y qué no puede hacer el cubre turno.',
    secciones: [
      {
        id: 'flujo',
        titulo: '1. El mapa completo',
        cuerpo: [
          'Cuando la caja o una deuda queda en rojo, el flujo correcto es:',
          '1. Aparece la alerta **DINERO EN RECUPERACIÓN** (**Negativo**).',
          '2. Si aún falta dinero → **Abono** (pago parcial) — lo hace el **cajero**.',
          '3. Cuando ya se recuperó todo (**Negativo = $0**) → **Liquidar** — lo hace el **cajero**.',
          '4. **Pagaré** (al final): **únicamente** si el negativo **sigue presente durante una recolección**. Documenta la deuda (2 tickets); no la cierra.',
        ],
        imagen: '/tutorial-negativos/tutorial-01-flujo-negativos.png',
        imagenAlt: 'Flujo Negativo → Abono → Liquidar → Pagaré',
        notas: [
          '**Después de una recolección:** el **cajero** es el **responsable de la recuperación** (abonar / liquidar lo pendiente).',
          'Esto es el *negativo de dinero* (caja / deuda). El inventario negativo en Productos es otro tema (solo Admin).',
        ],
      },
      {
        id: 'negativo',
        titulo: '2. Qué es el “Negativo”',
        cuerpo: [
          'En el corte verás una alerta parpadeante cuando hay un **pagaré** o **préstamo de área** abierto, o la **caja chica** está en negativo.',
          '**Negativo** = lo que aún falta recuperar. **Recuperado** = lo que ya cubrió la venta del corte.',
          'La venta del corte (efectivo) va reduciendo el negativo sola: cada venta suma a Recuperado y baja Negativo.',
        ],
        imagen: '/tutorial-negativos/tutorial-02-alerta-dinero-recuperacion.png',
        imagenAlt: 'Alerta DINERO EN RECUPERACIÓN',
      },
      {
        id: 'roles',
        titulo: '3. Quién hace qué',
        cuerpo: [
          '**Cajero:** Abono y Liquidar.',
          '**Admin / Gerente:** Abono, Liquidar y Pagaré (en recolección).',
          '**Recolector:** Pagaré en recolección (no abona/liquida en el corte).',
          '**Cubre turno (CT):** solo **ve** la alerta. **No** puede Abonar, Liquidar ni Pagaré.',
        ],
        imagen: '/tutorial-negativos/tutorial-04-roles-quien-hace-que.png',
        imagenAlt: 'Tabla de roles',
      },
      {
        id: 'cubre-turno',
        titulo: '4. Cubre turno: no abona ni liquida',
        cuerpo: [
          'El **cubre turno** puede ver la alerta, pero **no** puede pulsar **Abono** ni **Liquidar**.',
          'Eso lo hace el **cajero** cuando **recibe el turno del CT** (entra con su sesión de cajero).',
          'Mensaje típico para CT: *NEGATIVO RECUPERADO — EL CAJERO DEBE LIQUIDAR O ABONAR EN SU SESIÓN*.',
        ],
        imagen: '/tutorial-negativos/tutorial-07-cubre-turno-cajero.png',
        imagenAlt: 'Cubre turno vs cajero',
        notas: [
          '**Después de una recolección, el cajero es el responsable de la recuperación.**',
        ],
      },
      {
        id: 'abono',
        titulo: '5. Abono (pago parcial)',
        cuerpo: [
          'Usa **Abono** cuando todavía hay **Negativo > $0**.',
          '1. Entra como **cajero** (si venía un CT, el cajero retoma el turno).',
          '2. En la alerta pulsa **Abono** y captura el monto.',
          '3. El saldo baja. Si llega a $0, se liquida solo.',
          'También puedes abonar en **Vales y Préstamos → Pagaré** (y otros documentos).',
        ],
        imagen: '/tutorial-negativos/tutorial-05-abono-vs-liquidar.png',
        imagenAlt: 'Abono vs Liquidar',
      },
      {
        id: 'liquidar',
        titulo: '6. Liquidar (cerrar la deuda)',
        cuerpo: [
          'Usa **Liquidar** cuando el **Negativo ya está en $0** pero la alerta sigue visible.',
          'Verás: **NEGATIVO RECUPERADO, FAVOR DE LIQUIDAR Y PAGAR PRÉSTAMO**.',
          'El **cajero** (nunca el CT) pulsa **Liquidar**. La alerta desaparece; no se imprime ticket nuevo.',
        ],
        imagen: '/tutorial-negativos/tutorial-03-negativo-recuperado-liquidar.png',
        imagenAlt: 'Negativo recuperado — Liquidar',
      },
      {
        id: 'pagare',
        titulo: '7. Pagaré (solo en recolección, al final)',
        cuerpo: [
          '**Regla de oro:** el Pagaré se genera **únicamente** cuando el negativo está presente **durante una recolección**.',
          'Va **al final** del flujo: primero recupera (venta / abono / liquidar); si al recolectar **aún** hay negativo, entonces se documenta.',
          'Lo genera **Admin / Gerente / Recolector**. Imprime **2 tickets**.',
          'Generar el pagaré **no liquida** la deuda: solo la documenta.',
          'Después, el **cajero** hace el seguimiento en **Vales y Préstamos → Pagaré** (Abonar / Liquidar).',
        ],
        imagen: '/tutorial-negativos/tutorial-06-pagare-ticket.png',
        imagenAlt: 'Ticket Pagaré ×2',
        notas: [
          '**Después de la recolección, el cajero es el responsable de la recuperación.**',
        ],
      },
      {
        id: 'orden',
        titulo: '8. Orden correcto en tienda',
        cuerpo: [
          '1. Capturar **todos** los gastos del turno (incl. bonos pagados de caja).',
          '2. Atender **DINERO EN RECUPERACIÓN**: Abono / Liquidar (**cajero**).',
          '3. **Cerrar corte**.',
          '4. **Recolectar** — si el negativo sigue presente → **Pagaré**.',
          '5. Después de la recolección → el **cajero** es responsable de la recuperación.',
        ],
      },
      {
        id: 'frase',
        titulo: 'Frase para capacitar',
        cuerpo: [
          'Primero recupera: **Abono** o **Liquidar** (siempre el **cajero**, nunca el cubre turno).',
          'El **Pagaré** va **al final** y **solo** si el negativo está presente **durante la recolección**.',
          'Después de recolectar, el **cajero** es el **responsable de la recuperación**.',
        ],
      },
    ],
  },
  {
    id: 'cobros-caja',
    titulo: 'Cobros en caja: efectivo, dólares, tarjeta y recargas',
    resumen:
      'Cómo armar el ticket, cobrar en pesos o dólares, cobrar con tarjeta, y registrar recargas de celular (como gasto del corte, no en Ventas).',
    secciones: [
      {
        id: 'mapa-cobros',
        titulo: '1. Mapa de cobros',
        cuerpo: [
          'Ruta: menú → **Ventas**.',
          '**Efectivo MXN / USD** y **Tarjeta** se cobran en el modal **Cobrar venta**.',
          'Las **recargas de celular** **no** se cobran en Ventas: se registran en **Corte Virtual** o **Corte Abarrotes** → **Gastos del turno**.',
        ],
        imagen: '/tutorial-cobros/cobro-00-mapa.png',
        imagenAlt: 'Mapa: Ticket, Efectivo MXN, USD, Tarjeta, Recargas',
      },
      {
        id: 'ticket',
        titulo: '2. Armar el ticket y cobrar',
        cuerpo: [
          '1. Entra a **Ventas** y revisa la tienda en el encabezado.',
          '2. Agrega productos: escanea en **Código o nombre…**, toca Favoritos/catálogo, o usa la cámara.',
          '3. En **Ticket** ajusta cantidades o usa **Quitar**.',
          '4. Revisa el **TOTAL $… MXN**.',
          '5. Pulsa el botón verde **Cobrar** (solo si hay productos).',
          '6. Se abre el modal **Cobrar venta**.',
        ],
        imagen: '/tutorial-cobros/cobro-01-ticket-cobrar.png',
        imagenAlt: 'Pantalla Ventas: ticket y botón Cobrar',
        notas: [
          'Si el carrito está vacío, **Cobrar** está deshabilitado.',
          'Arriba se muestra el **Dólar: $X.XX** (tipo de cambio activo).',
        ],
      },
      {
        id: 'efectivo-mxn',
        titulo: '3. Efectivo en pesos (MXN)',
        cuerpo: [
          '1. En **Forma de pago** elige **Efectivo**.',
          '2. En moneda elige **Pesos (MXN)**.',
          '3. Opciones:',
          '   · **Monto exacto · $… MXN** → cambio $0.00',
          '   · **O pagar con billete…** → $20 / $50 / $100 / $200 / $500 / $1000 MXN',
          '4. Revisa **Cambio: $… MXN**.',
          '5. Pulsa **Finalizar venta**.',
          '6. En **Venta registrada** revisa el cambio y pulsa **Cerrar** (o **Imprimir ticket**).',
        ],
        imagen: '/tutorial-cobros/cobro-02-efectivo-pesos.png',
        imagenAlt: 'Modal Cobrar venta — Efectivo MXN',
        notas: [
          'No hay campo libre de monto: solo **Monto exacto** o un billete de la lista.',
          'Si falta dinero: *Monto insuficiente*. Si no elegiste nada: *Selecciona la denominación o Monto exacto.*',
        ],
      },
      {
        id: 'efectivo-usd',
        titulo: '4. Efectivo en dólares (USD)',
        cuerpo: [
          '1. **Forma de pago** → **Efectivo**.',
          '2. Moneda → **Dólares (USD)**.',
          '3. El total del ticket sigue en **MXN**. El sistema convierte con el tipo de cambio del encabezado.',
          '4. Elige **Monto exacto · $… MXN** o un billete USD ($1 / $5 / $10 / $20 / $50 / $100).',
          '5. El **Cambio siempre se muestra en pesos (MXN)**.',
          '6. **Finalizar venta**.',
        ],
        imagen: '/tutorial-cobros/cobro-03-efectivo-dolares.png',
        imagenAlt: 'Modal Cobrar venta — Efectivo USD',
        notas: [
          'El tipo de cambio se configura en **Configuración → Tipo de cambio (1 USD → MXN)**.',
          'Se guarda como **Efectivo USD**.',
        ],
      },
      {
        id: 'tarjeta',
        titulo: '5. Pago con tarjeta',
        cuerpo: [
          '1. En **Forma de pago** elige **Tarjeta**.',
          '2. Verás: **Cobro exacto · Tarjeta · $… MXN** (sin cambio).',
          '3. Opcional: llena **Referencia / folio (opcional)** (últimos dígitos, autorización…).',
          '4. **Cobra primero en la terminal física** de la tienda.',
          '5. Regresa al POS y pulsa **Finalizar venta**.',
          '6. Cierra el modal **Venta registrada**.',
        ],
        imagen: '/tutorial-cobros/cobro-04-tarjeta.png',
        imagenAlt: 'Modal Cobrar venta — Tarjeta',
        notas: [
          'El POS **no cobra** en la terminal: solo registra. Si finalizas sin cobrar en la máquina, el corte no cuadrará.',
          '**Transferencia** y **QR** funcionan igual (cobro exacto + referencia opcional), si están activos en Configuración.',
        ],
      },
      {
        id: 'venta-ok',
        titulo: '6. Venta registrada',
        cuerpo: [
          'Tras **Finalizar venta** aparece **Venta registrada** con el cobro y el cambio (si aplica).',
          'Pulsa **Cerrar** para seguir vendiendo. Puedes **Imprimir ticket** si hay impresora.',
          'Si necesitas el ticket otra vez: **Reimprimir último ticket**.',
        ],
        imagen: '/tutorial-cobros/cobro-06-venta-registrada.png',
        imagenAlt: 'Modal Venta registrada',
      },
      {
        id: 'recargas',
        titulo: '7. Recargas de celular (gasto del corte)',
        cuerpo: [
          '**Importante:** las recargas **NO** se cobran en **Ventas**. No bajan inventario ni van como venta.',
          'Se registran como **gasto del turno** (egreso de efectivo / nómina del empleado).',
          '1. Menú → **Corte Virtual** o **Corte Abarrotes**.',
          '2. En **Gastos del turno**:',
          '   · **Categoría** → **EMPLEADO**',
          '   · **Empleado** → elige a la persona',
          '   · **Concepto** → **Recargas** (plantilla *Recargas*)',
          '   · **Monto** → escribe el importe',
          '3. Pulsa **Agregar**.',
        ],
        imagen: '/tutorial-cobros/cobro-05-recargas-gasto.png',
        imagenAlt: 'Gastos del turno — EMPLEADO / Recargas',
        notas: [
          'Las recargas **descuentan al empleado** en nómina.',
          'Deben capturarse **antes** de recolectar, para que la caja chica cuadre.',
        ],
      },
      {
        id: 'errores-cobro',
        titulo: '8. Errores frecuentes',
        cuerpo: [
          '· Vender en **tienda equivocada**.',
          '· En efectivo: no elegir billete ni **Monto exacto**.',
          '· **Tarjeta:** finalizar en el POS sin cobrar en la terminal.',
          '· Intentar \"vender\" una **recarga** en Ventas (debe ir a **Gastos del turno**).',
          '· No revisar el **Cambio** en efectivo MXN/USD.',
        ],
      },
      {
        id: 'frase-cobro',
        titulo: 'Frase para capacitar',
        cuerpo: [
          'En **Ventas**: arma el ticket → **Cobrar** → elige **Efectivo** (pesos o dólares) o **Tarjeta** → **Finalizar venta**.',
          'Las **recargas** van en el **corte** como gasto **EMPLEADO → Recargas**, nunca como venta.',
        ],
      },
    ],
  },
  {
    id: 'compras',
    titulo: 'Ingresar compras al sistema (Ingreso de inventario)',
    resumen:
      'Así se ingresa la mercancía del ticket del proveedor: Productos → menú ⋮ → Ajuste de inventario → Ingreso de inventario → escanear y anotar cantidad (validando el producto físico).',
    secciones: [
      {
        id: 'mapa-ingreso',
        titulo: '1. Camino en el POS',
        cuerpo: [
          '**Productos** → menú **⋮** → **Ajuste de inventario** → **Ingreso de inventario**.',
          'Luego: **escaneas** cada producto, anotas la **cantidad del ticket** y **validas** contra el producto físico.',
          'Al terminar: **Aplicar +N pieza(s)** para sumar al stock.',
        ],
        imagen: '/tutorial-ingreso-inventario/ingreso-00-mapa.png',
        imagenAlt: 'Mapa: Productos → ⋮ → Ajuste → Ingreso → Escanear + cantidad',
      },
      {
        id: 'abrir-productos',
        titulo: '2. Entra a Productos y abre el menú ⋮',
        cuerpo: [
          '1. En el menú lateral abre **Productos**.',
          '2. Arriba a la derecha toca el menú de **tres puntos (⋮)**.',
          '3. Elige **Ajuste de inventario**.',
        ],
        imagen: '/tutorial-ingreso-inventario/ingreso-01-productos-menu.png',
        imagenAlt: 'Productos · menú ⋮ · Ajuste de inventario',
        notas: [
          'El cajero también puede usar este camino (ingreso / ajuste), aunque el catálogo sea solo consulta.',
        ],
      },
      {
        id: 'elegir-ingreso',
        titulo: '3. Elige Ingreso de inventario',
        cuerpo: [
          'Se abre el modal **Ajuste de inventario**.',
          'En la lista de la izquierda toca **Ingreso de inventario** (*Dar entrada a productos en almacén*).',
          'Eso abre la pantalla **Ingreso de inventarios**.',
        ],
        imagen: '/tutorial-ingreso-inventario/ingreso-02-modal-ingreso.png',
        imagenAlt: 'Modal Ajuste de inventario · Ingreso de inventario',
        notas: [
          'No confundir con **Retiro de inventario** (resta piezas) ni con **Nuevo ajuste** (conteo).',
        ],
      },
      {
        id: 'escanear',
        titulo: '4. Escanea el producto',
        cuerpo: [
          'En **Productos a ingresar**, pon el cursor en el campo de búsqueda / escaneo (*Nombre o código…*).',
          '**Escanea el código de barras** del producto (o búscale por nombre / cámara).',
          'Ten a la mano el **ticket del proveedor** y el producto físico.',
        ],
        imagen: '/tutorial-ingreso-inventario/ingreso-03-pantalla-escanear.png',
        imagenAlt: 'Pantalla Ingreso de inventarios · campo para escanear',
      },
      {
        id: 'cantidad',
        titulo: '5. Anota la cantidad del ticket (valida el físico)',
        cuerpo: [
          'Aparece el cuadro **¿Cuántas piezas entran?** con el nombre del producto.',
          '1. Cuenta / revisa el **producto físico**.',
          '2. Compara con la **cantidad del ticket** del proveedor.',
          '3. Escribe esa cantidad en **Cantidad (piezas)** (ej. 12).',
          '4. Pulsa **Aceptar**.',
          'El producto queda en la lista. Si lo vuelves a escanear, lo que escribas se **suma** a lo ya capturado.',
        ],
        imagen: '/tutorial-ingreso-inventario/ingreso-04-cantidad.png',
        imagenAlt: 'Diálogo ¿Cuántas piezas entran?',
        notas: [
          'Las cantidades **SUMAN** al stock actual (ej. 10 + 12 = 22). No reemplazan la existencia.',
          'En tienda el ingreso va al **piso**; en CEDIS al almacén central.',
        ],
      },
      {
        id: 'aplicar',
        titulo: '6. Revisa la lista y aplica',
        cuerpo: [
          'Repite escaneo + cantidad por cada línea del ticket.',
          'Opcional: en **Motivo / referencia** escribe algo como *Recepción proveedor ticket 458*.',
          'Revisa la lista (cantidades vs ticket físico).',
          'Pulsa **Aplicar +N pieza(s)** para guardar el ingreso en el inventario.',
        ],
        imagen: '/tutorial-ingreso-inventario/ingreso-05-aplicar.png',
        imagenAlt: 'Lista de ingreso y botón Aplicar',
      },
      {
        id: 'errores-ingreso',
        titulo: '7. Errores frecuentes',
        cuerpo: [
          '· Ir al módulo **Compras** en lugar de **Productos → ⋮ → Ingreso**.',
          '· Elegir **Retiro** por error (resta en vez de sumar).',
          '· Anotar cantidad sin validar el producto físico vs el ticket.',
          '· Aplicar sin revisar la lista completa.',
          '· Olvidar el motivo/referencia del ticket del proveedor.',
        ],
      },
      {
        id: 'frase-ingreso',
        titulo: 'Frase para capacitar',
        cuerpo: [
          '**Productos → ⋮ → Ajuste de inventario → Ingreso de inventario.**',
          'Escanea → anota la cantidad del **ticket** → valida el **físico** → **Aplicar**.',
        ],
      },
    ],
  },
];
