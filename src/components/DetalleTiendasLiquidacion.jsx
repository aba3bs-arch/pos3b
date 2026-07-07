import React, { useMemo, useState } from 'react';
import {
  agruparMovimientosPorPeriodo,
  fmtFechaHora,
  fmtMonto,
  listarTiendasEfectivo,
  resumenPorTiendaConCatalogo,
} from '../lib/controlEfectivo.js';

const PERIODOS = [
  { id: 'dia', label: 'Por día' },
  { id: 'semana', label: 'Semanal' },
  { id: 'mes', label: 'Mensual' },
  { id: 'anual', label: 'Anual' },
];

function etiquetaTipo(m) {
  if (m.tipo_movimiento === 'Cobro Servicio') return 'Servicio';
  if (m.tipo_movimiento === 'Entrega Crédito') return 'Crédito';
  if (m.tipo_movimiento === 'Gasto') return 'Gasto';
  return 'Recolección';
}

function CheckIndeterminado({ checked, indeterminate, onChange, ...rest }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
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

function LineaMov({ m, esHistorial, selIds, setSelIds }) {
  const cuerpo = (
    <>
      <span style={{ flex: 1 }}>
        {m.num_traspaso} · {etiquetaTipo(m)} · {fmtFechaHora(m.fecha_hora)}
        {m.cajero_nombre && <span className="muted"> · {m.cajero_nombre}</span>}
        {esHistorial && m.fecha_liquidacion && (
          <span className="muted" style={{ display: 'block', fontSize: '0.75rem' }}>
            Sellado {fmtFechaHora(m.fecha_liquidacion)}
            {m.usuario_liquida ? ` · ${m.usuario_liquida}` : ''}
          </span>
        )}
      </span>
      <strong>{fmtMonto(m.monto)}</strong>
    </>
  );

  if (esHistorial) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 0', borderTop: '1px solid var(--border)', fontSize: '0.85rem' }}>
        {cuerpo}
      </div>
    );
  }

  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 0', borderTop: '1px solid var(--border)', cursor: 'pointer', fontSize: '0.85rem' }}>
      <input type="checkbox" checked={Boolean(selIds[m.id])} onChange={(e) => setSelIds((p) => ({ ...p, [m.id]: e.target.checked }))} />
      {cuerpo}
    </label>
  );
}

export default function DetalleTiendasLiquidacion({ movimientos, esHistorial, diaDe, selIds, setSelIds, sinTitulo = false }) {
  const [tiendaAbierta, setTiendaAbierta] = useState(null);
  const [periodo, setPeriodo] = useState('dia');

  const tiendasCatalogo = useMemo(() => listarTiendasEfectivo(), []);
  const resumen = useMemo(
    () => resumenPorTiendaConCatalogo(movimientos, tiendasCatalogo),
    [movimientos, tiendasCatalogo],
  );

  const tiendaActiva = resumen.find((r) => r.tienda === tiendaAbierta);
  const bloquesPeriodo = useMemo(() => {
    if (!tiendaActiva) return [];
    return agruparMovimientosPorPeriodo(tiendaActiva.items, periodo, { diaDe });
  }, [tiendaActiva, periodo, diaDe]);

  const toggleTienda = (nombre) => {
    setTiendaAbierta((prev) => (prev === nombre ? null : nombre));
    setPeriodo('dia');
  };

  return (
    <div style={{ marginTop: sinTitulo ? 0 : '1rem' }}>
      {!sinTitulo && (
        <>
          <h4 style={{ margin: '0 0 0.5rem', color: 'var(--brand-blue)' }}>Detalle por tienda</h4>
          <p className="muted" style={{ margin: '0 0 0.75rem', fontSize: '0.8rem' }}>
            Pulsa una tienda para ver el desglose por día, semana, mes o año.
          </p>
        </>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        {resumen.map((r) => {
          const activa = tiendaAbierta === r.tienda;
          const tiene = r.count > 0;
          return (
            <button
              key={r.tienda}
              type="button"
              onClick={() => toggleTienda(r.tienda)}
              className={activa ? 'btn btn-primary' : 'btn btn-ghost'}
              style={{
                padding: '0.45rem 0.75rem',
                fontSize: '0.85rem',
                opacity: tiene ? 1 : 0.55,
                border: activa ? undefined : '1px solid var(--border)',
              }}
            >
              <strong>{r.tienda}</strong>
              <span style={{ marginLeft: '0.35rem' }}>{fmtMonto(r.total)}</span>
              {r.count > 0 && <span className="muted" style={{ marginLeft: '0.25rem', fontSize: '0.75rem' }}>({r.count})</span>}
            </button>
          );
        })}
      </div>

      {tiendaActiva && (
        <div className="card" style={{ marginTop: '0.75rem', padding: '0.85rem', borderLeft: '4px solid var(--brand-blue)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
            <h4 style={{ margin: 0, color: 'var(--brand-blue)' }}>
              {tiendaActiva.tienda} · {fmtMonto(tiendaActiva.total)}
            </h4>
            {!esHistorial && tiendaActiva.items.length > 0 && (
              <div style={{ display: 'flex', gap: '0.35rem' }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                  onClick={() => {
                    const val = estadoSeleccion(tiendaActiva.items, selIds) !== 'all';
                    const next = { ...selIds };
                    tiendaActiva.items.forEach((m) => {
                      next[m.id] = val;
                    });
                    setSelIds(next);
                  }}
                >
                  {estadoSeleccion(tiendaActiva.items, selIds) === 'all' ? 'Quitar selección' : 'Seleccionar todo'}
                </button>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.75rem' }}>
            {PERIODOS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={periodo === p.id ? 'btn btn-primary' : 'btn btn-ghost'}
                style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}
                onClick={() => setPeriodo(p.id)}
              >
                {p.label}
              </button>
            ))}
          </div>

          {!tiendaActiva.count ? (
            <p className="muted" style={{ marginTop: '0.75rem' }}>Sin movimientos en el periodo filtrado.</p>
          ) : (
            <div style={{ marginTop: '0.75rem' }}>
              {bloquesPeriodo.map((bloque) => {
                const estado = estadoSeleccion(bloque.items, selIds);
                return (
                  <div key={bloque.key} style={{ marginBottom: '0.65rem' }}>
                    {esHistorial ? (
                      <div style={{ display: 'flex', fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.25rem' }}>
                        <span>{bloque.etiqueta}</span>
                        <span className="muted" style={{ marginLeft: '0.35rem', fontWeight: 400 }}>
                          ({bloque.count} mov.)
                        </span>
                        <span style={{ marginLeft: 'auto' }}>{fmtMonto(bloque.total)}</span>
                      </div>
                    ) : (
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem' }}>
                        <CheckIndeterminado
                          checked={estado === 'all'}
                          indeterminate={estado === 'partial'}
                          onChange={(e) => {
                            const next = { ...selIds };
                            bloque.items.forEach((m) => {
                              next[m.id] = e.target.checked;
                            });
                            setSelIds(next);
                          }}
                        />
                        <span>{bloque.etiqueta}</span>
                        <span className="muted" style={{ fontWeight: 400 }}>({bloque.count})</span>
                        <span style={{ marginLeft: 'auto', fontWeight: 400 }}>{fmtMonto(bloque.total)}</span>
                      </label>
                    )}
                    {periodo === 'dia' &&
                      bloque.items.map((m) => (
                        <LineaMov key={m.id} m={m} esHistorial={esHistorial} selIds={selIds} setSelIds={setSelIds} />
                      ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
