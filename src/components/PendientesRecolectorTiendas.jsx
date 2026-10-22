import React, { useEffect, useMemo, useRef } from 'react';
import {
  fmtFechaHora,
  fmtMonto,
  resumenPorTiendaConCatalogo,
  calcularNetosLiquidacion,
} from '../lib/controlEfectivo.js';
import {
  ETIQUETA_CREDITO_COBRADO,
  ETIQUETA_EFECTIVO_MERCANCIA,
  separarCreditosYEfectivo,
} from '../lib/recoleccionTipos.js';

function CheckIndeterminado({ checked, indeterminate, onChange, ...rest }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return <input ref={ref} type="checkbox" checked={checked} onChange={onChange} {...rest} />;
}

function estadoSeleccion(items, selIds) {
  const sel = items.filter((m) => selIds[m.id]).length;
  if (sel === 0) return 'none';
  if (sel === items.length) return 'all';
  return 'partial';
}

function EtiquetaTipo({ credito }) {
  return (
    <span
      className="badge"
      style={
        credito
          ? { background: 'rgba(37,99,235,0.12)', color: 'var(--brand-blue)' }
          : { background: 'rgba(13,148,136,0.12)', color: '#0d9488' }
      }
    >
      {credito ? ETIQUETA_CREDITO_COBRADO : ETIQUETA_EFECTIVO_MERCANCIA}
    </span>
  );
}

function ordenarPorFecha(items) {
  return [...items].sort((a, b) => String(a.fecha_hora || '').localeCompare(String(b.fecha_hora || '')));
}

function SeccionMovimientos({ titulo, nota, credito, items, selIds, setSelIds }) {
  if (!items.length) return null;
  const estado = estadoSeleccion(items, selIds);
  const totalSel = items.filter((m) => selIds[m.id]).reduce((a, m) => a + Number(m.monto || 0), 0);
  const setTodos = (val) => {
    setSelIds((prev) => {
      const next = { ...prev };
      items.forEach((m) => {
        next[m.id] = val;
      });
      return next;
    });
  };
  return (
    <div style={{ marginTop: '1rem' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', flexWrap: 'wrap' }}>
        <CheckIndeterminado
          checked={estado === 'all'}
          indeterminate={estado === 'partial'}
          onChange={(e) => setTodos(e.target.checked)}
        />
        <strong>{titulo}</strong>
        <EtiquetaTipo credito={credito} />
        <span className="muted" style={{ fontSize: '0.8rem' }}>({items.length} mov.)</span>
        <strong style={{ marginLeft: 'auto' }}>{fmtMonto(totalSel)}</strong>
      </label>
      <p className="muted" style={{ margin: '0.2rem 0 0.4rem 1.6rem', fontSize: '0.78rem' }}>{nota}</p>
      {ordenarPorFecha(items).map((m) => (
        <label
          key={m.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.4rem 0',
            borderTop: '1px solid var(--border)',
            cursor: 'pointer',
            fontSize: '0.85rem',
          }}
        >
          <input
            type="checkbox"
            checked={Boolean(selIds[m.id])}
            onChange={(e) => setSelIds((p) => ({ ...p, [m.id]: e.target.checked }))}
          />
          <span style={{ flex: 1 }}>
            {m.num_traspaso || 'Sin folio'}
            <span className="muted"> · {fmtFechaHora(m.fecha_hora)}</span>
            {m.cajero_nombre && <span className="muted"> · {m.cajero_nombre}</span>}
          </span>
          <strong>{fmtMonto(m.monto)}</strong>
        </label>
      ))}
    </div>
  );
}

function ResumenLiquidar({ titulo, subtitulo, items, totalGastos, cuentaRtLabel, boton, guardando, onClick, destacado }) {
  const { creditos, efectivo, totalCreditos, totalEfectivo } = separarCreditosYEfectivo(items);
  const netos = calcularNetosLiquidacion(items, totalGastos);
  return (
    <div
      style={{
        padding: '1rem',
        borderRadius: '12px',
        background: destacado ? 'rgba(13,148,136,0.1)' : 'transparent',
        border: destacado ? '2px solid rgba(13,148,136,0.45)' : '1px solid var(--border)',
      }}
    >
      <p className="muted" style={{ margin: 0, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700 }}>
        {titulo}
      </p>
      <p className="muted" style={{ margin: '0.2rem 0 0.55rem', fontSize: '0.78rem' }}>{subtitulo}</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', rowGap: '0.3rem', columnGap: '1rem', fontSize: '0.92rem' }}>
        <span>
          Créditos cobrados <span className="muted" style={{ fontSize: '0.78rem' }}>({creditos.length} mov.)</span>
        </span>
        <strong style={{ textAlign: 'right' }}>{fmtMonto(totalCreditos)}</strong>
        <span>
          Efectivo por mercancía vendida <span className="muted" style={{ fontSize: '0.78rem' }}>({efectivo.length} mov.)</span>
        </span>
        <strong style={{ textAlign: 'right' }}>{fmtMonto(totalEfectivo)}</strong>
        {totalGastos > 0 && (
          <>
            <span style={{ color: 'var(--brand-red)' }}>Gastos aceptados</span>
            <strong style={{ textAlign: 'right', color: 'var(--brand-red)' }}>−{fmtMonto(totalGastos)}</strong>
          </>
        )}
      </div>
      <div
        style={{
          marginTop: '0.5rem',
          paddingTop: '0.5rem',
          borderTop: '1px dashed rgba(13,148,136,0.4)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: '0.5rem',
        }}
      >
        <span className="muted" style={{ fontSize: '0.8rem' }}>Neto a acreditar ({cuentaRtLabel})</span>
        <strong style={{ fontSize: '1.3rem', color: 'var(--brand-blue)' }}>{fmtMonto(netos.netoMercancia)}</strong>
      </div>
      <button
        type="button"
        className="btn btn-danger"
        style={{ marginTop: '0.75rem' }}
        disabled={guardando || items.length === 0}
        onClick={onClick}
      >
        {guardando ? 'Sellando…' : `${boton} · ${fmtMonto(netos.netoMercancia)}`}
      </button>
    </div>
  );
}

/**
 * Pantallas 2 y 3 de Pendientes por liquidar: tiendas del recolector y
 * recolecciones de una tienda (créditos cobrados vs efectivo por mercancía).
 */
export default function PendientesRecolectorTiendas({
  movimientos,
  selIds,
  setSelIds,
  tiendaAbierta,
  setTiendaAbierta,
  totalGastos,
  cuentaRtLabel,
  guardando,
  onLiquidar,
  onImprimir,
  bloqueGastos,
}) {
  const tiendas = useMemo(() => resumenPorTiendaConCatalogo(movimientos, []), [movimientos]);
  const tiendaActiva = tiendas.find((t) => t.tienda === tiendaAbierta) || null;
  const desgloseTotal = useMemo(() => separarCreditosYEfectivo(movimientos), [movimientos]);
  const desgloseTienda = useMemo(
    () => (tiendaActiva ? separarCreditosYEfectivo(tiendaActiva.items) : null),
    [tiendaActiva],
  );
  const seleccionadosTodos = useMemo(() => movimientos.filter((m) => selIds[m.id]), [movimientos, selIds]);
  const seleccionadosTienda = useMemo(
    () => (tiendaActiva ? tiendaActiva.items.filter((m) => selIds[m.id]) : []),
    [tiendaActiva, selIds],
  );

  return (
    <div style={{ marginTop: '1rem' }}>
      {!tiendaActiva && (
        <div className="card" style={{ padding: '0.85rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
            <h4 style={{ margin: 0, color: 'var(--brand-blue)' }}>Tiendas con efectivo en tránsito</h4>
            <button type="button" className="btn btn-ghost" style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }} onClick={onImprimir}>
              Imprimir reporte
            </button>
          </div>
          <p className="muted" style={{ margin: '0 0 0.75rem', fontSize: '0.8rem' }}>
            Toca una tienda para ver sus recolecciones. Total en tránsito: <strong>{fmtMonto(desgloseTotal.total)}</strong> ·{' '}
            {movimientos.length} movimiento(s).
          </p>
          <div className="table-wrap">
            <table className="table" style={{ fontSize: '0.85rem' }}>
              <thead>
                <tr>
                  <th>Tienda</th>
                  <th style={{ textAlign: 'right' }}>Créditos cobrados</th>
                  <th style={{ textAlign: 'right' }}>Efectivo mercancía</th>
                  <th style={{ textAlign: 'right' }}>Mov.</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {tiendas.map((t) => {
                  const d = separarCreditosYEfectivo(t.items);
                  return (
                    <tr
                      key={t.tienda}
                      onClick={() => setTiendaAbierta(t.tienda)}
                      style={{ cursor: 'pointer' }}
                      title={`Ver recolecciones de ${t.tienda}`}
                    >
                      <td><strong>{t.tienda}</strong></td>
                      <td style={{ textAlign: 'right', color: d.totalCreditos ? 'var(--brand-blue)' : 'var(--muted)' }}>
                        {d.totalCreditos ? fmtMonto(d.totalCreditos) : '—'}
                      </td>
                      <td style={{ textAlign: 'right', color: d.totalEfectivo ? '#0d9488' : 'var(--muted)' }}>
                        {d.totalEfectivo ? fmtMonto(d.totalEfectivo) : '—'}
                      </td>
                      <td style={{ textAlign: 'right' }}>{t.count}</td>
                      <td style={{ textAlign: 'right' }}><strong>{fmtMonto(t.total)}</strong></td>
                    </tr>
                  );
                })}
                <tr style={{ background: 'var(--surface-2)' }}>
                  <td><strong>Total</strong></td>
                  <td style={{ textAlign: 'right' }}><strong>{fmtMonto(desgloseTotal.totalCreditos)}</strong></td>
                  <td style={{ textAlign: 'right' }}><strong>{fmtMonto(desgloseTotal.totalEfectivo)}</strong></td>
                  <td style={{ textAlign: 'right' }}><strong>{movimientos.length}</strong></td>
                  <td style={{ textAlign: 'right' }}><strong>{fmtMonto(desgloseTotal.total)}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tiendaActiva && desgloseTienda && (
        <div className="card" style={{ padding: '0.85rem', borderLeft: '4px solid var(--brand-blue)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-ghost" style={{ fontSize: '0.85rem' }} onClick={() => setTiendaAbierta(null)}>
              ← Tiendas
            </button>
            <h4 style={{ margin: 0, color: 'var(--brand-blue)' }}>
              {tiendaActiva.tienda} · {fmtMonto(tiendaActiva.total)}
            </h4>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.65rem' }}>
            {tiendas.map((t) => (
              <button
                key={t.tienda}
                type="button"
                className={t.tienda === tiendaActiva.tienda ? 'btn btn-primary' : 'btn btn-ghost'}
                style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}
                onClick={() => setTiendaAbierta(t.tienda)}
              >
                {t.tienda} {fmtMonto(t.total)}
              </button>
            ))}
          </div>

          <SeccionMovimientos
            titulo="Créditos cobrados"
            nota="Pagos de crédito que el recolector cobró a clientes."
            credito
            items={desgloseTienda.creditos}
            selIds={selIds}
            setSelIds={setSelIds}
          />
          <SeccionMovimientos
            titulo="Efectivo por mercancía vendida"
            nota="Ventas del camión pagadas en efectivo."
            credito={false}
            items={desgloseTienda.efectivo}
            selIds={selIds}
            setSelIds={setSelIds}
          />
        </div>
      )}

      {bloqueGastos}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: tiendaActiva ? 'repeat(auto-fit, minmax(280px, 1fr))' : '1fr',
          gap: '0.75rem',
          marginTop: '1rem',
        }}
      >
        {tiendaActiva && (
          <ResumenLiquidar
            titulo={`Liquidar solo ${tiendaActiva.tienda}`}
            subtitulo="Solo los movimientos marcados de esta tienda."
            items={seleccionadosTienda}
            totalGastos={totalGastos}
            cuentaRtLabel={cuentaRtLabel}
            boton={`Sellar ${tiendaActiva.tienda}`}
            guardando={guardando}
            onClick={() => onLiquidar(seleccionadosTienda, `la tienda ${tiendaActiva.tienda}`)}
          />
        )}
        <ResumenLiquidar
          titulo="Liquidar todo el efectivo en tránsito"
          subtitulo="Todas las tiendas de este recolector (solo lo marcado)."
          items={seleccionadosTodos}
          totalGastos={totalGastos}
          cuentaRtLabel={cuentaRtLabel}
          boton="Sellar todo"
          guardando={guardando}
          destacado
          onClick={() => onLiquidar(seleccionadosTodos, 'todo el efectivo en tránsito')}
        />
      </div>
    </div>
  );
}
