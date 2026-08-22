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

const DOW_LUN = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa', 'Do'];

const ETIQUETA_ESTADO = {
  trabajado: 'Trabajó',
  descanso: 'Descanso',
  falta: 'Falta',
  futuro: 'Futuro',
  fuera: '',
};

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

function tituloMesSemanas(semanas) {
  if (!semanas?.length) return '';
  const ym = new Set();
  for (const sem of semanas) {
    for (const c of sem) {
      if (c.estado === 'fuera') continue;
      ym.add(c.ymd.slice(0, 7));
    }
  }
  const labels = [...ym].map((k) => {
    const [y, m] = k.split('-').map(Number);
    const d = new Date(y, m - 1, 1);
    return d.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
  });
  return labels.join(' · ');
}

function CalendarioEmpleado({ semanas, esCubreTurno }) {
  if (!semanas?.length) return null;
  const titulo = tituloMesSemanas(semanas);
  return (
    <div className="rda-cal" aria-label="Calendario de asistencia">
      {titulo ? <div className="rda-cal-mes">{titulo}</div> : null}
      <div className="rda-cal-dow">
        {DOW_LUN.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="rda-cal-grid">
        {semanas.map((sem, si) =>
          sem.map((c) => {
            const estado = esCubreTurno && (c.estado === 'descanso' || c.estado === 'falta')
              ? 'fuera'
              : c.estado;
            const title = estado === 'fuera' ? '' : `${c.ymd} · ${ETIQUETA_ESTADO[estado] || ''}`;
            return (
              <span
                key={`${si}-${c.ymd}`}
                className={`rda-cal-day rda-cal-day--${estado}`}
                title={title}
              >
                <span className="rda-cal-n">{c.dia}</span>
              </span>
            );
          }),
        )}
      </div>
    </div>
  );
}

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
        Calendario por persona: ves exactamente qué días trabajó. Un día cuenta con{' '}
        <strong>entrada y salida</strong>. Turno nocturno (19:00 → 07:00): cuenta el día en que{' '}
        <strong>empieza a las 19 h</strong>, aunque la salida sea al día siguiente. En rachas sin
        jornada cerrada, el primero es descanso y el resto faltas. No se cuentan días futuros. Quien
        cubre turno (<strong>CT</strong>) solo marca los días cerrados.
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
      <div className="rda-leyenda" aria-hidden>
        <span className="rda-leyenda-item">
          <i className="rda-swatch rda-cal-day--trabajado" /> Trabajó
        </span>
        <span className="rda-leyenda-item">
          <i className="rda-swatch rda-cal-day--descanso" /> Descanso
        </span>
        <span className="rda-leyenda-item">
          <i className="rda-swatch rda-cal-day--falta" /> Falta
        </span>
        <span className="rda-leyenda-item">
          <i className="rda-swatch rda-cal-day--futuro" /> Futuro
        </span>
      </div>
      <p className="muted" style={{ fontSize: '0.8rem', margin: '0 0 0.75rem' }}>
        {cargando ? 'Cargando…' : `${filas.length} empleado(s)`} · {esAdmin ? etiquetaTiendaFiltro : etiquetaTienda(sucursal)} · {etiquetaPeriodo}
      </p>
      {error && (
        <p style={{ margin: '0 0 0.75rem', color: 'var(--brand-red)' }}>{error}</p>
      )}
      {!error && !cargando && filas.length === 0 ? (
        <p className="muted">Sin empleados ni checadas en el periodo.</p>
      ) : !error && !cargando ? (
        <div className="rda-lista">
          {filas.map((f) => (
            <article key={f.clave} className="rda-card">
              <header className="rda-card-head">
                <div>
                  <strong className="rda-nombre">
                    {f.nombre}
                    {f.esCubreTurno ? (
                      <span className="badge" style={{ marginLeft: '0.4rem' }}>
                        CT
                      </span>
                    ) : null}
                  </strong>
                  <div className="muted" style={{ fontSize: '0.8rem' }}>
                    {f.sucursalEtiqueta}
                  </div>
                </div>
                <div className="rda-totales">
                  <span>
                    <strong>{f.dias}</strong> días
                  </span>
                  <span className={f.esCubreTurno ? 'muted' : undefined}>
                    {f.esCubreTurno ? '—' : f.descansos} desc.
                  </span>
                  <span className={f.esCubreTurno ? 'muted' : undefined}>
                    {f.esCubreTurno ? '—' : f.faltas} faltas
                  </span>
                </div>
              </header>
              <CalendarioEmpleado semanas={f.calendario} esCubreTurno={f.esCubreTurno} />
              {f.diasTrabajadosYmd?.length > 0 ? (
                <p className="rda-fechas muted">
                  Trabajó:{' '}
                  {f.diasTrabajadosYmd
                    .map((d) => {
                      const [, m, day] = d.split('-');
                      return `${Number(day)}/${Number(m)}`;
                    })
                    .join(', ')}
                </p>
              ) : (
                <p className="rda-fechas muted">Sin jornadas cerradas en el periodo.</p>
              )}
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}
