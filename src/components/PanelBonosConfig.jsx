import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { etiquetaTienda, listarSucursalesOperativas } from '../constants/sucursales.js';
import {
  AVISO_FALTA_BONOS_SQL,
  BONOS_CONFIG_DEFAULT,
  leerBonosConfig,
  normalizarBonosConfig,
  persistirBonosConfig,
  sincronizarBonosConfigDesdeNube,
} from '../lib/bonosConfig.js';
import { calcularBonosVariasSucursales } from '../lib/bonosData.js';

function fmtMoney(n) {
  return `$${(Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Submódulo Configuración → Bonos: editar parámetros + monitoreo por tienda.
 */
export default function PanelBonosConfig({ supabase, inventario = [], esAdmin = false }) {
  const [cfg, setCfg] = useState(() => leerBonosConfig());
  const [msg, setMsg] = useState('');
  const [aviso, setAviso] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [tab, setTab] = useState('params'); // params | monitor
  const [monitor, setMonitor] = useState([]);
  const [cargandoMon, setCargandoMon] = useState(false);

  const tiendas = useMemo(() => listarSucursalesOperativas(), []);

  useEffect(() => {
    let ok = true;
    (async () => {
      const sync = await sincronizarBonosConfigDesdeNube(supabase);
      if (!ok) return;
      if (sync.aviso) setAviso(sync.aviso);
      setCfg(leerBonosConfig());
    })();
    return () => { ok = false; };
  }, [supabase]);

  const cargarMonitor = useCallback(async () => {
    if (!supabase) return;
    setCargandoMon(true);
    const rows = await calcularBonosVariasSucursales(supabase, {
      sucursales: tiendas,
      inventario,
      config: cfg,
    });
    setMonitor(rows);
    setCargandoMon(false);
  }, [supabase, tiendas, inventario, cfg]);

  useEffect(() => {
    if (tab === 'monitor') cargarMonitor();
  }, [tab, cargarMonitor]);

  const setRango = (idx, patch) => {
    setCfg((c) => {
      const rangos = [...(c.rangos || [])];
      rangos[idx] = { ...rangos[idx], ...patch };
      return { ...c, rangos };
    });
  };

  const addRango = () => {
    setCfg((c) => ({
      ...c,
      rangos: [...(c.rangos || []), { min: 0, max: 0, bono: 0 }],
    }));
  };

  const delRango = (idx) => {
    setCfg((c) => ({ ...c, rangos: (c.rangos || []).filter((_, i) => i !== idx) }));
  };

  const setNivel = (idx, patch) => {
    setCfg((c) => {
      const nivelesPct = [...(c.nivelesPct || [])];
      nivelesPct[idx] = { ...nivelesPct[idx], ...patch };
      return { ...c, nivelesPct };
    });
  };

  const setRegla = (key, patch) => {
    setCfg((c) => ({
      ...c,
      reglas: {
        ...c.reglas,
        [key]: { ...c.reglas[key], ...patch },
      },
    }));
  };

  const guardar = async () => {
    if (!esAdmin) {
      setMsg('Solo administrador puede guardar parámetros de bono.');
      return;
    }
    setGuardando(true);
    setMsg('');
    const norm = normalizarBonosConfig(cfg);
    const res = await persistirBonosConfig(norm, supabase);
    setGuardando(false);
    setCfg(res.local);
    if (res.remoto?.sinTabla) {
      setAviso(AVISO_FALTA_BONOS_SQL);
      setMsg('Guardado en este equipo. Ejecuta el SQL para sincronizar en todas las cajas.');
      return;
    }
    if (res.remoto && !res.remoto.ok) {
      setMsg(`Guardado local, pero no se sincronizó: ${res.remoto.error || 'error'}`);
      return;
    }
    setMsg('Parámetros de bono guardados y sincronizados.');
  };

  const restaurar = () => {
    if (!confirm('¿Restaurar valores por defecto del bono?')) return;
    setCfg(normalizarBonosConfig(BONOS_CONFIG_DEFAULT));
  };

  return (
    <div className="card" style={{ maxWidth: 900 }}>
      <h3 style={{ margin: '0 0 0.35rem', color: '#b45309' }}>Bonos por recolección</h3>
      <p className="muted" style={{ marginTop: 0, fontSize: '0.85rem' }}>
        El bono base sale del monto recolectado. El % (100 / 75 / 50 / 25) depende de cuántas reglas se cumplan
        (faltante, merma, evaluación operativa, check list diario). Se muestra en el Inicio de cada sucursal.
      </p>

      <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1rem' }}>
        <button type="button" className={`btn ${tab === 'params' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('params')}>
          Parámetros
        </button>
        <button type="button" className={`btn ${tab === 'monitor' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('monitor')}>
          Monitoreo
        </button>
      </div>

      {aviso && (
        <div style={{ background: '#fff7ed', border: '1px solid #fdba74', color: '#9a3412', borderRadius: 8, padding: '0.65rem', marginBottom: '0.75rem', fontSize: '0.85rem' }}>
          {aviso}
        </div>
      )}
      {msg && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', borderRadius: 8, padding: '0.65rem', marginBottom: '0.75rem', fontSize: '0.85rem' }}>
          {msg}
        </div>
      )}

      {tab === 'params' && (
        <>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <input type="checkbox" checked={cfg.activo !== false} onChange={(e) => setCfg({ ...cfg, activo: e.target.checked })} />
            <strong>Sistema de bono activo</strong>
          </label>

          <label className="muted" style={{ display: 'block', marginBottom: '1rem' }}>
            Periodo de cálculo
            <select
              className="input"
              style={{ marginTop: '0.35rem' }}
              value={cfg.periodo || 'semana'}
              onChange={(e) => setCfg({ ...cfg, periodo: e.target.value })}
            >
              <option value="semana">Semana de nómina (sáb–vie)</option>
              <option value="dia">Solo el día de hoy</option>
            </select>
          </label>

          <h4 style={{ margin: '0 0 0.5rem', color: 'var(--brand-blue)' }}>Rangos de recolección → bono base</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
            {(cfg.rangos || []).map((r, idx) => (
              <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '0.35rem', alignItems: 'end' }}>
                <label className="muted" style={{ fontSize: '0.75rem' }}>
                  Desde $
                  <input className="input" type="number" value={r.min} onChange={(e) => setRango(idx, { min: Number(e.target.value) })} />
                </label>
                <label className="muted" style={{ fontSize: '0.75rem' }}>
                  Hasta $
                  <input className="input" type="number" value={r.max} onChange={(e) => setRango(idx, { max: Number(e.target.value) })} />
                </label>
                <label className="muted" style={{ fontSize: '0.75rem' }}>
                  Bono $
                  <input className="input" type="number" value={r.bono} onChange={(e) => setRango(idx, { bono: Number(e.target.value) })} />
                </label>
                <button type="button" className="btn btn-ghost" style={{ color: 'var(--danger)' }} onClick={() => delRango(idx)}>✕</button>
              </div>
            ))}
          </div>
          <button type="button" className="btn btn-ghost" style={{ marginTop: '0.5rem' }} onClick={addRango}>+ Rango</button>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0.75rem 0 1rem' }}>
            <input
              type="checkbox"
              checked={cfg.topeSuperiorUsaUltimo !== false}
              onChange={(e) => setCfg({ ...cfg, topeSuperiorUsaUltimo: e.target.checked })}
            />
            <span className="muted" style={{ fontSize: '0.85rem' }}>Si la recolección supera el último rango, usar el bono máximo</span>
          </label>

          <h4 style={{ margin: '0 0 0.5rem', color: 'var(--brand-blue)' }}>Niveles de cumplimiento → %</h4>
          <p className="muted" style={{ fontSize: '0.8rem', marginTop: 0 }}>Según cuántas reglas se cumplen (de 0 a 4).</p>
          {(cfg.nivelesPct || []).map((n, idx) => (
            <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.35rem' }}>
              <label className="muted" style={{ fontSize: '0.75rem' }}>
                Mín. reglas cumplidas
                <input className="input" type="number" min={0} max={4} value={n.reglasMin} onChange={(e) => setNivel(idx, { reglasMin: Number(e.target.value) })} />
              </label>
              <label className="muted" style={{ fontSize: '0.75rem' }}>
                % del bono
                <input className="input" type="number" min={0} max={100} value={n.pct} onChange={(e) => setNivel(idx, { pct: Number(e.target.value) })} />
              </label>
            </div>
          ))}

          <h4 style={{ margin: '1rem 0 0.5rem', color: 'var(--brand-blue)' }}>Reglas de elegibilidad</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input type="checkbox" checked={cfg.reglas.faltanteCero.activo !== false} onChange={(e) => setRegla('faltanteCero', { activo: e.target.checked })} />
              Faltante de efectivo = $0
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input type="checkbox" checked={cfg.reglas.mermaMaxPct.activo !== false} onChange={(e) => setRegla('mermaMaxPct', { activo: e.target.checked })} />
                Merma inventario ≤
              </label>
              <input
                className="input"
                type="number"
                step="0.1"
                style={{ width: 80 }}
                value={cfg.reglas.mermaMaxPct.maxPct}
                onChange={(e) => setRegla('mermaMaxPct', { maxPct: Number(e.target.value) })}
              />
              <span className="muted">%</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input type="checkbox" checked={cfg.reglas.evaluacionMinPct.activo !== false} onChange={(e) => setRegla('evaluacionMinPct', { activo: e.target.checked })} />
                Evaluación operativa ≥
              </label>
              <input
                className="input"
                type="number"
                style={{ width: 80 }}
                value={cfg.reglas.evaluacionMinPct.minPct}
                onChange={(e) => setRegla('evaluacionMinPct', { minPct: Number(e.target.value) })}
              />
              <span className="muted">%</span>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input type="checkbox" checked={cfg.reglas.checklistDiario.activo !== false} onChange={(e) => setRegla('checklistDiario', { activo: e.target.checked })} />
              Check list operativo diario (cerrado)
            </label>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '1.25rem' }}>
            <button type="button" className="btn btn-primary" disabled={guardando || !esAdmin} onClick={guardar}>
              {guardando ? 'Guardando…' : 'Guardar parámetros'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={restaurar}>Restaurar defaults</button>
          </div>
          {!esAdmin && <p className="muted" style={{ fontSize: '0.8rem' }}>Solo un administrador puede guardar cambios.</p>}
        </>
      )}

      {tab === 'monitor' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
              Bonos estimados con datos de la app (recolecciones, faltantes, merma, evaluación, check list).
            </p>
            <button type="button" className="btn btn-ghost" onClick={cargarMonitor} disabled={cargandoMon}>
              {cargandoMon ? '…' : 'Actualizar'}
            </button>
          </div>
          {cargandoMon && <p className="muted">Cargando monitoreo…</p>}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '0.4rem' }}>Tienda</th>
                  <th style={{ padding: '0.4rem' }}>Recolección</th>
                  <th style={{ padding: '0.4rem' }}>Base</th>
                  <th style={{ padding: '0.4rem' }}>%</th>
                  <th style={{ padding: '0.4rem' }}>Bono</th>
                  <th style={{ padding: '0.4rem' }}>Reglas</th>
                </tr>
              </thead>
              <tbody>
                {monitor.map((row) => (
                  <tr key={row.sucursal || Math.random()} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '0.45rem' }}>{etiquetaTienda(row.sucursal)}</td>
                    <td style={{ padding: '0.45rem' }}>{fmtMoney(row.recoleccion)}</td>
                    <td style={{ padding: '0.45rem' }}>{fmtMoney(row.base)}</td>
                    <td style={{ padding: '0.45rem' }}>{row.pct}%</td>
                    <td style={{ padding: '0.45rem', fontWeight: 800, color: row.bono > 0 ? '#b45309' : undefined }}>{fmtMoney(row.bono)}</td>
                    <td style={{ padding: '0.45rem' }}>
                      {(row.reglas || []).map((r) => (
                        <span key={r.id} title={`${r.label}: ${r.valor}`} style={{ marginRight: 4, color: r.ok ? '#15803d' : '#b91c1c' }}>
                          {r.ok ? '✓' : '✗'}
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!cargandoMon && !monitor.length && <p className="muted">Sin datos.</p>}
        </>
      )}
    </div>
  );
}
