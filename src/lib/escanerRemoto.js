import { obtenerIdDispositivoLocal } from './dispositivoUsuario.js';
import { normalizarCodigoTienda } from '../constants/sucursales.js';

/** Canal Realtime: mismo usuario + misma sucursal (PIN anclado en PC y móvil). */
export function canalEscanerRemoto(sucursal, userId) {
  const suc = normalizarCodigoTienda(sucursal) || 'MAIN';
  const uid = String(userId || '').trim() || 'anon';
  return `pos-escanner-${suc}-${uid}`;
}

/**
 * Escucha códigos enviados desde el teléfono anclado.
 * @returns {() => void} cleanup
 */
export function suscribirEscanerRemoto(supabase, { sucursal, userId, onCodigo }) {
  if (!supabase || !userId || typeof onCodigo !== 'function') return () => {};
  const name = canalEscanerRemoto(sucursal, userId);
  const channel = supabase.channel(name, {
    config: { broadcast: { self: false } },
  });

  channel
    .on('broadcast', { event: 'codigo' }, ({ payload }) => {
      const codigo = String(payload?.codigo || '').trim();
      if (!codigo) return;
      // Ignorar eco del mismo dispositivo
      if (payload?.dispositivo_id && payload.dispositivo_id === obtenerIdDispositivoLocal()) return;
      onCodigo(codigo, payload);
    })
    .subscribe();

  return () => {
    try {
      supabase.removeChannel(channel);
    } catch {
      /* ignore */
    }
  };
}

/** Envía un código escaneado al POS de la misma sesión (PIN + sucursal). */
export async function enviarCodigoEscanerRemoto(supabase, { sucursal, userId, codigo, usuarioNombre }) {
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  const code = String(codigo || '').trim();
  if (!code) return { ok: false, error: 'Código vacío.' };
  const name = canalEscanerRemoto(sucursal, userId);
  const channel = supabase.channel(name);
  const status = await new Promise((resolve) => {
    channel.subscribe((s) => {
      if (s === 'SUBSCRIBED' || s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') resolve(s);
    });
  });
  if (status !== 'SUBSCRIBED') {
    try {
      await supabase.removeChannel(channel);
    } catch {
      /* ignore */
    }
    return { ok: false, error: 'No se pudo conectar al canal del escáner.' };
  }

  const { error } = await channel.send({
    type: 'broadcast',
    event: 'codigo',
    payload: {
      codigo: code,
      dispositivo_id: obtenerIdDispositivoLocal(),
      usuario: usuarioNombre || null,
      at: new Date().toISOString(),
    },
  });

  // Mantener el canal un momento y luego limpiar (el POS tiene su propia suscripción).
  setTimeout(() => {
    try {
      supabase.removeChannel(channel);
    } catch {
      /* ignore */
    }
  }, 1500);

  if (error) return { ok: false, error: error.message || 'No se envió el código.' };
  return { ok: true };
}
