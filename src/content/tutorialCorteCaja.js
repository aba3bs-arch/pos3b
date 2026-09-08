/** Tutorial interactivo · Cómo cerrar el corte de caja (POS tienda). */

const IMG = '/tutorial-corte-caja';

export const TUTORIAL_CORTE_CAJA = {
  id: 'corte-caja-pos',
  titulo: 'Cómo cerrar el corte de caja',
  resumen:
    'Paso a paso fácil: abre Corte de caja, revisa tienda/fecha/turno, cuenta el efectivo, escribe el arqueo y guarda. Con imágenes y un juego de práctica.',
  interactivo: true,
  secciones: [
    {
      id: 'mapa',
      titulo: '1. El mapa (5 pasos)',
      cuerpo: [
        'Cerrar el **corte de caja** es como **guardar tu partida** al terminar el turno.',
        'Solo cierras **tu turno** en **tu tienda**. No mezcles diurno con nocturno.',
        'Sigue estos 5 pasos en orden:',
      ],
      imagen: `${IMG}/corte-00-mapa-pasos.jpg`,
      imagenAlt: 'Mapa de 5 pasos: Abrir → Revisar → Contar → Escribir → Guardar',
      notas: [
        'Frase mágica: **Menú → Corte de caja → contar → escribir → Guardar corte.**',
      ],
    },
    {
      id: 'abrir',
      titulo: '2. Abre Corte de caja',
      cuerpo: [
        'En el menú de la izquierda toca **Corte de caja**.',
        'Es el botón debajo de **Ventas**.',
        'Si no lo ves, pide ayuda: tu PIN debe tener permiso de corte.',
      ],
      imagen: `${IMG}/corte-01-menu.jpg`,
      imagenAlt: 'Menú del POS con Corte de caja señalado',
    },
    {
      id: 'revisar',
      titulo: '3. Revisa tienda, fecha y turno',
      cuerpo: [
        'Arriba confirma tres cosas (como revisar tu mochila antes de salir):',
        '1. **Tienda** — ¿es la tuya?',
        '2. **Turno** — diurno o nocturno (el tuyo).',
        '3. **Fecha** — el día correcto del turno.',
        'Luego mira los números verdes y azules: tickets, ventas y **Efectivo neto** (lo que el sistema espera en caja).',
      ],
      imagen: `${IMG}/corte-02-pantalla.jpg`,
      imagenAlt: 'Pantalla Corte de caja con KPIs y selector de turno',
      notas: [
        'Si vendiste de noche: elige **Turno nocturno** y la fecha del día en que **empezó** ese turno.',
      ],
    },
    {
      id: 'contar',
      titulo: '4. Cuenta el dinero de verdad',
      cuerpo: [
        'Saca el efectivo de la caja y **cuéntalo** (billetes + monedas).',
        'Ese número es el **efectivo contado**.',
        'El sistema ya sabe cuánto **espera** (por las ventas de efectivo menos cancelaciones).',
        'Tú solo escribes lo que **realmente** tienes en la mano.',
      ],
      imagen: `${IMG}/corte-03-contar-dinero.jpg`,
      imagenAlt: 'Dinero real de la caja vs campo Arqueo de efectivo',
      notas: [
        '**Regla de oro:** si falta o sobra, **anótalo y avisa**. Nunca inventes un número para que “cuadre”.',
      ],
    },
    {
      id: 'arqueo',
      titulo: '5. Escribe el arqueo (¡practica!)',
      cuerpo: [
        'En la tarjeta **Arqueo de efectivo** escribe el monto en **Efectivo contado (MXN)**.',
        'Abajo verás la **diferencia** = contado − esperado.',
        'Prueba con los números de abajo (puedes cambiarlos):',
      ],
      ejemplo: {
        tipo: 'arqueo',
        titulo: 'Juego: ¿cuadra tu caja?',
        esperado: 1250,
        contado: 1250,
        presets: [
          { id: 'cuadra', label: 'Cuadra ($0)', esperado: 1250, contado: 1250 },
          { id: 'sobra', label: 'Sobra (+$50)', esperado: 1250, contado: 1300 },
          { id: 'falta', label: 'Falta (−$30)', esperado: 1250, contado: 1220 },
        ],
        explicacion:
          '**Verde ($0)** = perfecto. **Azul (positivo)** = sobra. **Rojo (negativo)** = falta. En los tres casos puedes guardar, pero si no es cero **avisa a tu supervisor**.',
      },
      imagen: `${IMG}/corte-05-diferencia.jpg`,
      imagenAlt: 'Tres casos: cuadra, sobra o falta',
    },
    {
      id: 'corroborar',
      titulo: '6. Corrobora tarjeta / transfer / QR',
      cuerpo: [
        'Si hubo pagos con **tarjeta**, **transferencia** o **QR**, llena la tabla **Corroboración otros rubros**.',
        'Compara lo del sistema con lo que dice la **terminal**, el **banco** o la **app**.',
        'Si no hubo de ese tipo, puedes dejarlo en cero o vacío según lo que te indiquen.',
      ],
      imagen: `${IMG}/corte-06-corroboracion.jpg`,
      imagenAlt: 'Tabla de corroboración tarjeta, transferencia y QR',
    },
    {
      id: 'guardar',
      titulo: '7. Guarda el corte',
      cuerpo: [
        'Cuando el contado esté escrito, pulsa el botón verde **Guardar corte**.',
        'Si ya existía un corte de ese turno, no hagas otro: usa **Corregir corte actual** solo si tu encargado te lo pide.',
        'Puedes **Imprimir** el corte para el expediente de la tienda.',
      ],
      imagen: `${IMG}/corte-04-guardar.jpg`,
      imagenAlt: 'Tarjeta Arqueo con botón Guardar corte',
      notas: [
        'Un corte = **una tienda + una fecha + un turno**. No cortes el turno de otra persona sin autorización.',
      ],
    },
    {
      id: 'errores',
      titulo: '8. Errores frecuentes',
      cuerpo: [
        '· Cortar el **turno equivocado** (diurno vs nocturno).',
        '· Escribir el efectivo **sin contarlo** de verdad.',
        '· “Ajustar” el contado para forzar diferencia en cero.',
        '· Ignorar cancelaciones: ya afectan el efectivo esperado.',
        '· Si el sistema dice que el corte ya existe: **Corregir**, no duplicar.',
      ],
    },
    {
      id: 'quiz',
      titulo: '9. Mini examen (¡a ver si aprendiste!)',
      cuerpo: [
        'Responde estas 4 preguntas. Si fallas, vuelve a los pasos anteriores.',
      ],
      quiz: [
        {
          id: 'q1',
          pregunta: '¿Dónde entras para cerrar el corte?',
          opciones: ['Ventas → Cobrar', 'Menú → Corte de caja', 'Productos → Ajuste', 'Checador'],
          correcta: 1,
          explicacion: 'El módulo se llama **Corte de caja** en el menú lateral.',
        },
        {
          id: 'q2',
          pregunta: '¿Qué escribes en “Efectivo contado”?',
          opciones: [
            'Lo que te gustaría que hubiera',
            'El total de ventas del día (todo)',
            'El dinero real que contaste en la caja',
            'Solo las monedas',
          ],
          correcta: 2,
          explicacion: 'Siempre el **dinero real** que contaste. El sistema ya calcula lo esperado.',
        },
        {
          id: 'q3',
          pregunta: 'Si la diferencia es −$40 (falta), ¿qué haces?',
          opciones: [
            'Cambias el contado a lo esperado para que diga $0',
            'Lo anotas, guardas y avisas al supervisor',
            'Borras las ventas del turno',
            'Cierras sin guardar',
          ],
          correcta: 1,
          explicacion: 'Nunca inventes números. **Anota, guarda y avisa**.',
        },
        {
          id: 'q4',
          pregunta: 'Un corte corresponde a…',
          opciones: [
            'Todas las tiendas del día',
            'Una tienda + una fecha + un turno',
            'Solo el efectivo de la semana',
            'Cualquier turno que elijas al azar',
          ],
          correcta: 1,
          explicacion: 'Regla: **tienda + fecha + turno**. No mezcles turnos.',
        },
      ],
    },
    {
      id: 'frase',
      titulo: 'Frase para capacitar',
      cuerpo: [
        '**Corte de caja → revisa tienda/fecha/turno → cuenta el efectivo → escribe el contado → mira la diferencia → Guardar corte. Si no cuadra, avisa.**',
      ],
    },
  ],
};
