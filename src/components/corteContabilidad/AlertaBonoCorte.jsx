import React, { useEffect, useState } from 'react';
import { normalizarCodigoTienda } from '../../constants/sucursales.js';
import { resolverTipoEmpleado } from '../../lib/empleadosVisibles.js';
import { normalizarRol } from '../../lib/roles.js';
import { usuarioEstaActivo } from '../../lib/usuariosAuth.js';
import { calcularBonoSucursal } from '../../lib/bonosData.js';
import { EVENTO_BONOS_CONFIG, alertasVisiblesBono, calcularPagosBonoPorEmpleado, etiquetaReactivaBono, rangoBonoPorMonto, resumenRepartoBono, textoLineaEmpleadoBono } from '../../lib/bonosConfig.js';
import { ajusteRetardoBono, cargarRetardosBono } from '../../lib/bonosRetardos.js';
import {
  cargarBloqueosBonoPorFalta,
  cargarUsuariosResumen,
} from '../../lib/resumenDiasAsistencia.js';

function fmtMoney(n) {
  return `$${(Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPago(n) {
  const pago = Math.round((Number(n) || 0) * 100) / 100;
  const entero = Math.abs(pago - Math.round(pago)) < 0.001;
  return entero
    ? `$${Math.round(pago).toLocaleString('es-MX')}`
    : fmtMoney(pago);
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
      const rango = rangoBonoPorMonto(res?.recoleccion, res?.config);
      const pagos = res?.ok
        ? calcularPagosBonoPorEmpleado({
          base: rango.bono,
          td: rango.td,
          tn: rango.tn,
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
    lineas.push(`Tabulador ${fmtMoney(reparto.totalTabulador || pack.base)} para TD y para TN × ${pack.pct || 0}%.`);
    (pagos || []).forEach((p) => lineas.push(p.ecuacion));
    lineas.push(`A pagar ${fmtMoney(reparto.totalAPagar)}. Quien tiene falta no cobra por 7 días.`);
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
  const hayFactores = (pack.factoresActivos || pack.reglas?.length || 0) > 0;
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
  const ventaTxt = `Venta ${fmtMoney(pack.recoleccion)}`;
  const tabuladorN = Math.round((Number(pack.base) || 0) * 100) / 100;
  const pctFactores = Math.round((Number(pack.pct) || 0) * 100) / 100;
  const tabuladorTxt = tabuladorN > 0 ? `tabulador ${fmtMoney(tabuladorN)}` : '';
  const factoresTxt = hayFactores && pctFactores < 100 ? `factores ${pctFactores}%` : '';
  const detalle = [
    ventaTxt,
    lineasEmpleado.join('\n') || 'Sin empleados de tienda',
    mostrarMonto
      ? `Tabulador ${fmtMoney(reparto.totalTabulador || pack.base)} para TD y para TN · a pagar ${fmtMoney(reparto.totalAPagar)}`
      : linea,
    hayFactores ? `${pack.factoresActivos || pack.reglas?.length || 0} factores · se acumula ${pack.pct || 0}%` : '',
    ...alertas.map((a) => a.texto),
  ].filter(Boolean).join('\n');

  const montoCero = montoCaja == null || Math.abs(Number(montoCaja) || 0) < 0.001;

  return (
    <div
      className="alerta-bono-corte"
      role="status"
      aria-live="polite"
      title={detalle}
    >
      <div className="alerta-bono-corte__fila">
        <span className="alerta-bono-corte__titulo">Bono</span>
        {mostrarMonto && montoCaja != null ? (
          <span className={`alerta-bono-corte__monto${montoCero ? ' is-cero' : ''}`}>{fmtMoney(montoCaja)}</span>
        ) : null}
      </div>
      <div className="alerta-bono-corte__nombres">
        {pagos.length
          ? pagos.map((p) => {
            const react = p.conFalta ? (etiquetaReactivaBono(p.vuelveBonoYmd) || 'n/b') : '';
            return (
              <div
                key={p.clave || p.id || p.nombre}
                className={`alerta-bono-corte__persona${p.conFalta ? ' is-suspendido' : ''}`}
              >
                <span className="alerta-bono-corte__nombre">{p.nombre}</span>
                <span className="alerta-bono-corte__lado">
                  {p.turno ? <span className="alerta-bono-corte__turno">{p.turno}</span> : null}
                  {p.conFalta
                    ? <span className="alerta-bono-corte__react">{react}</span>
                    : (
                      <span className={`alerta-bono-corte__pago${Math.abs(Number(p.pago) || 0) < 0.001 ? ' is-cero' : ''}`}>
                        {fmtPago(p.pago)}
                      </span>
                    )}
                </span>
              </div>
            );
          })
          : <div className="alerta-bono-corte__vacio">Sin empleados de tienda</div>}
      </div>
      {alertas.length > 0 ? (
        <ul className="alerta-bono-corte__alertas">
          {alertas.map((a) => (
            <li key={a.id}>{a.texto}</li>
          ))}
        </ul>
      ) : null}
      <div className="alerta-bono-corte__pie">{[ventaTxt, tabuladorTxt, factoresTxt, linea].filter(Boolean).join(' · ')}</div>
    </div>
  );
}
