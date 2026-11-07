/** Tutorial · Cómo entender el análisis «Venta en ruta vs recolección» (Estadísticas Abarrotes). */

const IMG = '/tutorial-estadisticas-ruta';

export const TUTORIAL_ESTADISTICAS_RUTA = {
  id: 'estadisticas-ruta-vs-recoleccion',
  titulo: 'Entender el análisis Venta en ruta vs recolección',
  resumen:
    'Cómo leer tarjetas, avisos y tablas de Estadísticas Abarrotes para saber si la ruta deja ganancia y si salió más dinero (efectivo + tarjeta) del que generó cada tienda. Con evaluación.',
  interactivo: true,
  audiencia: 'admin',
  secciones: [
    {
      id: 'mapa',
      titulo: '1. El mapa en 20 segundos',
      cuerpo: [
        'El análisis responde **dos preguntas** distintas:',
        '**1) ¿Hay rendimiento?** Venta de ruta − costo de lo vendido − gastos de ruta.',
        '**2) ¿Salió de más?** El dinero que sale de cada tienda (recolección en efectivo **más** pago con tarjeta) contra lo que esa tienda generó neto.',
        'Frase clave: **Primero miro si la ruta gana; luego miro si salió más dinero (efectivo + tarjeta) del que la tienda generó.**',
      ],
      imagen: `${IMG}/01-mapa.svg`,
      imagenAlt: 'Dos preguntas: rendimiento de la ruta y dinero salido (efectivo + tarjeta) contra neto de tienda',
      notas: ['Es una herramienta de lectura: no cambia ningún dato del sistema.'],
    },
    {
      id: 'abrir',
      titulo: '2. Dónde está y cómo filtrarlo',
      cuerpo: [
        'Menú **Estadísticas → Abarrotes** y baja a **Venta en ruta vs recolección · ¿hay rendimiento?**.',
        'Usa el mismo **Periodo rápido** y la misma **Tienda** del tablero: si cambias uno, el análisis se recalcula.',
        'Prefiere **semanas o meses**: una recolección puede traer dinero de días anteriores y en un solo día puede dar diferencias que no son problema.',
        'Con una **tienda** elegida no se muestran los gastos de ruta (no pertenecen a una tienda).',
      ],
    },
    {
      id: 'tarjetas',
      titulo: '3. Las seis tarjetas',
      cuerpo: [
        '**Venta en ruta:** lo vendido por el camión (sin canceladas), con su parte en efectivo y a crédito.',
        '**Costo de lo vendido:** piezas × precio de compra del catálogo (sin IVA).',
        '**Ganancia bruta ruta:** venta − costo, con su % sobre la venta.',
        '**Gastos de ruta:** gastos del recolector (Venta en Ruta → Gastos) no cancelados.',
        '**Rendimiento neto ruta:** ganancia bruta − gastos de ruta. Si es **cero o negativo**, la ruta no está dejando dinero.',
        '**Salido vs neto tiendas:** a la izquierda lo que salió de las tiendas (recolección en efectivo + tarjeta), a la derecha lo que generaron neto.',
      ],
      imagen: `${IMG}/02-tarjetas.svg`,
      imagenAlt: 'Seis tarjetas con un ejemplo: ganancia $10, gastos $20, rendimiento -$10, salido $800 vs neto $640',
    },
    {
      id: 'avisos',
      titulo: '4. La lista de avisos (colores)',
      cuerpo: [
        'Debajo de las tarjetas hay frases en lenguaje llano. El **color** dice la urgencia:',
        '· **Rojo:** atender (sin rendimiento, productos sin margen, salida por encima del neto, efectivo registrado de más).',
        '· **Naranja:** revisar (venta sin costo, crédito pendiente, efectivo de ruta de menos).',
        '· **Azul:** informativo (ganancia normal, cuánto fue con tarjeta, nadie excede).',
        'Empieza siempre por los rojos.',
      ],
    },
    {
      id: 'tienda',
      titulo: '5. Tabla por tienda: «¿salió más dinero del que generó?»',
      cuerpo: [
        '**Neto** = venta del corte − gastos del corte. Es lo que la tienda generó.',
        '**Recolectado (efvo)** = movimientos «Recolección» de Panel RT (cancelados excluidos).',
        '**Tarjeta (electrónico)** = pago con tarjeta del corte. No es efectivo, pero **también es dinero que sale de la tienda** (se deposita fuera de la caja), por eso cuenta igual que una recolección.',
        '**Total salido** = recolectado en efectivo + tarjeta.',
        '**Diferencia** = total salido − neto.',
        '**Positiva y grande → «Salió de más»:** salió más dinero del que la tienda generó neto; ese excedente sale de lo que había que pagar a los demás proveedores o de su ganancia.',
        '**Negativa y grande → «Falta recolectar»:** queda efectivo neto en la tienda sin recoger (o hay un faltante).',
        '**Dentro de la tolerancia ($50 o 5% del neto) → «Cuadra».**',
      ],
      imagen: `${IMG}/03-tienda.svg`,
      imagenAlt: 'Ejemplo 3B2: neto $640, efectivo $700 + tarjeta $100 = salido $800, diferencia +$160',
      notas: [
        'Las tiendas se ordenan de mayor a menor excedente: revisa primero las de arriba.',
        'Una tienda que cobra casi todo con tarjeta tiene poca recolección en efectivo, pero eso **no** significa que salió poco: súmale la tarjeta.',
        'La columna **Ganancia ruta** es solo informativa: la ganancia de la ruta no está dentro del neto de la tienda.',
      ],
    },
    {
      id: 'proveedor',
      titulo: '6. Tabla por proveedor: dónde se gana y dónde no',
      cuerpo: [
        'Cada renglón es un proveedor del catálogo (el de **Productos**). Los productos sin proveedor van en «Sin proveedor».',
        '**Margen** = ganancia ÷ venta que sí tiene costo capturado.',
        'Un **0%** o negativo significa que se vendió a costo o por debajo (por ejemplo Smoking a su precio de costo).',
        '**Sin costo** es la venta de productos sin precio de compra: no entra a la ganancia. Captura el costo en **Productos** para completar el análisis.',
      ],
      imagen: `${IMG}/04-proveedor.svg`,
      imagenAlt: 'Marlboro con 16.67% de margen y Smoking con 0%',
    },
    {
      id: 'sin-rendimiento',
      titulo: '7. «¿Por qué no hay rendimiento?» Causas y qué hacer',
      cuerpo: [
        '**Se vende a costo:** precio ruta ≤ costo de compra. Ajusta **Precios ruta** o el costo en Productos.',
        '**Los gastos se comen la ganancia:** revisa **Venta en Ruta → Gastos** (categorías y montos).',
        '**Crédito sin cobrar:** la ganancia existe, pero aún no es efectivo. Cobra desde **Cobranza**.',
        '**Venta sin costo capturado:** el análisis subestima la ganancia. Captura costos.',
        '**Salida por encima del neto:** sale más dinero (efectivo + tarjeta) del que la tienda generó; revisa qué se recolectó y si hubo gastos sin registrar en el corte.',
      ],
    },
    {
      id: 'limites',
      titulo: '8. Cuándo NO concluir todavía',
      cuerpo: [
        'El **costo** es el precio de compra **actual** del catálogo, no el de la fecha de la venta.',
        'Una recolección puede incluir **caja chica** o ventas de **días anteriores**, y el depósito de tarjeta puede caer en otro día: en periodos cortos la diferencia puede ser solo de calendario.',
        'Si el aviso dice que falta efectivo de ruta o hay mucha **venta sin costo**, primero corrige el dato y vuelve a mirar.',
        'La herramienta señala **dónde mirar**; la conclusión la confirmas con los cortes y Panel RT.',
      ],
    },
    {
      id: 'quiz',
      titulo: '9. Evaluación (te calificamos)',
      cuerpo: [
        'Responde las 9 preguntas. Al terminar verás **puntaje, porcentaje y calificación** (A–F).',
        'Apruebas con **70% o más** (C o mejor). Si no, reintenta tras repasar.',
      ],
      quiz: [
        {
          id: 'q1',
          pregunta: '¿Cuáles son las dos preguntas que responde el análisis?',
          opciones: [
            'Cuántos clientes hay y cuántos tickets',
            '¿Hay rendimiento en la ruta? y ¿salió más dinero (efectivo + tarjeta) del que generó cada tienda?',
            'Cuánto inventario hay y cuánto se merma',
            'Quién llegó tarde y quién faltó',
          ],
          correcta: 1,
          explicacion: 'Rendimiento de la ruta **y** dinero salido (efectivo + tarjeta) contra el neto de cada tienda.',
        },
        {
          id: 'q2',
          pregunta: '¿Cómo se calcula el rendimiento neto de la ruta?',
          opciones: [
            'Venta de ruta − costo de lo vendido − gastos de ruta',
            'Solo la venta de ruta',
            'Recolectado − venta',
            'Venta de la tienda − tarjeta',
          ],
          correcta: 0,
          explicacion: '**Ganancia bruta (venta − costo) menos los gastos de ruta.**',
        },
        {
          id: 'q3',
          pregunta: 'Smoking aparece con margen 0%. ¿Qué significa?',
          opciones: [
            'Que no se vendió nada',
            'Que se vendió a su precio de costo: no deja ganancia',
            'Que el proveedor está cancelado',
            'Que hay crédito pendiente',
          ],
          correcta: 1,
          explicacion: 'Margen 0% = **vendido a costo**; mueve dinero pero no rinde.',
        },
        {
          id: 'q4',
          pregunta: '¿Cómo se calcula el neto de una tienda?',
          opciones: [
            'Venta del corte − gastos del corte',
            'Recolectado + tarjeta',
            'Venta de ruta − costo',
            'Solo la venta en efectivo',
          ],
          correcta: 0,
          explicacion: 'El neto es lo que la tienda generó: **venta − gastos del corte**.',
        },
        {
          id: 'q5',
          pregunta: '¿Por qué el pago con tarjeta cuenta como dinero que sale de la tienda?',
          opciones: [
            'Porque la tarjeta siempre es fraude',
            'Porque es dinero electrónico que ya no queda en la caja: sale igual que una recolección',
            'Porque se resta de los gastos',
            'No cuenta: solo importa el efectivo',
          ],
          correcta: 1,
          explicacion: 'La tarjeta es **dinero electrónico que sale de la tienda**; se suma a la recolección en efectivo.',
        },
        {
          id: 'q6',
          pregunta: 'Venta $1,000, gastos $360, recolectado $700 y tarjeta $100. ¿Qué dice el análisis?',
          opciones: [
            'Cuadra',
            'Falta recolectar $160',
            'Salió de más: salido $800 contra neto $640 = +$160',
            'La tienda perdió $700',
          ],
          correcta: 2,
          explicacion: 'Neto = 1,000 − 360 = 640. Salido = 700 + 100 = 800. Diferencia = **+$160**.',
        },
        {
          id: 'q7',
          pregunta: 'Sale una diferencia grande en un solo día. ¿Qué haces primero?',
          opciones: [
            'Concluir que hay robo',
            'Ampliar el periodo a semana o mes: la recolección puede traer días anteriores o caja chica',
            'Borrar la recolección',
            'Ignorar el análisis para siempre',
          ],
          correcta: 1,
          explicacion: 'Los periodos cortos distorsionan; **mira semanas o meses** antes de concluir.',
        },
        {
          id: 'q8',
          pregunta: '¿Qué hacer con la venta marcada «Sin costo»?',
          opciones: [
            'Nada: es normal',
            'Capturar el precio de compra en Productos para completar el análisis',
            'Cancelar la venta',
            'Mover el producto a otra tienda',
          ],
          correcta: 1,
          explicacion: 'Sin costo no entra a la ganancia: **captura el costo en Productos**.',
        },
        {
          id: 'q9',
          pregunta: 'Una tienda casi todo lo cobra con tarjeta y casi no recolectó efectivo. ¿Se puede decir que salió poco dinero?',
          opciones: [
            'Sí, solo cuenta el efectivo',
            'No: hay que sumar la tarjeta al efectivo recolectado',
            'Sí, la tarjeta no sale de la tienda',
            'Depende del proveedor',
          ],
          correcta: 1,
          explicacion: 'El dinero que sale es **efectivo + tarjeta**; mirar solo el efectivo subestima la salida.',
        },
      ],
    },
    {
      id: 'frase',
      titulo: 'Frase para capacitar',
      cuerpo: [
        '**Ruta: venta − costo − gastos = rendimiento. Tienda: venta − gastos = neto; si lo que sale (efectivo + tarjeta) es más que el neto, me llevé lo de otros proveedores.**',
        'Si fallaste la evaluación: repasa el neto de la tienda, por qué cuenta la tarjeta, la tolerancia y las causas de «sin rendimiento»; luego **Reintentar**.',
      ],
    },
  ],
};
