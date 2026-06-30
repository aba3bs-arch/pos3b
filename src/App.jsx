import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase, supabaseConfigured } from './lib/supabase.js';
import Inicio from './modules/Inicio.jsx';
import Ventas from './modules/Ventas.jsx';
import Productos from './modules/Productos.jsx';
import Compras from './modules/Compras.jsx';
import Checador from './modules/Checador.jsx';
import Proveedores from './modules/Proveedores.jsx';
import Clientes from './modules/Clientes.jsx';
import Usuarios from './modules/Usuarios.jsx';
import Consultas from './modules/Consultas.jsx';
import Estadisticas from './modules/Estadisticas.jsx';
import Reportes from './modules/Reportes.jsx';
import Nomina from './modules/Nomina.jsx';
import ValesPrestamos from './modules/ValesPrestamos.jsx';
import CorteVirtual from './modules/cortes/CorteVirtual.jsx';
import CorteAbarrotes from './modules/cortes/CorteAbarrotes.jsx';
import CorteGarage from './modules/cortes/CorteGarage.jsx';
import CorteCaja from './modules/CorteCaja.jsx';
import Configuracion from './modules/Configuracion.jsx';
import Buzon from './modules/Buzon.jsx';
import Ayuda from './modules/Ayuda.jsx';
import {
  listarSucursalesParaUI,
  etiquetaTienda,
  agregarSucursalExtra,
  quitarSucursalExtra,
  codigoTiendaValido,
  sucursalFijaPorEntorno,
  sucursalInicial,
  leerSucursalGuardada,
  guardarSucursalLocal,
  bloquearTiendaEnEsteEquipo,
  desbloquearTiendaEnEsteEquipo,
  tiendaBloqueadaEnEsteEquipo,
  normalizarCodigoTienda,
} from './constants/sucursales.js';
import { modulosParaSidebar, puedeVerModulo, normalizarRol, puedeCambiarTiendaLibremente, submodulosContabilidadVisibles, puedeVerSeccionContabilidad, SUBMODULOS_CONTABILIDAD, rolVeBuzonComoIncidencias, etiquetaModuloSidebar } from './lib/roles.js';
import { inventarioParaSucursal } from './lib/inventarioMultitienda.js';
import { EVENTO_BRANDING, leerNombreNegocio } from './lib/branding.js';
import { leerTipoCambio, guardarTipoCambio, EVENTO_TIPO_CAMBIO, EVENTO_PRIVILEGIOS } from './lib/posConfig.js';
import { sincronizarPrivilegiosDesdeNube } from './lib/privilegiosSync.js';
import { sonidoMenuNavegacion } from './lib/sonidosPos.js';
import { buscarUsuarioPorPinYSucursal, mensajePinSucursalIncorrecta } from './lib/usuariosAuth.js';
import {
  evaluarVinculoDispositivo,
  vincularDispositivoUsuario,
} from './lib/dispositivoUsuario.js';
import { usuarioAutorizadoLogin, turnoActual } from './lib/turnos.js';
import {
  otorgarAutorizacionFueraHorario,
  verificarPinAdministradorGlobal,
} from './lib/autorizacionTurnoFueraHorario.js';
import BrandLogo from './components/BrandLogo.jsx';
import Icon, { BtnLabel } from './components/Icon.jsx';
import BotonLimpiarCache from './components/BotonLimpiarCache.jsx';
import BadgeNotificacionesContabilidad from './components/BadgeNotificacionesContabilidad.jsx';
import AnuncioPosOverlay from './components/AnuncioPosOverlay.jsx';
import { limpiarAnunciosVistos } from './lib/anunciosPos.js';
import InputPin from './components/InputPin.jsx';
import {
  puedeRecibirNotificacionesDispositivo,
  mostrarNotificacionDispositivo,
  limpiarNotificacionesDispositivoMostradas,
} from './lib/notificacionesDispositivo.js';
import { EVENTO_NOTIFICACION_DISPOSITIVO, iniciarMonitorNotificacionesDispositivo, EVENTO_NOTIFICACIONES } from './lib/contabilidadNotificaciones.js';
import BotonActivarNotificaciones from './components/BotonActivarNotificaciones.jsx';
import { iconoDeModulo, colorDeModulo } from './lib/moduloIcons.js';

const SUCURSAL_FIJA_ENV = sucursalFijaPorEntorno();

function App() {
  const [sesion, setSesion] = useState(false);
  const [user, setUser] = useState(null);
  const [pin, setPin] = useState('');
  const [pendienteAutorizacionTurno, setPendienteAutorizacionTurno] = useState(null);
  const [pinAdminAutorizacion, setPinAdminAutorizacion] = useState('');
  const [autorizandoTurno, setAutorizandoTurno] = useState(false);
  const [vista, setVista] = useState('Inicio');
  const [valesIrPendientes, setValesIrPendientes] = useState(false);
  const [buzonPestana, setBuzonPestana] = useState('pendientes');
  const [sucursal, setSucursal] = useState(sucursalInicial);
  const [tiendaFijadaParaAcceso, setTiendaFijadaParaAcceso] = useState(() => Boolean(SUCURSAL_FIJA_ENV || tiendaBloqueadaEnEsteEquipo()));
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [contabilidadOpen, setContabilidadOpen] = useState(true);
  const [tipoCambio, setTipoCambioRaw] = useState(() => leerTipoCambio());
  const [tickPrivilegios, setTickPrivilegios] = useState(0);
  const [inventario, setInventario] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [brandTitle, setBrandTitle] = useState(leerNombreNegocio);
  const [listaSucursales, setListaSucursales] = useState(() => listarSucursalesParaUI());

  const refrescarListaSucursales = useCallback(() => {
    setListaSucursales(listarSucursalesParaUI());
  }, []);

  const setTipoCambio = useCallback((val) => {
    if (typeof val === 'function') {
      setTipoCambioRaw((prev) => guardarTipoCambio(val(prev)));
    } else {
      setTipoCambioRaw(guardarTipoCambio(val));
    }
  }, []);

  useEffect(() => {
    const onTc = () => setTipoCambioRaw(leerTipoCambio());
    const onPriv = () => setTickPrivilegios((n) => n + 1);
    window.addEventListener(EVENTO_TIPO_CAMBIO, onTc);
    window.addEventListener(EVENTO_PRIVILEGIOS, onPriv);
    return () => {
      window.removeEventListener(EVENTO_TIPO_CAMBIO, onTc);
      window.removeEventListener(EVENTO_PRIVILEGIOS, onPriv);
    };
  }, []);

  useEffect(() => {
    if (SUCURSAL_FIJA_ENV) {
      setSucursal(SUCURSAL_FIJA_ENV);
      setTiendaFijadaParaAcceso(true);
    } else {
      setSucursal((s) => (codigoTiendaValido(s) ? s : 'MAIN'));
    }
  }, []);

  useEffect(() => {
    if (!codigoTiendaValido(sucursal)) {
      setSucursal(SUCURSAL_FIJA_ENV || listaSucursales[0] || 'MAIN');
    }
  }, [listaSucursales, sucursal]);

  const cargarDatos = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from('productos').select('*').order('nombre');
    if (error) {
      console.error(error);
      setInventario([]);
      return;
    }
    setInventario(data || []);
  }, []);

  useEffect(() => {
    if (sesion) cargarDatos();
  }, [sesion, cargarDatos]);

  useEffect(() => {
    if (!sesion || !user || !supabase) return undefined;
    if (!puedeRecibirNotificacionesDispositivo(user?.rol)) return undefined;

    const abrirPendientes = () => {
      setBuzonPestana('pendientes');
      if (puedeVerModulo(user?.rol, 'Buzón', user?.id)) setVista('Buzón');
      else if (puedeVerModulo(user?.rol, 'Vales y Préstamos', user?.id)) {
        setValesIrPendientes(true);
        setVista('Vales y Préstamos');
      }
    };

    const detenerMonitor = iniciarMonitorNotificacionesDispositivo(supabase, {
      rol: user?.rol,
      veTodasTiendas: true,
      onClickNotificacion: abrirPendientes,
    });

    const channel = supabase
      .channel(`pos-notificaciones-${user.id || user.nombre || 'staff'}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'contabilidad_notificaciones' },
        (payload) => {
          const row = payload.new;
          if (!row || row.estado !== 'pendiente') return;
          mostrarNotificacionDispositivo({
            id: row.id,
            titulo: row.titulo,
            mensaje: row.mensaje,
            onClick: abrirPendientes,
          });
          window.dispatchEvent(new CustomEvent(EVENTO_NOTIFICACIONES));
        },
      )
      .subscribe();

    const onLocal = (e) => {
      const row = e.detail;
      if (!row?.titulo) return;
      mostrarNotificacionDispositivo({
        id: row.id,
        titulo: row.titulo,
        mensaje: row.mensaje,
        onClick: abrirPendientes,
      });
    };
    window.addEventListener(EVENTO_NOTIFICACION_DISPOSITIVO, onLocal);

    return () => {
      detenerMonitor();
      supabase.removeChannel(channel);
      window.removeEventListener(EVENTO_NOTIFICACION_DISPOSITIVO, onLocal);
    };
  }, [sesion, user, supabase]);

  useEffect(() => {
    if (!supabase || !sesion) return undefined;
    const channel = supabase
      .channel('pos-productos-catalogo')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'productos' }, () => {
        cargarDatos();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [sesion, cargarDatos]);

  useEffect(() => {
    const syncBrand = () => setBrandTitle(leerNombreNegocio());
    syncBrand();
    window.addEventListener(EVENTO_BRANDING, syncBrand);
    return () => window.removeEventListener(EVENTO_BRANDING, syncBrand);
  }, [sesion]);

  useEffect(() => {
    if (!sesion || !user) return undefined;
    const vigilarTurno = () => {
      const auth = usuarioAutorizadoLogin(user, new Date(), null, sucursal);
      if (!auth.ok) {
        alert(`${auth.error}\n\nSe cerrará la sesión por seguridad.`);
        setSesion(false);
        setUser(null);
        setVista('Inicio');
        setPin('');
      }
    };
    vigilarTurno();
    const id = setInterval(vigilarTurno, 60_000);
    return () => clearInterval(id);
  }, [sesion, user, sucursal]);

  useEffect(() => {
    guardarSucursalLocal(sucursal);
  }, [sucursal]);

  useEffect(() => {
    if (!sesion || !supabase) return;
    sincronizarPrivilegiosDesdeNube(supabase).then((r) => {
      if (r.cambio) setTickPrivilegios((n) => n + 1);
    });
  }, [sesion, supabase]);

  useEffect(() => {
    if (!sesion || !user) return;
    if (!puedeVerModulo(user.rol, vista, user.id)) {
      const nav = modulosParaSidebar(user.rol, user.id);
      const sub = submodulosContabilidadVisibles(user.rol, user.id);
      setVista(nav[0] || sub[0] || 'Inicio');
    }
  }, [sesion, user, vista, tickPrivilegios]);

  useEffect(() => {
    if (SUBMODULOS_CONTABILIDAD.includes(vista)) setContabilidadOpen(true);
  }, [vista]);

  useEffect(() => {
    if (sesion && user && puedeVerSeccionContabilidad(user.rol, user.id)) {
      setContabilidadOpen(true);
    }
  }, [sesion, user, tickPrivilegios]);

  const irAModulo = useCallback(
    (m, opts = {}) => {
      if (!puedeVerModulo(user?.rol, m, user?.id)) return;
      if (m === 'Buzón') {
        const soloInc = rolVeBuzonComoIncidencias(user?.rol);
        setBuzonPestana(opts.pestana || (soloInc ? 'incidencias' : 'pendientes'));
      }
      setVista(m);
    },
    [user],
  );

  const irAIncidencias = useCallback(() => {
    setBuzonPestana('incidencias');
    irAModulo('Buzón', { pestana: 'incidencias' });
  }, [irAModulo]);

  const completarLogin = useCallback(
    async (data, { ajustarSucursal, autorizacionAdmin = false } = {}) => {
      const terminalFijada = Boolean(SUCURSAL_FIJA_ENV || tiendaFijadaParaAcceso);
      const vinculo = evaluarVinculoDispositivo(data, { terminalFijada });
      if (!vinculo.ok) {
        alert(vinculo.error);
        setPin('');
        return false;
      }
      let sucursalLogin = sucursal;
      if (ajustarSucursal && normalizarCodigoTienda(ajustarSucursal) !== normalizarCodigoTienda(sucursal)) {
        sucursalLogin = ajustarSucursal;
        setSucursal(ajustarSucursal);
        guardarSucursalLocal(ajustarSucursal);
        if (tiendaFijadaParaAcceso) bloquearTiendaEnEsteEquipo(ajustarSucursal);
      }
      if (vinculo.vincular) {
        const resVinculo = await vincularDispositivoUsuario(supabase, data.id, vinculo.deviceId);
        if (!resVinculo.ok) {
          alert(resVinculo.error);
          setPin('');
          return false;
        }
        data.dispositivo_id = vinculo.deviceId;
      }
      setUser(data);
      setSesion(true);
      setPin('');
      setPendienteAutorizacionTurno(null);
      setPinAdminAutorizacion('');
      limpiarAnunciosVistos();
      setVista('Inicio');
      void supabase.from('logins').insert([
        {
          usuario_id: data.id,
          nombre: data.nombre,
          sucursal: sucursalLogin,
          evento: autorizacionAdmin ? 'ENTRADA_AUTORIZADA' : 'ENTRADA',
          turno_id: turnoActual()?.id || null,
        },
      ]);
      return true;
    },
    [sucursal, tiendaFijadaParaAcceso, supabase],
  );

  const manejarLogin = async () => {
    if (!supabase) {
      alert('Configura VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en el archivo .env y reinicia el servidor de desarrollo.');
      return;
    }
    if (!codigoTiendaValido(sucursal)) {
      alert('La tienda actual no es válida. Vuelve a fijar la sucursal o revisa Configuración.');
      return;
    }
    const p = pin.trim();
    if (!p) return;
    const { user: data, error, avisoSucursal, sinColumnaSucursal, ajustarSucursal, sucursalReal } =
      await buscarUsuarioPorPinYSucursal(supabase, p, sucursal);
    if (error) {
      alert(error);
      setPin('');
      return;
    }
    if (sinColumnaSucursal) {
      console.warn('Ejecuta supabase/fix_usuarios_sucursal.sql para ligar usuarios a sucursal.');
    }
    if (data) {
      const accesoTurno = usuarioAutorizadoLogin(data, new Date(), null, sucursal);
      if (!accesoTurno.ok) {
        setPendienteAutorizacionTurno({ user: data, error: accesoTurno.error, ajustarSucursal });
        setPin('');
        return;
      }
      await completarLogin(data, { ajustarSucursal, autorizacionAdmin: Boolean(accesoTurno.autorizacionAdmin) });
    } else {
      alert(avisoSucursal ? mensajePinSucursalIncorrecta(etiquetaTienda(sucursal), sucursalReal) : 'PIN incorrecto');
      setPin('');
    }
  };

  const manejarAutorizacionAdminTurno = async () => {
    if (!pendienteAutorizacionTurno?.user || !supabase) return;
    const p = pinAdminAutorizacion.trim();
    if (!p) return alert('Indica el PIN del administrador.');
    setAutorizandoTurno(true);
    const auth = await verificarPinAdministradorGlobal(supabase, p);
    setAutorizandoTurno(false);
    if (!auth.ok) return alert(auth.error);
    otorgarAutorizacionFueraHorario({
      usuarioId: pendienteAutorizacionTurno.user.id,
      sucursal,
      admin: auth.user,
    });
    await completarLogin(pendienteAutorizacionTurno.user, {
      ajustarSucursal: pendienteAutorizacionTurno.ajustarSucursal,
      autorizacionAdmin: true,
    });
  };

  const cerrarSesion = () => {
    limpiarAnunciosVistos();
    limpiarNotificacionesDispositivoMostradas();
    setSesion(false);
    setUser(null);
    setVista('Inicio');
  };

  const desbloquearTiendaYReiniciarSesion = () => {
    if (SUCURSAL_FIJA_ENV) return;
    if (!confirm('¿Solo si esta terminal debe operar otra tienda? Se cerrará la sesión y podrás elegir y fijar de nuevo.')) return;
    desbloquearTiendaEnEsteEquipo();
    setTiendaFijadaParaAcceso(false);
    setSucursal(leerSucursalGuardada());
    refrescarListaSucursales();
    cerrarSesion();
  };

  const agregarNuevaTienda = (raw) => {
    const r = agregarSucursalExtra(raw);
    if (r.ok) {
      refrescarListaSucursales();
      setSucursal(r.codigo);
    }
    return r;
  };

  const quitarTiendaExtra = (codigo) => {
    const c = normalizarCodigoTienda(codigo);
    const r = quitarSucursalExtra(codigo);
    if (r.ok) {
      refrescarListaSucursales();
      if (normalizarCodigoTienda(sucursal) === c) setSucursal('MAIN');
    }
    return r;
  };

  const puedeIngresarPin = Boolean(supabase) && codigoTiendaValido(sucursal);

  const inventarioTienda = useMemo(
    () => (sesion ? inventarioParaSucursal(inventario, sucursal) : []),
    [sesion, inventario, sucursal],
  );

  if (!sesion) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '1.5rem',
          background: 'linear-gradient(165deg, var(--brand-olive) 0%, var(--brand-gold) 35%, var(--surface) 85%)',
        }}
      >
        <div className="card" style={{ width: '100%', maxWidth: '400px', textAlign: 'center', borderTop: '4px solid var(--brand-red)' }}>
          <div className="brand-logo-wrap" style={{ marginBottom: '0.75rem' }}>
            <BrandLogo alt={brandTitle} maxHeight={140} style={{ maxWidth: '100%' }} />
          </div>
          <h2 style={{ margin: '0 0 0.25rem', color: 'var(--brand-blue)' }}>{brandTitle}</h2>
          <p className="muted" style={{ margin: '0 0 1rem' }}>
            {tiendaFijadaParaAcceso
              ? 'Ingresa tu PIN'
              : 'Elige la tienda y escribe tu PIN. En la caja puedes fijarla con el botón de abajo.'}
          </p>
          {!tiendaFijadaParaAcceso && !SUCURSAL_FIJA_ENV && (
            <>
              <label className="muted" style={{ display: 'block', textAlign: 'left', marginBottom: '0.75rem' }}>
                Tienda de este punto de venta
                <select className="select" style={{ marginTop: '0.35rem' }} value={sucursal} onChange={(e) => setSucursal(e.target.value)}>
                  {listaSucursales.map((s) => (
                    <option key={s} value={s}>
                      {etiquetaTienda(s)}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="btn btn-gold"
                style={{ width: '100%', marginBottom: '1rem' }}
                onClick={() => {
                  bloquearTiendaEnEsteEquipo(sucursal);
                  guardarSucursalLocal(sucursal);
                  setTiendaFijadaParaAcceso(true);
                }}
              >
                Fijar tienda en este equipo
              </button>
              <p className="muted" style={{ fontSize: '0.78rem', textAlign: 'left', marginBottom: '1rem' }}>
                En la PC de caja, al fijar la tienda y entrar con PIN de <strong>cajero</strong> o <strong>repartidor</strong>, ese PIN
                quedará ligado a esta computadora y no podrá usarse en otro dispositivo. Gerentes y administradores no quedan
                vinculados.
              </p>
            </>
          )}
          {tiendaFijadaParaAcceso && (
            <div style={{ marginBottom: '1rem', padding: '0.65rem', borderRadius: '10px', background: 'var(--surface)', textAlign: 'center' }}>
              <span className="badge" style={{ fontSize: '0.85rem' }}>Tienda asignada: {etiquetaTienda(sucursal)}</span>
              {SUCURSAL_FIJA_ENV && (
                <p className="muted" style={{ fontSize: '0.72rem', margin: '0.35rem 0 0' }}>
                  Fijada por instalación (<code>VITE_SUCURSAL_FIJA</code>)
                </p>
              )}
              {!SUCURSAL_FIJA_ENV && (
                <p className="muted" style={{ fontSize: '0.72rem', margin: '0.35rem 0 0' }}>
                  Fijada en este navegador
                </p>
              )}
            </div>
          )}
          {!supabaseConfigured && (
            <p style={{ textAlign: 'left', fontSize: '0.85rem', color: 'var(--brand-red)', marginBottom: '1rem' }}>
              Falta configuración de Supabase. Copia <code>.env.example</code> a <code>.env</code> con{' '}
              <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code>, o configura{' '}
              <code>public/pos3b-config.js</code> (Netlify: variables de entorno en el panel).
            </p>
          )}
          <InputPin
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && puedeIngresarPin && manejarLogin()}
            placeholder="PIN"
            autoFocus={puedeIngresarPin}
            disabled={!puedeIngresarPin}
            style={{ marginBottom: '1rem' }}
          />
          <button
            type="button"
            className="btn btn-primary"
            style={{ width: '100%', padding: '0.85rem' }}
            onClick={manejarLogin}
            disabled={!puedeIngresarPin || Boolean(pendienteAutorizacionTurno)}
          >
            <BtnLabel icon="logIn">Entrar</BtnLabel>
          </button>

          {pendienteAutorizacionTurno && (
            <div
              style={{
                marginTop: '1rem',
                padding: '0.85rem',
                borderRadius: '10px',
                background: 'rgba(225,153,41,0.12)',
                border: '1px solid rgba(225,153,41,0.45)',
                textAlign: 'left',
              }}
            >
              <strong style={{ color: 'var(--brand-gold)' }}>Fuera de horario de turno</strong>
              <p className="muted" style={{ margin: '0.35rem 0 0.75rem', fontSize: '0.82rem' }}>
                {pendienteAutorizacionTurno.error}
              </p>
              <p style={{ margin: '0 0 0.5rem', fontSize: '0.85rem' }}>
                Empleado: <strong>{pendienteAutorizacionTurno.user.nombre}</strong>
              </p>
              <p className="muted" style={{ margin: '0 0 0.65rem', fontSize: '0.78rem' }}>
                Un <strong>administrador</strong> puede autorizar la entrada en {etiquetaTienda(sucursal)} (válido 8 h).
              </p>
              <label className="muted" style={{ display: 'block', fontSize: '0.82rem' }}>
                PIN del administrador
                <div style={{ marginTop: '0.35rem' }}>
                  <InputPin
                    value={pinAdminAutorizacion}
                    onChange={(e) => setPinAdminAutorizacion(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !autorizandoTurno && manejarAutorizacionAdminTurno()}
                    placeholder="PIN admin"
                    autoFocus
                    style={{ marginBottom: 0 }}
                  />
                </div>
              </label>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.65rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-gold"
                  style={{ flex: '1 1 140px' }}
                  onClick={manejarAutorizacionAdminTurno}
                  disabled={autorizandoTurno}
                >
                  {autorizandoTurno ? 'Verificando…' : 'Autorizar entrada'}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    setPendienteAutorizacionTurno(null);
                    setPinAdminAutorizacion('');
                  }}
                  disabled={autorizandoTurno}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  const puedeCambiarTienda = puedeCambiarTiendaLibremente(user?.rol);
  const modulosNav = modulosParaSidebar(user.rol, user.id);
  const subContabilidad = submodulosContabilidadVisibles(user.rol, user.id);
  const contabilidadActiva = SUBMODULOS_CONTABILIDAD.includes(vista);
  const COLOR_CONTABILIDAD = '#7c3aed';

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--surface)' }}>
      {sidebarOpen && (
        <aside
          style={{
            width: '250px',
            flexShrink: 0,
            height: '100vh',
            position: 'sticky',
            top: 0,
            alignSelf: 'flex-start',
            background: 'var(--card)',
            borderRight: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: 'var(--shadow)',
            zIndex: 20,
          }}
        >
          <div style={{ padding: '1rem 1.25rem', textAlign: 'center', borderBottom: '4px solid var(--brand-red)', background: 'linear-gradient(180deg, rgba(225,153,41,0.12) 0%, transparent 100%)' }}>
            <BrandLogo alt="" maxHeight={56} style={{ marginBottom: '0.35rem' }} />
            <div style={{ fontWeight: 800, color: 'var(--brand-blue)', fontSize: '0.95rem', lineHeight: 1.2 }}>{brandTitle}</div>
          </div>
          <nav style={{ flex: 1, padding: '0.65rem', overflowY: 'auto' }}>
            {modulosNav.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => irAModulo(m)}
                onMouseEnter={() => vista !== m && sonidoMenuNavegacion()}
                className={`btn btn-ghost nav-btn${vista === m ? ' nav-btn-active' : ''}`}
                style={{
                  color: vista === m ? colorDeModulo(m) : 'var(--muted)',
                }}
              >
                <Icon name={iconoDeModulo(m)} size={20} style={{ color: colorDeModulo(m) }} />
                <span>{etiquetaModuloSidebar(user?.rol, m)}</span>
              </button>
            ))}
            {subContabilidad.length > 0 && (
              <div style={{ marginTop: '0.35rem' }}>
                <button
                  type="button"
                  className={`btn btn-ghost nav-btn${contabilidadActiva ? ' nav-btn-active' : ''}`}
                  style={{ color: contabilidadActiva ? COLOR_CONTABILIDAD : 'var(--muted)' }}
                  onClick={() => setContabilidadOpen((o) => !o)}
                >
                  <Icon name="dollar" size={20} style={{ color: COLOR_CONTABILIDAD }} />
                  <span style={{ flex: 1, textAlign: 'left' }}>Contabilidad</span>
                  <Icon name={contabilidadOpen ? 'chevronDown' : 'chevronRight'} size={16} />
                </button>
                {contabilidadOpen &&
                  subContabilidad.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => irAModulo(m)}
                      onMouseEnter={() => vista !== m && sonidoMenuNavegacion()}
                      className={`btn btn-ghost nav-btn${vista === m ? ' nav-btn-active' : ''}`}
                      style={{
                        paddingLeft: '2.25rem',
                        color: vista === m ? colorDeModulo(m) : 'var(--muted)',
                      }}
                    >
                      <Icon name={iconoDeModulo(m)} size={18} style={{ color: colorDeModulo(m) }} />
                      <span>{m}</span>
                    </button>
                  ))}
              </div>
            )}
          </nav>
        </aside>
      )}

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
        <header
          style={{
            minHeight: '70px',
            flexShrink: 0,
            background: 'var(--card)',
            display: 'flex',
            alignItems: 'center',
            padding: '0 1.25rem',
            borderBottom: '1px solid var(--border)',
            gap: '0.75rem',
            flexWrap: 'wrap',
          }}
        >
          <button type="button" className="btn btn-ghost" style={{ padding: '0.5rem 0.65rem' }} onClick={() => setSidebarOpen((o) => !o)} aria-label="Menú">
            <Icon name="menu" size={20} />
          </button>
          <h2 className="header-title" style={{ margin: 0, flex: 1, fontSize: '1.25rem', color: colorDeModulo(vista) }}>
            <Icon name={iconoDeModulo(vista)} size={22} style={{ color: colorDeModulo(vista) }} />
            {vista}
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap', fontWeight: 700 }}>
            {puedeCambiarTienda && !SUCURSAL_FIJA_ENV ? (
              <select
                className="select"
                style={{ fontSize: '0.8rem', fontWeight: 700, maxWidth: '200px' }}
                value={sucursal}
                onChange={(e) => setSucursal(e.target.value)}
                title="Cambiar tienda activa"
              >
                {listaSucursales.map((s) => (
                  <option key={s} value={s}>
                    {etiquetaTienda(s)}
                  </option>
                ))}
              </select>
            ) : (
              <span className="badge" style={{ fontSize: '0.8rem' }}>{etiquetaTienda(sucursal)}</span>
            )}
            <span style={{ color: 'var(--brand-blue)', fontSize: '0.95rem' }}>{user?.nombre}</span>
            <span className="muted" style={{ fontSize: '0.75rem', fontWeight: 600 }}>{normalizarRol(user?.rol)}</span>
            <span className="muted" style={{ fontSize: '0.75rem', fontWeight: 500 }}>Dólar: ${Number(tipoCambio).toFixed(2)}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
            {puedeRecibirNotificacionesDispositivo(user?.rol) && <BotonActivarNotificaciones />}
            <BadgeNotificacionesContabilidad
              supabase={supabase}
              sucursal={sucursal}
              user={user}
              onClick={() => {
                setBuzonPestana('pendientes');
                if (puedeVerModulo(user?.rol, 'Buzón', user?.id)) {
                  irAModulo('Buzón');
                  return;
                }
                setValesIrPendientes(true);
                if (puedeVerModulo(user?.rol, 'Vales y Préstamos', user?.id)) irAModulo('Vales y Préstamos');
              }}
            />
            <BotonLimpiarCache />
            <button type="button" className="btn btn-danger" onClick={cerrarSesion}>
              <BtnLabel icon="logOut">Salir</BtnLabel>
            </button>
          </div>
        </header>

        <div style={{ flex: 1, padding: '1.25rem', overflowY: 'auto', minHeight: 0 }}>
          {vista === 'Inicio' && (
            <Inicio
              supabase={supabase}
              sucursal={sucursal}
              inventario={inventarioTienda}
              inventarioCompleto={inventario}
              user={user}
              cargarDatos={cargarDatos}
              onNavigate={irAModulo}
              onIrIncidencias={irAIncidencias}
              puedeModulo={(m) => puedeVerModulo(user?.rol, m, user?.id)}
            />
          )}
          {vista === 'Buzón' && (
            <Buzon
              supabase={supabase}
              sucursal={sucursal}
              user={user}
              pestanaInicial={buzonPestana}
              onNavigate={irAModulo}
              onIrValesPendientes={() => {
                setValesIrPendientes(true);
                if (puedeVerModulo(user?.rol, 'Vales y Préstamos', user?.id)) irAModulo('Vales y Préstamos');
              }}
            />
          )}
          {vista === 'Ventas' && (
            <Ventas
              supabase={supabase}
              user={user}
              sucursal={sucursal}
              tipoCambio={tipoCambio}
              inventario={inventarioTienda}
              cargarDatos={cargarDatos}
              busqueda={busqueda}
              setBusqueda={setBusqueda}
            />
          )}
          {vista === 'Corte de caja' && (
            <CorteCaja supabase={supabase} sucursal={sucursal} user={user} inventario={inventarioTienda} inventarioCompleto={inventario} cargarDatos={cargarDatos} />
          )}
          {vista === 'Productos' && (
            <Productos supabase={supabase} inventario={inventarioTienda} inventarioCompleto={inventario} cargarDatos={cargarDatos} user={user} sucursal={sucursal} />
          )}
          {vista === 'Compras' && (
            <Compras supabase={supabase} sucursal={sucursal} inventario={inventarioTienda} cargarDatos={cargarDatos} onNavigate={irAModulo} />
          )}
          {vista === 'Checador' && (
            <Checador inventario={inventarioTienda} supabase={supabase} sucursal={sucursal} user={user} sucursalesLista={listaSucursales} />
          )}
          {vista === 'Proveedores' && <Proveedores supabase={supabase} inventario={inventario} user={user} />}
          {vista === 'Clientes' && <Clientes supabase={supabase} />}
          {vista === 'Usuarios' && (
            <Usuarios
              supabase={supabase}
              actor={user}
              sucursal={sucursal}
              sucursalesLista={listaSucursales}
              onUsuarioActualizado={(patch) => setUser((prev) => (prev && patch?.id != null && prev.id === patch.id ? { ...prev, ...patch } : prev))}
            />
          )}
          {vista === 'Consultas' && (
            <Consultas supabase={supabase} inventario={inventario} sucursal={sucursal} sucursalesLista={listaSucursales} cargarDatos={cargarDatos} />
          )}
          {vista === 'Estadisticas' && <Estadisticas supabase={supabase} />}
          {vista === 'Reportes' && <Reportes supabase={supabase} inventario={inventarioTienda} sucursal={sucursal} />}
          {vista === 'Nómina' && <Nomina supabase={supabase} sucursal={sucursal} user={user} />}
          {vista === 'Vales y Préstamos' && (
            <ValesPrestamos
              supabase={supabase}
              sucursal={sucursal}
              user={user}
              irAPendientes={valesIrPendientes}
              onPendientesVisto={() => setValesIrPendientes(false)}
            />
          )}
          {vista === 'Corte Virtual' && <CorteVirtual supabase={supabase} sucursal={sucursal} user={user} />}
          {vista === 'Corte Abarrotes' && <CorteAbarrotes supabase={supabase} sucursal={sucursal} user={user} />}
          {vista === 'Corte Garage' && <CorteGarage supabase={supabase} sucursal={sucursal} user={user} />}
          {vista === 'Configuracion' && (
            <Configuracion
              supabase={supabase}
              tipoCambio={tipoCambio}
              setTipoCambio={setTipoCambio}
              sucursal={sucursal}
              setSucursal={setSucursal}
              sucursalesLista={listaSucursales}
              onAgregarSucursal={agregarNuevaTienda}
              onQuitarSucursalExtra={quitarTiendaExtra}
              tiendaNoCambiable={Boolean(SUCURSAL_FIJA_ENV || (tiendaFijadaParaAcceso && !puedeCambiarTienda))}
              bloqueoPorEntorno={Boolean(SUCURSAL_FIJA_ENV)}
              onDesbloquearTiendaBrowser={sesion ? desbloquearTiendaYReiniciarSesion : undefined}
              user={user}
              inventario={inventario}
              cargarDatos={cargarDatos}
            />
          )}
          {vista === 'Ayuda' && <Ayuda user={user} />}
        </div>
        <AnuncioPosOverlay supabase={supabase} onIrVentas={() => irAModulo('Ventas')} />
      </main>
    </div>
  );
}

export default App;
