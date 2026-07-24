import { normalizarCodigoTienda } from '../constants/sucursales.js';
import { BENEFICIARIOS_VALES } from './contabilidadConstants.js';
import { normalizarRol, puedeGestionarUsuarios } from './roles.js';
import { esTurnoAmbos, turnoActual, turnoIdParaUsuario } from './turnos.js';

/**
 * Empleados visibles en listas operativas (nómina, vales, etc.).
 * - Tienda activa: su personal + personal de MAIN (central), sin administradores.
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
    if (empSuc === 'MAIN') return true;
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

function esPersonalIndirecto(user) {
  const nom = String(user?.nombre || '')
    .trim()
    .toLowerCase();
  return BENEFICIARIOS_VALES.some((b) => b.nombre.toLowerCase() === nom);
}

/**
 * Empleados en cortes (Virtual / Abarrotes / Garage):
 * - personal activo de la tienda (incluye Administrador de esa tienda)
 * - todos los Administradores activos (aparecen en cualquier tienda/corte)
 * - empleados indirectos (Luis Enrique, Misael, Gonzalo) en todas las tiendas y cortes
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
    out.push({ ...e, ...extra });
  };

  for (const e of empleados || []) {
    if (e?.activo === false) continue;
    const empSuc = normalizarCodigoTienda(e.sucursal_id);
    const rol = normalizarRol(e.rol);
    if (empSuc === suc) {
      push(e);
      continue;
    }
    // Admin de cualquier tienda: visible en todos los cortes
    if (rol === 'Administrador') push(e, { es_admin_global_corte: true });
  }

  return mergeIndirectosTodasLasTiendas(out, empleados);
}

/** Indirectos en todas las tiendas y módulos de corte (no filtrar por área). */
function mergeIndirectosTodasLasTiendas(lista, todosUsuarios) {
  const ids = new Set(lista.map((e) => String(e.id)));
  const nombres = new Set(
    lista.map((e) => String(e.nombre || '').trim().toLowerCase()).filter(Boolean),
  );
  const out = [...lista];

  for (const b of BENEFICIARIOS_VALES) {
    const nom = b.nombre.toLowerCase();
    if (nombres.has(nom)) {
      // Marcar el match real como indirecto si ya estaba en la lista
      const hit = out.find((e) => String(e.nombre || '').trim().toLowerCase() === nom);
      if (hit) hit.es_indirecto_corte = true;
      continue;
    }
    const match = (todosUsuarios || []).find(
      (u) => u?.activo !== false && String(u.nombre || '').trim().toLowerCase() === nom,
    );
    if (match) {
      if (!ids.has(String(match.id))) {
        out.push({ ...match, es_indirecto_corte: true });
        ids.add(String(match.id));
        nombres.add(nom);
      }
    } else if (!ids.has(`indirect:${b.id}`)) {
      out.push({
        id: `indirect:${b.id}`,
        nombre: b.nombre,
        rol: 'Indirecto',
        sucursal_id: 'MAIN',
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
  return (empleados || []).filter((e) => normalizarCodigoTienda(e.sucursal_id) === f);
}

export { esPersonalIndirecto };
