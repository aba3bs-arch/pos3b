import { useCallback, useEffect, useState } from 'react';
import {
  PRESENCIA_HEARTBEAT_MS,
  cargarPresenciaSucursales,
  enviarHeartbeatPresencia,
  etiquetaOpcionSucursal,
} from '../lib/presenciaSucursal.js';

/**
 * Latido de esta caja + mapa de sucursales en línea para el selector.
 * @param {{ supabase: any, sucursal: string, sesion: boolean, usuarioNombre?: string, habilitado?: boolean }} opts
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

  useEffect(() => {
    if (!supabase || !habilitado || !sesion) return undefined;
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
  }, [supabase, habilitado, sesion, sucursal, usuarioNombre, refrescar]);

  useEffect(() => {
    if (!supabase || !habilitado) return undefined;
    void refrescar();
    const id = setInterval(() => void refrescar(), PRESENCIA_HEARTBEAT_MS);
    return () => clearInterval(id);
  }, [supabase, habilitado, refrescar]);

  const etiquetaOpcion = useCallback((codigo) => etiquetaOpcionSucursal(codigo, presenciaMap), [presenciaMap]);

  return { presenciaMap, etiquetaOpcion, avisoPresencia: aviso, refrescarPresencia: refrescar };
}
