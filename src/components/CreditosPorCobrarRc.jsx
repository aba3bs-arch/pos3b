import React, { useEffect, useMemo, useState } from 'react';
import { fmtMonto } from '../lib/controlEfectivo.js';
import { esCargoPendienteCxc, listarMovimientosCxc, saldosCxcPorCliente } from '../lib/rutaCxc.js';

function fechaCorta(valor) {
  if (!valor) return '—';
  const d = new Date(valor);
  if (!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleString('es-MX', {
    timeZone: 'America/Hermosillo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** RC / Créditos por cobrar, con folios y abonos de ruta_cxc_movimientos. */
export default function CreditosPorCobrarRc({ supabase, onCerrar }) {
  const [saldos, setSaldos] = useState([]);
  const [movs, setMovs] = useState([]);
  const [tienda, setTienda] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const [s, m] = await Promise.all([
        saldosCxcPorCliente(supabase),
        listarMovimientosCxc(supabase, { todos: true }),
      ]);
      if (!vivo) return;
      if (s.error || m.error) setError(s.error || m.error || 'No se pudieron leer los créditos.');
      const filas = (s.data || []).filter((r) => Number(r.saldo) > 0 || Number(r.abonos) > 0);
      setSaldos(filas);
      setMovs(m.data || []);
      setTienda(filas[0]?.cliente_id || null);
    })();
    return () => {
      vivo = false;
    };
  }, [supabase]);

  const elegida = saldos.find((r) => String(r.cliente_id) === String(tienda)) || null;
  const folios = useMemo(() => {
    if (!elegida) return [];
    return movs.filter((m) => (
      String(m.cliente_id) === String(elegida.cliente_id)
      && m.tipo === 'cargo'
    ));
  }, [movs, elegida]);
  const porPagar = saldos.reduce((s, r) => s + (Number(r.cargos) || 0), 0);
  const abonos = saldos.reduce((s, r) => s + (Number(r.abonos) || 0), 0);
  const actual = saldos.reduce((s, r) => s + (Number(r.saldo) || 0), 0);

  return (
    <div style={{ marginBottom: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
        <strong style={{ color: '#1d4ed8', fontSize: '1.05rem' }}>RC / Créditos por cobrar</strong>
        <button type="button" className="btn btn-ghost" onClick={onCerrar}>Volver al camión</button>
      </div>
      {error ? <p style={{ color: 'var(--brand-red)' }}>{error}</p> : null}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.45rem', margin: '0.6rem 0' }}>
        <Caja titulo="Crédito por pagar" valor={fmtMonto(porPagar)} fondo="#f59e0b" />
        <Caja titulo="Abonos recibidos" valor={fmtMonto(abonos)} fondo="#15803d" />
        <Caja titulo="Crédito actualizado" valor={fmtMonto(actual)} fondo="#1d4ed8" />
      </div>
      <p className="muted" style={{ fontSize: '0.78rem' }}>{saldos.length} tiendas con crédito. Toca una tienda para ver sus folios.</p>
      <div style={{ overflowX: 'auto' }}>
        <table className="data" style={{ fontSize: '0.8rem' }}>
          <thead>
            <tr>
              <th>Tienda</th>
              <th>Crédito por pagar</th>
              <th>Abono</th>
              <th>Crédito actualizado</th>
            </tr>
          </thead>
          <tbody>
            {saldos.map((r) => (
              <tr
                key={r.cliente_id}
                onClick={() => setTienda(r.cliente_id)}
                style={{ cursor: 'pointer', background: String(tienda) === String(r.cliente_id) ? '#eff6ff' : undefined }}
              >
                <td style={{ fontWeight: 800 }}>{r.cliente_nombre || r.cliente_id}</td>
                <td>{fmtMonto(r.cargos)}</td>
                <td style={{ color: '#15803d' }}>{fmtMonto(r.abonos)}</td>
                <td>{fmtMonto(r.saldo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {elegida ? (
        <div style={{ marginTop: '0.7rem' }}>
          <strong>{elegida.cliente_nombre || elegida.cliente_id}</strong>
          <div className="muted" style={{ fontSize: '0.75rem', marginBottom: '0.35rem' }}>
            Folios pendientes: {folios.filter(esCargoPendienteCxc).length} · Actualizado {fmtMonto(elegida.saldo)}
          </div>
          <table className="data" style={{ fontSize: '0.78rem' }}>
            <thead>
              <tr><th>Folio</th><th>Fecha</th><th>Importe</th><th>Estado</th></tr>
            </thead>
            <tbody>
              {folios.slice(0, 25).map((m) => (
                <tr key={m.id}>
                  <td>{m.folio_venta || m.notas || m.id}</td>
                  <td>{fechaCorta(m.created_at)}</td>
                  <td>{fmtMonto(m.monto)}</td>
                  <td>{esCargoPendienteCxc(m) ? 'Pendiente' : (m.estatus || '—')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted" style={{ fontSize: '0.75rem' }}>
            El abono se registra en Cobranza, con el PIN del cajero. Aquí se ve el estado que ya está guardado.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function Caja({ titulo, valor, fondo }) {
  return (
    <div style={{ background: fondo, color: '#fff', borderRadius: 10, padding: '0.55rem 0.65rem' }}>
      <div style={{ fontSize: '0.72rem', fontWeight: 700 }}>{titulo}</div>
      <div style={{ fontSize: '1.05rem', fontWeight: 900 }}>{valor}</div>
    </div>
  );
}
