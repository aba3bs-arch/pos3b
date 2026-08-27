import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AVISO_FALTA_CONTABILIDAD,
  aprobarPrestamoAdmin,
  aprobarPrestamoSocio,
  aprobarVale,
  aprobarMovimientoPrestamo,
  rechazarMovimientoPrestamo,
  solicitarMovimientoPrestamo,
  abonarPrestamo,
  descontarPrestamo,
  liquidarPrestamo,
  editarPrestamo,
  eliminarPrestamo,
  prestamoTieneSolicitudPendiente,
  cargarPrestamoEmpleadoACorte,
  cargarValeACorte,
  listarPrestamos,
  listarPrestamosInterarea,
  listarPrestamosSucursales,
  listarVales,
  rechazarPrestamo,
  cancelarVale,
  editarVale,
  abonarVale,
  liquidarVale,
  eliminarVale,
  abonarPrestamoSucursal,
  registrarPrestamo,
  registrarPrestamoInterarea,
  abonarPrestamoInterarea,
  liquidarPrestamoInterarea,
  editarPrestamoInterarea,
  ajustarCantidadPrestamoInterarea,
  recolectarPrestamoInterarea,
  eliminarPrestamoInterarea,
  puedeRecolectarPrestamoInterareaRc,
  puedeAbonarLiquidarPrestamoAreaSucursal,
  registrarPrestamoSucursal,
  registrarEnvioMainATienda,
  registrarVale,
} from '../lib/valesPrestamos.js';
import {
  AREAS_CONTABILIDAD,
  BENEFICIARIOS_VALES,
  CUOTA_SEMANAL_MINIMA,
  ETIQUETA_AREA,
  EVENTO_HORA_LIMITE_VALE,
  MONTO_PRESTAMO_REQUIERE_SOCIO,
  beneficiarioValePorId,
  esSocioAprobadorPrestamo,
  etiquetaCategoriaVale,
  etiquetaColectaPrestamo,
  etiquetaEstadoPrestamo,
  etiquetaEstadoVale,
  etiquetaHoraLimiteVale,
  listarCategoriasVale,
  prestamoInterareaEstaAbierto,
  prestamoInterareaPendienteRc,
  prestamoInterareaPuedeOperarHastaRc,
  prestamoInterareaPuedeRecolectarRc,
  prestamoOmiteCorte,
  prestamoPuedeImprimir,
  valePuedeImprimir,
  valePuedeCancelar,
  valeRequiereAutorizacionAdmin,
} from '../lib/contabilidadConstants.js';
import {
  AVISO_FALTA_VALES_CATEGORIAS,
  EVENTO_VALES_CATEGORIAS,
  crearCategoriaValePermanente,
  desactivarCategoriaValePermanente,
  leerCategoriasValeExtra,
  sincronizarCategoriasValeDesdeNube,
} from '../lib/valesCategorias.js';
import { listarNotificacionesPendientes, TIPOS_NOTIF } from '../lib/contabilidadNotificaciones.js';
import { imprimirPrestamo, imprimirPrestamoInterarea, imprimirPrestamoSucursal, imprimirRif, imprimirVale, imprimirPagare } from '../lib/impresionContabilidad.js';
import {
  AVISO_FALTA_PAGARES,
  ETIQUETA_AREA_PAGARE,
  abonarPagare,
  liquidarPagare,
  listarPagares,
  pagareEstaAbierto,
  puedeAbonarLiquidarPagare,
  puedeGenerarPagare,
  registrarPagare,
  saldoPagare,
  textoPagare,
} from '../lib/pagares.js';
import {
  AVISO_FALTA_RIFS,
  abonarRif,
  cancelarRif,
  editarRif,
  eliminarRif,
  etiquetaEstadoRif,
  liquidarRif,
  listarRifs,
  procesarRifsVencidos,
  registrarRif,
  rifPuedeAbonar,
  rifPuedeCancelar,
  rifPuedeImprimir,
  rifPuedeLiquidar,
} from '../lib/rifs.js';
import { normalizarRol } from '../lib/roles.js';
import { esUsuarioCubreTurno } from '../lib/cubreTurno.js';
import {
  agruparEmpleadosParaSelectPrestamo,
  empleadosParaPrestamosEmpleado,
  empleadosVisiblesParaTienda,
  prestamoEmpleadoOmiteCorte,
} from '../lib/empleadosVisibles.js';
import { tiendaPuedeGenerarVales } from '../lib/posConfig.js';
import { etiquetaTienda, listarSucursalesOperativas } from '../constants/sucursales.js';
import PanelAsistenciaGasolina from '../components/PanelAsistenciaGasolina.jsx';
import SelectorCalendario from '../components/SelectorCalendario.jsx';
import InputPin from '../components/InputPin.jsx';
import { asegurarCamposSinReservadoOPin } from '../lib/reservadoAdminPrincipal.js';

function fmt(n) {
  return `$${(Number(n) || 0).toFixed(2)}`;
}

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function ValesPrestamos({ supabase, sucursal, user, irAPendientes, onPendientesVisto, navOpts, onNavOptsVisto, retornoModulo, onRegresarCorte }) {
  const [pestana, setPestana] = useState('vales');
  const [aviso, setAviso] = useState('');
  const [vales, setVales] = useState([]);
  const [prestamosArea, setPrestamosArea] = useState([]);
  const [prestamosSuc, setPrestamosSuc] = useState([]);
  const [prestamosEmp, setPrestamosEmp] = useState([]);
  const [rifs, setRifs] = useState([]);
  const [pagares, setPagares] = useState([]);
  const [empleados, setEmpleados] = useState([]);
  const [empleadosPrestamo, setEmpleadosPrestamo] = useState([]);
  const [notifs, setNotifs] = useState([]);
  const [pinSocio, setPinSocio] = useState('');
  const [rifForm, setRifForm] = useState({
    sucursal_destino: '',
    responsable_nombre: '',
    monto: '',
    motivo: '',
    fecha_promesa: hoyISO(),
    hora_promesa: '18:00',
  });

  const [valeForm, setValeForm] = useState({
    beneficiarioId: '',
    categoria: 'consumo',
    monto: '',
    motivo: '',
    fecha: hoyISO(),
  });
  const [prestForm, setPrestForm] = useState({
    origen: 'virtual',
    gastos_area: 'abarrotes',
    monto: '',
    notas: '',
    fecha: hoyISO(),
  });
  const [prestSucForm, setPrestSucForm] = useState({
    destino: '',
    monto: '',
    notas: '',
    fecha: hoyISO(),
    areaCorte: 'abarrotes',
  });
  const [prestEmpForm, setPrestEmpForm] = useState({
    usuarioId: '',
    monto: '',
    notas: '',
    fecha: hoyISO(),
    areaCorte: 'virtual',
  });
  const [editPrestamo, setEditPrestamo] = useState(null);
  const [editForm, setEditForm] = useState({
    area_corte: 'virtual',
    cuota_semanal: '',
    notas: '',
    monto_original: '',
  });
  const [categoriasTick, setCategoriasTick] = useState(0);
  const [nuevoTipoVale, setNuevoTipoVale] = useState({ label: '', descuentaNomina: false });
  const [valesPendAll, setValesPendAll] = useState([]);
  const [prestamosPendAll, setPrestamosPendAll] = useState([]);
  const [horaLimiteVale, setHoraLimiteVale] = useState(() => etiquetaHoraLimiteVale());
  const [pagareForm, setPagareForm] = useState({
    area: 'virtual',
    monto: '',
    cajero_nombre: '',
    turno_nombre: '',
  });

  const rolNorm = normalizarRol(user?.rol);
  const esAdmin = rolNorm === 'Administrador';
  const esGerente = rolNorm === 'Gerente';
  const esRepartidor = rolNorm === 'Repartidor';
  const esMain = String(sucursal || '').toUpperCase() === 'MAIN';
  const puedeGenerarVales = tiendaPuedeGenerarVales(sucursal);
  const esSocio = esSocioAprobadorPrestamo(user?.nombre);
  /** Admin/gerente aprueban vales; socio solo préstamos >$1,000. */
  const puedeAprobarVales = esAdmin || esGerente;
  /** Abonar / liquidar / editar vales, RIF y préstamos a empleado. */
  const puedeOperarDocs = Boolean(user);
  /** Editar / ajustar / eliminar / crear préstamos área: solo admin o gerente. */
  const puedeOperarPrestamosAreaSuc = esAdmin || esGerente;
  /** Abonar / liquidar préstamos área/sucursal: admin, gerente o cajero. */
  const puedeAbonarLiquidarPrestamosArea = puedeAbonarLiquidarPrestamoAreaSucursal(user?.rol, user)
    && !esUsuarioCubreTurno(user);
  const puedeAbonarLiquidarPagaresUi = puedeAbonarLiquidarPagare(user?.rol, user)
    && !esUsuarioCubreTurno(user);
  /** Recolectar préstamo área → RC Virtual: admin, gerente o repartidor. */
  const puedeRecolectarPrestamoArea = puedeRecolectarPrestamoInterareaRc(user?.rol);
  /** Eliminar RIF/préstamos: admin o gerente (corte abierto validado en lib). */
  const puedeEliminarDocs = esAdmin || esGerente;
  /** Vales: cajero también puede eliminar si se equivoca (corte abierto validado en lib). */
  const puedeEliminarVales = Boolean(user);
  const puedeVerBandejaAprobacion = puedeAprobarVales || esSocio;
  const vePendientesTodasTiendas = puedeAprobarVales;
  const requiereAuthAhora = valeRequiereAutorizacionAdmin(new Date(), valeForm.categoria);
  const valeFormRequiereAdmin = valeRequiereAutorizacionAdmin(new Date(), valeForm.categoria);

  const categoriasValeDisponibles = useMemo(() => listarCategoriasVale(), [categoriasTick]);
  const categoriasExtra = useMemo(() => leerCategoriasValeExtra().filter((c) => c.activo !== false), [categoriasTick]);
  const beneficiarioSel = beneficiarioValePorId(valeForm.beneficiarioId);
  const areaCorteVale = beneficiarioSel?.area || null;
  const empPrestamoSel = useMemo(
    () => empleadosPrestamo.find((e) => String(e.id) === String(prestEmpForm.usuarioId)) || null,
    [empleadosPrestamo, prestEmpForm.usuarioId],
  );
  const prestamoSelOmiteCorte = prestamoEmpleadoOmiteCorte(empPrestamoSel);
  const empleadosPrestamoGrupos = useMemo(
    () => agruparEmpleadosParaSelectPrestamo(empleadosPrestamo),
    [empleadosPrestamo],
  );

  const valesPendientes = useMemo(() => {
    const fuente = vePendientesTodasTiendas ? valesPendAll : vales;
    return (fuente || []).filter((v) => v.estado_aprobacion === 'pendiente_admin');
  }, [vales, valesPendAll, vePendientesTodasTiendas]);
  const prestamosPendientesAdmin = useMemo(() => {
    const fuente = vePendientesTodasTiendas ? prestamosPendAll : prestamosEmp;
    return (fuente || []).filter((p) => p.estado === 'pendiente_admin');
  }, [prestamosEmp, prestamosPendAll, vePendientesTodasTiendas]);
  const prestamosMovPendientes = useMemo(() => {
    const fuente = vePendientesTodasTiendas ? prestamosPendAll : prestamosEmp;
    return (fuente || []).filter((p) => p.estado === 'activo' && prestamoTieneSolicitudPendiente(p));
  }, [prestamosEmp, prestamosPendAll, vePendientesTodasTiendas]);
  const prestamosPendientesSocio = useMemo(() => {
    const fuente = esSocio ? (prestamosPendAll.length ? prestamosPendAll : prestamosEmp) : prestamosEmp;
    return (fuente || []).filter((p) => p.estado === 'pendiente_socio');
  }, [prestamosEmp, prestamosPendAll, esSocio]);
  const notifsBandeja = useMemo(() => {
    const esValeOPrestamo = (n) =>
      n.tipo === TIPOS_NOTIF.VALE_PENDIENTE ||
      n.tipo === TIPOS_NOTIF.PRESTAMO_ADMIN ||
      n.tipo === TIPOS_NOTIF.PRESTAMO_SOCIO;
    if (puedeAprobarVales) return notifs.filter(esValeOPrestamo);
    if (esSocio) return notifs.filter((n) => n.tipo === TIPOS_NOTIF.PRESTAMO_SOCIO);
    return [];
  }, [notifs, puedeAprobarVales, esSocio]);
  const sucursalesDestino = useMemo(
    () => listarSucursalesOperativas().filter((s) => s !== String(sucursal || '').toUpperCase()),
    [sucursal],
  );
  const prestamosSucPendientesCobro = useMemo(
    () => prestamosSuc.filter((p) => p.estado === 'pendiente_cobro' && p.sucursal_origen === String(sucursal || '').toUpperCase()),
    [prestamosSuc, sucursal],
  );

  const recargarTodo = useCallback(async () => {
    if (!supabase) return;
    // Vencer RIF cuya hora promesa ya pasó (carga gasto a corte abarrotes).
    try {
      await procesarRifsVencidos(supabase, { usuarioNombre: user?.nombre || 'sistema' });
    } catch {
      /* ignore */
    }
    // Admin/gerente: ver préstamos de todas las tiendas en la tabla (antes solo salían en Pendientes).
    const [vRes, paRes, psRes, peRes, nRes, vPendRes, pePendRes, rifRes, pagRes] = await Promise.all([
      listarVales(supabase, { sucursal, tipo: 'indirecto' }),
      listarPrestamosInterarea(supabase, { sucursal }),
      listarPrestamosSucursales(supabase, { sucursal }),
      listarPrestamos(supabase, {
        sucursal: vePendientesTodasTiendas ? undefined : sucursal,
        incluirHistorial: true,
        limit: vePendientesTodasTiendas ? 250 : 200,
      }),
      listarNotificacionesPendientes(supabase, {
        sucursal: vePendientesTodasTiendas || esSocio ? undefined : sucursal,
        todasTiendas: vePendientesTodasTiendas || esSocio,
        limit: 150,
      }),
      vePendientesTodasTiendas
        ? listarVales(supabase, { tipo: 'indirecto', estadoAprobacion: 'pendiente_admin', limit: 150 })
        : Promise.resolve({ data: [] }),
      vePendientesTodasTiendas || esSocio
        ? listarPrestamos(supabase, { incluirHistorial: true, limit: 250 })
        : Promise.resolve({ data: [] }),
      listarRifs(supabase, { sucursal, todasTiendas: vePendientesTodasTiendas, limit: 150 }),
      listarPagares(supabase, {
        sucursal: vePendientesTodasTiendas ? undefined : sucursal,
        limit: 200,
      }),
    ]);
    if (vRes.aviso) setAviso(vRes.aviso);
    else if (rifRes.aviso) setAviso(rifRes.aviso);
    else if (pagRes.faltaTabla) setAviso(AVISO_FALTA_PAGARES);
    else if (psRes.aviso) setAviso(psRes.aviso);
    else if (peRes.aviso) setAviso(peRes.aviso);
    else if (peRes.error) setAviso(peRes.error);
    else if (vRes.error) setAviso(vRes.error);
    else setAviso('');
    setVales(vRes.data || []);
    setPrestamosArea(paRes.data || []);
    setPrestamosSuc(psRes.data || []);
    setPrestamosEmp(peRes.data || []);
    setRifs(rifRes.data || []);
    setPagares(pagRes.data || []);
    setNotifs(nRes.data || []);
    setValesPendAll(vPendRes.data || []);
    setPrestamosPendAll(pePendRes.data || []);
  }, [supabase, sucursal, vePendientesTodasTiendas, esSocio, user?.nombre]);

  useEffect(() => {
    recargarTodo();
    if (!supabase) return undefined;
    sincronizarCategoriasValeDesdeNube(supabase).then((r) => {
      if (r.aviso) setAviso((prev) => prev || r.aviso);
      if (r.cambio) setCategoriasTick((n) => n + 1);
    });
    import('../lib/horaLimiteValeSync.js').then(({ sincronizarHoraLimiteValeDesdeNube }) => {
      sincronizarHoraLimiteValeDesdeNube(supabase).then((r) => {
        if (r.cambio) setHoraLimiteVale(etiquetaHoraLimiteVale());
        if (r.aviso) setAviso((prev) => prev || r.aviso);
      });
    });
    supabase
      .from('usuarios')
      .select('id, nombre, rol, sucursal_id, tipo_empleado, activo')
      .order('nombre')
      .then(({ data }) => {
        const raw = data || [];
        setEmpleados(empleadosVisiblesParaTienda(raw, sucursal, user?.rol));
        setEmpleadosPrestamo(empleadosParaPrestamosEmpleado(raw, sucursal, user?.rol));
      });
    return undefined;
  }, [recargarTodo, supabase, sucursal, user?.rol]);

  useEffect(() => {
    const onCat = () => setCategoriasTick((n) => n + 1);
    window.addEventListener(EVENTO_VALES_CATEGORIAS, onCat);
    return () => window.removeEventListener(EVENTO_VALES_CATEGORIAS, onCat);
  }, []);

  useEffect(() => {
    const onHora = () => setHoraLimiteVale(etiquetaHoraLimiteVale());
    window.addEventListener(EVENTO_HORA_LIMITE_VALE, onHora);
    return () => window.removeEventListener(EVENTO_HORA_LIMITE_VALE, onHora);
  }, []);

  useEffect(() => {
    if (esRepartidor) setPestana('pagare');
  }, [esRepartidor]);

  useEffect(() => {
    if (irAPendientes && puedeVerBandejaAprobacion) {
      setPestana('pendientes');
      onPendientesVisto?.();
    }
  }, [irAPendientes, puedeVerBandejaAprobacion, onPendientesVisto]);

  useEffect(() => {
    if (pestana !== 'pendientes') return;
    const el = document.getElementById('bandeja-aprobaciones-vales');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [pestana]);

  useEffect(() => {
    if (!navOpts) return;
    if (navOpts.pestana) setPestana(navOpts.pestana);
    if (navOpts.retorno === 'Corte Virtual') {
      setPrestForm((prev) => ({ ...prev, origen: 'virtual', gastos_area: prev.gastos_area === 'virtual' ? 'abarrotes' : prev.gastos_area }));
    }
    onNavOptsVisto?.();
  }, [navOpts, onNavOptsVisto]);

  const guardarVale = async () => {
    if (!supabase) return alert('Sin conexión.');
    if (!puedeGenerarVales) return alert('Esta tienda no puede generar vales. El administrador debe autorizarla en Configuración → Vales y préstamos.');
    const ben = beneficiarioValePorId(valeForm.beneficiarioId);
    if (!ben) return alert('Selecciona beneficiario.');
    const monto = Number(valeForm.monto);
    if (!(monto > 0)) return alert('Monto inválido.');
    const authTxt = await asegurarCamposSinReservadoOPin(
      supabase,
      [valeForm.motivo, valeForm.categoria],
      { user, sucursal },
    );
    if (!authTxt.ok) return alert(authTxt.error);
    const res = await registrarVale(
      supabase,
      {
        sucursal_id: sucursal || 'MAIN',
        usuario_id: null,
        nombre_empleado: ben.nombre,
        tipo: 'indirecto',
        area: ben.area,
        categoria: valeForm.categoria,
        monto,
        motivo: valeForm.motivo.trim() || null,
        fecha: valeForm.fecha || hoyISO(),
        created_by: user?.nombre || null,
      },
      { rolActor: user?.rol, nombreActor: user?.nombre },
    );
    if (!res.ok) {
      if (String(res.error).includes('fix_contabilidad')) setAviso(res.error);
      return alert(res.error);
    }
    alert(res.mensaje || 'Vale registrado.');
    if (!res.pendiente && res.requiereFirma && confirm('¿Imprimir vale para firma del beneficiario?')) {
      imprimirVale(res.vale, { mostrarFirma: true });
    }
    setValeForm({ beneficiarioId: '', categoria: 'consumo', monto: '', motivo: '', fecha: hoyISO() });
    recargarTodo();
  };

  const guardarPrestamoEmpleado = async () => {
    if (!supabase) return alert('Sin conexión.');
    const emp = empleadosPrestamo.find((e) => String(e.id) === String(prestEmpForm.usuarioId));
    if (!emp) return alert(esMain ? 'Selecciona un empleado o usuario MAIN.' : 'Selecciona un empleado de esta tienda.');
    const omitirCorte = prestamoEmpleadoOmiteCorte(emp);
    if (omitirCorte && !esMain) {
      return alert('Los usuarios MAIN solo pueden recibir préstamo desde MAIN.');
    }
    if (omitirCorte && !esAdmin) {
      return alert('Los préstamos a usuarios MAIN solo los registra el administrador.');
    }
    const monto = Number(prestEmpForm.monto);
    if (!(monto > 0)) return alert('Monto inválido.');
    if (!omitirCorte && !prestEmpForm.areaCorte) {
      return alert('Selecciona el área de corte (Virtual, Abarrotes o Garage).');
    }
    const authTxt = await asegurarCamposSinReservadoOPin(supabase, [prestEmpForm.notas], { user, sucursal });
    if (!authTxt.ok) return alert(authTxt.error);
    const res = await registrarPrestamo(
      supabase,
      {
        sucursal_id: sucursal || 'MAIN',
        usuario_id: emp.id,
        nombre_empleado: emp.nombre,
        monto_original: monto,
        fecha: prestEmpForm.fecha || hoyISO(),
        notas: prestEmpForm.notas.trim() || null,
        created_by: user?.nombre || null,
        area_corte: omitirCorte ? null : prestEmpForm.areaCorte,
        omitir_corte: omitirCorte,
      },
      {
        rolActor: user?.rol,
        nombreActor: user?.nombre,
        areaCorte: omitirCorte ? null : prestEmpForm.areaCorte,
        omitirCorte,
      },
    );
    if (!res.ok) return alert(res.error);
    alert(res.mensaje);
    if (!res.pendiente && !res.pendienteSocio && res.prestamo && confirm('¿Imprimir recibo de préstamo?')) {
      imprimirPrestamo(res.prestamo);
    }
    setPrestEmpForm({
      usuarioId: '',
      monto: '',
      notas: '',
      fecha: hoyISO(),
      areaCorte: prestEmpForm.areaCorte,
    });
    recargarTodo();
  };

  const crearTipoVale = async () => {
    if (!esAdmin) return alert('Solo el administrador puede crear tipos de vale.');
    const authTxt = await asegurarCamposSinReservadoOPin(supabase, [nuevoTipoVale.label], { user, sucursal });
    if (!authTxt.ok) return alert(authTxt.error);
    const res = await crearCategoriaValePermanente(supabase, {
      label: nuevoTipoVale.label,
      descuentaNomina: nuevoTipoVale.descuentaNomina,
      createdBy: user?.nombre,
    });
    if (!res.ok) return alert(res.error);
    if (res.aviso) setAviso(res.aviso);
    setNuevoTipoVale({ label: '', descuentaNomina: false });
    setCategoriasTick((n) => n + 1);
    alert(`Tipo de vale «${res.categoria.label}» creado. Ya está disponible en todas las sucursales.`);
  };

  const quitarTipoVale = async (id) => {
    if (!esAdmin) return;
    if (!confirm('¿Quitar este tipo de vale? Las sucursales ya no podrán usarlo en vales nuevos.')) return;
    const res = await desactivarCategoriaValePermanente(supabase, id);
    if (!res.ok) return alert(res.error);
    setCategoriasTick((n) => n + 1);
  };

  const guardarPrestamoGastos = async () => {
    if (!supabase) return alert('Sin conexión.');
    if (prestForm.origen === prestForm.gastos_area) return alert('Origen (presta) y Destino (recibe) deben ser áreas distintas.');
    const monto = Number(prestForm.monto);
    if (!(monto > 0)) return alert('Monto inválido.');
    const notas = prestForm.notas.trim() || `Pago gastos ${ETIQUETA_AREA[prestForm.gastos_area]}`;
    const authTxt = await asegurarCamposSinReservadoOPin(supabase, [notas], { user, sucursal });
    if (!authTxt.ok) return alert(authTxt.error);
    const res = await registrarPrestamoInterarea(supabase, {
      sucursal_id: sucursal || 'MAIN',
      origen: prestForm.origen,
      destino: prestForm.gastos_area,
      monto,
      fecha: prestForm.fecha || hoyISO(),
      notas,
      created_by: user?.nombre || null,
    });
    if (!res.ok) return alert(res.error);
    try {
      imprimirPrestamoInterarea(res.prestamo);
    } catch {
      /* impresión no bloquea */
    }
    alert(res.mensaje || 'Préstamo área registrado (ticket generado). No afecta el corte.');
    setPrestForm((prev) => ({ ...prev, monto: '', notas: '' }));
    recargarTodo();
  };

  const guardarPrestamoSucursal = async () => {
    if (!supabase) return alert('Sin conexión.');
    if (!prestSucForm.destino) return alert('Selecciona la sucursal destino.');
    const monto = Number(prestSucForm.monto);
    if (!(monto > 0)) return alert('Monto inválido.');
    const origen = String(sucursal || '').toUpperCase();

    if (origen === 'MAIN') {
      if (!esAdmin && !esGerente) return alert('Solo admin o gerente pueden generar vales desde MAIN.');
      const res = await registrarEnvioMainATienda(
        supabase,
        {
          sucursal_destino: prestSucForm.destino,
          monto,
          fecha: prestSucForm.fecha || hoyISO(),
          notas: prestSucForm.notas.trim() || null,
          area_corte: prestSucForm.areaCorte || 'abarrotes',
          created_by: user?.nombre || null,
        },
        { nombreActor: user?.nombre, rolActor: user?.rol },
      );
      if (!res.ok) return alert(res.error);
      alert(res.mensaje);
      setPrestSucForm({ destino: '', monto: '', notas: '', fecha: hoyISO(), areaCorte: 'abarrotes' });
      recargarTodo();
      return;
    }

    if (!origen) return alert('Sucursal de origen inválida.');
    const res = await registrarPrestamoSucursal(supabase, {
      sucursal_origen: origen,
      sucursal_destino: prestSucForm.destino,
      monto,
      fecha: prestSucForm.fecha || hoyISO(),
      notas: prestSucForm.notas.trim() || null,
      created_by: user?.nombre || null,
      area_corte: prestSucForm.areaCorte || 'abarrotes',
    });
    if (!res.ok) return alert(res.error);
    try {
      imprimirPrestamoSucursal(res.prestamo);
    } catch {
      /* impresión no bloquea */
    }
    alert(res.mensaje || `Préstamo a ${etiquetaTienda(prestSucForm.destino)} registrado (sin cargo a corte).`);
    setPrestSucForm({ destino: '', monto: '', notas: '', fecha: hoyISO(), areaCorte: 'abarrotes' });
    recargarTodo();
  };

  const cobrarPrestamoSucursal = async (p, liquidar = false) => {
    if (!puedeAbonarLiquidarPrestamosArea) return alert('Solo administrador, gerente o cajero pueden abonar o liquidar.');
    if (!supabase) return;
    if (p.sucursal_origen !== String(sucursal || '').toUpperCase()) {
      return alert(`El cobro solo se registra en ${etiquetaTienda(p.sucursal_origen)}.`);
    }
    const saldo = Number(p.saldo) || 0;
    let monto = saldo;
    if (!liquidar) {
      const raw = prompt(`Abono a cobrar (saldo ${fmt(saldo)}):`, String(saldo));
      if (raw == null) return;
      monto = Number(raw);
    } else if (!confirm(`¿Registrar cobro total de ${fmt(saldo)} en ${etiquetaTienda(p.sucursal_origen)}?`)) {
      return;
    }
    const res = await abonarPrestamoSucursal(supabase, p, monto, { nombreActor: user?.nombre, rolActor: user?.rol });
    if (!res.ok) return alert(res.error);
    if (res.saldo <= 0) {
      try {
        imprimirPrestamoSucursal(res.prestamo || { ...p, saldo: 0, estado: 'liquidado' });
      } catch {
        /* impresión no bloquea */
      }
      alert('Préstamo liquidado.');
    } else {
      alert(`Abono registrado. Saldo: ${fmt(res.saldo)}`);
    }
    recargarTodo();
  };

  const aprobarV = async (id) => {
    const res = await aprobarVale(supabase, id, { nombreAprobador: user?.nombre, cargarCorte: true });
    if (!res.ok) return alert(res.error);
    alert('Vale aprobado y cargado al corte.');
    if (confirm('¿Imprimir vale?')) imprimirVale(res.vale, { mostrarFirma: true });
    recargarTodo();
  };

  const aprobarPAdmin = async (id) => {
    const p = prestamosEmp.find((x) => x.id === id) || prestamosPendAll.find((x) => x.id === id);
    const omitir = prestamoOmiteCorte(p);
    const res = await aprobarPrestamoAdmin(supabase, id, {
      nombreAprobador: user?.nombre,
      cargarCorte: !omitir,
      areaCorte: omitir ? null : (p?.area_corte || prestEmpForm.areaCorte),
    });
    if (!res.ok) return alert(res.error);
    alert(res.mensaje);
    if (!res.pendienteSocio && res.prestamo && confirm('¿Imprimir recibo de préstamo?')) imprimirPrestamo(res.prestamo);
    recargarTodo();
  };

  const aprobarPSocio = async (id) => {
    if (!pinSocio.trim()) return alert('Ingresa tu PIN (Antonio, Francisco o José Luis).');
    const p = prestamosEmp.find((x) => x.id === id) || prestamosPendAll.find((x) => x.id === id);
    const omitir = prestamoOmiteCorte(p);
    const res = await aprobarPrestamoSocio(supabase, id, {
      pin: pinSocio.trim(),
      sucursal,
      cargarCorte: !omitir,
      areaCorte: omitir ? null : (p?.area_corte || prestEmpForm.areaCorte),
    });
    if (!res.ok) return alert(res.error);
    setPinSocio('');
    alert(res.mensaje);
    if (confirm('¿Imprimir recibo?')) imprimirPrestamo(res.prestamo);
    recargarTodo();
  };

  const imprimirValeSi = (v) => {
    if (!valePuedeImprimir(v)) return alert('El vale aún no está aprobado.');
    imprimirVale(v, { mostrarFirma: true });
  };

  const imprimirPrestamoSi = (p) => {
    if (!prestamoPuedeImprimir(p)) return alert('El préstamo aún no está aprobado.');
    imprimirPrestamo(p, { mostrarFirma: true });
  };

  const cargarValeManual = async (v) => {
    const res = await cargarValeACorte(supabase, v);
    if (!res.ok) return alert(res.error);
    alert(
      res.yaCargado
        ? 'Ya estaba en corte.'
        : `Vale cargado al corte de ${ETIQUETA_AREA[res.modulo] || res.modulo || v.area}.`,
    );
    recargarTodo();
  };

  const cargarPrestamoManual = async (p) => {
    if (prestamoOmiteCorte(p)) {
      return alert('Este préstamo es de usuario MAIN: solo nómina, no se carga a corte.');
    }
    const res = await cargarPrestamoEmpleadoACorte(supabase, p, p.area_corte || prestEmpForm.areaCorte);
    if (!res.ok) return alert(res.error);
    alert(res.yaCargado ? 'Ya estaba en corte.' : `Préstamo cargado al corte de ${ETIQUETA_AREA[res.modulo] || res.modulo}.`);
    recargarTodo();
  };

  const guardarRif = async () => {
    const authTxt = await asegurarCamposSinReservadoOPin(
      supabase,
      [rifForm.motivo, rifForm.responsable_nombre],
      { user, sucursal },
    );
    if (!authTxt.ok) return alert(authTxt.error);
    const horaIso = `${rifForm.fecha_promesa}T${rifForm.hora_promesa || '18:00'}:00`;
    const res = await registrarRif(
      supabase,
      {
        sucursal_origen: sucursal,
        sucursal_destino: rifForm.sucursal_destino,
        responsable_nombre: rifForm.responsable_nombre,
        monto: rifForm.monto,
        motivo: rifForm.motivo,
        hora_promesa: horaIso,
      },
      { usuarioNombre: user?.nombre, usuarioId: user?.id },
    );
    if (!res.ok) return alert(res.error || AVISO_FALTA_RIFS);
    setRifForm({
      sucursal_destino: '',
      responsable_nombre: '',
      monto: '',
      motivo: '',
      fecha_promesa: hoyISO(),
      hora_promesa: '18:00',
    });
    if (confirm('RIF registrado. ¿Imprimir ticket con firma del responsable?')) {
      imprimirRif(res.rif, { mostrarFirma: true });
    }
    recargarTodo();
  };

  const liquidarR = async (rif) => {
    if (!confirm(`¿Liquidar ${rif.folio}? Solo la tienda origen / cajero emisor.`)) return;
    const res = await liquidarRif(supabase, rif.id, { usuarioNombre: user?.nombre });
    if (!res.ok) return alert(res.error);
    alert('RIF liquidado.');
    if (confirm('¿Imprimir RIF liquidado?')) {
      imprimirRif(res.rif, { mostrarFirma: true });
    }
    recargarTodo();
  };

  const cancelarR = async (rif) => {
    if (!confirm(`¿Cancelar ${rif.folio}? Si ya estaba en corte, se quita el gasto del turno abierto.`)) return;
    const res = await cancelarRif(supabase, rif.id, { usuarioNombre: user?.nombre });
    if (!res.ok) return alert(res.error);
    recargarTodo();
  };

  const cancelarV = async (v) => {
    if (!esAdmin) return alert('Solo el administrador puede cancelar vales.');
    if (!valePuedeCancelar(v)) return alert('Este vale ya no se puede cancelar.');
    const motivo = prompt(`¿Cancelar vale ${v.folio}?\nMotivo (opcional):`);
    if (motivo === null) return;
    const res = await cancelarVale(supabase, v.id, { nombre: user?.nombre, motivo: motivo.trim() || null });
    if (!res.ok) return alert(res.error);
    alert('Vale cancelado.');
    recargarTodo();
  };

  const pedirMovimientoPrestamo = async (p, tipo) => {
    if (p.estado !== 'activo') return alert('Solo en préstamos activos.');
    if (prestamoTieneSolicitudPendiente(p)) {
      return alert(`Ya hay solicitud pendiente de ${p.solicitud_tipo}. El admin debe aprobarla o rechazarla.`);
    }
    const saldo = Number(p.saldo) || 0;
    if (!(saldo > 0)) return alert('Sin saldo.');
    let monto = saldo;
    if (tipo === 'abono' || tipo === 'descuento') {
      const raw = prompt(
        `${tipo === 'abono' ? 'Abono' : 'Descuento'} a ${p.nombre_empleado}\nSaldo: $${saldo.toFixed(2)}\n\nMonto:`,
        tipo === 'abono' ? String(Math.min(saldo, CUOTA_SEMANAL_MINIMA)) : String(saldo),
      );
      if (raw === null) return;
      monto = parseFloat(String(raw).replace(',', '.'));
      if (!(monto > 0) || monto > saldo + 0.001) return alert('Monto inválido.');
    } else if (!confirm(`¿Liquidar a ${p.nombre_empleado} por $${saldo.toFixed(2)}?`)) {
      return;
    }

    // Admin/gerente (y operadores): aplican directo. Descuento sigue solo admin.
    const aplicaDirecto = esAdmin || esGerente || (tipo !== 'descuento' && puedeOperarDocs);
    if (aplicaDirecto && (tipo !== 'descuento' || esAdmin)) {
      let r;
      if (tipo === 'descuento') r = await descontarPrestamo(supabase, p, monto);
      else if (tipo === 'liquidacion') r = await liquidarPrestamo(supabase, p);
      else r = await abonarPrestamo(supabase, p, monto);
      if (!r.ok) return alert(r.error);
      alert(`${tipo} aplicado${r.liquidado ? ' · préstamo liquidado' : ''}. Saldo: $${(r.saldo ?? 0).toFixed(2)}`);
      if (confirm('¿Imprimir recibo actualizado?')) {
        const { data } = await supabase.from('prestamos').select('*').eq('id', p.id).maybeSingle();
        if (data) imprimirPrestamo(data);
      }
      recargarTodo();
      return;
    }

    const res = await solicitarMovimientoPrestamo(supabase, p, {
      tipo,
      monto,
      nombre: user?.nombre,
    });
    if (!res.ok) return alert(res.error);
    alert(res.mensaje);
    recargarTodo();
  };

  const abrirEditarPrestamo = (p) => {
    if (!puedeOperarDocs) return alert('Sin permiso.');
    setEditPrestamo(p);
    setEditForm({
      area_corte: p.area_corte || 'virtual',
      cuota_semanal: p.cuota_semanal != null ? String(p.cuota_semanal) : '',
      notas: p.notas || '',
      monto_original: String(p.monto_original ?? ''),
    });
  };

  const aprobarMovPrestamo = async (p) => {
    if (!esAdmin && !puedeAprobarVales) return alert('Solo administrador o gerente.');
    const res = await aprobarMovimientoPrestamo(supabase, p, { nombre: user?.nombre });
    if (!res.ok) return alert(res.error);
    alert(res.mensaje);
    recargarTodo();
  };

  const rechazarMovPrestamo = async (p) => {
    if (!esAdmin && !puedeAprobarVales) return alert('Solo administrador o gerente.');
    const motivo = prompt('Motivo del rechazo (opcional):');
    if (motivo === null) return;
    const res = await rechazarMovimientoPrestamo(supabase, p, { nombre: user?.nombre, motivo: motivo.trim() });
    if (!res.ok) return alert(res.error);
    alert(res.mensaje);
    recargarTodo();
  };

  const guardarEdicionPrestamo = async () => {
    if (!editPrestamo) return;
    const authTxt = await asegurarCamposSinReservadoOPin(supabase, [editForm.notas], {
      user,
      sucursal,
    });
    if (!authTxt.ok) return alert(authTxt.error);
    const res = await editarPrestamo(
      supabase,
      editPrestamo,
      {
        area_corte: prestamoOmiteCorte(editPrestamo) ? undefined : editForm.area_corte,
        cuota_semanal: editForm.cuota_semanal,
        notas: editForm.notas,
        monto_original: editForm.monto_original,
      },
      { nombre: user?.nombre },
    );
    if (!res.ok) return alert(res.error);
    alert(res.mensaje);
    setEditPrestamo(null);
    recargarTodo();
  };

  const eliminarPrestamoEmp = async (p) => {
    if (!puedeEliminarDocs) return alert('Solo administrador o gerente pueden eliminar.');
    if (!confirm(`¿Eliminar préstamo de ${p.nombre_empleado}? Solo procede si el corte está abierto.`)) return;
    let motivo = null;
    const raw = prompt('Motivo (opcional):');
    if (raw === null) return;
    motivo = raw.trim() || null;
    const res = await eliminarPrestamo(supabase, p, { nombre: user?.nombre, motivo });
    if (!res.ok) return alert(res.error);
    alert(res.mensaje);
    if (editPrestamo?.id === p.id) setEditPrestamo(null);
    recargarTodo();
  };

  const abonarValeRow = async (v) => {
    if (!puedeOperarDocs) return;
    const raw = prompt(`Abonar vale ${v.folio}\nMonto actual: ${fmt(v.monto)}\n\nMonto a abonar:`, String(v.monto));
    if (raw === null) return;
    const monto = parseFloat(String(raw).replace(',', '.'));
    if (!(monto > 0)) return alert('Monto inválido.');
    const res = await abonarVale(supabase, v, monto, { nombre: user?.nombre });
    if (!res.ok) return alert(res.error);
    alert(res.liquidado || res.vale?.estado_aprobacion === 'cancelado' ? 'Vale liquidado.' : `Abono aplicado. Nuevo monto: ${fmt(res.saldo ?? res.vale?.monto)}`);
    recargarTodo();
  };

  const liquidarValeRow = async (v) => {
    if (!puedeOperarDocs) return;
    if (!confirm(`¿Liquidar vale ${v.folio} por ${fmt(v.monto)}?`)) return;
    const res = await liquidarVale(supabase, v, { nombre: user?.nombre });
    if (!res.ok) return alert(res.error);
    alert('Vale liquidado.');
    recargarTodo();
  };

  const editarValeRow = async (v) => {
    if (!puedeOperarDocs) return;
    const monto = prompt('Nuevo monto:', String(v.monto));
    if (monto === null) return;
    const motivo = prompt('Motivo / notas:', v.motivo || v.notas || '');
    if (motivo === null) return;
    const res = await editarVale(
      supabase,
      v,
      { monto, motivo },
      { nombre: user?.nombre, user, sucursal },
    );
    if (!res.ok) return alert(res.error);
    alert('Vale actualizado.');
    recargarTodo();
  };

  const eliminarValeRow = async (v) => {
    if (!puedeEliminarVales) return alert('Inicia sesión para eliminar vales.');
    if (!confirm(`¿Eliminar vale ${v.folio}? Solo si el corte está abierto.`)) return;
    const res = await eliminarVale(supabase, v, { nombre: user?.nombre });
    if (!res.ok) return alert(res.error);
    alert(res.mensaje || 'Vale eliminado.');
    recargarTodo();
  };

  const abonarRifRow = async (r) => {
    if (!puedeOperarDocs) return;
    const saldo = Number(r.saldo != null ? r.saldo : r.monto) || 0;
    const raw = prompt(`Abonar RIF ${r.folio}\nSaldo: ${fmt(saldo)}\n\nMonto del abono:`, String(saldo));
    if (raw === null) return;
    const monto = parseFloat(String(raw).replace(',', '.'));
    if (!(monto > 0)) return alert('Monto inválido.');
    if (monto > saldo + 0.001) return alert('El abono no puede superar el saldo.');

    let horaPromesa = null;
    const liquidaTodo = monto >= saldo - 0.001;
    if (!liquidaTodo) {
      const fechaDef = hoyISO();
      const fecha = prompt(
        `Abono parcial. Nueva fecha promesa de pago (AAAA-MM-DD):`,
        fechaDef,
      );
      if (fecha === null) return;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fecha).trim())) return alert('Fecha inválida.');
      const hora = prompt('Nueva hora promesa (HH:MM):', '18:00');
      if (hora === null) return;
      if (!/^\d{1,2}:\d{2}$/.test(String(hora).trim())) return alert('Hora inválida.');
      horaPromesa = `${String(fecha).trim()}T${String(hora).trim()}:00`;
    }

    const res = await abonarRif(supabase, r, monto, {
      usuarioNombre: user?.nombre,
      hora_promesa: horaPromesa || undefined,
    });
    if (!res.ok) return alert(res.error);

    if (res.rif?.estado === 'liquidado') {
      alert('RIF liquidado.');
      if (confirm('¿Imprimir RIF liquidado?')) {
        imprimirRif(res.rif, { mostrarFirma: true });
      }
    } else {
      alert(`Abono ok. Saldo: ${fmt(res.saldo ?? res.rif?.monto)}. Nueva promesa registrada.`);
      if (confirm('¿Imprimir RIF nuevo (saldo y promesa actualizados)?')) {
        imprimirRif(res.rif, { mostrarFirma: true });
      }
    }
    recargarTodo();
  };

  const editarRifRow = async (r) => {
    if (!puedeOperarDocs) return;
    const monto = prompt('Monto:', String(r.monto));
    if (monto === null) return;
    const motivo = prompt('Motivo:', r.motivo || '');
    if (motivo === null) return;
    const responsable = prompt('Responsable:', r.responsable_nombre || '');
    if (responsable === null) return;
    const res = await editarRif(
      supabase,
      r,
      { monto, motivo, responsable_nombre: responsable },
      { user, sucursal, usuarioNombre: user?.nombre },
    );
    if (!res.ok) return alert(res.error);
    alert('RIF actualizado.');
    recargarTodo();
  };

  const eliminarRifRow = async (r) => {
    if (!puedeEliminarDocs) return alert('Solo administrador o gerente pueden eliminar.');
    if (!confirm(`¿Eliminar ${r.folio}? Solo si el corte está abierto.`)) return;
    const res = await eliminarRif(supabase, r, { usuarioNombre: user?.nombre });
    if (!res.ok) return alert(res.error);
    alert(res.mensaje || 'RIF eliminado.');
    recargarTodo();
  };

  const abonarInterarea = async (p) => {
    if (!puedeAbonarLiquidarPrestamosArea) return alert('Solo administrador, gerente o cajero pueden abonar.');
    if (!prestamoInterareaPendienteRc(p)) {
      return alert('Ya fue recolectado a RC Virtual.');
    }
    const saldo = p.saldo != null ? Number(p.saldo) : Number(p.monto) || 0;
    if (!(saldo > 0)) return alert('Sin saldo por abonar.');
    const raw = prompt(
      `Abonar préstamo\n`
      + `Saldo: ${fmt(saldo)}\n\n`
      + `Se resta del préstamo lo abonado.\n\n`
      + `Monto a abonar:`,
      String(saldo),
    );
    if (raw === null) return;
    const monto = parseFloat(String(raw).replace(',', '.'));
    if (!(monto > 0)) return alert('Monto inválido.');
    const res = await abonarPrestamoInterarea(supabase, p, monto, {
      nombreActor: user?.nombre || null,
      sucursal,
      rolActor: user?.rol,
    });
    if (!res.ok) return alert(res.error);
    alert(res.mensaje || `Abono ok. Saldo: ${fmt(res.saldo)}`);
    recargarTodo();
  };

  const liquidarInterarea = async (p) => {
    if (!puedeAbonarLiquidarPrestamosArea) return alert('Solo administrador, gerente o cajero pueden liquidar.');
    if (!confirm('¿Liquidar este préstamo? Quedará en estado liquidado (línea verde) bajo responsabilidad del cajero.')) return;
    const res = await liquidarPrestamoInterarea(supabase, p, {
      nombreActor: user?.nombre || null,
      sucursal,
      rolActor: user?.rol,
    });
    if (!res.ok) return alert(res.error);
    try {
      imprimirPrestamoInterarea(res.prestamo || p);
    } catch {
      /* impresión no bloquea */
    }
    alert(res.mensaje || 'Liquidado.');
    recargarTodo();
  };

  const recolectarInterarea = async (p) => {
    if (!puedeRecolectarPrestamoArea) {
      return alert('Solo administrador, gerente o repartidor pueden recolectar.');
    }
    if (!prestamoInterareaPuedeRecolectarRc(p)) {
      return alert('No hay saldo ni dinero separado pendiente de recolectar a RC.');
    }
    const saldo = p.saldo != null ? Number(p.saldo) : Number(p.monto) || 0;
    const abonado = Number(p.abono) || 0;
    const defaultMonto = saldo > 0.001 ? saldo : abonado;
    const raw = prompt(
      `Recolectar → RC Virtual\n`
      + `${ETIQUETA_AREA[p.origen] || p.origen} → ${ETIQUETA_AREA[p.destino] || p.destino}\n`
      + (saldo > 0.001
        ? `Saldo pendiente: ${fmt(saldo)}\n\nMonto a recolectar:`
        : `Dinero ya separado (abonos): ${fmt(abonado)}\n\nMonto a registrar en RC:`),
      String(defaultMonto),
    );
    if (raw === null) return;
    const monto = parseFloat(String(raw).replace(',', '.'));
    if (!(monto > 0)) return alert('Monto inválido.');
    if (saldo > 0.001 && monto > saldo + 0.001) {
      return alert(`No puede superar el saldo (${fmt(saldo)}).`);
    }
    if (!confirm(
      `¿Recolectar ${fmt(monto)} hacia RC Virtual?\n\n`
      + `Quedará rastro de ${user?.nombre || 'usuario'}.`,
    )) return;
    const res = await recolectarPrestamoInterarea(supabase, p, monto, {
      nombreActor: user?.nombre || null,
      sucursal,
      rolActor: user?.rol,
      user,
    });
    if (!res.ok) return alert(res.error);
    if (res.aviso) alert(res.aviso);
    alert(res.mensaje || 'Recolectado → RC Virtual.');
    recargarTodo();
  };

  const ajustarInterarea = async (p) => {
    if (!puedeOperarPrestamosAreaSuc) return alert('Solo administrador o gerente pueden ajustar.');
    if (!prestamoInterareaPuedeOperarHastaRc(p)) {
      return alert('Ya fue recolectado a RC Virtual. No se puede ajustar.');
    }
    const saldo = p.saldo != null ? Number(p.saldo) : Number(p.monto) || 0;
    const raw = prompt(
      `Ajustar cantidad pendiente\n`
      + `Saldo actual: ${fmt(saldo)}\n\n`
      + `Nueva cantidad (saldo):`,
      String(saldo),
    );
    if (raw === null) return;
    const nuevo = parseFloat(String(raw).replace(',', '.'));
    if (!(nuevo >= 0) || Number.isNaN(nuevo)) return alert('Cantidad inválida.');
    const res = await ajustarCantidadPrestamoInterarea(supabase, p, nuevo, {
      nombreActor: user?.nombre || null,
      sucursal,
      rolActor: user?.rol,
      user,
    });
    if (!res.ok) return alert(res.error);
    alert(res.recuperado ? 'Cantidad en 0 · marcado recuperado.' : `Saldo ajustado a ${fmt(res.saldo)}.`);
    recargarTodo();
  };

  const editarInterarea = async (p) => {
    if (!puedeOperarPrestamosAreaSuc) return alert('Solo administrador o gerente pueden editar.');
    if (!prestamoInterareaPuedeOperarHastaRc(p)) {
      return alert('Ya fue recolectado a RC Virtual. No se puede editar.');
    }
    const notas = prompt('Notas:', p.notas || '');
    if (notas === null) return;
    const monto = Number(p.abono) > 0 ? null : prompt('Monto:', String(p.monto));
    if (monto === null && Number(p.abono) <= 0) return;
    const res = await editarPrestamoInterarea(
      supabase,
      p,
      { notas, ...(monto != null ? { monto } : {}) },
      { user, sucursal },
    );
    if (!res.ok) return alert(res.error);
    alert('Actualizado.');
    recargarTodo();
  };

  const eliminarInterarea = async (p) => {
    if (!puedeEliminarDocs) return alert('Solo administrador o gerente pueden eliminar.');
    if (!confirm('¿Eliminar préstamo entre áreas? Solo si el gasto sigue en corte abierto (aún no recolectado).')) return;
    const res = await eliminarPrestamoInterarea(supabase, p);
    if (!res.ok) return alert(res.error);
    alert(res.mensaje || 'Eliminado.');
    recargarTodo();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {retornoModulo && onRegresarCorte && (
        <div
          className="card"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.75rem',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderLeft: '4px solid #8e44ad',
            background: 'rgba(142,68,173,0.08)',
          }}
        >
          <div>
            <strong>Solicitud de préstamo de área</strong>
            <p className="muted" style={{ margin: '0.25rem 0 0', fontSize: '0.85rem' }}>
              Registre el préstamo entre áreas y regrese al corte virtual para continuar.
            </p>
          </div>
          <button type="button" className="btn btn-primary" onClick={onRegresarCorte}>
            Regresar al corte
          </button>
        </div>
      )}
      {aviso && (
        <div className="card" style={{ borderLeft: '4px solid var(--brand-gold)', background: 'rgba(225,153,41,0.08)' }}>
          <strong>Configuración pendiente</strong>
          <p style={{ margin: '0.35rem 0 0', fontSize: '0.9rem' }}>{aviso || AVISO_FALTA_CONTABILIDAD}</p>
        </div>
      )}

      {(esMain) && (
        <div className="card" style={{ borderLeft: '4px solid var(--brand-blue)', background: 'rgba(59,105,181,0.07)' }}>
          <strong>Estás en Central de administración (MAIN)</strong>
          <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.88rem' }}>
            Aquí puedes generar un <strong>vale de envío de efectivo</strong> a una tienda (pestaña Préstamos).
            Se carga al corte de esa tienda y <strong>no va a IE/contabilidad</strong>. No inyecta moneda a caja.
            Los vales de consumo de cada sucursal se ven al cambiar de tienda en Inicio.
          </p>
        </div>
      )}

      {!puedeGenerarVales && (
        <div className="card" style={{ borderLeft: '4px solid var(--danger)', background: 'rgba(211,47,47,0.06)' }}>
          <strong>Esta tienda no está autorizada para generar vales.</strong>
          <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.85rem' }}>
            El administrador puede habilitarla en <strong>Configuración → Vales y préstamos</strong>.
          </p>
        </div>
      )}

      {puedeVerBandejaAprobacion && (notifsBandeja.length > 0 || valesPendientes.length > 0 || prestamosPendientesAdmin.length > 0 || (esSocio && prestamosPendientesSocio.length > 0)) && (
        <div className="card" style={{ borderLeft: '4px solid var(--danger)', background: 'rgba(211,47,47,0.06)' }}>
          <strong>
            {(valesPendientes.length + prestamosPendientesAdmin.length + (esSocio ? prestamosPendientesSocio.length : 0)) || notifsBandeja.length}
            {' '}pendiente(s) de vales / préstamos
          </strong>
          {vePendientesTodasTiendas && (
            <span className="muted" style={{ marginLeft: '0.35rem', fontSize: '0.85rem' }}>· todas las tiendas</span>
          )}
          <button type="button" className="btn btn-primary" style={{ marginLeft: '0.5rem' }} onClick={() => setPestana('pendientes')}>
            Abrir bandeja de vales
          </button>
        </div>
      )}

      {!esRepartidor && (
      <div className="card" style={{ fontSize: '0.85rem' }}>
        <strong>Vales consumo</strong> — Siempre requieren autorización del administrador.
        <br />
        <strong>Gasolina, herramienta, accesorios y tipos creados por admin</strong> — Hasta las {horaLimiteVale} inclusive (Sonora) se imprimen con firma; después de las {horaLimiteVale} el admin debe aprobar.
        <br />
        <strong>Corte</strong> — Al aprobarse, el vale va al corte del área del beneficiario (Virtual / Abarrotes / Garage). El préstamo va al área que indiques.
        <br />
        <strong>Préstamos</strong> — Admin aprueba siempre; mayores a ${MONTO_PRESTAMO_REQUIERE_SOCIO} requieren Antonio, Francisco o José Luis.
        Cuota semanal mín. ${CUOTA_SEMANAL_MINIMA} en nómina.
        {requiereAuthAhora && !esAdmin && valeForm.categoria !== 'consumo' && (
          <span style={{ color: 'var(--danger)' }}> · Ahora ({new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}) vales después de las {horaLimiteVale} van a bandeja admin.</span>
        )}
      </div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {(esRepartidor
          ? ['pagare', 'prestamos']
          : ['vales', 'rif', 'pagare', 'prestamos', 'prestamos_emp', esAdmin && 'tipos', esAdmin && 'gasolina', puedeVerBandejaAprobacion && 'pendientes']
        ).filter(Boolean).map((p) => (
          <button key={p} type="button" className={`btn ${pestana === p ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setPestana(p)}>
            {p === 'vales' && 'Vales'}
            {p === 'rif' && `RIF (${rifs.filter((r) => r.estado === 'abierto').length})`}
            {p === 'pagare' && `Pagaré (${pagares.filter((x) => pagareEstaAbierto(x)).length})`}
            {p === 'prestamos' && 'Préstamos área / sucursal'}
            {p === 'prestamos_emp' && 'Préstamos empleados'}
            {p === 'tipos' && 'Tipos de vale'}
            {p === 'gasolina' && 'Gasolina / asistencia'}
            {p === 'pendientes' && `Pendientes (${valesPendientes.length + prestamosPendientesAdmin.length + prestamosMovPendientes.length + (esSocio ? prestamosPendientesSocio.length : 0)})`}
          </button>
        ))}
      </div>

      {pestana === 'pagare' && (
        <>
          <div className="card">
            <h3 style={{ margin: '0 0 0.5rem', color: 'var(--brand-blue)' }}>Pagarés</h3>
            <p className="muted" style={{ margin: '0 0 0.75rem', fontSize: '0.86rem' }}>
              Registro del dinero en negativo pendiente de cobro por recolectores.
              El botón <strong>Pagaré</strong> en la alerta de Virtual / Garage / Abarrotes genera el folio y 2 tickets.
              El cajero solo abona o liquida (sin ticket ni préstamo).
            </p>
            {puedeGenerarPagare(user?.rol) && (
              <form
                style={{ display: 'grid', gap: '0.5rem', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', marginBottom: '1rem' }}
                onSubmit={async (e) => {
                  e.preventDefault();
                  const monto = parseFloat(String(pagareForm.monto).replace(',', '.'));
                  if (!(monto > 0)) return alert('Monto inválido.');
                  const res = await registrarPagare(
                    supabase,
                    {
                      area: pagareForm.area,
                      sucursal_id: sucursal,
                      monto,
                      cajero_nombre: pagareForm.cajero_nombre.trim() || user?.nombre || null,
                      turno_nombre: pagareForm.turno_nombre.trim() || null,
                      texto: textoPagare(monto),
                    },
                    { nombreActor: user?.nombre, rolActor: user?.rol, user },
                  );
                  if (!res.ok) return alert(res.error);
                  try {
                    imprimirPagare(res.pagare, { copias: 2 });
                  } catch {
                    /* ignore */
                  }
                  setPagareForm({ area: pagareForm.area, monto: '', cajero_nombre: '', turno_nombre: '' });
                  alert(res.mensaje || 'Pagaré registrado.');
                  recargarTodo();
                }}
              >
                <label className="muted" style={{ fontSize: '0.8rem' }}>
                  Área
                  <select
                    className="select"
                    style={{ marginTop: 4 }}
                    value={pagareForm.area}
                    onChange={(e) => setPagareForm({ ...pagareForm, area: e.target.value })}
                  >
                    <option value="virtual">Virtual</option>
                    <option value="garage">Garage</option>
                    <option value="abarrotes">Abarrotes</option>
                  </select>
                </label>
                <label className="muted" style={{ fontSize: '0.8rem' }}>
                  Monto
                  <input
                    className="input"
                    style={{ marginTop: 4 }}
                    type="number"
                    min="0"
                    step="0.01"
                    value={pagareForm.monto}
                    onChange={(e) => setPagareForm({ ...pagareForm, monto: e.target.value })}
                    required
                  />
                </label>
                <label className="muted" style={{ fontSize: '0.8rem' }}>
                  Cajero en turno
                  <input
                    className="input"
                    style={{ marginTop: 4 }}
                    value={pagareForm.cajero_nombre}
                    onChange={(e) => setPagareForm({ ...pagareForm, cajero_nombre: e.target.value })}
                    placeholder={user?.nombre || 'Nombre cajero'}
                  />
                </label>
                <label className="muted" style={{ fontSize: '0.8rem' }}>
                  Turno
                  <input
                    className="input"
                    style={{ marginTop: 4 }}
                    value={pagareForm.turno_nombre}
                    onChange={(e) => setPagareForm({ ...pagareForm, turno_nombre: e.target.value })}
                    placeholder="Turno"
                  />
                </label>
                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <button type="submit" className="btn btn-gold">Generar pagaré (2 tickets)</button>
                </div>
              </form>
            )}
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Folio</th>
                    <th>Área</th>
                    <th>Sucursal</th>
                    <th>Cajero</th>
                    <th>Monto</th>
                    <th>Saldo</th>
                    <th>Estado</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {pagares.length === 0 ? (
                    <tr><td colSpan={8} className="muted">Sin pagarés. Ejecuta supabase/fix_pagares.sql si falta la tabla.</td></tr>
                  ) : (
                    pagares.map((p) => (
                      <tr key={p.id}>
                        <td>{p.folio || '—'}</td>
                        <td>{ETIQUETA_AREA_PAGARE[p.area] || p.area}</td>
                        <td>{etiquetaTienda(p.sucursal_id)}</td>
                        <td>
                          {p.cajero_nombre || '—'}
                          {p.turno_nombre ? <span className="muted"> · {p.turno_nombre}</span> : null}
                        </td>
                        <td>{fmt(p.monto)}</td>
                        <td>{fmt(saldoPagare(p))}</td>
                        <td>{p.estado || '—'}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            style={{ padding: '0.2rem 0.4rem', fontSize: '0.8rem' }}
                            onClick={() => imprimirPagare(p, { copias: 2 })}
                          >
                            Reimprimir ×2
                          </button>
                          {puedeAbonarLiquidarPagaresUi && pagareEstaAbierto(p) && (
                            <>
                              <button
                                type="button"
                                className="btn btn-ghost"
                                style={{ padding: '0.2rem 0.4rem', fontSize: '0.8rem' }}
                                onClick={async () => {
                                  const saldo = saldoPagare(p);
                                  const raw = prompt(`Abonar pagaré ${p.folio}\nSaldo: $${saldo.toFixed(2)}`, String(saldo));
                                  if (raw === null) return;
                                  const monto = parseFloat(String(raw).replace(',', '.'));
                                  if (!(monto > 0)) return alert('Monto inválido.');
                                  const res = await abonarPagare(supabase, p, monto, {
                                    nombreActor: user?.nombre,
                                    rolActor: user?.rol,
                                    user,
                                  });
                                  if (!res.ok) return alert(res.error);
                                  alert(res.mensaje);
                                  recargarTodo();
                                }}
                              >
                                Abonar
                              </button>
                              <button
                                type="button"
                                className="btn btn-primary"
                                style={{ padding: '0.2rem 0.4rem', fontSize: '0.8rem' }}
                                onClick={async () => {
                                  const saldo = saldoPagare(p);
                                  if (!confirm(`¿Liquidar pagaré ${p.folio} por $${saldo.toFixed(2)}? Sin ticket.`)) return;
                                  const res = await liquidarPagare(supabase, p, {
                                    nombreActor: user?.nombre,
                                    rolActor: user?.rol,
                                    user,
                                  });
                                  if (!res.ok) return alert(res.error);
                                  alert(res.mensaje);
                                  recargarTodo();
                                }}
                              >
                                Liquidar
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {pestana === 'pendientes' && puedeVerBandejaAprobacion && (
        <div className="card" id="bandeja-aprobaciones-vales">
          <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>
            Bandeja de aprobaciones
            {vePendientesTodasTiendas && (
              <span className="muted" style={{ fontWeight: 500, fontSize: '0.85rem', marginLeft: '0.5rem' }}>
                (todas las tiendas)
              </span>
            )}
          </h3>
          {puedeAprobarVales && valesPendientes.length > 0 && (
            <>
              <h4 style={{ margin: '0.5rem 0' }}>Vales pendientes</h4>
              {valesPendientes.map((v) => (
                <div key={v.id} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '0.5rem', padding: '0.5rem', background: 'var(--surface)', borderRadius: 8 }}>
                  <span>
                    {vePendientesTodasTiendas && (
                      <strong style={{ marginRight: '0.35rem' }}>{etiquetaTienda(v.sucursal_id)}</strong>
                    )}
                    {v.folio} · {v.nombre_empleado} · {fmt(v.monto)} · {etiquetaCategoriaVale(v.categoria)}
                  </span>
                  <button type="button" className="btn btn-primary" style={{ fontSize: '0.8rem' }} onClick={() => aprobarV(v.id)}>Aprobar</button>
                  {esAdmin && (
                    <button type="button" className="btn btn-ghost" style={{ fontSize: '0.8rem', color: 'var(--danger)' }} onClick={() => cancelarV(v)}>Cancelar</button>
                  )}
                </div>
              ))}
            </>
          )}
          {puedeAprobarVales && prestamosPendientesAdmin.length > 0 && (
            <>
              <h4 style={{ margin: '0.75rem 0 0.5rem' }}>Préstamos — admin</h4>
              {prestamosPendientesAdmin.map((p) => (
                <div key={p.id} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '0.5rem', padding: '0.5rem', background: 'var(--surface)', borderRadius: 8 }}>
                  <span>
                    {vePendientesTodasTiendas && (
                      <strong style={{ marginRight: '0.35rem' }}>{etiquetaTienda(p.sucursal_id)}</strong>
                    )}
                    {p.nombre_empleado} · {fmt(p.monto_original)}{Number(p.monto_original) > MONTO_PRESTAMO_REQUIERE_SOCIO ? ' · +socio' : ''}
                  </span>
                  <button type="button" className="btn btn-primary" style={{ fontSize: '0.8rem' }} onClick={() => aprobarPAdmin(p.id)}>Aprobar</button>
                  {esAdmin && (
                    <button type="button" className="btn btn-ghost" style={{ fontSize: '0.8rem', color: 'var(--danger)' }} onClick={() => rechazarPrestamo(supabase, p.id, { nombre: user?.nombre }).then(recargarTodo)}>Rechazar</button>
                  )}
                </div>
              ))}
            </>
          )}
          {esSocio && prestamosPendientesSocio.length > 0 && (
            <>
              <h4 style={{ margin: '0.75rem 0 0.5rem' }}>Préstamos +$1,000 — socio</h4>
              <InputPin
                value={pinSocio}
                onChange={(e) => setPinSocio(e.target.value)}
                placeholder="PIN socio"
                autoComplete="off"
                name="vale-pin-socio"
                style={{ maxWidth: 200, marginBottom: '0.5rem', fontSize: '1.05rem' }}
              />
              {prestamosPendientesSocio.map((p) => (
                <div key={p.id} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '0.5rem', padding: '0.5rem', background: 'var(--surface)', borderRadius: 8 }}>
                  <span>
                    <strong style={{ marginRight: '0.35rem' }}>{etiquetaTienda(p.sucursal_id)}</strong>
                    {p.nombre_empleado} · {fmt(p.monto_original)}
                  </span>
                  <button type="button" className="btn btn-primary" style={{ fontSize: '0.8rem' }} onClick={() => aprobarPSocio(p.id)}>Autorizar</button>
                </div>
              ))}
            </>
          )}
          {(esAdmin || puedeAprobarVales) && prestamosMovPendientes.length > 0 && (
            <>
              <h4 style={{ margin: '0.75rem 0 0.5rem' }}>Abonos / descuentos / liquidaciones — préstamos</h4>
              {prestamosMovPendientes.map((p) => {
                const tipoLabel = p.solicitud_tipo === 'descuento'
                  ? 'Descuento'
                  : p.solicitud_tipo === 'liquidacion'
                    ? 'Liquidación'
                    : 'Abono';
                return (
                  <div key={`mov-${p.id}`} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '0.5rem', padding: '0.5rem', background: 'var(--surface)', borderRadius: 8 }}>
                    <span>
                      {vePendientesTodasTiendas && (
                        <strong style={{ marginRight: '0.35rem' }}>{etiquetaTienda(p.sucursal_id)}</strong>
                      )}
                      <strong>{tipoLabel}</strong>
                      {' · '}
                      {p.nombre_empleado}
                      {' · '}
                      {fmt(p.solicitud_monto)}
                      {p.solicitud_por ? ` · pidió ${p.solicitud_por}` : ''}
                      {' · saldo '}
                      {fmt(p.saldo)}
                    </span>
                    <button type="button" className="btn btn-primary" style={{ fontSize: '0.8rem' }} onClick={() => aprobarMovPrestamo(p)}>Aprobar</button>
                    <button type="button" className="btn btn-ghost" style={{ fontSize: '0.8rem', color: 'var(--danger)' }} onClick={() => rechazarMovPrestamo(p)}>Rechazar</button>
                  </div>
                );
              })}
            </>
          )}
          {valesPendientes.length === 0
            && prestamosPendientesAdmin.length === 0
            && (!esSocio || prestamosPendientesSocio.length === 0)
            && (((!esAdmin && !puedeAprobarVales) || prestamosMovPendientes.length === 0)) && (
            <div>
              <p className="muted" style={{ marginBottom: '0.5rem' }}>No hay vales ni préstamos pendientes de aprobación.</p>
              <p className="muted" style={{ fontSize: '0.85rem', margin: 0 }}>
                Si la campanita 🔔 muestra avisos, suelen ser <strong>gastos de corte</strong>, <strong>incidencias</strong> o{' '}
                <strong>cobros post-liquidación</strong>: ábrelos en el menú <strong>Incidencias → Pendientes</strong> (no aquí).
              </p>
            </div>
          )}
        </div>
      )}

      {pestana === 'tipos' && esAdmin && (
        <div className="card">
          <h3 style={{ margin: '0 0 0.5rem', color: 'var(--brand-blue)' }}>Tipos de vale permanentes</h3>
          <p className="muted" style={{ fontSize: '0.85rem', marginTop: 0 }}>
            Crea tipos adicionales (como gasolina o consumo). Quedan fijos para todas las sucursales al generar vales.
            Ejecuta <code>supabase/fix_vales_categorias.sql</code> para sincronizarlos en la nube.
          </p>
          <div className="grid-2" style={{ marginBottom: '0.75rem' }}>
            <input
              className="input"
              placeholder="Nombre del tipo (ej. Uniformes, Mantenimiento)"
              value={nuevoTipoVale.label}
              onChange={(e) => setNuevoTipoVale({ ...nuevoTipoVale, label: e.target.value })}
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
              <input
                type="checkbox"
                checked={nuevoTipoVale.descuentaNomina}
                onChange={(e) => setNuevoTipoVale({ ...nuevoTipoVale, descuentaNomina: e.target.checked })}
              />
              Descuenta en nómina
            </label>
          </div>
          <button type="button" className="btn btn-primary" onClick={crearTipoVale} disabled={!nuevoTipoVale.label.trim()}>
            Crear tipo permanente
          </button>
          <div className="table-wrap" style={{ marginTop: '1rem' }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Nómina</th>
                  <th>Origen</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {categoriasValeDisponibles.map((c) => (
                  <tr key={c.id}>
                    <td>{c.label}</td>
                    <td>{c.descuentaNomina ? 'Sí' : 'No'}</td>
                    <td className="muted">{c.fijo ? 'Sistema' : 'Admin'}</td>
                    <td>
                      {!c.fijo && (
                        <button type="button" className="btn btn-ghost" style={{ color: 'var(--danger)', padding: '0.2rem 0.4rem' }} onClick={() => quitarTipoVale(c.id)}>
                          Quitar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {categoriasExtra.length === 0 && (
            <p className="muted" style={{ fontSize: '0.82rem' }}>{AVISO_FALTA_VALES_CATEGORIAS}</p>
          )}
        </div>
      )}

      {pestana === 'vales' && (
        <>
          <div className="card">
            <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Nuevo vale</h3>
            <div className="grid-2">
              <select className="select" value={valeForm.beneficiarioId} onChange={(e) => setValeForm({ ...valeForm, beneficiarioId: e.target.value })}>
                <option value="">— Beneficiario —</option>
                {BENEFICIARIOS_VALES.map((b) => (
                  <option key={b.id} value={b.id}>{b.nombre} — corte {ETIQUETA_AREA[b.area]}</option>
                ))}
              </select>
              <select className="select" value={valeForm.categoria} onChange={(e) => setValeForm({ ...valeForm, categoria: e.target.value })}>
                {categoriasValeDisponibles.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}{c.descuentaNomina ? ' (nómina)' : ' (sin nómina)'}</option>
                ))}
              </select>
              <input className="input" type="number" min="0" step="0.01" placeholder="Monto" value={valeForm.monto} onChange={(e) => setValeForm({ ...valeForm, monto: e.target.value })} />
              <SelectorCalendario label="Fecha del vale" value={valeForm.fecha} onChange={(f) => setValeForm({ ...valeForm, fecha: f })} />
              <input className="input" placeholder="Motivo" style={{ gridColumn: '1 / -1' }} value={valeForm.motivo} onChange={(e) => setValeForm({ ...valeForm, motivo: e.target.value })} />
            </div>
            {areaCorteVale && (
              <p className="muted" style={{ margin: '0.65rem 0 0', fontSize: '0.85rem' }}>
                Al aprobarse se carga al <strong>corte de {ETIQUETA_AREA[areaCorteVale]}</strong>.
              </p>
            )}
            <button type="button" className="btn btn-primary" style={{ marginTop: '0.75rem' }} disabled={!puedeGenerarVales} onClick={guardarVale}>
              {valeFormRequiereAdmin && !esAdmin ? 'Solicitar vale (requiere autorización)' : 'Registrar vale'}
            </button>
            {valeFormRequiereAdmin && !esAdmin && (
              <p className="muted" style={{ margin: '0.5rem 0 0', fontSize: '0.82rem', color: 'var(--brand-red)' }}>
                {valeForm.categoria === 'consumo'
                  ? 'Los vales de consumo siempre requieren aprobación del administrador.'
                  : `Son las ${new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })} — vales después de las ${horaLimiteVale} van a bandeja del administrador.`}
              </p>
            )}
          </div>
          <div className="card">
            <h3 style={{ margin: '0 0 0.75rem' }}>Vales registrados ({vales.length})</h3>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Folio</th>
                    <th>Estado</th>
                    <th>Categoría</th>
                    <th>Beneficiario</th>
                    <th>Área / corte</th>
                    <th>Monto</th>
                    <th>Corte</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {vales.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="muted">
                        No hay vales en esta tienda. Crea uno arriba o revisa que la tienda esté autorizada en Configuración.
                        Los vales de <strong>gasolina</strong> aprobados también se consultan en la pestaña Gasolina / asistencia.
                      </td>
                    </tr>
                  ) : (
                  vales.map((v) => (
                    <tr key={v.id}>
                      <td>{v.folio}</td>
                      <td>{etiquetaEstadoVale(v)}</td>
                      <td>{etiquetaCategoriaVale(v.categoria)}</td>
                      <td>{v.nombre_empleado}</td>
                      <td className="muted">{ETIQUETA_AREA[v.area] || v.area || '—'}</td>
                      <td style={{ fontWeight: 700 }}>{fmt(v.monto)}</td>
                      <td className="muted">{v.cargado_corte ? 'Sí' : 'No'}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {valePuedeImprimir(v) && (
                          <button type="button" className="btn btn-ghost" style={{ padding: '0.2rem 0.4rem' }} onClick={() => imprimirValeSi(v)}>Imprimir</button>
                        )}
                        {puedeEliminarVales && (
                          <button type="button" className="btn btn-ghost" style={{ padding: '0.2rem 0.4rem', color: 'var(--danger)' }} onClick={() => eliminarValeRow(v)}>Eliminar</button>
                        )}
                      </td>
                    </tr>
                  ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {pestana === 'rif' && (
        <>
          <div className="card">
            <h3 style={{ margin: '0 0 0.5rem', color: 'var(--brand-blue)' }}>Nuevo RIF (Requisición Interna de Fondos)</h3>
            <p className="muted" style={{ margin: '0 0 0.75rem', fontSize: '0.85rem' }}>
              Tienda origen: <strong>{etiquetaTienda(sucursal)}</strong>. Usa <strong>Abonar</strong> / <strong>Liquidar</strong>;
              al abonar parcial se pide nueva promesa de pago. <strong>Imprimir (firma)</strong> genera el comprobante.
              Si no se liquida a la hora promesa, se carga al <strong>Corte de Abarrotes</strong> como <strong>Fondo requerido</strong>.
            </p>
            <div className="grid-2">
              <label className="muted">
                Tienda receptora
                <select
                  className="select"
                  style={{ marginTop: '0.35rem' }}
                  value={rifForm.sucursal_destino}
                  onChange={(e) => setRifForm({ ...rifForm, sucursal_destino: e.target.value })}
                >
                  <option value="">— Selecciona —</option>
                  {sucursalesDestino.map((s) => (
                    <option key={s} value={s}>{etiquetaTienda(s)}</option>
                  ))}
                </select>
              </label>
              <label className="muted">
                Responsable del RIF
                <input
                  className="input"
                  style={{ marginTop: '0.35rem' }}
                  value={rifForm.responsable_nombre}
                  onChange={(e) => setRifForm({ ...rifForm, responsable_nombre: e.target.value })}
                  placeholder="Nombre quien responde"
                />
              </label>
              <label className="muted">
                Monto
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="0.01"
                  style={{ marginTop: '0.35rem' }}
                  value={rifForm.monto}
                  onChange={(e) => setRifForm({ ...rifForm, monto: e.target.value })}
                />
              </label>
              <label className="muted">
                Fecha promesa
                <div style={{ marginTop: '0.35rem' }}>
                  <SelectorCalendario
                    label=""
                    value={rifForm.fecha_promesa}
                    onChange={(f) => setRifForm({ ...rifForm, fecha_promesa: f })}
                  />
                </div>
              </label>
              <label className="muted">
                Hora promesa de pago
                <input
                  className="input"
                  type="time"
                  style={{ marginTop: '0.35rem' }}
                  value={rifForm.hora_promesa}
                  onChange={(e) => setRifForm({ ...rifForm, hora_promesa: e.target.value })}
                />
              </label>
              <label className="muted" style={{ gridColumn: '1 / -1' }}>
                Motivo
                <input
                  className="input"
                  style={{ marginTop: '0.35rem' }}
                  value={rifForm.motivo}
                  onChange={(e) => setRifForm({ ...rifForm, motivo: e.target.value })}
                  placeholder="Opcional"
                />
              </label>
            </div>
            <button type="button" className="btn btn-primary" style={{ marginTop: '0.75rem' }} onClick={guardarRif}>
              Registrar RIF e imprimir
            </button>
          </div>
          <div className="card">
            <h3 style={{ margin: '0 0 0.75rem' }}>RIF registrados ({rifs.length})</h3>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Folio</th>
                    <th>Estado</th>
                    <th>Origen → Receptora</th>
                    <th>Responsable</th>
                    <th>Monto</th>
                    <th>Promesa</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rifs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="muted">Sin RIF. Ejecuta supabase/fix_rifs.sql si falta la tabla.</td>
                    </tr>
                  ) : (
                    rifs.map((r) => (
                      <tr key={r.id}>
                        <td>{r.folio}</td>
                        <td>{etiquetaEstadoRif(r.estado)}</td>
                        <td className="muted">{etiquetaTienda(r.sucursal_origen)} → {etiquetaTienda(r.sucursal_destino)}</td>
                        <td>{r.responsable_nombre}</td>
                        <td style={{ fontWeight: 700 }}>{fmt(r.monto)}</td>
                        <td className="muted" style={{ fontSize: '0.82rem' }}>
                          {r.hora_promesa
                            ? new Date(r.hora_promesa).toLocaleString('es-MX', {
                                day: '2-digit',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : '—'}
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {puedeOperarDocs && rifPuedeAbonar(r) && (
                            <button type="button" className="btn btn-ghost" style={{ padding: '0.2rem 0.4rem' }} onClick={() => abonarRifRow(r)}>Abonar</button>
                          )}
                          {puedeOperarDocs && rifPuedeLiquidar(r) && (
                            <button type="button" className="btn btn-primary" style={{ padding: '0.2rem 0.4rem', fontSize: '0.78rem' }} onClick={() => liquidarR(r)}>
                              Liquidar
                            </button>
                          )}
                          {puedeOperarDocs && rifPuedeAbonar(r) && (
                            <button type="button" className="btn btn-ghost" style={{ padding: '0.2rem 0.4rem' }} onClick={() => editarRifRow(r)}>Editar</button>
                          )}
                          {rifPuedeImprimir(r) && (
                            <button type="button" className="btn btn-ghost" style={{ padding: '0.2rem 0.4rem' }} title="Ticket con espacio para firma" onClick={() => imprimirRif(r, { mostrarFirma: true })}>
                              Imprimir (firma)
                            </button>
                          )}
                          {puedeEliminarDocs && r.estado !== 'liquidado' && (
                            <button type="button" className="btn btn-ghost" style={{ padding: '0.2rem 0.4rem', color: 'var(--danger)' }} onClick={() => eliminarRifRow(r)}>Eliminar</button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {pestana === 'gasolina' && esAdmin && (
        <PanelAsistenciaGasolina supabase={supabase} sucursal={sucursal} user={user} />
      )}

      {pestana === 'prestamos' && (
        <>
          <div className="card">
            <h3 style={{ margin: '0 0 0.75rem' }}>Préstamo entre áreas</h3>
            <p className="muted" style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>
              <strong>No se carga</strong> al corte Virtual / Abarrotes / Garage. Al registrar se genera <strong>ticket</strong>.
              Primero eliges quién <strong>presta</strong> (Origen) y después quién <strong>recibe</strong> (Destino).
              La alerta con el negativo aparece en el corte del <strong>Destino</strong> (quien recupera y paga).
              El cajero puede <strong>Abonar</strong> o <strong>Liquidar</strong> para cuadrar.
              <strong> Recolectar</strong> envía el efectivo a <strong>RC Virtual</strong>.
              {esAdmin
                ? ' Admin: todos los botones.'
                : puedeAbonarLiquidarPrestamosArea
                  ? ' Cajero: Abonar y Liquidar.'
                  : ' Repartidor: Recolectar e Imprimir.'}
            </p>
            {!esRepartidor && (
            <p className="muted" style={{ fontSize: '0.85rem', marginBottom: '0.75rem' }}>
              <strong>Ejemplo — Virtual presta $400 a Abarrotes:</strong>{' '}
              Origen = <strong>Virtual</strong> (presta), Destino = <strong>Abarrotes</strong> (recibe).
              En <strong>Corte Abarrotes</strong> aparece la alerta con negativo $400.00.
              Si la venta de Abarrotes es $750, muestra negativo $0.00 y recuperado $400.
              Al <strong>Liquidar</strong>, queda liquidado (línea verde) bajo responsabilidad del cajero y se imprime ticket.
            </p>
            )}
            {puedeOperarPrestamosAreaSuc && (
            <div className="grid-2">
              <select className="select" value={prestForm.origen} onChange={(e) => setPrestForm({ ...prestForm, origen: e.target.value })}>
                {AREAS_CONTABILIDAD.map((a) => (
                  <option key={a} value={a}>{ETIQUETA_AREA[a]} (origen · presta)</option>
                ))}
              </select>
              <select className="select" value={prestForm.gastos_area} onChange={(e) => setPrestForm({ ...prestForm, gastos_area: e.target.value })}>
                {AREAS_CONTABILIDAD.map((a) => (
                  <option key={a} value={a}>{ETIQUETA_AREA[a]} (destino · recibe)</option>
                ))}
              </select>
              <input className="input" type="number" placeholder="Monto" value={prestForm.monto} onChange={(e) => setPrestForm({ ...prestForm, monto: e.target.value })} />
              <button type="button" className="btn btn-primary" onClick={guardarPrestamoGastos}>Registrar</button>
            </div>
            )}
            <div className="table-wrap" style={{ marginTop: '1rem' }}>
              <table className="data">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Origen (presta)</th>
                    <th>Destino (recibe)</th>
                    <th>Monto</th>
                    <th>Saldo</th>
                    <th>Estado</th>
                    <th>Colectó</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {prestamosArea.length === 0 ? (
                    <tr><td colSpan={8} className="muted">Sin préstamos entre áreas.</td></tr>
                  ) : (
                    prestamosArea.map((p) => {
                      const pendienteRc = prestamoInterareaPendienteRc(p);
                      const saldo = p.saldo != null ? Number(p.saldo) : Number(p.monto) || 0;
                      const abonado = Number(p.abono) || 0;
                      const cerradoRc = Boolean(p.rc_recibido_por);
                      const liquidado = ['liquidado', 'recuperado'].includes(String(p.estado || ''));
                      const puedeImprimir = pendienteRc || cerradoRc || liquidado;
                      const puedeRecolectarRc = puedeRecolectarPrestamoArea && prestamoInterareaPuedeRecolectarRc(p);
                      const puedeAbonar = puedeAbonarLiquidarPrestamosArea && pendienteRc && saldo > 0.001;
                      const puedeLiquidar = puedeAbonarLiquidarPrestamosArea && pendienteRc && !liquidado;
                      const puedeAjustar = puedeOperarPrestamosAreaSuc && pendienteRc;
                      const puedeEditar = puedeOperarPrestamosAreaSuc && pendienteRc;
                      const puedeEliminar = puedeEliminarDocs && pendienteRc && !p.colectado_por;
                      return (
                        <tr
                          key={p.id}
                          className={liquidado ? 'prestamo-fila-liquidado' : undefined}
                          style={liquidado
                            ? { background: 'rgba(22, 163, 74, 0.18)', color: '#166534' }
                            : cerradoRc
                              ? { opacity: 0.75 }
                              : undefined}
                        >
                          <td>{p.fecha}</td>
                          <td>{ETIQUETA_AREA[p.origen]}</td>
                          <td>{ETIQUETA_AREA[p.destino]}</td>
                          <td>{fmt(p.monto)}</td>
                          <td style={{ fontWeight: 700 }}>{fmt(saldo)}</td>
                          <td className="muted">
                            {etiquetaEstadoPrestamo(p)}
                            {saldo <= 0.001 && abonado > 0 && !cerradoRc && !liquidado ? ' · dinero separado' : ''}
                            {cerradoRc && (p.rc_recibido_por || p.liquidado_por) ? (
                              <>
                                {' · RC '}
                                {p.rc_recibido_por || p.liquidado_por || '—'}
                                {p.liquidado_sucursal ? ` · ${etiquetaTienda(p.liquidado_sucursal)}` : ''}
                              </>
                            ) : null}
                            {liquidado && p.liquidado_por ? ` · ${p.liquidado_por}` : ''}
                          </td>
                          <td className="muted" style={{ fontSize: '0.8rem' }}>{etiquetaColectaPrestamo(p)}</td>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            {puedeImprimir && (
                              <button
                                type="button"
                                className="btn btn-ghost"
                                style={{ padding: '0.2rem 0.4rem' }}
                                onClick={() => imprimirPrestamoInterarea(p)}
                              >
                                Imprimir
                              </button>
                            )}
                            {puedeRecolectarRc && (
                              <button
                                type="button"
                                className="btn btn-primary"
                                style={{
                                  padding: '0.2rem 0.45rem',
                                  fontSize: '0.78rem',
                                  background: 'var(--brand-gold)',
                                  borderColor: 'var(--brand-gold)',
                                  color: '#1a1a1a',
                                }}
                                onClick={() => recolectarInterarea(p)}
                              >
                                Recolectar
                              </button>
                            )}
                            {puedeAbonar && (
                              <button
                                type="button"
                                className="btn btn-ghost"
                                style={{ padding: '0.2rem 0.4rem' }}
                                onClick={() => abonarInterarea(p)}
                              >
                                Abonar
                              </button>
                            )}
                            {puedeLiquidar && (
                              <button
                                type="button"
                                className="btn btn-primary"
                                style={{ padding: '0.2rem 0.4rem', fontSize: '0.8rem' }}
                                onClick={() => liquidarInterarea(p)}
                              >
                                Liquidar
                              </button>
                            )}
                            {puedeAjustar && (
                              <button
                                type="button"
                                className="btn btn-ghost"
                                style={{ padding: '0.2rem 0.4rem' }}
                                onClick={() => ajustarInterarea(p)}
                              >
                                Ajustar
                              </button>
                            )}
                            {puedeEditar && (
                              <button type="button" className="btn btn-ghost" style={{ padding: '0.2rem 0.4rem' }} onClick={() => editarInterarea(p)}>Editar</button>
                            )}
                            {puedeEliminar && (
                              <button type="button" className="btn btn-ghost" style={{ padding: '0.2rem 0.4rem', color: 'var(--danger)' }} onClick={() => eliminarInterarea(p)}>Eliminar</button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {!esRepartidor && (
          <div className="card">
            <h3 style={{ margin: '0 0 0.75rem' }}>
              {esMain ? 'Vale envío MAIN → tienda' : 'Préstamo a otra sucursal'}
            </h3>
            <p className="muted" style={{ fontSize: '0.85rem' }}>
              {esMain ? (
                <>
                  Registra el efectivo que MAIN manda a la tienda. Al generar se <strong>carga al corte</strong> elegido
                  (baja caja). <strong>No se inyecta</strong> moneda y <strong>no va a IE/contabilidad</strong>.
                  Al recolectar ese corte queda quién colectó el vale.
                </>
              ) : (
                <>
                  Presta efectivo a otra tienda. <strong>No se carga al corte</strong>; la alerta de recuperación
                  aparece en el área elegida. Sigue <strong>pendiente de cobro</strong> hasta Abonar/Liquidar en{' '}
                  <strong>{etiquetaTienda(sucursal)}</strong>.
                </>
              )}
            </p>
            <div className="grid-2">
              <select
                className="select"
                value={prestSucForm.destino}
                onChange={(e) => setPrestSucForm({ ...prestSucForm, destino: e.target.value })}
              >
                <option value="">— Sucursal destino —</option>
                {sucursalesDestino.map((s) => (
                  <option key={s} value={s}>{etiquetaTienda(s)}</option>
                ))}
              </select>
              <input
                className="input"
                type="number"
                placeholder="Monto"
                value={prestSucForm.monto}
                onChange={(e) => setPrestSucForm({ ...prestSucForm, monto: e.target.value })}
              />
              <select
                className="select"
                value={prestSucForm.areaCorte || 'abarrotes'}
                onChange={(e) => setPrestSucForm({ ...prestSucForm, areaCorte: e.target.value })}
              >
                <option value="abarrotes">Corte Abarrotes (origen)</option>
                <option value="virtual">Corte Virtual (origen)</option>
                <option value="garage">Corte Garage (origen)</option>
              </select>
              <input
                className="input"
                placeholder="Notas"
                value={prestSucForm.notas}
                onChange={(e) => setPrestSucForm({ ...prestSucForm, notas: e.target.value })}
              />
              <button type="button" className="btn btn-primary" onClick={guardarPrestamoSucursal}>
                {esMain ? 'Generar vale y cargar al corte' : 'Registrar préstamo'}
              </button>
            </div>
            <div className="table-wrap" style={{ marginTop: '1rem' }}>
              <table className="data">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Origen</th>
                    <th>Destino</th>
                    <th>Monto</th>
                    <th>Saldo</th>
                    <th>Estado</th>
                    <th>Colectó</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {prestamosSuc.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="muted">
                        {esMain ? 'No hay envíos MAIN registrados.' : 'No hay préstamos entre sucursales.'}
                      </td>
                    </tr>
                  ) : (
                    prestamosSuc.map((p) => {
                      const esOrigen = p.sucursal_origen === String(sucursal || '').toUpperCase();
                      const pendiente = p.estado === 'pendiente_cobro';
                      const esEnvioMain = p.sucursal_origen === 'MAIN' || p.tipo === 'main_envio';
                      return (
                        <tr
                          key={p.id}
                          style={
                            p.estado === 'liquidado' && !esEnvioMain
                              ? { background: 'rgba(22, 163, 74, 0.18)', color: '#166534' }
                              : undefined
                          }
                        >                          <td>{p.fecha}</td>
                          <td>{etiquetaTienda(p.sucursal_origen)}</td>
                          <td style={{ fontWeight: 700 }}>{etiquetaTienda(p.sucursal_destino)}</td>
                          <td>{fmt(p.monto)}</td>
                          <td style={{ fontWeight: 700 }}>{fmt(p.saldo)}</td>
                          <td>
                            {esEnvioMain && p.estado === 'liquidado'
                              ? `Cargado corte${p.area_corte ? ` ${p.area_corte}` : ''}`
                              : etiquetaEstadoPrestamo(p)}
                          </td>
                          <td className="muted" style={{ fontSize: '0.8rem' }}>{etiquetaColectaPrestamo(p)}</td>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            <button
                              type="button"
                              className="btn btn-ghost"
                              style={{ padding: '0.2rem 0.4rem' }}
                              onClick={() => imprimirPrestamoSucursal(p)}
                            >
                              Imprimir (firma)
                            </button>
                            {!esEnvioMain && pendiente && puedeAbonarLiquidarPrestamosArea && (
                              <>
                                <button
                                  type="button"
                                  className="btn btn-ghost"
                                  style={{ padding: '0.2rem 0.4rem' }}
                                  onClick={() => cobrarPrestamoSucursal(p, false)}
                                >
                                  Abonar
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-primary"
                                  style={{ padding: '0.2rem 0.4rem', fontSize: '0.8rem' }}
                                  onClick={() => cobrarPrestamoSucursal(p, true)}
                                >
                                  Liquidar
                                </button>
                              </>
                            )}
                            {!esEnvioMain && !esOrigen && pendiente && (
                              <span className="muted" style={{ fontSize: '0.75rem', display: 'block' }}>
                                Origen: {etiquetaTienda(p.sucursal_origen)}
                              </span>
                            )}
                            {esEnvioMain && (
                              <span className="muted" style={{ fontSize: '0.8rem' }}>Sin IE</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            {!esMain && prestamosSucPendientesCobro.length > 0 && (
              <p className="muted" style={{ margin: '0.75rem 0 0', fontSize: '0.82rem' }}>
                {prestamosSucPendientesCobro.length} préstamo(s) pendiente(s) de cobro en esta tienda.
              </p>
            )}
          </div>
          )}
        </>
      )}

      {pestana === 'prestamos_emp' && (
        <>
          <div className="card">
            <h3 style={{ margin: '0 0 0.75rem' }}>Préstamo a empleado</h3>
            <p className="muted" style={{ fontSize: '0.85rem' }}>
              {prestamoSelOmiteCorte ? (
                <>
                  Usuario <strong>MAIN</strong>: el administrador registra el préstamo.
                  <strong> No va a corte</strong>; en <strong>nómina</strong> se descuenta automáticamente{' '}
                  <strong>${CUOTA_SEMANAL_MINIMA}</strong> por semana hasta liquidar.
                </>
              ) : (
                <>
                  El monto se carga al <strong>corte</strong> del área elegida al aprobarse.
                  En <strong>nómina</strong> se descuenta automáticamente <strong>${CUOTA_SEMANAL_MINIMA}</strong> por semana;
                  si el saldo es menor, se deduce el remanente hasta liquidar.
                </>
              )}
            </p>
            {esMain && (
              <p className="muted" style={{ fontSize: '0.82rem', marginTop: 0 }}>
                En MAIN también aparecen usuarios MAIN/indirectos (solo aquí). Sus préstamos no afectan el corte.
              </p>
            )}
            <div className="grid-2">
              <select className="select" value={prestEmpForm.usuarioId} onChange={(e) => setPrestEmpForm({ ...prestEmpForm, usuarioId: e.target.value })}>
                <option value="">{esMain ? '— Empleado o usuario MAIN —' : '— Empleado de esta tienda —'}</option>
                {esMain ? (
                  <>
                    {empleadosPrestamoGrupos.main.length > 0 && (
                      <optgroup label="Usuarios MAIN (sin corte · nómina $500/sem)">
                        {empleadosPrestamoGrupos.main.map((e) => (
                          <option key={e.id} value={e.id}>{e.nombre}</option>
                        ))}
                      </optgroup>
                    )}
                    {empleadosPrestamoGrupos.tienda.length > 0 && (
                      <optgroup label="Empleados de tienda (van a corte)">
                        {empleadosPrestamoGrupos.tienda.map((e) => (
                          <option key={e.id} value={e.id}>{e.nombre} · {etiquetaTienda(e.sucursal_id)}</option>
                        ))}
                      </optgroup>
                    )}
                  </>
                ) : (
                  empleadosPrestamo.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)
                )}
              </select>
              <input className="input" type="number" placeholder="Monto" value={prestEmpForm.monto} onChange={(e) => setPrestEmpForm({ ...prestEmpForm, monto: e.target.value })} />
              {!prestamoSelOmiteCorte && (
                <select className="select" value={prestEmpForm.areaCorte} onChange={(e) => setPrestEmpForm({ ...prestEmpForm, areaCorte: e.target.value })}>
                  {AREAS_CONTABILIDAD.map((a) => <option key={a} value={a}>Cargo a corte: {ETIQUETA_AREA[a]}</option>)}
                </select>
              )}
              {prestamoSelOmiteCorte && (
                <div className="muted" style={{ fontSize: '0.85rem', alignSelf: 'center' }}>
                  Sin cargo a corte · solo nómina
                </div>
              )}
              <input className="input" placeholder="Notas" value={prestEmpForm.notas} onChange={(e) => setPrestEmpForm({ ...prestEmpForm, notas: e.target.value })} />
            </div>
            <button type="button" className="btn btn-primary" style={{ marginTop: '0.75rem' }} onClick={guardarPrestamoEmpleado}>
              {prestamoSelOmiteCorte
                ? 'Registrar préstamo MAIN (solo nómina)'
                : 'Solicitar préstamo (requiere autorización)'}
            </button>
            <p className="muted" style={{ margin: '0.5rem 0 0', fontSize: '0.82rem' }}>
              {prestamoSelOmiteCorte ? (
                <>
                  Lo registra el administrador. No va a corte.
                  Cobro semanal: min({fmt(CUOTA_SEMANAL_MINIMA)}, saldo) en Nómina
                  {Number(prestEmpForm.monto) > MONTO_PRESTAMO_REQUIERE_SOCIO ? ' · montos +$1,000 requieren socio' : ''}.
                </>
              ) : (
                <>
                  Pendiente de autorización admin{!esAdmin ? ' (y socio si supera $1,000)' : ''}.
                  Corte: <strong>{ETIQUETA_AREA[prestEmpForm.areaCorte]}</strong>. Cobro semanal: min({fmt(CUOTA_SEMANAL_MINIMA)}, saldo) en Nómina.
                </>
              )}
            </p>
          </div>

          {editPrestamo && (
            <div className="card" style={{ borderLeft: '4px solid var(--brand-blue)' }}>
              <h3 style={{ margin: '0 0 0.5rem' }}>Editar préstamo · {editPrestamo.nombre_empleado}</h3>
              <p className="muted" style={{ fontSize: '0.82rem', marginTop: 0 }}>
                {prestamoOmiteCorte(editPrestamo)
                  ? 'Préstamo MAIN: sin corte; la cuota semanal ($500) se descuenta en nómina.'
                  : 'Área de cargo: Virtual o Abarrotes (o Garage). Si ya está en corte, el área no se puede cambiar.'}
              </p>
              <div className="grid-2">
                {!prestamoOmiteCorte(editPrestamo) && (
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.85rem' }}>
                    Área de cargo
                    <select className="select" value={editForm.area_corte} onChange={(e) => setEditForm({ ...editForm, area_corte: e.target.value })} disabled={Boolean(editPrestamo.cargado_corte)}>
                      {AREAS_CONTABILIDAD.map((a) => <option key={a} value={a}>{ETIQUETA_AREA[a]}</option>)}
                    </select>
                  </label>
                )}
                {prestamoOmiteCorte(editPrestamo) && (
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.85rem' }}>
                    Destino
                    <input className="input" value="Solo nómina (sin corte)" disabled />
                  </label>
                )}
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.85rem' }}>
                  Cuota semanal (fija)
                  <input
                    className="input"
                    type="number"
                    value={CUOTA_SEMANAL_MINIMA}
                    disabled
                    title="Se descuenta $500 por semana en nómina; el remanente en la última semana"
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.85rem' }}>
                  Monto original {(Number(editPrestamo.abono) || 0) > 0 ? '(bloqueado: ya hay abonos)' : ''}
                  <input
                    className="input"
                    type="number"
                    value={editForm.monto_original}
                    disabled={(Number(editPrestamo.abono) || 0) > 0}
                    onChange={(e) => setEditForm({ ...editForm, monto_original: e.target.value })}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.85rem' }}>
                  Notas
                  <input className="input" value={editForm.notas} onChange={(e) => setEditForm({ ...editForm, notas: e.target.value })} />
                </label>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
                <button type="button" className="btn btn-primary" onClick={guardarEdicionPrestamo}>Guardar cambios</button>
                <button type="button" className="btn btn-ghost" onClick={() => setEditPrestamo(null)}>Cancelar</button>
              </div>
            </div>
          )}

          <div className="card">
            <h3 style={{ margin: '0 0 0.75rem' }}>Préstamos</h3>
            <p className="muted" style={{ fontSize: '0.82rem', marginTop: 0 }}>
              Acciones: <strong>Editar</strong>, <strong>Eliminar</strong>, <strong>Abonar</strong> y <strong>Liquidar</strong>.
              La cuota semanal va a <strong>Contabilidad → Nómina</strong> ({fmt(CUOTA_SEMANAL_MINIMA)} o el resto si no alcanza).
            </p>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    {vePendientesTodasTiendas && <th>Tienda</th>}
                    <th>Estado</th>
                    <th>Empleado</th>
                    <th>Monto</th>
                    <th>Abonado</th>
                    <th>Saldo</th>
                    <th>Cuota→Nómina</th>
                    <th>Área cargo</th>
                    <th>En corte</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {prestamosEmp.length === 0 ? (
                    <tr>
                      <td colSpan={vePendientesTodasTiendas ? 10 : 9} className="muted">
                        No hay préstamos registrados{vePendientesTodasTiendas ? '' : ' en esta sucursal'}.
                        {prestamosPendientesAdmin.length > 0 && (
                          <> Hay {prestamosPendientesAdmin.length} pendiente(s) en la pestaña Pendientes.</>
                        )}
                      </td>
                    </tr>
                  ) : (
                    prestamosEmp.map((p) => {
                      const activo = p.estado === 'activo' && Number(p.saldo) > 0;
                      const puedeEditar = puedeOperarDocs && !['liquidado', 'rechazado', 'cancelado'].includes(p.estado);
                      const movPend = prestamoTieneSolicitudPendiente(p);
                      const tipoPend = p.solicitud_tipo === 'descuento'
                        ? 'descuento'
                        : p.solicitud_tipo === 'liquidacion'
                          ? 'liquidación'
                          : 'abono';
                      return (
                        <tr key={p.id} style={editPrestamo?.id === p.id ? { background: 'rgba(30, 100, 180, 0.08)' } : undefined}>
                          {vePendientesTodasTiendas && (
                            <td><strong>{etiquetaTienda(p.sucursal_id)}</strong></td>
                          )}
                          <td>
                            {etiquetaEstadoPrestamo(p)}
                            {movPend && (
                              <div className="muted" style={{ fontSize: '0.75rem', color: 'var(--warning, #c47f00)' }}>
                                Solicitud {tipoPend} {fmt(p.solicitud_monto)} pendiente
                              </div>
                            )}
                          </td>
                          <td>{p.nombre_empleado}</td>
                          <td>{fmt(p.monto_original)}</td>
                          <td className="muted">{fmt(p.abono)}</td>
                          <td style={{ fontWeight: 700 }}>{fmt(p.saldo)}</td>
                          <td title="Descuento automático en nómina: $500/sem o remanente">{fmt(CUOTA_SEMANAL_MINIMA)}</td>
                          <td className="muted">
                            {prestamoOmiteCorte(p)
                              ? 'Solo nómina'
                              : (ETIQUETA_AREA[p.area_corte] || p.area_corte || '—')}
                          </td>
                          <td className="muted">
                            {prestamoOmiteCorte(p) ? 'No (MAIN)' : (p.cargado_corte ? 'Sí' : 'No')}
                          </td>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            {puedeAprobarVales && p.estado === 'pendiente_admin' && (
                              <>
                                <button type="button" className="btn btn-primary" style={{ padding: '0.2rem 0.4rem', fontSize: '0.8rem' }} onClick={() => aprobarPAdmin(p.id)}>Aprobar</button>
                                {esAdmin && (
                                  <button
                                    type="button"
                                    className="btn btn-ghost"
                                    style={{ padding: '0.2rem 0.4rem', color: 'var(--danger)' }}
                                    onClick={() => rechazarPrestamo(supabase, p.id, { nombre: user?.nombre }).then((r) => { if (!r.ok) alert(r.error); else recargarTodo(); })}
                                  >
                                    Rechazar
                                  </button>
                                )}
                              </>
                            )}
                            {puedeEditar && (
                              <button type="button" className="btn btn-ghost" style={{ padding: '0.2rem 0.4rem' }} onClick={() => abrirEditarPrestamo(p)}>Editar</button>
                            )}
                            {puedeEliminarDocs && !['liquidado', 'cancelado'].includes(p.estado) && (
                              <button type="button" className="btn btn-ghost" style={{ padding: '0.2rem 0.4rem', color: 'var(--danger)' }} onClick={() => eliminarPrestamoEmp(p)}>Eliminar</button>
                            )}
                            {prestamoPuedeImprimir(p) && (
                              <button type="button" className="btn btn-ghost" style={{ padding: '0.2rem 0.4rem' }} onClick={() => imprimirPrestamoSi(p)}>Imprimir (firma)</button>
                            )}
                            {esAdmin && prestamoPuedeImprimir(p) && !p.cargado_corte && !prestamoOmiteCorte(p) && (
                              <button type="button" className="btn btn-ghost" style={{ padding: '0.2rem 0.4rem' }} onClick={() => cargarPrestamoManual(p)}>→ Corte</button>
                            )}
                            {activo && !movPend && (
                              <>
                                <button type="button" className="btn btn-ghost" style={{ padding: '0.2rem 0.4rem' }} onClick={() => pedirMovimientoPrestamo(p, 'abono')}>
                                  Abonar
                                </button>
                                {esAdmin && (
                                  <button type="button" className="btn btn-ghost" style={{ padding: '0.2rem 0.4rem' }} onClick={() => pedirMovimientoPrestamo(p, 'descuento')}>
                                    Descontar
                                  </button>
                                )}
                                <button type="button" className="btn btn-primary" style={{ padding: '0.2rem 0.4rem', fontSize: '0.8rem' }} onClick={() => pedirMovimientoPrestamo(p, 'liquidacion')}>
                                  Liquidar
                                </button>
                              </>
                            )}
                            {movPend && (esAdmin || puedeAprobarVales) && (
                              <>
                                <button type="button" className="btn btn-primary" style={{ padding: '0.2rem 0.4rem', fontSize: '0.8rem' }} onClick={() => aprobarMovPrestamo(p)}>Aprobar {tipoPend}</button>
                                <button type="button" className="btn btn-ghost" style={{ padding: '0.2rem 0.4rem', color: 'var(--danger)' }} onClick={() => rechazarMovPrestamo(p)}>Rechazar</button>
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
