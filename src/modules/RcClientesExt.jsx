import React, { useCallback, useEffect, useState } from 'react';
import { fmtMonto } from '../lib/consultasUi.js';
import { listarRegistroClientesExt } from '../lib/rcClientesExt.js';

const COLOR = '#0f766e';

function fecha(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('es-MX', {
    timeZone: 'America/Phoenix',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function Cifra({ label, valor, color }) {
  return (
    <div>
      <p className="muted" style={{ margin: 0, fontSize: '0.78rem' }}>{label}</p>
      <strong style={{ color }}>{fmtMonto(valor)}</strong>
    </div>
  );
}

export default function RcClientesExt({ supabase, onVolver }) {
  const [registro, setRegistro] = useState(null);
  const [aviso, setAviso] = useState('');
  const [abierto, setAbierto] = useState('');
  const [ticket, setTicket] = useState('');

  const cargar = useCallback(async () => {
    const res = await listarRegistroClientesExt(supabase);
    setRegistro(res.registro);
    setAviso(res.ok ? '' : (res.error || 'No se pudo leer el registro.'));
  }, [supabase]);

  useEffect(() => {
    void cargar();
    const t = setInterval(() => { if (!document.hidden) void cargar(); }, 20000);
    return () => clearInterval(t);
  }, [cargar]);

  const totales = registro?.totales || { efectivo: 0, credito: 0, cobrado: 0, pendiente: 0 };
  const clientes = registro?.clientes || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      <div>
        <button type="button" className="btn btn-ghost" onClick={onVolver}>← Venta en ruta</button>
      </div>
      <div className="card" style={{ borderTop: `4px solid ${COLOR}` }}>
        <h3 style={{ margin: 0, color: COLOR }}>RC/Clientes ext.</h3>
        <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.85rem' }}>
          Registro de lo que se deja a crédito a clientes externos y de lo que se cobra después.
          El inventario sigue en el camión, el mismo de las sucursales.
        </p>
      </div>
      {aviso && (
        <div className="card" style={{ borderLeft: '4px solid #b45309' }}>
          <p style={{ margin: 0 }}>{aviso}</p>
        </div>
      )}
      <div className="card" style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap' }}>
        <Cifra label="Efectivo" valor={totales.efectivo} />
        <Cifra label="Dejado a crédito" valor={totales.credito} color={COLOR} />
        <Cifra label="Cobrado" valor={totales.cobrado} />
        <Cifra label="Pendiente" valor={totales.pendiente} color={COLOR} />
      </div>
      {clientes.length === 0 && (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>Todavía no hay crédito ni cobros de clientes externos.</p>
        </div>
      )}
      {clientes.map((cliente) => {
        const abiertoCliente = abierto === cliente.clave;
        return (
          <div key={cliente.clave} className="card" style={{ borderTop: `4px solid ${COLOR}`, display: 'grid', gap: '0.65rem' }}>
            <button
              type="button"
              onClick={() => { setAbierto(abiertoCliente ? '' : cliente.clave); setTicket(''); }}
              style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', background: 'transparent', border: 0, padding: 0, cursor: 'pointer', textAlign: 'left' }}
            >
              <strong style={{ color: COLOR }}>{cliente.nombre}</strong>
              <span className="muted">{abiertoCliente ? 'Ocultar' : 'Ver'}</span>
            </button>
            <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap' }}>
              <Cifra label="Efectivo" valor={cliente.efectivo} />
              <Cifra label="Crédito" valor={cliente.credito} />
              <Cifra label="Cobrado" valor={cliente.cobrado} />
              <Cifra label="Pendiente" valor={cliente.pendiente} color={COLOR} />
            </div>
            {abiertoCliente && cliente.tickets.map((t) => {
              const abiertoTicket = ticket === t.id;
              return (
                <div key={t.id} style={{ borderTop: '1px solid var(--border, #e5e7eb)', paddingTop: '0.55rem' }}>
                  <button
                    type="button"
                    onClick={() => setTicket(abiertoTicket ? '' : t.id)}
                    style={{ width: '100%', display: 'flex', justifyContent: 'space-between', gap: '0.75rem', background: 'transparent', border: 0, padding: 0, cursor: 'pointer', textAlign: 'left' }}
                  >
                    <span>
                      <strong>{t.folio || 'Sin folio'}</strong>
                      <span className="muted" style={{ marginLeft: 8, fontSize: '0.8rem' }}>{fecha(t.fecha)}</span>
                    </span>
                    <span>
                      <strong>{fmtMonto(t.credito || t.cobrado)}</strong>
                      <span className="muted" style={{ marginLeft: 8, fontSize: '0.78rem' }}>{abiertoTicket ? 'Ocultar' : 'Ver'}</span>
                    </span>
                  </button>
                  <p className="muted" style={{ margin: '0.2rem 0 0', fontSize: '0.78rem' }}>
                    Crédito {fmtMonto(t.credito)} · cobrado {fmtMonto(t.cobrado)} · pendiente {fmtMonto(t.pendiente)}
                  </p>
                  {abiertoTicket && t.cobros.map((c) => (
                    <p key={c.id || `${t.id}-${c.fecha}`} style={{ margin: '0.25rem 0 0', fontSize: '0.85rem' }}>
                      {c.nota} · {fmtMonto(c.monto)}
                      {c.fecha ? <span className="muted"> · {fecha(c.fecha)}</span> : null}
                    </p>
                  ))}
                  {abiertoTicket && t.cobros.length === 0 && (
                    <p className="muted" style={{ margin: '0.25rem 0 0', fontSize: '0.8rem' }}>Sin cobros.</p>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
