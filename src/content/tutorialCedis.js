/** Tutorial · Uso de CEDIS (almacén central). */

const IMG = '/tutorial-cedis';

export const TUTORIAL_CEDIS = {
  id: 'cedis-uso',
  titulo: 'CEDIS: catálogo, stock y salidas a tienda/ruta',
  resumen:
    'Cómo operar el centro de distribución: entrar como CEDIS, catálogo propio, proveedor CEDIS LAS 3B, ingreso a bodega, traspaso a tienda y carga de camión.',
  interactivo: true,
  audiencia: 'cedis',
  secciones: [
    {
      id: 'entrar',
      titulo: '1. Entra como CEDIS (no MAIN)',
      cuerpo: [
        'En el login elige la sucursal **CEDIS · centro de distribución**.',
        '**CEDIS** = bodega: stock de almacén, catálogo propio, cargas y traspasos.',
        '**MAIN** = consola admin (RH, reportes, favoritos globales). No opera el piso de CEDIS.',
      ],
      imagen: `${IMG}/01-entrar-cedis.svg`,
      imagenAlt: 'Login eligiendo sucursal CEDIS frente a MAIN',
      notas: [
        'Si la PC del almacén está fijada a CEDIS, no hace falta cambiar de sucursal cada vez.',
      ],
    },
    {
      id: 'productos',
      titulo: '2. Productos = catálogo CEDIS',
      cuerpo: [
        'Menú **Productos**: ves solo el catálogo del almacén (deptos CEDIS + proveedor **CEDIS LAS 3B**).',
        'Deptos base: **CIGARROS**, **BLUNTWRAP**, **ELECTRONICOS**, **ABARROTES**, **MEDICAMENTO**, **ROPA**.',
        'La columna de existencia es el **stock CEDIS** (bodega), no el piso de una tienda.',
        'En CEDIS **no** hay favoritos de caja (eso es de tienda / MAIN).',
      ],
      imagen: `${IMG}/02-productos-catalogo.svg`,
      imagenAlt: 'Lista de productos filtrada al catálogo CEDIS',
    },
    {
      id: 'deptos',
      titulo: '3. Departamentos propios de CEDIS',
      cuerpo: [
        'Al crear o editar un producto, elige un departamento del **catálogo CEDIS**.',
        'Puedes usar **Nuevo departamento CEDIS** (ej. ACCESORIOS): queda solo para el almacén.',
        'Ese depto **no** se mete vacío al menú de departamentos de las tiendas (3B2, 3B5…).',
        'También puedes crear deptos desde **Proveedores → CEDIS LAS 3B**.',
      ],
      imagen: `${IMG}/03-departamentos.svg`,
      imagenAlt: 'Formulario con nuevo departamento CEDIS',
      notas: [
        'Opcional en Supabase: `fix_departamentos_cedis.sql` para sincronizar deptos entre cajas.',
      ],
    },
    {
      id: 'proveedor',
      titulo: '4. Proveedor CEDIS LAS 3B',
      cuerpo: [
        'Menú **Proveedores** → abre **CEDIS LAS 3B** (debe existir con ese nombre exacto).',
        'Ahí defines el catálogo del distribuidor: cada ítem con su **departamento CEDIS**.',
        'Al trabajar en CEDIS, los productos del catálogo se **vinculan** a este proveedor.',
        'Sin ese proveedor, el filtro de CEDIS no puede exigir el vínculo completo.',
      ],
      imagen: `${IMG}/04-proveedor-cedis.svg`,
      imagenAlt: 'Catálogo del proveedor CEDIS LAS 3B con departamentos',
    },
    {
      id: 'ingreso',
      titulo: '5. Ingreso al stock CEDIS',
      cuerpo: [
        '**A)** Productos → menú ⋮ → **Ajuste de inventario** → entrada (suma a stock CEDIS).',
        '**B)** **Compras** → recepción: la mercancía entra a la bodega central.',
        'En CEDIS editas el **almacén**, no el piso de venta de una tienda.',
      ],
      imagen: `${IMG}/05-ingreso-stock.svg`,
      imagenAlt: 'Entrada de mercancía al stock CEDIS',
    },
    {
      id: 'traspaso',
      titulo: '6. Traspaso CEDIS → tienda',
      cuerpo: [
        'Productos → **Traspasos** → destino una sucursal (ej. **3B5**).',
        'Captura piezas y confirma: baja stock en CEDIS y sube en el piso de la tienda (al recibir).',
        'Úsalo para surtir anaquel desde bodega sin pasar por ruta.',
      ],
      imagen: `${IMG}/06-traspaso-tienda.svg`,
      imagenAlt: 'Flujo de traspaso de CEDIS a una tienda',
    },
    {
      id: 'carga',
      titulo: '7. Carga de camión (Venta en Ruta)',
      cuerpo: [
        'Menú **Venta en Ruta** → **Carga de camión**.',
        'Elige camión / recolector, captura productos y confirma.',
        'Al cargar: **CEDIS − piezas** y el camión recibe el inventario de ruta.',
        'El **POS de ruta** vende desde esa carga. Si te equivocaste, **cancela la carga** (regresa stock).',
      ],
      imagen: `${IMG}/07-carga-camion.svg`,
      imagenAlt: 'Carga de camión descontando stock CEDIS',
    },
    {
      id: 'mapa',
      titulo: '8. Mapa del flujo (resumen)',
      cuerpo: [
        '**Entrar CEDIS → catálogo → ingresar stock → salir** (traspaso a tienda o carga a camión).',
        'Frase: **CEDIS guarda · tienda vende en piso · camión vende en ruta.**',
        'Todo lo que sale de CEDIS baja el stock de bodega.',
      ],
      imagen: `${IMG}/08-mapa-flujo.svg`,
      imagenAlt: 'Mapa de 4 pasos del flujo CEDIS',
      notas: [
        'Repasa este tutorial desde el módulo Tutorial o el botón «Ver tutorial CEDIS» en Productos.',
      ],
    },
  ],
};
