/** Tutorial Admin · Alta CT, PIN móvil y PIN temporal. */

const IMG = '/tutorial-ct-admin';

export const TUTORIAL_ADMIN_CT = {
  id: 'admin-ct',
  titulo: 'Admin: alta de CT, PIN móvil y PIN temporal',
  resumen:
    'Cómo dar de alta un Cubre turno en RH ABA3B, generar el PIN del celular (visible en su perfil) y entender cómo nace el PIN temporal al aceptar una cobertura.',
  interactivo: false,
  secciones: [
    {
      id: 'mapa',
      titulo: '1. Panorama (solo Administrador / RH)',
      cuerpo: [
        'El CT **no** es un cajero de plaza: se da de alta como tipo **Cubre turnos** en **RH ABA3B**.',
        'Luego le generas su **PIN móvil** (solo celular). Ese PIN se ve en su **perfil RH**.',
        'El **PIN temporal** no lo creas tú: aparece cuando el CT **acepta** una solicitud de una tienda.',
      ],
      imagen: `${IMG}/01-mapa.svg`,
      imagenAlt: 'Mapa admin: alta, PIN móvil, entrega y PIN temporal',
    },
    {
      id: 'alta',
      titulo: '2. Dar de alta un CT en RH ABA3B',
      cuerpo: [
        'Menú **RH ABA3B** → **+ Alta de empleado**.',
        'Tipo: **Cubre turnos** (no ocupa plaza de planta ni nómina fija).',
        'Captura nombre, teléfono, sucursales donde puede cubrir y si es **solo día**.',
        'Pulsa **Registrar alta**. El pago va en gastos **CUBRE TURNO → su nombre**.',
      ],
      imagen: `${IMG}/02-alta-rh.svg`,
      imagenAlt: 'Pantalla de alta RH con tipo Cubre turnos',
    },
    {
      id: 'pin-movil',
      titulo: '3. Generar el PIN del celular (y verlo en el perfil)',
      cuerpo: [
        'Abre el expediente del CT en RH.',
        'En la tarjeta **PIN móvil del CT (app)** pulsa **Generar / regenerar PIN móvil**.',
        'El PIN se muestra **grande en el perfil** para que se lo entregues.',
        'El CT entra con ese PIN **solo en su celular**. Queda anclado al primer teléfono.',
        'Si cambia de celular: **Liberar dispositivo** (o regenerar PIN).',
      ],
      imagen: `${IMG}/03-pin-movil.svg`,
      imagenAlt: 'Perfil RH mostrando PIN móvil grande y botón generar',
      notas: [
        'Solo un **Administrador** puede desbloquear la app si el CT quedó bloqueado por aceptación &lt; 60%.',
      ],
    },
    {
      id: 'tres-pines',
      titulo: '4. Cómo se genera el PIN temporal (importante)',
      cuerpo: [
        'Una tienda pide CT desde **Plan horario**.',
        'El CT ve la solicitud en su app (PIN móvil) y pulsa **Aceptar**.',
        'Ahí el sistema crea un **PIN temporal de 4 dígitos** único para esa tienda/fecha/turno.',
        'Se guarda con vigencia: **desde el día de la cobertura hasta 60 minutos después del fin del turno**.',
        'En la app del CT el PIN parpadea en **negrita y tamaño 16** durante el día, para que no se le olvide al llegar a caja.',
      ],
      imagen: `${IMG}/04-tres-pines.svg`,
      imagenAlt: 'Comparación de los tres PIN: móvil, temporal y de tienda',
      notas: [
        'PIN de tienda (Configuración) = genérico de la sucursal. No es personal del CT.',
        'Nunca mezcles: móvil ≠ temporal ≠ tienda.',
      ],
    },
    {
      id: 'checklist',
      titulo: '5. Checklist rápido del Admin',
      cuerpo: [
        '☐ Alta en RH como **Cubre turnos**.',
        '☐ Generar **PIN móvil** y anotarlo / entregarlo (visible en perfil).',
        '☐ Explicar al CT: celular = solicitudes; caja = PIN temporal del día.',
        '☐ Si cambia de teléfono → Liberar dispositivo.',
        '☐ Si la app está bloqueada por aceptación baja → solo Admin desbloquea en RH.',
      ],
    },
  ],
};
