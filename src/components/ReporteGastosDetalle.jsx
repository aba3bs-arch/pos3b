import React, { useCallback, useEffect, useMemo, useState } from 'react';
import FiltroRangoCalendario from './FiltroRangoCalendario.jsx';
import { BtnLabel } from './Icon.jsx';
import { imprimirReporte } from '../lib/impresion.js';
import {
  MODULOS_GASTO,
  ETIQUETA_MODULO_GASTO,
  agruparPorEmpleado,
  agruparPorTienda,
  cargarGastosDetalle,
  categoriasUnicas,
  columnasCsvGastos,
  empleadosUnicos,
  filtrarFilasGastos,
  fmtMonto,
  tiendasFiltroGastos,
  totalMontoFilas,
} from '../lib/reporteGastosDetalle.js';
import { eliminarGastoDesdeReportes } from '../lib/contVirtualEgresos.js';
import { puedeGestionarUsuarios } from '../lib/roles.js';
import { etiquetaTienda } from '../constants/sucursales.js';

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

const VISTAS = [
  { id: 'detalle', label: 'Detalle' },
  { id: 'tienda', label: 'Por tienda' },
  { id: 'empleado', label: 'Por empleado' },
];

function etiquetaIeModulo(modulo) {
  if (modulo === 'abarrotes') return 'IE Abarrotes';
  if (modulo === 'virtual' || modulo === 'garage') return 'IE Virtual';
  return 'IE';
}

function TablaDetalle({ filas, puedeBorrar = false, borrandoId = null, onBorrar }) {
  if (!filas.length) return <p className="muted">Sin movimientos en el rango.</p>;
  return (
    <div className="table-wrap table-wrap-sticky-head">
      <table className="data" style={{ fontSize: '0.82rem' }}>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Tienda</th>
            <th>Módulo</th>
            <th>Empleado</th>
            <th>Nombre</th>
            <th>Concepto</th>
            <th style={{ textAlign: 'right' }}>Cant.</th>
            <th style={{ textAlign: 'right' }}>Monto</th>
            {puedeBorrar && <th />}
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.id}>
              <td className="muted" style={{ whiteSpace: 'nowrap' }}>
                {f.fecha_corta}
              </td>
              <td>{f.tienda}</td>
              <td className="muted">{f.modulo_label}</td>
              <td>{f.empleado}</td>
              <td>{f.nombre}</td>
              <td className="muted">{f.concepto}</td>
              <td style={{ textAlign: 'right' }}>{f.cantidad}</td>
              <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtMonto(f.monto)}</td>
              {puedeBorrar && (
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ padding: '0.15rem 0.4rem', fontSize: '0.72rem', color: 'var(--danger)' }}
                    disabled={borrandoId === f.id}
                    title={`Borrar y quitar de ${etiquetaIeModulo(f.modulo)}`}
                    onClick={() => onBorrar?.(f)}
                  >
                    {borrandoId === f.id ? '…' : 'Borrar'}
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={puedeBorrar ? 8 : 7} style={{ textAlign: 'right', fontWeight: 700 }}>
              Total ({filas.length} mov.)
            </td>
            <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--brand-blue)' }}>{fmtMonto(totalMontoFilas(filas))}</td>
            {puedeBorrar && <td />}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function TablaAgrupada({ grupos, colGrupo }) {
  if (!grupos.length) return <p className="muted">Sin movimientos en el rango.</p>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {grupos.map((g) => (
        <div key={g.id} className="card" style={{ padding: '0.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.35rem' }}>
            <strong style={{ color: 'var(--brand-blue)' }}>{colGrupo}: {g.label}</strong>
            <span style={{ fontWeight: 700 }}>
              {g.filas.length} mov. · {fmtMonto(g.total)}
            </span>
          </div>
          <div className="table-wrap">
            <table className="data" style={{ fontSize: '0.78rem' }}>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Empleado</th>
                  <th>Nombre</th>
                  <th>Concepto</th>
                  <th style={{ textAlign: 'right' }}>Cant.</th>
                  <th style={{ textAlign: 'right' }}>Monto</th>
                </tr>
              </thead>
              <tbody>
                {g.filas.map((f) => (
                  <tr key={f.id}>
                    <td className="muted">{f.fecha_corta}</td>
                    <td>{f.empleado}</td>
                    <td>{f.nombre}</td>
                    <td className="muted">{f.concepto}</td>
                    <td style={{ textAlign: 'right' }}>{f.cantidad}</td>
                    <td style={{ textAlign: 'right' }}>{fmtMonto(f.monto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ReporteGastosDetalle({ supabase, sucursal, user }) {
  const tiendas = useMemo(() => tiendasFiltroGastos(), []);
  const esAdmin = puedeGestionarUsuarios(user?.rol);
  const [desde, setDesde] = useState(() => new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10));
  const [hasta, setHasta] = useState(() => new Date().toISOString().slice(0, 10));
  const [tiendaFiltro, setTiendaFiltro] = useState('');
  const [moduloFiltro, setModuloFiltro] = useState('');
  const [empleadoFiltro, setEmpleadoFiltro] = useState('');
  const [categoriaFiltro, setCategoriaFiltro] = useState('');
  const [qBusqueda, setQBusqueda] = useState('');
  const [vista, setVista] = useState('detalle');
  const [cargando, setCargando] = useState(false);
  const [borrandoId, setBorrandoId] = useState(null);
  const [error, setError] = useState('');
  const [filas, setFilas] = useState([]);

  const cargar = useCallback(async () => {
    if (!supabase) return;
    setCargando(true);
    setError('');
    const res = await cargarGastosDetalle(supabase, {
      desde,
      hasta,
      sucursal: tiendaFiltro,
      modulo: moduloFiltro,
      empleado: empleadoFiltro,
    });
    setCargando(false);
    if (res.error) setError(res.error);
    setFilas(res.filas || []);
  }, [supabase, desde, hasta, tiendaFiltro, moduloFiltro, empleadoFiltro]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const categoriasLista = useMemo(() => categoriasUnicas(filas), [filas]);
  const empleadosLista = useMemo(() => empleadosUnicos(filas), [filas]);
  const filasVisibles = useMemo(
    () => filtrarFilasGastos(filas, { q: qBusqueda, categoria: categoriaFiltro }),
    [filas, qBusqueda, categoriaFiltro],
  );
  const total = useMemo(() => totalMontoFilas(filasVisibles), [filasVisibles]);
  const porTienda = useMemo(() => agruparPorTienda(filasVisibles), [filasVisibles]);
  const porEmpleado = useMemo(() => agruparPorEmpleado(filasVisibles), [filasVisibles]);

  const borrarGasto = async (fila) => {
    if (!esAdmin || !fila?.id) return;
    const ie = etiquetaIeModulo(fila.modulo);
    if (
      !confirm(
        `¿Borrar este gasto del reporte y quitarlo de ${ie}?\n\n` +
          `${fila.modulo_label} · ${fila.concepto}\n` +
          `${fila.nombre} · ${fmtMonto(fila.monto)}\n\n` +
          `Se elimina del historial de cortes y deja de contar en la recolección de IE.`,
      )
    ) {
      return;
    }
    setBorrandoId(fila.id);
    const res = await eliminarGastoDesdeReportes(supabase, fila);
    setBorrandoId(null);
    if (!res.ok) return alert(res.error || 'No se pudo borrar el gasto.');
    setFilas((prev) => prev.filter((f) => String(f.id) !== String(fila.id)));
  };

  const exportarCsv = () => {
    if (!filasVisibles.length) return alert('No hay datos para exportar.');
    downloadCsv(`gastos_detalle_${desde}_${hasta}.csv`, toCsv(filasVisibles, columnasCsvGastos()));
  };

  const imprimir = async () => {
    if (!filasVisibles.length) return alert('No hay datos para imprimir.');
    const tablaFilas = filasVisibles.map((f) => ({
      fecha: f.fecha_corta,
      tienda: f.tienda,
      empleado: f.empleado,
      nombre: f.nombre,
      concepto: f.concepto,
      cantidad: f.cantidad,
      monto: fmtMonto(f.monto),
    }));
    await imprimirReporte({
      sucursal: sucursal || tiendaFiltro || 'Todas',
      titulo: 'REPORTE DETALLADO DE GASTOS',
      rango: `${desde} — ${hasta}`,
      secciones: [
        {
          titulo: 'Resumen',
          lineas: [
            `Movimientos: ${filasVisibles.length}`,
            `Total: ${fmtMonto(total)}`,
            categoriaFiltro ? `Categoría: ${categoriaFiltro}` : null,
            qBusqueda.trim() ? `Buscar: ${qBusqueda.trim()}` : null,
          ].filter(Boolean),
        },
      ],
      tabla: {
        cols: [
          { label: 'Fecha', key: 'fecha' },
          { label: 'Tienda', key: 'tienda' },
          { label: 'Empleado', key: 'empleado' },
          { label: 'Nombre', key: 'nombre' },
          { label: 'Concepto', key: 'concepto' },
          { label: 'Cant.', key: 'cantidad', align: 'right' },
          { label: 'Monto', key: 'monto', align: 'right' },
        ],
        rows: tablaFilas,
      },
    });
  };

  return (
    <div className="card" style={{ marginTop: '1rem' }}>
      <h3 style={{ margin: '0 0 0.35rem', color: 'var(--brand-blue)' }}>Gastos por tienda y empleado</h3>
      <p className="muted" style={{ margin: '0 0 0.75rem', fontSize: '0.85rem' }}>
        Detalle de gastos capturados en cortes (Virtual, Abarrotes, Garage): fecha, empleado, descripción, concepto y monto.
        {esAdmin
          ? ' Como administrador puedes borrar un gasto aquí; también se quita de IE Virtual o IE Abarrotes.'
          : ''}
      </p>

      <div className="grid-2" style={{ gap: '0.75rem', marginBottom: '0.75rem' }}>
        <FiltroRangoCalendario desde={desde} hasta={hasta} onDesdeChange={setDesde} onHastaChange={setHasta} />
        <label className="muted" style={{ display: 'block' }}>
          Tienda
          <select className="select" style={{ marginTop: '0.35rem' }} value={tiendaFiltro} onChange={(e) => setTiendaFiltro(e.target.value)}>
            <option value="">Todas</option>
            {tiendas.map((codigo) => (
              <option key={codigo} value={codigo}>
                {etiquetaTienda(codigo)}
              </option>
            ))}
          </select>
        </label>
        <label className="muted" style={{ display: 'block' }}>
          Módulo corte
          <select className="select" style={{ marginTop: '0.35rem' }} value={moduloFiltro} onChange={(e) => setModuloFiltro(e.target.value)}>
            <option value="">Todos</option>
            {MODULOS_GASTO.map((m) => (
              <option key={m} value={m}>
                {ETIQUETA_MODULO_GASTO[m]}
              </option>
            ))}
          </select>
        </label>
        <label className="muted" style={{ display: 'block' }}>
          Empleado
          <input
            className="input"
            style={{ marginTop: '0.35rem' }}
            list="gastos-empleados-list"
            placeholder="Todos o buscar nombre…"
            value={empleadoFiltro}
            onChange={(e) => setEmpleadoFiltro(e.target.value)}
          />
          <datalist id="gastos-empleados-list">
            {empleadosLista.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </label>
        <label className="muted" style={{ display: 'block' }}>
          Categoría
          <select
            className="select"
            style={{ marginTop: '0.35rem' }}
            value={categoriaFiltro}
            onChange={(e) => setCategoriaFiltro(e.target.value)}
          >
            <option value="">Todas</option>
            {categoriasLista.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="muted" style={{ display: 'block', gridColumn: '1 / -1' }}>
          Buscar por palabra clave
          <input
            className="input"
            style={{ marginTop: '0.35rem' }}
            type="search"
            placeholder="Ej. taxi, consumo, proveedor, folio…"
            value={qBusqueda}
            onChange={(e) => setQBusqueda(e.target.value)}
          />
        </label>
      </div>

      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        {VISTAS.map((v) => (
          <button
            key={v.id}
            type="button"
            className={vista === v.id ? 'btn btn-primary' : 'btn btn-ghost'}
            style={{ fontSize: '0.82rem', padding: '0.35rem 0.65rem' }}
            onClick={() => setVista(v.id)}
          >
            {v.label}
          </button>
        ))}
        <span className="muted" style={{ alignSelf: 'center', fontSize: '0.82rem', marginLeft: 'auto' }}>
          {cargando
            ? 'Cargando…'
            : `${filasVisibles.length}${filasVisibles.length !== filas.length ? ` / ${filas.length}` : ''} mov. · ${fmtMonto(total)}`}
        </span>
      </div>

      {error && <p style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>{error}</p>}

      {vista === 'detalle' && (
        <TablaDetalle filas={filasVisibles} puedeBorrar={esAdmin} borrandoId={borrandoId} onBorrar={borrarGasto} />
      )}
      {vista === 'tienda' && <TablaAgrupada grupos={porTienda} colGrupo="Tienda" />}
      {vista === 'empleado' && <TablaAgrupada grupos={porEmpleado} colGrupo="Empleado" />}

      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-gold" disabled={!filasVisibles.length} onClick={exportarCsv}>
          <BtnLabel icon="download">Exportar CSV</BtnLabel>
        </button>
        <button type="button" className="btn btn-ghost" disabled={!filasVisibles.length} onClick={imprimir}>
          <BtnLabel icon="print">Imprimir</BtnLabel>
        </button>
        <button type="button" className="btn btn-ghost" disabled={cargando} onClick={cargar}>
          Actualizar
        </button>
      </div>
    </div>
  );
}
