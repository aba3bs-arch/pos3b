import React, { useEffect, useMemo, useState } from 'react';
import { consultarVentasPaginadas } from '../lib/ventasQuery.js';
import {
  compararPreciosVentasInventario,
  etiquetaTipoPrecio,
} from '../lib/reportePreciosVentas.js';
import { etiquetaTienda } from '../constants/sucursales.js';
import { fmtFechaCorta, fmtMonto, folioNumerico } from '../lib/consultasUi.js';

const FILTROS = [
  { id: 'dif', label: 'Solo diferencias' },
  { id: 'cero', label: 'Vendidos a $0' },
  { id: 'bajo', label: 'Precio muy bajo' },
  { id: 'catalogo_cero', label: 'Catálogo en $0' },
  { id: 'todas', label: 'Todas las líneas distintas' },
];

function Card({ label, value, hint, tone }) {
  const color =
    tone === 'bad' ? '#dc2626' : tone === 'ok' ? '#15803d' : 'var(--brand-blue, #1e5bb8)';
  return (
    <div
      style={{
        padding: '0.55rem 0.7rem',
        borderRadius: 8,
        background: 'var(--surface, #f8fafc)',
        border: '1px solid var(--border, #e2e8f0)',
      }}
    >
      <div className="muted" style={{ fontSize: '0.72rem' }}>
        {label}
      </div>
      <strong style={{ fontSize: '1.02rem', color }}>{value}</strong>
      {hint ? (
        <div className="muted" style={{ fontSize: '0.68rem', marginTop: 2 }}>
          {hint}
        </div>
      ) : null}
    </div>
  );
}

function BadgeTipo({ tipo }) {
  const styles = {
    cero: { bg: 'rgba(220,38,38,0.12)', fg: '#b91c1c' },
    bajo: { bg: 'rgba(217,119,6,0.16)', fg: '#b45309' },
    catalogo_cero: { bg: 'rgba(124,58,237,0.12)', fg: '#6d28d9' },
    cambio: { bg: 'rgba(30,91,184,0.12)', fg: '#1e5bb8' },
    sin_catalogo: { bg: '#f1f5f9', fg: '#475569' },
  };
  const s = styles[tipo] || styles.cambio;
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '0.12rem 0.45rem',
        borderRadius: 999,
        fontSize: '0.72rem',
        fontWeight: 800,
        background: s.bg,
        color: s.fg,
        whiteSpace: 'nowrap',
      }}
    >
      {etiquetaTipoPrecio(tipo)}
    </span>
  );
}

export default function ReportePreciosVentas({
  supabase,
  inventario = [],
  desde,
  hasta,
  filtroSucursal,
  q = '',
  onAviso,
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ventas, setVentas] = useState([]);
  const [filtroTipo, setFiltroTipo] = useState('dif');
  const [selId, setSelId] = useState(null);

  useEffect(() => {
    let cancel = false;
    async function run() {
      if (!supabase) return;
      setLoading(true);
      setError('');
      setSelId(null);
      try {
        const ini = new Date(`${String(desde).slice(0, 10)}T00:00:00`);
        const fin = new Date(`${String(hasta).slice(0, 10)}T23:59:59.999`);
        const { data, error: err, aviso } = await consultarVentasPaginadas(supabase, {
          columns: 'id,total,vendedor,sucursal_id,articulos,created_at',
          desde: ini,
          hasta: fin,
          sucursal: filtroSucursal || null,
        });
        if (cancel) return;
        if (err) throw new Error(err);
        setVentas(data || []);
        if (aviso && onAviso) onAviso(aviso);
      } catch (e) {
        if (cancel) return;
        setVentas([]);
        setError(e?.message || String(e));
      } finally {
        if (!cancel) setLoading(false);
      }
    }
    void run();
    return () => {
      cancel = true;
    };
  }, [supabase, desde, hasta, filtroSucursal]); // eslint-disable-line react-hooks/exhaustive-deps

  const reporte = useMemo(
    () => compararPreciosVentasInventario(ventas, inventario),
    [ventas, inventario],
  );

  const qNorm = String(q || '').trim().toLowerCase();

  const filas = useMemo(() => {
    return (reporte.filas || []).filter((f) => {
      if (filtroTipo === 'dif') {
        if (!(f.lineasDif > 0 || f.lineasCero > 0 || f.tipo === 'catalogo_cero')) return false;
      } else if (filtroTipo === 'cero') {
        if (!(f.lineasCero > 0)) return false;
      } else if (filtroTipo === 'bajo') {
        if (f.tipo !== 'bajo') return false;
      } else if (filtroTipo === 'catalogo_cero') {
        if (f.tipo !== 'catalogo_cero') return false;
      } else if (filtroTipo === 'todas') {
        if (!(f.lineasDif > 0 || f.sinCatalogo)) return false;
      }
      if (!qNorm) return true;
      return `${f.id} ${f.nombre} ${f.sucursales.join(' ')}`.toLowerCase().includes(qNorm);
    });
  }, [reporte.filas, filtroTipo, qNorm]);

  const s = reporte.stats;

  return (
    <div>
      {error ? <div className="consultas-aviso">{error}</div> : null}

      <p className="muted" style={{ margin: '0 0 0.75rem', fontSize: '0.82rem', lineHeight: 1.45 }}>
        Compara el precio cobrado en cada línea de venta con el <strong>precio actual</strong> del
        inventario. Si un producto cambió de precio después, la venta vieja sale como distinta (no
        es un error de caja). Revisa primero <strong>Vendidos a $0</strong> y{' '}
        <strong>Precio muy bajo</strong>.
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(128px, 1fr))',
          gap: '0.5rem',
          marginBottom: '0.75rem',
        }}
      >
        <Card label="Tickets" value={String(s.ventas)} />
        <Card label="Líneas" value={String(s.lineas)} />
        <Card
          label="Igual al inventario"
          value={String(s.lineasIgual)}
          tone="ok"
          hint={`${s.pctLineasDif}% distintas`}
        />
        <Card label="Líneas distintas" value={String(s.lineasDif)} tone={s.lineasDif ? 'bad' : 'ok'} />
        <Card label="Vendidas a $0" value={String(s.lineasCero)} tone={s.lineasCero ? 'bad' : 'ok'} />
        <Card
          label="Si se cobrara el precio de hoy"
          value={fmtMonto(s.impactoFirmado)}
          hint="Positivo = se cobró de menos"
          tone={s.impactoFirmado > 0.5 ? 'bad' : undefined}
        />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBottom: '0.75rem' }}>
        {FILTROS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={filtroTipo === f.id ? 'btn btn-primary' : 'btn btn-ghost'}
            style={{ padding: '0.28rem 0.65rem', fontSize: '0.78rem' }}
            onClick={() => setFiltroTipo(f.id)}
          >
            {f.label}
          </button>
        ))}
        {loading ? (
          <span className="muted" style={{ fontSize: '0.8rem', alignSelf: 'center' }}>
            Cargando ventas…
          </span>
        ) : (
          <span className="muted" style={{ fontSize: '0.78rem', alignSelf: 'center' }}>
            {filas.length} producto{filas.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {filas.length === 0 && !loading ? (
        <div className="consultas-empty">
          <div className="consultas-empty-ico">✓</div>
          <div>
            {s.lineas === 0
              ? 'No hay ventas en este rango.'
              : 'No hay diferencias con este filtro. El precio cobrado coincide con el inventario actual.'}
          </div>
        </div>
      ) : (
        <table className="consultas-table">
          <thead>
            <tr>
              <th>Producto</th>
              <th>Tipo</th>
              <th style={{ textAlign: 'right' }}>Inv. hoy</th>
              <th>Precios cobrados</th>
              <th style={{ textAlign: 'right' }}>Piezas</th>
              <th style={{ textAlign: 'right' }}>Dif. $</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => {
              const open = selId === f.id;
              return (
                <React.Fragment key={f.id}>
                  <tr className={open ? 'selected' : ''} onClick={() => setSelId(open ? null : f.id)}>
                    <td>
                      <div className="consultas-folio">
                        {f.nombre || f.id}
                        <small>{f.id}</small>
                      </div>
                    </td>
                    <td>
                      <BadgeTipo tipo={f.tipo} />
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {f.precioInv == null ? '—' : fmtMonto(f.precioInv)}
                    </td>
                    <td style={{ fontSize: '0.82rem' }}>
                      {f.preciosCobrados
                        .map((p) => `${fmtMonto(p.precio)} ×${p.piezas}`)
                        .join(' · ')}
                    </td>
                    <td style={{ textAlign: 'right' }}>{f.piezasDif || f.piezas}</td>
                    <td
                      style={{
                        textAlign: 'right',
                        color: f.impacto > 0.005 ? '#dc2626' : f.impacto < -0.005 ? '#15803d' : undefined,
                        fontWeight: 700,
                      }}
                    >
                      {fmtMonto(f.impacto)}
                    </td>
                  </tr>
                  {open && (
                    <tr>
                      <td colSpan={6} style={{ background: '#f8fafc', padding: '0.65rem 0.85rem' }}>
                        <div className="muted" style={{ fontSize: '0.78rem', marginBottom: '0.4rem' }}>
                          {f.sucursales.map((s0) => etiquetaTienda(s0) || s0).join(', ') || '—'}
                          {f.primera ? ` · ${fmtFechaCorta(f.primera)} → ${fmtFechaCorta(f.ultima)}` : ''}
                          {' · '}
                          cobrado {fmtMonto(f.cobrado)} vs inventario de hoy {fmtMonto(f.aPrecioActual)}
                        </div>
                        {f.ejemplos.length === 0 ? (
                          <div className="muted">Sin tickets de ejemplo (precio igual o sin catálogo).</div>
                        ) : (
                          <table className="consultas-table" style={{ fontSize: '0.8rem' }}>
                            <thead>
                              <tr>
                                <th>Folio</th>
                                <th>Fecha</th>
                                <th>Sucursal</th>
                                <th>Vendedor</th>
                                <th style={{ textAlign: 'right' }}>Pza</th>
                                <th style={{ textAlign: 'right' }}>Cobrado</th>
                                <th style={{ textAlign: 'right' }}>Inv. hoy</th>
                              </tr>
                            </thead>
                            <tbody>
                              {f.ejemplos.map((e) => (
                                <tr key={`${e.ventaId}-${e.fecha}-${e.precioVenta}`}>
                                  <td>{folioNumerico(e.ventaId, 5)}</td>
                                  <td>{fmtFechaCorta(e.fecha)}</td>
                                  <td>{etiquetaTienda(e.sucursal) || e.sucursal || '—'}</td>
                                  <td>{e.vendedor || '—'}</td>
                                  <td style={{ textAlign: 'right' }}>{e.qty}</td>
                                  <td style={{ textAlign: 'right' }}>{fmtMonto(e.precioVenta)}</td>
                                  <td style={{ textAlign: 'right' }}>{fmtMonto(e.precioInv)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
