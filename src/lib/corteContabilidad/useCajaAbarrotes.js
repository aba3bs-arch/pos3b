import { useCallback, useEffect, useMemo, useState } from 'react';
import { listarCierresParaAnalisis } from './store.js';
import { analizarNegativos, normalizarFilasCaja, perfilDiario, recomendarColchon } from './analisisCajaAbarrotes.js';
import { hoyYmdNogales } from '../corteCaja.js';

const LS_DIAS = 'pos3b_colchon_abarrotes_dias';
const DIAS_HISTORIAL = 90;

export function leerDiasColchon() {
  try {
    const n = Number(globalThis.localStorage?.getItem(LS_DIAS));
    return n >= 1 && n <= 5 ? n : 2;
  } catch {
    return 2;
  }
}

/**
 * Carga los cierres de Abarrotes de los últimos 90 días y calcula el análisis de caja
 * y el colchón recomendado para recolectar.
 */
export function useCajaAbarrotes({ supabase, sucursal, enabled = true }) {
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [diasColchon, setDiasColchonState] = useState(leerDiasColchon);

  const recargar = useCallback(async () => {
    if (!enabled || !sucursal) return;
    setCargando(true);
    setError('');
    const res = await listarCierresParaAnalisis(supabase, sucursal, 'abarrotes', { dias: DIAS_HISTORIAL });
    if (res.error) setError(res.error);
    else setFilas(normalizarFilasCaja(res.data));
    setCargando(false);
  }, [supabase, sucursal, enabled]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  const setDiasColchon = useCallback((n) => {
    setDiasColchonState(n);
    try {
      globalThis.localStorage?.setItem(LS_DIAS, String(n));
    } catch {
      /* ignore */
    }
  }, []);

  const perfil = useMemo(() => perfilDiario(filas), [filas]);
  const colchon = useMemo(
    () => recomendarColchon(perfil, { hoyYmd: hoyYmdNogales(), dias: diasColchon }),
    [perfil, diasColchon],
  );
  const analisis = useMemo(() => analizarNegativos(filas), [filas]);

  return { filas, perfil, colchon, analisis, cargando, error, diasColchon, setDiasColchon, recargar };
}
