/** Tutorial · Vales y Préstamos (ilustraciones generadas, paso a paso). */

const IMG = '/tutorial-vales';

export const TUTORIAL_VALES_MAIN = {
  id: 'vales-prestamos',
  titulo: 'Vales y Préstamos (todas las pestañas)',
  resumen:
    'Recorrido de cada pestaña del módulo, con énfasis en cómo generar vales desde MAIN vs desde la tienda.',
  interactivo: false,
  secciones: [
    {
      id: 'mapa',
      titulo: '1. Las pestañas del módulo',
      cuerpo: [
        'Entrá a **Vales y Préstamos**. Arriba verás estas pestañas:',
        '· **Vales** — consumo, herramienta, accesorios (y gasolina solo en tienda).',
        '· **RIF · fondos** — requisición de dinero entre tiendas o misma tienda.',
        '· **Pagaré** — documenta negativo en recolección.',
        '· **Préstamos área / sucursal** y **Préstamos empleados**.',
        '· **Tipos de vale**, **Gasolina / asistencia** y **Pendientes** (sobre todo admin).',
      ],
      imagen: `${IMG}/vales-00-mapa-pestanas.jpg`,
      imagenAlt: 'Mapa de pestañas del módulo Vales y Préstamos',
    },
    {
      id: 'main-vs-tienda',
      titulo: '2. Lo más importante: MAIN vs Tienda',
      cuerpo: [
        '**Desde MAIN**',
        '· Beneficiarios = personal **indirecto MAIN** (solo el nombre).',
        '· Obligatorio: **Sucursal destino** + **Corte destino**.',
        '· **Sin ventana de horario**: se genera a cualquier hora.',
        '· **Gasolina no** se genera aquí.',
        '',
        '**Desde TIENDA**',
        '· Sucursal = la tienda actual (no eliges otra).',
        '· Eliges **Corte destino** (Virtual / Abarrotes / Garage).',
        '· Gasolina / herramienta / accesorios: hasta la hora límite (ej. 09:00 Sonora) con firma; después van a bandeja admin.',
        '· **Gasolina sí** se genera en tienda.',
      ],
      imagen: `${IMG}/vales-01-main-vs-tienda.jpg`,
      imagenAlt: 'Comparación vales desde MAIN versus desde tienda',
      notas: [
        'En ambos casos el vale aprobado se carga al **corte** que elegiste en esa sucursal.',
      ],
    },
    {
      id: 'vales-main',
      titulo: '3. Pestaña Vales · generar desde MAIN',
      cuerpo: [
        '1. Entrá en **MAIN** → Vales y Préstamos → **Vales**.',
        '2. **Beneficiario** — solo el nombre (indirecto MAIN).',
        '3. **Categoría** — consumo, herramienta, etc. (sin gasolina).',
        '4. **Sucursal destino** — ej. 3B5, FUSION.',
        '5. **Corte destino** — Virtual, Abarrotes o Garage.',
        '6. Monto, fecha, motivo → **Registrar vale**.',
        '7. Imprime para firma. El gasto queda en el corte de esa tienda.',
      ],
      imagen: `${IMG}/vales-02-desde-main.jpg`,
      imagenAlt: 'Formulario Nuevo vale desde MAIN con sucursal y corte',
      notas: [
        'Consumo / personal siempre requiere admin si quien registra no es administrador.',
      ],
    },
    {
      id: 'vales-tienda',
      titulo: '4. Pestaña Vales · generar desde TIENDA',
      cuerpo: [
        '1. En la **tienda** → Vales → **Nuevo vale**.',
        '2. Beneficiario + **Corte destino** + categoría.',
        '3. Aquí sí puedes elegir **Gasolina**.',
        '4. Antes de la hora límite: se imprime con firma (según tipo).',
        '5. Después de la hora límite (tipos sin nómina): va a **Pendientes** del admin.',
        '6. El cajero **solo imprime**; no edita ni elimina.',
      ],
      imagen: `${IMG}/vales-03-desde-tienda.jpg`,
      imagenAlt: 'Formulario Nuevo vale desde tienda con gasolina y ventana horaria',
      notas: [
        'Regla corta: **gasolina = siempre en tienda**. MAIN manda consumo/otros a una sucursal + corte.',
      ],
    },
    {
      id: 'rif',
      titulo: '5. Pestaña RIF · fondos',
      cuerpo: [
        '**RIF** = Requisición Interna de Fondos.',
        '· **Entre tiendas** — dinero/fondo hacia otra sucursal.',
        '· **Misma tienda · compra mercancía** — documentas fondo en la misma caja.',
        'Usa **Abonar** / **Liquidar** e **Imprimir (firma)**.',
        'Si no se liquida a la hora promesa, puede cargarse a **Corte Abarrotes** como fondo requerido.',
      ],
      imagen: `${IMG}/vales-04-rif.jpg`,
      imagenAlt: 'Pestaña RIF con modos entre tiendas y misma tienda',
    },
    {
      id: 'pagare',
      titulo: '6. Pestaña Pagaré',
      cuerpo: [
        'El **Pagaré** documenta un negativo de caja **solo si sigue presente durante una recolección**.',
        'No cierra la deuda: deja constancia (tickets) para seguimiento.',
        'Elige área, monto, cajero y turno según el flujo de recolección.',
      ],
      imagen: `${IMG}/vales-05-pagare.jpg`,
      imagenAlt: 'Pestaña Pagaré y regla de recolección',
    },
    {
      id: 'prestamos',
      titulo: '7. Pestañas de Préstamos',
      cuerpo: [
        '**Préstamos área / sucursal** — dinero entre Virtual, Abarrotes, Garage o entre tiendas. Abonar, liquidar, recolectar (según rol).',
        '**Préstamos empleados** — préstamo a persona; cuota semanal mínima $500 en nómina.',
        'Admin aprueba; montos **mayores a $1,000** requieren PIN de Antonio, Francisco o José Luis.',
      ],
      imagen: `${IMG}/vales-06-prestamos.jpg`,
      imagenAlt: 'Préstamos área/sucursal y préstamos a empleados',
    },
    {
      id: 'admin',
      titulo: '8. Tipos · Gasolina · Pendientes (admin)',
      cuerpo: [
        '**Tipos de vale** — crea tipos permanentes (ej. Uniformes) para todas las tiendas.',
        '**Gasolina / asistencia** — consulta y marca cobrado de vales de gasolina (generados en tienda).',
        '**Pendientes** — aprueba o rechaza vales/préstamos que esperan autorización.',
      ],
      imagen: `${IMG}/vales-07-admin-tabs.jpg`,
      imagenAlt: 'Pestañas admin: Tipos, Gasolina y Pendientes',
    },
    {
      id: 'permisos',
      titulo: '9. Admin vs cajero en Vales',
      cuerpo: [
        '**Administrador** — Editar, Eliminar, Imprimir, Aprobar, Tipos, Gasolina.',
        '**Cajero** — solo **Imprimir** vales ya aprobados.',
        'Así la caja no borra ni cambia montos por error.',
      ],
      imagen: `${IMG}/vales-08-permisos.jpg`,
      imagenAlt: 'Permisos admin versus cajero en vales',
    },
    {
      id: 'frase',
      titulo: 'Frase para capacitar',
      cuerpo: [
        '**MAIN → beneficiario + sucursal + corte, a cualquier hora (sin gasolina). Tienda → corte + ventana; gasolina aquí. Admin edita/borra; cajero solo imprime.**',
      ],
      imagen: `${IMG}/vales-01-main-vs-tienda.jpg`,
      imagenAlt: 'Resumen MAIN vs Tienda',
    },
  ],
};
