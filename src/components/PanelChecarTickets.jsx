import React, { useCallback, useEffect, useMemo, useState } from 'react';
import FiltroPeriodo from './FiltroPeriodo.jsx';
import PortalFlotante from './PortalFlotante.jsx';
import { esLayoutMovil } from '../hooks/useMobileLayout.js';
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
  ingresado: { texto: 'Ingresado', color: '#15803d', fondo: 'rgba(21, 128, 61, 0.1)' },
  duplicado: { texto: 'Duplicado', color: '#b91c1c', fondo: 'rgba(185, 28, 28, 0.1)' },
  sin_gasto: { texto: 'Sin gasto', color: '#b45309', fondo: 'rgba(180, 83, 9, 0.12)' },
  credito: { texto: 'Crédito', color: '#0369a1', fondo: 'rgba(3, 105, 161, 0.1)' },
};

/** Teléfono en vertical o horizontal, y ventana angosta. La tabla se queda para escritorio. */
function useChecarMovil() {
  const [movil, setMovil] = useState(() => {
    if (typeof window === 'undefined') return false;
    return esLayoutMovil() || window.innerWidth <= 960;
  });

  useEffect(() => {
    const sync = () => setMovil(esLayoutMovil() || window.innerWidth <= 960);
    sync();
    const mq = window.matchMedia('(max-width: 960px)');
    mq.addEventListener('change', sync);
    window.addEventListener('resize', sync);
    window.addEventListener('orientationchange', sync);
    return () => {
      mq.removeEventListener('change', sync);
      window.removeEventListener('resize', sync);
      window.removeEventListener('orientationchange', sync);
    };
  }, []);

  return movil;
}

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

function ModalTicket({ row, onCerrar, movil }) {
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
        className={movil ? 'checar-modal checar-movil' : 'checar-modal'}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9000,
          background: 'rgba(15, 23, 42, 0.45)',
          display: 'flex',
          alignItems: movil ? 'stretch' : 'flex-start',
          justifyContent: 'center',
          padding: movil
            ? 'env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px) env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px)'
            : '1.25rem',
          overflow: movil ? 'hidden' : 'auto',
        }}
        onClick={onCerrar}
      >
        <div
          className="card checar-modal-card"
          style={{
            width: movil ? '100%' : 'min(860px, 100%)',
            marginTop: movil ? 0 : '1.5rem',
            maxHeight: movil ? '100%' : 'calc(100dvh - 3rem)',
            overflow: 'auto',
            WebkitOverflowScrolling: 'touch',
            borderRadius: movil ? 0 : undefined,
            borderTop: `4px solid ${COLOR}`,
            paddingBottom: movil ? 'calc(1rem + env(safe-area-inset-bottom, 0px))' : undefined,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="checar-modal-head" style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: movil ? 'nowrap' : 'wrap', alignItems: 'flex-start' }}>
            <div style={{ minWidth: 0 }}>
              <h3 style={{ margin: 0, color: COLOR }}>{row.proveedor}</h3>
              <p className="muted" style={{ margin: '0.3rem 0 0', fontSize: '0.82rem' }}>
                {[row.tienda, row.fecha_ymd, row.folio && row.folio !== '—' ? `Folio ${row.folio}` : '']
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              {movil ? null : (
                <p style={{ margin: '0.45rem 0 0', fontSize: '0.85rem' }}>
                  Compara este ticket electrónico con el ticket físico del proveedor. Las piezas ingresadas son las que
                  entraron al inventario.
                </p>
              )}
            </div>
            <button type="button" className="btn btn-ghost checar-cerrar" onClick={onCerrar}>
              Cerrar
            </button>
          </div>

          <div className="checar-modal-kpis">
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
          ) : movil ? (
            <div className="checar-lineas">
              {lineas.map((l) => (
                <div key={l.clave} className="checar-linea">
                  <div style={{ fontWeight: 800 }}>{l.nombre}</div>
                  <div className="checar-linea-nums">
                    <span>Ticket <strong>{l.qty_ticket}</strong></span>
                    <span>Ingresada <strong>{l.qty_inventario}</strong></span>
                    <span style={{ color: l.qty_diff === 0 ? undefined : COLOR_LINEA[l.estado], fontWeight: 700 }}>
                      {l.qty_diff > 0 ? `+${l.qty_diff}` : l.qty_diff}
                    </span>
                    <span style={{ color: COLOR_LINEA[l.estado] || '#64748b', fontWeight: 700 }}>
                      {ETIQUETA_LINEA[l.estado] || l.estado}
                    </span>
                  </div>
                </div>
              ))}
            </div>
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

          <div className="checar-modal-acciones" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.9rem' }}>
            <button type="button" className="btn checar-imprimir" style={{ background: COLOR, color: '#fff' }} onClick={() => imprimirElectronico(fila)}>
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

function diaDe(ymd, dias) {
  return (dias || []).find((d) => d.ymd === ymd) || null;
}

function SemanaMovil({ dias, piezasDia }) {
  if (!dias.length) return null;
  return (
    <div className="checar-semana-wrap">
      <div className="checar-semana-titulo">Piezas por día</div>
      <div className="checar-semana" aria-label="Piezas ingresadas por día">
        {dias.map((d) => {
          const n = Number(piezasDia[d.ymd]) || 0;
          const txt = n > 0 ? (Number.isInteger(n) ? String(n) : n.toFixed(1)) : '—';
          return (
            <div key={d.ymd} className={`checar-semana-dia${n > 0 ? ' checar-semana-dia--on' : ''}`}>
              <span>{d.dow}</span>
              <strong>{d.dia}</strong>
              <em>{txt}</em>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TarjetaMovil({ row, dias, onVer }) {
  const meta = GASTO_META[row.gastoEstado] || GASTO_META.sin_gasto;
  const dia = diaDe(row.fecha_ymd, dias);
  const celda = row.celdas?.[row.fecha_ymd];
  const distinto = celda && celda.piezasTicket > 0 && Math.abs(celda.piezas - celda.piezasTicket) > 0.001;
  const puedeVer = row.tieneTicket || row.ticketFuera;
  const cuando = [
    dia ? `${dia.dow} ${dia.dia}` : fechaCorta(row.fecha_ymd),
    row.tienda,
  ].filter(Boolean).join(' · ');

  return (
    <article className="checar-card">
      <header className="checar-card-head">
        <div style={{ minWidth: 0 }}>
          <div className="checar-card-nombre">{row.proveedor}</div>
          {cuando ? <div className="checar-card-cuando">{cuando}</div> : null}
        </div>
        {row.folio && row.folio !== '—' ? <code className="checar-card-folio">{row.folio}</code> : null}
      </header>

      <div className="checar-card-piezas">
        {row.tieneTicket ? (
          <>
            <div className={`checar-card-piezas-num${row.piezas > 0 ? '' : ' checar-card-piezas-num--aviso'}`}>
              {row.piezas > 0 ? piezasTexto(row.piezas) : 'Sin ingreso'}
            </div>
            <div className="muted">{row.piezas > 0 ? 'ingresadas al inventario' : 'el ticket no entró al inventario'}</div>
            {distinto ? (
              <div className="checar-card-aviso">En el ticket físico van {piezasTexto(celda.piezasTicket)}</div>
            ) : row.piezas > 0 && row.piezasTicket > 0 ? (
              <div className="muted">Coincide con el ticket</div>
            ) : null}
          </>
        ) : (
          <>
            <div className="checar-card-piezas-num" style={{ color: '#7c3aed' }}>Sin ticket</div>
            <div className="muted">Hay gasto y no hay ticket electrónico</div>
          </>
        )}
      </div>

      <div className="checar-card-gasto" style={{ color: meta.color, background: meta.fondo }}>
        <span className="checar-card-gasto-label">Gasto</span>
        <strong>{row.montoGasto > 0 ? fmtMonto(row.montoGasto) : meta.texto}</strong>
        {row.montoGasto > 0 ? (
          <span>
            {row.nGastos > 1 ? `${row.nGastos} gastos` : meta.texto}
            {row.gastos?.[0]?.fecha_ymd ? ` · ${fechaCorta(row.gastos[0].fecha_ymd)}` : ''}
          </span>
        ) : null}
      </div>

      {puedeVer ? (
        <button type="button" className="btn checar-ver-ticket" onClick={() => onVer(row)}>
          Ver ticket y comparar
        </button>
      ) : null}
    </article>
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
  const movil = useChecarMovil();
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
    <div className={movil ? 'checar-root checar-movil' : 'checar-root'} style={{ display: 'flex', flexDirection: 'column', gap: movil ? '0.75rem' : '1rem' }}>
      <div className="card checar-panel" style={{ borderTop: `4px solid ${COLOR}` }}>
        <div className="checar-filtros">
          <div className="checar-filtro-ancho">
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
          </div>
          <label className="muted checar-filtro" style={{ display: 'block', minWidth: 160 }}>
            Tienda
            <select className="select" style={{ marginTop: '0.35rem' }} value={tienda} onChange={(e) => setTienda(e.target.value)}>
              {tiendas.map((t) => (
                <option key={t.id || 'all'} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <div className="checar-filtro-acciones">
            <label className="muted checar-filtro" style={{ display: 'block', minWidth: 0, flex: '1 1 140px' }}>
              Ver
              <select className="select" style={{ marginTop: '0.35rem' }} value={filtro} onChange={(e) => setFiltro(e.target.value)}>
                <option value="todos">Todos</option>
                <option value="sin_gasto">Sin gasto</option>
                <option value="sin_ticket">Gasto sin ticket</option>
                <option value="con_ticket">Con ticket</option>
              </select>
            </label>
            <button type="button" className="btn checar-actualizar" style={{ background: COLOR, color: '#fff' }} disabled={cargando} onClick={() => void cargar()}>
              {cargando ? 'Cargando…' : 'Actualizar'}
            </button>
          </div>
        </div>
        {error ? <p style={{ color: '#b91c1c', margin: '0.65rem 0 0' }}>{error}</p> : null}
        {aviso ? <p className="muted" style={{ margin: '0.65rem 0 0' }}>{aviso}</p> : null}
        {tablero?.truncado ? (
          <p className="muted" style={{ margin: '0.65rem 0 0' }}>
            El tablero muestra los primeros {dias.length} días. Acorta el rango para ver el resto.
          </p>
        ) : null}
      </div>

      {movil ? (
        <div className="checar-resumen-movil" aria-label="Resumen">
          <div><strong>{resumen?.registros ?? 0}</strong><span>registros</span></div>
          <div><strong>{resumen ? piezasTexto(resumen.piezas) : '0 pzas'}</strong><span>ingresadas</span></div>
          <div><strong>{resumen?.gastos ?? 0}</strong><span>gastos{resumen ? ` · ${fmtMonto(resumen.montoGasto)}` : ''}</span></div>
          <div><strong style={{ color: '#b45309' }}>{resumen?.sinGasto ?? 0}</strong><span>sin gasto</span></div>
          <div><strong style={{ color: '#7c3aed' }}>{resumen?.sinTicket ?? 0}</strong><span>sin ticket</span></div>
        </div>
      ) : (
        <div className="checar-kpis">
          <Kpi label="Registros" value={resumen?.registros ?? 0} />
          <Kpi label="Piezas ingresadas" value={resumen ? piezasTexto(resumen.piezas) : '0 pzas'} accent={COLOR} />
          <Kpi label="Gastos ingresados" value={resumen?.gastos ?? 0} accent="#15803d" sub={resumen ? fmtMonto(resumen.montoGasto) : ''} />
          <Kpi label="Sin gasto" value={resumen?.sinGasto ?? 0} accent="#b45309" />
          <Kpi label="Gasto sin ticket" value={resumen?.sinTicket ?? 0} accent="#7c3aed" />
        </div>
      )}

      {!rows.length ? (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <p className="muted" style={{ padding: '0.9rem' }}>
            {cargando ? 'Cargando…' : 'No hay tickets ni gastos de proveedores en este rango.'}
          </p>
        </div>
      ) : movil ? (
          <div className="checar-lista">
            <SemanaMovil dias={dias} piezasDia={piezasDia} />
            {rows.map((r, i) => (
              <TarjetaMovil key={`${r.id}-${i}`} row={r} dias={dias} onVer={setAbierto} />
            ))}
            <div className="checar-total-movil">
              <span>Gasto en pantalla</span>
              <strong>{fmtMonto(gastoVisible)}</strong>
            </div>
          </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
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
        </div>
      )}

      {abierto ? <ModalTicket row={abierto} movil={movil} onCerrar={() => setAbierto(null)} /> : null}

      <style>{`
        .checar-filtros {
          display: flex;
          flex-wrap: wrap;
          gap: 0.75rem;
          align-items: flex-end;
        }
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
        .checar-kpis {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
          gap: 0.65rem;
        }
        .checar-modal-kpis {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
          gap: 0.55rem;
          margin: 0.9rem 0;
        }
        .checar-lineas { display: flex; flex-direction: column; gap: 0.45rem; }
        .checar-linea {
          border: 1px solid var(--border, #e2e8f0);
          border-radius: 12px;
          padding: 0.6rem 0.7rem;
        }
        .checar-linea-nums {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.25rem 0.6rem;
          margin-top: 0.35rem;
          font-size: 0.82rem;
        }
        .checar-movil { max-width: 100%; min-width: 0; }
        .checar-movil .checar-ayuda { font-size: 0.8rem; }
        .checar-filtro-acciones {
          display: flex;
          gap: 0.75rem;
          align-items: flex-end;
        }
        .checar-movil .checar-filtros {
          display: flex;
          flex-direction: column;
          align-items: stretch;
          gap: 0.65rem;
        }
        .checar-movil .checar-filtro,
        .checar-movil .checar-filtro-ancho,
        .checar-movil .checar-filtro-acciones { min-width: 0 !important; width: 100%; }
        .checar-movil .checar-filtro .select { width: 100%; }
        .checar-movil .checar-filtro-acciones {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          gap: 0.5rem;
          align-items: end;
        }
        .checar-movil .checar-actualizar { width: 100%; min-height: 48px; font-size: 1rem; }
        .checar-movil .checar-resumen-movil {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 0.4rem;
        }
        .checar-movil .checar-resumen-movil > div {
          background: var(--card, #fff);
          border: 1px solid var(--border, #e2e8f0);
          border-radius: 12px;
          padding: 0.45rem 0.35rem;
          text-align: center;
          min-width: 0;
        }
        .checar-movil .checar-resumen-movil strong {
          display: block;
          color: #0f766e;
          font-size: 1rem;
          line-height: 1.15;
        }
        .checar-movil .checar-resumen-movil span {
          display: block;
          margin-top: 0.12rem;
          color: var(--muted, #64748b);
          font-size: 0.68rem;
          line-height: 1.2;
        }
        @media (orientation: landscape) and (max-height: 520px) {
          .checar-movil .checar-filtros {
            display: grid;
            grid-template-columns: 1.15fr 1fr;
            gap: 0.45rem 0.6rem;
            align-items: end;
          }
          .checar-movil .checar-filtro-acciones { grid-column: 1 / -1; }
          .checar-movil .checar-resumen-movil { grid-template-columns: repeat(5, minmax(0, 1fr)); }
        }
        .checar-movil .checar-panel { padding: 0.85rem 0.8rem; }
        .checar-movil .checar-kpis {
          grid-template-columns: 1fr 1fr;
          gap: 0.5rem;
        }
        .checar-movil .checar-kpis .card {
          min-width: 0;
          padding: 0.7rem 0.75rem;
        }
        .checar-movil .checar-kpis .card > .muted:first-child {
          white-space: normal;
          letter-spacing: 0;
          line-height: 1.25;
          font-size: 0.68rem;
        }
        .checar-movil .checar-kpis .card > div:nth-child(2) { font-size: 1.15rem; }
        .checar-movil .checar-lista { display: flex; flex-direction: column; gap: 0.7rem; }
        .checar-movil .checar-semana-wrap {
          background: var(--card, #fff);
          border: 1px solid var(--border, #e2e8f0);
          border-radius: 16px;
          padding: 0.7rem 0.7rem 0.75rem;
        }
        .checar-movil .checar-semana-titulo {
          font-size: 0.72rem;
          font-weight: 800;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: var(--muted, #64748b);
          margin-bottom: 0.45rem;
        }
        .checar-movil .checar-semana {
          display: flex;
          gap: 0.4rem;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          scroll-snap-type: x mandatory;
          scrollbar-width: none;
        }
        .checar-movil .checar-semana::-webkit-scrollbar { display: none; }
        .checar-movil .checar-semana-dia {
          flex: 1 0 4.5rem;
          scroll-snap-align: start;
          min-height: 4.6rem;
          border-radius: 12px;
          border: 1px solid var(--border, #e2e8f0);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.05rem;
        }
        .checar-movil .checar-semana-dia span {
          font-size: 0.68rem;
          font-weight: 700;
          text-transform: uppercase;
          color: var(--muted, #64748b);
        }
        .checar-movil .checar-semana-dia strong { font-size: 1.05rem; line-height: 1.1; }
        .checar-movil .checar-semana-dia em {
          font-style: normal;
          font-size: 0.78rem;
          font-weight: 700;
          color: var(--muted, #64748b);
        }
        .checar-movil .checar-semana-dia--on {
          border-color: #0f766e;
          background: rgba(15, 118, 110, 0.1);
        }
        .checar-movil .checar-semana-dia--on em { color: #0f766e; }
        .checar-movil .checar-card {
          background: var(--card, #fff);
          border: 1px solid var(--border, #e2e8f0);
          border-radius: 16px;
          padding: 0.9rem 0.9rem 0.85rem;
          box-shadow: var(--shadow, 0 1px 2px rgba(15, 23, 42, 0.06));
        }
        .checar-movil .checar-card-head { display: flex; justify-content: space-between; gap: 0.6rem; align-items: flex-start; }
        .checar-movil .checar-card-nombre { font-weight: 800; font-size: 1.2rem; line-height: 1.2; }
        .checar-movil .checar-card-cuando { margin-top: 0.15rem; font-size: 0.85rem; color: var(--muted, #64748b); }
        .checar-movil .checar-card-folio { font-size: 0.68rem; max-width: 42%; overflow-wrap: anywhere; text-align: right; }
        .checar-movil .checar-card-piezas { margin-top: 0.7rem; }
        .checar-movil .checar-card-piezas-num { font-size: 1.45rem; font-weight: 800; color: #0f766e; line-height: 1.15; }
        .checar-movil .checar-card-piezas-num--aviso { color: #b45309; font-size: 1.2rem; }
        .checar-movil .checar-card-aviso { margin-top: 0.2rem; color: #b45309; font-weight: 700; font-size: 0.85rem; }
        .checar-movil .checar-card-gasto {
          display: flex;
          flex-wrap: wrap;
          align-items: baseline;
          gap: 0.25rem 0.55rem;
          margin-top: 0.7rem;
          padding: 0.65rem 0.7rem;
          border-radius: 12px;
          font-size: 0.95rem;
        }
        .checar-movil .checar-card-gasto strong { font-size: 1.15rem; }
        .checar-movil .checar-card-gasto-label {
          font-size: 0.72rem;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          font-weight: 800;
        }
        .checar-movil .checar-ver-ticket {
          width: 100%;
          min-height: 48px;
          margin-top: 0.7rem;
          background: #0f766e;
          color: #fff;
          font-size: 1rem;
          font-weight: 800;
        }
        .checar-movil .checar-total-movil {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 0.75rem;
          padding: 0.85rem 0.95rem;
          border-radius: 16px;
          background: var(--card, #fff);
          border: 1px solid var(--border, #e2e8f0);
          font-size: 0.95rem;
        }
        .checar-movil .checar-total-movil strong { font-size: 1.15rem; color: #0f766e; }
        .checar-movil .checar-modal-kpis { grid-template-columns: 1fr 1fr; gap: 0.45rem; margin: 0.75rem 0; }
        .checar-movil .checar-modal-kpis .card { min-width: 0; padding: 0.65rem 0.7rem; }
        .checar-movil .checar-modal-head {
          position: sticky;
          top: 0;
          z-index: 2;
          background: var(--card, #fff);
          padding-bottom: 0.45rem;
        }
        .checar-movil .checar-cerrar { min-height: 44px; flex: 0 0 auto; }
        .checar-movil .checar-imprimir { width: 100%; min-height: 48px; font-size: 1rem; }
        .checar-movil .checar-modal-acciones {
          display: block;
          position: sticky;
          bottom: 0;
          background: var(--card, #fff);
          padding-top: 0.65rem;
          padding-bottom: calc(0.2rem + env(safe-area-inset-bottom, 0px));
        }
        .checar-movil .checar-linea { padding: 0.75rem 0.8rem; }
        .checar-movil .checar-linea-nums { font-size: 0.9rem; }
      `}</style>
    </div>
  );
}
