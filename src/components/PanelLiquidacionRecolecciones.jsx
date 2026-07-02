import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { normalizarRol } from '../lib/roles.js';
import {
  agruparEnTransitoPorTiendaYDia,
  fmtFechaClave,
  fmtFechaHora,
  fmtMonto,
  liquidarMovimientos,
  listarAlertasRecoleccion,
  listarEnTransitoPorRepartidor,
  listarRepartidores,
  marcarAlertaVista,
  resumenTotalesPorTipo,
} from '../lib/controlEfectivo.js';

function etiquetaTipo(m) {
  if (m.tipo_movimiento === 'Cobro Servicio') return 'Servicio';
  if (m.tipo_movimiento === 'Entrega Crédito') return 'Crédito';
  return 'Recolección';
}

/** Liquidación en oficina — administrador / gerente. */
export default function PanelLiquidacionRecolecciones({ supabase, user, embedded = false }) {
  const rol = normalizarRol(user?.rol);
  const [repartidores, setRepartidores] = useState([]);
  const [repLiq, setRepLiq] = useState('');
  const [enTransito, setEnTransito] = useState([]);
  const [selIds, setSelIds] = useState({});
  const [alertas, setAlertas] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  const fechaLiquidacion = useMemo(() => fmtFechaClave(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Hermosillo' })), []);

  const cargar = useCallback(async () => {
    if (!supabase) return;
    setError(null);
    try {
      const reps = await listarRepartidores(supabase);
      setRepartidores(reps);
      const repId = repLiq || reps[0]?.id || '';
      if (!repLiq && repId) setRepLiq(repId);
      if (!repId) return;
      const [movs, alr] = await Promise.all([
        listarEnTransitoPorRepartidor(supabase, repId),
        listarAlertasRecoleccion(supabase),
      ]);
      setEnTransito(movs);
      setAlertas(alr);
      const init = {};
      movs.forEach((m) => {
        init[m.id] = true;
      });
      setSelIds(init);
    } catch (e) {
      setError(e.message?.includes('repartidores') ? 'Ejecuta supabase/control_efectivo.sql en Supabase.' : e.message);
    }
  }, [supabase, repLiq]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const agrupado = useMemo(() => agruparEnTransitoPorTiendaYDia(enTransito), [enTransito]);

  const seleccionados = useMemo(() => enTransito.filter((m) => selIds[m.id]), [enTransito, selIds]);

  const totalSeleccionado = useMemo(() => seleccionados.reduce((a, m) => a + Number(m.monto || 0), 0), [seleccionados]);

  const resumenSel = useMemo(() => resumenTotalesPorTipo(seleccionados), [seleccionados]);

  const toggleId = (id, val) => setSelIds((prev) => ({ ...prev, [id]: val }));

  const toggleDia = (items, val) => {
    setSelIds((prev) => {
      const next = { ...prev };
      items.forEach((m) => {
        next[m.id] = val;
      });
      return next;
    });
  };

  const toggleTienda = (diasData, val) => {
    const items = diasData.flatMap((d) => d.items);
    toggleDia(items, val);
  };

  const diaEstado = (items) => {
    const sel = items.filter((m) => selIds[m.id]).length;
    if (sel === 0) return 'none';
    if (sel === items.length) return 'all';
    return 'partial';
  };

  const confirmarLiquidacion = async () => {
    const ids = seleccionados.map((m) => m.id);
    if (!ids.length) return alert('Selecciona al menos un movimiento para liquidar.');
    if (!window.confirm(`¿Sellar liquidación del ${fechaLiquidacion} por ${fmtMonto(totalSeleccionado)} (${ids.length} movimiento(s))?`)) return;
    setGuardando(true);
    const repNombre = repartidores.find((r) => r.id === repLiq)?.nombre || '';
    const res = await liquidarMovimientos(supabase, {
      ids,
      adminNombre: user?.nombre || rol,
      repartidorNombre: repNombre,
    });
    setGuardando(false);
    if (!res.ok) return alert(res.error);
    alert(`✅ Liquidación sellada (${res.count} registros).`);
    cargar();
  };

  const inner = (
    <>
      {!embedded && (
        <>
          <h3 style={{ margin: '0 0 0.5rem', color: 'var(--brand-blue)' }}>Liquidación de recolecciones</h3>
          <p className="muted" style={{ marginTop: 0, fontSize: '0.85rem' }}>
            Revisa lo recolectado por tienda y por día. Marca solo los días o movimientos que entregas hoy.
          </p>
        </>
      )}

      {error && <p style={{ color: 'var(--brand-red)', fontSize: '0.85rem' }}>{error}</p>}

      {alertas.length > 0 && (
        <div style={{ marginBottom: '1rem', padding: '0.75rem', borderRadius: '10px', background: 'rgba(225,153,41,0.12)', border: '1px solid rgba(225,153,41,0.35)' }}>
          <strong>Alertas de recolección ({alertas.length})</strong>
          {alertas.map((a) => (
            <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.85rem' }}>
                {a.sucursal_origen} · {a.num_traspaso} · {fmtMonto(a.monto)} · {a.repartidores?.nombre || 'Recolector'}
              </span>
              <button type="button" className="btn btn-ghost" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} onClick={() => marcarAlertaVista(supabase, a.id).then(cargar)}>
                Visto bueno
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="grid-2" style={{ gap: '0.75rem' }}>
        <label className="muted" style={{ display: 'block' }}>
          Recolector a liquidar
          <select className="select" style={{ marginTop: '0.35rem' }} value={repLiq} onChange={(e) => setRepLiq(e.target.value)}>
            {repartidores.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="muted" style={{ display: 'block' }}>
          Fecha de liquidación
          <input className="input" style={{ marginTop: '0.35rem' }} value={fechaLiquidacion} readOnly />
        </label>
      </div>

      {!enTransito.length ? (
        <p className="muted" style={{ marginTop: '1rem' }}>Sin movimientos en tránsito para este recolector.</p>
      ) : (
        <>
          <div
            style={{
              marginTop: '1rem',
              padding: '0.85rem',
              borderRadius: '10px',
              background: 'rgba(13,148,136,0.08)',
              border: '1px solid rgba(13,148,136,0.25)',
            }}
          >
            <p style={{ margin: 0, fontWeight: 700 }}>Total seleccionado: {fmtMonto(totalSeleccionado)}</p>
            <p className="muted" style={{ margin: '0.25rem 0 0', fontSize: '0.85rem' }}>
              {seleccionados.length} de {enTransito.length} movimiento(s) · Mercancía {fmtMonto(resumenSel.mercancia)} · Servicios{' '}
              {fmtMonto(resumenSel.servicios)}
            </p>
          </div>

          {agrupado.map(({ tienda, dias, totalTienda }) => {
            const itemsTienda = dias.flatMap((d) => d.items);
            const selTienda = itemsTienda.filter((m) => selIds[m.id]).length;
            const todosTienda = selTienda === itemsTienda.length;

            return (
              <div key={tienda} className="card" style={{ marginTop: '1rem', padding: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <h4 style={{ margin: 0, color: 'var(--brand-blue)' }}>
                    {tienda} · {fmtMonto(totalTienda)} total
                  </h4>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={todosTienda} onChange={(e) => toggleTienda(dias, e.target.checked)} />
                    Toda la tienda ({selTienda}/{itemsTienda.length})
                  </label>
                </div>

                {dias.map(({ dia, items, total, etiqueta }) => {
                  const estado = diaEstado(items);
                  const esHoy = dia === new Date().toLocaleDateString('en-CA', { timeZone: 'America/Hermosillo' });
                  const selDia = items.filter((m) => selIds[m.id]).length;

                  return (
                    <div
                      key={dia}
                      style={{
                        marginTop: '0.75rem',
                        padding: '0.65rem',
                        borderRadius: '8px',
                        border: `1px solid ${estado === 'none' ? 'var(--border)' : 'rgba(13,148,136,0.35)'}`,
                        background: estado === 'none' ? 'transparent' : 'rgba(13,148,136,0.04)',
                      }}
                    >
                      <label
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          marginBottom: '0.35rem',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={estado === 'all'}
                          ref={(el) => {
                            if (el) el.indeterminate = estado === 'partial';
                          }}
                          onChange={(e) => toggleDia(items, e.target.checked)}
                        />
                        <span>
                          {etiqueta}
                          {!esHoy && <span style={{ color: 'var(--brand-gold)', marginLeft: '0.35rem', fontSize: '0.8rem' }}>(día anterior)</span>}
                        </span>
                        <span className="muted" style={{ fontWeight: 400, fontSize: '0.85rem', marginLeft: 'auto' }}>
                          {selDia}/{items.length} · {fmtMonto(total)}
                        </span>
                      </label>

                      {items.map((m) => (
                        <label
                          key={m.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.65rem',
                            padding: '0.4rem 0 0.4rem 1.5rem',
                            borderTop: '1px solid var(--border)',
                            cursor: 'pointer',
                            fontSize: '0.9rem',
                          }}
                        >
                          <input type="checkbox" checked={Boolean(selIds[m.id])} onChange={(e) => toggleId(m.id, e.target.checked)} />
                          <span style={{ flex: 1 }}>
                            <strong>{m.num_traspaso}</strong>
                            <span className="muted" style={{ marginLeft: '0.5rem', fontSize: '0.78rem' }}>
                              {etiquetaTipo(m)} · {fmtFechaHora(m.fecha_hora)}
                            </span>
                            {m.cajero_nombre && (
                              <span className="muted" style={{ display: 'block', fontSize: '0.75rem' }}>
                                Cajero: {m.cajero_nombre}
                              </span>
                            )}
                          </span>
                          <strong>{fmtMonto(m.monto)}</strong>
                        </label>
                      ))}
                    </div>
                  );
                })}
              </div>
            );
          })}

          <button type="button" className="btn btn-danger" style={{ marginTop: '1rem' }} disabled={guardando || totalSeleccionado <= 0} onClick={confirmarLiquidacion}>
            {guardando ? 'Sellando…' : `Sellar liquidación · ${fmtMonto(totalSeleccionado)}`}
          </button>
        </>
      )}
    </>
  );

  if (embedded) {
    return <div className="card">{inner}</div>;
  }

  return (
    <div className="card" id="liquidacion-recolecciones" style={{ borderTop: '4px solid #0d9488' }}>
      {inner}
    </div>
  );
}
