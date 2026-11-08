/**
 * Tutorial (con humor) · Herramienta de compras.
 * Personajes originales: Beto y Lulú (Las 3B) platican con Ángel (pan) y Chispita (refrescos),
 * mascotas de proveedores inspiradas en los repartidores de pan y refrescos. Sin logos ni marcas.
 */

const IMG = '/tutorial-compras';

const BETO = 'Beto · Las 3B';
const LULU = 'Lulú · Las 3B';
const PANCHO = 'Ángel · Encargado';
const CHISPITA = 'Chispita · Refrescos';

const t = (quien, texto) => ({ quien, texto, lado: 'tienda' });
const p = (quien, texto) => ({ quien, texto, lado: 'proveedor' });

export const TUTORIAL_COMPRAS = {
  id: 'herramienta-compras',
  titulo: 'Compras, platicado: Las 3B y sus proveedores (Ángel y Chispita)',
  resumen:
    'Beto y Lulú, de Las 3B, platican con Ángel, el encargado del pan, y Chispita (el de los refrescos) sobre cómo usar la herramienta de compras: elegir proveedor, cantidad sugerida, pedido, recepción, entrega directa, historial y los beneficios para la tienda y para el proveedor. Con evaluación.',
  interactivo: true,
  secciones: [
    {
      id: 'elenco',
      titulo: '1. Conoce al elenco',
      cuerpo: [
        'Hoy la herramienta de compras la explican quienes la usan a diario. Los personajes son **originales**; sus proveedores están inspirados en los repartidores de pan y de refrescos, sin logos ni marcas.',
        '**Beto** (Las 3B): el gerente. Revisa que los números cuadren.',
        '**Lulú** (Las 3B): la que compra, escanea y recibe la mercancía.',
        '**Ángel:** el encargado del pan (proveedor). Pasa a surtir y entrega **directo** al estante.',
        '**Chispita:** el proveedor de refrescos. Trabaja **por pedido**: se pide hoy y se recibe cuando llega el camión.',
        'La herramienta tiene **tres pestañas**: **Herramienta de compra** (pedir o recibir), **Por recibir** (pedidos esperando mercancía) e **Historial de compras** (lo ya recibido).',
      ],
      imagen: `${IMG}/01-elenco.jpg`,
      imagenAlt: 'Beto y Lulú de Las 3B con Ángel (pan) y Chispita (refrescos)',
    },
    {
      id: 'caminos',
      titulo: '2. Dos caminos: Pedido + recepción o Entrega directa',
      cuerpo: [
        'Primero eliges el **Proveedor**. Después, según cómo te surta, hay dos caminos:',
        '**Pedido (recepción después):** el inventario **no cambia** hasta que llegue la mercancía y la recibas.',
        '**Entrega directa a inventario:** capturas lo que ya te entregaron y entra **de inmediato** al inventario (CEDIS en MAIN, piso en tiendas).',
      ],
      imagen: `${IMG}/02-caminos.jpg`,
      imagenAlt: 'Chispita con su pedido pendiente a la izquierda y Ángel con su entrega directa a la derecha',
      dialogo: [
        t(BETO, 'Lulú, con Chispita siempre es **Pedido**: se lo encargo hoy y me llega después. ¿Y con Ángel?'),
        t(LULU, 'Con Ángel es **Entrega directa**: llega con el pan, lo cuento y entra al inventario en ese momento.'),
        p(PANCHO, '¡Fresquecito! Yo llego, descargo y me voy. Prefiero no dejar nada «pendiente».'),
        p(CHISPITA, 'Yo prefiero que me manden el pedido con tiempo para que mi camión salga bien cargado.'),
        t(LULU, 'Y si el proveedor ya está configurado como entrega directa, la pantalla me lo avisa. Si quiero retomar un pedido que ya hice, lo elijo en **Pedido pendiente (recepción)**.'),
      ],
      notas: [
        '**Regla rápida:** si la mercancía todavía no llega, es **Pedido**. Si ya está en tus manos, es **Entrega directa** (o **Recepción** de un pedido).',
        'Si el proveedor no tiene productos en su catálogo no se puede abrir la herramienta: ve a **Proveedores**, agrega los productos al catálogo y regístralos en inventario (hay un botón **Gestionar proveedores**).',
      ],
    },
    {
      id: 'sugerido',
      titulo: '3. La tabla: Teórico, Sugerido y Pedido',
      cuerpo: [
        'Al abrir un **Nuevo pedido** ves: **Código · Descripción · Precio · Teórico · Sugerido · Pedido · Costo.**',
        '**Teórico:** las piezas que el sistema cree que tienes ahora (el stock).',
        '**Sugerido:** cuánto conviene pedir. Se calcula con tu stock, el **mínimo** del producto (o el **Umbral** de la pantalla, 8 por defecto) y **lo vendido** en el periodo elegido.',
        '**Pedido:** lo que realmente vas a pedir. **Enter** acepta la sugerida y salta a la siguiente fila.',
        '**Costo:** costo estimado por pieza; puedes corregirlo si el proveedor te dio otro precio.',
        '**Recomendación** (columna resaltada): te dice si **conviene pedir** y cuántas piezas, o **NO PEDIR** si el inventario alcanza hasta la próxima visita del proveedor. Usa la venta diaria, tu inventario y el calendario de visitas; con el botón **Aplicar recomendación al Pedido** la pasas a la columna Pedido.',
      ],
      imagen: `${IMG}/03-sugerido.jpg`,
      imagenAlt: 'Lulú muestra la tabla de sugeridos mientras Beto piensa frente al estante vacío',
      dialogo: [
        t(BETO, 'Antes pedía «a ojo» y a veces me sobraba refresco y me faltaba pan. ¿Cómo lo resuelve la herramienta?'),
        t(LULU, 'Me muestra el **Teórico** (lo que hay) y el **Sugerido**, que sube si ese producto se **vendió más** en los últimos días.'),
        p(PANCHO, 'O sea que si mi pan vuela, ¡me piden más! Me gusta.'),
        t(LULU, 'Exacto. Elijo el periodo en **Ventas para sugerencia de pedido**: 7 días, 14 días, mes actual o un rango. Y con **Detalle ventas por día** veo si un solo día infló el número.'),
        p(CHISPITA, '¿Y si solo quieres ver lo que conviene pedir?'),
        t(LULU, 'Eso es lo que muestra por defecto: solo los productos con sugerido mayor que cero. Si quiero todo, activo **Ver todo el catálogo**.'),
      ],
      notas: [
        'La **sugerida es una guía**: tú conoces tu tienda (temporada, promos, pedidos grandes). Ajusta la columna Pedido cuando haga falta.',
      ],
    },
    {
      id: 'pedido',
      titulo: '4. Generar el pedido: va a «Por recibir» y no toca el inventario',
      cuerpo: [
        'Captura cantidades, agrega **Notas al proveedor** si quieres y pulsa **Generar pedido (sin tocar inventario)**.',
        'El pedido se guarda en **Por recibir** y se **imprime el ticket** para dárselo al proveedor. También puedes usar **Imprimir pedido** antes de guardar.',
        '**Importante:** un pedido es una **promesa de compra**, no mercancía: el inventario sigue igual.',
      ],
      imagen: `${IMG}/04-pedido.jpg`,
      imagenAlt: 'Lulu entrega el pedido impreso a Chispita mientras el estante sigue vacío',
      dialogo: [
        t(LULU, 'Listo, Chispita: aquí está tu pedido impreso, con las cantidades exactas.'),
        p(CHISPITA, '¡Qué bien! Con el ticket claro no hay «yo creí que eran cinco cajas».'),
        t(BETO, 'Y mi inventario sigue igual hasta que llegue tu camión. Si se cancela el pedido, lo **elimino** de Por recibir y no pasó nada.'),
        p(CHISPITA, 'Y cuando llego, ya sabes qué esperar. Nos ahorramos discusiones.'),
      ],
      notas: [
        'Si aparece un aviso de que falta actualizar la tabla de compras, es un tema de base de datos: pide a un administrador ejecutar **fix_compras_items.sql** en Supabase.',
      ],
    },
    {
      id: 'recepcion',
      titulo: '5. Recibir la mercancía: escanear, comparar y confirmar',
      cuerpo: [
        'Cuando llegue el camión, entra a **Por recibir → Recibir** (o elige el pedido en **Pedido pendiente (recepción)**).',
        '**Columna Pedido:** lo ordenado (solo lectura). **Columna Recepción:** lo que **realmente llegó**.',
        '**Escanea** cada código para sumar **+1** en Recepción, o escribe la cantidad.',
        'Pulsa **Recibir mercancía**: te pide el **total del ticket del proveedor** (propone el calculado por líneas). Al confirmar, el **inventario sube**, el pedido pasa al **Historial**, se imprime el **ticket de recepción** y se **carga el gasto al Corte Abarrotes**.',
      ],
      imagen: `${IMG}/05-recepcion.jpg`,
      imagenAlt: 'Lulú escanea cajas de Chispita mientras Beto compara el ticket con una lupa',
      dialogo: [
        p(CHISPITA, '¡Llegué! Traigo tus cajas.'),
        t(LULU, 'Las voy escaneando: cada código suma **+1** en la columna **Recepción**.'),
        t(BETO, 'Y yo comparo el ticket que me das con lo que de verdad bajó del camión.'),
        p(CHISPITA, 'Faltaron dos cajas, te las traigo mañana.'),
        t(LULU, 'Pongo en Recepción solo lo que llegó. **Lo que no llegó, no suma** al inventario.'),
        t(BETO, 'Y al **Recibir mercancía** pongo el **total del ticket** tal cual: de ahí sale el gasto del corte.'),
      ],
      notas: [
        'Si la compra es a **crédito**, no se carga gasto al corte: se carga al cobrar el crédito en Cobranza ruta.',
        'El folio de la compra lleva sufijo de pago: **-E** efectivo, **-C** crédito, **-M** mixto.',
        'Si algún movimiento queda **pendiente de subir a la nube**, el stock ya cambió y se reintenta al abrir Consultas → Inventario. **No borres la caché local** de la app.',
      ],
    },
    {
      id: 'directa',
      titulo: '6. Entrega directa: cuando el proveedor llega y surte',
      cuerpo: [
        'Elige el proveedor y pulsa **Entrega directa a inventario**. La tabla usa la columna **Cantidad entregada** (no hay columna Recepción).',
        'Escanea o captura lo entregado, agrega **Notas de la entrega** y pulsa **Registrar entrega e inventario**.',
        'Igual que en la recepción, te pide el **total del ticket / nota del proveedor**, sube el inventario, guarda el registro como **recibida** en el Historial y carga el gasto al **Corte Abarrotes**. **Imprimir entrega** saca el comprobante.',
      ],
      imagen: `${IMG}/06-directa.jpg`,
      imagenAlt: 'Ángel surte pan directo al estante mientras Lulu escanea y Beto muestra el comprobante',
      dialogo: [
        p(PANCHO, 'Buenos días, Beto. Aquí el pan de hoy.'),
        t(LULU, 'Lo escaneo y lo capturo en **Cantidad entregada**. Con **Registrar entrega e inventario** ya queda en el estante, sin pasos intermedios.'),
        p(PANCHO, '¿Y no queda nada pendiente?'),
        t(BETO, 'Nada. La entrega directa **no pasa por Por recibir**: va directo al **Historial**.'),
      ],
    },
    {
      id: 'historial',
      titulo: '7. Por recibir e Historial: botones y reglas',
      cuerpo: [
        '**Por recibir:** pedidos pendientes. Botones: **Recibir**, **Reimprimir ticket** y **Eliminar** (cancela el pedido **sin mover inventario**).',
        '**Historial de compras:** recepciones ya aplicadas. Botones: **Editar folio**, **Reimprimir ticket** (de recepción) y **Eliminar**.',
        'Ambas pestañas tienen **filtro de periodo** (8 días por defecto, 14 días, mes actual o rango).',
        'El Historial conserva **8 días**; después las compras pasan a **Contabilidad → Archivo**.',
      ],
      imagen: `${IMG}/07-historial.jpg`,
      imagenAlt: 'Beto archivando tickets, Lulu reimprimiendo uno y los proveedores viendo una gráfica',
      dialogo: [
        p(PANCHO, 'Beto, ¿me puedes dar copia del ticket de la semana pasada?'),
        t(LULU, 'Claro, en **Historial de compras** pulso **Reimprimir ticket**.'),
        t(BETO, 'Y ojo: si **elimino** una compra ya recibida, **solo desaparece del historial**. No descuenta inventario ni anula el gasto. Además solo **administrador o gerente** puede hacerlo.'),
        p(CHISPITA, 'Entonces borrar no sirve para «corregir» una compra.'),
        t(BETO, 'Exacto. Para devoluciones o correcciones se avisa al administrador; el historial no es una goma de borrar.'),
      ],
    },
    {
      id: 'beneficios',
      titulo: '8. Beneficios: para la tienda y para el proveedor',
      cuerpo: [
        'Usar la herramienta de compras en lugar de apuntar «a mano» deja ventajas para los dos lados:',
        '**Para Las 3B:** menos faltantes y menos sobrantes (pides según ventas); inventario correcto al recibir; gasto cargado al Corte Abarrotes con el ticket real; historial y tickets reimprimibles; menos errores por escribir cantidades de memoria.',
        '**Para el proveedor:** pedidos claros e impresos; menos reclamos sobre «lo que se pidió»; entregas más rápidas porque se escanea y se cuadra el ticket al momento.',
      ],
      imagen: `${IMG}/08-beneficios.jpg`,
      imagenAlt: 'Los cuatro personajes celebrando con íconos de gráfica, escudo, reloj, monedas y lista de verificación',
      dialogo: [
        t(BETO, 'Resumen para el equipo: pido lo que se vende, recibo lo que llega y pago lo que dice el ticket.'),
        p(PANCHO, 'Y yo termino la ruta más rápido: me reciben, escanean y firman.'),
        p(CHISPITA, 'Y yo ya no peleo por cuántas cajas eran.'),
        t(LULU, 'Y todo queda en el historial. ¡Cero libretas perdidas!'),
      ],
      notas: [
        'Los diálogos son ficticios y sirven para capacitar; los pasos y botones son los reales de la herramienta de compras.',
      ],
    },
    {
      id: 'errores',
      titulo: '9. Errores típicos (y cómo evitarlos)',
      cuerpo: [
        '**Capturar en Recepción lo pedido y no lo recibido.** Cuenta lo que baja del camión.',
        '**Poner el total del ticket de memoria.** Úsalo tal cual viene del proveedor: de ahí sale el gasto del corte.',
        '**Hacer un Pedido cuando la mercancía ya está en la tienda.** Usa Entrega directa.',
        '**Aceptar la sugerida a ciegas.** Si hay promo o temporada, ajusta el Pedido.',
        '**Eliminar del historial para «arreglar» algo.** No mueve inventario ni gasto.',
      ],
    },
    {
      id: 'quiz',
      titulo: '10. Evaluación (Beto y Lulú te califican)',
      cuerpo: [
        'Responde las 10 preguntas. Al terminar verás **puntaje, porcentaje y calificación** (A–F).',
        'Apruebas con **70% o más** (C o mejor). Si no, repasa y reintenta.',
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
            'Cuando el proveedor ya te entregó y debe entrar de inmediato al inventario',
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
          opciones: ['1 día', '8 días', '1 año', 'Nunca las archiva'],
          correcta: 1,
          explicacion: 'Se conservan **8 días**; después pasan a **Contabilidad → Archivo**.',
        },
        {
          id: 'q10',
          pregunta: '¿Cuál es un beneficio real de usar la herramienta de compras?',
          opciones: [
            'Pedir según lo vendido, recibir contra el ticket y dejar historial reimprimible',
            'Que el inventario suba solo, sin recibir nada',
            'Que ya no se necesite contar la mercancía',
            'Que el gasto nunca llegue al corte',
          ],
          correcta: 0,
          explicacion: 'La herramienta sugiere según ventas, cuadra la recepción con el ticket y conserva el historial; **sigues contando la mercancía**.',
        },
      ],
    },
    {
      id: 'frase',
      titulo: 'Frase para capacitar',
      cuerpo: [
        '**Pido lo que se vende, recibo lo que llega, pago lo que dice el ticket y no «arreglo» nada borrando el historial.**',
        'Si fallaste la evaluación: repasa Pedido vs Entrega directa, qué captura la columna Recepción, el total del ticket y qué hace Eliminar; luego **Reintentar**.',
      ],
    },
  ],
};
