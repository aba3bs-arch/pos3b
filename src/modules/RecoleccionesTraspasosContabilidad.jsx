import React, { useCallback, useEffect, useMemo, useState } from 'react';
import FiltroRangoCalendario from '../components/FiltroRangoCalendario.jsx';
import InputPin from '../components/InputPin.jsx';
import SubcomandosHub from '../components/SubcomandosHub.jsx';
import VolverContabilidad from '../components/VolverContabilidad.jsx';
import {
  SUBCOMANDOS_RECOLECCIONES_CONTAB,
  subcomandosRecoleccionesVisibles,
} from '../lib/recoleccionesContabilidadAcciones.js';
import {
  actualizarRepartidor,
  actualizarServicioCobro,
  crearRepartidor,
  crearServicioCobro,
  desactivarServicioCobro,
  eliminarMovimientoTransito,
  eliminarRepartidor,
  fmtFechaClave,
  fmtFechaHora,
  fmtMonto,
  hoyClaveNogales,
  inicioMesClaveNogales,
  liberarEfectivoRepartidor,
  listarMovimientosRecoleccionContabilidad,
  listarMovimientosTransitoAdmin,
  listarRepartidores,
  listarRepartidoresTodos,
  listarServiciosCobroAdmin,
  listarTiendasEfectivo,
  registrarGastoRecolector,
  reporteGeneralPorTienda,
  reporteRecoleccionTiendaFecha,
  saldoEnTransitoRepartidor,
  slugRepartidorId,
} from '../lib/controlEfectivo.js';

function etiquetaTipo(m) {
  if (m.tipo_movimiento === 'Cobro Servicio') return 'Servicio';
  if (m.tipo_movimiento === 'Entrega Crédito') return 'Crédito';
  if (m.tipo_movimiento === 'Gasto') return 'Gasto';
  return 'Recolección';
}

export default function RecoleccionesTraspasosContabilidad({ supabase, user, onVolverContabilidad }) {
  const adminNombre = user?.nombre || 'Contabilidad';
  const subcomandos = useMemo(() => subcomandosRecoleccionesVisibles(user?.rol, user?.id), [user?.rol, user?.id]);
  const [tab, setTab] = useState(null);
  const [desde, setDesde] = useState(inicioMesClaveNogales);
  const [hasta, setHasta] = useState(hoyClaveNogales);
  const [estatus, setEstatus] = useState('');
  const [repFiltro, setRepFiltro] = useState('');
  const [tiendaFiltro, setTiendaFiltro] = useState('');
  const [movimientos, setMovimientos] = useState([]);
  const [repartidores, setRepartidores] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);

  const [servicios, setServicios] = useState([]);
  const [repsAdmin, setRepsAdmin] = useState([]);
  const [registrosAdmin, setRegistrosAdmin] = useState([]);

  const [srvForm, setSrvForm] = useState({ clave: '', nombre: '', monto_default: '50', frecuencia: 'Diario', obligatorio: true });
  const [repForm, setRepForm] = useState({ id: '', nombre: '', pin: '' });
  const [repEdit, setRepEdit] = useState(null);

  const [gastoRep, setGastoRep] = useState('');
  const [gastoMonto, setGastoMonto] = useState('');
  const [gastoDesc, setGastoDesc] = useState('');
  const [gastoTienda, setGastoTienda] = useState('');
  const [saldoRep, setSaldoRep] = useState(null);

  const tiendas = useMemo(() => listarTiendasEfectivo(), []);

  const cargarReporte = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setError(null);
    try {
      const [movs, reps] = await Promise.all([
        listarMovimientosRecoleccionContabilidad(supabase, {
          desde,
          hasta,
          estatus: estatus || undefined,
          repartidorId: repFiltro || undefined,
          tienda: tiendaFiltro || undefined,
        }),
        listarRepartidores(supabase).catch(() => []),
      ]);
      setMovimientos(movs);
      setRepartidores(reps);
    } catch (e) {
      setError(e.message?.includes('transito_efectivo') ? 'Ejecuta supabase/control_efectivo.sql en Supabase.' : e.message);
      setMovimientos([]);
    } finally {
      setLoading(false);
    }
  }, [supabase, desde, hasta, estatus, repFiltro, tiendaFiltro]);

  const cargarServicios = useCallback(async () => {
    if (!supabase) return;
    try {
      setServicios(await listarServiciosCobroAdmin(supabase));
    } catch (e) {
      setError(e.message);
    }
  }, [supabase]);

  const cargarRepartidoresAdmin = useCallback(async () => {
    if (!supabase) return;
    try {
      setRepsAdmin(await listarRepartidoresTodos(supabase));
    } catch (e) {
      setError(e.message);
    }
  }, [supabase]);

  const cargarRegistrosAdmin = useCallback(async () => {
    if (!supabase) return;
    try {
      setRegistrosAdmin(
        await listarMovimientosTransitoAdmin(supabase, {
          desde,
          hasta,
          repartidorId: repFiltro || undefined,
          tienda: tiendaFiltro || undefined,
        }),
      );
    } catch (e) {
      setError(e.message);
    }
  }, [supabase, desde, hasta, repFiltro, tiendaFiltro]);

  useEffect(() => {
    if ((tab === 'gastos' || tab === 'tienda' || tab === 'eliminar') && supabase) {
      listarRepartidores(supabase).then(setRepartidores).catch(() => {});
    }
  }, [tab, supabase]);

  useEffect(() => {
    if (tab === 'tienda') cargarReporte();
  }, [tab, cargarReporte]);

  useEffect(() => {
    if (tab === 'servicios') cargarServicios();
    if (tab === 'recolectores') cargarRepartidoresAdmin();
    if (tab === 'eliminar') cargarRegistrosAdmin();
  }, [tab, cargarServicios, cargarRepartidoresAdmin, cargarRegistrosAdmin]);

  useEffect(() => {
    if (!gastoRep || !supabase) {
      setSaldoRep(null);
      return;
    }
    saldoEnTransitoRepartidor(supabase, gastoRep).then(setSaldoRep).catch(() => setSaldoRep(null));
  }, [gastoRep, supabase, tab]);

  const reporteTienda = useMemo(
    () => reporteGeneralPorTienda(movimientos, tiendaFiltro ? null : tiendas),
    [movimientos, tiendas, tiendaFiltro],
  );
  const reporteFecha = useMemo(() => reporteRecoleccionTiendaFecha(movimientos), [movimientos]);

  const imprimirReporteTienda = () => {
    const filas = reporteTienda.filas
      .map(
        (f) =>
          `<tr><td>${f.tienda}</td><td style="text-align:center">${f.count}</td><td style="text-align:right">${fmtMonto(f.recoleccion)}</td><td style="text-align:right">${fmtMonto(f.servicios)}</td><td style="text-align:right">${fmtMonto(f.credito)}</td><td style="text-align:right">${fmtMonto(f.enTransito)}</td><td style="text-align:right">${fmtMonto(f.liquidado)}</td><td style="text-align:right">${fmtMonto(f.porCobrar)}</td><td style="text-align:right">${fmtMonto(f.total)}</td></tr>`,
      )
      .join('');
    const t = reporteTienda.totales;
    const win = window.open('', '_blank');
    if (!win) return alert('Permite ventanas emergentes.');
    win.document.write(`<!DOCTYPE html><html><body style="font-family:system-ui;padding:1rem;font-size:12px">
      <h2>Reporte por tienda</h2><p>${fmtFechaClave(desde)} — ${fmtFechaClave(hasta)}</p>
      <table border="1" cellpadding="6" cellspacing="0" width="100%"><thead><tr><th>Tienda</th><th>Mov.</th><th>Recolección</th><th>Servicios</th><th>Crédito</th><th>Tránsito</th><th>Liquidado</th><th>Por cobrar</th><th>Total</th></tr></thead>
      <tbody>${filas}<tr><td><b>TOTAL</b></td><td>${t.count}</td><td>${fmtMonto(t.recoleccion)}</td><td>${fmtMonto(t.servicios)}</td><td>${fmtMonto(t.credito)}</td><td>${fmtMonto(t.enTransito)}</td><td>${fmtMonto(t.liquidado)}</td><td>${fmtMonto(t.porCobrar)}</td><td>${fmtMonto(t.total)}</td></tr></tbody></table>
      <script>window.print()</script></body></html>`);
    win.document.close();
  };

  const guardarServicio = async () => {
    setGuardando(true);
    const res = await crearServicioCobro(supabase, {
      clave: srvForm.clave,
      nombre: srvForm.nombre,
      monto_default: srvForm.monto_default,
      frecuencia: srvForm.frecuencia,
      obligatorio: srvForm.obligatorio,
    });
    setGuardando(false);
    if (!res.ok) return alert(res.error);
    alert('✅ Servicio registrado.');
    setSrvForm({ clave: '', nombre: '', monto_default: '50', frecuencia: 'Diario', obligatorio: true });
    cargarServicios();
  };

  const toggleServicio = async (srv) => {
    if (!window.confirm(`${srv.activo ? 'Desactivar' : 'Activar'} ${srv.nombre}?`)) return;
    const res = srv.activo ? await desactivarServicioCobro(supabase, srv.id) : await actualizarServicioCobro(supabase, srv.id, { activo: true });
    if (!res.ok) return alert(res.error);
    cargarServicios();
  };

  const editarServicioMonto = async (srv) => {
    const val = window.prompt('Nuevo monto default:', srv.monto_default);
    if (val == null) return;
    const res = await actualizarServicioCobro(supabase, srv.id, { monto_default: val });
    if (!res.ok) return alert(res.error);
    cargarServicios();
  };

  const guardarRepartidor = async () => {
    setGuardando(true);
    const res = await crearRepartidor(supabase, repForm);
    setGuardando(false);
    if (!res.ok) return alert(res.error);
    alert('✅ Recolector creado.');
    setRepForm({ id: '', nombre: '', pin: '' });
    cargarRepartidoresAdmin();
    cargarReporte();
  };

  const guardarEdicionRep = async () => {
    if (!repEdit) return;
    setGuardando(true);
    const res = await actualizarRepartidor(supabase, repEdit.id, {
      nombre: repEdit.nombre,
      pin: repEdit.pin,
      activo: repEdit.activo,
    });
    setGuardando(false);
    if (!res.ok) return alert(res.error);
    alert('✅ Recolector actualizado.');
    setRepEdit(null);
    cargarRepartidoresAdmin();
  };

  const borrarRepartidor = async (r) => {
    if (!window.confirm(`¿Desactivar recolector ${r.nombre}?`)) return;
    const res = await eliminarRepartidor(supabase, r.id);
    if (!res.ok) return alert(res.error);
    cargarRepartidoresAdmin();
  };

  const borrarRegistro = async (row) => {
    if (!window.confirm(`¿Eliminar ${row.num_traspaso} (${fmtMonto(row.monto)})? Esta acción no se puede deshacer.`)) return;
    setGuardando(true);
    const res = await eliminarMovimientoTransito(supabase, row.id);
    setGuardando(false);
    if (!res.ok) return alert(res.error);
    cargarRegistrosAdmin();
    cargarReporte();
  };

  const confirmarGasto = async () => {
    setGuardando(true);
    const res = await registrarGastoRecolector(supabase, {
      repartidorId: gastoRep,
      monto: gastoMonto,
      descripcion: gastoDesc,
      adminNombre,
      tienda: gastoTienda || undefined,
    });
    setGuardando(false);
    if (!res.ok) return alert(res.error);
    alert(`✅ Gasto registrado para ${res.recolector || 'recolector'}.`);
    setGastoMonto('');
    setGastoDesc('');
    if (gastoRep) saldoEnTransitoRepartidor(supabase, gastoRep).then(setSaldoRep);
  };

  const confirmarLiberar = async () => {
    if (!gastoRep) return alert('Selecciona recolector.');
    if (!window.confirm(`¿Liberar (liquidar) todo el efectivo en tránsito de este recolector?`)) return;
    setGuardando(true);
    const res = await liberarEfectivoRepartidor(supabase, { repartidorId: gastoRep, adminNombre });
    setGuardando(false);
    if (!res.ok) return alert(res.error);
    alert(`✅ Liberados ${res.count} movimiento(s).`);
    saldoEnTransitoRepartidor(supabase, gastoRep).then(setSaldoRep);
    cargarReporte();
  };

  const filtrosComunes = (
    <div className="card" style={{ padding: '0.85rem' }}>
      <FiltroRangoCalendario desde={desde} hasta={hasta} onDesdeChange={setDesde} onHastaChange={setHasta} />
      <div className="grid-2" style={{ marginTop: '0.75rem', gap: '0.75rem' }}>
        <label className="muted" style={{ display: 'block' }}>
          Tienda
          <select className="select" style={{ marginTop: '0.35rem' }} value={tiendaFiltro} onChange={(e) => setTiendaFiltro(e.target.value)}>
            <option value="">Todas</option>
            {tiendas.map((t) => (
              <option key={t.codigo} value={t.nombre}>
                {t.etiqueta}
              </option>
            ))}
          </select>
        </label>
        <label className="muted" style={{ display: 'block' }}>
          Recolector
          <select className="select" style={{ marginTop: '0.35rem' }} value={repFiltro} onChange={(e) => setRepFiltro(e.target.value)}>
            <option value="">Todos</option>
            {repartidores.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nombre}
              </option>
            ))}
          </select>
        </label>
        {tab === 'tienda' && (
          <label className="muted" style={{ display: 'block' }}>
            Estatus
            <select className="select" style={{ marginTop: '0.35rem' }} value={estatus} onChange={(e) => setEstatus(e.target.value)}>
              <option value="">Todos</option>
              <option value="En Tránsito">En tránsito</option>
              <option value="Liquidado">Liquidado</option>
              <option value="Por Cobrar">Por cobrar</option>
            </select>
          </label>
        )}
      </div>
      {(tab === 'tienda' || tab === 'eliminar') && (
        <button type="button" className="btn btn-ghost" style={{ marginTop: '0.75rem' }} disabled={loading} onClick={tab === 'eliminar' ? cargarRegistrosAdmin : cargarReporte}>
          {loading ? 'Cargando…' : 'Actualizar'}
        </button>
      )}
    </div>
  );

  const abrirSubcomando = (accionId) => {
    const s = SUBCOMANDOS_RECOLECCIONES_CONTAB.find((x) => x.id === accionId);
    if (s) setTab(s.tab);
  };

  const labelActivo = SUBCOMANDOS_RECOLECCIONES_CONTAB.find((s) => s.tab === tab)?.label;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {onVolverContabilidad && <VolverContabilidad onClick={onVolverContabilidad} />}

      {tab == null ? (
        <>
          <div>
            <h2 style={{ margin: 0, color: 'var(--brand-blue)' }}>Recolecciones y traspasos</h2>
            <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.85rem' }}>
              Elige un subcomando. Solo se muestra el panel seleccionado.
            </p>
          </div>
          {error && (
            <div className="card" style={{ borderColor: 'var(--brand-red)', color: 'var(--brand-red)' }}>
              {error}
            </div>
          )}
          <SubcomandosHub
            items={subcomandos}
            onSelect={abrirSubcomando}
            color="#047857"
          />
        </>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-ghost" style={{ padding: '0.35rem 0.65rem', fontSize: '0.85rem' }} onClick={() => setTab(null)}>
              ← Subcomandos
            </button>
            <h2 style={{ margin: 0, color: 'var(--brand-blue)', fontSize: '1.15rem' }}>{labelActivo}</h2>
          </div>

          {error && (
            <div className="card" style={{ borderColor: 'var(--brand-red)', color: 'var(--brand-red)' }}>
              {error}
            </div>
          )}

          {(tab === 'tienda' || tab === 'eliminar') && filtrosComunes}

      {tab === 'tienda' && (
        <>
          <div className="card" style={{ padding: '0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <h3 style={{ margin: 0, color: 'var(--brand-blue)' }}>Reporte general por tienda</h3>
              <button type="button" className="btn btn-ghost" style={{ fontSize: '0.8rem' }} onClick={imprimirReporteTienda} disabled={!reporteTienda.filas.length}>
                Imprimir
              </button>
            </div>
            <div className="table-wrap">
              <table className="table" style={{ fontSize: '0.85rem' }}>
                <thead>
                  <tr>
                    <th>Tienda</th>
                    <th>Mov.</th>
                    <th style={{ textAlign: 'right' }}>Recolección</th>
                    <th style={{ textAlign: 'right' }}>Servicios</th>
                    <th style={{ textAlign: 'right' }}>Crédito</th>
                    <th style={{ textAlign: 'right' }}>Tránsito</th>
                    <th style={{ textAlign: 'right' }}>Liquidado</th>
                    <th style={{ textAlign: 'right' }}>Por cobrar</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {reporteTienda.filas.map((f) => (
                    <tr key={f.tienda} style={f.count === 0 ? { opacity: 0.5 } : undefined}>
                      <td><strong>{f.tienda}</strong></td>
                      <td>{f.count || '—'}</td>
                      <td style={{ textAlign: 'right' }}>{f.recoleccion ? fmtMonto(f.recoleccion) : '—'}</td>
                      <td style={{ textAlign: 'right' }}>{f.servicios ? fmtMonto(f.servicios) : '—'}</td>
                      <td style={{ textAlign: 'right' }}>{f.credito ? fmtMonto(f.credito) : '—'}</td>
                      <td style={{ textAlign: 'right' }}>{f.enTransito ? fmtMonto(f.enTransito) : '—'}</td>
                      <td style={{ textAlign: 'right' }}>{f.liquidado ? fmtMonto(f.liquidado) : '—'}</td>
                      <td style={{ textAlign: 'right' }}>{f.porCobrar ? fmtMonto(f.porCobrar) : '—'}</td>
                      <td style={{ textAlign: 'right' }}><strong>{f.total ? fmtMonto(f.total) : '—'}</strong></td>
                    </tr>
                  ))}
                  <tr style={{ background: 'var(--surface-2)', fontWeight: 700 }}>
                    <td>TOTAL</td>
                    <td>{reporteTienda.totales.count}</td>
                    <td style={{ textAlign: 'right' }}>{fmtMonto(reporteTienda.totales.recoleccion)}</td>
                    <td style={{ textAlign: 'right' }}>{fmtMonto(reporteTienda.totales.servicios)}</td>
                    <td style={{ textAlign: 'right' }}>{fmtMonto(reporteTienda.totales.credito)}</td>
                    <td style={{ textAlign: 'right' }}>{fmtMonto(reporteTienda.totales.enTransito)}</td>
                    <td style={{ textAlign: 'right' }}>{fmtMonto(reporteTienda.totales.liquidado)}</td>
                    <td style={{ textAlign: 'right' }}>{fmtMonto(reporteTienda.totales.porCobrar)}</td>
                    <td style={{ textAlign: 'right' }}>{fmtMonto(reporteTienda.totales.total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          {reporteFecha.dias.length > 0 && (
            <div className="card" style={{ padding: '0.85rem' }}>
              <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Por fecha</h3>
              <div className="table-wrap">
                <table className="table" style={{ fontSize: '0.85rem' }}>
                  <thead>
                    <tr>
                      <th>Tienda</th>
                      {reporteFecha.dias.map((d) => (
                        <th key={d} style={{ textAlign: 'right' }}>
                          {fmtFechaClave(d)}
                        </th>
                      ))}
                      <th style={{ textAlign: 'right' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reporteFecha.filas.map((f) => (
                      <tr key={f.tienda}>
                        <td>{f.tienda}</td>
                        {reporteFecha.dias.map((d) => (
                          <td key={d} style={{ textAlign: 'right' }}>
                            {f.porDia[d]?.count ? fmtMonto(f.porDia[d].total) : '—'}
                          </td>
                        ))}
                        <td style={{ textAlign: 'right' }}><strong>{fmtMonto(f.totalTienda)}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {tab === 'servicios' && (
        <div className="card" style={{ padding: '0.85rem' }}>
          <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Servicios a cobrar (CFE, etc.)</h3>
          <div className="grid-2" style={{ gap: '0.75rem' }}>
            <label className="muted">
              Clave
              <input className="input" style={{ marginTop: '0.35rem' }} value={srvForm.clave} onChange={(e) => setSrvForm({ ...srvForm, clave: e.target.value.toUpperCase() })} placeholder="CFE" />
            </label>
            <label className="muted">
              Nombre
              <input className="input" style={{ marginTop: '0.35rem' }} value={srvForm.nombre} onChange={(e) => setSrvForm({ ...srvForm, nombre: e.target.value })} placeholder="CFE Luz" />
            </label>
            <label className="muted">
              Monto ($)
              <input className="input" type="number" min="0" step="0.01" style={{ marginTop: '0.35rem' }} value={srvForm.monto_default} onChange={(e) => setSrvForm({ ...srvForm, monto_default: e.target.value })} />
            </label>
            <label className="muted">
              Frecuencia
              <select className="select" style={{ marginTop: '0.35rem' }} value={srvForm.frecuencia} onChange={(e) => setSrvForm({ ...srvForm, frecuencia: e.target.value })}>
                <option value="Diario">Diario</option>
                <option value="Semanal">Semanal</option>
              </select>
            </label>
          </div>
          <label style={{ display: 'block', marginTop: '0.5rem' }}>
            <input type="checkbox" checked={srvForm.obligatorio} onChange={(e) => setSrvForm({ ...srvForm, obligatorio: e.target.checked })} /> Obligatorio antes del traspaso
          </label>
          <button type="button" className="btn btn-gold" style={{ marginTop: '0.75rem' }} disabled={guardando} onClick={guardarServicio}>
            Agregar servicio
          </button>
          <div style={{ marginTop: '1rem' }}>
            {!servicios.length ? (
              <p className="muted">Sin servicios. Ejecuta supabase/servicios_cobro.sql</p>
            ) : (
              servicios.map((s) => (
                <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
                  <span>
                    <strong>{s.clave}</strong> — {s.nombre} · {fmtMonto(s.monto_default)} · {s.frecuencia}
                    {!s.activo && <span className="badge" style={{ marginLeft: '0.35rem' }}>Inactivo</span>}
                  </span>
                  <span style={{ display: 'flex', gap: '0.35rem' }}>
                    <button type="button" className="btn btn-ghost" style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }} onClick={() => editarServicioMonto(s)}>
                      Editar monto
                    </button>
                    <button type="button" className="btn btn-ghost" style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }} onClick={() => toggleServicio(s)}>
                      {s.activo ? 'Desactivar' : 'Activar'}
                    </button>
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {tab === 'recolectores' && (
        <div className="card" style={{ padding: '0.85rem' }}>
          <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Recolectores</h3>
          {!repEdit ? (
            <>
              <div className="grid-2" style={{ gap: '0.75rem' }}>
                <label className="muted">
                  Nombre
                  <input
                    className="input"
                    style={{ marginTop: '0.35rem' }}
                    value={repForm.nombre}
                    onChange={(e) => setRepForm({ ...repForm, nombre: e.target.value, id: repForm.id || slugRepartidorId(e.target.value) })}
                  />
                </label>
                <label className="muted">
                  ID (opcional)
                  <input className="input" style={{ marginTop: '0.35rem' }} value={repForm.id} onChange={(e) => setRepForm({ ...repForm, id: e.target.value })} placeholder="rep_luis" />
                </label>
                <label className="muted">
                  PIN (4 dígitos)
                  <InputPin value={repForm.pin} onChange={(e) => setRepForm({ ...repForm, pin: e.target.value })} style={{ marginBottom: 0, marginTop: '0.35rem' }} />
                </label>
              </div>
              <button type="button" className="btn btn-gold" style={{ marginTop: '0.75rem' }} disabled={guardando} onClick={guardarRepartidor}>
                Agregar recolector
              </button>
            </>
          ) : (
            <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'var(--surface-2)', borderRadius: '8px' }}>
              <h4 style={{ margin: '0 0 0.5rem' }}>Editar: {repEdit.id}</h4>
              <label className="muted" style={{ display: 'block' }}>
                Nombre
                <input className="input" style={{ marginTop: '0.35rem' }} value={repEdit.nombre} onChange={(e) => setRepEdit({ ...repEdit, nombre: e.target.value })} />
              </label>
              <label className="muted" style={{ display: 'block', marginTop: '0.5rem' }}>
                PIN
                <InputPin value={repEdit.pin} onChange={(e) => setRepEdit({ ...repEdit, pin: e.target.value })} style={{ marginBottom: 0, marginTop: '0.35rem' }} />
              </label>
              <label style={{ display: 'block', marginTop: '0.5rem' }}>
                <input type="checkbox" checked={repEdit.activo} onChange={(e) => setRepEdit({ ...repEdit, activo: e.target.checked })} /> Activo
              </label>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                <button type="button" className="btn btn-success" disabled={guardando} onClick={guardarEdicionRep}>
                  Guardar
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setRepEdit(null)}>
                  Cancelar
                </button>
              </div>
            </div>
          )}
          <div style={{ marginTop: '1rem' }}>
            {repsAdmin.map((r) => (
              <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
                <span>
                  <strong>{r.nombre}</strong>
                  <span className="muted" style={{ display: 'block', fontSize: '0.78rem' }}>
                    {r.id} · PIN **** · {r.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </span>
                <span style={{ display: 'flex', gap: '0.35rem' }}>
                  <button type="button" className="btn btn-ghost" style={{ fontSize: '0.75rem' }} onClick={() => setRepEdit({ ...r })}>
                    Editar
                  </button>
                  {r.activo && (
                    <button type="button" className="btn btn-ghost" style={{ fontSize: '0.75rem', color: 'var(--brand-red)' }} onClick={() => borrarRepartidor(r)}>
                      Desactivar
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'eliminar' && (
        <div className="card" style={{ padding: '0.85rem' }}>
          <h3 style={{ margin: '0 0 0.5rem', color: 'var(--brand-blue)' }}>Eliminar registros</h3>
          <p className="muted" style={{ fontSize: '0.8rem', margin: '0 0 0.75rem' }}>
            Corrige capturas erróneas. Solo administración contable.
          </p>
          {!registrosAdmin.length ? (
            <p className="muted">Sin registros en el periodo.</p>
          ) : (
            <div className="table-wrap">
              <table className="table" style={{ fontSize: '0.82rem' }}>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Tienda</th>
                    <th>Folio</th>
                    <th>Tipo</th>
                    <th>Estatus</th>
                    <th style={{ textAlign: 'right' }}>Monto</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {registrosAdmin.map((r) => (
                    <tr key={r.id}>
                      <td>{fmtFechaHora(r.fecha_hora)}</td>
                      <td>{r.sucursal_origen}</td>
                      <td>{r.num_traspaso}</td>
                      <td>{etiquetaTipo(r)}</td>
                      <td>{r.estatus}</td>
                      <td style={{ textAlign: 'right' }}>{fmtMonto(r.monto)}</td>
                      <td>
                        <button type="button" className="btn btn-ghost" style={{ color: 'var(--brand-red)', fontSize: '0.75rem', padding: '0.2rem 0.45rem' }} disabled={guardando} onClick={() => borrarRegistro(r)}>
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'gastos' && (
        <div className="grid-2" style={{ gap: '1rem', alignItems: 'start' }}>
          <div className="card" style={{ padding: '0.85rem' }}>
            <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Registrar gasto</h3>
            <p className="muted" style={{ fontSize: '0.8rem', marginTop: 0 }}>
              Descuenta del efectivo en tránsito del recolector (combustible, viáticos, etc.).
            </p>
            <label className="muted" style={{ display: 'block' }}>
              Recolector
              <select className="select" style={{ marginTop: '0.35rem' }} value={gastoRep} onChange={(e) => setGastoRep(e.target.value)}>
                <option value="">— Selecciona —</option>
                {repartidores.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nombre}
                  </option>
                ))}
              </select>
            </label>
            {saldoRep && (
              <p style={{ fontSize: '0.85rem', margin: '0.75rem 0 0' }}>
                Saldo disponible: <strong>{fmtMonto(saldoRep.total)}</strong>
                <span className="muted" style={{ display: 'block', fontSize: '0.78rem' }}>
                  Recolectado {fmtMonto(saldoRep.ingresos)} − gastos {fmtMonto(saldoRep.egresos)}
                </span>
              </p>
            )}
            <label className="muted" style={{ display: 'block', marginTop: '0.75rem' }}>
              Monto ($)
              <input className="input" type="number" min="0" step="0.01" style={{ marginTop: '0.35rem' }} value={gastoMonto} onChange={(e) => setGastoMonto(e.target.value)} />
            </label>
            <label className="muted" style={{ display: 'block', marginTop: '0.75rem' }}>
              Descripción
              <input className="input" style={{ marginTop: '0.35rem' }} value={gastoDesc} onChange={(e) => setGastoDesc(e.target.value)} placeholder="Ej. Gasolina ruta norte" />
            </label>
            <label className="muted" style={{ display: 'block', marginTop: '0.75rem' }}>
              Tienda (opcional)
              <select className="select" style={{ marginTop: '0.35rem' }} value={gastoTienda} onChange={(e) => setGastoTienda(e.target.value)}>
                <option value="">Oficina</option>
                {tiendas.map((t) => (
                  <option key={t.codigo} value={t.nombre}>
                    {t.etiqueta}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="btn btn-gold" style={{ marginTop: '1rem' }} disabled={guardando || !gastoRep} onClick={confirmarGasto}>
              Registrar gasto
            </button>
          </div>
          <div className="card" style={{ padding: '0.85rem', borderLeft: '4px solid #0d9488' }}>
            <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Liberar efectivo</h3>
            <p className="muted" style={{ fontSize: '0.8rem', marginTop: 0 }}>
              Sella como liquidado todo lo que el recolector tiene en tránsito (entrega en oficina).
            </p>
            <label className="muted" style={{ display: 'block' }}>
              Recolector
              <select className="select" style={{ marginTop: '0.35rem' }} value={gastoRep} onChange={(e) => setGastoRep(e.target.value)}>
                <option value="">— Selecciona —</option>
                {repartidores.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nombre}
                  </option>
                ))}
              </select>
            </label>
            {saldoRep && gastoRep && (
              <p style={{ margin: '0.75rem 0' }}>
                En tránsito: <strong>{fmtMonto(saldoRep.ingresos)}</strong> ({saldoRep.count} mov.)
              </p>
            )}
            <button type="button" className="btn btn-danger" disabled={guardando || !gastoRep} onClick={confirmarLiberar}>
              Liberar todo en tránsito
            </button>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
}
