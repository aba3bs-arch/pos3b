import React, { useEffect, useState } from 'react';
import { esAlmacenCentral, etiquetaTienda } from '../constants/sucursales.js';
import { EVENTO_BONOS_CONFIG } from '../lib/bonosConfig.js';
import { EVENTO_RESULTADO_INVENTARIO } from '../lib/resultadoInventario.js';
import { calcularBonoSucursal } from '../lib/bonosData.js';

function fmtMoney(n) {
  return `$${(Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

/**
 * Widget de bono en Inicio de cada sucursal (parpadea si hay bono > 0).
 * Incluye bono por recolección + bonos por turno (TD/TN) según % checklist.
 */
export default function PanelBonoInicio({ supabase, sucursal, inventario = [], onNavigateConfig }) {
  const [pack, setPack] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!supabase || !sucursal || esAlmacenCentral(sucursal)) {
      setPack(null);
      setCargando(false);
      return undefined;
    }
    let ok = true;
    const load = async () => {
      setCargando(true);
      const res = await calcularBonoSucursal(supabase, { sucursal, inventario });
      if (!ok) return;
      setPack(res);
      setCargando(false);
    };
    load();
    const onCfg = () => load();
    window.addEventListener(EVENTO_BONOS_CONFIG, onCfg);
    window.addEventListener(EVENTO_RESULTADO_INVENTARIO, onCfg);
    const t = setInterval(load, 5 * 60 * 1000);
    return () => {
      ok = false;
      window.removeEventListener(EVENTO_BONOS_CONFIG, onCfg);
      window.removeEventListener(EVENTO_RESULTADO_INVENTARIO, onCfg);
      clearInterval(t);
    };
  }, [supabase, sucursal, inventario]);

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

  const hayBono = (pack.bono || 0) > 0;
  const clase = hayBono ? 'bono-panel bono-panel-parpadeo' : 'bono-panel';
  const bt = pack.bonosTurno;
  const mostrarTurnos = bt?.activo;
  const td = bt?.porTurno?.TD;
  const tn = bt?.porTurno?.TN;
  const detalleTurnos = (bt?.detalle || []).slice(0, 8);

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
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className={hayBono ? 'bono-monto-parpadeo' : undefined} style={{ fontSize: '1.75rem', fontWeight: 900, color: hayBono ? '#b45309' : '#78716c', lineHeight: 1.1 }}>
            {fmtMoney(pack.bono)}
          </div>
          <div className="muted" style={{ fontSize: '0.78rem', marginTop: 2 }}>
            Recolección {fmtMoney(pack.bonoRecoleccion ?? pack.bono)}
            {mostrarTurnos ? ` · Turnos ${fmtMoney(pack.bonoTurnos || 0)}` : ''}
          </div>
          <div className="muted" style={{ fontSize: '0.75rem', marginTop: 2 }}>
            Base reco. {fmtMoney(pack.base)} · {pack.pct}% ({pack.cumplidas}/{pack.activas} reglas)
          </div>
        </div>
      </div>

      {mostrarTurnos ? (
        <div style={{ marginTop: '0.85rem' }}>
          <h4 style={{ margin: '0 0 0.4rem', fontSize: '0.88rem', color: '#92400e' }}>
            Bonos por turno (Check List)
          </h4>
          <p className="muted" style={{ margin: '0 0 0.5rem', fontSize: '0.75rem' }}>
            Se ajustan con el % de evaluación del compañero: bono = base × (% / 100).
            Bases: TD {fmtMoney(bt.bases?.TD)} · TN {fmtMoney(bt.bases?.TN)}.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.45rem' }}>
            {['TD', 'TN'].map((key) => {
              const row = key === 'TD' ? td : tn;
              const base = row?.base ?? (key === 'TD' ? bt.bases?.TD : bt.bases?.TN) ?? 0;
              const pct = row?.pctPromedio ?? 0;
              const color = pct <= 40 ? '#c62828' : pct <= 80 ? '#f9a825' : '#2e7d32';
              return (
                <div
                  key={key}
                  style={{
                    padding: '0.5rem 0.6rem',
                    borderRadius: 8,
                    border: '1px solid rgba(180,83,9,0.25)',
                    background: 'rgba(180,83,9,0.04)',
                  }}
                >
                  <div style={{ fontWeight: 800, fontSize: '0.85rem' }}>
                    {key === 'TD' ? 'Turno día (TD)' : 'Turno noche (TN)'}
                  </div>
                  <div className="muted" style={{ fontSize: '0.72rem' }}>
                    Base {fmtMoney(base)} · {row?.sesiones || 0} checklist(s)
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4, gap: '0.35rem' }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color }}>
                      {pct}%
                    </span>
                    <strong style={{ fontSize: '1rem', color: '#b45309' }}>{fmtMoney(row?.bono || 0)}</strong>
                  </div>
                </div>
              );
            })}
          </div>
          {detalleTurnos.length > 0 ? (
            <ul style={{ margin: '0.55rem 0 0', padding: 0, listStyle: 'none', display: 'grid', gap: '0.25rem' }}>
              {detalleTurnos.map((d) => (
                <li
                  key={d.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: '0.5rem',
                    fontSize: '0.78rem',
                    padding: '0.3rem 0.45rem',
                    borderRadius: 6,
                    background: 'rgba(0,0,0,0.03)',
                  }}
                >
                  <span>
                    {d.fecha} · {d.turno}
                    <span style={{ marginLeft: 6, fontWeight: 700, color: d.color, fontSize: 14 }}>
                      {d.pct}%
                    </span>
                    <span className="muted" style={{ marginLeft: 4 }}>({d.etiqueta})</span>
                  </span>
                  <strong>{fmtMoney(d.bono)}</strong>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted" style={{ margin: '0.45rem 0 0', fontSize: '0.75rem' }}>
              Sin checklists TD/TN cerrados en el periodo.
            </p>
          )}
        </div>
      ) : null}

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
