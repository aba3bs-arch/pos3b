/** Tutorial · Cómo solicitar un CT (cajero / planta). */

const IMG = '/tutorial-ct-solicitar';

export const TUTORIAL_SOLICITAR_CT = {
  id: 'solicitar-ct',
  titulo: 'Cómo solicitar un Cubre turno (CT)',
  resumen:
    'Desde Plan horario: elige el descanso, pide un CT disponible (verde) y espera a que acepte. Al aceptar, el CT recibe un PIN temporal en su celular.',
  interactivo: false,
  secciones: [
    {
      id: 'mapa',
      titulo: '1. El mapa (5 pasos)',
      cuerpo: [
        'Pedir un **CT** es pedir a alguien de la bolsa de cubre turnos que cubra un **descanso**.',
        'Orden: **Plan horario → descanso → Pedir CT → el CT acepta en su celular → PIN temporal**.',
        'Tú (cajero/planta) no generas el PIN temporal: lo genera el sistema cuando el CT **acepta**.',
      ],
      imagen: `${IMG}/01-mapa.svg`,
      imagenAlt: 'Mapa de 5 pasos para solicitar un CT',
      notas: [
        'Frase: **Descanso → Pedir CT verde → esperar aceptación → el CT marca con PIN temporal.**',
      ],
    },
    {
      id: 'plan',
      titulo: '2. Abre Plan horario y ubica el descanso',
      cuerpo: [
        'En el menú entra a **Checador / Plan horario** de tu sucursal.',
        'Busca el día marcado como **descanso** del cajero que se ausenta.',
        'En esa celda verás la opción **Pedir CT** (o “Solicitar CT”).',
      ],
      imagen: `${IMG}/02-plan-horario.svg`,
      imagenAlt: 'Plan horario con celda de descanso y botón Pedir CT',
    },
    {
      id: 'elegir',
      titulo: '3. Elige un CT en verde',
      cuerpo: [
        'Solo los CT en **verde** se pueden solicitar (disponibles).',
        '**Rojo** = ya cubre, está en hold o no disponible.',
        'Elige el que más te convenga (día/noche, sucursales) y confirma fecha/turno.',
        'Pulsa **Enviar solicitud**. El CT la verá en su app del celular.',
      ],
      imagen: `${IMG}/03-elegir-ct.svg`,
      imagenAlt: 'Lista de CT con semáforo verde/rojo',
      notas: [
        'Si el CT rechaza, puedes pedir a otro. Si acepta y luego no llega, avisa a administración.',
      ],
    },
    {
      id: 'pin',
      titulo: '4. Qué pasa cuando el CT acepta (PIN temporal)',
      cuerpo: [
        'Al **aceptar**, el sistema crea un **PIN temporal** solo para **esa tienda y ese día/turno**.',
        'El CT lo ve en su celular en **negrita, tamaño 16 y parpadeando**, para que no se le olvide.',
        'Con ese PIN entra a la **caja de la sucursal** (no uses el PIN móvil del celular en caja).',
        'El PIN se **cierra 60 minutos después del fin del turno**.',
      ],
      imagen: `${IMG}/04-pin-temporal.svg`,
      imagenAlt: 'PIN temporal parpadeante en la app del CT y uso en caja',
      notas: [
        'Tres PIN distintos: (1) móvil del CT, (2) temporal de esa cobertura, (3) PIN de tienda en Configuración.',
      ],
    },
    {
      id: 'despues',
      titulo: '5. Después de la cobertura',
      cuerpo: [
        'Cuando termine el turno, el cajero de planta **evalúa al CT** (consumo, faltantes, quejas, etc.).',
        'Esa calificación alimenta el **% de aceptación** del CT.',
        'Si el % baja de **60%**, se bloquea la app del CT hasta que un Administrador lo desbloquee en RH.',
      ],
    },
  ],
};
