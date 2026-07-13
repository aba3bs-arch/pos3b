import React, { useEffect, useMemo, useRef, useState } from 'react';
import { aplicarEntradasMasivas, aplicarMovimientoInventario, leerMovimientosLocal, TIPOS_MOVIMIENTO } from '../lib/inventarioMovimientos.js';
import {
  SUBTIPOS_TRASPASO,
  aplicarTraspasosMasivos,
  etiquetaSubtipoTraspaso,
  resolverTraspaso,
  stockEnUbicacion,
  subtiposTraspasoParaSucursal,
} from '../lib/ubicacionInventario.js';
import { imprimirMovimientoInventario } from '../lib/impresion.js';
import { buscarProductoInventario } from '../lib/comprasRecepcion.js';
import { listarSucursales, etiquetaTienda } from '../constants/sucursales.js';
import { esAlmacenCentral, etiquetaAlmacenCentral, etiquetaCedisEmpresa } from '../lib/inventarioMultitienda.js';
import Icon from '../components/Icon.jsx';
import CampoCodigo from '../components/CampoCodigo.jsx';
import ConteoPorDepartamento from './ConteoPorDepartamento.jsx';
import AjusteLibre from './AjusteLibre.jsx';
import {
  FILTROS_HISTORIAL_TIPO,
  PRESETS_FECHA_PRODUCTO,
  filtrarHistorialReciente,
  rangoDesdePreset,
} from '../lib/consultasInventario.js';
import FiltroPeriodo from '../components/FiltroPeriodo.jsx';
import {
  borradorTieneDatos,
  eliminarAjusteEnEspera,
  guardarAjusteEnEspera,
  idAutoBorrador,
  leerBorradorAuto,
} from '../lib/ajusteInventarioBorrador.js';
import { useAutoGuardarBorrador } from '../hooks/useAutoGuardarBorrador.js';

const TIPOS_MOV = TIPOS_MOVIMIENTO.filter((t) => t.id === 'entrada' || t.id === 'retiro');

function lineasMasivasIniciales(modoInicial, sucursalOp, borradorInicial) {
  if (modoInicial !== 'masivo') return [];
  const base = borradorInicial?.tipo === 'masivo' ? borradorInicial : leerBorradorAuto('masivo', sucursalOp);
  if (borradorTieneDatos(base) && Array.isArray(base.lineasMasivas)) return base.lineasMasivas.map((l) => ({ ...l }));
  return [];
}

export default function AjusteInventario({
  supabase,
  inventario,
  inventarioCompleto,
  cargarDatos,
  user,
  sucursal,
  sucursalOperacion,
  puedeElegirTienda = false,
  sucursalesLista: sucursalesListaProp,
  modoInicial = 'libre',
  tipoInicial = 'entrada',
  departamentoInicial = null,
  borradorInicial = null,
  ocultarSelectorModo = false,
  embebido = false,
  onVolver = null,
}) {
  const sucursalOp = sucursalOperacion || sucursal;
  const enCentral = esAlmacenCentral(sucursalOp);
  const catalogoCompleto = inventarioCompleto || inventario;
  const [modo, setModo] = useState(modoInicial);
  const [tipo, setTipo] = useState(tipoInicial || 'entrada');
  const [productoId, setProductoId] = useState('');
  const [cantidad, setCantidad] = useState('1');
  const [motivo, setMotivo] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [historial, setHistorial] = useState(() => leerMovimientosLocal());
  const [filtroHistTipo, setFiltroHistTipo] = useState('');
  const [filtroHistFecha, setFiltroHistFecha] = useState('7d');
  const [histDesde, setHistDesde] = useState('');
  const [histHasta, setHistHasta] = useState('');
  const [aplicando, setAplicando] = useState(false);
  const [lineasMasivas, setLineasMasivas] = useState(() => lineasMasivasIniciales(modoInicial, sucursalOp, borradorInicial));
  const [avisoMasivoRecuperado, setAvisoMasivoRecuperado] = useState(
    () => modoInicial === 'masivo' && !borradorInicial && borradorTieneDatos(leerBorradorAuto('masivo', sucursalOp)),
  );
  const [busquedaMasiva, setBusquedaMasiva] = useState('');
  const [productoMasivoId, setProductoMasivoId] = useState('');
  const [codigoEscaneo, setCodigoEscaneo] = useState('');
  const [subtipoTraspaso, setSubtipoTraspaso] = useState(() => (esAlmacenCentral(sucursalOperacion || sucursal) ? 'central_tienda' : 'tienda_tienda'));
  const [sucursalDestinoTraspaso, setSucursalDestinoTraspaso] = useState('');
  const [lineasTraspaso, setLineasTraspaso] = useState([]);
  const [busquedaTraspaso, setBusquedaTraspaso] = useState('');
  const [productoTraspasoId, setProductoTraspasoId] = useState('');
  const [codigoEscaneoTraspaso, setCodigoEscaneoTraspaso] = useState('');
  const scanInputRef = useRef(null);
  const cantidadInputRef = useRef(null);

  useEffect(() => {
    if (modoInicial) setModo(modoInicial);
  }, [modoInicial]);

  useEffect(() => {
    if (tipoInicial) setTipo(tipoInicial);
  }, [tipoInicial]);

  useEffect(() => {
    if (modo === 'libre') scanInputRef.current?.focus();
  }, [modo]);

  useAutoGuardarBorrador(
    () => {
      if (modo !== 'masivo') return null;
      if (!lineasMasivas.length) return null;
      return {
        id: idAutoBorrador('masivo', sucursalOp),
        tipo: 'masivo',
        titulo: 'Entrada masiva',
        lineasMasivas,
        sucursal: sucursalOp,
        usuario: user?.nombre,
        auto: true,
      };
    },
    (draft) => guardarAjusteEnEspera(draft),
    { enabled: modo === 'masivo' },
  );

  const productosFiltrados = useMemo(() => {
    let list = inventario || [];
    const t = busqueda.trim().toLowerCase();
    if (t) {
      list = list.filter(
        (p) =>
          String(p.nombre || '')
            .toLowerCase()
            .includes(t) || String(p.id || '').toLowerCase().includes(t),
      );
    }
    return list.slice(0, 80);
  }, [inventario, busqueda]);

  const rangoHistorial = useMemo(() => {
    if (filtroHistFecha === 'rango') return { desde: histDesde || null, hasta: histHasta || null };
    return rangoDesdePreset(filtroHistFecha) || { desde: null, hasta: null };
  }, [filtroHistFecha, histDesde, histHasta]);

  const historialFiltrado = useMemo(
    () => filtrarHistorialReciente(historial, { tipo: filtroHistTipo, ...rangoHistorial }),
    [historial, filtroHistTipo, rangoHistorial],
  );

  const productoOrigen = inventario.find((p) => p.id === productoId);
  const sucursalesLista = useMemo(() => sucursalesListaProp || listarSucursales(), [sucursalesListaProp]);

  const subtiposDisponibles = useMemo(() => subtiposTraspasoParaSucursal(sucursalOp), [sucursalOp]);

  useEffect(() => {
    if (!subtiposDisponibles.some((s) => s.id === subtipoTraspaso)) {
      setSubtipoTraspaso(subtiposDisponibles[0]?.id || 'piso_cedis');
    }
  }, [subtiposDisponibles, subtipoTraspaso]);

  const rutaTraspaso = useMemo(
    () => resolverTraspaso(subtipoTraspaso, sucursalOp, sucursalDestinoTraspaso),
    [subtipoTraspaso, sucursalOp, sucursalDestinoTraspaso],
  );

  const productosBusquedaTraspaso = useMemo(() => {
    const t = busquedaTraspaso.trim().toLowerCase();
    let list = inventario || [];
    if (t) {
      list = list.filter(
        (p) =>
          String(p.nombre || '')
            .toLowerCase()
            .includes(t) || String(p.id || '').toLowerCase().includes(t),
      );
    }
    const idsEnLista = new Set(lineasTraspaso.map((l) => l.productoId));
    return list.filter((p) => !idsEnLista.has(p.id)).slice(0, 40);
  }, [inventario, busquedaTraspaso, lineasTraspaso]);

  const productosBusquedaMasiva = useMemo(() => {
    const t = busquedaMasiva.trim().toLowerCase();
    let list = inventario || [];
    if (t) {
      list = list.filter(
        (p) =>
          String(p.nombre || '')
            .toLowerCase()
            .includes(t) || String(p.id || '').toLowerCase().includes(t),
      );
    }
    const idsEnLista = new Set(lineasMasivas.map((l) => l.productoId));
    return list.filter((p) => !idsEnLista.has(p.id)).slice(0, 40);
  }, [inventario, busquedaMasiva, lineasMasivas]);

  const agregarProductoTraspaso = (producto) => {
    if (!producto?.id) return;
    if (lineasTraspaso.some((l) => l.productoId === producto.id)) {
      alert('Ese producto ya está en la lista de traspaso.');
      return;
    }
    if (!rutaTraspaso) {
      alert('Selecciona una tienda destino para el traspaso entre tiendas.');
      return;
    }
    setLineasTraspaso([...lineasTraspaso, { productoId: producto.id, cantidad: '1' }]);
    setProductoTraspasoId('');
    setBusquedaTraspaso('');
    setCodigoEscaneoTraspaso('');
  };

  const procesarEscaneoTraspaso = (raw) => {
    const codigo = String(raw ?? codigoEscaneoTraspaso).trim();
    if (!codigo) return;
    const base = catalogoCompleto;
    if (!base?.length) {
      return alert('El inventario aún no está cargado. Ve a Productos, espera a que aparezca la lista y vuelve a intentar.');
    }
    const { producto, ambiguo } = buscarProductoInventario(base, codigo);
    if (ambiguo) {
      setBusquedaTraspaso(codigo);
      setCodigoEscaneoTraspaso('');
      alert('Varios productos coinciden. Elige uno de la lista.');
      return;
    }
    if (!producto) {
      setBusquedaTraspaso(codigo);
      setCodigoEscaneoTraspaso('');
      alert(
        `No está en inventario (tabla Productos): ${codigo}\n\n` +
          'Si solo lo agregaste al catálogo del proveedor, entra a Proveedores → edita el proveedor → «Registrar en inventario».\n' +
          'Si ya está en Productos, revisa que el código de barras sea exactamente el id del producto.',
      );
      return;
    }
    agregarProductoTraspaso(producto);
  };

  const procesarEscaneo = (raw) => {
    const codigo = String(raw ?? codigoEscaneo).trim();
    if (!codigo) return;
    const base = catalogoCompleto;
    if (!base?.length) {
      return alert('El inventario aún no está cargado. Ve a Productos, espera a que aparezca la lista y vuelve a intentar.');
    }
    const { producto, ambiguo } = buscarProductoInventario(base, codigo);
    if (ambiguo) {
      setBusqueda(codigo);
      setCodigoEscaneo('');
      alert('Varios productos coinciden. Elige uno de la lista.');
      return;
    }
    if (!producto) {
      setBusqueda(codigo);
      setCodigoEscaneo('');
      alert(
        `No está en inventario (tabla Productos): ${codigo}\n\n` +
          'Si solo lo agregaste al catálogo del proveedor, entra a Proveedores → edita el proveedor → «Registrar en inventario».\n' +
          'Si ya está en Productos, revisa que el código de barras sea exactamente el id del producto.',
      );
      scanInputRef.current?.focus();
      return;
    }
    setProductoId(producto.id);
    setBusqueda('');
    setCodigoEscaneo('');
    cantidadInputRef.current?.focus();
    cantidadInputRef.current?.select();
  };

  const onScanKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      procesarEscaneo(e.target.value);
    }
  };

  const aplicar = async () => {
    setAplicando(true);
    const r = await aplicarMovimientoInventario(supabase, {
      tipo,
      productoOrigen,
      cantidad,
      motivo,
      usuario: user?.nombre,
      sucursal: sucursalOp,
      sucursalOperacion: sucursalOp,
      inventarioCompleto: catalogoCompleto,
      modo: 'libre',
      departamento: null,
    });
    setAplicando(false);
    if (!r.ok) {
      alert(r.error);
      return;
    }
    alert(r.mensaje);
    setHistorial(r.log || leerMovimientosLocal());
    setCantidad('1');
    setMotivo('');
    setProductoId('');
    setCodigoEscaneo('');
    cargarDatos();
    if (modo === 'libre') scanInputRef.current?.focus();
  };

  const agregarLineaMasiva = () => {
    if (!productoMasivoId) return alert('Elige un producto para agregar.');
    if (lineasMasivas.some((l) => l.productoId === productoMasivoId)) return alert('Ese producto ya está en la lista.');
    setLineasMasivas([...lineasMasivas, { productoId: productoMasivoId, cantidad: '1' }]);
    setProductoMasivoId('');
    setBusquedaMasiva('');
  };

  const actualizarCantidadMasiva = (productoId, cantidad) => {
    setLineasMasivas(lineasMasivas.map((l) => (l.productoId === productoId ? { ...l, cantidad } : l)));
  };

  const quitarLineaMasiva = (productoId) => {
    setLineasMasivas(lineasMasivas.filter((l) => l.productoId !== productoId));
  };

  const aplicarMasivo = async () => {
    const validas = lineasMasivas.filter((l) => l.productoId && Number(l.cantidad) > 0);
    if (!validas.length) return alert('Agrega al menos un producto con cantidad.');
    if (!confirm(`¿Registrar entrada de ${validas.length} producto(s)?`)) return;
    setAplicando(true);
    const r = await aplicarEntradasMasivas(supabase, {
      lineas: validas,
      inventario,
      inventarioCompleto: catalogoCompleto,
      motivo,
      usuario: user?.nombre,
      sucursal: sucursalOp,
      sucursalOperacion: sucursalOp,
    });
    setAplicando(false);
    if (!r.ok) {
      alert(r.error);
      return;
    }
    alert(r.mensaje + (r.errores?.length ? `\n\nErrores:\n${r.errores.join('\n')}` : ''));
    setHistorial(r.log || leerMovimientosLocal());
    eliminarAjusteEnEspera(idAutoBorrador('masivo', sucursalOp));
    setAvisoMasivoRecuperado(false);
    const lineasPrint = validas.map((l) => {
      const p = inventario.find((x) => x.id === l.productoId);
      return { id: l.productoId, nombre: p?.nombre || l.productoId, cantidad: l.cantidad, tipo: 'entrada' };
    });
    await imprimirMovimientoInventario({
      titulo: 'ENTRADA MÚLTIPLE DE INVENTARIO',
      sucursal: sucursalOp,
      usuario: user?.nombre,
      motivo,
      lineas: lineasPrint,
    });
    setLineasMasivas([]);
    setMotivo('');
    cargarDatos();
  };

  const quitarLineaTraspaso = (productoId) => {
    setLineasTraspaso(lineasTraspaso.filter((l) => l.productoId !== productoId));
  };

  const actualizarCantidadTraspaso = (productoId, cantidad) => {
    setLineasTraspaso(lineasTraspaso.map((l) => (l.productoId === productoId ? { ...l, cantidad } : l)));
  };

  const agregarLineaTraspaso = () => {
    const p = inventario.find((x) => x.id === productoTraspasoId);
    if (!p) return alert('Elige un producto para agregar.');
    agregarProductoTraspaso(p);
  };

  const aplicarTraspaso = async () => {
    const validas = lineasTraspaso.filter((l) => l.productoId && Number(l.cantidad) > 0);
    if (!validas.length) return alert('Agrega al menos un producto con cantidad.');
    if (!rutaTraspaso) return alert('Selecciona una tienda destino distinta a la origen.');
    const etiqueta = etiquetaSubtipoTraspaso(subtipoTraspaso);
    if (!confirm(`¿Aplicar traspaso (${etiqueta}) de ${validas.length} producto(s)?`)) return;
    setAplicando(true);
    const r = await aplicarTraspasosMasivos(supabase, {
      lineas: validas,
      inventario: catalogoCompleto,
      subtipo: subtipoTraspaso,
      sucursalOrigen: sucursalOp,
      sucursalDestino: sucursalDestinoTraspaso,
      motivo,
      usuario: user?.nombre,
      sucursalActiva: sucursalOp,
    });
    setAplicando(false);
    if (!r.ok) {
      alert(r.error);
      return;
    }
    alert(r.mensaje + (r.errores?.length ? `\n\nErrores:\n${r.errores.join('\n')}` : ''));
    setHistorial(r.log || leerMovimientosLocal());
    const lineasPrint = validas.map((l) => {
      const p = inventario.find((x) => x.id === l.productoId);
      return {
        id: l.productoId,
        nombre: p?.nombre || l.productoId,
        cantidad: l.cantidad,
        tipo: etiqueta,
      };
    });
    await imprimirMovimientoInventario({
      titulo: `TRASPASO — ${etiqueta.toUpperCase()}`,
      sucursal: sucursalOp,
      usuario: user?.nombre,
      motivo,
      lineas: lineasPrint,
    });
    setLineasTraspaso([]);
    setMotivo('');
    cargarDatos();
  };

  const imprimirHistorial = () => {
    const recientes = historialFiltrado.slice(0, 100).map((m) => ({
      id: m.producto_id,
      nombre: m.producto_nombre || m.producto_id,
      cantidad: m.cantidad,
      tipo:
        m.traspaso_origen && m.traspaso_destino
          ? `${m.traspaso_origen} → ${m.traspaso_destino}`
          : m.tipo + (m.producto_destino_nombre ? ` → ${m.producto_destino_nombre}` : ''),
    }));
    imprimirMovimientoInventario({
      titulo: 'HISTORIAL DE MOVIMIENTOS',
      sucursal: sucursalOp,
      usuario: user?.nombre,
      lineas: recientes,
    });
  };

  const pantallaLibrePura = modo === 'libre' && ocultarSelectorModo;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {!pantallaLibrePura && (
      <div className="card" style={{ borderTop: embebido ? undefined : '4px solid var(--brand-gold)' }}>
        {!embebido && (
          <>
            <h3 style={{ margin: '0 0 0.5rem', color: 'var(--brand-blue)' }}>Ajuste de inventario</h3>
            <p className="muted" style={{ marginTop: 0, fontSize: '0.85rem' }}>
              Registra entradas, retiros o traspasos. En MAIN las entradas van al CEDIS central; en tiendas al piso de venta. Los movimientos quedan en el historial de este equipo.
            </p>
          </>
        )}
        {!puedeElegirTienda && !embebido && (
          <p className="muted" style={{ fontSize: '0.85rem', margin: '0.5rem 0 0' }}>
            Tienda: <span className="badge">{esAlmacenCentral(sucursalOp) ? etiquetaAlmacenCentral() : etiquetaTienda(sucursalOp)}</span>
          </p>
        )}

        {!ocultarSelectorModo && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.75rem' }}>
            <span className="muted" style={{ width: '100%', fontSize: '0.8rem' }}>
              Modo de selección
            </span>
            <button type="button" className={modo === 'libre' ? 'btn btn-primary' : 'btn btn-ghost'} onClick={() => setModo('libre')}>
              Inventario libre
            </button>
            <button type="button" className={modo === 'departamento' ? 'btn btn-primary' : 'btn btn-ghost'} onClick={() => setModo('departamento')}>
              Por departamento
            </button>
            <button
              type="button"
              className={modo === 'masivo' ? 'btn btn-primary' : 'btn btn-ghost'}
              onClick={() => {
                setModo('masivo');
                setTipo('entrada');
                setProductoId('');
              }}
            >
              Entrada múltiple
            </button>
            <button
              type="button"
              className={modo === 'traspaso' ? 'btn btn-primary' : 'btn btn-ghost'}
              onClick={() => {
                setModo('traspaso');
                setLineasTraspaso([]);
              }}
            >
              Traspaso
            </button>
          </div>
        )}

        {modo === 'departamento' && (
          <p className="muted" style={{ fontSize: '0.85rem', margin: '0.75rem 0 0' }}>
            Conteo físico con existencia, cantidad contada, diferencias y folio de ajuste al aplicar.
          </p>
        )}

        {modo === 'libre' && (
          <p className="muted" style={{ fontSize: '0.85rem', margin: '0.75rem 0 0' }}>
            Agrega productos a la lista, cuenta existencias y aplica el ajuste. Usa filtros por diferencia, estado y departamento.
          </p>
        )}
        {modo === 'masivo' && (
          <p className="muted" style={{ fontSize: '0.85rem', margin: '0.75rem 0 0' }}>
            Agrega varios productos con sus cantidades y aplica todas las entradas en un solo paso (recepción de mercancía, conteo, etc.).
            La lista se guarda sola en este equipo si se interrumpe la captura.
          </p>
        )}
        {modo === 'masivo' && avisoMasivoRecuperado && lineasMasivas.length > 0 && (
          <p
            style={{
              margin: '0.65rem 0 0',
              padding: '0.55rem 0.65rem',
              borderRadius: 8,
              background: 'rgba(34,197,94,0.1)',
              border: '1px solid rgba(34,197,94,0.35)',
              fontSize: '0.85rem',
            }}
          >
            Se recuperó la entrada masiva ({lineasMasivas.length} línea(s)).
            <button type="button" className="btn btn-ghost" style={{ marginLeft: '0.5rem', padding: '0.2rem 0.45rem', fontSize: '0.8rem' }} onClick={() => setAvisoMasivoRecuperado(false)}>
              Entendido
            </button>
          </p>
        )}
        {modo === 'traspaso' && (
          <p className="muted" style={{ fontSize: '0.85rem', margin: '0.75rem 0 0' }}>
            Arma una lista y traspasa mercancía: del CEDIS central a una tienda, entre pisos de sucursales, o regresa del piso al almacén central.
          </p>
        )}
      </div>
      )}

      {modo === 'departamento' ? (
        <ConteoPorDepartamento
          supabase={supabase}
          inventario={inventario}
          cargarDatos={cargarDatos}
          user={user}
          sucursal={sucursalOp}
          onHistorialChange={setHistorial}
          departamentoInicial={departamentoInicial}
          borradorInicial={borradorInicial}
        />
      ) : modo === 'masivo' ? (
        <div className="card">
          <h4 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Productos a ingresar</h4>
          <div className="grid-2">
            <label className="muted" style={{ gridColumn: '1 / -1' }}>
              Buscar producto
              <label className="muted" style={{ display: 'block' }}>
                Buscar producto para agregar
                <div style={{ marginTop: '0.35rem' }}>
                  <CampoCodigo
                    value={busquedaMasiva}
                    onChange={(e) => setBusquedaMasiva(e.target.value)}
                    placeholder="Nombre o código…"
                    tituloCamara="Buscar en entrada masiva"
                  />
                </div>
              </label>
            </label>
            <label className="muted">
              Producto
              <select className="select" style={{ marginTop: '0.35rem' }} value={productoMasivoId} onChange={(e) => setProductoMasivoId(e.target.value)}>
                <option value="">— Elegir —</option>
                {productosBusquedaMasiva.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre} · Piso {p.stock}{enCentral ? ` · ${etiquetaCedisEmpresa()} ${p.stock_cedis ?? 0}` : ''} · {p.cat}
                  </option>
                ))}
              </select>
            </label>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button type="button" className="btn btn-primary" onClick={agregarLineaMasiva}>
                Agregar a la lista
              </button>
            </div>
            <label className="muted" style={{ gridColumn: '1 / -1' }}>
              Motivo / referencia (opcional, aplica a todas las líneas)
              <input className="input" style={{ marginTop: '0.35rem' }} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. Recepción proveedor, conteo físico…" />
            </label>
          </div>

          <div className="table-wrap" style={{ marginTop: '1rem' }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Producto</th>
                  <th>{enCentral ? etiquetaCedisEmpresa() : 'Stock piso'}</th>
                  <th>Cantidad</th>
                  <th>{enCentral ? 'Quedaría CEDIS' : 'Quedaría piso'}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lineasMasivas.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="muted">
                      Sin productos. Busca y agrega los que vas a recibir.
                    </td>
                  </tr>
                ) : (
                  lineasMasivas.map((l) => {
                    const p = inventario.find((x) => x.id === l.productoId);
                    const qty = parseInt(l.cantidad, 10) || 0;
                    const stock = enCentral ? Number(p?.stock_cedis) || 0 : Number(p?.stock) || 0;
                    return (
                      <tr key={l.productoId}>
                        <td>{l.productoId}</td>
                        <td>{p?.nombre || '—'}</td>
                        <td>{stock}</td>
                        <td>
                          <input
                            className="input"
                            type="number"
                            min={1}
                            style={{ width: '5rem', padding: '0.35rem 0.5rem' }}
                            value={l.cantidad}
                            onChange={(e) => actualizarCantidadMasiva(l.productoId, e.target.value)}
                          />
                        </td>
                        <td>{qty > 0 ? stock + qty : '—'}</td>
                        <td>
                          <button type="button" className="btn btn-danger" style={{ padding: '0.25rem 0.45rem', fontSize: '0.75rem' }} onClick={() => quitarLineaMasiva(l.productoId)}>
                            Quitar
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-success" onClick={aplicarMasivo} disabled={aplicando || lineasMasivas.length === 0}>
              {aplicando ? 'Aplicando…' : `Aplicar ${lineasMasivas.length} entrada(s)`}
            </button>
            {lineasMasivas.length > 0 && (
              <button type="button" className="btn btn-ghost" onClick={() => setLineasMasivas([])}>
                Vaciar lista
              </button>
            )}
          </div>
        </div>
      ) : modo === 'traspaso' ? (
        <div className="card">
          <h4 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Traspaso de mercancía</h4>
          <p className="muted" style={{ margin: '0 0 0.75rem', fontSize: '0.85rem' }}>
            Tienda de operación:{' '}
            <span className="badge">{esAlmacenCentral(sucursalOp) ? etiquetaAlmacenCentral() : etiquetaTienda(sucursalOp)}</span>
            {rutaTraspaso && (
              <span style={{ marginLeft: '0.5rem' }}>
                · Origen: <strong>{rutaTraspaso.ubicacionOrigen === 'cedis' ? etiquetaCedisEmpresa() : 'Piso'}</strong>
                {' → '}
                Destino: <strong>{rutaTraspaso.ubicacionDestino === 'cedis' ? etiquetaCedisEmpresa() : 'Piso'}</strong>
                {(subtipoTraspaso === 'tienda_tienda' || subtipoTraspaso === 'central_tienda') && sucursalDestinoTraspaso && (
                  <span> ({etiquetaTienda(sucursalDestinoTraspaso)})</span>
                )}
              </span>
            )}
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
            {subtiposDisponibles.map((s) => (
              <button
                key={s.id}
                type="button"
                className={subtipoTraspaso === s.id ? 'btn btn-primary' : 'btn btn-ghost'}
                style={{ flex: '1 1 180px' }}
                onClick={() => {
                  setSubtipoTraspaso(s.id);
                  if (s.id !== 'tienda_tienda' && s.id !== 'central_tienda') setSucursalDestinoTraspaso('');
                }}
                title={s.desc}
              >
                {s.label}
              </button>
            ))}
          </div>
          <p className="muted" style={{ fontSize: '0.8rem', margin: '0 0 1rem' }}>{subtiposDisponibles.find((s) => s.id === subtipoTraspaso)?.desc}</p>

          {(subtipoTraspaso === 'tienda_tienda' || subtipoTraspaso === 'central_tienda') && (
            <label className="muted" style={{ display: 'block', marginBottom: '1rem', maxWidth: '320px' }}>
              {subtipoTraspaso === 'central_tienda' ? 'Tienda destino (recibe del almacén central)' : 'Tienda destino'}
              <select
                className="select"
                style={{ marginTop: '0.35rem' }}
                value={sucursalDestinoTraspaso}
                onChange={(e) => setSucursalDestinoTraspaso(e.target.value)}
              >
                <option value="">— Elegir tienda —</option>
                {sucursalesLista
                  .filter((c) => (subtipoTraspaso === 'central_tienda' ? c !== 'MAIN' : c !== sucursalOp))
                  .map((c) => (
                    <option key={c} value={c}>
                      {etiquetaTienda(c)}
                    </option>
                  ))}
              </select>
            </label>
          )}

          <div className="grid-2">
            <label className="muted" style={{ gridColumn: '1 / -1' }}>
              Escanear o buscar producto
              <div style={{ marginTop: '0.35rem' }}>
                <CampoCodigo
                  value={codigoEscaneoTraspaso || busquedaTraspaso}
                  onChange={(e) => {
                    setBusquedaTraspaso(e.target.value);
                    setCodigoEscaneoTraspaso(e.target.value);
                  }}
                  onEscanear={procesarEscaneoTraspaso}
                  onKeyDown={(e) => e.key === 'Enter' && procesarEscaneoTraspaso(e.target.value)}
                  placeholder="Código de barras o nombre…"
                  tituloCamara="Agregar a traspaso"
                />
              </div>
            </label>
            <label className="muted">
              Producto
              <select className="select" style={{ marginTop: '0.35rem' }} value={productoTraspasoId} onChange={(e) => setProductoTraspasoId(e.target.value)}>
                <option value="">— Elegir —</option>
                {productosBusquedaTraspaso.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre} · Piso {stockEnUbicacion(p, sucursalOp, 'piso', sucursalOp)}
                    {enCentral ? ` · ${etiquetaCedisEmpresa()} ${stockEnUbicacion(p, sucursalOp, 'cedis', sucursalOp)}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button type="button" className="btn btn-primary" onClick={agregarLineaTraspaso} disabled={!rutaTraspaso}>
                Agregar a la lista
              </button>
            </div>
            <label className="muted" style={{ gridColumn: '1 / -1' }}>
              Motivo / referencia (opcional)
              <input className="input" style={{ marginTop: '0.35rem' }} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. Surtido a piso, envío a sucursal…" />
            </label>
          </div>

          <div className="table-wrap" style={{ marginTop: '1rem' }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Producto</th>
                  <th>Stock origen</th>
                  <th>Cantidad</th>
                  <th>Quedaría origen</th>
                  <th>Quedaría destino</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lineasTraspaso.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="muted">
                      Sin productos. Escanea o busca los artículos que vas a traspasar.
                    </td>
                  </tr>
                ) : (
                  lineasTraspaso.map((l) => {
                    const p = inventario.find((x) => x.id === l.productoId);
                    const qty = parseInt(l.cantidad, 10) || 0;
                    const stockO = rutaTraspaso
                      ? stockEnUbicacion(p, rutaTraspaso.sucursalOrigen, rutaTraspaso.ubicacionOrigen, sucursalOp)
                      : 0;
                    const stockD = rutaTraspaso
                      ? stockEnUbicacion(p, rutaTraspaso.sucursalDestino, rutaTraspaso.ubicacionDestino, sucursalOp)
                      : 0;
                    const insuficiente = qty > stockO;
                    return (
                      <tr key={l.productoId} style={insuficiente ? { background: 'rgba(211,47,47,0.06)' } : undefined}>
                        <td>{l.productoId}</td>
                        <td>{p?.nombre || '—'}</td>
                        <td>{stockO}</td>
                        <td>
                          <input
                            className="input"
                            type="number"
                            min={1}
                            style={{ width: '5rem', padding: '0.35rem 0.5rem' }}
                            value={l.cantidad}
                            onChange={(e) => actualizarCantidadTraspaso(l.productoId, e.target.value)}
                          />
                        </td>
                        <td>{qty > 0 ? Math.max(0, stockO - qty) : '—'}</td>
                        <td>{qty > 0 ? stockD + qty : '—'}</td>
                        <td>
                          <button type="button" className="btn btn-danger" style={{ padding: '0.25rem 0.45rem', fontSize: '0.75rem' }} onClick={() => quitarLineaTraspaso(l.productoId)}>
                            Quitar
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-success" onClick={aplicarTraspaso} disabled={aplicando || lineasTraspaso.length === 0 || !rutaTraspaso}>
              {aplicando ? 'Aplicando…' : `Aplicar traspaso (${lineasTraspaso.length})`}
            </button>
            {lineasTraspaso.length > 0 && (
              <button type="button" className="btn btn-ghost" onClick={() => setLineasTraspaso([])}>
                Vaciar lista
              </button>
            )}
          </div>
        </div>
      ) : modo === 'libre' ? (
        <AjusteLibre
          supabase={supabase}
          inventario={inventario}
          cargarDatos={cargarDatos}
          user={user}
          sucursal={sucursalOp}
          onHistorialChange={setHistorial}
          onCerrar={typeof onVolver === 'function' ? onVolver : undefined}
          borradorInicial={borradorInicial?.tipo === 'libre' ? borradorInicial : null}
        />
      ) : modo === 'movimiento' ? (
        <div className="card">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
            {TIPOS_MOV.map((t) => (
              <button
                key={t.id}
                type="button"
                className={tipo === t.id ? 'btn btn-primary' : 'btn btn-ghost'}
                style={{ flex: '1 1 140px' }}
                onClick={() => setTipo(t.id)}
                title={t.desc}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="grid-2">
            <label className="muted" style={{ gridColumn: '1 / -1' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Icon name="scan" size={16} />
                Escanear código de barras
              </span>
              <div style={{ marginTop: '0.35rem' }}>
                <CampoCodigo
                  inputRef={scanInputRef}
                  value={codigoEscaneo}
                  onChange={(e) => setCodigoEscaneo(e.target.value)}
                  onEscanear={procesarEscaneo}
                  onKeyDown={onScanKeyDown}
                  placeholder="Apunta el lector aquí y escanea…"
                  tituloCamara="Escanear inventario"
                  inputStyle={{ fontSize: '1.1rem', padding: '0.75rem 1rem', letterSpacing: '0.05em' }}
                >
                  <button type="button" className="btn btn-primary" onClick={() => procesarEscaneo()} disabled={!codigoEscaneo.trim()}>
                    Buscar código
                  </button>
                </CampoCodigo>
              </div>
            </label>
            <label className="muted" style={{ gridColumn: '1 / -1' }}>
              O buscar por nombre / código
              <div style={{ marginTop: '0.35rem' }}>
                <CampoCodigo value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Nombre o código…" tituloCamara="Buscar producto" />
              </div>
            </label>
            <label className="muted">
              Producto
              <select className="select" style={{ marginTop: '0.35rem' }} value={productoId} onChange={(e) => setProductoId(e.target.value)}>
                <option value="">— Elegir —</option>
                {productosFiltrados.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre} · Piso {p.stock}
                    {enCentral ? ` · ${etiquetaCedisEmpresa()} ${p.stock_cedis ?? 0}` : ''} · {p.cat}
                  </option>
                ))}
              </select>
            </label>
            <label className="muted">
              Cantidad (unidades)
              <input ref={cantidadInputRef} className="input" type="number" min={1} style={{ marginTop: '0.35rem' }} value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
            </label>
            <label className="muted" style={{ gridColumn: '1 / -1' }}>
              Motivo / referencia (opcional)
              <input className="input" style={{ marginTop: '0.35rem' }} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. Merma, uso interno…" />
            </label>
          </div>
          {productoOrigen && (
            <div style={{ marginTop: '0.75rem', padding: '0.75rem', borderRadius: '10px', background: 'var(--surface)', fontSize: '0.9rem' }}>
              <strong>{productoOrigen.nombre}</strong>
              <span className="muted"> · Código {productoOrigen.id} · Piso: </span>
              <strong>{productoOrigen.stock}</strong>
            </div>
          )}
          <button type="button" className="btn btn-success" style={{ marginTop: '0.75rem' }} onClick={aplicar} disabled={aplicando}>
            {aplicando ? 'Aplicando…' : 'Aplicar movimiento'}
          </button>
        </div>
      ) : null}

      {!pantallaLibrePura && (
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <h3 style={{ margin: '0', color: 'var(--brand-blue)' }}>Historial reciente (este equipo)</h3>
          <button type="button" className="btn btn-ghost" style={{ fontSize: '0.8rem' }} onClick={imprimirHistorial} disabled={!historialFiltrado.length}>
            Imprimir historial
          </button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', margin: '0.5rem 0 0.75rem', alignItems: 'flex-end' }}>
          <label className="muted" style={{ fontSize: '0.8rem' }}>
            Tipo
            <select className="select" style={{ display: 'block', marginTop: '0.2rem', minWidth: 130 }} value={filtroHistTipo} onChange={(e) => setFiltroHistTipo(e.target.value)}>
              {FILTROS_HISTORIAL_TIPO.map((f) => (
                <option key={f.id || 'todos'} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          <FiltroPeriodo
            labelPeriodo="Fechas"
            preset={filtroHistFecha}
            onPresetChange={setFiltroHistFecha}
            desde={histDesde}
            hasta={histHasta}
            onDesdeChange={setHistDesde}
            onHastaChange={setHistHasta}
            className="cal-picker-wrap--inline"
          />
          <span className="muted" style={{ fontSize: '0.75rem', marginLeft: 'auto' }}>
            {historialFiltrado.length} movimiento{historialFiltrado.length === 1 ? '' : 's'}
          </span>
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Producto</th>
                <th>Cant.</th>
                <th>Stock</th>
                <th>Usuario</th>
              </tr>
            </thead>
            <tbody>
              {historialFiltrado.length === 0 ? (
                <tr>
                  <td colSpan={6} className="muted">
                    Sin movimientos con estos filtros.
                  </td>
                </tr>
              ) : (
                historialFiltrado.slice(0, 50).map((m) => (
                  <tr key={m.id}>
                    <td style={{ fontSize: '0.8rem' }}>
                      {m.created_at ? new Date(m.created_at).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                    </td>
                    <td>
                      <span className="badge">{m.tipo}</span>
                      {m.folio && <span className="muted" style={{ fontSize: '0.7rem', display: 'block' }}>{m.folio}</span>}
                      {(m.modo === 'departamento' || m.modo === 'conteo_departamento') && m.departamento && (
                        <span className="muted" style={{ fontSize: '0.7rem', display: 'block' }}>{m.departamento}</span>
                      )}
                    </td>
                    <td style={{ fontSize: '0.85rem' }}>
                      {m.producto_nombre || m.producto_id}
                      {m.traspaso_origen && m.traspaso_destino && (
                        <span className="muted" style={{ display: 'block' }}>
                          {m.traspaso_origen} → {m.traspaso_destino}
                        </span>
                      )}
                      {m.producto_destino_nombre && (
                        <span className="muted" style={{ display: 'block' }}>
                          → {m.producto_destino_nombre}
                        </span>
                      )}
                    </td>
                    <td>{m.cantidad}</td>
                    <td style={{ fontSize: '0.8rem' }}>
                      {m.stock_antes} → {m.stock_despues}
                    </td>
                    <td className="muted" style={{ fontSize: '0.8rem' }}>
                      {m.usuario}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}
    </div>
  );
}
