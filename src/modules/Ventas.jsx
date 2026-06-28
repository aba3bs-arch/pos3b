import React, { useEffect, useMemo, useState } from 'react';
import { etiquetaMetodoPago, leerMetodosPago, leerConfigImpresion } from '../lib/posConfig.js';
import { imprimirVenta } from '../lib/impresion.js';
import { productoEnVenta, productoEsFavorito } from '../lib/productoForm.js';
import { BtnLabel } from '../components/Icon.jsx';
import CampoCodigo from '../components/CampoCodigo.jsx';
import { turnoActual, usuarioAutorizadoLogin, nombreTurnoLegible } from '../lib/turnos.js';
import { aplicarDeltaStock } from '../lib/inventarioMultitienda.js';
import { guardarMovimientoLocal } from '../lib/inventarioMovimientos.js';
import { sonidoEscaneoProducto } from '../lib/sonidosPos.js';

function addToCart(carrito, producto) {
  const i = carrito.findIndex((c) => c.id === producto.id);
  if (i >= 0) {
    const next = [...carrito];
    next[i] = { ...next[i], qty: (next[i].qty || 1) + 1 };
    return next;
  }
  return [...carrito, { ...producto, qty: 1 }];
}

function resetCobro(setters) {
  setters.setMostrarCobro(false);
  setters.setFormaPago('efectivo');
  setters.setPagoCon('');
  setters.setRefPago('');
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
}) {
  const [carrito, setCarrito] = useState([]);
  const [pagoCon, setPagoCon] = useState('');
  const [refPago, setRefPago] = useState('');
  const [monedaPago, setMonedaPago] = useState('MXN');
  const [formaPago, setFormaPago] = useState('efectivo');
  const [mostrarCobro, setMostrarCobro] = useState(false);
  const [metodosPago, setMetodosPago] = useState(() => leerMetodosPago());
  const [ultimaVenta, setUltimaVenta] = useState(null);

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

  const filtrados = useMemo(() => {
    const q = (busqueda || '').trim().toLowerCase();
    if (!q) return [];
    return inventario.filter(
      (p) =>
        productoEnVenta(p) &&
        (String(p.nombre || '')
          .toLowerCase()
          .includes(q) || String(p.id || '').includes(q)),
    );
  }, [inventario, busqueda]);

  const totalMXN = useMemo(() => carrito.reduce((acc, p) => acc + Number(p.precio || 0) * (p.qty || 1), 0), [carrito]);

  const esEfectivo = metodoActual?.tipo === 'efectivo';

  const cambioMXN = useMemo(() => {
    const montoRecibido = parseFloat(pagoCon) || 0;
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
    if (!supabase || !user) return;
    const acceso = usuarioAutorizadoLogin(user, new Date(), null, sucursal);
    if (!acceso.ok) return alert(acceso.error);
    const turno = turnoActual();
    if (!metodoActual) return alert('No hay métodos de pago activos. Configúralos en Configuración.');
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
    const deltas = [];
    for (const c of carrito) {
      const p = inventario.find((x) => x.id === c.id);
      const need = c.qty || 1;
      const calc = aplicarDeltaStock(p, sucursal, 'piso', -need, sucursal, { permitirNegativo: true });
      if (!calc.ok) return alert(`No se puede completar la venta: ${calc.error}`);
      deltas.push({
        id: c.id,
        nombre: c.nombre,
        need,
        patch: calc.patch,
        antes: calc.antes,
        despues: calc.despues,
      });
    }
    const { error } = await supabase.from('ventas').insert([
      {
        vendedor: user.nombre,
        usuario_id: user.id || null,
        sucursal_id: sucursal,
        total: totalMXN,
        metodo_pago: textoMetodoPago,
        articulos,
        turno_id: turno?.id || null,
        turno_nombre: nombreTurnoLegible(turno) || null,
      },
    ]);
    if (error) {
      alert(error.message);
      return;
    }
    const vendidoEn = new Date().toISOString();
    for (const d of deltas) {
      const { error: e2 } = await supabase.from('productos').update(d.patch).eq('id', d.id);
      if (e2) {
        alert(`Venta guardada pero no se pudo actualizar stock (${d.id}): ${e2.message}. Revisa inventario.`);
        cargarDatos();
        setCarrito([]);
        resetCobro({ setMostrarCobro, setFormaPago, setPagoCon, setRefPago });
        return;
      }
      guardarMovimientoLocal({
        tipo: 'retiro',
        modo: 'venta',
        producto_id: d.id,
        producto_nombre: d.nombre,
        cantidad: d.need,
        stock_antes: d.antes,
        stock_despues: d.despues,
        ubicacion: 'piso',
        motivo: `Venta · ${textoMetodoPago}`,
        usuario: user.nombre,
        sucursal,
        created_at: vendidoEn,
      });
    }
    alert(
      esEfectivo
        ? `Venta exitosa (${textoMetodoPago}). Cambio: $${cambioMXN.toFixed(2)} MXN`
        : `Venta registrada · ${textoMetodoPago}`,
    );
    const ticket = {
      sucursal,
      vendedor: user.nombre,
      articulos,
      total: totalMXN,
      metodo_pago: textoMetodoPago,
      esEfectivo,
      recibido: parseFloat(pagoCon) || totalMXN,
      cambio: esEfectivo ? cambioMXN : null,
      moneda: monedaPago,
    };
    setUltimaVenta(ticket);
    if (leerConfigImpresion().autoVenta) {
      const pr = await imprimirVenta(ticket);
      if (!pr.ok) console.warn(pr.error);
    }
    setCarrito([]);
    resetCobro({ setMostrarCobro, setFormaPago, setPagoCon, setRefPago });
    cargarDatos();
  };

  const setQty = (id, qty) => {
    setCarrito((c) =>
      c
        .map((row) => (row.id === id ? { ...row, qty: Math.max(1, qty) } : row))
        .filter((row) => row.qty > 0),
    );
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

  const agregarAlCarrito = (producto, conSonido = false) => {
    if (conSonido) sonidoEscaneoProducto();
    setCarrito((car) => addToCart(car, producto));
  };

  const procesarCodigoCamara = (codigo) => {
    const c = String(codigo || '').trim();
    if (!c) return;
    const exacto = inventario.find((p) => productoEnVenta(p) && String(p.id) === c);
    if (exacto) {
      agregarAlCarrito(exacto, true);
      setBusqueda('');
      return;
    }
    setBusqueda(c);
  };

  return (
    <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', alignItems: 'stretch' }}>
      <div style={{ flex: '1 1 360px', minWidth: 0 }}>
        <CampoCodigo
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          onEscanear={procesarCodigoCamara}
          placeholder="Escanee código o busque por nombre…"
          tituloCamara="Escanear producto"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && filtrados.length === 1) {
              agregarAlCarrito(filtrados[0], true);
              setBusqueda('');
            }
          }}
          inputStyle={{ padding: '1rem 1.1rem', fontSize: '1.05rem' }}
        />
        <div style={{ marginBottom: '0.75rem' }} />
        {filtrados.length > 0 && (
          <div className="card" style={{ marginBottom: '1rem', maxHeight: '220px', overflowY: 'auto' }}>
            <div className="muted" style={{ marginBottom: '0.5rem', fontSize: '0.8rem' }}>
              Resultados
            </div>
            {filtrados.slice(0, 40).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setCarrito((c) => addToCart(c, p));
                  setBusqueda('');
                }}
                style={{
                  display: 'flex',
                  width: '100%',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.5rem 0',
                  border: 'none',
                  borderBottom: '1px solid var(--border)',
                  background: 'transparent',
                  cursor: 'pointer',
                }}
              >
                <span>
                  <strong>{p.nombre}</strong>
                  <span className="muted"> · {p.id}</span>
                </span>
                <span style={{ color: 'var(--brand-red)', fontWeight: 700 }}>${Number(p.precio).toFixed(2)}</span>
              </button>
            ))}
          </div>
        )}
        <h4 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Favoritos</h4>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
            gap: '0.75rem',
          }}
        >
          {inventario
            .filter((p) => productoEnVenta(p) && productoEsFavorito(p))
            .map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setCarrito((c) => addToCart(c, p))}
                className="card"
                style={{
                  cursor: 'pointer',
                  textAlign: 'center',
                  padding: '0.85rem',
                  border: '2px solid rgba(200, 180, 68, 0.35)',
                }}
              >
                <div style={{ color: 'var(--brand-red)', fontWeight: 800, fontSize: '1.05rem' }}>${Number(p.precio).toFixed(2)}</div>
                <div style={{ fontSize: '0.85rem', marginTop: '0.35rem' }}>{p.nombre}</div>
              </button>
            ))}
        </div>
      </div>

      <aside
        className="card"
        style={{
          width: '100%',
          maxWidth: '340px',
          flex: '0 0 auto',
          display: 'flex',
          flexDirection: 'column',
          borderTop: '4px solid var(--brand-gold)',
        }}
      >
        <h3 style={{ margin: '0 0 0.5rem', color: 'var(--brand-blue)' }}>Ticket</h3>
        {ultimaVenta && (
          <button type="button" className="btn btn-ghost" style={{ marginBottom: '0.5rem', fontSize: '0.8rem', padding: '0.35rem 0.5rem' }} onClick={reimprimirUltima}>
            Reimprimir último ticket
          </button>
        )}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: '120px' }}>
          {carrito.length === 0 && <p className="muted">Carrito vacío</p>}
          {carrito.map((it) => (
            <div
              key={it.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto auto',
                gap: '0.35rem',
                alignItems: 'center',
                marginBottom: '0.5rem',
                fontSize: '0.9rem',
              }}
            >
              <span>{it.nombre}</span>
              <input
                type="number"
                min={1}
                className="input"
                style={{ width: '64px', padding: '0.35rem' }}
                value={it.qty || 1}
                onChange={(e) => setQty(it.id, parseInt(e.target.value, 10) || 1)}
              />
              <b>${(Number(it.precio) * (it.qty || 1)).toFixed(2)}</b>
              <button type="button" className="btn btn-ghost" style={{ gridColumn: '1 / -1', fontSize: '0.75rem' }} onClick={() => setCarrito((c) => c.filter((x) => x.id !== it.id))}>
                Quitar línea
              </button>
            </div>
          ))}
        </div>
        <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--brand-blue)', borderTop: '2px solid var(--brand-blue)', paddingTop: '0.75rem', marginTop: '0.5rem' }}>
          TOTAL ${totalMXN.toFixed(2)} MXN
        </div>
        {mostrarCobro ? (
          <div style={{ background: 'var(--surface)', padding: '0.85rem', borderRadius: '12px', marginTop: '0.75rem' }}>
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
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            )}
            {esEfectivo ? (
              <>
                <select value={monedaPago} onChange={(e) => setMonedaPago(e.target.value)} className="select" style={{ marginBottom: '0.5rem' }}>
                  <option value="MXN">Pesos (MXN)</option>
                  <option value="USD">Dólares (USD)</option>
                </select>
                <select value={pagoCon} onChange={(e) => setPagoCon(e.target.value)} className="select" style={{ marginBottom: '0.5rem' }}>
                  <option value="">Seleccione denominación…</option>
                  {(monedaPago === 'MXN' ? [20, 50, 100, 200, 500, 1000] : [1, 5, 10, 20, 50, 100]).map((d) => (
                    <option key={d} value={d}>
                      ${d} {monedaPago === 'MXN' ? 'MXN' : 'USD'}
                    </option>
                  ))}
                </select>
                <div style={{ color: 'var(--brand-green)', fontWeight: 700, marginBottom: '0.5rem' }}>Cambio: ${cambioMXN.toFixed(2)} MXN</div>
              </>
            ) : (
              <>
                <p className="muted" style={{ margin: '0 0 0.5rem', fontSize: '0.9rem' }}>
                  Cobro exacto · <strong>{metodoActual?.label}</strong> · ${totalMXN.toFixed(2)} MXN
                </p>
                {metodoActual && (
                  <label className="muted" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
                    Referencia / folio (opcional)
                    <input
                      className="input"
                      style={{ marginTop: '0.35rem' }}
                      value={refPago}
                      onChange={(e) => setRefPago(e.target.value)}
                      placeholder="Últimos dígitos, SPEI, autorización…"
                      maxLength={64}
                    />
                  </label>
                )}
              </>
            )}
            <button type="button" className="btn btn-success" style={{ width: '100%' }} onClick={finalizarVenta} disabled={!metodosPago.length}>
              <BtnLabel icon="check">Finalizar venta</BtnLabel>
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ width: '100%', marginTop: '0.35rem' }}
              onClick={() => resetCobro({ setMostrarCobro, setFormaPago, setPagoCon, setRefPago })}
            >
              Volver
            </button>
          </div>
        ) : (
          <button type="button" className="btn btn-success" style={{ width: '100%', padding: '1rem', marginTop: '0.75rem', fontSize: '1.1rem' }} onClick={() => setMostrarCobro(true)} disabled={!carrito.length}>
            <BtnLabel icon="cart" iconSize={22}>Cobrar</BtnLabel>
          </button>
        )}
      </aside>
    </div>
  );
}
