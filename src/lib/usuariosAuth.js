import { normalizarCodigoTienda } from '../constants/sucursales.js';
import { etiquetaTienda } from '../constants/sucursales.js';

export function sucursalUsuario(user) {
  const s = user?.sucursal_id;
  return s ? normalizarCodigoTienda(s) : null;
}

/** Usuario sin sucursal asignada (filas antiguas) puede entrar en cualquier tienda. */
export function usuarioCoincideSucursal(user, sucursalActiva) {
  const asignada = sucursalUsuario(user);
  if (!asignada) return true;
  return asignada === normalizarCodigoTienda(sucursalActiva);
}

export function mensajePinSucursalIncorrecta(sucursalActiva, sucursalReal) {
  if (sucursalReal) {
    return `Este PIN pertenece a ${etiquetaTienda(sucursalReal)}, no a ${etiquetaTienda(sucursalActiva)}. Cambia la tienda de la caja o pide al admin mover tu usuario.`;
  }
  return `PIN no válido para la tienda ${etiquetaTienda(sucursalActiva)}. Verifica que el empleado esté dado de alta en esta sucursal.`;
}

function faltaColumnaSucursal(error) {
  const msg = String(error?.message || '').toLowerCase();
  return msg.includes('sucursal_id') && msg.includes('does not exist');
}

/**
 * Busca usuario por PIN y sucursal de la caja.
 * Si el PIN es único en la BD, permite entrar aunque la caja muestre otra tienda.
 */
export async function buscarUsuarioPorPinYSucursal(supabase, pin, sucursalActiva) {
  if (!supabase) return { user: null, error: 'Sin conexión a Supabase.' };
  const p = String(pin || '').trim();
  if (!p) return { user: null, error: null };
  const suc = normalizarCodigoTienda(sucursalActiva);

  const qExact = await supabase.from('usuarios').select('*').eq('pin', p).eq('sucursal_id', suc).maybeSingle();
  if (qExact.error && !faltaColumnaSucursal(qExact.error)) {
    return { user: null, error: qExact.error.message };
  }
  if (qExact.data) return { user: qExact.data, error: null };

  const qAll = await supabase.from('usuarios').select('*').eq('pin', p);
  if (qAll.error) {
    if (faltaColumnaSucursal(qAll.error)) {
      const qLegacy = await supabase.from('usuarios').select('*').eq('pin', p).maybeSingle();
      if (qLegacy.error) return { user: null, error: qLegacy.error.message };
      if (qLegacy.data) return { user: qLegacy.data, error: null, sinColumnaSucursal: true };
      return { user: null, error: null };
    }
    return { user: null, error: qAll.error.message };
  }

  const list = qAll.data || [];
  if (list.length === 1) {
    const u = list[0];
    const userSuc = sucursalUsuario(u);
    return {
      user: u,
      error: null,
      ajustarSucursal: userSuc && userSuc !== suc ? userSuc : null,
    };
  }
  if (list.length > 1) {
    const enTienda = list.find((u) => sucursalUsuario(u) === suc);
    if (enTienda) return { user: enTienda, error: null };
    return {
      user: null,
      error: null,
      avisoSucursal: true,
      sucursalReal: sucursalUsuario(list[0]),
    };
  }

  return { user: null, error: null };
}
