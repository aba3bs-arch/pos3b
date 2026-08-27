/** Tutorial interactivo: Corte Abarrotes + negativos (imágenes en /public/tutorial-corte-abarrotes/) */

export const TUTORIAL_CORTE_ABARROTES = {
  id: 'corte-abarrotes',
  titulo: 'Corte Abarrotes y negativos',
  resumen:
    'Tutorial interactivo con pantallas y ejemplos numéricos: cómo cuadrar el corte, qué es el Negativo, Abono, Liquidar y Pagaré.',
  interactivo: true,
  secciones: [
    {
      id: 'pantalla',
      titulo: '1. La pantalla de Corte Abarrotes',
      cuerpo: [
        'En el menú abre **Corte Abarrotes** (independiente del corte de caja POS).',
        'Captura el **folio**, revisa **Movimientos** y la **Caja chica actual**.',
        'Fórmula de caja: `Anterior + Venta − Gastos − Recolección − Faltante − Tarjeta`.',
      ],
      imagen: '/tutorial-corte-abarrotes/01-pantalla-corte.png',
      imagenAlt: 'Pantalla Corte Abarrotes con movimientos, gastos y caja chica',
      notas: [
        'Captura **todos** los gastos del turno (incl. bonos de caja) **antes** de cerrar o recolectar.',
      ],
      ejemplo: {
        titulo: 'Ejemplo: cómo se calcula la caja',
        tipo: 'caja',
        campos: {
          caja_anterior: 850,
          venta: 3200,
          gastos: 200,
          tarjeta: 450,
          faltante: 0,
          recoleccion: 0,
        },
        explicacion:
          'Prueba: 850 + 3200 − 200 − 450 = **$3,400**. Si subes gastos o faltante, la caja baja; si pasa de $0 a rojo, aparece la alerta de negativo.',
      },
    },
    {
      id: 'que-es-negativo',
      titulo: '2. Qué es el “Negativo”',
      cuerpo: [
        'Aparece la alerta parpadeante **DINERO EN RECUPERACIÓN · ABARROTES** cuando:',
        '· Hay un **pagaré** o **préstamo de área** abierto hacia Abarrotes, o',
        '· La **caja chica actual** está en rojo (menor a $0).',
        '**Negativo** = lo que aún falta recuperar. **Recuperado** = lo que ya cubrió la venta del corte.',
      ],
      imagen: '/tutorial-corte-abarrotes/02-alerta-negativo.png',
      imagenAlt: 'Alerta DINERO EN RECUPERACIÓN en Corte Abarrotes con Negativo −$400',
      notas: [
        'Esto es *negativo de dinero* (caja / deuda). El stock negativo en Productos es otro tema (solo Admin).',
      ],
      ejemplo: {
        titulo: 'Ejemplo A — Préstamo Virtual → Abarrotes $400',
        tipo: 'recuperacion',
        escenarios: [
          {
            id: 'inicio',
            label: 'Al recibir el préstamo',
            deuda: 400,
            ventaAplicada: 0,
            narracion:
              'Virtual prestó $400 a Abarrotes. En Corte Abarrotes: Negativo **−$400**, Recuperado **$0**. Botones: **Abono** y (si aplica) **Pagaré**.',
          },
          {
            id: 'venta-parcial',
            label: 'Con venta parcial $150',
            deuda: 400,
            ventaAplicada: 150,
            narracion:
              'La venta del corte baja sola el negativo: Negativo **−$250**, Recuperado **$150**. Aún puedes **Abonar** el resto.',
          },
          {
            id: 'venta-cubre',
            label: 'Con venta $750 (cubre todo)',
            deuda: 400,
            ventaAplicada: 750,
            narracion:
              'Negativo **$0**, Recuperado **$400**. Aparece: *NEGATIVO RECUPERADO, FAVOR DE LIQUIDAR…* → el **cajero** pulsa **Liquidar**.',
          },
        ],
      },
    },
    {
      id: 'caja-negativa',
      titulo: '3. Ejemplo: caja chica en negativo',
      cuerpo: [
        'Si los egresos superan lo que hay en caja, **Caja chica actual** se pone en rojo.',
        'La alerta avisa: *Corte en negativo — genera pagaré o recupera hasta $0.00*.',
        'No se puede recolectar con caja en negativo: primero recupera / abona / documenta.',
      ],
      imagen: '/tutorial-corte-abarrotes/04-caja-negativa.png',
      imagenAlt: 'Caja chica actual en −$180 con alerta de recuperación',
      ejemplo: {
        titulo: 'Ejemplo B — Números de caja negativa',
        tipo: 'caja',
        campos: {
          caja_anterior: 500,
          venta: 620,
          gastos: 1150,
          tarjeta: 100,
          faltante: 50,
          recoleccion: 0,
        },
        explicacion:
          '500 + 620 − 1150 − 0 − 50 − 100 = **−$180**. Hay que recuperar o, en recolección si sigue el negativo, generar **Pagaré**.',
      },
    },
    {
      id: 'abono',
      titulo: '4. Abono (pago parcial)',
      cuerpo: [
        'Usa **Abono** cuando **Negativo > $0** y quieres registrar un pago parcial.',
        'Lo hace el **cajero** (o admin/gerente). El **cubre turno no puede** abonar.',
        'Si el abono deja el saldo en $0, se liquida solo.',
      ],
      imagen: '/tutorial-corte-abarrotes/05-abono-parcial.png',
      imagenAlt: 'Antes y después de un abono de $100 sobre negativo de $400',
      ejemplo: {
        titulo: 'Ejemplo C — Abono de $100',
        tipo: 'abono',
        deudaInicial: 400,
        recuperadoInicial: 50,
        montoAbonoDefault: 100,
        narracionAntes: 'Negativo −$400 · Recuperado $50 (venta ya aplicada).',
        narracionDespues: 'Tras abonar $100: Negativo −$300 · el saldo baja. Sigue el cajero hasta liquidar.',
      },
    },
    {
      id: 'liquidar',
      titulo: '5. Liquidar cuando ya recuperaste',
      cuerpo: [
        'Cuando **Negativo = $0** pero la alerta sigue, el cajero debe **Liquidar**.',
        'Ejemplo: préstamo $400 + venta del corte $750 → Negativo $0 y Recuperado $400.',
        'El cubre turno solo ve el aviso; **no** liquida. Entrega turno al cajero.',
      ],
      imagen: '/tutorial-corte-abarrotes/03-ejemplo-recuperado.png',
      imagenAlt: 'Negativo recuperado $0 / Recuperado $400 con botón Liquidar',
      notas: [
        '**Liquidar** cierra la deuda y quita la alerta. No imprime ticket nuevo desde el corte.',
      ],
    },
    {
      id: 'pagare-orden',
      titulo: '6. Orden correcto y Pagaré',
      cuerpo: [
        '1. Capturar **todos** los gastos del turno.',
        '2. Atender **DINERO EN RECUPERACIÓN**: Abono / Liquidar (**cajero**).',
        '3. **Cerrar corte**.',
        '4. **Recolectar** — si el negativo **sigue** presente → **Pagaré** (admin / gerente / recolector, 2 tickets).',
        '5. Después de la recolección, el **cajero** es responsable de la recuperación.',
      ],
      imagen: '/tutorial-corte-abarrotes/06-flujo-orden.png',
      imagenAlt: 'Flujo en 5 pasos del Corte Abarrotes',
      notas: [
        'El Pagaré **documenta** la deuda; **no** la cierra. Seguimiento en **Vales y Préstamos → Pagaré**.',
      ],
    },
    {
      id: 'quiz',
      titulo: '7. Practica (elige la respuesta)',
      cuerpo: [
        'Marca la opción correcta en cada pregunta. Sirve para capacitar en tienda.',
      ],
      quiz: [
        {
          id: 'q1',
          pregunta: 'Virtual prestó $400 a Abarrotes. ¿Dónde aparece la alerta con Negativo −$400?',
          opciones: [
            'En Corte Virtual (origen)',
            'En Corte Abarrotes (destino)',
            'Solo en Contabilidad',
          ],
          correcta: 1,
          explicacion: 'La alerta sale en el corte del **Destino** (quien recibió y debe recuperar): Abarrotes.',
        },
        {
          id: 'q2',
          pregunta: 'Negativo ya está en $0 y dice “FAVOR DE LIQUIDAR…”. ¿Quién pulsa Liquidar?',
          opciones: [
            'El cubre turno',
            'El cajero (o admin/gerente)',
            'Cualquier usuario de la tienda',
          ],
          correcta: 1,
          explicacion: 'El **cubre turno no puede** liquidar ni abonar. Lo hace el **cajero** en su sesión.',
        },
        {
          id: 'q3',
          pregunta: '¿Cuándo se genera el Pagaré por esta alerta?',
          opciones: [
            'En cuanto aparece el negativo',
            'Solo si el negativo sigue presente durante una recolección',
            'Al cerrar el corte siempre',
          ],
          correcta: 1,
          explicacion: 'Regla de oro: Pagaré **al final**, solo si el negativo está presente **en la recolección**.',
        },
        {
          id: 'q4',
          pregunta: 'Caja: anterior 500 + venta 620 − gastos 1150 − tarjeta 100 − faltante 50. ¿Caja actual?',
          opciones: ['$−180', '$180', '$0'],
          correcta: 0,
          explicacion: '500 + 620 − 1150 − 100 − 50 = **−$180**. Hay que recuperar antes de recolectar.',
        },
      ],
    },
    {
      id: 'frase',
      titulo: 'Frase para capacitar',
      cuerpo: [
        'En **Corte Abarrotes**: mete **todos** los gastos, atiende el **Negativo** (Abono/Liquidar = **cajero**), **cierra** y **después** recolecta.',
        'El **Pagaré** va **al final** y **solo** si el negativo sigue en la recolección. Luego el **cajero** recupera.',
      ],
    },
  ],
};
