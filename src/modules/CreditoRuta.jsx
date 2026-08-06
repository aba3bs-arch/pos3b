import React, { useCallback, useEffect, useState } from 'react';
import { listarMovimientosCxc, saldosCxcPorCliente } from '../lib/rutaCxc.js';
import { fmtMonto } from '../lib/consultasUi.js';

/** Contabilidad → Crédito: cartera por cobrar de Venta en Ruta. */
export default function CreditoRuta({ supabase }) {
  const [saldos, setSaldos] = useState([]);
  const [sel, setSel] = useState(null);
  const [movs, setMovs] = useState([]);
  const [aviso, setAviso] = useState('');

  const cargar = useCallback(async () => {
    const r = await saldosCxcPorCliente(supabase);
    if (r.aviso) setAviso(r.aviso);
    setSaldos(r.data || []);
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
      limit: 80,
    }).then((r) => setMovs(r.data || []));
  }, [supabase, sel]);

  const totalCartera = saldos.reduce((s, r) => s + (Number(r.saldo) || 0), 0);
  const conSaldo = saldos.filter((r) => r.saldo > 0.009);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <h2 style={{ margin: 0, color: '#b45309' }}>Crédito</h2>
        <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.85rem' }}>
          Cuentas por cobrar de Venta en Ruta (cargos por ventas a crédito). La cobranza se registra en el subcomando Cobranza.
        </p>
      </div>
      {aviso && <div className="card" style={{ borderLeft: '4px solid var(--brand-gold)' }}>{aviso}</div>}
      <div className="card" style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
        <div>
          <div className="muted" style={{ fontSize: '0.75rem' }}>Cartera total</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#b45309' }}>{fmtMonto(totalCartera)}</div>
        </div>
        <div>
          <div className="muted" style={{ fontSize: '0.75rem' }}>Clientes / sucursales con saldo</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{conSaldo.length}</div>
        </div>
      </div>
      <div className="card">
        <h4 style={{ margin: '0 0 0.5rem' }}>Saldos</h4>
        {conSaldo.length === 0 ? (
          <p className="muted">Sin créditos pendientes.</p>
        ) : (
          <table className="consultas-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Tipo</th>
                <th>Cargos</th>
                <th>Abonos</th>
                <th>Saldo</th>
              </tr>
            </thead>
            <tbody>
              {conSaldo.map((r) => (
                <tr
                  key={`${r.cliente_tipo}:${r.cliente_id}`}
                  onClick={() => setSel(r)}
                  style={{ cursor: 'pointer', background: sel?.cliente_id === r.cliente_id && sel?.cliente_tipo === r.cliente_tipo ? 'rgba(180,83,9,0.08)' : undefined }}
                >
                  <td style={{ fontWeight: 600 }}>{r.cliente_nombre}</td>
                  <td>{r.cliente_tipo === 'externo' ? 'Externo' : 'Sucursal'}</td>
                  <td>{fmtMonto(r.cargos)}</td>
                  <td>{fmtMonto(r.abonos)}</td>
                  <td style={{ fontWeight: 700, color: '#b45309' }}>{fmtMonto(r.saldo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {sel && (
        <div className="card">
          <h4 style={{ margin: '0 0 0.5rem' }}>Detalle · {sel.cliente_nombre}</h4>
          <table className="consultas-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Monto</th>
                <th>Saldo</th>
                <th>Nota</th>
              </tr>
            </thead>
            <tbody>
              {movs.map((m) => (
                <tr key={m.id}>
                  <td style={{ fontSize: '0.75rem' }}>{String(m.created_at || '').slice(0, 16).replace('T', ' ')}</td>
                  <td>{m.tipo}{m.metodo_pago ? ` · ${m.metodo_pago}` : ''}</td>
                  <td style={{ fontWeight: 600 }}>{fmtMonto(m.monto)}</td>
                  <td>{fmtMonto(m.saldo_despues)}</td>
                  <td className="muted" style={{ fontSize: '0.75rem' }}>{m.notas || m.venta_id || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
