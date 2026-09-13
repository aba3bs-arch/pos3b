/** Tutorial · Reloj checador de empleados (imágenes 3D). */

const IMG = '/tutorial-reloj-empleado';

export const TUTORIAL_RELOJ_EMPLEADO = {
  id: 'reloj-empleado',
  titulo: 'Reloj checador de empleados',
  resumen:
    'Cómo marcar entrada y salida en Checador → Reloj empleados: PIN, confirmar Entrada/Salida, fuera de horario, cubre turno e historial del día.',
  interactivo: true,
  audiencia: 'tienda',
  secciones: [
    {
      id: 'mapa',
      titulo: '1. Dónde está el reloj',
      cuerpo: [
        'En el menú abre **Checador**.',
        'Pulsa la pestaña **Reloj empleados**.',
        'Verás la hora en vivo de la tienda y el campo del PIN.',
        'La tienda actual se muestra en la etiqueta (ej. 3B2 Pueblo Nuevo).',
      ],
      imagen: `${IMG}/01-mapa.png`,
      imagenAlt: 'Tablet 3D del Reloj checador en Checador',
      notas: [
        'Frase: **Checador → Reloj empleados → PIN → Entrada o Salida.**',
      ],
    },
    {
      id: 'pin',
      titulo: '2. Escribe tu PIN de empleado',
      cuerpo: [
        'Usa el **PIN de esta tienda** (el de Usuarios / RH), no el PIN móvil de CT.',
        'Pulsa **Continuar** (o Enter).',
        'Personal de **MAIN**, Auditor, Técnico o Repartidor puede marcar en cualquier caja.',
      ],
      imagen: `${IMG}/02-pin.png`,
      imagenAlt: 'Pantalla 3D para capturar el PIN del empleado',
    },
    {
      id: 'entrada-salida',
      titulo: '3. Confirma Entrada o Salida',
      cuerpo: [
        'Aparece tu nombre y dos botones:',
        '**Entrada** (verde) al llegar.',
        '**Salida** (dorado) al terminar el turno.',
        'Confirma solo el marcaje correcto; queda registrado en asistencias.',
      ],
      imagen: `${IMG}/03-entrada-salida.png`,
      imagenAlt: 'Tarjeta 3D con botones Entrada y Salida',
      notas: [
        'Si te equivocas, avisa a un administrador: puede corregir el historial del día.',
      ],
    },
    {
      id: 'fuera-horario',
      titulo: '4. Si estás fuera de horario',
      cuerpo: [
        'Si marcas fuera de tu turno (± tolerancia), el sistema pide **autorización**.',
        'Un administrador escribe su **PIN** y pulsa **Autorizar**.',
        'Sin autorización no se guarda el marcaje fuera de horario.',
      ],
      imagen: `${IMG}/04-fuera-horario.png`,
      imagenAlt: 'Tarjeta 3D de autorización fuera de horario',
    },
    {
      id: 'cubre',
      titulo: '5. Cubre turno en el reloj',
      cuerpo: [
        'Quien cubre usa el **PIN de cubre turno** de la sucursal (Configuración).',
        'Obligatorio: **nombre y apellido** + **teléfono** (10 dígitos).',
        'Luego confirma **Entrada** o **Salida** igual que un fijo.',
        'Si un fijo no coincide con su turno, también puede marcar cubriendo otro (±20 min).',
      ],
      imagen: `${IMG}/05-cubre-turno.png`,
      imagenAlt: 'Formulario 3D de cubre turno con nombre y teléfono',
    },
    {
      id: 'historial',
      titulo: '6. Historial de hoy',
      cuerpo: [
        'Abajo del reloj ves los marcajes de **hoy** en esta tienda.',
        'Cada fila muestra empleado, tipo (Entrada/Salida) y hora.',
        'Admin puede editar o borrar un registro si hubo error.',
      ],
      imagen: `${IMG}/06-historial.png`,
      imagenAlt: 'Histora 3D del historial de asistencias del día',
    },
  ],
};
