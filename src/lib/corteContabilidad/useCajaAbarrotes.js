import { useCallback, useEffect, useMemo, useState } from 'react';
import { listarCierresParaAnalisis } from './store.js';
import {
  analizarNegativos,
  filasUltimosDias,
  normalizarFilasCaja,
  perfilDiario,
  perfilFuertes,
  planRecoleccion,
} from './analisisCajaAbarrotes.js';
import { hoyYmdNogales } from '../corteCaja.js';

const LS_DIAS = 'pos3b_colchon_abarrotes_dias';
const LS_REGLAS = 'pos3b_colchon_abarrotes_reglas';
const LS_VENTANA = 'pos3b_colchon_abarrotes_ventana';
export const VENTANAS_COLCHON = [7, 14, 30];
const DIAS_HISTORIAL = 90;
export const DIAS_FUERTES = 28;

/** Pagos fijos de Abarrotes: proveedores el lunes; nómina el viernes (≤ $2,400 por turno, diurno y nocturno). */
export const REGLAS_DEFAULT = {
  proveedoresDow: 1,
  proveedoresMonto: 0,
  nominaDow: 5,
  nominaMonto: 2400,
  nominaTurnos: 2,
};

export function leerReglasColchon() {
  try {
    const raw = JSON.parse(globalThis.localStorage?.getItem(LS_REGLAS) || 'null');
    return raw && typeof raw === 'object' ? { ...REGLAS_DEFAULT, ...raw } : { ...REGLAS_DEFAULT };
  } catch {
    return { ...REGLAS_DEFAULT };
  }
}

export function leerDiasColchon() {
  try {
    const raw = globalThis.localStorage?.getItem(LS_DIAS);
    if (raw == null) return 0;
    const n = Number(raw);
    return n >= 0 && n <= 5 ? n : 0;
  } catch {
    return 0;
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
export function useCajaAbarrotes({ supabase, sucursal, enabled = true, yaHoyCredito = 0, yaHoyNomina = 0, yaHoyProveedores = 0 }) {
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [diasColchon, setDiasColchonState] = useState(leerDiasColchon);
  const [ventanaColchon, setVentanaColchonState] = useState(leerVentanaColchon);
  const [reglas, setReglasState] = useState(leerReglasColchon);

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

  const setReglas = useCallback((patch) => {
    setReglasState((prev) => {
      const next = { ...prev, ...patch };
      try {
        globalThis.localStorage?.setItem(LS_REGLAS, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const filasVentana = useMemo(
    () => filasUltimosDias(filas, hoyYmdNogales(), ventanaColchon),
    [filas, ventanaColchon],
  );
  const perfil = useMemo(() => perfilDiario(filasVentana, { base: true }), [filasVentana]);
  const perfilSinProv = useMemo(
    () => perfilDiario(filasVentana, { base: true, sinProveedores: true }),
    [filasVentana],
  );
  const fuertes = useMemo(
    () => perfilFuertes(filasUltimosDias(filas, hoyYmdNogales(), DIAS_FUERTES)),
    [filas],
  );
  const colchon = useMemo(
    () => planRecoleccion({
      perfilBase: perfil,
      perfilBaseSinProv: perfilSinProv,
      perfilFuertes: fuertes,
      hoyYmd: hoyYmdNogales(),
      dias: diasColchon,
      minDias: ventanaColchon <= 7 ? 3 : 5,
      ventana: ventanaColchon,
      yaHoy: { credito: yaHoyCredito, nomina: yaHoyNomina, proveedores: yaHoyProveedores },
      reglas,
    }),
    [perfil, perfilSinProv, fuertes, diasColchon, ventanaColchon, yaHoyCredito, yaHoyNomina, yaHoyProveedores, reglas],
  );
  const analisis = useMemo(() => analizarNegativos(filasVentana), [filasVentana]);

  return {
    filas,
    perfil,
    fuertes,
    colchon,
    analisis,
    cargando,
    error,
    diasColchon,
    setDiasColchon,
    ventanaColchon,
    setVentanaColchon,
    reglas,
    setReglas,
    recargar,
  };
}
