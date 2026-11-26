import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { fmtMonto } from '../lib/consultasUi.js';
import { entregarTicketVenta, htmlTicketVenta } from '../lib/impresion.js';
import {
  cancelarCobroClienteExt,
  cobrosDelRegistro,
  datosTicketAbarrotes,
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

function etiquetaMetodo(metodo) {
  if (metodo === 'efectivo') return 'Efectivo';
  if (metodo === 'mixto') return 'Mixto';
  if (metodo === 'credito') return 'Crédito';
  return 'Venta';
}

function HojaTicket({ ticket: t, cliente, sucursal }) {
  const html = htmlTicketVenta(datosTicketAbarrotes(t, {
    cliente: cliente || '',
    sucursal: sucursal || '',
    fecha: fecha(t?.fecha),
  }));
  return (
    <div style={{ display: 'flex', justifyContent: 'center', background: '#fff', border: '1px solid #111', padding: '0.35rem 0' }}>
      <iframe
        title={`Ticket ${t?.folio || ''}`}
        srcDoc={html}
        style={{ width: '100%', maxWidth: 380, height: 520, border: 0, background: '#fff' }}
        onLoad={(e) => {
          try {
            const doc = e.currentTarget.contentDocument;
            const alto = doc?.body?.scrollHeight || doc?.documentElement?.scrollHeight;
            if (alto > 80) e.currentTarget.style.height = `${alto + 12}px`;
          } catch {
            /* el ticket se queda con la altura inicial */
          }
        }}
      />
    </div>
  );
}

function TicketVenta({
  ticket: t,
  cliente,
  abierto,
  onToggle,
  monto,
  onMonto,
  nota,
  onNota,
  ocupado,
  onCobrar,
  onCancelar,
  sucursal,
  onImprimir,
}) {
  const total = t.total || t.credito || t.efectivo || t.cobrado;
  return (
    <div style={{ borderTop: '1px solid var(--border, #e5e7eb)', paddingTop: '0.55rem' }}>
      <button
        type="button"
        onClick={onToggle}
        style={{ width: '100%', display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', background: 'transparent', border: 0, padding: 0, cursor: 'pointer', textAlign: 'left', minHeight: 44 }}
      >
        <span style={{ minWidth: 0 }}>
          <strong>{t.folio || 'Sin folio'}</strong>
          <span className="muted" style={{ display: 'block', fontSize: '0.78rem' }}>
            {etiquetaMetodo(t.metodo)} · {fecha(t.fecha)}
          </span>
        </span>
        <span style={{ flexShrink: 0 }}>
          <strong>{fmtMonto(total)}</strong>
          <span className="muted" style={{ marginLeft: 8, fontSize: '0.78rem' }}>{abierto ? 'Ocultar' : 'Ver'}</span>
        </span>
      </button>
      {t.credito > 0 && (
        <p className="muted" style={{ margin: '0.15rem 0 0', fontSize: '0.78rem' }}>
          Cobrado {fmtMonto(t.cobrado)} · pendiente {fmtMonto(t.pendiente)}
        </p>
      )}
      {abierto && (
        <div style={{ marginTop: '0.55rem', display: 'grid', gap: '0.45rem' }}>
          <HojaTicket ticket={t} cliente={cliente?.nombre || ''} sucursal={sucursal} />
          <button type="button" className="btn btn-ghost" style={{ minHeight: 44 }} onClick={() => onImprimir(t, cliente)}>
            Imprimir ticket
          </button>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            {t.efectivo > 0 && <Cifra label="Efectivo" valor={t.efectivo} />}
            {t.credito > 0 && <Cifra label="Crédito" valor={t.credito} />}
            {t.credito > 0 && <Cifra label="Cobrado" valor={t.cobrado} />}
            {t.credito > 0 && <Cifra label="Pendiente" valor={t.pendiente} color={COLOR} />}
          </div>
          {t.credito > 0 && (t.cobros || []).map((c) => (
            <div key={c.id || `${t.id}-${c.fecha}`} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.65rem', alignItems: 'center' }}>
              <span style={{ fontSize: '0.85rem', minWidth: 0 }}>
                {c.nota} · {fmtMonto(c.monto)}
                {c.fecha ? <span className="muted"> · {fecha(c.fecha)}</span> : null}
              </span>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ minHeight: 44, color: '#b91c1c', flexShrink: 0 }}
                disabled={ocupado}
                onClick={() => onCancelar(c, cliente)}
              >
                Cancelar
              </button>
            </div>
          ))}
          {t.credito > 0 && (t.cobros || []).length === 0 && (
            <p className="muted" style={{ margin: 0, fontSize: '0.8rem' }}>Sin cobros. El crédito sigue en la deuda.</p>
          )}
          {(t.cobrosCancelados || []).map((c) => (
            <p key={`x-${c.id}`} className="muted" style={{ margin: 0, fontSize: '0.8rem' }}>
              Cancelado · {c.nota} · {fmtMonto(c.monto)}. Regresó a la deuda.
            </p>
          ))}
          {t.pendiente > 0 && (
            <div style={{ display: 'grid', gap: '0.45rem', marginTop: '0.2rem' }}>
              <label style={{ display: 'grid', gap: 4, fontSize: '0.85rem' }}>
                Abono a este ticket
                <input
                  className="input"
                  inputMode="decimal"
                  style={campo}
                  value={monto}
                  onChange={(e) => onMonto(e.target.value)}
                  placeholder="0.00"
                />
              </label>
              <p className="muted" style={{ margin: 0, fontSize: '0.78rem' }}>
                Pendiente {fmtMonto(t.pendiente)}. Un monto menor queda como abono y el resto sigue en la deuda.
              </p>
              <label style={{ display: 'grid', gap: 4, fontSize: '0.85rem' }}>
                Nota
                <input
                  className="input"
                  style={campo}
                  value={nota}
                  onChange={(e) => onNota(e.target.value)}
                  placeholder="Abono o crédito cobrado"
                  maxLength={120}
                />
              </label>
              <button
                type="button"
                className="btn btn-primary"
                style={{ minHeight: 44 }}
                disabled={ocupado || !(Number(monto) > 0)}
                onClick={() => onCobrar(t, cliente)}
              >
                {ocupado ? 'Guardando…' : 'Cobrar abono'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const campo = {
  width: '100%',
  boxSizing: 'border-box',
  fontSize: '16px',
  minHeight: 44,
};

export default function RcClientesExt({ supabase, user, sucursal, onVolver }) {
  const [registro, setRegistro] = useState(null);
  const [aviso, setAviso] = useState('');
  const [abierto, setAbierto] = useState('');
  const [ticket, setTicket] = useState('');
  const [cobroAbierto, setCobroAbierto] = useState('');
  const [pestana, setPestana] = useState('registro');
  const [clienteClave, setClienteClave] = useState('');
  const [monto, setMonto] = useState('');
  const [nota, setNota] = useState('');
  const [montoTicket, setMontoTicket] = useState('');
  const [notaTicket, setNotaTicket] = useState('');
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
  const pendienteCliente = (clienteCobro?.tickets || []).reduce((s, t) => s + (Number(t.pendiente) || 0), 0);
  const cobros = useMemo(() => cobrosDelRegistro(registro), [registro]);
  const tiendaTicket = sucursal || user?.sucursal_id || '';

  const elegirCliente = (clave) => {
    const elegido = porCobrar.find((c) => c.clave === clave);
    const suma = (elegido?.tickets || []).reduce((s, t) => s + (Number(t.pendiente) || 0), 0);
    setClienteClave(clave);
    setMonto(suma > 0 ? String(Math.round(suma * 100) / 100) : '');
    setNota('');
    setMensaje('');
    setTicket('');
  };

  const registrarCobro = async () => {
    if (guardando || !clienteCobro) return;
    const plan = planCobroClienteExt(clienteCobro.tickets, String(monto).replace(',', '.'));
    if (!plan.ok) {
      setMensaje(plan.error);
      return;
    }
    const detalle = plan.partes.map((p) => `${p.folio || 'Sin folio'} ${fmtMonto(p.monto)}${p.parcial ? ' (abono)' : ''}`).join('\n');
    if (!window.confirm(`¿Registrar cobro de ${fmtMonto(plan.montoAplicado)} de ${clienteCobro.nombre}?\n\n${detalle}`)) return;
    setGuardando(true);
    setMensaje('');
    const res = await registrarCobroClienteExt(supabase, {
      ticketIds: clienteCobro.tickets.map((t) => t.id),
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
    const suma = siguientes.reduce((s, t) => s + (Number(t.pendiente) || 0), 0);
    setMonto(suma > 0 ? String(Math.round(suma * 100) / 100) : '');
  };

  const imprimirTicket = async (t, cliente) => {
    const datos = datosTicketAbarrotes(t, {
      cliente: cliente?.nombre || '',
      sucursal: tiendaTicket,
      fecha: fecha(t?.fecha),
    });
    const r = await entregarTicketVenta(datos, 'imprimir', { forzar: true, titulo: 'Ticket de venta' });
    if (r && r.ok === false) setMensaje(r.error || 'No se pudo abrir el ticket.');
  };

  const prepararTicket = (t) => {
    setMontoTicket(t?.pendiente > 0 ? String(Math.round(t.pendiente * 100) / 100) : '');
    setNotaTicket('');
  };

  const alternarVistaTicket = (t) => {
    if (ticket === t.id) {
      setTicket('');
      return;
    }
    setTicket(t.id);
    prepararTicket(t);
  };

  const verTicketDeCobro = (cobro) => {
    setCobroAbierto((prev) => (prev === cobro.id ? '' : cobro.id));
  };

  const cobrarEsteTicket = async (t, cliente) => {
    if (guardando) return;
    const plan = planCobroClienteExt([t], String(montoTicket).replace(',', '.'));
    if (!plan.ok) {
      setMensaje(plan.error);
      return;
    }
    const parte = plan.partes[0];
    const resto = Math.round((Number(t.pendiente) - parte.monto) * 100) / 100;
    const pregunta = resto > 0.009
      ? `¿Abonar ${fmtMonto(parte.monto)} al ticket ${t.folio || 'sin folio'}?\nQuedan ${fmtMonto(resto)} en la deuda.`
      : `¿Cobrar ${fmtMonto(parte.monto)} del ticket ${t.folio || 'sin folio'}?\nEl crédito queda saldado.`;
    if (!window.confirm(pregunta)) return;
    setGuardando(true);
    setMensaje('');
    const res = await registrarCobroClienteExt(supabase, {
      ticketIds: [t.id],
      monto: plan.montoAplicado,
      nota: notaTicket,
      usuarioNombre: user?.nombre || '',
    });
    setGuardando(false);
    if (!res.ok) {
      setMensaje(res.error || 'No se registró el abono.');
      if (res.aplicados?.length) await cargar();
      return;
    }
    setNotaTicket('');
    setMensaje(parte.parcial
      ? `Abono de ${fmtMonto(res.monto)} registrado. El resto sigue en la deuda de ${cliente.nombre}.`
      : `Crédito cobrado: ${fmtMonto(res.monto)} de ${cliente.nombre}.`);
    const fresco = await cargar();
    const sigue = ((fresco?.clientes || []).find((c) => c.clave === cliente.clave)?.tickets || []).find((x) => x.id === t.id);
    setMontoTicket(sigue?.pendiente > 0 ? String(Math.round(sigue.pendiente * 100) / 100) : '');
  };

  const cancelarCobro = async (cobro, clienteNombre) => {
    if (guardando) return;
    const quien = clienteNombre || cobro.cliente || 'este cliente';
    if (!window.confirm(`¿Cancelar el cobro de ${fmtMonto(cobro.monto)} de ${quien}?\nEl monto regresa a la deuda.`)) return;
    setGuardando(true);
    setMensaje('');
    const res = await cancelarCobroClienteExt(supabase, {
      cobroId: cobro.id,
      usuarioNombre: user?.nombre || '',
    });
    setGuardando(false);
    if (!res.ok) {
      setMensaje(res.error || 'No se canceló el cobro.');
      return;
    }
    setMensaje(`Cobro cancelado: ${fmtMonto(res.monto)} regresó a la deuda de ${res.cliente}.`);
    const fresco = await cargar();
    if (clienteClave) {
      const elegido = (fresco?.clientes || []).find((c) => c.clave === clienteClave);
      const siguientes = (elegido?.tickets || []).filter(esCreditoCobrar);
      const suma = siguientes.reduce((s, t) => s + (Number(t.pendiente) || 0), 0);
      setMonto(suma > 0 ? String(Math.round(suma * 100) / 100) : '');
    }
    if (ticket) {
      const dueño = (fresco?.clientes || []).find((c) => (c.tickets || []).some((t) => t.id === ticket));
      const sigue = (dueño?.tickets || []).find((t) => t.id === ticket);
      setMontoTicket(sigue?.pendiente > 0 ? String(Math.round(sigue.pendiente * 100) / 100) : '');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      <div>
        <button type="button" className="btn btn-ghost" onClick={onVolver}>← Venta en ruta</button>
      </div>
      <div className="card" style={{ borderTop: `4px solid ${COLOR}` }}>
        <h3 style={{ margin: 0, color: COLOR }}>RC/Clientes ext.</h3>
        <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.85rem' }}>
          Cada venta a un cliente externo, en efectivo o a crédito, tiene su ticket.
          Un crédito se puede abonar por partes. Si el cobro se cancela, el monto regresa a la deuda.
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
      {mensaje && (
        <div className="card" style={{ borderLeft: `4px solid ${COLOR}` }}>
          <p style={{ margin: 0 }}>{mensaje}</p>
        </div>
      )}
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
                      const abiertoTicket = ticket === t.id;
                      return (
                        <div key={t.id} style={{ borderTop: '1px solid var(--border, #e5e7eb)', paddingTop: '0.45rem', display: 'grid', gap: '0.4rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center' }}>
                            <span style={{ minWidth: 0 }}>
                              <strong>{t.folio || 'Sin folio'}</strong>
                              <span className="muted" style={{ display: 'block', fontSize: '0.78rem' }}>{fecha(t.fecha)}</span>
                            </span>
                            <strong>{fmtMonto(t.pendiente)}</strong>
                          </div>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            style={{ minHeight: 44 }}
                            onClick={() => alternarVistaTicket(t)}
                          >
                            {abiertoTicket ? 'Ocultar ticket' : 'Ver ticket'}
                          </button>
                          {abiertoTicket && (
                            <>
                              <HojaTicket ticket={t} cliente={clienteCobro.nombre} sucursal={tiendaTicket} />
                              <button type="button" className="btn btn-ghost" style={{ minHeight: 44 }} onClick={() => { void imprimirTicket(t, clienteCobro); }}>
                                Imprimir ticket
                              </button>
                            </>
                          )}
                        </div>
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
                      Pendiente {fmtMonto(pendienteCliente)}. Escribe un monto menor para abonar; el resto sigue en la deuda.
                      {clienteCobro.tickets.length > 1 ? ' El abono entra al crédito más antiguo.' : ''}
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
                      disabled={guardando || !(Number(String(monto).replace(',', '.')) > 0)}
                      onClick={() => { void registrarCobro(); }}
                    >
                      {guardando ? 'Guardando…' : 'Registrar cobro'}
                    </button>
                  </div>
                )}
              </>
            )}
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
              <div key={`${c.id}-${c.folio}-${c.fecha}`} style={{ borderTop: '1px solid var(--border, #e5e7eb)', paddingTop: '0.45rem', display: 'grid', gap: '0.35rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
                  <strong>{c.cliente}</strong>
                  <strong>{fmtMonto(c.monto)}</strong>
                </div>
                <p className="muted" style={{ margin: 0, fontSize: '0.78rem' }}>
                  {c.nota}{c.folio ? ` · ${c.folio}` : ''}{c.fecha ? ` · ${fecha(c.fecha)}` : ''}
                </p>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  <button type="button" className="btn btn-ghost" style={{ minHeight: 44 }} onClick={() => verTicketDeCobro(c)}>
                    {cobroAbierto === c.id ? 'Ocultar ticket' : 'Ver ticket'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ minHeight: 44, color: '#b91c1c' }}
                    disabled={guardando}
                    onClick={() => { void cancelarCobro(c); }}
                  >
                    Cancelar cobro
                  </button>
                </div>
                {cobroAbierto === c.id && (() => {
                  const hallado = clientes.flatMap((cl) => (cl.tickets || []).map((t) => ({ cliente: cl, ticket: t }))).find((x) => x.ticket.id === c.ticketId);
                  if (!hallado) return null;
                  return (
                    <>
                      <HojaTicket ticket={hallado.ticket} cliente={hallado.cliente.nombre} sucursal={tiendaTicket} />
                      <button type="button" className="btn btn-ghost" style={{ minHeight: 44 }} onClick={() => { void imprimirTicket(hallado.ticket, hallado.cliente); }}>
                        Imprimir ticket
                      </button>
                    </>
                  );
                })()}
              </div>
            ))}
          </div>
        </div>
      )}
      {pestana === 'registro' && clientes.length === 0 && (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>Todavía no hay ventas de clientes externos.</p>
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
            {abiertoCliente && cliente.tickets.map((t) => (
              <TicketVenta
                key={t.id}
                ticket={t}
                cliente={cliente}
                abierto={ticket === t.id}
                onToggle={() => alternarVistaTicket(t)}
                monto={montoTicket}
                onMonto={setMontoTicket}
                nota={notaTicket}
                onNota={setNotaTicket}
                ocupado={guardando}
                onCobrar={(venta, dueno) => { void cobrarEsteTicket(venta, dueno); }}
                onCancelar={(cobro, dueno) => { void cancelarCobro(cobro, dueno?.nombre); }}
                sucursal={tiendaTicket}
                onImprimir={(venta, dueno) => { void imprimirTicket(venta, dueno); }}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
