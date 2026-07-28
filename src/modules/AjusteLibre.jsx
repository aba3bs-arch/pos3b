import React, { useEffect, useMemo, useRef, useState } from 'react';
import { construirLineaConteo, aplicarConteoDepartamento, resumirConteoDepartamento, etiquetaUbicacionConteo } from '../lib/conteoDepartamento.js';
import { stockEnUbicacion, ubicacionEntradaDefault } from '../lib/inventarioMultitienda.js';
import { buscarProductoInventario } from '../lib/comprasRecepcion.js';
import { etiquetaDepartamento, listarDepartamentos, normalizarDepartamento } from '../lib/departamentos.js';
import { fmtMxn } from '../lib/valorInventario.js';
import { imprimirAjusteInventario } from '../lib/impresion.js';
import Icon from '../components/Icon.jsx';
import CampoCodigo from '../components/CampoCodigo.jsx';
import ProductoThumb from '../components/ProductoThumb.jsx';
import MenuPuntos from '../components/MenuPuntos.jsx';
import {
  borradorTieneDatos,
  eliminarAjusteEnEspera,
  guardarAjusteEnEspera,
  idAutoBorrador,
  leerBorradorAuto,
} from '../lib/ajusteInventarioBorrador.js';
import { useAutoGuardarBorrador } from '../hooks/useAutoGuardarBorrador.js';
import { productoCoincideBusqueda } from '../lib/buscarProductoTexto.js';

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

function estadoInicialLibre(sucursal, borradorInicial) {
  let base = borradorInicial;
  if (!base) {
    const auto = leerBorradorAuto('libre', sucursal);
    if (borradorTieneDatos(auto)) base = auto;
  }
  return {
    ordenIds: Array.isArray(base?.ordenIds) ? [...base.ordenIds] : [],
    conteos: base?.conteos && typeof base.conteos === 'object' ? { ...base.conteos } : {},
    borradorId: base?.id || idAutoBorrador('libre', sucursal),
    recuperado: Boolean(!borradorInicial && base && borradorTieneDatos(base)),
  };
}

export default function AjusteLibre({
  supabase,
  inventario,
  cargarDatos,
  user,
  sucursal,
  onHistorialChange,
  onCerrar,
  borradorInicial = null,
}) {
  const init = useMemo(
    () => estadoInicialLibre(sucursal, borradorInicial),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [prefs, setPrefs] = useState(leerPrefs);
  const [qLista, setQLista] = useState('');
  const [codigoEscaneo, setCodigoEscaneo] = useState('');
  const [ordenIds, setOrdenIds] = useState(init.ordenIds);
  const [conteos, setConteos] = useState(init.conteos);
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const [filtrosDraft, setFiltrosDraft] = useState(FILTROS_VACIOS);
  const [filtros, setFiltros] = useState(FILTROS_VACIOS);
  const [modalCantidad, setModalCantidad] = useState(null);
  const [modalModo, setModalModo] = useState('fijar'); // 'sumar' al escanear | 'fijar' al editar fila
  const [cantidadModal, setCantidadModal] = useState('1');
  const [siguienteAuto, setSiguienteAuto] = useState(true);
  const [aplicando, setAplicando] = useState(false);
  const [folioAplicado, setFolioAplicado] = useState(null);
  const [ultimoAjuste, setUltimoAjuste] = useState(null);
  const [busquedaCatalogo, setBusquedaCatalogo] = useState('');
  const [mostrarAgregar, setMostrarAgregar] = useState(false);
  const [avisoBusqueda, setAvisoBusqueda] = useState('');
  const [borradorId, setBorradorId] = useState(init.borradorId);
  const [avisoRecuperado, setAvisoRecuperado] = useState(init.recuperado);
  const scanRef = useRef(null);
  const cantidadRef = useRef(null);

  // Refresca productos al abrir (evita buscar sobre lista vacía / desactualizada)
  useEffect(() => {
    if (typeof cargarDatos === 'function') cargarDatos();
  }, [cargarDatos]);

  useAutoGuardarBorrador(
    () => {
      if (folioAplicado) return null;
      if (!borradorTieneDatos({ ordenIds, conteos })) return null;
      return {
        id: borradorId || idAutoBorrador('libre', sucursal),
        tipo: 'libre',
        titulo: 'Ajuste libre',
        ordenIds,
        conteos,
        sucursal,
        usuario: user?.nombre,
        auto: true,
      };
    },
    (draft) => {
      const saved = guardarAjusteEnEspera(draft);
      if (saved?.id && saved.id !== borradorId) setBorradorId(saved.id);
    },
    { enabled: !folioAplicado },
  );

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
    for (const p of inventario || []) {
      m.set(p.id, p);
      m.set(String(p.id), p);
    }
    return m;
  }, [inventario]);

  const lineas = useMemo(
    () =>
      ordenIds
        .map((id) => {
          const p = productosMap.get(id) || productosMap.get(String(id));
          if (!p) return null;
          return { ...construirLineaConteo(p, conteos[id] ?? conteos[String(id)] ?? '', sucursal), producto: p };
        })
        .filter(Boolean),
    [ordenIds, productosMap, conteos, sucursal],
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
    const t = qLista.trim();
    if (t) {
      list = list.filter((l) =>
        productoCoincideBusqueda({ id: l.codigo, nombre: l.nombre }, t),
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
      list = list.filter((p) => productoCoincideBusqueda(p, t));
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
    const pid = producto.id;
    const yaEsta = ordenIds.some((id) => String(id) === String(pid));
    if (!yaEsta) {
      setOrdenIds((prev) => (prefs.agregarAlInicio ? [pid, ...prev] : [...prev, pid]));
    }

    // Libre = sumar piezas contadas; al aplicar, existencia = total contado.
    if (opts.abrirCantidad !== false && (prefs.solicitarCantidad || opts.forzarCantidad)) {
      setModalModo('sumar');
      setModalCantidad(producto);
      setCantidadModal(String(opts.qtyAgregar ?? 1));
    } else {
      setConteos((prev) => {
        const actual = Math.max(0, Math.floor(Number(prev[pid] ?? prev[String(pid)]) || 0));
        return { ...prev, [pid]: String(actual + 1) };
      });
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
    const ingresada = Math.max(0, Math.floor(Number(cantidadModal) || 0));
    setConteos((prev) => {
      if (modalModo === 'sumar') {
        const actual = Math.max(0, Math.floor(Number(prev[pid] ?? prev[String(pid)]) || 0));
        return { ...prev, [pid]: String(actual + ingresada) };
      }
      return { ...prev, [pid]: String(ingresada) };
    });
    setModalCantidad(null);
    setModalModo('fijar');
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
    const contadas = lineas.filter((l) => l.contadaNum != null);
    if (!contadas.length) {
      return alert('Indica la cantidad contada en al menos un producto (toca la fila → cantidad).');
    }
    if (pendientes.length) {
      const seguir = confirm(
        `Hay ${pendientes.length} producto(s) sin contar.\n\n¿Aplicar solo los ${contadas.length} ya contados?`,
      );
      if (!seguir) return;
    }
    const msg = resumen.hayDiferencias
      ? `¿Aplicar ajuste libre?\n\nEl total CONTADO (suma de piezas) será la nueva existencia.\nEjemplo: hay 10 y contaste 12 → queda 12.\n\nPara SUMAR al stock actual usa «Ingreso de inventario».\n\nPiezas contadas: ${resumen.piezasContadas}\nSin diferencia: ${resumen.skusOk}\nPositiva: ${resumen.skusSobrante} (${fmtMxn(resumen.valorSobrante)})\nNegativa: ${resumen.skusFaltante} (${fmtMxn(resumen.valorFaltante)})`
      : `¿Cerrar ajuste sin diferencias?\n(Total contado ${resumen.piezasContadas} = existencia actual.)`;
    if (!confirm(msg)) return;
    setAplicando(true);
    const r = await aplicarConteoDepartamento(supabase, {
      lineas: pendientes.length ? contadas : lineas,
      inventario,
      departamento: 'LIBRE',
      usuario: user?.nombre,
      sucursal,
      permitirPendientes: pendientes.length > 0,
    });
    setAplicando(false);
    if (!r.ok) return alert(r.error);
    setFolioAplicado(r.folio);
    setUltimoAjuste(r.ajuste);
    onHistorialChange?.(r.log);
    eliminarAjusteEnEspera(borradorId || idAutoBorrador('libre', sucursal));
    eliminarAjusteEnEspera(idAutoBorrador('libre', sucursal));
    setAvisoRecuperado(false);
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
      {avisoRecuperado && !folioAplicado && ordenIds.length > 0 && (
        <p
          style={{
            margin: '0 0 0.75rem',
            padding: '0.55rem 0.65rem',
            borderRadius: 8,
            background: 'rgba(34,197,94,0.1)',
            border: '1px solid rgba(34,197,94,0.35)',
            fontSize: '0.85rem',
          }}
        >
          Se recuperó la lista que tenías ({ordenIds.length} producto(s)). No se pierde si entra una llamada.
          <button type="button" className="btn btn-ghost" style={{ marginLeft: '0.5rem', padding: '0.2rem 0.45rem', fontSize: '0.8rem' }} onClick={() => setAvisoRecuperado(false)}>
            Entendido
          </button>
        </p>
      )}

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
              <CampoCodigo
                value={busquedaCatalogo}
                onChange={(e) => {
                  setBusquedaCatalogo(e.target.value);
                  if (avisoBusqueda) setAvisoBusqueda('');
                }}
                onEscanear={(codigo) => {
                  const c = String(codigo || '').trim();
                  if (!c) return;
                  if (avisoBusqueda) setAvisoBusqueda('');
                  procesarEscaneo(c);
                }}
                beepAlEnter
                placeholder="Buscar por nombre o código… usa Cámara"
                tituloCamara="Buscar en catálogo"
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
          <p className="muted">Escanea o agrega: cada pieza se suma al contado. Al aplicar, existencia = total.</p>
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
                  setModalModo('fijar');
                  setModalCantidad(l.producto);
                  setCantidadModal(String(conteos[l.productoId] ?? l.contadaNum ?? 0));
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
              Piezas contadas: {resumen.piezasContadas} · SKUs {resumen.totalSkus - resumen.skusPendientes}/
              {resumen.totalSkus}
            </span>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            style={{ width: '100%' }}
            disabled={aplicando || lineas.every((l) => l.contadaNum == null)}
            onClick={aplicarAjuste}
          >
            {aplicando ? 'Aplicando…' : 'APLICAR AJUSTE'}
          </button>
          <p className="muted" style={{ margin: '0.5rem 0 0', fontSize: '0.78rem', textAlign: 'center' }}>
            Libre: sumas piezas → al aplicar, existencia = total contado ({etiquetaUbicacionConteo(sucursal)}).
            Ingreso: suma lo contado al stock actual.
          </p>
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
                    ${Number(modalCantidad.precio || 0).toFixed(2)} · Existencia{' '}
                    {Math.max(
                      0,
                      stockEnUbicacion(modalCantidad, sucursal, ubicacionEntradaDefault(sucursal), sucursal),
                    )}
                    {modalModo === 'sumar'
                      ? ` · Ya contado ${Math.max(0, Math.floor(Number(conteos[modalCantidad.id]) || 0))}`
                      : ''}
                  </div>
                </div>
              </div>
              <label className="muted" style={{ display: 'block', marginTop: '1rem' }}>
                {modalModo === 'sumar' ? 'Piezas a sumar al contado' : 'Total de piezas contadas'}
                <div className="muted" style={{ fontSize: '0.75rem', marginBottom: '0.35rem' }}>
                  {modalModo === 'sumar'
                    ? `Se suma a lo ya contado (${Math.max(0, Math.floor(Number(conteos[modalCantidad.id]) || 0))}). Al aplicar, la existencia queda en ese total.`
                    : 'Editas el total contado. Al aplicar, la existencia queda en este número (no suma al stock).'}
                </div>
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
