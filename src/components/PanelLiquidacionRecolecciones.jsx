import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { normalizarRol } from '../lib/roles.js';
import {
  fmtMonto,
  liquidarMovimientos,
  listarAlertasRecoleccion,
  listarEnTransitoPorRepartidor,
  listarRepartidores,
  marcarAlertaVista,
} from '../lib/controlEfectivo.js';

/** Liquidación en oficina — solo administrador (Configuración). */
export default function PanelLiquidacionRecolecciones({ supabase, user }) {
  const rol = normalizarRol(user?.rol);
  const [repartidores, setRepartidores] = useState([]);
  const [repLiq, setRepLiq] = useState('');
  const [enTransito, setEnTransito] = useState([]);
  const [alertas, setAlertas] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

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
    } catch (e) {
      setError(e.message?.includes('repartidores') ? 'Ejecuta supabase/control_efectivo.sql en Supabase.' : e.message);
    }
  }, [supabase, repLiq]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const totalEnTransito = useMemo(() => enTransito.reduce((a, m) => a + Number(m.monto || 0), 0), [enTransito]);

  const confirmarLiquidacion = async () => {
    if (!window.confirm(`¿Sellar liquidación de ${fmtMonto(totalEnTransito)} (${enTransito.length} movimiento(s))?`)) return;
    setGuardando(true);
    const repNombre = repartidores.find((r) => r.id === repLiq)?.nombre || '';
    const res = await liquidarMovimientos(supabase, {
      ids: enTransito.map((m) => m.id),
      adminNombre: user?.nombre || rol,
      repartidorNombre: repNombre,
    });
    setGuardando(false);
    if (!res.ok) return alert(res.error);
    alert(`✅ Liquidación sellada (${res.count} registros).`);
    cargar();
  };

  return (
    <div className="card" id="liquidacion-recolecciones" style={{ borderTop: '4px solid #0d9488' }}>
      <h3 style={{ margin: '0 0 0.5rem', color: 'var(--brand-blue)' }}>Liquidación de recolecciones</h3>
      <p className="muted" style={{ marginTop: 0, fontSize: '0.85rem' }}>
        Oficina central: sellar efectivo en tránsito de los recolectores. Las tiendas registran traspasos y cobros en el módulo <strong>Recolecciones</strong>.
      </p>

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

      {!enTransito.length ? (
        <p className="muted" style={{ marginTop: '1rem' }}>Sin movimientos en tránsito para este recolector.</p>
      ) : (
        <>
          <div className="table-wrap" style={{ marginTop: '1rem' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Folio</th>
                  <th>Tienda</th>
                  <th>Tipo</th>
                  <th>Monto</th>
                </tr>
              </thead>
              <tbody>
                {enTransito.map((m) => (
                  <tr key={m.id}>
                    <td>{m.num_traspaso}</td>
                    <td>{m.sucursal_origen}</td>
                    <td>{m.tipo_movimiento}</td>
                    <td>{fmtMonto(m.monto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ fontWeight: 700, marginTop: '0.75rem' }}>Total en tránsito: {fmtMonto(totalEnTransito)}</p>
          <button type="button" className="btn btn-danger" disabled={guardando} onClick={confirmarLiquidacion}>
            {guardando ? 'Sellando…' : 'Sellar liquidación'}
          </button>
        </>
      )}
    </div>
  );
}
