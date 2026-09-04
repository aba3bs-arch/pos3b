import React, { useEffect, useMemo, useState } from 'react';
import FiltroPeriodo from './FiltroPeriodo.jsx';
import { BtnLabel } from './Icon.jsx';
import { imprimirReporte } from '../lib/impresion.js';
import { etiquetaTienda, esAlmacenCentral } from '../constants/sucursales.js';
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
import { puedeAjustarInventario, puedeCapturarResultadoInventarioBono } from '../lib/roles.js';
import {
  calcularResultadoInventarioCampos,
  cargarResultadoInventario,
  guardarResultadoInventario,
  listarResultadosInventario,
  parseNumInventario,
} from '../lib/resultadoInventario.js';

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
  /** Campos manuales para bono: total + faltante + bonificación (solo Admin/Auditor). */
  const [totalInventarioManual, setTotalInventarioManual] = useState('');
  const [faltanteInventarioManual, setFaltanteInventarioManual] = useState('');
  const [bonificacionManual, setBonificacionManual] = useState('');
  const [guardandoResultado, setGuardandoResultado] = useState(false);
  const [avisoResultado, setAvisoResultado] = useState('');
  const [estadoResultado, setEstadoResultado] = useState('');
  const [metaResultado, setMetaResultado] = useState(null);
  const [listaPorTiendaAbierta, setListaPorTiendaAbierta] = useState(false);
  const [listaPorTienda, setListaPorTienda] = useState([]);
  const [cargandoLista, setCargandoLista] = useState(false);
  const [avisoLista, setAvisoLista] = useState('');
  const [tiendaListaExpandida, setTiendaListaExpandida] = useState('');

  const puedeEditar = Boolean(supabase && puedeAjustarInventario(user?.rol));
  const puedeCapturarBono = Boolean(puedeCapturarResultadoInventarioBono(user?.rol));
  const catalogo = inventarioCompleto?.length ? inventarioCompleto : inventario;
  /** Tienda concreta para guardar resultado / bono (no "Todas" ni MAIN). */
  const tiendaResultado = useMemo(() => {
    if (tienda && !esAlmacenCentral(tienda)) return tienda;
    if (!tienda && sucursal && !esAlmacenCentral(sucursal)) return sucursal;
    return '';
  }, [tienda, sucursal]);

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

  const totalInventarioNum = useMemo(
    () => parseNumInventario(totalInventarioManual),
    [totalInventarioManual],
  );
  const faltanteInventarioNum = useMemo(
    () => parseNumInventario(faltanteInventarioManual),
    [faltanteInventarioManual],
  );
  const bonificacionNum = useMemo(
    () => parseNumInventario(bonificacionManual) ?? 0,
    [bonificacionManual],
  );

  /** Campos auto: inv. post-ajuste y % merma (faltante − bonificación). */
  const analisisManual = useMemo(
    () => calcularResultadoInventarioCampos(totalInventarioNum, faltanteInventarioNum, bonificacionNum),
    [totalInventarioNum, faltanteInventarioNum, bonificacionNum],
  );

  useEffect(() => {
    if (!abierto || !rango.desde || !rango.hasta) return undefined;
    if (!tiendaResultado) {
      setTotalInventarioManual('');
      setFaltanteInventarioManual('');
      setBonificacionManual('');
      setMetaResultado(null);
      setAvisoResultado('Elige una tienda operativa para ver/capturar el resultado de inventario.');
      return undefined;
    }
    let cancel = false;
    setAvisoResultado('');
    setEstadoResultado('');
    cargarResultadoInventario(supabase, {
      sucursal: tiendaResultado,
      desde: rango.desde,
      hasta: rango.hasta,
    }).then((r) => {
      if (cancel) return;
      if (r.aviso) setAvisoResultado(r.aviso);
      if (r.registro?.valor_contado != null) {
        setTotalInventarioManual(String(r.registro.valor_contado));
        setFaltanteInventarioManual(
          r.registro.valor_faltante != null ? String(r.registro.valor_faltante) : '',
        );
        setBonificacionManual(
          r.registro.valor_bonificacion != null && Number(r.registro.valor_bonificacion) !== 0
            ? String(r.registro.valor_bonificacion)
            : '',
        );
        setMetaResultado(r.registro);
      } else {
        setTotalInventarioManual('');
        setFaltanteInventarioManual('');
        setBonificacionManual('');
        setMetaResultado(null);
      }
    });
    return () => {
      cancel = true;
    };
  }, [abierto, supabase, tiendaResultado, rango.desde, rango.hasta]);

  const persistirResultadoManual = async ({ borrar = false } = {}) => {
    if (!puedeCapturarBono) {
      setAvisoResultado('Solo Administrador o Auditor pueden capturar o modificar estos datos.');
      return;
    }
    if (!tiendaResultado) {
      setAvisoResultado('Elige una tienda (no "Todas") para guardar el resultado.');
      return;
    }
    if (!rango.desde || !rango.hasta) {
      setAvisoResultado('Espera a que cargue el periodo del reporte.');
      return;
    }
    setGuardandoResultado(true);
    setAvisoResultado('');
    setEstadoResultado('');
    try {
      const r = await guardarResultadoInventario(supabase, {
        sucursal: tiendaResultado,
        desde: rango.desde,
        hasta: rango.hasta,
        totalInventario: borrar ? null : totalInventarioManual,
        faltante: borrar ? null : faltanteInventarioManual,
        bonificacion: borrar ? null : bonificacionManual,
        valorSistema: totalesGenerales?.referencia?.valorSistema ?? null,
        valorContadoSistema: totalesGenerales?.valorContado ?? null,
        usuario: user?.nombre || user?.email || user?.id || '—',
      });
      if (!r.ok) {
        setAvisoResultado(r.error || 'No se pudo guardar.');
        return;
      }
      if (r.aviso) setAvisoResultado(r.aviso);
      if (r.borrado) {
        setTotalInventarioManual('');
        setFaltanteInventarioManual('');
        setBonificacionManual('');
        setMetaResultado(null);
        setEstadoResultado('Resultado borrado.');
      } else {
        setMetaResultado(r.registro || null);
        if (r.registro?.valor_contado != null) {
          setTotalInventarioManual(String(r.registro.valor_contado));
        }
        if (r.registro?.valor_faltante != null) {
          setFaltanteInventarioManual(String(r.registro.valor_faltante));
        }
        if (r.registro?.valor_bonificacion != null) {
          setBonificacionManual(
            Number(r.registro.valor_bonificacion) !== 0 ? String(r.registro.valor_bonificacion) : '',
          );
        }
        setEstadoResultado(
          r.registro?.fuente === 'nube'
            ? 'Guardado · el % merma (faltante − bonificación) se usa para el bono.'
            : 'Guardado en este dispositivo · ejecuta el SQL para sincronizar el bono en todas las cajas.',
        );
      }
      if (listaPorTiendaAbierta) {
        void cargarListaPorTienda({ forzarAbrir: false });
      }
    } catch (e) {
      setAvisoResultado(e?.message || String(e));
    } finally {
      setGuardandoResultado(false);
    }
  };

  const cargarListaPorTienda = async ({ forzarAbrir = true } = {}) => {
    if (forzarAbrir) setListaPorTiendaAbierta(true);
    setCargandoLista(true);
    setAvisoLista('');
    try {
      const r = await listarResultadosInventario(supabase, {
        desde: rango.desde || null,
        hasta: rango.hasta || null,
        limit: 100,
      });
      setListaPorTienda(r.porTienda || []);
      if (r.aviso) setAvisoLista(r.aviso);
      else if (!(r.porTienda || []).length) {
        setAvisoLista(
          rango.desde && rango.hasta
            ? `No hay resultados guardados que solapen ${rango.desde} — ${rango.hasta}.`
            : 'No hay resultados guardados (nube ni este dispositivo).',
        );
      }
    } catch (e) {
      setListaPorTienda([]);
      setAvisoLista(e?.message || String(e));
    } finally {
      setCargandoLista(false);
    }
  };

  const aplicarRegistroGuardado = (reg) => {
    if (!reg?.sucursal_id) return;
    setTienda(reg.sucursal_id);
    setPreset('custom');
    if (reg.desde) setDesde(reg.desde);
    if (reg.hasta) setHasta(reg.hasta);
    setTotalInventarioManual(reg.valor_contado != null ? String(reg.valor_contado) : '');
    setFaltanteInventarioManual(reg.valor_faltante != null ? String(reg.valor_faltante) : '');
    setBonificacionManual(
      reg.valor_bonificacion != null && Number(reg.valor_bonificacion) !== 0
        ? String(reg.valor_bonificacion)
        : '',
    );
    setMetaResultado(reg);
    setEstadoResultado(
      `Cargado · ${etiquetaTienda(reg.sucursal_id)} · ${reg.desde} — ${reg.hasta}`
        + (reg.fuente === 'nube' ? ' (nube)' : ' (este dispositivo)'),
    );
    setAvisoResultado('');
  };

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
            analisisManual?.pctMerma != null
              ? `Resultado manual: total ${fmtMxnReporte(analisisManual.totalInventario)} · faltante ${fmtMxnReporte(analisisManual.faltante)} · bonif. ${fmtMxnReporte(analisisManual.bonificacion)} · neto ${fmtMxnReporte(analisisManual.faltanteNeto)} · inv. después ${fmtMxnReporte(analisisManual.invDespuesAjuste)} · merma ${fmtPctReporte(analisisManual.pctMerma)}`
              : null,
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
          Detalle por departamento y captura manual (total + faltante) para calcular merma del bono.
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

        <div
          style={{
            marginTop: '0.85rem',
            paddingTop: '0.75rem',
            borderTop: '1px dashed var(--border, rgba(0,0,0,0.12))',
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: '0.35rem' }}>Resultado de inventario (para bono)</div>
          <p className="muted" style={{ margin: '0 0 0.65rem', fontSize: '0.8rem' }}>
            {puedeCapturarBono
              ? 'Captura total, faltante y bonificación. La bonificación se descuenta del faltante para el % de merma del bono. No altera el stock.'
              : 'Solo lectura: Administrador o Auditor capturan total, faltante y bonificación. Las sucursales no pueden modificar estos datos.'}
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <button
              type="button"
              className={listaPorTiendaAbierta ? 'btn btn-primary' : 'btn btn-ghost'}
              disabled={cargandoLista}
              onClick={() => {
                if (listaPorTiendaAbierta) {
                  setListaPorTiendaAbierta(false);
                  return;
                }
                void cargarListaPorTienda();
              }}
            >
              {cargandoLista
                ? 'Cargando…'
                : listaPorTiendaAbierta
                  ? 'Ocultar reportes por tienda'
                  : 'Ver reportes guardados por tienda'}
            </button>
            {listaPorTiendaAbierta ? (
              <button
                type="button"
                className="btn btn-ghost"
                disabled={cargandoLista}
                onClick={() => void cargarListaPorTienda({ forzarAbrir: false })}
              >
                Actualizar lista
              </button>
            ) : null}
          </div>

          {listaPorTiendaAbierta ? (
            <div
              style={{
                marginBottom: '0.85rem',
                padding: '0.65rem 0.75rem',
                borderRadius: 10,
                background: 'var(--surface)',
                border: '1px solid var(--border, rgba(0,0,0,0.1))',
              }}
            >
              <div style={{ fontWeight: 650, marginBottom: '0.35rem', fontSize: '0.9rem' }}>
                Guardados {rango.desde && rango.hasta ? `(periodo ${rango.desde} — ${rango.hasta})` : ''}
              </div>
              {avisoLista ? (
                <p className="muted" style={{ margin: '0 0 0.5rem', fontSize: '0.8rem' }}>{avisoLista}</p>
              ) : null}
              {!cargandoLista && listaPorTienda.length === 0 ? (
                <p className="muted" style={{ margin: 0, fontSize: '0.8rem' }}>
                  Sin registros. Si acabas de guardar y no aparece, revisa el aviso del SQL o guarda de nuevo con una tienda elegida.
                </p>
              ) : null}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                {listaPorTienda.map((grupo) => {
                  const expandida = tiendaListaExpandida === grupo.sucursal_id;
                  const ultimo = grupo.registros[0];
                  return (
                    <div
                      key={grupo.sucursal_id}
                      style={{
                        border: '1px solid var(--border, rgba(0,0,0,0.1))',
                        borderRadius: 8,
                        overflow: 'hidden',
                        background: 'var(--bg, #fff)',
                      }}
                    >
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{
                          width: '100%',
                          justifyContent: 'space-between',
                          borderRadius: 0,
                          padding: '0.55rem 0.7rem',
                          fontSize: '0.85rem',
                        }}
                        onClick={() =>
                          setTiendaListaExpandida((prev) =>
                            prev === grupo.sucursal_id ? '' : grupo.sucursal_id,
                          )
                        }
                      >
                        <span>
                          <strong>{etiquetaTienda(grupo.sucursal_id)}</strong>
                          <span className="muted">
                            {' '}
                            · {grupo.registros.length} periodo{grupo.registros.length === 1 ? '' : 's'}
                          </span>
                        </span>
                        <span className="muted" style={{ fontSize: '0.78rem' }}>
                          {ultimo?.pct_merma != null ? `merma ${fmtPctReporte(ultimo.pct_merma)}` : '—'}
                          {' · '}
                          {expandida ? '▲' : '▼'}
                        </span>
                      </button>
                      {expandida ? (
                        <div className="table-wrap" style={{ margin: 0, borderTop: '1px solid var(--border, rgba(0,0,0,0.08))' }}>
                          <table className="data" style={{ fontSize: '0.78rem', margin: 0 }}>
                            <thead>
                              <tr>
                                <th>Periodo</th>
                                <th>Total</th>
                                <th>Faltante</th>
                                <th>Bonif.</th>
                                <th>Merma</th>
                                <th>Origen</th>
                                <th />
                              </tr>
                            </thead>
                            <tbody>
                              {grupo.registros.map((reg) => (
                                <tr key={`${reg.sucursal_id}-${reg.desde}-${reg.hasta}`}>
                                  <td>{reg.desde} — {reg.hasta}</td>
                                  <td>{fmtMxnReporte(reg.valor_contado)}</td>
                                  <td>{fmtMxnReporte(reg.valor_faltante)}</td>
                                  <td>{fmtMxnReporte(reg.valor_bonificacion || 0)}</td>
                                  <td>{reg.pct_merma != null ? fmtPctReporte(reg.pct_merma) : '—'}</td>
                                  <td className="muted">{reg.fuente === 'nube' ? 'Nube' : 'Local'}</td>
                                  <td>
                                    <button
                                      type="button"
                                      className="btn btn-ghost"
                                      style={{ padding: '0.2rem 0.45rem', fontSize: '0.72rem' }}
                                      onClick={() => aplicarRegistroGuardado(reg)}
                                    >
                                      Ver / cargar
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: '0.65rem',
              alignItems: 'end',
            }}
          >
            <label className="muted" style={{ display: 'block', fontSize: '0.82rem' }}>
              1. Total de inventario ($)
              <input
                className="input"
                type="text"
                inputMode="decimal"
                placeholder="Ej. 250000"
                style={{ marginTop: '0.35rem', fontSize: '1.05rem', width: '100%' }}
                value={totalInventarioManual}
                onChange={(e) => {
                  if (!puedeCapturarBono) return;
                  setTotalInventarioManual(e.target.value);
                  setEstadoResultado('');
                }}
                readOnly={!puedeCapturarBono}
                disabled={guardandoResultado || !tiendaResultado || !puedeCapturarBono}
              />
            </label>
            <label className="muted" style={{ display: 'block', fontSize: '0.82rem' }}>
              2. Faltante de inventario ($)
              <input
                className="input"
                type="text"
                inputMode="decimal"
                placeholder="Ej. 3500"
                style={{ marginTop: '0.35rem', fontSize: '1.05rem', width: '100%' }}
                value={faltanteInventarioManual}
                onChange={(e) => {
                  if (!puedeCapturarBono) return;
                  setFaltanteInventarioManual(e.target.value);
                  setEstadoResultado('');
                }}
                readOnly={!puedeCapturarBono}
                disabled={guardandoResultado || !tiendaResultado || !puedeCapturarBono}
              />
              <span style={{ display: 'block', fontSize: '0.68rem', marginTop: 2 }}>
                En nómina: este monto ÷ 3 se descuenta a cada empleado de la tienda
              </span>
            </label>
            <label className="muted" style={{ display: 'block', fontSize: '0.82rem' }}>
              Bonificación ($)
              <input
                className="input"
                type="text"
                inputMode="decimal"
                placeholder="Ej. 500"
                style={{ marginTop: '0.35rem', fontSize: '1.05rem', width: '100%' }}
                value={bonificacionManual}
                onChange={(e) => {
                  if (!puedeCapturarBono) return;
                  setBonificacionManual(e.target.value);
                  setEstadoResultado('');
                }}
                readOnly={!puedeCapturarBono}
                disabled={guardandoResultado || !tiendaResultado || !puedeCapturarBono}
              />
              <span style={{ display: 'block', fontSize: '0.68rem', marginTop: 2 }}>
                Se descuenta del faltante
              </span>
            </label>
            <div
              style={{
                padding: '0.55rem 0.65rem',
                borderRadius: 10,
                background: 'var(--surface)',
                border: '1px solid var(--border, rgba(0,0,0,0.1))',
              }}
            >
              <div className="muted" style={{ fontSize: '0.72rem' }}>Faltante neto</div>
              <strong style={{ fontSize: '1.05rem', color: 'var(--brand-red, #c0392b)' }}>
                {analisisManual.faltanteNeto != null
                  ? fmtMxnReporte(analisisManual.faltanteNeto)
                  : '—'}
              </strong>
              <div className="muted" style={{ fontSize: '0.68rem' }}>faltante − bonificación</div>
            </div>
            <div
              style={{
                padding: '0.55rem 0.65rem',
                borderRadius: 10,
                background: 'var(--surface)',
                border: '1px solid var(--border, rgba(0,0,0,0.1))',
              }}
            >
              <div className="muted" style={{ fontSize: '0.72rem' }}>3. Inv. después del ajuste</div>
              <strong style={{ fontSize: '1.1rem', color: 'var(--brand-blue)' }}>
                {analisisManual.invDespuesAjuste != null
                  ? fmtMxnReporte(analisisManual.invDespuesAjuste)
                  : '—'}
              </strong>
              <div className="muted" style={{ fontSize: '0.68rem' }}>total − faltante neto</div>
            </div>
            <div
              style={{
                padding: '0.55rem 0.65rem',
                borderRadius: 10,
                background: 'color-mix(in srgb, var(--brand-red, #c0392b) 6%, var(--surface))',
                border: '1px solid color-mix(in srgb, var(--brand-red, #c0392b) 25%, transparent)',
              }}
            >
              <div className="muted" style={{ fontSize: '0.72rem' }}>4. Merma / diferencia %</div>
              <strong style={{ fontSize: '1.2rem', color: 'var(--brand-red, #c0392b)' }}>
                {analisisManual.pctMerma != null ? fmtPctReporte(analisisManual.pctMerma) : '—'}
              </strong>
              <div className="muted" style={{ fontSize: '0.68rem' }}>faltante neto ÷ total · bono</div>
            </div>
          </div>

          {puedeCapturarBono ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.75rem' }}>
              <button
                type="button"
                className="btn btn-primary"
                disabled={
                  guardandoResultado
                  || !tiendaResultado
                  || !rango.desde
                  || totalInventarioNum == null
                  || faltanteInventarioNum == null
                }
                onClick={() => persistirResultadoManual()}
              >
                {guardandoResultado ? 'Guardando…' : 'Guardar para bono'}
              </button>
              {(totalInventarioManual.trim() !== ''
                || faltanteInventarioManual.trim() !== ''
                || bonificacionManual.trim() !== '') ? (
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={guardandoResultado || !tiendaResultado}
                  onClick={() => persistirResultadoManual({ borrar: true })}
                >
                  Borrar
                </button>
              ) : null}
            </div>
          ) : (
            <p className="muted" style={{ margin: '0.65rem 0 0', fontSize: '0.8rem' }}>
              Sin permiso de edición (se requiere Administrador o Auditor).
            </p>
          )}

          {!tiendaResultado ? (
            <p className="muted" style={{ margin: '0.5rem 0 0', fontSize: '0.8rem' }}>
              Elige la tienda en el filtro para ver el resultado de esa sucursal.
            </p>
          ) : null}
          {avisoResultado ? (
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem', color: 'var(--brand-red, #b45309)' }}>
              {avisoResultado}
            </p>
          ) : null}
          {estadoResultado ? (
            <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.8rem', color: 'var(--brand-blue)' }}>
              {estadoResultado}
              {metaResultado?.updated_at
                ? ` · ${new Date(metaResultado.updated_at).toLocaleString('es-MX')}`
                : ''}
            </p>
          ) : null}
        </div>
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
