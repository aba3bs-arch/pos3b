/** Tutorial · Venta en Ruta (CEDIS → camión → POS → corte). */

const IMG = '/tutorial-venta-ruta';

export const TUTORIAL_VENTA_EN_RUTA = {
  id: 'venta-en-ruta',
  titulo: 'Venta en Ruta: de la carga al corte',
  resumen:
    'Operación completa: camiones, carga CEDIS→camión, POS móvil, créditos, preinventario, consultas y corte. Termina con evaluación calificada.',
  interactivo: true,
  audiencia: 'ruta',
  secciones: [
    {
      id: 'mapa',
      titulo: '1. El mapa en 20 segundos',
      cuerpo: [
        '**Venta en Ruta** mueve mercancía del **CEDIS** al **camión** y vende en tiendas o clientes externos.',
        'Flujo: **Camiones → Carga → POS (vender) → Consultas / Créditos → Corte / RC/VentaRuta**.',
        'Frase clave: **CEDIS guarda · camión lleva · POS vende · corte cierra.**',
      ],
      imagen: `${IMG}/01-mapa-flujo.svg`,
      imagenAlt: 'Mapa del flujo: CEDIS → camión → POS → consultas → corte',
      notas: [
        'Cada persona ve solo los botones que le tocan (privilegios). Administrador ve todo.',
      ],
    },
    {
      id: 'camiones',
      titulo: '2. Camiones (quién lleva qué)',
      cuerpo: [
        'Abre **Camiones**: da de alta el vehículo y **asígnarlo al recolector / repartidor**.',
        'Sin camión asignado, la carga y el POS no saben de quién es el inventario.',
        'Un camión = una operación limpia. No mezcles repartidores en el mismo camión el mismo día sin cerrar la carga.',
      ],
      imagen: `${IMG}/02-camiones.svg`,
      imagenAlt: 'Pantalla de alta de camión con asignación a recolector',
    },
    {
      id: 'carga',
      titulo: '3. Carga de camión (sale CEDIS)',
      cuerpo: [
        '**Carga de camión**: elige recolector/camión, captura productos y **aplica**.',
        'Al aplicar: **baja stock CEDIS**, sube mercancía al camión y se **imprime un ticket** (`CI-…`).',
        'Ese ticket queda registrado en **Consultas → Ingresos** (puedes **reimprimir** para aclaraciones).',
        'Si el camión ya no tiene Disp., el sistema **cierra la carga vacía** y abre una nueva (historial limpio).',
        '¿Te equivocaste y aún no hay ventas? En Consultas → **Cargas → Cancelar** (regresa a CEDIS).',
      ],
      imagen: `${IMG}/03-carga-camion.svg`,
      imagenAlt: 'Aplicar carga: baja CEDIS, sube camión y genera ticket',
      notas: [
        'Cada aplicación de carga deja su propio registro (no solo el acumulado de la carga).',
      ],
    },
    {
      id: 'precios',
      titulo: '4. Precios de ruta',
      cuerpo: [
        '**Precios de ruta**: precio especial de venta en el camión (sin impuestos de piso).',
        'Úsalo antes de vender si el producto necesita tarifa distinta a la de tienda.',
        'El POS toma el precio de ruta cuando existe; si no, el precio del catálogo.',
      ],
      imagen: `${IMG}/04-precios-ruta.svg`,
      imagenAlt: 'Comparación precio de tienda vs precio de ruta',
    },
    {
      id: 'pos-sesion',
      titulo: '5. POS: entrar con el vendedor',
      cuerpo: [
        'En **POS venta en ruta** elige el **vendedor / recolector** y captura su **PIN**.',
        'La sesión amarra el carrito a esa persona (si cambias de vendedor, cambia el carrito).',
        'En celular verás sobre todo el **selector de destino** y el **carrito** — así cabe mejor en pantalla chica.',
      ],
      imagen: `${IMG}/05-pos-sesion.svg`,
      imagenAlt: 'Login del POS de ruta con vendedor y PIN',
    },
    {
      id: 'pos-venta',
      titulo: '6. POS: destino, catálogo y cobro',
      cuerpo: [
        '1. Elige **tienda / cliente** (destino).',
        '2. Navega por **departamentos**, toca productos o **escanea**.',
        '3. Revisa el **carrito** (cantidades) y cobra.',
        'Pagos: **efectivo**, **crédito** o **mixto** (parte efectivo + parte crédito).',
        'Efectivo va a tránsito / RC Abarrotes del recolector. Crédito queda por cobrar en tienda.',
        'La venta genera pedido en Compras para que la **tienda reciba** la mercancía.',
      ],
      imagen: `${IMG}/06-pos-venta.svg`,
      imagenAlt: 'Layout del POS: destino, catálogo y carrito',
      notas: [
        'Sin destino no hay catálogo. Sin mercancía en camión: carga primero en CEDIS.',
      ],
    },
    {
      id: 'preinventario',
      titulo: '7. Preinventario del camión',
      cuerpo: [
        '**Preinventario**: cuenta lo que hay en el camión **sin cambiar** el teórico del sistema.',
        'Sirve para detectar faltantes/sobrantes antes del corte.',
        'Puedes trabajar con **toda la mercancía del camión** (no hace falta elegir un folio a mano).',
      ],
      imagen: `${IMG}/07-preinventario.svg`,
      imagenAlt: 'Tabla de preinventario con teórico, contado y diferencia',
    },
    {
      id: 'creditos',
      titulo: '8. Créditos por pagar',
      cuerpo: [
        'Ventas a **crédito** aparecen en **Créditos por pagar**.',
        'El cajero de tienda las liquida con **PIN** cuando el cliente / la ruta liquida.',
        'No confundas crédito de ruta con un gasto de recepción: el crédito es **cuenta por cobrar**.',
      ],
      imagen: `${IMG}/08-creditos.svg`,
      imagenAlt: 'Lista de créditos pendientes y pasos para liquidar en tienda',
    },
    {
      id: 'consultas',
      titulo: '9. Consultas (historial y aclaraciones)',
      cuerpo: [
        '**Ingresos**: cada aplicación de carga (ticket `CI-…`) → Detalle / **Reimprimir**.',
        '**Ventas**: tickets de ruta del día.',
        '**Cargas**: estado en_ruta / liquidada / cancelada · **Liquidar** o **Cancelar**.',
        '**Créditos cobrados**: historial de liquidaciones en tienda.',
      ],
      imagen: `${IMG}/09-consultas.svg`,
      imagenAlt: 'Consultas Ingresos con botón Reimprimir del ticket de carga',
    },
    {
      id: 'corte-liq',
      titulo: '10. Corte de caja y liquidación',
      cuerpo: [
        '**Corte de caja** (ruta): admin cierra el turno del vendedor, revisa efectivo/crédito y **imprime**.',
        'El corte puede mostrar **desglose por tienda** (cuánto se vendió a cada destino).',
        '**RC/VentaRuta**: recibe el efectivo que trae el recolector (recolecciones).',
        'Si queda Disp. en el camión al liquidar la carga, el resto **vuelve a CEDIS**.',
      ],
      imagen: `${IMG}/10-corte-liquidacion.svg`,
      imagenAlt: 'Corte de caja de ruta y panel de liquidación',
    },
    {
      id: 'errores',
      titulo: '11. Errores típicos (evítalos)',
      cuerpo: [
        '· Cargar sin elegir **recolector/camión**.',
        '· Vender sin **destino** o con camión vacío.',
        '· Poner todo el mixto como efectivo (separa efe + crédito).',
        '· Cancelar una carga que **ya tiene ventas** (usa liquidar / devolver piezas).',
        '· Inventar el efectivo del corte: cuenta, anota, avisa.',
      ],
      imagen: `${IMG}/11-errores.svg`,
      imagenAlt: 'Checklist de errores típicos a evitar en Venta en Ruta',
    },
    {
      id: 'quiz',
      titulo: '12. Evaluación (te calificamos)',
      cuerpo: [
        'Responde las 8 preguntas. Al terminar verás **puntaje, porcentaje y calificación** (A–F).',
        'Apruebas con **70% o más** (C o mejor). Si no, reintenta tras repasar.',
      ],
      imagen: `${IMG}/12-evaluacion.svg`,
      imagenAlt: 'Ejemplo de calificación del tutorial (letra y porcentaje)',
      quiz: [
        {
          id: 'q1',
          pregunta: '¿Qué pasa al aplicar una carga al camión?',
          opciones: [
            'Solo imprime un ticket, el stock no cambia',
            'Baja CEDIS, sube al camión y queda ticket/registro',
            'Sube stock en la tienda destino al instante',
            'Abre el corte de caja automáticamente',
          ],
          correcta: 1,
          explicacion: 'La carga **descuenta CEDIS**, pone mercancía en el camión y deja **ticket + registro** para aclaraciones.',
        },
        {
          id: 'q2',
          pregunta: '¿Dónde reimprimir el ticket de una carga aplicada?',
          opciones: [
            'Productos → Ajuste',
            'Consultas → Ingresos → Reimprimir',
            'Checador → Historial',
            'Solo en el correo del admin',
          ],
          correcta: 1,
          explicacion: '**Consultas → Ingresos** lista cada aplicación (`CI-…`) con Detalle y **Reimprimir**.',
        },
        {
          id: 'q3',
          pregunta: 'Antes de vender en el POS de ruta, ¿qué debes elegir primero?',
          opciones: [
            'El corte de caja',
            'El departamento de MAIN',
            'El destino (tienda / cliente)',
            'Un pagaré',
          ],
          correcta: 2,
          explicacion: 'Sin **destino** no se abre el catálogo del camión para esa venta.',
        },
        {
          id: 'q4',
          pregunta: 'En un pago mixto, ¿qué debes capturar?',
          opciones: [
            'Solo el total como efectivo',
            'Parte efectivo y parte crédito (separadas)',
            'Solo crédito aunque haya billetes',
            'Nada: el sistema adivina',
          ],
          correcta: 1,
          explicacion: 'Mixto = **efe + crédito** por separado. No metas todo como efectivo.',
        },
        {
          id: 'q5',
          pregunta: 'Si la carga aún no tiene ventas y te equivocaste al cargar, ¿qué haces?',
          opciones: [
            'Borras productos a mano del CEDIS',
            'Consultas → Cargas → Cancelar (regresa a CEDIS)',
            'Haces un corte en cero',
            'Ignoras el error',
          ],
          correcta: 1,
          explicacion: '**Cancelar** (sin ventas) devuelve la mercancía a CEDIS.',
        },
        {
          id: 'q6',
          pregunta: '¿Para qué sirve el preinventario del camión?',
          opciones: [
            'Para borrar el teórico del sistema',
            'Para contar sin afectar el teórico (detectar faltantes)',
            'Para crear usuarios repartidores',
            'Para liquidar créditos de tienda',
          ],
          correcta: 1,
          explicacion: 'Es conteo de control: **no modifica** el inventario teórico.',
        },
        {
          id: 'q7',
          pregunta: 'Una venta a crédito en ruta…',
          opciones: [
            'Se borra sola al día siguiente',
            'Queda en Créditos por pagar para liquidar en tienda',
            'Es un gasto de recepción de abarrotes',
            'No se puede hacer',
          ],
          correcta: 1,
          explicacion: 'El crédito es **cuenta por cobrar**; el cajero la liquida en **Créditos por pagar**.',
        },
        {
          id: 'q8',
          pregunta: '¿Cuál es la frase correcta del flujo?',
          opciones: [
            'Tienda guarda · CEDIS vende · camión corta',
            'CEDIS guarda · camión lleva · POS vende · corte cierra',
            'POS carga · CEDIS cobra · camión cancela',
            'Corte primero · luego carga · nunca POS',
          ],
          correcta: 1,
          explicacion: '**CEDIS guarda · camión lleva · POS vende · corte cierra.**',
        },
      ],
    },
    {
      id: 'frase',
      titulo: 'Frase para capacitar',
      cuerpo: [
        '**Camión asignado → carga (ticket) → POS con destino → cobra bien (efe/créd/mixto) → consultas si hay duda → corte / liquidación.**',
        'Si fallaste la evaluación: repasa carga, POS y consultas; luego **Reintentar**.',
      ],
    },
  ],
};
