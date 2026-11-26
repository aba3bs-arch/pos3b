import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { fmtMonto } from '../lib/consultasUi.js';
import { entregarTicketVenta, htmlTicketVenta } from '../lib/impresion.js';
import {
  cancelarCobroClienteExt,
  cancelarLiquidacionClienteExt,
  cobrosDelRegistro,
  datosTicketAbarrotes,
  listarRegistroClientesExt,
  planCobroClienteExt,
  registrarCobroClienteExt,
  registrarLiquidacionClienteExt,
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

function HojaTicket({ ticket: t, cliente }) {
  const html = htmlTicketVenta(datosTicketAbarrotes(t, {
    cliente: cliente || '',
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

function TicketFlotante({ ticket: t, cliente, onCerrar, onImprimir }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCerrar(); };
    const previo = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previo;
      window.removeEventListener('keydown', onKey);
    };
  }, [onCerrar]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Ticket ${t?.folio || ''}`}
      onClick={onCerrar}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 4000,
        background: 'rgba(15, 23, 42, 0.48)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        padding: '0.75rem',
        overflow: 'auto',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(420px, 100%)',
          background: '#fff',
          borderRadius: 14,
          boxShadow: '0 22px 60px rgba(0,0,0,0.32)',
          padding: '0.75rem',
          margin: '3vh auto 2rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
          <button type="button" className="btn btn-ghost" style={{ minHeight: 44 }} onClick={onCerrar}>
            Ocultar ticket
          </button>
          <button type="button" className="btn btn-primary" style={{ minHeight: 44 }} onClick={onImprimir}>
            Imprimir
          </button>
        </div>
        <HojaTicket ticket={t} cliente={cliente} />
      </div>
    </div>,
    document.body,
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
  onVerTicket,
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
          <button type="button" className="btn btn-ghost" style={{ minHeight: 44 }} onClick={() => onVerTicket(t, cliente)}>
            Ver ticket
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

function PestanaLiquidacion({ liquidacion, ocupado, onLiquidar, onCancelar }) {
  const lineas = liquidacion?.lineas || [];
  const historial = liquidacion?.historial || [];
  const tot = liquidacion?.totales || { efectivo: 0, abonos: 0, total: 0 };
  const grupos = [];
  for (const linea of lineas) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.cliente === linea.cliente) ultimo.lineas.push(linea);
    else grupos.push({ cliente: linea.cliente, lineas: [linea] });
  }
  return (
    <div style={{ display: 'grid', gap: '0.85rem' }}>
      <div className="card" style={{ borderTop: `4px solid ${COLOR}`, display: 'grid', gap: '0.75rem' }}>
        <strong style={{ color: COLOR }}>Por liquidar</strong>
        <p className="muted" style={{ margin: 0, fontSize: '0.82rem' }}>
          Efectivo de las ventas y cobros ya recibidos de clientes externos.
          El crédito que sigue pendiente no entra. No se carga al corte de la sucursal.
        </p>
        <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap' }}>
          <Cifra label="Efectivo" valor={tot.efectivo} />
          <Cifra label="Cobros" valor={tot.abonos} />
          <Cifra label="Total" valor={tot.total} color={COLOR} />
        </div>
        {lineas.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>No hay efectivo ni cobros por liquidar.</p>
        ) : grupos.map((g) => (
          <div key={g.cliente} style={{ display: 'grid', gap: '0.35rem' }}>
            <strong>{g.cliente}</strong>
            {g.lineas.map((l) => (
              <div key={l.ref} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', borderTop: '1px solid var(--border, #e5e7eb)', paddingTop: '0.35rem' }}>
                <span style={{ minWidth: 0 }}>
                  <strong>{l.folio || 'Sin folio'}</strong>
                  <span className="muted" style={{ display: 'block', fontSize: '0.78rem' }}>
                    {l.concepto}{l.fecha ? ` · ${fecha(l.fecha)}` : ''}
                  </span>
                </span>
                <strong>{fmtMonto(l.monto)}</strong>
              </div>
            ))}
          </div>
        ))}
        <button
          type="button"
          className="btn btn-primary"
          style={{ minHeight: 44 }}
          disabled={ocupado || !(tot.total > 0)}
          onClick={onLiquidar}
        >
          {ocupado ? 'Guardando…' : 'Liquidar'}
        </button>
      </div>
      <div className="card" style={{ display: 'grid', gap: '0.55rem' }}>
        <strong style={{ color: COLOR }}>Liquidaciones</strong>
        {historial.length === 0 && (
          <p className="muted" style={{ margin: 0 }}>Todavía no hay liquidaciones.</p>
        )}
        {historial.map((h) => (
          <div key={h.id} style={{ borderTop: '1px solid var(--border, #e5e7eb)', paddingTop: '0.45rem', display: 'grid', gap: '0.35rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
              <span>
                {fecha(h.fecha) || 'Liquidación'}
                {h.usuario ? <span className="muted"> · {h.usuario}</span> : null}
              </span>
              <strong>{fmtMonto(h.total)}</strong>
            </div>
            <p className="muted" style={{ margin: 0, fontSize: '0.78rem' }}>
              Efectivo {fmtMonto(h.efectivo)} · cobros {fmtMonto(h.abonos)}
            </p>
            {h.cancelada ? (
              <p className="muted" style={{ margin: 0, fontSize: '0.8rem' }}>Cancelada. Los montos volvieron a por liquidar.</p>
            ) : (
              <button
                type="button"
                className="btn btn-ghost"
                style={{ minHeight: 44, color: '#b91c1c' }}
                disabled={ocupado}
                onClick={() => onCancelar(h)}
              >
                Cancelar liquidación
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const campo = {
  width: '100%',
  boxSizing: 'border-box',
  fontSize: '16px',
  minHeight: 44,
};

export default function RcClientesExt({ supabase, user, onVolver }) {
  const [registro, setRegistro] = useState(null);
  const [liquidacion, setLiquidacion] = useState(null);
  const [aviso, setAviso] = useState('');
  const [abierto, setAbierto] = useState('');
  const [ticket, setTicket] = useState('');
  const [flotante, setFlotante] = useState(null);
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
    setLiquidacion(res.liquidacion || null);
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
  const cerrarTicket = useCallback(() => setFlotante(null), []);

  const elegirCliente = (clave) => {
    const elegido = porCobrar.find((c) => c.clave === clave);
    const suma = (elegido?.tickets || []).reduce((s, t) => s + (Number(t.pendiente) || 0), 0);
    setClienteClave(clave);
    setMonto(suma > 0 ? String(Math.round(suma * 100) / 100) : '');
    setNota('');
    setMensaje('');
    setTicket('');
    setFlotante(null);
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
    const nombre = typeof cliente === 'string' ? cliente : (cliente?.nombre || '');
    const datos = datosTicketAbarrotes(t, {
      cliente: nombre,
      fecha: fecha(t?.fecha),
    });
    const r = await entregarTicketVenta(datos, 'imprimir', { forzar: true, titulo: 'Ticket de venta' });
    if (r && r.ok === false) setMensaje(r.error || 'No se pudo abrir el ticket.');
  };

  const abrirTicket = (t, nombre) => {
    const cliente = String(nombre || '').trim();
    if (flotante?.ticket?.id === t?.id) {
      setFlotante(null);
      return;
    }
    setFlotante({ ticket: t, cliente });
  };

  const prepararTicket = (t) => {
    setMontoTicket(t?.pendiente > 0 ? String(Math.round(t.pendiente * 100) / 100) : '');
    setNotaTicket('');
  };

  const alternarVistaTicket = (t, nombre) => {
    if (ticket === t.id) {
      setTicket('');
      setFlotante((prev) => (prev?.ticket?.id === t.id ? null : prev));
      return;
    }
    setTicket(t.id);
    prepararTicket(t);
    setFlotante({ ticket: t, cliente: nombre || '' });
  };

  const verTicketDeCobro = (cobro) => {
    const hallado = clientes
      .flatMap((cl) => (cl.tickets || []).map((t) => ({ cliente: cl, ticket: t })))
      .find((x) => x.ticket.id === cobro.ticketId);
    if (!hallado) {
      setMensaje('No se encontró el ticket de esa venta.');
      return;
    }
    abrirTicket(hallado.ticket, hallado.cliente.nombre);
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

  const liquidar = async () => {
    if (guardando) return;
    const lineas = liquidacion?.lineas || [];
    const tot = liquidacion?.totales || { efectivo: 0, abonos: 0, total: 0 };
    if (!(tot.total > 0) || !lineas.length) return;
    const pregunta = `¿Liquidar ${fmtMonto(tot.total)}?\nEfectivo ${fmtMonto(tot.efectivo)} · cobros ${fmtMonto(tot.abonos)}\nEl crédito pendiente no cambia.`;
    if (!window.confirm(pregunta)) return;
    setGuardando(true);
    setMensaje('');
    const res = await registrarLiquidacionClienteExt(supabase, {
      refs: lineas.map((l) => l.ref),
      usuarioNombre: user?.nombre || '',
    });
    setGuardando(false);
    if (!res.ok) {
      setMensaje(res.error || 'No se liquidó.');
      return;
    }
    setMensaje(`Liquidación registrada: ${fmtMonto(res.monto)}.`);
    await cargar();
  };

  const cancelarLiquidacion = async (fila) => {
    if (guardando || !fila) return;
    if (!window.confirm(`¿Cancelar la liquidación de ${fmtMonto(fila.total)}?\nEsos montos vuelven a por liquidar.`)) return;
    setGuardando(true);
    setMensaje('');
    const res = await cancelarLiquidacionClienteExt(supabase, {
      liquidacionId: fila.id,
      usuarioNombre: user?.nombre || '',
    });
    setGuardando(false);
    if (!res.ok) {
      setMensaje(res.error || 'No se canceló la liquidación.');
      return;
    }
    setMensaje(`Liquidación cancelada: ${fmtMonto(res.monto)} volvió a por liquidar.`);
    await cargar();
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
          En Liquidación se entrega el efectivo y los cobros ya recibidos.
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
          <button
            type="button"
            className={`btn ${pestana === 'liquidacion' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ minHeight: 44 }}
            onClick={() => setPestana('liquidacion')}
          >
            Liquidación
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
                    {clienteCobro.tickets.map((t) => (
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
                            onClick={() => abrirTicket(t, clienteCobro.nombre)}
                          >
                            {flotante?.ticket?.id === t.id ? 'Ocultar ticket' : 'Ver ticket'}
                          </button>
                        </div>
                    ))}
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
                    {flotante?.ticket?.id === c.ticketId ? 'Ocultar ticket' : 'Ver ticket'}
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
              </div>
            ))}
          </div>
        </div>
      )}
      {pestana === 'liquidacion' && (
        <PestanaLiquidacion
          liquidacion={liquidacion}
          ocupado={guardando}
          onLiquidar={() => { void liquidar(); }}
          onCancelar={(fila) => { void cancelarLiquidacion(fila); }}
        />
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
              onClick={() => {
                setAbierto(abiertoCliente ? '' : cliente.clave);
                setTicket('');
                if (abiertoCliente) setFlotante(null);
              }}
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
                onToggle={() => alternarVistaTicket(t, cliente.nombre)}
                monto={montoTicket}
                onMonto={setMontoTicket}
                nota={notaTicket}
                onNota={setNotaTicket}
                ocupado={guardando}
                onCobrar={(venta, dueno) => { void cobrarEsteTicket(venta, dueno); }}
                onCancelar={(cobro, dueno) => { void cancelarCobro(cobro, dueno?.nombre); }}
                onVerTicket={(venta, dueno) => abrirTicket(venta, dueno?.nombre)}
              />
            ))}
          </div>
        );
      })}
      {flotante && (
        <TicketFlotante
          ticket={flotante.ticket}
          cliente={flotante.cliente}
          onCerrar={cerrarTicket}
          onImprimir={() => { void imprimirTicket(flotante.ticket, flotante.cliente); }}
        />
      )}
    </div>
  );
}
