import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { listarSucursalesOperativas, etiquetaTienda } from '../constants/sucursales.js';
import FiltroPeriodo from '../components/FiltroPeriodo.jsx';
import {
  cargarContVirtual,
  PRESETS_CONT_VIRTUAL,
  rangoDesdePresetContVirtual,
} from '../lib/contVirtualData.js';

function fmt(n) {
  return `$${(Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function Kpi({ label, value, sub, accent }) {
  return (
    <div className="card" style={{ borderTop: accent ? `4px solid ${accent}` : undefined }}>
      <div className="muted" style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--brand-blue)', marginTop: '0.35rem' }}>{value}</div>
      {sub && <div className="muted" style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>{sub}</div>}
    </div>
  );
}

export default function ContVirtual({ supabase }) {
  const tiendas = useMemo(() => listarSucursalesOperativas(), []);
  const [filtroTienda, setFiltroTienda] = useState('');
  const [presetFecha, setPresetFecha] = useState('semana');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [cargando, setCargando] = useState(false);
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');

  const rango = useMemo(() => {
    if (presetFecha === 'rango') return { desde: desde || null, hasta: hasta || null };
    return rangoDesdePresetContVirtual(presetFecha);
  }, [presetFecha, desde, hasta]);

  const cargar = useCallback(async () => {
    if (!supabase || !rango?.desde || !rango?.hasta) return;
    setCargando(true);
    setError('');
    const res = await cargarContVirtual(supabase, {
      desde: rango.desde,
      hasta: rango.hasta,
      sucursal: filtroTienda || null,
    });
    setCargando(false);
    if (!res.ok) {
      setError(res.error || 'Error al cargar');
      setDatos(null);
      return;
    }
    setDatos(res);
  }, [supabase, rango, filtroTienda]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const cat = datos?.egresosPorCat || {};

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <h2 style={{ margin: 0, color: '#8e44ad' }}>Cont Virtual</h2>
        <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.88rem' }}>
          Ingresos y egresos del departamento Virtual (independiente de Abarrotes / Resumen operativo).
          Fuentes: cortes virtual, vales, préstamos y consumos.
        </p>
      </div>

      <div className="card">
        <h3 style={{ margin: '0 0 0.75rem', color: '#8e44ad' }}>Filtros</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
          <label className="muted" style={{ fontSize: '0.8rem' }}>
            Tienda
            <select className="select" style={{ display: 'block', marginTop: '0.2rem', minWidth: 160 }} value={filtroTienda} onChange={(e) => setFiltroTienda(e.target.value)}>
              <option value="">Todas las tiendas</option>
              {tiendas.map((t) => (
                <option key={t} value={t}>{etiquetaTienda(t)}</option>
              ))}
            </select>
          </label>
          <FiltroPeriodo
            labelPeriodo="Periodo"
            preset={presetFecha}
            onPresetChange={setPresetFecha}
            desde={desde}
            hasta={hasta}
            onDesdeChange={setDesde}
            onHastaChange={setHasta}
            presets={PRESETS_CONT_VIRTUAL}
            className="cal-picker-wrap--inline"
          />
          <button type="button" className="btn btn-primary" disabled={cargando} onClick={cargar}>
            {cargando ? 'Actualizando…' : 'Actualizar'}
          </button>
        </div>
        {error && <p style={{ color: 'var(--brand-red)', margin: '0.75rem 0 0' }}>{error}</p>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem' }}>
        <Kpi label="Ingresos (ventas corte)" value={fmt(datos?.ingresosTotal)} sub={`${datos?.cierresCount || 0} cierres`} accent="#8e44ad" />
        <Kpi label="Egresos" value={fmt(datos?.egresosTotal)} sub="Corte + vales + préstamos" accent="#c0392b" />
        <Kpi label="Neto" value={fmt(datos?.neto)} sub={`${rango?.desde || '—'} → ${rango?.hasta || '—'}`} accent="#16a34a" />
        <Kpi label="Recolección efectivo" value={fmt(datos?.recoleccionTotal)} sub="Informativo (retiros)" accent="#0d9488" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem' }}>
        <Kpi label="Consumo" value={fmt(cat.consumo)} sub="Gastos CONSUMO en virtual" />
        <Kpi label="Vales" value={fmt(cat.vales)} />
        <Kpi label="Préstamos (desembolso)" value={fmt(cat.prestamos)} />
        <Kpi label="Operativos / otros" value={fmt(cat.operativos)} />
      </div>

      <div className="card">
        <h3 style={{ margin: '0 0 0.5rem', color: '#8e44ad' }}>Cuotas de préstamo en nómina</h3>
        <p className="muted" style={{ margin: '0 0 0.75rem', fontSize: '0.85rem' }}>
          Los préstamos personales se descuentan en nómina. Mínimo semanal: <strong>{fmt(datos?.cuotaMinima || 500)}</strong>.
          Total esperado esta semana (préstamos activos): <strong>{fmt(datos?.cuotasNominaTotal)}</strong>.
        </p>
        {(datos?.cuotasNomina || []).length === 0 ? (
          <p className="muted">Sin préstamos activos.</p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Empleado</th>
                  <th>Tienda</th>
                  <th>Saldo</th>
                  <th>Cuota semanal</th>
                </tr>
              </thead>
              <tbody>
                {datos.cuotasNomina.map((p) => (
                  <tr key={p.id}>
                    <td>{p.empleado}</td>
                    <td>{etiquetaTienda(p.tienda)}</td>
                    <td>{fmt(p.saldo)}</td>
                    <td>{fmt(p.cuota_semanal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid-2" style={{ gap: '1rem' }}>
        <div className="card">
          <h3 style={{ margin: '0 0 0.75rem', color: '#8e44ad' }}>Ingresos por tienda</h3>
          {(datos?.ingresosPorTienda || []).length === 0 ? (
            <p className="muted">Sin cierres en el periodo.</p>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Tienda</th>
                    <th>Ingresos</th>
                    <th>Cierres</th>
                    <th>Recolección</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.ingresosPorTienda.map((r) => (
                    <tr key={r.id}>
                      <td>{r.label}</td>
                      <td>{fmt(r.ingresos)}</td>
                      <td>{r.cierres}</td>
                      <td>{fmt(r.recolecciones)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="card">
          <h3 style={{ margin: '0 0 0.75rem', color: '#8e44ad' }}>Egresos por tienda</h3>
          {(datos?.egresosPorTienda || []).length === 0 ? (
            <p className="muted">Sin egresos en el periodo.</p>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Tienda</th>
                    <th>Total</th>
                    <th>Consumo</th>
                    <th>Vales</th>
                    <th>Préstamos</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.egresosPorTienda.map((r) => (
                    <tr key={r.id}>
                      <td>{r.label}</td>
                      <td>{fmt(r.total)}</td>
                      <td>{fmt(r.consumo)}</td>
                      <td>{fmt(r.vales)}</td>
                      <td>{fmt(r.prestamos)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <h3 style={{ margin: '0 0 0.75rem', color: '#8e44ad' }}>Detalle de egresos</h3>
        {(datos?.detalleGastos || []).length === 0 ? (
          <p className="muted">Sin movimientos.</p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Tienda</th>
                  <th>Fuente</th>
                  <th>Categoría</th>
                  <th>Empleado</th>
                  <th>Detalle</th>
                  <th>Monto</th>
                </tr>
              </thead>
              <tbody>
                {datos.detalleGastos.map((g) => (
                  <tr key={`${g.fuente}-${g.id}`}>
                    <td>{g.fecha}</td>
                    <td>{etiquetaTienda(g.tienda)}</td>
                    <td>{g.fuente}</td>
                    <td>{g.categoria}{g.subcategoria ? ` / ${g.subcategoria}` : ''}</td>
                    <td>{g.empleado || '—'}</td>
                    <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.comentario || '—'}</td>
                    <td>{fmt(g.monto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
