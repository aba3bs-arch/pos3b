import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { etiquetaTienda } from '../constants/sucursales.js';
import { normalizarRol } from '../lib/roles.js';
import InputPin from '../components/InputPin.jsx';
import { BtnLabel } from '../components/Icon.jsx';
import {
  aceptarGastosRecolector,
  cobrarCreditosSeleccionados,
  fmtFechaHora,
  fmtMonto,
  listarCreditosPendientes,
  listarGastosPendientesRecolector,
  listarRepartidores,
  listarServiciosCobro,
  listarTiendasEfectivo,
  pinRepartidorValido,
  registrarCobroServicio,
  registrarServicioNoCobrado,
  registrarTraspasos,
  resolverRepartidorPorNombre,
  saldoEnTransitoRepartidor,
  servicioResueltoEnTienda,
  serviciosObligatoriosPendientesTienda,
  sucursalParaControlEfectivo,
  estadoVentanaRecoleccion,
  EVENTO_VENTANA_RECOLECCION,
} from '../lib/controlEfectivo.js';

function TabBtn({ active, onClick, children }) {
  return (
    <button type="button" className={active ? 'btn btn-primary' : 'btn btn-ghost'} onClick={onClick} style={{ flex: '1 1 auto' }}>
      {children}
    </button>
  );
}

export default function Recolecciones({ supabase, sucursal, user }) {
  const tiendaSesion = sucursalParaControlEfectivo(sucursal);
  const tiendaLabel = etiquetaTienda(sucursal);
  const esRepartidor = normalizarRol(user?.rol) === 'Repartidor';
  const tiendasEfectivo = useMemo(() => listarTiendasEfectivo(), []);

  const [tab, setTab] = useState(esRepartidor ? 'cobro' : 'traspaso');
  const [repartidores, setRepartidores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorTabla, setErrorTabla] = useState(null);

  const [repTraspaso, setRepTraspaso] = useState('');
  const [pinTraspaso, setPinTraspaso] = useState('');
  const [esEfectivo, setEsEfectivo] = useState(true);
  const [filas, setFilas] = useState([{ folio: '', monto: '' }]);
  const [guardando, setGuardando] = useState(false);

  const [servicios, setServicios] = useState([]);
  const [pendientesSrv, setPendientesSrv] = useState([]);
  const [estadoSrv, setEstadoSrv] = useState({});
  const [montosSrv, setMontosSrv] = useState({});
  const [motivosNoCobro, setMotivosNoCobro] = useState({});
  const [mostrarNoCobro, setMostrarNoCobro] = useState({});

  const [tiendaCobro, setTiendaCobro] = useState(tiendaSesion || '');
  const [repCobro, setRepCobro] = useState('');
  const [pinCobro, setPinCobro] = useState('');
  const [pendientes, setPendientes] = useState([]);
  const [selCobro, setSelCobro] = useState({});
  const [cajeroCobro, setCajeroCobro] = useState('');

  const [repGasto, setRepGasto] = useState('');
  const [pinGasto, setPinGasto] = useState('');
  const [gastosPendientes, setGastosPendientes] = useState([]);
  const [selGasto, setSelGasto] = useState({});
  const [saldoGasto, setSaldoGasto] = useState(null);
  const [tickVentana, setTickVentana] = useState(0);

  const ventana = useMemo(() => estadoVentanaRecoleccion(), [tickVentana]);

  useEffect(() => {
    const id = setInterval(() => setTickVentana((n) => n + 1), 60_000);
    const onCfg = () => setTickVentana((n) => n + 1);
    window.addEventListener(EVENTO_VENTANA_RECOLECCION, onCfg);
    return () => {
      clearInterval(id);
      window.removeEventListener(EVENTO_VENTANA_RECOLECCION, onCfg);
    };
  }, []);

  useEffect(() => {
    if (!ventana.abierta && esEfectivo) setEsEfectivo(false);
  }, [ventana.abierta, esEfectivo]);

  const cargarCatalogos = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setErrorTabla(null);
    try {
      const [reps, srv] = await Promise.all([listarRepartidores(supabase), listarServiciosCobro(supabase)]);
      setRepartidores(reps);
      setServicios(srv);
      if (reps.length) {
        setRepTraspaso((prev) => prev || reps[0].id);
        setRepCobro((prev) => prev || reps[0].id);
        const detectado = resolverRepartidorPorNombre(user?.nombre, reps);
        if (detectado) {
          setRepGasto((prev) => prev || detectado);
          setRepCobro((prev) => prev || detectado);
        } else {
          setRepGasto((prev) => prev || reps[0].id);
        }
      }
    } catch (e) {
      setErrorTabla(
        e.message?.includes('repartidores')
          ? 'Ejecuta supabase/control_efectivo.sql en Supabase para crear las tablas.'
          : e.message,
      );
    } finally {
      setLoading(false);
    }
  }, [supabase, user?.nombre]);

  const cargarGastosPendientes = useCallback(async () => {
    if (!supabase || !repGasto) return;
    try {
      const [pend, saldo] = await Promise.all([
        listarGastosPendientesRecolector(supabase, repGasto),
        saldoEnTransitoRepartidor(supabase, repGasto, { descontarGastosAceptados: false }),
      ]);
      setGastosPendientes(pend);
      setSaldoGasto(saldo);
      const init = {};
      pend.forEach((g) => {
        init[g.id] = true;
      });
      setSelGasto(init);
    } catch (e) {
      setErrorTabla(e.message);
    }
  }, [supabase, repGasto]);

  const cargarEstadoServicios = useCallback(async () => {
    if (!supabase || !tiendaSesion) return;
    try {
      const pend = await serviciosObligatoriosPendientesTienda(supabase, tiendaSesion);
      setPendientesSrv(pend);
      const est = {};
      const montos = {};
      for (const srv of servicios.length ? servicios : await listarServiciosCobro(supabase)) {
        const res = await servicioResueltoEnTienda(supabase, tiendaSesion, srv);
        est[srv.clave] = res;
        montos[srv.clave] = srv.monto_default;
      }
      setEstadoSrv(est);
      setMontosSrv((prev) => ({ ...montos, ...prev }));
    } catch (e) {
      setErrorTabla(e.message);
    }
  }, [supabase, tiendaSesion, servicios]);

  const cargarPendientes = useCallback(async () => {
    if (!supabase || !tiendaCobro) return;
    try {
      const data = await listarCreditosPendientes(supabase, tiendaCobro);
      setPendientes(data);
      const init = {};
      data.forEach((p) => {
        init[p.id] = true;
      });
      setSelCobro(init);
    } catch (e) {
      setErrorTabla(e.message);
    }
  }, [supabase, tiendaCobro]);

  useEffect(() => {
    cargarCatalogos();
  }, [cargarCatalogos]);

  useEffect(() => {
    if (tiendaSesion && !tiendaCobro) setTiendaCobro(tiendaSesion);
  }, [tiendaSesion, tiendaCobro]);

  useEffect(() => {
    if (tab === 'traspaso' && tiendaSesion) cargarEstadoServicios();
  }, [tab, tiendaSesion, cargarEstadoServicios, servicios.length]);

  useEffect(() => {
    if (tab === 'cobro' && tiendaCobro) cargarPendientes();
  }, [tab, tiendaCobro, cargarPendientes]);

  useEffect(() => {
    if (repGasto) cargarGastosPendientes();
  }, [repGasto, cargarGastosPendientes]);

  const totalCobroSel = useMemo(
    () => pendientes.filter((p) => selCobro[p.id]).reduce((a, p) => a + Number(p.monto || 0), 0),
    [pendientes, selCobro],
  );

  const totalGastoSel = useMemo(
    () => gastosPendientes.filter((g) => selGasto[g.id]).reduce((a, g) => a + Number(g.monto || 0), 0),
    [gastosPendientes, selGasto],
  );

  const repGastoNombre = useMemo(() => repartidores.find((r) => r.id === repGasto)?.nombre || '', [repartidores, repGasto]);

  const serviciosBloqueanTraspaso = pendientesSrv.length > 0;

  const confirmarCobroServicio = async (srv) => {
    if (!pinRepartidorValido(pinTraspaso, repTraspaso, repartidores)) return alert('PIN de recolector incorrecto.');
    setGuardando(true);
    const res = await registrarCobroServicio(supabase, {
      tienda: tiendaSesion,
      repartidorId: repTraspaso,
      cajero: user?.nombre || 'Cajero',
      srv,
      monto: montosSrv[srv.clave] ?? srv.monto_default,
      pin: pinTraspaso,
      repartidores,
    });
    setGuardando(false);
    if (!res.ok) return alert(res.error);
    alert(`✅ Cobro de ${srv.nombre} registrado.`);
    setMostrarNoCobro((m) => ({ ...m, [srv.clave]: false }));
    cargarEstadoServicios();
  };

  const confirmarNoCobroServicio = async (srv) => {
    const motivo = motivosNoCobro[srv.clave]?.trim();
    if (!motivo) return alert('Indica el motivo (ej. falta de liquidez).');
    if (!pinRepartidorValido(pinTraspaso, repTraspaso, repartidores)) return alert('PIN de recolector incorrecto.');
    setGuardando(true);
    const res = await registrarServicioNoCobrado(supabase, {
      tienda: tiendaSesion,
      repartidorId: repTraspaso,
      cajero: user?.nombre || 'Cajero',
      srv,
      motivo,
      pin: pinTraspaso,
      repartidores,
    });
    setGuardando(false);
    if (!res.ok) return alert(res.error);
    alert(`Registrado: ${srv.nombre} no cobrado (${motivo}). Puedes continuar con el traspaso.`);
    setMostrarNoCobro((m) => ({ ...m, [srv.clave]: false }));
    cargarEstadoServicios();
  };

  const confirmarTraspaso = async () => {
    if (!tiendaSesion) return alert('Este módulo no aplica en la central MAIN.');
    if (serviciosBloqueanTraspaso) {
      return alert(`Registra primero los servicios obligatorios: ${pendientesSrv.map((s) => s.nombre).join(', ')}`);
    }
    if (!pinRepartidorValido(pinTraspaso, repTraspaso, repartidores)) return alert('PIN de recolector incorrecto.');
    setGuardando(true);
    const res = await registrarTraspasos(supabase, filas, {
      tienda: tiendaSesion,
      repartidorId: repTraspaso,
      cajero: user?.nombre || 'Cajero',
      esEfectivo,
    });
    setGuardando(false);
    if (!res.ok) return alert(res.error);
    alert(`✅ ${res.count} traspaso(s) registrado(s)${esEfectivo ? ' en tránsito' : ' a crédito'}.`);
    setFilas([{ folio: '', monto: '' }]);
    setPinTraspaso('');
    if (!esEfectivo) setTab('cobro');
  };

  const toggleTodosGastos = (valor) => {
    const next = {};
    gastosPendientes.forEach((g) => {
      next[g.id] = valor;
    });
    setSelGasto(next);
  };

  const confirmarAceptarGastos = async () => {
    if (!repGasto) return alert('Selecciona recolector.');
    if (!pinRepartidorValido(pinGasto, repGasto, repartidores)) return alert('PIN de recolector incorrecto.');
    const ids = gastosPendientes.filter((g) => selGasto[g.id]).map((g) => g.id);
    if (!ids.length) return alert('Selecciona al menos un gasto autorizado.');
    setGuardando(true);
    const res = await aceptarGastosRecolector(supabase, {
      ids,
      repartidorId: repGasto,
      recolectorNombre: repGastoNombre || user?.nombre || 'Recolector',
    });
    setGuardando(false);
    if (!res.ok) return alert(res.error);
    alert(`✅ ${res.count} gasto(s) registrado(s) por ${fmtMonto(res.total)}.`);
    setPinGasto('');
    cargarGastosPendientes();
  };

  const confirmarCobro = async () => {
    if (!tiendaCobro) return alert('Selecciona la tienda a cobrar.');
    if (!pinRepartidorValido(pinCobro, repCobro, repartidores)) return alert('PIN de recolector incorrecto.');
    const ids = pendientes.filter((p) => selCobro[p.id]).map((p) => p.id);
    setGuardando(true);
    const res = await cobrarCreditosSeleccionados(supabase, {
      ids,
      repartidorId: repCobro,
      cajero: cajeroCobro || user?.nombre || '',
      pendientes,
    });
    setGuardando(false);
    if (!res.ok) return alert(res.error);
    alert(`✅ Cobrados ${res.count} folio(s) por ${fmtMonto(res.total)}.`);
    setPinCobro('');
    cargarPendientes();
  };

  const toggleTodosCreditos = (valor) => {
    const next = {};
    pendientes.forEach((p) => {
      next[p.id] = valor;
    });
    setSelCobro(next);
  };

  if (!esRepartidor && !tiendaSesion) {
    return (
      <div className="card">
        <p>
          Las recolecciones operan en tiendas de venta, no en <strong>{tiendaLabel}</strong>. Cambia la sucursal activa.
        </p>
      </div>
    );
  }

  const tiendaCobroLabel = tiendasEfectivo.find((t) => t.nombre === tiendaCobro)?.etiqueta || tiendaCobro;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <h2 style={{ margin: 0, color: 'var(--brand-blue)' }}>Recolecciones</h2>
        <p className="muted" style={{ margin: '0.35rem 0 0' }}>
          Control de traspasos, servicios y crédito
          {tiendaSesion && (
            <>
              {' '}
              · Tienda <span className="badge">{tiendaLabel}</span> ({tiendaSesion})
            </>
          )}
          {esRepartidor && !tiendaSesion && <> · Recolector en central — elige tienda al cobrar crédito</>}
        </p>
      </div>

      <div
        className="card"
        style={{
          padding: '0.75rem 1rem',
          borderLeft: `4px solid ${ventana.abierta ? 'var(--brand-green, #16a34a)' : 'var(--brand-red, #c0392b)'}`,
          background: ventana.abierta ? 'rgba(22,163,74,0.06)' : 'rgba(192,57,43,0.08)',
        }}
      >
        <strong style={{ color: 'var(--brand-blue)' }}>
          Ventana de recolección: {ventana.etiqueta || '08:00 – 20:00'} (hora Sonora)
        </strong>
        <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.85rem' }}>
          {ventana.abierta
            ? 'Abierta: puedes cobrar CFE, efectivo y créditos. Tras el cobro de CFE puedes seguir con traspasos o reparto.'
            : ventana.mensaje}
        </p>
      </div>

      {errorTabla && (
        <div className="card" style={{ borderColor: 'var(--brand-red)', color: 'var(--brand-red)' }}>
          {errorTabla}
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {!esRepartidor && tiendaSesion && (
          <TabBtn active={tab === 'traspaso'} onClick={() => setTab('traspaso')}>
            <BtnLabel icon="truck">Registrar traspaso</BtnLabel>
          </TabBtn>
        )}
        <TabBtn active={tab === 'cobro'} onClick={() => setTab('cobro')}>
          <BtnLabel icon="dollar">Cobrar crédito</BtnLabel>
        </TabBtn>
        <TabBtn active={tab === 'gastos'} onClick={() => setTab('gastos')}>
          <BtnLabel icon="register">
            Gastos{gastosPendientes.length > 0 ? ` (${gastosPendientes.length})` : ''}
          </BtnLabel>
        </TabBtn>
      </div>

      {loading && <p className="muted">Cargando recolectores…</p>}

      {tab === 'traspaso' && !esRepartidor && tiendaSesion && (
        <>
          <div className="card" style={{ borderLeft: '4px solid var(--brand-gold)' }}>
            <h3 style={{ margin: '0 0 0.5rem', color: 'var(--brand-blue)' }}>Servicios obligatorios</h3>
            <div className="grid-2" style={{ marginBottom: '0.75rem', gap: '0.75rem' }}>
              <label className="muted" style={{ display: 'block' }}>
                Recolector
                <select className="select" style={{ marginTop: '0.35rem' }} value={repTraspaso} onChange={(e) => setRepTraspaso(e.target.value)}>
                  {repartidores.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <label className="muted" style={{ display: 'block' }}>
                PIN del recolector
                <InputPin value={pinTraspaso} onChange={(e) => setPinTraspaso(e.target.value)} placeholder="PIN" style={{ marginBottom: 0, marginTop: '0.35rem' }} />
              </label>
            </div>
            <p className="muted" style={{ fontSize: '0.85rem', marginTop: 0 }}>
              Debes registrar el cobro de servicios (CFE, etc.) antes de entregar mercancía o registrar traspaso en{' '}
              <strong>{tiendaSesion}</strong>. Tras registrar CFE puedes seguir traspasando o repartiendo producto.
              {!ventana.abierta && ' Fuera de horario solo se registran servicios no cobrados / pendientes.'}
            </p>

            {servicios.map((srv) => {
              const res = estadoSrv[srv.clave];
              const yaCobrado = res?.cobrado?.length > 0;
              const reportado = res?.reportadoNoCobro?.length > 0;
              const pendiente = pendientesSrv.some((p) => p.clave === srv.clave);

              return (
                <div
                  key={srv.clave}
                  style={{
                    marginTop: '0.75rem',
                    padding: '0.75rem',
                    borderRadius: '8px',
                    background: yaCobrado ? 'rgba(34,197,94,0.08)' : reportado ? 'rgba(225,153,41,0.1)' : 'var(--surface-2)',
                    border: `1px solid ${yaCobrado ? 'rgba(34,197,94,0.35)' : reportado ? 'rgba(225,153,41,0.35)' : 'var(--border)'}`,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <div>
                      <strong>{srv.nombre}</strong>
                      <span className="muted" style={{ display: 'block', fontSize: '0.8rem' }}>
                        Cuota sugerida: {fmtMonto(srv.monto_default)} · {srv.frecuencia || 'Diario'}
                      </span>
                    </div>
                    {yaCobrado && <span className="badge" style={{ background: 'rgba(34,197,94,0.2)' }}>✅ Cobrado</span>}
                    {reportado && !yaCobrado && (
                      <span className="badge" style={{ background: 'rgba(225,153,41,0.2)' }}>⚠ No cobrado (reportado)</span>
                    )}
                    {pendiente && !yaCobrado && !reportado && (
                      <span className="badge" style={{ background: 'rgba(239,68,68,0.15)', color: 'var(--brand-red)' }}>Pendiente</span>
                    )}
                  </div>

                  {yaCobrado && (
                    <p className="muted" style={{ fontSize: '0.8rem', margin: '0.5rem 0 0' }}>
                      {fmtMonto(res.cobrado[0].monto)} · {fmtFechaHora(res.cobrado[0].fecha_hora)}
                    </p>
                  )}
                  {reportado && !yaCobrado && (
                    <p className="muted" style={{ fontSize: '0.8rem', margin: '0.5rem 0 0' }}>
                      {res.reportadoNoCobro[0].foto_url}
                    </p>
                  )}

                  {pendiente && !yaCobrado && !reportado && (
                    <div style={{ marginTop: '0.65rem' }}>
                      <label className="muted" style={{ display: 'block' }}>
                        Monto cobrado ($)
                        <input
                          className="input"
                          type="number"
                          min="0"
                          step="0.01"
                          style={{ marginTop: '0.35rem', maxWidth: '160px' }}
                          value={montosSrv[srv.clave] ?? srv.monto_default}
                          onChange={(e) => setMontosSrv({ ...montosSrv, [srv.clave]: e.target.value })}
                        />
                      </label>
                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                        <button type="button" className="btn btn-success" disabled={guardando || !ventana.abierta} onClick={() => confirmarCobroServicio(srv)}>
                          Cobrar {srv.clave}
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => setMostrarNoCobro({ ...mostrarNoCobro, [srv.clave]: !mostrarNoCobro[srv.clave] })}
                        >
                          No cobrar (motivo)
                        </button>
                      </div>
                      {mostrarNoCobro[srv.clave] && (
                        <div style={{ marginTop: '0.5rem' }}>
                          <label className="muted" style={{ display: 'block' }}>
                            Motivo (ej. falta de liquidez)
                            <input
                              className="input"
                              style={{ marginTop: '0.35rem' }}
                              value={motivosNoCobro[srv.clave] || ''}
                              onChange={(e) => setMotivosNoCobro({ ...motivosNoCobro, [srv.clave]: e.target.value })}
                              placeholder="Describe por qué no se cobró"
                            />
                          </label>
                          <button type="button" className="btn btn-ghost" style={{ marginTop: '0.5rem' }} disabled={guardando} onClick={() => confirmarNoCobroServicio(srv)}>
                            Registrar no cobro y continuar
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {serviciosBloqueanTraspaso && (
              <p style={{ color: 'var(--brand-red)', fontSize: '0.85rem', marginTop: '0.75rem', marginBottom: 0 }}>
                Completa los servicios pendientes para habilitar el traspaso.
              </p>
            )}
          </div>

          <div className="card" style={{ opacity: serviciosBloqueanTraspaso ? 0.55 : 1, pointerEvents: serviciosBloqueanTraspaso ? 'none' : 'auto' }}>
            <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Nuevo traspaso</h3>
            <p className="muted" style={{ fontSize: '0.85rem' }}>
              Cajero: <strong>{user?.nombre}</strong>. Si es a crédito, el recolector lo cobra después en «Cobrar crédito».
            </p>

            <fieldset style={{ border: 'none', padding: 0, margin: '0.75rem 0' }}>
              <legend className="muted" style={{ fontSize: '0.85rem' }}>
                Forma de pago
              </legend>
              <label style={{ display: 'block', marginTop: '0.35rem', opacity: ventana.abierta ? 1 : 0.5 }}>
                <input
                  type="radio"
                  checked={esEfectivo}
                  disabled={!ventana.abierta}
                  onChange={() => setEsEfectivo(true)}
                />{' '}
                Efectivo (cobrado ahora)
                {!ventana.abierta && <span className="muted"> — fuera de ventana {ventana.etiqueta}</span>}
              </label>
              <label style={{ display: 'block', marginTop: '0.25rem' }}>
                <input type="radio" checked={!esEfectivo} onChange={() => setEsEfectivo(false)} /> Crédito (pendiente de cobro)
              </label>
            </fieldset>

            {filas.map((f, idx) => (
              <div key={idx} className="grid-2" style={{ marginTop: '0.5rem', alignItems: 'end' }}>
                <label className="muted">
                  Folio #{idx + 1}
                  <input
                    className="input"
                    style={{ marginTop: '0.35rem' }}
                    value={f.folio}
                    onChange={(e) => {
                      const next = [...filas];
                      next[idx] = { ...next[idx], folio: e.target.value };
                      setFilas(next);
                    }}
                    placeholder="Ej. T-9945"
                  />
                </label>
                <label className="muted">
                  Monto ($)
                  <input
                    className="input"
                    type="number"
                    min="0"
                    step="0.01"
                    style={{ marginTop: '0.35rem' }}
                    value={f.monto}
                    onChange={(e) => {
                      const next = [...filas];
                      next[idx] = { ...next[idx], monto: e.target.value };
                      setFilas(next);
                    }}
                  />
                </label>
              </div>
            ))}

            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setFilas([...filas, { folio: '', monto: '' }])}>
                + Otro folio
              </button>
              {filas.length > 1 && (
                <button type="button" className="btn btn-ghost" onClick={() => setFilas(filas.slice(0, -1))}>
                  Quitar último
                </button>
              )}
            </div>

            <button type="button" className="btn btn-gold" style={{ marginTop: '1rem' }} disabled={guardando || serviciosBloqueanTraspaso} onClick={confirmarTraspaso}>
              {guardando ? 'Guardando…' : 'Confirmar traspaso(s)'}
            </button>
          </div>
        </>
      )}

      {tab === 'cobro' && (
        <div className="card">
          <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Cobrar crédito por tienda</h3>

          <label className="muted" style={{ display: 'block' }}>
            Tienda a cobrar
            <select className="select" style={{ marginTop: '0.35rem' }} value={tiendaCobro} onChange={(e) => setTiendaCobro(e.target.value)}>
              <option value="">— Selecciona tienda —</option>
              {tiendasEfectivo.map((t) => (
                <option key={t.codigo} value={t.nombre}>
                  {t.etiqueta} ({t.nombre})
                </option>
              ))}
            </select>
          </label>

          {!tiendaCobro ? (
            <p className="muted" style={{ marginTop: '1rem' }}>Elige la tienda donde vas a cobrar los créditos pendientes.</p>
          ) : !pendientes.length ? (
            <p className="muted" style={{ marginTop: '1rem' }}>
              ✅ No hay folios a crédito pendientes en <strong>{tiendaCobroLabel}</strong>.
            </p>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
                  {pendientes.length} ficha(s) pendiente(s) en <strong>{tiendaCobroLabel}</strong>
                </p>
                <div style={{ display: 'flex', gap: '0.35rem' }}>
                  <button type="button" className="btn btn-ghost" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} onClick={() => toggleTodosCreditos(true)}>
                    Todas
                  </button>
                  <button type="button" className="btn btn-ghost" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} onClick={() => toggleTodosCreditos(false)}>
                    Ninguna
                  </button>
                </div>
              </div>

              {pendientes.map((p) => (
                <label
                  key={p.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.65rem 0',
                    borderBottom: '1px solid var(--border)',
                    cursor: 'pointer',
                  }}
                >
                  <input type="checkbox" checked={Boolean(selCobro[p.id])} onChange={(e) => setSelCobro({ ...selCobro, [p.id]: e.target.checked })} />
                  <span style={{ flex: 1 }}>
                    <strong>{p.num_traspaso}</strong>
                    <span className="muted" style={{ display: 'block', fontSize: '0.8rem' }}>
                      Cajero: {p.cajero_nombre} · {fmtFechaHora(p.fecha_hora)}
                    </span>
                  </span>
                  <strong>{fmtMonto(p.monto)}</strong>
                </label>
              ))}

              <div
                style={{
                  marginTop: '1rem',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  background: 'rgba(13,148,136,0.08)',
                  border: '1px solid rgba(13,148,136,0.25)',
                }}
              >
                <p style={{ margin: 0, fontWeight: 700, fontSize: '1.1rem' }}>Total a cobrar: {fmtMonto(totalCobroSel)}</p>
                <p className="muted" style={{ margin: '0.25rem 0 0', fontSize: '0.8rem' }}>
                  {pendientes.filter((p) => selCobro[p.id]).length} de {pendientes.length} ficha(s) seleccionada(s)
                </p>
              </div>

              <label className="muted" style={{ display: 'block', marginTop: '1rem' }}>
                Recolector
                <select className="select" style={{ marginTop: '0.35rem' }} value={repCobro} onChange={(e) => setRepCobro(e.target.value)}>
                  {repartidores.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <label className="muted" style={{ display: 'block', marginTop: '0.75rem' }}>
                Cajero que entrega el cobro
                <input
                  className="input"
                  style={{ marginTop: '0.35rem' }}
                  value={cajeroCobro}
                  onChange={(e) => setCajeroCobro(e.target.value)}
                  placeholder={user?.nombre || 'Nombre del cajero'}
                />
              </label>
              <label className="muted" style={{ display: 'block', marginTop: '0.75rem' }}>
                PIN recolector
                <InputPin value={pinCobro} onChange={(e) => setPinCobro(e.target.value)} placeholder="PIN" style={{ marginBottom: 0 }} />
              </label>
              <button type="button" className="btn btn-success" style={{ marginTop: '1rem' }} disabled={guardando || totalCobroSel <= 0 || !ventana.abierta} onClick={confirmarCobro}>
                {guardando ? 'Procesando…' : !ventana.abierta ? `Fuera de ventana ${ventana.etiqueta}` : `Confirmar cobro · ${fmtMonto(totalCobroSel)}`}
              </button>
            </>
          )}
        </div>
      )}

      {tab === 'gastos' && (
        <div className="card" style={{ borderLeft: '4px solid var(--brand-gold)' }}>
          <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Gastos autorizados</h3>
          <p className="muted" style={{ fontSize: '0.85rem', marginTop: 0 }}>
            Contabilidad autoriza gastos desde Panel RT. Al aceptar con tu PIN, el gasto queda registrado para
            liquidación. No se muestra ni descuenta en tu módulo de cobro; aquí solo ves pendientes de aceptar.
          </p>

          <label className="muted" style={{ display: 'block' }}>
            Recolector
            <select className="select" style={{ marginTop: '0.35rem' }} value={repGasto} onChange={(e) => setRepGasto(e.target.value)}>
              <option value="">— Selecciona —</option>
              {repartidores.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nombre}
                </option>
              ))}
            </select>
          </label>

          {saldoGasto && repGasto && gastosPendientes.length > 0 && (
            <p style={{ fontSize: '0.85rem', margin: '0.75rem 0 0' }}>
              Efectivo en tránsito: <strong>{fmtMonto(Math.max(0, saldoGasto.ingresos || 0))}</strong>
              {saldoGasto.reservado > 0 ? (
                <span className="muted" style={{ display: 'block', fontSize: '0.78rem' }}>
                  Pendiente de aceptar {fmtMonto(saldoGasto.reservado)}
                </span>
              ) : null}
            </p>
          )}

          {!repGasto ? (
            <p className="muted" style={{ marginTop: '1rem' }}>Selecciona tu nombre de recolector.</p>
          ) : !gastosPendientes.length ? (
            <p className="muted" style={{ marginTop: '1rem' }}>✅ No hay gastos pendientes de aceptar.</p>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
                  {gastosPendientes.length} gasto(s) autorizado(s)
                </p>
                <div style={{ display: 'flex', gap: '0.35rem' }}>
                  <button type="button" className="btn btn-ghost" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} onClick={() => toggleTodosGastos(true)}>
                    Todos
                  </button>
                  <button type="button" className="btn btn-ghost" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} onClick={() => toggleTodosGastos(false)}>
                    Ninguno
                  </button>
                </div>
              </div>

              {gastosPendientes.map((g) => (
                <label
                  key={g.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.65rem 0',
                    borderBottom: '1px solid var(--border)',
                    cursor: 'pointer',
                  }}
                >
                  <input type="checkbox" checked={Boolean(selGasto[g.id])} onChange={(e) => setSelGasto({ ...selGasto, [g.id]: e.target.checked })} />
                  <span style={{ flex: 1 }}>
                    <strong>{g.descripcion_gasto}</strong>
                    <span className="muted" style={{ display: 'block', fontSize: '0.8rem' }}>
                      Autorizado por {g.cajero_nombre} · {fmtFechaHora(g.fecha_hora)}
                      {g.sucursal_origen ? ` · ${g.sucursal_origen}` : ''}
                    </span>
                  </span>
                  <strong>{fmtMonto(g.monto)}</strong>
                </label>
              ))}

              <div
                style={{
                  marginTop: '1rem',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  background: 'rgba(225,153,41,0.08)',
                  border: '1px solid rgba(225,153,41,0.25)',
                }}
              >
                <p style={{ margin: 0, fontWeight: 700, fontSize: '1.1rem' }}>Total a aceptar: {fmtMonto(totalGastoSel)}</p>
                <p className="muted" style={{ margin: '0.25rem 0 0', fontSize: '0.8rem' }}>
                  Al confirmar, el gasto pasa a liquidación. Deja de verse aquí y no afecta tu cobro.
                </p>
              </div>

              <label className="muted" style={{ display: 'block', marginTop: '1rem' }}>
                PIN recolector
                <InputPin value={pinGasto} onChange={(e) => setPinGasto(e.target.value)} placeholder="PIN" style={{ marginBottom: 0 }} />
              </label>
              <button
                type="button"
                className="btn btn-gold"
                style={{ marginTop: '1rem' }}
                disabled={guardando || totalGastoSel <= 0}
                onClick={confirmarAceptarGastos}
              >
                {guardando ? 'Procesando…' : `Aceptar y registrar · ${fmtMonto(totalGastoSel)}`}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
