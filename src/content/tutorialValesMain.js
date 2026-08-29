/** Tutorial interactivo · Vales desde MAIN (capturas reales del módulo). */

const IMG = '/tutorial-vales-main';

/**
 * Hotspots en % sobre 01-nuevo-vale.png (1857×807).
 * Zonas del formulario "Nuevo vale" + tabla de registrados.
 */
const HOTSPOTS = {
  form: { top: 2, left: 1.5, width: 97, height: 42, label: 'Nuevo vale' },
  beneficiario: { top: 10, left: 2.5, width: 47, height: 10, label: 'Beneficiario' },
  categoria: { top: 10, left: 50.5, width: 47, height: 10, label: 'Categoría' },
  tabla: { top: 48, left: 1.5, width: 97, height: 48, label: 'Vales registrados' },
};

export const TUTORIAL_VALES_MAIN = {
  id: 'vales-main',
  titulo: 'Vales desde MAIN',
  resumen:
    'Cómo generar vales desde MAIN hacia una sucursal y corte, personal indirecto, sin ventana de horario, y qué puede hacer admin vs cajero.',
  interactivo: true,
  imagenBase: `${IMG}/01-nuevo-vale.png`,
  hotspots: HOTSPOTS,
  secciones: [
    {
      id: 'mapa',
      titulo: '1. La pantalla de Vales',
      cuerpo: [
        'Entrá a **Vales y Préstamos → pestaña Vales**.',
        'Arriba está el formulario **Nuevo vale**; abajo, la tabla **Vales registrados**.',
        'Toca una zona resaltada o sigue con **Siguiente**.',
      ],
      imagen: `${IMG}/01-nuevo-vale.png`,
      imagenAlt: 'Captura real · Nuevo vale y lista de registrados',
      hotspotActivo: null,
      mapaInteractivo: true,
      notas: [
        'La captura muestra beneficiarios clásicos (Luis Enrique, Misael, Gonzalo) y acciones Imprimir / Eliminar en la tabla.',
      ],
    },
    {
      id: 'pestanas',
      titulo: '2. Pestañas del módulo',
      cuerpo: [
        'La barra de pestañas separa **Vales**, RIF, Pagaré, préstamos, **Tipos de vale**, Gasolina y Pendientes.',
        'Los vales de consumo / personal se crean en **Vales**.',
        '**Gasolina / asistencia** es solo admin y los vales de gasolina se siguen generando **desde la tienda**.',
      ],
      imagen: `${IMG}/02-pestanas.png`,
      imagenAlt: 'Barra de pestañas · Vales activo',
      hotspotActivo: 'form',
      notas: [
        'Si estás en MAIN, no uses esta pestaña para gasolina: haz el vale de gasolina en la caja de la sucursal.',
      ],
    },
    {
      id: 'beneficiarios',
      titulo: '3. Beneficiarios: personal indirecto MAIN',
      cuerpo: [
        'El selector **Beneficiario** incluye a Luis Enrique, Misael, Gonzalo **y todo el personal indirecto de MAIN**.',
        'Solo muestra el **nombre**; el corte ya no viene en la leyenda del beneficiario.',
        'El admin elige aparte el **corte destino** (Virtual / Abarrotes / Garage) donde se cargará el vale.',
      ],
      imagen: `${IMG}/01-nuevo-vale.png`,
      imagenAlt: 'Formulario Nuevo vale · beneficiario',
      hotspotActivo: 'beneficiario',
      notas: [
        'Indirectos MAIN = usuarios tipo indirecto / sucursal MAIN (técnicos, gerentes operativos, etc.), sin administradores del listado de login hub.',
      ],
    },
    {
      id: 'sucursal-corte',
      titulo: '4. Sucursal (MAIN) + corte (siempre)',
      cuerpo: [
        'El selector **Corte destino** es obligatorio en todos los vales: el admin decide Virtual, Abarrotes o Garage.',
        'Si generas el vale **desde MAIN**, también eliges **Sucursal destino** (3B5, FUSION, etc.).',
        'El vale se registra en esa tienda/área y ahí se carga al aprobarse.',
      ],
      imagen: `${IMG}/01-nuevo-vale.png`,
      imagenAlt: 'Formulario con destino de sucursal y corte',
      hotspotActivo: 'form',
      notas: [
        'En tienda (no MAIN) no eliges sucursal (usa la actual), pero sí eliges el corte.',
      ],
    },
    {
      id: 'sin-ventana',
      titulo: '5. Sin ventana de horario (MAIN)',
      cuerpo: [
        'Los vales generados **desde MAIN no tienen ventana de servicio** (no aplica el límite tipo 09:00).',
        'Se pueden **generar y cobrar a cualquier hora**.',
        'En **tienda** sí sigue la regla: gasolina / herramienta / accesorios hasta la hora límite con firma; después van a bandeja admin.',
        '**Consumo / personal** siempre requiere autorización de administrador (también desde MAIN si no eres admin).',
      ],
      imagen: `${IMG}/00-pantalla-completa.png`,
      imagenAlt: 'Módulo Vales y Préstamos · reglas y tipos',
      hotspotActivo: 'categoria',
    },
    {
      id: 'gasolina-tienda',
      titulo: '6. Gasolina solo desde tienda',
      cuerpo: [
        'Desde MAIN **no aparece** (o no se permite) la categoría **Gasolina**.',
        'Los vales de gasolina se generan en la **tienda**, como hasta ahora, y se consultan en **Gasolina / asistencia**.',
      ],
      imagen: `${IMG}/00-pantalla-completa.png`,
      imagenAlt: 'Tipos de vale · Gasolina en catálogo permanente',
      hotspotActivo: 'categoria',
      notas: [
        'Tipos permanentes (consumo, gasolina, herramienta, accesorios) se administran en la pestaña Tipos de vale.',
      ],
    },
    {
      id: 'permisos',
      titulo: '7. Admin vs cajero',
      cuerpo: [
        'En **Vales registrados**:',
        '· **Administrador** — puede **Editar**, **Eliminar** e **Imprimir**.',
        '· **Cajero** — solo **Imprimir** (vales ya aprobados).',
        'Así se evita que caja borre o cambie montos por error.',
      ],
      imagen: `${IMG}/01-nuevo-vale.png`,
      imagenAlt: 'Tabla de vales con acciones',
      hotspotActivo: 'tabla',
      notas: [
        'Eliminar solo procede si el corte del área sigue abierto (misma regla de negocio de siempre).',
      ],
    },
    {
      id: 'paso-a-paso',
      titulo: '8. Paso a paso desde MAIN',
      cuerpo: [
        '1. Entrá en **MAIN** → **Vales y Préstamos** → **Vales**.',
        '2. Elige **beneficiario** (solo el nombre).',
        '3. Elige **categoría** (no gasolina).',
        '4. Elige **sucursal destino** y **corte**.',
        '5. Monto, fecha, motivo → **Registrar vale**.',
        '6. Imprime para firma. El gasto queda en el corte de esa tienda/área.',
      ],
      imagen: `${IMG}/01-nuevo-vale.png`,
      imagenAlt: 'Flujo completo Nuevo vale',
      hotspotActivo: 'form',
    },
    {
      id: 'frase',
      titulo: 'Frase para capacitar',
      cuerpo: [
        '**Beneficiario = nombre. El admin elige el corte. Desde MAIN también elige sucursal. Gasolina solo en tienda. Cajero solo imprime.**',
      ],
      imagen: `${IMG}/02-pestanas.png`,
      imagenAlt: 'Pestaña Vales',
    },
  ],
};
