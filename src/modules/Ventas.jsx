import React, { useEffect, useMemo, useRef, useState } from 'react';
import { etiquetaMetodoPago, leerMetodosPago, resolverImpresionVentaPorMonto } from '../lib/posConfig.js';
import { entregarTicketVenta, imprimirVenta } from '../lib/impresion.js';
import { productoEnVenta, productoEsFavorito, precioVentaParaCaja } from '../lib/productoForm.js';
import { etiquetaDepartamento, listarDepartamentos, normalizarDepartamento } from '../lib/departamentos.js';
import Icon, { BtnLabel } from '../components/Icon.jsx';
import CampoCodigo from '../components/CampoCodigo.jsx';
import { turnoActual, usuarioAutorizadoLogin, nombreTurnoLegible } from '../lib/turnos.js';
import { normalizarCodigoTienda } from '../constants/sucursales.js';
import { descontarStockPorVenta, guardarMovimientoLocal } from '../lib/inventarioMovimientos.js';
import { sonidoEscaneoProducto } from '../lib/sonidosPos.js';
import ProductoThumb from '../components/ProductoThumb.jsx';
import DetalleProducto from '../components/DetalleProducto.jsx';
import { productoCoincideBusqueda, productoPorCodigoExacto, pareceCodigoProducto, parseMultiplicadorBusqueda } from '../lib/buscarProductoTexto.js';
import { registrarRemocionCarrito } from '../lib/proyeccionFaltante.js';
import { suscribirEscanerRemoto } from '../lib/escanerRemoto.js';
import { puedeVerStockNegativo } from '../lib/roles.js';
import {
  guardarCarritoVenta,
  leerCarritoVenta,
  limpiarCarritoVenta,
} from '../lib/carritoVentaPersistencia.js';
import { encolarVentaOffline, esErrorDeRed } from '../lib/ventasOffline.js';
import { esCedisModoVenta, productoPermitidoEnCedisVenta } from '../lib/cedisVentaConfig.js';

function addToCart(carrito, producto, qtyAdd = 1) {
  const add = Math.max(1, Math.floor(Number(qtyAdd) || 1));
  const precio = precioVentaParaCaja(producto);
  const i = carrito.findIndex((c) => c.id === producto.id);
  if (i >= 0) {
    const next = [...carrito];
    next[i] = {
      ...next[i],
      qty: (next[i].qty || 1) + add,
      foto_url: next[i].foto_url || producto.foto_url || null,
      precio: Number(next[i].precio) > 0 ? next[i].precio : precio,
    };
    return next;
  }
  return [
    ...carrito,
    {
      id: producto.id,
      nombre: producto.nombre,
      precio,
      foto_url: producto.foto_url || null,
      qty: add,
    },
  ];
}

function resetCobro(setters) {
  setters.setMostrarCobro(false);
  setters.setFormaPago('efectivo');
  setters.setPagoCon('');
  setters.setRefPago('');
}

/** Valor especial: el cliente paga el total sin cambio. */
const PAGO_EXACTO = 'exacto';

function montoRecibidoEfectivo(pagoCon, totalMXN, monedaPago, tipoCambio) {
  if (pagoCon === PAGO_EXACTO) {
    if (monedaPago === 'USD') {
      const tc = Number(tipoCambio) || 1;
      return tc > 0 ? totalMXN / tc : totalMXN;
    }
    return totalMXN;
  }
  const n = parseFloat(pagoCon);
  return Number.isFinite(n) ? n : 0;
}

export default function Ventas({
  supabase,
  user,
  sucursal,
  tipoCambio,
  inventario,
  cargarDatos,
  busqueda,
  setBusqueda,
  modoOffline = false,
  forzarOffline,
  onVentaOfflineLocal,
}) {
  const verNegativos = puedeVerStockNegativo(user?.rol);
  const [carrito, setCarrito] = useState(() => leerCarritoVenta(sucursal));
  const [pagoCon, setPagoCon] = useState('');
  const [refPago, setRefPago] = useState('');
  const [monedaPago, setMonedaPago] = useState('MXN');
  const [formaPago, setFormaPago] = useState('efectivo');
  const [mostrarCobro, setMostrarCobro] = useState(false);
  const [resultadoVenta, setResultadoVenta] = useState(null);
  const [finalizando, setFinalizando] = useState(false);
  const [metodosPago, setMetodosPago] = useState(() => leerMetodosPago());
  const [ultimaVenta, setUltimaVenta] = useState(null);
  const [deptoActivo, setDeptoActivo] = useState('favoritos');
  const [qDepto, setQDepto] = useState('');
  const [detalleProductoId, setDetalleProductoId] = useState(null);
  const [avisoEscanerRemoto, setAvisoEscanerRemoto] = useState('');
  const [qtyEditId, setQtyEditId] = useState(null);
  const scanInputRef = useRef(null);
  const inventarioRef = useRef(inventario);
  const carritoRef = useRef(carrito);
  const busquedaRef = useRef(busqueda);
  const omitirGuardadoRef = useRef(false);

  const detalleProducto = useMemo(() => {
    if (!detalleProductoId) return null;
    return (inventario || []).find((p) => String(p.id) === String(detalleProductoId)) || null;
  }, [inventario, detalleProductoId]);

  useEffect(() => {
    inventarioRef.current = inventario;
  }, [inventario]);

  useEffect(() => {
    carritoRef.current = carrito;
  }, [carrito]);

  useEffect(() => {
    busquedaRef.current = busqueda;
  }, [busqueda]);

  // Al cambiar de tienda, cargar el carrito de esa sucursal (sin pisar el de la anterior).
  useEffect(() => {
    omitirGuardadoRef.current = true;
    setCarrito(leerCarritoVenta(sucursal));
  }, [sucursal]);

  // Persistir tras cada cambio (y al desmontar / cerrar sesión en este equipo).
  useEffect(() => {
    if (omitirGuardadoRef.current) {
      omitirGuardadoRef.current = false;
      return undefined;
    }
    guardarCarritoVenta(sucursal, carrito);
    return () => {
      guardarCarritoVenta(sucursal, carritoRef.current);
    };
  }, [carrito, sucursal]);

  useEffect(() => {
    if (!supabase || !user?.id) return undefined;
    return suscribirEscanerRemoto(supabase, {
      sucursal,
      userId: user.id,
      onCodigo: (codigo) => {
        const pending = parseMultiplicadorBusqueda(busquedaRef.current);
        const qty = pending.soloMultiplicador ? pending.qty : 1;
        const prod = productoPorCodigoExacto(enVentaRef.current, codigo);
        if (!prod) {
          setAvisoEscanerRemoto(
            esCedisModoVenta(sucursal)
              ? `Escáner móvil: ${codigo} no está en el catálogo de venta CEDIS`
              : `Escáner móvil: no se encontró ${codigo}`,
          );
          return;
        }
        setCarrito((c) => addToCart(c, prod, qty));
        sonidoEscaneoProducto();
        setBusqueda('');
        setAvisoEscanerRemoto(
          qty > 1
            ? `Escáner móvil: +${qty} ${prod.nombre}`
            : `Escáner móvil: + ${prod.nombre}`,
        );
      },
    });
  }, [supabase, sucursal, user?.id]);

  useEffect(() => {
    if (!avisoEscanerRemoto) return undefined;
    const t = setTimeout(() => setAvisoEscanerRemoto(''), 3500);
    return () => clearTimeout(t);
  }, [avisoEscanerRemoto]);

  useEffect(() => {
    if (mostrarCobro) {
      const activos = leerMetodosPago();
      setMetodosPago(activos);
      if (activos.length && !activos.some((m) => m.id === formaPago)) {
        setFormaPago(activos[0].id);
      }
    }
  }, [mostrarCobro]);

  const metodoActual = useMemo(
    () => metodosPago.find((m) => m.id === formaPago) || metodosPago[0],
    [metodosPago, formaPago],
  );

  const enVenta = useMemo(() => {
    let list = (inventario || []).filter((p) => productoEnVenta(p));
    if (esCedisModoVenta(sucursal)) {
      list = list.filter((p) => productoPermitidoEnCedisVenta(p));
    }
    return list;
  }, [inventario, sucursal]);

  const enVentaRef = useRef(enVenta);
  useEffect(() => {
    enVentaRef.current = enVenta;
  }, [enVenta]);

  const favoritos = useMemo(() => enVenta.filter((p) => productoEsFavorito(p)), [enVenta]);

  const departamentosMenu = useMemo(() => {
    const counts = new Map();
    for (const p of enVenta) {
      const d = normalizarDepartamento(p.cat) || 'GENERAL';
      counts.set(d, (counts.get(d) || 0) + 1);
    }
    const orden = listarDepartamentos(enVenta).filter((d) => d !== 'FAVORITOS' && (counts.get(d) || 0) > 0);
    // Departamentos con stock en catálogo pero no en base list
    for (const d of counts.keys()) {
      if (d !== 'FAVORITOS' && !orden.includes(d)) orden.push(d);
    }
    return [
      { id: 'favoritos', label: 'Favoritos', count: favoritos.length },
      { id: 'todos', label: 'Todos', count: enVenta.length },
      ...orden.map((d) => ({
        id: d,
        label: etiquetaDepartamento(d),
        count: counts.get(d) || 0,
      })),
    ];
  }, [enVenta, favoritos.length]);

  const productosCatalogo = useMemo(() => {
    let list = enVenta;
    if (deptoActivo === 'favoritos') list = favoritos;
    else if (deptoActivo !== 'todos') {
      list = enVenta.filter((p) => normalizarDepartamento(p.cat) === deptoActivo);
    }
    const t = qDepto.trim();
    if (t) {
      list = list.filter((p) => productoCoincideBusqueda(p, t));
    }
    return list;
  }, [enVenta, favoritos, deptoActivo, qDepto]);

  const filtrados = useMemo(() => {
    const q = (busqueda || '').trim();
    if (!q) return [];
    const { soloMultiplicador, codigo } = parseMultiplicadorBusqueda(q);
    if (soloMultiplicador || !codigo) return [];
    return enVenta.filter((p) => productoCoincideBusqueda(p, q));
  }, [enVenta, busqueda]);

  const qtyPendienteBusqueda = useMemo(() => {
    const { qty, tieneMultiplicador } = parseMultiplicadorBusqueda(busqueda);
    return tieneMultiplicador ? qty : 1;
  }, [busqueda]);

  const deptoActualMeta = departamentosMenu.find((d) => d.id === deptoActivo) || departamentosMenu[0];

  const totalMXN = useMemo(() => carrito.reduce((acc, p) => acc + Number(p.precio || 0) * (p.qty || 1), 0), [carrito]);

  const esEfectivo = metodoActual?.tipo === 'efectivo';

  const cambioMXN = useMemo(() => {
    if (pagoCon === PAGO_EXACTO) return 0;
    const montoRecibido = montoRecibidoEfectivo(pagoCon, totalMXN, monedaPago, tipoCambio);
    if (monedaPago === 'USD') return montoRecibido * tipoCambio - totalMXN;
    return montoRecibido - totalMXN;
  }, [pagoCon, monedaPago, totalMXN, tipoCambio]);

  const textoMetodoPago = useMemo(() => {
    if (!metodoActual) return 'Otro';
    let base = etiquetaMetodoPago(metodoActual, monedaPago);
    const ref = refPago.trim();
    if (ref && metodoActual.id !== 'efectivo') base += ` · Ref: ${ref}`;
    return base;
  }, [metodoActual, monedaPago, refPago]);

  const finalizarVenta = async () => {
    if (!user || finalizando) return;
    const acceso = usuarioAutorizadoLogin(user, new Date(), null, sucursal);
    if (!acceso.ok) return alert(acceso.error);
    const turno = turnoActual();
    if (!metodoActual) return alert('No hay métodos de pago activos. Configúralos en Configuración.');
    if (esEfectivo && !pagoCon) return alert('Selecciona la denominación o Monto exacto.');
    if (esEfectivo && cambioMXN < 0) return alert('Monto insuficiente');
    const articulos = carrito.map((c) => ({
      id: c.id,
      nombre: c.nombre,
      precio: c.precio,
      qty: c.qty || 1,
    }));
    for (const c of carrito) {
      const p = inventario.find((x) => x.id === c.id);
      if (!p) return alert(`Producto no disponible en catálogo: ${c.nombre || c.id}`);
    }
    setFinalizando(true);

    const tiendaVenta = normalizarCodigoTienda(sucursal) || sucursal;
    const totalVenta = totalMXN;
    const cambioVenta = esEfectivo ? cambioMXN : null;
    const metodoVenta = textoMetodoPago;
    const recibidoVenta = esEfectivo ? montoRecibidoEfectivo(pagoCon, totalMXN, monedaPago, tipoCambio) : totalMXN;
    const pagoExacto = esEfectivo && pagoCon === PAGO_EXACTO;
    const vendidoEn = new Date().toISOString();

    const ventaPayload = {
      vendedor: user.nombre,
      usuario_id: user.id || null,
      sucursal_id: tiendaVenta,
      total: totalVenta,
      metodo_pago: metodoVenta,
      articulos,
      turno_id: turno?.id || null,
      turno_nombre: nombreTurnoLegible(turno) || null,
      created_at: vendidoEn,
    };

    const cerrarTicketLocal = async ({ offlineGuardada = false, erroresStock = [] } = {}) => {
      const ticket = {
        sucursal: tiendaVenta,
        vendedor: user.nombre,
        articulos,
        total: totalVenta,
        metodo_pago: metodoVenta,
        esEfectivo,
        recibido: recibidoVenta,
        cambio: cambioVenta,
        moneda: monedaPago,
      };
      setUltimaVenta(ticket);
      const decision = resolverImpresionVentaPorMonto(totalVenta);
      let debeImprimir = decision.accion === 'imprimir' || decision.accion === 'pdf';
      if (decision.accion === 'preguntar') {
        debeImprimir = confirm(
          `Venta de $${Number(totalVenta).toFixed(2)} MXN.\n\n¿Imprimir ticket?`,
        );
      }
      if (debeImprimir) {
        const modo = decision.accion === 'pdf' ? 'pdf' : 'imprimir';
        const pr = await entregarTicketVenta(ticket, modo, { copias: decision.copias });
        if (!pr.ok) console.warn(pr.error);
      }
      setCarrito([]);
      limpiarCarritoVenta(sucursal);
      resetCobro({ setMostrarCobro, setFormaPago, setPagoCon, setRefPago });
      setResultadoVenta({
        total: totalVenta,
        cambio: cambioVenta,
        metodo: metodoVenta,
        esEfectivo,
        pagoExacto,
        moneda: monedaPago,
        recibido: recibidoVenta,
        avisoStock: erroresStock.length > 0,
        ticketOmitido: !debeImprimir,
        offlineGuardada,
      });
      setFinalizando(false);
    };

    const guardarComoOffline = async () => {
      const r = encolarVentaOffline(ventaPayload);
      if (!r.ok) {
        setFinalizando(false);
        alert(r.error || 'No se pudo guardar la venta offline.');
        return;
      }
      forzarOffline?.();
      onVentaOfflineLocal?.(articulos);
      await cerrarTicketLocal({ offlineGuardada: true });
    };

    if (modoOffline || !supabase) {
      await guardarComoOffline();
      return;
    }

    let errorInsert = null;
    try {
      const { error } = await supabase.from('ventas').insert([
        {
          vendedor: ventaPayload.vendedor,
          usuario_id: ventaPayload.usuario_id,
          sucursal_id: ventaPayload.sucursal_id,
          total: ventaPayload.total,
          metodo_pago: ventaPayload.metodo_pago,
          articulos: ventaPayload.articulos,
          turno_id: ventaPayload.turno_id,
          turno_nombre: ventaPayload.turno_nombre,
        },
      ]);
      errorInsert = error;
    } catch (e) {
      errorInsert = e;
    }

    if (errorInsert) {
      if (esErrorDeRed(errorInsert)) {
        await guardarComoOffline();
        return;
      }
      setFinalizando(false);
      alert(errorInsert.message || String(errorInsert));
      return;
    }

    const erroresStock = [];
    for (const c of carrito) {
      const need = c.qty || 1;
      const r = await descontarStockPorVenta(supabase, {
        productoId: c.id,
        qty: need,
        sucursal: tiendaVenta,
      });
      if (!r.ok) {
        erroresStock.push(`${c.nombre || c.id}: ${r.error}`);
        continue;
      }
      guardarMovimientoLocal({
        tipo: 'retiro',
        modo: 'venta',
        producto_id: c.id,
        producto_nombre: c.nombre,
        cantidad: need,
        stock_antes: r.antes,
        stock_despues: r.despues,
        ubicacion: 'piso',
        motivo: `Venta · ${metodoVenta}`,
        usuario: user.nombre,
        sucursal: tiendaVenta,
        created_at: vendidoEn,
      }, supabase);
    }
    if (erroresStock.length) {
      alert(
        `Venta guardada, pero no se pudo descontar stock de ${erroresStock.length} producto(s):\n\n` +
          `${erroresStock.slice(0, 8).join('\n')}` +
          (erroresStock.length > 8 ? `\n…y ${erroresStock.length - 8} más` : '') +
          `\n\nRevisa inventario o ejecuta supabase/fix_stock_ubicaciones.sql si falta la columna.`,
      );
    }
    await cerrarTicketLocal({ erroresStock });
    cargarDatos();
  };

  const setQty = (id, qty) => {
    const prev = carrito.find((row) => row.id === id);
    const nextQty = Math.max(1, qty);
    if (prev && nextQty < Number(prev.qty || 1)) {
      const delta = Number(prev.qty || 1) - nextQty;
      void registrarRemocionCarrito(supabase, {
        sucursal,
        user,
        producto_id: prev.id,
        nombre: prev.nombre,
        precio: prev.precio,
        qty: delta,
      });
    }
    setCarrito((c) =>
      c
        .map((row) => (row.id === id ? { ...row, qty: nextQty } : row))
        .filter((row) => row.qty > 0),
    );
  };

  const enfocarBuscador = () => {
    // Dejar el foco en el escáner para que un código no se meta en la cantidad.
    requestAnimationFrame(() => {
      try {
        scanInputRef.current?.focus?.({ preventScroll: true });
      } catch {
        scanInputRef.current?.focus?.();
      }
    });
  };

  const abrirEditorQty = (id) => {
    setQtyEditId(id);
    enfocarBuscador();
  };

  const ajustarQty = (id, delta) => {
    const row = carrito.find((r) => r.id === id);
    const actual = Number(row?.qty || 1);
    setQty(id, actual + delta);
    enfocarBuscador();
  };

  // Cerrar stepper al tocar fuera / al cambiar el carrito vacío.
  useEffect(() => {
    if (!qtyEditId) return undefined;
    if (!carrito.some((r) => r.id === qtyEditId)) {
      setQtyEditId(null);
      return undefined;
    }
    const onPointer = (e) => {
      const el = e.target?.closest?.('[data-qty-stepper]');
      if (el && String(el.getAttribute('data-qty-stepper')) === String(qtyEditId)) return;
      setQtyEditId(null);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [qtyEditId, carrito]);

  const quitarDelCarrito = (it) => {
    void registrarRemocionCarrito(supabase, {
      sucursal,
      user,
      producto_id: it.id,
      nombre: it.nombre,
      precio: it.precio,
      qty: it.qty || 1,
    });
    setCarrito((c) => c.filter((x) => x.id !== it.id));
  };

  const elegirMetodo = (id) => {
    setFormaPago(id);
    setPagoCon('');
    setRefPago('');
  };

  const reimprimirUltima = async () => {
    if (!ultimaVenta) return alert('Aún no hay una venta en esta sesión para reimprimir.');
    const r = await imprimirVenta(ultimaVenta);
    if (!r.ok) alert(r.error);
  };

  const agregarAlCarrito = (producto, conSonido = false, qtyAdd = 1) => {
    if (conSonido) sonidoEscaneoProducto();
    setCarrito((car) => addToCart(car, producto, qtyAdd));
  };

  const procesarCodigoCamara = (codigo) => {
    const c = String(codigo || '').trim();
    if (!c) return;
    const pending = parseMultiplicadorBusqueda(busqueda);
    const qty = pending.soloMultiplicador ? pending.qty : 1;
    const exacto = productoPorCodigoExacto(enVenta, c);
    if (exacto) {
      // El beep ya lo emite EscanerCamara al leer el código.
      agregarAlCarrito(exacto, false, qty);
      setBusqueda('');
      return;
    }
    setBusqueda(pending.soloMultiplicador ? `${pending.qty}*${c}` : c);
    if (pareceCodigoProducto(c)) {
      alert(`No se encontró el producto ${c} en el catálogo de venta.`);
    }
  };

  return (
    <div className="ventas-layout">
      {avisoEscanerRemoto && (
        <div
          className="card"
          style={{
            flex: '1 1 100%',
            width: '100%',
            margin: 0,
            padding: '0.55rem 0.75rem',
            background: 'rgba(46, 125, 50, 0.1)',
            border: '1px solid rgba(46, 125, 50, 0.35)',
            color: '#1b5e20',
            fontWeight: 600,
          }}
        >
          {avisoEscanerRemoto}
        </div>
      )}
      <div className="ventas-layout-main">
      <div className="ventas-catalogo">
        <section className="ventas-deptos card">
          <div className="ventas-deptos-head">
            <div>
              <h4>Catálogo por departamento</h4>
              <p className="muted">Elige un departamento o usa favoritos para venta rápida</p>
            </div>
            <div className="ventas-deptos-buscar">
              <Icon name="search" size={15} />
              <input
                className="input"
                value={qDepto}
                onChange={(e) => setQDepto(e.target.value)}
                placeholder={deptoActivo === 'favoritos' ? 'Filtrar favoritos…' : 'Filtrar en departamento…'}
                aria-label="Filtrar productos del departamento"
              />
              {qDepto && (
                <button type="button" className="ventas-deptos-clear" onClick={() => setQDepto('')} aria-label="Limpiar filtro">
                  <Icon name="x" size={14} />
                </button>
              )}
            </div>
          </div>

          <div className="ventas-deptos-tabs" role="tablist" aria-label="Departamentos">
            {departamentosMenu.map((d) => (
              <button
                key={d.id}
                type="button"
                role="tab"
                aria-selected={deptoActivo === d.id}
                className={`ventas-depto-tab ${deptoActivo === d.id ? 'activo' : ''}`}
                onClick={() => {
                  setDeptoActivo(d.id);
                  setQDepto('');
                }}
              >
                <span className="ventas-depto-tab-label">{d.label}</span>
                <span className="ventas-depto-tab-count">{d.count}</span>
              </button>
            ))}
          </div>

          <div className="ventas-deptos-meta">
            <strong>{deptoActualMeta?.label || 'Catálogo'}</strong>
            <span className="muted">
              {productosCatalogo.length} producto{productosCatalogo.length === 1 ? '' : 's'}
              {qDepto.trim() ? ' · filtrado' : ''}
            </span>
          </div>

          {productosCatalogo.length === 0 ? (
            <div className="ventas-deptos-vacio">
              <Icon name="package" size={36} />
              <p>
                {deptoActivo === 'favoritos'
                  ? 'No hay favoritos. Márcalos en Productos para venta rápida.'
                  : qDepto.trim()
                    ? 'Sin coincidencias en este departamento.'
                    : 'No hay productos en este departamento.'}
              </p>
            </div>
          ) : (
            <div className="ventas-favoritos-grid">
              {productosCatalogo.map((p) => (
                <div key={p.id} className="ventas-favorito-card">
                  <button
                    type="button"
                    onClick={() => setCarrito((c) => addToCart(c, p))}
                    className="ventas-favorito-btn"
                    title={`${p.nombre} · ${p.id}`}
                  >
                    <ProductoThumb
                      producto={p}
                      size="full"
                      className="ventas-favorito-thumb"
                      referencias={deptoActivo === 'favoritos'}
                      sucursal={sucursal}
                      verNegativos={verNegativos}
                    />
                    <div className="ventas-favorito-precio">${precioVentaParaCaja(p).toFixed(2)}</div>
                    <div className="ventas-favorito-nombre">{p.nombre}</div>
                    {deptoActivo === 'todos' && (
                      <div className="ventas-favorito-depto">{etiquetaDepartamento(p.cat)}</div>
                    )}
                  </button>
                  <button
                    type="button"
                    className="producto-thumb-detalle-corner"
                    title="Ver detalle"
                    aria-label={`Detalle de ${p.nombre}`}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDetalleProductoId(p.id);
                    }}
                  >
                    <span className="producto-thumb-detalle-tri" aria-hidden />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {detalleProducto && (
        <div
          className="prod-modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={() => setDetalleProductoId(null)}
        >
          <div
            className="card"
            style={{
              width: 'min(520px, 96vw)',
              maxHeight: '90vh',
              overflow: 'auto',
              margin: '1rem auto',
              padding: 0,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="prod-modal-header" style={{ padding: '0.75rem 1rem' }}>
              <button
                type="button"
                className="prod-modal-close"
                aria-label="Cerrar"
                onClick={() => setDetalleProductoId(null)}
              >
                <Icon name="x" size={18} />
              </button>
              <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Detalle del producto</h2>
              <span style={{ width: 36 }} />
            </header>
            <div style={{ padding: '0 0.75rem 1rem' }}>
              <DetalleProducto producto={detalleProducto} supabase={supabase} sucursal={sucursal} verNegativos={verNegativos} />
              <button
                type="button"
                className="btn btn-primary"
                style={{ width: '100%', marginTop: '0.75rem' }}
                onClick={() => {
                  setCarrito((c) => addToCart(c, detalleProducto));
                  setDetalleProductoId(null);
                }}
              >
                <BtnLabel icon="cart">Agregar al ticket</BtnLabel>
              </button>
            </div>
          </div>
        </div>
      )}

      <aside className="card ventas-ticket">
        <div className="ventas-ticket-scan">
          <div className="ventas-ticket-scan-label">Escanear · buscar</div>
          <CampoCodigo
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            onEscanear={procesarCodigoCamara}
            inputRef={scanInputRef}
            placeholder="Código, nombre o 3*30…"
            tituloCamara="Escanear producto"
            labelCamara="Abrir cámara"
            camaraSoloIcono
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              const q = (busqueda || '').trim();
              if (!q) return;
              const mult = parseMultiplicadorBusqueda(q);
              if (mult.soloMultiplicador) {
                e.preventDefault();
                return; // Esperar código o escaneo (ej. 5*)
              }
              const exacto = productoPorCodigoExacto(enVenta, q);
              if (exacto) {
                e.preventDefault();
                setQtyEditId(null);
                agregarAlCarrito(exacto, true, mult.qty);
                setBusqueda('');
                return;
              }
              if (filtrados.length === 1) {
                e.preventDefault();
                setQtyEditId(null);
                agregarAlCarrito(filtrados[0], true, mult.qty);
                setBusqueda('');
              }
            }}
            inputStyle={{ padding: '0.7rem 0.8rem', fontSize: '1rem' }}
          />
          {parseMultiplicadorBusqueda(busqueda).soloMultiplicador ? (
            <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.8rem' }}>
              Cantidad ×{qtyPendienteBusqueda}: escanea o escribe el código y Enter
            </p>
          ) : null}
          {filtrados.length > 0 && (
            <div className="ventas-resultados-card ventas-resultados-card--ticket">
              <div className="ventas-seccion-head">
                <span>Resultados{qtyPendienteBusqueda > 1 ? ` · ×${qtyPendienteBusqueda}` : ''}</span>
                <span className="muted">{filtrados.length}</span>
              </div>
              <div className="ventas-resultados-lista">
                {filtrados.slice(0, 40).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setCarrito((c) => addToCart(c, p, qtyPendienteBusqueda));
                      setBusqueda('');
                    }}
                    className="ventas-resultado-item"
                  >
                    <ProductoThumb producto={p} size={36} />
                    <span className="ventas-resultado-meta">
                      <strong>{p.nombre}</strong>
                      <span className="muted"> · {p.id}</span>
                    </span>
                    <span className="ventas-resultado-precio">${precioVentaParaCaja(p).toFixed(2)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <h3 style={{ margin: '0.35rem 0 0.5rem', color: 'var(--brand-blue)' }}>Ticket</h3>
        {ultimaVenta && (
          <button type="button" className="btn btn-ghost" style={{ marginBottom: '0.5rem', fontSize: '0.8rem', padding: '0.35rem 0.5rem' }} onClick={reimprimirUltima}>
            Reimprimir último ticket
          </button>
        )}
        <div className="ventas-ticket-lineas">
          {carrito.length === 0 && <p className="muted">Carrito vacío</p>}
          {carrito.map((it) => {
            const qty = it.qty || 1;
            const editando = qtyEditId === it.id;
            return (
            <div key={it.id} className="ventas-carrito-linea">
              <ProductoThumb producto={it} size={40} />
              <div className="ventas-carrito-info">
                <span className="ventas-carrito-nombre">{it.nombre}</span>
                <button type="button" className="btn btn-ghost ventas-carrito-quitar" onClick={() => quitarDelCarrito(it)}>
                  Quitar
                </button>
              </div>
              <div
                className={`ventas-qty${editando ? ' ventas-qty--open' : ''}`}
                data-qty-stepper={it.id}
              >
                {editando ? (
                  <>
                    <button
                      type="button"
                      className="ventas-qty__btn"
                      aria-label="Quitar uno"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => ajustarQty(it.id, -1)}
                    >
                      −
                    </button>
                    <button
                      type="button"
                      className="ventas-qty__valor ventas-qty__valor--activo"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setQtyEditId(null);
                        enfocarBuscador();
                      }}
                      title="Cerrar"
                    >
                      {qty}
                    </button>
                    <button
                      type="button"
                      className="ventas-qty__btn"
                      aria-label="Agregar uno"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => ajustarQty(it.id, 1)}
                    >
                      +
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="ventas-qty__valor"
                    onClick={() => abrirEditorQty(it.id)}
                    title="Cambiar cantidad"
                    aria-label={`Cantidad ${qty}. Toca para ajustar`}
                  >
                    {qty}
                  </button>
                )}
              </div>
              <b className="ventas-carrito-importe">${(Number(it.precio) * qty).toFixed(2)}</b>
            </div>
            );
          })}
        </div>
        <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--brand-blue)', borderTop: '2px solid var(--brand-blue)', paddingTop: '0.75rem', marginTop: '0.5rem' }}>
          TOTAL ${totalMXN.toFixed(2)} MXN
        </div>
        <button
          type="button"
          className="btn btn-success"
          style={{ width: '100%', padding: '1rem', marginTop: '0.75rem', fontSize: '1.1rem' }}
          onClick={() => setMostrarCobro(true)}
          disabled={!carrito.length}
        >
          <BtnLabel icon="cart" iconSize={22}>Cobrar</BtnLabel>
        </button>
      </aside>
      </div>

      {mostrarCobro && (
        <div
          className="prod-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ventas-cobro-titulo"
          onClick={() => !finalizando && resetCobro({ setMostrarCobro, setFormaPago, setPagoCon, setRefPago })}
        >
          <div className="ventas-cobro-modal" onClick={(e) => e.stopPropagation()}>
            <header className="prod-modal-header">
              <button
                type="button"
                className="prod-modal-close"
                aria-label="Cerrar"
                disabled={finalizando}
                onClick={() => resetCobro({ setMostrarCobro, setFormaPago, setPagoCon, setRefPago })}
              >
                <Icon name="x" size={18} />
              </button>
              <h2 id="ventas-cobro-titulo" style={{ margin: 0, fontSize: '1.1rem' }}>Cobrar venta</h2>
              <span style={{ width: 36 }} />
            </header>
            <div className="ventas-cobro-body">
              <div className="ventas-cobro-total">
                TOTAL <strong>${totalMXN.toFixed(2)}</strong> MXN
              </div>
              <label className="muted" style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.35rem' }}>
                Forma de pago
              </label>
              {metodosPago.length === 0 ? (
                <p className="muted" style={{ fontSize: '0.85rem', marginBottom: '0.75rem' }}>
                  Activa al menos un método en <strong>Configuración → Métodos de pago</strong>.
                </p>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.75rem' }}>
                  {metodosPago.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className={formaPago === m.id ? 'btn btn-primary' : 'btn btn-ghost'}
                      style={{ flex: '1 1 calc(50% - 0.4rem)', minWidth: '100px', fontSize: '0.85rem', padding: '0.45rem 0.5rem' }}
                      onClick={() => elegirMetodo(m.id)}
                      disabled={finalizando}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              )}
              {esEfectivo ? (
                <>
                  <select
                    value={monedaPago}
                    onChange={(e) => setMonedaPago(e.target.value)}
                    className="select"
                    style={{ marginBottom: '0.5rem' }}
                    disabled={finalizando}
                  >
                    <option value="MXN">Pesos (MXN)</option>
                    <option value="USD">Dólares (USD)</option>
                  </select>
                  <button
                    type="button"
                    className={pagoCon === PAGO_EXACTO ? 'btn btn-primary' : 'btn btn-ghost'}
                    style={{ width: '100%', marginBottom: '0.5rem', fontWeight: 700 }}
                    onClick={() => setPagoCon(PAGO_EXACTO)}
                    disabled={finalizando}
                  >
                    Monto exacto · ${totalMXN.toFixed(2)} MXN
                  </button>
                  <select
                    value={pagoCon === PAGO_EXACTO ? '' : pagoCon}
                    onChange={(e) => setPagoCon(e.target.value)}
                    className="select"
                    style={{ marginBottom: '0.5rem' }}
                    disabled={finalizando}
                  >
                    <option value="">{pagoCon === PAGO_EXACTO ? 'Exacto seleccionado' : 'O pagar con billete…'}</option>
                    {(monedaPago === 'MXN' ? [20, 50, 100, 200, 500, 1000] : [1, 5, 10, 20, 50, 100]).map((d) => (
                      <option key={d} value={d}>
                        ${d} {monedaPago === 'MXN' ? 'MXN' : 'USD'}
                      </option>
                    ))}
                  </select>
                  <div className="ventas-cobro-cambio-previo">
                    {pagoCon === PAGO_EXACTO ? 'Cambio: $0.00 MXN (exacto)' : `Cambio: $${cambioMXN.toFixed(2)} MXN`}
                  </div>
                </>
              ) : (
                <>
                  <p className="muted" style={{ margin: '0 0 0.5rem', fontSize: '0.9rem' }}>
                    Cobro exacto · <strong>{metodoActual?.label}</strong> · ${totalMXN.toFixed(2)} MXN
                  </p>
                  {metodoActual && (
                    <label className="muted" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
                      Referencia / folio (anota los últimos 4 o 5 dígitos del ticket)
                      <input
                        className="input"
                        style={{ marginTop: '0.35rem' }}
                        value={refPago}
                        onChange={(e) => setRefPago(e.target.value)}
                        placeholder="Últimos 4 o 5 dígitos del ticket de la terminal…"
                        maxLength={64}
                        disabled={finalizando}
                      />
                      {String(metodoActual?.id || '').toLowerCase().includes('tarjeta') || /tarjeta/i.test(String(metodoActual?.label || '')) ? (
                        <span style={{ display: 'block', marginTop: '0.35rem', fontSize: '0.78rem', color: 'var(--brand-gold-dark, #b45309)' }}>
                          Cobra primero en la terminal y anota aquí los últimos 4 o 5 dígitos del ticket.
                        </span>
                      ) : null}
                    </label>
                  )}
                </>
              )}
              <button
                type="button"
                className="btn btn-success"
                style={{ width: '100%', padding: '0.85rem', fontSize: '1.05rem' }}
                onClick={finalizarVenta}
                disabled={!metodosPago.length || finalizando}
              >
                <BtnLabel icon="check">{finalizando ? 'Registrando…' : 'Finalizar venta'}</BtnLabel>
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ width: '100%', marginTop: '0.35rem' }}
                disabled={finalizando}
                onClick={() => resetCobro({ setMostrarCobro, setFormaPago, setPagoCon, setRefPago })}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {resultadoVenta && (
        <div
          className="prod-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ventas-cambio-titulo"
          onClick={() => setResultadoVenta(null)}
        >
          <div className="ventas-cambio-modal" onClick={(e) => e.stopPropagation()}>
            <h3 id="ventas-cambio-titulo">Venta registrada</h3>
            <p className="muted ventas-cambio-metodo">{resultadoVenta.metodo}</p>
            {resultadoVenta.offlineGuardada ? (
              <p
                style={{
                  margin: '0 0 0.65rem',
                  padding: '0.5rem 0.65rem',
                  borderRadius: 8,
                  background: 'rgba(185, 28, 28, 0.1)',
                  color: '#991b1b',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                }}
              >
                Guardada en MODO OFFLINE · se subirá sola al recuperar internet
              </p>
            ) : null}
            <div className="ventas-cambio-total">Total ${Number(resultadoVenta.total).toFixed(2)} MXN</div>
            {resultadoVenta.esEfectivo ? (
              <div className="ventas-cambio-monto">
                {resultadoVenta.pagoExacto || Number(resultadoVenta.cambio) === 0 ? (
                  <>
                    <span className="muted">Cambio</span>
                    <strong>$0.00</strong>
                  </>
                ) : (
                  <>
                    <span className="muted">Cambio</span>
                    <strong>${Number(resultadoVenta.cambio).toFixed(2)}</strong>
                  </>
                )}
              </div>
            ) : (
              <div className="ventas-cambio-monto ventas-cambio-monto--ok">
                <span className="muted">Cobro</span>
                <strong>Exacto</strong>
              </div>
            )}
            {resultadoVenta.avisoStock && (
              <p className="muted" style={{ fontSize: '0.8rem', margin: '0.5rem 0 0' }}>
                Revisa inventario: hubo un aviso al actualizar stock.
              </p>
            )}
            {resultadoVenta.ticketOmitido && ultimaVenta && (
              <button
                type="button"
                className="btn btn-gold"
                style={{ width: '100%', marginTop: '0.75rem' }}
                onClick={async () => {
                  const r = await imprimirVenta(ultimaVenta);
                  if (!r.ok) alert(r.error || 'No se pudo imprimir.');
                }}
              >
                Imprimir ticket
              </button>
            )}
            <button type="button" className="btn btn-primary" style={{ width: '100%', marginTop: '1rem' }} onClick={() => setResultadoVenta(null)}>
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
