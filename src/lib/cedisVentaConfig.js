/**
 * CEDIS como tienda de venta (catálogo propio).
 *
 * Para APAGAR: pon CEDIS_VENTA_ACTIVA = false.
 * Para QUITAR del todo: borra este archivo y sus imports
 * (sucursales.js, Ventas.jsx, ubicacionInventario.js, inventarioMultitienda.js, departamentos.js).
 *
 * El almacén central (stock_sucursales.CEDIS.cedis) sigue igual.
 * Las ventas descuentan del piso de CEDIS (stock_sucursales.CEDIS.piso).
 * Surtir el piso: Traspasos → «CEDIS almacén → Piso CEDIS».
 *
 * Sin imports a sucursales.js (evita ciclo): el código de CEDIS es fijo «CEDIS».
 */

function normDepto(s) {
  return String(s ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');
}

function normSucursal(s) {
  return String(s ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');
}

/** Interruptor maestro. false = CEDIS solo almacén (comportamiento anterior). */
export const CEDIS_VENTA_ACTIVA = true;

/**
 * Departamentos que se venden en CEDIS (mercancía propia).
 * Los productos deben tener `cat` igual a uno de estos (sin importar mayúsculas).
 */
export const CEDIS_VENTA_DEPARTAMENTOS = [
  'CIGARROS',
  'BLUNT_WRAPS',
  'WRAPS',
  'SOPLETES',
  'ROPA',
  'ABARROTES',
  'TECNOLOGIA',
];

const ALLOW = new Set(CEDIS_VENTA_DEPARTAMENTOS.map(normDepto));

export function cedisVentaActiva() {
  return CEDIS_VENTA_ACTIVA === true;
}

/** ¿Esta sucursal es CEDIS y la venta propia está encendida? */
export function esCedisModoVenta(sucursal) {
  return cedisVentaActiva() && normSucursal(sucursal) === 'CEDIS';
}

export function departamentoPermitidoEnCedisVenta(cat) {
  const d = normDepto(cat);
  return Boolean(d) && ALLOW.has(d);
}

export function productoPermitidoEnCedisVenta(producto) {
  return departamentoPermitidoEnCedisVenta(producto?.cat);
}

/** Filtra inventario al catálogo vendible en CEDIS. */
export function filtrarInventarioCedisVenta(inventario) {
  return (inventario || []).filter(productoPermitidoEnCedisVenta);
}

/** Departamentos a mostrar/crear en el catálogo cuando la venta CEDIS está activa. */
export function departamentosCedisVenta() {
  if (!cedisVentaActiva()) return [];
  return [...CEDIS_VENTA_DEPARTAMENTOS];
}
