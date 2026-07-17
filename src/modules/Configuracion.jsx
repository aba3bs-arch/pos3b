import React, { useEffect, useState, useCallback } from 'react';
import { SUCURSALES_BASE, etiquetaTienda, listarSucursalesParaUI } from '../constants/sucursales.js';
import {
  CONEXIONES_PERIFERICO,
  TIPOS_PERIFERICO,
  ANCHOS_PAPEL,
  TIPOS_DOCUMENTO_IMPRESION,
  guardarMetodosPago,
  guardarPerifericos,
  leerMetodosPagoTodos,
  leerPerifericos,
  leerConfigImpresion,
  guardarConfigImpresion,
  nuevoIdConfig,
  etiquetaConexionPeriferico,
  etiquetaTipoPeriferico,
  leerConfigAudio,
  guardarConfigAudio,
  leerPrivilegios,
  guardarPrivilegios,
  guardarPrivilegiosLocal,
  persistirPrivilegios,
  limpiarPrivilegiosRol,
  limpiarPrivilegiosUsuario,
  ACCIONES_PRIVILEGIO,
  leerAccionPrivilegio,
  guardarAccionPrivilegio,
  persistirTipoCambio,
  leerTiendasValesPermitidas,
  guardarTiendasValesPermitidas,
} from '../lib/posConfig.js';
import {
  EVENTO_PERIFERICOS,
  conectarDispositivoUsb,
  conectarPuertoSerial,
  desconectarPuertoSerial,
  puertoSerialConectado,
  registrarEscanerHid,
  resumenCompatibilidad,
  soportaWebSerial,
  soportaWebUsb,
} from '../lib/perifericosPnP.js';
import { imprimirPrueba } from '../lib/impresion.js';
import {
  EVENTO_BRANDING,
  LOGO_DEFAULT,
  guardarLogoUrl,
  guardarNombreNegocio,
  guardarPieTicket,
  leerArchivoComoDataUrl,
  leerLogoUrl,
  leerNombreNegocio,
  leerPieTicket,
  logoEsPersonalizado,
  restaurarLogoPorDefecto,
} from '../lib/branding.js';
import {
  EVENTO_TURNOS,
  TIPOS_HORARIO,
  TIPOS_HORARIO_LIST,
  DIAS_SEMANA,
  leerTurnos,
  guardarTurnos,
  leerConfigHorario,
  guardarConfigHorario,
  aplicarPlantillaHorario,
  esHorarioPersonalizado,
  esRotacion3Activa,
  leerPatronesRotacion3,
  actualizarDiaPatronRotacion,
  restaurarPatronesRotacion3Default,
  sincronizarUsuariosConPatron,
  sincronizarTodosPatronesRotacion,
  aplicarRotacion3Empleados,
  horarioDesdePatronRotacion,
  patronRotacionPorId,
  patronRotacionUsuario,
  grillaSemanaPatron,
  etiquetaCeldaRotacion,
  turnoActual,
  nombreTurnoLegible,
  nuevoIdTurno,
  normalizarHora,
  diasHorarioUsuario,
  construirTurnoHorarioDesdeDias,
  resumenHorarioUsuario,
  etiquetaDuracionTurno,
  TURNO_AMBOS_ID,
  etiquetaTurno,
  leerToleranciaTurnos,
  guardarToleranciaTurnos,
  turnoConTolerancia,
} from '../lib/turnos.js';
import {
  persistirPinCubreTurno,
  pinCubreTurnoActivo,
} from '../lib/cubreTurno.js';
import { pinUsuarioOcupadoEnSucursal } from '../lib/usuariosAuth.js';
import { puedeAsignarTurnos, puedeGestionarUsuarios, puedeGestionarPrivilegios, puedeGestionarInventarioMultitienda, MODULOS_PRIVILEGIOS_GENERAL, MODULOS_CORTES, SUBMODULOS_CONTABILIDAD, ROLES, listarTodosLosRoles, leerRolesPersonalizados, agregarRolPersonalizado, quitarRolPersonalizado, esRolSistema, EVENTO_ROLES, modulosDefaultRol, modulosEnEdicionPrivilegios, tieneListaPersonalizada, normalizarListaModulos, describeOrigenPrivilegios, normalizarRol } from '../lib/roles.js';
import { puedeRecibirNotificacionesDispositivo } from '../lib/notificacionesDispositivo.js';
import { sincronizarPrivilegiosDesdeNube } from '../lib/privilegiosSync.js';
import { cargarPinsCubreTurnoDesdeNube, AVISO_SIN_TABLA_PIN_CUBRE } from '../lib/cubreTurnoSync.js';
import BrandLogo from '../components/BrandLogo.jsx';
import SelectorTemaInterfaz from '../components/SelectorTemaInterfaz.jsx';
import PanelCatalogoIncidencias from '../components/PanelCatalogoIncidencias.jsx';
import PanelNotificacionesAlertas from '../components/PanelNotificacionesAlertas.jsx';
import InputPin from '../components/InputPin.jsx';
import SelectorSucursal from '../components/SelectorSucursal.jsx';
import AdminInventarioCentral from './AdminInventarioCentral.jsx';
import {
  ACCIONES_INCIDENCIAS_PRIVILEGIO,
  ACCIONES_DEFAULT_INCIDENCIAS_POR_ROL,
  PRESET_INCIDENCIAS_CAMPO,
  PRESET_INCIDENCIAS_CENTRAL_MAIN,
  DESCRIPCION_MODULO_INCIDENCIAS,
  tieneAccionIncidencia,
} from '../lib/incidenciasPrivilegios.js';
import {
  leerVentanaRecoleccion,
  guardarVentanaRecoleccion,
  etiquetaVentanaRecoleccion,
  HORA_INICIO_RECOLECCION_DEFAULT,
  HORA_FIN_RECOLECCION_DEFAULT,
} from '../lib/ventanaRecoleccion.js';

export default function Configuracion({
  supabase,
  tipoCambio,
  setTipoCambio,
  sucursal,
  setSucursal,
  sucursalesLista,
  onAgregarSucursal,
  onQuitarSucursalExtra,
  tiendaNoCambiable,
  bloqueoPorEntorno,
  onDesbloquearTiendaBrowser,
  desbloqueandoTienda = false,
  puedeCambiarTiendaSesion = false,
  onCambiarTiendaSesion,
  presenciaMap,
  avisoPresencia,
  user,
  inventario,
  cargarDatos,
}) {
  const [negocio, setNegocio] = useState('');
  const [ticketFooter, setTicketFooter] = useState('');
  const [nuevaTienda, setNuevaTienda] = useState('');
  const [audioCfg, setAudioCfg] = useState(() => leerConfigAudio());
  const [privilegios, setPrivilegios] = useState(() => leerPrivilegios());
  const [privModo, setPrivModo] = useState('rol');
  const [privRol, setPrivRol] = useState('Cajero');
  const [privUserId, setPrivUserId] = useState('');
  const [privGuardando, setPrivGuardando] = useState(false);
  const [privAvisoNube, setPrivAvisoNube] = useState('');
  const [rolesLista, setRolesLista] = useState(() => listarTodosLosRoles());
  const [nuevoRolNombre, setNuevoRolNombre] = useState('');
  const [nuevoRolPlantilla, setNuevoRolPlantilla] = useState('Cajero');
  const [pinsCubreTurno, setPinsCubreTurno] = useState({});
  const [pinsCubreGuardando, setPinsCubreGuardando] = useState(null);
  const [pinsCubreAvisoNube, setPinsCubreAvisoNube] = useState('');
  const [pinsCubreVisibles, setPinsCubreVisibles] = useState(() => new Set());
  const [pinsCubreCargando, setPinsCubreCargando] = useState(false);
  const [pinCubreEnEdicion, setPinCubreEnEdicion] = useState(null);
  const [nuevoPinCubreDraft, setNuevoPinCubreDraft] = useState('');
  const [pedirPinDesbloqueo, setPedirPinDesbloqueo] = useState(false);
  const [pinDesbloqueoTienda, setPinDesbloqueoTienda] = useState('');
  const [ventanaRec, setVentanaRec] = useState(() => leerVentanaRecoleccion());
  const esAdmin = puedeGestionarUsuarios(user?.rol);
  const puedePrivilegios = puedeGestionarPrivilegios(user?.rol);
  const recibeAlertas = puedeRecibirNotificacionesDispositivo(user?.rol);

  useEffect(() => {
    const syncRoles = () => setRolesLista(listarTodosLosRoles());
    window.addEventListener(EVENTO_ROLES, syncRoles);
    return () => window.removeEventListener(EVENTO_ROLES, syncRoles);
  }, []);

  useEffect(() => {
    if (!puedePrivilegios || !supabase) return;
    sincronizarPrivilegiosDesdeNube(supabase).then((r) => {
      if (r.cambio) setPrivilegios(leerPrivilegios());
      if (r.aviso) setPrivAvisoNube(r.aviso);
    });
  }, [puedePrivilegios, supabase]);

  useEffect(() => {
    if (!esAdmin || !supabase) return;
    let ok = true;
    setPinsCubreCargando(true);
    cargarPinsCubreTurnoDesdeNube(supabase).then((r) => {
      if (!ok) return;
      setPinsCubreCargando(false);
      if (r.pins) setPinsCubreTurno(r.pins);
      if (r.sinTabla) setPinsCubreAvisoNube(r.aviso || AVISO_SIN_TABLA_PIN_CUBRE);
      else if (r.aviso) setPinsCubreAvisoNube(r.aviso);
      else if (r.ok === false && r.error) setPinsCubreAvisoNube(r.error);
      else setPinsCubreAvisoNube('');
    });
    return () => {
      ok = false;
    };
  }, [esAdmin, supabase]);

  const guardarPinCubreYSubir = async (tienda, pinRaw) => {
    const p = String(pinRaw ?? '').trim();
    if (p) {
      const choque = await pinUsuarioOcupadoEnSucursal(supabase, p, tienda);
      if (choque.error) {
        alert(choque.error);
        return;
      }
      if (choque.ocupado) {
        alert(
          `Ese PIN ya lo usa el empleado fijo «${choque.usuario?.nombre || 'usuario'}» en ${etiquetaTienda(tienda)}. Elige otro PIN para cubre turno.`,
        );
        return;
      }
    }
    setPinsCubreGuardando(tienda);
    const res = await persistirPinCubreTurno(tienda, p, supabase);
    setPinsCubreGuardando(null);
    if (!res.ok && res.error) {
      alert(res.error);
      return;
    }
    if (res.remoto?.sinTabla) {
      setPinsCubreAvisoNube(res.remoto.aviso || AVISO_SIN_TABLA_PIN_CUBRE);
      alert(
        `No se pudo guardar en la nube.\n\n${res.remoto.aviso || AVISO_SIN_TABLA_PIN_CUBRE}`,
      );
    } else if (res.remoto?.ok === false && res.remoto?.error) {
      setPinsCubreAvisoNube(res.remoto.error);
      alert(`No se pudo guardar el PIN: ${res.remoto.error}`);
    } else if (res.remoto?.ok) {
      setPinsCubreAvisoNube('');
      setPinsCubreTurno((prev) => ({ ...prev, [tienda]: String(res.remoto.pin || '').trim() }));
      setPinCubreEnEdicion(null);
      setNuevoPinCubreDraft('');
      setPinsCubreVisibles((prev) => {
        const next = new Set(prev);
        next.delete(tienda);
        return next;
      });
      alert(
        p
          ? `PIN de cubre turno guardado en la nube para ${etiquetaTienda(tienda)}.`
          : `PIN de cubre turno desactivado en ${etiquetaTienda(tienda)}.`,
      );
    }
  };

  const togglePinCubreVisible = (tienda) => {
    setPinsCubreVisibles((prev) => {
      const next = new Set(prev);
      if (next.has(tienda)) next.delete(tienda);
      else next.add(tienda);
      return next;
    });
  };

  const guardarPrivilegiosYSubir = async (data) => {
    setPrivGuardando(true);
    const res = await persistirPrivilegios(data, supabase);
    setPrivilegios(leerPrivilegios());
    setPrivGuardando(false);
    if (res.remoto?.sinTabla) setPrivAvisoNube(res.remoto.aviso);
    else if (res.remoto?.error) alert(`Guardado local OK. Nube: ${res.remoto.error}`);
    else return true;
    return true;
  };

  const puedeInventarioGlobal = puedeGestionarInventarioMultitienda(user?.rol);
  const [metodosPago, setMetodosPago] = useState([]);
  const [perifericos, setPerifericos] = useState([]);
  const [nuevoMetodo, setNuevoMetodo] = useState('');
  const [perifForm, setPerifForm] = useState({
    nombre: '',
    tipo: 'escaner',
    conexion: 'usb',
    notas: '',
  });
  const [configImpresion, setConfigImpresion] = useState(() => leerConfigImpresion());
  const [conectandoPnP, setConectandoPnP] = useState(false);
  const [serialActivo, setSerialActivo] = useState(() => puertoSerialConectado());
  const [logoUrlCustom, setLogoUrlCustom] = useState('');
  const [logoPreviewKey, setLogoPreviewKey] = useState(0);
  const [turnos, setTurnos] = useState(() => leerTurnos());
  const [toleranciaTurnos, setToleranciaTurnos] = useState(() => leerToleranciaTurnos());
  const [configHorario, setConfigHorario] = useState(() => leerConfigHorario());
  const [patronesRotacion, setPatronesRotacion] = useState(() => leerPatronesRotacion3());
  const [usuariosTurno, setUsuariosTurno] = useState([]);
  const [nuevoTurnoForm, setNuevoTurnoForm] = useState({ nombre: '', hora_inicio: '08:00', hora_fin: '16:00' });
  const [filtroUsuariosTurno, setFiltroUsuariosTurno] = useState('');
  const [valesTiendas, setValesTiendas] = useState(() => leerTiendasValesPermitidas() || listarSucursalesParaUI());
  const puedeAsignarTurnoEmpleados = puedeAsignarTurnos(user?.rol);

  const syncBrandingForm = () => {
    setNegocio(leerNombreNegocio());
    setTicketFooter(leerPieTicket());
    setLogoUrlCustom(logoEsPersonalizado() ? leerLogoUrl() : '');
    setLogoPreviewKey((k) => k + 1);
  };

  useEffect(() => {
    syncBrandingForm();
    setMetodosPago(leerMetodosPagoTodos());
    setPerifericos(leerPerifericos());
    setConfigImpresion(leerConfigImpresion());
    const onBrand = () => syncBrandingForm();
    const onPeriph = () => {
      setPerifericos(leerPerifericos());
      setSerialActivo(puertoSerialConectado());
    };
    window.addEventListener(EVENTO_BRANDING, onBrand);
    window.addEventListener(EVENTO_PERIFERICOS, onPeriph);
    return () => {
      window.removeEventListener(EVENTO_BRANDING, onBrand);
      window.removeEventListener(EVENTO_PERIFERICOS, onPeriph);
    };
  }, []);

  useEffect(() => {
    const sync = () => {
      setTurnos(leerTurnos());
      setToleranciaTurnos(leerToleranciaTurnos());
      setConfigHorario(leerConfigHorario());
      setPatronesRotacion(leerPatronesRotacion3());
    };
    window.addEventListener(EVENTO_TURNOS, sync);
    return () => window.removeEventListener(EVENTO_TURNOS, sync);
  }, []);

  const cargarUsuariosTurno = useCallback(async () => {
    if (!supabase) {
      setUsuariosTurno([]);
      return;
    }
    const { data, error } = await supabase
      .from('usuarios')
      .select('id,nombre,rol,sucursal_id,turno_id,turno_horario')
      .order('sucursal_id')
      .order('nombre');
    if (error) {
      console.error(error);
      setUsuariosTurno([]);
      return;
    }
    setUsuariosTurno(data || []);
  }, [supabase]);

  useEffect(() => {
    cargarUsuariosTurno();
  }, [cargarUsuariosTurno]);

  const persistirTurnos = (lista) => {
    const invalido = (lista || []).find((t) => !normalizarHora(t.hora_inicio) || !normalizarHora(t.hora_fin));
    if (invalido) return alert(`Indica entrada y salida válidas para "${invalido.nombre}".`);
    const r = guardarTurnos(lista);
    if (!r.ok) alert(r.error);
    else {
      setTurnos(r.turnos);
      alert('Horarios de entrada y salida guardados en este equipo.');
    }
  };

  const guardarHorariosTurnos = () => persistirTurnos(turnos);

  const actualizarCampoTurno = (id, campo, valor) => {
    setTurnos((prev) => prev.map((t) => (t.id === id ? { ...t, [campo]: valor } : t)));
  };

  const agregarTurno = () => {
    const nombre = nuevoTurnoForm.nombre.trim();
    if (!nombre) return alert('Indica el nombre del turno (ej. Vespertino).');
    const id = nuevoIdTurno(nombre);
    if (turnos.some((t) => t.id === id)) return alert('Ya existe un turno con ese identificador.');
    const next = [
      ...turnos,
      {
        id,
        nombre,
        hora_inicio: nuevoTurnoForm.hora_inicio || '08:00',
        hora_fin: nuevoTurnoForm.hora_fin || '16:00',
      },
    ];
    setNuevoTurnoForm({ nombre: '', hora_inicio: '08:00', hora_fin: '16:00' });
    persistirTurnos(next);
  };

  const quitarTurno = (id) => {
    if (turnos.length <= 1) return alert('Debe quedar al menos un turno configurado.');
    if (!confirm('¿Quitar este turno? Reasigna a los empleados que lo usen.')) return;
    persistirTurnos(turnos.filter((t) => t.id !== id));
  };

  const restaurarTurnosPorDefecto = () => {
    if (!confirm('¿Aplicar plantilla 8×24 (3 turnos de 8 h)?')) return;
    const r = aplicarPlantillaHorario('8x24', TIPOS_HORARIO['8x24'].inicioDefault);
    if (r.ok) {
      setTurnos(r.turnos);
      setConfigHorario(r.config);
      alert('Plantilla 8×24 aplicada.');
    } else alert(r.error);
  };

  const cambiarTipoHorario = (tipo) => {
    if (tipo === configHorario.tipo) return;
    if (tipo === 'personalizado') {
      const cfg = guardarConfigHorario({ ...configHorario, tipo: 'personalizado', subtipo: null });
      setConfigHorario(cfg);
      if (
        confirm(
          '¿Configurar la rotación de 3 empleados?\n\n· Turno 1: Lun–Vie diurno\n· Turno 2: Mié–Dom nocturno (5 días)\n· Turno 3: Sáb–Dom día, Lun–Mar noche',
        )
      ) {
        const r = aplicarRotacion3Empleados(configHorario.inicio || '07:00');
        if (r.ok) {
          setTurnos(r.turnos);
          setConfigHorario(r.config);
          setPatronesRotacion(r.patrones || leerPatronesRotacion3());
        }
      }
      return;
    }
    const meta = TIPOS_HORARIO[tipo];
    if (!confirm(`¿Cambiar a ${meta.label}? Se reemplazarán los turnos actuales por la plantilla (${meta.descripcion}).`)) return;
    const r = aplicarPlantillaHorario(tipo, configHorario.inicio || meta.inicioDefault);
    if (!r.ok) return alert(r.error);
    setTurnos(r.turnos);
    setConfigHorario(r.config);
    alert(`Plantilla ${meta.label} aplicada.`);
  };

  const aplicarPlantillaConInicio = () => {
    if (configHorario.tipo === 'personalizado') return;
    const r = aplicarPlantillaHorario(configHorario.tipo, configHorario.inicio);
    if (!r.ok) return alert(r.error);
    setTurnos(r.turnos);
    setConfigHorario(r.config);
    alert('Horarios de turno actualizados.');
  };

  const asignarTurnoUsuario = async (userId, turnoId) => {
    if (!puedeAsignarTurnoEmpleados) return alert('Solo el administrador puede cambiar el turno de un empleado.');
    if (!supabase) return alert('Conecta Supabase para asignar turnos a empleados.');
    const { error } = await supabase
      .from('usuarios')
      .update({ turno_id: turnoId || null, turno_horario: null })
      .eq('id', userId);
    if (error) {
      if (String(error.message).includes('turno_id') || String(error.message).includes('turno_horario')) {
        return alert('Ejecuta supabase/fix_turnos_seguridad.sql en Supabase (columnas turno_id y turno_horario).');
      }
      return alert(error.message);
    }
    cargarUsuariosTurno();
  };

  const asignarDiaHorarioUsuario = async (user, diaId, turnoId) => {
    if (!puedeAsignarTurnoEmpleados) return alert('Solo el administrador puede cambiar el turno de un empleado.');
    if (!supabase) return alert('Conecta Supabase para asignar turnos a empleados.');
    const dias = diasHorarioUsuario(user);
    if (turnoId) dias[String(diaId)] = turnoId;
    else delete dias[String(diaId)];
    const turno_horario = construirTurnoHorarioDesdeDias(dias, {
      subtipo: esRotacion3 ? 'rotacion_3' : undefined,
    });
    const payload =
      Object.keys(turno_horario.dias).length > 0
        ? { turno_horario, turno_id: null }
        : { turno_horario: null, turno_id: null };
    const { error } = await supabase.from('usuarios').update(payload).eq('id', user.id);
    if (error) {
      if (String(error.message).includes('turno_horario')) {
        return alert('Ejecuta supabase/fix_turnos.sql para agregar turno_horario (jsonb).');
      }
      return alert(error.message);
    }
    cargarUsuariosTurno();
  };

  const asignarPatronRotacion = async (user, patronId) => {
    if (!puedeAsignarTurnoEmpleados) return alert('Solo el administrador puede cambiar el turno de un empleado.');
    if (!supabase) return alert('Conecta Supabase para asignar turnos a empleados.');
    if (!patronId) {
      const { error } = await supabase.from('usuarios').update({ turno_horario: null, turno_id: null }).eq('id', user.id);
      if (error) return alert(error.message);
      cargarUsuariosTurno();
      return;
    }
    if (patronId === 'manual') {
      const { error } = await supabase
        .from('usuarios')
        .update({ turno_horario: { tipo: 'personalizado', subtipo: 'rotacion_3', dias: {} }, turno_id: null })
        .eq('id', user.id);
      if (error) return alert(error.message);
      cargarUsuariosTurno();
      return;
    }
    const turno_horario = horarioDesdePatronRotacion(patronId);
    if (!turno_horario) return;
    const { error } = await supabase.from('usuarios').update({ turno_horario, turno_id: null }).eq('id', user.id);
    if (error) return alert(error.message);
    cargarUsuariosTurno();
  };

  const configurarRotacion3 = () => {
    if (!confirm('¿Aplicar rotación de 3 empleados?\n\n· Turno 1: Lun–Vie diurno\n· Turno 2: Mié–Dom nocturno\n· Turno 3: Sáb–Dom día, Lun–Mar noche\n\nLuego asigna cada empleado abajo.')) return;
    const r = aplicarRotacion3Empleados(configHorario.inicio || '07:00');
    if (!r.ok) return alert(r.error);
    setTurnos(r.turnos);
    setConfigHorario(r.config);
    setPatronesRotacion(r.patrones || leerPatronesRotacion3());
    alert('Rotación configurada. Asigna Turno 1, 2 o 3 a cada empleado.');
  };

  const cambiarDiaPatronRotacion = async (patronId, diaId, valor) => {
    const r = actualizarDiaPatronRotacion(patronId, diaId, valor || null);
    if (!r.ok) return alert(r.error);
    setPatronesRotacion(r.patrones);
    if (supabase) {
      const sync = await sincronizarUsuariosConPatron(supabase, patronId);
      if (sync.count > 0) cargarUsuariosTurno();
    }
  };

  const restaurarPatronesRotacion = async () => {
    if (!confirm('¿Restaurar los 3 turnos a la configuración recomendada?\n\nTurno 2 quedará Mié–Dom nocturno (5 días).')) return;
    const r = restaurarPatronesRotacion3Default();
    if (!r.ok) return alert(r.error);
    setPatronesRotacion(r.patrones);
    if (supabase) {
      await sincronizarTodosPatronesRotacion(supabase);
      cargarUsuariosTurno();
    }
    alert('Patrones restaurados y empleados actualizados.');
  };

  const turnoEnCurso = turnoActual(turnos);
  const esPersonalizado = esHorarioPersonalizado(configHorario);
  const esRotacion3 = esRotacion3Activa(configHorario);
  const metaTipo = TIPOS_HORARIO[configHorario.tipo] || TIPOS_HORARIO['8x24'];
  const usuariosFiltradosTurno = filtroUsuariosTurno
    ? usuariosTurno.filter((u) => String(u.sucursal_id || '') === filtroUsuariosTurno)
    : usuariosTurno;

  const guardarLocal = () => {
    guardarNombreNegocio(negocio);
    guardarPieTicket(ticketFooter);
    alert('Preferencias guardadas en este navegador.');
  };

  const guardarLogoDesdeArchivo = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const dataUrl = await leerArchivoComoDataUrl(file);
      guardarLogoUrl(dataUrl);
      setLogoUrlCustom(dataUrl);
      setLogoPreviewKey((k) => k + 1);
      alert('Logo actualizado.');
    } catch (err) {
      alert(err.message || String(err));
    }
  };

  const guardarLogoDesdeUrl = () => {
    const u = logoUrlCustom.trim();
    if (!u) return alert('Pega una URL de imagen o sube un archivo.');
    guardarLogoUrl(u);
    setLogoPreviewKey((k) => k + 1);
    alert('Logo actualizado.');
  };

  const usarLogoPorDefecto = () => {
    restaurarLogoPorDefecto();
    setLogoUrlCustom('');
    setLogoPreviewKey((k) => k + 1);
    alert('Se restauró el logo Abarrotes Las 3B.');
  };

  const extras = (sucursalesLista || []).filter((c) => !SUCURSALES_BASE.includes(c));

  const agregar = () => {
    if (typeof onAgregarSucursal !== 'function') return;
    const r = onAgregarSucursal(nuevaTienda);
    if (r.ok) {
      setNuevaTienda('');
      alert(`Tienda "${r.codigo}" agregada y seleccionada.`);
    } else alert(r.error);
  };

  const quitar = (cod) => {
    if (typeof onQuitarSucursalExtra !== 'function') return;
    if (!confirm(`¿Quitar "${cod}" de la lista de este navegador?`)) return;
    const r = onQuitarSucursalExtra(cod);
    if (r.ok) alert('Tienda quitada de la lista.');
    else alert(r.error);
  };

  const guardarMetodos = (lista) => {
    guardarMetodosPago(lista);
    setMetodosPago(leerMetodosPagoTodos());
  };

  const toggleMetodo = (id) => {
    const activos = metodosPago.filter((m) => m.activo).length;
    const target = metodosPago.find((m) => m.id === id);
    if (target?.activo && activos <= 1) {
      alert('Debe quedar al menos un método de pago activo.');
      return;
    }
    guardarMetodos(metodosPago.map((m) => (m.id === id ? { ...m, activo: !m.activo } : m)));
  };

  const renombrarMetodo = (id, label) => {
    guardarMetodos(metodosPago.map((m) => (m.id === id ? { ...m, label } : m)));
  };

  const agregarMetodoPago = () => {
    const label = nuevoMetodo.trim();
    if (!label) return alert('Escribe el nombre del método (ej. Vale, CoDi, PayPal).');
    if (metodosPago.some((m) => m.label.toLowerCase() === label.toLowerCase())) {
      return alert('Ya existe un método con ese nombre.');
    }
    guardarMetodos([
      ...metodosPago,
      { id: nuevoIdConfig(), label, tipo: 'electronico', activo: true, fijo: false },
    ]);
    setNuevoMetodo('');
    alert(`Método "${label}" agregado. Ya aparece en Ventas al cobrar.`);
  };

  const quitarMetodoCustom = (id) => {
    const m = metodosPago.find((x) => x.id === id);
    if (!m || m.fijo) return;
    if (!confirm(`¿Quitar el método "${m.label}"?`)) return;
    guardarMetodos(metodosPago.filter((x) => x.id !== id));
  };

  const guardarListaPerifericos = (lista) => {
    guardarPerifericos(lista);
    setPerifericos(leerPerifericos());
  };

  const agregarPeriferico = () => {
    const nombre = perifForm.nombre.trim();
    if (!nombre) return alert('Indica un nombre para el periférico (ej. Lector Honeywell USB).');
    guardarListaPerifericos([
      ...perifericos,
      {
        id: nuevoIdConfig(),
        nombre,
        tipo: perifForm.tipo,
        conexion: perifForm.conexion,
        notas: perifForm.notas.trim(),
        activo: true,
      },
    ]);
    setPerifForm({ nombre: '', tipo: 'escaner', conexion: 'usb', notas: '' });
    alert('Periférico registrado en este equipo.');
  };

  const togglePeriferico = (id) => {
    guardarListaPerifericos(perifericos.map((p) => (p.id === id ? { ...p, activo: !p.activo } : p)));
  };

  const quitarPeriferico = (id) => {
    const p = perifericos.find((x) => x.id === id);
    if (!p || !confirm(`¿Quitar "${p.nombre}" de la lista?`)) return;
    guardarListaPerifericos(perifericos.filter((x) => x.id !== id));
  };

  const compat = resumenCompatibilidad();

  const conectarSerialPnP = async () => {
    setConectandoPnP(true);
    const r = await conectarPuertoSerial();
    setConectandoPnP(false);
    if (!r.ok) return alert(r.error);
    setSerialActivo(true);
    alert(`Conectado: ${r.nombre}`);
  };

  const conectarUsbPnP = async () => {
    setConectandoPnP(true);
    const r = await conectarDispositivoUsb();
    setConectandoPnP(false);
    if (!r.ok) return alert(r.error);
    alert(`Conectado: ${r.nombre}`);
  };

  const registrarLectorHid = () => {
    const nombre = prompt('Nombre del lector (opcional):', 'Lector USB HID');
    if (nombre === null) return;
    const r = registrarEscanerHid(nombre);
    alert(r.mensaje);
    setPerifericos(leerPerifericos());
  };

  const desconectarSerial = async () => {
    await desconectarPuertoSerial();
    setSerialActivo(false);
    alert('Puerto serial desconectado.');
  };

  const guardarImpresion = () => {
    guardarConfigImpresion(configImpresion);
    alert('Preferencias de impresión guardadas.');
  };

  const toggleDocImpresion = (id) => {
    setConfigImpresion({
      ...configImpresion,
      modos: { ...configImpresion.modos, [id]: !configImpresion.modos[id] },
    });
  };

  const probarImpresion = async () => {
    const r = await imprimirPrueba();
    if (!r.ok) alert(r.error);
  };

  return (
    <div style={{ maxWidth: puedeInventarioGlobal ? '100%' : '720px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {puedeInventarioGlobal && (
        <AdminInventarioCentral
          supabase={supabase}
          inventario={inventario || []}
          cargarDatos={cargarDatos}
          user={user}
          sucursalesLista={sucursalesLista}
        />
      )}
      <div className="card">
        <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Operación</h3>
        <label className="muted">
          Tipo de cambio (1 USD → MXN)
          <input
            type="number"
            step="0.01"
            className="input"
            style={{ marginTop: '0.35rem' }}
            value={tipoCambio}
            onChange={(e) => setTipoCambio(parseFloat(e.target.value) || 0)}
          />
        </label>
        <button
          type="button"
          className="btn btn-primary"
          style={{ marginTop: '0.5rem' }}
          onClick={async () => {
            const r = await persistirTipoCambio(tipoCambio, supabase);
            const v = r.local;
            setTipoCambio(v);
            if (r.remoto?.sinTabla) {
              alert(
                `Tipo de cambio guardado en este equipo: $${v.toFixed(2)} MXN por USD.\n\n` +
                  'Para aplicarlo en todas las sucursales, ejecute supabase/fix_tipo_cambio_global.sql en Supabase.',
              );
              return;
            }
            if (r.remoto && !r.remoto.ok) {
              alert(`Guardado local ($${v.toFixed(2)}), pero no se pudo sincronizar: ${r.remoto.error || 'error desconocido'}`);
              return;
            }
            alert(`Tipo de cambio guardado y sincronizado: $${v.toFixed(2)} MXN por USD (todas las sucursales).`);
          }}
        >
          Guardar tipo de cambio
        </button>
        <p className="muted" style={{ fontSize: '0.85rem' }}>
          El cambio al cliente se calcula en pesos según este valor. Se sincroniza en la nube para todas las sucursales; cada caja lo descarga al iniciar sesión.
        </p>

        <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '1.25rem 0' }} />
        <h4 style={{ margin: '0 0 0.5rem', color: 'var(--brand-blue)' }}>Ventana de recolección</h4>
        <p className="muted" style={{ fontSize: '0.85rem', marginTop: 0 }}>
          Horario en que se puede cobrar efectivo / CFE en ruta (hora Sonora). Norma: {String(HORA_INICIO_RECOLECCION_DEFAULT).padStart(2, '0')}:00 –{' '}
          {String(HORA_FIN_RECOLECCION_DEFAULT).padStart(2, '0')}:00. Crédito / reparto siguen permitidos fuera de ventana.
        </p>
        <div className="grid-2" style={{ gap: '0.75rem', marginTop: '0.5rem' }}>
          <label className="muted">
            Hora inicio (0–23)
            <input
              type="number"
              min={0}
              max={22}
              className="input"
              style={{ marginTop: '0.35rem' }}
              value={ventanaRec.horaInicio}
              onChange={(e) => setVentanaRec((v) => ({ ...v, horaInicio: Number(e.target.value) }))}
            />
          </label>
          <label className="muted">
            Hora fin (1–23, exclusiva)
            <input
              type="number"
              min={1}
              max={23}
              className="input"
              style={{ marginTop: '0.35rem' }}
              value={ventanaRec.horaFin}
              onChange={(e) => setVentanaRec((v) => ({ ...v, horaFin: Number(e.target.value) }))}
            />
          </label>
        </div>
        <p className="muted" style={{ fontSize: '0.82rem', margin: '0.5rem 0 0' }}>
          Actual: <strong>{etiquetaVentanaRecoleccion(ventanaRec)}</strong> (abierta desde inicio hasta un minuto antes del fin).
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.65rem' }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              try {
                const next = guardarVentanaRecoleccion(ventanaRec);
                setVentanaRec(next);
                alert(`Ventana de recolección guardada: ${etiquetaVentanaRecoleccion(next)} (hora Sonora).`);
              } catch (e) {
                alert(e?.message || String(e));
              }
            }}
          >
            Guardar ventana
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              const next = guardarVentanaRecoleccion({
                horaInicio: HORA_INICIO_RECOLECCION_DEFAULT,
                horaFin: HORA_FIN_RECOLECCION_DEFAULT,
              });
              setVentanaRec(next);
              alert(`Restaurada la norma: ${etiquetaVentanaRecoleccion(next)}.`);
            }}
          >
            Restaurar 8:00 – 20:00
          </button>
        </div>

        <div style={{ marginTop: '0.75rem' }}>
          <label className="muted" style={{ display: 'block' }}>
            Tienda / sucursal activa
          </label>
          {tiendaNoCambiable ? (
            <div style={{ marginTop: '0.35rem', padding: '0.85rem', borderRadius: '10px', background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div style={{ fontWeight: 700, color: 'var(--brand-blue)', marginBottom: '0.35rem' }}>{etiquetaTienda(sucursal)}</div>
              {bloqueoPorEntorno ? (
                <p className="muted" style={{ fontSize: '0.85rem', margin: 0 }}>
                  Fijada por instalación (<code>VITE_SUCURSAL_FIJA</code> en <code>.env</code>). Para otra tienda use otro despliegue o quite esa variable y vuelva a generar el build.
                </p>
              ) : (
                <>
                  <p className="muted" style={{ fontSize: '0.85rem', margin: '0 0 0.75rem' }}>
                    Esta caja quedó ligada a una sola tienda para no registrar ventas en sucursal equivocada.
                  </p>
                  {puedeCambiarTiendaSesion && typeof onCambiarTiendaSesion === 'function' && (
                    <label className="muted" style={{ display: 'block', marginBottom: '0.75rem' }}>
                      Consultar otra tienda (solo esta sesión)
                      <SelectorSucursal
                        className="select"
                        style={{ marginTop: '0.35rem' }}
                        value={sucursal}
                        onChange={onCambiarTiendaSesion}
                        lista={sucursalesLista || []}
                        presenciaMap={presenciaMap}
                        title="Consultar otra tienda"
                        mostrarLeyenda
                        avisoPresencia={avisoPresencia}
                      />
                    </label>
                  )}
                  {typeof onDesbloquearTiendaBrowser === 'function' && !pedirPinDesbloqueo && (
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={() => {
                        setPedirPinDesbloqueo(true);
                        setPinDesbloqueoTienda('');
                      }}
                    >
                      Cambiar tienda de este equipo (requiere PIN admin)
                    </button>
                  )}
                  {typeof onDesbloquearTiendaBrowser === 'function' && pedirPinDesbloqueo && (
                    <div
                      style={{
                        marginTop: '0.35rem',
                        padding: '0.85rem',
                        borderRadius: '10px',
                        border: '1px solid rgba(220,38,38,0.35)',
                        background: 'rgba(220,38,38,0.06)',
                      }}
                    >
                      <strong style={{ color: 'var(--brand-red)' }}>Autorización de administrador</strong>
                      <p className="muted" style={{ fontSize: '0.82rem', margin: '0.35rem 0 0.65rem' }}>
                        Ingresa el PIN de un <strong>Administrador</strong>. No se guarda en este equipo.
                      </p>
                      <label className="muted" style={{ display: 'block' }}>
                        PIN del administrador
                        <InputPin
                          value={pinDesbloqueoTienda}
                          onChange={(e) => setPinDesbloqueoTienda(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key !== 'Enter' || desbloqueandoTienda || !pinDesbloqueoTienda.trim()) return;
                            void onDesbloquearTiendaBrowser(pinDesbloqueoTienda).then((ok) => {
                              if (ok) {
                                setPedirPinDesbloqueo(false);
                                setPinDesbloqueoTienda('');
                              }
                            });
                          }}
                          placeholder="PIN admin"
                          autoFocus
                          name="config-desbloqueo-tienda-admin"
                          style={{ marginTop: '0.35rem', marginBottom: '0.65rem' }}
                        />
                      </label>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="btn btn-danger"
                          disabled={desbloqueandoTienda || !pinDesbloqueoTienda.trim()}
                          onClick={() => {
                            void onDesbloquearTiendaBrowser(pinDesbloqueoTienda).then((ok) => {
                              if (ok) {
                                setPedirPinDesbloqueo(false);
                                setPinDesbloqueoTienda('');
                              }
                            });
                          }}
                        >
                          {desbloqueandoTienda ? 'Verificando…' : 'Desbloquear'}
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          disabled={desbloqueandoTienda}
                          onClick={() => {
                            setPedirPinDesbloqueo(false);
                            setPinDesbloqueoTienda('');
                          }}
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                  {typeof onDesbloquearTiendaBrowser !== 'function' && !bloqueoPorEntorno && (
                    <p className="muted" style={{ fontSize: '0.82rem', margin: 0 }}>
                      Solo con <strong>PIN de administrador</strong> se puede desbloquear la tienda de esta caja.
                    </p>
                  )}
                </>
              )}
            </div>
          ) : (
            <SelectorSucursal
              className="select"
              style={{ marginTop: '0.35rem' }}
              value={sucursal}
              onChange={setSucursal}
              lista={sucursalesLista || []}
              presenciaMap={presenciaMap}
              title="Tienda / sucursal activa"
              mostrarLeyenda
              avisoPresencia={avisoPresencia}
            />
          )}
        </div>
      </div>

      <div className="card">
        <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Sonidos del sistema</h3>
        <p className="muted" style={{ marginTop: 0, fontSize: '0.85rem' }}>
          Activa o desactiva los sonidos al pasar el mouse por el menú de módulos y al escanear un producto en Ventas.
        </p>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.65rem' }}>
          <input type="checkbox" checked={audioCfg.sonidoMenu !== false} onChange={(e) => setAudioCfg({ ...audioCfg, sonidoMenu: e.target.checked })} />
          Sonido al pasar el mouse en módulos del menú
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
          <input type="checkbox" checked={audioCfg.sonidoEscaneo !== false} onChange={(e) => setAudioCfg({ ...audioCfg, sonidoEscaneo: e.target.checked })} />
          Sonido al escanear producto (lector o cámara del celular)
        </label>
        <button type="button" className="btn btn-primary" style={{ marginTop: '0.75rem' }} onClick={() => { guardarConfigAudio(audioCfg); alert('Preferencias de sonido guardadas.'); }}>
          Guardar sonidos
        </button>
      </div>

      {recibeAlertas && <PanelNotificacionesAlertas supabase={supabase} user={user} />}

      {esAdmin && (
        <div className="card" style={{ borderTop: '4px solid var(--brand-blue)' }}>
          <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Roles personalizados</h3>
          <p className="muted" style={{ marginTop: 0, fontSize: '0.85rem' }}>
            Cree roles adicionales (ej. Auxiliar, Encargado) copiando los permisos de un rol existente. Luego asígnelos en <strong>Usuarios</strong> o ajuste módulos abajo.
          </p>
          <p className="muted" style={{ margin: '0.5rem 0', fontSize: '0.8rem', color: 'var(--brand-gold)' }}>
            Si aún no lo hizo: ejecute en Supabase el script <code>supabase/fix_usuarios_rol_libre.sql</code> para permitir nombres de rol personalizados.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end', marginBottom: '1rem' }}>
            <label className="muted" style={{ flex: '1 1 180px' }}>
              Nombre del nuevo rol
              <input
                className="input"
                style={{ marginTop: '0.35rem' }}
                value={nuevoRolNombre}
                onChange={(e) => setNuevoRolNombre(e.target.value)}
                placeholder="Ej. Auxiliar mostrador"
                maxLength={48}
              />
            </label>
            <label className="muted" style={{ flex: '1 1 160px' }}>
              Copiar permisos de
              <select className="select" style={{ marginTop: '0.35rem' }} value={nuevoRolPlantilla} onChange={(e) => setNuevoRolPlantilla(e.target.value)}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="btn btn-primary"
              onClick={async () => {
                const res = agregarRolPersonalizado(nuevoRolNombre, {
                  plantilla: nuevoRolPlantilla,
                  privilegios,
                  guardarPrivilegios: guardarPrivilegiosYSubir,
                });
                if (!res.ok) {
                  alert(res.error);
                  return;
                }
                setNuevoRolNombre('');
                setRolesLista(listarTodosLosRoles());
                setPrivRol(res.nombre);
                alert(`Rol «${res.nombre}» creado. Puede asignarlo en Usuarios o ajustar módulos en Privilegios.`);
              }}
            >
              Crear rol
            </button>
          </div>
          {leerRolesPersonalizados().length > 0 ? (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Rol</th>
                    <th>Plantilla</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {leerRolesPersonalizados().map((r) => (
                    <tr key={r.nombre}>
                      <td style={{ fontWeight: 600 }}>{r.nombre}</td>
                      <td className="muted">{r.plantilla}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ fontSize: '0.8rem', color: 'var(--brand-red)' }}
                          onClick={() => {
                            if (!confirm(`¿Quitar el rol «${r.nombre}»? Los usuarios que lo tengan seguirán con ese texto en BD.`)) return;
                            const res = quitarRolPersonalizado(r.nombre);
                            if (!res.ok) alert(res.error);
                            else setRolesLista(listarTodosLosRoles());
                          }}
                        >
                          Quitar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
              Solo roles del sistema: {ROLES.join(', ')}.
            </p>
          )}
        </div>
      )}

      {esAdmin && <PanelCatalogoIncidencias supabase={supabase} />}

      {puedePrivilegios && (
        <div className="card" style={{ borderTop: '4px solid var(--brand-gold)' }}>
          <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Privilegios por rol o usuario</h3>
          <p className="muted" style={{ marginTop: 0, fontSize: '0.85rem' }}>
            Personaliza qué módulos ve cada rol o empleado. Al guardar se sincroniza en Supabase para que <strong>todas las cajas</strong> usen la misma configuración.
            Si un empleado tiene lista <strong>por usuario</strong>, esa lista tiene prioridad sobre su rol.
          </p>
          {privAvisoNube && (
            <p className="muted" style={{ margin: '0.5rem 0', fontSize: '0.82rem', color: 'var(--brand-gold)' }}>{privAvisoNube}</p>
          )}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', margin: '0.75rem 0' }}>
            <button type="button" className={privModo === 'rol' ? 'btn btn-primary' : 'btn btn-ghost'} onClick={() => setPrivModo('rol')}>
              Por rol
            </button>
            <button type="button" className={privModo === 'usuario' ? 'btn btn-primary' : 'btn btn-ghost'} onClick={() => setPrivModo('usuario')}>
              Por usuario
            </button>
          </div>
          {privModo === 'rol' ? (
            <label className="muted" style={{ display: 'block', marginBottom: '0.75rem' }}>
              Rol
              <select className="select" style={{ marginTop: '0.35rem', maxWidth: '280px' }} value={privRol} onChange={(e) => setPrivRol(e.target.value)}>
                {rolesLista.map((r) => (
                  <option key={r} value={r}>
                    {r}
                    {!esRolSistema(r) ? ' (personalizado)' : ''}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="muted" style={{ display: 'block', marginBottom: '0.75rem' }}>
              Usuario
              <select className="select" style={{ marginTop: '0.35rem', maxWidth: '320px' }} value={privUserId} onChange={(e) => setPrivUserId(e.target.value)}>
                <option value="">— Elegir empleado —</option>
                {usuariosTurno.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nombre} ({u.rol})
                  </option>
                ))}
              </select>
            </label>
          )}
          {(() => {
            const privKey = privModo === 'usuario' ? privUserId : privRol;
            const store = privModo === 'usuario' ? 'porUsuario' : 'porRol';
            const rolBase = privModo === 'usuario'
              ? usuariosTurno.find((u) => String(u.id) === String(privKey))?.rol || 'Cajero'
              : privRol;
            const baseModulos = modulosDefaultRol(rolBase);
            const esPersonalizado = privKey ? tieneListaPersonalizada(store, privKey, privilegios) : false;
            const activos = privKey
              ? modulosEnEdicionPrivilegios({ privilegios, store, key: privKey, defaults: baseModulos })
              : baseModulos;
            const subActivos = SUBMODULOS_CONTABILIDAD.filter((m) => activos.includes(m));
            const todosSub = SUBMODULOS_CONTABILIDAD.every((m) => activos.includes(m));
            const algunoSub = subActivos.length > 0;
            const usuariosConOverride =
              privModo === 'rol'
                ? usuariosTurno.filter((u) => normalizarRol(u.rol) === normalizarRol(privRol) && tieneListaPersonalizada('porUsuario', u.id, privilegios))
                : [];

            const aplicarModulos = async (next) => {
              if (!privKey) return;
              const normalizado = normalizarListaModulos(next);
              const data = { ...privilegios, [store]: { ...privilegios[store], [privKey]: normalizado } };
              setPrivilegios(data);
              await guardarPrivilegiosYSubir(data);
            };

            const toggleModulo = (mod) => {
              if (!privKey) return;
              const actual = modulosEnEdicionPrivilegios({ privilegios, store, key: privKey, defaults: baseModulos });
              const next = actual.includes(mod) ? actual.filter((m) => m !== mod) : [...actual, mod];
              void aplicarModulos(next);
            };

            const toggleTodosContabilidad = (marcar) => {
              if (!privKey) return;
              const actual = modulosEnEdicionPrivilegios({ privilegios, store, key: privKey, defaults: baseModulos });
              const sinSub = actual.filter((m) => !SUBMODULOS_CONTABILIDAD.includes(m));
              const next = marcar ? [...sinSub, ...SUBMODULOS_CONTABILIDAD] : sinSub;
              void aplicarModulos(next);
            };

            const marcarSoloCortes = () => {
              if (!privKey) return;
              const actual = modulosEnEdicionPrivilegios({ privilegios, store, key: privKey, defaults: baseModulos });
              const sinCortes = actual.filter((m) => !MODULOS_CORTES.includes(m));
              void aplicarModulos([...sinCortes, ...MODULOS_CORTES]);
            };

            const marcarRecolecciones = () => {
              if (!privKey) return;
              const actual = modulosEnEdicionPrivilegios({ privilegios, store, key: privKey, defaults: baseModulos });
              if (actual.includes('Recolecciones')) return;
              void aplicarModulos([...actual, 'Recolecciones']);
            };

            return (
              <>
                {privKey && (
                  <div style={{ marginBottom: '0.65rem', padding: '0.5rem 0.65rem', borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)', fontSize: '0.82rem' }}>
                    <strong>{esPersonalizado ? 'Lista personalizada' : 'Permisos por defecto del rol'}</strong>
                    <span className="muted"> — {activos.length} módulo(s) activo(s)</span>
                    {privModo === 'usuario' && privKey && (
                      <div className="muted" style={{ marginTop: '0.25rem' }}>
                        {describeOrigenPrivilegios(rolBase, privKey, privilegios)}
                      </div>
                    )}
                    {usuariosConOverride.length > 0 && (
                      <div style={{ marginTop: '0.35rem', color: 'var(--brand-gold)' }}>
                        {usuariosConOverride.length} empleado(s) de este rol tienen lista <strong>por usuario</strong> (no siguen estos cambios):{' '}
                        {usuariosConOverride.map((u) => u.nombre).join(', ')}
                      </div>
                    )}
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.5rem' }}>
                  {MODULOS_PRIVILEGIOS_GENERAL.map((mod) => (
                    <div key={mod} style={{ padding: '0.35rem 0', fontSize: '0.88rem' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <input type="checkbox" checked={activos.includes(mod)} disabled={!privKey} onChange={() => toggleModulo(mod)} />
                        <strong>{mod}</strong>
                      </label>
                      {mod === 'Incidencias' && (
                        <p className="muted" style={{ margin: '0.2rem 0 0 1.45rem', fontSize: '0.78rem', lineHeight: 1.35 }}>
                          {DESCRIPCION_MODULO_INCIDENCIAS} Configure el detalle en <strong>Incidencias — acciones</strong> más abajo.
                        </p>
                      )}
                    </div>
                  ))}
                </div>
                {privKey && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
                    <button type="button" className="btn btn-ghost" style={{ padding: '0.3rem 0.55rem', fontSize: '0.78rem' }} onClick={marcarRecolecciones}>
                      + Recolecciones
                    </button>
                    <button type="button" className="btn btn-ghost" style={{ padding: '0.3rem 0.55rem', fontSize: '0.78rem' }} onClick={marcarSoloCortes}>
                      Marcar cortes (Virtual, Abarrotes, Garage)
                    </button>
                  </div>
                )}

                <div
                  style={{
                    marginTop: '1rem',
                    padding: '0.85rem',
                    borderRadius: '10px',
                    background: 'rgba(124,58,237,0.06)',
                    border: '1px solid rgba(124,58,237,0.25)',
                    borderLeft: '4px solid #7c3aed',
                  }}
                >
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <h4 style={{ margin: 0, fontSize: '0.95rem', color: '#7c3aed', flex: '1 1 160px' }}>Contabilidad</h4>
                    {privKey && (
                      <span className="badge" style={{ fontSize: '0.72rem' }}>
                        {subActivos.length} / {SUBMODULOS_CONTABILIDAD.length} submódulos
                      </span>
                    )}
                  </div>
                  <p className="muted" style={{ margin: '0 0 0.65rem', fontSize: '0.82rem' }}>
                    Los submódulos <strong>Nómina</strong>, <strong>Panel RT</strong>, <strong>Liquidación recolecciones</strong>, <strong>IE VIRTUAL</strong> y <strong>Auto Fin</strong> aparecen al abrir Contabilidad. Los subcomandos del Panel RT se asignan en Acciones especiales abajo.
                  </p>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                    <input
                      type="checkbox"
                      checked={todosSub}
                      disabled={!privKey}
                      onChange={() => toggleTodosContabilidad(!todosSub)}
                    />
                    Todos los submódulos de Contabilidad
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.35rem', paddingLeft: '1.25rem' }}>
                    {SUBMODULOS_CONTABILIDAD.map((mod) => (
                      <label key={mod} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.88rem' }}>
                        <input type="checkbox" checked={activos.includes(mod)} disabled={!privKey} onChange={() => toggleModulo(mod)} />
                        {mod}
                      </label>
                    ))}
                  </div>
                  {privKey && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.65rem' }}>
                      <button type="button" className="btn btn-ghost" style={{ padding: '0.3rem 0.55rem', fontSize: '0.78rem' }} onClick={() => toggleTodosContabilidad(true)}>
                        Marcar todos
                      </button>
                      <button type="button" className="btn btn-ghost" style={{ padding: '0.3rem 0.55rem', fontSize: '0.78rem' }} onClick={() => toggleTodosContabilidad(false)}>
                        Quitar todos
                      </button>
                    </div>
                  )}
                  {privKey && !algunoSub && (
                    <p className="muted" style={{ margin: '0.5rem 0 0', fontSize: '0.8rem', color: 'var(--brand-red)' }}>
                      Sin submódulos activos: el menú Contabilidad no se mostrará para este {privModo === 'usuario' ? 'usuario' : 'rol'}.
                    </p>
                  )}
                </div>

                <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)' }}>
                  <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.95rem', color: 'var(--brand-blue)' }}>Panel RT — acciones especiales</h4>
                  <p className="muted" style={{ margin: '0 0 0.5rem', fontSize: '0.82rem' }}>
                    Recolección en cortes y cada subcomando del Panel RT (reporte, servicios, recolectores, etc.). El administrador siempre tiene acceso.
                  </p>
                  {ACCIONES_PRIVILEGIO.map((acc) => {
                    const checked = privKey ? leerAccionPrivilegio(acc.id, privModo, privKey) : false;
                    return (
                      <label key={acc.id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.88rem', marginBottom: '0.35rem' }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={!privKey}
                          onChange={(e) => {
                            if (!privKey) return;
                            const next = guardarAccionPrivilegio(acc.id, privModo, privKey, e.target.checked);
                            setPrivilegios(next);
                          }}
                        />
                        {acc.label}
                      </label>
                    );
                  })}
                </div>

                <div
                  style={{
                    marginTop: '1rem',
                    padding: '0.85rem',
                    borderRadius: '10px',
                    background: 'rgba(220,38,38,0.05)',
                    border: '1px solid rgba(220,38,38,0.2)',
                    borderLeft: '4px solid var(--danger)',
                  }}
                >
                  <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.95rem', color: 'var(--danger)' }}>Incidencias — acciones (central MAIN y campo)</h4>
                  <p className="muted" style={{ margin: '0 0 0.65rem', fontSize: '0.82rem' }}>
                    Definen si el rol solo <strong>reporta</strong> fallas o también <strong>atiende y resuelve</strong> incidencias.
                    Personal de <strong>central MAIN</strong> suele necesitar ver todas las sucursales y resolver cualquier reporte.
                    <strong> Auditor</strong>, <strong>Técnico</strong> y <strong>Repartidor</strong> tienen por defecto gestión completa de incidencias y pueden cambiar de tienda en MAIN.
                  </p>
                  {privKey && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ padding: '0.3rem 0.55rem', fontSize: '0.78rem' }}
                        onClick={() => {
                          let data = privilegios;
                          for (const id of PRESET_INCIDENCIAS_CENTRAL_MAIN) {
                            data = guardarAccionPrivilegio(id, privModo, privKey, true);
                          }
                          if (!activos.includes('Incidencias')) {
                            const actual = modulosEnEdicionPrivilegios({ privilegios: data, store, key: privKey, defaults: baseModulos });
                            data = { ...data, [store]: { ...data[store], [privKey]: normalizarListaModulos([...actual, 'Incidencias']) } };
                            guardarPrivilegiosLocal(data);
                          }
                          setPrivilegios(data);
                          void guardarPrivilegiosYSubir(data);
                        }}
                      >
                        Preset: Central MAIN (gestión completa)
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ padding: '0.3rem 0.55rem', fontSize: '0.78rem' }}
                        onClick={() => {
                          let data = privilegios;
                          for (const id of PRESET_INCIDENCIAS_CAMPO) {
                            data = guardarAccionPrivilegio(id, privModo, privKey, true);
                          }
                          if (!activos.includes('Incidencias')) {
                            const actual = modulosEnEdicionPrivilegios({ privilegios: data, store, key: privKey, defaults: baseModulos });
                            data = { ...data, [store]: { ...data[store], [privKey]: normalizarListaModulos([...actual, 'Incidencias']) } };
                            guardarPrivilegiosLocal(data);
                          }
                          setPrivilegios(data);
                          void guardarPrivilegiosYSubir(data);
                        }}
                      >
                        Preset: Campo (resolver asignadas)
                      </button>
                    </div>
                  )}
                  {ACCIONES_INCIDENCIAS_PRIVILEGIO.map((acc) => {
                    const checked = privKey ? tieneAccionIncidencia(acc.id, rolBase, privModo === 'usuario' ? privKey : null) : false;
                    const esDefecto = privKey && (ACCIONES_DEFAULT_INCIDENCIAS_POR_ROL[normalizarRol(rolBase)] || []).includes(acc.id);
                    return (
                      <div key={acc.id} style={{ marginBottom: '0.55rem' }}>
                        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.4rem', fontSize: '0.88rem' }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={!privKey}
                            style={{ marginTop: '0.2rem' }}
                            onChange={(e) => {
                              if (!privKey) return;
                              const next = guardarAccionPrivilegio(acc.id, privModo, privKey, e.target.checked);
                              setPrivilegios(next);
                            }}
                          />
                          <span>
                            <strong>{acc.label}</strong>
                            {esDefecto && !leerAccionPrivilegio(acc.id, privModo, privKey) && (
                              <span className="muted" style={{ marginLeft: '0.35rem', fontSize: '0.72rem' }}>(por defecto del rol)</span>
                            )}
                            <div className="muted" style={{ fontSize: '0.78rem', marginTop: '0.15rem', lineHeight: 1.35 }}>{acc.desc}</div>
                          </span>
                        </label>
                      </div>
                    );
                  })}
                </div>
              </>
            );
          })()}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={privGuardando || (privModo === 'usuario' && !privUserId)}
              onClick={async () => {
                const ok = await guardarPrivilegiosYSubir(privilegios);
                if (ok) alert('Privilegios guardados y sincronizados.');
              }}
            >
              {privGuardando ? 'Guardando…' : 'Guardar y sincronizar'}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={privGuardando || (privModo === 'usuario' && !privUserId)}
              onClick={async () => {
                let data;
                if (privModo === 'usuario' && privUserId) {
                  data = limpiarPrivilegiosUsuario(privUserId);
                } else if (privModo === 'rol') {
                  data = limpiarPrivilegiosRol(privRol);
                }
                if (data) {
                  setPrivilegios(data);
                  await guardarPrivilegiosYSubir(data);
                }
                alert('Se restauraron los permisos por defecto para esta selección.');
              }}
            >
              Usar permisos por defecto
            </button>
          </div>
        </div>
      )}

      {esAdmin && (
        <div className="card" style={{ borderTop: '4px solid var(--brand-blue)' }}>
          <h3 style={{ margin: '0 0 0.5rem', color: 'var(--brand-blue)' }}>Vales y préstamos — tiendas autorizadas</h3>
          <p className="muted" style={{ marginTop: 0, fontSize: '0.85rem' }}>
            Solo las tiendas marcadas pueden <strong>generar vales</strong> desde el módulo Vales y Préstamos. Si ninguna está marcada al guardar, se permiten todas.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.35rem', marginTop: '0.75rem' }}>
            {listarSucursalesParaUI().map((t) => {
              const activa = valesTiendas.includes(t);
              return (
                <label key={t} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.88rem' }}>
                  <input
                    type="checkbox"
                    checked={activa}
                    onChange={() => {
                      setValesTiendas((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
                    }}
                  />
                  {etiquetaTienda(t)}
                </label>
              );
            })}
          </div>
          <button
            type="button"
            className="btn btn-primary"
            style={{ marginTop: '0.75rem' }}
            onClick={() => {
              guardarTiendasValesPermitidas(valesTiendas);
              alert('Tiendas autorizadas para vales guardadas.');
            }}
          >
            Guardar permisos de vales
          </button>
        </div>
      )}

      <div className="card" style={{ borderTop: '4px solid var(--brand-gold)' }}>
        <h3 style={{ margin: '0 0 0.5rem', color: 'var(--brand-blue)' }}>Catálogo de tiendas</h3>
        <p className="muted" style={{ marginTop: 0, fontSize: '0.85rem' }}>
          Tiendas base: <strong>MAIN</strong> (central de administración), <strong>FUSION</strong>, <strong>3B2, 3B5, 3B6, 3B7, 3B9, 3B10</strong>. Puedes añadir más códigos; se guardan solo en este navegador.
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem', alignItems: 'flex-end' }}>
          <label className="muted" style={{ flex: '1 1 200px' }}>
            Nueva tienda (código corto)
            <input
              className="input"
              style={{ marginTop: '0.35rem' }}
              value={nuevaTienda}
              onChange={(e) => setNuevaTienda(e.target.value)}
              placeholder="Ej. 3B12 o ALMACEN_NORTE"
              maxLength={32}
            />
          </label>
          <button type="button" className="btn btn-primary" onClick={agregar}>
            Agregar tienda
          </button>
        </div>
        {extras.length > 0 && (
          <div className="table-wrap" style={{ marginTop: '1rem' }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Etiqueta</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {extras.map((c) => (
                  <tr key={c}>
                    <td>{c}</td>
                    <td>{etiquetaTienda(c)}</td>
                    <td>
                      <button type="button" className="btn btn-danger" style={{ padding: '0.25rem 0.45rem', fontSize: '0.75rem' }} onClick={() => quitar(c)}>
                        Quitar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {esAdmin && (
        <div className="card" style={{ borderTop: '4px solid var(--brand-gold)' }}>
          <h3 style={{ margin: '0 0 0.5rem', color: 'var(--brand-blue)' }}>PIN de cubre turno</h3>
          <p className="muted" style={{ marginTop: 0, fontSize: '0.85rem' }}>
            Un <strong>PIN universal por sucursal</strong> para quien cubre turno sin usuario propio. Al usarlo, el POS y el
            checador exigen <strong>nombre y apellido + teléfono</strong> (permisos de <strong>cajero</strong>, sin vincular equipo).
            Debe ser distinto de los PIN personales de esa tienda. Vacío = desactivado.
            El PIN <strong>solo se guarda en la nube</strong> (no en el navegador) para que no se mezcle entre tiendas en esta PC.
            No usa «Liberar equipo» porque el cubre turno no queda ligado a la caja.
          </p>
          {pinsCubreAvisoNube && (
            <p className="muted" style={{ margin: '0 0 0.5rem', fontSize: '0.82rem', color: 'var(--brand-gold)' }}>
              {pinsCubreAvisoNube}
            </p>
          )}
          {pinsCubreCargando ? (
            <p className="muted">Cargando PIN desde la nube…</p>
          ) : (
            <div className="table-wrap" style={{ marginTop: '0.75rem' }}>
              <table className="data">
                <thead>
                  <tr>
                    <th>Tienda</th>
                    <th>PIN cubre turno</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {listarSucursalesParaUI().map((t) => (
                    <tr key={t}>
                      <td>{etiquetaTienda(t)}</td>
                      <td>
                        {pinCubreEnEdicion === t ? (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'center' }}>
                            <InputPin
                              value={nuevoPinCubreDraft}
                              onChange={(e) => setNuevoPinCubreDraft(e.target.value)}
                              placeholder="Nuevo PIN o vacío"
                              autoComplete="off"
                              name={`pin-cubre-edit-${t}`}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') void guardarPinCubreYSubir(t, nuevoPinCubreDraft);
                              }}
                              style={{ width: '160px', fontSize: '0.95rem', letterSpacing: '0.1em', marginBottom: 0 }}
                              disabled={pinsCubreGuardando === t}
                            />
                            <button
                              type="button"
                              className="btn btn-primary"
                              style={{ padding: '0.35rem 0.5rem', fontSize: '0.8rem' }}
                              disabled={Boolean(pinsCubreGuardando)}
                              onClick={() => void guardarPinCubreYSubir(t, nuevoPinCubreDraft)}
                            >
                              {pinsCubreGuardando === t ? 'Guardando…' : 'Guardar'}
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost"
                              style={{ padding: '0.35rem 0.5rem', fontSize: '0.8rem' }}
                              disabled={pinsCubreGuardando === t}
                              onClick={() => {
                                setPinCubreEnEdicion(null);
                                setNuevoPinCubreDraft('');
                              }}
                            >
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <span
                            style={{
                              fontFamily: 'ui-monospace, monospace',
                              letterSpacing: pinsCubreVisibles.has(t) ? '0.05em' : '0.15em',
                            }}
                          >
                            {pinsCubreTurno[t]
                              ? pinsCubreVisibles.has(t)
                                ? pinsCubreTurno[t]
                                : '••••'
                              : 'Sin PIN'}
                          </span>
                        )}
                      </td>
                      <td>
                        {pinCubreEnEdicion !== t && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', justifyContent: 'flex-end' }}>
                            <button
                              type="button"
                              className="btn btn-gold"
                              style={{ padding: '0.35rem 0.5rem', fontSize: '0.8rem' }}
                              onClick={() => togglePinCubreVisible(t)}
                              disabled={pinsCubreGuardando === t || !pinsCubreTurno[t]}
                            >
                              {pinsCubreVisibles.has(t) ? 'Ocultar' : 'Ver PIN'}
                            </button>
                            <button
                              type="button"
                              className="btn btn-primary"
                              style={{ padding: '0.35rem 0.5rem', fontSize: '0.8rem' }}
                              disabled={Boolean(pinsCubreGuardando)}
                              onClick={() => {
                                setPinCubreEnEdicion(t);
                                setNuevoPinCubreDraft(pinsCubreTurno[t] || '');
                              }}
                            >
                              Cambiar PIN
                            </button>
                            {pinsCubreTurno[t] && (
                              <button
                                type="button"
                                className="btn btn-danger"
                                style={{ padding: '0.35rem 0.5rem', fontSize: '0.8rem' }}
                                disabled={Boolean(pinsCubreGuardando)}
                                onClick={() => {
                                  if (
                                    confirm(
                                      `¿Desactivar el PIN de cubre turno de ${etiquetaTienda(t)}? Quedará vacío hasta que configures uno nuevo.`,
                                    )
                                  ) {
                                    void guardarPinCubreYSubir(t, '');
                                  }
                                }}
                              >
                                Desactivar
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {pinCubreTurnoActivo(sucursal) && (
            <p className="muted" style={{ margin: '0.65rem 0 0', fontSize: '0.82rem' }}>
              Esta tienda ({etiquetaTienda(sucursal)}) tiene PIN de cubre turno activo en la nube.
            </p>
          )}
        </div>
      )}

      <div className="card" style={{ borderTop: '4px solid var(--brand-blue)' }}>
        <h3 style={{ margin: '0 0 0.5rem', color: 'var(--brand-blue)' }}>Turnos de caja</h3>
        <p className="muted" style={{ marginTop: 0, fontSize: '0.85rem' }}>
          Por seguridad solo se permite <strong>un corte por turno</strong> (tienda + fecha + turno). Los cajeros <strong>solo pueden entrar al POS en la ventana de su turno</strong> (con tolerancia configurable). Cada venta queda ligada al turno activo. <strong>Solo el administrador</strong> puede cambiar el turno asignado a un empleado.
          {turnoEnCurso && (
            <>
              {' '}
              Turno actual: <span className="badge">{nombreTurnoLegible(turnoEnCurso)}</span>{' '}
              <span className="muted" style={{ fontSize: '0.85rem' }}>
                entrada {turnoEnCurso.hora_inicio} · salida {turnoEnCurso.hora_fin}
              </span>
            </>
          )}
        </p>

        <div style={{ marginTop: '1rem', padding: '0.85rem', borderRadius: '10px', background: 'rgba(59,105,181,0.06)', border: '1px solid rgba(59,105,181,0.25)' }}>
          <strong style={{ color: 'var(--brand-blue)' }}>Tolerancia de entrada</strong>
          <p className="muted" style={{ margin: '0.35rem 0 0.75rem', fontSize: '0.82rem' }}>
            Permite que el cajero entre unos minutos <strong>antes</strong> de su hora oficial o vuelva a entrar si cerró la app <strong>después</strong> de la salida (sin abrir el turno a otra persona).
            Si aun así no puede entrar, un <strong>administrador</strong> puede autorizar con su PIN en la pantalla de login (válido 8 h en esa tienda).
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
            <label className="muted">
              Minutos antes de la entrada
              <input
                type="number"
                min={0}
                max={180}
                className="input"
                style={{ marginTop: '0.35rem', width: '5rem', display: 'block' }}
                value={toleranciaTurnos.minutos_antes}
                disabled={!puedeAsignarTurnoEmpleados}
                onChange={(e) => setToleranciaTurnos({ ...toleranciaTurnos, minutos_antes: e.target.value })}
              />
            </label>
            <label className="muted">
              Minutos después de la salida
              <input
                type="number"
                min={0}
                max={180}
                className="input"
                style={{ marginTop: '0.35rem', width: '5rem', display: 'block' }}
                value={toleranciaTurnos.minutos_despues_fin}
                disabled={!puedeAsignarTurnoEmpleados}
                onChange={(e) => setToleranciaTurnos({ ...toleranciaTurnos, minutos_despues_fin: e.target.value })}
              />
            </label>
            {puedeAsignarTurnoEmpleados && (
              <button
                type="button"
                className="btn btn-gold"
                onClick={() => {
                  guardarToleranciaTurnos(toleranciaTurnos);
                  setToleranciaTurnos(leerToleranciaTurnos());
                }}
              >
                Guardar tolerancia
              </button>
            )}
          </div>
          {turnoEnCurso && (
            <p className="muted" style={{ margin: '0.65rem 0 0', fontSize: '0.78rem' }}>
              Ejemplo {nombreTurnoLegible(turnoEnCurso)}: ventana de login{' '}
              <strong>{turnoConTolerancia(turnoEnCurso, toleranciaTurnos)?.hora_inicio}–{turnoConTolerancia(turnoEnCurso, toleranciaTurnos)?.hora_fin}</strong>
            </p>
          )}
        </div>

        <div style={{ marginTop: '1rem', padding: '0.85rem', borderRadius: '10px', background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <label className="muted" style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem' }}>
            Tipo de horario
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {TIPOS_HORARIO_LIST.map((t) => (
              <button
                key={t.id}
                type="button"
                className={configHorario.tipo === t.id ? 'btn btn-primary' : 'btn btn-ghost'}
                style={{ padding: '0.45rem 0.75rem', fontSize: '0.85rem' }}
                onClick={() => cambiarTipoHorario(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <p className="muted" style={{ margin: '0.5rem 0 0', fontSize: '0.82rem' }}>{metaTipo.descripcion}</p>
          {!esPersonalizado && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginTop: '0.75rem', alignItems: 'flex-end' }}>
              <label className="muted">
                Entrada {configHorario.tipo === '12x12' ? 'turno diurno' : 'primer turno'} (plantilla)
                <input
                  type="time"
                  className="input"
                  style={{ marginTop: '0.35rem', width: '7rem', display: 'block' }}
                  value={configHorario.inicio}
                  onChange={(e) => setConfigHorario({ ...configHorario, inicio: e.target.value })}
                />
              </label>
              <button type="button" className="btn btn-gold" onClick={aplicarPlantillaConInicio}>
                Calcular turnos {metaTipo.label}
              </button>
              <p className="muted" style={{ margin: 0, fontSize: '0.8rem', flex: '1 1 220px' }}>
                La plantilla calcula entradas y salidas automáticamente. Luego puedes ajustar cada turno en la tabla.
              </p>
            </div>
          )}
          {esPersonalizado && !esRotacion3 && (
            <div style={{ marginTop: '0.75rem' }}>
              <button type="button" className="btn btn-primary" onClick={configurarRotacion3}>
                Configurar rotación 3 empleados
              </button>
              <p className="muted" style={{ margin: '0.5rem 0 0', fontSize: '0.82rem' }}>
                Recomendado si trabajan 3 personas: Turno 1 (Lun–Vie día), Turno 2 (Mié–Dom noche), Turno 3 (fin de semana día + Lun–Mar noche).
              </p>
            </div>
          )}
          {esRotacion3 && (
            <div style={{ marginTop: '0.75rem', padding: '0.85rem', borderRadius: '10px', background: 'rgba(59,105,181,0.06)', border: '1px solid rgba(59,105,181,0.25)' }}>
              <strong style={{ color: 'var(--brand-blue)' }}>Rotación 3 empleados — ajusta días y descansos</strong>
              <p className="muted" style={{ margin: '0.35rem 0 0.75rem', fontSize: '0.82rem' }}>
                En cada día elige: <strong>Diurno</strong>, <strong>Nocturno</strong> o <strong>Descanso (—)</strong>. Los cambios aplican al instante a empleados con ese turno asignado.
              </p>
              <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
                {patronesRotacion.map((p) => (
                  <div key={p.id} style={{ padding: '0.65rem', borderRadius: '8px', background: 'var(--surface)', border: '1px solid var(--border)' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--brand-blue)' }}>{p.nombre}</div>
                    <div className="muted" style={{ fontSize: '0.78rem', marginBottom: '0.5rem' }}>{p.subtitulo}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.25rem' }}>
                      {grillaSemanaPatron(p.dias).map(({ dia, turnoId }) => (
                        <label key={dia.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.15rem' }}>
                          <span style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--muted)' }}>{dia.corto}</span>
                          <select
                            className="select"
                            style={{ padding: '0.15rem', fontSize: '0.68rem', width: '100%', minWidth: 0 }}
                            value={turnoId || ''}
                            onChange={(e) => cambiarDiaPatronRotacion(p.id, dia.id, e.target.value)}
                            title={`${dia.largo} — ${p.nombre}`}
                          >
                            <option value="">—</option>
                            <option value="diurno">D</option>
                            <option value="nocturno">N</option>
                          </select>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.65rem', alignItems: 'center' }}>
                <button type="button" className="btn btn-ghost" onClick={restaurarPatronesRotacion}>
                  Restaurar patrones recomendados
                </button>
                <span className="muted" style={{ fontSize: '0.78rem' }}>
                  <strong>—</strong> descanso · <strong>D</strong> diurno · <strong>N</strong> nocturno
                </span>
              </div>
            </div>
          )}
        </div>

        <h4 style={{ margin: '1rem 0 0.35rem', color: 'var(--brand-blue)', fontSize: '0.95rem' }}>Entrada y salida por turno</h4>
        <p className="muted" style={{ margin: '0 0 0.5rem', fontSize: '0.82rem' }}>
          Configura la <strong>hora de entrada</strong> y la <strong>hora de salida</strong> de cada turno. El corte de caja usa estos horarios para saber qué turno está activo.
        </p>
        <div className="table-wrap" style={{ marginTop: '0.35rem' }}>
          <table className="data">
            <thead>
              <tr>
                <th>Turno</th>
                <th>Entrada</th>
                <th>Salida</th>
                <th>Duración</th>
                {esPersonalizado && !esRotacion3 && <th />}
              </tr>
            </thead>
            <tbody>
              {turnos.map((t) => (
                <tr key={t.id}>
                  <td>
                    {esPersonalizado && !esRotacion3 ? (
                      <input className="input" style={{ padding: '0.35rem 0.5rem', fontSize: '0.9rem' }} value={t.nombre} onChange={(e) => actualizarCampoTurno(t.id, 'nombre', e.target.value)} />
                    ) : (
                      <strong>{t.nombre}</strong>
                    )}
                  </td>
                  <td>
                    <input
                      type="time"
                      className="input"
                      style={{ padding: '0.35rem 0.5rem', fontSize: '0.9rem', width: '7.5rem' }}
                      value={t.hora_inicio}
                      onChange={(e) => actualizarCampoTurno(t.id, 'hora_inicio', e.target.value)}
                      title={`Entrada — ${t.nombre}`}
                    />
                  </td>
                  <td>
                    <input
                      type="time"
                      className="input"
                      style={{ padding: '0.35rem 0.5rem', fontSize: '0.9rem', width: '7.5rem' }}
                      value={t.hora_fin}
                      onChange={(e) => actualizarCampoTurno(t.id, 'hora_fin', e.target.value)}
                      title={`Salida — ${t.nombre}`}
                    />
                  </td>
                  <td className="muted" style={{ fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                    {etiquetaDuracionTurno(t)}
                  </td>
                  {esPersonalizado && !esRotacion3 && (
                    <td>
                      <button type="button" className="btn btn-danger" style={{ padding: '0.25rem 0.45rem', fontSize: '0.75rem' }} onClick={() => quitarTurno(t.id)}>
                        Quitar
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem', alignItems: 'center' }}>
          <button type="button" className="btn btn-gold" onClick={guardarHorariosTurnos}>
            Guardar entrada y salida
          </button>
          {!esPersonalizado && (
            <button type="button" className="btn btn-ghost" onClick={restaurarTurnosPorDefecto}>
              Restaurar plantilla 8×24
            </button>
          )}
        </div>
        {esPersonalizado && !esRotacion3 && (
          <>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem', alignItems: 'flex-end' }}>
              <label className="muted" style={{ flex: '1 1 140px' }}>
                Nuevo turno
                <input className="input" style={{ marginTop: '0.35rem' }} value={nuevoTurnoForm.nombre} onChange={(e) => setNuevoTurnoForm({ ...nuevoTurnoForm, nombre: e.target.value })} placeholder="Ej. Diurno 12 h" />
              </label>
              <label className="muted">
                Entrada
                <input type="time" className="input" style={{ marginTop: '0.35rem', width: '7rem' }} value={nuevoTurnoForm.hora_inicio} onChange={(e) => setNuevoTurnoForm({ ...nuevoTurnoForm, hora_inicio: e.target.value })} />
              </label>
              <label className="muted">
                Salida
                <input type="time" className="input" style={{ marginTop: '0.35rem', width: '7rem' }} value={nuevoTurnoForm.hora_fin} onChange={(e) => setNuevoTurnoForm({ ...nuevoTurnoForm, hora_fin: e.target.value })} />
              </label>
              <button type="button" className="btn btn-primary" onClick={agregarTurno}>
                Agregar turno
              </button>
            </div>
            <div style={{ marginTop: '0.5rem' }}>
              <button type="button" className="btn btn-ghost" onClick={() => cambiarTipoHorario('12x12')}>
                Usar plantilla 12×12
              </button>
            </div>
          </>
        )}

        <h4 style={{ margin: '1.25rem 0 0.5rem', color: 'var(--brand-blue)', fontSize: '1rem' }}>Empleados por turno</h4>
        <p className="muted" style={{ marginTop: 0, fontSize: '0.85rem' }}>
          {esRotacion3
            ? 'Asigna a cada empleado el Turno 1, 2 o 3. Solo puede hacer corte en los días y horario que le corresponda.'
            : esPersonalizado
              ? 'Asigna por día de la semana qué turno le corresponde a cada empleado.'
              : 'Asigna Diurno o Nocturno a cada cajero. Solo el administrador puede modificar estas asignaciones.'}
        </p>
        {!puedeAsignarTurnoEmpleados && (
          <p className="muted" style={{ margin: '0.5rem 0 0', fontSize: '0.85rem', color: 'var(--brand-red)' }}>
            Estás viendo turnos en solo lectura. Pide al administrador para cambiar la asignación de un cajero.
          </p>
        )}
        {!supabase ? (
          <p className="muted" style={{ fontSize: '0.85rem' }}>Configura Supabase para asignar turnos a empleados.</p>
        ) : (
          <>
            <label className="muted" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
              Filtrar tienda
              <select className="select" style={{ minWidth: '140px' }} value={filtroUsuariosTurno} onChange={(e) => setFiltroUsuariosTurno(e.target.value)}>
                <option value="">Todas</option>
                {(sucursalesLista || []).map((s) => (
                  <option key={s} value={s}>
                    {etiquetaTienda(s)}
                  </option>
                ))}
              </select>
            </label>
            <div className="table-wrap" style={{ marginTop: '0.75rem', overflowX: 'auto' }}>
              <table className="data" style={{ minWidth: esPersonalizado && !esRotacion3 ? '720px' : undefined }}>
                <thead>
                  <tr>
                    <th>Empleado</th>
                    <th>Tienda</th>
                    <th>Rol</th>
                    {esRotacion3 ? (
                      <>
                        <th>Rotación</th>
                        <th>Semana (D= día · N= noche)</th>
                      </>
                    ) : esPersonalizado ? (
                      <>
                        {DIAS_SEMANA.map((d) => (
                          <th key={d.id} style={{ fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                            {d.corto}
                          </th>
                        ))}
                        <th>Resumen</th>
                      </>
                    ) : (
                      <th>Turno asignado</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {usuariosFiltradosTurno.length === 0 ? (
                    <tr>
                      <td colSpan={esRotacion3 ? 5 : esPersonalizado ? 11 : 4} className="muted">
                        Sin empleados. Alta en Usuarios o ejecuta el seed.
                      </td>
                    </tr>
                  ) : (
                    usuariosFiltradosTurno.map((u) => {
                      const diasUser = diasHorarioUsuario(u);
                      const patronId = patronRotacionUsuario(u);
                      return (
                        <tr key={u.id}>
                          <td>{u.nombre}</td>
                          <td>{etiquetaTienda(u.sucursal_id)}</td>
                          <td>
                            <span className="badge">{u.rol}</span>
                          </td>
                          {esRotacion3 ? (
                            <>
                              <td>
                                <select
                                  className="select"
                                  style={{ padding: '0.35rem 0.5rem', fontSize: '0.85rem', minWidth: '11rem' }}
                                  value={patronId || (Object.keys(diasUser).length ? 'manual' : '')}
                                  onChange={(e) => asignarPatronRotacion(u, e.target.value)}
                                >
                                  <option value="">Sin asignar</option>
                                  {patronesRotacion.map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {p.nombre} — {p.subtitulo}
                                    </option>
                                  ))}
                                  <option value="manual">Manual (día a día)</option>
                                </select>
                              </td>
                              <td>
                                <div style={{ display: 'flex', gap: '0.2rem', flexWrap: 'wrap' }}>
                                  {grillaSemanaPatron(patronId ? patronRotacionPorId(patronId)?.dias : diasUser).map(
                                    ({ dia, turnoId }) => (
                                      <span
                                        key={dia.id}
                                        style={{
                                          fontSize: '0.72rem',
                                          padding: '0.15rem 0.35rem',
                                          borderRadius: '4px',
                                          fontWeight: 700,
                                          background: turnoId === 'diurno' ? 'rgba(255,193,7,0.35)' : turnoId === 'nocturno' ? 'rgba(59,105,181,0.25)' : 'var(--border)',
                                        }}
                                      >
                                        {dia.corto} {etiquetaCeldaRotacion(turnoId)}
                                      </span>
                                    ),
                                  )}
                                </div>
                              </td>
                            </>
                          ) : esPersonalizado ? (
                            <>
                              {DIAS_SEMANA.map((d) => (
                                <td key={d.id}>
                                  <select
                                    className="select"
                                    style={{ padding: '0.2rem', fontSize: '0.72rem', minWidth: '4.5rem', maxWidth: '5.5rem' }}
                                    value={diasUser[String(d.id)] || ''}
                                    onChange={(e) => asignarDiaHorarioUsuario(u, d.id, e.target.value || null)}
                                    title={`${d.largo} — ${u.nombre}`}
                                  >
                                    <option value="">—</option>
                                    {turnos.map((t) => (
                                      <option key={t.id} value={t.id}>
                                        {t.nombre.split(' ')[0]}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                              ))}
                              <td className="muted" style={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                                {resumenHorarioUsuario(u, turnos)}
                              </td>
                            </>
                          ) : (
                            <td>
                              <select
                                className="select"
                                style={{ padding: '0.35rem 0.5rem', fontSize: '0.85rem', minWidth: '160px' }}
                                value={u.turno_id || ''}
                                disabled={!puedeAsignarTurnoEmpleados}
                                onChange={(e) => asignarTurnoUsuario(u.id, e.target.value || null)}
                              >
                                <option value="">Sin turno</option>
                                <option value={TURNO_AMBOS_ID}>Ambos turnos</option>
                                {turnos.map((t) => (
                                  <option key={t.id} value={t.id}>
                                    {t.nombre} (E {t.hora_inicio} · S {t.hora_fin})
                                  </option>
                                ))}
                              </select>
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <div className="card" style={{ borderTop: '4px solid var(--brand-blue)' }}>
        <h3 style={{ margin: '0 0 0.5rem', color: 'var(--brand-blue)' }}>Métodos de pago</h3>
        <p className="muted" style={{ marginTop: 0, fontSize: '0.85rem' }}>
          Activa o desactiva formas de cobro en <strong>Ventas</strong>. Incluye efectivo, tarjeta, transferencia, QR y métodos personalizados.
        </p>
        <div className="table-wrap" style={{ marginTop: '0.75rem' }}>
          <table className="data">
            <thead>
              <tr>
                <th>Método</th>
                <th>Tipo</th>
                <th>Activo</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {metodosPago.map((m) => (
                <tr key={m.id}>
                  <td>{m.fijo ? <strong>{m.label}</strong> : <input className="input" style={{ padding: '0.35rem 0.5rem', fontSize: '0.9rem' }} value={m.label} onChange={(e) => renombrarMetodo(m.id, e.target.value)} />}</td>
                  <td className="muted" style={{ fontSize: '0.85rem' }}>{m.tipo === 'efectivo' ? 'Efectivo / cambio' : 'Electrónico'}</td>
                  <td>
                    <button type="button" className={m.activo ? 'btn btn-success' : 'btn btn-ghost'} style={{ padding: '0.25rem 0.55rem', fontSize: '0.75rem' }} onClick={() => toggleMetodo(m.id)}>
                      {m.activo ? 'Sí' : 'No'}
                    </button>
                  </td>
                  <td>{!m.fijo && <button type="button" className="btn btn-danger" style={{ padding: '0.25rem 0.45rem', fontSize: '0.75rem' }} onClick={() => quitarMetodoCustom(m.id)}>Quitar</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem', alignItems: 'flex-end' }}>
          <label className="muted" style={{ flex: '1 1 200px' }}>
            Nuevo método
            <input className="input" style={{ marginTop: '0.35rem' }} value={nuevoMetodo} onChange={(e) => setNuevoMetodo(e.target.value)} placeholder="Ej. CoDi, Vale, PayPal" maxLength={40} />
          </label>
          <button type="button" className="btn btn-primary" onClick={agregarMetodoPago}>Agregar método</button>
        </div>
      </div>

      <div className="card" style={{ borderTop: '4px solid var(--brand-green)' }}>
        <h3 style={{ margin: '0 0 0.5rem', color: 'var(--brand-blue)' }}>Periféricos plug and play</h3>
        <p className="muted" style={{ marginTop: 0, fontSize: '0.85rem' }}>
          Conecta escáneres, impresoras térmicas y terminales. Los lectores <strong>HID</strong> (la mayoría USB) funcionan al instante como teclado.
          Impresoras por <strong>USB/Serial</strong> requieren Chrome o Edge en Windows.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.5rem' }}>
          <span className="badge" style={{ fontSize: '0.72rem' }}>Web Serial: {compat.serial ? 'Sí' : 'No'}</span>
          <span className="badge" style={{ fontSize: '0.72rem' }}>WebUSB: {compat.usb ? 'Sí' : 'No'}</span>
          <span className="badge" style={{ fontSize: '0.72rem' }}>Serial activo: {serialActivo ? 'Conectado' : '—'}</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.75rem' }}>
          <button type="button" className="btn btn-primary" onClick={conectarSerialPnP} disabled={conectandoPnP || !soportaWebSerial()}>
            {conectandoPnP ? 'Conectando…' : 'Conectar impresora / serial'}
          </button>
          <button type="button" className="btn btn-primary" onClick={conectarUsbPnP} disabled={conectandoPnP || !soportaWebUsb()}>
            Conectar USB (impresora POS)
          </button>
          <button type="button" className="btn btn-gold" onClick={registrarLectorHid}>
            Registrar lector HID
          </button>
          {serialActivo && (
            <button type="button" className="btn btn-ghost" onClick={desconectarSerial}>
              Desconectar serial
            </button>
          )}
        </div>

        <h4 style={{ margin: '1rem 0 0.35rem', color: 'var(--brand-blue)', fontSize: '0.95rem' }}>Alta manual</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.65rem', marginTop: '0.35rem' }}>
          <label className="muted" style={{ gridColumn: '1 / -1' }}>
            Nombre del equipo
            <input className="input" style={{ marginTop: '0.35rem' }} value={perifForm.nombre} onChange={(e) => setPerifForm({ ...perifForm, nombre: e.target.value })} placeholder="Ej. Lector Honeywell USB" />
          </label>
          <label className="muted">
            Tipo
            <select className="select" style={{ marginTop: '0.35rem' }} value={perifForm.tipo} onChange={(e) => setPerifForm({ ...perifForm, tipo: e.target.value })}>
              {TIPOS_PERIFERICO.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </label>
          <label className="muted">
            Conexión
            <select className="select" style={{ marginTop: '0.35rem' }} value={perifForm.conexion} onChange={(e) => setPerifForm({ ...perifForm, conexion: e.target.value })}>
              {CONEXIONES_PERIFERICO.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </label>
          <label className="muted" style={{ gridColumn: '1 / -1' }}>
            Notas
            <input className="input" style={{ marginTop: '0.35rem' }} value={perifForm.notas} onChange={(e) => setPerifForm({ ...perifForm, notas: e.target.value })} placeholder="Puerto, IP, ubicación…" />
          </label>
        </div>
        <button type="button" className="btn btn-gold" style={{ marginTop: '0.75rem' }} onClick={agregarPeriferico}>Agregar periférico</button>
        {perifericos.length > 0 && (
          <div className="table-wrap" style={{ marginTop: '1rem' }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Tipo</th>
                  <th>Conexión</th>
                  <th>Estado</th>
                  <th>Notas</th>
                  <th>Activo</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {perifericos.map((p) => (
                  <tr key={p.id}>
                    <td>{p.nombre}</td>
                    <td>{etiquetaTipoPeriferico(p.tipo)}</td>
                    <td>{etiquetaConexionPeriferico(p.conexion)}</td>
                    <td>
                      {p.plugAndPlay ? (
                        <span className="badge" style={{ fontSize: '0.7rem', background: p.conectado ? 'rgba(34,197,94,0.2)' : 'var(--surface)' }}>
                          {p.conectado ? 'En línea' : 'Registrado'}
                        </span>
                      ) : (
                        <span className="muted" style={{ fontSize: '0.8rem' }}>Manual</span>
                      )}
                    </td>
                    <td className="muted" style={{ fontSize: '0.85rem' }}>{p.notas || '—'}</td>
                    <td>
                      <button type="button" className={p.activo !== false ? 'btn btn-success' : 'btn btn-ghost'} style={{ padding: '0.25rem 0.55rem', fontSize: '0.75rem' }} onClick={() => togglePeriferico(p.id)}>
                        {p.activo !== false ? 'Sí' : 'No'}
                      </button>
                    </td>
                    <td>
                      <button type="button" className="btn btn-danger" style={{ padding: '0.25rem 0.45rem', fontSize: '0.75rem' }} onClick={() => quitarPeriferico(p.id)}>Quitar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card" style={{ borderTop: '4px solid var(--brand-blue)' }}>
        <h3 style={{ margin: '0 0 0.5rem', color: 'var(--brand-blue)' }}>Impresión de documentos</h3>
        <p className="muted" style={{ marginTop: 0, fontSize: '0.85rem' }}>
          Tickets de venta, órdenes y recepciones de compra, inventarios, reportes y cortes de caja. Usa la impresora del sistema o térmica serial/USB conectada arriba.
        </p>
        <div className="grid-2" style={{ marginTop: '0.75rem' }}>
          <label className="muted">
            Ancho de papel
            <select className="select" style={{ marginTop: '0.35rem' }} value={configImpresion.ancho} onChange={(e) => setConfigImpresion({ ...configImpresion, ancho: e.target.value })}>
              {ANCHOS_PAPEL.map((a) => (
                <option key={a.id} value={a.id}>{a.label}</option>
              ))}
            </select>
          </label>
          <label className="muted">
            Impresora predeterminada
            <select className="select" style={{ marginTop: '0.35rem' }} value={configImpresion.impresoraId || ''} onChange={(e) => setConfigImpresion({ ...configImpresion, impresoraId: e.target.value || null })}>
              <option value="">Automática (conectada o primera)</option>
              {perifericos.filter((p) => p.tipo === 'impresora').map((p) => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
          </label>
          <label className="muted">
            Copias por documento
            <input type="number" min={1} max={5} className="input" style={{ marginTop: '0.35rem' }} value={configImpresion.copias} onChange={(e) => setConfigImpresion({ ...configImpresion, copias: Math.max(1, parseInt(e.target.value, 10) || 1) })} />
          </label>
        </div>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.65rem', cursor: 'pointer' }} className="muted">
          <input type="checkbox" checked={configImpresion.autoVenta} onChange={(e) => setConfigImpresion({ ...configImpresion, autoVenta: e.target.checked })} />
          Imprimir ticket automáticamente al cobrar
        </label>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', marginLeft: '1rem', cursor: 'pointer' }} className="muted">
          <input type="checkbox" checked={configImpresion.autoCorte} onChange={(e) => setConfigImpresion({ ...configImpresion, autoCorte: e.target.checked })} />
          Imprimir al guardar corte de caja
        </label>
        <div className="table-wrap" style={{ marginTop: '0.85rem' }}>
          <table className="data">
            <thead>
              <tr>
                <th>Documento</th>
                <th>Imprimir</th>
              </tr>
            </thead>
            <tbody>
              {TIPOS_DOCUMENTO_IMPRESION.map((d) => (
                <tr key={d.id}>
                  <td>{d.label}</td>
                  <td>
                    <button type="button" className={configImpresion.modos[d.id] !== false ? 'btn btn-success' : 'btn btn-ghost'} style={{ padding: '0.25rem 0.55rem', fontSize: '0.75rem' }} onClick={() => toggleDocImpresion(d.id)}>
                      {configImpresion.modos[d.id] !== false ? 'Sí' : 'No'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
          <button type="button" className="btn btn-gold" onClick={guardarImpresion}>Guardar impresión</button>
          <button type="button" className="btn btn-primary" onClick={probarImpresion}>Imprimir ticket de prueba</button>
        </div>
      </div>

      <div className="card" style={{ borderTop: '4px solid var(--brand-gold)' }}>
        <h3 style={{ margin: '0 0 0.5rem', color: 'var(--brand-blue)' }}>Carátula e interfaz</h3>
        <p className="muted" style={{ marginTop: 0, fontSize: '0.85rem' }}>
          Elige la apariencia del login y del menú principal. Se guarda en este navegador (cada equipo puede usar una distinta).
        </p>
        <SelectorTemaInterfaz />
      </div>

      <div className="card" style={{ borderTop: '4px solid var(--brand-red)' }}>
        <h3 style={{ margin: '0 0 0.5rem', color: 'var(--brand-blue)' }}>Marca, logo y ticket</h3>
        <p className="muted" style={{ marginTop: 0, fontSize: '0.85rem' }}>
          Colores del POS basados en Abarrotes Las 3B (rojo, naranja, azul, oliva). El logo se guarda en este navegador.
        </p>
        <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', marginTop: '1rem', alignItems: 'flex-start' }}>
          <div className="brand-logo-wrap" style={{ padding: '0.75rem', background: 'var(--surface)', borderRadius: '12px', minWidth: '140px' }}>
            <BrandLogo key={logoPreviewKey} alt="Vista previa" maxHeight={100} />
            <p className="muted" style={{ fontSize: '0.75rem', margin: '0.5rem 0 0', textAlign: 'center' }}>
              {logoEsPersonalizado() ? 'Logo personalizado' : 'Logo por defecto (3B)'}
            </p>
          </div>
          <div style={{ flex: '1 1 240px' }}>
            <label className="muted" style={{ display: 'block' }}>
              Subir imagen (PNG, JPG… máx. 2 MB)
              <input type="file" accept="image/*" className="input" style={{ marginTop: '0.35rem' }} onChange={guardarLogoDesdeArchivo} />
            </label>
            <label className="muted" style={{ display: 'block', marginTop: '0.75rem' }}>
              O URL del logo
              <input className="input" style={{ marginTop: '0.35rem' }} value={logoUrlCustom} onChange={(e) => setLogoUrlCustom(e.target.value)} placeholder="https://…" />
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
              <button type="button" className="btn btn-primary" onClick={guardarLogoDesdeUrl}>
                Aplicar URL
              </button>
              <button type="button" className="btn btn-ghost" onClick={usarLogoPorDefecto}>
                Restaurar logo 3B
              </button>
            </div>
          </div>
        </div>
        <label className="muted" style={{ display: 'block', marginTop: '1rem' }}>
          Nombre mostrado en login / cabecera
          <input className="input" style={{ marginTop: '0.35rem' }} value={negocio} onChange={(e) => setNegocio(e.target.value)} placeholder="ABARROTES LAS 3B" />
        </label>
        <label className="muted" style={{ display: 'block', marginTop: '0.75rem' }}>
          Pie de ticket (texto informativo)
          <input className="input" style={{ marginTop: '0.35rem' }} value={ticketFooter} onChange={(e) => setTicketFooter(e.target.value)} />
        </label>
        <button type="button" className="btn btn-gold" style={{ marginTop: '0.75rem' }} onClick={guardarLocal}>
          Guardar nombre y ticket
        </button>
        <p className="muted" style={{ fontSize: '0.78rem', marginTop: '0.5rem' }}>
          Logo por defecto: <code>{LOGO_DEFAULT}</code>
        </p>
      </div>

      <div className="card">
        <h3 style={{ margin: '0 0 0.5rem', color: 'var(--brand-blue)' }}>Integración</h3>
        <ul className="muted" style={{ margin: 0, paddingLeft: '1.1rem' }}>
          <li>
            Variables <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code> en archivo <code>.env</code> (no subir a GitHub).
          </li>
          <li>
            Opcional: <code>VITE_SUCURSAL_FIJA</code> (ej. <code>3B10</code>) fija una caja de venta. Si pones <code>MAIN</code>, el panel central sigue pudiendo elegir todas las sucursales.
          </li>
          <li>
            Ejecuta <code>supabase/fix_turnos.sql</code> para turnos en corte de caja (un corte por turno).
          </li>
          <li>
            Ejecuta <code>supabase/schema.sql</code> para tablas de clientes, proveedores y compras.
          </li>
        </ul>
      </div>
    </div>
  );
}
