import { leerPrivilegios } from './posConfig.js';

/**
 * Ítems del menú ⋮ de Productos (privilegios en Configuración).
 * Se asignan en Configuración → Privilegios → Productos — menú ⋮.
 */
export const ACCIONES_PRODUCTOS_PRIVILEGIO = [
  {
    id: 'prod_alta',
    label: 'Nuevo producto',
    desc: 'Dar de alta artículos en el catálogo.',
    icon: 'plus',
  },
  {
    id: 'prod_ajuste',
    label: 'Ajuste de inventario',
    desc: 'Entradas, retiros y conteos (no vaciar).',
    icon: 'refresh',
  },
  {
    id: 'prod_traspaso',
    label: 'Traspasos',
    desc: 'Mover mercancía entre CEDIS, piso y tiendas.',
    icon: 'truck',
  },
  {
    id: 'prod_preinventario',
    label: 'Preinventario',
    desc: 'Conteos y plantillas de existencias.',
    icon: 'package',
  },
  {
    id: 'prod_mover',
    label: 'Mover productos (proveedor / depto)',
    desc: 'Reasignar proveedor o departamento en lote.',
    icon: 'refresh',
  },
  {
    id: 'prod_etiquetas',
    label: 'Imprimir etiquetas',
    desc: 'Etiquetas de estante.',
    icon: 'print',
  },
  {
    id: 'prod_importar',
    label: 'Importar archivo .xls',
    desc: 'Cargar catálogo desde Excel / CSV.',
    icon: 'download',
  },
  {
    id: 'prod_exportar',
    label: 'Exportar productos',
    desc: 'Descargar el catálogo.',
    icon: 'download',
  },
  {
    id: 'prod_fotos',
    label: 'Jalar fotos de internet',
    desc: 'Buscar imágenes del catálogo (Open Food Facts).',
    icon: 'camera',
  },
  {
    id: 'prod_vaciar',
    label: 'Vaciar inventario',
    desc: 'Poner existencias en cero (operación sensible).',
    icon: 'trash',
  },
  {
    id: 'prod_precios',
    label: 'Administrador de precios',
    desc: 'Cambio masivo de precios.',
    icon: 'dollar',
  },
  {
    id: 'prod_consolidar',
    label: 'Inventario vs ventas del día',
    desc: 'Cruzar piso con ventas (no vaciar).',
    icon: 'refresh',
  },
  {
    id: 'prod_negativos',
    label: 'Ver inventario negativo',
    desc: 'Mostrar existencias teóricas en negativo (ventas sin stock) y el filtro Negativos.',
    icon: 'package',
  },
  {
    id: 'prod_eliminar',
    label: 'Eliminar productos',
    desc: 'Borrar artículos del catálogo global.',
    icon: 'trash',
  },
];

export const IDS_ACCIONES_PRODUCTOS = new Set(ACCIONES_PRODUCTOS_PRIVILEGIO.map((a) => a.id));

/** Valores por defecto si no hay checkbox en Configuración. */
export const ACCIONES_DEFAULT_PRODUCTOS_POR_ROL = {
  Administrador: ACCIONES_PRODUCTOS_PRIVILEGIO.map((a) => a.id),
  Gerente: [
    'prod_alta', 'prod_ajuste', 'prod_traspaso', 'prod_preinventario', 'prod_mover',
    'prod_etiquetas', 'prod_importar', 'prod_exportar', 'prod_fotos', 'prod_vaciar',
    'prod_precios', 'prod_consolidar',
  ],
  Supervisor: [
    'prod_alta', 'prod_ajuste', 'prod_traspaso', 'prod_preinventario', 'prod_mover',
    'prod_etiquetas', 'prod_importar', 'prod_exportar', 'prod_fotos', 'prod_precios',
  ],
  Auditor: [
    'prod_alta', 'prod_ajuste', 'prod_traspaso', 'prod_preinventario', 'prod_mover',
    'prod_etiquetas', 'prod_importar', 'prod_exportar', 'prod_fotos', 'prod_precios',
    'prod_negativos',
  ],
  Repartidor: [
    'prod_alta', 'prod_ajuste', 'prod_traspaso', 'prod_preinventario', 'prod_mover',
    'prod_etiquetas', 'prod_importar', 'prod_exportar', 'prod_fotos', 'prod_precios',
    'prod_consolidar', 'prod_eliminar',
  ],
  Cajero: ['prod_ajuste', 'prod_traspaso', 'prod_preinventario'],
  Técnico: [],
};

export const DESCRIPCION_MODULO_PRODUCTOS =
  'Catálogo y existencias. El menú ⋮ se configura abajo en Productos — menú ⋮ (ajuste, traspasos, negativos, etc.).';

const ROLES_SISTEMA = ['Cajero', 'Auditor', 'Repartidor', 'Supervisor', 'Gerente', 'Técnico', 'Administrador'];

function normRol(rol) {
  const r = String(rol ?? '').trim();
  if (ROLES_SISTEMA.includes(r)) return r;
  const found = ROLES_SISTEMA.find((x) => x.toLowerCase() === r.toLowerCase());
  return found || r;
}

function lecturaExplicitaAccion(data, accionId, rol, userId) {
  const acc = data?.acciones?.[accionId];
  if (!acc) return null;
  const uid = userId != null ? String(userId) : '';
  if (uid && Object.prototype.hasOwnProperty.call(acc.porUsuario || {}, uid)) {
    return Boolean(acc.porUsuario[uid]);
  }
  if (Object.prototype.hasOwnProperty.call(acc.porRol || {}, rol)) {
    return Boolean(acc.porRol[rol]);
  }
  return null;
}

/**
 * ¿El rol/usuario tiene este ítem del menú ⋮ de Productos?
 * Administrador siempre sí. Si hay checkbox en Configuración, manda.
 * Si no, usa el default del rol (Auditor incluye ver negativos).
 */
export function tieneAccionProducto(accionId, rol, userId = null, data = null) {
  const r = normRol(rol);
  if (r === 'Administrador') return true;
  if (!IDS_ACCIONES_PRODUCTOS.has(accionId)) return false;
  const privilegios = data || leerPrivilegios();
  const explicito = lecturaExplicitaAccion(privilegios, accionId, r, userId);
  if (explicito !== null) return explicito;
  return (ACCIONES_DEFAULT_PRODUCTOS_POR_ROL[r] || []).includes(accionId);
}

export function puedeVerNegativosProductos(rol, userId = null, data = null) {
  return tieneAccionProducto('prod_negativos', rol, userId, data);
}
