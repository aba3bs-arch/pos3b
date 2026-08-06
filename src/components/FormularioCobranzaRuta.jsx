import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { listarClientesRuta, listarDestinosVentaRuta } from '../lib/ventaEnRuta.js';
import { listarMovimientosCxc, registrarAbonoCobranzaRuta, saldosCxcPorCliente } from '../lib/rutaCxc.js';
import { fmtMonto } from '../lib/consultasUi.js';

/**
 * Formulario para que el repartidor CEDIS cobre créditos por cobrar.
 */
export default function FormularioCobranzaRuta({ supabase, user, onAviso, onCobrado }) {
  const [saldos, setSaldos] = useState([]);
  const [clientesExt, setClientesExt] = useState([]);
  const [clienteKey, setClienteKey] = useState('');
  const [monto, setMonto] = useState('');
  const [metodo, setMetodo] = useState('efectivo');
  const [notas, setNotas] = useState('');
  const [hist, setHist] = useState([]);
  const [guardando, setGuardando] = useState(false);

  const destinos = useMemo(() => listarDestinosVentaRuta(clientesExt), [clientesExt]);

  const cargar = useCallback(async () => {
    const [s, c] = await Promise.all([
      saldosCxcPorCliente(supabase),
      listarClientesRuta(supabase),
    ]);
    if (s.aviso || c.aviso) onAviso?.(s.aviso || c.aviso);
    setSaldos((s.data || []).filter((r) => r.saldo > 0.009));
    setClientesExt(c.data || []);
  }, [supabase, onAviso]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  useEffect(() => {
    if (!clienteKey) {
      setHist([]);
      return;
    }
    const [tipo, ...rest] = clienteKey.split(':');
    const id = rest.join(':');
    void listarMovimientosCxc(supabase, { clienteTipo: tipo, clienteId: id, limit: 40 }).then((r) => {
      setHist(r.data || []);
    });
  }, [supabase, clienteKey]);

  const saldoSel = useMemo(() => {
    if (!clienteKey) return 0;
    const [tipo, ...rest] = clienteKey.split(':');
    const id = rest.join(':');
    const row = saldos.find((s) => String(s.cliente_tipo) === tipo && String(s.cliente_id) === id);
    return Number(row?.saldo) || 0;
  }, [clienteKey, saldos]);

  const cobrar = async () => {
    if (!clienteKey) return alert('Elige sucursal o cliente con crédito.');
    const m = Number(monto);
    if (!(m > 0)) return alert('Indica el monto a cobrar.');
    const [tipo, ...rest] = clienteKey.split(':');
    const id = rest.join(':');
    const dest = destinos.find((d) => d.tipo === tipo && String(d.id) === id);
    const nombre = dest?.nombre || saldos.find((s) => String(s.cliente_id) === id)?.cliente_nombre || id;
    if (!confirm(`¿Registrar cobro de ${fmtMonto(m)} (${metodo}) a ${nombre}?`)) return;
    setGuardando(true);
    const r = await registrarAbonoCobranzaRuta(supabase, {
      clienteTipo: tipo,
      clienteId: id,
      clienteNombre: nombre,
      monto: m,
      metodoPago: metodo,
      notas,
      usuarioNombre: user?.nombre,
    });
    setGuardando(false);
    if (!r.ok) return alert(r.error);
    if (r.aviso) onAviso?.(r.aviso);
    alert(`Cobro registrado. Saldo queda en ${fmtMonto(r.data?.saldo_despues)}.`);
    setMonto('');
    setNotas('');
    await cargar();
    onCobrado?.(r.data);
  };

  const conDeuda = useMemo(() => {
    const keys = new Set(saldos.map((s) => `${s.cliente_tipo}:${s.cliente_id}`));
    return destinos.filter((d) => keys.has(`${d.tipo}:${d.id}`));
  }, [destinos, saldos]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      <p className="muted" style={{ margin: 0, fontSize: '0.82rem' }}>
        Cobra créditos generados en Venta en Ruta. El saldo vive en Contabilidad → Crédito / Cobranza.
      </p>

      {saldos.length === 0 ? (
        <p className="muted">No hay créditos pendientes por cobrar.</p>
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
                style={{ cursor: 'pointer', background: clienteKey === `${s.cliente_tipo}:${s.cliente_id}` ? 'rgba(15,118,110,0.08)' : undefined }}
                onClick={() => setClienteKey(`${s.cliente_tipo}:${s.cliente_id}`)}
              >
                <td>
                  <strong>{s.cliente_nombre}</strong>
                  <div className="muted" style={{ fontSize: '0.72rem' }}>
                    {s.cliente_tipo === 'externo' ? 'Externo' : 'Sucursal propia'}
                  </div>
                </td>
                <td style={{ fontWeight: 700, color: '#b45309' }}>{fmtMonto(s.saldo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div style={{ display: 'grid', gap: '0.5rem', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
        <label style={{ fontSize: '0.8rem' }}>
          Cobrar a
          <select className="input" value={clienteKey} onChange={(e) => setClienteKey(e.target.value)}>
            <option value="">— Elige —</option>
            {conDeuda.map((d) => (
              <option key={`${d.tipo}:${d.id}`} value={`${d.tipo}:${d.id}`}>
                {d.nombre}{d.propio ? '' : ' (ext)'}
              </option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: '0.8rem' }}>
          Saldo
          <input className="input" readOnly value={fmtMonto(saldoSel)} />
        </label>
        <label style={{ fontSize: '0.8rem' }}>
          Monto a cobrar
          <input className="input" type="number" step="0.01" min="0" value={monto} onChange={(e) => setMonto(e.target.value)} />
        </label>
        <label style={{ fontSize: '0.8rem' }}>
          Forma de cobro
          <select className="input" value={metodo} onChange={(e) => setMetodo(e.target.value)}>
            <option value="efectivo">Efectivo</option>
            <option value="transferencia">Transferencia</option>
            <option value="otro">Otro</option>
          </select>
        </label>
      </div>
      <label style={{ fontSize: '0.8rem' }}>
        Notas
        <input className="input" value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Opcional" />
      </label>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={!saldoSel}
          onClick={() => setMonto(String(saldoSel))}
        >
          Cobrar saldo completo
        </button>
        <button type="button" className="btn btn-primary" disabled={guardando || !clienteKey} onClick={() => void cobrar()}>
          {guardando ? 'Guardando…' : 'Registrar cobro'}
        </button>
      </div>

      {hist.length > 0 && (
        <div>
          <h4 style={{ margin: '0.5rem 0', fontSize: '0.9rem' }}>Movimientos recientes</h4>
          <table className="consultas-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Monto</th>
                <th>Saldo</th>
              </tr>
            </thead>
            <tbody>
              {hist.slice(0, 12).map((m) => (
                <tr key={m.id}>
                  <td style={{ fontSize: '0.75rem' }}>{String(m.created_at || '').slice(0, 16).replace('T', ' ')}</td>
                  <td>{m.tipo}{m.metodo_pago ? ` · ${m.metodo_pago}` : ''}</td>
                  <td style={{ fontWeight: 600 }}>{fmtMonto(m.monto)}</td>
                  <td>{fmtMonto(m.saldo_despues)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
