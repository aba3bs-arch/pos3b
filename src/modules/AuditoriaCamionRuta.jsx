import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CampoCodigo from '../components/CampoCodigo.jsx';
import ConteoLibreRuta from '../components/ConteoLibreRuta.jsx';
import Icon from '../components/Icon.jsx';
import {
  armarCierreAuditoria,
  borrarBorradorAuditoria,
  construirLineasAuditoriaCamion,
  folioAuditoriaRuta,
  guardarAuditoriaCamionLocal,
  guardarBorradorAuditoria,
  leerBorradorAuditoria,
  listarBorradoresAuditoria,
  lineasAuditoriaPorDepartamento,
  listarAuditoriasCamionLocal,
  progresoDepartamentosAuditoria,
  resolverCamionDeRecolector,
  resumirDepartamentoAuditoria,
  resumirValorCamion,
  siguienteIndicePendiente,
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
import { imprimirAuditoriaRuta } from '../lib/impresion.js';
import './VentaEnRuta.css';

const cajaKpi = {
  padding: '0.65rem',
  borderRadius: 10,
  background: 'var(--surface)',
  border: '1px solid var(--border)',
};
const etiquetaKpi = { fontSize: '0.68rem', textTransform: 'uppercase' };

function Kpi({ titulo, valor, extra, tono }) {
  const color = tono === 'mal' ? 'var(--brand-red)' : tono === 'bien' ? 'var(--brand-green)' : tono === 'aviso' ? 'var(--brand-gold-dark)' : undefined;
  const fondo = tono === 'mal' ? 'rgba(220,53,69,0.06)' : tono === 'aviso' ? 'rgba(225,153,41,0.08)' : undefined;
  return (
    <div style={{ ...cajaKpi, ...(fondo ? { background: fondo } : {}) }}>
      <div className="muted" style={etiquetaKpi}>{titulo}</div>
      <div style={{ fontWeight: 700, color }}>{valor}</div>
      {extra ? <div className="muted" style={{ fontSize: '0.75rem', color }}>{extra}</div> : null}
    </div>
  );
}

function KpisResumen({ r }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.65rem' }}>
      <Kpi titulo="Artículos" valor={r.productos ?? r.contados} extra={r.pendientes != null ? `${r.pendientes} pendientes` : undefined} />
      <Kpi
        titulo="Piezas contadas"
        valor={r.piezasContadas ?? '—'}
        extra={r.piezasTeoricas != null ? `Teórico: ${r.piezasTeoricas}` : undefined}
      />
      <Kpi
        titulo="Faltante"
        valor={`${r.piezasFaltantes} pzs`}
        extra={`Costo ${fmtMonto(r.perdidaCosto)} · Público ${fmtMonto(r.perdidaPublico)}`}
        tono={r.piezasFaltantes ? 'mal' : undefined}
      />
      <Kpi titulo="Sobrante" valor={`${r.piezasSobrantes} pzs`} tono={r.piezasSobrantes ? 'aviso' : undefined} />
      {r.cuadran != null && <Kpi titulo="Cuadran" valor={`${r.cuadran} SKU`} tono="bien" />}
    </div>
  );
}

function textoDiferencia(l) {
  if (l.contado == null) return '—';
  if (l.diferencia === 0) return 'Cuadra';
  return l.diferencia > 0 ? `+${l.diferencia} sobrante` : `${l.diferencia} faltante`;
}

function colorDiferencia(l) {
  if (l.contado == null) return 'inherit';
  if (l.diferencia === 0) return 'var(--brand-green)';
  return l.diferencia > 0 ? 'var(--brand-gold-dark)' : 'var(--brand-red)';
}

function fmtFechaHora(iso) {
  try {
    return new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return String(iso || '').slice(0, 16).replace('T', ' ');
  }
}

/** Valor del inventario del camión: referencia para el inventario operativo. */
function ValorCamion({ valor, camion, recolector, cargas }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <section
      className="card"
      style={{ borderTop: '4px solid var(--brand-gold)', padding: '0.85rem' }}
      aria-label="Valor del inventario del camión"
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'baseline' }}>
        <strong style={{ color: 'var(--brand-blue)' }}>Valor del inventario · {camion}</strong>
        <span className="muted" style={{ fontSize: '0.78rem' }}>
          {recolector ? `${recolector} · ` : ''}{cargas} carga(s) en ruta
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '0.6rem', marginTop: '0.6rem' }}>
        <Kpi titulo="A precio público" valor={fmtMonto(valor.valorPublico)} extra={`${valor.piezas} pza · ${valor.productos} prod.`} />
        <Kpi titulo="A precio ruta" valor={fmtMonto(valor.valorRuta)} />
        <Kpi titulo="A costo" valor={fmtMonto(valor.valorCosto)} extra={valor.sinCosto ? `${valor.sinCosto} sin costo` : undefined} tono={valor.sinCosto ? 'aviso' : undefined} />
        <Kpi titulo="Margen potencial" valor={fmtMonto(valor.margenPotencial)} tono="bien" />
      </div>
      {valor.deptos.length > 0 && (
        <>
          <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: '0.55rem' }} onClick={() => setAbierto((v) => !v)}>
            {abierto ? 'Ocultar departamentos' : 'Ver por departamento'}
          </button>
          {abierto && (
            <div className="table-wrap" style={{ marginTop: '0.5rem' }}>
              <table className="data">
                <thead>
                  <tr>
                    <th>Departamento</th>
                    <th>Pzas</th>
                    <th>Público</th>
                    <th>Ruta</th>
                    <th>Costo</th>
                  </tr>
                </thead>
                <tbody>
                  {valor.deptos.map((d) => (
                    <tr key={d.departamento}>
                      <td>{d.etiqueta}</td>
                      <td>{d.piezas}</td>
                      <td>{fmtMonto(d.valorPublico)}</td>
                      <td>{fmtMonto(d.valorRuta)}</td>
                      <td>{fmtMonto(d.valorCosto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}

/** Ticket con el resultado del inventario (pantalla + impresión). */
function TicketResultado({ registro, onImprimir, onCerrar, cerrarLabel }) {
  const r = registro.resumen || {};
  const difs = (registro.lineas || []).filter((l) => l.contado != null && l.diferencia !== 0);
  return (
    <div className="card" style={{ borderTop: '4px solid var(--brand-green)' }}>
      <h4 style={{ margin: '0 0 0.35rem', color: 'var(--brand-green)' }}>Inventario cerrado</h4>
      <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--brand-blue)', fontFamily: 'ui-monospace, monospace' }}>
        {registro.folio || '—'}
      </div>
      <p className="muted" style={{ margin: '0.35rem 0 0.75rem', fontSize: '0.88rem' }}>
        {registro.recolector_nombre || '—'} · {registro.camion_etiqueta || '—'} · {fmtFechaHora(registro.created_at)}
        {registro.usuario_nombre ? ` · ${registro.usuario_nombre}` : ''}
      </p>

      {registro.modo === 'libre' && <p className="muted" style={{ margin: '0 0 0.5rem' }}>Inventario libre</p>}
      {registro.valor_camion && (
        <div style={{ ...cajaKpi, marginBottom: '0.75rem', background: 'rgba(212,175,55,0.08)' }}>
          <div className="muted" style={etiquetaKpi}>Valor del inventario del camión (referencia)</div>
          <div style={{ fontWeight: 800, fontSize: '1.15rem', color: 'var(--brand-blue)' }}>
            {fmtMonto(registro.valor_camion.valorPublico)} <span className="muted" style={{ fontSize: '0.78rem', fontWeight: 500 }}>a precio público</span>
          </div>
          <div className="muted" style={{ fontSize: '0.8rem' }}>
            Ruta {fmtMonto(registro.valor_camion.valorRuta)} · Costo {fmtMonto(registro.valor_camion.valorCosto)} · {registro.valor_camion.piezas} pza
          </div>
          {registro.valor_camion.valorPublico > 0 && (
            <div style={{ fontSize: '0.85rem', marginTop: '0.35rem' }}>
              Inventariado: <strong>{Math.round(((r.valorTeoricoPublico || 0) / registro.valor_camion.valorPublico) * 1000) / 10}%</strong> del camión
              {' · '}
              Pérdida: <strong style={{ color: r.perdidaPublico ? 'var(--brand-red)' : undefined }}>
                {Math.round(((r.perdidaPublico || 0) / registro.valor_camion.valorPublico) * 1000) / 10}%
              </strong>
            </div>
          )}
        </div>
      )}

      <KpisResumen r={r} />

      <h5 style={{ margin: '0.9rem 0 0.4rem' }}>Departamentos {registro.modo === 'libre' ? 'contados' : 'cerrados'}</h5>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Departamento</th>
              <th>Prod.</th>
              <th>Faltante</th>
              <th>Sobrante</th>
              <th>$ Costo</th>
              <th>$ Público</th>
            </tr>
          </thead>
          <tbody>
            {(registro.deptos || registro.progreso_deptos || []).map((d) => (
              <tr key={d.departamento}>
                <td>{d.etiqueta}</td>
                <td>{d.productos}</td>
                <td style={{ color: d.piezasFaltantes ? 'var(--brand-red)' : undefined, fontWeight: 600 }}>{d.piezasFaltantes} pzs</td>
                <td>{d.piezasSobrantes ?? 0} pzs</td>
                <td>{fmtMonto(d.perdidaCosto)}</td>
                <td>{fmtMonto(d.perdidaPublico)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h5 style={{ margin: '0.9rem 0 0.4rem' }}>Diferencias</h5>
      {difs.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>Sin diferencias: todo cuadra.</p>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Teórico</th>
                <th>Contado</th>
                <th>Diferencia</th>
              </tr>
            </thead>
            <tbody>
              {difs.map((l) => (
                <tr key={l.id}>
                  <td>{l.nombre}</td>
                  <td>{l.teorico}</td>
                  <td>{l.contado}</td>
                  <td style={{ fontWeight: 600, color: colorDiferencia(l) }}>{textoDiferencia(l)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.85rem', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-primary" onClick={() => onImprimir(registro)}>
          Imprimir ticket
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCerrar}>
          {cerrarLabel}
        </button>
      </div>
    </div>
  );
}

/**
 * Venta en Ruta → Inv-op / Auditorías.
 * Igual que el conteo físico de sucursales, pero independiente (no toca stock):
 * 1) recolector → 2) departamentos → 3) conteo artículo por artículo
 * → 4) cerrar cada departamento → 5) ticket con el resultado + historial.
 */
export default function AuditoriaCamionRuta({
  supabase,
  user,
  inventario = [],
  productoPorId,
  setAviso,
  onVolver,
}) {
  const [paso, setPaso] = useState('recolector'); // recolector | deptos | conteo | ticket
  const [recolectores, setRecolectores] = useState([]);
  const [camiones, setCamiones] = useState([]);
  const [recolectorId, setRecolectorId] = useState('');
  const [camionId, setCamionId] = useState('');
  const [cargas, setCargas] = useState([]);
  const [lineasCarga, setLineasCarga] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [cargandoLista, setCargandoLista] = useState(true);
  const [conteos, setConteos] = useState({});
  const [cerrados, setCerrados] = useState({});
  const [deptosSel, setDeptosSel] = useState([]);
  const [qDepto, setQDepto] = useState('');
  const [deptoActivo, setDeptoActivo] = useState('');
  const [indice, setIndice] = useState(0);
  const [mostrarResumen, setMostrarResumen] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [historial, setHistorial] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [ticket, setTicket] = useState(null);
  const [libreIds, setLibreIds] = useState([]);
  const [tickBorr, setTickBorr] = useState(0);
  const rootRef = useRef(null);
  const [borradorCamion, setBorradorCamion] = useState('');
  const contadaRef = useRef(null);

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

  const refrescarHistorial = useCallback(() => {
    setHistorial(listarAuditoriasCamionLocal({ limit: 15 }).data || []);
  }, []);

  useEffect(() => {
    setTicket(null);
    setDeptoActivo('');
    setIndice(0);
    setMostrarResumen(false);
    const draft = recolectorId && camionId ? leerBorradorAuditoria(camionId) : null;
    setConteos(draft?.conteos && typeof draft.conteos === 'object' ? draft.conteos : {});
    setCerrados(draft?.cerrados && typeof draft.cerrados === 'object' ? draft.cerrados : {});
    setDeptosSel(Array.isArray(draft?.deptosSel) ? draft.deptosSel : []);
    setLibreIds(Array.isArray(draft?.libreIds) ? draft.libreIds : []);
    if (draft?.paso === 'libre') {
      setPaso('libre');
    } else if (draft?.paso === 'conteo' && draft.deptoActivo) {
      setDeptoActivo(draft.deptoActivo);
      setIndice(Number(draft.indice) || 0);
      setPaso('conteo');
    } else {
      setPaso(recolectorId && camionId ? 'deptos' : 'recolector');
    }
    setBorradorCamion(recolectorId && camionId ? camionId : '');
    refrescarHistorial();
  }, [camionId, recolectorId, refrescarHistorial]);

  useEffect(() => {
    if (!camionId || borradorCamion !== camionId || paso === 'ticket') return;
    const hayAlgo = Object.keys(conteos).length || Object.keys(cerrados).length || libreIds.length;
    if (!hayAlgo) {
      borrarBorradorAuditoria(camionId);
      return;
    }
    guardarBorradorAuditoria(camionId, {
      conteos,
      cerrados,
      deptosSel,
      libreIds,
      deptoActivo,
      indice,
      paso: paso === 'conteo' || paso === 'libre' ? paso : 'deptos',
      recolector_id: recolectorId,
      recolector_nombre: recolectorSel?.nombre || '',
      camion_etiqueta: camionSel ? etiquetaCamion(camionSel) : '',
    });
    setTickBorr((n) => n + 1);
  }, [camionId, borradorCamion, conteos, cerrados, deptosSel, libreIds, deptoActivo, indice, paso, recolectorId]); // eslint-disable-line react-hooks/exhaustive-deps

  const inventarioCamion = useMemo(
    () => inventarioCamionDesdeLineas(lineasCarga, { productoPorId, inventario }),
    [lineasCarga, productoPorId, inventario],
  );

  const lineas = useMemo(
    () => construirLineasAuditoriaCamion(inventarioCamion, conteos),
    [inventarioCamion, conteos],
  );

  const progresoDeptos = useMemo(() => progresoDepartamentosAuditoria(lineas), [lineas]);
  const valorCamion = useMemo(() => resumirValorCamion(lineas), [lineas]);

  const lineasDepto = useMemo(
    () => lineasAuditoriaPorDepartamento(lineas, deptoActivo),
    [lineas, deptoActivo],
  );
  const resumenDepto = useMemo(() => resumirDepartamentoAuditoria(lineasDepto), [lineasDepto]);
  const articuloActual = lineasDepto[indice] || null;
  const deptoCerrado = deptoActivo ? cerrados[deptoActivo] : null;
  const valorDepto = useMemo(
    () => progresoDeptos.find((d) => d.departamento === deptoActivo) || null,
    [progresoDeptos, deptoActivo],
  );

  const deptosFiltrados = useMemo(() => {
    const t = qDepto.trim().toLowerCase();
    if (!t) return progresoDeptos;
    return progresoDeptos.filter(
      (d) => d.etiqueta.toLowerCase().includes(t) || d.departamento.toLowerCase().includes(t),
    );
  }, [progresoDeptos, qDepto]);

  const camionSel = camiones.find((c) => String(c.id) === String(camionId));
  const borradores = useMemo(
    () => listarBorradoresAuditoria().filter((b) => paso === 'recolector' || String(b.camion_id) !== String(camionId)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [paso, camionId, tickBorr, ticket],
  );
  const nCerrados = Object.keys(cerrados).length;

  useEffect(() => {
    if (paso === 'conteo' && !mostrarResumen && !deptoCerrado) contadaRef.current?.focus();
  }, [paso, indice, mostrarResumen, deptoCerrado, deptoActivo]);

  const setContado = (id, valor) => {
    if (cerrados[deptoActivo]) return;
    setConteos((prev) => ({ ...prev, [id]: valor }));
  };

  const setConteoLibre = (id, valor) => {
    setConteos((prev) => ({ ...prev, [id]: valor }));
  };

  const continuarBorrador = (b) => {
    const rec = recolectores.find((r) => String(r.id) === String(b.recolector_id));
    if (!rec) return alert('No se encontró el recolector de este inventario en espera.');
    setRecolectorId(String(rec.id));
  };

  const eliminarBorrador = (b) => {
    if (!confirm(`¿Eliminar el inventario en espera de ${b.camion_etiqueta || 'este camión'}? Se pierden sus conteos.`)) return;
    borrarBorradorAuditoria(b.camion_id);
    if (String(b.camion_id) === String(camionId)) {
      setConteos({});
      setCerrados({});
      setDeptosSel([]);
      setLibreIds([]);
    }
    setTickBorr((n) => n + 1);
  };

  const entrarDepto = (dept, lineasBase = lineas) => {
    const delDepto = lineasAuditoriaPorDepartamento(lineasBase, dept);
    const primero = delDepto.findIndex((l) => l.contado == null);
    setDeptoActivo(dept);
    setIndice(primero >= 0 ? primero : 0);
    setMostrarResumen(primero < 0 && delDepto.length > 0);
    setCodigo('');
    setPaso('conteo');
  };

  const toggleDepto = (d) => {
    setDeptosSel((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  };

  const confirmarDeptos = () => {
    const cola = progresoDeptos
      .map((d) => d.departamento)
      .filter((d) => deptosSel.includes(d) && !cerrados[d]);
    if (!cola.length) return;
    entrarDepto(cola[0]);
  };

  const siguienteArticulo = () => {
    if (!articuloActual || deptoCerrado) return;
    const id = articuloActual.id;
    const raw = conteos[id];
    const final = raw === undefined || String(raw).trim() === '' ? String(articuloActual.teorico) : String(raw);
    const nextConteos = { ...conteos, [id]: final };
    setConteos(nextConteos);
    const lineasNext = lineasAuditoriaPorDepartamento(
      construirLineasAuditoriaCamion(inventarioCamion, nextConteos),
      deptoActivo,
    );
    const next = siguienteIndicePendiente(lineasNext, indice);
    if (next >= 0) setIndice(next);
    else setMostrarResumen(true);
  };

  const procesarEscaneo = (raw) => {
    const code = String(raw ?? codigo).trim();
    if (!code) return;
    const rCamion = buscarProductoInventario(inventarioCamion, code);
    const hit = rCamion?.producto
      || buscarProductoInventario(inventario, code)?.producto
      || inventarioCamion.find((p) => String(p.id) === code);
    setCodigo('');
    if (!hit || !inventarioCamion.some((p) => String(p.id) === String(hit.id))) {
      return alert(`No está en el camión: ${code}`);
    }
    const idx = lineasDepto.findIndex((l) => String(l.id) === String(hit.id));
    if (idx < 0) {
      return alert(`"${hit.nombre}" pertenece a ${etiquetaDepartamento(hit.cat)}, no a ${etiquetaDepartamento(deptoActivo)}.`);
    }
    setIndice(idx);
    setMostrarResumen(false);
    contadaRef.current?.focus();
    contadaRef.current?.select();
  };

  const cerrarDepartamento = () => {
    if (!resumenDepto.listoParaCerrar) {
      return alert(`Aún faltan ${resumenDepto.pendientes} producto(s) por contar. Usa "Siguiente artículo" en cada uno.`);
    }
    const msg = resumenDepto.piezasFaltantes || resumenDepto.piezasSobrantes
      ? `¿Cerrar ${etiquetaDepartamento(deptoActivo)}?\n\nFaltante: ${resumenDepto.piezasFaltantes} pzs (costo ${fmtMonto(resumenDepto.perdidaCosto)} · público ${fmtMonto(resumenDepto.perdidaPublico)})\nSobrante: ${resumenDepto.piezasSobrantes} pzs`
      : `¿Cerrar ${etiquetaDepartamento(deptoActivo)} sin diferencias?`;
    if (!confirm(`${msg}\n\nNo modifica el inventario del camión.`)) return;

    const cerradoAhora = { ...cerrados, [deptoActivo]: { at: new Date().toISOString(), por: user?.nombre || null } };
    setCerrados(cerradoAhora);
    const resto = progresoDeptos
      .map((d) => d.departamento)
      .filter((d) => deptosSel.includes(d) && !cerradoAhora[d]);
    setDeptosSel(resto);
    if (resto.length) {
      entrarDepto(resto[0]);
      return;
    }
    setDeptoActivo('');
    setMostrarResumen(false);
    setPaso('deptos');
  };

  const reabrirDepartamento = () => {
    if (!deptoActivo || !confirm(`¿Reabrir ${etiquetaDepartamento(deptoActivo)} para corregir el conteo?`)) return;
    setCerrados((prev) => {
      const n = { ...prev };
      delete n[deptoActivo];
      return n;
    });
    setMostrarResumen(false);
    setIndice(0);
  };

  const cancelarInventario = () => {
    if (!confirm('¿Cancelar el inventario en curso? Se borran los conteos y los departamentos cerrados de este equipo.')) return;
    borrarBorradorAuditoria(camionId);
    setConteos({});
    setCerrados({});
    setDeptosSel([]);
    setLibreIds([]);
    setDeptoActivo('');
    setMostrarResumen(false);
    setPaso('deptos');
  };

  const terminarInventario = () => {
    if (!camionId) return alert('Selecciona un recolector con camión asignado.');
    const cerradosIds = Object.keys(cerrados);
    const libresContados = libreIds.filter((id) => conteos[id] != null && String(conteos[id]).trim() !== '');
    if (!cerradosIds.length && !libresContados.length) {
      return alert('Cierra al menos un departamento (o agrega productos al inventario libre) para generar el ticket.');
    }
    const abiertosConConteo = progresoDeptos.filter((d) => !cerrados[d.departamento] && d.contados > 0);
    const avisoAbiertos = abiertosConConteo.length
      ? `\n\nOJO: ${abiertosConConteo.map((d) => d.etiqueta).join(', ')} tiene conteo sin cerrar y NO entra al ticket.`
      : '';
    if (!confirm(
      `¿Terminar inventario con ${cerradosIds.length} departamento(s) cerrado(s)${libresContados.length ? ` y ${libresContados.length} producto(s) libres` : ''}?\n\nSe genera el ticket con el resultado y se guarda en el historial.${avisoAbiertos}`,
    )) return;

    const cierre = armarCierreAuditoria(lineas, cerradosIds, libresContados);
    const nombreRec = recolectorSel?.nombre || '—';
    setGuardando(true);
    const folio = folioAuditoriaRuta(listarAuditoriasCamionLocal({ limit: 200 }).data || []);
    const r = guardarAuditoriaCamionLocal({
      folio,
      modo: cerradosIds.length ? 'departamentos' : 'libre',
      valor_camion: {
        valorCosto: valorCamion.valorCosto,
        valorRuta: valorCamion.valorRuta,
        valorPublico: valorCamion.valorPublico,
        piezas: valorCamion.piezas,
        productos: valorCamion.productos,
      },
      camion_id: camionId,
      camion_etiqueta: etiquetaCamion(camionSel),
      recolector_id: recolectorSel?.repartidor_id || recolectorSel?.id || null,
      recolector_nombre: nombreRec,
      usuario_nombre: user?.nombre || null,
      usuario_id: user?.id || null,
      cargas: cargas.map((c) => ({ id: c.id, folio: c.folio })),
      resumen: cierre.resumen,
      deptos: cierre.deptos,
      progreso_deptos: cierre.deptos,
      cerrados,
      lineas: cierre.lineas.filter((l) => l.contado != null),
    });
    setGuardando(false);
    if (!r.ok) return alert(r.error || 'No se pudo guardar.');

    borrarBorradorAuditoria(camionId);
    setConteos({});
    setCerrados({});
    setDeptosSel([]);
    setLibreIds([]);
    setDeptoActivo('');
    setMostrarResumen(false);
    setTicket(r.data);
    setPaso('ticket');
    refrescarHistorial();
    setAviso?.(`Inventario ${folio} guardado · faltante ${cierre.resumen.piezasFaltantes} pza · público ${fmtMonto(cierre.resumen.perdidaPublico)}`);
    void imprimirAuditoriaRuta(datosImpresion(r.data));
  };

  const datosImpresion = (reg) => ({
    folio: reg.folio,
    fecha: reg.created_at,
    usuario: reg.usuario_nombre,
    recolector: reg.recolector_nombre,
    camion: reg.camion_etiqueta,
    modo: reg.modo,
    valorCamion: reg.valor_camion || null,
    resumen: reg.resumen,
    deptos: reg.deptos || reg.progreso_deptos || [],
    lineas: reg.lineas || [],
  });

  const imprimir = async (reg) => {
    const r = await imprimirAuditoriaRuta(datosImpresion(reg));
    if (r && r.ok === false && r.error) alert(r.error);
  };

  const verTicketHistorial = (reg) => {
    setTicket(reg);
    setPaso('ticket');
  };

  const cerrarTicket = () => {
    setTicket(null);
    setPaso(recolectorId && camionId ? 'deptos' : 'recolector');
  };

  useEffect(() => {
    if (paso === 'ticket') rootRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [paso, ticket]);

  const etapaActiva = paso === 'ticket' ? 4 : paso === 'conteo' || paso === 'libre' ? 3 : paso === 'deptos' ? 2 : 1;

  return (
    <div className="ruta-invop" ref={rootRef}>
      <header className="ruta-invop-hero">
        <div className="ruta-invop-hero-text">
          <p className="ruta-invop-kicker">Inv-op · Venta en ruta</p>
          <h3>Inventario operativo por departamento</h3>
          <p className="ruta-invop-lead">
            Igual que el inventario de sucursales, pero independiente: cuenta artículo por artículo,
            cierra cada departamento y al final obtén tu ticket. No modifica el stock.
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
          className={`ruta-invop-step${etapaActiva === 1 ? ' activo' : ''}${recolectorId ? ' hecho' : ''}`}
          onClick={() => setPaso('recolector')}
        >
          <span className="ruta-invop-step-n">1</span>
          Recolector
        </button>
        <button
          type="button"
          className={`ruta-invop-step${etapaActiva === 2 ? ' activo' : ''}${nCerrados > 0 ? ' hecho' : ''}`}
          onClick={() => recolectorId && camionId && setPaso('deptos')}
          disabled={!recolectorId || !camionId}
        >
          <span className="ruta-invop-step-n">2</span>
          Departamentos
        </button>
        <button
          type="button"
          className={`ruta-invop-step${etapaActiva === 3 ? ' activo' : ''}`}
          onClick={() => (paso === 'libre' ? null : deptoActivo && setPaso('conteo'))}
          disabled={!deptoActivo && paso !== 'libre'}
        >
          <span className="ruta-invop-step-n">3</span>
          Conteo
        </button>
        <button
          type="button"
          className={`ruta-invop-step${etapaActiva === 4 ? ' activo' : ''}`}
          onClick={() => ticket && setPaso('ticket')}
          disabled={!ticket}
        >
          <span className="ruta-invop-step-n">4</span>
          Ticket
        </button>
      </nav>

      {camionId && lineasCarga.length > 0 && (
        <ValorCamion
          valor={valorCamion}
          camion={etiquetaCamion(camionSel)}
          recolector={recolectorSel?.nombre}
          cargas={cargas.length}
        />
      )}

      {borradores.length > 0 && (paso === 'recolector' || paso === 'deptos') && (
        <section className="card" style={{ borderTop: '4px solid var(--brand-gold)' }}>
          <h4 style={{ margin: '0 0 0.5rem', color: 'var(--brand-blue)' }}>Inventarios en espera</h4>
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            {borradores.map((b) => (
              <div key={b.camion_id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 180px' }}>
                  <strong>{b.recolector_nombre || '—'}</strong>
                  <span className="muted" style={{ display: 'block', fontSize: '0.78rem' }}>
                    {b.camion_etiqueta || ''} · {Object.keys(b.cerrados || {}).length} depto(s) cerrado(s) · {Object.keys(b.conteos || {}).length} contado(s)
                    {b.guardado_at ? ` · ${fmtFechaHora(b.guardado_at)}` : ''}
                  </span>
                </div>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => continuarBorrador(b)}>
                  Continuar
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => eliminarBorrador(b)}>
                  Eliminar
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

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
                    onClick={() => setRecolectorId(String(r.id || ''))}
                  >
                    <span className="ruta-invop-rec-name">{r.nombre}</span>
                    <span className="ruta-invop-rec-meta">
                      {cam ? `Camión ${etiquetaCamion(cam)}` : 'Sin camión asignado'}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {recolectorSel && !camionResuelto && (
            <div className="ruta-invop-rec-footer">
              <p className="ruta-invop-warn">
                {recolectorSel.nombre} no tiene camión activo. Asígnalo en Camiones.
              </p>
            </div>
          )}
        </section>
      )}

      {paso === 'deptos' && camionId && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="card" style={{ borderTop: '4px solid var(--brand-blue)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'flex-start' }}>
              <div>
                <h4 style={{ margin: '0 0 0.35rem', color: 'var(--brand-blue)' }}>Departamentos</h4>
                <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
                  {recolectorSel?.nombre || '—'} · {etiquetaCamion(camionSel)}
                </p>
              </div>
              <button type="button" className="btn btn-ghost" onClick={() => void refrescarCargas()} disabled={cargando}>
                Actualizar
              </button>
            </div>
            <p className="muted" style={{ margin: '0.5rem 0 0', fontSize: '0.85rem' }}>
              Marca los departamentos que vas a contar y pulsa Siguiente. Cuentas pieza por pieza, cierras
              cada departamento y al final se genera el ticket. El progreso se guarda solo en este equipo.
            </p>

            {cargando ? (
              <p className="muted">Cargando inventario del camión…</p>
            ) : !cargas.length ? (
              <p className="muted">Sin cargas en ruta para este recolector.</p>
            ) : (
              <>
                <div className="prod-search-row" style={{ margin: '0.75rem 0' }}>
                  <Icon name="search" size={16} />
                  <input className="input" value={qDepto} onChange={(e) => setQDepto(e.target.value)} placeholder="Buscar" />
                </div>
                <div className="prod-modal-deptos-list">
                  {deptosFiltrados.map((d) => {
                    const cerrado = cerrados[d.departamento];
                    return (
                      <label key={d.departamento} className="prod-modal-depto-item" style={{ alignItems: 'center' }}>
                        <input
                          type="checkbox"
                          checked={cerrado ? true : deptosSel.includes(d.departamento)}
                          disabled={Boolean(cerrado)}
                          onChange={() => toggleDepto(d.departamento)}
                        />
                        <span style={{ flex: 1 }}>
                          {d.etiqueta}
                          <small className="muted" style={{ display: 'block' }}>
                            {d.productos} artículos · {d.contados}/{d.productos} contados · {fmtMonto(d.valorPublico)}
                            {cerrado && d.piezasFaltantes > 0 ? ` · ${d.piezasFaltantes} faltantes` : ''}
                          </small>
                        </span>
                        {cerrado ? (
                          <button
                            type="button"
                            className="btn btn-ghost"
                            style={{ padding: '0.2rem 0.5rem', fontSize: '0.78rem' }}
                            onClick={(e) => { e.preventDefault(); entrarDepto(d.departamento); }}
                          >
                            Cerrado · ver
                          </button>
                        ) : d.contados > 0 ? (
                          <span className="badge">{d.pct}%</span>
                        ) : null}
                      </label>
                    );
                  })}
                </div>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ width: '100%', marginTop: '0.75rem' }}
                  onClick={() => setPaso('libre')}
                >
                  Inventario libre (escanear productos sueltos)
                  {libreIds.length ? ` · ${libreIds.length} en lista` : ''}
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ width: '100%', marginTop: '0.5rem' }}
                  disabled={!deptosSel.filter((d) => !cerrados[d]).length}
                  onClick={confirmarDeptos}
                >
                  SIGUIENTE{deptosSel.filter((d) => !cerrados[d]).length ? ` (${deptosSel.filter((d) => !cerrados[d]).length})` : ''}
                </button>
              </>
            )}
          </div>

          {(nCerrados > 0 || libreIds.length > 0) && (
            <div className="card" style={{ borderTop: '4px solid var(--brand-green)' }}>
              <h4 style={{ margin: '0 0 0.35rem', color: 'var(--brand-green)' }}>
                {nCerrados} departamento(s) cerrado(s){libreIds.length ? ` · ${libreIds.length} producto(s) libres` : ''}
              </h4>
              <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
                Cuando termines con todos los departamentos que quieras inventariar, genera el ticket con el resultado.
              </p>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-success" disabled={guardando} onClick={terminarInventario}>
                  {guardando ? 'Guardando…' : 'Terminar inventario y generar ticket'}
                </button>
                <button type="button" className="btn btn-ghost" onClick={cancelarInventario}>
                  Cancelar inventario
                </button>
              </div>
            </div>
          )}

          <div>
            <button type="button" className="btn btn-ghost" onClick={() => setPaso('recolector')}>
              Cambiar recolector
            </button>
          </div>
        </div>
      )}

      {paso === 'conteo' && deptoActivo && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="card" style={{ borderTop: '4px solid var(--brand-blue)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setPaso('deptos')}>
                ← Departamentos
              </button>
              <h4 style={{ margin: 0, color: 'var(--brand-blue)', flex: 1 }}>
                Conteo físico · {etiquetaDepartamento(deptoActivo)}
              </h4>
              {deptoCerrado && <span className="badge">Cerrado</span>}
            </div>
            <p className="muted" style={{ margin: '0.5rem 0 0', fontSize: '0.85rem' }}>
              {recolectorSel?.nombre || '—'} · {etiquetaCamion(camionSel)} · Cuenta pieza por pieza y al terminar cierra el departamento.
            </p>
            {valorDepto && (
              <p style={{ margin: '0.4rem 0 0', fontSize: '0.85rem' }}>
                Valor del departamento en el camión: <strong>{fmtMonto(valorDepto.valorPublico)}</strong> público
                {' · '}{fmtMonto(valorDepto.valorCosto)} costo
                {valorCamion.valorPublico > 0 ? ` · ${Math.round((valorDepto.valorPublico / valorCamion.valorPublico) * 1000) / 10}% del camión` : ''}
              </p>
            )}
          </div>

          {!deptoCerrado && !mostrarResumen && (
            <div className="card" style={{ borderTop: '4px solid var(--brand-gold)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                <h4 style={{ margin: 0, color: 'var(--brand-blue)' }}>
                  Artículo {indice + 1} de {lineasDepto.length}
                </h4>
                <span className="badge">{etiquetaDepartamento(deptoActivo)}</span>
              </div>

              <label className="muted" style={{ display: 'block', marginBottom: '0.75rem' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Icon name="scan" size={16} />
                  Escanear código
                </span>
                <div style={{ marginTop: '0.35rem' }}>
                  <CampoCodigo
                    value={codigo}
                    onChange={(e) => setCodigo(e.target.value)}
                    onEscanear={procesarEscaneo}
                    beepAlEnter
                    placeholder="Escanea para saltar al producto…"
                    tituloCamara={`Inventario · ${etiquetaDepartamento(deptoActivo)}`}
                    inputStyle={{ fontSize: '1.05rem', letterSpacing: '0.04em' }}
                  />
                </div>
              </label>

              {articuloActual ? (
                <div style={{ padding: '1rem', borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>{articuloActual.nombre}</div>
                  <div className="muted" style={{ marginTop: '0.25rem', fontSize: '0.85rem' }}>
                    Código / barras: <strong>{articuloActual.id}</strong>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '0.65rem', marginTop: '0.85rem' }}>
                    <div>
                      <div className="muted" style={{ fontSize: '0.7rem', textTransform: 'uppercase' }}>En el camión</div>
                      <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--brand-blue)' }}>{articuloActual.teorico}</div>
                    </div>
                    <div>
                      <div className="muted" style={{ fontSize: '0.7rem', textTransform: 'uppercase' }}>Cantidad contada</div>
                      <input
                        ref={contadaRef}
                        className="input"
                        type="number"
                        min={0}
                        inputMode="numeric"
                        style={{ marginTop: '0.2rem', fontSize: '1.35rem', fontWeight: 700, padding: '0.5rem' }}
                        value={conteos[articuloActual.id] ?? ''}
                        onChange={(e) => setContado(articuloActual.id, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            siguienteArticulo();
                          }
                        }}
                        placeholder={String(articuloActual.teorico)}
                      />
                    </div>
                    <div>
                      <div className="muted" style={{ fontSize: '0.7rem', textTransform: 'uppercase' }}>Diferencia</div>
                      <div style={{ fontSize: '1.15rem', fontWeight: 700, marginTop: '0.35rem', color: colorDiferencia(articuloActual) }}>
                        {textoDiferencia(articuloActual)}
                      </div>
                    </div>
                    <div>
                      <div className="muted" style={{ fontSize: '0.7rem', textTransform: 'uppercase' }}>Valor dif. (público)</div>
                      <div style={{ fontSize: '1.15rem', fontWeight: 700, marginTop: '0.35rem' }}>
                        {articuloActual.perdidaPublico > 0 ? fmtMonto(articuloActual.perdidaPublico) : '—'}
                      </div>
                    </div>
                  </div>
                  <p className="muted" style={{ margin: '0.75rem 0 0', fontSize: '0.78rem' }}>
                    Si dejas vacío y pulsas Siguiente, se asume que coincide con lo que hay en el camión ({articuloActual.teorico}).
                  </p>
                </div>
              ) : (
                <p className="muted">Sin productos en este departamento.</p>
              )}

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.85rem', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-primary" onClick={siguienteArticulo} disabled={!articuloActual}>
                  Siguiente artículo
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setIndice((i) => Math.max(0, i - 1))}
                  disabled={indice <= 0}
                >
                  Anterior
                </button>
                <button type="button" className="btn btn-gold" onClick={() => setMostrarResumen(true)}>
                  Ver resumen
                </button>
              </div>
            </div>
          )}

          {(mostrarResumen || deptoCerrado) && (
            <div className="card" style={{ borderTop: '4px solid var(--brand-green)' }}>
              <h4 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>
                Resumen · {etiquetaDepartamento(deptoActivo)}
              </h4>
              <KpisResumen r={resumenDepto} />
              {resumenDepto.pendientes > 0 && !deptoCerrado && (
                <p className="muted" style={{ margin: '0.75rem 0 0', color: 'var(--brand-gold-dark)' }}>
                  Faltan {resumenDepto.pendientes} producto(s) por contar antes de cerrar el departamento.
                </p>
              )}
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.85rem', flexWrap: 'wrap' }}>
                {deptoCerrado ? (
                  <>
                    <button type="button" className="btn btn-ghost" onClick={reabrirDepartamento}>
                      Reabrir departamento
                    </button>
                    <button type="button" className="btn btn-primary" onClick={() => setPaso('deptos')}>
                      Volver a departamentos
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className="btn btn-success"
                      onClick={cerrarDepartamento}
                      disabled={!resumenDepto.listoParaCerrar}
                    >
                      Cerrar departamento
                    </button>
                    <button type="button" className="btn btn-ghost" onClick={() => setMostrarResumen(false)}>
                      Seguir contando
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          <div className="card">
            <h4 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Listado del departamento</h4>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Artículo</th>
                    <th>Camión</th>
                    <th>Contada</th>
                    <th>Diferencia</th>
                  </tr>
                </thead>
                <tbody>
                  {lineasDepto.map((l, idx) => (
                    <tr
                      key={l.id}
                      style={{
                        background: idx === indice && !deptoCerrado ? 'rgba(59,105,181,0.08)' : undefined,
                        cursor: deptoCerrado ? 'default' : 'pointer',
                      }}
                      onClick={() => {
                        if (deptoCerrado) return;
                        setIndice(idx);
                        setMostrarResumen(false);
                      }}
                    >
                      <td style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.82rem' }}>{l.id}</td>
                      <td>{l.nombre}</td>
                      <td>{l.teorico}</td>
                      <td>
                        <input
                          className="input"
                          type="number"
                          min={0}
                          disabled={Boolean(deptoCerrado)}
                          style={{ width: '4.5rem', padding: '0.25rem 0.4rem', fontSize: '0.85rem' }}
                          value={conteos[l.id] ?? ''}
                          onChange={(e) => setContado(l.id, e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </td>
                      <td style={{ fontWeight: 600, color: colorDiferencia(l) }}>{textoDiferencia(l)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {paso === 'libre' && camionId && (
        <ConteoLibreRuta
          lineas={lineas}
          inventarioCamion={inventarioCamion}
          inventario={inventario}
          libreIds={libreIds}
          setLibreIds={setLibreIds}
          conteos={conteos}
          setConteo={setConteoLibre}
          onTerminar={terminarInventario}
          onVolver={() => setPaso('deptos')}
          guardando={guardando}
        />
      )}

      {paso === 'ticket' && ticket && (
        <TicketResultado
          registro={ticket}
          onImprimir={imprimir}
          onCerrar={cerrarTicket}
          cerrarLabel="Nuevo inventario"
        />
      )}

      {historial.length > 0 && paso !== 'conteo' && paso !== 'libre' && (
        <section className="ruta-invop-panel">
          <h4 style={{ margin: '0 0 0.5rem' }}>Historial de inventarios (este dispositivo)</h4>
          <div className="ruta-invop-hist">
            {historial.map((a) => (
              <div key={a.id} className="ruta-invop-hist-row">
                <div>
                  <strong>{a.folio ? `${a.folio} · ` : ''}{a.recolector_nombre || a.camion_etiqueta || '—'}</strong>
                  <span className="muted">
                    {fmtFechaHora(a.created_at)}
                    {a.camion_etiqueta ? ` · ${a.camion_etiqueta}` : ''}
                    {Array.isArray(a.deptos) && a.deptos.length ? ` · ${a.deptos.length} depto(s)` : ''}
                  </span>
                </div>
                <div className="ruta-invop-hist-nums">
                  <span className="falt">{a.resumen?.piezasFaltantes ?? 0} pza</span>
                  <span>{fmtMonto(a.resumen?.perdidaPublico)}</span>
                  <button type="button" className="btn btn-ghost" style={{ padding: '0.2rem 0.5rem', fontSize: '0.78rem' }} onClick={() => verTicketHistorial(a)}>
                    Ver ticket
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
