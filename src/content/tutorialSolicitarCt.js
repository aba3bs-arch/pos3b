/** Tutorial · Cómo solicitar un CT (cajero / planta). */

const IMG = '/tutorial-ct-solicitar';

export const TUTORIAL_SOLICITAR_CT = {
  id: 'solicitar-ct',
  titulo: 'Cómo solicitar un Cubre turno (CT)',
  resumen:
    'Desde Checador → Cubre turnos (o Plan horario): elige fecha/turno, pide un CT en verde y espera a que acepte. Al aceptar, el CT recibe un PIN temporal en su celular.',
  interactivo: true,
  audiencia: 'cajero',
  secciones: [
    {
      id: 'mapa',
      titulo: '1. El mapa (5 pasos)',
      cuerpo: [
        'Pedir un **CT** es pedir a alguien de la bolsa de cubre turnos que cubra un **descanso** o hueco.',
        'Orden: **Checador → Cubre turnos → elegir CT verde → Enviar → el CT acepta en su celular → PIN temporal**.',
        'También puedes pedir desde **Plan horario** en la celda de descanso.',
        'Tú **no** generas el PIN temporal: lo crea el sistema cuando el CT **acepta**.',
      ],
      imagen: `${IMG}/01-mapa.svg`,
      imagenAlt: 'Mapa de 5 pasos para solicitar un CT',
      notas: [
        'Frase: **Descanso → Pedir CT verde → esperar aceptación → el CT marca con PIN temporal.**',
      ],
    },
    {
      id: 'checador',
      titulo: '2. Abre Checador → Cubre turnos',
      cuerpo: [
        'En el menú entra a **Checador**.',
        'Pestaña **Cubre turnos**.',
        'Ahí ves el catálogo (semáforo) y el formulario **Solicitar CT**.',
      ],
      imagen: `${IMG}/02-checador-cubre.svg`,
      imagenAlt: 'Checador con pestaña Cubre turnos',
    },
    {
      id: 'elegir',
      titulo: '3. Elige un CT en verde',
      cuerpo: [
        'Solo los CT en **verde** se pueden solicitar (disponibles **ese día**).',
        '**Rojo** = ya cubre **ese mismo día**, está en hold o no disponible.',
        'Si el CT ya cubre **otro día**, igual aparece en verde y se puede elegir.',
        'Elige fecha, turno y pulsa **Enviar solicitud**.',
      ],
      imagen: `${IMG}/03-elegir-ct.svg`,
      imagenAlt: 'Lista de CT con semáforo verde/rojo y formulario',
      notas: [
        'Si el CT rechaza, pide a otro. Si acepta y no llega, avisa a administración.',
      ],
    },
    {
      id: 'plan',
      titulo: '4. Opción: pedir desde Plan horario',
      cuerpo: [
        'Si tienes permiso de **Plan horario**, abre esa pestaña en Checador.',
        'En la celda de **descanso** usa **Pedir CT** / **Solicitar CT**.',
        'Queda ligado a ese día del plan.',
      ],
      imagen: `${IMG}/04-plan-horario.svg`,
      imagenAlt: 'Plan horario con celda de descanso y Pedir CT',
    },
    {
      id: 'pin',
      titulo: '5. Cuando el CT acepta (PIN temporal)',
      cuerpo: [
        'Al **aceptar**, el sistema crea un **PIN temporal** solo para **esa tienda y ese día/turno**.',
        'El CT lo ve en su celular en **negrita y parpadeando**.',
        'Con ese PIN entra a la **caja** (no uses el PIN móvil del CT en caja).',
        'El PIN se cierra ~**60 min** después del fin del turno.',
      ],
      imagen: `${IMG}/05-pin-temporal.svg`,
      imagenAlt: 'PIN temporal en la app del CT',
      notas: [
        'Tres PIN: (1) móvil del CT, (2) temporal de esa cobertura, (3) PIN de tienda en Configuración.',
      ],
    },
    {
      id: 'despues',
      titulo: '6. Después de la cobertura',
      cuerpo: [
        'Cuando termine el turno, **evalúa al CT** (consumo, faltantes, quejas, etc.).',
        'Todo CT arranca con **100%** de aceptación; esa calificación sube o baja su %.',
        'Si el % baja de **60%**, se bloquea la app del CT hasta que un Administrador lo desbloquee en RH.',
      ],
      imagen: `${IMG}/06-evaluar.svg`,
      imagenAlt: 'Evaluación del CT tras la cobertura',
    },
  ],
};
