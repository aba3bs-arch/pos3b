import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { puedeVerModulo, puedeGestionarUsuarios } from '../lib/roles.js';
import { listarCatalogoContVirtual, filtrarCatalogoPorFlujo } from '../lib/contVirtualCatalogo.js';
import { hoyYmdNogales } from '../lib/corteCaja.js';
import { etiquetaTienda, normalizarCodigoTienda } from '../constants/sucursales.js';
import {
  adjuntarEvidenciaGasto,
  eliminarArchivoGastoEvidencia,
  eliminarGastoEvidencia,
  etiquetaEstadoGastoEvidencia,
  fmtMontoGastoEvidencia,
  gastoEsperaPagoRecibido,
  gastoPendienteDeAprobacion,
  leerEvidenciaArchivo,
  listarArchivosGastoEvidencia,
  listarGastosAprobadosAmr,
  listarGastosEvidencia,
  marcarPagoRecibidoGasto,
  puedeAprobarGastoEvidencia,
  puedeMarcarPagoRecibidoAmr,
  puedeVerBandejaAprobacionGastos,
  rechazarGastoEvidencia,
  registrarGastoEvidencia,
  sellarGastosEvidencia,
  totalPendienteGastos,
  MAX_ARCHIVOS_POR_GASTO,
} from '../lib/gastosEvidencia.js';
import { esAdministradorPrincipal } from '../lib/adminPrincipal.js';

const COLOR = '#0f766e';

function colorEstado(estado, gasto = null) {
  if (estado === 'sellado') return gasto?.pago_recibido ? '#047857' : '#0369a1';
  if (estado === 'rechazado') return '#b45309';
  return '#b5a642';
}

export default function GastosEvidencia({ supabase, user, sucursal }) {
  const tieneAcceso = puedeVerModulo(user?.rol, 'Registro de gastos', user?.id);
  const esAprobador = puedeVerBandejaAprobacionGastos(user);
  const esAmr = puedeMarcarPagoRecibidoAmr(user) || esAdministradorPrincipal(user);
  const esGestor = puedeGestionarUsuarios(user?.rol) || esAprobador;
  const miId = String(user?.id || '');
  const fileRefs = useRef({});

  const [vista, setVista] = useState(() => {
    if (esAdministradorPrincipal(user)) return 'pagos';
    if (puedeVerBandejaAprobacionGastos(user)) return 'pendientes';
    return 'mios';
  });
  const [catalogo, setCatalogo] = useState([]);
  const [gastos, setGastos] = useState([]);
  const [archivosPorGasto, setArchivosPorGasto] = useState({});
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [sel, setSel] = useState({});
  const [preview, setPreview] = useState(null);
  const [mostrarPagados, setMostrarPagados] = useState(false);

  const [form, setForm] = useState({
    monto: '',
    descripcion: '',
    categoria_id: 'operativos',
    subcategoria_id: 'operativos-otros',
    cuenta: 'virtual',
  });

  const catsEgreso = useMemo(() => filtrarCatalogoPorFlujo(catalogo, 'egreso') || catalogo || [], [catalogo]);
  const catSel = useMemo(
    () => catsEgreso.find((c) => c.id === form.categoria_id) || catsEgreso[0] || null,
    [catsEgreso, form.categoria_id],
  );
  const subs = useMemo(
    () => (catSel?.subcategorias || []).filter((s) => s.activo !== false),
    [catSel],
  );

  const cargar = useCallback(async () => {
    if (!tieneAcceso) return;
    if (!user?.id && !esGestor) return;
    setCargando(true);
    setError('');

    let lista = [];
    let avisoRes = null;
    let errorRes = null;

    if (vista === 'pagos' && esAmr) {
      const res = await listarGastosAprobadosAmr(supabase, {
        soloSinPago: !mostrarPagados,
        limite: 250,
      });
      lista = res.data || [];
      avisoRes = res.aviso;
      errorRes = res.error;
    } else {
      const soloMios = vista === 'mios' || !esAprobador;
      const res = await listarGastosEvidencia(supabase, {
        usuarioId: soloMios ? miId : '',
        soloPendientes: vista === 'pendientes',
        limite: 250,
      });
      lista = res.data || [];
      avisoRes = res.aviso;
      errorRes = res.error;
    }

    setCargando(false);
    if (errorRes) setError(errorRes);
    if (avisoRes) setAviso(avisoRes);
    setGastos(lista);

    const map = {};
    await Promise.all(
      lista.slice(0, 80).map(async (g) => {
        const a = await listarArchivosGastoEvidencia(supabase, g.id);
        map[g.id] = a.data || [];
      }),
    );
    setArchivosPorGasto(map);
  }, [supabase, user?.id, miId, vista, esAprobador, esAmr, esGestor, tieneAcceso, mostrarPagados]);

  useEffect(() => {
    if (!tieneAcceso) return;
    void (async () => {
      const cat = await listarCatalogoContVirtual(supabase);
      setCatalogo(cat.data || []);
    })();
  }, [supabase, tieneAcceso]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  useEffect(() => {
    if (!catSel) return;
    const subOk = subs.some((s) => s.id === form.subcategoria_id);
    if (!subOk) {
      setForm((f) => ({ ...f, subcategoria_id: subs[0]?.id || '' }));
    }
  }, [catSel, subs, form.subcategoria_id]);

  const pendientes = useMemo(() => (gastos || []).filter((g) => gastoPendienteDeAprobacion(g)), [gastos]);
  const porPagar = useMemo(() => (gastos || []).filter((g) => gastoEsperaPagoRecibido(g)), [gastos]);
  const totalPend = useMemo(() => totalPendienteGastos(gastos), [gastos]);
  const idsSel = useMemo(() => Object.keys(sel).filter((id) => sel[id]), [sel]);

  if (!tieneAcceso) {
    return (
      <div className="card">
        <p>
          No tienes acceso a Registro de gastos. Pide al administrador que active el submódulo en Configuración →
          Privilegios → Contabilidad.
        </p>
      </div>
    );
  }

  const registrar = async (e) => {
    e?.preventDefault?.();
    setGuardando(true);
    setMsg('');
    setError('');
    const sub = subs.find((s) => s.id === form.subcategoria_id);
    const r = await registrarGastoEvidencia(
      supabase,
      {
        monto: form.monto,
        descripcion: form.descripcion,
        categoria_id: catSel?.id || form.categoria_id,
        categoria_nombre: catSel?.nombre || form.categoria_id,
        subcategoria_id: sub?.id || form.subcategoria_id || null,
        subcategoria_nombre: sub?.nombre || null,
        cuenta: form.cuenta,
        sucursal_id: normalizarCodigoTienda(sucursal || user?.sucursal_id) || 'MAIN',
        fecha: hoyYmdNogales(),
      },
      user,
    );
    setGuardando(false);
    if (!r.ok) {
      setError(r.error || 'No se pudo registrar.');
      return;
    }
    if (r.aviso) setAviso(r.aviso);
    setMsg('Gasto registrado como pendiente. Adjunta evidencia y espera la aprobación.');
    setForm((f) => ({ ...f, monto: '', descripcion: '' }));
    void cargar();
  };

  const onPickFile = async (gastoId, fileList) => {
    const file = fileList?.[0];
    if (!file) return;
    setGuardando(true);
    setError('');
    try {
      const archivo = await leerEvidenciaArchivo(file);
      const r = await adjuntarEvidenciaGasto(supabase, gastoId, archivo, user);
      if (!r.ok) throw new Error(r.error || 'No se pudo adjuntar.');
      if (r.aviso) setAviso(r.aviso);
      setMsg('Evidencia adjuntada.');
      const a = await listarArchivosGastoEvidencia(supabase, gastoId);
      setArchivosPorGasto((prev) => ({ ...prev, [gastoId]: a.data || [] }));
    } catch (err) {
      setError(err.message || 'Error al adjuntar.');
    }
    setGuardando(false);
    if (fileRefs.current[gastoId]) fileRefs.current[gastoId].value = '';
  };

  const quitarArchivo = async (gastoId, archivoId) => {
    if (!confirm('¿Quitar esta evidencia?')) return;
    const r = await eliminarArchivoGastoEvidencia(supabase, archivoId, gastoId);
    if (!r.ok) return alert(r.error);
    setArchivosPorGasto((prev) => ({
      ...prev,
      [gastoId]: (prev[gastoId] || []).filter((a) => String(a.id) !== String(archivoId)),
    }));
  };

  const borrarGasto = async (g) => {
    if (!confirm(`¿Eliminar el gasto de ${fmtMontoGastoEvidencia(g.monto)}?`)) return;
    const r = await eliminarGastoEvidencia(supabase, g.id, user);
    if (!r.ok) return alert(r.error);
    setMsg('Gasto eliminado.');
    void cargar();
  };

  const sellarSel = async () => {
    const ids = idsSel.length ? idsSel : pendientes.map((g) => g.id);
    if (!ids.length) return alert('No hay gastos pendientes para aprobar.');
    if (!confirm(`¿Aprobar ${ids.length} gasto(s)? Irán a IE VIRTUAL y quedarán en el espacio de AMR como «Gasto aprobado».`)) return;
    setGuardando(true);
    const r = await sellarGastosEvidencia(supabase, ids, user);
    setGuardando(false);
    if (!r.ok && !r.sellados) {
      setError(r.error || 'No se pudo aprobar.');
      return;
    }
    setMsg(`Aprobados: ${r.sellados}${r.fallidos ? ` · fallidos: ${r.fallidos}` : ''}. Registro enviado al espacio de AMR.`);
    setSel({});
    void cargar();
  };

  const aprobarUno = async (g) => {
    if (!confirm('¿Aprobar este gasto? Pasará a IE VIRTUAL y al espacio de AMR.')) return;
    setGuardando(true);
    const r = await sellarGastosEvidencia(supabase, [g.id], user);
    setGuardando(false);
    if (!r.ok && !r.sellados) return alert(r.error);
    setMsg('Gasto aprobado → IE VIRTUAL · registro en espacio AMR.');
    void cargar();
  };

  const rechazarUno = async (g) => {
    const motivo = prompt('Motivo del rechazo:', 'Falta evidencia o monto incorrecto');
    if (motivo == null) return;
    const r = await rechazarGastoEvidencia(supabase, g.id, user, motivo);
    if (!r.ok) return alert(r.error);
    setMsg('Gasto rechazado.');
    void cargar();
  };

  const marcarPago = async (g, recibido = true) => {
    setGuardando(true);
    const r = await marcarPagoRecibidoGasto(supabase, g.id, user, recibido);
    setGuardando(false);
    if (!r.ok) return alert(r.error);
    setMsg(recibido ? 'Marcado como pago recibido.' : 'Se quitó la marca de pago recibido.');
    void cargar();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <h2 style={{ margin: 0, color: COLOR }}>Registro de gastos</h2>
        <p className="muted" style={{ margin: '0.35rem 0 0' }}>
          Registra gastos con evidencia. Al <strong>aprobarlos</strong> van a <strong>IE VIRTUAL</strong> y queda un
          registro en el espacio de <strong>AMR</strong> para marcar <strong>Pago recibido</strong>.
        </p>
      </div>

      {aviso ? (
        <div className="card" style={{ borderColor: 'rgba(180,83,9,0.45)', background: '#fffbeb' }}>
          <strong style={{ color: '#b45309' }}>{aviso}</strong>
          {!aviso.includes('fix_gastos_evidencia') ? null : (
            <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.85rem' }}>
              Mientras tanto se guarda en este equipo (local).
            </p>
          )}
        </div>
      ) : null}
      {error ? (
        <div className="card" style={{ borderColor: 'rgba(211,47,47,0.4)', background: '#fff5f5' }}>
          <strong style={{ color: 'var(--brand-red)' }}>{error}</strong>
        </div>
      ) : null}
      {msg ? <p style={{ margin: 0, color: COLOR, fontWeight: 600 }}>{msg}</p> : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.65rem' }}>
        <div className="card" style={{ padding: '0.75rem', borderTop: `3px solid ${COLOR}` }}>
          <div className="muted" style={{ fontSize: '0.72rem' }}>
            {vista === 'pagos' ? 'POR CONFIRMAR PAGO' : 'PENDIENTES'}
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800 }}>
            {vista === 'pagos' ? porPagar.length : pendientes.length}
          </div>
        </div>
        <div className="card" style={{ padding: '0.75rem', borderTop: '3px solid #b5a642' }}>
          <div className="muted" style={{ fontSize: '0.72rem' }}>MONTO</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#b5a642' }}>
            {fmtMontoGastoEvidencia(
              vista === 'pagos' ? porPagar.reduce((a, g) => a + (Number(g.monto) || 0), 0) : totalPend,
            )}
          </div>
        </div>
        <div className="card" style={{ padding: '0.75rem' }}>
          <div className="muted" style={{ fontSize: '0.72rem' }}>MI ESPACIO</div>
          <div style={{ fontWeight: 700 }}>{user?.nombre || '—'}</div>
        </div>
      </div>

      {vista !== 'pagos' ? (
        <form className="card" style={{ borderTop: `4px solid ${COLOR}` }} onSubmit={registrar}>
          <h3 style={{ margin: '0 0 0.75rem', color: COLOR }}>Registrar gasto</h3>
          <p className="muted" style={{ margin: '0 0 0.75rem', fontSize: '0.82rem' }}>
            Fecha automática: <strong>{hoyYmdNogales()}</strong> · Tienda:{' '}
            <strong>{etiquetaTienda(sucursal || user?.sucursal_id || 'MAIN')}</strong>
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.65rem' }}>
            <label className="muted">
              Monto (MXN)
              <input
                className="input"
                type="number"
                min="0.01"
                step="0.01"
                required
                value={form.monto}
                onChange={(e) => setForm({ ...form, monto: e.target.value })}
                style={{ marginTop: '0.3rem', fontWeight: 700, fontSize: '1.1rem' }}
                placeholder="0.00"
              />
            </label>
            <label className="muted">
              Categoría IE VIRTUAL
              <select
                className="input"
                value={catSel?.id || form.categoria_id}
                onChange={(e) => setForm({ ...form, categoria_id: e.target.value })}
                style={{ marginTop: '0.3rem' }}
              >
                {catsEgreso.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre || c.id}
                  </option>
                ))}
              </select>
            </label>
            <label className="muted">
              Subcategoría
              <select
                className="input"
                value={form.subcategoria_id}
                onChange={(e) => setForm({ ...form, subcategoria_id: e.target.value })}
                style={{ marginTop: '0.3rem' }}
              >
                {subs.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre || s.id}
                  </option>
                ))}
              </select>
            </label>
            <label className="muted">
              Cuenta
              <select
                className="input"
                value={form.cuenta}
                onChange={(e) => setForm({ ...form, cuenta: e.target.value })}
                style={{ marginTop: '0.3rem' }}
              >
                <option value="virtual">Virtual</option>
                <option value="garage">Garage</option>
                <option value="abarrotes">Abarrotes</option>
              </select>
            </label>
          </div>
          <label className="muted" style={{ display: 'block', marginTop: '0.65rem' }}>
            Descripción
            <textarea
              className="input"
              required
              rows={2}
              value={form.descripcion}
              onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
              style={{ marginTop: '0.3rem' }}
              placeholder="Ej. Taxi a proveedor, material de limpieza, etc."
            />
          </label>
          <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button type="submit" className="btn btn-success" disabled={guardando}>
              {guardando ? 'Guardando…' : 'Agregar a mi lista'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={cargar} disabled={cargando}>
              {cargando ? 'Actualizando…' : 'Actualizar lista'}
            </button>
          </div>
        </form>
      ) : null}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem', alignItems: 'center' }}>
        <button type="button" className={vista === 'mios' ? 'btn btn-primary' : 'btn btn-ghost'} onClick={() => setVista('mios')}>
          Mis gastos
        </button>
        {esAprobador ? (
          <button
            type="button"
            className={vista === 'pendientes' ? 'btn btn-primary' : 'btn btn-ghost'}
            onClick={() => setVista('pendientes')}
          >
            Por aprobar
          </button>
        ) : null}
        {esAmr ? (
          <button
            type="button"
            className={vista === 'pagos' ? 'btn btn-primary' : 'btn btn-ghost'}
            onClick={() => setVista('pagos')}
          >
            Mi espacio · pagos
          </button>
        ) : null}
        {esAprobador && vista === 'pendientes' && pendientes.length > 0 ? (
          <button type="button" className="btn btn-success" onClick={sellarSel} disabled={guardando}>
            {guardando ? 'Aprobando…' : `Aprobar ${idsSel.length ? `(${idsSel.length})` : 'pendientes'} → IE`}
          </button>
        ) : null}
        {esAmr && vista === 'pagos' ? (
          <label className="muted" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem' }}>
            <input type="checkbox" checked={mostrarPagados} onChange={(e) => setMostrarPagados(e.target.checked)} />
            Ver también ya pagados
          </label>
        ) : null}
      </div>

      {esAmr && vista === 'pagos' ? (
        <div className="card" style={{ borderTop: '4px solid #0369a1', background: '#f0f9ff' }}>
          <h3 style={{ margin: '0 0 0.35rem', color: '#0369a1' }}>Espacio AMR · gastos aprobados</h3>
          <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
            Cuando aprueban un gasto, aparece aquí como <strong>Gasto aprobado</strong>. Usa{' '}
            <strong>Pago recibido</strong> para recordar si ya te pagaron.
          </p>
        </div>
      ) : null}

      {!gastos.length && !cargando ? (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            {vista === 'pagos'
              ? 'No hay gastos aprobados pendientes de pago recibido.'
              : 'Aún no hay gastos en esta vista. Registra el primero arriba.'}
          </p>
        </div>
      ) : null}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
        {gastos.map((g) => {
          const archivos = archivosPorGasto[g.id] || [];
          const mios = String(g.usuario_id) === miId;
          const puedeEditar = gastoPendienteDeAprobacion(g) && (mios || esAprobador);
          const puedoAprobarEste = vista === 'pendientes' && puedeAprobarGastoEvidencia(user, g);
          const esperaPago = gastoEsperaPagoRecibido(g);
          return (
            <div
              key={g.id}
              className="card"
              style={{
                padding: '0.85rem',
                borderLeft: `4px solid ${colorEstado(g.estado, g)}`,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    {puedoAprobarEste ? (
                      <input
                        type="checkbox"
                        checked={Boolean(sel[g.id])}
                        onChange={(e) => setSel((s) => ({ ...s, [g.id]: e.target.checked }))}
                        title="Seleccionar para aprobar"
                      />
                    ) : null}
                    <strong style={{ fontSize: '1.15rem', color: COLOR }}>{fmtMontoGastoEvidencia(g.monto)}</strong>
                    <span
                      className="badge"
                      style={{ background: `${colorEstado(g.estado, g)}22`, color: colorEstado(g.estado, g) }}
                    >
                      {etiquetaEstadoGastoEvidencia(g.estado, g)}
                    </span>
                  </div>
                  <div style={{ marginTop: '0.35rem', fontWeight: 600 }}>{g.descripcion}</div>
                  <div className="muted" style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
                    {[
                      g.fecha,
                      g.usuario_nombre,
                      etiquetaTienda(g.sucursal_id),
                      g.categoria_nombre,
                      g.subcategoria_nombre,
                      g.cuenta === 'garage' ? 'Garage' : g.cuenta === 'abarrotes' ? 'Abarrotes' : 'Virtual',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                  {g.estado === 'rechazado' && g.motivo_rechazo ? (
                    <div style={{ marginTop: '0.35rem', color: '#b45309', fontSize: '0.82rem' }}>
                      Rechazo: {g.motivo_rechazo}
                    </div>
                  ) : null}
                  {g.estado === 'sellado' ? (
                    <div className="muted" style={{ marginTop: '0.35rem', fontSize: '0.78rem' }}>
                      Aprobado por {g.sellado_por || '—'}
                      {g.sellado_at ? ` · ${new Date(g.sellado_at).toLocaleString('es-MX')}` : ''}
                      {g.pago_recibido
                        ? ` · Pago recibido${g.pago_recibido_at ? ` ${new Date(g.pago_recibido_at).toLocaleString('es-MX')}` : ''}`
                        : ' · Esperando pago recibido'}
                    </div>
                  ) : null}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', alignItems: 'stretch' }}>
                  {puedeEditar ? (
                    <>
                      <input
                        ref={(el) => {
                          fileRefs.current[g.id] = el;
                        }}
                        type="file"
                        accept="image/*,application/pdf,.pdf"
                        capture="environment"
                        style={{ display: 'none' }}
                        onChange={(e) => onPickFile(g.id, e.target.files)}
                      />
                      <button
                        type="button"
                        className="btn btn-primary"
                        style={{ fontSize: '0.8rem' }}
                        disabled={guardando || archivos.length >= MAX_ARCHIVOS_POR_GASTO}
                        onClick={() => fileRefs.current[g.id]?.click()}
                      >
                        📷 Evidencia
                      </button>
                      <button type="button" className="btn btn-ghost" style={{ fontSize: '0.78rem' }} onClick={() => borrarGasto(g)}>
                        Eliminar
                      </button>
                    </>
                  ) : null}
                  {puedoAprobarEste ? (
                    <>
                      <button
                        type="button"
                        className="btn btn-success"
                        style={{ fontSize: '0.78rem' }}
                        disabled={guardando}
                        onClick={() => aprobarUno(g)}
                      >
                        Aprobar → IE
                      </button>
                      <button type="button" className="btn btn-ghost" style={{ fontSize: '0.78rem' }} onClick={() => rechazarUno(g)}>
                        Rechazar
                      </button>
                    </>
                  ) : null}
                  {esAmr && vista === 'pagos' && esperaPago ? (
                    <button
                      type="button"
                      className="btn btn-success"
                      style={{ fontSize: '0.78rem' }}
                      disabled={guardando}
                      onClick={() => marcarPago(g, true)}
                    >
                      Pago recibido
                    </button>
                  ) : null}
                  {esAmr && vista === 'pagos' && g.pago_recibido ? (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ fontSize: '0.78rem' }}
                      disabled={guardando}
                      onClick={() => marcarPago(g, false)}
                    >
                      Desmarcar pago
                    </button>
                  ) : null}
                </div>
              </div>

              {archivos.length > 0 ? (
                <div style={{ marginTop: '0.75rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {archivos.map((a) => (
                    <div
                      key={a.id}
                      style={{
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        padding: '0.35rem',
                        background: 'var(--surface)',
                        maxWidth: 140,
                      }}
                    >
                      {a.tipo === 'pdf' || a.mime === 'application/pdf' ? (
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ fontSize: '0.75rem', width: '100%' }}
                          onClick={() => setPreview(a)}
                        >
                          📄 {a.nombre_archivo || 'PDF'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setPreview(a)}
                          style={{ border: 0, background: 'transparent', padding: 0, cursor: 'pointer' }}
                        >
                          <img
                            src={a.contenido}
                            alt={a.nombre_archivo || 'Evidencia'}
                            style={{ width: 120, height: 90, objectFit: 'cover', borderRadius: 6, display: 'block' }}
                          />
                        </button>
                      )}
                      {puedeEditar ? (
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ fontSize: '0.7rem', width: '100%', marginTop: '0.25rem' }}
                          onClick={() => quitarArchivo(g.id, a.id)}
                        >
                          Quitar
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : g.estado === 'pendiente' ? (
                <p className="muted" style={{ margin: '0.55rem 0 0', fontSize: '0.78rem' }}>
                  Sin evidencia aún — usa el botón <strong>Evidencia</strong> para foto, captura o PDF.
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      {preview ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9500,
            background: 'rgba(0,0,0,0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
          onClick={() => setPreview(null)}
        >
          <div
            className="card"
            style={{ maxWidth: 'min(920px, 100%)', maxHeight: '90vh', overflow: 'auto', width: '100%' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <strong>{preview.nombre_archivo || 'Evidencia'}</strong>
              <button type="button" className="btn btn-ghost" onClick={() => setPreview(null)}>
                Cerrar
              </button>
            </div>
            {preview.tipo === 'pdf' || preview.mime === 'application/pdf' ? (
              <iframe title="PDF evidencia" src={preview.contenido} style={{ width: '100%', height: '70vh', border: 0 }} />
            ) : (
              <img src={preview.contenido} alt="" style={{ width: '100%', height: 'auto', borderRadius: 8 }} />
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
