import { buscarUsuarioPorPinYSucursal, mensajePinSucursalIncorrecta } from './usuariosAuth.js';

/**
 * Resuelve quién firma de conformidad un reporte de inventario con su PIN.
 * Acepta PIN de usuario de la tienda (o personal central) y el PIN temporal de un
 * cubre turno (CT) con cobertura activa en esa misma tienda.
 */
export async function resolverFirmanteInventario(supabase, pin, sucursal, {
  buscarUsuario = buscarUsuarioPorPinYSucursal,
  validarPinCt = null,
  ahora = new Date(),
} = {}) {
  const r = await buscarUsuario(supabase, pin, sucursal, { aceptarPersonalCentral: true });
  if (r.error) return { ok: false, error: r.error };
  if (r.user && !r.avisoSucursal) {
    const nombre = String(r.user.nombre || r.user.email || '').trim() || 'Usuario';
    return { ok: true, firmante: { nombre, usuario_id: r.user.id || null, cubre_turno: false, cubre_solicitud_id: null } };
  }

  try {
    const mod = validarPinCt ? null : await import('./cubreSolicitudes.js');
    const validar = validarPinCt || mod.validarPinTemporalCt;
    const pinTemp = await validar(supabase, pin, sucursal, ahora);
    if (pinTemp.ok && pinTemp.solicitud) {
      const nombre = String(pinTemp.solicitud.ct_nombre || '').trim() || 'Cubre turno';
      return { ok: true, firmante: { nombre, usuario_id: null, cubre_turno: true, cubre_solicitud_id: pinTemp.solicitud.id || null } };
    }
    if (pinTemp.error && pinTemp.razon && pinTemp.razon !== 'falta_tabla') return { ok: false, error: pinTemp.error };
  } catch {
    /* sin tabla de cubre turnos: se trata como PIN de usuario no reconocido */
  }

  return { ok: false, error: r.avisoSucursal ? mensajePinSucursalIncorrecta(sucursal, r.sucursalReal) : 'PIN no válido.' };
}

export function firmaInventarioDesdeFirmante(firmante, ahora = new Date()) {
  const firma = { nombre: firmante.nombre, usuario_id: firmante.usuario_id || null, firmado_at: ahora.toISOString() };
  if (firmante.cubre_turno) {
    firma.cubre_turno = true;
    firma.cubre_solicitud_id = firmante.cubre_solicitud_id || null;
  }
  return firma;
}

/** Una misma persona no puede firmar dos campos del mismo reporte. */
export function firmaInventarioYaRegistrada(firmas = [], idx, firmante) {
  return firmas.some((f, i) => {
    if (i === idx || !f?.nombre) return false;
    if (firmante.usuario_id && f.usuario_id && String(f.usuario_id) === String(firmante.usuario_id)) return true;
    return Boolean(firmante.cubre_solicitud_id && f.cubre_solicitud_id
      && String(f.cubre_solicitud_id) === String(firmante.cubre_solicitud_id));
  });
}
