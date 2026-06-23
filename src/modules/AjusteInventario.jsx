import React, { useEffect, useMemo, useRef, useState } from 'react';
import { aplicarEntradasMasivas, aplicarMovimientoInventario, leerMovimientosLocal, TIPOS_MOVIMIENTO } from '../lib/inventarioMovimientos.js';
import { imprimirMovimientoInventario } from '../lib/impresion.js';
import { buscarProductoInventario } from '../lib/comprasRecepcion.js';
import Icon from '../components/Icon.jsx';
import ConteoPorDepartamento from './ConteoPorDepartamento.jsx';

export default function AjusteInventario({ supabase, inventario, cargarDatos, user, sucursal }) {
  const [modo, setModo] = useState('libre');
  const [tipo, setTipo] = useState('entrada');
  const [productoId, setProductoId] = useState('');
  const [destinoId, setDestinoId] = useState('');
  const [cantidad, setCantidad] = useState('1');
  const [motivo, setMotivo] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [historial, setHistorial] = useState(() => leerMovimientosLocal());
  const [aplicando, setAplicando] = useState(false);
  const [lineasMasivas, setLineasMasivas] = useState([]);
  const [busquedaMasiva, setBusquedaMasiva] = useState('');
  const [productoMasivoId, setProductoMasivoId] = useState('');
  const [codigoEscaneo, setCodigoEscaneo] = useState('');
  const scanInputRef = useRef(null);
  const cantidadInputRef = useRef(null);

  useEffect(() => {
    if (modo === 'libre') scanInputRef.current?.focus();
  }, [modo]);

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

  const productoOrigen = inventario.find((p) => p.id === productoId);
  const productoDestino = inventario.find((p) => p.id === destinoId);

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

  const destinosTraspaso = useMemo(() => {
    if (tipo !== 'traspaso') return [];
    return inventario.filter((p) => p.id !== productoId);
  }, [inventario, tipo, productoId]);

  const procesarEscaneo = (raw) => {
    const codigo = String(raw ?? codigoEscaneo).trim();
    if (!codigo) return;
    const { producto, ambiguo } = buscarProductoInventario(inventario, codigo);
    if (ambiguo) {
      setBusqueda(codigo);
      setCodigoEscaneo('');
      alert('Varios productos coinciden. Elige uno de la lista.');
      return;
    }
    if (!producto) {
      setCodigoEscaneo('');
      alert(`Producto no encontrado: ${codigo}`);
      scanInputRef.current?.focus();
      return;
    }
    setProductoId(producto.id);
    setBusqueda('');
    setCodigoEscaneo('');
    setDestinoId('');
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
      productoDestino,
      motivo,
      usuario: user?.nombre,
      sucursal,
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
    if (tipo !== 'traspaso') setProductoId('');
    setDestinoId('');
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
      motivo,
      usuario: user?.nombre,
      sucursal,
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
      return { id: l.productoId, nombre: p?.nombre || l.productoId, cantidad: l.cantidad, tipo: 'entrada' };
    });
    await imprimirMovimientoInventario({
      titulo: 'ENTRADA MÚLTIPLE DE INVENTARIO',
      sucursal,
      usuario: user?.nombre,
      motivo,
      lineas: lineasPrint,
    });
    setLineasMasivas([]);
    setMotivo('');
    cargarDatos();
  };

  const imprimirHistorial = () => {
    const recientes = historial.slice(0, 25).map((m) => ({
      id: m.producto_id,
      nombre: m.producto_nombre || m.producto_id,
      cantidad: m.cantidad,
      tipo: m.tipo + (m.producto_destino_nombre ? ` → ${m.producto_destino_nombre}` : ''),
    }));
    imprimirMovimientoInventario({
      titulo: 'HISTORIAL DE MOVIMIENTOS',
      sucursal,
      usuario: user?.nombre,
      lineas: recientes,
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="card" style={{ borderTop: '4px solid var(--brand-gold)' }}>
        <h3 style={{ margin: '0 0 0.5rem', color: 'var(--brand-blue)' }}>Ajuste de inventario</h3>
        <p className="muted" style={{ marginTop: 0, fontSize: '0.85rem' }}>
          Registra entradas, retiros o traspasos entre productos. Los movimientos actualizan el stock en Supabase y quedan en el historial de este equipo.
          {modo === 'libre' && ' En inventario libre puedes escanear el código de barras con el lector USB (HID).'}
        </p>

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
              setDestinoId('');
            }}
          >
            Entrada múltiple
          </button>
        </div>

        {modo === 'departamento' && (
          <p className="muted" style={{ fontSize: '0.85rem', margin: '0.75rem 0 0' }}>
            Conteo físico con existencia, cantidad contada, diferencias y folio de ajuste al aplicar.
          </p>
        )}

        {modo !== 'masivo' && modo !== 'departamento' && (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '1rem' }}>
              {TIPOS_MOVIMIENTO.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={tipo === t.id ? 'btn btn-primary' : 'btn btn-ghost'}
                  style={{ flex: '1 1 140px' }}
                  onClick={() => {
                    setTipo(t.id);
                    setDestinoId('');
                  }}
                  title={t.desc}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <p className="muted" style={{ fontSize: '0.8rem', margin: '0.35rem 0 0' }}>{TIPOS_MOVIMIENTO.find((t) => t.id === tipo)?.desc}</p>
          </>
        )}
        {modo === 'masivo' && (
          <p className="muted" style={{ fontSize: '0.85rem', margin: '0.75rem 0 0' }}>
            Agrega varios productos con sus cantidades y aplica todas las entradas en un solo paso (recepción de mercancía, conteo, etc.).
          </p>
        )}
      </div>

      {modo === 'departamento' ? (
        <ConteoPorDepartamento
          supabase={supabase}
          inventario={inventario}
          cargarDatos={cargarDatos}
          user={user}
          sucursal={sucursal}
          onHistorialChange={setHistorial}
        />
      ) : modo === 'masivo' ? (
        <div className="card">
          <h4 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Productos a ingresar</h4>
          <div className="grid-2">
            <label className="muted" style={{ gridColumn: '1 / -1' }}>
              Buscar producto
              <input className="input" style={{ marginTop: '0.35rem' }} value={busquedaMasiva} onChange={(e) => setBusquedaMasiva(e.target.value)} placeholder="Nombre o código…" />
            </label>
            <label className="muted">
              Producto
              <select className="select" style={{ marginTop: '0.35rem' }} value={productoMasivoId} onChange={(e) => setProductoMasivoId(e.target.value)}>
                <option value="">— Elegir —</option>
                {productosBusquedaMasiva.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre} · Stock {p.stock} · {p.cat}
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
                  <th>Stock actual</th>
                  <th>Cantidad</th>
                  <th>Quedaría</th>
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
                    const stock = Number(p?.stock) || 0;
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
      ) : (
      <div className="card">
        <div className="grid-2">
          {modo === 'libre' && (
            <>
              <label className="muted" style={{ gridColumn: '1 / -1' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Icon name="scan" size={16} />
                  Escanear código de barras
                </span>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.35rem', flexWrap: 'wrap' }}>
                  <input
                    ref={scanInputRef}
                    className="input"
                    style={{ flex: '1 1 220px', fontSize: '1.1rem', padding: '0.75rem 1rem', letterSpacing: '0.05em' }}
                    value={codigoEscaneo}
                    onChange={(e) => setCodigoEscaneo(e.target.value)}
                    onKeyDown={onScanKeyDown}
                    placeholder="Apunta el lector aquí y escanea…"
                    autoComplete="off"
                  />
                  <button type="button" className="btn btn-primary" onClick={() => procesarEscaneo()} disabled={!codigoEscaneo.trim()}>
                    Buscar código
                  </button>
                </div>
                <span className="muted" style={{ display: 'block', fontSize: '0.75rem', marginTop: '0.35rem' }}>
                  El lector USB escribe el código y pulsa Enter. Luego indica cantidad y aplica el movimiento.
                </span>
              </label>
              <label className="muted" style={{ gridColumn: '1 / -1' }}>
                O buscar por nombre / código
                <input className="input" style={{ marginTop: '0.35rem' }} value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Nombre o código…" />
              </label>
            </>
          )}
          <label className="muted">
            {tipo === 'traspaso' ? 'Producto origen' : 'Producto'}
            <select className="select" style={{ marginTop: '0.35rem' }} value={productoId} onChange={(e) => setProductoId(e.target.value)}>
              <option value="">— Elegir —</option>
              {productosFiltrados.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre} · Stock {p.stock} · {p.cat}
                </option>
              ))}
            </select>
          </label>
          {tipo === 'traspaso' && (
            <label className="muted">
              Producto destino
              <select className="select" style={{ marginTop: '0.35rem' }} value={destinoId} onChange={(e) => setDestinoId(e.target.value)}>
                <option value="">— Elegir —</option>
                {destinosTraspaso.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre} · Stock {p.stock}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="muted">
            Cantidad (unidades)
            <input ref={cantidadInputRef} className="input" type="number" min={1} style={{ marginTop: '0.35rem' }} value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
          </label>
          <label className="muted" style={{ gridColumn: '1 / -1' }}>
            Motivo / referencia (opcional)
            <input className="input" style={{ marginTop: '0.35rem' }} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. Conteo físico, merma, traspaso a piso…" />
          </label>
        </div>

        {productoOrigen && (
          <div style={{ marginTop: '0.75rem', padding: '0.75rem', borderRadius: '10px', background: 'var(--surface)', fontSize: '0.9rem' }}>
            <strong>{productoOrigen.nombre}</strong>
            <span className="muted"> · Código {productoOrigen.id} · Depto. {productoOrigen.cat} · Stock actual: </span>
            <strong>{productoOrigen.stock}</strong>
            {tipo === 'entrada' && cantidad && (
              <span className="muted"> → quedaría en {Number(productoOrigen.stock) + (parseInt(cantidad, 10) || 0)}</span>
            )}
            {tipo === 'retiro' && cantidad && (
              <span className="muted"> → quedaría en {Math.max(0, Number(productoOrigen.stock) - (parseInt(cantidad, 10) || 0))}</span>
            )}
          </div>
        )}

        <button type="button" className="btn btn-success" style={{ marginTop: '0.75rem' }} onClick={aplicar} disabled={aplicando}>
          {aplicando ? 'Aplicando…' : 'Aplicar movimiento'}
        </button>
      </div>
      )}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <h3 style={{ margin: '0', color: 'var(--brand-blue)' }}>Historial reciente (este equipo)</h3>
          <button type="button" className="btn btn-ghost" style={{ fontSize: '0.8rem' }} onClick={imprimirHistorial} disabled={!historial.length}>
            Imprimir historial
          </button>
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
              {historial.length === 0 ? (
                <tr>
                  <td colSpan={6} className="muted">
                    Sin movimientos registrados aún.
                  </td>
                </tr>
              ) : (
                historial.slice(0, 25).map((m) => (
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
    </div>
  );
}
