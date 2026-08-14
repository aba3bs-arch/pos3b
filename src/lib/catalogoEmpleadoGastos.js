/**
 * Catálogo Empleado: MAIN / tienda → cada persona → detalles (consumo, faltante…).
 * Los empleados viven en `usuarios`; los detalles son plantilla fija (o las subcats legacy).
 */
import { etiquetaTienda, normalizarCodigoTienda } from '../constants/sucursales.js';
import { normalizarRol } from './roles.js';
import {
  agruparEmpleadosCatalogo,
  dedupeEmpleadosPorNombre,
  enriquecerEmpleadosNominaIndirectos,
  esEmpleadoIndirectoOMain,
  resolverTipoEmpleado,
} from './empleadosVisibles.js';

/** Detalles por empleado (3er nivel). Coincide con el catálogo que ya usan en IE. */
export const DETALLES_GASTO_EMPLEADO = [
  { id: 'emp-det-consumo', nombre: 'Consumo 🥫' },
  { id: 'emp-det-anticipo', nombre: 'Anticipo $' },
  { id: 'emp-det-cubre', nombre: 'Cubre turnos 👭' },
  { id: 'emp-det-faltante', nombre: 'Faltante ❎' },
  { id: 'emp-det-nomina', nombre: 'Nomina Empleado 💰' },
  { id: 'emp-det-otros', nombre: 'otros ‼️' },
  { id: 'emp-det-recargas', nombre: 'Recargas 📱' },
];

export function esCategoriaEmpleado(cat) {
  if (!cat) return false;
  if (cat.es_categoria_empleado) return true;
  const id = String(cat.id || cat.ieId || '').trim().toLowerCase();
  const nom = String(cat.nombre || cat.categoria || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return (
    id === 'empleado'
    || nom === 'empleado'
    || nom.startsWith('empleado ')
    || nom.startsWith('empleado-')
  );
}

/** ¿Las subcats actuales son tipos de gasto (legacy) o ya son empleados vivos? */
function subsSonPlantillaLegacy(subs) {
  const list = (subs || []).filter((s) => s?.activo !== false);
  if (!list.length) return false;
  return list.every((s) => !s.es_empleado_vivo && !String(s.id || '').startsWith('emp-user-'));
}

export function plantillaDetallesEmpleado(cat) {
  const subs = (cat?.subcategorias || []).filter((s) => s?.activo !== false);
  if (subsSonPlantillaLegacy(subs)) {
    return subs.map((s, i) => ({
      id: String(s.id || `emp-det-${i}`),
      nombre: String(s.nombre || '').trim() || `Detalle ${i + 1}`,
      fijo: Boolean(s.fijo),
    }));
  }
  return DETALLES_GASTO_EMPLEADO.map((d) => ({ ...d, fijo: true }));
}

/**
 * Empleados visibles en catálogo Empleado / select de corte:
 * - MAIN/indirectos: todas las sucursales (+ placeholders de vales si faltan)
 * - Tienda: solo los de `sucursalActiva` (si MAIN o vacío: todas las sucursales operativas, máx. 2 c/u)
 * - Nunca incluye Administrador
 */
export function empleadosParaCatalogoEmpleado(empleados, sucursalActiva) {
  const enriquecidos = enriquecerEmpleadosNominaIndirectos(empleados || []);
  const { porTienda, indirectos } = agruparEmpleadosCatalogo(enriquecidos, { incluirBajas: false });
  const suc = normalizarCodigoTienda(sucursalActiva);
  const main = dedupeEmpleadosPorNombre(indirectos).filter(
    (e) => normalizarRol(e?.rol) !== 'Administrador',
  );

  let tiendaGrupos;
  if (suc && suc !== 'MAIN') {
    const g = porTienda.find((x) => x.sucursalId === suc);
    tiendaGrupos = [
      {
        sucursalId: suc,
        label: etiquetaTienda(suc),
        empleados: dedupeEmpleadosPorNombre(g?.empleados || []).slice(0, 2),
      },
    ];
  } else {
    // MAIN / sin tienda: listar todas las sucursales operativas (aunque vayan 0/2).
    tiendaGrupos = (porTienda || []).map((g) => ({
      sucursalId: g.sucursalId,
      label: etiquetaTienda(g.sucursalId),
      empleados: dedupeEmpleadosPorNombre(g.empleados || []).slice(0, 2),
    }));
  }

  return {
    main,
    tiendaGrupos,
    plantilla: null,
  };
}

function detallesDePlantilla(plantilla, usuarioId) {
  return (plantilla || DETALLES_GASTO_EMPLEADO).map((d, i) => ({
    id: `emp-det-${usuarioId}-${d.id || i}`,
    nombre: d.nombre,
    orden: (i + 1) * 10,
    activo: true,
    fijo: true,
    es_detalle_empleado: true,
  }));
}

/** Convierte categoría Empleado en árbol vivo: grupos + empleados + detalles. */
export function enriquecerCategoriaEmpleado(cat, empleados, sucursalActiva) {
  if (!esCategoriaEmpleado(cat)) return cat;
  const plantilla = plantillaDetallesEmpleado(cat);
  const { main, tiendaGrupos } = empleadosParaCatalogoEmpleado(empleados, sucursalActiva);

  const subcategorias = [];
  const pushEmp = (e, grupo) => {
    if (!e || e.activo === false) return;
    subcategorias.push({
      id: `emp-user-${e.id}`,
      nombre: e.nombre,
      orden: subcategorias.length * 10,
      activo: true,
      fijo: false,
      es_empleado_vivo: true,
      usuario_id: e.id,
      grupo_empleado: grupo,
      tipo_empleado: resolverTipoEmpleado(e),
      sucursal_id: e.sucursal_id,
      rol: e.rol,
      detalles: detallesDePlantilla(plantilla, e.id),
    });
  };

  for (const e of main) pushEmp(e, 'main');
  for (const g of tiendaGrupos) {
    for (const e of g.empleados) pushEmp(e, 'tienda');
  }

  return {
    ...cat,
    es_categoria_empleado: true,
    plantilla_detalles: plantilla,
    grupos_empleado: {
      main,
      tiendaGrupos,
    },
    subcategorias,
  };
}

export function enriquecerCatalogoConEmpleados(catalogo, empleados, sucursalActiva) {
  return (catalogo || []).map((c) => enriquecerCategoriaEmpleado(c, empleados, sucursalActiva));
}

/** Para selects de corte: categoría EMPLEADO con subcategorías = solo los detalles (plantilla). */
export function categoriaEmpleadoFormatoCorte(catEnriquecida, fuente = 'ie_virtual') {
  if (!esCategoriaEmpleado(catEnriquecida)) return null;
  const plantilla = catEnriquecida.plantilla_detalles || plantillaDetallesEmpleado(catEnriquecida);
  return {
    id: catEnriquecida.id,
    ieId: catEnriquecida.id,
    categoria: 'EMPLEADO',
    subcategorias: plantilla.map((d) => String(d.nombre || '').trim().toUpperCase()).filter(Boolean),
    fuente,
    es_categoria_empleado: true,
  };
}

export function gastoEsTipoEmpleado(categoria, subcategoria = '') {
  const cat = String(categoria || '').trim().toUpperCase();
  const sub = String(subcategoria || '').trim().toUpperCase();
  if (cat === 'EMPLEADO' || cat.startsWith('EMPLEADO ')) return true;
  if (cat.includes('CONSUMO') || cat.includes('RECARG') || cat.includes('ANTICIPO') || cat.includes('FALTANTE')) {
    return true;
  }
  if (sub.includes('CONSUMO') || sub.includes('RECARG') || sub.includes('ANTICIPO') || sub.includes('FALTANTE')) {
    return true;
  }
  if (sub.includes('NOMINA') || sub.includes('CUBRE')) return cat === 'EMPLEADO';
  return false;
}

export { esEmpleadoIndirectoOMain };
