/** Tutorial · Cancelación / Devolución de ventas en Ruta. */

const IMG = '/tutorial-cancelacion-ruta';

export const TUTORIAL_CANCELACION_RUTA = {
  id: 'cancelacion-devolucion-ruta',
  titulo: 'Cancelación / Devolución en Venta en Ruta',
  resumen:
    'Cómo deshacer una venta errónea (efectivo, crédito o mixto): solicitar → PIN admin → se revierte inventario, crédito, RC y la venta. Con evaluación.',
  interactivo: true,
  audiencia: 'ruta',
  secciones: [
    {
      id: 'mapa',
      titulo: '1. El mapa en 20 segundos',
      cuerpo: [
        'Si una venta en ruta salió mal (tienda equivocada, método incorrecto, cantidad de más), **no la ignores**.',
        'Flujo: **Solicitar cancelación → Admin aprueba con PIN → el sistema revierte todo**.',
        'Frase clave: **Pides · admin aprueba · inventario vuelve · crédito y efectivo desaparecen.**',
      ],
      imagen: `${IMG}/01-mapa-flujo.svg`,
      imagenAlt: 'Mapa: venta errónea → solicitar → PIN admin → revierte camión, CxC, RC, compra y venta',
      notas: [
        'Solo funciona en ventas de **Venta en Ruta**. No es el cancelar carga del camión.',
        'Sin PIN de administrador / gerente la venta **no** se borra.',
      ],
    },
    {
      id: 'cuando',
      titulo: '2. ¿Cuándo sí cancelar?',
      cuerpo: [
        'Usa Cancelación / Devolución cuando la venta ya quedó registrada y está mal:',
        '· Destino equivocado (ej. cobraste a 3B3 en vez de 3B10).',
        '· Método incorrecto (crédito cuando iba efectivo, o al revés).',
        '· **Mixto** mal armado (montos de efectivo/crédito incorrectos).',
        '· Cantidad o productos de más.',
        'No la uses para «arreglar» un camión vacío: eso es **Cancelar carga** o **Liquidar** en Consultas → Cargas.',
      ],
      imagen: `${IMG}/02-cuando-cancelar.svg`,
      imagenAlt: 'Casos válidos: tienda mal, método mal, mixto mal; vs cancelar carga',
    },
    {
      id: 'solicitar',
      titulo: '3. Solicitar la cancelación',
      cuerpo: [
        'Entra a **Venta en Ruta → Cancelación / Devolución**.',
        'Elige el **folio** de la venta (efectivo, crédito o mixto).',
        'Escribe el **motivo** claro (quién se equivocó y por qué).',
        'Pulsa **Solicitar cancelación (PIN admin)**.',
        'Queda en **Pendientes de aprobación** hasta que un admin/gerente la apruebe.',
      ],
      imagen: `${IMG}/03-solicitar.svg`,
      imagenAlt: 'Pantalla: elegir folio, motivo y solicitar cancelación',
      notas: [
        'Si el efectivo ya está **Liquidado** en RC/VentaRuta, el sistema puede bloquear la solicitud.',
      ],
    },
    {
      id: 'aprobar',
      titulo: '4. Admin aprueba con PIN',
      cuerpo: [
        'El administrador o gerente ve una **notificación flotante** (o la lista de pendientes en la misma pantalla).',
        'Revisa folio, monto, método (efectivo / crédito / mixto) y motivo.',
        'Captura su **PIN** y pulsa **Aprobar cancelación**.',
        'También puede **Rechazar** si el motivo no procede.',
        'Sin este PIN, inventario, crédito y RC **siguen iguales**.',
      ],
      imagen: `${IMG}/04-aprobar-pin.svg`,
      imagenAlt: 'Notificación admin y captura de PIN para aprobar',
    },
    {
      id: 'que-revierte',
      titulo: '5. Qué se revierte al aprobar',
      cuerpo: [
        'Al aprobar, el sistema hace todo esto en orden:',
        '1. **Camión** — baja `qty_vendida` (la mercancía vuelve a Disp.).',
        '2. **Tienda** — si ya se recibió en Compras, **descuenta el piso**.',
        '3. **Crédito / mixto** — borra el cargo (y abonos ligados) en CxC.',
        '4. **Efectivo** — quita el movimiento de **RC/VentaRuta** Pendientes.',
        '5. **Compra** — elimina el pedido / recepción ligada.',
        '6. **Venta** — borra el registro del folio (el historial queda en cancelaciones).',
      ],
      imagen: `${IMG}/05-que-revierte.svg`,
      imagenAlt: 'Seis bloques: camión, tienda, CxC, RC, compra, venta',
      notas: [
        'Si algo crítico no se puede revertir (ej. inventario del camión), **no** se marca como aprobada a medias.',
      ],
    },
    {
      id: 'mixto',
      titulo: '6. Caso especial: pago mixto',
      cuerpo: [
        'Una venta **mixto** tiene parte efectivo + parte crédito.',
        'Al cancelar se revierten **ambos**: el efectivo sale de RC/VentaRuta y el crédito sale de CxC.',
        'También vuelve el inventario completo (no solo «la mitad»).',
        'Revisa en el resumen de aprobación: debe decir camión + crédito + efectivo RC.',
      ],
      imagen: `${IMG}/06-mixto.svg`,
      imagenAlt: 'Mixto: efectivo a RC y crédito a CxC; al cancelar se limpian los dos',
    },
    {
      id: 'errores',
      titulo: '7. Errores típicos (evítalos)',
      cuerpo: [
        '· Pedir cancelación y **no esperar el PIN** del admin (nada se borra).',
        '· Confundir con **Cancelar carga** (eso es mercancía sin vender → CEDIS).',
        '· Creer que «Eliminar ingreso» en Consultas revierte una venta (solo borra el ticket de carga).',
        '· Cancelar cuando el efectivo ya está **Liquidado** en RC (hay que aclarar a mano).',
        '· Usar cancelación para un ajuste chico de piezas: mejor corregir en la siguiente venta o con admin.',
      ],
      imagen: `${IMG}/07-errores.svg`,
      imagenAlt: 'Checklist de errores típicos al cancelar ventas de ruta',
    },
    {
      id: 'quiz',
      titulo: '8. Evaluación (te calificamos)',
      cuerpo: [
        'Responde las 8 preguntas. Al terminar verás **puntaje, porcentaje y calificación** (A–F).',
        'Apruebas con **70% o más** (C o mejor). Si no, reintenta tras repasar.',
      ],
      imagen: `${IMG}/08-evaluacion.svg`,
      imagenAlt: 'Ejemplo de calificación del tutorial de cancelación',
      quiz: [
        {
          id: 'q1',
          pregunta: '¿Quién debe aprobar una cancelación / devolución de venta en ruta?',
          opciones: [
            'Cualquier cajero de piso con su PIN',
            'Administrador o gerente con PIN',
            'Solo el repartidor que vendió',
            'Nadie: se borra sola al pedirla',
          ],
          correcta: 1,
          explicacion: 'La solicitud queda pendiente hasta el **PIN de admin / gerente**.',
        },
        {
          id: 'q2',
          pregunta: 'Al aprobar, ¿qué pasa con el inventario del camión?',
          opciones: [
            'No cambia nada',
            'Baja qty_vendida y la mercancía vuelve a disponible',
            'Se manda todo a Tesorería Cheche',
            'Solo imprime un ticket vacío',
          ],
          correcta: 1,
          explicacion: 'Se **devuelve al camión** (menos vendido = más Disp.).',
        },
        {
          id: 'q3',
          pregunta: 'Una venta a crédito cancelada…',
          opciones: [
            'Deja el cargo en CxC para siempre',
            'Borra el crédito / cargo en CxC ligado a ese folio',
            'Lo convierte en gasto de abarrotes',
            'Lo manda a Pendientes de servicios',
          ],
          correcta: 1,
          explicacion: 'El **crédito de esa venta** se elimina de Créditos por pagar / CxC.',
        },
        {
          id: 'q4',
          pregunta: 'En una venta mixto, al cancelar…',
          opciones: [
            'Solo se quita el efectivo',
            'Solo se quita el crédito',
            'Se revierten efectivo (RC) y crédito (CxC), más el inventario',
            'No se puede cancelar un mixto',
          ],
          correcta: 2,
          explicacion: 'Mixto = **ambos** lados + inventario completo.',
        },
        {
          id: 'q5',
          pregunta: 'Si la tienda ya recibió la compra, al cancelar la venta…',
          opciones: [
            'El piso de la tienda no se toca',
            'Se descuenta el inventario de piso de esa recepción',
            'Se duplica el stock en CEDIS',
            'Solo se borra el ticket de corte',
          ],
          correcta: 1,
          explicacion: 'Si ya entró a piso, la devolución **descuenta** esa mercancía.',
        },
        {
          id: 'q6',
          pregunta: '¿Dónde se solicita la cancelación?',
          opciones: [
            'Checador → Historial',
            'Venta en Ruta → Cancelación / Devolución',
            'Tesorería → Cheche',
            'Productos → Ajuste masivo',
          ],
          correcta: 1,
          explicacion: 'El módulo está en el hub de **Venta en Ruta**.',
        },
        {
          id: 'q7',
          pregunta: '«Cancelar carga» en Consultas → Cargas…',
          opciones: [
            'Es lo mismo que cancelar una venta cobrada',
            'Devuelve mercancía sin vender a CEDIS (sin ventas en esa carga)',
            'Borra todos los créditos del día',
            'Aprueba sola las cancelaciones pendientes',
          ],
          correcta: 1,
          explicacion: '**Cancelar carga** ≠ cancelar venta. Carga sin ventas → CEDIS.',
        },
        {
          id: 'q8',
          pregunta: '¿Cuál es la frase correcta del flujo?',
          opciones: [
            'Borras a mano el crédito · el camión no se toca · sin PIN',
            'Pides · admin aprueba · inventario vuelve · crédito y efectivo desaparecen',
            'Solo PIN del vendedor · nunca admin · RC se queda',
            'Eliminar ingreso = devolver toda la venta',
          ],
          correcta: 1,
          explicacion: '**Pides · admin aprueba · inventario vuelve · crédito y efectivo desaparecen.**',
        },
      ],
    },
    {
      id: 'frase',
      titulo: 'Frase para capacitar',
      cuerpo: [
        '**Venta mal → Cancelación / Devolución → motivo claro → PIN admin → camión + tienda + crédito/mixto + RC + compra + venta limpios.**',
        'Si fallaste la evaluación: repasa qué se revierte y la diferencia con Cancelar carga; luego **Reintentar**.',
      ],
    },
  ],
};
