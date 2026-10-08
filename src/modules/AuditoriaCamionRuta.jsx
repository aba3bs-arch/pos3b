import React, { useCallback, useEffect, useMemo, useState } from 'react';
import CampoCodigo from '../components/CampoCodigo.jsx';
import {
  construirLineasAuditoriaCamion,
  guardarAuditoriaCamionLocal,
  listarAuditoriasCamionLocal,
  resumirAuditoriaCamion,
} from '../lib/auditoriaCamionRuta.js';
import {
  inventarioCamionDesdeLineas,
  lineasDeVariasCargas,
  listarCargasRuta,
} from '../lib/ventaEnRuta.js';
import {
  etiquetaCamion,
  listarCamionesRuta,
} from '../lib/rutaCamiones.js';
import { fmtMonto } from '../lib/consultasUi.js';
import { buscarProductoInventario } from '../lib/comprasRecepcion.js';

const COLOR = '#0f766e';

/**
 * Venta en Ruta → Inv-op / Auditorías.
 * Conteo físico del camión vs teórico; faltantes valorizados a costo y a precio público.
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
  const [camiones, setCamiones] = useState([]);
  const [camionId, setCamionId] = useState('');
  const [cargas, setCargas] = useState([]);
  const [lineasCarga, setLineasCarga] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [conteos, setConteos] = useState({});
  const [codigo, setCodigo] = useState('');
  const [historial, setHistorial] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [soloFaltantes, setSoloFaltantes] = useState(false);

  const cargarCamiones = useCallback(async () => {
    const r = await listarCamionesRuta(supabase, { soloActivos: true });
    if (r.aviso) setAviso?.(r.aviso);
    if (r.error) setAviso?.(r.error);
    setCamiones(r.data || []);
  }, [supabase, setAviso]);

  useEffect(() => {
    void cargarCamiones();
  }, [cargarCamiones]);

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
    const h = listarAuditoriasCamionLocal({ camionId: camionId || undefined, limit: 8 });
    setHistorial(h.data || []);
  }, [camionId]);

  const inventarioCamion = useMemo(
    () => inventarioCamionDesdeLineas(lineasCarga, { productoPorId, inventario }),
    [lineasCarga, productoPorId, inventario],
  );

  const lineas = useMemo(
    () => construirLineasAuditoriaCamion(inventarioCamion, conteos),
    [inventarioCamion, conteos],
  );

  const resumen = useMemo(() => resumirAuditoriaCamion(lineas), [lineas]);

  const lineasVista = useMemo(() => {
    if (!soloFaltantes) return lineas;
    return lineas.filter((l) => (Number(l.faltante) || 0) > 0 || (l.contado != null && (Number(l.diferencia) || 0) < 0));
  }, [lineas, soloFaltantes]);

  const camionSel = camiones.find((c) => String(c.id) === String(camionId));

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
    setConteos((prev) => {
      const actual = prev[id];
      const n = actual === null || actual === undefined || String(actual).trim() === ''
        ? 1
        : Math.max(0, Math.floor(Number(actual) || 0)) + 1;
      return { ...prev, [id]: String(n) };
    });
    setCodigo('');
  };

  const cerrarAuditoria = async () => {
    if (!camionId) return alert('Selecciona un camión.');
    if (!resumen.contados) return alert('Captura al menos un conteo.');
    if (!confirm(
      `¿Cerrar auditoría de ${etiquetaCamion(camionSel)}?\n\n`
      + `Faltantes: ${resumen.piezasFaltantes} pza\n`
      + `Pérdida a costo: ${fmtMonto(resumen.perdidaCosto)}\n`
      + `Pérdida a precio público: ${fmtMonto(resumen.perdidaPublico)}\n\n`
      + 'No modifica el inventario del camión.',
    )) return;
    setGuardando(true);
    const r = guardarAuditoriaCamionLocal({
      camion_id: camionId,
      camion_etiqueta: etiquetaCamion(camionSel),
      usuario_nombre: user?.nombre || null,
      usuario_id: user?.id || null,
      cargas: cargas.map((c) => ({ id: c.id, folio: c.folio })),
      resumen,
      lineas: lineas.filter((l) => l.contado != null || (Number(l.faltante) || 0) > 0),
    });
    setGuardando(false);
    if (!r.ok) return alert(r.error || 'No se pudo guardar.');
    setAviso?.(`Auditoría guardada · faltante ${resumen.piezasFaltantes} pza · público ${fmtMonto(resumen.perdidaPublico)}`);
    setHistorial(listarAuditoriasCamionLocal({ camionId, limit: 8 }).data || []);
  };

  const kpi = (label, value, color) => (
    <div
      style={{
        flex: '1 1 140px',
        minWidth: 130,
        padding: '0.65rem 0.75rem',
        borderRadius: 10,
        border: '1px solid var(--border, #e2e8f0)',
        background: '#fff',
      }}
    >
      <div className="muted" style={{ fontSize: '0.72rem' }}>{label}</div>
      <strong style={{ fontSize: '1.05rem', color: color || 'inherit' }}>{value}</strong>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div className="card" style={{ borderTop: `4px solid ${COLOR}`, margin: 0 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ margin: 0, color: COLOR }}>Inv-op / Auditorías</h3>
            <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.85rem', maxWidth: 640 }}>
              Audita mercancía del camión: teórico vs contado.
              Calcula <strong>faltantes</strong>, pérdida a <strong>costo</strong> y diferencia a
              {' '}<strong>precio de venta al público</strong> (lo que se deja de vender).
              No modifica inventario.
            </p>
          </div>
          {onVolver && (
            <button type="button" className="btn btn-ghost" onClick={onVolver}>Volver</button>
          )}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'flex-end', marginTop: '0.85rem' }}>
          <label className="muted" style={{ display: 'block', fontSize: '0.8rem', flex: '1 1 240px', maxWidth: 420 }}>
            Camión a auditar
            <select
              className="input"
              style={{ marginTop: '0.35rem' }}
              value={camionId}
              onChange={(e) => setCamionId(e.target.value)}
            >
              <option value="">— Selecciona —</option>
              {camiones.map((c) => (
                <option key={c.id} value={c.id}>{etiquetaCamion(c)}</option>
              ))}
            </select>
          </label>
          <button type="button" className="btn btn-ghost" onClick={() => void refrescarCargas()} disabled={!camionId || cargando}>
            Actualizar
          </button>
          <label className="muted" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem' }}>
            <input type="checkbox" checked={soloFaltantes} onChange={(e) => setSoloFaltantes(e.target.checked)} />
            Solo faltantes
          </label>
        </div>

        {camionId && !cargando && (
          <p className="muted" style={{ margin: '0.5rem 0 0', fontSize: '0.8rem' }}>
            {cargas.length === 0
              ? 'Sin cargas en ruta en este camión.'
              : `${cargas.length} carga(s) · ${inventarioCamion.length} producto(s) · teórico disponible en camión`}
          </p>
        )}
      </div>

      {camionId && !cargando && cargas.length > 0 && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {kpi('Contados', `${resumen.contados}/${resumen.productos}`)}
            {kpi('Faltantes (pza)', String(resumen.piezasFaltantes), resumen.piezasFaltantes > 0 ? '#b91c1c' : undefined)}
            {kpi('Pérdida a costo', fmtMonto(resumen.perdidaCosto), resumen.perdidaCosto > 0 ? '#b45309' : undefined)}
            {kpi('Pérdida precio público', fmtMonto(resumen.perdidaPublico), resumen.perdidaPublico > 0 ? '#b91c1c' : undefined)}
            {kpi('Margen perdido (público − costo)', fmtMonto(resumen.margenPerdidoPublico), '#7c3aed')}
          </div>

          <div className="card" style={{ margin: 0 }}>
            <CampoCodigo
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              onEscanear={registrarEscaneo}
              beepAlEnter
              placeholder="Escanear o escribir código…"
              tituloCamara="Auditar camión"
            />
            <div className="table-wrap" style={{ marginTop: '0.75rem' }}>
              <table className="consultas-table">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Teórico</th>
                    <th>Contado</th>
                    <th>Falt.</th>
                    <th>Costo u.</th>
                    <th>Público u.</th>
                    <th>$ costo</th>
                    <th>$ público</th>
                  </tr>
                </thead>
                <tbody>
                  {lineasVista.map((l) => (
                    <tr
                      key={l.id}
                      style={{
                        background: l.faltante > 0 ? 'rgba(185,28,28,0.06)' : undefined,
                      }}
                    >
                      <td>
                        <strong style={{ display: 'block' }}>{l.nombre}</strong>
                        <span className="muted" style={{ fontSize: '0.72rem', fontFamily: 'monospace' }}>{l.id}</span>
                      </td>
                      <td>{l.teorico}</td>
                      <td style={{ minWidth: 84 }}>
                        <input
                          className="input"
                          type="number"
                          min={0}
                          value={conteos[l.id] ?? ''}
                          onChange={(e) => setConteos((prev) => ({ ...prev, [l.id]: e.target.value }))}
                          style={{ width: 72 }}
                        />
                      </td>
                      <td style={{ color: l.faltante > 0 ? '#b91c1c' : undefined, fontWeight: l.faltante > 0 ? 700 : undefined }}>
                        {l.contado == null ? '—' : l.faltante}
                      </td>
                      <td className="muted">{fmtMonto(l.costoUnit)}</td>
                      <td>{fmtMonto(l.precioPublico)}</td>
                      <td style={{ color: l.perdidaCosto > 0 ? '#b45309' : undefined }}>
                        {l.contado == null ? '—' : fmtMonto(l.perdidaCosto)}
                      </td>
                      <td style={{ color: l.perdidaPublico > 0 ? '#b91c1c' : undefined, fontWeight: l.perdidaPublico > 0 ? 700 : undefined }}>
                        {l.contado == null ? '—' : fmtMonto(l.perdidaPublico)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ marginTop: '0.85rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
              <button
                type="button"
                className="btn btn-primary"
                disabled={guardando || !resumen.contados}
                onClick={() => void cerrarAuditoria()}
              >
                {guardando ? 'Guardando…' : 'Cerrar auditoría'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setConteos({})}>
                Limpiar conteos
              </button>
              <span className="muted" style={{ fontSize: '0.78rem' }}>
                Teórico valorizado: costo {fmtMonto(resumen.valorTeoricoCosto)} · público {fmtMonto(resumen.valorTeoricoPublico)}
              </span>
            </div>
          </div>
        </>
      )}

      {camionId && !cargando && cargas.length === 0 && (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>No hay mercancía en ruta en este camión para auditar.</p>
        </div>
      )}

      {historial.length > 0 && (
        <div className="card" style={{ margin: 0 }}>
          <h4 style={{ margin: '0 0 0.5rem' }}>Últimas auditorías (este dispositivo)</h4>
          <div className="table-wrap">
            <table className="consultas-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Camión</th>
                  <th>Falt. pza</th>
                  <th>$ costo</th>
                  <th>$ público</th>
                  <th>Por</th>
                </tr>
              </thead>
              <tbody>
                {historial.map((a) => (
                  <tr key={a.id}>
                    <td className="muted" style={{ fontSize: '0.8rem' }}>{String(a.created_at || '').slice(0, 16).replace('T', ' ')}</td>
                    <td>{a.camion_etiqueta || '—'}</td>
                    <td style={{ color: '#b91c1c', fontWeight: 700 }}>{a.resumen?.piezasFaltantes ?? 0}</td>
                    <td>{fmtMonto(a.resumen?.perdidaCosto)}</td>
                    <td style={{ color: '#b91c1c', fontWeight: 700 }}>{fmtMonto(a.resumen?.perdidaPublico)}</td>
                    <td className="muted">{a.usuario_nombre || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
