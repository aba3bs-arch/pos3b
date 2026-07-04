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
import RecoleccionesTraspasosContabilidad from './modules/RecoleccionesTraspasosContabilidad.jsx';
import Contabilidad from './modules/Contabilidad.jsx';
import VolverContabilidad from './components/VolverContabilidad.jsx';
import ValesPrestamos from './modules/ValesPrestamos.jsx';
import CorteVirtual from './modules/cortes/CorteVirtual.jsx';
import CorteAbarrotes from './modules/cortes/CorteAbarrotes.jsx';
import CorteGarage from './modules/cortes/CorteGarage.jsx';
import CorteCaja from './modules/CorteCaja.jsx';
import Configuracion from './modules/Configuracion.jsx';
import Buzon from './modules/Buzon.jsx';
import Ayuda from './modules/Ayuda.jsx';
import Recolecciones from './modules/Recolecciones.jsx';
import LiquidacionRecolecciones from './modules/LiquidacionRecolecciones.jsx';
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
import { modulosParaSidebar, puedeVerModulo, normalizarRol, puedeCambiarTiendaLibremente, submodulosContabilidadVisibles, puedeVerSeccionContabilidad, SUBMODULOS_CONTABILIDAD, VISTA_HUB_CONTABILIDAD, puedeAbrirBandejaIncidencias, puedeVerBandejaPendientesIncidencias } from './lib/roles.js';
import { inventarioParaSucursal } from './lib/inventarioMultitienda.js';
import { EVENTO_BRANDING, leerNombreNegocio } from './lib/branding.js';
import { leerTipoCambio, guardarTipoCambio, EVENTO_TIPO_CAMBIO, EVENTO_PRIVILEGIOS } from './lib/posConfig.js';
import { sincronizarPrivilegiosDesdeNube } from './lib/privilegiosSync.js';
import { sincronizarTipoCambioDesdeNube } from './lib/tipoCambioSync.js';
import { buscarUsuarioPorPinYSucursal, mensajePinSucursalIncorrecta } from './lib/usuariosAuth.js';
import {
  evaluarVinculoDispositivo,
  vincularDispositivoUsuario,
} from './lib/dispositivoUsuario.js';
import { usuarioAutorizadoLogin, turnoActual } from './lib/turnos.js';
import {
  construirUsuarioCubreTurno,
  esPinCubreTurno,
  esUsuarioCubreTurno,
  pinCubreTurnoActivo,
  validarDatosCubreTurno,
} from './lib/cubreTurno.js';
import {
  otorgarAutorizacionFueraHorario,
  verificarPinAdministradorGlobal,
} from './lib/autorizacionTurnoFueraHorario.js';
import BrandLogo from './components/BrandLogo.jsx';
import Icon, { BtnLabel } from './components/Icon.jsx';
import BotonLimpiarCache from './components/BotonLimpiarCache.jsx';
import { EVENTO_CACHE_LIMPIADO } from './lib/limpiarCache.js';
import BadgeNotificacionesContabilidad from './components/BadgeNotificacionesContabilidad.jsx';
import AnuncioPosOverlay from './components/AnuncioPosOverlay.jsx';
import { limpiarAnunciosVistos } from './lib/anunciosPos.js';
import {
  puedeRecibirNotificacionesDispositivo,
  mostrarNotificacionDispositivo,
  limpiarNotificacionesDispositivoMostradas,
  registrarServiceWorkerNotificaciones,
} from './lib/notificacionesDispositivo.js';
import { EVENTO_NOTIFICACION_DISPOSITIVO, iniciarMonitorNotificacionesDispositivo, EVENTO_NOTIFICACIONES } from './lib/contabilidadNotificaciones.js';
import { registrarCapturaInstalacionPwa } from './lib/appMovil.js';
import BotonActivarNotificaciones from './components/BotonActivarNotificaciones.jsx';
import PantallaLogin from './components/PantallaLogin.jsx';
import MobileBottomNav from './components/MobileBottomNav.jsx';
import AppSidebarNav from './components/AppSidebarNav.jsx';
import { useMobileLayout } from './hooks/useMobileLayout.js';
import { EVENTO_TEMA_INTERFAZ, aplicarTemaInterfaz, leerTemaInterfaz } from './lib/temasInterfaz.js';
import { iconoDeModulo, colorDeModulo } from './lib/moduloIcons.js';

const SUCURSAL_FIJA_ENV = sucursalFijaPorEntorno();

function App() {
  const mobile = useMobileLayout();
  const [sesion, setSesion] = useState(false);
  const [user, setUser] = useState(null);
  const [pin, setPin] = useState('');
  const [pendienteAutorizacionTurno, setPendienteAutorizacionTurno] = useState(null);
  const [pinAdminAutorizacion, setPinAdminAutorizacion] = useState('');
  const [autorizandoTurno, setAutorizandoTurno] = useState(false);
  const [pendienteCubreTurno, setPendienteCubreTurno] = useState(false);
  const [nombreCubre, setNombreCubre] = useState('');
  const [telefonoCubre, setTelefonoCubre] = useState('');
  const [enviandoCubre, setEnviandoCubre] = useState(false);
  const [vista, setVista] = useState('Inicio');
  const [valesIrPendientes, setValesIrPendientes] = useState(false);
  const [valesNavOpts, setValesNavOpts] = useState(null);
  const [valesRetornoModulo, setValesRetornoModulo] = useState(null);
  const [buzonPestana, setBuzonPestana] = useState('pendientes');
  const [sucursal, setSucursal] = useState(sucursalInicial);
  const [tiendaFijadaParaAcceso, setTiendaFijadaParaAcceso] = useState(() => Boolean(SUCURSAL_FIJA_ENV || tiendaBloqueadaEnEsteEquipo()));
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    typeof window !== 'undefined' ? !window.matchMedia('(max-width: 768px)').matches : true,
  );
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
    const onTema = () => aplicarTemaInterfaz(leerTemaInterfaz());
    window.addEventListener(EVENTO_TIPO_CAMBIO, onTc);
    window.addEventListener(EVENTO_PRIVILEGIOS, onPriv);
    window.addEventListener(EVENTO_TEMA_INTERFAZ, onTema);
    return () => {
      window.removeEventListener(EVENTO_TIPO_CAMBIO, onTc);
      window.removeEventListener(EVENTO_PRIVILEGIOS, onPriv);
      window.removeEventListener(EVENTO_TEMA_INTERFAZ, onTema);
    };
  }, []);

  useEffect(() => {
    return registrarCapturaInstalacionPwa();
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
    if (!sesion) return undefined;
    const onCacheLimpiado = () => {
      cargarDatos();
      window.dispatchEvent(new CustomEvent(EVENTO_NOTIFICACIONES));
    };
    window.addEventListener(EVENTO_CACHE_LIMPIADO, onCacheLimpiado);
    return () => window.removeEventListener(EVENTO_CACHE_LIMPIADO, onCacheLimpiado);
  }, [sesion, cargarDatos]);

  useEffect(() => {
    if (!sesion || !user || !supabase) return undefined;
    if (!puedeRecibirNotificacionesDispositivo(user?.rol)) return undefined;

    const abrirPendientes = () => {
      if (puedeAbrirBandejaIncidencias(user?.rol, user?.id) && puedeVerModulo(user?.rol, 'Incidencias', user?.id)) {
        setBuzonPestana('pendientes');
        setVista('Incidencias');
      } else if (puedeVerModulo(user?.rol, 'Vales y Préstamos', user?.id)) {
        setValesIrPendientes(true);
        setVista('Vales y Préstamos');
      }
    };

    void registrarServiceWorkerNotificaciones();

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
          void mostrarNotificacionDispositivo({
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
      void mostrarNotificacionDispositivo({
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
      if (esUsuarioCubreTurno(user)) return;
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
    sincronizarTipoCambioDesdeNube(supabase);
  }, [sesion, supabase]);

  useEffect(() => {
    if (!sesion || !supabase) return undefined;
    const sync = () => {
      sincronizarPrivilegiosDesdeNube(supabase).then((r) => {
        if (r.cambio) setTickPrivilegios((n) => n + 1);
      });
      sincronizarTipoCambioDesdeNube(supabase);
    };
    const id = setInterval(sync, 60_000);
    return () => clearInterval(id);
  }, [sesion, supabase]);

  useEffect(() => {
    if (!sesion || !user) return;
    const hubContab = vista === VISTA_HUB_CONTABILIDAD;
    const permitido = hubContab
      ? puedeVerSeccionContabilidad(user.rol, user.id)
      : puedeVerModulo(user.rol, vista, user.id);
    if (!permitido) {
      const nav = modulosParaSidebar(user.rol, user.id);
      const sub = submodulosContabilidadVisibles(user.rol, user.id);
      setVista(nav[0] || sub[0] || VISTA_HUB_CONTABILIDAD || 'Inicio');
    }
  }, [sesion, user, vista, tickPrivilegios]);

  useEffect(() => {
    if (mobile) setSidebarOpen(false);
  }, [mobile]);

  const irAModulo = useCallback(
    (m, opts = {}) => {
      if (!puedeVerModulo(user?.rol, m, user?.id)) return;
      if (m === 'Incidencias') {
        const abrePendientes = puedeVerBandejaPendientesIncidencias(user?.rol, user?.id);
        setBuzonPestana(opts.pestana || (abrePendientes ? 'pendientes' : 'incidencias'));
      }
      if (m === 'Vales y Préstamos' && (opts.pestana || opts.retorno)) {
        setValesNavOpts({ pestana: opts.pestana || null, retorno: opts.retorno || null });
        if (opts.retorno) setValesRetornoModulo(opts.retorno);
      }
      setVista(m);
      if (typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches) {
        setSidebarOpen(false);
      }
    },
    [user],
  );

  const irAIncidencias = useCallback(() => {
    setBuzonPestana('incidencias');
    irAModulo('Incidencias', { pestana: 'incidencias' });
  }, [irAModulo]);

  const completarLogin = useCallback(
    async (data, { ajustarSucursal, autorizacionAdmin = false, cubreTurno = false } = {}) => {
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
      if (vinculo.vincular && data.id) {
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
      setPendienteCubreTurno(false);
      setNombreCubre('');
      setTelefonoCubre('');
      limpiarAnunciosVistos();
      setVista('Inicio');
      const loginRow = {
        usuario_id: data.id || null,
        nombre: data.nombre,
        sucursal: sucursalLogin,
        evento: cubreTurno ? 'CUBRE_TURNO' : autorizacionAdmin ? 'ENTRADA_AUTORIZADA' : 'ENTRADA',
        turno_id: turnoActual()?.id || null,
      };
      if (cubreTurno && data.telefono) loginRow.telefono = data.telefono;
      void supabase.from('logins').insert([loginRow]).then(({ error }) => {
        if (error?.message?.includes('telefono')) {
          const { telefono: _t, ...sinTel } = loginRow;
          void supabase.from('logins').insert([sinTel]);
        }
      });
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
    if (pinCubreTurnoActivo(sucursal) && esPinCubreTurno(p, sucursal)) {
      setPendienteCubreTurno(true);
      setPendienteAutorizacionTurno(null);
      setPin('');
      return;
    }
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

  const manejarEntradaCubreTurno = async () => {
    const val = validarDatosCubreTurno({ nombre: nombreCubre, telefono: telefonoCubre });
    if (!val.ok) return alert(val.error);
    setEnviandoCubre(true);
    const data = construirUsuarioCubreTurno({
      nombre: val.nombre,
      telefono: val.telefono,
      sucursal,
    });
    await completarLogin(data, { cubreTurno: true });
    setEnviandoCubre(false);
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

  const puedeIngresarPin = Boolean(supabase) && codigoTiendaValido(sucursal) && !pendienteCubreTurno;

  const inventarioTienda = useMemo(
    () => (sesion ? inventarioParaSucursal(inventario, sucursal) : []),
    [sesion, inventario, sucursal],
  );

  if (!sesion) {
    return (
      <PantallaLogin
        brandTitle={brandTitle}
        tiendaFijadaParaAcceso={tiendaFijadaParaAcceso}
        sucursal={sucursal}
        listaSucursales={listaSucursales}
        onCambiarSucursal={setSucursal}
        onFijarTienda={() => {
          bloquearTiendaEnEsteEquipo(sucursal);
          guardarSucursalLocal(sucursal);
          setTiendaFijadaParaAcceso(true);
        }}
        sucursalFijaEnv={SUCURSAL_FIJA_ENV}
        supabaseConfigured={supabaseConfigured}
        pin={pin}
        onPinChange={(e) => setPin(e.target.value)}
        onLogin={manejarLogin}
        puedeIngresarPin={puedeIngresarPin}
        pendienteCubreTurno={pendienteCubreTurno}
        nombreCubre={nombreCubre}
        telefonoCubre={telefonoCubre}
        onNombreCubreChange={(e) => setNombreCubre(e.target.value)}
        onTelefonoCubreChange={(e) => setTelefonoCubre(e.target.value)}
        onConfirmarCubreTurno={manejarEntradaCubreTurno}
        onCancelarCubreTurno={() => {
          setPendienteCubreTurno(false);
          setNombreCubre('');
          setTelefonoCubre('');
        }}
        enviandoCubre={enviandoCubre}
        cubreTurnoHabilitado={pinCubreTurnoActivo(sucursal)}
        pendienteAutorizacionTurno={pendienteAutorizacionTurno}
        pinAdminAutorizacion={pinAdminAutorizacion}
        onPinAdminChange={(e) => setPinAdminAutorizacion(e.target.value)}
        onAutorizarTurno={manejarAutorizacionAdminTurno}
        onCancelarAutorizacion={() => {
          setPendienteAutorizacionTurno(null);
          setPinAdminAutorizacion('');
        }}
        autorizandoTurno={autorizandoTurno}
      />
    );
  }

  const puedeCambiarTienda = puedeCambiarTiendaLibremente(user?.rol);
  const modulosNav = modulosParaSidebar(user.rol, user.id);
  const subContabilidad = submodulosContabilidadVisibles(user.rol, user.id);
  const contabilidadActiva = vista === VISTA_HUB_CONTABILIDAD || SUBMODULOS_CONTABILIDAD.includes(vista);

  return (
    <div className={`app-shell${mobile ? ' app-shell--mobile' : ''}`}>
      {mobile && sidebarOpen && (
        <button
          type="button"
          className="app-sidebar-backdrop"
          aria-label="Cerrar menú"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      {sidebarOpen && (
        <aside className={`app-sidebar${mobile ? ' app-sidebar--drawer app-sidebar--open' : ''}`}>
          <div className="app-sidebar-brand">
            <BrandLogo alt="" maxHeight={56} style={{ marginBottom: '0.35rem' }} />
            <div className="app-sidebar-title">{brandTitle}</div>
            {mobile && (
              <button type="button" className="app-sidebar-close btn btn-ghost" onClick={() => setSidebarOpen(false)} aria-label="Cerrar">
                <Icon name="x" size={20} />
              </button>
            )}
          </div>
          <AppSidebarNav
            modulosNav={modulosNav}
            vista={vista}
            subContabilidad={subContabilidad}
            contabilidadActiva={contabilidadActiva}
            onNavigate={irAModulo}
            onItemClick={mobile ? () => setSidebarOpen(false) : undefined}
          />
        </aside>
      )}

      <main className="app-main">
        <header className="app-header">
          <div className="app-header-top">
            <button type="button" className="btn btn-ghost app-header-menu" onClick={() => setSidebarOpen((o) => !o)} aria-label="Menú">
              <Icon name="menu" size={20} />
            </button>
            <h2 className="header-title app-header-title" style={{ color: colorDeModulo(vista) }}>
              <Icon name={iconoDeModulo(vista)} size={22} style={{ color: colorDeModulo(vista) }} />
              {vista}
            </h2>
            <div className="app-header-quick">
              {puedeRecibirNotificacionesDispositivo(user?.rol) && <BotonActivarNotificaciones />}
              <BadgeNotificacionesContabilidad
                supabase={supabase}
                sucursal={sucursal}
                user={user}
                onClick={() => {
                  if (puedeAbrirBandejaIncidencias(user?.rol, user?.id) && puedeVerModulo(user?.rol, 'Incidencias', user?.id)) {
                    setBuzonPestana('pendientes');
                    irAModulo('Incidencias');
                    return;
                  }
                  setValesIrPendientes(true);
                  if (puedeVerModulo(user?.rol, 'Vales y Préstamos', user?.id)) irAModulo('Vales y Préstamos');
                }}
              />
            </div>
          </div>
          <div className="app-header-meta">
            {puedeCambiarTienda && !SUCURSAL_FIJA_ENV ? (
              <select
                className="select app-header-select"
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
              <span className="badge app-header-badge">{etiquetaTienda(sucursal)}</span>
            )}
            <span className="app-header-user">{user?.nombre}</span>
            {esUsuarioCubreTurno(user) && (
              <span className="badge" style={{ background: 'rgba(225,153,41,0.15)', color: 'var(--brand-gold)' }}>
                Cubre turno
              </span>
            )}
            <span className="muted app-header-rol">{normalizarRol(user?.rol)}</span>
            <span className="muted app-header-dolar">Dólar: ${Number(tipoCambio).toFixed(2)}</span>
            <div className="app-header-tools">
              <BotonLimpiarCache />
              <button type="button" className="btn btn-danger btn-sm-mobile" onClick={cerrarSesion}>
                <BtnLabel icon="logOut">Salir</BtnLabel>
              </button>
            </div>
          </div>
        </header>

        <div key={vista} className="app-content app-page-enter">
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
          {vista === 'Incidencias' && (
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
          {vista === 'Recolecciones' && (
            <Recolecciones supabase={supabase} sucursal={sucursal} user={user} />
          )}
          {vista === VISTA_HUB_CONTABILIDAD && (
            <Contabilidad submodulosVisibles={subContabilidad} onNavigate={irAModulo} />
          )}
          {vista === 'Liquidación recolecciones' && (
            <>
              <VolverContabilidad onClick={() => irAModulo(VISTA_HUB_CONTABILIDAD)} />
              <LiquidacionRecolecciones supabase={supabase} user={user} />
            </>
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
          {vista === 'Nómina' && (
            <>
              <VolverContabilidad onClick={() => irAModulo(VISTA_HUB_CONTABILIDAD)} />
              <Nomina supabase={supabase} sucursal={sucursal} user={user} />
            </>
          )}
          {vista === 'Panel RT' && (
            <RecoleccionesTraspasosContabilidad supabase={supabase} user={user} onVolverContabilidad={() => irAModulo(VISTA_HUB_CONTABILIDAD)} />
          )}
          {vista === 'Vales y Préstamos' && (
            <ValesPrestamos
              supabase={supabase}
              sucursal={sucursal}
              user={user}
              irAPendientes={valesIrPendientes}
              onPendientesVisto={() => setValesIrPendientes(false)}
              navOpts={valesNavOpts}
              onNavOptsVisto={() => setValesNavOpts(null)}
              retornoModulo={valesRetornoModulo}
              onRegresarCorte={
                valesRetornoModulo
                  ? () => {
                      irAModulo(valesRetornoModulo);
                      setValesRetornoModulo(null);
                    }
                  : undefined
              }
            />
          )}
          {vista === 'Corte Virtual' && <CorteVirtual supabase={supabase} sucursal={sucursal} user={user} onNavigate={irAModulo} />}
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
        {mobile && (
          <MobileBottomNav
            modulos={modulosNav}
            vista={vista}
            onNavigate={irAModulo}
            onOpenMenu={() => setSidebarOpen(true)}
          />
        )}
      </main>
    </div>
  );
}

export default App;
