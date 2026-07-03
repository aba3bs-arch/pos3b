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

function indirectosParaModulo(modulo) {
  const delModulo = BENEFICIARIOS_VALES.filter((b) => b.area === modulo);
  return delModulo.length ? delModulo : BENEFICIARIOS_VALES;
}

function esPersonalIndirecto(user) {
  const nom = String(user?.nombre || '')
    .trim()
    .toLowerCase();
  return BENEFICIARIOS_VALES.some((b) => b.nombre.toLowerCase() === nom);
}

/**
 * Empleados en cortes contabilidad: cajeros/repartidores de la tienda en turno actual
 * + personal indirecto del módulo (Misael, Gonzalo, Luis Enrique, etc.).
 */
export function empleadosParaCorte(empleados, sucursalActiva, modulo, actorRol = null, opts = {}) {
  const { turno = turnoActual(), date = new Date() } = opts;
  const suc = normalizarCodigoTienda(sucursalActiva);
  const actor = normalizarRol(actorRol);
  const adminVeTodosEnTurno = ['Administrador', 'Gerente', 'Supervisor'].includes(actor);

  const deTienda = (empleados || []).filter((e) => {
    if (normalizarRol(e.rol) === 'Administrador') return false;
    if (normalizarCodigoTienda(e.sucursal_id) !== suc) return false;
    const rol = normalizarRol(e.rol);
    if (rol !== 'Cajero' && rol !== 'Repartidor') return false;
    if (adminVeTodosEnTurno) return true;
    return empleadoEnTurnoActual(e, turno, date);
  });

  return mergeIndirectosCorte(deTienda, modulo, empleados);
}

function mergeIndirectosCorte(lista, modulo, todosUsuarios) {
  const ids = new Set(lista.map((e) => String(e.id)));
  const out = [...lista];
  const indirectos = indirectosParaModulo(modulo);

  for (const b of indirectos) {
    const match = (todosUsuarios || []).find(
      (u) => String(u.nombre || '').trim().toLowerCase() === b.nombre.toLowerCase(),
    );
    if (match) {
      if (!ids.has(String(match.id))) {
        out.push({ ...match, es_indirecto_corte: true });
        ids.add(String(match.id));
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
  return (empleados || []).filter((e) => normalizarRol(e.rol) !== 'Administrador');
}

/** Pantalla Usuarios (solo admin): filtro opcional por tienda. */
export function filtrarEmpleadosAdmin(empleados, filtroSucursal) {
  if (!filtroSucursal) return empleados || [];
  const f = normalizarCodigoTienda(filtroSucursal);
  return (empleados || []).filter((e) => normalizarCodigoTienda(e.sucursal_id) === f);
}

export { esPersonalIndirecto };
