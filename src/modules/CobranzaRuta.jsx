import React, { useCallback, useEffect, useState } from 'react';
import InputPin from '../components/InputPin.jsx';
import { listarCreditosPendientesRuta, pagarCreditosRutaConPin } from '../lib/rutaCxc.js';
import { fmtMonto } from '../lib/consultasUi.js';
import { etiquetaTienda } from '../constants/sucursales.js';

/**
 * Contabilidad → Cobranza / Venta en Ruta → Créditos por pagar:
 * el cajero paga créditos de Venta en Ruta con PIN.
 * Al pagar: gasto en corte abarrotes «credito liquidado» + efectivo a tránsito.
 */
export default function CobranzaRuta({ supabase, user, sucursal, embedded = false, titulo }) {
  const [aviso, setAviso] = useState('');
  const [rows, setRows] = useState([]);
  const [sel, setSel] = useState(() => new Set());
  const [folio, setFolio] = useState('');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [montoMin, setMontoMin] = useState('');
  const [montoMax, setMontoMax] = useState('');
  const [pin, setPin] = useState('');
  const [guardando, setGuardando] = useState(false);

  const sucActiva = sucursal || user?.sucursal_id || '';

  const cargar = useCallback(async () => {
    const r = await listarCreditosPendientesRuta(supabase, {
      sucursalId: sucActiva && sucActiva !== 'MAIN' ? sucActiva : undefined,
      folio: folio || undefined,
      fechaDesde: fechaDesde || undefined,
      fechaHasta: fechaHasta || undefined,
      montoMin: montoMin !== '' ? montoMin : undefined,
      montoMax: montoMax !== '' ? montoMax : undefined,
    });
    if (r.aviso) setAviso(r.aviso);
    if (r.error) setAviso(r.error);
    setRows(r.data || []);
    setSel(new Set());
  }, [supabase, sucActiva, folio, fechaDesde, fechaHasta, montoMin, montoMax]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const toggle = (id) => {
    setSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const totalSel = rows.filter((r) => sel.has(String(r.id))).reduce((s, r) => s + (Number(r.monto) || 0), 0);

  const pagar = async () => {
    if (!sel.size) return alert('Selecciona créditos a pagar.');
    if (!String(pin).trim()) return alert('Ingresa tu PIN de cajero.');
    if (!confirm(`¿Pagar ${sel.size} crédito(s) por ${fmtMonto(totalSel)}?\nSe cargará gasto «credito liquidado» al corte de abarrotes y el efectivo irá a tránsito.`)) return;
    setGuardando(true);
    const r = await pagarCreditosRutaConPin(supabase, {
      movimientoIds: [...sel],
      pin,
      sucursal: sucActiva,
    });
    setGuardando(false);
    if (!r.ok) return alert(r.error);
    alert(`Pagado por ${r.cajero}. ${r.pagados?.length || 0} crédito(s).`);
    setPin('');
    await cargar();
  };

  const heading = titulo || (embedded ? 'Créditos por pagar' : 'Cobranza · créditos ruta');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        {embedded ? (
          <h3 style={{ margin: 0, color: '#0f766e' }}>{heading}</h3>
        ) : (
          <h2 style={{ margin: 0, color: '#0f766e' }}>{heading}</h2>
        )}
        <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.85rem' }}>
          Solo cajero (PIN). Filtra por folio, fecha y monto. Al pagar: gasto abarrotes «credito liquidado» + efectivo en tránsito.
          {sucActiva && sucActiva !== 'MAIN' ? ` · Tienda: ${etiquetaTienda(sucActiva)}` : ''}
        </p>
      </div>
      {aviso && <div className="card" style={{ borderLeft: '4px solid var(--brand-gold)' }}>{aviso}</div>}

      <div className="card" style={{ borderTop: '4px solid #0f766e' }}>
        <div style={{ display: 'grid', gap: '0.5rem', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', marginBottom: '0.75rem' }}>
          <input className="input" placeholder="Folio venta" value={folio} onChange={(e) => setFolio(e.target.value)} />
          <input className="input" type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} title="Desde" />
          <input className="input" type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} title="Hasta" />
          <input className="input" type="number" placeholder="Monto min" value={montoMin} onChange={(e) => setMontoMin(e.target.value)} />
          <input className="input" type="number" placeholder="Monto max" value={montoMax} onChange={(e) => setMontoMax(e.target.value)} />
          <button type="button" className="btn btn-ghost" onClick={() => void cargar()}>Filtrar</button>
        </div>

        {rows.length === 0 ? (
          <p className="muted">No hay créditos pendientes con esos filtros.</p>
        ) : (
          <table className="consultas-table">
            <thead>
              <tr>
                <th />
                <th>Folio</th>
                <th>Fecha</th>
                <th>Cliente</th>
                <th>Monto</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const id = String(r.id);
                return (
                  <tr key={id} style={{ background: sel.has(id) ? 'rgba(15,118,110,0.08)' : undefined }}>
                    <td>
                      <input type="checkbox" checked={sel.has(id)} onChange={() => toggle(id)} />
                    </td>
                    <td style={{ fontWeight: 700 }}>{r.folio_venta || r.venta_id || '—'}</td>
                    <td className="muted" style={{ fontSize: '0.78rem' }}>{String(r.created_at || '').slice(0, 10)}</td>
                    <td>{r.cliente_nombre}</td>
                    <td style={{ fontWeight: 700, color: '#b45309' }}>{fmtMonto(r.monto)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        <div style={{ marginTop: '1rem', display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
          <div>
            <div className="muted" style={{ fontSize: '0.75rem' }}>Seleccionados</div>
            <strong>{sel.size} · {fmtMonto(totalSel)}</strong>
          </div>
          <label style={{ fontSize: '0.8rem' }}>
            PIN cajero
            <InputPin value={pin} onChange={(e) => setPin(e.target.value)} className="input" style={{ width: 140 }} />
          </label>
          <button type="button" className="btn btn-primary" disabled={guardando || !sel.size} onClick={() => void pagar()}>
            Pagar con PIN
          </button>
        </div>
      </div>
    </div>
  );
}
