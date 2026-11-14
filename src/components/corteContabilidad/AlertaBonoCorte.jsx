import React, { useEffect, useState } from 'react';
import { normalizarCodigoTienda } from '../../constants/sucursales.js';
import { resolverTipoEmpleado } from '../../lib/empleadosVisibles.js';
import { normalizarRol } from '../../lib/roles.js';
import { usuarioEstaActivo } from '../../lib/usuariosAuth.js';
import { calcularBonoSucursal } from '../../lib/bonosData.js';
import { EVENTO_BONOS_CONFIG, calcularPagosBonoPorEmpleado } from '../../lib/bonosConfig.js';
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
      const pagos = res?.ok
        ? calcularPagosBonoPorEmpleado({
          base: res.base,
          pctTienda: res.pct,
          plantilla,
          bloqueosFalta: bloq?.data || [],
          ...ajusteRetardoBono(res, retardos),
        })
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
  const total = reciben.reduce((s, p) => s + (Number(p.pago) || 0), 0);
  const nombres = reciben.map((p) => p.nombre).filter(Boolean);
  const factores = (pack.reglas || [])
    .map((r) => `${r.ok ? '✓' : '✗'} ${r.label} (${r.pesoPct}%)`)
    .join(', ');
  const lineas = ['', 'Bono (se paga en la recolección):'];
  if (!nombres.length) {
    lineas.push('Nadie recibe bono: falta vigente (vuelve a los 8 días sin falta).');
  } else if (origen === 'pendiente') {
    lineas.push(`Reciben: ${nombres.join(', ')}.`);
    lineas.push('Captura la moneda final para ver el monto.');
  } else {
    lineas.push(`Tabulador ${fmtMoney(pack.base)} por empleado × su %`);
    reciben.forEach((p) => lineas.push(p.ecuacion));
    lineas.push(`Total bono: ${fmtMoney(total)}`);
    if (origen === 'moneda_final') {
      lineas.push('Estimado con moneda inicial − moneda final. Se paga al recolectar.');
    } else {
      lineas.push('Calculado con el monto de esta recolección.');
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
  const total = reciben.reduce((s, p) => s + (Number(p.pago) || 0), 0);
  const mostrarMonto = origen === 'recoleccion' || origen === 'moneda_final';
  const peso = pack.pesoFactor || pack.reglas?.find((r) => r.pesoPct > 0)?.pesoPct || 0;
  const pagosDistintos = [...new Set(reciben.map((p) => p.pago))];
  const mismoPago = pagosDistintos.length === 1;
  const montoCaja = mismoPago ? pagosDistintos[0] : null;

  let linea = cargando ? 'Calculando…' : 'Falta moneda final';
  if (origen === 'moneda_final') linea = mismoPago ? 'c/u · se paga al recolectar' : 'Se paga al recolectar';
  else if (origen === 'recoleccion') linea = mismoPago ? 'c/u · esta recolección' : 'A pagar en esta recolección';
  const nombres = !reciben.length
    ? 'Nadie recibe bono'
    : mismoPago
      ? reciben.map((p) => p.nombre).join(' · ')
      : reciben.map((p) => `${p.nombre} ${fmtMoney(p.pago)}`).join(' · ');
  const detalle = [
    nombres,
    mostrarMonto ? `Tabulador ${fmtMoney(pack.base)} por empleado · total ${fmtMoney(total)}` : linea,
    peso > 0 ? `${pack.factoresActivos || pack.reglas?.length || 0} factores · ${peso}% c/u` : '',
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
      <div className="alerta-bono-corte__nombres">{nombres}</div>
      <div className="alerta-bono-corte__pie">{linea}</div>
    </div>
  );
}
