import React, { useCallback, useEffect, useMemo, useState } from 'react';
import InputPin from '../components/InputPin.jsx';
import { listarCreditosPendientesRuta, pagarCreditosRutaConPin } from '../lib/rutaCxc.js';
import { fmtMonto } from '../lib/consultasUi.js';
import { esCentralAdmin, etiquetaTienda } from '../constants/sucursales.js';

/**
 * Contabilidad → Cobranza / Venta en Ruta → Créditos por pagar:
 * el cajero paga créditos de Venta en Ruta con PIN.
 * Al pagar: gasto en corte abarrotes «credito liquidado» + efectivo a tránsito.
 *
 * En Central (MAIN): agrupa por sucursal; al hacer click se expanden sus créditos.
 */
export default function CobranzaRuta({ supabase, user, sucursal, embedded = false, titulo }) {
  const [aviso, setAviso] = useState('');
  const [rows, setRows] = useState([]);
  const [sel, setSel] = useState(() => new Set());
  const [pin, setPin] = useState('');
  const [guardando, setGuardando] = useState(false);
  /** Sucursales expandidas (solo vista central). */
  const [abiertas, setAbiertas] = useState(() => new Set());

  const sucActiva = sucursal || user?.sucursal_id || '';
  const vistaCentral = esCentralAdmin(sucActiva) || !sucActiva || String(sucActiva).toUpperCase() === 'MAIN';

  const cargar = useCallback(async () => {
    const r = await listarCreditosPendientesRuta(supabase, {
      sucursalId: vistaCentral ? undefined : sucActiva,
    });
    if (r.aviso) setAviso(r.aviso);
    if (r.error) setAviso(r.error);
    setRows(r.data || []);
    setSel(new Set());
  }, [supabase, sucActiva, vistaCentral]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const grupos = useMemo(() => {
    if (!vistaCentral) return null;
    const map = new Map();
    for (const r of rows) {
      const esSuc = String(r.cliente_tipo || 'sucursal') === 'sucursal';
      const id = esSuc
        ? String(r.cliente_id || r.cliente_nombre || '—').toUpperCase()
        : `ext:${r.cliente_id || r.cliente_nombre || '—'}`;
      const label = esSuc
        ? etiquetaTienda(r.cliente_id) || r.cliente_nombre || id
        : (r.cliente_nombre || 'Cliente externo');
      if (!map.has(id)) {
        map.set(id, { id, label, items: [], total: 0 });
      }
      const g = map.get(id);
      g.items.push(r);
      g.total += Number(r.monto) || 0;
    }
    return [...map.values()].sort((a, b) => String(a.label).localeCompare(String(b.label), 'es'));
  }, [rows, vistaCentral]);

  const toggle = (id) => {
    setSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleGrupo = (grupoId) => {
    setAbiertas((prev) => {
      const next = new Set(prev);
      if (next.has(grupoId)) next.delete(grupoId);
      else next.add(grupoId);
      return next;
    });
  };

  const toggleTodosGrupo = (items) => {
    const ids = items.map((r) => String(r.id));
    const todosSel = ids.every((id) => sel.has(id));
    setSel((prev) => {
      const next = new Set(prev);
      if (todosSel) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
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

  const renderFila = (r) => {
    const id = String(r.id);
    return (
      <tr key={id} style={{ background: sel.has(id) ? 'rgba(15,118,110,0.08)' : undefined }}>
        <td>
          <input type="checkbox" checked={sel.has(id)} onChange={() => toggle(id)} />
        </td>
        <td style={{ fontWeight: 700 }}>{r.folio_venta || r.venta_id || '—'}</td>
        <td className="muted" style={{ fontSize: '0.78rem' }}>{String(r.created_at || '').slice(0, 10)}</td>
        {!vistaCentral && <td>{r.cliente_nombre}</td>}
        <td style={{ fontWeight: 700, color: '#b45309' }}>{fmtMonto(r.monto)}</td>
      </tr>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        {embedded ? (
          <h3 style={{ margin: 0, color: '#0f766e' }}>{heading}</h3>
        ) : (
          <h2 style={{ margin: 0, color: '#0f766e' }}>{heading}</h2>
        )}
        <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.85rem' }}>
          Solo cajero (PIN). Al pagar: gasto abarrotes «credito liquidado» + efectivo en tránsito.
          {vistaCentral
            ? ' · Central: créditos agrupados por sucursal (haz click para verlos).'
            : (sucActiva ? ` · Tienda: ${etiquetaTienda(sucActiva)}` : '')}
        </p>
      </div>
      {aviso && <div className="card" style={{ borderLeft: '4px solid var(--brand-gold)' }}>{aviso}</div>}

      <div className="card" style={{ borderTop: '4px solid #0f766e' }}>
        {rows.length === 0 ? (
          <p className="muted">No hay créditos pendientes.</p>
        ) : vistaCentral && grupos ? (
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            {grupos.map((g) => {
              const abierta = abiertas.has(g.id);
              const ids = g.items.map((r) => String(r.id));
              const nSel = ids.filter((id) => sel.has(id)).length;
              const todosSel = nSel === ids.length && ids.length > 0;
              return (
                <div
                  key={g.id}
                  style={{
                    border: '1px solid var(--border, #e2e8f0)',
                    borderRadius: 10,
                    overflow: 'hidden',
                    background: '#fff',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => toggleGrupo(g.id)}
                    style={{
                      display: 'flex',
                      width: '100%',
                      alignItems: 'center',
                      gap: '0.65rem',
                      padding: '0.7rem 0.85rem',
                      border: 'none',
                      background: abierta ? 'rgba(15,118,110,0.08)' : '#f8fafc',
                      cursor: 'pointer',
                      textAlign: 'left',
                      color: 'inherit',
                    }}
                  >
                    <span style={{ fontWeight: 700, fontSize: '1.1rem', width: 18 }}>{abierta ? '▾' : '▸'}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <strong style={{ display: 'block' }}>{g.label}</strong>
                      <span className="muted" style={{ fontSize: '0.78rem' }}>
                        {g.items.length} crédito{g.items.length === 1 ? '' : 's'}
                        {nSel > 0 ? ` · ${nSel} seleccionado${nSel === 1 ? '' : 's'}` : ''}
                      </span>
                    </span>
                    <strong style={{ color: '#b45309', flexShrink: 0 }}>{fmtMonto(g.total)}</strong>
                  </button>
                  {abierta && (
                    <div style={{ padding: '0.35rem 0.5rem 0.65rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.35rem' }}>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          style={{ fontSize: '0.78rem' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleTodosGrupo(g.items);
                          }}
                        >
                          {todosSel ? 'Quitar selección' : 'Seleccionar todos'}
                        </button>
                      </div>
                      <table className="consultas-table">
                        <thead>
                          <tr>
                            <th />
                            <th>Folio</th>
                            <th>Fecha</th>
                            <th>Monto</th>
                          </tr>
                        </thead>
                        <tbody>
                          {g.items.map(renderFila)}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
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
              {rows.map(renderFila)}
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
