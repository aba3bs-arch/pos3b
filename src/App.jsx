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
import ResumenOperativo from './modules/ResumenOperativo.jsx';
import Reportes from './modules/Reportes.jsx';
import Nomina from './modules/Nomina.jsx';
import RecoleccionesTraspasosContabilidad from './modules/RecoleccionesTraspasosContabilidad.jsx';
import Contabilidad from './modules/Contabilidad.jsx';
import ContVirtual from './modules/ContVirtual.jsx';
import AutoFin from './modules/AutoFin.jsx';
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
  codigoTiendaBloqueadaLocal,
  normalizarCodigoTienda,
  esAlmacenCentral,
  sucursalFijaEsCajaFisica,
} from './constants/sucursales.js';
import { modulosParaSidebar, puedeVerModulo, normalizarRol, puedeCambiarTiendaLibremente, submodulosContabilidadVisibles, puedeVerSeccionContabilidad, SUBMODULOS_CONTABILIDAD, VISTA_HUB_CONTABILIDAD, puedeAbrirBandejaIncidencias, puedeVerBandejaPendientesIncidencias } from './lib/roles.js';
import { inventarioParaSucursal } from './lib/inventarioMultitienda.js';
import { EVENTO_BRANDING, leerNombreNegocio } from './lib/branding.js';
import { leerTipoCambio, guardarTipoCambio, EVENTO_TIPO_CAMBIO, EVENTO_PRIVILEGIOS } from './lib/posConfig.js';
import { sincronizarPrivilegiosDesdeNube } from './lib/privilegiosSync.js';
import { sincronizarTipoCambioDesdeNube } from './lib/tipoCambioSync.js';
import {
  AVISO_SIN_TABLA_PIN_CUBRE,
  refrescarPinCubreTurnoSucursal,
  sincronizarPinsCubreTurnoDesdeNube,
} from './lib/cubreTurnoSync.js';
import { buscarUsuarioPorPinYSucursal, mensajePinSucursalIncorrecta, esAdministradorSinAnclaje } from './lib/usuariosAuth.js';
import {
  evaluarVinculoDispositivo,
  vincularDispositivoUsuario,
  liberarDispositivoUsuario,
} from './lib/dispositivoUsuario.js';
import { usuarioAutorizadoLogin, turnoActual } from './lib/turnos.js';
import {
  construirUsuarioCubreTurno,
  datosCubreTurnoCompletos,
  esPinCubreTurno,
  esUsuarioCubreTurno,
  EVENTO_PIN_CUBRE_TURNO,
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
import RelojNogales from './components/RelojNogales.jsx';
import { EVENTO_CACHE_LIMPIADO } from './lib/limpiarCache.js';
import BadgeNotificacionesContabilidad from './components/BadgeNotificacionesContabilidad.jsx';
import AnuncioPosOverlay from './components/AnuncioPosOverlay.jsx';
import SelectorSucursal from './components/SelectorSucursal.jsx';
import { usePresenciaSucursales } from './hooks/usePresenciaSucursales.js';
import { instalarSeleccionCamposCantidad } from './lib/seleccionarCamposCantidad.js';
import { cargarTodosLosProductos } from './lib/cargarCatalogoProductos.js';
import { limpiarAnunciosVistos } from './lib/anunciosPos.js';
import {
  puedeRecibirNotificacionesDispositivo,
  mostrarNotificacionDispositivo,
  limpiarNotificacionesDispositivoMostradas,
  registrarServiceWorkerNotificaciones,
} from './lib/notificacionesDispositivo.js';
import { EVENTO_NOTIFICACIONES, EVENTO_NOTIFICACION_DISPOSITIVO, iniciarMonitorNotificacionesDispositivo, TIPOS_NOTIF } from './lib/contabilidadNotificaciones.js';
import { registrarCapturaInstalacionPwa } from './lib/appMovil.js';
import BotonActivarNotificaciones from './components/BotonActivarNotificaciones.jsx';
import PantallaLogin from './components/PantallaLogin.jsx';
import MobileBottomNav from './components/MobileBottomNav.jsx';
import AppSidebarNav from './components/AppSidebarNav.jsx';
import { useMobileLayout } from './hooks/useMobileLayout.js';
import { EVENTO_TEMA_INTERFAZ, aplicarTemaInterfaz, leerTemaInterfaz } from './lib/temasInterfaz.js';
import { iconoDeModulo, colorDeModulo } from './lib/moduloIcons.js';

const SUCURSAL_FIJA_ENV = sucursalFijaPorEntorno();
/** MAIN como VITE_SUCURSAL_FIJA no bloquea el selector (es panel admin). */
const CAJA_FISICA_FIJA_ENV = sucursalFijaEsCajaFisica();

function App() {
  const mobile = useMobileLayout();
  const [sesion, setSesion] = useState(false);
  const [user, setUser] = useState(null);
  const [pin, setPin] = useState('');
  const [loginPinKey, setLoginPinKey] = useState(0);
  const [pendienteAutorizacionTurno, setPendienteAutorizacionTurno] = useState(null);
  const [pinAdminAutorizacion, setPinAdminAutorizacion] = useState('');
  const [autorizandoTurno, setAutorizandoTurno] = useState(false);
  const [pendienteCubreTurno, setPendienteCubreTurno] = useState(false);
  const [nombreCubre, setNombreCubre] = useState('');
  const [telefonoCubre, setTelefonoCubre] = useState('');
  const [enviandoCubre, setEnviandoCubre] = useState(false);
  const [desbloqueandoTienda, setDesbloqueandoTienda] = useState(false);
  const [vista, setVista] = useState('Inicio');
  const [valesIrPendientes, setValesIrPendientes] = useState(false);
  const [valesNavOpts, setValesNavOpts] = useState(null);
  const [valesRetornoModulo, setValesRetornoModulo] = useState(null);
  const [buzonPestana, setBuzonPestana] = useState('pendientes');
  const [sucursal, setSucursal] = useState(sucursalInicial);
  const [tiendaFijadaParaAcceso, setTiendaFijadaParaAcceso] = useState(() => {
    if (CAJA_FISICA_FIJA_ENV) return true;
    // Limpia locks antiguos a MAIN.
    return Boolean(codigoTiendaBloqueadaLocal());
  });
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    typeof window !== 'undefined' ? !window.matchMedia('(max-width: 768px)').matches : true,
  );
  const [tipoCambio, setTipoCambioRaw] = useState(() => leerTipoCambio());
  const [tickPrivilegios, setTickPrivilegios] = useState(0);
  const [tickCubreTurno, setTickCubreTurno] = useState(0);
  const [inventario, setInventario] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [brandTitle, setBrandTitle] = useState(leerNombreNegocio);
  const [listaSucursales, setListaSucursales] = useState(() => listarSucursalesParaUI());

  // Latido: caja física fijada, O sesión activa en Central (MAIN).
  // Si el admin solo "consulta" 3B5 desde MAIN sin fijar, NO latea 3B5 (evita falso “en línea”).
  const sucursalLatido =
    (CAJA_FISICA_FIJA_ENV ? SUCURSAL_FIJA_ENV : null) ||
    (tiendaFijadaParaAcceso ? codigoTiendaBloqueadaLocal() || null : null) ||
    (sesion && esAlmacenCentral(sucursal) ? 'MAIN' : null) ||
    null;

  const { presenciaMap, avisoPresencia, marcarPresenciaFueraDeLinea } = usePresenciaSucursales({
    supabase,
    sucursal: sucursalLatido,
    sesion,
    usuarioNombre: user?.nombre,
    habilitado: Boolean(supabase),
  });

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
    const onCubre = () => setTickCubreTurno((n) => n + 1);
    const onTema = () => aplicarTemaInterfaz(leerTemaInterfaz());
    window.addEventListener(EVENTO_TIPO_CAMBIO, onTc);
    window.addEventListener(EVENTO_PRIVILEGIOS, onPriv);
    window.addEventListener(EVENTO_PIN_CUBRE_TURNO, onCubre);
    window.addEventListener(EVENTO_TEMA_INTERFAZ, onTema);
    return () => {
      window.removeEventListener(EVENTO_TIPO_CAMBIO, onTc);
      window.removeEventListener(EVENTO_PRIVILEGIOS, onPriv);
      window.removeEventListener(EVENTO_PIN_CUBRE_TURNO, onCubre);
      window.removeEventListener(EVENTO_TEMA_INTERFAZ, onTema);
    };
  }, []);

  useEffect(() => {
    return registrarCapturaInstalacionPwa();
  }, []);

  useEffect(() => instalarSeleccionCamposCantidad(), []);

  useEffect(() => {
    if (CAJA_FISICA_FIJA_ENV) {
      setSucursal(SUCURSAL_FIJA_ENV);
      setTiendaFijadaParaAcceso(true);
    } else {
      // codigoTiendaBloqueadaLocal libera locks antiguos a MAIN.
      const locked = codigoTiendaBloqueadaLocal();
      setTiendaFijadaParaAcceso(Boolean(locked));
      setSucursal((s) => (codigoTiendaValido(s) ? s : 'MAIN'));
    }
  }, []);

  useEffect(() => {
    if (!codigoTiendaValido(sucursal)) {
      setSucursal(SUCURSAL_FIJA_ENV || listaSucursales[0] || 'MAIN');
    }
  }, [listaSucursales, sucursal]);

  const cargarDatosGenRef = React.useRef(0);

  const cargarDatos = useCallback(async () => {
    if (!supabase) return;
    const gen = ++cargarDatosGenRef.current;
    const r = await cargarTodosLosProductos(supabase);
    // Ignorar respuestas viejas si hubo otra recarga en paralelo.
    if (gen !== cargarDatosGenRef.current) return;
    if (!r.ok) {
      console.error(r.error);
      setInventario([]);
      return;
    }
    setInventario(r.data || []);
  }, []);

  /** Fusiona o agrega un producto ya guardado sin esperar toda la recarga. */
  const fusionarProductoEnCatalogo = useCallback((row) => {
    if (!row?.id) return;
    setInventario((prev) => {
      const list = Array.isArray(prev) ? [...prev] : [];
      const i = list.findIndex((p) => p.id === row.id);
      if (i >= 0) list[i] = { ...list[i], ...row };
      else list.push(row);
      return list;
    });
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

    const abrirPendientes = (n) => {
      if (n?.tipo === TIPOS_NOTIF.RECOLECCION_POST_LIQ && puedeVerModulo(user?.rol, 'Liquidación recolecciones', user?.id)) {
        setVista('Liquidación recolecciones');
        return;
      }
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
            onClick: () => abrirPendientes(row),
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
        onClick: () => abrirPendientes(row),
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
    if (!supabase) return;
    // Solo consulta si esta tienda tiene PIN (no descarga ni guarda PIN de otras tiendas).
    sincronizarPinsCubreTurnoDesdeNube(supabase, sucursal).then((r) => {
      if (r.cambio) setTickCubreTurno((n) => n + 1);
    });
  }, [supabase, sucursal]);

  useEffect(() => {
    if (!sesion || !supabase) return;
    sincronizarPrivilegiosDesdeNube(supabase).then((r) => {
      if (r.cambio) setTickPrivilegios((n) => n + 1);
    });
    sincronizarTipoCambioDesdeNube(supabase);
    sincronizarPinsCubreTurnoDesdeNube(supabase, sucursal).then((r) => {
      if (r.cambio) setTickCubreTurno((n) => n + 1);
    });
  }, [sesion, supabase, sucursal]);

  useEffect(() => {
    if (!supabase) return undefined;
    const sync = () => {
      if (sesion) {
        sincronizarPrivilegiosDesdeNube(supabase).then((r) => {
          if (r.cambio) setTickPrivilegios((n) => n + 1);
        });
        sincronizarTipoCambioDesdeNube(supabase);
      }
      sincronizarPinsCubreTurnoDesdeNube(supabase, sucursal).then((r) => {
        if (r.cambio) setTickCubreTurno((n) => n + 1);
      });
    };
    const id = setInterval(sync, 60_000);
    return () => clearInterval(id);
  }, [sesion, supabase, sucursal]);

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
      const terminalFijada = Boolean(CAJA_FISICA_FIJA_ENV || tiendaFijadaParaAcceso);
      const vinculo = evaluarVinculoDispositivo(data, { terminalFijada });
      if (!vinculo.ok) {
        alert(vinculo.error);
        setPin('');
        return false;
      }
      // Administrador: nunca anclar a dispositivo; liberar vínculo residual si existiera.
      if (esAdministradorSinAnclaje(data.rol) && data.id && data.dispositivo_id) {
        void liberarDispositivoUsuario(supabase, data.id);
        data.dispositivo_id = null;
      }
      let sucursalLogin = sucursal;
      // No mover la caja a la sucursal del admin: el admin entra en la tienda seleccionada.
      if (
        !esAdministradorSinAnclaje(data.rol) &&
        ajustarSucursal &&
        normalizarCodigoTienda(ajustarSucursal) !== normalizarCodigoTienda(sucursal)
      ) {
        sucursalLogin = ajustarSucursal;
        setSucursal(ajustarSucursal);
        guardarSucursalLocal(ajustarSucursal);
        if (tiendaFijadaParaAcceso) bloquearTiendaEnEsteEquipo(ajustarSucursal);
      }
      if (vinculo.vincular && data.id && !esAdministradorSinAnclaje(data.rol)) {
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

    // Siempre refrescar el PIN de esta tienda desde Supabase antes de validar (todas las cajas).
    const syncPin = await refrescarPinCubreTurnoSucursal(supabase, sucursal);
    setTickCubreTurno((n) => n + 1);
    const pinCubreRemoto = String(syncPin.pin || '').trim();
    if (esPinCubreTurno(p, pinCubreRemoto)) {
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
      return;
    }

    // PIN no es de usuario ni de cubre turno: mensajes claros (tabla faltante / sync).
    if (syncPin.sinTabla) {
      alert(
        `PIN incorrecto.\n\n${syncPin.aviso || AVISO_SIN_TABLA_PIN_CUBRE}\n\nSin esa tabla, el PIN de cubre turno no se puede verificar en la nube.`,
      );
    } else if (syncPin.ok === false && syncPin.error) {
      alert(`PIN incorrecto.\n\nNo se pudo verificar el PIN de cubre turno en la nube: ${syncPin.error}`);
    } else {
      alert(avisoSucursal ? mensajePinSucursalIncorrecta(etiquetaTienda(sucursal), sucursalReal) : 'PIN incorrecto');
    }
    setPin('');
  };

  const manejarEntradaCubreTurno = async () => {
    const val = validarDatosCubreTurno({ nombre: nombreCubre, telefono: telefonoCubre });
    if (!val.ok) return alert(val.error);
    setEnviandoCubre(true);
    try {
      const data = construirUsuarioCubreTurno({
        nombre: val.nombre,
        telefono: val.telefono,
        sucursal,
      });
      await completarLogin(data, { cubreTurno: true });
    } finally {
      setEnviandoCubre(false);
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
    if (sucursalLatido) void marcarPresenciaFueraDeLinea();
    limpiarAnunciosVistos();
    limpiarNotificacionesDispositivoMostradas();
    setSesion(false);
    setUser(null);
    setVista('Inicio');
    setPin('');
    setPendienteCubreTurno(false);
    setNombreCubre('');
    setTelefonoCubre('');
    setPendienteAutorizacionTurno(null);
    setPinAdminAutorizacion('');
    setEnviandoCubre(false);
    setAutorizandoTurno(false);
    // Remonta el campo PIN vacío para que el navegador no reutilice el valor anterior.
    setLoginPinKey((n) => n + 1);
  };

  const aplicarDesbloqueoTienda = () => {
    if (CAJA_FISICA_FIJA_ENV) return;
    desbloquearTiendaEnEsteEquipo();
    setTiendaFijadaParaAcceso(false);
    setSucursal('MAIN');
    guardarSucursalLocal('MAIN');
    refrescarListaSucursales();
    cerrarSesion();
    setPin('');
    setLoginPinKey((n) => n + 1);
  };

  /** Desbloqueo en login: solo con PIN de Administrador (si lo pulsa la sucursal sin PIN, no funciona). */
  const desbloquearTiendaConPinAdmin = async (pinAdmin) => {
    if (CAJA_FISICA_FIJA_ENV) return false;
    if (!supabase) {
      alert('Sin conexión a Supabase.');
      return false;
    }
    const p = String(pinAdmin || '').trim();
    if (!p) {
      alert('Indica el PIN del administrador.');
      return false;
    }
    setDesbloqueandoTienda(true);
    const auth = await verificarPinAdministradorGlobal(supabase, p);
    setDesbloqueandoTienda(false);
    if (!auth.ok) {
      alert(auth.error || 'PIN incorrecto. Solo un administrador puede desbloquear la tienda.');
      return false;
    }
    if (
      !confirm(
        `Autorizado por ${auth.nombre}.\n\n¿Desbloquear la tienda de este equipo?\nPodrás elegir Central (MAIN) u otra sucursal.`,
      )
    ) {
      return false;
    }
    aplicarDesbloqueoTienda();
    return true;
  };

  /** Desde Configuración: siempre exige PIN de administrador (aunque la sesión ya sea admin). */
  const desbloquearTiendaDesdeConfig = async (pinAdmin) => desbloquearTiendaConPinAdmin(pinAdmin);

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
  const cubreTurnoHabilitado = useMemo(() => pinCubreTurnoActivo(sucursal), [sucursal, tickCubreTurno]);
  const cubreDatosListos = useMemo(
    () => datosCubreTurnoCompletos({ nombre: nombreCubre, telefono: telefonoCubre }),
    [nombreCubre, telefonoCubre],
  );

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
        presenciaMap={presenciaMap}
        avisoPresencia={avisoPresencia}
        onCambiarSucursal={(codigo) => {
          setSucursal(codigo);
          setPin('');
          setPendienteCubreTurno(false);
          setNombreCubre('');
          setTelefonoCubre('');
          setPendienteAutorizacionTurno(null);
          setPinAdminAutorizacion('');
          setLoginPinKey((n) => n + 1);
        }}
        onFijarTienda={() => {
          if (esAlmacenCentral(sucursal)) {
            alert(
              'Central (MAIN) no se fija en el equipo.\n\nEs el panel administrativo: puedes desplegar y elegir todas las sucursales. Para fijar una caja, elige una tienda de venta (3B5, 3B7, etc.).',
            );
            return;
          }
          bloquearTiendaEnEsteEquipo(sucursal);
          if (!codigoTiendaBloqueadaLocal()) {
            alert('No se pudo fijar esa tienda.');
            return;
          }
          guardarSucursalLocal(sucursal);
          setTiendaFijadaParaAcceso(true);
        }}
        sucursalFijaEnv={CAJA_FISICA_FIJA_ENV ? SUCURSAL_FIJA_ENV : null}
        onDesbloquearTiendaConAdmin={!CAJA_FISICA_FIJA_ENV && tiendaFijadaParaAcceso ? desbloquearTiendaConPinAdmin : undefined}
        desbloqueandoTienda={desbloqueandoTienda}
        supabaseConfigured={supabaseConfigured}
        pin={pin}
        pinFieldKey={loginPinKey}
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
          setPin('');
          setLoginPinKey((n) => n + 1);
        }}
        enviandoCubre={enviandoCubre}
        cubreDatosListos={cubreDatosListos}
        cubreTurnoHabilitado={cubreTurnoHabilitado}
        pendienteAutorizacionTurno={pendienteAutorizacionTurno}
        pinAdminAutorizacion={pinAdminAutorizacion}
        onPinAdminChange={(e) => setPinAdminAutorizacion(e.target.value)}
        onAutorizarTurno={manejarAutorizacionAdminTurno}
        onCancelarAutorizacion={() => {
          setPendienteAutorizacionTurno(null);
          setPinAdminAutorizacion('');
          setPin('');
          setLoginPinKey((n) => n + 1);
        }}
        autorizandoTurno={autorizandoTurno}
      />
    );
  }

  const puedeCambiarTienda = puedeCambiarTiendaLibremente(user?.rol);
  const rolNorm = normalizarRol(user?.rol);
  const esAdminOGerente = rolNorm === 'Administrador' || rolNorm === 'Gerente';
  // Admin/Gerente SIEMPRE pueden cambiar tienda en la sesión (necesario en celular / central).
  const puedeCambiarTiendaSesion = Boolean(puedeCambiarTienda || esAdminOGerente);
  const tiendaCajaFisicaBloqueada = Boolean(CAJA_FISICA_FIJA_ENV || tiendaFijadaParaAcceso);
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
            <div className="brand-credit">By: A.Marrero</div>
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
            <RelojNogales />
            <div className="app-header-quick">
              {puedeRecibirNotificacionesDispositivo(user?.rol) && (
                <BotonActivarNotificaciones supabase={supabase} user={user} />
              )}
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
            {puedeCambiarTiendaSesion ? (
              <div className="app-header-tienda">
                <SelectorSucursal
                  className="select app-header-select"
                  value={sucursal}
                  onChange={setSucursal}
                  lista={listaSucursales}
                  presenciaMap={presenciaMap}
                  avisoPresencia={avisoPresencia}
                  title="Cambiar tienda activa · punto verde = POS abierto en esa sucursal"
                />
              </div>
            ) : (
              <span className="badge app-header-badge" title={avisoPresencia || undefined}>
                <span
                  className={`sucursal-dot ${presenciaMap?.[normalizarCodigoTienda(sucursal)]?.online ? 'is-online' : 'is-offline'}`}
                  style={{ display: 'inline-block', marginRight: '0.35rem', verticalAlign: 'middle' }}
                  aria-hidden
                />
                {etiquetaTienda(sucursal)}
              </span>
            )}
            <div className="app-header-meta-scroll">
            {avisoPresencia && (
              <span className="muted" style={{ fontSize: '0.72rem', maxWidth: 220 }} title={avisoPresencia}>
                {avisoPresencia.includes('Falta la tabla') ? 'Presencia: falta SQL en Supabase' : 'Presencia: aviso'}
              </span>
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
              puedeCambiarTienda={puedeCambiarTiendaSesion}
              onCambiarTienda={setSucursal}
              listaSucursales={listaSucursales}
              presenciaMap={presenciaMap}
              userRol={user?.rol}
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
            <Productos
              supabase={supabase}
              inventario={inventarioTienda}
              inventarioCompleto={inventario}
              cargarDatos={cargarDatos}
              fusionarProducto={fusionarProductoEnCatalogo}
              user={user}
              sucursal={sucursal}
            />
          )}
          {vista === 'Compras' && (
            <Compras supabase={supabase} sucursal={sucursal} inventario={inventarioTienda} cargarDatos={cargarDatos} onNavigate={irAModulo} />
          )}
          {vista === 'Checador' && (
            <Checador inventario={inventarioTienda} supabase={supabase} sucursal={sucursal} user={user} sucursalesLista={listaSucursales} />
          )}
          {vista === 'Proveedores' && (
            <Proveedores supabase={supabase} inventario={inventario} user={user} sucursal={sucursal} cargarDatos={cargarDatos} />
          )}
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
          {vista === 'Resumen operativo' && <ResumenOperativo supabase={supabase} inventarioCompleto={inventario} />}
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
          {vista === 'IE VIRTUAL' && (
            <>
              <VolverContabilidad onClick={() => irAModulo(VISTA_HUB_CONTABILIDAD)} />
              <ContVirtual supabase={supabase} user={user} />
            </>
          )}
          {vista === 'Auto Fin' && (
            <>
              <VolverContabilidad onClick={() => irAModulo(VISTA_HUB_CONTABILIDAD)} />
              <AutoFin supabase={supabase} user={user} />
            </>
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
              tiendaNoCambiable={tiendaCajaFisicaBloqueada && !puedeCambiarTiendaSesion}
              bloqueoPorEntorno={Boolean(CAJA_FISICA_FIJA_ENV)}
              onDesbloquearTiendaBrowser={
                !CAJA_FISICA_FIJA_ENV && tiendaFijadaParaAcceso ? desbloquearTiendaDesdeConfig : undefined
              }
              desbloqueandoTienda={desbloqueandoTienda}
              puedeCambiarTiendaSesion={puedeCambiarTiendaSesion}
              onCambiarTiendaSesion={puedeCambiarTiendaSesion ? setSucursal : undefined}
              presenciaMap={presenciaMap}
              avisoPresencia={avisoPresencia}
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
