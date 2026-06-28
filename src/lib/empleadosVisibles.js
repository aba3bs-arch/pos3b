import { normalizarCodigoTienda } from '../constants/sucursales.js';
import { BENEFICIARIOS_VALES } from './contabilidadConstants.js';
import { normalizarRol, puedeGestionarUsuarios } from './roles.js';

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

/** Empleados en cortes contabilidad: personal de la tienda + indirectos del módulo (Misael, Gonzalo, Luis Enrique). */
export function empleadosParaCorte(empleados, sucursalActiva, modulo, _actorRol = null) {
  const suc = normalizarCodigoTienda(sucursalActiva);
  const deTienda = (empleados || []).filter((e) => {
    if (normalizarRol(e.rol) === 'Administrador') return false;
    return normalizarCodigoTienda(e.sucursal_id) === suc;
  });
  return mergeIndirectosCorte(deTienda, modulo, empleados);
}

function mergeIndirectosCorte(lista, modulo, todosUsuarios) {
  const ids = new Set(lista.map((e) => String(e.id)));
  const out = [...lista];
  const indirectos = BENEFICIARIOS_VALES.filter((b) => b.area === modulo);

  for (const b of indirectos) {
    const match = (todosUsuarios || []).find(
      (u) => String(u.nombre || '').trim().toLowerCase() === b.nombre.toLowerCase(),
    );
    if (match) {
      if (!ids.has(String(match.id))) {
        out.push(match);
        ids.add(String(match.id));
      }
    } else if (!ids.has(`indirect:${b.id}`)) {
      out.push({
        id: `indirect:${b.id}`,
        nombre: b.nombre,
        rol: 'Indirecto',
        sucursal_id: 'MAIN',
        nomina_pagador: null,
      });
      ids.add(`indirect:${b.id}`);
    }
  }

  return out.sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es'));
}

/** Pantalla Usuarios (solo admin): filtro opcional por tienda. */
export function filtrarEmpleadosAdmin(empleados, filtroSucursal) {
  if (!filtroSucursal) return empleados || [];
  const f = normalizarCodigoTienda(filtroSucursal);
  return (empleados || []).filter((e) => normalizarCodigoTienda(e.sucursal_id) === f);
}
