/** Tutorial · Configuración → Operación (ilustraciones paso a paso). */

const IMG = '/tutorial-operacion';

export const TUTORIAL_CONFIG_OPERACION = {
  id: 'config-operacion',
  titulo: 'Configuración · Operación (paso a paso)',
  resumen:
    'Tipo de cambio, ventana de recolección, candado post-liquidación y tienda activa de la caja.',
  interactivo: false,
  secciones: [
    {
      id: 'mapa',
      titulo: '1. Abrir el panel Operación',
      cuerpo: [
        'Entrá al menú **Configuración**.',
        'En el hub de subcomandos toca **Operación**.',
        'Ahí verás cuatro bloques:',
        '· **Tipo de cambio** — dólares a pesos.',
        '· **Ventana de recolección** — horario de efectivo en ruta.',
        '· **Candado post-liquidación** — bloquea o permite efectivo tras liquidar.',
        '· **Tienda activa** — sucursal de esta caja.',
      ],
      imagen: `${IMG}/operacion-00-mapa.jpg`,
      imagenAlt: 'Mapa del panel Configuración · Operación',
    },
    {
      id: 'tipo-cambio',
      titulo: '2. Tipo de cambio USD → MXN',
      cuerpo: [
        '1. Escribe el valor de **1 dólar en pesos** (ej. 17.50).',
        '2. Pulsa **Guardar tipo de cambio**.',
        '3. Queda **sincronizado en la nube** para todas las sucursales.',
        '4. Cada caja lo descarga al iniciar sesión.',
        'En **Ventas**, si el cliente paga en dólares, el cambio usa este valor.',
      ],
      imagen: `${IMG}/operacion-01-tipo-cambio.jpg`,
      imagenAlt: 'Formulario de tipo de cambio USD a MXN',
      notas: [
        'Si la tabla de nube no existe, se guarda solo en este equipo y verás el aviso del script SQL.',
      ],
    },
    {
      id: 'ventana',
      titulo: '3. Ventana de recolección',
      cuerpo: [
        'Define el horario (hora Sonora) en que se puede cobrar **efectivo / CFE** en ruta.',
        'Norma típica: **08:00 – 20:00**.',
        '1. Ajusta **Hora inicio** y **Hora fin**.',
        '2. Marca las **tiendas** (o pulsa Todas).',
        '3. **Aplicar a tiendas** sincroniza en la nube.',
        'También puedes **Guardar en este equipo** (solo esta caja) o **Restaurar 8:00 – 20:00**.',
        'Fuera de ventana: mercancía solo a **crédito**; CFE sí se puede registrar.',
      ],
      imagen: `${IMG}/operacion-02-ventana.jpg`,
      imagenAlt: 'Ventana de recolección con horario y tiendas',
    },
    {
      id: 'candado',
      titulo: '4. Candado post-liquidación (ON / OFF)',
      cuerpo: [
        'Si el recolector **ya liquidó hoy**:',
        '· **ON** — no más efectivo; solo crédito (comportamiento normal).',
        '· **OFF** — sí se puede cobrar efectivo; el administrador **sigue recibiendo el aviso**.',
        'Pulsa **ON** o **OFF** y se sincroniza en todas las cajas.',
        'Úsalo OFF solo cuando necesites una excepción operativa (ej. el recolector liquida temprano y sale otra vez).',
      ],
      imagen: `${IMG}/operacion-03-candado.jpg`,
      imagenAlt: 'Switch ON OFF del candado post-liquidación',
      notas: [
        'Default = ON. En Recolecciones verás el aviso según el estado del candado.',
      ],
    },
    {
      id: 'tienda',
      titulo: '5. Tienda / sucursal activa',
      cuerpo: [
        'Indica en qué **tienda** opera esta caja.',
        'Las ventas, cortes y recolecciones quedan ligados a esa sucursal.',
        'Si la instalación está **fijada** (caja física), no se cambia desde aquí.',
        'Si se puede cambiar en el navegador, suele pedir **PIN de administrador**.',
      ],
      imagen: `${IMG}/operacion-04-tienda.jpg`,
      imagenAlt: 'Selector de tienda activa de la caja',
    },
    {
      id: 'resumen',
      titulo: '6. Resumen para capacitar',
      cuerpo: [
        '1. **Configuración → Operación**.',
        '2. Guarda el **tipo de cambio**.',
        '3. Ajusta la **ventana** y aplícala a las tiendas.',
        '4. Deja el **candado ON** salvo excepción; revisa la **tienda activa**.',
      ],
      imagen: `${IMG}/operacion-05-resumen.jpg`,
      imagenAlt: 'Resumen de pasos del panel Operación',
      notas: [
        'Frase: **Cambio y candado van a la nube; la ventana se aplica a las tiendas que marques; la tienda activa es de esta caja.**',
      ],
    },
  ],
};
