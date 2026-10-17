/** Tutorial · Proceso de abasto a tiendas (Encargado de Abastecimiento / Venta en Ruta). */

export const TUTORIAL_ABASTO_RUTA = {
  id: 'proceso-abasto-ruta',
  titulo: 'Proceso de abasto a tiendas (Venta en Ruta)',
  resumen:
    'Cómo el Encargado de Abastecimiento surte las 8 sucursales con Venta en Ruta: carga, entrega con PIN, evidencias, RC y qué NO puede hacer (cortes y contabilidad de tienda).',
  interactivo: true,
  audiencia: 'ruta',
  secciones: [
    {
      id: 'proposito',
      titulo: '1. Propósito y alcance',
      cuerpo: [
        'Abastecer **Fusión, 3B2, 3B3, 3B5, 3B6, 3B7, 3B9 y 3B10** con entregas completas, a tiempo y documentadas.',
        'Inicia en **CEDIS / Almacén Principal** (carga del camión) y termina con evidencias (fichas + fotos) y cierre en **RC/VentaRuta**.',
        'Puesto: **Encargado de Abastecimiento** (en el POS: rol **Repartidor** / recolector). Reporta a Gerente de Operaciones y/o RH.',
      ],
      notas: [
        'No interviene en la operación interna de las tiendas (piso, cortes, contabilidad).',
      ],
    },
    {
      id: 'acceso',
      titulo: '2. Cómo entra al sistema',
      cuerpo: [
        '1. Inicia sesión en el POS con su usuario.',
        '2. Abre el menú **Venta en Ruta**.',
        '3. En POS / Gastos / Servicios: elige **vendedor** e ingresa su **PIN** (usuario o Panel RT).',
        'Sin PIN (o el atajo “Continuar como mi usuario” si ya es Repartidor) no opera el abasto en el sistema.',
      ],
    },
    {
      id: 'politicas',
      titulo: '3. Políticas clave',
      cuerpo: [
        '· Lo que sale del AP **regresa** con ficha firmada o con producto + efectivo. Sin excepciones.',
        '· Horario: **8:00–13:00** (4 tiendas) y **15:00–20:00** (4 tiendas), ruta variable.',
        '· Solo: anunciar llegada, entregar mercancía y apoyo mínimo acordado. **No** acomoda piso ni da órdenes al personal.',
        '· **Prohibido** dar indicaciones sobre **cortes de caja** o **contabilidad** de la sucursal.',
        '· Ante conflicto: retirarse y escalar a Gerencia. Sin gritos ni confrontaciones.',
      ],
    },
    {
      id: 'paso1',
      titulo: '4. Paso 1 — Validar carga (CEDIS)',
      cuerpo: [
        '**Venta en Ruta → Carga de camión**.',
        'Verifica código, descripción, cantidad y caducidad vs físico **antes de salir**.',
        'Reporta diferencias al momento. Conserva el ticket de carga (`CI-…`).',
        'Opcional: **Preinventario** del camión si necesitas conteo sin alterar el teórico.',
      ],
    },
    {
      id: 'paso2-3',
      titulo: '5. Pasos 2 y 3 — Ruta y entrega en tienda',
      cuerpo: [
        'Sigue la secuencia y horarios de la ruta.',
        'En tienda: *«Buen día, ¿con quién veo la recepción del abasto de hoy?»*',
        '**POS venta en ruta** → destino = tienda → productos → cobro (efectivo / crédito / mixto).',
        'Conteo conjunto. Si hay diferencia: documenta con foto para ajuste.',
        'Recaba ficha firmada (fecha + folio/traspaso) y **fotografía** la evidencia por tienda.',
      ],
      notas: [
        'La tienda recibe en **Compras**. Tú no operas el corte ni la contabilidad de esa tienda.',
      ],
    },
    {
      id: 'incidencias',
      titulo: '6. Paso 4 — Incidencias',
      cuerpo: [
        'Dañado / caduco: llenar **FAB-018** (formato de devolución) con el encargado de tienda.',
        'Venta mal cobrada en el POS: **Cancelación / Devolución** (la aprueba un admin con PIN).',
        'No inventes ajustes de efectivo o crédito fuera del sistema.',
      ],
    },
    {
      id: 'cierre',
      titulo: '7. Paso 5 — Cierre de ruta',
      cuerpo: [
        'Efectivo de ventas → se liquida en **RC/VentaRuta**.',
        'Gastos del camino (combustible, etc.) → **Venta en Ruta → Gastos** con foto del ticket.',
        'Reporta cierre y estado de la unidad. Entrega evidencias (lunes/martes).',
      ],
    },
    {
      id: 'comunicacion',
      titulo: '8. Qué decir (y qué no)',
      cuerpo: [
        '**Diferencia:** *«Aquí hay 900 y deberían ser 1000. ¿Lo verificamos juntos?»* — no digas “me están robando”.',
        '**Otra tarea:** *«Eso lo ve mi supervisor; yo solo entrego y recolecto.»*',
        '**Corte / contabilidad:** *«No estoy autorizado a dar indicaciones de corte ni contabilidad de la sucursal.»*',
        '**Conflicto:** *«Lo reviso con mi gerente y regreso. Gracias.»* — sin alzar la voz.',
      ],
    },
    {
      id: 'mapa-sistema',
      titulo: '9. Mapa rápido: abasto ↔ Venta en Ruta',
      cuerpo: [
        'Carga AP → **Carga de camión**',
        'Entrega tienda → **POS** (PIN)',
        'Crédito → **Créditos por pagar**',
        'Gasto + foto → **Gastos**',
        'Venta mal → **Cancelación / Devolución**',
        'Efectivo ruta → **RC/VentaRuta**',
        'Cortes / contabilidad tienda → **fuera de tu alcance**',
      ],
    },
    {
      id: 'evaluacion',
      titulo: '10. Evaluación',
      cuerpo: [
        'Marca la opción correcta. Apruebas con 70% o más.',
      ],
      evaluacion: [
        {
          pregunta: '¿El Encargado de Abasto puede indicar a la tienda cómo hacer el corte o la contabilidad?',
          opciones: [
            'Sí, si conoce el sistema',
            'No; eso está fuera de su facultad (escala a Gerencia / Contabilidad)',
            'Solo el corte de Abarrotes',
            'Solo si el cajero se lo pide',
          ],
          correcta: 1,
          explicacion:
            'Política 4.5: no da indicaciones de cortes ni contabilidad de sucursales.',
        },
        {
          pregunta: 'Para entregar mercancía en una tienda, ¿qué usa en el POS?',
          opciones: [
            'Corte Abarrotes de la tienda',
            'Venta en Ruta → POS (vendedor + PIN) con destino = tienda',
            'Solo Contabilidad → IE',
            'Configuración → Privilegios',
          ],
          correcta: 1,
          explicacion: 'La entrega operativa es el POS de Venta en Ruta.',
        },
        {
          pregunta: 'Si ya cobró mal una venta en ruta, ¿qué hace?',
          opciones: [
            'Borra el efectivo a mano',
            'Pide Cancelación / Devolución (PIN admin)',
            'Le dice al cajero que ajuste el corte',
            'Ignora el error',
          ],
          correcta: 1,
          explicacion: 'Cancelación / Devolución revierte inventario, crédito y RC con aprobación admin.',
        },
        {
          pregunta: '¿Qué debe llevar siempre al salir del AP?',
          opciones: [
            'Solo la llave del camión',
            'Mercancía validada; al regresar: ficha firmada o producto + efectivo',
            'El corte de cada tienda',
            'La contraseña de Contabilidad',
          ],
          correcta: 1,
          explicacion: 'Política 4.1: no hay excepciones.',
        },
        {
          pregunta: 'Un gasto de gasolina en ruta, ¿dónde se registra con foto?',
          opciones: [
            'Corte Abarrotes de 3B3',
            'Venta en Ruta → Gastos (foto del ticket)',
            'Usuarios → PIN',
            'No se registra',
          ],
          correcta: 1,
          explicacion: 'Gastos de ruta con evidencia; se descuentan en RC/VentaRuta.',
        },
        {
          pregunta: 'Horario matutino de entrega (4 sucursales):',
          opciones: [
            '8:00 a 13:00',
            '15:00 a 20:00',
            'Todo el día sin horario',
            'Solo los lunes',
          ],
          correcta: 0,
          explicacion: '8:00–13:00 mañana; 15:00–20:00 tarde (ruta variable).',
        },
      ],
    },
    {
      id: 'cierre',
      titulo: '11. Frase para capacitar',
      cuerpo: [
        '**Cargo en CEDIS · entrego con PIN en POS · ficha + foto · efectivo a RC · no toco cortes ni contabilidad de tienda.**',
      ],
    },
  ],
};
