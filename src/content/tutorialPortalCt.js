/** Tutorial · Portal del Cubre turno (celular del CT). */

const IMG = '/tutorial-ct-portal';

export const TUTORIAL_PORTAL_CT = {
  id: 'portal-ct',
  titulo: 'Portal CT: aceptar coberturas en tu celular',
  resumen:
    'Entra con tu PIN móvil, revisa las solicitudes de las tiendas, acepta y usa el PIN temporal en caja. Incluye Maps de la sucursal.',
  interactivo: true,
  audiencia: 'ct',
  secciones: [
    {
      id: 'entrada',
      titulo: '1. Entra con tu PIN móvil',
      cuerpo: [
        'En el celular abre la app **POS 3B** (o el enlace que te dio administración).',
        'Escribe tu **PIN móvil** (el personal que te dieron en RH). **No** es el PIN de la caja.',
        'Quedas en **Checador → Mis solicitudes CT**. Solo ves tus coberturas.',
      ],
      imagen: `${IMG}/01-login-pin.svg`,
      imagenAlt: 'Login con PIN móvil en el celular del CT',
      notas: [
        'El PIN móvil queda anclado a **este** teléfono. Si cambias de celular, pide a Admin **Liberar dispositivo**.',
      ],
    },
    {
      id: 'instalar',
      titulo: '2. Instala la app en tu pantalla de inicio',
      cuerpo: [
        'Pulsa **Instalar app** (arriba del portal) para dejar el ícono en el celular.',
        'Así abres más rápido y recibes las solicitudes sin buscar el enlace.',
      ],
      imagen: `${IMG}/02-instalar-app.svg`,
      imagenAlt: 'Botón Instalar app en el portal CT',
    },
    {
      id: 'solicitudes',
      titulo: '3. Revisa las solicitudes',
      cuerpo: [
        'En **Solicitudes para ti** verás fecha, **tienda** (ej. **3B2 Pueblo Nuevo**), estado y quién pidió.',
        'Cada tienda tiene enlace **Maps** para ubicarla en Google Maps.',
        'Pulsa **Actualizar** si no ves una solicitud nueva.',
      ],
      imagen: `${IMG}/03-solicitudes.svg`,
      imagenAlt: 'Lista de solicitudes con tienda, Maps y botones Aceptar/Rechazar',
    },
    {
      id: 'aceptar',
      titulo: '4. Acepta (o rechaza) la cobertura',
      cuerpo: [
        '**Aceptar** = te comprometes a cubrir esa tienda/fecha/turno.',
        'Al aceptar aparece tu **PIN temporal** (grande, parpadeante) — es el que usas en la **caja** de esa tienda.',
        '**Rechazar** avisa a la tienda para que pidan a otro CT.',
      ],
      imagen: `${IMG}/04-aceptar-pin.svg`,
      imagenAlt: 'PIN temporal parpadeante tras aceptar',
      notas: [
        'Tres PIN distintos: (1) móvil = celular, (2) temporal = caja ese día, (3) tienda = genérico de Configuración.',
      ],
    },
    {
      id: 'caja',
      titulo: '5. En la tienda: marca con el PIN temporal',
      cuerpo: [
        'Llega a la sucursal (usa **Maps** si no conoces la colonia).',
        'En la **caja** entra con el **PIN temporal** del día — **no** con tu PIN móvil.',
        'El temporal sigue visible en tu celular hasta el cierre del turno (+ gracia).',
      ],
      imagen: `${IMG}/05-caja-maps.svg`,
      imagenAlt: 'PIN temporal en caja y Maps de la tienda',
    },
    {
      id: 'aceptacion',
      titulo: '6. Tu % de aceptación',
      cuerpo: [
        'Arrancas en **100%**. Después de cada cobertura la tienda te evalúa.',
        'Si bajas de **60%**, la app se bloquea hasta que un Administrador te desbloquee en RH.',
        'Mantén puntualidad, sin faltantes ni quejas.',
      ],
      imagen: `${IMG}/06-aceptacion.svg`,
      imagenAlt: 'Indicador de aceptación del CT',
    },
  ],
};
