import { useCallback, useEffect, useMemo, useState } from 'react';
import { listarCierresParaAnalisis } from './store.js';
import {
  analizarNegativos,
  filasUltimosDias,
  normalizarFilasCaja,
  perfilDiario,
  recomendarColchon,
} from './analisisCajaAbarrotes.js';
import { hoyYmdNogales } from '../corteCaja.js';

const LS_DIAS = 'pos3b_colchon_abarrotes_dias';
const LS_VENTANA = 'pos3b_colchon_abarrotes_ventana';
export const VENTANAS_COLCHON = [7, 14, 30];
const DIAS_HISTORIAL = 90;

export function leerDiasColchon() {
  try {
    const n = Number(globalThis.localStorage?.getItem(LS_DIAS));
    return n >= 1 && n <= 5 ? n : 2;
  } catch {
    return 2;
  }
}

export function leerVentanaColchon() {
  try {
    const n = Number(globalThis.localStorage?.getItem(LS_VENTANA));
    return VENTANAS_COLCHON.includes(n) ? n : 7;
  } catch {
    return 7;
  }
}

/**
 * Carga los cierres de Abarrotes de los últimos 90 días (para el diagnóstico) y calcula
 * el colchón recomendado con una ventana corta (7 días por defecto) y el análisis de esa ventana.
 */
export function useCajaAbarrotes({ supabase, sucursal, enabled = true }) {
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [diasColchon, setDiasColchonState] = useState(leerDiasColchon);
  const [ventanaColchon, setVentanaColchonState] = useState(leerVentanaColchon);

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

  const setVentanaColchon = useCallback((n) => {
    setVentanaColchonState(n);
    try {
      globalThis.localStorage?.setItem(LS_VENTANA, String(n));
    } catch {
      /* ignore */
    }
  }, []);

  const filasVentana = useMemo(
    () => filasUltimosDias(filas, hoyYmdNogales(), ventanaColchon),
    [filas, ventanaColchon],
  );
  const perfil = useMemo(() => perfilDiario(filasVentana), [filasVentana]);
  const colchon = useMemo(
    () => recomendarColchon(perfil, {
      hoyYmd: hoyYmdNogales(),
      dias: diasColchon,
      minDias: ventanaColchon <= 7 ? 3 : 5,
      ventana: ventanaColchon,
    }),
    [perfil, diasColchon, ventanaColchon],
  );
  const analisis = useMemo(() => analizarNegativos(filasVentana), [filasVentana]);

  return {
    filas,
    perfil,
    colchon,
    analisis,
    cargando,
    error,
    diasColchon,
    setDiasColchon,
    ventanaColchon,
    setVentanaColchon,
    recargar,
  };
}
