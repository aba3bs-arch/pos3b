import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { fmtMonto } from '../lib/consultasUi.js';
import {
  cobrosDelRegistro,
  listarRegistroClientesExt,
  planCobroClienteExt,
  registrarCobroClienteExt,
} from '../lib/rcClientesExt.js';

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

function esCreditoCobrar(ticket) {
  return (ticket?.origen === 'venta' || ticket?.origen === 'cargo') && Number(ticket?.pendiente) > 0;
}

const campo = {
  width: '100%',
  boxSizing: 'border-box',
  fontSize: '16px',
  minHeight: 44,
};

export default function RcClientesExt({ supabase, user, onVolver }) {
  const [registro, setRegistro] = useState(null);
  const [aviso, setAviso] = useState('');
  const [abierto, setAbierto] = useState('');
  const [ticket, setTicket] = useState('');
  const [pestana, setPestana] = useState('registro');
  const [clienteClave, setClienteClave] = useState('');
  const [marcados, setMarcados] = useState([]);
  const [monto, setMonto] = useState('');
  const [nota, setNota] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    const res = await listarRegistroClientesExt(supabase);
    setRegistro(res.registro);
    setAviso(res.ok ? '' : (res.error || 'No se pudo leer el registro.'));
    return res.registro;
  }, [supabase]);

  useEffect(() => {
    void cargar();
    const t = setInterval(() => { if (!document.hidden) void cargar(); }, 20000);
    return () => clearInterval(t);
  }, [cargar]);

  const totales = registro?.totales || { efectivo: 0, credito: 0, cobrado: 0, pendiente: 0 };
  const clientes = registro?.clientes || [];
  const porCobrar = useMemo(
    () => clientes
      .map((c) => ({ ...c, tickets: (c.tickets || []).filter(esCreditoCobrar) }))
      .filter((c) => c.tickets.length > 0),
    [clientes],
  );
  const clienteCobro = porCobrar.find((c) => c.clave === clienteClave) || null;
  const ticketsMarcados = (clienteCobro?.tickets || []).filter((t) => marcados.includes(t.id));
  const pendienteMarcado = ticketsMarcados.reduce((s, t) => s + (Number(t.pendiente) || 0), 0);
  const cobros = useMemo(() => cobrosDelRegistro(registro), [registro]);

  const elegirCliente = (clave) => {
    const elegido = porCobrar.find((c) => c.clave === clave);
    const ids = (elegido?.tickets || []).map((t) => t.id);
    const suma = (elegido?.tickets || []).reduce((s, t) => s + (Number(t.pendiente) || 0), 0);
    setClienteClave(clave);
    setMarcados(ids);
    setMonto(suma > 0 ? String(Math.round(suma * 100) / 100) : '');
    setNota('');
    setMensaje('');
  };

  const alternarTicket = (id) => {
    const base = clienteCobro?.tickets || [];
    const next = marcados.includes(id) ? marcados.filter((x) => x !== id) : [...marcados, id];
    const suma = base.filter((t) => next.includes(t.id)).reduce((s, t) => s + (Number(t.pendiente) || 0), 0);
    setMarcados(next);
    setMonto(suma > 0 ? String(Math.round(suma * 100) / 100) : '');
  };

  const registrarCobro = async () => {
    if (guardando || !clienteCobro) return;
    const plan = planCobroClienteExt(ticketsMarcados, monto);
    if (!plan.ok) {
      setMensaje(plan.error);
      return;
    }
    const detalle = plan.partes.map((p) => `${p.folio || 'Sin folio'} ${fmtMonto(p.monto)}${p.parcial ? ' (abono)' : ''}`).join('\n');
    if (!window.confirm(`¿Registrar cobro de ${fmtMonto(plan.montoAplicado)} de ${clienteCobro.nombre}?\n\n${detalle}`)) return;
    setGuardando(true);
    setMensaje('');
    const res = await registrarCobroClienteExt(supabase, {
      ticketIds: ticketsMarcados.map((t) => t.id),
      monto: plan.montoAplicado,
      nota,
      usuarioNombre: user?.nombre || '',
    });
    setGuardando(false);
    if (!res.ok) {
      setMensaje(res.error || 'No se registró el cobro.');
      if (res.aplicados?.length) await cargar();
      return;
    }
    setNota('');
    setMensaje(`Cobro registrado: ${fmtMonto(res.monto)} de ${res.cliente}.`);
    const fresco = await cargar();
    const elegido = (fresco?.clientes || []).find((c) => c.clave === clienteCobro.clave);
    const siguientes = (elegido?.tickets || []).filter(esCreditoCobrar);
    setMarcados(siguientes.map((t) => t.id));
    const suma = siguientes.reduce((s, t) => s + (Number(t.pendiente) || 0), 0);
    setMonto(suma > 0 ? String(Math.round(suma * 100) / 100) : '');
  };

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
        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
          <button
            type="button"
            className={`btn ${pestana === 'registro' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ minHeight: 44 }}
            onClick={() => setPestana('registro')}
          >
            Registro
          </button>
          <button
            type="button"
            className={`btn ${pestana === 'cobro' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ minHeight: 44 }}
            onClick={() => setPestana('cobro')}
          >
            Cobro
          </button>
        </div>
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
      {pestana === 'cobro' && (
        <div style={{ display: 'grid', gap: '0.85rem' }}>
          <div className="card" style={{ borderTop: `4px solid ${COLOR}`, display: 'grid', gap: '0.75rem' }}>
            <strong style={{ color: COLOR }}>Cobrar crédito</strong>
            <p className="muted" style={{ margin: 0, fontSize: '0.82rem' }}>
              Anota un abono o el cobro completo. Queda en este registro y no se carga al corte de la sucursal.
            </p>
            {porCobrar.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>No hay créditos pendientes de clientes externos.</p>
            ) : (
              <>
                <label style={{ display: 'grid', gap: 4, fontSize: '0.85rem' }}>
                  Cliente
                  <select
                    className="input"
                    style={campo}
                    value={clienteClave}
                    onChange={(e) => elegirCliente(e.target.value)}
                  >
                    <option value="">Elige un cliente</option>
                    {porCobrar.map((c) => (
                      <option key={c.clave} value={c.clave}>
                        {c.nombre} · pendiente {fmtMonto(c.pendiente)}
                      </option>
                    ))}
                  </select>
                </label>
                {clienteCobro && (
                  <div style={{ display: 'grid', gap: '0.45rem' }}>
                    {clienteCobro.tickets.map((t) => {
                      const marcado = marcados.includes(t.id);
                      return (
                        <label
                          key={t.id}
                          style={{
                            display: 'flex',
                            gap: '0.65rem',
                            alignItems: 'center',
                            minHeight: 44,
                            padding: '0.35rem 0',
                            borderTop: '1px solid var(--border, #e5e7eb)',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={marcado}
                            onChange={() => alternarTicket(t.id)}
                            style={{ width: 22, height: 22, flexShrink: 0 }}
                          />
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <strong>{t.folio || 'Sin folio'}</strong>
                            <span className="muted" style={{ display: 'block', fontSize: '0.78rem' }}>{fecha(t.fecha)}</span>
                          </span>
                          <strong>{fmtMonto(t.pendiente)}</strong>
                        </label>
                      );
                    })}
                    <label style={{ display: 'grid', gap: 4, fontSize: '0.85rem' }}>
                      Monto cobrado
                      <input
                        className="input"
                        inputMode="decimal"
                        style={campo}
                        value={monto}
                        onChange={(e) => setMonto(e.target.value)}
                        placeholder="0.00"
                      />
                    </label>
                    <p className="muted" style={{ margin: 0, fontSize: '0.78rem' }}>
                      Pendiente marcado {fmtMonto(pendienteMarcado)}. Si el monto es menor, se abona del crédito más antiguo.
                    </p>
                    <label style={{ display: 'grid', gap: 4, fontSize: '0.85rem' }}>
                      Nota
                      <input
                        className="input"
                        style={campo}
                        value={nota}
                        onChange={(e) => setNota(e.target.value)}
                        placeholder="Abono o crédito cobrado"
                        maxLength={120}
                      />
                    </label>
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{ minHeight: 44 }}
                      disabled={guardando || !ticketsMarcados.length}
                      onClick={() => { void registrarCobro(); }}
                    >
                      {guardando ? 'Guardando…' : 'Registrar cobro'}
                    </button>
                  </div>
                )}
              </>
            )}
            {mensaje && <p style={{ margin: 0 }}>{mensaje}</p>}
          </div>
          <div className="card" style={{ display: 'grid', gap: '0.55rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'baseline' }}>
              <strong style={{ color: COLOR }}>Créditos cobrados</strong>
              <strong>{fmtMonto(totales.cobrado)}</strong>
            </div>
            {cobros.length === 0 && (
              <p className="muted" style={{ margin: 0 }}>Todavía no hay abonos ni créditos cobrados.</p>
            )}
            {cobros.map((c) => (
              <div key={`${c.id}-${c.folio}-${c.fecha}`} style={{ borderTop: '1px solid var(--border, #e5e7eb)', paddingTop: '0.45rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
                  <strong>{c.cliente}</strong>
                  <strong>{fmtMonto(c.monto)}</strong>
                </div>
                <p className="muted" style={{ margin: '0.15rem 0 0', fontSize: '0.78rem' }}>
                  {c.nota}{c.folio ? ` · ${c.folio}` : ''}{c.fecha ? ` · ${fecha(c.fecha)}` : ''}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
      {pestana === 'registro' && clientes.length === 0 && (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>Todavía no hay crédito ni cobros de clientes externos.</p>
        </div>
      )}
      {pestana === 'registro' && clientes.map((cliente) => {
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
