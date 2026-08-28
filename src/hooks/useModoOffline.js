import { useCallback, useEffect, useRef, useState } from 'react';
import {
  contarVentasOfflinePendientes,
  EVENTO_VENTAS_OFFLINE,
  guardarCatalogoOffline,
  leerCatalogoOffline,
  sincronizarColaVentasOffline,
  sondarConexionSupabase,
} from '../lib/ventasOffline.js';

const POLL_ONLINE_MS = 45_000;
const POLL_OFFLINE_MS = 12_000;

/**
 * Detecta pérdida de red (navigator + sondeo Supabase), cuenta cola offline
 * y sincroniza automáticamente al recuperar conexión.
 */
export default function useModoOffline({
  supabase,
  sesion,
  sucursal,
  inventario,
  cargarDatos,
} = {}) {
  const [offline, setOffline] = useState(false);
  const [pendientes, setPendientes] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [ultimoSyncMsg, setUltimoSyncMsg] = useState('');
  const offlineRef = useRef(false);
  const syncingRef = useRef(false);

  const refrescarPendientes = useCallback(() => {
    setPendientes(contarVentasOfflinePendientes(sucursal));
  }, [sucursal]);

  useEffect(() => {
    refrescarPendientes();
    const onCola = () => refrescarPendientes();
    window.addEventListener(EVENTO_VENTAS_OFFLINE, onCola);
    window.addEventListener('storage', onCola);
    return () => {
      window.removeEventListener(EVENTO_VENTAS_OFFLINE, onCola);
      window.removeEventListener('storage', onCola);
    };
  }, [refrescarPendientes]);

  // Cachear catálogo mientras hay red (para vender si se cae).
  useEffect(() => {
    if (!sesion || offline || !sucursal) return;
    if (Array.isArray(inventario) && inventario.length) {
      guardarCatalogoOffline(sucursal, inventario);
    }
  }, [sesion, offline, sucursal, inventario]);

  const marcarOffline = useCallback((valor) => {
    offlineRef.current = valor;
    setOffline(valor);
  }, []);

  const forzarOffline = useCallback(() => {
    marcarOffline(true);
  }, [marcarOffline]);

  const intentarSync = useCallback(async () => {
    if (!supabase || syncingRef.current) return { ok: false, skipped: true };
    const n = contarVentasOfflinePendientes(sucursal);
    if (n <= 0) {
      refrescarPendientes();
      return { ok: true, synced: 0 };
    }
    syncingRef.current = true;
    setSyncing(true);
    setUltimoSyncMsg('Sincronizando ventas offline…');
    try {
      const r = await sincronizarColaVentasOffline(supabase, { sucursal });
      refrescarPendientes();
      if (r.synced > 0) {
        setUltimoSyncMsg(
          r.failed
            ? `Sync: ${r.synced} ok, ${r.failed} con error`
            : `Sync: ${r.synced} venta(s) subida(s)`,
        );
        await cargarDatos?.();
      } else if (r.error) {
        setUltimoSyncMsg(r.error);
      } else {
        setUltimoSyncMsg('');
      }
      return r;
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [supabase, sucursal, cargarDatos, refrescarPendientes]);

  const verificar = useCallback(async () => {
    if (!sesion || !supabase) return;
    const ok = await sondarConexionSupabase(supabase);
    const estabaOffline = offlineRef.current;
    if (!ok) {
      marcarOffline(true);
      return;
    }
    marcarOffline(false);
    if (estabaOffline) {
      await intentarSync();
    } else if (contarVentasOfflinePendientes(sucursal) > 0) {
      await intentarSync();
    }
  }, [sesion, supabase, marcarOffline, intentarSync, sucursal]);

  useEffect(() => {
    if (!sesion) {
      marcarOffline(false);
      return undefined;
    }
    verificar();
    const onOnline = () => {
      verificar();
    };
    const onOffline = () => {
      marcarOffline(true);
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [sesion, verificar, marcarOffline]);

  useEffect(() => {
    if (!sesion) return undefined;
    const ms = offline ? POLL_OFFLINE_MS : POLL_ONLINE_MS;
    const t = setInterval(() => {
      verificar();
    }, ms);
    return () => clearInterval(t);
  }, [sesion, offline, verificar]);

  /** Si el catálogo en memoria quedó vacío offline, usar caché. */
  const catalogoRespaldo = !offline
    ? null
    : (Array.isArray(inventario) && inventario.length ? null : leerCatalogoOffline(sucursal));

  return {
    offline,
    pendientes,
    syncing,
    ultimoSyncMsg,
    forzarOffline,
    intentarSync,
    verificar,
    catalogoRespaldo,
  };
}
