import React, { useCallback, useEffect, useState } from 'react';
import { listarMovimientosCxc, saldosCxcPorCliente } from '../lib/rutaCxc.js';
import { fmtMonto } from '../lib/consultasUi.js';

/** Contabilidad → Crédito: cartera por cobrar (consulta). El pago es en Cobranza con PIN. */
export default function CreditoRuta({ supabase }) {
  const [saldos, setSaldos] = useState([]);
  const [movs, setMovs] = useState([]);
  const [aviso, setAviso] = useState('');
  const [sel, setSel] = useState(null);

  const cargar = useCallback(async () => {
    const s = await saldosCxcPorCliente(supabase);
    if (s.aviso) setAviso(s.aviso);
    setSaldos((s.data || []).filter((r) => r.saldo > 0.009));
  }, [supabase]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  useEffect(() => {
    if (!sel) {
      setMovs([]);
      return;
    }
    void listarMovimientosCxc(supabase, {
      clienteTipo: sel.cliente_tipo,
      clienteId: sel.cliente_id,
      limit: 40,
    }).then((r) => setMovs(r.data || []));
  }, [supabase, sel]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <h2 style={{ margin: 0, color: '#0f766e' }}>Crédito · ruta</h2>
        <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.85rem' }}>
          Cartera por cobrar de Venta en Ruta. El cajero liquida en Cobranza con PIN (gasto «credito liquidado» + tránsito).
        </p>
      </div>
      {aviso && <div className="card" style={{ borderLeft: '4px solid var(--brand-gold)' }}>{aviso}</div>}
      <div className="card" style={{ borderTop: '4px solid #0f766e' }}>
        {saldos.length === 0 ? (
          <p className="muted">Sin saldos pendientes.</p>
        ) : (
          <table className="consultas-table">
            <thead>
              <tr>
                <th>Cliente / sucursal</th>
                <th>Saldo</th>
              </tr>
            </thead>
            <tbody>
              {saldos.map((s) => (
                <tr
                  key={`${s.cliente_tipo}:${s.cliente_id}`}
                  style={{ cursor: 'pointer', background: sel?.cliente_id === s.cliente_id ? 'rgba(15,118,110,0.08)' : undefined }}
                  onClick={() => setSel(s)}
                >
                  <td>
                    <strong>{s.cliente_nombre}</strong>
                    <div className="muted" style={{ fontSize: '0.72rem' }}>{s.cliente_tipo}</div>
                  </td>
                  <td style={{ fontWeight: 700, color: '#b45309' }}>{fmtMonto(s.saldo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {movs.length > 0 && (
          <>
            <h4 style={{ margin: '1rem 0 0.35rem', fontSize: '0.9rem' }}>Movimientos</h4>
            <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.85rem' }}>
              {movs.map((m) => (
                <li key={m.id}>
                  {String(m.created_at || '').slice(0, 10)} · {m.tipo} · {fmtMonto(m.monto)}
                  {m.folio_venta ? ` · ${m.folio_venta}` : ''}
                  {m.estatus ? ` · ${m.estatus}` : ''}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
