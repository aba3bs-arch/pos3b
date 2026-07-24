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
 * Empleados en cortes contabilidad (Virtual / Abarrotes / Garage):
 * solo personal dado de alta en esa tienda (activo, sin administradores).
 * Sirve para descontar en nómina consumo, recargas, anticipos y faltantes.
 */
export function empleadosParaCorte(empleados, sucursalActiva, _modulo = null, _actorRol = null, _opts = {}) {
  const suc = normalizarCodigoTienda(sucursalActiva);
  return (empleados || [])
    .filter((e) => {
      if (e?.activo === false) return false;
      if (normalizarRol(e.rol) === 'Administrador') return false;
      return normalizarCodigoTienda(e.sucursal_id) === suc;
    })
    .sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es'));
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
