/** Tutorial (con humor) · Herramienta de compras: pedido, recepción, entrega directa, por recibir e historial. */

const IMG = '/tutorial-compras';

export const TUTORIAL_COMPRAS = {
  id: 'herramienta-compras',
  titulo: 'La banda va de compras: pedido, recepción y entrega directa (con chistes)',
  resumen:
    'Aprende la herramienta de Compras con Don Billete, Pepe, Doña Cuentas y Camionsito: elegir proveedor, leer la cantidad sugerida, generar el pedido, recibir la mercancía contra el ticket, entrega directa, Por recibir e Historial. Con evaluación.',
  interactivo: true,
  secciones: [
    {
      id: 'banda',
      titulo: '1. La banda va de compras',
      cuerpo: [
        'Para que comprar no se sienta como pagar el predial, te presentamos al elenco:',
        '**Don Billete:** el que paga. Cada peso que sale de aquí le duele.',
        '**Pepe:** el que recibe y cuenta la mercancía. Le encanta escanear.',
        '**Doña Cuentas:** la que compara el ticket del proveedor contra lo que realmente llegó. No se le escapa un centavo.',
        '**Camionsito:** el que trae la mercancía. Muy amable, pero siempre hay que contar lo que baja.',
        'La herramienta de compras tiene **tres pestañas**: **Herramienta de compra** (donde se pide o se recibe), **Por recibir** (pedidos esperando mercancía) e **Historial de compras** (lo ya recibido).',
      ],
      imagen: `${IMG}/01-banda.jpg`,
      imagenAlt: 'Don Billete, Pepe, Doña Cuentas y Camionsito, los personajes del tutorial',
    },
    {
      id: 'caminos',
      titulo: '2. Dos caminos: Pedido + recepción o Entrega directa',
      cuerpo: [
        'Primero elige el **Proveedor**. Luego, según cómo te surta, hay dos caminos:',
        '**Pedido (recepción después)** — para el **mayorista**. Generas el pedido, queda en **Por recibir** y el **inventario no cambia** hasta que llega la mercancía y la recibes.',
        '**Entrega directa a inventario** — para **preventa / repartidor**. Capturas lo que ya te entregaron y entra **de inmediato** al inventario (CEDIS en MAIN, piso en tiendas).',
        'Si el proveedor ya está configurado como entrega directa, la pantalla te lo avisa. Si quieres retomar un pedido que ya hiciste, elígelo en **Pedido pendiente (recepción)**.',
        'Pista: **si la mercancía todavía no llega, es Pedido. Si ya está en tus manos, es Entrega directa o Recepción.**',
      ],
      imagen: `${IMG}/02-caminos.jpg`,
      imagenAlt: 'Camionsito en una bifurcación: a la izquierda una bodega con reloj de arena (pedido), a la derecha una tienda con rayo (entrega directa)',
      notas: [
        'Si el proveedor no tiene productos en su catálogo, no se puede abrir la herramienta: ve a **Proveedores**, agrega los productos al catálogo y regístralos en inventario (hay un botón **Gestionar proveedores**).',
      ],
    },
    {
      id: 'sugerido',
      titulo: '3. La tabla: Teórico, Sugerido y Pedido (la bola de cristal de Doña Cuentas)',
      cuerpo: [
        'Al abrir un **Nuevo pedido** ves una tabla con estas columnas:',
        '**Código · Descripción · Precio · Teórico · Sugerido · Pedido · Costo.**',
        '**Teórico:** las piezas que el sistema cree que tienes ahora (el stock).',
        '**Sugerido:** cuánto conviene pedir. Se calcula con tu stock, el **mínimo** del producto (o el **Umbral** de la pantalla, 8 por defecto) y **lo vendido** en el periodo elegido: si se vende mucho, sugiere más.',
        '**Pedido:** lo que de verdad vas a pedir. Pulsa **Enter** en una fila para **aceptar la sugerida** y saltar a la siguiente; o escribe tú la cantidad.',
        '**Costo:** el costo estimado por pieza. Puedes corregirlo si el proveedor te dio otro precio.',
        'Por defecto solo ves los productos que **conviene pedir** (sugerido mayor que cero). Activa **Ver todo el catálogo** para ver todos.',
      ],
      imagen: `${IMG}/03-sugerido.jpg`,
      imagenAlt: 'Doña Cuentas consultando una bola de cristal con productos mientras Pepe sostiene una lista de compras larguísima',
      notas: [
        '**Ventas para sugerencia de pedido:** elige 7 días, 14 días, mes actual o un rango. Mientras más representativo el periodo, mejor la sugerencia.',
        'La casilla **Detalle ventas por día** agrega columnas con lo vendido en cada uno de los últimos 7 días, por si un solo día infló el número.',
        'La **sugerida es solo una sugerencia**: tú conoces tu tienda (temporada, promos, pedidos grandes) mejor que cualquier fórmula.',
      ],
    },
    {
      id: 'pedido',
      titulo: '4. Generar el pedido: va a «Por recibir», el inventario no se mueve',
      cuerpo: [
        'Captura las cantidades, agrega **Notas al proveedor** si quieres y pulsa **Generar pedido (sin tocar inventario)**.',
        'Se guarda en la pestaña **Por recibir** y se **imprime el ticket del pedido** para dárselo al proveedor.',
        'Con **Imprimir pedido** puedes sacar el ticket antes de guardar.',
        '**Importante:** el inventario sigue igual. Un pedido es una **promesa de compra**, no mercancía. Don Billete lo anota, pero todavía no paga.',
        'Después, en **Por recibir**, puedes **Reimprimir ticket**, **Recibir** cuando llegue o **Eliminar** si se canceló.',
      ],
      imagen: `${IMG}/04-pedido.jpg`,
      imagenAlt: 'Pepe entregando el pedido impreso a Camionsito mientras el estante sigue vacío y un reloj de arena espera',
      notas: [
        'Si te aparece un mensaje de que falta actualizar la tabla de compras, es un asunto de base de datos: pide a un administrador ejecutar el SQL **fix_compras_items.sql** en Supabase.',
      ],
    },
    {
      id: 'recepcion',
      titulo: '5. Recibir la mercancía: escanea, compara el ticket y confirma',
      cuerpo: [
        'Cuando llegue Camionsito, abre **Por recibir → Recibir** (o elige el pedido en **Pedido pendiente (recepción)**). La pantalla cambia a **Recepción de mercancía**:',
        '**Columna Pedido:** lo que ordenaste (solo lectura). **Columna Recepción:** lo que **realmente llegó**: captúralo.',
        '**Escanea** cada código para sumar **+1** en Recepción, o escribe la cantidad. Si el producto no está en la lista te avisa.',
        'Pulsa **Recibir mercancía**. El sistema te pide el **total del ticket del proveedor** (propone el calculado por líneas): pon el que dice el papel, no el que tú crees. Doña Cuentas va a mirar.',
        'Al confirmar: el **inventario sube** con lo recibido, el pedido pasa a **Historial de compras**, se imprime el **ticket de recepción** y se **carga el gasto al Corte Abarrotes** (efectivo). Si la compra es a **crédito**, no hay gasto en el corte: se carga al cobrar el crédito en Cobranza ruta.',
        'Solo entran al inventario las líneas con cantidad en **Recepción**; lo que no llegó, no suma.',
      ],
      imagen: `${IMG}/05-recepcion.jpg`,
      imagenAlt: 'Pepe escaneando una caja, Doña Cuentas comparando el ticket con lupa, Camionsito descargando y Don Billete con la cartera lista',
      notas: [
        'El folio de la compra lleva sufijo de pago: **-E** efectivo, **-C** crédito, **-M** mixto.',
        'Si algún movimiento queda **pendiente de subir a la nube**, el stock ya cambió y se reintenta al abrir Consultas → Inventario. **No borres la caché local** de la app.',
      ],
    },
    {
      id: 'directa',
      titulo: '6. Entrega directa: el atajo (sin pedido previo)',
      cuerpo: [
        'Elige el proveedor y pulsa **Entrega directa a inventario**. La tabla tiene la columna **Cantidad entregada** (no hay columna Recepción).',
        'Escanea o captura lo entregado, agrega **Notas de la entrega** y pulsa **Registrar entrega e inventario**.',
        'Igual que en la recepción, te pide el **total del ticket / nota del proveedor**, sube el inventario, guarda el registro como **recibida** en el Historial y carga el gasto al **Corte Abarrotes**.',
        '**Imprimir entrega** saca el comprobante.',
      ],
      notas: [
        'No hay paso intermedio en **Por recibir**: la entrega directa va **directo al Historial**.',
      ],
    },
    {
      id: 'historial',
      titulo: '7. Por recibir e Historial: botones y reglas',
      cuerpo: [
        '**Por recibir:** pedidos pendientes. Botones: **Recibir**, **Reimprimir ticket** y **Eliminar** (cancela el pedido **sin mover inventario**, porque aún no se había recibido).',
        '**Historial de compras:** recepciones ya aplicadas. Botones: **Editar folio**, **Reimprimir ticket** (el de recepción) y **Eliminar**.',
        'Ambas pestañas tienen **filtro de periodo** (los últimos 8 días por defecto, 14 días, mes actual o un rango).',
        'El Historial conserva **8 días**; después las compras pasan automáticamente a **Contabilidad → Archivo**.',
        '**Eliminar una compra ya recibida** solo lo puede hacer **administrador o gerente**, y **solo la quita del historial**: **no descuenta el inventario ni anula el gasto del corte**.',
      ],
      imagen: `${IMG}/06-historial.jpg`,
      imagenAlt: 'Doña Cuentas archivando folders, Don Billete sellando tickets que salen de una impresora y Pepe con un ticket reimpreso',
      notas: [
        'Si compraste de más o hay que devolver mercancía, **eliminar del historial no es la solución**: el stock y el gasto se quedan como estaban. Pide la corrección al administrador.',
      ],
    },
    {
      id: 'errores',
      titulo: '8. Errores típicos (y cómo evitarlos)',
      cuerpo: [
        '**Escribir en Recepción lo pedido y no lo recibido.** Cuenta lo que baja del camión, no lo que dice el papel de pedido.',
        '**Poner el total del ticket de memoria.** Úsalo tal cual viene en el ticket del proveedor: de ahí sale el gasto del corte.',
        '**Hacer un Pedido cuando la mercancía ya está en la bodega.** Mejor usa Entrega directa; si no, tendrás que recibirlo después y duplicar pasos.',
        '**Aceptar la sugerida a ciegas.** Es una guía; si hay promo o temporada ajusta el Pedido.',
        '**Eliminar del historial para «arreglar» un error.** No mueve inventario ni gasto; solo esconde el registro.',
      ],
    },
    {
      id: 'quiz',
      titulo: '9. Evaluación (Doña Cuentas te califica)',
      cuerpo: [
        'Responde las 9 preguntas. Al terminar verás **puntaje, porcentaje y calificación** (A–F).',
        'Apruebas con **70% o más** (C o mejor). Si no, reintenta tras repasar, y Doña Cuentas no se enoja (mucho).',
      ],
      quiz: [
        {
          id: 'q1',
          pregunta: 'Generas un pedido con «Generar pedido». ¿Qué pasa con el inventario?',
          opciones: [
            'Sube de inmediato con lo pedido',
            'No cambia hasta que recibas la mercancía',
            'Baja por lo pedido',
            'Se borra el catálogo',
          ],
          correcta: 1,
          explicacion: 'El pedido es una **promesa de compra**: el inventario solo sube al **recibir** la mercancía.',
        },
        {
          id: 'q2',
          pregunta: '¿Cuándo usas «Entrega directa a inventario»?',
          opciones: [
            'Cuando la mercancía todavía no llega',
            'Con preventa / repartidor, cuando ya te entregaron y debe entrar de inmediato',
            'Para cancelar un pedido',
            'Para imprimir un ticket viejo',
          ],
          correcta: 1,
          explicacion: 'La entrega directa es para mercancía **que ya tienes en la mano**: entra al inventario al registrarla.',
        },
        {
          id: 'q3',
          pregunta: '¿Qué significa la columna «Teórico»?',
          opciones: [
            'Lo que vas a pedir',
            'Las piezas que el sistema cree que hay ahora en inventario',
            'El costo del producto',
            'Lo vendido en el periodo',
          ],
          correcta: 1,
          explicacion: 'Teórico = **stock actual según el sistema**.',
        },
        {
          id: 'q4',
          pregunta: '¿De qué depende la cantidad «Sugerida»?',
          opciones: [
            'Solo del precio',
            'Del stock, el mínimo/umbral y lo vendido en el periodo elegido',
            'Del nombre del proveedor',
            'De la hora del día',
          ],
          correcta: 1,
          explicacion: 'Considera stock, mínimo (o Umbral) y las ventas del periodo: **si se vende más, sugiere más**.',
        },
        {
          id: 'q5',
          pregunta: 'En un pedido nuevo, ¿qué hace la tecla Enter en la columna Pedido?',
          opciones: [
            'Borra la fila',
            'Acepta la cantidad sugerida y pasa a la siguiente fila',
            'Genera el pedido',
            'Cierra la herramienta',
          ],
          correcta: 1,
          explicacion: 'Enter **acepta la sugerida** y salta a la siguiente fila.',
        },
        {
          id: 'q6',
          pregunta: 'Estás en «Recepción de mercancía». ¿Qué capturas en la columna «Recepción»?',
          opciones: [
            'Lo que ordenaste',
            'Lo que realmente llegó del proveedor',
            'El costo',
            'El stock teórico',
          ],
          correcta: 1,
          explicacion: 'Recepción = **lo entregado de verdad**. Solo esas líneas suman al inventario.',
        },
        {
          id: 'q7',
          pregunta: 'Al pulsar «Recibir mercancía», ¿qué total te pide el sistema?',
          opciones: [
            'El total de ventas del día',
            'El total del ticket del proveedor',
            'El total del inventario',
            'No pide ningún total',
          ],
          correcta: 1,
          explicacion: 'Pide el **total del ticket del proveedor**; de ahí sale el gasto que se carga al Corte Abarrotes.',
        },
        {
          id: 'q8',
          pregunta: 'Eliminas del Historial una compra ya recibida. ¿Qué pasa con el inventario y el gasto?',
          opciones: [
            'Se descuenta el inventario y se anula el gasto',
            'No se mueve el inventario ni se anula el gasto; solo se quita el registro (y solo admin/gerente puede)',
            'Se duplica el gasto',
            'Se regresa el pedido a Por recibir',
          ],
          correcta: 1,
          explicacion: 'Eliminar del historial **solo quita el registro**; el stock y el gasto se quedan igual.',
        },
        {
          id: 'q9',
          pregunta: '¿Cuánto tiempo conserva el Historial de compras las recepciones antes de pasarlas a Contabilidad → Archivo?',
          opciones: [
            '1 día',
            '8 días',
            '1 año',
            'Nunca las archiva',
          ],
          correcta: 1,
          explicacion: 'Se conservan **8 días**; después pasan a **Contabilidad → Archivo**.',
        },
      ],
    },
    {
      id: 'frase',
      titulo: 'Frase para capacitar',
      cuerpo: [
        '**Pedido es promesa, recepción es realidad: cuento lo que baja del camión, uso el total del ticket y no «arreglo» nada borrando el historial.**',
        'Si fallaste la evaluación: repasa la diferencia entre Pedido y Entrega directa, qué captura la columna Recepción, el total del ticket y qué hace Eliminar; luego **Reintentar**.',
      ],
    },
  ],
};
