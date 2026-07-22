import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  EVENTO_NOTIFICACIONES,
  etiquetaTipoNotificacion,
  listarHistorialNotificaciones,
  listarNotificacionesPendientes,
  marcarNotificacionAtendidaPorId,
  TIPOS_NOTIF,
} from '../lib/contabilidadNotificaciones.js';
import {
  actualizarIncidencia,
  PRIORIDADES_INCIDENCIA,
  crearIncidencia,
  esResponsableIncidencia,
  etiquetaCategoriaIncidencia,
  etiquetaEstadoIncidencia,
  etiquetaPrioridadIncidencia,
  etiquetaSubcategoriaIncidencia,
  fechaHoraIncidencia,
  fmtFechaIncidencia,
  fmtHoraIncidencia,
  listarIncidencias,
  redirigirIncidencia,
  RESPONSABLES_INCIDENCIA,
} from '../lib/incidenciasPos.js';
import {
  catalogoIncidenciasActivo,
  EVENTO_CATALOGO_INCIDENCIAS,
  listarCatalogoIncidencias,
} from '../lib/incidenciasCatalogo.js';
import { normalizarRol, rolSoloPestanaIncidencias } from '../lib/roles.js';
import {
  modoVistaIncidencias,
  puedeVerBandejaPendientesIncidencias,
  puedeVerHistorialIncidencias,
  puedeVerTodasIncidencias,
  puedeResolverIncidencia,
  puedeResolverAlgunaIncidencia,
  puedeRedirigirIncidenciaPrivilegio,
  tieneAccionIncidencia,
} from '../lib/incidenciasPrivilegios.js';
import { esSocioAprobadorPrestamo } from '../lib/contabilidadConstants.js';
import { aprobarGastoTurno, rechazarGastoTurno } from '../lib/corteContabilidad/store.js';
import { etiquetaTienda } from '../constants/sucursales.js';
import { BtnLabel } from '../components/Icon.jsx';
import FiltroPeriodo from '../components/FiltroPeriodo.jsx';
import { PRESETS_FECHA_PRODUCTO, rangoDesdePreset } from '../lib/consultasInventario.js';
import { enRangoYmd, toYmd } from '../lib/fechas.js';

const PRESETS_INCIDENCIAS = [{ id: 'todos', label: 'Todas las fechas' }, ...PRESETS_FECHA_PRODUCTO];

function fmtFecha(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function Buzon({
  supabase,
  sucursal,
  user,
  pestanaInicial = 'pendientes',
  onIrValesPendientes,
  onNavigate,
}) {
  const rol = normalizarRol(user?.rol);
  const esAdmin = rol === 'Administrador';
  const esGerente = rol === 'Gerente';
  const esSocio = esSocioAprobadorPrestamo(user?.nombre);
  const modoVista = modoVistaIncidencias(rol, user?.id);
  const veTodasTiendas = puedeVerTodasIncidencias(rol, user?.id, sucursal);
  const puedeGestionarNotif = esAdmin;
  const puedeBandejaPendientes = puedeVerBandejaPendientesIncidencias(rol, user?.id);
  const puedeHistorial = puedeVerHistorialIncidencias(rol, user?.id);
  const puedeResolver = puedeResolverAlgunaIncidencia(rol, user?.id);
  const soloIncidencias = rolSoloPestanaIncidencias(rol, user?.id);

  const [pestana, setPestana] = useState(soloIncidencias ? 'incidencias' : pestanaInicial);
  const [aviso, setAviso] = useState('');
  const [pendientes, setPendientes] = useState([]);
  const [historial, setHistorial] = useState([]);
  const [incidencias, setIncidencias] = useState([]);
  const [msg, setMsg] = useState('');

  const [formInc, setFormInc] = useState({
    titulo: '',
    descripcion: '',
    categoria: 'operacion',
    subcategoria: '',
    prioridad: 'normal',
    responsable: '',
  });
  const [catalogoInc, setCatalogoInc] = useState(() => catalogoIncidenciasActivo());
  const [resolviendo, setResolviendo] = useState(null);
  const [resolucionTxt, setResolucionTxt] = useState('');
  const [redirigiendo, setRedirigiendo] = useState(null);
  const [nuevoResponsable, setNuevoResponsable] = useState('');
  const [notaRedir, setNotaRedir] = useState('');
  const [ahoraReporte, setAhoraReporte] = useState(() => new Date());
  const [presetFechaInc, setPresetFechaInc] = useState('mes');
  const [filtroDesde, setFiltroDesde] = useState(() => rangoDesdePreset('mes')?.desde || '');
  const [filtroHasta, setFiltroHasta] = useState(() => rangoDesdePreset('mes')?.hasta || '');

  const nombreTienda = etiquetaTienda(sucursal);
  const { fechaTxt: fechaReporte, horaTxt: horaReporte } = fechaHoraIncidencia(ahoraReporte);

  useEffect(() => {
    if (pestana !== 'incidencias') return undefined;
    const id = setInterval(() => setAhoraReporte(new Date()), 30_000);
    return () => clearInterval(id);
  }, [pestana]);

  useEffect(() => {
    void listarCatalogoIncidencias(supabase).then((r) => {
      if (r.data?.length) setCatalogoInc(r.data);
    });
    const sync = () => setCatalogoInc(catalogoIncidenciasActivo());
    window.addEventListener(EVENTO_CATALOGO_INCIDENCIAS, sync);
    return () => window.removeEventListener(EVENTO_CATALOGO_INCIDENCIAS, sync);
  }, [supabase]);

  const subcategoriasForm = useMemo(() => {
    const cat = catalogoInc.find((c) => c.id === formInc.categoria);
    return cat?.subcategorias || [];
  }, [catalogoInc, formInc.categoria]);

  const filtrarPendientes = useCallback(
    (lista) => {
      if (esAdmin || esGerente || veTodasTiendas) return lista;
      if (esSocio) return lista.filter((n) => n.tipo === TIPOS_NOTIF.PRESTAMO_SOCIO);
      return lista.filter((n) => n.tipo === TIPOS_NOTIF.INCIDENCIA || n.sucursal_id === sucursal);
    },
    [esAdmin, esGerente, esSocio, sucursal, veTodasTiendas],
  );

  const recargar = useCallback(async () => {
    if (!supabase) return;
    const opts = { todasTiendas: veTodasTiendas, sucursal: veTodasTiendas ? undefined : sucursal };
    const [pRes, hRes, iRes] = await Promise.all([
      soloIncidencias || !puedeBandejaPendientes
        ? Promise.resolve({ data: [] })
        : listarNotificacionesPendientes(supabase, { ...opts, limit: 100 }),
      soloIncidencias || !puedeHistorial
        ? Promise.resolve({ data: [] })
        : listarHistorialNotificaciones(supabase, { ...opts, limit: 60 }),
      listarIncidencias(supabase, {
        sucursal: veTodasTiendas ? undefined : sucursal,
        limit: 100,
      }),
    ]);
    const avisos = [pRes.aviso, iRes.aviso, hRes.aviso].filter(Boolean);
    setAviso(avisos[0] || '');
    setPendientes(filtrarPendientes(pRes.data || []));
    setHistorial(hRes.data || []);
    setIncidencias(iRes.data || []);
  }, [supabase, veTodasTiendas, sucursal, filtrarPendientes, soloIncidencias, puedeHistorial, puedeBandejaPendientes]);

  useEffect(() => {
    recargar();
    const id = setInterval(recargar, 45_000);
    const onEvt = () => recargar();
    window.addEventListener(EVENTO_NOTIFICACIONES, onEvt);
    return () => {
      clearInterval(id);
      window.removeEventListener(EVENTO_NOTIFICACIONES, onEvt);
    };
  }, [recargar]);

  useEffect(() => {
    setPestana(soloIncidencias ? 'incidencias' : pestanaInicial);
  }, [pestanaInicial, soloIncidencias]);

  const incidenciasVisibles = useMemo(() => {
    if (modoVista === 'administracion' || tieneAccionIncidencia('inc_resolver_todas', rol, user?.id)) {
      return incidencias;
    }
    if (veTodasTiendas) return incidencias;
    const nombre = user?.nombre;
    if (!nombre) return incidencias;
    if (puedeResolver) {
      return incidencias.filter(
        (i) => esResponsableIncidencia(nombre, i.responsable) || i.reportado_por === nombre,
      );
    }
    return incidencias.filter((i) => i.reportado_por === nombre);
  }, [incidencias, modoVista, rol, user?.id, user?.nombre, veTodasTiendas, puedeResolver]);

  const cambiarPresetFechaInc = (preset) => {
    setPresetFechaInc(preset);
    if (preset === 'todos') {
      setFiltroDesde('');
      setFiltroHasta('');
      return;
    }
    if (preset !== 'rango') {
      const r = rangoDesdePreset(preset);
      if (r) {
        setFiltroDesde(r.desde);
        setFiltroHasta(r.hasta);
      }
    }
  };

  const incidenciasFiltradas = useMemo(() => {
    if (!filtroDesde && !filtroHasta) return incidenciasVisibles;
    return incidenciasVisibles.filter((i) => enRangoYmd(toYmd(i.created_at), filtroDesde, filtroHasta));
  }, [incidenciasVisibles, filtroDesde, filtroHasta]);

  const incidenciasAbiertas = useMemo(
    () => incidenciasFiltradas.filter((i) => i.estado === 'abierta' || i.estado === 'en_revision'),
    [incidenciasFiltradas],
  );

  const mostrarColumnaGestion = useMemo(
    () =>
      puedeResolver ||
      esAdmin ||
      incidenciasFiltradas.some(
        (inc) =>
          puedeResolverIncidencia(user, inc, rol, user?.id) ||
          puedeRedirigirIncidenciaPrivilegio(user, inc, rol, user?.id, { esAdmin }),
      ),
    [puedeResolver, esAdmin, incidenciasFiltradas, user, rol],
  );

  const irAccionNotif = (n) => {
    if (n.tipo === TIPOS_NOTIF.INCIDENCIA) {
      setPestana('incidencias');
      return;
    }
    if (n.tipo === TIPOS_NOTIF.CONSUMO_CORTE) return;
    if (n.tipo === TIPOS_NOTIF.RECOLECCION_POST_LIQ) {
      if (typeof onNavigate === 'function') onNavigate('Liquidación recolecciones');
      return;
    }
    if (typeof onIrValesPendientes === 'function') onIrValesPendientes();
    else if (typeof onNavigate === 'function') onNavigate('Vales y Préstamos');
  };

  const aprobarConsumoCorte = async (n) => {
    if (!esAdmin && !esGerente) return;
    if (!n.ref_id) return;
    const res = await aprobarGastoTurno(supabase, n.ref_id, { nombre: user?.nombre });
    if (!res.ok) setMsg(res.error || 'No se pudo aprobar.');
    else {
      setMsg('Consumo aprobado y aplicado al corte.');
      recargar();
    }
  };

  const rechazarConsumoCorte = async (n) => {
    if (!esAdmin && !esGerente) return;
    if (!n.ref_id) return;
    if (!confirm('¿Rechazar este consumo? No se descontará del corte ni de nómina.')) return;
    const res = await rechazarGastoTurno(supabase, n.ref_id, { nombre: user?.nombre });
    if (!res.ok) setMsg(res.error || 'No se pudo rechazar.');
    else {
      setMsg('Consumo rechazado.');
      recargar();
    }
  };

  const marcarVisto = async (n) => {
    if (!puedeGestionarNotif) return;
    if (n.tipo === TIPOS_NOTIF.VALE_PENDIENTE || n.tipo === TIPOS_NOTIF.PRESTAMO_ADMIN || n.tipo === TIPOS_NOTIF.PRESTAMO_SOCIO) {
      irAccionNotif(n);
      return;
    }
    if (n.tipo === TIPOS_NOTIF.CONSUMO_CORTE) return;
    const res = await marcarNotificacionAtendidaPorId(supabase, n.id, user?.nombre);
    if (!res.ok) setMsg(res.error || 'No se pudo marcar.');
    else {
      setMsg('Marcada como atendida.');
      recargar();
    }
  };

  const enviarIncidencia = async (e) => {
    e.preventDefault();
    setMsg('');
    const momento = new Date();
    const { fechaTxt, horaTxt } = fechaHoraIncidencia(momento);
    const res = await crearIncidencia(supabase, {
      ...formInc,
      sucursal_id: sucursal,
      reportado_por: user?.nombre,
      etiqueta_tienda: nombreTienda,
      fecha_reporte: fechaTxt,
      hora_reporte: horaTxt,
    });
    if (!res.ok) {
      setMsg(res.error || 'Error al reportar.');
      return;
    }
    setMsg('Incidencia reportada. El responsable y el administrador fueron notificados.');
    setFormInc({ titulo: '', descripcion: '', categoria: 'operacion', subcategoria: '', prioridad: 'normal', responsable: '' });
    recargar();
    setPestana('incidencias');
  };

  const cambiarEstadoInc = async (inc, estado) => {
    if (!puedeResolverIncidencia(user, inc, rol, user?.id)) return;
    const res = await actualizarIncidencia(
      supabase,
      inc.id,
      { estado, resolucion: resolucionTxt.trim() || inc.resolucion || null },
      { atendidaPor: user?.nombre },
    );
    if (!res.ok) setMsg(res.error || 'Error al actualizar.');
    else {
      setMsg('Incidencia actualizada.');
      setResolviendo(null);
      setResolucionTxt('');
      recargar();
    }
  };

  const confirmarRedireccion = async (inc) => {
    if (!puedeRedirigirIncidenciaPrivilegio(user, inc, rol, user?.id, { esAdmin })) return;
    if (!nuevoResponsable) return setMsg('Selecciona el nuevo responsable.');
    const res = await redirigirIncidencia(supabase, inc.id, nuevoResponsable, {
      por: user?.nombre,
      nota: notaRedir,
    });
    if (!res.ok) setMsg(res.error || 'No se pudo redirigir.');
    else {
      setMsg(`Incidencia redirigida a ${nuevoResponsable}.`);
      setRedirigiendo(null);
      setNuevoResponsable('');
      setNotaRedir('');
      recargar();
    }
  };

  const pestanas = soloIncidencias
    ? [{ id: 'incidencias', label: `Mis reportes (${incidenciasVisibles.length})` }]
    : [
        ...(puedeBandejaPendientes ? [{ id: 'pendientes', label: `Pendientes (${pendientes.length})` }] : []),
        {
          id: 'incidencias',
          label: puedeResolver
            ? `Por atender (${incidenciasAbiertas.length})`
            : `Incidencias (${incidencias.length})`,
        },
      ];
  if (!soloIncidencias && puedeHistorial) pestanas.push({ id: 'historial', label: 'Historial' });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <h2 style={{ margin: 0, color: 'var(--brand-blue)' }}>Incidencias</h2>
        <p className="muted" style={{ margin: '0.35rem 0 0' }}>
          {soloIncidencias
            ? `Tienda ${etiquetaTienda(sucursal)} · levanta un reporte para que administración lo atienda`
            : puedeResolver
              ? `Tienda ${etiquetaTienda(sucursal)} · atiende incidencias asignadas${veTodasTiendas ? ' de todas las sucursales' : ''}`
              : 'Pendientes de todas las tiendas · vales, préstamos e incidencias'}
        </p>
      </div>

      {aviso && (
        <div className="card" style={{ borderLeft: '4px solid var(--brand-gold)', padding: '0.75rem 1rem' }}>
          <p className="muted" style={{ margin: 0, fontSize: '0.88rem' }}>{aviso}</p>
        </div>
      )}

      {msg && (
        <div className="card" style={{ padding: '0.65rem 1rem', background: 'rgba(59,105,181,0.08)' }}>
          <p style={{ margin: 0, fontSize: '0.9rem' }}>{msg}</p>
        </div>
      )}

      {!soloIncidencias && (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        {pestanas.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`btn ${pestana === p.id ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setPestana(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>
      )}

      {!soloIncidencias && pestana === 'pendientes' && (
        <div className="card">
          {pendientes.length === 0 ? (
            <p className="muted">Sin notificaciones pendientes.</p>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    {veTodasTiendas && <th>Tienda</th>}
                    <th>Tipo</th>
                    <th>Detalle</th>
                    <th>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {pendientes.map((n) => (
                    <tr key={n.id}>
                      <td>{fmtFecha(n.created_at)}</td>
                      {veTodasTiendas && <td>{etiquetaTienda(n.sucursal_id)}</td>}
                      <td>{etiquetaTipoNotificacion(n.tipo)}</td>
                      <td>
                        <strong>{n.titulo}</strong>
                        {n.mensaje && <div className="muted" style={{ fontSize: '0.82rem' }}>{n.mensaje}</div>}
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                          {n.tipo === TIPOS_NOTIF.CONSUMO_CORTE && (esAdmin || esGerente) && (
                            <>
                              <button type="button" className="btn btn-primary btn-sm" onClick={() => aprobarConsumoCorte(n)}>
                                Aprobar
                              </button>
                              <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => rechazarConsumoCorte(n)}>
                                Rechazar
                              </button>
                            </>
                          )}
                          {(n.tipo === TIPOS_NOTIF.VALE_PENDIENTE ||
                            n.tipo === TIPOS_NOTIF.PRESTAMO_ADMIN ||
                            n.tipo === TIPOS_NOTIF.PRESTAMO_SOCIO) && (
                            <button type="button" className="btn btn-gold btn-sm" onClick={() => irAccionNotif(n)}>
                              Ir a aprobar
                            </button>
                          )}
                          {n.tipo === TIPOS_NOTIF.INCIDENCIA && (
                            <button type="button" className="btn btn-primary btn-sm" onClick={() => setPestana('incidencias')}>
                              Ver incidencia
                            </button>
                          )}
                          {n.tipo === TIPOS_NOTIF.RECOLECCION_POST_LIQ && (
                            <>
                              <button type="button" className="btn btn-gold btn-sm" onClick={() => irAccionNotif(n)}>
                                Ir a liquidación
                              </button>
                              {puedeGestionarNotif && (
                                <button type="button" className="btn btn-ghost btn-sm" onClick={() => marcarVisto(n)}>
                                  Marcar visto
                                </button>
                              )}
                            </>
                          )}
                          {puedeGestionarNotif &&
                            (n.tipo === TIPOS_NOTIF.PRESTAMO_INTERAREA ||
                              n.tipo === TIPOS_NOTIF.PRESTAMO_SUCURSAL ||
                              n.tipo === TIPOS_NOTIF.INCIDENCIA) && (
                              <button type="button" className="btn btn-ghost btn-sm" onClick={() => marcarVisto(n)}>
                                Marcar visto
                              </button>
                            )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {(soloIncidencias || pestana === 'incidencias') && (
        <>
          <div className="card">
            <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue-dark)' }}>Reporte de incidencia</h3>
            <form onSubmit={enviarIncidencia} style={{ display: 'grid', gap: '0.65rem', maxWidth: 560 }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                  gap: '0.5rem',
                  padding: '0.65rem 0.75rem',
                  borderRadius: 8,
                  background: 'rgba(59,105,181,0.06)',
                  border: '1px solid var(--border)',
                }}
              >
                <div>
                  <div className="muted" style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase' }}>Tienda</div>
                  <div style={{ fontWeight: 700, marginTop: '0.2rem' }}>{nombreTienda}</div>
                </div>
                <div>
                  <div className="muted" style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase' }}>Fecha</div>
                  <div style={{ fontWeight: 700, marginTop: '0.2rem' }}>{fechaReporte}</div>
                </div>
                <div>
                  <div className="muted" style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase' }}>Hora</div>
                  <div style={{ fontWeight: 700, marginTop: '0.2rem' }}>{horaReporte}</div>
                </div>
              </div>
              <label>
                <span className="muted" style={{ fontSize: '0.82rem' }}>Título del reporte</span>
                <input
                  className="input"
                  value={formInc.titulo}
                  onChange={(e) => setFormInc((f) => ({ ...f, titulo: e.target.value }))}
                  required
                  maxLength={120}
                  placeholder="Ej. Falla en impresora de tickets"
                />
              </label>
              <label>
                <span className="muted" style={{ fontSize: '0.82rem' }}>Descripción</span>
                <textarea
                  className="input"
                  rows={3}
                  value={formInc.descripcion}
                  onChange={(e) => setFormInc((f) => ({ ...f, descripcion: e.target.value }))}
                  placeholder="Detalle de lo ocurrido…"
                />
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
                <label>
                  <span className="muted" style={{ fontSize: '0.82rem' }}>Responsable</span>
                  <select
                    className="select"
                    value={formInc.responsable}
                    onChange={(e) => setFormInc((f) => ({ ...f, responsable: e.target.value }))}
                    required
                  >
                    <option value="">— Seleccionar —</option>
                    {RESPONSABLES_INCIDENCIA.map((nombre) => (
                      <option key={nombre} value={nombre}>
                        {nombre}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="muted" style={{ fontSize: '0.82rem' }}>Categoría</span>
                  <select
                    className="input"
                    value={formInc.categoria}
                    onChange={(e) =>
                      setFormInc((f) => ({
                        ...f,
                        categoria: e.target.value,
                        subcategoria: '',
                      }))
                    }
                  >
                    {catalogoInc.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="muted" style={{ fontSize: '0.82rem' }}>Subcategoría</span>
                  <select
                    className="input"
                    value={formInc.subcategoria}
                    onChange={(e) => setFormInc((f) => ({ ...f, subcategoria: e.target.value }))}
                    disabled={subcategoriasForm.length === 0}
                  >
                    <option value="">{subcategoriasForm.length ? '— Opcional —' : 'Sin subcategorías'}</option>
                    {subcategoriasForm.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="muted" style={{ fontSize: '0.82rem' }}>Prioridad</span>
                  <select
                    className="input"
                    value={formInc.prioridad}
                    onChange={(e) => setFormInc((f) => ({ ...f, prioridad: e.target.value }))}
                  >
                    {PRIORIDADES_INCIDENCIA.map((p) => (
                      <option key={p} value={p}>{etiquetaPrioridadIncidencia(p)}</option>
                    ))}
                  </select>
                </label>
              </div>
              <button type="submit" className="btn btn-primary" style={{ justifySelf: 'start' }}>
                <BtnLabel icon="alert">Enviar reporte</BtnLabel>
              </button>
            </form>
          </div>

          <div className="card">
            <FiltroPeriodo
              presets={PRESETS_INCIDENCIAS}
              preset={presetFechaInc}
              onPresetChange={cambiarPresetFechaInc}
              desde={filtroDesde}
              hasta={filtroHasta}
              onDesdeChange={setFiltroDesde}
              onHastaChange={setFiltroHasta}
              mostrarResumen={presetFechaInc !== 'todos'}
              className=""
              style={{ marginBottom: '0.75rem' }}
            />
            <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue-dark)' }}>
              Incidencias {veTodasTiendas ? '· todas las tiendas' : ''}
              {incidenciasAbiertas.length > 0 && (
                <span className="badge" style={{ marginLeft: '0.5rem', background: 'var(--danger)', color: '#fff' }}>
                  {incidenciasAbiertas.length} abiertas
                </span>
              )}
            </h3>
            {incidenciasFiltradas.length === 0 ? (
              <p className="muted">{soloIncidencias ? 'Aún no has reportado incidencias en este periodo.' : 'No hay incidencias en este periodo.'}</p>
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Hora</th>
                      <th>Tienda</th>
                      <th>Título</th>
                      <th>Categoría</th>
                      <th>Subcategoría</th>
                      <th>Prioridad</th>
                      <th>Estado</th>
                      <th>Responsable</th>
                      <th>Reportó</th>
                      {mostrarColumnaGestion && <th>Gestión</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {incidenciasFiltradas.map((inc) => (
                      <tr key={inc.id}>
                        <td>{fmtFechaIncidencia(inc.created_at)}</td>
                        <td>{fmtHoraIncidencia(inc.created_at)}</td>
                        <td>{etiquetaTienda(inc.sucursal_id)}</td>
                        <td>
                          <strong>{inc.titulo}</strong>
                          {inc.descripcion && (
                            <div className="muted" style={{ fontSize: '0.82rem', maxWidth: 280 }}>{inc.descripcion}</div>
                          )}
                          {inc.resolucion && (
                            <div style={{ fontSize: '0.82rem', marginTop: 4, color: 'var(--brand-blue)' }}>
                              Resolución: {inc.resolucion}
                            </div>
                          )}
                        </td>
                        <td>{etiquetaCategoriaIncidencia(inc.categoria)}</td>
                        <td className="muted">{etiquetaSubcategoriaIncidencia(inc.subcategoria, inc.categoria)}</td>
                        <td>{etiquetaPrioridadIncidencia(inc.prioridad)}</td>
                        <td>{etiquetaEstadoIncidencia(inc.estado)}</td>
                        <td>
                          <strong>{inc.responsable || '—'}</strong>
                          {inc.redirigido_por && (
                            <div className="muted" style={{ fontSize: '0.72rem' }}>
                              Redir. por {inc.redirigido_por}
                            </div>
                          )}
                        </td>
                        <td>{inc.reportado_por || '—'}</td>
                        {mostrarColumnaGestion && (
                          <td>
                            {(puedeResolverIncidencia(user, inc, rol, user?.id) ||
                              puedeRedirigirIncidenciaPrivilegio(user, inc, rol, user?.id, { esAdmin })) ? (
                              inc.estado === 'abierta' || inc.estado === 'en_revision' ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 200 }}>
                                {puedeResolverIncidencia(user, inc, rol, user?.id) && (
                                  resolviendo === inc.id ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                      <textarea
                                        className="input"
                                        rows={2}
                                        placeholder="Notas de resolución…"
                                        value={resolucionTxt}
                                        onChange={(e) => setResolucionTxt(e.target.value)}
                                      />
                                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                        {inc.estado === 'abierta' && (
                                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => cambiarEstadoInc(inc, 'en_revision')}>
                                            En revisión
                                          </button>
                                        )}
                                        <button type="button" className="btn btn-primary btn-sm" onClick={() => cambiarEstadoInc(inc, 'resuelta')}>
                                          Resolver
                                        </button>
                                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setResolviendo(null); setResolucionTxt(''); }}>
                                          Cancelar
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <button type="button" className="btn btn-gold btn-sm" onClick={() => setResolviendo(inc.id)}>
                                      Atender
                                    </button>
                                  )
                                )}
                                {puedeRedirigirIncidenciaPrivilegio(user, inc, rol, user?.id, { esAdmin }) && (
                                  redirigiendo === inc.id ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                      <select
                                        className="select"
                                        value={nuevoResponsable}
                                        onChange={(e) => setNuevoResponsable(e.target.value)}
                                      >
                                        <option value="">Nuevo responsable…</option>
                                        {RESPONSABLES_INCIDENCIA.filter((n) => n !== inc.responsable).map((nombre) => (
                                          <option key={nombre} value={nombre}>
                                            {nombre}
                                          </option>
                                        ))}
                                      </select>
                                      <input
                                        className="input"
                                        placeholder="Nota opcional…"
                                        value={notaRedir}
                                        onChange={(e) => setNotaRedir(e.target.value)}
                                      />
                                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                        <button type="button" className="btn btn-primary btn-sm" onClick={() => confirmarRedireccion(inc)}>
                                          Redirigir
                                        </button>
                                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setRedirigiendo(null); setNuevoResponsable(''); setNotaRedir(''); }}>
                                          Cancelar
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRedirigiendo(inc.id)}>
                                      Redirigir
                                    </button>
                                  )
                                )}
                              </div>
                            ) : (
                              <span className="muted" style={{ fontSize: '0.82rem' }}>
                                {inc.atendida_por ? `Por ${inc.atendida_por}` : '—'}
                              </span>
                            )
                            ) : (
                              <span className="muted">—</span>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {pestana === 'historial' && puedeHistorial && (
        <div className="card">
          {historial.length === 0 ? (
            <p className="muted">Sin historial reciente.</p>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Tienda</th>
                    <th>Tipo</th>
                    <th>Detalle</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {historial.map((n) => (
                    <tr key={n.id}>
                      <td>{fmtFecha(n.created_at)}</td>
                      <td>{etiquetaTienda(n.sucursal_id)}</td>
                      <td>{etiquetaTipoNotificacion(n.tipo)}</td>
                      <td>{n.titulo}</td>
                      <td>
                        <span className={n.estado === 'pendiente' ? 'badge' : 'muted'}>{n.estado}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
