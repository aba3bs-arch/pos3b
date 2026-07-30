import './Traspasos.css';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from '../components/Icon.jsx';
import CampoCodigo from '../components/CampoCodigo.jsx';
import ProductoThumb from '../components/ProductoThumb.jsx';
import { buscarProductoInventario } from '../lib/comprasRecepcion.js';
import { productoCoincideBusqueda } from '../lib/buscarProductoTexto.js';
import { etiquetaTienda, normalizarCodigoTienda } from '../constants/sucursales.js';
import { esAlmacenCentral } from '../lib/inventarioMultitienda.js';
import {
  AVISO_SQL_TRASPASOS,
  crearSolicitudTraspaso,
  destinosPermitidosPara,
  enviarTraspaso,
  etiquetaOrigenTraspaso,
  filtrarMisSolicitudes,
  filtrarParaRecibir,
  filtrarSolicitudesPendientes,
  listarTraspasos,
  recibirTraspaso,
  stockDestinoDisponible,
  stockOrigenDisponible,
} from '../lib/traspasosInventario.js';

const TABS = [
  { id: 'enviar', label: 'Enviar productos', icon: 'truck' },
  { id: 'recibir', label: 'Recibir productos', icon: 'download' },
  { id: 'solicitar', label: 'Solicitar traspaso', icon: 'file' },
];

function monetario(n) {
  return `$${Number(n || 0).toFixed(2)}`;
}

/** Productos distintos + piezas totales de un traspaso/solicitud. */
function resumenPiezas(lineas) {
  const arr = Array.isArray(lineas) ? lineas : [];
  let piezas = 0;
  for (const l of arr) {
    piezas += Math.max(0, Math.floor(Number(l.cantidad) || 0));
  }
  return { productos: arr.length, piezas };
}

function textoResumenLineas(lineas) {
  const { productos, piezas } = resumenPiezas(lineas);
  if (!productos) return 'Sin productos';
  return `${productos} producto${productos === 1 ? '' : 's'} · ${piezas} pieza${piezas === 1 ? '' : 's'}`;
}

function EmptyFolder({ texto }) {
  return (
    <div className="trp-empty">
      <div className="trp-empty-circle" aria-hidden>
        <Icon name="package" size={36} style={{ color: 'var(--brand-blue)' }} />
      </div>
      <p className="muted">{texto}</p>
    </div>
  );
}

/**
 * Hub de traspasos: Enviar / Recibir / Solicitar.
 * Colores de marca POS (azul / verde / oro).
 */
export default function Traspasos({
  supabase,
  inventario = [],
  inventarioCompleto,
  cargarDatos,
  fusionarProducto,
  user,
  sucursal,
  onVolver,
}) {
  const catalogo = inventarioCompleto || inventario || [];
  const sucursalOp = normalizarCodigoTienda(sucursal) || 'MAIN';
  const enCentral = esAlmacenCentral(sucursalOp);
  const usuario = user?.nombre || user?.email || '—';

  const [tab, setTab] = useState(enCentral ? 'enviar' : 'recibir');
  const [lista, setLista] = useState([]);
  const [aviso, setAviso] = useState('');
  const [cargando, setCargando] = useState(false);
  const [busy, setBusy] = useState(false);

  // Wizard envío / solicitud
  const [paso, setPaso] = useState(null); // null | 'elegir_destino' | 'editor'
  const [modoFlujo, setModoFlujo] = useState('envio'); // envio | solicitud
  const [destinoId, setDestinoId] = useState('');
  const [origenSolicitudId, setOrigenSolicitudId] = useState(enCentral ? '' : 'MAIN');
  const [lineas, setLineas] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [codigo, setCodigo] = useState('');
  const [notas, setNotas] = useState('');
  const [solicitudOrigen, setSolicitudOrigen] = useState(null);
  const [detalleRecibir, setDetalleRecibir] = useState(null);

  const destinos = useMemo(() => destinosPermitidosPara(sucursalOp), [sucursalOp]);
  // Para solicitar: origen = quien debe enviarme (MAIN u otra sucursal)
  const originesSolicitud = useMemo(() => {
    if (enCentral) return [];
    const otros = destinosPermitidosPara(sucursalOp);
    return ['MAIN', ...otros];
  }, [enCentral, sucursalOp]);

  const reload = useCallback(async () => {
    setCargando(true);
    const r = await listarTraspasos(supabase, { sucursal: sucursalOp });
    setLista(r.data || []);
    if (r.aviso) setAviso(r.aviso);
    else if (r.fuente === 'local') setAviso(AVISO_SQL_TRASPASOS);
    else setAviso('');
    setCargando(false);
  }, [supabase, sucursalOp]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const pendientesRecibir = useMemo(() => filtrarParaRecibir(lista, sucursalOp), [lista, sucursalOp]);
  const solicitudesAtender = useMemo(() => filtrarSolicitudesPendientes(lista, sucursalOp), [lista, sucursalOp]);
  const misSolicitudes = useMemo(() => filtrarMisSolicitudes(lista, sucursalOp), [lista, sucursalOp]);

  const resetWizard = () => {
    setPaso(null);
    setDestinoId('');
    setOrigenSolicitudId(enCentral ? '' : 'MAIN');
    setLineas([]);
    setBusqueda('');
    setCodigo('');
    setNotas('');
    setSolicitudOrigen(null);
    setModoFlujo('envio');
  };

  const abrirNuevoEnvio = () => {
    setModoFlujo('envio');
    setSolicitudOrigen(null);
    setLineas([]);
    setDestinoId('');
    setNotas('');
    setPaso('elegir_destino');
  };

  const atenderSolicitud = (sol) => {
    setModoFlujo('envio');
    setSolicitudOrigen(sol);
    setDestinoId(sol.destino_id);
    setLineas(
      (sol.lineas || []).map((l) => ({
        producto_id: l.producto_id,
        nombre: l.nombre,
        cantidad: l.cantidad,
        precio: l.precio || 0,
        costo: l.costo || 0,
      })),
    );
    setNotas(sol.notas || '');
    setPaso('editor');
  };

  const abrirSolicitud = () => {
    setModoFlujo('solicitud');
    setLineas([]);
    setOrigenSolicitudId(enCentral ? '' : 'MAIN');
    setNotas('');
    setPaso('elegir_destino');
  };

  const agregarProducto = (producto, qty = 1) => {
    if (!producto?.id) return;
    const id = String(producto.id);
    if (lineas.some((l) => l.producto_id === id)) {
      alert('Ese producto ya está en la lista.');
      return;
    }
    const origenId = modoFlujo === 'solicitud' ? origenSolicitudId : sucursalOp;
    const disp = stockOrigenDisponible(producto, origenId);
    if (modoFlujo === 'envio' && disp < 1) {
      alert(`Sin stock en origen (${etiquetaOrigenTraspaso(origenId)}). Disponible: ${disp}`);
      return;
    }
    setLineas((prev) => [
      ...prev,
      {
        producto_id: id,
        nombre: producto.nombre || id,
        cantidad: Math.max(1, Math.floor(Number(qty) || 1)),
        precio: Number(producto.precio) || 0,
        costo: Number(producto.costo) || 0,
      },
    ]);
    setBusqueda('');
    setCodigo('');
  };

  const procesarEscaneo = (raw) => {
    const c = String(raw ?? codigo).trim();
    if (!c) return;
    if (!catalogo.length) {
      alert('Inventario aún no cargado.');
      return;
    }
    const { producto, ambiguo } = buscarProductoInventario(catalogo, c);
    if (ambiguo) {
      setBusqueda(c);
      setCodigo('');
      alert('Varios productos coinciden. Elige uno de la lista.');
      return;
    }
    if (!producto) {
      setBusqueda(c);
      setCodigo('');
      alert(`No encontrado: ${c}`);
      return;
    }
    agregarProducto(producto);
  };

  const sugeridos = useMemo(() => {
    const t = busqueda.trim();
    let list = catalogo;
    if (t) list = list.filter((p) => productoCoincideBusqueda(p, t));
    const ids = new Set(lineas.map((l) => l.producto_id));
    return list.filter((p) => !ids.has(String(p.id))).slice(0, 30);
  }, [catalogo, busqueda, lineas]);

  const totales = useMemo(() => {
    const productos = lineas.length;
    let piezas = 0;
    let costo = 0;
    let precio = 0;
    for (const l of lineas) {
      const q = Math.max(0, Math.floor(Number(l.cantidad) || 0));
      piezas += q;
      costo += (Number(l.costo) || 0) * q;
      precio += (Number(l.precio) || 0) * q;
    }
    return { productos, piezas, costo, precio };
  }, [lineas]);

  const confirmarDestino = () => {
    if (modoFlujo === 'solicitud') {
      if (!origenSolicitudId) {
        alert('Elige de quién solicitas el traspaso.');
        return;
      }
      setPaso('editor');
      return;
    }
    if (!destinoId) {
      alert('Elige la sucursal destino.');
      return;
    }
    setPaso('editor');
  };

  const enviar = async () => {
    if (!lineas.length) return alert('Agrega productos.');
    const { piezas } = resumenPiezas(lineas);
    if (
      !window.confirm(
        `¿Enviar ${lineas.length} producto(s) / ${piezas} pieza(s) a ${etiquetaOrigenTraspaso(destinoId)}?`,
      )
    ) {
      return;
    }
    setBusy(true);
    const r = await enviarTraspaso(supabase, {
      origenId: sucursalOp,
      destinoId,
      lineas,
      notas,
      usuario,
      inventario: catalogo,
      solicitudId: solicitudOrigen?.id || null,
    });
    setBusy(false);
    if (!r.ok) return alert(r.error || 'Error al enviar');
    if (r.aviso) setAviso(r.aviso);
    alert(r.mensaje || 'Enviado.');
    resetWizard();
    await cargarDatos?.();
    await reload();
    setTab('enviar');
  };

  const solicitar = async () => {
    if (!lineas.length) return alert('Agrega productos a la solicitud.');
    if (!origenSolicitudId) return alert('Elige de quién pides el traspaso.');
    const { piezas } = resumenPiezas(lineas);
    if (
      !window.confirm(
        `¿Solicitar ${lineas.length} producto(s) / ${piezas} pieza(s) desde ${etiquetaOrigenTraspaso(origenSolicitudId)}?`,
      )
    ) {
      return;
    }
    setBusy(true);
    const r = await crearSolicitudTraspaso(supabase, {
      origenId: origenSolicitudId,
      destinoId: sucursalOp,
      lineas,
      notas,
      usuario,
    });
    setBusy(false);
    if (!r.ok) return alert(r.error || 'Error al solicitar');
    if (r.aviso) setAviso(r.aviso);
    alert(`Solicitud ${r.data?.folio || ''} enviada a ${etiquetaOrigenTraspaso(origenSolicitudId)}.`);
    resetWizard();
    await reload();
    setTab('solicitar');
  };

  const confirmarRecibo = async (doc) => {
    const { piezas, productos } = resumenPiezas(doc.lineas);
    if (
      !window.confirm(
        `¿Confirmar recepción de ${doc.folio}?\n${productos} producto(s) · ${piezas} pieza(s) entrarán al piso de esta tienda.`,
      )
    ) {
      return;
    }
    setBusy(true);
    const r = await recibirTraspaso(supabase, {
      traspasoId: doc.id,
      usuario,
      inventario: catalogo,
    });
    setBusy(false);
    if (!r.ok) return alert(r.error || 'Error al recibir');
    alert(r.mensaje || 'Recibido.');
    setDetalleRecibir(null);
    for (const p of r.productosActualizados || []) {
      fusionarProducto?.(p);
    }
    await cargarDatos?.();
    await reload();
  };

  // —— Subpantallas wizard ——
  if (paso === 'elegir_destino') {
    const esSol = modoFlujo === 'solicitud';
    return (
      <div className="trp-shell">
        <header className="trp-header">
          <button type="button" className="trp-icon-btn" onClick={resetWizard} aria-label="Cerrar">
            <Icon name="x" size={22} />
          </button>
          <h2>{esSol ? 'Solicitar traspaso' : 'Nuevo traspaso'}</h2>
          <span style={{ width: 40 }} />
        </header>
        <div className="trp-body">
          <p className="trp-section-label">{esSol ? 'SOLICITAR PRODUCTOS A' : 'ENVIAR PRODUCTOS A'}</p>
          <div className="trp-select-card">
            {(esSol ? originesSolicitud : destinos).map((code) => {
              const selected = esSol ? origenSolicitudId === code : destinoId === code;
              const isMain = esAlmacenCentral(code);
              return (
                <button
                  key={code}
                  type="button"
                  className={`trp-select-row ${selected ? 'is-selected' : ''}`}
                  onClick={() => (esSol ? setOrigenSolicitudId(code) : setDestinoId(code))}
                >
                  {selected ? <Icon name="check" size={18} style={{ color: 'var(--brand-blue)' }} /> : <span className="trp-check-spacer" />}
                  <Icon name={isMain ? 'package' : 'building'} size={22} style={{ color: 'var(--brand-blue)' }} />
                  <span>{isMain ? 'Almacén principal' : etiquetaTienda(code)}</span>
                </button>
              );
            })}
            {!esSol && !destinos.length && <p className="muted" style={{ padding: '1rem' }}>No hay sucursales destino.</p>}
            {esSol && enCentral && (
              <p className="muted" style={{ padding: '1rem' }}>MAIN no solicita traspasos; usa Enviar productos.</p>
            )}
          </div>
        </div>
        <footer className="trp-footer">
          <button type="button" className="trp-btn-green" onClick={confirmarDestino} disabled={esSol ? !origenSolicitudId : !destinoId}>
            SIGUIENTE <Icon name="chevronRight" size={18} />
          </button>
        </footer>
      </div>
    );
  }

  if (paso === 'editor') {
    const esSol = modoFlujo === 'solicitud';
    const origenId = esSol ? origenSolicitudId : sucursalOp;
    const destId = esSol ? sucursalOp : destinoId;
    return (
      <div className="trp-shell trp-shell-wide">
        <header className="trp-header">
          <button type="button" className="trp-icon-btn" onClick={() => (solicitudOrigen ? resetWizard() : setPaso('elegir_destino'))} aria-label="Cerrar">
            <Icon name="x" size={22} />
          </button>
          <h2>{esSol ? 'Solicitud de traspaso' : 'Traspaso de salida'}</h2>
          <span style={{ width: 40 }} />
        </header>
        <div className="trp-body trp-editor">
          <div className="trp-toolbar">
            <CampoCodigo
              value={codigo || busqueda}
              onChange={(e) => {
                setBusqueda(e.target.value);
                setCodigo(e.target.value);
              }}
              onEscanear={procesarEscaneo}
              onKeyDown={(e) => e.key === 'Enter' && procesarEscaneo(e.target.value)}
              placeholder="Añadir productos…"
              tituloCamara="Agregar a traspaso"
            />
            <div className="trp-ruta">
              <span>
                <Icon name="package" size={16} /> {etiquetaOrigenTraspaso(origenId)}
              </span>
              <Icon name="chevronRight" size={16} />
              <span>
                <Icon name="building" size={16} /> {etiquetaOrigenTraspaso(destId)}
              </span>
            </div>
            <label className="muted" style={{ display: 'block', marginTop: '0.5rem' }}>
              Notas
              <input className="input" style={{ marginTop: 4 }} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Opcional" />
            </label>
          </div>

          {busqueda.trim() && (
            <div className="trp-sugeridos">
              {sugeridos.map((p) => (
                <button key={p.id} type="button" className="trp-sugerido" onClick={() => agregarProducto(p)}>
                  <ProductoThumb producto={p} size={36} />
                  <span>
                    {p.nombre}
                    <small className="muted">
                      {' '}
                      · Origen {stockOrigenDisponible(p, origenId)} · Destino {stockDestinoDisponible(p, destId)}
                    </small>
                  </span>
                  <Icon name="plus" size={16} />
                </button>
              ))}
              {!sugeridos.length && <p className="muted">Sin coincidencias.</p>}
            </div>
          )}

          <div className="trp-table-wrap trp-table-desktop">
            <table className="trp-table">
              <thead>
                <tr>
                  <th>Piezas</th>
                  <th>Producto</th>
                  <th>Ext. origen</th>
                  <th>Ext. destino</th>
                  <th>Precio / Costo</th>
                  <th>Total</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lineas.map((l) => {
                  const prod = catalogo.find((p) => String(p.id) === String(l.producto_id));
                  const so = prod ? stockOrigenDisponible(prod, origenId) : '—';
                  const sd = prod ? stockDestinoDisponible(prod, destId) : '—';
                  return (
                    <tr key={l.producto_id}>
                      <td>
                        <input
                          className="input trp-qty"
                          type="number"
                          min={1}
                          value={l.cantidad}
                          onChange={(e) => {
                            const v = Math.max(1, Math.floor(Number(e.target.value) || 1));
                            setLineas((prev) => prev.map((x) => (x.producto_id === l.producto_id ? { ...x, cantidad: v } : x)));
                          }}
                        />
                      </td>
                      <td>
                        <div className="trp-prod-cell">
                          {prod && <ProductoThumb producto={prod} size={32} />}
                          <div>
                            <strong>{l.nombre}</strong>
                            <div className="muted" style={{ fontSize: '0.75rem' }}>{l.producto_id}</div>
                          </div>
                        </div>
                      </td>
                      <td>{so}</td>
                      <td>{sd}</td>
                      <td>
                        {monetario(l.precio)}
                        <div className="muted">{monetario(l.costo)}</div>
                      </td>
                      <td>
                        {monetario(l.precio * l.cantidad)}
                        <div className="muted">{monetario(l.costo * l.cantidad)}</div>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          aria-label="Quitar"
                          onClick={() => setLineas((prev) => prev.filter((x) => x.producto_id !== l.producto_id))}
                        >
                          <Icon name="trash" size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!lineas.length && <p className="muted" style={{ padding: '1rem' }}>Escanea o busca para agregar productos.</p>}
          </div>

          <div className="trp-cards-mobile">
            {!lineas.length && <p className="muted" style={{ padding: '0.75rem 0' }}>Escanea o busca para agregar productos.</p>}
            {lineas.map((l) => {
              const prod = catalogo.find((p) => String(p.id) === String(l.producto_id));
              const so = prod ? stockOrigenDisponible(prod, origenId) : '—';
              const sd = prod ? stockDestinoDisponible(prod, destId) : '—';
              return (
                <article key={l.producto_id} className="trp-card-linea">
                  <div className="trp-card-linea-top">
                    {prod && <ProductoThumb producto={prod} size={40} />}
                    <div className="trp-card-linea-info">
                      <strong>{l.nombre}</strong>
                      <span className="muted">{l.producto_id}</span>
                    </div>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      aria-label="Quitar"
                      onClick={() => setLineas((prev) => prev.filter((x) => x.producto_id !== l.producto_id))}
                    >
                      <Icon name="trash" size={16} />
                    </button>
                  </div>
                  <div className="trp-card-linea-grid">
                    <label>
                      Piezas
                      <input
                        className="input trp-qty"
                        type="number"
                        min={1}
                        value={l.cantidad}
                        onChange={(e) => {
                          const v = Math.max(1, Math.floor(Number(e.target.value) || 1));
                          setLineas((prev) => prev.map((x) => (x.producto_id === l.producto_id ? { ...x, cantidad: v } : x)));
                        }}
                      />
                    </label>
                    <div>
                      <span className="muted">Origen</span>
                      <strong>{so}</strong>
                    </div>
                    <div>
                      <span className="muted">Destino</span>
                      <strong>{sd}</strong>
                    </div>
                    <div>
                      <span className="muted">Total</span>
                      <strong>{monetario(l.precio * l.cantidad)}</strong>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
        <footer className="trp-footer trp-footer-bar">
          <div className="trp-totals">
            <span>
              Productos: <strong>{totales.productos}</strong>
            </span>
            <span className="trp-totales-piezas">
              Piezas: <strong>{totales.piezas}</strong>
            </span>
            <span>
              Costos: <strong>{monetario(totales.costo)}</strong>
            </span>
            <span>
              Precios: <strong>{monetario(totales.precio)}</strong>
            </span>
          </div>
          {esSol ? (
            <button type="button" className="trp-btn-green" disabled={busy || !lineas.length} onClick={solicitar}>
              {busy ? 'Enviando…' : `SOLICITAR · ${totales.piezas} pza`}
            </button>
          ) : (
            <button type="button" className="trp-btn-green" disabled={busy || !lineas.length} onClick={enviar}>
              {busy ? 'Enviando…' : `ENVIAR · ${totales.piezas} pza`}
            </button>
          )}
        </footer>
      </div>
    );
  }

  if (detalleRecibir) {
    const doc = detalleRecibir;
    const res = resumenPiezas(doc.lineas);
    return (
      <div className="trp-shell trp-shell-wide">
        <header className="trp-header">
          <button type="button" className="trp-icon-btn" onClick={() => setDetalleRecibir(null)} aria-label="Volver">
            <Icon name="x" size={22} />
          </button>
          <h2>Recibir {doc.folio}</h2>
          <span style={{ width: 40 }} />
        </header>
        <div className="trp-body">
          <p className="muted" style={{ marginTop: 0 }}>
            De <strong>{etiquetaOrigenTraspaso(doc.origen_id)}</strong> → {etiquetaOrigenTraspaso(doc.destino_id)}
          </p>
          <p className="trp-resumen-chip">
            {res.productos} producto{res.productos === 1 ? '' : 's'} · <strong>{res.piezas} pieza{res.piezas === 1 ? '' : 's'}</strong>
          </p>
          <div className="trp-table-wrap trp-table-desktop">
            <table className="trp-table">
              <thead>
                <tr>
                  <th>Piezas</th>
                  <th>Producto</th>
                  <th>Precio</th>
                  <th>Costo</th>
                </tr>
              </thead>
              <tbody>
                {(doc.lineas || []).map((l) => (
                  <tr key={l.producto_id}>
                    <td><strong>{l.cantidad}</strong></td>
                    <td>{l.nombre || l.producto_id}</td>
                    <td>{monetario(l.precio)}</td>
                    <td>{monetario(l.costo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="trp-cards-mobile">
            {(doc.lineas || []).map((l) => (
              <article key={l.producto_id} className="trp-card-linea">
                <div className="trp-card-linea-top">
                  <div className="trp-card-linea-info">
                    <strong>{l.nombre || l.producto_id}</strong>
                    <span className="muted">{l.producto_id}</span>
                  </div>
                  <span className="trp-piezas-badge">{l.cantidad} pza</span>
                </div>
                <div className="trp-card-linea-grid trp-card-linea-grid-2">
                  <div>
                    <span className="muted">Precio</span>
                    <strong>{monetario(l.precio)}</strong>
                  </div>
                  <div>
                    <span className="muted">Costo</span>
                    <strong>{monetario(l.costo)}</strong>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
        <footer className="trp-footer">
          <button type="button" className="trp-btn-green" disabled={busy} onClick={() => confirmarRecibo(doc)}>
            {busy ? 'Recibiendo…' : `ACEPTAR · ${res.piezas} pza`} <Icon name="check" size={18} />
          </button>
        </footer>
      </div>
    );
  }

  // —— Hub principal ——
  return (
    <div className="trp-shell">
      <header className="trp-header">
        <button type="button" className="trp-icon-btn" onClick={onVolver} aria-label="Cerrar">
          <Icon name="x" size={22} />
        </button>
        <h2>Traspasos</h2>
        <button type="button" className="trp-icon-btn" onClick={() => void reload()} aria-label="Actualizar" title="Actualizar">
          <Icon name="refresh" size={20} />
        </button>
      </header>

      <div className="trp-layout">
        <nav className="trp-sidebar">
          {TABS.map((t) => {
            if (t.id === 'solicitar' && enCentral) return null;
            return (
              <button
                key={t.id}
                type="button"
                className={`trp-nav ${tab === t.id ? 'is-active' : ''}`}
                onClick={() => setTab(t.id)}
              >
                <Icon name={t.icon} size={20} />
                {t.label}
                {t.id === 'recibir' && pendientesRecibir.length > 0 && (
                  <span className="trp-badge">{pendientesRecibir.length}</span>
                )}
                {t.id === 'enviar' && solicitudesAtender.length > 0 && (
                  <span className="trp-badge">{solicitudesAtender.length}</span>
                )}
              </button>
            );
          })}
        </nav>

        <main className="trp-main">
          {aviso && (
            <p className="trp-aviso" role="status">
              {aviso}
            </p>
          )}
          {cargando && <p className="muted">Cargando…</p>}

          {tab === 'enviar' && (
            <>
              <p className="trp-section-label">ENVIAR PRODUCTOS A</p>
              <button type="button" className="trp-link-action" onClick={abrirNuevoEnvio}>
                <Icon name="refresh" size={18} style={{ color: 'var(--brand-blue)' }} />
                Nuevo traspaso
              </button>

              <div className="trp-section-head">
                <p className="trp-section-label" style={{ margin: 0 }}>
                  SOLICITUDES PENDIENTES
                </p>
                <button type="button" className="trp-icon-btn trp-icon-btn-sm" onClick={() => void reload()} aria-label="Actualizar">
                  <Icon name="refresh" size={18} style={{ color: 'var(--brand-blue)' }} />
                </button>
              </div>

              {solicitudesAtender.length === 0 ? (
                <EmptyFolder texto="Sin solicitudes pendientes." />
              ) : (
                <ul className="trp-list">
                  {solicitudesAtender.map((s) => (
                    <li key={s.id}>
                      <button type="button" className="trp-list-item" onClick={() => atenderSolicitud(s)}>
                        <div className="trp-list-item-body">
                          <strong>{s.folio}</strong>
                          <div className="muted">Pide {etiquetaOrigenTraspaso(s.destino_id)}</div>
                          <div className="trp-list-meta">{textoResumenLineas(s.lineas)}</div>
                        </div>
                        <span className="trp-piezas-badge">{resumenPiezas(s.lineas).piezas} pza</span>
                        <Icon name="chevronRight" size={18} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {tab === 'recibir' && (
            <>
              <div className="trp-section-head">
                <p className="trp-section-label" style={{ margin: 0 }}>
                  RECIBIR TRASPASO
                </p>
                <button type="button" className="trp-icon-btn trp-icon-btn-sm" onClick={() => void reload()} aria-label="Actualizar">
                  <Icon name="refresh" size={18} style={{ color: 'var(--brand-blue)' }} />
                </button>
              </div>
              {pendientesRecibir.length === 0 ? (
                <EmptyFolder texto="No hay traspasos por recibir." />
              ) : (
                <ul className="trp-list">
                  {pendientesRecibir.map((t) => (
                    <li key={t.id}>
                      <button type="button" className="trp-list-item" onClick={() => setDetalleRecibir(t)}>
                        <div className="trp-list-item-body">
                          <strong>{t.folio}</strong>
                          <div className="muted">De {etiquetaOrigenTraspaso(t.origen_id)}</div>
                          <div className="trp-list-meta">{textoResumenLineas(t.lineas)}</div>
                        </div>
                        <span className="trp-piezas-badge">{resumenPiezas(t.lineas).piezas} pza</span>
                        <Icon name="chevronRight" size={18} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {tab === 'solicitar' && !enCentral && (
            <>
              <p className="trp-section-label">SOLICITAR TRASPASO</p>
              <button type="button" className="trp-link-action" onClick={abrirSolicitud}>
                <Icon name="plus" size={18} style={{ color: 'var(--brand-blue)' }} />
                Nueva solicitud
              </button>
              <p className="trp-section-label" style={{ marginTop: '1.5rem' }}>
                MIS SOLICITUDES
              </p>
              {misSolicitudes.length === 0 ? (
                <EmptyFolder texto="Aún no has solicitado traspasos." />
              ) : (
                <ul className="trp-list">
                  {misSolicitudes.map((s) => (
                    <li key={s.id} className="trp-list-item static">
                      <div className="trp-list-item-body">
                        <strong>{s.folio}</strong>
                        <div className="muted">
                          A {etiquetaOrigenTraspaso(s.origen_id)} · {s.estado}
                        </div>
                        <div className="trp-list-meta">{textoResumenLineas(s.lineas)}</div>
                      </div>
                      <span className="trp-piezas-badge">{resumenPiezas(s.lineas).piezas} pza</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
