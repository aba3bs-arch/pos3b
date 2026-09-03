import React, { useCallback, useEffect, useMemo, useState } from 'react';
import FiltroPeriodo from './FiltroPeriodo.jsx';
import { PRESETS_FECHA_PRODUCTO, rangoDesdePreset } from '../lib/consultasInventario.js';
import { listarSucursalesOperativas, etiquetaTienda, esAlmacenCentral } from '../constants/sucursales.js';
import {
  cargarDatosConciliacion,
  sellarConciliacion,
  listarConciliaciones,
  anularConciliacion,
  inicializarSeleccion,
  totalesSeleccion,
  fmtMonto,
} from '../lib/conciliacionesAbarrotes.js';
import { fmtFechaCorta } from '../lib/fechas.js';
import { fmtFechaHora } from '../lib/controlEfectivo.js';

const PRESETS = PRESETS_FECHA_PRODUCTO;

function colorDiff(n) {
  if (Math.abs(Number(n) || 0) < 0.01) return '#047857';
  if (n > 0) return '#0f766e';
  return '#b45309';
}

function CheckAll({ items, sel, onChange }) {
  const ids = items.map((i) => i.id);
  const checked = ids.length > 0 && ids.every((id) => sel[id]);
  const partial = !checked && ids.some((id) => sel[id]);
  return (
    <input
      type="checkbox"
      checked={checked}
      ref={(el) => {
        if (el) el.indeterminate = partial;
      }}
      onChange={(e) => {
        const next = { ...sel };
        for (const id of ids) next[id] = e.target.checked;
        onChange(next);
      }}
    />
  );
}

function TablaMovs({ titulo, color, rows, sel, onSel, columnas }) {
  return (
    <div className="card" style={{ padding: '0.85rem', overflow: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <h3 style={{ margin: 0, color, fontSize: '1rem' }}>{titulo}</h3>
        <span className="muted" style={{ fontSize: '0.8rem' }}>{rows.length} mov.</span>
      </div>
      {!rows.length ? (
        <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>Sin movimientos en el periodo.</p>
      ) : (
        <table className="table" style={{ fontSize: '0.82rem', width: '100%' }}>
          <thead>
            <tr>
              <th style={{ width: 28 }}>
                <CheckAll items={rows} sel={sel} onChange={onSel} />
              </th>
              {columnas.map((c) => (
                <th key={c.key}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={Boolean(sel[r.id])}
                    onChange={(e) => onSel({ ...sel, [r.id]: e.target.checked })}
                  />
                </td>
                {columnas.map((c) => (
                  <td key={c.key} style={c.align ? { textAlign: c.align } : undefined}>
                    {c.render ? c.render(r) : r[c.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** Panel principal de Conciliaciones Abarrotes. */
export default function PanelConciliaciones({ supabase, user }) {
  const [preset, setPreset] = useState('hoy');
  const [desde, setDesde] = useState(() => rangoDesdePreset('hoy')?.desde || '');
  const [hasta, setHasta] = useState(() => rangoDesdePreset('hoy')?.hasta || '');
  const [sucursal, setSucursal] = useState('');
  const [repartidorId, setRepartidorId] = useState('');
  const [proveedorFiltro, setProveedorFiltro] = useState('');
  const [incluirGastosRecolector, setIncluirGastosRecolector] = useState(true);
  const [incluirEnTransito, setIncluirEnTransito] = useState(true);

  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [datos, setDatos] = useState(null);
  const [selEnt, setSelEnt] = useState({});
  const [selSal, setSelSal] = useState({});
  const [notas, setNotas] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [historial, setHistorial] = useState([]);
  const [tab, setTab] = useState('conciliar');

  const tiendas = useMemo(
    () => listarSucursalesOperativas().filter((t) => !esAlmacenCentral(t)),
    [],
  );

  const cambiarPreset = (p) => {
    setPreset(p);
    if (p !== 'rango') {
      const r = rangoDesdePreset(p);
      if (r) {
        setDesde(r.desde);
        setHasta(r.hasta);
      }
    }
  };

  const cargar = useCallback(async () => {
    if (!supabase || !desde || !hasta) return;
    setCargando(true);
    setError(null);
    setAviso(null);
    try {
      const res = await cargarDatosConciliacion(supabase, {
        desde,
        hasta,
        sucursal: sucursal || null,
        repartidorId: repartidorId || null,
        proveedorFiltro,
        incluirGastosRecolector,
        incluirEnTransito,
      });
      if (!res.ok) {
        setError(res.error);
        setDatos(null);
        return;
      }
      setDatos(res);
      setSelEnt(inicializarSeleccion(res.entradas));
      setSelSal(inicializarSeleccion(res.salidas));
      if (res.avisos?.length) setAviso(res.avisos.join(' · '));

      const hist = await listarConciliaciones(supabase, { limite: 30 });
      if (hist.aviso) setAviso((prev) => [prev, hist.aviso].filter(Boolean).join(' · '));
      if (hist.ok) setHistorial(hist.data || []);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setCargando(false);
    }
  }, [
    supabase,
    desde,
    hasta,
    sucursal,
    repartidorId,
    proveedorFiltro,
    incluirGastosRecolector,
    incluirEnTransito,
  ]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const tot = useMemo(
    () => totalesSeleccion(datos?.entradas, datos?.salidas, selEnt, selSal),
    [datos, selEnt, selSal],
  );

  const sellar = async () => {
    if (!tot.entradas.length && !tot.salidas.length) {
      alert('Selecciona movimientos para sellar.');
      return;
    }
    const msg =
      `¿Sellar conciliación?\n\n` +
      `Entradas (colectado): ${fmtMonto(tot.totalEntradas)}\n` +
      `Salidas (proveedor/gastos): ${fmtMonto(tot.totalSalidas)}\n` +
      `Diferencia: ${fmtMonto(tot.diferencia)}\n\n` +
      `${tot.entradas.length} entradas · ${tot.salidas.length} salidas`;
    if (!confirm(msg)) return;
    setGuardando(true);
    const r = await sellarConciliacion(supabase, {
      desde,
      hasta,
      sucursal: sucursal || null,
      repartidorId: repartidorId || null,
      proveedorFiltro,
      entradas: tot.entradas,
      salidas: tot.salidas,
      totalEntradas: tot.totalEntradas,
      totalSalidas: tot.totalSalidas,
      diferencia: tot.diferencia,
      notas,
      user,
    });
    setGuardando(false);
    if (!r.ok) {
      alert(r.error);
      return;
    }
    alert(`Conciliación sellada: ${r.data?.folio || 'OK'}`);
    setNotas('');
    await cargar();
    setTab('historial');
  };

  const anular = async (row) => {
    if (!confirm(`¿Anular ${row.folio}?`)) return;
    const motivo = prompt('Motivo de anulación (opcional):') || '';
    const r = await anularConciliacion(supabase, row.id, { user, motivo });
    if (!r.ok) alert(r.error);
    else await cargar();
  };

  const colsEntrada = [
    { key: 'ymd', label: 'Fecha', render: (r) => fmtFechaCorta(r.ymd) },
    { key: 'tienda', label: 'Tienda', render: (r) => etiquetaTienda(r.tienda) || r.tienda },
    { key: 'etiqueta', label: 'Tipo' },
    { key: 'folio', label: 'Folio' },
    { key: 'repartidor', label: 'Repartidor' },
    { key: 'estatus', label: 'Estatus' },
    { key: 'monto', label: 'Monto', align: 'right', render: (r) => fmtMonto(r.monto) },
  ];

  const colsSalida = [
    { key: 'ymd', label: 'Fecha', render: (r) => fmtFechaCorta(r.ymd) },
    { key: 'tienda', label: 'Tienda', render: (r) => etiquetaTienda(r.tienda) || r.tienda },
    { key: 'etiqueta', label: 'Tipo' },
    { key: 'proveedor', label: 'Proveedor / detalle', render: (r) => r.proveedor || r.detalle || '—' },
    { key: 'folio', label: 'Subcat / folio' },
    { key: 'monto', label: 'Monto', align: 'right', render: (r) => fmtMonto(r.monto) },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          className={`btn ${tab === 'conciliar' ? '' : 'btn-ghost'}`}
          onClick={() => setTab('conciliar')}
        >
          Conciliar
        </button>
        <button
          type="button"
          className={`btn ${tab === 'historial' ? '' : 'btn-ghost'}`}
          onClick={() => setTab('historial')}
        >
          Historial ({historial.filter((h) => h.estatus === 'sellada').length})
        </button>
      </div>

      {tab === 'conciliar' && (
        <>
          <div className="card" style={{ padding: '0.9rem', display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <FiltroPeriodo
              preset={preset}
              onPresetChange={cambiarPreset}
              desde={desde}
              hasta={hasta}
              onDesdeChange={setDesde}
              onHastaChange={setHasta}
              presets={PRESETS}
            />
            <label className="muted" style={{ display: 'block' }}>
              Tienda
              <select className="select" style={{ marginTop: '0.35rem', width: '100%' }} value={sucursal} onChange={(e) => setSucursal(e.target.value)}>
                <option value="">Todas</option>
                {tiendas.map((t) => (
                  <option key={t} value={t}>
                    {etiquetaTienda(t) || t}
                  </option>
                ))}
              </select>
            </label>
            <label className="muted" style={{ display: 'block' }}>
              Repartidor
              <select
                className="select"
                style={{ marginTop: '0.35rem', width: '100%' }}
                value={repartidorId}
                onChange={(e) => setRepartidorId(e.target.value)}
              >
                <option value="">Todos</option>
                {(datos?.repartidores || []).map((r) => (
                  <option key={r.id} value={r.id}>{r.nombre}</option>
                ))}
              </select>
            </label>
            <label className="muted" style={{ display: 'block' }}>
              Proveedor (filtro salidas)
              <input
                className="input"
                style={{ marginTop: '0.35rem', width: '100%' }}
                list="conc-prov-list"
                value={proveedorFiltro}
                onChange={(e) => setProveedorFiltro(e.target.value)}
                placeholder="Ej. cigarro, tecnología…"
              />
              <datalist id="conc-prov-list">
                {(datos?.proveedoresCatalogo || []).map((p) => (
                  <option key={p.id} value={p.nombre} />
                ))}
                {(datos?.porProveedor || []).map((p) => (
                  <option key={`pp-${p.nombre}`} value={p.nombre} />
                ))}
              </datalist>
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', justifyContent: 'flex-end' }}>
              <label style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', fontSize: '0.85rem' }}>
                <input type="checkbox" checked={incluirEnTransito} onChange={(e) => setIncluirEnTransito(e.target.checked)} />
                Incluir en tránsito
              </label>
              <label style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', fontSize: '0.85rem' }}>
                <input type="checkbox" checked={incluirGastosRecolector} onChange={(e) => setIncluirGastosRecolector(e.target.checked)} />
                Incluir gastos del recolector
              </label>
              <button type="button" className="btn btn-ghost" onClick={() => void cargar()} disabled={cargando}>
                {cargando ? 'Cargando…' : 'Actualizar'}
              </button>
            </div>
          </div>

          {error && (
            <div className="card" style={{ padding: '0.75rem', borderColor: '#b45309', color: '#92400e' }}>
              {error}
            </div>
          )}
          {aviso && (
            <p className="muted" style={{ margin: 0, fontSize: '0.82rem' }}>{aviso}</p>
          )}

          {datos && (
            <>
              <div
                className="card"
                style={{
                  padding: '1rem',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                  gap: '0.75rem',
                  background: 'linear-gradient(135deg, #f0fdfa 0%, #fefce8 100%)',
                }}
              >
                <div>
                  <div className="muted" style={{ fontSize: '0.75rem' }}>Colectado (entradas)</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f766e' }}>{fmtMonto(tot.totalEntradas)}</div>
                  <div className="muted" style={{ fontSize: '0.72rem' }}>
                    Rec {fmtMonto(datos.resumenEntradas.recoleccion)} · Créd. tienda {fmtMonto(datos.resumenEntradas.credito_tienda)} · Créd. ruta {fmtMonto(datos.resumenEntradas.credito_ruta)}
                  </div>
                </div>
                <div>
                  <div className="muted" style={{ fontSize: '0.75rem' }}>Pagado proveedor (salidas)</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#b45309' }}>{fmtMonto(tot.totalSalidas)}</div>
                  <div className="muted" style={{ fontSize: '0.72rem' }}>
                    Proveedor {fmtMonto(datos.resumenSalidas.proveedor)} · Gasto recol. {fmtMonto(datos.resumenSalidas.gasto_recolector)}
                  </div>
                </div>
                <div>
                  <div className="muted" style={{ fontSize: '0.75rem' }}>Diferencia</div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 800, color: colorDiff(tot.diferencia) }}>
                    {fmtMonto(tot.diferencia)}
                  </div>
                  <div className="muted" style={{ fontSize: '0.72rem' }}>
                    {Math.abs(tot.diferencia) < 0.01
                      ? 'Cuadra'
                      : tot.diferencia > 0
                        ? 'Sobra colectado vs compras'
                        : 'Falta colectado vs compras'}
                  </div>
                </div>
              </div>

              {datos.porProveedor?.length > 0 && (
                <div className="card" style={{ padding: '0.75rem' }}>
                  <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.9rem', color: '#b5a642' }}>Pagos por proveedor</h4>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {datos.porProveedor.slice(0, 12).map((p) => (
                      <button
                        key={p.nombre}
                        type="button"
                        className="btn btn-ghost"
                        style={{ fontSize: '0.78rem', padding: '0.25rem 0.55rem' }}
                        onClick={() => setProveedorFiltro(p.nombre)}
                        title={`${p.count} pagos`}
                      >
                        {p.nombre}: <strong>{fmtMonto(p.total)}</strong>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
                <TablaMovs
                  titulo="Lo que colecta el repartidor"
                  color="#0f766e"
                  rows={datos.entradas}
                  sel={selEnt}
                  onSel={setSelEnt}
                  columnas={colsEntrada}
                />
                <TablaMovs
                  titulo="Gastos abarrotes en efectivo (proveedor)"
                  color="#b45309"
                  rows={datos.salidas}
                  sel={selSal}
                  onSel={setSelSal}
                  columnas={colsSalida}
                />
              </div>

              <div className="card" style={{ padding: '0.9rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                <label className="muted" style={{ display: 'block' }}>
                  Notas de la conciliación
                  <textarea
                    className="input"
                    rows={2}
                    style={{ marginTop: '0.35rem', width: '100%', resize: 'vertical' }}
                    value={notas}
                    onChange={(e) => setNotas(e.target.value)}
                    placeholder="Ej. conciliación diaria cigarro / tecnología / ropa…"
                  />
                </label>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <button type="button" className="btn" disabled={guardando || cargando} onClick={() => void sellar()}>
                    {guardando ? 'Sellando…' : 'Sellar conciliación'}
                  </button>
                  <span className="muted" style={{ fontSize: '0.8rem' }}>
                    Selección: {tot.entradas.length} entradas · {tot.salidas.length} salidas · diff {fmtMonto(tot.diferencia)}
                  </span>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {tab === 'historial' && (
        <div className="card" style={{ padding: '0.9rem', overflow: 'auto' }}>
          <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)', fontSize: '1rem' }}>Conciliaciones selladas</h3>
          {!historial.length ? (
            <p className="muted" style={{ margin: 0 }}>Aún no hay conciliaciones guardadas.</p>
          ) : (
            <table className="table" style={{ fontSize: '0.85rem', width: '100%' }}>
              <thead>
                <tr>
                  <th>Folio</th>
                  <th>Periodo</th>
                  <th>Entradas</th>
                  <th>Salidas</th>
                  <th>Diff</th>
                  <th>Usuario</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {historial.map((h) => (
                  <tr key={h.id} style={h.estatus === 'anulada' ? { opacity: 0.55 } : undefined}>
                    <td>
                      <div>{h.folio}</div>
                      <div className="muted" style={{ fontSize: '0.72rem' }}>{fmtFechaHora(h.created_at)}</div>
                    </td>
                    <td>{fmtFechaCorta(h.desde)} — {fmtFechaCorta(h.hasta)}</td>
                    <td style={{ textAlign: 'right' }}>{fmtMonto(h.total_entradas)}</td>
                    <td style={{ textAlign: 'right' }}>{fmtMonto(h.total_salidas)}</td>
                    <td style={{ textAlign: 'right', color: colorDiff(h.diferencia), fontWeight: 600 }}>{fmtMonto(h.diferencia)}</td>
                    <td>{h.usuario_nombre || '—'}</td>
                    <td>{h.estatus}</td>
                    <td>
                      {h.estatus === 'sellada' && (
                        <button type="button" className="btn btn-ghost" style={{ fontSize: '0.75rem' }} onClick={() => void anular(h)}>
                          Anular
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
