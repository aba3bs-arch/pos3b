import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { etiquetaTienda, listarSucursalesParaUI } from '../constants/sucursales.js';
import { buscarUsuarioPorPinYSucursal, mensajePinSucursalIncorrecta } from '../lib/usuariosAuth.js';
import { evaluarVinculoDispositivo } from '../lib/dispositivoUsuario.js';
import { usuarioAutorizadoChecador } from '../lib/turnos.js';
import {
  actualizarMarcajeAsistencia,
  crearMarcajeAsistencia,
  eliminarMarcajeAsistencia,
  fechaHoraLocalDesdeIso,
  isoDesdeFechaHoraLocal,
} from '../lib/asistencias.js';
import {
  otorgarAutorizacionFueraHorario,
  verificarPinAdministradorGlobal,
} from '../lib/autorizacionTurnoFueraHorario.js';
import { puedeGestionarUsuarios } from '../lib/roles.js';
import { rangoDesdePreset } from '../lib/consultasInventario.js';
import CampoCodigo from '../components/CampoCodigo.jsx';
import InputPin from '../components/InputPin.jsx';
import FiltroPeriodo from '../components/FiltroPeriodo.jsx';
import { refrescarPinCubreTurnoSucursal, AVISO_SIN_TABLA_PIN_CUBRE } from '../lib/cubreTurnoSync.js';
import {
  construirUsuarioCubreTurno,
  datosCubreTurnoCompletos,
  esPinCubreTurno,
  validarDatosCubreTurno,
} from '../lib/cubreTurno.js';

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
  const [pendienteChecador, setPendienteChecador] = useState(null);
  const [pinAdminChecador, setPinAdminChecador] = useState('');
  const [autorizandoChecador, setAutorizandoChecador] = useState(false);
  const [avisoCobertura, setAvisoCobertura] = useState('');
  const [pendienteCubreChecador, setPendienteCubreChecador] = useState(false);
  const [nombreCubreChecador, setNombreCubreChecador] = useState('');
  const [telefonoCubreChecador, setTelefonoCubreChecador] = useState('');
  const [enviandoCubreChecador, setEnviandoCubreChecador] = useState(false);

  const [filtroTiendaHist, setFiltroTiendaHist] = useState(sucursal || '');
  const [presetHist, setPresetHist] = useState('semana');
  const [histDesde, setHistDesde] = useState('');
  const [histHasta, setHistHasta] = useState('');

  const [empleadosTienda, setEmpleadosTienda] = useState([]);
  const [ajustando, setAjustando] = useState(null);
  const [formAjuste, setFormAjuste] = useState({ tipo: 'ENTRADA', fecha: '', hora: '' });
  const [formNuevo, setFormNuevo] = useState({ usuario_id: '', nombre: '', tipo: 'ENTRADA', fecha: '', hora: '' });
  const [mostrarNuevoMarcaje, setMostrarNuevoMarcaje] = useState(false);
  const [guardandoAjuste, setGuardandoAjuste] = useState(false);

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

  useEffect(() => {
    if (!esAdmin || !supabase || pestana !== 'historial') return undefined;
    let ok = true;
    (async () => {
      const tienda = filtroTiendaHist || sucursal;
      if (!tienda) return;
      const { data } = await supabase
        .from('usuarios')
        .select('id,nombre,rol,sucursal_id')
        .eq('sucursal_id', tienda)
        .order('nombre');
      if (ok) setEmpleadosTienda(data || []);
    })();
    return () => {
      ok = false;
    };
  }, [esAdmin, supabase, pestana, filtroTiendaHist, sucursal]);

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

  const cancelarCubreChecador = () => {
    setPendienteCubreChecador(false);
    setNombreCubreChecador('');
    setTelefonoCubreChecador('');
    setEnviandoCubreChecador(false);
  };

  const confirmarCubreChecador = () => {
    const val = validarDatosCubreTurno({ nombre: nombreCubreChecador, telefono: telefonoCubreChecador });
    if (!val.ok) {
      setMsg(val.error);
      return;
    }
    setEnviandoCubreChecador(true);
    const data = construirUsuarioCubreTurno({
      nombre: val.nombre,
      telefono: val.telefono,
      sucursal,
    });
    setEmpleado({
      id: null,
      nombre: data.nombre,
      rol: data.rol,
      esCubreTurno: true,
      telefono: data.telefono,
    });
    setPendienteCubreChecador(false);
    setNombreCubreChecador('');
    setTelefonoCubreChecador('');
    setEnviandoCubreChecador(false);
    setPinEmpleado('');
    setMsg('');
    setAvisoCobertura('Marcaje de cubre turno (sin usuario fijo).');
  };

  const identificarEmpleado = async () => {
    if (!supabase) {
      setMsg('Configura Supabase para usar el reloj checador.');
      return;
    }
    if (!sucursal) {
      setMsg('No hay tienda activa en esta caja. Fija la sucursal e intenta de nuevo.');
      return;
    }
    const p = String(pinEmpleado || '').trim();
    if (!p || cargandoPin) return;
    setCargandoPin(true);
    setMsg('');
    setPendienteCubreChecador(false);

    try {
      const syncPin = await refrescarPinCubreTurnoSucursal(supabase, sucursal);
      const pinCubreRemoto = String(syncPin.pin || '').trim();
      if (esPinCubreTurno(p, pinCubreRemoto)) {
        setPinEmpleado('');
        setEmpleado(null);
        setPendienteChecador(null);
        setPendienteCubreChecador(true);
        setNombreCubreChecador('');
        setTelefonoCubreChecador('');
        setAvisoCobertura('');
        return;
      }

      const { user: data, error, avisoSucursal, sucursalReal } = await buscarUsuarioPorPinYSucursal(supabase, p, sucursal);
      if (error) {
        setMsg(error);
        setEmpleado(null);
        return;
      }
      if (!data) {
        if (syncPin.sinTabla) {
          setMsg(`PIN incorrecto. ${syncPin.aviso || AVISO_SIN_TABLA_PIN_CUBRE}`);
        } else if (syncPin.ok === false && syncPin.error) {
          setMsg(`PIN incorrecto. No se pudo verificar el PIN de cubre turno: ${syncPin.error}`);
        } else {
          setMsg(avisoSucursal ? mensajePinSucursalIncorrecta(etiquetaTienda(sucursal), sucursalReal) : 'PIN incorrecto');
        }
        setEmpleado(null);
        setPinEmpleado('');
        return;
      }
      const accesoTurno = usuarioAutorizadoChecador(data, new Date(), null, sucursal);
      if (!accesoTurno.ok) {
        setPendienteChecador({ user: data, error: accesoTurno.error });
        setMsg('');
        setEmpleado(null);
        setAvisoCobertura('');
        setPinEmpleado('');
        return;
      }
      setPendienteChecador(null);
      setPinAdminChecador('');
      setAvisoCobertura(accesoTurno.coberturaTurno ? accesoTurno.mensaje || 'Cobertura de otro turno.' : '');
      const vinculo = evaluarVinculoDispositivo(data);
      if (!vinculo.ok) {
        setMsg(vinculo.error);
        setEmpleado(null);
        setPinEmpleado('');
        return;
      }
      setEmpleado({ id: data.id, nombre: data.nombre, rol: data.rol });
      setPinEmpleado('');
    } catch (err) {
      setMsg(err?.message || 'No se pudo verificar el PIN.');
      setEmpleado(null);
    } finally {
      setCargandoPin(false);
    }
  };

  const autorizarChecadorConAdmin = async () => {
    if (!pendienteChecador?.user || !supabase) return;
    const p = pinAdminChecador.trim();
    if (!p) return setMsg('Indica el PIN del administrador.');
    setAutorizandoChecador(true);
    setMsg('');
    const auth = await verificarPinAdministradorGlobal(supabase, p);
    if (!auth.ok) {
      setAutorizandoChecador(false);
      setMsg(auth.error);
      return;
    }
    otorgarAutorizacionFueraHorario({
      usuarioId: pendienteChecador.user.id,
      sucursal,
      admin: auth.user,
    });
    setAutorizandoChecador(false);
    setEmpleado({ id: pendienteChecador.user.id, nombre: pendienteChecador.user.nombre, rol: pendienteChecador.user.rol });
    setPendienteChecador(null);
    setPinAdminChecador('');
    setPinEmpleado('');
    setAvisoCobertura('');
  };

  const abrirAjuste = (registro) => {
    const { fecha, hora } = fechaHoraLocalDesdeIso(registro.created_at);
    setAjustando(registro);
    setFormAjuste({ tipo: registro.tipo, fecha, hora });
    setMostrarNuevoMarcaje(false);
  };

  const guardarAjuste = async () => {
    if (!ajustando || !supabase) return;
    const created_at = isoDesdeFechaHoraLocal(formAjuste.fecha, formAjuste.hora);
    if (!created_at) return setMsg('Fecha u hora no válida.');
    setGuardandoAjuste(true);
    setMsg('');
    const res = await actualizarMarcajeAsistencia(supabase, ajustando.id, {
      tipo: formAjuste.tipo,
      created_at,
      ajustado_por: user?.nombre,
    });
    setGuardandoAjuste(false);
    if (!res.ok) {
      setMsg(res.error || 'No se pudo guardar el ajuste.');
      return;
    }
    setMsg('Marcaje actualizado.');
    setAjustando(null);
    void cargarHistorialCompleto();
    void cargarHistorialHoy();
  };

  const eliminarMarcaje = async (registro) => {
    if (!supabase || !registro?.id) return;
    if (!confirm(`¿Eliminar ${registro.tipo === 'ENTRADA' ? 'entrada' : 'salida'} de ${registro.nombre}?`)) return;
    setGuardandoAjuste(true);
    setMsg('');
    const res = await eliminarMarcajeAsistencia(supabase, registro.id);
    setGuardandoAjuste(false);
    if (!res.ok) {
      setMsg(res.error || 'No se pudo eliminar.');
      return;
    }
    setMsg('Marcaje eliminado.');
    if (ajustando?.id === registro.id) setAjustando(null);
    void cargarHistorialCompleto();
    void cargarHistorialHoy();
  };

  const guardarNuevoMarcaje = async () => {
    if (!supabase) return;
    const emp = empleadosTienda.find((e) => String(e.id) === String(formNuevo.usuario_id));
    const nombre = emp?.nombre || formNuevo.nombre.trim();
    if (!nombre) return setMsg('Selecciona un empleado.');
    const created_at = isoDesdeFechaHoraLocal(formNuevo.fecha, formNuevo.hora) || new Date().toISOString();
    setGuardandoAjuste(true);
    setMsg('');
    const res = await crearMarcajeAsistencia(supabase, {
      usuario_id: emp?.id || null,
      nombre,
      sucursal_id: filtroTiendaHist || sucursal,
      tipo: formNuevo.tipo,
      created_at,
      ajustado_por: user?.nombre,
    });
    setGuardandoAjuste(false);
    if (!res.ok) {
      setMsg(res.error || 'No se pudo registrar el marcaje.');
      return;
    }
    setMsg('Marcaje registrado por administrador.');
    setMostrarNuevoMarcaje(false);
    setFormNuevo({ usuario_id: '', nombre: '', tipo: 'ENTRADA', fecha: '', hora: '' });
    void cargarHistorialCompleto();
    void cargarHistorialHoy();
  };

  const registrarMarcaje = async (tipo) => {
    if (!supabase || !empleado || !sucursal) return;
    setMarcando(true);
    setMsg('');
    const nombre = empleado.esCubreTurno ? `${empleado.nombre} (cubre turno)` : empleado.nombre;
    const res = await crearMarcajeAsistencia(supabase, {
      usuario_id: empleado.id || null,
      nombre,
      sucursal_id: sucursal,
      tipo,
    });
    setMarcando(false);
    if (!res.ok) {
      const err = String(res.error || '');
      if (err.includes('relation') || err.includes('42P01')) {
        setMsg('Falta la tabla asistencias. Ejecuta el SQL nuevo en supabase/schema.sql en el SQL Editor de Supabase.');
      } else {
        setMsg(res.error || 'No se pudo registrar el marcaje.');
      }
      return;
    }
    setMsg(tipo === 'ENTRADA' ? 'Entrada registrada.' : 'Salida registrada.');
    setEmpleado(null);
    setAvisoCobertura('');
    void cargarHistorialHoy();
  };

  const cubreChecadorListo = datosCubreTurnoCompletos({
    nombre: nombreCubreChecador,
    telefono: telefonoCubreChecador,
  });

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
            Empleados dados de alta en <strong>Usuarios</strong> marcan con su PIN de esta tienda. Quien cubre turno usa el{' '}
            <strong>PIN de cubre turno</strong> de la sucursal (nombre + teléfono). Si un fijo no coincide con su turno, puede marcar
            cubriendo otro turno (±20 min). Tienda actual: <span className="badge">{etiquetaTienda(sucursal)}</span>
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

          {!empleado && !pendienteChecador && !pendienteCubreChecador ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxWidth: '360px' }}>
              <label className="muted">
                PIN del empleado
                <div style={{ marginTop: '0.35rem' }}>
                  <InputPin
                    value={pinEmpleado}
                    onChange={(e) => setPinEmpleado(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !cargandoPin && identificarEmpleado()}
                    placeholder="PIN de esta tienda"
                    autoComplete="new-password"
                    name="checador-pin"
                    style={{ fontSize: '1.2rem', letterSpacing: '0.15em', marginBottom: 0 }}
                  />
                </div>
              </label>
              <button type="button" className="btn btn-primary" onClick={identificarEmpleado} disabled={cargandoPin || !pinEmpleado.trim()}>
                {cargandoPin ? 'Verificando…' : 'Continuar'}
              </button>
              {user?.esCubreTurno && (
                <button
                  type="button"
                  className="btn btn-gold"
                  onClick={() => {
                    setEmpleado({
                      id: null,
                      nombre: user.nombre,
                      rol: user.rol || 'Cajero',
                      esCubreTurno: true,
                      telefono: user.telefono || '',
                    });
                    setPinEmpleado('');
                    setMsg('');
                    setAvisoCobertura('Marcaje de cubre turno (sesión actual).');
                  }}
                >
                  Marcar como {user.nombre} (cubre turno)
                </button>
              )}
            </div>
          ) : pendienteCubreChecador ? (
            <div
              style={{
                maxWidth: '360px',
                padding: '0.85rem',
                borderRadius: '10px',
                background: 'rgba(225,153,41,0.12)',
                border: '1px solid rgba(225,153,41,0.45)',
              }}
            >
              <strong style={{ color: 'var(--brand-gold)' }}>Cubre turno · {etiquetaTienda(sucursal)}</strong>
              <p className="muted" style={{ margin: '0.35rem 0 0.65rem', fontSize: '0.82rem' }}>
                Obligatorio: <strong>nombre y apellido</strong> + <strong>teléfono</strong> (10 dígitos).
              </p>
              <label className="muted" style={{ display: 'block', fontSize: '0.82rem' }}>
                Nombre y apellido completos
                <input
                  className="input"
                  value={nombreCubreChecador}
                  onChange={(e) => setNombreCubreChecador(e.target.value)}
                  placeholder="Ej. María López García"
                  autoFocus
                  maxLength={80}
                  style={{ marginTop: '0.35rem', marginBottom: '0.5rem' }}
                />
              </label>
              <label className="muted" style={{ display: 'block', fontSize: '0.82rem' }}>
                Teléfono de contacto
                <input
                  className="input"
                  type="tel"
                  inputMode="tel"
                  value={telefonoCubreChecador}
                  onChange={(e) => setTelefonoCubreChecador(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && cubreChecadorListo && !enviandoCubreChecador && confirmarCubreChecador()}
                  placeholder="10 dígitos"
                  maxLength={15}
                  style={{ marginTop: '0.35rem', marginBottom: 0 }}
                />
              </label>
              {!cubreChecadorListo && (
                <p className="muted" style={{ margin: '0.5rem 0 0', fontSize: '0.8rem', color: 'var(--brand-gold)' }}>
                  Completa nombre y apellido + teléfono para continuar.
                </p>
              )}
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.65rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-gold"
                  onClick={confirmarCubreChecador}
                  disabled={enviandoCubreChecador || !cubreChecadorListo}
                >
                  {enviandoCubreChecador ? 'Continuando…' : 'Continuar'}
                </button>
                <button type="button" className="btn btn-ghost" onClick={cancelarCubreChecador} disabled={enviandoCubreChecador}>
                  Cancelar
                </button>
              </div>
            </div>
          ) : pendienteChecador ? (
            <div
              style={{
                maxWidth: '360px',
                padding: '0.85rem',
                borderRadius: '10px',
                background: 'rgba(225,153,41,0.12)',
                border: '1px solid rgba(225,153,41,0.45)',
              }}
            >
              <strong style={{ color: 'var(--brand-gold)' }}>Fuera de horario</strong>
              <p className="muted" style={{ margin: '0.35rem 0', fontSize: '0.82rem' }}>{pendienteChecador.error}</p>
              <p style={{ fontSize: '0.85rem', margin: '0 0 0.5rem' }}>
                Empleado: <strong>{pendienteChecador.user.nombre}</strong>
              </p>
              <label className="muted" style={{ display: 'block', fontSize: '0.82rem' }}>
                PIN del administrador
                <div style={{ marginTop: '0.35rem' }}>
                  <InputPin
                    value={pinAdminChecador}
                    onChange={(e) => setPinAdminChecador(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !autorizandoChecador && autorizarChecadorConAdmin()}
                    placeholder="PIN admin"
                    style={{ marginBottom: 0 }}
                  />
                </div>
              </label>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.65rem', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-gold" onClick={autorizarChecadorConAdmin} disabled={autorizandoChecador}>
                  {autorizandoChecador ? 'Verificando…' : 'Autorizar'}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    setPendienteChecador(null);
                    setPinAdminChecador('');
                  }}
                  disabled={autorizandoChecador}
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div style={{ padding: '1rem', borderRadius: '12px', background: 'rgba(59,105,181,0.08)', marginBottom: '1rem' }}>
              <div style={{ fontSize: '1.15rem', fontWeight: 700 }}>{empleado.nombre}</div>
              <div className="muted" style={{ fontSize: '0.9rem', marginTop: '0.25rem' }}>
                {empleado.esCubreTurno ? 'Cubre turno · confirma el marcaje' : 'Confirma el marcaje'}
              </div>
              {avisoCobertura && (
                <p style={{ margin: '0.5rem 0 0', fontSize: '0.82rem', color: 'var(--brand-gold)' }}>{avisoCobertura}</p>
              )}
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-success" disabled={marcando} onClick={() => registrarMarcaje('ENTRADA')} style={{ flex: '1 1 140px' }}>
                  Entrada
                </button>
                <button type="button" className="btn btn-gold" disabled={marcando} onClick={() => registrarMarcaje('SALIDA')} style={{ flex: '1 1 140px' }}>
                  Salida
                </button>
              </div>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ marginTop: '0.75rem' }}
                onClick={() => {
                  setEmpleado(null);
                  setAvisoCobertura('');
                }}
                disabled={marcando}
              >
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
          {esAdmin && (
            <p className="muted" style={{ fontSize: '0.85rem', marginTop: 0 }}>
              Como administrador puedes corregir hora/tipo de un marcaje o registrar entrada/salida manual si el empleado no checó.
            </p>
          )}
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
            <FiltroPeriodo
              labelPeriodo="Periodo"
              presets={PRESETS_HISTORIAL}
              preset={presetHist}
              onPresetChange={setPresetHist}
              desde={histDesde}
              hasta={histHasta}
              onDesdeChange={setHistDesde}
              onHastaChange={setHistHasta}
              mostrarResumen={false}
              className="cal-picker-wrap--inline"
            />
            <button type="button" className="btn btn-primary" onClick={cargarHistorialCompleto} disabled={cargandoHist}>
              {cargandoHist ? 'Cargando…' : 'Actualizar'}
            </button>
            {esAdmin && (
              <button
                type="button"
                className="btn btn-gold"
                onClick={() => {
                  const hoy = new Date();
                  const pad = (n) => String(n).padStart(2, '0');
                  const fecha = `${hoy.getFullYear()}-${pad(hoy.getMonth() + 1)}-${pad(hoy.getDate())}`;
                  const hora = `${pad(hoy.getHours())}:${pad(hoy.getMinutes())}`;
                  setMostrarNuevoMarcaje(true);
                  setAjustando(null);
                  setFormNuevo({ usuario_id: '', nombre: '', tipo: 'ENTRADA', fecha, hora });
                }}
              >
                Registrar marcaje manual
              </button>
            )}
          </div>
          {msg && pestana === 'historial' && (
            <p style={{ margin: '0 0 0.75rem', color: msg.includes('actualizado') || msg.includes('registrado') || msg.includes('eliminado') ? 'var(--brand-green)' : 'var(--brand-red)' }}>
              {msg}
            </p>
          )}
          {esAdmin && mostrarNuevoMarcaje && (
            <div className="card" style={{ marginBottom: '0.75rem', background: 'rgba(200,180,68,0.1)', border: '1px solid rgba(200,180,68,0.35)' }}>
              <h4 style={{ margin: '0 0 0.5rem', color: 'var(--brand-blue-dark)' }}>Nuevo marcaje (administrador)</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.5rem' }}>
                <label className="muted" style={{ fontSize: '0.8rem' }}>
                  Empleado
                  <select
                    className="select"
                    style={{ display: 'block', marginTop: '0.2rem', width: '100%' }}
                    value={formNuevo.usuario_id}
                    onChange={(e) => setFormNuevo((f) => ({ ...f, usuario_id: e.target.value }))}
                  >
                    <option value="">— Seleccionar —</option>
                    {empleadosTienda.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.nombre} ({e.rol})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="muted" style={{ fontSize: '0.8rem' }}>
                  Tipo
                  <select className="select" style={{ display: 'block', marginTop: '0.2rem', width: '100%' }} value={formNuevo.tipo} onChange={(e) => setFormNuevo((f) => ({ ...f, tipo: e.target.value }))}>
                    <option value="ENTRADA">Entrada</option>
                    <option value="SALIDA">Salida</option>
                  </select>
                </label>
                <label className="muted" style={{ fontSize: '0.8rem' }}>
                  Fecha
                  <input className="input" type="date" style={{ display: 'block', marginTop: '0.2rem', width: '100%' }} value={formNuevo.fecha} onChange={(e) => setFormNuevo((f) => ({ ...f, fecha: e.target.value }))} />
                </label>
                <label className="muted" style={{ fontSize: '0.8rem' }}>
                  Hora
                  <input className="input" type="time" style={{ display: 'block', marginTop: '0.2rem', width: '100%' }} value={formNuevo.hora} onChange={(e) => setFormNuevo((f) => ({ ...f, hora: e.target.value }))} />
                </label>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.65rem', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-primary btn-sm" onClick={guardarNuevoMarcaje} disabled={guardandoAjuste}>
                  {guardandoAjuste ? 'Guardando…' : 'Guardar marcaje'}
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMostrarNuevoMarcaje(false)} disabled={guardandoAjuste}>
                  Cancelar
                </button>
              </div>
            </div>
          )}
          {esAdmin && ajustando && (
            <div className="card" style={{ marginBottom: '0.75rem', background: 'rgba(59,105,181,0.08)', border: '1px solid var(--border)' }}>
              <h4 style={{ margin: '0 0 0.5rem', color: 'var(--brand-blue-dark)' }}>
                Ajustar marcaje · {ajustando.nombre}
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.5rem' }}>
                <label className="muted" style={{ fontSize: '0.8rem' }}>
                  Tipo
                  <select className="select" style={{ display: 'block', marginTop: '0.2rem', width: '100%' }} value={formAjuste.tipo} onChange={(e) => setFormAjuste((f) => ({ ...f, tipo: e.target.value }))}>
                    <option value="ENTRADA">Entrada</option>
                    <option value="SALIDA">Salida</option>
                  </select>
                </label>
                <label className="muted" style={{ fontSize: '0.8rem' }}>
                  Fecha
                  <input className="input" type="date" style={{ display: 'block', marginTop: '0.2rem', width: '100%' }} value={formAjuste.fecha} onChange={(e) => setFormAjuste((f) => ({ ...f, fecha: e.target.value }))} />
                </label>
                <label className="muted" style={{ fontSize: '0.8rem' }}>
                  Hora
                  <input className="input" type="time" style={{ display: 'block', marginTop: '0.2rem', width: '100%' }} value={formAjuste.hora} onChange={(e) => setFormAjuste((f) => ({ ...f, hora: e.target.value }))} />
                </label>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.65rem', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-primary btn-sm" onClick={guardarAjuste} disabled={guardandoAjuste}>
                  {guardandoAjuste ? 'Guardando…' : 'Guardar ajuste'}
                </button>
                <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => eliminarMarcaje(ajustando)} disabled={guardandoAjuste}>
                  Eliminar
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAjustando(null)} disabled={guardandoAjuste}>
                  Cancelar
                </button>
              </div>
            </div>
          )}
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
                  {esAdmin && <th>Admin</th>}
                </tr>
              </thead>
              <tbody>
                {historialFull.length === 0 ? (
                  <tr>
                    <td colSpan={esAdmin ? 5 : 4} className="muted">
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
                      {esAdmin && (
                        <td>
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => abrirAjuste(h)}>
                            Ajustar
                          </button>
                        </td>
                      )}
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
