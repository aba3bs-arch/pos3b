import React, { useEffect, useMemo, useRef, useState } from 'react';
import { construirLineaConteo, aplicarConteoDepartamento, resumirConteoDepartamento } from '../lib/conteoDepartamento.js';
import { buscarProductoInventario } from '../lib/comprasRecepcion.js';
import { etiquetaDepartamento, listarDepartamentos, normalizarDepartamento } from '../lib/departamentos.js';
import { fmtMxn } from '../lib/valorInventario.js';
import { imprimirAjusteInventario } from '../lib/impresion.js';
import Icon from '../components/Icon.jsx';
import CampoCodigo from '../components/CampoCodigo.jsx';
import ProductoThumb from '../components/ProductoThumb.jsx';
import MenuPuntos from '../components/MenuPuntos.jsx';

const FILTROS_VACIOS = {
  diferencia: 'todo',
  estado: 'todo',
  departamento: '',
  categoria: '',
};

function leerPrefs() {
  try {
    const raw = localStorage.getItem('pos3b_ajuste_libre_prefs');
    const o = raw ? JSON.parse(raw) : {};
    return {
      agregarAlInicio: Boolean(o.agregarAlInicio),
      solicitarCantidad: o.solicitarCantidad !== false,
    };
  } catch {
    return { agregarAlInicio: false, solicitarCantidad: true };
  }
}

function guardarPrefs(prefs) {
  try {
    localStorage.setItem('pos3b_ajuste_libre_prefs', JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

export default function AjusteLibre({
  supabase,
  inventario,
  cargarDatos,
  user,
  sucursal,
  onHistorialChange,
  onCerrar,
}) {
  const [prefs, setPrefs] = useState(leerPrefs);
  const [qLista, setQLista] = useState('');
  const [codigoEscaneo, setCodigoEscaneo] = useState('');
  const [ordenIds, setOrdenIds] = useState([]);
  const [conteos, setConteos] = useState({});
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const [filtrosDraft, setFiltrosDraft] = useState(FILTROS_VACIOS);
  const [filtros, setFiltros] = useState(FILTROS_VACIOS);
  const [modalCantidad, setModalCantidad] = useState(null);
  const [cantidadModal, setCantidadModal] = useState('0');
  const [siguienteAuto, setSiguienteAuto] = useState(true);
  const [aplicando, setAplicando] = useState(false);
  const [folioAplicado, setFolioAplicado] = useState(null);
  const [ultimoAjuste, setUltimoAjuste] = useState(null);
  const [busquedaCatalogo, setBusquedaCatalogo] = useState('');
  const [mostrarAgregar, setMostrarAgregar] = useState(false);
  const [avisoBusqueda, setAvisoBusqueda] = useState('');
  const scanRef = useRef(null);
  const cantidadRef = useRef(null);

  // Refresca productos al abrir (evita buscar sobre lista vacía / desactualizada)
  useEffect(() => {
    if (typeof cargarDatos === 'function') cargarDatos();
  }, [cargarDatos]);

  const departamentos = useMemo(() => listarDepartamentos(inventario), [inventario]);
  const categorias = useMemo(() => {
    const set = new Set();
    for (const p of inventario || []) {
      const c = String(p.cat || '').trim();
      if (c) set.add(normalizarDepartamento(c));
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'es'));
  }, [inventario]);

  const productosMap = useMemo(() => {
    const m = new Map();
    for (const p of inventario || []) m.set(p.id, p);
    return m;
  }, [inventario]);

  const lineas = useMemo(
    () =>
      ordenIds
        .map((id) => {
          const p = productosMap.get(id);
          if (!p) return null;
          return { ...construirLineaConteo(p, conteos[id] ?? ''), producto: p };
        })
        .filter(Boolean),
    [ordenIds, productosMap, conteos],
  );

  const resumen = useMemo(() => resumirConteoDepartamento(lineas), [lineas]);

  const filtrosActivos = useMemo(() => {
    let n = 0;
    if (filtros.diferencia !== 'todo') n += 1;
    if (filtros.estado !== 'todo') n += 1;
    if (filtros.departamento) n += 1;
    if (filtros.categoria) n += 1;
    return n;
  }, [filtros]);

  const lineasVisibles = useMemo(() => {
    let list = lineas;
    const t = qLista.trim().toLowerCase();
    if (t) {
      list = list.filter(
        (l) =>
          String(l.nombre || '')
            .toLowerCase()
            .includes(t) || String(l.codigo || '').toLowerCase().includes(t),
      );
    }
    if (filtros.diferencia === 'sin') list = list.filter((l) => l.contadaNum != null && l.diferencia === 0);
    if (filtros.diferencia === 'negativa') list = list.filter((l) => l.contadaNum != null && l.diferencia < 0);
    if (filtros.diferencia === 'positiva') list = list.filter((l) => l.contadaNum != null && l.diferencia > 0);
    if (filtros.estado === 'contado') list = list.filter((l) => l.contadaNum != null);
    if (filtros.estado === 'no_contado') list = list.filter((l) => l.contadaNum == null);
    if (filtros.departamento) {
      list = list.filter((l) => normalizarDepartamento(l.producto?.cat) === filtros.departamento);
    }
    if (filtros.categoria) {
      list = list.filter((l) => normalizarDepartamento(l.producto?.cat) === filtros.categoria);
    }
    return list;
  }, [lineas, qLista, filtros]);

  const catalogoBusqueda = useMemo(() => {
    const t = busquedaCatalogo.trim().toLowerCase();
    const enLista = new Set(ordenIds);
    let list = (inventario || []).filter((p) => !enLista.has(p.id));
    if (t) {
      const tDigits = t.replace(/^0+/, '') || t;
      list = list.filter((p) => {
        const id = String(p.id || '');
        const nombre = String(p.nombre || '').toLowerCase();
        if (nombre.includes(t) || id.toLowerCase().includes(t)) return true;
        if (/^\d+$/.test(t) && /^\d+$/.test(id)) {
          const idN = id.replace(/^0+/, '') || id;
          return idN.includes(tDigits) || tDigits.includes(idN);
        }
        return false;
      });
    } else {
      // Sin texto: muestra primeros del catálogo para elegir rápido
      list = [...list].sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es'));
    }
    return list.slice(0, 60);
  }, [inventario, busquedaCatalogo, ordenIds]);

  useEffect(() => {
    if (modalCantidad) {
      setTimeout(() => {
        cantidadRef.current?.focus();
        cantidadRef.current?.select();
      }, 50);
    }
  }, [modalCantidad]);

  const setPref = (key, value) => {
    setPrefs((prev) => {
      const next = { ...prev, [key]: value };
      guardarPrefs(next);
      return next;
    });
  };

  const agregarProducto = (producto, opts = {}) => {
    if (!producto?.id || folioAplicado) return;
    const yaEsta = ordenIds.includes(producto.id);
    if (!yaEsta) {
      setOrdenIds((prev) => (prefs.agregarAlInicio ? [producto.id, ...prev] : [...prev, producto.id]));
    }
    if (opts.abrirCantidad !== false && (prefs.solicitarCantidad || opts.forzarCantidad)) {
      setModalCantidad(producto);
      setCantidadModal(String(conteos[producto.id] ?? (Number(producto.stock) || 0)));
    } else if (!yaEsta && conteos[producto.id] == null) {
      setConteos((prev) => ({ ...prev, [producto.id]: '' }));
    }
    setMostrarAgregar(false);
    setBusquedaCatalogo('');
    setCodigoEscaneo('');
    setAvisoBusqueda('');
  };

  const abrirBusquedaCatalogo = (texto, aviso = '') => {
    setBusquedaCatalogo(String(texto || '').trim());
    setAvisoBusqueda(aviso);
    setMostrarAgregar(true);
    setCodigoEscaneo('');
  };

  const procesarEscaneo = (raw) => {
    const codigo = String(raw ?? codigoEscaneo).trim();
    if (!codigo) return;
    if (!inventario?.length) {
      return alert('El catálogo aún no está cargado en esta pantalla. Vuelve a Productos, espera a que cargue la lista y abre de nuevo el ajuste.');
    }
    const { producto, ambiguo, candidatos } = buscarProductoInventario(inventario, codigo);
    if (producto) {
      agregarProducto(producto);
      return;
    }
    if (ambiguo || (candidatos && candidatos.length > 1)) {
      abrirBusquedaCatalogo(codigo, 'Varios coinciden — elige uno de la lista.');
      return;
    }
    abrirBusquedaCatalogo(
      codigo,
      `No hay match exacto para «${codigo}». Busca por nombre abajo, o si solo está en el catálogo del proveedor: Proveedores → Registrar en inventario.`,
    );
  };

  const aceptarCantidad = () => {
    if (!modalCantidad) return;
    const pid = modalCantidad.id;
    setConteos((prev) => ({ ...prev, [pid]: String(cantidadModal) }));
    setModalCantidad(null);
    if (siguienteAuto) scanRef.current?.focus();
  };

  const quitarDeLista = (productoId) => {
    setOrdenIds((prev) => prev.filter((id) => id !== productoId));
    setConteos((prev) => {
      const n = { ...prev };
      delete n[productoId];
      return n;
    });
  };

  const aplicarAjuste = async () => {
    if (!lineas.length) return alert('Agrega productos a la lista de ajuste.');
    const pendientes = lineas.filter((l) => l.contadaNum == null);
    if (pendientes.length) {
      return alert(`Aún faltan ${pendientes.length} producto(s) por contar.`);
    }
    const msg = resumen.hayDiferencias
      ? `¿Aplicar ajuste?\n\nSin diferencia: ${resumen.skusOk}\nPositiva: ${resumen.skusSobrante} (${fmtMxn(resumen.valorSobrante)})\nNegativa: ${resumen.skusFaltante} (${fmtMxn(resumen.valorFaltante)})`
      : '¿Cerrar ajuste sin diferencias?';
    if (!confirm(msg)) return;
    setAplicando(true);
    const r = await aplicarConteoDepartamento(supabase, {
      lineas,
      inventario,
      departamento: 'LIBRE',
      usuario: user?.nombre,
      sucursal,
    });
    setAplicando(false);
    if (!r.ok) return alert(r.error);
    setFolioAplicado(r.folio);
    setUltimoAjuste(r.ajuste);
    onHistorialChange?.(r.log);
    cargarDatos();
    alert(`${r.mensaje}\n\nFolio: ${r.folio}`);
  };

  const imprimir = () => {
    imprimirAjusteInventario({
      folio: folioAplicado || 'BORRADOR',
      sucursal,
      usuario: user?.nombre,
      departamento: 'Ajuste libre',
      resumen: ultimoAjuste?.resumen || resumen,
      lineas: (ultimoAjuste?.lineas || lineas).filter((l) => l.contadaNum != null || l.contada != null),
      aplicado: Boolean(folioAplicado),
    });
  };

  const menuItems = [
    {
      id: 'inicio',
      label: prefs.agregarAlInicio ? '✓ Agregar producto al inicio de la lista' : 'Agregar producto al inicio de la lista',
      onClick: () => setPref('agregarAlInicio', !prefs.agregarAlInicio),
    },
    {
      id: 'cantidad',
      label: prefs.solicitarCantidad
        ? '✓ Solicitar la cantidad al agregar un producto a la lista'
        : 'Solicitar la cantidad al agregar un producto a la lista',
      onClick: () => setPref('solicitarCantidad', !prefs.solicitarCantidad),
    },
  ];

  return (
    <div className="ajuste-libre">
      <header className="ajuste-libre-header">
        {typeof onCerrar === 'function' ? (
          <button type="button" className="ajuste-libre-iconbtn" onClick={onCerrar} aria-label="Cerrar">
            <Icon name="x" size={20} />
          </button>
        ) : (
          <span style={{ width: 40 }} />
        )}
        <h3>Ajuste</h3>
        <div className="ajuste-libre-menu">
          <MenuPuntos items={menuItems} />
        </div>
      </header>

      <div className="ajuste-libre-toolbar">
        <div className="ajuste-libre-search">
          <Icon name="search" size={16} />
          <input
            className="input"
            value={qLista}
            onChange={(e) => setQLista(e.target.value)}
            placeholder="Buscar en lista de ajuste"
            aria-label="Buscar en lista de ajuste"
          />
          <button
            type="button"
            className={`ajuste-libre-filtro-btn ${mostrarFiltros || filtrosActivos ? 'activo' : ''}`}
            onClick={() => {
              setFiltrosDraft(filtros);
              setMostrarFiltros((v) => !v);
            }}
            title="Filtros"
          >
            <Icon name="settings" size={16} />
            {filtrosActivos > 0 && <span className="ajuste-libre-badge">{filtrosActivos}</span>}
          </button>
        </div>

        {mostrarFiltros && (
          <div className="ajuste-libre-filtros">
            <div className="ajuste-libre-filtro-grupo">
              <span>Diferencia</span>
              <div className="ajuste-libre-chips">
                {[
                  { id: 'todo', label: 'Todo' },
                  { id: 'sin', label: 'Sin diferencia' },
                  { id: 'negativa', label: 'Diferencia negativa' },
                  { id: 'positiva', label: 'Diferencia positiva' },
                ].map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={filtrosDraft.diferencia === c.id ? 'activo' : ''}
                    onClick={() => setFiltrosDraft({ ...filtrosDraft, diferencia: c.id })}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="ajuste-libre-filtro-grupo">
              <span>Estado</span>
              <div className="ajuste-libre-chips">
                {[
                  { id: 'todo', label: 'Todo' },
                  { id: 'contado', label: 'Contado' },
                  { id: 'no_contado', label: 'No contado' },
                ].map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={filtrosDraft.estado === c.id ? 'activo' : ''}
                    onClick={() => setFiltrosDraft({ ...filtrosDraft, estado: c.id })}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
            <label className="ajuste-libre-select-row">
              <span>Departamentos</span>
              <select
                className="select"
                value={filtrosDraft.departamento}
                onChange={(e) => setFiltrosDraft({ ...filtrosDraft, departamento: e.target.value })}
              >
                <option value="">Todos</option>
                {departamentos.map((d) => (
                  <option key={d} value={d}>
                    {etiquetaDepartamento(d)}
                  </option>
                ))}
              </select>
            </label>
            <label className="ajuste-libre-select-row">
              <span>Categorías</span>
              <select
                className="select"
                value={filtrosDraft.categoria}
                onChange={(e) => setFiltrosDraft({ ...filtrosDraft, categoria: e.target.value })}
              >
                <option value="">Todas</option>
                {categorias.map((c) => (
                  <option key={c} value={c}>
                    {etiquetaDepartamento(c)}
                  </option>
                ))}
              </select>
            </label>
            <div className="ajuste-libre-filtros-acciones">
              <button
                type="button"
                className="btn btn-ghost"
                style={{ color: 'var(--brand-red)' }}
                onClick={() => {
                  setFiltrosDraft(FILTROS_VACIOS);
                  setFiltros(FILTROS_VACIOS);
                }}
              >
                Limpiar ({filtrosActivos})
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setFiltros({ ...filtrosDraft });
                  setMostrarFiltros(false);
                }}
              >
                Buscar
              </button>
            </div>
          </div>
        )}
      </div>

      {!folioAplicado && (
        <div className="ajuste-libre-scan card">
          <label className="muted" style={{ display: 'block' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
              <Icon name="scan" size={16} />
              Escanear o buscar para agregar
            </span>
            <div style={{ marginTop: '0.35rem' }}>
              <CampoCodigo
                inputRef={scanRef}
                value={codigoEscaneo}
                onChange={(e) => setCodigoEscaneo(e.target.value)}
                onEscanear={procesarEscaneo}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    procesarEscaneo(e.target.value);
                  }
                }}
                placeholder="Código de barras o nombre…"
                tituloCamara="Agregar a ajuste libre"
              >
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    if (!inventario?.length) {
                      alert('El catálogo no está cargado aquí. Abre Productos, confirma que ves la lista y vuelve a entrar a Ajuste.');
                      return;
                    }
                    setMostrarAgregar((v) => !v);
                  }}
                >
                  <Icon name="plus" size={16} />
                  Agregar
                </button>
              </CampoCodigo>
            </div>
          </label>

          {mostrarAgregar && (
            <div className="ajuste-libre-agregar">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'center', marginBottom: '0.45rem' }}>
                <span className="muted" style={{ fontSize: '0.8rem' }}>
                  Catálogo ({(inventario || []).length} productos) · elige uno para agregarlo
                </span>
                <button type="button" className="btn btn-ghost" style={{ padding: '0.25rem 0.45rem', fontSize: '0.78rem' }} onClick={() => setMostrarAgregar(false)}>
                  Cerrar
                </button>
              </div>
              <input
                className="input"
                value={busquedaCatalogo}
                onChange={(e) => {
                  setBusquedaCatalogo(e.target.value);
                  if (avisoBusqueda) setAvisoBusqueda('');
                }}
                placeholder="Buscar por nombre o código…"
                autoFocus
              />
              {avisoBusqueda ? (
                <p className="muted" style={{ margin: '0.45rem 0 0', fontSize: '0.8rem', color: 'var(--brand-red)' }}>
                  {avisoBusqueda}
                </p>
              ) : null}
              <div className="ajuste-libre-agregar-lista">
                {!(inventario || []).length ? (
                  <p className="muted" style={{ padding: '0.75rem', margin: 0, fontSize: '0.85rem' }}>
                    No hay productos cargados. Ve a Productos, confirma que el catálogo aparece en la lista y vuelve a abrir el ajuste.
                  </p>
                ) : catalogoBusqueda.length === 0 ? (
                  <p className="muted" style={{ padding: '0.75rem', margin: 0, fontSize: '0.85rem' }}>
                    {busquedaCatalogo.trim()
                      ? `Sin resultados para «${busquedaCatalogo.trim()}». Prueba con otra parte del nombre o el código completo.`
                      : 'No hay más productos disponibles para agregar.'}
                  </p>
                ) : (
                  catalogoBusqueda.map((p) => (
                    <button key={p.id} type="button" className="ajuste-libre-agregar-item" onClick={() => agregarProducto(p)}>
                      <ProductoThumb producto={p} size={40} />
                      <span>
                        <strong>{p.nombre}</strong>
                        <small className="muted">
                          {p.id} · Existencia {Number(p.stock) || 0}
                        </small>
                      </span>
                      <span className="ajuste-libre-agregar-precio">${Number(p.precio || 0).toFixed(2)}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {folioAplicado ? (
        <div className="card" style={{ borderTop: '4px solid var(--brand-green)' }}>
          <h4 style={{ margin: '0 0 0.35rem', color: 'var(--brand-green)' }}>Ajuste aplicado</h4>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--brand-blue)', fontFamily: 'ui-monospace, monospace' }}>
            {folioAplicado}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-primary" onClick={imprimir}>
              Imprimir folio
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setOrdenIds([]);
                setConteos({});
                setFolioAplicado(null);
                setUltimoAjuste(null);
              }}
            >
              Nuevo ajuste
            </button>
          </div>
        </div>
      ) : lineas.length === 0 ? (
        <div className="ajuste-libre-vacio">
          <div className="ajuste-libre-vacio-circulo">
            <Icon name="package" size={42} />
          </div>
          <strong>Aún no agregas productos para contar</strong>
          <p className="muted">Agrega productos para comenzar</p>
        </div>
      ) : (
        <div className="ajuste-libre-lista">
          {lineasVisibles.length === 0 ? (
            <p className="muted" style={{ textAlign: 'center', padding: '1.5rem' }}>
              No hay productos con estos filtros.
            </p>
          ) : (
            lineasVisibles.map((l) => (
              <button
                key={l.productoId}
                type="button"
                className={`ajuste-libre-item ${l.contadaNum == null ? 'pendiente' : l.diferencia === 0 ? 'ok' : l.diferencia > 0 ? 'pos' : 'neg'}`}
                onClick={() => {
                  setModalCantidad(l.producto);
                  setCantidadModal(String(conteos[l.productoId] ?? l.existencia));
                }}
              >
                <ProductoThumb producto={l.producto} size={52} />
                <div className="ajuste-libre-item-meta">
                  <div className="ajuste-libre-item-codigo">{l.codigo}</div>
                  <div className="ajuste-libre-item-nombre">{l.nombre}</div>
                  <div className="ajuste-libre-item-depto">{etiquetaDepartamento(l.producto?.cat)}</div>
                </div>
                <div className="ajuste-libre-item-nums">
                  <div>
                    <span className="muted">Exist.</span>
                    <strong>{l.existencia}</strong>
                  </div>
                  <div>
                    <span className="muted">Contado</span>
                    <strong>{l.contadaNum == null ? '—' : l.contadaNum}</strong>
                  </div>
                  <div>
                    <span className="muted">Dif.</span>
                    <strong>
                      {l.contadaNum == null ? '—' : l.diferencia === 0 ? '0' : l.diferencia > 0 ? `+${l.diferencia}` : l.diferencia}
                    </strong>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ padding: '0.25rem', color: 'var(--brand-red)' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    quitarDeLista(l.productoId);
                  }}
                  title="Quitar de la lista"
                >
                  <Icon name="trash" size={16} />
                </button>
              </button>
            ))
          )}
        </div>
      )}

      {lineas.length > 0 && !folioAplicado && (
        <footer className="ajuste-libre-footer">
          <div className="ajuste-libre-resumen">
            <span>Sin diferencia ({resumen.skusOk})</span>
            <span className="pos">Diferencia positiva ({resumen.skusSobrante}) {fmtMxn(resumen.valorSobrante)}</span>
            <span className="neg">Diferencia negativa ({resumen.skusFaltante}) {fmtMxn(resumen.valorFaltante)}</span>
            <span>
              Total ({resumen.totalSkus - resumen.skusPendientes}/{resumen.totalSkus}){' '}
              {fmtMxn(resumen.valorSobrante - resumen.valorFaltante)}
            </span>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            style={{ width: '100%' }}
            disabled={aplicando || resumen.skusPendientes > 0}
            onClick={aplicarAjuste}
          >
            {aplicando ? 'Aplicando…' : 'APLICAR AJUSTE'}
          </button>
        </footer>
      )}

      {modalCantidad && (
        <div className="prod-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="ajuste-cantidad-titulo">
          <div className="ajuste-libre-modal-cantidad">
            <header className="prod-modal-header">
              <button type="button" className="prod-modal-close" onClick={() => setModalCantidad(null)} aria-label="Cerrar">
                <Icon name="x" size={18} />
              </button>
              <h2 id="ajuste-cantidad-titulo">Cantidad</h2>
              <span style={{ width: 36 }} />
            </header>
            <div className="ajuste-libre-modal-body">
              <div className="ajuste-libre-modal-prod">
                <ProductoThumb producto={modalCantidad} size={64} />
                <div>
                  <div className="muted" style={{ fontSize: '0.8rem' }}>{modalCantidad.id}</div>
                  <strong>{modalCantidad.nombre}</strong>
                  <div className="muted" style={{ fontSize: '0.85rem', marginTop: '0.2rem' }}>
                    ${Number(modalCantidad.precio || 0).toFixed(2)} · Existencia {Number(modalCantidad.stock) || 0}
                  </div>
                </div>
              </div>
              <label className="muted" style={{ display: 'block', marginTop: '1rem' }}>
                Cantidad
                <div className="ajuste-libre-stepper">
                  <button type="button" onClick={() => setCantidadModal(String(Math.max(0, (parseInt(cantidadModal, 10) || 0) - 1)))}>
                    −
                  </button>
                  <input
                    ref={cantidadRef}
                    className="input"
                    type="number"
                    min={0}
                    value={cantidadModal}
                    onChange={(e) => setCantidadModal(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        aceptarCantidad();
                      }
                    }}
                  />
                  <button type="button" onClick={() => setCantidadModal(String((parseInt(cantidadModal, 10) || 0) + 1))}>
                    +
                  </button>
                </div>
              </label>
              <label className="ajuste-libre-toggle">
                <span>Siguiente automático</span>
                <input type="checkbox" checked={siguienteAuto} onChange={(e) => setSiguienteAuto(e.target.checked)} />
              </label>
            </div>
            <footer className="ajuste-libre-modal-footer">
              <button type="button" className="btn btn-ghost" onClick={() => setModalCantidad(null)}>
                <Icon name="chevronRight" size={16} style={{ transform: 'rotate(180deg)' }} />
              </button>
              <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={aceptarCantidad}>
                ACEPTAR
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
