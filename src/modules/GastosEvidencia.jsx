import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import InputPin from '../components/InputPin.jsx';
import { puedeVerModulo, puedeGestionarUsuarios } from '../lib/roles.js';
import { listarCatalogoContVirtual, filtrarCatalogoPorFlujo } from '../lib/contVirtualCatalogo.js';
import { hoyYmdNogales } from '../lib/corteCaja.js';
import { etiquetaTienda, normalizarCodigoTienda } from '../constants/sucursales.js';
import {
  AVISO_FALTA_GASTOS_EVIDENCIA,
  adjuntarEvidenciaGasto,
  eliminarArchivoGastoEvidencia,
  eliminarGastoEvidencia,
  etiquetaEstadoGastoEvidencia,
  fmtMontoGastoEvidencia,
  leerEvidenciaArchivo,
  listarArchivosGastoEvidencia,
  listarGastosEvidencia,
  puedeAprobarGastosEvidenciaAmr,
  rechazarGastoEvidencia,
  registrarGastoEvidencia,
  sellarGastosEvidencia,
  totalPendienteGastos,
  MAX_ARCHIVOS_POR_GASTO,
} from '../lib/gastosEvidencia.js';

const COLOR = '#0f766e';

function colorEstado(estado) {
  if (estado === 'sellado') return '#047857';
  if (estado === 'rechazado') return '#b45309';
  return '#b5a642';
}

export default function GastosEvidencia({ supabase, user, sucursal }) {
  const tieneAcceso = puedeVerModulo(user?.rol, 'Registro de gastos', user?.id);
  const esAprobadorAmr = puedeAprobarGastosEvidenciaAmr(user);
  const esGestor = puedeGestionarUsuarios(user?.rol) || esAprobadorAmr;
  const miId = String(user?.id || '');
  const fileRefs = useRef({});

  const [vista, setVista] = useState(() => (puedeAprobarGastosEvidenciaAmr(user) ? 'pendientes' : 'mios')); // mios | pendientes
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
  const [pinAmr, setPinAmr] = useState('');

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
    const soloMios = vista === 'mios' || !esAprobadorAmr;
    const res = await listarGastosEvidencia(supabase, {
      usuarioId: soloMios ? miId : '',
      soloPendientes: vista === 'pendientes',
      limite: 250,
    });
    setCargando(false);
    if (res.error) setError(res.error);
    if (res.aviso) setAviso(res.aviso);
    setGastos(res.data || []);

    const map = {};
    await Promise.all(
      (res.data || []).slice(0, 80).map(async (g) => {
        const a = await listarArchivosGastoEvidencia(supabase, g.id);
        map[g.id] = a.data || [];
      }),
    );
    setArchivosPorGasto(map);
  }, [supabase, user?.id, miId, vista, esAprobadorAmr, esGestor, tieneAcceso]);

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

  const pendientes = useMemo(() => (gastos || []).filter((g) => g.estado === 'pendiente'), [gastos]);
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
    setMsg('Gasto registrado como pendiente. Adjunta evidencia y espera el sellado.');
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
    if (!String(pinAmr || '').trim()) return alert('Indica tu PIN de AMR para aprobar.');
    if (!confirm(`¿Aprobar ${ids.length} gasto(s) con PIN y mandarlos a IE VIRTUAL?`)) return;
    setGuardando(true);
    const r = await sellarGastosEvidencia(supabase, ids, user, { pin: pinAmr });
    setGuardando(false);
    if (!r.ok && !r.sellados) {
      setError(r.error || 'No se pudo aprobar.');
      return;
    }
    setPinAmr('');
    setMsg(`Aprobados: ${r.sellados}${r.fallidos ? ` · fallidos: ${r.fallidos}` : ''}. Ya aparecen en IE VIRTUAL.`);
    setSel({});
    void cargar();
  };

  const rechazarUno = async (g) => {
    if (!String(pinAmr || '').trim()) return alert('Indica tu PIN de AMR para rechazar.');
    const motivo = prompt('Motivo del rechazo:', 'Falta evidencia o monto incorrecto');
    if (motivo == null) return;
    const r = await rechazarGastoEvidencia(supabase, g.id, user, motivo, { pin: pinAmr });
    if (!r.ok) return alert(r.error);
    setPinAmr('');
    setMsg('Gasto rechazado.');
    void cargar();
  };

  const aprobarUno = async (g) => {
    if (!String(pinAmr || '').trim()) return alert('Indica tu PIN de AMR para aprobar.');
    setGuardando(true);
    const r = await sellarGastosEvidencia(supabase, [g.id], user, { pin: pinAmr });
    setGuardando(false);
    if (!r.ok && !r.sellados) return alert(r.error);
    setPinAmr('');
    setMsg('Gasto aprobado → IE VIRTUAL.');
    void cargar();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <h2 style={{ margin: 0, color: COLOR }}>Registro de gastos</h2>
        <p className="muted" style={{ margin: '0.35rem 0 0' }}>
          Cada empleado registra sus gastos con foto, captura o PDF. Quedan <strong>pendientes</strong> hasta que{' '}
          <strong>AMR</strong> los apruebe con <strong>PIN</strong> desde su espacio y pasen a{' '}
          <strong>IE VIRTUAL</strong>.
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
          <div className="muted" style={{ fontSize: '0.72rem' }}>PENDIENTES</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800 }}>{pendientes.length}</div>
        </div>
        <div className="card" style={{ padding: '0.75rem', borderTop: '3px solid #b5a642' }}>
          <div className="muted" style={{ fontSize: '0.72rem' }}>MONTO PENDIENTE</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#b5a642' }}>{fmtMontoGastoEvidencia(totalPend)}</div>
        </div>
        <div className="card" style={{ padding: '0.75rem' }}>
          <div className="muted" style={{ fontSize: '0.72rem' }}>MI ESPACIO</div>
          <div style={{ fontWeight: 700 }}>{user?.nombre || '—'}</div>
        </div>
      </div>

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
              className="select"
              style={{ marginTop: '0.3rem' }}
              value={form.categoria_id}
              onChange={(e) => setForm({ ...form, categoria_id: e.target.value })}
            >
              {catsEgreso.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="muted">
            Subcategoría
            <select
              className="select"
              style={{ marginTop: '0.3rem' }}
              value={form.subcategoria_id}
              onChange={(e) => setForm({ ...form, subcategoria_id: e.target.value })}
            >
              {subs.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
              {!subs.length ? <option value="">—</option> : null}
            </select>
          </label>
          <label className="muted">
            Cuenta IE
            <select
              className="select"
              style={{ marginTop: '0.3rem' }}
              value={form.cuenta}
              onChange={(e) => setForm({ ...form, cuenta: e.target.value })}
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

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem', alignItems: 'center' }}>
        <button
          type="button"
          className={vista === 'mios' ? 'btn btn-primary' : 'btn btn-ghost'}
          onClick={() => setVista('mios')}
        >
          Mis gastos
        </button>
        {esAprobadorAmr ? (
          <button
            type="button"
            className={vista === 'pendientes' ? 'btn btn-primary' : 'btn btn-ghost'}
            onClick={() => setVista('pendientes')}
          >
            Por aprobar (todos)
          </button>
        ) : null}
      </div>

      {esAprobadorAmr ? (
        <div className="card" style={{ borderTop: '4px solid #0f766e', background: '#f0fdfa' }}>
          <h3 style={{ margin: '0 0 0.35rem', color: COLOR }}>Aprobación AMR</h3>
          <p className="muted" style={{ margin: '0 0 0.75rem', fontSize: '0.85rem' }}>
            Desde tu espacio: revisa evidencia, ingresa tu PIN y aprueba o rechaza. Al aprobar, el gasto pasa a IE
            VIRTUAL.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.65rem', alignItems: 'flex-end' }}>
            <label className="muted" style={{ minWidth: 160, flex: '1 1 160px' }}>
              PIN de AMR
              <InputPin
                value={pinAmr}
                onChange={(e) => setPinAmr(e.target.value)}
                placeholder="••••"
                style={{ marginTop: '0.3rem' }}
              />
            </label>
            {pendientes.length > 0 ? (
              <button type="button" className="btn btn-success" onClick={sellarSel} disabled={guardando || !pinAmr.trim()}>
                {guardando ? 'Aprobando…' : `Aprobar ${idsSel.length ? `(${idsSel.length})` : 'pendientes'} → IE`}
              </button>
            ) : (
              <span className="muted" style={{ fontSize: '0.85rem' }}>
                No hay pendientes en esta vista.
              </span>
            )}
          </div>
        </div>
      ) : null}

      {!gastos.length && !cargando ? (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            Aún no hay gastos en esta vista. Registra el primero arriba.
          </p>
        </div>
      ) : null}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
        {gastos.map((g) => {
          const archivos = archivosPorGasto[g.id] || [];
          const mios = String(g.usuario_id) === miId;
          const puedeEditar = g.estado === 'pendiente' && (mios || esAprobadorAmr);
          return (
            <div
              key={g.id}
              className="card"
              style={{
                padding: '0.85rem',
                borderLeft: `4px solid ${colorEstado(g.estado)}`,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    {esAprobadorAmr && g.estado === 'pendiente' ? (
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
                      style={{ background: `${colorEstado(g.estado)}22`, color: colorEstado(g.estado) }}
                    >
                      {etiquetaEstadoGastoEvidencia(g.estado)}
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
                      Sellado por {g.sellado_por || '—'}
                      {g.sellado_at ? ` · ${new Date(g.sellado_at).toLocaleString('es-MX')}` : ''}
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
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ fontSize: '0.78rem' }}
                        onClick={() => borrarGasto(g)}
                      >
                        Eliminar
                      </button>
                    </>
                  ) : null}
                  {esAprobadorAmr && g.estado === 'pendiente' ? (
                    <>
                      <button
                        type="button"
                        className="btn btn-success"
                        style={{ fontSize: '0.78rem' }}
                        disabled={guardando || !pinAmr.trim()}
                        onClick={() => aprobarUno(g)}
                      >
                        Aprobar → IE
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ fontSize: '0.78rem' }}
                        disabled={!pinAmr.trim()}
                        onClick={() => rechazarUno(g)}
                      >
                        Rechazar
                      </button>
                    </>
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
                        <button type="button" onClick={() => setPreview(a)} style={{ border: 0, background: 'transparent', padding: 0, cursor: 'pointer' }}>
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
            style={{ maxWidth: 'min(920px, 100%)', maxHeight: '90vh', overflow: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <strong>{preview.nombre_archivo || 'Evidencia'}</strong>
              <button type="button" className="btn btn-ghost" onClick={() => setPreview(null)}>
                Cerrar
              </button>
            </div>
            {preview.tipo === 'pdf' || preview.mime === 'application/pdf' ? (
              <iframe title="PDF evidencia" src={preview.contenido} style={{ width: '100%', height: '70vh', border: 0 }} />
            ) : (
              <img src={preview.contenido} alt="" style={{ maxWidth: '100%', borderRadius: 8 }} />
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
