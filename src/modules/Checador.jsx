import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { etiquetaTienda } from '../constants/sucursales.js';
import { buscarUsuarioPorPinYSucursal, mensajePinSucursalIncorrecta } from '../lib/usuariosAuth.js';
import { usuarioAutorizadoLogin } from '../lib/turnos.js';
import { BotonEscanerCamara } from '../components/EscanerCamara.jsx';

function inicioDiaLocal() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export default function Checador({ inventario, supabase, sucursal }) {
  const [pestana, setPestana] = useState('precios');
  const [reloj, setReloj] = useState(() => new Date());
  const [pinEmpleado, setPinEmpleado] = useState('');
  const [empleado, setEmpleado] = useState(null);
  const [cargandoPin, setCargandoPin] = useState(false);
  const [marcando, setMarcando] = useState(false);
  const [historial, setHistorial] = useState([]);
  const [msg, setMsg] = useState('');

  const [codigo, setCodigo] = useState('');

  useEffect(() => {
    if (pestana !== 'reloj') return undefined;
    const id = setInterval(() => setReloj(new Date()), 1000);
    return () => clearInterval(id);
  }, [pestana]);

  const cargarHistorial = useCallback(async () => {
    if (!supabase || !sucursal) return;
    const ini = inicioDiaLocal().toISOString();
    const { data, error } = await supabase
      .from('asistencias')
      .select('id,nombre,tipo,created_at')
      .eq('sucursal_id', sucursal)
      .gte('created_at', ini)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) {
      setHistorial([]);
      return;
    }
    setHistorial(data || []);
  }, [supabase, sucursal]);

  useEffect(() => {
    if (pestana === 'reloj') void cargarHistorial();
  }, [pestana, cargarHistorial]);

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
    void cargarHistorial();
  };

  return (
    <div style={{ maxWidth: '720px' }}>
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
      </div>

      {pestana === 'precios' && (
        <div className="card" style={{ borderTop: '4px solid var(--brand-gold)' }}>
          <h3 style={{ margin: '0 0 0.5rem', color: 'var(--brand-blue)' }}>Checador de precios</h3>
          <p className="muted" style={{ marginTop: 0 }}>
            Escanea o escribe el código de barras y confirma precio y existencias frente al cliente.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <input
              className="input"
              autoFocus
              placeholder="Código de barras…"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              style={{ flex: '1 1 200px', fontSize: '1.25rem', padding: '0.85rem 1rem', letterSpacing: '0.06em' }}
            />
            <BotonEscanerCamara titulo="Checador de precios" onCodigo={setCodigo} style={{ padding: '0.85rem 1rem' }} />
          </div>
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
            Empleados dados de alta en <strong>Usuarios</strong> marcan entrada o salida con su PIN. Tienda actual: <span className="badge">{sucursal}</span>
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
                <input
                  className="input"
                  type="password"
                  value={pinEmpleado}
                  onChange={(e) => setPinEmpleado(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && identificarEmpleado()}
                  placeholder="Mismo PIN que para entrar al POS"
                  style={{ marginTop: '0.35rem', fontSize: '1.2rem', letterSpacing: '0.15em', textAlign: 'center' }}
                  autoComplete="off"
                />
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

          <h4 style={{ margin: '1.25rem 0 0.5rem', color: 'var(--brand-blue-dark)' }}>Marcajes de hoy en esta tienda</h4>
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
                {historial.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="muted">
                      Sin registros hoy.
                    </td>
                  </tr>
                ) : (
                  historial.map((h) => (
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
    </div>
  );
}
