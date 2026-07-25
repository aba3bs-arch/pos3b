import { listarSucursalesOperativas, normalizarCodigoTienda } from '../constants/sucursales.js';
import { BENEFICIARIOS_VALES } from './contabilidadConstants.js';
import { normalizarRol, puedeGestionarUsuarios } from './roles.js';
import { esTurnoAmbos, turnoActual, turnoIdParaUsuario } from './turnos.js';

/** Máximo de empleados fijos (tipo tienda) activos por sucursal operativa. */
export const MAX_EMPLEADOS_POR_TIENDA = 2;

/**
 * Empleados visibles en listas operativas (nómina, vales, etc.).
 * - Tienda activa: su personal + personal de MAIN / indirectos, sin administradores.
 * - Administrador: todos (filtrar aparte si hace falta).
 */
export function empleadosVisiblesParaTienda(empleados, sucursalActiva, actorRol = null) {
  const lista = empleados || [];
  if (puedeGestionarUsuarios(actorRol)) return lista;

  const suc = normalizarCodigoTienda(sucursalActiva);
  return lista.filter((e) => {
    if (e?.activo === false) return false;
    const rol = normalizarRol(e.rol);
    if (rol === 'Administrador') return false;
    const empSuc = normalizarCodigoTienda(e.sucursal_id);
    if (empSuc === suc) return true;
    if (esEmpleadoIndirectoOMain(e)) return true;
    return false;
  });
}

/** ¿El empleado está asignado al turno de caja actual (hoy y hora)? */
export function empleadoEnTurnoActual(user, turno = turnoActual(), date = new Date()) {
  if (!user || !turno) return false;
  const rol = normalizarRol(user.rol);
  if (!['Cajero', 'Repartidor'].includes(rol)) return false;
  const asignado = turnoIdParaUsuario(user, date);
  if (!asignado) return false;
  if (esTurnoAmbos(asignado)) return true;
  return String(asignado) === String(turno.id);
}

function esPersonalIndirectoPorNombre(user) {
  const nom = String(user?.nombre || '')
    .trim()
    .toLowerCase();
  return BENEFICIARIOS_VALES.some((b) => b.nombre.toLowerCase() === nom);
}

/**
 * Tipo de empleado para catálogo:
 * - tienda: fijo de una sucursal (máx. 2)
 * - indirecto: MAIN / aparece en todas las sucursales y cortes
 */
export function resolverTipoEmpleado(e) {
  const t = String(e?.tipo_empleado || '')
    .trim()
    .toLowerCase();
  if (t === 'indirecto' || t === 'tienda') return t;
  if (esPersonalIndirectoPorNombre(e)) return 'indirecto';
  if (
    normalizarCodigoTienda(e?.sucursal_id) === 'MAIN'
    && normalizarRol(e?.rol) !== 'Administrador'
  ) {
    return 'indirecto';
  }
  return 'tienda';
}

export function esEmpleadoIndirectoOMain(e) {
  return resolverTipoEmpleado(e) === 'indirecto';
}

/** Cuenta empleados tipo tienda activos (no admin) en una sucursal. */
export function contarEmpleadosTiendaActivos(empleados, sucursalId, { excluirId = null } = {}) {
  const suc = normalizarCodigoTienda(sucursalId);
  if (!suc || suc === 'MAIN') return 0;
  return (empleados || []).filter((e) => {
    if (!e || e.activo === false) return false;
    if (excluirId != null && String(e.id) === String(excluirId)) return false;
    if (normalizarRol(e.rol) === 'Administrador') return false;
    if (resolverTipoEmpleado(e) !== 'tienda') return false;
    return normalizarCodigoTienda(e.sucursal_id) === suc;
  }).length;
}

export function puedeAgregarEmpleadoTienda(empleados, sucursalId, opts = {}) {
  const suc = normalizarCodigoTienda(sucursalId);
  if (!suc || suc === 'MAIN') {
    return { ok: false, error: 'Elige una sucursal operativa (no MAIN) para empleados de tienda.' };
  }
  const n = contarEmpleadosTiendaActivos(empleados, suc, opts);
  if (n >= MAX_EMPLEADOS_POR_TIENDA) {
    return {
      ok: false,
      error: `Ya hay ${MAX_EMPLEADOS_POR_TIENDA} empleados de tienda activos en esa sucursal. Da de baja uno o usa tipo Indirecto/MAIN.`,
    };
  }
  return { ok: true, count: n };
}

/**
 * Agrupa para UI Empleados / cortes:
 * - porTienda: [{ sucursalId, label, empleados }]
 * - indirectos: empleados MAIN / tipo indirecto
 */
export function agruparEmpleadosCatalogo(empleados, { incluirBajas = false } = {}) {
  const porMap = new Map();
  const indirectos = [];

  for (const e of empleados || []) {
    if (!incluirBajas && e?.activo === false) continue;
    if (normalizarRol(e?.rol) === 'Administrador') continue;
    if (esEmpleadoIndirectoOMain(e)) {
      indirectos.push(e);
      continue;
    }
    const sid = normalizarCodigoTienda(e.sucursal_id) || 'MAIN';
    if (!porMap.has(sid)) porMap.set(sid, []);
    porMap.get(sid).push(e);
  }

  const sortNom = (a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es');
  indirectos.sort(sortNom);

  const tiendas = listarSucursalesOperativas();
  const porTienda = [];
  for (const sid of tiendas) {
    const list = (porMap.get(sid) || []).sort(sortNom);
    porTienda.push({ sucursalId: sid, empleados: list });
  }
  // Sucursales extra no listadas
  for (const [sid, list] of porMap.entries()) {
    if (tiendas.includes(sid) || sid === 'MAIN') continue;
    porTienda.push({ sucursalId: sid, empleados: list.sort(sortNom) });
  }

  return { porTienda, indirectos };
}

/**
 * Empleados en cortes (Virtual / Abarrotes / Garage):
 * - personal tipo tienda de la sucursal activa
 * - todos los indirectos / MAIN (todas las sucursales)
 * - administradores (todas)
 * - placeholders BENEFICIARIOS_VALES si faltan en BD
 */
export function empleadosParaCorte(empleados, sucursalActiva, _modulo = null, _actorRol = null, _opts = {}) {
  const suc = normalizarCodigoTienda(sucursalActiva);
  const ids = new Set();
  const out = [];

  const push = (e, extra = {}) => {
    if (!e || e?.activo === false) return;
    const id = String(e.id);
    if (ids.has(id)) return;
    ids.add(id);
    const tipo = resolverTipoEmpleado(e);
    out.push({
      ...e,
      tipo_empleado: tipo,
      es_indirecto_corte: tipo === 'indirecto' || Boolean(extra.es_indirecto_corte),
      ...extra,
    });
  };

  for (const e of empleados || []) {
    if (e?.activo === false) continue;
    const empSuc = normalizarCodigoTienda(e.sucursal_id);
    const rol = normalizarRol(e.rol);
    const tipo = resolverTipoEmpleado(e);

    if (tipo === 'indirecto' || empSuc === 'MAIN') {
      if (rol !== 'Administrador') push(e, { es_indirecto_corte: true });
    }
    if (empSuc === suc && tipo === 'tienda') {
      push(e);
      continue;
    }
    if (rol === 'Administrador') push(e, { es_admin_global_corte: true });
  }

  return mergeIndirectosTodasLasTiendas(out, empleados);
}

/** Agrupa la lista ya filtrada de corte para <optgroup>. */
export function agruparEmpleadosParaSelectCorte(empleados) {
  const tienda = [];
  const indirectos = [];
  const admins = [];
  for (const e of empleados || []) {
    const rol = normalizarRol(e.rol);
    if (rol === 'Administrador' || e.es_admin_global_corte) {
      admins.push(e);
      continue;
    }
    if (e.es_indirecto_corte || resolverTipoEmpleado(e) === 'indirecto') {
      indirectos.push(e);
      continue;
    }
    tienda.push(e);
  }
  const sortNom = (a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es');
  return {
    tienda: tienda.sort(sortNom),
    indirectos: indirectos.sort(sortNom),
    admins: admins.sort(sortNom),
  };
}

/** Indirectos en todas las tiendas y módulos de corte (no filtrar por área). */
function mergeIndirectosTodasLasTiendas(lista, todosUsuarios) {
  const ids = new Set(lista.map((e) => String(e.id)));
  const nombres = new Set(
    lista.map((e) => String(e.nombre || '').trim().toLowerCase()).filter(Boolean),
  );
  const out = [...lista];

  // Marcar usuarios tipo_empleado=indirecto ya presentes
  for (const e of out) {
    if (resolverTipoEmpleado(e) === 'indirecto') e.es_indirecto_corte = true;
  }

  for (const b of BENEFICIARIOS_VALES) {
    const nom = b.nombre.toLowerCase();
    if (nombres.has(nom)) {
      const hit = out.find((e) => String(e.nombre || '').trim().toLowerCase() === nom);
      if (hit) hit.es_indirecto_corte = true;
      continue;
    }
    const match = (todosUsuarios || []).find(
      (u) => u?.activo !== false && String(u.nombre || '').trim().toLowerCase() === nom,
    );
    if (match) {
      if (!ids.has(String(match.id))) {
        out.push({
          ...match,
          tipo_empleado: 'indirecto',
          es_indirecto_corte: true,
        });
        ids.add(String(match.id));
        nombres.add(nom);
      }
    } else if (!ids.has(`indirect:${b.id}`)) {
      out.push({
        id: `indirect:${b.id}`,
        nombre: b.nombre,
        rol: 'Indirecto',
        sucursal_id: 'MAIN',
        tipo_empleado: 'indirecto',
        nomina_pagador: b.area,
        es_indirecto_corte: true,
      });
      ids.add(`indirect:${b.id}`);
      nombres.add(nom);
    }
  }

  return out.sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es'));
}

/** Añade placeholders de indirectos para cruce de gastos en nómina. */
export function enriquecerEmpleadosNominaIndirectos(empleados) {
  const ids = new Set((empleados || []).map((e) => String(e.id)));
  const nombres = new Set(
    (empleados || []).map((e) => String(e.nombre || '').trim().toLowerCase()).filter(Boolean),
  );
  const out = [...(empleados || [])];
  for (const b of BENEFICIARIOS_VALES) {
    const nom = b.nombre.toLowerCase();
    if (nombres.has(nom)) continue;
    const id = `indirect:${b.id}`;
    if (ids.has(id)) continue;
    out.push({
      id,
      nombre: b.nombre,
      rol: 'Indirecto',
      sucursal_id: 'MAIN',
      tipo_empleado: 'indirecto',
      nomina_pagador: b.area,
      es_indirecto: true,
    });
    ids.add(id);
    nombres.add(nom);
  }
  return out;
}

/** Lista global para nómina: empleados operativos de todas las sucursales (sin placeholders indirectos). */
export function empleadosParaNominaGlobal(empleados) {
  return (empleados || []).filter((e) => e?.activo !== false && normalizarRol(e.rol) !== 'Administrador');
}

/** Pantalla Usuarios (solo admin): filtro opcional por tienda. */
export function filtrarEmpleadosAdmin(empleados, filtroSucursal) {
  if (!filtroSucursal) return empleados || [];
  const f = normalizarCodigoTienda(filtroSucursal);
  return (empleados || []).filter((e) => {
    if (esEmpleadoIndirectoOMain(e) && f !== 'MAIN') {
      // Indirectos visibles también al filtrar cualquier tienda (están en todas)
      return true;
    }
    return normalizarCodigoTienda(e.sucursal_id) === f;
  });
}

export { esPersonalIndirectoPorNombre as esPersonalIndirecto };
