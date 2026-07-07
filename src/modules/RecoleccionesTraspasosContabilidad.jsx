import React, { useCallback, useEffect, useMemo, useState } from 'react';
import FiltroPeriodo from '../components/FiltroPeriodo.jsx';
import FiltroRangoCalendario from '../components/FiltroRangoCalendario.jsx';
import InputPin from '../components/InputPin.jsx';
import SubcomandosHub from '../components/SubcomandosHub.jsx';
import DetalleTiendasLiquidacion from '../components/DetalleTiendasLiquidacion.jsx';
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
  eliminarRepartidorPermanente,
  fmtFechaClave,
  fmtFechaHora,
  fmtMonto,
  hoyClaveNogales,
  inicioMesClaveNogales,
  liberarEfectivoRepartidor,
  listarGastosLiquidadosRecolector,
  listarGastosPendientesRecolector,
  listarMovimientosRecoleccionContabilidad,
  listarMovimientosTransitoAdmin,
  listarRepartidores,
  listarRepartidoresTodos,
  listarServiciosCobroAdmin,
  listarTiendasEfectivo,
  listarTodoEnTransito,
  registrarGastoRecolector,
  cancelarGastoPendiente,
  resumenPorTiendaConCatalogo,
  reporteGeneralPorTienda,
  reporteRecoleccionTiendaFecha,
  saldoEnTransitoRepartidor,
  slugRepartidorId,
} from '../lib/controlEfectivo.js';
import {
  CUENTAS_RT,
  calcularSaldosRt,
  etiquetaCuentaRt,
  etiquetaTipoMovimientoRt,
  importarLiquidacionesHistoricasRt,
  listarTodosMovimientosRt,
  PRESETS_RT_CUENTAS,
  resolverCuentaRtPorNombre,
  resumenLiquidacionesHistoricasRt,
  resumenPeriodoRt,
  rangoDesdePresetRt,
  signoMovimientoRt,
  transferirEntreCuentasRt,
} from '../lib/rtCuentas.js';

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
  const [gastoModoMonto, setGastoModoMonto] = useState('fijo');
  const [gastoDesc, setGastoDesc] = useState('');
  const [gastoTienda, setGastoTienda] = useState('');
  const [saldoRep, setSaldoRep] = useState(null);
  const [gastosPendientes, setGastosPendientes] = useState([]);
  const [cuentaRtLiberar, setCuentaRtLiberar] = useState(() => resolverCuentaRtPorNombre(user?.nombre) || CUENTAS_RT[0]?.id || '');

  const [saldosRt, setSaldosRt] = useState({});
  const [movsRt, setMovsRt] = useState([]);
  const [presetRt, setPresetRt] = useState('hoy');
  const [filtroCuentaRt, setFiltroCuentaRt] = useState('');
  const [transDesde, setTransDesde] = useState('francisco');
  const [transHacia, setTransHacia] = useState('andres');
  const [transMonto, setTransMonto] = useState('');
  const [transNotas, setTransNotas] = useState('');
  const [resumenHistRt, setResumenHistRt] = useState(null);
  const [cuentaFallbackHist, setCuentaFallbackHist] = useState(() => resolverCuentaRtPorNombre(user?.nombre) || CUENTAS_RT[0]?.id || '');
  const [transitoRt, setTransitoRt] = useState([]);
  const [gastosRt, setGastosRt] = useState([]);

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
    const detectada = resolverCuentaRtPorNombre(user?.nombre);
    if (detectada) setCuentaRtLiberar(detectada);
  }, [user?.nombre]);

  const cargarCuentasRt = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setError(null);
    try {
      const rango = rangoDesdePresetRt(presetRt) || {};
      const [saldoRes, movRes, transito, gastos] = await Promise.all([
        calcularSaldosRt(supabase),
        listarTodosMovimientosRt(supabase, {
          desde: rango.desde,
          hasta: rango.hasta,
          cuentaId: filtroCuentaRt || undefined,
        }),
        listarTodoEnTransito(supabase),
        listarGastosLiquidadosRecolector(supabase),
      ]);
      if (saldoRes.error) setError(saldoRes.error);
      else setSaldosRt(saldoRes.saldos || {});
      if (movRes.error) setError(movRes.error);
      else setMovsRt(movRes.data || []);
      setTransitoRt(transito || []);
      setGastosRt(gastos || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [supabase, presetRt, filtroCuentaRt]);

  useEffect(() => {
    if ((tab === 'gastos' || tab === 'tienda' || tab === 'eliminar') && supabase) {
      listarRepartidores(supabase).then(setRepartidores).catch(() => {});
    }
  }, [tab, supabase]);

  useEffect(() => {
    if (transDesde === transHacia) {
      const otra = CUENTAS_RT.find((c) => c.id !== transDesde);
      if (otra) setTransHacia(otra.id);
    }
  }, [transDesde, transHacia]);

  useEffect(() => {
    if (tab === 'cuentas') cargarCuentasRt();
  }, [tab, cargarCuentasRt]);

  useEffect(() => {
    if (tab !== 'cuentas' || !supabase) {
      setResumenHistRt(null);
      return;
    }
    resumenLiquidacionesHistoricasRt(supabase, { cuentaFallback: cuentaFallbackHist }).then(setResumenHistRt);
  }, [tab, supabase, cuentaFallbackHist, saldosRt]);

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
      setGastosPendientes([]);
      return;
    }
    saldoEnTransitoRepartidor(supabase, gastoRep).then(setSaldoRep).catch(() => setSaldoRep(null));
    listarGastosPendientesRecolector(supabase, gastoRep).then(setGastosPendientes).catch(() => setGastosPendientes([]));
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

  const desactivarRepartidor = async (r) => {
    if (!window.confirm(`¿Desactivar recolector ${r.nombre}? No podrá usarse en nuevos traspasos.`)) return;
    const res = await eliminarRepartidor(supabase, r.id);
    if (!res.ok) return alert(res.error);
    cargarRepartidoresAdmin();
    cargarReporte();
  };

  const reactivarRepartidor = async (r) => {
    const res = await actualizarRepartidor(supabase, r.id, { activo: true });
    if (!res.ok) return alert(res.error);
    cargarRepartidoresAdmin();
  };

  const eliminarRepartidorDefinitivo = async (r) => {
    if (
      !window.confirm(
        `¿Eliminar permanentemente a ${r.nombre} (${r.id})?\n\nSolo es posible si no tiene movimientos. Esta acción no se puede deshacer.`,
      )
    ) {
      return;
    }
    const res = await eliminarRepartidorPermanente(supabase, r.id);
    if (!res.ok) return alert(res.error);
    if (repEdit?.id === r.id) setRepEdit(null);
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
    if (!gastoRep) return alert('Selecciona recolector.');
    if (!gastoDesc?.trim()) return alert('Describe el gasto.');
    const monto =
      gastoModoMonto === 'todo' ? Number(saldoRep?.disponible || 0) : Number(gastoMonto);
    if (!(monto > 0)) {
      return alert(
        gastoModoMonto === 'todo'
          ? 'No hay saldo disponible para autorizar.'
          : 'Indica un monto válido.',
      );
    }
    setGuardando(true);
    const res = await registrarGastoRecolector(supabase, {
      repartidorId: gastoRep,
      monto,
      descripcion: gastoDesc,
      adminNombre,
      tienda: gastoTienda || undefined,
    });
    setGuardando(false);
    if (!res.ok) return alert(res.error);
    alert(`✅ Gasto autorizado para ${res.recolector || 'recolector'}. El recolector debe aceptarlo con su PIN en Recolecciones → Gastos.`);
    setGastoMonto('');
    setGastoDesc('');
    if (gastoRep) {
      saldoEnTransitoRepartidor(supabase, gastoRep).then(setSaldoRep);
      listarGastosPendientesRecolector(supabase, gastoRep).then(setGastosPendientes);
    }
  };

  const cancelarGasto = async (g) => {
    if (!window.confirm(`¿Cancelar gasto ${g.num_traspaso} (${fmtMonto(g.monto)})?`)) return;
    setGuardando(true);
    const res = await cancelarGastoPendiente(supabase, g.id);
    setGuardando(false);
    if (!res.ok) return alert(res.error);
    if (gastoRep) {
      saldoEnTransitoRepartidor(supabase, gastoRep).then(setSaldoRep);
      listarGastosPendientesRecolector(supabase, gastoRep).then(setGastosPendientes);
    }
  };

  const confirmarLiberar = async () => {
    if (!gastoRep) return alert('Selecciona recolector.');
    if (!window.confirm(`¿Liberar (liquidar) todo el efectivo en tránsito de este recolector?`)) return;
    setGuardando(true);
    const res = await liberarEfectivoRepartidor(supabase, { repartidorId: gastoRep, adminNombre, cuentaRtId: cuentaRtLiberar });
    setGuardando(false);
    if (!res.ok) return alert(res.error);
    alert(`✅ Liberados ${res.count} movimiento(s) · ${fmtMonto(res.montoTotal || 0)} acreditados a ${etiquetaCuentaRt(cuentaRtLiberar)}.`);
    saldoEnTransitoRepartidor(supabase, gastoRep).then(setSaldoRep);
    cargarReporte();
  };

  const confirmarTransferencia = async () => {
    setGuardando(true);
    const res = await transferirEntreCuentasRt(supabase, {
      desdeId: transDesde,
      haciaId: transHacia,
      monto: transMonto,
      usuarioNombre: adminNombre,
      notas: transNotas,
    });
    setGuardando(false);
    if (!res.ok) return alert(res.error);
    alert(`✅ Transferidos ${fmtMonto(res.monto)} de ${etiquetaCuentaRt(transDesde)} a ${etiquetaCuentaRt(transHacia)}.`);
    setTransMonto('');
    setTransNotas('');
    cargarCuentasRt();
  };

  const confirmarImportarHistorico = async () => {
    if (!resumenHistRt?.ok || !resumenHistRt.gruposAsignables) {
      return alert('No hay liquidaciones históricas pendientes de importar.');
    }
    const msg = [
      `¿Importar ${resumenHistRt.gruposAsignables} liquidación(es) histórica(s)?`,
      `Monto: ${fmtMonto(resumenHistRt.montoAsignable)}`,
      `Movimientos: ${resumenHistRt.movimientosPendientes}`,
      resumenHistRt.gruposSinCuenta
        ? `Sin cuenta identificada (${resumenHistRt.gruposSinCuenta}): se usará ${etiquetaCuentaRt(cuentaFallbackHist)} como respaldo.`
        : '',
    ]
      .filter(Boolean)
      .join('\n');
    if (!window.confirm(msg)) return;
    setGuardando(true);
    const res = await importarLiquidacionesHistoricasRt(supabase, {
      cuentaFallback: cuentaFallbackHist,
      usuarioNombre: adminNombre,
    });
    setGuardando(false);
    if (!res.ok) return alert(res.error);
    alert(
      `✅ Importadas ${res.importados} liquidación(es) · ${fmtMonto(res.monto)} · ${res.movimientos} movimiento(s) de tránsito.`,
    );
    cargarCuentasRt();
    resumenLiquidacionesHistoricasRt(supabase, { cuentaFallback: cuentaFallbackHist }).then(setResumenHistRt);
  };

  const resumenRt = useMemo(() => resumenPeriodoRt(movsRt), [movsRt]);
  const totalTransitoRt = useMemo(() => transitoRt.reduce((a, m) => a + Number(m.monto || 0), 0), [transitoRt]);
  const totalGastosRt = useMemo(() => gastosRt.reduce((a, m) => a + Number(m.monto || 0), 0), [gastosRt]);
  const netoTransitoRt = useMemo(() => totalTransitoRt - totalGastosRt, [totalTransitoRt, totalGastosRt]);
  const movimientosTransitoRt = useMemo(() => [...transitoRt, ...gastosRt], [transitoRt, gastosRt]);
  const resumenTransitoTiendas = useMemo(
    () => resumenPorTiendaConCatalogo(movimientosTransitoRt, listarTiendasEfectivo()),
    [movimientosTransitoRt],
  );
  const noopSel = useCallback(() => {}, []);

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
            <h2 style={{ margin: 0, color: 'var(--brand-blue)' }}>Panel RT</h2>
            <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.85rem' }}>
              Recolección y traspaso — elige un subcomando.
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
          <p className="muted" style={{ fontSize: '0.8rem', margin: '0 0 0.75rem' }}>
            Desactivar oculta al recolector en operación. Eliminar borra el registro solo si no tiene movimientos.
          </p>
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
                <span style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                  <button type="button" className="btn btn-ghost" style={{ fontSize: '0.75rem' }} onClick={() => setRepEdit({ ...r })}>
                    Editar
                  </button>
                  {r.activo ? (
                    <button type="button" className="btn btn-ghost" style={{ fontSize: '0.75rem', color: 'var(--brand-gold-dark)' }} onClick={() => desactivarRepartidor(r)}>
                      Desactivar
                    </button>
                  ) : (
                    <button type="button" className="btn btn-ghost" style={{ fontSize: '0.75rem', color: 'var(--brand-green)' }} onClick={() => reactivarRepartidor(r)}>
                      Reactivar
                    </button>
                  )}
                  <button type="button" className="btn btn-ghost" style={{ fontSize: '0.75rem', color: 'var(--brand-red)' }} onClick={() => eliminarRepartidorDefinitivo(r)}>
                    Eliminar
                  </button>
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
            <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Autorizar gasto</h3>
            <p className="muted" style={{ fontSize: '0.8rem', marginTop: 0 }}>
              Autoriza un gasto del efectivo en tránsito. El recolector debe aceptarlo con su PIN en Recolecciones → Gastos.
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
                Saldo neto: <strong>{fmtMonto(saldoRep.total)}</strong>
                <span className="muted" style={{ display: 'block', fontSize: '0.78rem' }}>
                  Recolectado {fmtMonto(saldoRep.ingresos)} − gastos {fmtMonto(saldoRep.egresos)}
                  {saldoRep.reservado > 0 ? ` · pendiente aceptar ${fmtMonto(saldoRep.reservado)}` : ''}
                  {' · '}disponible {fmtMonto(saldoRep.disponible)}
                </span>
              </p>
            )}
            {gastosPendientes.length > 0 && (
              <div style={{ marginTop: '0.75rem', padding: '0.65rem', borderRadius: '8px', background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.25)' }}>
                <p style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', fontWeight: 600 }}>Pendientes de aceptar ({gastosPendientes.length})</p>
                {gastosPendientes.map((g) => (
                  <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 0', borderTop: '1px solid var(--border)', fontSize: '0.82rem' }}>
                    <span style={{ flex: 1 }}>
                      {g.descripcion_gasto}
                      <span className="muted" style={{ display: 'block', fontSize: '0.75rem' }}>
                        {g.num_traspaso} · {fmtFechaHora(g.fecha_hora)}
                      </span>
                    </span>
                    <strong>{fmtMonto(g.monto)}</strong>
                    <button type="button" className="btn btn-ghost" style={{ padding: '0.2rem 0.45rem', fontSize: '0.72rem' }} disabled={guardando} onClick={() => cancelarGasto(g)}>
                      Cancelar
                    </button>
                  </div>
                ))}
              </div>
            )}
            <fieldset style={{ border: 'none', padding: 0, margin: '0.75rem 0 0' }}>
              <legend className="muted" style={{ fontSize: '0.85rem' }}>
                Monto a autorizar
              </legend>
              <label style={{ display: 'block', marginTop: '0.35rem' }}>
                <input
                  type="radio"
                  checked={gastoModoMonto === 'fijo'}
                  onChange={() => setGastoModoMonto('fijo')}
                />{' '}
                Monto fijo
              </label>
              <label style={{ display: 'block', marginTop: '0.25rem' }}>
                <input
                  type="radio"
                  checked={gastoModoMonto === 'todo'}
                  onChange={() => setGastoModoMonto('todo')}
                  disabled={!saldoRep?.disponible}
                />{' '}
                Todo el saldo disponible
                {saldoRep ? ` (${fmtMonto(saldoRep.disponible)})` : ''}
              </label>
            </fieldset>
            {gastoModoMonto === 'fijo' ? (
              <label className="muted" style={{ display: 'block', marginTop: '0.75rem' }}>
                Monto ($)
                <input className="input" type="number" min="0" step="0.01" style={{ marginTop: '0.35rem' }} value={gastoMonto} onChange={(e) => setGastoMonto(e.target.value)} />
              </label>
            ) : (
              <p style={{ margin: '0.75rem 0 0', fontSize: '0.9rem' }}>
                Se autorizará: <strong>{fmtMonto(saldoRep?.disponible || 0)}</strong>
              </p>
            )}
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
              Autorizar gasto
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
            <label className="muted" style={{ display: 'block', marginTop: '0.75rem' }}>
              Cuenta RT que recibe al liberar
              <select className="select" style={{ marginTop: '0.35rem' }} value={cuentaRtLiberar} onChange={(e) => setCuentaRtLiberar(e.target.value)}>
                {CUENTAS_RT.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="btn btn-danger" disabled={guardando || !gastoRep} onClick={confirmarLiberar}>
              Liberar todo en tránsito
            </button>
          </div>
        </div>
      )}

      {tab === 'cuentas' && (
        <>
          <div className="card" style={{ padding: '0.85rem', borderLeft: '4px solid var(--brand-gold)' }}>
            <h3 style={{ margin: '0 0 0.5rem', color: 'var(--brand-blue)' }}>Efectivo en tránsito (aún no en cuenta RT)</h3>
            <p className="muted" style={{ marginTop: 0, fontSize: '0.85rem' }}>
              Este dinero sigue con el recolector o pendiente de sellar. <strong>No suma</strong> al saldo de Francisco/Andrés hasta liquidarlo en{' '}
              <strong>Liquidación recolecciones</strong> o <strong>Gastos / liberar</strong>.
            </p>
            <p style={{ margin: '0.75rem 0 0', fontSize: '1.35rem', fontWeight: 700, color: 'var(--brand-gold-dark)' }}>
              {fmtMonto(netoTransitoRt)}
              <span className="muted" style={{ fontSize: '0.85rem', fontWeight: 400, marginLeft: '0.5rem' }}>
                neto · {transitoRt.length} recolección(es) · {gastosRt.length} gasto(s)
              </span>
            </p>
            <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.82rem' }}>
              Recolectado {fmtMonto(totalTransitoRt)}
              {totalGastosRt > 0 ? ` − gastos ${fmtMonto(totalGastosRt)}` : ''}
            </p>
            {movimientosTransitoRt.length > 0 ? (
              <>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem', marginTop: '0.75rem' }}>
                  {resumenTransitoTiendas
                    .filter((r) => r.count > 0)
                    .map((r) => (
                      <span key={r.tienda} className="badge" style={{ fontSize: '0.82rem', padding: '0.35rem 0.55rem' }}>
                        {r.tienda}: {fmtMonto(r.total)}
                      </span>
                    ))}
                </div>
                <DetalleTiendasLiquidacion
                  movimientos={movimientosTransitoRt}
                  esHistorial
                  diaDe="recoleccion"
                  selIds={{}}
                  setSelIds={noopSel}
                  sinTitulo
                />
              </>
            ) : (
              <p className="muted" style={{ marginTop: '0.75rem' }}>No hay efectivo en tránsito en este momento.</p>
            )}
          </div>

          <div className="grid-2" style={{ gap: '1rem' }}>
            {CUENTAS_RT.map((c) => (
              <div key={c.id} className="card" style={{ padding: '0.85rem', borderTop: `4px solid ${c.id === 'francisco' ? 'var(--brand-blue)' : 'var(--brand-gold)'}` }}>
                <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
                  Cuenta {c.nombre}
                </p>
                <p style={{ margin: '0.35rem 0 0', fontSize: '1.75rem', fontWeight: 700, color: 'var(--brand-blue)' }}>
                  {fmtMonto(saldosRt[c.id] || 0)}
                </p>
                <p className="muted" style={{ margin: '0.25rem 0 0', fontSize: '0.78rem' }}>
                  Saldo actual (liquidaciones − transferencias enviadas + recibidas)
                </p>
              </div>
            ))}
          </div>

          {resumenHistRt?.ok && resumenHistRt.gruposAsignables > 0 && (
            <div className="card" style={{ padding: '0.85rem', borderLeft: '4px solid var(--brand-gold)' }}>
              <h3 style={{ margin: '0 0 0.5rem', color: 'var(--brand-blue)' }}>Liquidaciones anteriores sin cuenta RT</h3>
              <p className="muted" style={{ marginTop: 0, fontSize: '0.85rem' }}>
                Las liquidaciones selladas antes de activar las cuentas RT viven solo en tránsito de efectivo. Puedes importarlas una vez; quedan con su fecha original de liquidación.
              </p>
              <p style={{ margin: '0.75rem 0 0', fontSize: '0.9rem' }}>
                Pendientes: <strong>{resumenHistRt.gruposAsignables}</strong> lote(s) ·{' '}
                <strong>{fmtMonto(resumenHistRt.montoAsignable)}</strong> · {resumenHistRt.movimientosPendientes} movimiento(s)
              </p>
              {resumenHistRt.gruposSinCuenta > 0 && (
                <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.8rem' }}>
                  {resumenHistRt.gruposSinCuenta} lote(s) no tienen Francisco/Andrés en «usuario liquida»
                  {resumenHistRt.usuariosSinCuenta?.length ? `: ${resumenHistRt.usuariosSinCuenta.join(', ')}` : ''}. Usa cuenta respaldo:
                </p>
              )}
              <label className="muted" style={{ display: 'block', marginTop: '0.75rem' }}>
                Cuenta respaldo (si el nombre no identifica a Francisco o Andrés)
                <select className="select" style={{ marginTop: '0.35rem' }} value={cuentaFallbackHist} onChange={(e) => setCuentaFallbackHist(e.target.value)}>
                  {CUENTAS_RT.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" className="btn btn-gold" style={{ marginTop: '0.75rem' }} disabled={guardando} onClick={confirmarImportarHistorico}>
                Importar liquidaciones históricas
              </button>
            </div>
          )}

          <div className="card" style={{ padding: '0.85rem', borderLeft: '4px solid #0d9488' }}>
            <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Transferir entre cuentas</h3>
            <p className="muted" style={{ fontSize: '0.8rem', marginTop: 0 }}>
              Ejemplo: Andrés colectó $1,000 y transfiere ese efectivo a Francisco.
            </p>
            <div className="grid-2" style={{ gap: '0.75rem' }}>
              <label className="muted">
                Desde
                <select className="select" style={{ marginTop: '0.35rem' }} value={transDesde} onChange={(e) => setTransDesde(e.target.value)}>
                  {CUENTAS_RT.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre} ({fmtMonto(saldosRt[c.id] || 0)})
                    </option>
                  ))}
                </select>
              </label>
              <label className="muted">
                Hacia
                <select className="select" style={{ marginTop: '0.35rem' }} value={transHacia} onChange={(e) => setTransHacia(e.target.value)}>
                  {CUENTAS_RT.filter((c) => c.id !== transDesde).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <label className="muted">
                Monto ($)
                <input className="input" type="number" min="0" step="0.01" style={{ marginTop: '0.35rem' }} value={transMonto} onChange={(e) => setTransMonto(e.target.value)} />
              </label>
              <label className="muted">
                Notas (opcional)
                <input className="input" style={{ marginTop: '0.35rem' }} value={transNotas} onChange={(e) => setTransNotas(e.target.value)} placeholder="Motivo de la transferencia" />
              </label>
            </div>
            <button type="button" className="btn btn-primary" style={{ marginTop: '0.75rem' }} disabled={guardando || !transMonto} onClick={confirmarTransferencia}>
              Registrar transferencia
            </button>
          </div>

          <div className="card" style={{ padding: '0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <h3 style={{ margin: 0, color: 'var(--brand-blue)' }}>Libro diario</h3>
              <button type="button" className="btn btn-ghost" style={{ fontSize: '0.8rem' }} disabled={loading} onClick={cargarCuentasRt}>
                {loading ? 'Cargando…' : 'Actualizar'}
              </button>
            </div>
            <div className="grid-2" style={{ gap: '0.75rem' }}>
              <FiltroPeriodo
                presets={PRESETS_RT_CUENTAS}
                preset={presetRt}
                onPresetChange={setPresetRt}
                desde=""
                hasta=""
                onDesdeChange={() => {}}
                onHastaChange={() => {}}
                labelPeriodo="Periodo"
              />
              <label className="muted">
                Cuenta
                <select className="select" style={{ marginTop: '0.35rem' }} value={filtroCuentaRt} onChange={(e) => setFiltroCuentaRt(e.target.value)}>
                  <option value="">Todas</option>
                  {CUENTAS_RT.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="muted" style={{ margin: '0.75rem 0 0', fontSize: '0.85rem' }}>
              {movsRt.length} movimiento(s) · Entradas {fmtMonto(resumenRt.ingresos)} · Salidas {fmtMonto(resumenRt.egresos)} · Neto{' '}
              <strong>{fmtMonto(resumenRt.neto)}</strong>
            </p>
            {!movsRt.length ? (
              <p className="muted" style={{ marginTop: '0.75rem' }}>
                Sin movimientos en el periodo seleccionado.
              </p>
            ) : (
              <div className="table-wrap" style={{ marginTop: '0.75rem' }}>
                <table className="table" style={{ fontSize: '0.82rem' }}>
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Cuenta</th>
                      <th>Tipo</th>
                      <th>Detalle</th>
                      <th style={{ textAlign: 'right' }}>Monto</th>
                      <th>Usuario</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movsRt.map((m) => (
                      <tr key={m.id}>
                        <td>{fmtFechaHora(m.fecha)}</td>
                        <td>{etiquetaCuentaRt(m.cuenta_id)}</td>
                        <td>{etiquetaTipoMovimientoRt(m.tipo)}</td>
                        <td>
                          {m.notas || '—'}
                          {m.cuenta_relacionada && (
                            <span className="muted" style={{ display: 'block', fontSize: '0.75rem' }}>
                              {m.tipo === 'transferencia_enviada' ? '→' : m.tipo === 'transferencia_recibida' ? '←' : ''}{' '}
                              {etiquetaCuentaRt(m.cuenta_relacionada)}
                            </span>
                          )}
                          {m.repartidor_nombre && (
                            <span className="muted" style={{ display: 'block', fontSize: '0.75rem' }}>
                              Recolector: {m.repartidor_nombre}
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right', color: m.tipo === 'transferencia_enviada' ? 'var(--brand-red)' : 'var(--brand-green)' }}>
                          {signoMovimientoRt(m.tipo)}
                          {fmtMonto(m.monto)}
                        </td>
                        <td>{m.usuario || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
        </>
      )}
    </div>
  );
}
