import { useCallback, useEffect, useState } from 'react';
import { listarPagaresAbiertosParaCorte, pagareEstaAbierto } from '../pagares.js';

const POLL_MS = 15000;

/**
 * Pagarés abiertos del área/sucursal del corte (hasta que se recolecten).
 */
export function usePagaresAbiertosCorte(supabase, sucursal, modulo, { enabled = true } = {}) {
  const [pagares, setPagares] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  const recargar = useCallback(async () => {
    if (!enabled || !supabase || !sucursal || !modulo) {
      setPagares([]);
      setError('');
      return;
    }
    setCargando(true);
    const res = await listarPagaresAbiertosParaCorte(supabase, { sucursal, modulo });
    setCargando(false);
    if (!res.ok) {
      setPagares([]);
      setError(res.faltaTabla ? '' : (res.error || ''));
      return;
    }
    setError('');
    setPagares((res.data || []).filter(pagareEstaAbierto));
  }, [enabled, supabase, sucursal, modulo]);

  useEffect(() => {
    void recargar();
    if (!enabled || !supabase || !sucursal || !modulo) return undefined;

    const id = setInterval(() => { void recargar(); }, POLL_MS);
    const onFocus = () => { void recargar(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);

    let channel = null;
    try {
      channel = supabase
        .channel(`pagares-corte-${modulo}-${sucursal}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'pagares' },
          () => { void recargar(); },
        )
        .subscribe();
    } catch {
      channel = null;
    }

    return () => {
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
      if (channel) {
        try { supabase.removeChannel(channel); } catch { /* ignore */ }
      }
    };
  }, [recargar, enabled, supabase, sucursal, modulo]);

  return { pagares, cargando, error, recargar };
}
