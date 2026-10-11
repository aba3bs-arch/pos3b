import React, { useCallback, useEffect, useMemo, useState } from 'react';
import CampoCodigo from '../components/CampoCodigo.jsx';
import {
  construirLineasAuditoriaCamion,
  guardarAuditoriaCamionLocal,
  lineasAuditoriaPorDepartamento,
  listarAuditoriasCamionLocal,
  progresoDepartamentosAuditoria,
  resolverCamionDeRecolector,
  resumirAuditoriaCamion,
} from '../lib/auditoriaCamionRuta.js';
import {
  inventarioCamionDesdeLineas,
  lineasDeVariasCargas,
  listarCargasRuta,
  listarRecolectoresCargaRuta,
} from '../lib/ventaEnRuta.js';
import {
  etiquetaCamion,
  listarCamionesRuta,
} from '../lib/rutaCamiones.js';
import { etiquetaDepartamento } from '../lib/departamentos.js';
import { fmtMonto } from '../lib/consultasUi.js';
import { buscarProductoInventario } from '../lib/comprasRecepcion.js';
import './VentaEnRuta.css';

/**
 * Venta en Ruta → Inv-op / Auditorías.
 * 1) Seleccionar recolector → 2) inventariar por departamento → 3) cerrar.
 * No modifica inventario.
 */
export default function AuditoriaCamionRuta({
  supabase,
  user,
  inventario = [],
  productoPorId,
  setAviso,
  onVolver,
}) {
  const [paso, setPaso] = useState('recolector'); // recolector | deptos | conteo
  const [recolectores, setRecolectores] = useState([]);
  const [camiones, setCamiones] = useState([]);
  const [recolectorId, setRecolectorId] = useState('');
  const [camionId, setCamionId] = useState('');
  const [cargas, setCargas] = useState([]);
  const [lineasCarga, setLineasCarga] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [cargandoLista, setCargandoLista] = useState(true);
  const [conteos, setConteos] = useState({});
  const [codigo, setCodigo] = useState('');
  const [historial, setHistorial] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [soloFaltantes, setSoloFaltantes] = useState(false);
  const [deptoActivo, setDeptoActivo] = useState('');
  const [flashId, setFlashId] = useState('');

  const cargarListas = useCallback(async () => {
    setCargandoLista(true);
    try {
      const [rCam, rRec] = await Promise.all([
        listarCamionesRuta(supabase, { soloActivos: true }),
        listarRecolectoresCargaRuta(supabase),
      ]);
      if (rCam.aviso) setAviso?.(rCam.aviso);
      if (rCam.error) setAviso?.(rCam.error);
      if (rRec.error) setAviso?.(rRec.error);
      setCamiones(rCam.data || []);
      setRecolectores(rRec.data || []);
    } finally {
      setCargandoLista(false);
    }
  }, [supabase, setAviso]);

  useEffect(() => {
    void cargarListas();
  }, [cargarListas]);

  const recolectorSel = useMemo(
    () => recolectores.find((r) => String(r.id) === String(recolectorId)) || null,
    [recolectores, recolectorId],
  );

  const camionResuelto = useMemo(
    () => resolverCamionDeRecolector(camiones, recolectorSel),
    [camiones, recolectorSel],
  );

  useEffect(() => {
    setCamionId(camionResuelto?.id ? String(camionResuelto.id) : '');
  }, [camionResuelto]);

  const refrescarCargas = useCallback(async () => {
    setCargando(true);
    try {
      if (!camionId) {
        setCargas([]);
        setLineasCarga([]);
        return;
      }
      const r = await listarCargasRuta(supabase, {
        estado: 'en_ruta',
        camionId,
        limit: 80,
      });
      if (r.aviso) setAviso?.(r.aviso);
      if (r.error) setAviso?.(r.error);
      const lista = r.data || [];
      setCargas(lista);
      if (!lista.length) {
        setLineasCarga([]);
        return;
      }
      const lin = await lineasDeVariasCargas(supabase, lista);
      if (lin.aviso) setAviso?.(lin.aviso);
      if (lin.error) setAviso?.(lin.error);
      setLineasCarga(lin.data || []);
    } finally {
      setCargando(false);
    }
  }, [supabase, camionId, setAviso]);

  useEffect(() => {
    void refrescarCargas();
  }, [refrescarCargas]);

  useEffect(() => {
    setConteos({});
    setDeptoActivo('');
    setPaso(recolectorId && camionId ? 'deptos' : 'recolector');
    const h = listarAuditoriasCamionLocal({ camionId: camionId || undefined, limit: 8 });
    setHistorial(h.data || []);
  }, [camionId, recolectorId]);

  const inventarioCamion = useMemo(
    () => inventarioCamionDesdeLineas(lineasCarga, { productoPorId, inventario }),
    [lineasCarga, productoPorId, inventario],
  );

  const lineas = useMemo(
    () => construirLineasAuditoriaCamion(inventarioCamion, conteos),
    [inventarioCamion, conteos],
  );

  const resumen = useMemo(() => resumirAuditoriaCamion(lineas), [lineas]);
  const progresoDeptos = useMemo(() => progresoDepartamentosAuditoria(lineas), [lineas]);

  const lineasDepto = useMemo(() => {
    const base = lineasAuditoriaPorDepartamento(lineas, deptoActivo);
    if (!soloFaltantes) return base;
    return base.filter((l) => (Number(l.faltante) || 0) > 0 || (l.contado != null && (Number(l.diferencia) || 0) < 0));
  }, [lineas, deptoActivo, soloFaltantes]);

  const progresoDeptoActivo = useMemo(
    () => progresoDeptos.find((d) => d.departamento === deptoActivo) || null,
    [progresoDeptos, deptoActivo],
  );

  const camionSel = camiones.find((c) => String(c.id) === String(camionId));

  const setContado = (id, valor) => {
    setConteos((prev) => ({ ...prev, [id]: valor }));
  };

  const ajustarContado = (id, delta) => {
    setConteos((prev) => {
      const actual = prev[id];
      const base = actual === null || actual === undefined || String(actual).trim() === ''
        ? 0
        : Math.max(0, Math.floor(Number(actual) || 0));
      return { ...prev, [id]: String(Math.max(0, base + delta)) };
    });
    setFlashId(String(id));
    window.setTimeout(() => setFlashId((cur) => (cur === String(id) ? '' : cur)), 420);
  };

  const registrarEscaneo = (raw) => {
    const code = String(raw || codigo || '').trim();
    if (!code) return;
    const rCamion = buscarProductoInventario(inventarioCamion, code);
    const hit = rCamion?.producto
      || buscarProductoInventario(inventario, code)?.producto
      || inventarioCamion.find((p) => String(p.id) === code);
    if (!hit || !inventarioCamion.some((p) => String(p.id) === String(hit.id))) {
      setAviso?.(`No está en el camión: ${code}`);
      setCodigo('');
      return;
    }
    const id = String(hit.id);
    const cat = String(hit.cat || 'GENERAL').toUpperCase();
    if (paso !== 'conteo' || deptoActivo !== cat) {
      setDeptoActivo(cat);
      setPaso('conteo');
    }
    ajustarContado(id, 1);
    setCodigo('');
  };

  const elegirRecolector = (id) => {
    setRecolectorId(String(id || ''));
  };

  const entrarDepto = (dept) => {
    setDeptoActivo(dept);
    setSoloFaltantes(false);
    setPaso('conteo');
  };

  const cerrarAuditoria = async () => {
    if (!camionId) return alert('Selecciona un recolector con camión asignado.');
    if (!resumen.contados) return alert('Captura al menos un conteo.');
    const nombreRec = recolectorSel?.nombre || '—';
    if (!confirm(
      `¿Cerrar auditoría de ${etiquetaCamion(camionSel)}?\n`
      + `Recolector: ${nombreRec}\n\n`
      + `Faltantes: ${resumen.piezasFaltantes} pza\n`
      + `Pérdida a costo: ${fmtMonto(resumen.perdidaCosto)}\n`
      + `Pérdida a precio público: ${fmtMonto(resumen.perdidaPublico)}\n\n`
      + 'No modifica el inventario del camión.',
    )) return;
    setGuardando(true);
    const r = guardarAuditoriaCamionLocal({
      camion_id: camionId,
      camion_etiqueta: etiquetaCamion(camionSel),
      recolector_id: recolectorSel?.repartidor_id || recolectorSel?.id || null,
      recolector_nombre: nombreRec,
      usuario_nombre: user?.nombre || null,
      usuario_id: user?.id || null,
      cargas: cargas.map((c) => ({ id: c.id, folio: c.folio })),
      resumen,
      progreso_deptos: progresoDeptos,
      lineas: lineas.filter((l) => l.contado != null || (Number(l.faltante) || 0) > 0),
    });
    setGuardando(false);
    if (!r.ok) return alert(r.error || 'No se pudo guardar.');
    setAviso?.(`Auditoría guardada · faltante ${resumen.piezasFaltantes} pza · público ${fmtMonto(resumen.perdidaPublico)}`);
    setHistorial(listarAuditoriasCamionLocal({ camionId, limit: 8 }).data || []);
    setPaso('deptos');
  };

  const deptosCompletos = progresoDeptos.filter((d) => d.completo).length;

  return (
    <div className="ruta-invop">
      <header className="ruta-invop-hero">
        <div className="ruta-invop-hero-text">
          <p className="ruta-invop-kicker">Inv-op · Venta en ruta</p>
          <h3>Inventario operativo por departamento</h3>
          <p className="ruta-invop-lead">
            Elige el recolector, abre un departamento y cuenta en el celular.
            No modifica el stock del camión.
          </p>
        </div>
        {onVolver && (
          <button type="button" className="btn btn-ghost ruta-invop-volver" onClick={onVolver}>
            Volver
          </button>
        )}
      </header>

      <nav className="ruta-invop-steps" aria-label="Pasos">
        <button
          type="button"
          className={`ruta-invop-step${paso === 'recolector' ? ' activo' : ''}${recolectorId ? ' hecho' : ''}`}
          onClick={() => setPaso('recolector')}
        >
          <span className="ruta-invop-step-n">1</span>
          Recolector
        </button>
        <button
          type="button"
          className={`ruta-invop-step${paso === 'deptos' ? ' activo' : ''}${deptosCompletos > 0 ? ' hecho' : ''}`}
          onClick={() => recolectorId && camionId && setPaso('deptos')}
          disabled={!recolectorId || !camionId}
        >
          <span className="ruta-invop-step-n">2</span>
          Departamentos
        </button>
        <button
          type="button"
          className={`ruta-invop-step${paso === 'conteo' ? ' activo' : ''}`}
          onClick={() => deptoActivo && setPaso('conteo')}
          disabled={!deptoActivo}
        >
          <span className="ruta-invop-step-n">3</span>
          Conteo
        </button>
      </nav>

      {paso === 'recolector' && (
        <section className="ruta-invop-panel ruta-invop-panel--in">
          <div className="ruta-invop-panel-head">
            <h4>Selecciona el recolector</h4>
            <button type="button" className="btn btn-ghost" onClick={() => void cargarListas()} disabled={cargandoLista}>
              Actualizar
            </button>
          </div>
          {cargandoLista ? (
            <p className="muted">Cargando recolectores…</p>
          ) : recolectores.length === 0 ? (
            <p className="muted">
              No hay recolectores en Panel RT. Agrégalos en Contabilidad → Panel RT → Recolectores.
            </p>
          ) : (
            <div className="ruta-invop-rec-grid">
              {recolectores.map((r) => {
                const cam = resolverCamionDeRecolector(camiones, r);
                const activo = String(r.id) === String(recolectorId);
                return (
                  <button
                    key={r.id}
                    type="button"
                    className={`ruta-invop-rec-card${activo ? ' activo' : ''}${cam ? '' : ' sin-camion'}`}
                    onClick={() => elegirRecolector(r.id)}
                  >
                    <span className="ruta-invop-rec-name">{r.nombre}</span>
                    <span className="ruta-invop-rec-meta">
                      {cam
                        ? `Camión ${etiquetaCamion(cam)}`
                        : 'Sin camión asignado'}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {recolectorSel && (
            <div className="ruta-invop-rec-footer">
              {!camionResuelto ? (
                <p className="ruta-invop-warn">
                  {recolectorSel.nombre} no tiene camión activo. Asígnalo en Camiones.
                </p>
              ) : (
                <>
                  <p className="muted">
                    {recolectorSel.nombre} · {etiquetaCamion(camionResuelto)}
                    {cargando ? ' · cargando mercancía…' : cargas.length
                      ? ` · ${cargas.length} carga(s) · ${inventarioCamion.length} producto(s)`
                      : ' · sin cargas en ruta'}
                  </p>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={!camionResuelto || cargando || !cargas.length}
                    onClick={() => setPaso('deptos')}
                  >
                    Continuar a departamentos
                  </button>
                </>
              )}
            </div>
          )}
        </section>
      )}

      {paso === 'deptos' && camionId && (
        <section className="ruta-invop-panel ruta-invop-panel--in">
          <div className="ruta-invop-panel-head">
            <div>
              <h4>Departamentos del camión</h4>
              <p className="muted ruta-invop-sub">
                {recolectorSel?.nombre || '—'} · {etiquetaCamion(camionSel)}
              </p>
            </div>
            <button type="button" className="btn btn-ghost" onClick={() => void refrescarCargas()} disabled={cargando}>
              Actualizar
            </button>
          </div>

          {cargando ? (
            <p className="muted">Cargando inventario del camión…</p>
          ) : !cargas.length ? (
            <p className="muted">Sin cargas en ruta para este recolector.</p>
          ) : (
            <>
              <div className="ruta-invop-kpi-row">
                <div className="ruta-invop-kpi">
                  <span>Avance</span>
                  <strong>{resumen.contados}/{resumen.productos}</strong>
                </div>
                <div className="ruta-invop-kpi">
                  <span>Deptos listos</span>
                  <strong>{deptosCompletos}/{progresoDeptos.length}</strong>
                </div>
                <div className={`ruta-invop-kpi${resumen.piezasFaltantes ? ' alerta' : ''}`}>
                  <span>Faltantes</span>
                  <strong>{resumen.piezasFaltantes}</strong>
                </div>
                <div className={`ruta-invop-kpi${resumen.perdidaPublico ? ' alerta' : ''}`}>
                  <span>$ público</span>
                  <strong>{fmtMonto(resumen.perdidaPublico)}</strong>
                </div>
              </div>

              <div className="ruta-invop-depto-grid">
                {progresoDeptos.map((d) => (
                  <button
                    key={d.departamento}
                    type="button"
                    className={`ruta-invop-depto-card${d.completo ? ' completo' : ''}${d.contados > 0 && !d.completo ? ' parcial' : ''}`}
                    onClick={() => entrarDepto(d.departamento)}
                  >
                    <div className="ruta-invop-depto-top">
                      <strong>{d.etiqueta}</strong>
                      <span className="ruta-invop-depto-pct">{d.pct}%</span>
                    </div>
                    <div className="ruta-invop-depto-bar" aria-hidden>
                      <i style={{ width: `${d.pct}%` }} />
                    </div>
                    <div className="ruta-invop-depto-meta">
                      <span>{d.contados}/{d.productos} prod.</span>
                      <span>{d.piezasTeoricas} pza teor.</span>
                      {d.piezasFaltantes > 0 && (
                        <span className="ruta-invop-falt">{d.piezasFaltantes} falt.</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>

              <div className="ruta-invop-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setPaso('recolector')}>
                  Cambiar recolector
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={guardando || !resumen.contados}
                  onClick={() => void cerrarAuditoria()}
                >
                  {guardando ? 'Guardando…' : 'Cerrar auditoría'}
                </button>
              </div>
            </>
          )}
        </section>
      )}

      {paso === 'conteo' && deptoActivo && (
        <section className="ruta-invop-panel ruta-invop-panel--in ruta-invop-conteo">
          <div className="ruta-invop-conteo-head sticky">
            <button type="button" className="btn btn-ghost" onClick={() => setPaso('deptos')}>
              ← Deptos
            </button>
            <div className="ruta-invop-conteo-title">
              <h4>{etiquetaDepartamento(deptoActivo)}</h4>
              <p className="muted">
                {progresoDeptoActivo
                  ? `${progresoDeptoActivo.contados}/${progresoDeptoActivo.productos} · ${progresoDeptoActivo.pct}%`
                  : '—'}
              </p>
            </div>
            <label className="ruta-invop-check">
              <input type="checkbox" checked={soloFaltantes} onChange={(e) => setSoloFaltantes(e.target.checked)} />
              Faltantes
            </label>
          </div>

          <div className="ruta-invop-scan">
            <CampoCodigo
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              onEscanear={registrarEscaneo}
              beepAlEnter
              placeholder="Escanear o escribir código…"
              tituloCamara={`Auditar · ${etiquetaDepartamento(deptoActivo)}`}
            />
          </div>

          <div className="ruta-invop-prod-list">
            {lineasDepto.length === 0 ? (
              <p className="muted" style={{ padding: '0.75rem' }}>
                {soloFaltantes ? 'Sin faltantes en este departamento.' : 'Sin productos en este departamento.'}
              </p>
            ) : lineasDepto.map((l) => {
              const estado = l.contado == null
                ? 'pendiente'
                : l.faltante > 0
                  ? 'faltante'
                  : l.sobrante > 0
                    ? 'sobrante'
                    : 'ok';
              return (
                <article
                  key={l.id}
                  className={`ruta-invop-prod${flashId === String(l.id) ? ' flash' : ''} estado-${estado}`}
                >
                  <div className="ruta-invop-prod-info">
                    <strong>{l.nombre}</strong>
                    <span className="ruta-invop-sku">{l.id}</span>
                    <div className="ruta-invop-prod-nums">
                      <span>Teórico <b>{l.teorico}</b></span>
                      {l.contado != null && (
                        <span className={l.faltante > 0 ? 'falt' : ''}>
                          {l.faltante > 0 ? `Falt. ${l.faltante}` : l.sobrante > 0 ? `Sobra ${l.sobrante}` : 'OK'}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="ruta-invop-stepper">
                    <button type="button" aria-label="Menos" onClick={() => ajustarContado(l.id, -1)}>−</button>
                    <input
                      className="input"
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={conteos[l.id] ?? ''}
                      onChange={(e) => setContado(l.id, e.target.value)}
                      placeholder="0"
                    />
                    <button type="button" aria-label="Más" onClick={() => ajustarContado(l.id, 1)}>+</button>
                  </div>
                  {l.contado != null && l.faltante > 0 && (
                    <div className="ruta-invop-prod-loss">
                      Costo {fmtMonto(l.perdidaCosto)} · Público {fmtMonto(l.perdidaPublico)}
                    </div>
                  )}
                </article>
              );
            })}
          </div>

          <footer className="ruta-invop-conteo-bar">
            <div>
              <span className="muted">Faltantes depto</span>
              <strong>{progresoDeptoActivo?.piezasFaltantes ?? 0}</strong>
            </div>
            <button type="button" className="btn btn-primary" onClick={() => setPaso('deptos')}>
              Listo · otro depto
            </button>
          </footer>
        </section>
      )}

      {historial.length > 0 && paso !== 'conteo' && (
        <section className="ruta-invop-panel">
          <h4 style={{ margin: '0 0 0.5rem' }}>Últimas auditorías (este dispositivo)</h4>
          <div className="ruta-invop-hist">
            {historial.map((a) => (
              <div key={a.id} className="ruta-invop-hist-row">
                <div>
                  <strong>{a.recolector_nombre || a.camion_etiqueta || '—'}</strong>
                  <span className="muted">
                    {String(a.created_at || '').slice(0, 16).replace('T', ' ')}
                    {a.camion_etiqueta ? ` · ${a.camion_etiqueta}` : ''}
                  </span>
                </div>
                <div className="ruta-invop-hist-nums">
                  <span className="falt">{a.resumen?.piezasFaltantes ?? 0} pza</span>
                  <span>{fmtMonto(a.resumen?.perdidaPublico)}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
