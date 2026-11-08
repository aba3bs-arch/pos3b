/**
 * Manual de capacitación · Cómo decidir cuánto pedir con el «Detalle ventas por día».
 * Mismo elenco del tutorial de compras: Beto y Lulú (Las 3B), Ángel (encargado del pan) y Chispita (refrescos).
 * Los ejemplos numéricos son ficticios; los pasos y botones son los de la herramienta de compras.
 */

const IMG = '/manual-compras';

const BETO = 'Beto · Las 3B';
const LULU = 'Lulú · Las 3B';
const ANGEL = 'Ángel · Encargado';
const CHISPITA = 'Chispita · Refrescos';

const t = (quien, texto) => ({ quien, texto, lado: 'tienda' });
const p = (quien, texto) => ({ quien, texto, lado: 'proveedor' });

export const MANUAL_CAPACITACION_COMPRAS = {
  id: 'manual-capacitacion-compras',
  titulo: 'Manual de capacitación: cuánto pedir según la venta por día (sin compras innecesarias)',
  resumen:
    'Capacitación para el personal: cómo usar el «Detalle ventas por día» de la herramienta de compras para calcular cuánto pedir y evitar compras innecesarias. Con Beto, Lulú, Ángel y Chispita en globos de diálogo, ejemplos con números, checklist y evaluación final.',
  interactivo: true,
  secciones: [
    {
      id: 'portada',
      titulo: '1. Para qué es este manual',
      cuerpo: [
        '**Objetivo:** que cada persona que arma un pedido sepa **cuánto pedir** usando la venta real de cada día, y no «a ojo».',
        '**Al terminar sabrás:** activar y leer el **Detalle ventas por día**, calcular la **venta diaria**, saber **cuántos días te alcanza** el inventario, decidir **cuánto pedir**, comparar tu cálculo con el **Sugerido** y detectar compras innecesarias.',
        '**Cómo se usa:** lee cada sección (los personajes platican en globos), haz las cuentas con los ejemplos y presenta la **evaluación final** (aprueba con 70% o más).',
      ],
      imagen: `${IMG}/01-portada.jpg`,
      imagenAlt: 'Beto da la capacitación frente a una gráfica mientras Lulú levanta la mano y los proveedores toman notas',
      dialogo: [
        t(BETO, 'Bienvenidos a la capacitación de compras. Hoy aprenden a pedir lo justo.'),
        t(LULU, '¿Y cómo sé cuánto es «lo justo», Beto?'),
        t(BETO, 'Con las ventas de cada día. La herramienta ya las trae; solo hay que saber leerlas.'),
        p(ANGEL, 'Yo vengo de invitado: si me piden de más, mi pan se pone duro en su bodega.'),
        p(CHISPITA, 'Y si me piden de menos, ¡se les acaba el refresco! Hay que encontrar el equilibrio.'),
      ],
    },
    {
      id: 'por-que',
      titulo: '2. Por qué importa: pedir de más o de menos cuesta',
      cuerpo: [
        '**Pedir de más:** dinero parado en bodega, productos que se maltratan o caducan (el pan, por ejemplo) y menos espacio para lo que sí se vende.',
        '**Pedir de menos:** estante vacío, ventas perdidas y clientes que se van a otra tienda.',
        'La meta no es pedir poco ni mucho: es pedir **lo que vas a vender hasta que llegue el siguiente surtido**, más un pequeño colchón.',
      ],
      imagen: `${IMG}/02-demas-pocas.jpg`,
      imagenAlt: 'A la izquierda, bodega saturada con pan echado a perder; a la derecha, estante vacío y clientes molestos',
      dialogo: [
        t(BETO, 'A la izquierda: me pasé de pedido. Dinero parado y pan con «barba verde».'),
        p(ANGEL, 'Eso me duele en el alma de pan.'),
        t(LULU, 'A la derecha: me quedé corta. Estante vacío y clientes enojados.'),
        p(CHISPITA, 'Y ahí ni yo puedo ayudar: sin pedido no hay camión.'),
        t(BETO, 'Por eso calculamos: lo que se vende hasta el próximo surtido, más un colchón. Ni más, ni menos.'),
      ],
    },
    {
      id: 'preparar',
      titulo: '3. Prepara la pantalla (antes de calcular)',
      cuerpo: [
        '**1.** En **Compras → Herramienta de compra**, elige el **Proveedor**.',
        '**2.** Pulsa **Pedido (recepción después)** para un pedido nuevo.',
        '**3.** En **Ventas para sugerencia de pedido** elige el periodo (7 días, 14 días, mes actual o rango). Cambia el **Sugerido**, no el detalle por día.',
        '**4.** Activa la casilla **Detalle ventas por día (últimos 7 días)**: aparecen 7 columnas, una por día, entre **Sugerido** y **Pedido**.',
        '**5.** Revisa el **Umbral** (8 por defecto). Si necesitas ver todo, activa **Ver todo el catálogo**.',
      ],
      dialogo: [
        t(LULU, 'Primero el proveedor, luego **Pedido**, y activo la casilla **Detalle ventas por día**.'),
        t(BETO, 'Ahí aparecen 7 columnas: una por cada uno de los últimos 7 días.'),
        t(LULU, 'Donde no hubo ventas pone un puntito (**·**).'),
        t(BETO, 'Ojo: el último día es **hoy**. Si pides temprano, hoy apenas lleva unas ventas; no lo tomes como «día flojo».'),
      ],
      notas: [
        'El **Detalle por día siempre muestra los últimos 7 días**. El selector de periodo solo cambia el cálculo del **Sugerido**.',
        'Si el proveedor no tiene productos vinculados, la herramienta no abre: pídele al administrador que los agregue en **Proveedores → catálogo**.',
      ],
    },
    {
      id: 'detalle',
      titulo: '4. Cómo leer el Detalle ventas por día',
      cuerpo: [
        'Cada fila es un producto. Las columnas que debes mirar juntas son:',
        '**Teórico:** cuántas piezas cree el sistema que tienes hoy.',
        '**Sugerido:** lo que la herramienta propone pedir.',
        '**Los 7 días:** cuántas piezas se vendieron cada día (**·** = cero).',
        '**Pedido:** lo que tú decides pedir.',
        'Mira tres cosas en los 7 días: **(a)** el **nivel típico** (cuánto se vende en un día normal), **(b)** si hay **picos** (un día muy alto) y **(c)** si hay **tendencia** (sube o baja de lunes a hoy).',
      ],
      imagen: `${IMG}/03-detalle.jpg`,
      imagenAlt: 'Lulú muestra una tabla de siete columnas con las ventas de cada día mientras Beto la revisa con lupa',
      dialogo: [
        t(LULU, 'Aquí veo que este refresco vendió 2, 3, 2, 4, 3, 2 y 2 en los últimos 7 días.'),
        t(BETO, 'Eso es un nivel típico de 2 o 3 al día, sin picos. ¿Y si fuera 2, 2, 2, 2, 2, 2 y 30?'),
        t(LULU, 'Ese 30 es un pico: pasó algo raro ese día. No es lo normal.'),
        p(CHISPITA, 'Como la fiesta del vecino. Un día loco que no se repite cada semana.'),
        t(BETO, 'Exacto. El detalle sirve para distinguir lo normal de lo raro.'),
      ],
    },
    {
      id: 'formula',
      titulo: '5. La cuenta en 4 pasos',
      cuerpo: [
        '**Paso 1 · Venta diaria:** suma los 7 días y divide entre 7. Si hubo un día raro (pico o día sin surtido), no lo cuentes y divide entre los días normales.',
        '**Paso 2 · Cobertura:** **Teórico ÷ venta diaria** = cuántos días te alcanza lo que tienes.',
        '**Paso 3 · Días a cubrir:** días que faltan para el **siguiente surtido** del proveedor **+ 2 días de colchón** (criterio de capacitación; tu encargado puede ajustarlo).',
        '**Paso 4 · Cuánto pedir:** **venta diaria × días a cubrir − Teórico**. Si sale cero o negativo, **no pidas**. Redondea hacia arriba a la caja o paquete del proveedor.',
        '**Ejemplo A (refresco, 7 días: 2, 3, 2, 4, 3, 2, 2):** total 18 → venta diaria ≈ 2.6. Teórico 10 → cobertura ≈ 3.8 días. El proveedor surte cada 3 días + 2 de colchón = 5 días → 2.6 × 5 = 13 − 10 = **pedir 3**.',
      ],
      imagen: `${IMG}/04-calculo.jpg`,
      imagenAlt: 'Beto señala en el pizarrón los cuatro pasos: calendario, división, camión con reloj y canasta con palomita',
      dialogo: [
        t(BETO, '¿Listos para la cuenta? Paso uno: sumo los 7 días y divido entre 7.'),
        t(LULU, '2 + 3 + 2 + 4 + 3 + 2 + 2 = 18. Entre 7, unos 2.6 al día.'),
        t(BETO, 'Paso dos: tengo 10 de Teórico. 10 entre 2.6 es casi 4 días de inventario.'),
        p(CHISPITA, 'Y yo paso cada 3 días. Alcanza justo, pero sin colchón.'),
        t(LULU, 'Paso tres: 3 días más 2 de colchón son 5 días. Paso cuatro: 2.6 por 5 son 13, menos los 10 que ya tengo: **pido 3**.'),
        t(BETO, 'Perfecto. Y el Sugerido, ¿qué decía?'),
        t(LULU, 'Con el periodo en 7 días el Sugerido marcaba **13**. ¡Me ahorré 10 piezas innecesarias!'),
      ],
      notas: [
        '**Resumen de la cuenta:** pedir = (venta diaria × días a cubrir) − Teórico.',
        'Si el Teórico no coincide con lo que ves en el estante (merma, ajuste sin registrar), cuenta físicamente antes de calcular: el cálculo es tan bueno como el Teórico.',
      ],
    },
    {
      id: 'ejemplos',
      titulo: '6. Más ejemplos: producto estrella, pico y producto sin ventas',
      cuerpo: [
        '**Ejemplo B · Producto estrella (pan, 7 días: 6, 8, 7, 9, 8, 10, 8):** total 56 → **8 al día**. Teórico **3** → cobertura de **0.4 días** (se acaba hoy). Surtido en 3 días + 2 de colchón = 5 días → 8 × 5 = 40 − 3 = **pedir 37**. El Sugerido (periodo 7 días) marca 33: **se queda corto**, así que ajusta hacia arriba.',
        '**Ejemplo C · Pico (refresco, 7 días: 2, 2, 2, 2, 2, 2, 30):** con el pico saldría 6 al día; sin el pico, **2 al día**. Teórico 5; surtido en 2 días + 2 de colchón = 4 días → 2 × 4 = 8 − 5 = **pedir 3**. El Sugerido (periodo 7 días) marca 26: **dejarse llevar por el pico es compra innecesaria**.',
        '**Ejemplo D · Sin ventas (7 días en «·»), Teórico 20:** venta diaria 0 → **no pidas**. El Sugerido también marca 0.',
      ],
      imagen: `${IMG}/05-pico.jpg`,
      imagenAlt: 'Beto tacha en una gráfica la barra gigante de un día de fiesta mientras Lulú revisa la tableta',
      dialogo: [
        p(ANGEL, 'Mi pan es el estrella: se vende todo el día. ¿Qué hago si el Teórico dice 3?'),
        t(LULU, 'Se vende 8 al día: 3 de Teórico no llegan ni a medio día. Hay que pedir fuerte: 37, no 33.'),
        t(BETO, 'Por eso no aceptamos el Sugerido a ciegas: a veces se queda corto.'),
        p(CHISPITA, 'Y a veces se pasa. ¡Como cuando hubo fiesta y se vendió todo!'),
        t(LULU, 'Ese pico lo tacho. Calculo con el día normal: 2 al día, y pido solo 3.'),
        t(BETO, 'Y si en los 7 días no hay ni un movimiento y tengo 20, no pido nada.'),
      ],
      notas: [
        'Los números son de ejemplo. Lo importante es el método: **nivel típico → cobertura → días a cubrir → pedir**.',
      ],
    },
    {
      id: 'sugerido',
      titulo: '7. Qué hace el Sugerido y cuándo tu cálculo manda',
      cuerpo: [
        'El **Sugerido** se calcula con el **stock**, el **mínimo** del producto (o el **Umbral** de la pantalla) y lo **vendido en el periodo** que elegiste: si se vende más, sugiere más.',
        'Tiene un **piso**: aun si casi no se vende, tiende a sugerir un inventario objetivo de varias piezas (con Umbral 8 y sin mínimo propio en el producto, el objetivo no baja de 16 piezas). Por eso en **productos de baja rotación** suele sugerir **más** de lo que necesitas.',
        'Además, no conoce **tu calendario de surtido** ni **promociones o eventos**.',
        '**Regla práctica:** el Sugerido es el punto de partida. **Compara con tu cuenta**: si tu cuenta pide mucho menos (producto lento o pico), pide lo de tu cuenta; si pide más (producto estrella, promo próxima), sube el Pedido.',
      ],
      dialogo: [
        t(LULU, '¿Entonces el Sugerido está mal?'),
        t(BETO, 'No, es una guía muy útil. Pero no sabe cuándo pasa Chispita ni que mañana hay promo.'),
        p(CHISPITA, 'Y en lo que casi no se mueve, la fórmula deja un inventario objetivo parejo, aunque se venda poco.'),
        t(LULU, 'Ya entendí: el Sugerido propone, yo **decido** con el detalle por día.'),
        t(BETO, 'Y cuando coincida con tu cuenta, ahí sí puedes usar **Enter** para aceptarlo rápido.'),
      ],
      notas: [
        'En la columna **Pedido**, **Enter** acepta la cantidad sugerida y pasa a la siguiente fila. Úsalo solo en las filas donde tu cuenta coincide.',
      ],
    },
    {
      id: 'checklist',
      titulo: '8. Checklist antes de generar el pedido',
      cuerpo: [
        '**1. Teórico creíble:** ¿coincide con lo que ves en el estante o la bodega?',
        '**2. Próximo surtido:** ¿cuántos días faltan para que llegue el siguiente pedido?',
        '**3. Eventos o promociones:** ¿hay promo, fin de semana largo, fiesta o temporada que cambie la venta?',
        '**4. Costo:** ¿el costo estimado de la columna Costo es el que te dio el proveedor?',
        '**5. Cajas o paquetes:** ¿la cantidad está redondeada a lo que vende el proveedor?',
        'Después captura las **Notas al proveedor** si hace falta y pulsa **Generar pedido (sin tocar inventario)**. Con **Imprimir pedido** sacas el ticket.',
      ],
      imagen: `${IMG}/06-checklist.jpg`,
      imagenAlt: 'Beto muestra el checklist, Lulú está lista para generar el pedido y los proveedores esperan',
      dialogo: [
        t(BETO, 'Antes de dar clic en **Generar pedido**, repasamos el checklist.'),
        t(LULU, 'Teórico creíble, días al próximo surtido, promos, costo y cajas. ¡Todo marcado!'),
        p(ANGEL, 'Yo preferiría que también me avisen si esperan mucha venta el fin de semana.'),
        t(BETO, 'Buen punto: cuando haya evento, súbele a la cuenta. La herramienta no adivina fiestas.'),
        t(LULU, 'Y recuerden: el pedido **no mueve el inventario** hasta que recibamos la mercancía.'),
      ],
      notas: [
        'Cuando llegue la mercancía: **Por recibir → Recibir**. Captura en **Recepción** lo que realmente llegó y confirma con el **total del ticket del proveedor**.',
      ],
    },
    {
      id: 'errores',
      titulo: '9. Compras innecesarias: cómo reconocerlas',
      cuerpo: [
        '**Aceptar el Sugerido de todas las filas con Enter sin revisar.** En productos lentos puede inflar el pedido.',
        '**Dejarse llevar por un pico.** Un día raro no es la venta normal.',
        '**No contar los días hasta el siguiente surtido.** Si surten mañana, no pidas para dos semanas.',
        '**Pedir lo que ya tienes en bodega.** Cuenta primero; el Teórico puede estar desfasado.',
        '**Pedir porque «se ve vacío».** Un estante vacío no siempre significa que no hay en bodega.',
        '**Ignorar la tendencia.** Si la venta viene en caída de 7 días, no pidas como si fuera la semana pasada.',
      ],
      dialogo: [
        t(BETO, 'La señal de alarma: un pedido gigante que no puedo explicar con el detalle de ventas.'),
        t(LULU, 'Si no puedo decir «pido X porque vendo Y al día y me surten en Z días», debo revisarlo.'),
        p(ANGEL, 'Esa es buena: **vendo Y, surten en Z, pido X**.'),
      ],
    },
    {
      id: 'tarjeta',
      titulo: '10. Tarjeta de bolsillo',
      cuerpo: [
        '**1.** Activa **Detalle ventas por día**.',
        '**2.** Venta diaria = suma de 7 días ÷ 7 (sin días raros; hoy va incompleto).',
        '**3.** Cobertura = Teórico ÷ venta diaria.',
        '**4.** Días a cubrir = días al próximo surtido + 2.',
        '**5.** Pedir = venta diaria × días a cubrir − Teórico (si es ≤ 0, no pidas). Redondea a caja o paquete.',
        '**6.** Compara con el **Sugerido** y decide. Revisa el checklist y genera el pedido.',
        '**Frase:** *vendo Y al día, me surten en Z días, tengo T: pido X.*',
      ],
    },
    {
      id: 'quiz',
      titulo: '11. Evaluación final (Beto y Lulú te califican)',
      cuerpo: [
        'Responde las 12 preguntas. Al terminar verás **puntaje, porcentaje y calificación** (A–F).',
        'Apruebas con **70% o más**. Si no, repasa las secciones 5 a 8 y reintenta.',
      ],
      imagen: `${IMG}/07-graduacion.jpg`,
      imagenAlt: 'Lulú con birrete y diploma, Beto con medalla y los proveedores celebrando con confeti',
      quiz: [
        {
          id: 'q1',
          pregunta: '¿Qué muestra la casilla «Detalle ventas por día»?',
          opciones: [
            'Las ventas de cada uno de los últimos 7 días por producto',
            'El historial de compras del proveedor',
            'Los costos del último año',
            'Solo el total vendido del mes',
          ],
          correcta: 0,
          explicacion: 'Agrega 7 columnas con las piezas vendidas por día, para ver el nivel típico, los picos y la tendencia.',
        },
        {
          id: 'q2',
          pregunta: 'Cambias el periodo de «Ventas para sugerencia de pedido». ¿Qué cambia?',
          opciones: [
            'Las columnas de los 7 días del detalle',
            'La cantidad Sugerida',
            'El proveedor seleccionado',
            'El costo de los productos',
          ],
          correcta: 1,
          explicacion: 'El periodo afecta el cálculo del Sugerido. El Detalle por día siempre muestra los últimos 7 días.',
        },
        {
          id: 'q3',
          pregunta: 'En el detalle, un punto («·») en un día significa…',
          opciones: ['Dato pendiente', 'Cero ventas ese día', 'Venta cancelada', 'Producto descontinuado'],
          correcta: 1,
          explicacion: 'El punto representa cero piezas vendidas ese día.',
        },
        {
          id: 'q4',
          pregunta: 'Ventas de 7 días: 2, 2, 2, 2, 2, 2, 2. ¿Cuál es la venta diaria?',
          opciones: ['14', '7', '2', '4'],
          correcta: 2,
          explicacion: 'Suma 14 entre 7 días = 2 al día.',
        },
        {
          id: 'q5',
          pregunta: 'Teórico 12 y venta diaria 4. ¿Cuántos días te alcanza el inventario?',
          opciones: ['2 días', '3 días', '4 días', '12 días'],
          correcta: 1,
          explicacion: 'Cobertura = Teórico ÷ venta diaria = 12 ÷ 4 = 3 días.',
        },
        {
          id: 'q6',
          pregunta: 'Venta diaria 2, Teórico 6, el proveedor surte en 3 días y usas 2 días de colchón. ¿Cuánto pedir?',
          opciones: ['4', '6', '10', '16'],
          correcta: 0,
          explicacion: 'Días a cubrir = 3 + 2 = 5. Pedir = 2 × 5 − 6 = 4.',
        },
        {
          id: 'q7',
          pregunta: 'Ventas de 7 días: 2, 2, 2, 2, 2, 2, 30 (el 30 fue una fiesta). Teórico 5; surten en 2 días + 2 de colchón. ¿Cuánto pedir calculando con el día normal?',
          opciones: ['3', '19', '0', '26'],
          correcta: 0,
          explicacion: 'Sin el pico la venta normal es 2 al día. Días a cubrir = 4. Pedir = 2 × 4 − 5 = 3. Dejarse llevar por el pico llevaría a un pedido innecesario.',
        },
        {
          id: 'q8',
          pregunta: 'Los 7 días están todos en «·» y el Teórico es 20. ¿Qué decides?',
          opciones: ['Pedir 20 más', 'No pedir', 'Pedir lo mismo que el mes pasado', 'Pedir el mínimo de la caja'],
          correcta: 1,
          explicacion: 'Sin ventas y con inventario suficiente, no hay necesidad de pedir.',
        },
        {
          id: 'q9',
          pregunta: 'El Teórico es 3 y el producto vende 8 al día. ¿Qué indica la cobertura?',
          opciones: [
            'Que sobra producto',
            'Que se acaba en menos de un día: hay que pedir ya y con cantidad suficiente',
            'Que no hace falta pedir',
            'Que el detalle está mal',
          ],
          correcta: 1,
          explicacion: '3 ÷ 8 ≈ 0.4 días: se acaba hoy. Es un producto estrella que requiere pedido fuerte.',
        },
        {
          id: 'q10',
          pregunta: 'En un producto de baja rotación, el Sugerido suele…',
          opciones: [
            'Marcar siempre cero',
            'Quedar alto frente a lo que realmente necesitas, por su inventario objetivo mínimo',
            'Ignorar el stock',
            'Depender de la hora del día',
          ],
          correcta: 1,
          explicacion: 'El Sugerido tiene un objetivo mínimo de inventario; en productos lentos conviene comparar con tu cuenta y pedir lo necesario.',
        },
        {
          id: 'q11',
          pregunta: '¿Cuándo es buena idea usar Enter para aceptar el Sugerido en una fila?',
          opciones: [
            'Siempre, en todas las filas',
            'Cuando tu cuenta con el detalle de ventas coincide con el Sugerido',
            'Nunca',
            'Solo si el Teórico es cero',
          ],
          correcta: 1,
          explicacion: 'Enter ahorra tiempo cuando ya verificaste que el Sugerido coincide con tu cálculo.',
        },
        {
          id: 'q12',
          pregunta: 'Generas el pedido con «Generar pedido». ¿Qué pasa con el inventario?',
          opciones: [
            'Sube de inmediato',
            'No cambia hasta que recibas la mercancía',
            'Baja por lo pedido',
            'Se reinicia',
          ],
          correcta: 1,
          explicacion: 'El pedido va a Por recibir; el inventario cambia hasta que recibes la mercancía.',
        },
      ],
    },
    {
      id: 'frase',
      titulo: 'Frase para el equipo',
      cuerpo: [
        '**Vendo Y al día, me surten en Z días, tengo T: pido X. Y si no puedo explicar mi pedido con el detalle de ventas, lo reviso antes de generarlo.**',
        'Si no aprobaste: repasa las secciones 5 a 8 (la cuenta, el Sugerido y el checklist) y presenta la evaluación otra vez.',
      ],
    },
  ],
};
