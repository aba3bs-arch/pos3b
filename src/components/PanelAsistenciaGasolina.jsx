import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BENEFICIARIOS_VALES, ETIQUETA_AREA } from '../lib/contabilidadConstants.js';
import { listarValesGasolina, marcarValeCobrado } from '../lib/valesPrestamos.js';
import { periodoSemanaNomina, etiquetaSemanaNomina } from '../lib/semanaNomina.js';
import FiltroRangoCalendario from '../components/FiltroRangoCalendario.jsx';
import {
  valeRequirioAprobacionAdmin,
  estadoCobroGasolina,
  HORA_LIMITE_COBRO_GASOLINA,
} from '../lib/asistenciaGasolina.js';
import { HORA_LIMITE_VALE } from '../lib/contabilidadConstants.js';

function fmtFecha(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  if (!d) return iso;
  return `${d}/${m}/${y}`;
}

function IconoAprobacionAdmin() {
  return (
    <span
      title="Vale aprobado por administrador (solicitado después de las 9:00)"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: '1.75rem',
        height: '1.75rem',
        borderRadius: '8px',
        fontSize: '1rem',
        fontWeight: 800,
        background: 'rgba(211,47,47,0.12)',
        color: '#c62828',
        lineHeight: 1,
      }}
    >
      ✓
    </span>
  );
}

function IconoCobroGasolina({ vale, editable, onClick }) {
  const estado = estadoCobroGasolina(vale);
  const estiloBase = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '2rem',
    height: '2rem',
    borderRadius: '8px',
    fontSize: '1.05rem',
    fontWeight: 800,
    border: 'none',
    cursor: editable ? 'pointer' : 'default',
    lineHeight: 1,
    gap: '0.1rem',
    padding: '0 0.35rem',
  };

  if (estado === 'cobrado_temprano') {
    return (
      <button
        type="button"
        title={editable ? 'Cobrado antes de las 9:00 — día laboral. Clic para marcar como no cobrado.' : 'Cobrado antes de las 9:00 — día laboral'}
        style={{ ...estiloBase, background: 'rgba(46,125,50,0.15)', color: '#2e7d32' }}
        onClick={editable ? onClick : undefined}
        disabled={!editable}
      >
        ✓✓
      </button>
    );
  }

  if (estado === 'cobrado') {
    return (
      <button
        type="button"
        title={editable ? 'Vale cobrado — día laboral. Clic para marcar como no cobrado.' : 'Vale cobrado — día laboral'}
        style={{ ...estiloBase, background: 'rgba(46,125,50,0.15)', color: '#2e7d32' }}
        onClick={editable ? onClick : undefined}
        disabled={!editable}
      >
        ✓
      </button>
    );
  }

  if (estado === 'falta') {
    return (
      <button
        type="button"
        title={editable ? `No cobrado antes de las ${HORA_LIMITE_COBRO_GASOLINA}:00 — falta. Clic para marcar como cobrado.` : `No cobrado antes de las ${HORA_LIMITE_COBRO_GASOLINA}:00 — falta`}
        style={{ ...estiloBase, background: 'rgba(211,47,47,0.12)', color: '#c62828' }}
        onClick={editable ? onClick : undefined}
        disabled={!editable}
      >
        ✗
      </button>
    );
  }

  return (
    <button
      type="button"
      title={editable ? `Pendiente de cobro (plazo hasta las ${HORA_LIMITE_COBRO_GASOLINA}:00). Clic para marcar como cobrado.` : `Pendiente de cobro hasta las ${HORA_LIMITE_COBRO_GASOLINA}:00`}
      style={{ ...estiloBase, background: 'rgba(0,0,0,0.06)', color: 'var(--muted)', fontSize: '0.9rem' }}
      onClick={editable ? onClick : undefined}
      disabled={!editable}
    >
      …
    </button>
  );
}

export default function PanelAsistenciaGasolina({ supabase, sucursal, user, editable = true, desde: desdeProp, hasta: hastaProp }) {
  const semana = useMemo(() => periodoSemanaNomina(), []);
  const [desde, setDesde] = useState(desdeProp || semana.inicio);
  const [hasta, setHasta] = useState(hastaProp || semana.fin);
  const [vales, setVales] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [err, setErr] = useState('');
  const [empleadoFiltro, setEmpleadoFiltro] = useState('');
  const [areaFiltro, setAreaFiltro] = useState('');
  const [tickHora, setTickHora] = useState(() => Date.now());

  useEffect(() => {
    if (desdeProp) setDesde(desdeProp);
    if (hastaProp) setHasta(hastaProp);
  }, [desdeProp, hastaProp]);

  const cargar = useCallback(async () => {
    if (!supabase) return;
    setCargando(true);
    setErr('');
    const res = await listarValesGasolina(supabase, { sucursal, desde, hasta, limit: 500 });
    if (res.error) setErr(res.error);
    setVales(res.data || []);
    setCargando(false);
  }, [supabase, sucursal, desde, hasta]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    const tick = () => setTickHora(Date.now());
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  const valesFiltrados = useMemo(() => {
    let lista = [...(vales || [])];
    if (empleadoFiltro) {
      lista = lista.filter((v) => String(v.nombre_empleado || '').toLowerCase() === empleadoFiltro.toLowerCase());
    }
    if (areaFiltro) {
      lista = lista.filter((v) => String(v.area || '').toLowerCase() === areaFiltro.toLowerCase());
    }
    return lista.sort((a, b) => {
      const fa = String(a.fecha || a.created_at || '');
      const fb = String(b.fecha || b.created_at || '');
      return fb.localeCompare(fa);
    });
  }, [vales, empleadoFiltro, areaFiltro]);

  const resumen = useMemo(() => {
    let cobrados = 0;
    let cobradosTemprano = 0;
    let faltas = 0;
    let pendientes = 0;
    const ahora = new Date(tickHora);
    for (const v of valesFiltrados) {
      const est = estadoCobroGasolina(v, ahora);
      if (est === 'cobrado_temprano') {
        cobradosTemprano += 1;
        cobrados += 1;
      } else if (est === 'cobrado') cobrados += 1;
      else if (est === 'falta') faltas += 1;
      else pendientes += 1;
    }
    return { cobrados, cobradosTemprano, faltas, pendientes };
  }, [valesFiltrados, tickHora]);

  const toggleCobrado = async (vale) => {
    if (!editable || !supabase) return;
    const est = estadoCobroGasolina(vale);
    const nuevo = est !== 'cobrado' && est !== 'cobrado_temprano';
    const msg = nuevo
      ? `¿Marcar vale ${vale.folio} del ${fmtFecha(vale.fecha)} como COBRADO (día laboral)?`
      : `¿Marcar vale ${vale.folio} del ${fmtFecha(vale.fecha)} como NO COBRADO?${est === 'falta' ? ' Se mantiene como falta en nómina.' : ''}`;
    if (!confirm(msg)) return;

    const res = await marcarValeCobrado(supabase, vale.id, nuevo, { nombre: user?.nombre });
    if (!res.ok) return alert(res.error);
    setVales((prev) => prev.map((v) => (v.id === vale.id ? res.vale : v)));
  };

  const usarSemanaActual = () => {
    const s = periodoSemanaNomina();
    setDesde(s.inicio);
    setHasta(s.fin);
  };

  return (
    <div className="card">
      <h3 style={{ margin: '0 0 0.5rem', color: 'var(--brand-blue)' }}>Asistencia — vales de gasolina</h3>
      <p className="muted" style={{ margin: '0 0 0.75rem', fontSize: '0.85rem' }}>
        <span style={{ color: '#2e7d32', fontWeight: 700 }}>✓✓ Verde</span> = cobrado antes de las {HORA_LIMITE_VALE}:00.{' '}
        <span style={{ color: '#2e7d32', fontWeight: 700 }}>✓ Verde</span> = cobrado (día laboral).{' '}
        <span style={{ color: '#c62828', fontWeight: 700 }}>✓ Roja</span> = vale aprobado por admin (después de las 9:00).{' '}
        <span style={{ color: '#c62828', fontWeight: 700 }}>✗</span> = falta (no cobrado antes de las {HORA_LIMITE_COBRO_GASOLINA}:00).
      </p>

      <div className="grid-2" style={{ marginBottom: '0.75rem' }}>
        <FiltroRangoCalendario desde={desde} hasta={hasta} onDesdeChange={setDesde} onHastaChange={setHasta} />
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.85rem' }}>
          Área
          <select className="select" value={areaFiltro} onChange={(e) => setAreaFiltro(e.target.value)}>
            <option value="">Todas</option>
            <option value="virtual">Virtual</option>
            <option value="abarrotes">Abarrotes</option>
            <option value="garage">Garage</option>
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.85rem' }}>
          Empleado
          <select className="select" value={empleadoFiltro} onChange={(e) => setEmpleadoFiltro(e.target.value)}>
            <option value="">Todos</option>
            {BENEFICIARIOS_VALES.map((b) => (
              <option key={b.id} value={b.nombre}>
                {b.nombre} — {ETIQUETA_AREA[b.area]}
              </option>
            ))}
          </select>
        </label>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-ghost" onClick={usarSemanaActual}>
            Semana actual
          </button>
          <button type="button" className="btn btn-ghost" disabled={cargando} onClick={cargar}>
            Actualizar
          </button>
        </div>
      </div>

      <p style={{ margin: '0 0 0.75rem', fontSize: '0.85rem' }}>
        <strong>{resumen.cobrados}</strong> día(s) laboral(es)
        {resumen.cobradosTemprano > 0 && (
          <span className="muted"> ({resumen.cobradosTemprano} antes de las {HORA_LIMITE_VALE}:00)</span>
        )}
        {' · '}
        <strong style={{ color: '#c62828' }}>{resumen.faltas}</strong> falta(s)
        {resumen.pendientes > 0 && (
          <span className="muted"> · {resumen.pendientes} pendiente(s)</span>
        )}
        {desde && hasta && (
          <span className="muted"> · {etiquetaSemanaNomina(desde, hasta)}</span>
        )}
      </p>

      {err && <p style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>{err}</p>}

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Día</th>
              <th>Empleado</th>
              <th>Folio</th>
              <th>Área</th>
              <th style={{ textAlign: 'center' }}>Vale</th>
              <th style={{ textAlign: 'center' }}>Cobro</th>
            </tr>
          </thead>
          <tbody>
            {valesFiltrados.map((v) => (
              <tr key={v.id}>
                <td style={{ fontWeight: 600 }}>{fmtFecha(v.fecha)}</td>
                <td>{v.nombre_empleado}</td>
                <td className="muted">{v.folio}</td>
                <td className="muted">{ETIQUETA_AREA[v.area] || v.area}</td>
                <td style={{ textAlign: 'center' }}>
                  {valeRequirioAprobacionAdmin(v) ? <IconoAprobacionAdmin /> : <span className="muted">—</span>}
                </td>
                <td style={{ textAlign: 'center' }}>
                  <IconoCobroGasolina vale={v} editable={editable} onClick={() => toggleCobrado(v)} />
                </td>
              </tr>
            ))}
            {valesFiltrados.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  {cargando ? 'Cargando…' : 'Sin vales de gasolina aprobados en este periodo.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
