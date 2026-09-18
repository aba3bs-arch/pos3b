import React, { useEffect, useMemo, useState } from 'react';
import { esAlmacenCentral, etiquetaTienda, normalizarCodigoTienda } from '../constants/sucursales.js';
import { normalizarRol } from '../lib/roles.js';
import { EVENTO_BONOS_CONFIG, calcularPagosBonoPorEmpleado } from '../lib/bonosConfig.js';
import { EVENTO_RESULTADO_INVENTARIO } from '../lib/resultadoInventario.js';
import { calcularBonoSucursal } from '../lib/bonosData.js';
import { EVENTO_DESCANSOS_AUTORIZADOS } from '../lib/descansosAutorizados.js';
import { EVENTO_PLAN_HORARIO } from '../lib/planHorarioSync.js';
import {
  DIAS_BLOQUEO_BONO_POR_FALTA,
  cargarBloqueosBonoPorFalta,
  cargarUsuariosResumen,
} from '../lib/resumenDiasAsistencia.js';
import { resolverTipoEmpleado } from '../lib/empleadosVisibles.js';
import { usuarioEstaActivo } from '../lib/usuariosAuth.js';
import PanelAutorizarDescanso from './PanelAutorizarDescanso.jsx';

function fmtMoney(n) {
  return `$${(Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtDia(ymd) {
  if (!ymd) return '—';
  const [y, m, d] = String(ymd).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

function plantillaTiendaBono(usuarios, sucursal) {
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
 * Widget de bono en Inicio de cada sucursal (parpadea si hay bono > 0).
 * % a pagar = 100 − 25×lineamientos fallidos (faltante, checklist, evaluación, inventario).
 * Empleado con falta → 0%. Ecuación por nombre: base × pct% = pago.
 */
export default function PanelBonoInicio({
  supabase,
  sucursal,
  inventario = [],
  user = null,
  onNavigateConfig,
}) {
  const [pack, setPack] = useState(null);
  const [bloqueosFalta, setBloqueosFalta] = useState([]);
  const [avisoDescansos, setAvisoDescansos] = useState('');
  const [usuarios, setUsuarios] = useState([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!supabase || !sucursal || esAlmacenCentral(sucursal)) {
      setPack(null);
      setBloqueosFalta([]);
      setUsuarios([]);
      setCargando(false);
      return undefined;
    }
    let ok = true;
    const load = async () => {
      setCargando(true);
      const [res, bloq, uRes] = await Promise.all([
        calcularBonoSucursal(supabase, { sucursal, inventario }),
        cargarBloqueosBonoPorFalta(supabase, { sucursalId: sucursal }),
        cargarUsuariosResumen(supabase, { sucursalId: sucursal }),
      ]);
      if (!ok) return;
      setPack(res);
      setBloqueosFalta(bloq?.data || []);
      setAvisoDescansos(bloq?.avisoDescansos || '');
      setUsuarios(uRes?.data || []);
      setCargando(false);
    };
    load();
    const onCfg = () => load();
    window.addEventListener(EVENTO_BONOS_CONFIG, onCfg);
    window.addEventListener(EVENTO_RESULTADO_INVENTARIO, onCfg);
    window.addEventListener(EVENTO_DESCANSOS_AUTORIZADOS, onCfg);
    window.addEventListener(EVENTO_PLAN_HORARIO, onCfg);
    const t = setInterval(load, 5 * 60 * 1000);
    return () => {
      ok = false;
      window.removeEventListener(EVENTO_BONOS_CONFIG, onCfg);
      window.removeEventListener(EVENTO_RESULTADO_INVENTARIO, onCfg);
      window.removeEventListener(EVENTO_DESCANSOS_AUTORIZADOS, onCfg);
      window.removeEventListener(EVENTO_PLAN_HORARIO, onCfg);
      clearInterval(t);
    };
  }, [supabase, sucursal, inventario]);

  const pagosEmpleado = useMemo(() => {
    if (!pack?.ok) return [];
    return calcularPagosBonoPorEmpleado({
      base: pack.base,
      pctTienda: pack.pct,
      plantilla: plantillaTiendaBono(usuarios, sucursal),
      bloqueosFalta,
    });
  }, [pack, usuarios, sucursal, bloqueosFalta]);

  if (esAlmacenCentral(sucursal)) return null;
  if (cargando && !pack) {
    return (
      <div className="card bono-panel" style={{ borderLeft: '4px solid #b45309' }}>
        <p className="muted" style={{ margin: 0 }}>Calculando bono…</p>
      </div>
    );
  }
  if (!pack?.ok || pack.activo === false) {
    if (pack && pack.activo === false) {
      return (
        <div className="card bono-panel" style={{ borderLeft: '4px solid #a8a29e' }}>
          <h3 style={{ margin: 0, color: '#78716c', fontSize: '1rem' }}>Bono por recolección</h3>
          <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.85rem' }}>Sistema de bono desactivado en Configuración.</p>
        </div>
      );
    }
    return null;
  }

  const hayBono = (pack.bono || 0) > 0 || pagosEmpleado.some((p) => p.pago > 0);
  const clase = hayBono ? 'bono-panel bono-panel-parpadeo' : 'bono-panel';
  const fallos = (pack.reglas || []).filter((r) => !r.ok).length;

  return (
    <div className={`card ${clase}`} style={{ borderLeft: `4px solid ${hayBono ? '#b45309' : '#a8a29e'}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <h3 style={{ margin: 0, color: '#b45309', fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            {hayBono && <span className="bono-punto-parpadeo" aria-hidden />}
            Bonos {etiquetaTienda(sucursal)}
          </h3>
          <p className="muted" style={{ margin: '0.25rem 0 0', fontSize: '0.78rem' }}>
            {pack.periodo?.label || 'Periodo'} · Recolección {fmtMoney(pack.recoleccion)}
          </p>
          <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.75rem', maxWidth: 460 }}>
            Porcentaje a pagar: <strong>{pack.pct}%</strong> del tabulador
            ({fallos === 0 ? '100%' : `${fallos} lineamiento${fallos === 1 ? '' : 's'} × −25%`}).
            Falta del empleado → 0%. Posibles: 100 · 75 · 50 · 25 · 0%.
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#b45309' }}>
            {pack.pct}%
          </div>
          <div className="muted" style={{ fontSize: '0.75rem', marginTop: 2 }}>
            Tabulador {fmtMoney(pack.base)}
            {pack.penalizacionTotal > 0 ? ` · −${pack.penalizacionTotal}%` : ' · completo'}
          </div>
        </div>
      </div>

      <div
        style={{
          marginTop: '0.85rem',
          padding: '0.65rem 0.75rem',
          borderRadius: 8,
          border: '1px solid rgba(180,83,9,0.28)',
          background: 'rgba(180,83,9,0.05)',
        }}
      >
        <h4 style={{ margin: '0 0 0.35rem', fontSize: '0.88rem', color: '#b45309' }}>
          Pago por empleado (ecuación)
        </h4>
        <p className="muted" style={{ margin: '0 0 0.55rem', fontSize: '0.74rem' }}>
          <code style={{ fontSize: '0.72rem' }}>pago = tabulador × % tienda</code>
          {' · '}si hay falta: <code style={{ fontSize: '0.72rem' }}>× 0%</code>.
          Cada tienda es independiente.
        </p>
        {pagosEmpleado.length === 0 ? (
          <p className="muted" style={{ margin: 0, fontSize: '0.8rem' }}>
            Sin empleados de tienda en la plantilla de esta sucursal.
          </p>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: '0.35rem' }}>
            {pagosEmpleado.map((p) => (
              <li
                key={p.clave || p.id || p.nombre}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '0.5rem',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  fontSize: '0.82rem',
                  padding: '0.4rem 0.5rem',
                  borderRadius: 6,
                  background: p.conFalta ? 'rgba(185,28,28,0.08)' : 'rgba(255,255,255,0.75)',
                  border: `1px solid ${p.conFalta ? 'rgba(185,28,28,0.25)' : 'rgba(0,0,0,0.06)'}`,
                }}
              >
                <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.78rem' }}>
                  {p.ecuacion}
                </span>
                <strong style={{ color: p.pago > 0 ? '#b45309' : '#b91c1c' }}>
                  {fmtMoney(p.pago)}
                </strong>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div
        style={{
          marginTop: '0.85rem',
          padding: '0.65rem 0.75rem',
          borderRadius: 8,
          border: '1px solid rgba(185,28,28,0.25)',
          background: bloqueosFalta.length ? 'rgba(185,28,28,0.06)' : 'rgba(0,0,0,0.02)',
        }}
      >
        <h4 style={{ margin: '0 0 0.35rem', fontSize: '0.88rem', color: '#b91c1c' }}>
          Sin bono por falta (empleados de tienda)
        </h4>
        <p className="muted" style={{ margin: '0 0 0.5rem', fontSize: '0.74rem' }}>
          Quien tiene falta vigente queda en <strong>0%</strong>. Descanso del plan horario
          (Checador → Plan) o descanso autorizado no es falta.
          Recuperan el bono {DIAS_BLOQUEO_BONO_POR_FALTA} días después de la última falta (si no vuelven a faltar).
        </p>
        {avisoDescansos ? (
          <p style={{ margin: '0 0 0.45rem', fontSize: '0.74rem', color: '#b45309' }}>{avisoDescansos}</p>
        ) : null}
        {bloqueosFalta.length === 0 ? (
          <p className="muted" style={{ margin: 0, fontSize: '0.8rem' }}>
            Nadie de la plantilla en ventana de bloqueo por falta.
          </p>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: '0.3rem' }}>
            {bloqueosFalta.map((b) => (
              <li
                key={`${b.clave}-${b.faltaYmd}`}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '0.5rem',
                  flexWrap: 'wrap',
                  fontSize: '0.8rem',
                  padding: '0.35rem 0.45rem',
                  borderRadius: 6,
                  background: 'rgba(255,255,255,0.7)',
                }}
              >
                <span>
                  <strong>{b.nombre}</strong>
                  <span className="muted" style={{ marginLeft: 6 }}>
                    {b.faltasCount > 1
                      ? `${b.faltasCount} faltas (${fmtDia(b.primeraFaltaYmd)} → ${fmtDia(b.faltaYmd)})`
                      : `falta ${fmtDia(b.faltaYmd)}`}
                    {b.diasAcumuladosExtra > 0 ? (
                      <span> · +{b.diasAcumuladosExtra}d acumulados</span>
                    ) : null}
                  </span>
                </span>
                <span style={{ color: '#b91c1c', fontWeight: 700 }}>
                  vuelve {fmtDia(b.vuelveBonoYmd || b.sinBonoHasta)}
                  <span className="muted" style={{ fontWeight: 500, marginLeft: 4 }}>
                    ({b.diasRestantes}d · 0%)
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <PanelAutorizarDescanso
        supabase={supabase}
        sucursal={sucursal}
        user={user}
        usuarios={usuarios}
        onCambio={async () => {
          const bloq = await cargarBloqueosBonoPorFalta(supabase, { sucursalId: sucursal });
          setBloqueosFalta(bloq?.data || []);
          setAvisoDescansos(bloq?.avisoDescansos || '');
        }}
      />

      <ul style={{ margin: '0.75rem 0 0', padding: 0, listStyle: 'none', display: 'grid', gap: '0.35rem' }}>
        {(pack.reglas || []).map((r) => (
          <li
            key={r.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: '0.5rem',
              fontSize: '0.8rem',
              padding: '0.35rem 0.5rem',
              borderRadius: 8,
              background: r.ok ? 'rgba(21,128,61,0.08)' : 'rgba(185,28,28,0.08)',
            }}
          >
            <span>
              <strong style={{ color: r.ok ? '#15803d' : '#b91c1c' }}>{r.ok ? '✓' : '✗'}</strong>{' '}
              {r.label}
              {!r.ok && r.penalizacionPct > 0 ? (
                <span style={{ color: '#b91c1c', marginLeft: 4 }}>−{r.penalizacionPct}%</span>
              ) : null}
              {r.ok ? (
                <span style={{ color: '#15803d', marginLeft: 4 }}>OK</span>
              ) : null}
            </span>
            <span className="muted">{r.valor} <span style={{ opacity: 0.75 }}>({r.requerido})</span></span>
          </li>
        ))}
      </ul>

      {typeof onNavigateConfig === 'function' && (
        <button type="button" className="btn btn-ghost" style={{ marginTop: '0.65rem', fontSize: '0.8rem' }} onClick={onNavigateConfig}>
          Ajustar parámetros en Configuración
        </button>
      )}
    </div>
  );
}
