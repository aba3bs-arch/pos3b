/** Tutorial · Crédito fin de año (cajero abona, repartidor solo mira, MAIN liquida). */

const IMG = '/tutorial-credito-fin-anio';

export const TUTORIAL_CREDITO_FIN_ANIO = {
  id: 'credito-fin-anio',
  titulo: 'Crédito fin de año: quién ve qué',
  resumen:
    'El cajero entrega el abono. El repartidor solo mira las cuentas y aprueba con PIN. MAIN liquida. Con imágenes y evaluación.',
  interactivo: true,
  audiencia: 'ruta',
  secciones: [
    {
      id: 'papeles',
      titulo: '1. Tres papeles, una sola regla',
      cuerpo: [
        '**Cajero:** entrega el dinero en la tienda. Solo ve el formulario de abono.',
        '**Repartidor / recolector:** ingresa el producto en **Cuentas** y lo retira si se equivocó. No borra cuentas ni abonos, y no liquida.',
        '**MAIN:** ve todas las tiendas y la pestaña **Liquidación**.',
        'Regla: **si el repartidor no aprueba con PIN, no hay abono y no hay gasto.**',
      ],
      imagen: `${IMG}/01-tres-papeles.svg`,
      imagenAlt: 'Cajero entrega el dinero, repartidor aprueba con PIN, MAIN liquida',
    },
    {
      id: 'cajero',
      titulo: '2. El cajero solo llena el abono',
      cuerpo: [
        'Entra a **Venta en Ruta → Abono fin de año**.',
        'Captura **Monto**, elige **Repartidor que recibe** y, si quieres, una **Nota**.',
        'Pulsa **Enviar abono**. Todavía no se descuenta el crédito ni entra a gastos.',
        'Si te equivocaste y sigue en espera, pulsa **Cancelar**.',
      ],
      imagen: `${IMG}/02-cajero-abono.svg`,
      imagenAlt: 'Formulario de abono: monto 480, repartidor Luis Enrique, nota y botón Enviar abono',
    },
    {
      id: 'repartidor',
      titulo: '3. El repartidor solo mira Cuentas',
      cuerpo: [
        'Entra a **Venta en Ruta → Crédito fin de año**.',
        'Ahí está la pestaña **Cuentas**. La de **Liquidación** no le aparece.',
        'Abre la tienda y usa **Dejar mercancía a crédito**: código, cantidad y precio.',
        'Si se equivocó, **Retirar de la cuenta** saca ese producto. No hay **Editar**, **Eliminar** ni **Enviar abono**.',
      ],
      imagen: `${IMG}/03-repartidor-cuentas.svg`,
      imagenAlt: 'Pestaña Cuentas visible y Liquidación tachada. El repartidor no puede borrar ni cambiar',
    },
    {
      id: 'pin',
      titulo: '4. El PIN decide si el dinero entra',
      cuerpo: [
        'Al repartidor le sale un aviso: **Recibes** el monto, la tienda y la nota.',
        '**Aprobar con PIN:** el crédito baja y el dinero se anota en gastos de Abarrotes.',
        '**Rechazar:** se cancela. No queda abono ni gasto.',
        'Cerrar la ventana con la X deja el aviso pendiente. No aprueba ni rechaza.',
      ],
      imagen: `${IMG}/04-pin.svg`,
      imagenAlt: 'Aviso flotante Recibes 480, con aprobar en verde y rechazar en rojo',
    },
    {
      id: 'liquidacion',
      titulo: '5. Cómo se lee la liquidación',
      cuerpo: [
        'Arriba está el **total de las tiendas**. Abajo se restan los **abonos**.',
        'Ejemplo: se dejaron **$1,480** y abonaron **$480**. La liquidación es **$480**.',
        'Al pulsar **Liquidar**, el total de las tiendas queda en **$1,000** y esa línea se guarda en el registro.',
        'El siguiente abono abre una línea nueva. El repartidor no ve ni pulsa Liquidar.',
      ],
      imagen: `${IMG}/05-liquidacion.svg`,
      imagenAlt: 'Total 1480 menos abonos 480 igual a liquidación 480. Después el total queda en 1000',
    },
    {
      id: 'quiz',
      titulo: '6. Evaluación',
      cuerpo: ['Responde para confirmar que cada quien ve lo suyo.'],
      quiz: [
        {
          id: 'q1',
          pregunta: '¿Qué ve el cajero al entrar a abonar?',
          opciones: [
            'Todas las tiendas, el inventario y la liquidación',
            'Solo el formulario: monto, repartidor y nota',
            'Solo la pestaña Liquidación',
            'Nada: el cajero no entra a este módulo',
          ],
          correcta: 1,
          explicacion: 'El cajero entra a **Abono fin de año** y solo ve el formulario.',
        },
        {
          id: 'q2',
          pregunta: '¿Qué puede hacer el repartidor en Crédito fin de año?',
          opciones: [
            'Borrar cuentas y cambiar abonos',
            'Liquidar el dinero de todas las tiendas',
            'Ver Cuentas, ingresar producto y retirarlo si se equivoca',
            'Enviar el abono desde la tienda',
          ],
          correcta: 2,
          explicacion: 'El repartidor **ingresa y retira mercancía** en Cuentas. No borra cuentas ni liquida.',
        },
        {
          id: 'q3',
          pregunta: 'Si el repartidor rechaza el PIN, ¿qué pasa con el dinero?',
          opciones: [
            'Se anota en gastos de Abarrotes',
            'Se descuenta del crédito y queda pendiente de liquidar',
            'Se cancela: no hay abono ni gasto',
            'Pasa directo a la liquidación',
          ],
          correcta: 2,
          explicacion: 'Sin aprobación **no se registra** el abono ni el gasto.',
        },
        {
          id: 'q4',
          pregunta: 'Dejaron $1,480 y abonaron $480. ¿Cuánto es la liquidación y cuánto queda el total después de liquidar?',
          opciones: [
            'Liquidación $1,480 y el total sigue en $1,480',
            'Liquidación $480 y el siguiente total queda en $1,000',
            'Liquidación $1,000 y el total queda en $480',
            'Liquidación $0 porque el repartidor solo mira',
          ],
          correcta: 1,
          explicacion: 'La liquidación es el abono (**$480**). Al cerrarla, el total de las tiendas queda en **$1,000**.',
        },
      ],
    },
  ],
};
