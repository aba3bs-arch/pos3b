import { useCallback, useEffect, useState } from 'react';
import {
  PRESENCIA_HEARTBEAT_MS,
  cargarPresenciaSucursales,
  enviarHeartbeatPresencia,
  etiquetaOpcionSucursal,
  marcarPresenciaFueraDeLinea,
} from '../lib/presenciaSucursal.js';

/**
 * Latido de caja física + mapa de sucursales en línea para el selector.
 * `sucursal` debe ser solo la tienda fijada en el equipo (no la consulta libre desde Central).
 * @param {{ supabase: any, sucursal: string|null, sesion: boolean, usuarioNombre?: string, habilitado?: boolean }} opts
 */
export function usePresenciaSucursales({ supabase, sucursal, sesion, usuarioNombre, habilitado = true }) {
  const [presenciaMap, setPresenciaMap] = useState({});
  const [aviso, setAviso] = useState('');

  const refrescar = useCallback(async () => {
    if (!supabase || !habilitado) return;
    const r = await cargarPresenciaSucursales(supabase);
    if (r.sinTabla) setAviso(r.aviso || '');
    else if (r.error) setAviso(r.error);
    else setAviso('');
    if (r.map) setPresenciaMap(r.map);
  }, [supabase, habilitado]);

  // Solo latido si hay sesión en una caja física (sucursal fijada / env).
  const latidoActivo = Boolean(sesion && sucursal);

  useEffect(() => {
    if (!supabase || !habilitado || !latidoActivo) return undefined;
    let cancel = false;
    const latido = async () => {
      const hb = await enviarHeartbeatPresencia(supabase, { sucursal, usuarioNombre });
      if (cancel) return;
      if (hb.sinTabla) setAviso(hb.aviso || '');
      await refrescar();
    };
    void latido();
    const id = setInterval(() => void latido(), PRESENCIA_HEARTBEAT_MS);
    return () => {
      cancel = true;
      clearInterval(id);
    };
  }, [supabase, habilitado, latidoActivo, sucursal, usuarioNombre, refrescar]);

  useEffect(() => {
    if (!supabase || !habilitado) return undefined;
    void refrescar();
    const id = setInterval(() => void refrescar(), PRESENCIA_HEARTBEAT_MS);
    return () => clearInterval(id);
  }, [supabase, habilitado, refrescar]);

  const marcarFueraDeLinea = useCallback(async () => {
    if (!supabase || !sucursal) return;
    await marcarPresenciaFueraDeLinea(supabase, sucursal);
    await refrescar();
  }, [supabase, sucursal, refrescar]);

  const etiquetaOpcion = useCallback((codigo) => etiquetaOpcionSucursal(codigo, presenciaMap), [presenciaMap]);

  return {
    presenciaMap,
    etiquetaOpcion,
    avisoPresencia: aviso,
    refrescarPresencia: refrescar,
    marcarPresenciaFueraDeLinea: marcarFueraDeLinea,
  };
}
