import React, { useEffect, useState } from 'react';
import { normalizarCodigoTienda } from '../../constants/sucursales.js';
import { resolverTipoEmpleado } from '../../lib/empleadosVisibles.js';
import { normalizarRol } from '../../lib/roles.js';
import { usuarioEstaActivo } from '../../lib/usuariosAuth.js';
import { calcularBonoSucursal } from '../../lib/bonosData.js';
import { EVENTO_BONOS_CONFIG, alertasVisiblesBono, calcularPagosBonoPorEmpleado, resumenRepartoBono, textoLineaEmpleadoBono } from '../../lib/bonosConfig.js';
import { ajusteRetardoBono, cargarRetardosBono } from '../../lib/bonosRetardos.js';
import {
  cargarBloqueosBonoPorFalta,
  cargarUsuariosResumen,
} from '../../lib/resumenDiasAsistencia.js';

function fmtMoney(n) {
  return `$${(Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function plantillaTienda(usuarios, sucursal) {
  const suc = normalizarCodigoTienda(sucursal);
  return (usuarios || []).filter((u) => {
    if (!usuarioEstaActivo(u)) return false;
    if (normalizarRol(u.rol) === 'Administrador') return false;
    if (resolverTipoEmpleado(u) !== 'tienda') return false;
    const sucU = normalizarCodigoTienda(u.sucursal_id);
    if (!sucU || sucU === 'MAIN') return false;
    if (suc && sucU !== suc) return false;
    return true;
  });
}

/**
 * Bono del corte virtual. `monto` null = aún no hay moneda final ni recolección.
 * Con monto, el tabulador calcula lo que se pagará al recolectar.
 */
export function useAlertaBonoCorte({ supabase, sucursal, monto = null, enabled = true }) {
  const [rev, setRev] = useState(0);
  const [state, setState] = useState({
    cargando: false,
    pack: null,
    pagos: [],
  });

  useEffect(() => {
    const onCfg = () => setRev((n) => n + 1);
    window.addEventListener(EVENTO_BONOS_CONFIG, onCfg);
    return () => window.removeEventListener(EVENTO_BONOS_CONFIG, onCfg);
  }, []);

  useEffect(() => {
    if (!enabled || !supabase || !sucursal) {
      setState({ cargando: false, pack: null, pagos: [] });
      return undefined;
    }
    let vivo = true;
    setState((s) => ({ ...s, cargando: true }));
    const timer = setTimeout(async () => {
      const montoCalc = monto == null ? 0 : Number(monto);
      const [res, bloq, uRes] = await Promise.all([
        calcularBonoSucursal(supabase, {
          sucursal,
          montoRecoleccion: Number.isFinite(montoCalc) ? montoCalc : 0,
        }),
        cargarBloqueosBonoPorFalta(supabase, { sucursalId: sucursal }),
        cargarUsuariosResumen(supabase, { sucursalId: sucursal }),
      ]);
      if (!vivo) return;
      const plantilla = plantillaTienda(uRes?.data || [], sucursal);
      let retardos = {};
      if (res?.ok) {
        try {
          retardos = await cargarRetardosBono(supabase, {
            sucursal,
            desde: res.periodo?.desde,
            hasta: res.periodo?.hasta,
            plantilla,
            config: res.config,
          });
        } catch {
          retardos = {};
        }
      }
      if (!vivo) return;
      const fechasFalta = new Map(
        (bloq?.data || []).map((b) => [String(b?.clave || ''), b?.vuelveBonoYmd || '']),
      );
      const pagos = res?.ok
        ? calcularPagosBonoPorEmpleado({
          base: res.base,
          pctTienda: res.pct,
          plantilla,
          bloqueosFalta: bloq?.data || [],
          ...ajusteRetardoBono(res, retardos),
        }).map((p) => (
          p.conFalta
            ? { ...p, vuelveBonoYmd: fechasFalta.get(p.clave) || '' }
            : p
        ))
        : [];
      setState({ cargando: false, pack: res, pagos });
    }, 350);
    return () => {
      vivo = false;
      clearTimeout(timer);
    };
  }, [supabase, sucursal, monto, enabled, rev]);

  return state;
}

export function textoConfirmacionBono({ pack, pagos, origen }) {
  if (!pack?.ok || pack.activo === false) return '';
  const reciben = (pagos || []).filter((p) => !p.conFalta);
  const reparto = resumenRepartoBono(pagos);
  const lineasEmpleado = (pagos || []).map((p) => textoLineaEmpleadoBono(p));
  const factores = (pack.reglas || [])
    .map((r) => `${r.ok ? '✓' : '✗'} ${r.label} (${r.pesoPct}%)`)
    .join(', ');
  const lineas = ['', 'Bono (se paga en la recolección):'];
  if (lineasEmpleado.length) lineas.push(...lineasEmpleado);
  if (!reciben.length) {
    lineas.push('Nadie cobra en esta recolección.');
  } else {
    lineas.push(`Tabulador ${fmtMoney(reparto.totalTabulador || pack.base)} en ${reparto.partes} partes de ${fmtMoney(reparto.parte)}`);
    (pagos || []).forEach((p) => lineas.push(p.ecuacion));
    lineas.push(`A pagar ${fmtMoney(reparto.totalAPagar)} (${reparto.cobran} de ${reparto.partes} partes). La parte de quien tiene falta no se suma.`);
    if (origen === 'recoleccion') {
      lineas.push('Calculado con el monto de esta recolección.');
    } else {
      lineas.push('Venta acumulada: tope − saldo del corte. Sube si la venta sube y queda guardada en el siguiente cierre. Se paga al recolectar.');
    }
  }
  if (factores) lineas.push(`Factores: ${factores}`);
  return lineas.join('\n');
}

export default function AlertaBonoCorte({
  visible = true,
  cargando = false,
  pack = null,
  pagos = [],
  origen = 'pendiente',
}) {
  if (!visible || !pack?.ok || pack.activo === false) return null;
  const reciben = (pagos || []).filter((p) => !p.conFalta);
  const reparto = resumenRepartoBono(pagos);
  const mostrarMonto = origen === 'recoleccion' || origen === 'moneda_final' || origen === 'acumulado';
  const peso = pack.pesoFactor || pack.reglas?.find((r) => r.pesoPct > 0)?.pesoPct || 0;
  const pagosDistintos = [...new Set(reciben.map((p) => p.pago))];
  const mismoPago = pagosDistintos.length === 1;
  const montoCaja = mismoPago ? pagosDistintos[0] : null;
  const partesTxt = reparto.sinCobro > 0 && reparto.partes > 1
    ? `${reparto.cobran} de ${reparto.partes} partes`
    : '';

  const alertas = alertasVisiblesBono(pack, pagos).filter((a) => a.tipo === 'factor');
  const lineasEmpleado = (pagos || []).map((p) => textoLineaEmpleadoBono(p));
  let linea = cargando ? 'Calculando…' : 'Falta moneda final';
  if (!reciben.length && lineasEmpleado.length) linea = '';
  else if (!reciben.length) linea = 'Sin empleados de tienda';
  else if (partesTxt && mostrarMonto) linea = partesTxt;
  else if (origen === 'moneda_final' || origen === 'acumulado') linea = mismoPago ? 'c/u · se paga al recolectar' : 'Se paga al recolectar';
  else if (origen === 'recoleccion') linea = mismoPago ? 'c/u · esta recolección' : 'A pagar en esta recolección';
  const detalle = [
    lineasEmpleado.join('\n') || 'Sin empleados de tienda',
    mostrarMonto
      ? `Tabulador ${fmtMoney(reparto.totalTabulador || pack.base)} en ${reparto.partes} partes de ${fmtMoney(reparto.parte)} · a pagar ${fmtMoney(reparto.totalAPagar)}`
      : linea,
    peso > 0 ? `${pack.factoresActivos || pack.reglas?.length || 0} factores · ${peso}% c/u` : '',
    ...alertas.map((a) => a.texto),
  ].filter(Boolean).join('\n');

  return (
    <div
      className="alerta-pagare-abierto alerta-bono-corte"
      role="status"
      aria-live="polite"
      title={detalle}
    >
      <div className="alerta-bono-corte__fila">
        <span className="alerta-bono-corte__titulo">BONO</span>
        {mostrarMonto && montoCaja != null ? (
          <span className="alerta-bono-corte__monto">{fmtMoney(montoCaja)}</span>
        ) : null}
      </div>
      <div className="alerta-bono-corte__nombres">
        {lineasEmpleado.length
          ? (pagos || []).map((p) => (
            <div key={p.clave || p.id || p.nombre}>{textoLineaEmpleadoBono(p)}</div>
          ))
          : 'Sin empleados de tienda'}
      </div>
      {alertas.length > 0 ? (
        <ul className="alerta-bono-corte__alertas">
          {alertas.map((a) => (
            <li key={a.id}>{a.texto}</li>
          ))}
        </ul>
      ) : null}
      {linea ? <div className="alerta-bono-corte__pie">{linea}</div> : null}
    </div>
  );
}
