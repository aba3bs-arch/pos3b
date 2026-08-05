import React, { useEffect, useMemo, useState } from 'react';
import FiltroPeriodo from './FiltroPeriodo.jsx';
import { BtnLabel } from './Icon.jsx';
import { imprimirReporte } from '../lib/impresion.js';
import { etiquetaTienda } from '../constants/sucursales.js';
import { etiquetaDepartamento } from '../lib/departamentos.js';
import {
  PRESETS_REPORTE_INVENTARIO,
  agruparReportePorDepartamento,
  cargarFilasReporteInventarioAsync,
  columnasCsvInventario,
  columnasImprimirProductoInventario,
  corregirLineaReporteInventario,
  departamentosEnReporte,
  enriquecerTotalesConReferencia,
  fmtMxnReporte,
  fmtPctReporte,
  foliosDesdeAjustes,
  referenciaInventarioReporte,
  tiendasParaFiltroInventario,
  totalesLineasProducto,
} from '../lib/reporteInventario.js';
import { puedeAjustarInventario } from '../lib/roles.js';

function toCsv(rows, columns) {
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const header = columns.map((c) => esc(c.label)).join(',');
  const lines = rows.map((row) => columns.map((c) => esc(c.value(row))).join(','));
  return [header, ...lines].join('\n');
}

function downloadCsv(name, text) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function fmtDiferencia(n) {
  const d = Number(n);
  if (!Number.isFinite(d)) return '—';
  if (d === 0) return '0';
  return d > 0 ? `+${d}` : String(d);
}

function ModalCorregirLinea({ linea, onCerrar, onGuardar, guardando, error }) {
  const [contada, setContada] = useState(linea?.contado != null ? String(linea.contado) : '');
  const [nota, setNota] = useState('');

  if (!linea) return null;

  return (
    <div
      className="prod-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-corregir-linea-titulo"
      onClick={(e) => {
        if (e.target === e.currentTarget && !guardando) onCerrar();
      }}
    >
      <div className="card" style={{ width: 'min(94vw, 420px)', padding: '1rem' }}>
        <h3 id="modal-corregir-linea-titulo" style={{ margin: '0 0 0.5rem', color: 'var(--brand-blue)' }}>
          Corregir conteo
        </h3>
        <p className="muted" style={{ margin: '0 0 0.75rem', fontSize: '0.85rem' }}>
          {linea.nombre} · <span style={{ fontFamily: 'ui-monospace, monospace' }}>{linea.codigo}</span>
        </p>
        <p className="muted" style={{ margin: '0 0 0.75rem', fontSize: '0.8rem' }}>
          Ajuste {linea.numeroAjuste} · {linea.departamento}
          {linea.corregido ? ' · ya corregido antes' : ''}
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.75rem', fontSize: '0.82rem' }}>
          <div>
            <span className="muted">Inv. al conteo</span>
            <div>
              <strong>{linea.teorico}</strong>
            </div>
          </div>
          <div>
            <span className="muted">Contado registrado</span>
            <div>
              <strong>{linea.contado ?? '—'}</strong>
            </div>
          </div>
        </div>
        <label className="muted" style={{ display: 'block', marginBottom: '0.75rem' }}>
          Nueva cantidad contada
          <input
            className="input"
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            style={{ marginTop: '0.35rem', width: '100%' }}
            value={contada}
            onChange={(e) => setContada(e.target.value)}
            disabled={guardando}
            autoFocus
          />
        </label>
        <label className="muted" style={{ display: 'block', marginBottom: '0.75rem' }}>
          Nota (opcional)
          <input
            className="input"
            type="text"
            style={{ marginTop: '0.35rem', width: '100%' }}
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            disabled={guardando}
            placeholder="Motivo de la corrección"
          />
        </label>
        <p className="muted" style={{ margin: '0 0 0.75rem', fontSize: '0.78rem' }}>
          Se ajustará el stock al valor contado según inventario actual en sistema.
        </p>
        {error ? (
          <p style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', color: 'var(--brand-red, #c0392b)' }}>{error}</p>
        ) : null}
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-ghost" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={guardando}
            onClick={() => onGuardar({ contada, nota })}
          >
            {guardando ? 'Guardando…' : 'Aplicar corrección'}
          </button>
        </div>
      </div>
    </div>
  );
}

function TablaLineas({ lineas, mostrarTienda, puedeEditar, onEditar }) {
  return (
    <div className="table-wrap table-wrap-sticky-head">
      <table className="data" style={{ fontSize: '0.82rem' }}>
        <thead>
          <tr>
            <th>No. ajuste</th>
            <th>Código</th>
            <th>Producto</th>
            <th style={{ textAlign: 'right' }}>Inv. teórico</th>
            <th style={{ textAlign: 'right' }}>Contado</th>
            <th style={{ textAlign: 'right' }}>Diferencia</th>
            <th style={{ textAlign: 'right' }}>% merma</th>
            {puedeEditar ? <th style={{ width: 72 }} /> : null}
            {mostrarTienda ? <th>Tienda</th> : null}
          </tr>
        </thead>
        <tbody>
          {lineas.map((f) => (
            <tr key={f.id}>
              <td className="muted" style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                {f.numeroAjuste}
              </td>
              <td style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.78rem' }}>{f.codigo}</td>
              <td>{f.nombre}{f.corregido ? <span className="muted" style={{ fontSize: '0.72rem' }}> · corregido</span> : null}</td>
              <td style={{ textAlign: 'right' }}>{f.teorico}</td>
              <td style={{ textAlign: 'right' }}>{f.contado ?? '—'}</td>
              <td
                style={{
                  textAlign: 'right',
                  fontWeight: 600,
                  color:
                    Number(f.diferencia) < 0
                      ? 'var(--brand-red, #c0392b)'
                      : Number(f.diferencia) > 0
                        ? 'var(--brand-gold-dark)'
                        : undefined,
                }}
              >
                {fmtDiferencia(f.diferencia)}
              </td>
              <td style={{ textAlign: 'right' }}>
                {Number(f.diferencia) < 0 ? fmtPctReporte(f.pctMerma) : '—'}
              </td>
              {puedeEditar ? (
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ fontSize: '0.72rem', padding: '0.2rem 0.45rem' }}
                    onClick={() => onEditar(f)}
                    title="Corregir cantidad contada"
                  >
                    Editar
                  </button>
                </td>
              ) : null}
              {mostrarTienda ? <td className="muted">{f.tienda}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Reporte de conteos aplicados por departamento, con todos los artículos contados y no. de ajuste.
 */
export default function ReporteInventario({
  supabase,
  inventario,
  inventarioCompleto,
  sucursal,
  sucursalesLista,
  user,
  cargarDatos,
}) {
  const [abierto, setAbierto] = useState(false);
  const [preset, setPreset] = useState('mes');
  const [desde, setDesde] = useState(() => new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10));
  const [hasta, setHasta] = useState(() => new Date().toISOString().slice(0, 10));
  const [tienda, setTienda] = useState('');
  const [departamento, setDepartamento] = useState('');
  const [filtroDif, setFiltroDif] = useState('todos');
  const [lineasProducto, setLineasProducto] = useState([]);
  const [ajustes, setAjustes] = useState([]);
  const [rango, setRango] = useState({ desde: '', hasta: '' });
  const [aviso, setAviso] = useState('');
  const [referencia, setReferencia] = useState(null);
  const [sucursalReferencia, setSucursalReferencia] = useState('');
  const [loading, setLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [lineaEdit, setLineaEdit] = useState(null);
  const [guardandoCorreccion, setGuardandoCorreccion] = useState(false);
  const [errorCorreccion, setErrorCorreccion] = useState('');

  const puedeEditar = Boolean(supabase && puedeAjustarInventario(user?.rol));
  const catalogo = inventarioCompleto?.length ? inventarioCompleto : inventario;

  const tiendas = useMemo(() => {
    const base = tiendasParaFiltroInventario(sucursal, sucursalesLista);
    const set = new Set(base);
    for (const f of lineasProducto) {
      if (f.sucursal && f.sucursal !== '—') set.add(f.sucursal);
    }
    return [...set].sort((a, b) => {
      if (a === 'MAIN') return 1;
      if (b === 'MAIN') return -1;
      return a.localeCompare(b, 'es', { numeric: true });
    });
  }, [sucursal, sucursalesLista, lineasProducto]);

  const departamentos = useMemo(
    () => departamentosEnReporte(inventario, lineasProducto),
    [inventario, lineasProducto],
  );

  useEffect(() => {
    if (!abierto) return undefined;
    let cancel = false;
    setLoading(true);
    cargarFilasReporteInventarioAsync({
      supabase,
      inventario,
      inventarioCompleto: catalogo,
      preset,
      desde,
      hasta,
      sucursal: tienda,
      sucursalActual: sucursal,
      departamento,
    })
      .then((r) => {
        if (cancel) return;
        setLineasProducto(r.lineasProducto || []);
        setAjustes(r.ajustes || []);
        setRango(r.rango || { desde: '', hasta: '' });
        setAviso(r.aviso || '');
        setReferencia(r.referencia || null);
        setSucursalReferencia(r.sucursalReferencia || '');
      })
      .catch((e) => {
        if (cancel) return;
        setLineasProducto([]);
        setAjustes([]);
        setAviso(e?.message || String(e));
        setReferencia(null);
        setSucursalReferencia('');
      })
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [abierto, supabase, inventario, catalogo, preset, desde, hasta, tienda, departamento, reloadKey]);

  const lineasVisibles = useMemo(() => {
    if (filtroDif === 'negativos') {
      return lineasProducto.filter((l) => Number(l.diferencia) < 0);
    }
    if (filtroDif === 'positivos') {
      return lineasProducto.filter((l) => Number(l.diferencia) > 0);
    }
    return lineasProducto;
  }, [lineasProducto, filtroDif]);

  const grupos = useMemo(() => agruparReportePorDepartamento(lineasVisibles), [lineasVisibles]);
  const totalesGenerales = useMemo(
    () => enriquecerTotalesConReferencia(totalesLineasProducto(lineasProducto), referencia),
    [lineasProducto, referencia],
  );
  const totalesVista = useMemo(
    () => totalesLineasProducto(lineasVisibles),
    [lineasVisibles],
  );
  const foliosAjuste = useMemo(() => foliosDesdeAjustes(ajustes), [ajustes]);

  const guardarCorreccion = async ({ contada, nota }) => {
    if (!lineaEdit || !supabase) return;
    setGuardandoCorreccion(true);
    setErrorCorreccion('');
    try {
      const r = await corregirLineaReporteInventario(supabase, {
        linea: lineaEdit,
        nuevaContada: contada,
        nota,
        usuario: user?.nombre || user?.email || user?.id || '—',
        inventario: catalogo,
      });
      if (!r.ok) {
        setErrorCorreccion(r.error || 'No se pudo aplicar la corrección.');
        return;
      }
      setLineaEdit(null);
      setReloadKey((n) => n + 1);
      if (typeof cargarDatos === 'function') await cargarDatos();
    } catch (e) {
      setErrorCorreccion(e?.message || String(e));
    } finally {
      setGuardandoCorreccion(false);
    }
  };

  const exportCsv = () => {
    downloadCsv(
      `reporte_inventario_${rango.desde}_${rango.hasta}.csv`,
      toCsv(lineasVisibles, columnasCsvInventario()),
    );
  };

  const imprimirLineas = async (rows, subtitulo) => {
    const t = enriquecerTotalesConReferencia(
      totalesLineasProducto(rows),
      referencia ||
        referenciaInventarioReporte(
          catalogo,
          sucursalReferencia || tienda || sucursal,
          departamento,
        ),
    );
    const ref = t.referencia;
    await imprimirReporte({
      sucursal: tienda || sucursal,
      titulo: 'REPORTE DE INVENTARIO POR DEPARTAMENTO',
      rango: `${rango.desde} — ${rango.hasta}${subtitulo ? ` · ${subtitulo}` : ''}`,
      secciones: [
        {
          titulo: 'Resumen',
          lineas: [
            `Ajustes: ${foliosDesdeAjustes(ajustes).join(', ') || '—'}`,
            `Artículos contados: ${t.articulos} (${t.sinDiferencia} sin dif.) · SKUs únicos: ${t.skusUnicos ?? t.articulos}`,
            ref?.valorSistema
              ? `Inv. sistema tienda: ${fmtMxnReporte(ref.valorSistema)} · Cobertura: ${fmtPctReporte(ref.pctCoberturaValor ?? 0)}`
              : null,
            `Inv. teórico contado: ${fmtMxnReporte(t.valorTeoricoContado)} · Inv. contado: ${fmtMxnReporte(t.valorContado)}`,
            `Faltante: ${fmtMxnReporte(t.valorFaltante)} (${t.piezasFaltantes.toLocaleString('es-MX')} pzas)`,
            `Sobrante: ${fmtMxnReporte(t.valorSobrante)} (${t.piezasSobrantes.toLocaleString('es-MX')} pzas)`,
            ref?.valorSistema
              ? `Inventario total: ${fmtMxnReporte(ref.valorSistema)} · Merma: ${fmtMxnReporte(t.valorFaltante)} · % merma total: ${fmtPctReporte(t.pctMermaTotal ?? 0)}`
              : null,
            `% merma (contado): ${fmtPctReporte(t.pctMerma)}`,
          ].filter(Boolean),
        },
        ...agruparReportePorDepartamento(rows).map((g) => ({
          titulo: g.departamento,
          lineas: [
            `Ajustes: ${g.folios.join(', ') || '—'} · ${g.totales.articulos} artículo(s)`,
            `Faltante: ${fmtMxnReporte(g.totales.valorFaltante)} (${g.totales.piezasFaltantes} pzas) · Sobrante: ${fmtMxnReporte(g.totales.valorSobrante)} (${g.totales.piezasSobrantes} pzas)`,
          ],
        })),
      ],
      tabla: {
        cols: columnasImprimirProductoInventario({ incluirDepartamento: true }),
        rows,
      },
    });
  };

  const imprimirNegativos = () =>
    imprimirLineas(
      lineasProducto.filter((l) => Number(l.diferencia) < 0),
      'Solo diferencias negativas',
    );

  const imprimirPositivos = () =>
    imprimirLineas(
      lineasProducto.filter((l) => Number(l.diferencia) > 0),
      'Solo diferencias positivas',
    );

  const imprimirTodos = () => imprimirLineas(lineasProducto, 'Todos los artículos contados');

  if (!abierto) {
    return (
      <div className="card">
        <h3 style={{ margin: '0 0 0.35rem', color: 'var(--brand-blue)' }}>Inventario (auditoría)</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          Detalle por departamento: no. de ajuste, código, producto, inv. teórico, contado, diferencia y % merma.
          Incluye todos los artículos contados al aplicar.
        </p>
        <button type="button" className="btn btn-primary" onClick={() => setAbierto(true)}>
          <BtnLabel icon="chart">Reporte de inventario</BtnLabel>
        </button>
      </div>
    );
  }

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <h3 style={{ margin: 0, color: 'var(--brand-blue)' }}>Reporte de inventario por departamento</h3>
          <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.85rem' }}>
            Faltante y sobrante se reportan por separado (no se netean). % merma total = faltante ÷ inv. sistema.
            {puedeEditar ? ' Puedes corregir la cantidad contada por línea con Editar.' : ''}
            {loading ? ' Cargando…' : ''}
          </p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => setAbierto(false)}>
          Cerrar
        </button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
        <FiltroPeriodo
          preset={preset}
          onPresetChange={setPreset}
          desde={desde}
          hasta={hasta}
          onDesdeChange={setDesde}
          onHastaChange={setHasta}
          presets={PRESETS_REPORTE_INVENTARIO}
          labelPeriodo="Periodo"
          style={{ flex: '1 1 200px', minWidth: 180 }}
        />
        <label className="muted" style={{ display: 'block', flex: '1 1 140px', minWidth: 120 }}>
          Tienda
          <select className="select" style={{ marginTop: '0.35rem' }} value={tienda} onChange={(e) => setTienda(e.target.value)}>
            <option value="">Todas</option>
            {tiendas.map((s) => (
              <option key={s} value={s}>
                {etiquetaTienda(s)}
              </option>
            ))}
          </select>
        </label>
        <label className="muted" style={{ display: 'block', flex: '1 1 140px', minWidth: 120 }}>
          Departamento
          <select className="select" style={{ marginTop: '0.35rem' }} value={departamento} onChange={(e) => setDepartamento(e.target.value)}>
            <option value="">Todos</option>
            {departamentos.map((d) => (
              <option key={d} value={d}>
                {etiquetaDepartamento(d)}
              </option>
            ))}
          </select>
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'center' }}>
          <span className="muted" style={{ fontSize: '0.8rem', width: '100%' }}>
            Ver diferencias
          </span>
          {[
            { id: 'todos', label: 'Todos' },
            { id: 'negativos', label: 'Solo negativas' },
            { id: 'positivos', label: 'Solo positivas' },
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              className={filtroDif === f.id ? 'btn btn-primary' : 'btn btn-ghost'}
              style={{ fontSize: '0.82rem', padding: '0.35rem 0.65rem' }}
              onClick={() => setFiltroDif(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
        <button type="button" className="btn btn-gold" onClick={exportCsv} disabled={!lineasVisibles.length || loading}>
          <BtnLabel icon="download">CSV</BtnLabel>
        </button>
        <button type="button" className="btn btn-ghost" onClick={imprimirNegativos} disabled={!totalesGenerales.negativos || loading}>
          <BtnLabel icon="print">Imprimir negativos</BtnLabel>
        </button>
        <button type="button" className="btn btn-ghost" onClick={imprimirPositivos} disabled={!totalesGenerales.positivos || loading}>
          <BtnLabel icon="print">Imprimir positivos</BtnLabel>
        </button>
        <button type="button" className="btn btn-ghost" onClick={imprimirTodos} disabled={!lineasProducto.length || loading}>
          <BtnLabel icon="print">Imprimir vista actual</BtnLabel>
        </button>
      </div>

      {aviso ? (
        <p className="muted" style={{ margin: 0, fontSize: '0.85rem', color: 'var(--brand-red, #b45309)' }}>
          {aviso}
        </p>
      ) : null}

      {filtroDif !== 'todos' ? (
        <p className="muted" style={{ margin: 0, fontSize: '0.82rem' }}>
          Vista filtrada: {totalesVista.articulos} línea(s). Los totales de arriba incluyen{' '}
          <strong>todos</strong> los artículos contados ({totalesGenerales.articulos}), con y sin diferencia.
        </p>
      ) : null}

      <div
        style={{
          padding: '0.85rem 1rem',
          borderRadius: 12,
          border: '2px solid var(--brand-blue)',
          background: 'color-mix(in srgb, var(--brand-blue) 6%, var(--surface))',
        }}
      >
        <div style={{ fontWeight: 700, color: 'var(--brand-blue)', marginBottom: '0.5rem' }}>
          Merma vs inventario total
          {sucursalReferencia ? (
            <span className="muted" style={{ fontWeight: 500, fontSize: '0.82rem' }}>
              {' '}
              · {etiquetaTienda(sucursalReferencia)}
            </span>
          ) : null}
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: '0.65rem',
          }}
        >
          <div>
            <div className="muted" style={{ fontSize: '0.75rem' }}>
              Inventario total (sistema)
            </div>
            <strong style={{ fontSize: '1.1rem' }}>
              {totalesGenerales.referencia?.valorSistema
                ? fmtMxnReporte(totalesGenerales.referencia.valorSistema)
                : '—'}
            </strong>
            {totalesGenerales.referencia?.piezasSistema != null ? (
              <div className="muted" style={{ fontSize: '0.72rem' }}>
                {totalesGenerales.referencia.piezasSistema.toLocaleString('es-MX')} pzas
              </div>
            ) : null}
          </div>
          <div>
            <div className="muted" style={{ fontSize: '0.75rem' }}>
              Merma (faltante)
            </div>
            <strong style={{ fontSize: '1.1rem', color: 'var(--brand-red, #c0392b)' }}>
              {fmtMxnReporte(totalesGenerales.valorFaltante)}
            </strong>
            <div className="muted" style={{ fontSize: '0.72rem' }}>
              {totalesGenerales.piezasFaltantes.toLocaleString('es-MX')} pzas
            </div>
          </div>
          <div>
            <div className="muted" style={{ fontSize: '0.75rem' }}>
              % merma total
            </div>
            <strong style={{ fontSize: '1.25rem', color: 'var(--brand-red, #c0392b)' }}>
              {totalesGenerales.referencia?.valorSistema
                ? fmtPctReporte(totalesGenerales.pctMermaTotal ?? 0)
                : totalesGenerales.valorFaltante > 0
                  ? '—'
                  : fmtPctReporte(0)}
            </strong>
            <div className="muted" style={{ fontSize: '0.72rem' }}>
              merma ÷ inventario total
            </div>
          </div>
        </div>
        {!totalesGenerales.referencia?.valorSistema ? (
          <p className="muted" style={{ margin: '0.5rem 0 0', fontSize: '0.78rem' }}>
            Elige la tienda en el filtro (ej. 3B5) para calcular el % sobre el inventario total de esa sucursal.
          </p>
        ) : (
          <p className="muted" style={{ margin: '0.5rem 0 0', fontSize: '0.78rem' }}>
            {fmtMxnReporte(totalesGenerales.valorFaltante)} ÷ {fmtMxnReporte(totalesGenerales.referencia.valorSistema)} ={' '}
            {fmtPctReporte(totalesGenerales.pctMermaTotal ?? 0)}
          </p>
        )}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
          gap: '0.65rem',
        }}
      >
        {[
          ...(totalesGenerales.referencia?.valorSistema
            ? [
                {
                  label: `Inv. sistema${tienda ? ` · ${etiquetaTienda(tienda)}` : ''}`,
                  value: fmtMxnReporte(totalesGenerales.referencia.valorSistema),
                  hint: `${totalesGenerales.referencia.piezasSistema?.toLocaleString('es-MX') || 0} pzas · ${totalesGenerales.referencia.skusConStock || 0} SKUs`,
                },
                {
                  label: 'Cobertura conteo',
                  value: fmtPctReporte(totalesGenerales.referencia.pctCoberturaValor ?? 0),
                  hint: 'Valor teórico contado / inv. sistema',
                },
              ]
            : []),
          { label: 'Ajustes', value: String(ajustes.length) },
          {
            label: 'Artículos contados',
            value: String(totalesGenerales.articulos),
            hint: `${totalesGenerales.sinDiferencia} sin dif. · ${totalesGenerales.skusUnicos ?? totalesGenerales.articulos} SKUs únicos`,
          },
          {
            label: 'Inv. teórico contado',
            value: fmtMxnReporte(totalesGenerales.valorTeoricoContado),
            hint: `${totalesGenerales.piezasTeoricas.toLocaleString('es-MX')} pzas teóricas`,
          },
          {
            label: 'Inv. contado',
            value: fmtMxnReporte(totalesGenerales.valorContado),
            hint: `${totalesGenerales.piezasContadas.toLocaleString('es-MX')} pzas contadas`,
          },
          {
            label: 'Faltante',
            value: fmtMxnReporte(totalesGenerales.valorFaltante),
            sub: `${totalesGenerales.piezasFaltantes.toLocaleString('es-MX')} pzas · ${totalesGenerales.negativos} SKU(s)`,
            color: 'var(--brand-red, #c0392b)',
          },
          {
            label: 'Sobrante',
            value: fmtMxnReporte(totalesGenerales.valorSobrante),
            sub: `${totalesGenerales.piezasSobrantes.toLocaleString('es-MX')} pzas · ${totalesGenerales.positivos} SKU(s)`,
            color: 'var(--brand-gold-dark)',
          },
          { label: '% merma (contado)', value: fmtPctReporte(totalesGenerales.pctMerma), hint: 'Faltante / inv. teórico contado' },
        ].map((k) => (
          <div
            key={k.label}
            style={{
              padding: '0.65rem 0.75rem',
              borderRadius: 10,
              background: 'var(--surface)',
              border: '1px solid var(--border, rgba(0,0,0,0.08))',
            }}
          >
            <div className="muted" style={{ fontSize: '0.75rem' }}>
              {k.label}
            </div>
            <strong style={{ fontSize: '1.05rem', color: k.color || 'var(--brand-blue)' }}>{k.value}</strong>
            {k.sub ? (
              <div className="muted" style={{ fontSize: '0.72rem', marginTop: '0.15rem' }}>
                {k.sub}
              </div>
            ) : null}
            {k.hint ? (
              <div className="muted" style={{ fontSize: '0.68rem', marginTop: '0.1rem' }}>
                {k.hint}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {foliosAjuste.length > 0 ? (
        <p className="muted" style={{ margin: 0, fontSize: '0.82rem' }}>
          <strong>No. de ajuste en periodo:</strong> {foliosAjuste.join(' · ')}
        </p>
      ) : null}

      {!grupos.length && !loading ? (
        <p className="muted">
          No hay artículos contados en este periodo. Se generan al <strong>Aplicar ajuste</strong> en conteo por
          departamento o ajuste libre.
        </p>
      ) : (
        grupos.map((g) => (
          <div key={g.departamentoKey}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                flexWrap: 'wrap',
                gap: '0.35rem',
                marginBottom: '0.5rem',
              }}
            >
              <h4 style={{ margin: 0, color: 'var(--brand-blue)' }}>{g.departamento}</h4>
              <span className="muted" style={{ fontSize: '0.8rem' }}>
                {g.folios.length} ajuste(s) · {g.totales.articulos} SKU(s) · Faltante{' '}
                {fmtMxnReporte(g.totales.valorFaltante)} ({g.totales.piezasFaltantes} pzas) · Sobrante{' '}
                {fmtMxnReporte(g.totales.valorSobrante)} ({g.totales.piezasSobrantes} pzas) · % merma{' '}
                {fmtPctReporte(g.totales.pctMerma)}
              </span>
            </div>
            <p className="muted" style={{ margin: '0 0 0.5rem', fontSize: '0.78rem' }}>
              Ajustes: {g.folios.join(' · ') || '—'}
            </p>
            <TablaLineas
              lineas={g.lineas}
              mostrarTienda={!tienda}
              puedeEditar={puedeEditar}
              onEditar={(f) => {
                setErrorCorreccion('');
                setLineaEdit(f);
              }}
            />
          </div>
        ))
      )}

      <ModalCorregirLinea
        linea={lineaEdit}
        guardando={guardandoCorreccion}
        error={errorCorreccion}
        onCerrar={() => {
          if (!guardandoCorreccion) {
            setLineaEdit(null);
            setErrorCorreccion('');
          }
        }}
        onGuardar={guardarCorreccion}
      />
    </div>
  );
}
