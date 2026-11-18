import React, { useMemo, useState } from 'react';
import { etiquetaTienda, esSucursalRuta, listarSucursalesOperativas } from '../constants/sucursales.js';
import {
  ajustarCuadrePiezas,
  analizarCuadrePiezas,
  parseCodigosCuadre,
  parseConteosCuadre,
  textoResumenCuadre,
  ymdPhoenix,
} from '../lib/cuadrePiezas.js';
import { puedeAjustarCuadre } from '../lib/cuadrePrivilegios.js';

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
  const [busca, setBusca] = useState('');
  const [soloDesfase, setSoloDesfase] = useState(false);
  const puedeAjustar = puedeAjustarCuadre(user);

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
    setBusca('');
    setSoloDesfase(false);
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
  const resumen = reporte?.resumen || null;
  const hayAjuste = (resumen?.piezasPorAjustar || 0) > 0;
  const q = busca.trim().toLowerCase();
  const visibles = filas.filter((f) => {
    if (soloDesfase && !f.diferencia) return false;
    if (!q) return true;
    return String(f.nombre || '').toLowerCase().includes(q) || String(f.id).toLowerCase().includes(q);
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', padding: '0.85rem' }}>
      <div className="card" style={{ borderTop: '4px solid #0f766e' }}>
        <h3 style={{ margin: 0, color: '#0f766e' }}>Cuadre de piezas</h3>
        <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.85rem' }}>
          Revisa toda la mercancía vendida en la sucursal y las fechas. Cada producto se compara con sus tickets, con lo que muestra Consultas y con el inventario del piso. Si un ticket se guardó dos veces, cuenta una sola venta. Los códigos son opcionales. El ajuste baja solo las piezas de la venta que nunca salieron del piso.
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
            Códigos (opcional)
            <input className="input" value={codigos} placeholder="Vacío = toda la vendida" onChange={(e) => setCodigos(e.target.value)} />
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

      {resumen && (
        <div className="card" style={{ borderTop: '4px solid #0f766e' }}>
          <p style={{ margin: 0 }}>{textoResumenCuadre(resumen)}</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.5rem', marginTop: '0.7rem' }}>
            {[
              ['Productos', resumen.productosVendidos],
              ['Piezas vendidas', resumen.piezasVendidas],
              ['Tickets', resumen.ticketsReales],
              ['Coinciden', resumen.coinciden],
              ['Con desfase', resumen.conDesfase],
            ].map(([label, value]) => (
              <div key={label} style={{ padding: '0.45rem 0.6rem', borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                <div className="muted" style={{ fontSize: '0.72rem' }}>{label}</div>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.7rem', alignItems: 'center' }}>
            <input
              className="input"
              value={busca}
              placeholder="Buscar código o producto"
              onChange={(e) => setBusca(e.target.value)}
              style={{ maxWidth: 280 }}
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}>
              <input type="checkbox" checked={soloDesfase} onChange={(e) => setSoloDesfase(e.target.checked)} />
              Solo con desfase
            </label>
          </div>
          <div style={{ overflowX: 'auto', marginTop: '0.7rem' }}>
            <table className="consultas-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Producto</th>
                  <th style={{ textAlign: 'right' }}>Venta real</th>
                  <th style={{ textAlign: 'right' }}>Consulta</th>
                  <th style={{ textAlign: 'right' }}>Repetidas</th>
                  <th style={{ textAlign: 'right' }}>Sin baja</th>
                  <th style={{ textAlign: 'right' }}>Piso</th>
                  <th style={{ textAlign: 'right' }}>Conteo</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {visibles.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="muted">{filas.length === 0 ? 'Sin mercancía vendida en el periodo.' : 'Ningún producto con ese filtro.'}</td>
                  </tr>
                ) : visibles.map((f) => (
                  <tr key={f.id} style={f.diferencia ? { background: '#fffbeb' } : undefined}>
                    <td style={{ fontWeight: 700 }}>{f.id}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{f.nombre}</div>
                      {f.diferencia && (
                        <div className="muted" style={{ fontSize: '0.78rem', marginTop: 2, maxWidth: 420 }}>{f.explicacion}</div>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>{f.piezasReales}</td>
                    <td style={{ textAlign: 'right' }}>{f.piezasConsulta}</td>
                    <td style={{ textAlign: 'right' }}>{f.piezasDuplicadas}</td>
                    <td style={{ textAlign: 'right', fontWeight: f.sinBaja > 0 ? 700 : 400, color: f.sinBaja > 0 ? '#b45309' : undefined }}>{f.sinBaja}</td>
                    <td style={{ textAlign: 'right' }}>{f.stock ?? '—'}</td>
                    <td style={{ textAlign: 'right' }}>{f.contado ?? '—'}</td>
                    <td>{f.diferencia ? 'Desfase' : 'Coincide'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {hayAjuste && puedeAjustar && (
        <button type="button" className="btn btn-primary" disabled={ajustando} onClick={() => void ajustar()}>
          {ajustando ? 'Ajustando…' : `Ajustar ${resumen.piezasPorAjustar} pieza(s)`}
        </button>
      )}
      {hayAjuste && !puedeAjustar && (
        <p className="muted" style={{ margin: 0 }}>El ajuste lo aplica el administrador, Luz Elena, o quien se marque en Configuración → Privilegios → Cuadre de piezas.</p>
      )}
    </div>
  );
}
