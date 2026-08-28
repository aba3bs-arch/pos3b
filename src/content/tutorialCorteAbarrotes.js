/** Tutorial interactivo Corte Abarrotes — solo UI real (captura de tienda). */

const IMG = '/tutorial-corte-abarrotes';

/** Hotspots en % sobre la captura completa 00-pantalla-real.png (1910×1005). */
const HOTSPOTS = {
  encabezado: { top: 5.5, left: 1.2, width: 97.5, height: 11.5, label: 'Encabezado' },
  movimientos: { top: 17.5, left: 1.2, width: 32, height: 80, label: 'Movimientos' },
  centro: { top: 17.5, left: 34, width: 32.5, height: 80, label: 'Subtotal y gastos' },
  caja: { top: 17.5, left: 67.5, width: 31, height: 52, label: 'Caja chica' },
};

export const TUTORIAL_CORTE_ABARROTES = {
  id: 'corte-abarrotes',
  titulo: 'Corte Abarrotes',
  resumen:
    'Recorrido interactivo sobre la pantalla real: encabezado, Movimientos, gastos, Caja chica y cómo se forma un negativo.',
  interactivo: true,
  imagenBase: `${IMG}/00-pantalla-real.png`,
  hotspots: HOTSPOTS,
  secciones: [
    {
      id: 'mapa',
      titulo: '1. La pantalla completa',
      cuerpo: [
        'Esta es la pantalla real de **Corte Abarrotes** (independiente del corte de caja POS).',
        'Toca una zona resaltada para saltar a su explicación, o sigue con **Siguiente**.',
      ],
      imagen: `${IMG}/00-pantalla-real.png`,
      imagenAlt: 'Captura real · Corte Abarrotes · tienda FUSION · folio AB-044',
      hotspotActivo: null,
      mapaInteractivo: true,
      notas: [
        'En la captura: folio **AB-044**, turno diurno, caja anterior **$2,020.00**, sin venta ni gastos todavía.',
      ],
    },
    {
      id: 'encabezado',
      titulo: '2. Encabezado: folio y acciones',
      cuerpo: [
        'Arriba ves el título **Corte Abarrotes** y la leyenda *Independiente del corte de caja POS · Turno diurno*.',
        'A la derecha: el **folio** (ej. `AB-044`), el botón azul **Cerrar corte** y **Imprimir corte**.',
        'También aparece *Tienda del corte* (en la captura: **FUSION**).',
      ],
      imagen: `${IMG}/01-encabezado.png`,
      imagenAlt: 'Encabezado real: folio AB-044, Cerrar corte, Imprimir corte',
      hotspotActivo: 'encabezado',
      notas: [
        '**Cerrar corte** cierra el turno con los montos actuales. **Imprimir corte** imprime el borrador / ticket del corte.',
      ],
    },
    {
      id: 'movimientos',
      titulo: '3. Movimientos (entradas y salidas)',
      cuerpo: [
        'Columna izquierda **Movimientos**. Cada renglón suma o resta según el signo:',
        '· **Fondo fijo (ref)** — referencia (en la captura: `300`).',
        '· **Caja chica anterior (+)** — arrastre del turno previo (`2020`).',
        '· **Venta total (+)** — venta del turno.',
        '· **Pago tarjeta (−)** — se resta del efectivo.',
        '· **Faltante (−)** — faltante de caja (resta).',
        '· **Recolección (−)** — efectivo retirado (resta).',
      ],
      imagen: `${IMG}/02-movimientos.png`,
      imagenAlt: 'Panel Movimientos real con fondo fijo 300 y caja anterior 2020',
      hotspotActivo: 'movimientos',
      notas: [
        'Si eres admin, abajo aparece **Ajuste manual (admin)** con *Subtotal turno* y *Caja final* en **Automático** (solo se llenan si hace falta forzar un valor).',
      ],
    },
    {
      id: 'subtotal-gastos',
      titulo: '4. Subtotal y gastos del turno',
      cuerpo: [
        'Al centro, el bloque oscuro **Subtotal turno** muestra el resultado con la fórmula de pantalla:',
        '`Venta − egresos − tarjeta − faltante`.',
        'Debajo: **Gastos del turno** — eliges **Categoría**, **Empleado** (si aplica), **Concepto**, **Monto**, comentario opcional y pulsas **Agregar**.',
        'La tabla lista los gastos (hora, empleado, cat., monto, estado). Si no hay: *Sin gastos en este turno*.',
      ],
      imagen: `${IMG}/05-gastos-panel.png`,
      imagenAlt: 'Gastos del turno reales: categoría EMPLEADO, concepto CONSUMO, Agregar',
      hotspotActivo: 'centro',
      notas: [
        'Captura **todos** los gastos del turno aquí antes de cerrar. Observaciones van en el cuadro inferior del centro.',
      ],
    },
    {
      id: 'caja-chica',
      titulo: '5. Caja chica',
      cuerpo: [
        'A la derecha, el panel **Caja chica**:',
        '· **Caja chica anterior** (azul) — en la captura `$2,020.00`.',
        '· **Caja chica actual** (verde si ≥ $0) — misma cantidad cuando no hay venta/gastos/recolección.',
        'Fórmula en pantalla: `Anterior + subtotal − recolección`.',
        'Abajo: **Gastos turno** (en la captura `$0.00`).',
      ],
      imagen: `${IMG}/04-caja-chica.png`,
      imagenAlt: 'Panel Caja chica real: anterior y actual $2020.00 en verde',
      hotspotActivo: 'caja',
      notas: [
        'Si la **Caja chica actual** queda por debajo de $0, el monto se pone en **rojo**: eso es el negativo visible en esta pantalla.',
      ],
    },
    {
      id: 'practica-negativo',
      titulo: '6. Practica: cómo se forma un negativo',
      cuerpo: [
        'Usa los mismos campos de **Movimientos** / **Caja chica**. Partimos de la captura (`caja anterior 2020`).',
        'Sube **gastos**, **faltante**, **tarjeta** o **recolección** y mira cuándo la **Caja chica actual** pasa a rojo.',
      ],
      imagen: `${IMG}/00-pantalla-real.png`,
      imagenAlt: 'Referencia: pantalla real del corte (números base de la captura)',
      hotspotActivo: 'caja',
      ejemplo: {
        titulo: 'Calculadora con los campos de la pantalla',
        tipo: 'caja',
        campos: {
          caja_anterior: 2020,
          venta: 0,
          gastos: 0,
          tarjeta: 0,
          faltante: 0,
          recoleccion: 0,
        },
        presets: [
          {
            id: 'captura',
            label: 'Como la captura',
            campos: { caja_anterior: 2020, venta: 0, gastos: 0, tarjeta: 0, faltante: 0, recoleccion: 0 },
          },
          {
            id: 'faltante',
            label: 'Ejemplo faltante',
            campos: { caja_anterior: 2020, venta: 500, gastos: 0, tarjeta: 0, faltante: 2800, recoleccion: 0 },
          },
          {
            id: 'gastos',
            label: 'Ejemplo gastos altos',
            campos: { caja_anterior: 2020, venta: 800, gastos: 3500, tarjeta: 200, faltante: 0, recoleccion: 0 },
          },
          {
            id: 'recoleccion',
            label: 'Ejemplo recolección',
            campos: { caja_anterior: 2020, venta: 1500, gastos: 100, tarjeta: 0, faltante: 0, recoleccion: 4000 },
          },
        ],
        explicacion:
          'Fórmulas de la pantalla: **Subtotal** = Venta − egresos − tarjeta − faltante · **Caja actual** = Anterior + subtotal − recolección. En rojo = negativo.',
      },
    },
    {
      id: 'cerrar',
      titulo: '7. Cerrar e imprimir',
      cuerpo: [
        'Cuando Movimientos, gastos y Caja chica estén revisados:',
        '1. Confirma el **folio**.',
        '2. Pulsa **Cerrar corte** (confirma el resumen).',
        '3. Usa **Imprimir corte** si necesitas el ticket / borrador.',
      ],
      imagen: `${IMG}/01-encabezado.png`,
      imagenAlt: 'Botones reales Cerrar corte e Imprimir corte',
      hotspotActivo: 'encabezado',
      notas: [
        'Si la caja quedó en negativo (rojo), corrige faltantes/gastos o documenta según el proceso de tienda **antes** de recolectar.',
      ],
    },
    {
      id: 'quiz',
      titulo: '8. Preguntas (con la pantalla real)',
      cuerpo: ['Responde con lo que se ve en la captura y las fórmulas del corte.'],
      quiz: [
        {
          id: 'q1',
          pregunta: 'En la captura, ¿cuál es la Caja chica anterior?',
          opciones: ['$300.00', '$2,020.00', '$0.00'],
          correcta: 1,
          explicacion: 'En **Caja chica** / **Movimientos** aparece **2020** → **$2,020.00**.',
        },
        {
          id: 'q2',
          pregunta: '¿Qué campos restan en Movimientos (signo −)?',
          opciones: [
            'Venta total y Caja chica anterior',
            'Pago tarjeta, Faltante y Recolección',
            'Solo Fondo fijo',
          ],
          correcta: 1,
          explicacion: 'En la columna izquierda: **Pago tarjeta (−)**, **Faltante (−)** y **Recolección (−)**.',
        },
        {
          id: 'q3',
          pregunta: 'Fórmula del bloque Subtotal turno en pantalla:',
          opciones: [
            'Anterior + subtotal − recolección',
            'Venta − egresos − tarjeta − faltante',
            'Fondo fijo − faltante',
          ],
          correcta: 1,
          explicacion: 'El bloque oscuro dice exactamente: **Venta − egresos − tarjeta − faltante**.',
        },
        {
          id: 'q4',
          pregunta: 'Caja anterior 2020, venta 0, gastos 2500, resto en 0. ¿Caja actual?',
          opciones: ['$2,020.00', '−$480.00', '$480.00'],
          correcta: 1,
          explicacion: 'Subtotal = 0 − 2500 = −2500 · Caja = 2020 + (−2500) = **−$480** (rojo = negativo).',
        },
        {
          id: 'q5',
          pregunta: '¿Qué botones ves a la derecha del folio?',
          opciones: [
            'Cerrar corte e Imprimir corte',
            'Abono y Liquidar',
            'Solo Guardar',
          ],
          correcta: 0,
          explicacion: 'En el encabezado real: folio, **Cerrar corte** e **Imprimir corte**.',
        },
      ],
    },
    {
      id: 'frase',
      titulo: 'Frase para capacitar',
      cuerpo: [
        '**Movimientos → Gastos del turno → revisa Caja chica → Cerrar corte / Imprimir.**',
        'Si **Caja chica actual** se pone en **rojo**, hay negativo: revisa faltante, gastos, tarjeta y recolección.',
      ],
    },
  ],
};
