import React, { useMemo, useState } from 'react';
import { etiquetaTienda, esSucursalRuta, listarSucursalesOperativas } from '../constants/sucursales.js';
import {
  ajustarCuadrePiezas,
  analizarCuadrePiezas,
  parseCodigosCuadre,
  parseConteosCuadre,
  ymdPhoenix,
} from '../lib/cuadrePiezas.js';
import { tienePrivilegiosCompletos } from '../lib/roles.js';

function ayerPhoenix() {
  const hoy = ymdPhoenix();
  const d = new Date(`${hoy}T12:00:00-07:00`);
  d.setUTCDate(d.getUTCDate() - 1);
  return ymdPhoenix(d);
}

export default function CuadrePiezas({ supabase, inventario = [], sucursal, user }) {
  const tiendas = useMemo(
    () => listarSucursalesOperativas().filter((s) => !esSucursalRuta(s)),
    [],
  );
  const [tienda, setTienda] = useState(() => {
    const s = String(sucursal || '').toUpperCase();
    return tiendas.includes(s) ? s : (tiendas[0] || '');
  });
  const [desde, setDesde] = useState(ayerPhoenix);
  const [hasta, setHasta] = useState(() => ymdPhoenix());
  const [codigos, setCodigos] = useState('');
  const [conteoTexto, setConteoTexto] = useState('');
  const [reporte, setReporte] = useState(null);
  const [aviso, setAviso] = useState('');
  const [cargando, setCargando] = useState(false);
  const [ajustando, setAjustando] = useState(false);
  const puedeAjustar = tienePrivilegiosCompletos(user);

  const revisar = async () => {
    setCargando(true);
    setAviso('');
    const r = await analizarCuadrePiezas(supabase, {
      sucursal: tienda,
      desde,
      hasta,
      codigos: parseCodigosCuadre(codigos),
      conteos: parseConteosCuadre(conteoTexto),
      inventario,
    });
    setCargando(false);
    if (!r.ok) {
      setReporte(null);
      setAviso(r.error || 'No se pudo revisar.');
      return;
    }
    setReporte(r);
    if (!r.filas.length) setAviso('En este periodo no hay desfase entre ventas, consultas e inventario.');
  };

  const ajustar = async () => {
    const n = reporte?.resumen?.piezasPorAjustar || 0;
    if (!n) return;
    if (!confirm(`¿Bajar del piso de ${etiquetaTienda(tienda)} las ${n} pieza(s) vendidas que no salieron del inventario?`)) return;
    setAjustando(true);
    const r = await ajustarCuadrePiezas(supabase, reporte.filas, { usuario: user?.nombre });
    setAjustando(false);
    setAviso(r.mensaje || r.error || '');
    if (r.errores?.length) setAviso(`${r.mensaje}\n${r.errores.join('\n')}`);
    if (r.ok) await revisar();
  };

  const filas = reporte?.filas || [];
  const hayAjuste = (reporte?.resumen?.piezasPorAjustar || 0) > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', padding: '0.85rem' }}>
      <div className="card" style={{ borderTop: '4px solid #0f766e' }}>
        <h3 style={{ margin: 0, color: '#0f766e' }}>Cuadre de piezas</h3>
        <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.85rem' }}>
          Compara los tickets, lo que muestra Consultas y el inventario del piso. Si un ticket se guardó dos veces, cuenta una sola venta. El ajuste baja solo las piezas de esa venta que nunca salieron del piso.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.5rem', marginTop: '0.75rem' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.85rem' }}>
            Sucursal
            <select className="input" value={tienda} onChange={(e) => setTienda(e.target.value)}>
              {tiendas.map((s) => (
                <option key={s} value={s}>{etiquetaTienda(s)}</option>
              ))}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.85rem' }}>
            Desde
            <input className="input" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.85rem' }}>
            Hasta
            <input className="input" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.85rem' }}>
            Códigos
            <input className="input" value={codigos} placeholder="34, 41, 33, 30" onChange={(e) => setCodigos(e.target.value)} />
          </label>
        </div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.85rem', marginTop: '0.55rem' }}>
          Conteo físico, uno por línea (código y piezas contadas)
          <textarea className="input" rows={3} value={conteoTexto} placeholder={'34 16\n41 22\n33 2\n30 192'} onChange={(e) => setConteoTexto(e.target.value)} />
        </label>
        <button type="button" className="btn btn-primary" style={{ marginTop: '0.7rem' }} disabled={cargando} onClick={() => void revisar()}>
          {cargando ? 'Revisando…' : 'Revisar'}
        </button>
      </div>

      {aviso && <div className="card"><p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{aviso}</p></div>}

      {filas.map((f) => (
        <div key={f.id} className="card" style={{ borderLeft: `4px solid ${f.sinBaja > 0 ? '#b45309' : '#0f766e'}` }}>
          <strong>{f.nombre}</strong>
          <span className="muted"> · código {f.id}</span>
          <p style={{ margin: '0.45rem 0 0' }}>{f.explicacion}</p>
          <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.82rem' }}>
            Consulta {f.piezasConsulta} · venta real {f.piezasReales} · inventario {f.stock ?? '—'}
            {f.contado != null ? ` · conteo ${f.contado}` : ''}
            {f.sinBaja > 0 ? ` · por ajustar ${f.sinBaja}` : ''}
          </p>
        </div>
      ))}

      {hayAjuste && puedeAjustar && (
        <button type="button" className="btn btn-primary" disabled={ajustando} onClick={() => void ajustar()}>
          {ajustando ? 'Ajustando…' : `Ajustar ${reporte.resumen.piezasPorAjustar} pieza(s)`}
        </button>
      )}
      {hayAjuste && !puedeAjustar && (
        <p className="muted" style={{ margin: 0 }}>El ajuste lo aplica el administrador.</p>
      )}
    </div>
  );
}
