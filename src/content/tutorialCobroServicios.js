/** Tutorial · Cobro de servicios → RC Servicios → Tesorería (Cheche). */

const IMG = '/tutorial-cobro-servicios';

export const TUTORIAL_COBRO_SERVICIOS = {
  id: 'cobro-servicios-tesoreria',
  titulo: 'Cobro de servicios hasta Tesorería',
  resumen:
    'Flujo completo: catálogo de servicios → cobro (móvil o Recolecciones) → aprobación con PIN → RC Servicios → cuenta Servicios → Tesorería (Cheche). Con evaluación.',
  interactivo: true,
  audiencia: 'ruta',
  secciones: [
    {
      id: 'mapa',
      titulo: '1. El mapa en 20 segundos',
      cuerpo: [
        'El dinero de **CFE y otros servicios** viaja aparte de la mercancía (Francisco).',
        'Flujo: **Cobrar en tienda → RC Servicios → cuenta Servicios → Tesorería (Cheche)**.',
        'Frase clave: **Servicio se cobra · cajero aprueba · RC liquida · Cheche recibe.**',
      ],
      imagen: `${IMG}/01-mapa-flujo.svg`,
      imagenAlt: 'Mapa: Cobrar → PIN → RC Servicios → Servicios → Tesorería Cheche',
      notas: [
        'Nunca mezcles estos montos con Pendientes por liquidar de abarrotes / venta.',
      ],
    },
    {
      id: 'catalogo',
      titulo: '2. Catálogo: Panel RT → Servicios',
      cuerpo: [
        'Antes de cobrar, el admin configura los servicios en **Contabilidad → Panel RT → Servicios**.',
        'Ahí defines nombre (ej. CFE), clave, monto por defecto y si es **obligatorio**.',
        'Sin catálogo activo, el recolector no puede solicitar el cobro.',
      ],
      imagen: `${IMG}/02-catalogo-servicios.svg`,
      imagenAlt: 'Pantalla de catálogo de servicios en Panel RT',
    },
    {
      id: 'solicitar',
      titulo: '3. Cobrar desde el celular (Venta en Ruta)',
      cuerpo: [
        '**Venta en Ruta → Cobro servicios** → login del recolector (PIN).',
        'Elige **servicio**, **tienda**, **monto** y el **corte** donde saldrá el gasto (casi siempre Abarrotes).',
        'Pulsa **Solicitar cobro al cajero**. Queda pendiente hasta que la caja apruebe.',
      ],
      imagen: `${IMG}/03-solicitar-movil.svg`,
      imagenAlt: 'Formulario móvil: servicio, tienda, monto y solicitar cobro',
      notas: [
        'Puedes cancelar una solicitud mientras siga pendiente.',
      ],
    },
    {
      id: 'aprobar',
      titulo: '4. El cajero (o CT) aprueba con PIN',
      cuerpo: [
        'En la tienda llega una **notificación** de cobro de servicio.',
        'El cajero revisa monto / servicio / tienda y aprueba con su **PIN**.',
        'Si hay **CT con PIN temporal** en esa tienda, también puede aprobar el cobro de servicios.',
        'Al aprobar: se carga el **gasto en el corte** elegido y entra un **ingreso al Fondo / RC Servicios**.',
        'Sin PIN aprobado, el dinero **no** llega a RC Servicios.',
      ],
      imagen: `${IMG}/04-aprobar-pin.svg`,
      imagenAlt: 'Notificación en caja y captura de PIN para aprobar cobro',
    },
    {
      id: 'recoleccion',
      titulo: '5. Otra vía: Recolecciones (CFE en tienda)',
      cuerpo: [
        'En **Recolecciones**, al hacer el traspaso, pueden pedirse servicios **obligatorios** (CFE).',
        'El recolector pone su **PIN**, captura el monto y confirma el cobro.',
        'Eso genera un movimiento **Cobro Servicio** en tránsito (aparte de la mercancía).',
        'Esos cobros aparecen en **RC Servicios → Cobros pendientes**, no en Pendientes de mercancía.',
      ],
      imagen: `${IMG}/05-recoleccion-cfe.svg`,
      imagenAlt: 'Recolecciones: cobro CFE obligatorio antes del traspaso',
    },
    {
      id: 'rc-servicios',
      titulo: '6. RC Servicios: cobros pendientes',
      cuerpo: [
        'Abre **RC/VentaRuta → pestaña RC Servicios**.',
        'Verás los cobros en tránsito **agrupados por tienda** (y filtro por recolector).',
        'Selecciona los que vas a liquidar y pulsa **Liquidar cobros → Servicios**.',
        'Eso saca el efectivo de tránsito y lo acredita a la cuenta RT **Servicios**.',
      ],
      imagen: `${IMG}/06-rc-servicios.svg`,
      imagenAlt: 'Tabla de cobros pendientes por tienda y botón liquidar a Servicios',
      notas: [
        'Pendientes por liquidar (mercancía) **no** muestra Cobro Servicio. Aquí sí.',
      ],
    },
    {
      id: 'liquidar-fondo',
      titulo: '7. Ledger Fondo → cuenta Servicios',
      cuerpo: [
        'Más abajo en RC Servicios ves el **resumen por servicio** (ingresos / egresos / saldo).',
        'Con **Liquidar RC Servicios → Servicios** pasas el saldo del ledger a la cuenta RT.',
        'Puedes liquidar todo o un servicio / monto parcial.',
        'La cuenta **Servicios** es el puente antes de Tesorería.',
      ],
      imagen: `${IMG}/07-cuenta-servicios.svg`,
      imagenAlt: 'Liquidación del ledger Fondo a la cuenta RT Servicios',
    },
    {
      id: 'tesoreria',
      titulo: '8. Traspaso a Tesorería (Cheche)',
      cuerpo: [
        'Desde **RC Servicios** (bloque Transferir) o **Contabilidad → Tesorería**.',
        'Captura el monto (por defecto el saldo de Servicios) y opcionalmente una nota.',
        'Pulsa **Enviar a Tesorería (Cheche)** — solo admin / gerente / Cheche.',
        'Cheche ve el saldo en Tesorería y el historial de movimientos. No se mezcla con mercancía.',
      ],
      imagen: `${IMG}/08-tesoreria.svg`,
      imagenAlt: 'Transferencia Servicios → Tesorería Cheche con monto y nota',
    },
    {
      id: 'errores',
      titulo: '9. Errores típicos (evítalos)',
      cuerpo: [
        '· Buscar CFE en **Pendientes por liquidar** (va a **RC Servicios**).',
        '· Solicitar cobro sin que el **cajero apruebe** el PIN.',
        '· Liquidar mercancía y servicios en la misma cuenta (Francisco ≠ Servicios).',
        '· Enviar a Tesorería sin haber liquidado antes a la cuenta **Servicios**.',
        '· Olvidar el catálogo en Panel RT (no hay servicio que cobrar).',
      ],
      imagen: `${IMG}/09-errores.svg`,
      imagenAlt: 'Checklist de errores típicos en cobro de servicios',
    },
    {
      id: 'quiz',
      titulo: '10. Evaluación (te calificamos)',
      cuerpo: [
        'Responde las 8 preguntas. Al terminar verás **puntaje, porcentaje y calificación** (A–F).',
        'Apruebas con **70% o más** (C o mejor). Si no, reintenta tras repasar.',
      ],
      imagen: `${IMG}/10-evaluacion.svg`,
      imagenAlt: 'Ejemplo de calificación del tutorial',
      quiz: [
        {
          id: 'q1',
          pregunta: '¿Dónde se configuran CFE y otros servicios cobrables?',
          opciones: [
            'Productos → Ajuste',
            'Contabilidad → Panel RT → Servicios',
            'Checador → Historial',
            'Solo en el celular del repartidor',
          ],
          correcta: 1,
          explicacion: 'El catálogo vive en **Panel RT → Servicios**.',
        },
        {
          id: 'q2',
          pregunta: 'En Venta en Ruta → Cobro servicios, ¿qué hace «Solicitar cobro al cajero»?',
          opciones: [
            'Deposita solo en Tesorería',
            'Crea una solicitud pendiente; el cajero debe aprobar con PIN',
            'Borra el gasto del corte',
            'Liquida mercancía del camión',
          ],
          correcta: 1,
          explicacion: 'Es una **solicitud**. Sin PIN del cajero no entra al Fondo.',
        },
        {
          id: 'q3',
          pregunta: 'Al aprobar el cobro con PIN, ¿qué ocurre?',
          opciones: [
            'Solo imprime un ticket vacío',
            'Gasto en el corte + ingreso al Fondo / RC Servicios',
            'Se paga a Francisco la mercancía',
            'Se cancela el catálogo de servicios',
          ],
          correcta: 1,
          explicacion: 'Aprueba = **gasto de corte** + **ingreso al ledger** de servicios.',
        },
        {
          id: 'q4',
          pregunta: 'Los cobros «Cobro Servicio» de Recolecciones, ¿dónde se liquidan?',
          opciones: [
            'Pendientes por liquidar (mercancía)',
            'RC/VentaRuta → RC Servicios',
            'Nómina',
            'Compras → Por recibir',
          ],
          correcta: 1,
          explicacion: 'Van a **RC Servicios**, no a pendientes de mercancía.',
        },
        {
          id: 'q5',
          pregunta: '¿Qué hace «Liquidar cobros → Servicios»?',
          opciones: [
            'Borra los cobros sin dejar rastro',
            'Saca el efectivo de tránsito y lo acredita a la cuenta RT Servicios',
            'Abre un pagaré',
            'Envía directo a Cheche sin pasar por Servicios',
          ],
          correcta: 1,
          explicacion: 'Tránsito → cuenta **Servicios** (puente a Tesorería).',
        },
        {
          id: 'q6',
          pregunta: '¿Quién administra el envío a Tesorería (Cheche)?',
          opciones: [
            'Cualquier cajero de piso',
            'Administrador / gerente (o Francisco / Cheche)',
            'Solo el repartidor',
            'Nadie: es automático al cobrar CFE',
          ],
          correcta: 1,
          explicacion: 'Tesorería la opera **admin / gerente / Cheche**.',
        },
        {
          id: 'q7',
          pregunta: '¿Se mezclan fondos de servicios con liquidación de mercancía?',
          opciones: [
            'Sí, todo va a Francisco',
            'No: servicios → Servicios/Cheche; mercancía → Francisco',
            'Sí, en el mismo botón de Pendientes',
            'Solo los martes',
          ],
          correcta: 1,
          explicacion: '**Separados a propósito**: servicios no van con mercancía.',
        },
        {
          id: 'q8',
          pregunta: '¿Cuál es la frase correcta del flujo?',
          opciones: [
            'Mercancía primero · luego CFE en Pendientes · nunca Cheche',
            'Servicio se cobra · cajero aprueba · RC liquida · Cheche recibe',
            'Cheche cobra · cajero carga · camión liquida',
            'Solo PIN · sin RC Servicios',
          ],
          correcta: 1,
          explicacion: '**Servicio se cobra · cajero aprueba · RC liquida · Cheche recibe.**',
        },
      ],
    },
    {
      id: 'frase',
      titulo: 'Frase para capacitar',
      cuerpo: [
        '**Catálogo en Panel RT → solicitar / cobrar en tienda → PIN del cajero → RC Servicios → cuenta Servicios → Tesorería (Cheche).**',
        'Si fallaste la evaluación: repasa aprobación PIN, RC Servicios y el envío a Cheche; luego **Reintentar**.',
      ],
    },
  ],
};
