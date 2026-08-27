/** Contenido del módulo Tutorial (POS). Imágenes en /public/tutorial-negativos/ */

export const TUTORIALES = [
  {
    id: 'negativos-pagare',
    titulo: 'Negativos, Pagaré, Abonos y Liquidaciones',
    resumen:
      'Cómo manejar la alerta DINERO EN RECUPERACIÓN: abono, liquidar, pagaré solo en recolección, y qué no puede hacer el cubre turno.',
    secciones: [
      {
        id: 'flujo',
        titulo: '1. El mapa completo',
        cuerpo: [
          'Cuando la caja o una deuda queda en rojo, el flujo correcto es:',
          '1. Aparece la alerta **DINERO EN RECUPERACIÓN** (**Negativo**).',
          '2. Si aún falta dinero → **Abono** (pago parcial) — lo hace el **cajero**.',
          '3. Cuando ya se recuperó todo (**Negativo = $0**) → **Liquidar** — lo hace el **cajero**.',
          '4. **Pagaré** (al final): **únicamente** si el negativo **sigue presente durante una recolección**. Documenta la deuda (2 tickets); no la cierra.',
        ],
        imagen: '/tutorial-negativos/tutorial-01-flujo-negativos.png',
        imagenAlt: 'Flujo Negativo → Abono → Liquidar → Pagaré',
        notas: [
          '**Después de una recolección:** el **cajero** es el **responsable de la recuperación** (abonar / liquidar lo pendiente).',
          'Esto es el *negativo de dinero* (caja / deuda). El inventario negativo en Productos es otro tema (solo Admin).',
        ],
      },
      {
        id: 'negativo',
        titulo: '2. Qué es el “Negativo”',
        cuerpo: [
          'En el corte verás una alerta parpadeante cuando hay un **pagaré** o **préstamo de área** abierto, o la **caja chica** está en negativo.',
          '**Negativo** = lo que aún falta recuperar. **Recuperado** = lo que ya cubrió la venta del corte.',
          'La venta del corte (efectivo) va reduciendo el negativo sola: cada venta suma a Recuperado y baja Negativo.',
        ],
        imagen: '/tutorial-negativos/tutorial-02-alerta-dinero-recuperacion.png',
        imagenAlt: 'Alerta DINERO EN RECUPERACIÓN',
      },
      {
        id: 'roles',
        titulo: '3. Quién hace qué',
        cuerpo: [
          '**Cajero:** Abono y Liquidar.',
          '**Admin / Gerente:** Abono, Liquidar y Pagaré (en recolección).',
          '**Recolector:** Pagaré en recolección (no abona/liquida en el corte).',
          '**Cubre turno (CT):** solo **ve** la alerta. **No** puede Abonar, Liquidar ni Pagaré.',
        ],
        imagen: '/tutorial-negativos/tutorial-04-roles-quien-hace-que.png',
        imagenAlt: 'Tabla de roles',
      },
      {
        id: 'cubre-turno',
        titulo: '4. Cubre turno: no abona ni liquida',
        cuerpo: [
          'El **cubre turno** puede ver la alerta, pero **no** puede pulsar **Abono** ni **Liquidar**.',
          'Eso lo hace el **cajero** cuando **recibe el turno del CT** (entra con su sesión de cajero).',
          'Mensaje típico para CT: *NEGATIVO RECUPERADO — EL CAJERO DEBE LIQUIDAR O ABONAR EN SU SESIÓN*.',
        ],
        imagen: '/tutorial-negativos/tutorial-07-cubre-turno-cajero.png',
        imagenAlt: 'Cubre turno vs cajero',
        notas: [
          '**Después de una recolección, el cajero es el responsable de la recuperación.**',
        ],
      },
      {
        id: 'abono',
        titulo: '5. Abono (pago parcial)',
        cuerpo: [
          'Usa **Abono** cuando todavía hay **Negativo > $0**.',
          '1. Entra como **cajero** (si venía un CT, el cajero retoma el turno).',
          '2. En la alerta pulsa **Abono** y captura el monto.',
          '3. El saldo baja. Si llega a $0, se liquida solo.',
          'También puedes abonar en **Vales y Préstamos → Pagaré** (y otros documentos).',
        ],
        imagen: '/tutorial-negativos/tutorial-05-abono-vs-liquidar.png',
        imagenAlt: 'Abono vs Liquidar',
      },
      {
        id: 'liquidar',
        titulo: '6. Liquidar (cerrar la deuda)',
        cuerpo: [
          'Usa **Liquidar** cuando el **Negativo ya está en $0** pero la alerta sigue visible.',
          'Verás: **NEGATIVO RECUPERADO, FAVOR DE LIQUIDAR Y PAGAR PRÉSTAMO**.',
          'El **cajero** (nunca el CT) pulsa **Liquidar**. La alerta desaparece; no se imprime ticket nuevo.',
        ],
        imagen: '/tutorial-negativos/tutorial-03-negativo-recuperado-liquidar.png',
        imagenAlt: 'Negativo recuperado — Liquidar',
      },
      {
        id: 'pagare',
        titulo: '7. Pagaré (solo en recolección, al final)',
        cuerpo: [
          '**Regla de oro:** el Pagaré se genera **únicamente** cuando el negativo está presente **durante una recolección**.',
          'Va **al final** del flujo: primero recupera (venta / abono / liquidar); si al recolectar **aún** hay negativo, entonces se documenta.',
          'Lo genera **Admin / Gerente / Recolector**. Imprime **2 tickets**.',
          'Generar el pagaré **no liquida** la deuda: solo la documenta.',
          'Después, el **cajero** hace el seguimiento en **Vales y Préstamos → Pagaré** (Abonar / Liquidar).',
        ],
        imagen: '/tutorial-negativos/tutorial-06-pagare-ticket.png',
        imagenAlt: 'Ticket Pagaré ×2',
        notas: [
          '**Después de la recolección, el cajero es el responsable de la recuperación.**',
        ],
      },
      {
        id: 'orden',
        titulo: '8. Orden correcto en tienda',
        cuerpo: [
          '1. Capturar **todos** los gastos del turno (incl. bonos pagados de caja).',
          '2. Atender **DINERO EN RECUPERACIÓN**: Abono / Liquidar (**cajero**).',
          '3. **Cerrar corte**.',
          '4. **Recolectar** — si el negativo sigue presente → **Pagaré**.',
          '5. Después de la recolección → el **cajero** es responsable de la recuperación.',
        ],
      },
      {
        id: 'frase',
        titulo: 'Frase para capacitar',
        cuerpo: [
          'Primero recupera: **Abono** o **Liquidar** (siempre el **cajero**, nunca el cubre turno).',
          'El **Pagaré** va **al final** y **solo** si el negativo está presente **durante la recolección**.',
          'Después de recolectar, el **cajero** es el **responsable de la recuperación**.',
        ],
      },
    ],
  },
];
