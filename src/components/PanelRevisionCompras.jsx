import React, { useCallback, useEffect, useMemo, useState } from 'react';
import FiltroPeriodo from './FiltroPeriodo.jsx';
import { PRESETS_FECHA_PRODUCTO, rangoDesdePreset } from '../lib/consultasInventario.js';
import {
  COLOR_ESTADO,
  COLOR_LINEA,
  ETIQUETA_ESTADO,
  ETIQUETA_LINEA,
  ESTADOS_LINEA,
  cargarRevisionCompras,
  fmtMonto,
  marcarTicketRevisado,
  quitarRevisionTicket,
  tiendasFiltroConsolidacionCompras,
} from '../lib/revisionCompras.js';

const COLOR = '#0e7490';

function Kpi({ label, value, accent, sub }) {
  return (
    <div
      className="card"
      style={{
        padding: '0.75rem 0.85rem',
        borderTop: accent ? `3px solid ${accent}` : undefined,
      }}
    >
      <div className="muted" style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </div>
      <div style={{ fontSize: '1.25rem', fontWeight: 800, color: accent || COLOR, marginTop: '0.2rem' }}>{value}</div>
      {sub ? (
        <div className="muted" style={{ fontSize: '0.75rem', marginTop: '0.2rem' }}>
          {sub}
        </div>
      ) : null}
    </div>
  );
}

function Badge({ texto, color }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '0.15rem 0.45rem',
        borderRadius: 4,
        fontSize: '0.72rem',
        fontWeight: 700,
        background: `${color}18`,
        color,
        border: `1px solid ${color}44`,
        whiteSpace: 'nowrap',
      }}
    >
      {texto}
    </span>
  );
}

function PanelDetalleTicket({ ticket, user, onCambio }) {
  if (!ticket) {
    return (
      <div className="card" style={{ padding: '1rem' }}>
        <p className="muted" style={{ margin: 0 }}>
          Selecciona un ticket de la lista para revisar productos vs inventario.
        </p>
      </div>
    );
  }

  const lineas = ticket.lineas_revision || [];
  const res = ticket.resumen_lineas || {};

  const marcar = (resultado) => {
    const r = marcarTicketRevisado(ticket, {
      resultado,
      usuario: user?.nombre || '',
    });
    if (!r.ok) return alert(r.error || 'No se pudo marcar.');
    onCambio?.();
  };

  const desmarcar = () => {
    quitarRevisionTicket(ticket.revision_clave);
    onCambio?.();
  };

  return (
    <div className="card" style={{ borderTop: `4px solid ${COLOR}`, padding: '0.85rem' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: '1.05rem' }}>
            {ticket.folio || 'Sin folio'} · {ticket.tienda}
          </div>
          <div className="muted" style={{ fontSize: '0.8rem', marginTop: '0.2rem' }}>
            {[ticket.fecha_ymd, ticket.proveedor, ticket.tipo].filter(Boolean).join(' · ')}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.45rem' }}>
            <Badge
              texto={ETIQUETA_ESTADO[ticket.estado] || ticket.estado}
              color={COLOR_ESTADO[ticket.estado] || '#64748b'}
            />
            {ticket.revisado ? (
              <Badge
                texto={ticket.revision_resultado === 'diferencias' ? 'Revisado · con diferencias' : 'Revisado · OK'}
                color={ticket.revision_resultado === 'diferencias' ? '#c2410c' : '#15803d'}
              />
            ) : (
              <Badge texto="Pendiente de revisión" color="#64748b" />
            )}
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
          {!ticket.revisado ? (
            <>
              <button type="button" className="btn" style={{ background: '#15803d' }} onClick={() => marcar('ok')}>
                Marcar OK
              </button>
              <button type="button" className="btn" style={{ background: '#c2410c' }} onClick={() => marcar('diferencias')}>
                Marcar con diferencias
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-ghost" onClick={desmarcar}>
              Quitar revisión
            </button>
          )}
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
          gap: '0.5rem',
          margin: '0.85rem 0',
        }}
      >
        <Kpi label="Ticket $" value={fmtMonto(ticket.monto_ticket)} />
        <Kpi label="Inventario $" value={fmtMonto(ticket.monto_inventario)} />
        <Kpi label="Productos OK" value={res.ok || 0} accent="#15803d" />
        <Kpi label="Faltantes" value={res.faltantes || 0} accent="#b91c1c" />
        <Kpi label="Parciales" value={res.parciales || 0} accent="#c2410c" />
        <Kpi label="Extras" value={res.extras || 0} accent="#a16207" />
      </div>

      {!lineas.length ? (
        <p className="muted">
          Este ticket no trae líneas de producto en la compra, o no hay ingreso ligado. Revisa el folio en Inventario /
          Compras.
        </p>
      ) : (
        <div className="table-wrap table-wrap-sticky-head">
          <table className="data" style={{ fontSize: '0.8rem' }}>
            <thead>
              <tr>
                <th>Producto</th>
                <th style={{ textAlign: 'right' }}>Cant. ticket</th>
                <th style={{ textAlign: 'right' }}>Cant. ingresada</th>
                <th style={{ textAlign: 'right' }}>Diff</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {lineas.map((l) => (
                <tr
                  key={l.clave}
                  style={{
                    background:
                      l.estado === ESTADOS_LINEA.OK
                        ? undefined
                        : `${COLOR_LINEA[l.estado] || '#64748b'}12`,
                  }}
                >
                  <td>{l.nombre}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{l.qty_ticket}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{l.qty_inventario}</td>
                  <td
                    style={{
                      textAlign: 'right',
                      color: l.qty_diff === 0 ? undefined : COLOR_LINEA[l.estado],
                      fontWeight: 700,
                    }}
                  >
                    {l.qty_diff > 0 ? `+${l.qty_diff}` : l.qty_diff}
                  </td>
                  <td>
                    <Badge texto={ETIQUETA_LINEA[l.estado] || l.estado} color={COLOR_LINEA[l.estado] || '#64748b'} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="muted" style={{ fontSize: '0.75rem', margin: '0.75rem 0 0' }}>
        Compara visualmente el ticket físico con estas cantidades. Si falta mercancía, corrígela en Inventario (Ingreso)
        y vuelve a Actualizar. La marca «revisado» queda en este equipo.
      </p>
    </div>
  );
}

export default function PanelRevisionCompras({ supabase, user }) {
  const [preset, setPreset] = useState('hoy');
  const ini = rangoDesdePreset('hoy') || {};
  const [desde, setDesde] = useState(ini.desde || '');
  const [hasta, setHasta] = useState(ini.hasta || '');
  const [tienda, setTienda] = useState('');
  const [filtro, setFiltro] = useState('pendientes'); // todos | pendientes | diferencias | revisados
  const [tickets, setTickets] = useState([]);
  const [resumen, setResumen] = useState(null);
  const [seleccion, setSeleccion] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  const aplicarPreset = (id) => {
    setPreset(id);
    if (id === 'rango') return;
    const r = rangoDesdePreset(id);
    if (r?.desde && r?.hasta) {
      setDesde(r.desde);
      setHasta(r.hasta);
    }
  };

  const cargar = useCallback(async () => {
    if (!supabase) return;
    setCargando(true);
    setError('');
    setAviso('');
    const res = await cargarRevisionCompras(supabase, { desde, hasta, sucursal: tienda });
    setCargando(false);
    if (res.error) setError(res.error);
    if (res.aviso) setAviso(res.aviso);
    setTickets(res.tickets || []);
    setResumen(res.resumenRevision || null);
    setSeleccion((prev) => {
      if (!prev) return null;
      const next = (res.tickets || []).find((t) => t.revision_clave === prev.revision_clave);
      return next || null;
    });
  }, [supabase, desde, hasta, tienda]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const lista = useMemo(() => {
    let list = tickets;
    if (filtro === 'pendientes') list = list.filter((t) => !t.revisado);
    if (filtro === 'revisados') list = list.filter((t) => t.revisado);
    if (filtro === 'diferencias') list = list.filter((t) => (t.resumen_lineas?.con_diferencia || 0) > 0);
    return list;
  }, [tickets, filtro]);

  const tiendas = useMemo(() => tiendasFiltroConsolidacionCompras(), []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="card" style={{ borderTop: `4px solid ${COLOR}` }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
          <FiltroPeriodo
            preset={preset}
            onPresetChange={aplicarPreset}
            desde={desde}
            hasta={hasta}
            onDesdeChange={(v) => {
              setPreset('rango');
              setDesde(v);
            }}
            onHastaChange={(v) => {
              setPreset('rango');
              setHasta(v);
            }}
            presets={PRESETS_FECHA_PRODUCTO}
          />
          <label className="muted" style={{ display: 'block', minWidth: 160 }}>
            Tienda
            <select className="select" style={{ marginTop: '0.35rem' }} value={tienda} onChange={(e) => setTienda(e.target.value)}>
              {tiendas.map((t) => (
                <option key={t.id || 'all'} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="muted" style={{ display: 'block', minWidth: 160 }}>
            Lista
            <select className="select" style={{ marginTop: '0.35rem' }} value={filtro} onChange={(e) => setFiltro(e.target.value)}>
              <option value="pendientes">Pendientes</option>
              <option value="diferencias">Con diferencias</option>
              <option value="revisados">Revisados</option>
              <option value="todos">Todos</option>
            </select>
          </label>
          <button type="button" className="btn" disabled={cargando} onClick={() => void cargar()}>
            {cargando ? 'Cargando…' : 'Actualizar'}
          </button>
        </div>
        {error ? <p style={{ color: '#b91c1c', margin: '0.65rem 0 0' }}>{error}</p> : null}
        {aviso ? <p className="muted" style={{ margin: '0.65rem 0 0' }}>{aviso}</p> : null}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
          gap: '0.65rem',
        }}
      >
        <Kpi label="Tickets" value={resumen?.total ?? 0} />
        <Kpi label="Pendientes" value={resumen?.pendientes ?? 0} accent="#c2410c" />
        <Kpi label="Revisados" value={resumen?.revisados ?? 0} accent="#15803d" />
        <Kpi label="Con diferencias" value={resumen?.con_diferencias ?? 0} accent="#b91c1c" />
        <Kpi label="OK automático" value={resumen?.ok_auto ?? 0} accent="#0e7490" sub="cantidades cuadran" />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(260px, 340px) 1fr',
          gap: '1rem',
          alignItems: 'start',
        }}
        className="revision-compras-grid"
      >
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '0.65rem 0.75rem', borderBottom: '1px solid #e2e8f0', fontWeight: 700 }}>
            Tickets ({lista.length})
          </div>
          {!lista.length ? (
            <p className="muted" style={{ padding: '0.85rem' }}>
              {cargando ? 'Cargando…' : 'Sin tickets en este filtro / periodo.'}
            </p>
          ) : (
            <div style={{ maxHeight: 'min(70vh, 640px)', overflowY: 'auto' }}>
              {lista.map((t) => {
                const activo = seleccion?.revision_clave === t.revision_clave;
                const nDiff = t.resumen_lineas?.con_diferencia || 0;
                return (
                  <button
                    key={t.revision_clave}
                    type="button"
                    onClick={() => setSeleccion(t)}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      border: 'none',
                      borderBottom: '1px solid #e2e8f0',
                      background: activo ? '#ecfeff' : t.revisado ? '#f8fafc' : '#fff',
                      padding: '0.65rem 0.75rem',
                      cursor: 'pointer',
                      borderLeft: activo ? `3px solid ${COLOR}` : '3px solid transparent',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                      <code style={{ fontSize: '0.78rem', fontWeight: 700 }}>{t.folio || '—'}</code>
                      <span className="muted" style={{ fontSize: '0.72rem' }}>{t.fecha_ymd}</span>
                    </div>
                    <div className="muted" style={{ fontSize: '0.75rem', marginTop: 2 }}>
                      {t.tienda} · {t.proveedor || 'Sin proveedor'}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginTop: '0.35rem' }}>
                      {t.revisado ? (
                        <Badge texto="Revisado" color="#15803d" />
                      ) : (
                        <Badge texto="Pendiente" color="#64748b" />
                      )}
                      {nDiff > 0 ? (
                        <Badge texto={`${nDiff} diff`} color="#b91c1c" />
                      ) : t.auto_ok ? (
                        <Badge texto="OK auto" color="#0e7490" />
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <PanelDetalleTicket ticket={seleccion} user={user} onCambio={() => void cargar()} />
      </div>

      <style>{`
        @media (max-width: 860px) {
          .revision-compras-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
