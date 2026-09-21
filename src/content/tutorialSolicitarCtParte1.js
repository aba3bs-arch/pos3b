/** Tutorial · Solicitar CT — Parte 1: abrir Plan horario y quitar candado. */

const IMG = '/tutorial-ct-solicitar-p1';

export const TUTORIAL_SOLICITAR_CT_PARTE1 = {
  id: 'solicitar-ct-parte1',
  titulo: 'Solicitar CT — Parte 1: Plan horario y quitar candado',
  resumen:
    'Primera parte del recorrido: desde Inicio abre Checador → Plan horario, localiza el descanso y desbloquea con «Quitar candado» para poder pedir un CT.',
  interactivo: true,
  audiencia: 'admin',
  secciones: [
    {
      id: 'inicio',
      titulo: '1. Entra como administrador',
      cuerpo: [
        'Inicia sesión con un usuario **Administrador** (ej. AMR).',
        'Quedas en **Inicio** (Central de administración).',
        'Esta vista global del plan sirve para ver **todas las tiendas** a la vez.',
      ],
      imagen: `${IMG}/01-inicio.jpg`,
      imagenAlt: 'Pantalla Inicio del POS antes de abrir el menú',
      notas: [
        'El cajero de una sola tienda puede pedir CT también desde **Checador → Cubre turnos**; este video muestra el flujo de admin por Plan horario.',
      ],
    },
    {
      id: 'menu',
      titulo: '2. Menú → Checador',
      cuerpo: [
        'Pulsa el **menú** (☰) arriba a la izquierda.',
        'Baja y elige **Checador**.',
        'Ahí viven Reloj, Plan horario y Cubre turnos.',
      ],
      imagen: `${IMG}/02-menu-checador.jpg`,
      imagenAlt: 'Menú lateral con Checador visible',
    },
    {
      id: 'plan',
      titulo: '3. Pestaña Plan horario',
      cuerpo: [
        'En Checador abre la pestaña **Plan horario**.',
        'Verás el calendario semanal por sucursal (Fusion, 3B2, 3B5, etc.).',
        'Cada fila es un empleado; las celdas amarillas **DESCANSO** son días libres.',
      ],
      imagen: `${IMG}/03-plan-horario.jpg`,
      imagenAlt: 'Plan horario con celdas de turno y DESCANSO',
    },
    {
      id: 'celda',
      titulo: '4. Elige el día de descanso',
      cuerpo: [
        'Busca la **sucursal** y el **empleado** que necesita cobertura.',
        'Pulsa la celda del día (ej. **JUEVES** en amarillo **DESCANSO**).',
        'Si el plan está bloqueado, el sistema **no** deja editar todavía.',
      ],
      imagen: `${IMG}/04-celda-descanso.jpg`,
      imagenAlt: 'Celda DESCANSO seleccionada en el plan',
    },
    {
      id: 'bloqueado',
      titulo: '5. Aviso: turno bloqueado',
      cuerpo: [
        'Aparece un aviso abajo: el horario está **bloqueado**.',
        'Dice que actives un **modo de edición** para poder cambiar o pedir CT.',
        'Esto protege el plan para que no se mueva por error.',
      ],
      imagen: `${IMG}/05-aviso-bloqueado.jpg`,
      imagenAlt: 'Banner de horario bloqueado al tocar una celda',
      notas: [
        'Frase: **Si sale bloqueado → arriba pulsa Quitar candado.**',
      ],
    },
    {
      id: 'candado',
      titulo: '6. Pulsa «Quitar candado»',
      cuerpo: [
        'En la barra de acciones del plan busca **Quitar candado**.',
        'Púlsalo para habilitar la edición (mover descanso, cambiar habitual o pedir CT).',
        'Con el candado quitado ya puedes seguir con la **Parte 2**: solicitar el CT en esa celda.',
      ],
      imagen: `${IMG}/06-quitar-candado.jpg`,
      imagenAlt: 'Botón Quitar candado en la barra del Plan horario',
      notas: [
        'Modos útiles: **Descansos fijos**, **Mover descanso esta semana**, **Cambiar descanso habitual**. Elige el que corresponda antes de tocar celdas.',
        'Cuando subas el siguiente clip, armamos la Parte 2 (pedir CT y enviar la solicitud).',
      ],
    },
  ],
};
