/**
 * Adaptador: catálogo Cont Virtual / IE → selectores de Vales.
 * Un solo árbol Categoría → Subcategoría → Detalle.
 */
import {
  CATEGORIAS_CONT_VIRTUAL_DEFAULT,
  VALE_A_CONT_VIRTUAL,
  filtrarCatalogoPorFlujo,
  listarCatalogoContVirtual,
  resolverNombresCatalogo,
} from './contVirtualCatalogo.js';
import { CATEGORIAS_VALE_FIJAS } from './valesCategorias.js';

/** Ids de categoría IE que no aplican al emitir un vale. */
const CATS_IE_EXCLUIDAS_VALE = new Set(['prestamos', 'ingresos', 'manual']);

function textoBlob(categoria, subcategoria, detalle) {
  return [categoria, subcategoria, detalle].map((x) => String(x || '').toLowerCase()).join(' ');
}

/**
 * Tipo lógico del vale (compat con reglas gasolina / nómina / IE).
 * Acepta ids legacy (gasolina, consumo…) o ids IE (vales, vales-gasolina…).
 */
export function tipoValeLogico(categoriaOrVale, subcategoria, detalle) {
  let cat = categoriaOrVale;
  let sub = subcategoria;
  let det = detalle;
  if (categoriaOrVale && typeof categoriaOrVale === 'object') {
    cat = categoriaOrVale.categoria;
    sub = categoriaOrVale.subcategoria;
    det = categoriaOrVale.detalle;
  }
  const c = String(cat || '').toLowerCase();
  const s = String(sub || '').toLowerCase();
  const blob = textoBlob(c, s, det);

  if (c === 'gasolina' || s === 'vales-gasolina' || blob.includes('gasolina')) return 'gasolina';
  if (c === 'herramienta' || s === 'vales-herramienta' || blob.includes('herramienta')) return 'herramienta';
  if (c === 'accesorios' || s === 'vales-accesorios' || blob.includes('accesorio')) return 'accesorios';
  if (
    c === 'consumo'
    || s === 'vales-consumo'
    || s === 'empleado-consumo'
    || s === 'consumo-empleado'
    || (blob.includes('consumo') && !blob.includes('oficina'))
  ) {
    return 'consumo';
  }
  if (c === 'anticipos' || s.includes('anticipo') || blob.includes('anticipo')) return 'anticipo';
  return c || 'otro';
}

export function esValeGasolina(valeOrCat, subcategoria) {
  return tipoValeLogico(valeOrCat, subcategoria) === 'gasolina';
}

export function valeDescuentaNominaIe(categoria, subcategoria) {
  const tipo = tipoValeLogico(categoria, subcategoria);
  if (tipo === 'gasolina') return false;
  if (tipo === 'consumo' || tipo === 'anticipo') return true;
  // Legacy fijas
  const fija = CATEGORIAS_VALE_FIJAS.find((x) => x.id === String(categoria || '').toLowerCase());
  if (fija) return Boolean(fija.descuentaNomina);
  return false;
}

/**
 * Decide si el vale descuenta nómina.
 * - Gasolina: siempre false (cualquier corte).
 * - Si el usuario eligió explícitamente (boolean), se respeta (salvo gasolina).
 * - Si no, usa la regla del catálogo / tipo lógico.
 */
export function resolverDescuentaNominaVale(categoria, subcategoria, preferencia = undefined) {
  if (esValeGasolina(categoria, subcategoria)) return false;
  if (preferencia === true || preferencia === false) return preferencia;
  return valeDescuentaNominaIe(categoria, subcategoria);
}

/** Mapa IE (categoria/sub/detalle) desde un vale (legacy o ids IE). */
export function mapaIeDesdeVale(vale, catalogo = []) {
  const cat = String(vale?.categoria || '').toLowerCase();
  const sub = String(vale?.subcategoria || '').toLowerCase() || null;
  const det = String(vale?.detalle || '').toLowerCase() || null;

  // Legacy: gasolina → vales / vales-gasolina
  const legacy = VALE_A_CONT_VIRTUAL[cat];
  if (legacy) {
    const nombres = resolverNombresCatalogo(catalogo, legacy.categoriaId, legacy.subcategoriaId, det);
    return {
      categoriaId: legacy.categoriaId,
      subcategoriaId: legacy.subcategoriaId,
      detalleId: det,
      ...nombres,
      legacy: true,
    };
  }

  // Ya viene con ids del catálogo IE
  if (cat) {
    const nombres = resolverNombresCatalogo(catalogo, cat, sub, det);
    return {
      categoriaId: cat,
      subcategoriaId: sub,
      detalleId: det,
      ...nombres,
      legacy: false,
    };
  }
  return null;
}

function catIeDescuentaNomina(c) {
  const id = String(c?.id || '').toLowerCase();
  if (id === 'consumo' || id === 'anticipos' || id === 'empleado') return true;
  return false;
}

/**
 * Convierte catálogo IE (egresos) al shape del formulario / admin de vales.
 * @param {object[]} catalogo
 * @param {{ ocultarGasolina?: boolean, soloParaFormulario?: boolean }} opts
 * - soloParaFormulario: oculta prestamos/ingresos/manual (no aplican al emitir vale).
 *   En la pestaña Catálogo IE usa false para ver el mismo árbol completo que Cont Virtual.
 */
export function categoriasValeDesdeCatalogoIe(catalogo, opts = {}) {
  const { ocultarGasolina = false, soloParaFormulario = true } = opts;
  let egresos = filtrarCatalogoPorFlujo(catalogo || [], 'egreso')
    .filter((c) => c && c.activo !== false);
  if (soloParaFormulario) {
    egresos = egresos.filter((c) => !CATS_IE_EXCLUIDAS_VALE.has(String(c.id || '').toLowerCase()));
  }

  const mapped = egresos.map((c) => {
    let subs = (c.subcategorias || [])
      .filter((s) => s && s.activo !== false)
      .map((s) => ({
        id: s.id,
        label: s.nombre || s.label || s.id,
        detalles: (s.detalles || [])
          .filter((d) => d && d.activo !== false)
          .map((d) => ({
            id: d.id,
            label: d.nombre || d.label || d.id,
          })),
      }));
    if (ocultarGasolina) {
      subs = subs.filter(
        (s) => s.id !== 'vales-gasolina' && !/gasolina/i.test(String(s.label || '')),
      );
    }
    return {
      id: c.id,
      label: c.nombre || c.label || c.id,
      descuentaNomina: catIeDescuentaNomina(c),
      fijo: Boolean(c.fijo),
      subcategorias: subs,
      _fuente: 'ie',
    };
  });

  if (mapped.length) return mapped;

  // Fallback: tipos fijos de vale (si aún no hay catálogo IE)
  return CATEGORIAS_VALE_FIJAS
    .filter((c) => !(ocultarGasolina && c.id === 'gasolina'))
    .map((c) => ({ ...c, subcategorias: c.subcategorias || [], _fuente: 'legacy' }));
}

/** Defaults del formulario alineados al catálogo IE. */
export const VALE_FORM_DEFAULTS_IE = {
  categoria: 'vales',
  subcategoria: 'vales-consumo',
  detalle: '',
};

export async function cargarCatalogoIeParaVales(supabase) {
  const res = await listarCatalogoContVirtual(supabase);
  const data = Array.isArray(res.data) && res.data.length
    ? res.data
    : CATEGORIAS_CONT_VIRTUAL_DEFAULT.map((c) => ({
      ...c,
      flujo: 'egreso',
      subcategorias: (c.subcategorias || []).map((s) => ({ ...s, detalles: s.detalles || [] })),
    }));
  return { ...res, data };
}

export function etiquetaDesdeCatalogoIe(catalogo, categoriaId, subcategoriaId, detalleId) {
  const nombres = resolverNombresCatalogo(catalogo, categoriaId, subcategoriaId, detalleId);
  const partes = [
    nombres.categoria_nombre,
    nombres.subcategoria_nombre,
    nombres.detalle_nombre,
  ].filter(Boolean);
  return partes.join(' › ') || String(categoriaId || '');
}
