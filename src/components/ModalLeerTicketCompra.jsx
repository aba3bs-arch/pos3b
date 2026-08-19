import React, { useMemo, useRef, useState } from 'react';
import { leerImagenProductoComoDataUrl } from '../lib/imagenProducto.js';
import {
  aplicarLineasTicketACompras,
  cruzarLineasConInventario,
  parsearTextoTicket,
} from '../lib/leerTicketCompra.js';
import {
  guardarClaveGroqTicket,
  leerClaveGroqTicket,
  ocrTicketDesdeDataUrl,
} from '../lib/ocrTicketCompra.js';

function badgeMatch(match) {
  if (match === 'ok') return { label: 'OK', color: '#166534', bg: '#dcfce7' };
  if (match === 'ambiguo') return { label: 'Revisar', color: '#854d0e', bg: '#fef9c3' };
  return { label: 'Sin match', color: '#991b1b', bg: '#fee2e2' };
}

/**
 * Modal de prueba: foto/pegar ticket → OCR → cruzar inventario → aplicar cantidades.
 * No escribe inventario; solo llena la tabla de recepción/entrega.
 */
export default function ModalLeerTicketCompra({
  open,
  onClose,
  inventario,
  modo, // 'recepcion' | 'entrega'
  lineasActuales,
  onAplicar,
}) {
  const fileRef = useRef(null);
  const [preview, setPreview] = useState('');
  const [texto, setTexto] = useState('');
  const [lineas, setLineas] = useState([]);
  const [totalTicket, setTotalTicket] = useState(null);
  const [motor, setMotor] = useState('');
  const [busy, setBusy] = useState(false);
  const [progreso, setProgreso] = useState(0);
  const [err, setErr] = useState('');
  const [claveGroq, setClaveGroq] = useState(() => leerClaveGroqTicket());
  const [mostrarClave, setMostrarClave] = useState(false);

  const resumen = useMemo(() => {
    const ok = lineas.filter((l) => l.match === 'ok').length;
    const amb = lineas.filter((l) => l.match === 'ambiguo').length;
    const no = lineas.filter((l) => l.match === 'no').length;
    return { ok, amb, no, total: lineas.length };
  }, [lineas]);

  if (!open) return null;

  const reset = () => {
    setPreview('');
    setTexto('');
    setLineas([]);
    setTotalTicket(null);
    setMotor('');
    setBusy(false);
    setProgreso(0);
    setErr('');
  };

  const cerrar = () => {
    if (busy) return;
    reset();
    onClose?.();
  };

  const cruzarDesdeTexto = (txt, extras = {}) => {
    const parsed = parsearTextoTicket(txt);
    const cruzadas = cruzarLineasConInventario(
      extras.lineas?.length ? extras.lineas : parsed.lineas,
      inventario,
    );
    setTexto(txt);
    setLineas(cruzadas);
    setTotalTicket(
      extras.total_ticket != null ? extras.total_ticket : parsed.total_ticket,
    );
    setMotor(extras.motor || 'texto');
  };

  const procesarArchivo = async (file) => {
    if (!file) return;
    setErr('');
    setBusy(true);
    setProgreso(0);
    try {
      const dataUrl = await leerImagenProductoComoDataUrl(file, {
        maxSide: 1400,
        quality: 0.82,
        maxBytes: 1.4 * 1024 * 1024,
      });
      setPreview(dataUrl);

      if (claveGroq.trim()) guardarClaveGroqTicket(claveGroq.trim());

      const ocr = await ocrTicketDesdeDataUrl(dataUrl, {
        onProgress: setProgreso,
      });

      if (ocr.motor === 'groq' && Array.isArray(ocr.lineas)) {
        const cruzadas = cruzarLineasConInventario(ocr.lineas, inventario);
        setTexto(ocr.texto || '');
        setLineas(cruzadas);
        setTotalTicket(ocr.total_ticket);
        setMotor('groq');
      } else {
        cruzarDesdeTexto(ocr.texto || '', { motor: ocr.motor || 'tesseract' });
      }
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
      setProgreso(0);
    }
  };

  const onFileChange = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) procesarArchivo(f);
  };

  const reparsearTexto = () => {
    setErr('');
    cruzarDesdeTexto(texto, { motor: 'texto' });
  };

  const setProductoLinea = (idx, producto) => {
    setLineas((rows) =>
      rows.map((l, i) =>
        i === idx
          ? {
              ...l,
              producto,
              match: producto ? 'ok' : 'no',
              candidatos: producto ? [producto] : l.candidatos,
            }
          : l,
      ),
    );
  };

  const setQtyLinea = (idx, qty) => {
    setLineas((rows) =>
      rows.map((l, i) => (i === idx ? { ...l, qty: Math.max(0, parseInt(qty, 10) || 0) } : l)),
    );
  };

  const quitarLinea = (idx) => {
    setLineas((rows) => rows.filter((_, i) => i !== idx));
  };

  const aplicar = () => {
    const confirmadas = lineas.filter((l) => l.producto && Number(l.qty) > 0);
    if (!confirmadas.length) {
      setErr('No hay líneas con producto y cantidad para aplicar.');
      return;
    }
    const r = aplicarLineasTicketACompras(lineasActuales, confirmadas, modo);
    onAplicar?.(r, { totalTicket, motor });
    reset();
    onClose?.();
  };

  return (
    <div className="prod-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="leer-ticket-titulo">
      <div
        className="card"
        style={{
          width: 'min(920px, 100%)',
          maxHeight: '92vh',
          overflow: 'auto',
          padding: '1rem 1.1rem',
          boxShadow: '0 24px 48px rgba(0,0,0,0.2)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div>
            <h3 id="leer-ticket-titulo" style={{ margin: 0, color: 'var(--brand-blue)' }}>
              Leer ticket (prueba)
            </h3>
            <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.85rem' }}>
              Foto o texto del ticket → revisar líneas → aplicar a{' '}
              {modo === 'entrega' ? 'entrega directa' : 'recepción'}. El inventario solo cambia al
              confirmar después.
            </p>
          </div>
          <button type="button" className="btn btn-ghost" onClick={cerrar} disabled={busy}>
            Cerrar
          </button>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.85rem' }}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            {busy ? `Leyendo… ${progreso || ''}%` : 'Tomar / subir foto'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: 'none' }}
            onChange={onFileChange}
          />
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={reparsearTexto}>
            Releer texto pegado
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={() => setMostrarClave((v) => !v)}
          >
            Clave Groq (opcional)
          </button>
        </div>

        {mostrarClave && (
          <label className="muted" style={{ display: 'block', marginTop: '0.65rem', fontSize: '0.85rem' }}>
            API key Groq (solo esta prueba; mejora la lectura de tickets borrosos)
            <input
              className="input"
              type="password"
              autoComplete="off"
              style={{ marginTop: '0.35rem' }}
              value={claveGroq}
              onChange={(e) => setClaveGroq(e.target.value)}
              onBlur={() => guardarClaveGroqTicket(claveGroq)}
              placeholder="gsk_…"
            />
          </label>
        )}

        {err && (
          <div
            className="card"
            style={{ marginTop: '0.75rem', borderColor: 'rgba(211,47,47,0.4)', background: '#fff5f5' }}
          >
            <span className="muted">{err}</span>
          </div>
        )}

        <div className="grid-2" style={{ marginTop: '0.85rem', gap: '0.75rem' }}>
          <div>
            <div className="muted" style={{ fontSize: '0.8rem', marginBottom: '0.35rem' }}>
              Vista previa {motor ? `· motor: ${motor}` : ''}
            </div>
            {preview ? (
              <img
                src={preview}
                alt="Ticket"
                style={{
                  width: '100%',
                  maxHeight: 220,
                  objectFit: 'contain',
                  borderRadius: 8,
                  background: '#f8fafc',
                  border: '1px solid var(--border, #e2e8f0)',
                }}
              />
            ) : (
              <div
                className="muted"
                style={{
                  padding: '1.5rem',
                  textAlign: 'center',
                  borderRadius: 8,
                  background: 'var(--surface)',
                  fontSize: '0.85rem',
                }}
              >
                Sin foto aún. También puedes pegar el texto del ticket abajo.
              </div>
            )}
          </div>
          <label className="muted" style={{ display: 'flex', flexDirection: 'column', fontSize: '0.8rem' }}>
            Texto OCR / pegado
            <textarea
              className="input"
              style={{ marginTop: '0.35rem', minHeight: 180, fontFamily: 'monospace', fontSize: '0.78rem' }}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Pega aquí el texto del ticket si la foto no se lee bien…"
              disabled={busy}
            />
          </label>
        </div>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.75rem',
            marginTop: '0.75rem',
            alignItems: 'center',
            fontSize: '0.85rem',
          }}
          className="muted"
        >
          <span>
            Líneas: <strong>{resumen.total}</strong> · OK {resumen.ok} · Revisar {resumen.amb} · Sin
            match {resumen.no}
          </span>
          {totalTicket != null && (
            <span>
              Total ticket: <strong>${Number(totalTicket).toFixed(2)}</strong>
            </span>
          )}
        </div>

        <div className="table-wrap" style={{ marginTop: '0.65rem', maxHeight: 280 }}>
          <table className="data" style={{ fontSize: '0.82rem' }}>
            <thead>
              <tr>
                <th>Estado</th>
                <th>Ticket</th>
                <th>Producto</th>
                <th>Cant.</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lineas.length === 0 ? (
                <tr>
                  <td colSpan={5} className="muted">
                    Sin líneas. Toma una foto o pega texto y pulsa «Releer texto pegado».
                  </td>
                </tr>
              ) : (
                lineas.map((l, idx) => {
                  const b = badgeMatch(l.match);
                  return (
                    <tr key={`${l.codigo || l.descripcion}-${idx}`}>
                      <td>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '0.15rem 0.45rem',
                            borderRadius: 6,
                            background: b.bg,
                            color: b.color,
                            fontWeight: 700,
                            fontSize: '0.72rem',
                          }}
                        >
                          {b.label}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{l.descripcion}</div>
                        <div className="muted" style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                          {l.codigo || 'sin código'}
                          {l.precio_unit != null ? ` · $${Number(l.precio_unit).toFixed(2)}` : ''}
                        </div>
                      </td>
                      <td style={{ minWidth: 160 }}>
                        {l.match === 'ok' && l.producto ? (
                          <span>{l.producto.nombre}</span>
                        ) : (
                          <select
                            className="select"
                            style={{ fontSize: '0.8rem' }}
                            value={l.producto?.id || ''}
                            onChange={(e) => {
                              const id = e.target.value;
                              const p =
                                (l.candidatos || []).find((c) => String(c.id) === String(id)) ||
                                (inventario || []).find((c) => String(c.id) === String(id));
                              setProductoLinea(idx, p || null);
                            }}
                          >
                            <option value="">— Elegir producto —</option>
                            {(l.candidatos?.length ? l.candidatos : inventario || [])
                              .slice(0, l.candidatos?.length ? 40 : 80)
                              .map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.nombre}
                                </option>
                              ))}
                          </select>
                        )}
                      </td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          className="input"
                          style={{ width: 64, padding: '0.3rem' }}
                          value={l.qty}
                          onChange={(e) => setQtyLinea(idx, e.target.value)}
                        />
                      </td>
                      <td>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => quitarLinea(idx)}>
                          Quitar
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.85rem' }}>
          <button type="button" className="btn btn-success" disabled={busy || !resumen.ok} onClick={aplicar}>
            Aplicar {resumen.ok} línea(s) a {modo === 'entrega' ? 'entrega' : 'recepción'}
          </button>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={cerrar}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
