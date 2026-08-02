import React, { useCallback, useMemo, useState } from 'react';
import {
  analizarConsolidacionVentasInventario,
  aplicarConsolidacionVentasInventario,
  sucursalesParaConsolidacion,
} from '../lib/consolidarVentasInventario.js';
import { etiquetaTienda, esAlmacenCentral, listarSucursalesOperativas } from '../constants/sucursales.js';
import { fmtMxn } from '../lib/valorInventario.js';
import Icon, { BtnLabel } from './Icon.jsx';

function hoyYmd() {
  return new Date().toISOString().slice(0, 10);
}

function haceDiasYmd(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function inicioIso(ymd) {
  if (!ymd) return null;
  return new Date(`${ymd}T00:00:00`).toISOString();
}

function finIso(ymd) {
  if (!ymd) return null;
  return new Date(`${ymd}T23:59:59.999`).toISOString();
}

export default function ConsolidarVentasInventario({
  supabase,
  inventario = [],
  inventarioCompleto,
  sucursal,
  user,
  cargarDatos,
  onVolver,
}) {
  const catalogo = inventarioCompleto || inventario;
  const enCentral = esAlmacenCentral(sucursal);
  const tiendas = useMemo(
    () => (enCentral ? ['', ...listarSucursalesOperativas()] : sucursalesParaConsolidacion(sucursal)),
    [enCentral, sucursal],
  );

  const [filtroSuc, setFiltroSuc] = useState(() => (enCentral ? '' : sucursal));
  const [desde, setDesde] = useState(() => haceDiasYmd(90));
  const [hasta, setHasta] = useState(() => hoyYmd());
  const [soloPendientes, setSoloPendientes] = useState(true);
  const [loading, setLoading] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [reporte, setReporte] = useState(null);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const analizar = useCallback(async () => {
    setLoading(true);
    setError('');
    setMsg('');
    const r = await analizarConsolidacionVentasInventario(supabase, {
      sucursal: filtroSuc || null,
      desdeIso: inicioIso(desde),
      hastaIso: finIso(hasta),
      inventario: catalogo,
    });
    setLoading(false);
    if (!r.ok) {
      setError(r.error || 'No se pudo analizar.');
      setReporte(null);
      return;
    }
    setReporte(r);
    if (r.aviso) setMsg(r.aviso);
  }, [supabase, filtroSuc, desde, hasta, catalogo]);

  const filasVista = useMemo(() => {
    const list = reporte?.filas || [];
    if (!soloPendientes) return list;
    return list.filter((f) => f.pendiente > 0);
  }, [reporte, soloPendientes]);

  const aplicar = async () => {
    const pendientes = (reporte?.filas || []).filter((f) => f.pendiente > 0);
    if (!pendientes.length) return alert('No hay piezas pendientes por descontar.');
    const ok = confirm(
      `¿Descontar del piso ${reporte.resumen.piezasPendientes} pieza(s) en ${pendientes.length} producto(s)?\n\n` +
        `Esto ajusta inventario por ventas registradas sin retiro de stock.\n` +
        `Periodo: ${desde} → ${hasta}.`,
    );
    if (!ok) return;
    setAplicando(true);
    setError('');
    const r = await aplicarConsolidacionVentasInventario(supabase, pendientes, {
      usuario: user?.nombre || '—',
    });
    setAplicando(false);
    if (r.errores?.length) {
      setError(`${r.mensaje}\n${r.errores.slice(0, 6).join('\n')}`);
    } else {
      setMsg(r.mensaje);
    }
    await cargarDatos?.();
    await analizar();
  };

  const resumen = reporte?.resumen;

  return (
    <div className="card" style={{ borderLeft: '4px solid var(--brand-blue)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <h3 style={{ margin: 0, color: 'var(--brand-blue)' }}>Consolidar ventas vs piso</h3>
          <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.88rem', maxWidth: 640 }}>
            Cruza tickets de venta (− cancelaciones) con retiros de inventario. Si hay piezas vendidas sin descontar del piso, puedes ajustar todo el catálogo de una vez.
          </p>
        </div>
        {onVolver && (
          <button type="button" className="btn btn-ghost" onClick={onVolver}>
            Volver
          </button>
        )}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '0.65rem',
          marginTop: '1rem',
          alignItems: 'end',
        }}
      >
        <label className="muted" style={{ fontSize: '0.8rem' }}>
          Tienda
          <select
            className="select"
            style={{ display: 'block', marginTop: '0.25rem', width: '100%' }}
            value={filtroSuc}
            onChange={(e) => setFiltroSuc(e.target.value)}
            disabled={!enCentral && tiendas.length <= 1}
          >
            {enCentral && <option value="">Todas las tiendas</option>}
            {(enCentral ? listarSucursalesOperativas() : tiendas).map((s) => (
              <option key={s} value={s}>
                {etiquetaTienda(s)}
              </option>
            ))}
          </select>
        </label>
        <label className="muted" style={{ fontSize: '0.8rem' }}>
          Desde
          <input className="input" type="date" style={{ display: 'block', marginTop: '0.25rem', width: '100%' }} value={desde} onChange={(e) => setDesde(e.target.value)} />
        </label>
        <label className="muted" style={{ fontSize: '0.8rem' }}>
          Hasta
          <input className="input" type="date" style={{ display: 'block', marginTop: '0.25rem', width: '100%' }} value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </label>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-ghost" style={{ fontSize: '0.8rem' }} onClick={() => { setDesde(haceDiasYmd(30)); setHasta(hoyYmd()); }}>
            30 días
          </button>
          <button type="button" className="btn btn-ghost" style={{ fontSize: '0.8rem' }} onClick={() => { setDesde(haceDiasYmd(90)); setHasta(hoyYmd()); }}>
            90 días
          </button>
          <button type="button" className="btn btn-ghost" style={{ fontSize: '0.8rem' }} onClick={() => { setDesde('2024-01-01'); setHasta(hoyYmd()); }}>
            Todo
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.85rem', alignItems: 'center' }}>
        <button type="button" className="btn btn-primary" disabled={loading || aplicando} onClick={analizar}>
          <BtnLabel icon="search">{loading ? 'Analizando…' : 'Analizar catálogo'}</BtnLabel>
        </button>
        <button
          type="button"
          className="btn btn-success"
          disabled={loading || aplicando || !resumen?.conPendiente}
          onClick={aplicar}
        >
          <BtnLabel icon="check">
            {aplicando ? 'Aplicando…' : `Descontar pendientes${resumen?.piezasPendientes ? ` (${resumen.piezasPendientes})` : ''}`}
          </BtnLabel>
        </button>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem' }}>
          <input type="checkbox" checked={soloPendientes} onChange={(e) => setSoloPendientes(e.target.checked)} />
          Solo con pendiente
        </label>
      </div>

      {error && (
        <p style={{ color: 'var(--brand-red)', margin: '0.75rem 0 0', whiteSpace: 'pre-wrap', fontSize: '0.9rem' }}>{error}</p>
      )}
      {msg && <p className="muted" style={{ margin: '0.75rem 0 0', fontSize: '0.88rem' }}>{msg}</p>}

      {resumen && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
            gap: '0.55rem',
            marginTop: '1rem',
          }}
        >
          {[
            { l: 'Productos', v: resumen.productos },
            { l: 'Con pendiente', v: resumen.conPendiente },
            { l: 'Piezas a descontar', v: resumen.piezasPendientes },
            { l: 'Monto approx.', v: fmtMxn(resumen.montoPendiente) },
            { l: 'Tickets', v: resumen.tickets },
            { l: 'Cancelaciones', v: resumen.cancelaciones },
          ].map((k) => (
            <div key={k.l} style={{ padding: '0.55rem 0.65rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)' }}>
              <div className="muted" style={{ fontSize: '0.72rem' }}>{k.l}</div>
              <div style={{ fontWeight: 750, fontSize: '1.05rem' }}>{k.v}</div>
            </div>
          ))}
        </div>
      )}

      {reporte && (
        <div className="table-wrap" style={{ marginTop: '1rem' }}>
          <table className="data">
            <thead>
              <tr>
                <th>Tienda</th>
                <th>Código</th>
                <th>Producto</th>
                <th>Vendido</th>
                <th>Cancelado</th>
                <th>Neto</th>
                <th>Descontado</th>
                <th>Pendiente</th>
                <th>Piso ahora</th>
              </tr>
            </thead>
            <tbody>
              {filasVista.length === 0 ? (
                <tr>
                  <td colSpan={9} className="muted">
                    {soloPendientes
                      ? 'Sin pendientes: las ventas del periodo ya tienen retiro de inventario (o no hay ventas).'
                      : 'Sin datos en el periodo.'}
                  </td>
                </tr>
              ) : (
                filasVista.map((f) => (
                  <tr key={`${f.sucursal}|${f.producto_id}`} style={f.pendiente > 0 ? { background: 'rgba(255,49,49,0.06)' } : undefined}>
                    <td>{etiquetaTienda(f.sucursal)}</td>
                    <td>{f.producto_id}</td>
                    <td>{f.nombre}</td>
                    <td>{f.vendido}</td>
                    <td>{f.cancelado}</td>
                    <td>{f.netoVendido}</td>
                    <td>{f.descontado}</td>
                    <td style={{ fontWeight: f.pendiente > 0 ? 800 : 400, color: f.pendiente > 0 ? 'var(--brand-red)' : undefined }}>
                      {f.pendiente}
                    </td>
                    <td>{f.pisoActual == null ? '—' : f.pisoActual}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {!reporte && !loading && (
        <p className="muted" style={{ margin: '1rem 0 0', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <Icon name="alert" size={16} />
          Elige periodo y pulsa Analizar catálogo.
        </p>
      )}
    </div>
  );
}
