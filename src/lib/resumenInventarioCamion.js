import { disponibleEnLineaCarga, precioRutaEspecial } from './ventaEnRuta.js';

/** Misma valoración que el POS: precio de ruta vigente y respaldo de la carga. */
export function resumirInventarioCamion(lineas, productos = []) {
  const porId = new Map(productos.map((p) => [String(p.id), p]));
  let cargado = 0;
  let disponible = 0;
  let sinPrecio = false;
  for (const linea of lineas) {
    const precio = precioRutaEspecial(porId.get(String(linea.producto_id))) || Number(linea.precio) || 0;
    if (!(precio > 0) && Number(linea.qty_cargada) > 0) sinPrecio = true;
    cargado += Math.max(0, Number(linea.qty_cargada) || 0) * precio;
    disponible += disponibleEnLineaCarga(linea) * precio;
  }
  return {
    cargado: Math.round(cargado * 100) / 100,
    disponible: Math.round(disponible * 100) / 100,
    sinPrecio,
  };
}

// Paginar evita presentar inventario parcial cuando hay más de 1,000 líneas.
export async function leerFilasInventario(crearConsulta) {
  const filas = [];
  const tamano = 500;
  for (let desde = 0; ; desde += tamano) {
    const { data, error } = await crearConsulta().order('id').range(desde, desde + tamano - 1);
    if (error) throw new Error(error.message || 'No se pudo consultar el inventario.');
    filas.push(...(data || []));
    if (!data || data.length < tamano) return filas;
  }
}
