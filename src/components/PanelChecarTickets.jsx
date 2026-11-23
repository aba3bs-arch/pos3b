import React, { useCallback, useEffect, useMemo, useState } from 'react';
import FiltroPeriodo from './FiltroPeriodo.jsx';
import PortalFlotante from './PortalFlotante.jsx';
import { PRESETS_FECHA_PRODUCTO, rangoDesdePreset } from '../lib/consultasInventario.js';
import {
  cargarConsolidacionComprasInventario,
  fmtMonto,
  tiendasFiltroConsolidacionCompras,
} from '../lib/consolidacionComprasInventario.js';
import { armarTableroChecarTickets, rangoSemanaCompleta } from '../lib/checarTicketsCompra.js';
import { COLOR_LINEA, ETIQUETA_LINEA, lineasComparacionRevision } from '../lib/revisionCompras.js';
import { imprimirRecepcionCompra } from '../lib/impresion.js';

const COLOR = '#0f766e';

const PRESETS = [
  { id: 'semana_completa', label: 'Semana (lun a dom)' },
  ...PRESETS_FECHA_PRODUCTO.filter((p) => p.id !== '6m' && p.id !== 'semana'),
];

const GASTO_META = {
  ingresado: { texto: 'Ingresado', color: '#15803d' },
  duplicado: { texto: 'Duplicado', color: '#b91c1c' },
  sin_gasto: { texto: 'Sin gasto', color: '#b45309' },
  credito: { texto: 'Crédito', color: '#0369a1' },
};

function Kpi({ label, value, accent, sub }) {
  return (
    <div className="card" style={{ padding: '0.75rem 0.85rem', borderTop: accent ? `3px solid ${accent}` : undefined }}>
      <div className="muted" style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </div>
      <div style={{ fontSize: '1.25rem', fontWeight: 800, color: accent || COLOR, marginTop: '0.2rem' }}>{value}</div>
      {sub ? <div className="muted" style={{ fontSize: '0.75rem', marginTop: '0.2rem' }}>{sub}</div> : null}
    </div>
  );
}

function fechaCorta(ymd) {
  const partes = String(ymd || '').split('-');
  if (partes.length < 3 || !partes[2]) return '';
  return `${partes[2]}/${partes[1]}`;
}

function piezasTexto(n) {
  const v = Number(n) || 0;
  const txt = Number.isInteger(v) ? String(v) : v.toFixed(2);
  return `${txt} pzas`;
}

function itemsParaImprimir(fila) {
  const fuente = (fila?.lineas_ticket || []).length ? fila.lineas_ticket : (fila?.lineas_inventario || []);
  return fuente
    .map((l) => ({
      id: l.id || l.producto_id || '',
      nombre: l.nombre || l.producto_nombre || 'Producto',
      qty: Math.abs(Number(l.qty ?? l.cantidad) || 0),
      costo: Number(l.costo) || 0,
    }))
    .filter((l) => l.qty > 0);
}

function imprimirElectronico(fila) {
  const items = itemsParaImprimir(fila);
  if (!items.length) {
    alert('Este registro no trae productos para armar el ticket electrónico.');
    return;
  }
  imprimirRecepcionCompra({
    sucursal: fila.sucursal_id,
    proveedor: fila.proveedor,
    folio: fila.folio,
    items,
    total: Number(fila.monto_ticket) || Number(fila.monto_inventario) || 0,
    usuario: fila.gastos?.[0]?.usuario || '',
  });
}

function ModalTicket({ row, onCerrar }) {
  const fila = row?.fuente;
  const lineas = useMemo(() => (fila ? lineasComparacionRevision(fila) : []), [fila]);
  const meta = GASTO_META[row?.gastoEstado] || GASTO_META.sin_gasto;

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onCerrar();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCerrar]);

  if (!row || !fila) return null;

  return (
    <PortalFlotante>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Ticket electrónico"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9000,
          background: 'rgba(15, 23, 42, 0.45)',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          padding: '1.25rem',
          overflow: 'auto',
        }}
        onClick={onCerrar}
      >
        <div
          className="card"
          style={{ width: 'min(860px, 100%)', marginTop: '1.5rem', borderTop: `4px solid ${COLOR}` }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div>
              <h3 style={{ margin: 0, color: COLOR }}>{row.proveedor}</h3>
              <p className="muted" style={{ margin: '0.3rem 0 0', fontSize: '0.82rem' }}>
                {[row.tienda, row.fecha_ymd, row.folio && row.folio !== '—' ? `Folio ${row.folio}` : '']
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              <p style={{ margin: '0.45rem 0 0', fontSize: '0.85rem' }}>
                Compara este ticket electrónico con el ticket físico del proveedor. Las piezas ingresadas son las que
                entraron al inventario.
              </p>
            </div>
            <button type="button" className="btn btn-ghost" onClick={onCerrar}>
              Cerrar
            </button>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: '0.55rem',
              margin: '0.9rem 0',
            }}
          >
            <Kpi label="Piezas ingresadas" value={piezasTexto(row.piezas)} accent={COLOR} />
            <Kpi label="Piezas en ticket" value={piezasTexto(row.piezasTicket)} />
            <Kpi label="Total ticket" value={fmtMonto(row.montoTicket)} />
            <Kpi label="Gasto" value={row.montoGasto > 0 ? fmtMonto(row.montoGasto) : meta.texto} accent={meta.color} />
          </div>

          <div style={{ marginBottom: '0.85rem' }}>
            <div style={{ fontWeight: 700, marginBottom: '0.35rem' }}>Gasto de proveedor</div>
            {row.gastoEstado === 'sin_gasto' ? (
              <p style={{ margin: 0, color: '#b45309', fontWeight: 700 }}>
                No hay gasto de proveedor ligado a este ticket.
              </p>
            ) : row.gastoEstado === 'credito' ? (
              <p style={{ margin: 0, color: '#0369a1' }}>
                Compra a crédito: el gasto se registra hasta el cobro, no en este ticket.
              </p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                {(row.gastos || []).map((g) => (
                  <li key={g.id} style={{ marginBottom: '0.25rem' }}>
                    <strong>{fmtMonto(g.monto)}</strong>
                    <span className="muted">
                      {' '}
                      · {[g.fecha_ymd, g.usuario, g.subcategoria].filter(Boolean).join(' · ') || 'sin detalle'}
                    </span>
                    {g.comentario ? (
                      <div className="muted" style={{ fontSize: '0.78rem' }}>{g.comentario}</div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {!lineas.length ? (
            <p className="muted">Este registro no trae productos. Compara el total con el ticket físico.</p>
          ) : (
            <div className="table-wrap">
              <table className="data" style={{ fontSize: '0.82rem' }}>
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
                    <tr key={l.clave}>
                      <td>{l.nombre}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{l.qty_ticket}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{l.qty_inventario}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: l.qty_diff === 0 ? undefined : COLOR_LINEA[l.estado] }}>
                        {l.qty_diff > 0 ? `+${l.qty_diff}` : l.qty_diff}
                      </td>
                      <td style={{ color: COLOR_LINEA[l.estado] || '#64748b', fontWeight: 700 }}>
                        {ETIQUETA_LINEA[l.estado] || l.estado}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.9rem' }}>
            <button type="button" className="btn" style={{ background: COLOR, color: '#fff' }} onClick={() => imprimirElectronico(fila)}>
              Imprimir ticket electrónico
            </button>
          </div>
        </div>
      </div>
    </PortalFlotante>
  );
}

function CeldaTicket({ row, ymd, onVer }) {
  const celda = row.celdas?.[ymd];
  if (!celda) return <span className="muted">—</span>;
  const distinto = celda.piezasTicket > 0 && Math.abs(celda.piezas - celda.piezasTicket) > 0.001;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.28rem' }}>
      {celda.piezas > 0 ? (
        <strong>{piezasTexto(celda.piezas)}</strong>
      ) : (
        <strong style={{ color: '#b45309' }}>Sin ingreso</strong>
      )}
      {distinto ? (
        <span style={{ fontSize: '0.72rem', color: '#b45309', fontWeight: 700 }}>
          ticket {piezasTexto(celda.piezasTicket)}
        </span>
      ) : null}
      {celda.folio && celda.folio !== '—' ? (
        <code style={{ fontSize: '0.68rem' }}>{celda.folio}</code>
      ) : null}
      <button
        type="button"
        className="btn"
        style={{ padding: '0.28rem 0.5rem', fontSize: '0.75rem', background: COLOR, color: '#fff' }}
        onClick={() => onVer(row)}
      >
        Ver ticket
      </button>
    </div>
  );
}

function CeldaGasto({ row, onVer }) {
  const meta = GASTO_META[row.gastoEstado] || GASTO_META.sin_gasto;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.2rem', minWidth: 108 }}>
      <strong style={{ color: meta.color }}>
        {row.montoGasto > 0 ? fmtMonto(row.montoGasto) : meta.texto}
      </strong>
      {row.montoGasto > 0 ? (
        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: meta.color }}>
          {row.nGastos > 1 ? `${row.nGastos} gastos` : meta.texto}
          {row.gastos?.[0]?.fecha_ymd ? ` · ${fechaCorta(row.gastos[0].fecha_ymd)}` : ''}
        </span>
      ) : null}
      {!row.tieneTicket ? (
        <span style={{ fontSize: '0.72rem', color: '#7c3aed', fontWeight: 700 }}>Sin ticket</span>
      ) : null}
      {row.ticketFuera ? (
        <button
          type="button"
          className="btn"
          style={{ padding: '0.28rem 0.5rem', fontSize: '0.75rem', background: COLOR, color: '#fff' }}
          onClick={() => onVer(row)}
        >
          Ver ticket
        </button>
      ) : null}
    </div>
  );
}

export default function PanelChecarTickets({ supabase }) {
  const [preset, setPreset] = useState('semana_completa');
  const ini = rangoSemanaCompleta();
  const [desde, setDesde] = useState(ini.desde || '');
  const [hasta, setHasta] = useState(ini.hasta || '');
  const [tienda, setTienda] = useState('');
  const [filtro, setFiltro] = useState('todos');
  const [tablero, setTablero] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [abierto, setAbierto] = useState(null);

  const aplicarPreset = (id) => {
    setPreset(id);
    if (id === 'rango') return;
    if (id === 'semana_completa') {
      const sem = rangoSemanaCompleta();
      setDesde(sem.desde);
      setHasta(sem.hasta);
      return;
    }
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
    const res = await cargarConsolidacionComprasInventario(supabase, { desde, hasta, sucursal: tienda });
    setCargando(false);
    if (res.error) setError(res.error);
    if (res.aviso) setAviso(res.aviso);
    setTablero(armarTableroChecarTickets(res.filas || [], { desde, hasta }));
  }, [supabase, desde, hasta, tienda]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const tiendas = useMemo(() => tiendasFiltroConsolidacionCompras(), []);
  const dias = tablero?.dias || [];
  const rows = useMemo(() => {
    const list = tablero?.rows || [];
    if (filtro === 'sin_gasto') return list.filter((r) => r.gastoEstado === 'sin_gasto');
    if (filtro === 'sin_ticket') return list.filter((r) => !r.tieneTicket);
    if (filtro === 'con_ticket') return list.filter((r) => r.tieneTicket);
    return list;
  }, [tablero, filtro]);
  const resumen = tablero?.resumen;
  const piezasDia = useMemo(() => {
    const map = {};
    for (const d of dias) {
      map[d.ymd] = rows.reduce((a, r) => a + (Number(r.celdas?.[d.ymd]?.piezas) || 0), 0);
    }
    return map;
  }, [rows, dias]);
  const gastoVisible = rows.reduce((a, r) => a + (Number(r.montoGasto) || 0), 0);

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
            presets={PRESETS}
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
            Ver
            <select className="select" style={{ marginTop: '0.35rem' }} value={filtro} onChange={(e) => setFiltro(e.target.value)}>
              <option value="todos">Todos</option>
              <option value="sin_gasto">Sin gasto</option>
              <option value="sin_ticket">Gasto sin ticket</option>
              <option value="con_ticket">Con ticket</option>
            </select>
          </label>
          <button type="button" className="btn" style={{ background: COLOR, color: '#fff' }} disabled={cargando} onClick={() => void cargar()}>
            {cargando ? 'Cargando…' : 'Actualizar'}
          </button>
        </div>
        {error ? <p style={{ color: '#b91c1c', margin: '0.65rem 0 0' }}>{error}</p> : null}
        {aviso ? <p className="muted" style={{ margin: '0.65rem 0 0' }}>{aviso}</p> : null}
        {tablero?.truncado ? (
          <p className="muted" style={{ margin: '0.65rem 0 0' }}>
            El tablero muestra los primeros {dias.length} días. Acorta el rango para ver el resto.
          </p>
        ) : null}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.65rem' }}>
        <Kpi label="Registros" value={resumen?.registros ?? 0} />
        <Kpi label="Piezas ingresadas" value={resumen ? piezasTexto(resumen.piezas) : '0 pzas'} accent={COLOR} />
        <Kpi label="Gastos ingresados" value={resumen?.gastos ?? 0} accent="#15803d" sub={resumen ? fmtMonto(resumen.montoGasto) : ''} />
        <Kpi label="Sin gasto" value={resumen?.sinGasto ?? 0} accent="#b45309" />
        <Kpi label="Gasto sin ticket" value={resumen?.sinTicket ?? 0} accent="#7c3aed" />
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {!rows.length ? (
          <p className="muted" style={{ padding: '0.9rem' }}>
            {cargando ? 'Cargando…' : 'No hay tickets ni gastos de proveedores en este rango.'}
          </p>
        ) : (
          <div className="table-wrap table-wrap-sticky-head checar-tickets-wrap">
            <table className="data checar-tickets" style={{ fontSize: '0.8rem' }}>
              <thead>
                <tr>
                  <th className="checar-sticky checar-prov">Proveedor</th>
                  <th className="checar-sticky checar-gasto">Gasto ingresado</th>
                  {dias.map((d) => (
                    <th key={d.ymd} style={{ textAlign: 'left', minWidth: 108 }}>
                      {d.etiqueta}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.id}-${i}`}>
                    <td className="checar-sticky checar-prov">
                      <div style={{ fontWeight: 800 }}>{r.proveedor}</div>
                      {r.tienda ? <div className="muted" style={{ fontSize: '0.72rem' }}>{r.tienda}</div> : null}
                    </td>
                    <td
                      className="checar-sticky checar-gasto"
                      style={{ background: r.gastoEstado === 'sin_gasto' ? 'rgba(180, 83, 9, 0.1)' : undefined }}
                    >
                      <CeldaGasto row={r} onVer={setAbierto} />
                    </td>
                    {dias.map((d) => (
                      <td key={d.ymd} style={{ verticalAlign: 'top' }}>
                        <CeldaTicket row={r} ymd={d.ymd} onVer={setAbierto} />
                      </td>
                    ))}
                  </tr>
                ))}
                <tr>
                  <td className="checar-sticky checar-prov" style={{ fontWeight: 800 }}>Total</td>
                  <td className="checar-sticky checar-gasto" style={{ fontWeight: 800 }}>{fmtMonto(gastoVisible)}</td>
                  {dias.map((d) => (
                    <td key={d.ymd} style={{ fontWeight: 800 }}>
                      {(piezasDia[d.ymd] || 0) > 0 ? piezasTexto(piezasDia[d.ymd]) : '—'}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {abierto ? <ModalTicket row={abierto} onCerrar={() => setAbierto(null)} /> : null}

      <style>{`
        .checar-tickets { border-collapse: separate; border-spacing: 0; }
        .checar-tickets .checar-prov { width: 168px; min-width: 168px; max-width: 168px; left: 0; }
        .checar-tickets .checar-gasto { width: 132px; min-width: 132px; max-width: 132px; left: 168px; box-shadow: 1px 0 0 var(--border, #e2e8f0); }
        .checar-tickets .checar-sticky {
          position: sticky;
          z-index: 2;
          background: var(--card, #fff);
        }
        .checar-tickets-wrap table.checar-tickets thead th { z-index: 3; }
        .checar-tickets-wrap table.checar-tickets thead .checar-sticky {
          z-index: 4;
          background: linear-gradient(180deg, #faf6eb 0%, #f0ead8 100%);
        }
        .checar-tickets-wrap { max-height: min(72vh, 760px); }
      `}</style>
    </div>
  );
}
