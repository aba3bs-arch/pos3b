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

/**
 * Préstamos a empleado: la tienda solo ve empleados registrados en esa sucursal
 * (sin indirectos/MAIN). En MAIN, admin ve todos los de tipo tienda.
 */
export function empleadosParaPrestamosEmpleado(empleados, sucursalActiva, actorRol = null) {
  const lista = (empleados || []).filter((e) => {
    if (!e || e.activo === false) return false;
    if (normalizarRol(e.rol) === 'Administrador') return false;
    return resolverTipoEmpleado(e) === 'tienda';
  });
  const suc = normalizarCodigoTienda(sucursalActiva);
  if (!suc || suc === 'MAIN') {
    if (puedeGestionarUsuarios(actorRol)) return lista;
    return [];
  }
  return lista.filter((e) => normalizarCodigoTienda(e.sucursal_id) === suc);
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
  const enMain = !suc || suc === 'MAIN';

  const push = (e, extra = {}) => {
    if (!e || e?.activo === false) return;
    const id = String(e.id);
    if (ids.has(id)) return;
    ids.add(id);
    const tipo = resolverTipoEmpleado(e);
    const quiereIndirecto = Boolean(extra.es_indirecto_corte);
    const esIndirecto = tipo === 'indirecto' || (quiereIndirecto && tipo !== 'tienda');
    out.push({
      ...e,
      ...extra,
      tipo_empleado: tipo,
      es_indirecto_corte: esIndirecto,
    });
  };

  for (const e of empleados || []) {
    if (e?.activo === false) continue;
    const empSuc = normalizarCodigoTienda(e.sucursal_id);
    const rol = normalizarRol(e.rol);
    const tipo = resolverTipoEmpleado(e);

    // En MAIN: mostrar todos los de tienda (para verlos en catálogo por sucursal).
    if (enMain && tipo === 'tienda' && rol !== 'Administrador') {
      push(e, { es_indirecto_corte: false });
      continue;
    }
    // Personal de la sucursal activa (máx. 2 tipo tienda).
    if (!enMain && empSuc === suc && tipo === 'tienda') {
      push(e, { es_indirecto_corte: false });
      continue;
    }
    // Fallback si falta columna tipo_empleado: mismo código de tienda, no admin.
    if (!enMain && empSuc === suc && tipo !== 'indirecto' && rol !== 'Administrador') {
      push(e, { es_indirecto_corte: false });
      continue;
    }
    if (tipo === 'indirecto' || (empSuc === 'MAIN' && tipo !== 'tienda')) {
      if (rol !== 'Administrador') push(e, { es_indirecto_corte: true });
      continue;
    }
    if (rol === 'Administrador') push(e, { es_admin_global_corte: true });
  }

  return mergeIndirectosTodasLasTiendas(dedupeEmpleadosPorNombre(out), empleados);
}

/** Agrupa la lista ya filtrada de corte para <optgroup>. */
export function agruparEmpleadosParaSelectCorte(empleados) {
  const tienda = [];
  const indirectos = [];
  const admins = [];
  for (const e of dedupeEmpleadosPorNombre(empleados || [])) {
    const rol = normalizarRol(e.rol);
    const tipo = resolverTipoEmpleado(e);
    if (rol === 'Administrador' || e.es_admin_global_corte) {
      admins.push(e);
      continue;
    }
    // Tipo tienda gana sobre flags de indirecto (p. ej. homónimo con beneficiario de vales).
    if (tipo === 'tienda') {
      tienda.push(e);
      continue;
    }
    if (e.es_indirecto_corte || tipo === 'indirecto') {
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

/** Normaliza nombre para comparar personas (Gonzalo ≈ Gonzalo Leal). */
export function normalizarNombrePersona(nombre) {
  return String(nombre || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

/** True si parecen la misma persona (nombre corto vs nombre completo). */
export function nombresMismaPersona(a, b) {
  const na = normalizarNombrePersona(a);
  const nb = normalizarNombrePersona(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.startsWith(`${nb} `) || nb.startsWith(`${na} `)) return true;
  const ta = na.split(' ');
  const tb = nb.split(' ');
  if (ta[0] && ta[0] === tb[0] && ta[0].length >= 4) {
    if (na.startsWith(nb) || nb.startsWith(na)) return true;
    if (ta.length >= 2 && tb.length >= 2 && ta[1] === tb[1]) return true;
  }
  return false;
}

function scoreEmpleadoDedup(e) {
  let s = 0;
  const id = String(e?.id || '');
  if (id && !id.startsWith('indirect:')) s += 20;
  s += String(e?.nombre || '').trim().length;
  if (resolverTipoEmpleado(e) === 'tienda') s += 5;
  else if (e?.es_indirecto_corte || resolverTipoEmpleado(e) === 'indirecto') s += 2;
  return s;
}

/** Quita duplicados tipo Gonzalo / Gonzalo Leal; prioriza registro real y nombre más completo. */
export function dedupeEmpleadosPorNombre(lista) {
  const out = [];
  for (const e of lista || []) {
    if (!e) continue;
    const tipoE = resolverTipoEmpleado(e);
    const idx = out.findIndex((x) => {
      if (!nombresMismaPersona(x.nombre, e.nombre)) return false;
      const tipoX = resolverTipoEmpleado(x);
      // No fusionar empleado de tienda con indirecto/MAIN (pueden compartir nombre corto).
      if (tipoE === 'tienda' && tipoX !== 'tienda') return false;
      if (tipoX === 'tienda' && tipoE !== 'tienda') return false;
      return true;
    });
    if (idx < 0) {
      out.push(e);
      continue;
    }
    const prev = out[idx];
    const winner = scoreEmpleadoDedup(e) > scoreEmpleadoDedup(prev) ? e : prev;
    const tipoW = resolverTipoEmpleado(winner);
    out[idx] = {
      ...winner,
      es_admin_global_corte: Boolean(prev.es_admin_global_corte || e.es_admin_global_corte),
      es_indirecto_corte: tipoW === 'tienda' ? false : Boolean(
        prev.es_indirecto_corte || e.es_indirecto_corte || tipoW === 'indirecto',
      ),
      tipo_empleado: tipoW,
    };
  }
  return out;
}

/** Indirectos en todas las tiendas y módulos de corte (no filtrar por área). */
function mergeIndirectosTodasLasTiendas(lista, todosUsuarios) {
  const ids = new Set(lista.map((e) => String(e.id)));
  let out = [...lista];

  for (const e of out) {
    if (resolverTipoEmpleado(e) === 'indirecto') e.es_indirecto_corte = true;
    if (resolverTipoEmpleado(e) === 'tienda') e.es_indirecto_corte = false;
  }

  for (const b of BENEFICIARIOS_VALES) {
    const hit = out.find((e) => nombresMismaPersona(e.nombre, b.nombre));
    if (hit && resolverTipoEmpleado(hit) !== 'tienda') {
      hit.es_indirecto_corte = true;
      continue;
    }
    const match = (todosUsuarios || []).find(
      (u) =>
        u?.activo !== false
        && nombresMismaPersona(u.nombre, b.nombre)
        && resolverTipoEmpleado(u) !== 'tienda',
    );
    if (match) {
      if (!ids.has(String(match.id))) {
        out.push({
          ...match,
          tipo_empleado: 'indirecto',
          es_indirecto_corte: true,
        });
        ids.add(String(match.id));
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
    }
  }

  out = dedupeEmpleadosPorNombre(out);
  // Tras dedupe, restaurar flags según tipo real (evita que un merge por nombre los mueva a Main).
  for (const e of out) {
    const tipo = resolverTipoEmpleado(e);
    if (tipo === 'tienda') e.es_indirecto_corte = false;
    else if (tipo === 'indirecto') e.es_indirecto_corte = true;
  }
  return out.sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es'));
}

/** Añade placeholders de indirectos para cruce de gastos en nómina. */
export function enriquecerEmpleadosNominaIndirectos(empleados) {
  const ids = new Set((empleados || []).map((e) => String(e.id)));
  const out = [...(empleados || [])];
  for (const b of BENEFICIARIOS_VALES) {
    if (out.some((e) => nombresMismaPersona(e.nombre, b.nombre))) continue;
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
  }
  return dedupeEmpleadosPorNombre(out);
}

/** Lista global para nómina: operativos + placeholders de indirectos (vales). */
export function empleadosParaNominaGlobal(empleados) {
  const base = (empleados || []).filter((e) => e?.activo !== false && normalizarRol(e.rol) !== 'Administrador');
  return enriquecerEmpleadosNominaIndirectos(base);
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
