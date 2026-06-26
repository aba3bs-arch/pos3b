import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { etiquetaTienda, listarSucursalesParaUI } from '../constants/sucursales.js';
import { buscarUsuarioPorPinYSucursal, mensajePinSucursalIncorrecta } from '../lib/usuariosAuth.js';
import { usuarioAutorizadoLogin } from '../lib/turnos.js';
import { puedeGestionarUsuarios } from '../lib/roles.js';
import { rangoDesdePreset } from '../lib/consultasInventario.js';
import CampoCodigo from '../components/CampoCodigo.jsx';
import InputPin from '../components/InputPin.jsx';

function inicioDiaLocal() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function rangoSemana(offset = 0) {
  const hoy = new Date();
  const day = hoy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const ini = new Date(hoy);
  ini.setDate(hoy.getDate() + diff + offset * 7);
  ini.setHours(0, 0, 0, 0);
  const fin = new Date(ini);
  fin.setDate(ini.getDate() + 6);
  fin.setHours(23, 59, 59, 999);
  return { desde: ini, hasta: fin };
}

const PRESETS_HISTORIAL = [
  { id: 'hoy', label: 'Hoy' },
  { id: '7d', label: 'Últimos 7 días' },
  { id: 'semana', label: 'Semana actual' },
  { id: 'semana_ant', label: 'Semana anterior' },
  { id: 'rango', label: 'Rango personalizado' },
];

export default function Checador({ inventario, supabase, sucursal, user, sucursalesLista }) {
  const [pestana, setPestana] = useState('precios');
  const [reloj, setReloj] = useState(() => new Date());
  const [pinEmpleado, setPinEmpleado] = useState('');
  const [empleado, setEmpleado] = useState(null);
  const [cargandoPin, setCargandoPin] = useState(false);
  const [marcando, setMarcando] = useState(false);
  const [historialHoy, setHistorialHoy] = useState([]);
  const [historialFull, setHistorialFull] = useState([]);
  const [cargandoHist, setCargandoHist] = useState(false);
  const [msg, setMsg] = useState('');

  const [filtroTiendaHist, setFiltroTiendaHist] = useState(sucursal || '');
  const [presetHist, setPresetHist] = useState('semana');
  const [histDesde, setHistDesde] = useState('');
  const [histHasta, setHistHasta] = useState('');

  const [codigo, setCodigo] = useState('');

  const esAdmin = puedeGestionarUsuarios(user?.rol);
  const tiendas = sucursalesLista?.length ? sucursalesLista : listarSucursalesParaUI();

  useEffect(() => {
    if (pestana !== 'reloj') return undefined;
    const id = setInterval(() => setReloj(new Date()), 1000);
    return () => clearInterval(id);
  }, [pestana]);

  const rangoHistorial = useMemo(() => {
    if (presetHist === 'semana') return rangoSemana(0);
    if (presetHist === 'semana_ant') return rangoSemana(-1);
    if (presetHist === 'rango' && histDesde && histHasta) {
      return {
        desde: new Date(`${histDesde}T00:00:00`),
        hasta: new Date(`${histHasta}T23:59:59.999`),
      };
    }
    const ymd = rangoDesdePreset(presetHist);
    if (ymd) {
      return {
        desde: new Date(`${ymd.desde}T00:00:00`),
        hasta: new Date(`${ymd.hasta}T23:59:59.999`),
      };
    }
    return rangoSemana(0);
  }, [presetHist, histDesde, histHasta]);

  const cargarHistorialHoy = useCallback(async () => {
    if (!supabase || !sucursal) return;
    const ini = inicioDiaLocal().toISOString();
    const { data, error } = await supabase
      .from('asistencias')
      .select('id,nombre,tipo,created_at')
      .eq('sucursal_id', sucursal)
      .gte('created_at', ini)
      .order('created_at', { ascending: false })
      .limit(50);
    if (!error) setHistorialHoy(data || []);
  }, [supabase, sucursal]);

  const cargarHistorialCompleto = useCallback(async () => {
    if (!supabase) return;
    setCargandoHist(true);
    const tienda = esAdmin ? filtroTiendaHist || sucursal : sucursal;
    if (!tienda) {
      setHistorialFull([]);
      setCargandoHist(false);
      return;
    }
    const { desde, hasta } = rangoHistorial;
    let q = supabase
      .from('asistencias')
      .select('id,nombre,tipo,created_at,sucursal_id')
      .eq('sucursal_id', tienda)
      .gte('created_at', desde.toISOString())
      .lte('created_at', hasta.toISOString())
      .order('created_at', { ascending: false })
      .limit(500);
    const { data, error } = await q;
    setHistorialFull(error ? [] : data || []);
    setCargandoHist(false);
  }, [supabase, sucursal, esAdmin, filtroTiendaHist, rangoHistorial]);

  useEffect(() => {
    if (pestana === 'reloj') void cargarHistorialHoy();
  }, [pestana, cargarHistorialHoy]);

  useEffect(() => {
    if (pestana === 'historial') void cargarHistorialCompleto();
  }, [pestana, cargarHistorialCompleto]);

  useEffect(() => {
    if (!esAdmin) setFiltroTiendaHist(sucursal || '');
  }, [sucursal, esAdmin]);

  const producto = useMemo(() => {
    const t = codigo.trim();
    if (!t) return null;
    return inventario.find((p) => String(p.id) === t || String(p.id).toLowerCase() === t.toLowerCase()) || null;
  }, [codigo, inventario]);

  const similares = useMemo(() => {
    const t = codigo.trim().toLowerCase();
    if (!t || producto) return [];
    return inventario
      .filter((p) =>
        String(p.nombre || '')
          .toLowerCase()
          .includes(t),
      )
      .slice(0, 8);
  }, [codigo, inventario, producto]);

  const identificarEmpleado = async () => {
    if (!supabase) {
      setMsg('Configura Supabase para usar el reloj checador.');
      return;
    }
    const p = pinEmpleado.trim();
    if (!p) return;
    setCargandoPin(true);
    setMsg('');
    const { user: data, error, avisoSucursal, sucursalReal } = await buscarUsuarioPorPinYSucursal(supabase, p, sucursal);
    setCargandoPin(false);
    if (error) {
      setMsg(error);
      setEmpleado(null);
      return;
    }
    if (!data) {
      setMsg(avisoSucursal ? mensajePinSucursalIncorrecta(etiquetaTienda(sucursal), sucursalReal) : 'PIN incorrecto');
      setEmpleado(null);
      return;
    }
    const accesoTurno = usuarioAutorizadoLogin(data);
    if (!accesoTurno.ok) {
      setMsg(accesoTurno.error);
      setEmpleado(null);
      return;
    }
    setEmpleado({ id: data.id, nombre: data.nombre, rol: data.rol });
    setPinEmpleado('');
  };

  const registrarMarcaje = async (tipo) => {
    if (!supabase || !empleado || !sucursal) return;
    setMarcando(true);
    setMsg('');
    const { error } = await supabase.from('asistencias').insert([
      {
        usuario_id: empleado.id,
        nombre: empleado.nombre,
        sucursal_id: sucursal,
        tipo,
      },
    ]);
    setMarcando(false);
    if (error) {
      if (error.message?.includes('relation') || error.code === '42P01') {
        setMsg('Falta la tabla asistencias. Ejecuta el SQL nuevo en supabase/schema.sql en el SQL Editor de Supabase.');
      } else {
        setMsg(error.message);
      }
      return;
    }
    setMsg(tipo === 'ENTRADA' ? 'Entrada registrada.' : 'Salida registrada.');
    setEmpleado(null);
    void cargarHistorialHoy();
  };

  return (
    <div style={{ maxWidth: '900px' }}>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          className={pestana === 'precios' ? 'btn btn-primary' : 'btn btn-ghost'}
          onClick={() => {
            setPestana('precios');
            setMsg('');
          }}
        >
          Checador de precios
        </button>
        <button
          type="button"
          className={pestana === 'reloj' ? 'btn btn-primary' : 'btn btn-ghost'}
          onClick={() => {
            setPestana('reloj');
            setMsg('');
          }}
        >
          Reloj empleados
        </button>
        <button
          type="button"
          className={pestana === 'historial' ? 'btn btn-primary' : 'btn btn-ghost'}
          onClick={() => {
            setPestana('historial');
            setMsg('');
          }}
        >
          Historial entradas/salidas
        </button>
      </div>

      {pestana === 'precios' && (
        <div className="card" style={{ borderTop: '4px solid var(--brand-gold)' }}>
          <h3 style={{ margin: '0 0 0.5rem', color: 'var(--brand-blue)' }}>Checador de precios</h3>
          <p className="muted" style={{ marginTop: 0 }}>
            Escanea o escribe el código de barras y confirma precio y existencias frente al cliente.
          </p>
          <CampoCodigo
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            placeholder="Código de barras…"
            tituloCamara="Checador de precios"
            inputStyle={{ fontSize: '1.25rem', padding: '0.85rem 1rem', letterSpacing: '0.06em' }}
            autoFocus
          />
          {producto && (
            <div style={{ marginTop: '1.25rem', padding: '1.25rem', borderRadius: '12px', background: 'linear-gradient(135deg, rgba(59,105,181,0.08), rgba(200,180,68,0.12))' }}>
              <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{producto.nombre}</div>
              <div className="muted" style={{ marginTop: '0.25rem' }}>
                Código: {producto.id} · Categoría: {producto.cat}
              </div>
              <div style={{ fontSize: '2.25rem', fontWeight: 800, color: 'var(--brand-red)', marginTop: '0.75rem' }}>${Number(producto.precio).toFixed(2)} MXN</div>
              <div style={{ marginTop: '0.5rem', fontWeight: 600, color: Number(producto.stock) < 5 ? 'var(--brand-red)' : 'var(--brand-green)' }}>Stock: {producto.stock} uds.</div>
            </div>
          )}
          {!producto && similares.length > 0 && (
            <div style={{ marginTop: '1rem' }}>
              <div className="muted" style={{ marginBottom: '0.5rem' }}>
                Coincidencias por nombre
              </div>
              {similares.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setCodigo(String(p.id))}
                  className="btn btn-ghost"
                  style={{ width: '100%', justifyContent: 'space-between', marginBottom: '0.35rem' }}
                >
                  <span>{p.nombre}</span>
                  <strong>${Number(p.precio).toFixed(2)}</strong>
                </button>
              ))}
            </div>
          )}
          {!producto && codigo.trim() && similares.length === 0 && <p style={{ marginTop: '1rem', color: 'var(--brand-red)' }}>Producto no encontrado.</p>}
        </div>
      )}

      {pestana === 'reloj' && (
        <div className="card" style={{ borderTop: '4px solid var(--brand-blue)' }}>
          <h3 style={{ margin: '0 0 0.5rem', color: 'var(--brand-blue)' }}>Reloj checador</h3>
          <p className="muted" style={{ marginTop: 0 }}>
            Empleados dados de alta en <strong>Usuarios</strong> marcan entrada o salida con su PIN. Tienda actual:{' '}
            <span className="badge">{etiquetaTienda(sucursal)}</span>
          </p>
          <div
            style={{
              fontSize: '2rem',
              fontWeight: 800,
              textAlign: 'center',
              margin: '1rem 0',
              fontVariantNumeric: 'tabular-nums',
              color: 'var(--brand-blue-dark)',
            }}
          >
            {reloj.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
          <p className="muted" style={{ fontSize: '0.85rem', marginBottom: '1rem' }}>
            {reloj.toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>

          {!empleado ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxWidth: '360px' }}>
              <label className="muted">
                PIN del empleado
                <div style={{ marginTop: '0.35rem' }}>
                  <InputPin
                    value={pinEmpleado}
                    onChange={(e) => setPinEmpleado(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && identificarEmpleado()}
                    placeholder="Mismo PIN que para entrar al POS"
                    style={{ fontSize: '1.2rem', letterSpacing: '0.15em', marginBottom: 0 }}
                  />
                </div>
              </label>
              <button type="button" className="btn btn-primary" onClick={identificarEmpleado} disabled={cargandoPin}>
                {cargandoPin ? 'Verificando…' : 'Continuar'}
              </button>
            </div>
          ) : (
            <div style={{ padding: '1rem', borderRadius: '12px', background: 'rgba(59,105,181,0.08)', marginBottom: '1rem' }}>
              <div style={{ fontSize: '1.15rem', fontWeight: 700 }}>{empleado.nombre}</div>
              <div className="muted" style={{ fontSize: '0.9rem', marginTop: '0.25rem' }}>
                Confirma el marcaje
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-success" disabled={marcando} onClick={() => registrarMarcaje('ENTRADA')} style={{ flex: '1 1 140px' }}>
                  Entrada
                </button>
                <button type="button" className="btn btn-gold" disabled={marcando} onClick={() => registrarMarcaje('SALIDA')} style={{ flex: '1 1 140px' }}>
                  Salida
                </button>
              </div>
              <button type="button" className="btn btn-ghost" style={{ marginTop: '0.75rem' }} onClick={() => setEmpleado(null)} disabled={marcando}>
                Cancelar
              </button>
            </div>
          )}

          {msg && (
            <p style={{ marginTop: '0.75rem', color: msg.includes('registrad') || msg.includes('Entrada') || msg.includes('Salida') ? 'var(--brand-green)' : 'var(--brand-red)' }}>{msg}</p>
          )}

          <h4 style={{ margin: '1.25rem 0 0.5rem', color: 'var(--brand-blue-dark)' }}>Marcajes de hoy</h4>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Hora</th>
                  <th>Empleado</th>
                  <th>Tipo</th>
                </tr>
              </thead>
              <tbody>
                {historialHoy.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="muted">
                      Sin registros hoy.
                    </td>
                  </tr>
                ) : (
                  historialHoy.map((h) => (
                    <tr key={h.id}>
                      <td>{h.created_at ? new Date(h.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}</td>
                      <td>{h.nombre}</td>
                      <td>
                        <span className="badge">{h.tipo === 'ENTRADA' ? 'Entrada' : 'Salida'}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {pestana === 'historial' && (
        <div className="card" style={{ borderTop: '4px solid var(--brand-blue)' }}>
          <h3 style={{ margin: '0 0 0.5rem', color: 'var(--brand-blue)' }}>Historial de entradas y salidas</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem', alignItems: 'flex-end' }}>
            {esAdmin && (
              <label className="muted" style={{ fontSize: '0.8rem' }}>
                Tienda
                <select className="select" style={{ display: 'block', marginTop: '0.2rem', minWidth: 160 }} value={filtroTiendaHist} onChange={(e) => setFiltroTiendaHist(e.target.value)}>
                  {tiendas.map((t) => (
                    <option key={t} value={t}>
                      {etiquetaTienda(t)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="muted" style={{ fontSize: '0.8rem' }}>
              Periodo
              <select className="select" style={{ display: 'block', marginTop: '0.2rem', minWidth: 160 }} value={presetHist} onChange={(e) => setPresetHist(e.target.value)}>
                {PRESETS_HISTORIAL.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            {presetHist === 'rango' && (
              <>
                <label className="muted" style={{ fontSize: '0.8rem' }}>
                  Desde
                  <input className="input" type="date" style={{ display: 'block', marginTop: '0.2rem' }} value={histDesde} onChange={(e) => setHistDesde(e.target.value)} />
                </label>
                <label className="muted" style={{ fontSize: '0.8rem' }}>
                  Hasta
                  <input className="input" type="date" style={{ display: 'block', marginTop: '0.2rem' }} value={histHasta} onChange={(e) => setHistHasta(e.target.value)} />
                </label>
              </>
            )}
            <button type="button" className="btn btn-primary" onClick={cargarHistorialCompleto} disabled={cargandoHist}>
              {cargandoHist ? 'Cargando…' : 'Actualizar'}
            </button>
          </div>
          <p className="muted" style={{ fontSize: '0.8rem', margin: '0 0 0.5rem' }}>
            {historialFull.length} registro(s) · {etiquetaTienda(esAdmin ? filtroTiendaHist : sucursal)}
          </p>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Hora</th>
                  <th>Empleado</th>
                  <th>Tipo</th>
                </tr>
              </thead>
              <tbody>
                {historialFull.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="muted">
                      Sin registros en el periodo.
                    </td>
                  </tr>
                ) : (
                  historialFull.map((h) => (
                    <tr key={h.id}>
                      <td style={{ fontSize: '0.85rem' }}>{h.created_at ? new Date(h.created_at).toLocaleDateString('es-MX') : '—'}</td>
                      <td>{h.created_at ? new Date(h.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                      <td>{h.nombre}</td>
                      <td>
                        <span className="badge">{h.tipo === 'ENTRADA' ? 'Entrada' : 'Salida'}</span>
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
