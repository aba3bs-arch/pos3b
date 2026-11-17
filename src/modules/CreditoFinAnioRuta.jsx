import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { etiquetaTienda, esSucursalRuta, listarSucursalesOperativas } from '../constants/sucursales.js';
import { fmtMonto } from '../lib/consultasUi.js';
import {
  ESTADO_CERRADA,
  TIPO_RETIRAR,
  archivarAbonoFinAnio,
  archivarCuentaFinAnio,
  archivarMovimientoFinAnio,
  crearCuentaFinAnio,
  dejarMercanciaFinAnio,
  editarAbonoFinAnio,
  editarCuentaFinAnio,
  editarMovimientoFinAnio,
  codigoVisibleProducto,
  inventarioDeMovimientos,
  listarAbonosFinAnio,
  listarCuentasFinAnio,
  listarMovimientosFinAnio,
  nombreCuentaFinAnio,
  productoParaCargarFinAnio,
  registrarAbonoFinAnio,
  resumenCuenta,
  resumenPorSucursal,
  retirarMercanciaFinAnio,
  sugerenciasCatalogoFinAnio,
} from '../lib/creditoFinAnio.js';

const COLOR = '#3730a3';

function fechaPhoenix(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-MX', {
    timeZone: 'America/Phoenix',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtQty(n) {
  const v = Number(n) || 0;
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 1000) / 1000);
}

function precioDeProducto(p) {
  const n = Number(p?.precio_venta ?? p?.precio ?? 0);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function Campo({ label, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.85rem' }}>
      {label}
      {children}
    </label>
  );
}

export default function CreditoFinAnioRuta({ supabase, user, inventario = [], onVolver }) {
  const [cuentas, setCuentas] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [abonos, setAbonos] = useState([]);
  const [aviso, setAviso] = useState('');
  const [sucursalId, setSucursalId] = useState('');
  const [cuentaId, setCuentaId] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [nombreNueva, setNombreNueva] = useState(() => nombreCuentaFinAnio());
  const [notasNueva, setNotasNueva] = useState('');
  const [deja, setDeja] = useState({ codigo: '', nombre: '', cantidad: '', precio: '', notas: '' });
  const [busca, setBusca] = useState('');
  const [retiroClave, setRetiroClave] = useState('');
  const [retiro, setRetiro] = useState({ cantidad: '', precio: '', notas: '' });
  const [abono, setAbono] = useState({ monto: '', notas: '' });
  const [editCuenta, setEditCuenta] = useState(null);
  const [editMov, setEditMov] = useState(null);
  const [editAbono, setEditAbono] = useState(null);

  const tiendas = useMemo(
    () => listarSucursalesOperativas().filter((s) => !esSucursalRuta(s)),
    [],
  );

  const cargar = useCallback(async () => {
    if (!supabase) return;
    const [c, m, a] = await Promise.all([
      listarCuentasFinAnio(supabase),
      listarMovimientosFinAnio(supabase),
      listarAbonosFinAnio(supabase),
    ]);
    setCuentas(c.data || []);
    setMovimientos(m.data || []);
    setAbonos(a.data || []);
    setAviso(c.aviso || m.aviso || a.aviso || c.error || m.error || a.error || '');
  }, [supabase]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const porSucursal = useMemo(
    () => resumenPorSucursal(cuentas, movimientos, abonos),
    [cuentas, movimientos, abonos],
  );
  const cuentasTienda = useMemo(
    () => cuentas.filter((c) => String(c.sucursal_id || '').toUpperCase() === sucursalId),
    [cuentas, sucursalId],
  );
  const cuenta = cuentasTienda.find((c) => String(c.id) === String(cuentaId)) || null;
  const movsCuenta = useMemo(
    () => movimientos.filter((m) => String(m.cuenta_id) === String(cuentaId)),
    [movimientos, cuentaId],
  );
  const abonosCuenta = useMemo(
    () => abonos.filter((a) => String(a.cuenta_id) === String(cuentaId)),
    [abonos, cuentaId],
  );
  const inventarioCuenta = useMemo(() => inventarioDeMovimientos(movsCuenta), [movsCuenta]);
  const resumen = useMemo(() => resumenCuenta(movsCuenta, abonosCuenta), [movsCuenta, abonosCuenta]);
  const cerrada = cuenta?.estado === ESTADO_CERRADA;
  const lineaRetiro = inventarioCuenta.find((l) => l.clave === retiroClave) || null;

  const sugerencias = useMemo(
    () => sugerenciasCatalogoFinAnio(inventario, busca),
    [busca, inventario],
  );

  useEffect(() => {
    const p = productoParaCargarFinAnio(inventario, busca);
    if (!p) return;
    const codigo = codigoVisibleProducto(p);
    const nombre = p.nombre || '';
    const precio = String(precioDeProducto(p) || '');
    setDeja((d) => {
      if (d.codigo === codigo && d.nombre === nombre && d.precio === precio) return d;
      return { ...d, codigo, nombre, precio };
    });
  }, [busca, inventario]);

  const correr = async (fn) => {
    if (guardando) return;
    setGuardando(true);
    const r = await fn();
    setGuardando(false);
    if (!r?.ok) {
      alert(r?.error || 'No se pudo guardar.');
      return false;
    }
    await cargar();
    return true;
  };

  const abrirCuenta = async () => {
    if (guardando) return;
    setGuardando(true);
    const r = await crearCuentaFinAnio(supabase, {
      sucursalId,
      nombre: nombreNueva,
      notas: notasNueva,
      user,
    });
    setGuardando(false);
    if (!r?.ok) {
      alert(r?.error || 'No se pudo abrir la cuenta.');
      return;
    }
    setNotasNueva('');
    setNombreNueva(nombreCuentaFinAnio());
    await cargar();
    if (r.data?.id) setCuentaId(r.data.id);
  };

  const dejar = async () => {
    const ok = await correr(() => dejarMercanciaFinAnio(supabase, cuenta.id, deja, user));
    if (!ok) return;
    setDeja({ codigo: '', nombre: '', cantidad: '', precio: '', notas: '' });
    setBusca('');
  };

  const retirar = async () => {
    if (!lineaRetiro) return alert('Elige un producto del inventario de la cuenta.');
    const ok = await correr(() => retirarMercanciaFinAnio(supabase, cuenta.id, {
      codigo: lineaRetiro.codigo,
      nombre: lineaRetiro.nombre,
      cantidad: retiro.cantidad,
      precio: retiro.precio === '' ? (lineaRetiro.cantidad ? lineaRetiro.valor / lineaRetiro.cantidad : 0) : retiro.precio,
      notas: retiro.notas,
    }, lineaRetiro.cantidad, user));
    if (!ok) return;
    setRetiro({ cantidad: '', precio: '', notas: '' });
    setRetiroClave('');
  };

  const abonar = async () => {
    const ok = await correr(() => registrarAbonoFinAnio(supabase, cuenta.id, abono, user));
    if (!ok) return;
    setAbono({ monto: '', notas: '' });
  };

  const elegirProducto = (p) => {
    setDeja((d) => ({
      ...d,
      codigo: codigoVisibleProducto(p),
      nombre: p.nombre || '',
      precio: String(precioDeProducto(p) || ''),
    }));
    setBusca('');
  };

  const volverTiendas = () => {
    setSucursalId('');
    setCuentaId('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-ghost" onClick={onVolver}>← Venta en ruta</button>
        {sucursalId && (
          <button type="button" className="btn btn-ghost" onClick={volverTiendas}>← Sucursales</button>
        )}
        {cuenta && (
          <button type="button" className="btn btn-ghost" onClick={() => setCuentaId('')}>← {etiquetaTienda(sucursalId)}</button>
        )}
      </div>

      <div className="card" style={{ borderTop: `4px solid ${COLOR}` }}>
        <h3 style={{ margin: 0, color: COLOR }}>Crédito fin de año</h3>
        <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.85rem' }}>
          Registro propio de cada sucursal: mercancía dejada a crédito, inventario de la cuenta y abonos.
          Sirve para el cierre de este año.
        </p>
      </div>

      {aviso && (
        <div className="card" style={{ borderLeft: '4px solid #b45309' }}>
          <p style={{ margin: 0 }}>{aviso}</p>
        </div>
      )}

      {!sucursalId && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.75rem' }}>
          {tiendas.map((id) => {
            const r = porSucursal.get(id) || { cuentas: 0, abiertas: 0, saldoMercancia: 0, saldo: 0 };
            return (
              <button
                key={id}
                type="button"
                className="card"
                onClick={() => { setSucursalId(id); setCuentaId(''); }}
                style={{ textAlign: 'left', cursor: 'pointer', borderTop: `4px solid ${COLOR}` }}
              >
                <strong style={{ color: COLOR }}>{etiquetaTienda(id)}</strong>
                <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.82rem' }}>
                  {r.cuentas} cuenta{r.cuentas === 1 ? '' : 's'} · {r.abiertas} abierta{r.abiertas === 1 ? '' : 's'}
                </p>
                <p style={{ margin: '0.35rem 0 0' }}>Mercancía {fmtMonto(r.saldoMercancia)}</p>
                <p style={{ margin: '0.15rem 0 0' }}>Saldo {fmtMonto(r.saldo)}</p>
              </button>
            );
          })}
        </div>
      )}

      {sucursalId && !cuenta && (
        <div className="card" style={{ display: 'grid', gap: '0.75rem' }}>
          <h3 style={{ margin: 0 }}>{etiquetaTienda(sucursalId)}</h3>
          {cuentasTienda.length === 0 && (
            <p className="muted" style={{ margin: 0 }}>Esta sucursal todavía no tiene cuentas de fin de año.</p>
          )}
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            {cuentasTienda.map((c) => {
              const r = resumenCuenta(
                movimientos.filter((m) => String(m.cuenta_id) === String(c.id)),
                abonos.filter((a) => String(a.cuenta_id) === String(c.id)),
              );
              return (
                <button
                  key={c.id}
                  type="button"
                  className="btn btn-ghost"
                  style={{ justifyContent: 'space-between', textAlign: 'left' }}
                  onClick={() => setCuentaId(c.id)}
                >
                  <span>
                    <strong>{c.nombre}</strong>
                    <span className="muted"> · {c.estado === ESTADO_CERRADA ? 'cerrada' : 'abierta'}</span>
                  </span>
                  <span>Saldo {fmtMonto(r.saldo)}</span>
                </button>
              );
            })}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.5rem' }}>
            <Campo label="Nueva cuenta">
              <input className="input" value={nombreNueva} onChange={(e) => setNombreNueva(e.target.value)} />
            </Campo>
            <Campo label="Notas">
              <input className="input" value={notasNueva} onChange={(e) => setNotasNueva(e.target.value)} />
            </Campo>
          </div>
          <button type="button" className="btn btn-primary" disabled={guardando} onClick={() => void abrirCuenta()}>
            Abrir cuenta
          </button>
        </div>
      )}

      {cuenta && (
        <>
          <div className="card" style={{ display: 'grid', gap: '0.45rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
              <div>
                <h3 style={{ margin: 0 }}>{cuenta.nombre}</h3>
                <p className="muted" style={{ margin: '0.2rem 0 0', fontSize: '0.82rem' }}>
                  {etiquetaTienda(sucursalId)} · {cerrada ? 'Cerrada' : 'Abierta'}
                  {cuenta.notas ? ` · ${cuenta.notas}` : ''}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setEditCuenta({ nombre: cuenta.nombre, notas: cuenta.notas || '' })}>Editar</button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => void correr(() => editarCuentaFinAnio(supabase, cuenta.id, { estado: cerrada ? 'abierta' : ESTADO_CERRADA }))}
                >
                  {cerrada ? 'Reabrir' : 'Cerrar'}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    if (!confirm('¿Quitar esta cuenta del registro?')) return;
                    void correr(() => archivarCuentaFinAnio(supabase, cuenta.id)).then((ok) => { if (ok) setCuentaId(''); });
                  }}
                >
                  Eliminar
                </button>
              </div>
            </div>
            {editCuenta && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.5rem' }}>
                <Campo label="Nombre">
                  <input className="input" value={editCuenta.nombre} onChange={(e) => setEditCuenta({ ...editCuenta, nombre: e.target.value })} />
                </Campo>
                <Campo label="Notas">
                  <input className="input" value={editCuenta.notas} onChange={(e) => setEditCuenta({ ...editCuenta, notas: e.target.value })} />
                </Campo>
                <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'end' }}>
                  <button type="button" className="btn btn-primary" onClick={() => void correr(() => editarCuentaFinAnio(supabase, cuenta.id, editCuenta)).then((ok) => { if (ok) setEditCuenta(null); })}>Guardar</button>
                  <button type="button" className="btn btn-ghost" onClick={() => setEditCuenta(null)}>Cancelar</button>
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.92rem' }}>
              <span>Dejado {fmtMonto(resumen.dejado)}</span>
              <span>Retirado {fmtMonto(resumen.retirado)}</span>
              <span>Mercancía {fmtMonto(resumen.saldoMercancia)}</span>
              <span>Abonos {fmtMonto(resumen.abonado)}</span>
              <strong>Saldo {fmtMonto(resumen.saldo)}</strong>
            </div>
            {resumen.saldo < 0 && <p className="muted" style={{ margin: 0 }}>La cuenta queda a favor de la sucursal.</p>}
          </div>

          {!cerrada && (
            <div className="card" style={{ display: 'grid', gap: '0.55rem' }}>
              <h4 style={{ margin: 0 }}>Dejar mercancía a crédito</h4>
              <Campo label="Buscar en el catálogo (un código carga ese artículo; no mueve el inventario)">
                <input className="input" value={busca} placeholder="Código o nombre" onChange={(e) => setBusca(e.target.value)} />
              </Campo>
              {sugerencias.length > 0 && (
                <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                  {sugerencias.map((p) => (
                    <button key={p.id || p.codigo} type="button" className="btn btn-ghost" style={{ fontSize: '0.8rem' }} onClick={() => elegirProducto(p)}>
                      {codigoVisibleProducto(p) ? `${codigoVisibleProducto(p)} · ` : ''}{p.nombre}
                    </button>
                  ))}
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.5rem' }}>
                <Campo label="Producto">
                  <input className="input" value={deja.nombre} onChange={(e) => setDeja({ ...deja, nombre: e.target.value })} />
                </Campo>
                <Campo label="Código">
                  <input className="input" value={deja.codigo} onChange={(e) => setDeja({ ...deja, codigo: e.target.value })} />
                </Campo>
                <Campo label="Cantidad">
                  <input className="input" inputMode="decimal" value={deja.cantidad} onChange={(e) => setDeja({ ...deja, cantidad: e.target.value })} />
                </Campo>
                <Campo label="Precio">
                  <input className="input" inputMode="decimal" value={deja.precio} onChange={(e) => setDeja({ ...deja, precio: e.target.value })} />
                </Campo>
                <Campo label="Nota">
                  <input className="input" value={deja.notas} onChange={(e) => setDeja({ ...deja, notas: e.target.value })} />
                </Campo>
              </div>
              <button type="button" className="btn btn-primary" disabled={guardando} onClick={() => void dejar()}>Dejar en la cuenta</button>
            </div>
          )}

          <div className="card" style={{ overflowX: 'auto' }}>
            <h4 style={{ margin: '0 0 0.5rem' }}>Inventario de la cuenta</h4>
            {inventarioCuenta.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>Todavía no hay mercancía en esta cuenta.</p>
            ) : (
              <table className="table" style={{ width: '100%', fontSize: '0.85rem' }}>
                <thead>
                  <tr><th>Producto</th><th>Código</th><th>Cantidad</th><th>Valor</th></tr>
                </thead>
                <tbody>
                  {inventarioCuenta.map((l) => (
                    <tr key={l.clave}>
                      <td>{l.nombre}</td>
                      <td>{l.codigo || '—'}</td>
                      <td>{fmtQty(l.cantidad)}</td>
                      <td>{fmtMonto(l.valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {!cerrada && inventarioCuenta.some((l) => l.cantidad > 0) && (
            <div className="card" style={{ display: 'grid', gap: '0.55rem' }}>
              <h4 style={{ margin: 0 }}>Retirar de la cuenta</h4>
              <Campo label="Producto">
                <select
                  className="input"
                  value={retiroClave}
                  onChange={(e) => {
                    const clave = e.target.value;
                    setRetiroClave(clave);
                    const linea = inventarioCuenta.find((l) => l.clave === clave);
                    const precio = linea && linea.cantidad ? linea.valor / linea.cantidad : 0;
                    setRetiro((r) => ({ ...r, precio: precio ? String(Math.round(precio * 100) / 100) : '' }));
                  }}
                >
                  <option value="">Elige</option>
                  {inventarioCuenta.filter((l) => l.cantidad > 0).map((l) => (
                    <option key={l.clave} value={l.clave}>{l.nombre} · {fmtQty(l.cantidad)}</option>
                  ))}
                </select>
              </Campo>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.5rem' }}>
                <Campo label="Cantidad">
                  <input className="input" inputMode="decimal" value={retiro.cantidad} onChange={(e) => setRetiro({ ...retiro, cantidad: e.target.value })} />
                </Campo>
                <Campo label="Precio">
                  <input className="input" inputMode="decimal" value={retiro.precio} onChange={(e) => setRetiro({ ...retiro, precio: e.target.value })} />
                </Campo>
                <Campo label="Nota">
                  <input className="input" value={retiro.notas} onChange={(e) => setRetiro({ ...retiro, notas: e.target.value })} />
                </Campo>
              </div>
              <button type="button" className="btn btn-primary" disabled={guardando} onClick={() => void retirar()}>Retirar</button>
            </div>
          )}

          {!cerrada && (
            <div className="card" style={{ display: 'grid', gap: '0.55rem' }}>
              <h4 style={{ margin: 0 }}>Abono a la cuenta</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.5rem' }}>
                <Campo label="Monto">
                  <input className="input" inputMode="decimal" value={abono.monto} onChange={(e) => setAbono({ ...abono, monto: e.target.value })} />
                </Campo>
                <Campo label="Nota">
                  <input className="input" value={abono.notas} onChange={(e) => setAbono({ ...abono, notas: e.target.value })} />
                </Campo>
              </div>
              <button type="button" className="btn btn-primary" disabled={guardando} onClick={() => void abonar()}>Registrar abono</button>
            </div>
          )}

          <div className="card" style={{ overflowX: 'auto' }}>
            <h4 style={{ margin: '0 0 0.5rem' }}>Movimientos</h4>
            {movsCuenta.length === 0 ? <p className="muted" style={{ margin: 0 }}>Sin movimientos.</p> : (
              <table className="table" style={{ width: '100%', fontSize: '0.85rem' }}>
                <thead>
                  <tr><th>Fecha</th><th>Tipo</th><th>Producto</th><th>Cant.</th><th>Importe</th><th></th></tr>
                </thead>
                <tbody>
                  {movsCuenta.map((m) => (
                    <tr key={m.id}>
                      <td>{fechaPhoenix(m.created_at)}</td>
                      <td>{m.tipo === TIPO_RETIRAR ? 'Retiro' : 'Dejó'}</td>
                      <td>{m.nombre}</td>
                      <td>{fmtQty(m.cantidad)}</td>
                      <td>{fmtMonto(m.importe)}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button type="button" className="btn btn-ghost" style={{ fontSize: '0.78rem' }} onClick={() => setEditMov({ id: m.id, nombre: m.nombre, codigo: m.codigo || '', cantidad: m.cantidad, precio: m.precio, notas: m.notas || '' })}>Editar</button>
                        <button type="button" className="btn btn-ghost" style={{ fontSize: '0.78rem' }} onClick={() => { if (confirm('¿Quitar este movimiento?')) void correr(() => archivarMovimientoFinAnio(supabase, m.id)); }}>Eliminar</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {editMov && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.45rem', marginTop: '0.6rem' }}>
                <Campo label="Producto"><input className="input" value={editMov.nombre} onChange={(e) => setEditMov({ ...editMov, nombre: e.target.value })} /></Campo>
                <Campo label="Código"><input className="input" value={editMov.codigo} onChange={(e) => setEditMov({ ...editMov, codigo: e.target.value })} /></Campo>
                <Campo label="Cantidad"><input className="input" value={editMov.cantidad} onChange={(e) => setEditMov({ ...editMov, cantidad: e.target.value })} /></Campo>
                <Campo label="Precio"><input className="input" value={editMov.precio} onChange={(e) => setEditMov({ ...editMov, precio: e.target.value })} /></Campo>
                <Campo label="Nota"><input className="input" value={editMov.notas} onChange={(e) => setEditMov({ ...editMov, notas: e.target.value })} /></Campo>
                <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'end' }}>
                  <button type="button" className="btn btn-primary" onClick={() => void correr(() => editarMovimientoFinAnio(supabase, editMov.id, editMov)).then((ok) => { if (ok) setEditMov(null); })}>Guardar</button>
                  <button type="button" className="btn btn-ghost" onClick={() => setEditMov(null)}>Cancelar</button>
                </div>
              </div>
            )}
          </div>

          <div className="card" style={{ overflowX: 'auto' }}>
            <h4 style={{ margin: '0 0 0.5rem' }}>Abonos</h4>
            {abonosCuenta.length === 0 ? <p className="muted" style={{ margin: 0 }}>Sin abonos.</p> : (
              <table className="table" style={{ width: '100%', fontSize: '0.85rem' }}>
                <thead>
                  <tr><th>Fecha</th><th>Monto</th><th>Nota</th><th>Quién</th><th></th></tr>
                </thead>
                <tbody>
                  {abonosCuenta.map((a) => (
                    <tr key={a.id}>
                      <td>{fechaPhoenix(a.created_at)}</td>
                      <td>{fmtMonto(a.monto)}</td>
                      <td>{a.notas || '—'}</td>
                      <td>{a.created_by || '—'}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button type="button" className="btn btn-ghost" style={{ fontSize: '0.78rem' }} onClick={() => setEditAbono({ id: a.id, monto: a.monto, notas: a.notas || '' })}>Editar</button>
                        <button type="button" className="btn btn-ghost" style={{ fontSize: '0.78rem' }} onClick={() => { if (confirm('¿Quitar este abono?')) void correr(() => archivarAbonoFinAnio(supabase, a.id)); }}>Eliminar</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {editAbono && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.45rem', marginTop: '0.6rem' }}>
                <Campo label="Monto"><input className="input" value={editAbono.monto} onChange={(e) => setEditAbono({ ...editAbono, monto: e.target.value })} /></Campo>
                <Campo label="Nota"><input className="input" value={editAbono.notas} onChange={(e) => setEditAbono({ ...editAbono, notas: e.target.value })} /></Campo>
                <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'end' }}>
                  <button type="button" className="btn btn-primary" onClick={() => void correr(() => editarAbonoFinAnio(supabase, editAbono.id, editAbono)).then((ok) => { if (ok) setEditAbono(null); })}>Guardar</button>
                  <button type="button" className="btn btn-ghost" onClick={() => setEditAbono(null)}>Cancelar</button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
