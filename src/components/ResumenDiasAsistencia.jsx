import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { esAlmacenCentral, etiquetaTienda, listarSucursalesParaUI } from '../constants/sucursales.js';
import { rangoDesdePreset } from '../lib/consultasInventario.js';
import {
  cargarMarcajesResumen,
  cargarUsuariosResumen,
  construirResumenEmpleados,
} from '../lib/resumenDiasAsistencia.js';
import { ymdLocal } from '../lib/semanaNomina.js';
import FiltroPeriodo from './FiltroPeriodo.jsx';

function rangoSemana(offset = 0) {
  const hoy = new Date();
  const day = hoy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const ini = new Date(hoy);
  ini.setDate(hoy.getDate() + diff + offset * 7);
  ini.setHours(0, 0, 0, 0);
  const fin = new Date(ini);
  fin.setDate(ini.getDate() + 6);
  fin.setHours(23, 59, 59, 999);
  return { desde: ini, hasta: fin };
}

const PRESETS_RESUMEN = [
  { id: 'hoy', label: 'Hoy' },
  { id: '7d', label: 'Últimos 7 días' },
  { id: 'semana', label: 'Semana actual' },
  { id: 'semana_ant', label: 'Semana anterior' },
  { id: 'rango', label: 'Rango personalizado' },
];

export default function ResumenDiasAsistencia({ supabase, sucursal, esAdmin, sucursalesLista }) {
  const tiendas = (sucursalesLista?.length ? sucursalesLista : listarSucursalesParaUI()).filter(
    (t) => !esAlmacenCentral(t),
  );
  const [filtroTienda, setFiltroTienda] = useState(esAdmin ? '' : sucursal || '');
  const [preset, setPreset] = useState('semana');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!esAdmin) setFiltroTienda(sucursal || '');
  }, [sucursal, esAdmin]);

  const rango = useMemo(() => {
    if (preset === 'semana') return rangoSemana(0);
    if (preset === 'semana_ant') return rangoSemana(-1);
    if (preset === 'rango' && desde && hasta) {
      return {
        desde: new Date(`${desde}T00:00:00`),
        hasta: new Date(`${hasta}T23:59:59.999`),
      };
    }
    const ymd = rangoDesdePreset(preset);
    if (ymd) {
      return {
        desde: new Date(`${ymd.desde}T00:00:00`),
        hasta: new Date(`${ymd.hasta}T23:59:59.999`),
      };
    }
    return rangoSemana(0);
  }, [preset, desde, hasta]);

  const cargar = useCallback(async () => {
    if (!supabase) {
      setFilas([]);
      setError('Configura Supabase para ver el resumen de asistencia.');
      return;
    }
    const tienda = esAdmin ? filtroTienda : sucursal;
    if (!esAdmin && !tienda) {
      setFilas([]);
      setError('No hay sucursal seleccionada.');
      return;
    }
    setCargando(true);
    setError('');
    const { desde: d, hasta: h } = rango;
    const [uRes, mRes] = await Promise.all([
      cargarUsuariosResumen(supabase, { sucursalId: tienda || null }),
      cargarMarcajesResumen(supabase, {
        desdeIso: d.toISOString(),
        hastaIso: h.toISOString(),
        sucursalId: tienda || null,
      }),
    ]);
    if (uRes.error || mRes.error) {
      setFilas([]);
      setError((uRes.error || mRes.error)?.message || 'No se pudo cargar el resumen.');
      setCargando(false);
      return;
    }
    setFilas(
      construirResumenEmpleados({
        usuarios: uRes.data || [],
        marcajes: mRes.data || [],
        desdeYmd: ymdLocal(d),
        hastaYmd: ymdLocal(h),
        filtroSucursal: tienda || '',
      }),
    );
    setCargando(false);
  }, [supabase, esAdmin, filtroTienda, sucursal, rango]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const etiquetaPeriodo = `${ymdLocal(rango.desde)} — ${ymdLocal(rango.hasta)}`;
  const etiquetaTiendaFiltro = filtroTienda ? etiquetaTienda(filtroTienda) : 'Todas las tiendas';

  return (
    <div className="card" style={{ borderTop: '4px solid var(--brand-blue)' }}>
      <h3 style={{ margin: '0 0 0.5rem', color: 'var(--brand-blue)' }}>Resumen de días</h3>
      <p className="muted" style={{ marginTop: 0, fontSize: '0.85rem' }}>
        De los días <strong>seguidos</strong> sin checada, el primero cuenta como descanso; a partir del segundo son faltas.
        No se cuentan días futuros. Quien cubre turno (<strong>CT</strong>) solo suma los días que checó: sin descanso ni faltas.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem', alignItems: 'flex-end' }}>
        {esAdmin && (
          <label className="muted" style={{ fontSize: '0.8rem' }}>
            Tienda
            <select
              className="select"
              style={{ display: 'block', marginTop: '0.2rem', minWidth: 160 }}
              value={filtroTienda}
              onChange={(e) => setFiltroTienda(e.target.value)}
            >
              <option value="">Todas</option>
              {tiendas.map((t) => (
                <option key={t} value={t}>
                  {etiquetaTienda(t)}
                </option>
              ))}
            </select>
          </label>
        )}
        <FiltroPeriodo
          labelPeriodo="Periodo"
          presets={PRESETS_RESUMEN}
          preset={preset}
          onPresetChange={setPreset}
          desde={desde}
          hasta={hasta}
          onDesdeChange={setDesde}
          onHastaChange={setHasta}
          mostrarResumen={false}
          className="cal-picker-wrap--inline"
        />
        <button type="button" className="btn btn-primary" onClick={cargar} disabled={cargando}>
          {cargando ? 'Cargando…' : 'Actualizar'}
        </button>
      </div>
      <p className="muted" style={{ fontSize: '0.8rem', margin: '0 0 0.5rem' }}>
        {cargando ? 'Cargando…' : `${filas.length} empleado(s)`} · {esAdmin ? etiquetaTiendaFiltro : etiquetaTienda(sucursal)} · {etiquetaPeriodo}
      </p>
      {error && (
        <p style={{ margin: '0 0 0.75rem', color: 'var(--brand-red)' }}>{error}</p>
      )}
      {!error && !cargando && filas.length === 0 ? (
        <p className="muted">Sin empleados ni checadas en el periodo.</p>
      ) : !error ? (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Empleado</th>
                <th>Tienda</th>
                <th>Días</th>
                <th>Descanso</th>
                <th>Faltas</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.clave}>
                  <td>
                    {f.nombre}
                    {f.esCubreTurno ? (
                      <span className="badge" style={{ marginLeft: '0.4rem' }}>
                        CT
                      </span>
                    ) : null}
                  </td>
                  <td>{f.sucursalEtiqueta}</td>
                  <td style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{f.dias}</td>
                  <td className={f.esCubreTurno ? 'muted' : undefined} style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {f.esCubreTurno ? '—' : f.descansos}
                  </td>
                  <td className={f.esCubreTurno ? 'muted' : undefined} style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {f.esCubreTurno ? '—' : f.faltas}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
