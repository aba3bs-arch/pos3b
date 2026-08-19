import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { listarSucursales, etiquetaTienda, normalizarCodigoTienda } from '../constants/sucursales.js';
import { puedeGestionarUsuarios } from '../lib/roles.js';
import { estiloPastel } from '../lib/estadisticasData.js';
import {
  cargarContVirtual,
  cargarContAbarrotes,
  rangoMesContVirtual,
  rangoAnioContVirtual,
  MESES_CORTO_ES,
  agruparMovimientosPorDia,
  semanasDelMesContVirtual,
} from '../lib/contVirtualData.js';
import {
  crearCategoriaContVirtual,
  crearSubcategoriaContVirtual,
  crearDetalleContVirtual,
  editarCategoriaContVirtual,
  editarSubcategoriaContVirtual,
  editarDetalleContVirtual,
  eliminarCategoriaContVirtual,
  eliminarSubcategoriaContVirtual,
  eliminarDetalleContVirtual,
  listarCatalogoContVirtual,
  resolverNombresCatalogo,
  filtrarCatalogoPorFlujo,
  categoriaEnCatalogoCortes,
  setCategoriaEnCatalogoCortes,
  AVISO_FALTA_CONT_VIRTUAL,
} from '../lib/contVirtualCatalogo.js';
import {
  enriquecerCatalogoConEmpleados,
  esCategoriaEmpleado,
  plantillaDetallesEmpleado,
} from '../lib/catalogoEmpleadoGastos.js';
import { empleadosParaCorte } from '../lib/empleadosVisibles.js';
import { eliminarEgresoDesdePanelIe, registrarEgresoContVirtual } from '../lib/contVirtualEgresos.js';
import {
  registrarIngresoContVirtual,
  eliminarIngresoContVirtual,
} from '../lib/contVirtualIngresos.js';
import {
  AVISO_FALTA_INVERSIONES_OFICINA,
  cancelarInversionOficina,
  defaultsInversionPorLibro,
  listarInversionesOficina,
  registrarInversionOficinaProveedor,
} from '../lib/inversionesOficinaProveedor.js';
import { cargarReporteProveedoresIeAbarrotes } from '../lib/ieAbarrotesProveedores.js';
import { hoyYmdNogales, ymdNegocioDesdeIso, fmtYmdEs } from '../lib/corteCaja.js';
import './ContVirtual.css';

const LS_NOTAS = 'pos3b_cont_virtual_notas';
const DIAS_CAL = ['sáb', 'dom', 'lun', 'mar', 'mié', 'jue', 'vie'];
const ESTAD_PRESETS = [
  { id: 'hoy', label: 'Diario' },
  { id: 'semana', label: 'Semanal' },
  { id: 'mes', label: 'Mensual' },
  { id: 'ano', label: 'Anual' },
];

function fmt(n) {
  return (Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtMoney(n) {
  return `$ ${fmt(n)}`;
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function hoyYmd() {
  return hoyYmdNogales();
}

function fmtFechaCorta(ymd) {
  return fmtYmdEs(ymdNegocioDesdeIso(ymd) || ymd);
}

function fmtRangoCorto(desde, hasta) {
  const a = String(desde).slice(5).replace('-', '.');
  const b = String(hasta).slice(5).replace('-', '.');
  return `${a} ~ ${b}`;
}

function leerNotas() {
  try {
    const j = JSON.parse(localStorage.getItem(LS_NOTAS) || '[]');
    return Array.isArray(j) ? j : [];
  } catch {
    return [];
  }
}

function guardarNotas(lista) {
  localStorage.setItem(LS_NOTAS, JSON.stringify(lista.slice(0, 200)));
}

function IconBook({ active }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 5.5A2.5 2.5 0 016.5 3H20v16H6.5A2.5 2.5 0 004 16.5v-11z" />
      <path d="M4 16.5A2.5 2.5 0 016.5 19H20" />
      {active && <path d="M8 7h8M8 11h6" strokeLinecap="round" />}
    </svg>
  );
}

function IconChart() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" strokeLinecap="round" />
    </svg>
  );
}

function IconCoins() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <ellipse cx="12" cy="6" rx="7" ry="3" />
      <path d="M5 6v4c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
      <path d="M5 10v4c0 1.7 3.1 3 7 3s7-1.3 7-3v-4" />
    </svg>
  );
}

function IconMore() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <circle cx="6" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="18" cy="12" r="1.6" />
    </svg>
  );
}

function IconEmpty() {
  return (
    <svg className="cv-empty-icon" viewBox="0 0 80 80" fill="none">
      <ellipse cx="40" cy="52" rx="22" ry="14" stroke="#666" strokeWidth="2" />
      <path d="M18 52v-8c0-8 10-14 22-14s22 6 22 14v8" stroke="#666" strokeWidth="2" />
      <circle cx="40" cy="38" r="10" stroke="#666" strokeWidth="2" />
      <text x="40" y="42" textAnchor="middle" fill="#888" fontSize="12" fontWeight="700">$</text>
      <path d="M54 28c4-2 8 0 8 4s-2 6-6 6" stroke="#666" strokeWidth="1.5" fill="none" />
    </svg>
  );
}

function EmptyState() {
  return (
    <div className="cv-empty">
      <IconEmpty />
      <p>No hay datos disponibles</p>
    </div>
  );
}

function SummaryBar({
  ingresos,
  gastos,
  balance,
  ingresosPorTienda = [],
  labelGastos = 'Gastos',
  labelBalance = 'Balance',
}) {
  const [abierto, setAbierto] = useState(false);
  const [tiendaAbierta, setTiendaAbierta] = useState(null);
  const [recAbierta, setRecAbierta] = useState(null);
  const desglose = ingresosPorTienda.filter((t) => (Number(t.ingresos) || 0) > 0);
  const tieneDesglose = desglose.length > 0;

  return (
    <div className="cv-summary">
      <div className="cv-summary-totals">
        <div className={tieneDesglose ? 'cv-summary-ingreso-wrap' : undefined}>
          {tieneDesglose ? (
            <button
              type="button"
              className={`cv-summary-ingreso-btn${abierto ? ' open' : ''}`}
              onClick={() => {
                setAbierto((v) => {
                  if (v) {
                    setTiendaAbierta(null);
                    setRecAbierta(null);
                  }
                  return !v;
                });
              }}
              aria-expanded={abierto}
            >
              <div className="lbl">Ingresos <span className="chev" aria-hidden>▾</span></div>
              <div className="val ingreso">{fmt(ingresos)}</div>
            </button>
          ) : (
            <>
              <div className="lbl">Ingresos</div>
              <div className="val ingreso">{fmt(ingresos)}</div>
            </>
          )}
        </div>
        <div>
          <div className="lbl">{labelGastos}</div>
          <div className="val gasto">{fmt(gastos)}</div>
        </div>
        <div>
          <div className="lbl">{labelBalance}</div>
          <div className="val balance">{fmt(balance)}</div>
        </div>
      </div>
      {tieneDesglose && abierto && (
        <div className="cv-summary-desglose">
          <div className="cv-summary-desglose-hd">Por sucursal</div>
          {desglose.map((t) => {
            const recs = t.recolecciones || [];
            const expandida = tiendaAbierta === t.id;
            return (
              <div key={t.id} className="cv-summary-tienda">
                <button
                  type="button"
                  className={`cv-summary-desglose-row btn${expandida ? ' open' : ''}`}
                  onClick={() => {
                    setTiendaAbierta((prev) => (prev === t.id ? null : t.id));
                    setRecAbierta(null);
                  }}
                  aria-expanded={expandida}
                  disabled={!recs.length}
                >
                  <span>{t.label}</span>
                  <span className="amt">
                    {fmt(t.ingresos)}
                    {recs.length > 0 && <span className="chev" aria-hidden>▾</span>}
                  </span>
                </button>
                {expandida && recs.length > 0 && (
                  <div className="cv-summary-recs">
                    {recs.map((r) => {
                      const recOpen = recAbierta === r.id;
                      const gastosRec = r.gastos || [];
                      const tieneGastos = gastosRec.length > 0 || (Number(r.gastos_total) || 0) > 0;
                      return (
                        <div key={r.id} className="cv-summary-rec-block">
                          <button
                            type="button"
                            className={`cv-summary-rec-row btn${recOpen ? ' open' : ''}`}
                            onClick={() => setRecAbierta((prev) => (prev === r.id ? null : r.id))}
                            aria-expanded={recOpen}
                            title={tieneGastos ? 'Ver gastos de esta recolección' : 'Sin gastos embebidos'}
                          >
                            <span className="fecha">
                              {fmtFechaCorta(r.fecha)}
                              {r.folio ? ` · ${r.folio}` : ''}
                              {r.cuenta ? ` · ${r.cuenta}` : ''}
                            </span>
                            <span className="amt">
                              {fmt(r.monto)}
                              <span className="chev" aria-hidden>▾</span>
                            </span>
                          </button>
                          {recOpen && (
                            <div className="cv-summary-rec-gastos">
                              <div className="cv-summary-rec-gastos-hd">
                                Efectivo {fmt(r.efectivo)} · Gastos {fmt(r.gastos_total)}
                              </div>
                              {gastosRec.length === 0 ? (
                                <div className="cv-summary-rec-gasto-row muted">
                                  Sin detalle de gastos en esta recolección.
                                </div>
                              ) : (
                                gastosRec.map((g) => (
                                  <div key={g.id} className="cv-summary-rec-gasto-row">
                                    <span>
                                      {[g.categoria, g.subcategoria].filter(Boolean).join(' · ')}
                                      {g.empleado ? ` · ${g.empleado}` : ''}
                                      {g.comentario ? ` · ${g.comentario}` : ''}
                                    </span>
                                    <span className="amt-g">{fmt(g.monto)}</span>
                                  </div>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PeriodNav({ label, onPrev, onNext }) {
  return (
    <div className="cv-period-nav">
      <button type="button" aria-label="Anterior" onClick={onPrev}>‹</button>
      <span>{label}</span>
      <button type="button" aria-label="Siguiente" onClick={onNext}>›</button>
    </div>
  );
}

function buildCalendarCells(anio, mes, byFecha) {
  // Grid empieza en sábado (como captura)
  const first = new Date(anio, mes, 1);
  const startOffset = (first.getDay() + 1) % 7; // sáb=0
  const daysInMonth = new Date(anio, mes + 1, 0).getDate();
  const cells = [];
  const prevDays = new Date(anio, mes, 0).getDate();
  for (let i = 0; i < startOffset; i += 1) {
    const day = prevDays - startOffset + i + 1;
    const pm = mes === 0 ? 11 : mes - 1;
    const py = mes === 0 ? anio - 1 : anio;
    const ymd = `${py}-${String(pm + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    cells.push({ day, ymd, other: true, label: `${day}.${pm + 1}` });
  }
  for (let d = 1; d <= daysInMonth; d += 1) {
    const ymd = `${anio}-${String(mes + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const isFirst = d === 1;
    cells.push({
      day: d,
      ymd,
      other: false,
      label: isFirst ? `${d}.${mes + 1}` : String(d),
      data: byFecha[ymd],
    });
  }
  while (cells.length % 7 !== 0) {
    const n = cells.length - startOffset - daysInMonth + 1;
    const nm = mes === 11 ? 0 : mes + 1;
    const ny = mes === 11 ? anio + 1 : anio;
    const ymd = `${ny}-${String(nm + 1).padStart(2, '0')}-${String(n).padStart(2, '0')}`;
    cells.push({ day: n, ymd, other: true, label: `${n}.${nm + 1}` });
  }
  return cells;
}

export default function ContVirtual({ supabase, user, libro = 'antonio', sucursal: sucursalProp = '' }) {
  const esAdmin = puedeGestionarUsuarios(user?.rol);
  const esFrancisco = libro === 'francisco';
  const tituloLibro = esFrancisco ? 'IE ABARROTES' : 'IE VIRTUAL';
  const subtituloLibro = esFrancisco
    ? 'Francisco · ingresos y egresos de Abarrotes'
    : 'Antonio · ingresos y egresos de Virtual y Garage';
  const tiendas = useMemo(() => listarSucursales(), []);
  const sucursalActiva = normalizarCodigoTienda(sucursalProp) || '';

  const [nav, setNav] = useState('trans'); // trans | estad | cuentas | mas
  const [transTab, setTransTab] = useState('diario');
  const [anio, setAnio] = useState(() => Number(hoyYmdNogales().slice(0, 4)));
  const [mes, setMes] = useState(() => Number(hoyYmdNogales().slice(5, 7)) - 1);
  const [estadPreset, setEstadPreset] = useState('mes');
  const [estadTab, setEstadTab] = useState('gastos');
  const [mesExpandido, setMesExpandido] = useState(() => Number(hoyYmdNogales().slice(5, 7)) - 1);
  const hoyRef = useMemo(() => {
    const [y, m, d] = hoyYmdNogales().split('-').map(Number);
    return new Date(y, m - 1, d, 12, 0, 0);
  }, []);
  const [filtroTienda, setFiltroTienda] = useState('');
  const [filtroCuenta, setFiltroCuenta] = useState(''); // '' | virtual | garage
  const [showFiltro, setShowFiltro] = useState(true);
  const [showBuscar, setShowBuscar] = useState(false);
  const [qBusqueda, setQBusqueda] = useState('');
  const [filtroTipoBusq, setFiltroTipoBusq] = useState(''); // '' | ingreso | gasto
  const [showManual, setShowManual] = useState(false);
  const [manualTipo, setManualTipo] = useState('egreso'); // egreso | ingreso
  const [showInversion, setShowInversion] = useState(false);
  const [masVista, setMasVista] = useState('menu'); // menu | catalogo | inversiones
  const [catalogoFlujo, setCatalogoFlujo] = useState('egreso'); // egreso | ingreso

  const [cargando, setCargando] = useState(false);
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [catalogo, setCatalogo] = useState([]);
  const [usuariosCat, setUsuariosCat] = useState([]);
  const [catEmpSucursal, setCatEmpSucursal] = useState(() => normalizarCodigoTienda(sucursalProp) || '');
  const [avisoSql, setAvisoSql] = useState('');
  const [notas, setNotas] = useState(() => leerNotas());
  const [notaDraft, setNotaDraft] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [inversiones, setInversiones] = useState([]);
  const [avisoInversiones, setAvisoInversiones] = useState('');
  const [provReporte, setProvReporte] = useState(null);
  const [cargandoProv, setCargandoProv] = useState(false);
  const [provSel, setProvSel] = useState(null);

  const defsInv = defaultsInversionPorLibro(libro);
  const [manual, setManual] = useState({
    tipo: 'egreso', // ingreso | egreso
    fecha: hoyYmd(),
    sucursal_id: tiendas[0] || 'MAIN',
    cuenta: esFrancisco ? 'abarrotes' : 'virtual',
    categoria_id: 'manual',
    subcategoria_id: 'manual-otros',
    detalle_id: '',
    empleado_id: '',
    monto: '',
    descripcion: '',
  });
  const [inversionForm, setInversionForm] = useState({
    fecha: hoyYmd(),
    proveedor_nombre: '',
    monto: '',
    sucursal_destino: '',
    cuenta: defsInv.cuenta,
    modulo_corte: defsInv.modulo_corte,
    notas: '',
  });
  const [nuevaCat, setNuevaCat] = useState('');
  const [nuevaSub, setNuevaSub] = useState({ categoriaId: 'vales', nombre: '' });
  const [nuevaDet, setNuevaDet] = useState({ categoriaId: 'vales', subcategoriaId: '', nombre: '' });

  const rango = useMemo(() => {
    if (nav === 'estad') {
      if (estadPreset === 'hoy') {
        const h = hoyYmd();
        return { desde: h, hasta: h };
      }
      if (estadPreset === 'semana') {
        const d = new Date(anio, mes, Math.min(hoyRef.getDate(), 28));
        const day = d.getDay();
        const sinceSat = (day + 1) % 7;
        const ini = new Date(d);
        ini.setDate(d.getDate() - sinceSat);
        const fin = new Date(ini);
        fin.setDate(ini.getDate() + 6);
        const ymd = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
        return { desde: ymd(ini), hasta: ymd(fin) };
      }
      if (estadPreset === 'ano') return rangoAnioContVirtual(anio);
      return rangoMesContVirtual(anio, mes);
    }
    if (nav === 'trans' && transTab === 'mensual') return rangoAnioContVirtual(anio);
    return rangoMesContVirtual(anio, mes);
  }, [nav, transTab, anio, mes, estadPreset, hoyRef]);

  const labelPeriodo = useMemo(() => {
    if (nav === 'trans' && transTab === 'mensual') return String(anio);
    if (nav === 'estad' && estadPreset === 'ano') return String(anio);
    return `${MESES_CORTO_ES[mes]} ${anio}`;
  }, [nav, transTab, anio, mes, estadPreset]);

  const cargarCatalogo = useCallback(async () => {
    const res = await listarCatalogoContVirtual(supabase);
    setCatalogo((res.data || []).filter((c) => c.activo !== false));
    if (res.aviso) setAvisoSql(res.aviso);
  }, [supabase]);

  const cargarUsuariosCat = useCallback(async () => {
    if (!supabase) {
      setUsuariosCat([]);
      return;
    }
    const intentos = [
      '*',
      'id, nombre, rol, sucursal_id, tipo_empleado, activo',
      'id, nombre, rol, sucursal_id, activo',
    ];
    for (const cols of intentos) {
      const { data, error } = await supabase.from('usuarios').select(cols).order('nombre');
      if (!error) {
        setUsuariosCat(data || []);
        return;
      }
      console.error(error);
    }
    setUsuariosCat([]);
  }, [supabase]);

  useEffect(() => {
    if (sucursalActiva) setCatEmpSucursal(sucursalActiva);
  }, [sucursalActiva]);

  const catalogoVista = useMemo(
    () => enriquecerCatalogoConEmpleados(catalogo, usuariosCat, catEmpSucursal || sucursalActiva),
    [catalogo, usuariosCat, catEmpSucursal, sucursalActiva],
  );

  const catalogoFlujoVista = useMemo(
    () => filtrarCatalogoPorFlujo(catalogo, catalogoFlujo),
    [catalogo, catalogoFlujo],
  );

  const catalogoManualBase = useMemo(
    () => filtrarCatalogoPorFlujo(catalogo, manualTipo),
    [catalogo, manualTipo],
  );
  /** En egreso Empleado: subcategorías = personas; detalle = concepto (Consumo…). */
  const catalogoManual = useMemo(
    () => enriquecerCatalogoConEmpleados(
      catalogoManualBase,
      usuariosCat,
      manual.sucursal_id || catEmpSucursal || sucursalActiva,
    ),
    [catalogoManualBase, usuariosCat, manual.sucursal_id, catEmpSucursal, sucursalActiva],
  );

  const cargar = useCallback(async () => {
    if (!supabase || !rango?.desde || !rango?.hasta) return;
    setCargando(true);
    setError('');
    const res = esFrancisco
      ? await cargarContAbarrotes(supabase, {
          desde: rango.desde,
          hasta: rango.hasta,
          sucursal: filtroTienda || null,
        })
      : await cargarContVirtual(supabase, {
          desde: rango.desde,
          hasta: rango.hasta,
          sucursal: filtroTienda || null,
          cuenta: filtroCuenta || null,
        });
    setCargando(false);
    if (!res.ok) {
      setError(res.error || 'Error al cargar');
      setDatos(null);
      return;
    }
    setDatos(res);
    if (res.catalogo?.length) setCatalogo(res.catalogo.filter((c) => c.activo !== false));
    if (res.avisoCatalogo) setAvisoSql(res.avisoCatalogo);
  }, [supabase, rango, filtroTienda, filtroCuenta, esFrancisco]);

  useEffect(() => {
    cargarCatalogo();
  }, [cargarCatalogo]);

  useEffect(() => {
    cargarUsuariosCat();
  }, [cargarUsuariosCat]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const cargarProveedores = useCallback(async () => {
    if (!esFrancisco || !supabase || !rango?.desde || !rango?.hasta) {
      setProvReporte(null);
      return;
    }
    setCargandoProv(true);
    const res = await cargarReporteProveedoresIeAbarrotes(supabase, {
      desde: rango.desde,
      hasta: rango.hasta,
      sucursal: filtroTienda || null,
      egresosIeTotal: datos?.egresosTotal || 0,
      detalleGastosIe: datos?.detalleGastos || [],
    });
    setCargandoProv(false);
    if (!res.ok) {
      setProvReporte({ ok: false, error: res.error, porProveedor: [], totales: {} });
      return;
    }
    setProvReporte(res);
  }, [esFrancisco, supabase, rango?.desde, rango?.hasta, filtroTienda, datos?.egresosTotal, datos?.detalleGastos]);

  useEffect(() => {
    if (!esFrancisco) return;
    if (nav !== 'estad' && nav !== 'cuentas') return;
    if (cargando) return;
    cargarProveedores();
  }, [esFrancisco, nav, cargando, cargarProveedores]);

  const porDiaBase = useMemo(
    () => agruparMovimientosPorDia({
      detalleGastos: datos?.detalleGastos || [],
      ingresosPorDia: datos?.ingresosPorDia || [],
    }),
    [datos],
  );

  const porDia = useMemo(() => {
    const q = qBusqueda.trim().toLowerCase();
    const tipo = filtroTipoBusq;
    if (!q && !tipo) return porDiaBase;
    return porDiaBase
      .map((dia) => {
        const items = (dia.items || []).filter((it) => {
          if (tipo && it.tipo !== tipo) return false;
          if (!q) return true;
          const blob = [
            it.categoria,
            it.subcategoria,
            it.comentario,
            it.empleado,
            it.tienda,
            etiquetaTienda(it.tienda),
            it.cuenta,
            String(it.monto ?? ''),
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          return blob.includes(q);
        });
        if (!items.length) return null;
        let ingresos = 0;
        let gastos = 0;
        for (const it of items) {
          if (it.tipo === 'ingreso') ingresos += Number(it.monto) || 0;
          else gastos += Number(it.monto) || 0;
        }
        return {
          ...dia,
          items,
          ingresos: Math.round(ingresos * 100) / 100,
          gastos: Math.round(gastos * 100) / 100,
        };
      })
      .filter(Boolean);
  }, [porDiaBase, qBusqueda, filtroTipoBusq]);

  const byFecha = useMemo(() => Object.fromEntries(porDiaBase.map((d) => [d.fecha, d])), [porDiaBase]);

  const ingresosFiltrados = useMemo(() => {
    if (!qBusqueda.trim() && !filtroTipoBusq) return null;
    let ing = 0;
    let gas = 0;
    for (const d of porDia) {
      ing += d.ingresos || 0;
      gas += d.gastos || 0;
    }
    return {
      ingresos: Math.round(ing * 100) / 100,
      gastos: Math.round(gas * 100) / 100,
      balance: Math.round((ing - gas) * 100) / 100,
    };
  }, [porDia, qBusqueda, filtroTipoBusq]);

  const ingresos = ingresosFiltrados?.ingresos ?? (datos?.ingresosTotal || 0);
  const gastos = ingresosFiltrados?.gastos ?? (datos?.egresosTotal || 0);
  const balance = ingresosFiltrados?.balance ?? (datos?.neto ?? ingresos - gastos);

  const ingresosPorTiendaResumen = useMemo(() => {
    const itemsIngreso = [];
    if (ingresosFiltrados) {
      for (const d of porDia) {
        for (const it of d.items || []) {
          if (it.tipo === 'ingreso') itemsIngreso.push(it);
        }
      }
    } else {
      for (const it of datos?.ingresosPorDia || []) itemsIngreso.push(it);
    }

    const map = {};
    for (const it of itemsIngreso) {
      const id = it.tienda || 'MAIN';
      if (filtroTienda && id !== filtroTienda) continue;
      if (!map[id]) {
        map[id] = {
          id,
          label: etiquetaTienda(id),
          ingresos: 0,
          recolecciones: [],
        };
      }
      const monto = Number(it.monto) || 0;
      map[id].ingresos += monto;
      map[id].recolecciones.push({
        id: it.id || `${id}-${it.fecha}-${map[id].recolecciones.length}`,
        fecha: ymdNegocioDesdeIso(it.fecha) || String(it.fecha || '').slice(0, 10),
        monto: Math.round(monto * 100) / 100,
        folio: it.folio || '',
        cuenta: it.cuenta || '',
        efectivo: Number(it.efectivo) || 0,
        gastos_total: Number(it.gastos_total) || 0,
        gastos: Array.isArray(it.gastos) ? it.gastos : [],
      });
    }

    return Object.values(map)
      .map((t) => ({
        ...t,
        ingresos: Math.round(t.ingresos * 100) / 100,
        recolecciones: t.recolecciones
          .filter((r) => r.monto > 0 && r.fecha)
          .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))),
      }))
      .filter((t) => t.ingresos > 0)
      .sort((a, b) => b.ingresos - a.ingresos);
  }, [filtroTienda, ingresosFiltrados, porDia, datos]);

  const mesesAnio = useMemo(() => {
    if (transTab !== 'mensual' || !datos) return [];
    return MESES_CORTO_ES.map((lbl, i) => {
      const { desde, hasta } = rangoMesContVirtual(anio, i);
      let ing = 0;
      let gas = 0;
      for (const d of porDiaBase) {
        if (d.fecha >= desde && d.fecha <= hasta) {
          ing += d.ingresos;
          gas += d.gastos;
        }
      }
      return {
        i,
        lbl,
        ingresos: Math.round(ing * 100) / 100,
        gastos: Math.round(gas * 100) / 100,
        balance: Math.round((ing - gas) * 100) / 100,
        semanas: semanasDelMesContVirtual(anio, i, porDiaBase),
      };
    }).filter((m) => m.i <= hoyRef.getMonth() || anio < hoyRef.getFullYear() || m.ingresos || m.gastos)
      .reverse();
  }, [transTab, datos, anio, porDiaBase, hoyRef]);

  const calCells = useMemo(() => buildCalendarCells(anio, mes, byFecha), [anio, mes, byFecha]);

  const subsManual = useMemo(() => {
    const cat = catalogoManual.find((c) => c.id === manual.categoria_id);
    return (cat?.subcategorias || []).filter((s) => s.activo !== false);
  }, [catalogoManual, manual.categoria_id]);

  const manualEsEmpleado = esCategoriaEmpleado(catalogo.find((c) => c.id === manual.categoria_id));

  const detsManual = useMemo(() => {
    if (manualEsEmpleado) {
      const catM = catalogoManual.find((c) => c.id === manual.categoria_id);
      const plantilla = catM?.plantilla_detalles || plantillaDetallesEmpleado(catM);
      const subViva = subsManual.find((s) => s.id === manual.subcategoria_id);
      const dets = (subViva?.detalles || []).filter((d) => d.activo !== false);
      if (dets.length) return dets;
      return (plantilla || []).map((d, i) => ({
        id: d.id || `emp-det-${i}`,
        nombre: d.nombre,
        activo: true,
        fijo: true,
      }));
    }
    const sub = subsManual.find((s) => s.id === manual.subcategoria_id);
    return (sub?.detalles || []).filter((d) => d.activo !== false);
  }, [manualEsEmpleado, catalogoManual, manual.categoria_id, subsManual, manual.subcategoria_id]);

  const subsParaNuevoDet = useMemo(() => {
    const cat = catalogoFlujoVista.find((c) => c.id === nuevaDet.categoriaId);
    return (cat?.subcategorias || []).filter((s) => s.activo !== false);
  }, [catalogoFlujoVista, nuevaDet.categoriaId]);

  const shiftPeriod = (dir) => {
    if ((nav === 'trans' && transTab === 'mensual') || (nav === 'estad' && estadPreset === 'ano')) {
      setAnio((y) => y + dir);
      return;
    }
    setMes((m) => {
      let nm = m + dir;
      let ny = anio;
      if (nm < 0) {
        nm = 11;
        ny -= 1;
      } else if (nm > 11) {
        nm = 0;
        ny += 1;
      }
      setAnio(ny);
      return nm;
    });
  };

  const cargarInversiones = useCallback(async () => {
    if (!supabase) return;
    const res = await listarInversionesOficina(supabase, { libro: defsInv.libro, limit: 80 });
    setInversiones(res.data || []);
    setAvisoInversiones(res.aviso || '');
  }, [supabase, defsInv.libro]);

  useEffect(() => {
    if (masVista === 'inversiones') cargarInversiones();
  }, [masVista, cargarInversiones]);

  const guardarManual = async () => {
    const esIngreso = manualTipo === 'ingreso';
    if (!esAdmin) {
      return alert(esIngreso
        ? 'Solo el administrador puede capturar ingresos manuales.'
        : 'Solo el administrador puede capturar egresos manuales.');
    }
    const monto = Number(manual.monto);
    if (!(monto > 0)) return alert('Indica un monto válido.');
    if (!manual.sucursal_id) return alert(esIngreso ? 'Elige la sucursal del ingreso.' : 'Elige la sucursal del egreso.');
    if (!manual.categoria_id) return alert('Elige categoría.');
    const catRaw = catalogo.find((c) => c.id === manual.categoria_id);
    const catEmp = !esIngreso && esCategoriaEmpleado(catRaw);
    const catVista = catalogoManual.find((c) => c.id === manual.categoria_id);
    const subViva = (catVista?.subcategorias || []).find((s) => s.id === manual.subcategoria_id);
    if (catEmp && !(subViva?.es_empleado_vivo || manual.empleado_id)) {
      return alert('Elige el empleado.');
    }

    let subcategoria_id = manual.subcategoria_id || null;
    let detalle_id = manual.detalle_id || null;
    let empNombre = user?.nombre || 'Administrador';

    let conceptoNom = '';
    if (catEmp && subViva?.es_empleado_vivo) {
      conceptoNom = String(
        detsManual.find((d) => d.id === manual.detalle_id)?.nombre
        || (subViva.detalles || []).find((d) => d.id === manual.detalle_id)?.nombre
        || '',
      ).trim();
      const dn = conceptoNom.toUpperCase();
      const tipoHit = (catRaw?.subcategorias || []).find((s) => {
        const sn = String(s.nombre || '').trim().toUpperCase();
        if (!sn || !dn) return false;
        const sn0 = sn.split(/\s+/)[0];
        const dn0 = dn.split(/\s+/)[0];
        return sn === dn || sn.includes(dn0) || dn.includes(sn0);
      });
      subcategoria_id = tipoHit?.id || null;
      detalle_id = null;
      empNombre = subViva.nombre || empNombre;
    }

    const nombres = resolverNombresCatalogo(
      catalogo,
      manual.categoria_id,
      subcategoria_id,
      detalle_id,
    );
    if (catEmp && subViva?.es_empleado_vivo) {
      nombres.subcategoria_nombre = conceptoNom || nombres.subcategoria_nombre;
      nombres.detalle_nombre = null;
    }

    const payload = {
      fecha: manual.fecha || hoyYmd(),
      sucursal_id: manual.sucursal_id,
      cuenta: manual.cuenta || (esFrancisco ? 'abarrotes' : 'virtual'),
      categoria_id: manual.categoria_id,
      categoria_nombre: nombres.categoria_nombre,
      subcategoria_id,
      subcategoria_nombre: nombres.subcategoria_nombre,
      detalle_id,
      detalle_nombre: nombres.detalle_nombre || null,
      monto,
      descripcion: manual.descripcion,
      fuente: 'manual',
      usuario_nombre: empNombre,
    };
    setGuardando(true);
    const res = esIngreso
      ? await registrarIngresoContVirtual(supabase, payload)
      : await registrarEgresoContVirtual(supabase, payload);
    setGuardando(false);
    if (!res.ok) return alert(res.error);
    if (res.aviso) alert(res.aviso);
    setManual((m) => ({ ...m, monto: '', descripcion: '', empleado_id: '' }));
    setShowManual(false);
    cargar();
  };

  const abrirManual = (tipo = 'egreso') => {
    setManualTipo(tipo);
    const cats = filtrarCatalogoPorFlujo(catalogo, tipo);
    const prefer = tipo === 'ingreso'
      ? (cats.find((c) => c.id === 'ing-manual') || cats[0])
      : (cats.find((c) => c.id === 'manual') || cats[0]);
    const firstSub = (prefer?.subcategorias || []).find((s) => s.activo !== false);
    const firstDet = (firstSub?.detalles || []).find((d) => d.activo !== false);
    setManual((m) => ({
      ...m,
      tipo,
      fecha: hoyYmd(),
      cuenta: esFrancisco ? 'abarrotes' : m.cuenta || 'virtual',
      categoria_id: prefer?.id || (tipo === 'ingreso' ? 'ing-manual' : 'manual'),
      subcategoria_id: firstSub?.id || (tipo === 'ingreso' ? 'ing-manual-otros' : 'manual-otros'),
      detalle_id: firstDet?.id || '',
      empleado_id: '',
      monto: '',
      descripcion: '',
    }));
    setShowManual(true);
  };

  const guardarInversion = async () => {
    if (!esAdmin) return alert('Solo el administrador puede registrar inversiones de oficina.');
    setGuardando(true);
    const res = await registrarInversionOficinaProveedor(
      supabase,
      {
        ...inversionForm,
        libro: defsInv.libro,
        sucursal_origen: 'MAIN',
        monto: Number(inversionForm.monto),
      },
      { nombreActor: user?.nombre || 'Administrador' },
    );
    setGuardando(false);
    if (!res.ok) return alert(res.error);
    alert(res.mensaje);
    setInversionForm((f) => ({
      ...f,
      proveedor_nombre: '',
      monto: '',
      notas: '',
      fecha: hoyYmd(),
    }));
    setShowInversion(false);
    cargar();
    if (masVista === 'inversiones') cargarInversiones();
  };

  const cancelarInv = async (inv) => {
    if (!esAdmin) return;
    if (!confirm('¿Cancelar esta inversión? Solo si aún no tiene abonos. El egreso en IE permanece (ajústalo manualmente si aplica).')) return;
    const res = await cancelarInversionOficina(supabase, inv.id, { nombre: user?.nombre });
    if (!res.ok) return alert(res.error);
    cargarInversiones();
  };

  const borrarEgreso = async (row) => {
    if (!esAdmin) return;
    if (row?.tipo === 'ingreso') {
      if (!row.manual && row.tipo_mov !== 'manual' && !String(row.id || '').startsWith('local-ing')) {
        return; // recolecciones no se borran aquí
      }
      if (!confirm(`¿Eliminar este ingreso de ${tituloLibro}?\n\n${row.comentario || ''}\n${fmt(row.monto)}`)) return;
      const res = await eliminarIngresoContVirtual(supabase, row.id);
      if (!res.ok) return alert(res.error || 'No se pudo eliminar.');
      cargar();
      return;
    }
    if (!confirm(`¿Eliminar este egreso de ${tituloLibro}?\n\n${row.categoria || ''}${row.subcategoria ? ` · ${row.subcategoria}` : ''}\n${fmt(row.monto)}`)) return;
    const res = await eliminarEgresoDesdePanelIe(supabase, row);
    if (!res.ok) return alert(res.error || 'No se pudo eliminar.');
    cargar();
  };

  const agregarNota = () => {
    const texto = notaDraft.trim();
    if (!texto) return;
    const lista = [{ id: Date.now(), fecha: hoyYmd(), texto }, ...notas];
    setNotas(lista);
    guardarNotas(lista);
    setNotaDraft('');
  };

  const agregarCategoria = async () => {
    if (!esAdmin) return;
    setGuardando(true);
    const res = await crearCategoriaContVirtual(supabase, { nombre: nuevaCat, flujo: catalogoFlujo });
    setGuardando(false);
    if (!res.ok) return alert(res.error);
    setNuevaCat('');
    await cargarCatalogo();
  };

  const agregarSub = async () => {
    if (!esAdmin) return;
    setGuardando(true);
    const res = await crearSubcategoriaContVirtual(supabase, {
      categoriaId: nuevaSub.categoriaId,
      nombre: nuevaSub.nombre,
    });
    setGuardando(false);
    if (!res.ok) return alert(res.error);
    setNuevaSub((s) => ({ ...s, nombre: '' }));
    await cargarCatalogo();
  };

  const agregarDetalle = async () => {
    if (!esAdmin) return;
    if (!nuevaDet.subcategoriaId) return alert('Elige la subcategoría.');
    setGuardando(true);
    const res = await crearDetalleContVirtual(supabase, {
      subcategoriaId: nuevaDet.subcategoriaId,
      nombre: nuevaDet.nombre,
    });
    setGuardando(false);
    if (!res.ok) return alert(res.error);
    setNuevaDet((d) => ({ ...d, nombre: '' }));
    await cargarCatalogo();
  };

  const editarCategoria = async (cat) => {
    if (!esAdmin || !cat) return;
    if (esCategoriaEmpleado(cat)) {
      return alert(
        'La categoría Empleado no se renombra. Edita solo sus tipos (Consumo, Anticipo…). Los empleados se dan de alta en el módulo Empleados.',
      );
    }
    const nombre = prompt('Nuevo nombre de categoría:', cat.nombre);
    if (nombre == null) return;
    if (!String(nombre).trim()) return alert('Nombre obligatorio.');
    const res = await editarCategoriaContVirtual(supabase, cat.id, { nombre });
    if (!res.ok) return alert(res.error);
    await cargarCatalogo();
  };

  const editarSub = async (sub) => {
    if (!esAdmin || !sub) return;
    const nombre = prompt('Nuevo nombre de subcategoría:', sub.nombre);
    if (nombre == null) return;
    if (!String(nombre).trim()) return alert('Nombre obligatorio.');
    const res = await editarSubcategoriaContVirtual(supabase, sub.id, { nombre });
    if (!res.ok) return alert(res.error);
    await cargarCatalogo();
  };

  const editarDetalle = async (det) => {
    if (!esAdmin || !det) return;
    const nombre = prompt('Nuevo nombre de detalle:', det.nombre);
    if (nombre == null) return;
    if (!String(nombre).trim()) return alert('Nombre obligatorio.');
    const res = await editarDetalleContVirtual(supabase, det.id, { nombre });
    if (!res.ok) return alert(res.error);
    await cargarCatalogo();
  };

  const borrarCategoria = async (cat) => {
    if (!esAdmin || !cat) return;
    if (esCategoriaEmpleado(cat)) {
      return alert('Empleado es categoría del sistema (cortes / nómina) y no se puede eliminar ni desactivar.');
    }
    const msg = cat.fijo
      ? `¿Desactivar la categoría del sistema «${cat.nombre}»?\n(No se borra del todo para no romper egresos históricos.)`
      : `¿Eliminar la categoría «${cat.nombre}» y sus subcategorías/detalles?`;
    if (!confirm(msg)) return;
    const res = await eliminarCategoriaContVirtual(supabase, cat.id);
    if (!res.ok) return alert(res.error);
    await cargarCatalogo();
  };

  const borrarSub = async (sub) => {
    if (!esAdmin || !sub) return;
    const msg = sub.fijo
      ? `¿Desactivar la subcategoría del sistema «${sub.nombre}»?`
      : `¿Eliminar la subcategoría «${sub.nombre}» y sus detalles?`;
    if (!confirm(msg)) return;
    const res = await eliminarSubcategoriaContVirtual(supabase, sub.id);
    if (!res.ok) return alert(res.error);
    await cargarCatalogo();
  };

  const borrarDetalle = async (det) => {
    if (!esAdmin || !det) return;
    const msg = det.fijo
      ? `¿Desactivar el detalle del sistema «${det.nombre}»?`
      : `¿Eliminar el detalle «${det.nombre}»?`;
    if (!confirm(msg)) return;
    const res = await eliminarDetalleContVirtual(supabase, det.id);
    if (!res.ok) return alert(res.error);
    await cargarCatalogo();
  };

  const nuevaSubEnCat = async (categoriaId, categoriaNombre) => {
    if (!esAdmin) return;
    const nombre = prompt(`Nueva subcategoría en «${categoriaNombre}»:`);
    if (!nombre?.trim()) return;
    const res = await crearSubcategoriaContVirtual(supabase, { categoriaId, nombre });
    if (!res.ok) return alert(res.error);
    await cargarCatalogo();
  };

  const toggleEnviarACortes = async (cat) => {
    if (!esAdmin || !cat) return;
    if (esCategoriaEmpleado(cat)) {
      return alert('Empleado siempre está en el catálogo de cortes (nómina).');
    }
    if (String(cat.flujo || '').toLowerCase() === 'ingreso') {
      return alert('Las cuentas de ingreso no se envían al catálogo de gastos de cortes.');
    }
    const yaEnCortes = categoriaEnCatalogoCortes(cat);
    const msg = yaEnCortes
      ? `¿Quitar «${cat.nombre}» del catálogo de gastos de cortes?\n\nDejará de aparecer en Corte Virtual, Abarrotes y Garage.`
      : `¿Enviar «${cat.nombre}» al catálogo de gastos de cortes?\n\nAparecerá para capturar gastos en Corte Virtual, Abarrotes y Garage.`;
    if (!confirm(msg)) return;
    setGuardando(true);
    const res = await setCategoriaEnCatalogoCortes(supabase, cat.id, !yaEnCortes);
    setGuardando(false);
    if (!res.ok) return alert(res.error);
    await cargarCatalogo();
  };

  const editarEmpleadoCat = async (emp) => {
    if (!esAdmin || !emp?.usuario_id || !supabase) return;
    const nombre = prompt('Nombre del empleado:', emp.nombre || '');
    if (nombre == null) return;
    const n = String(nombre).trim();
    if (!n) return alert('Nombre obligatorio.');
    const { error } = await supabase.from('usuarios').update({ nombre: n }).eq('id', emp.usuario_id);
    if (error) return alert(error.message);
    await cargarUsuariosCat();
  };

  const eliminarEmpleadoCat = async (emp) => {
    if (!esAdmin || !emp?.usuario_id || !supabase) return;
    if (
      !confirm(
        `¿Dar de baja a ${emp.nombre}?\n\nNo podrá iniciar sesión ni aparecerá en cortes/nómina. Puedes reactivarlo en Empleados.`,
      )
    ) {
      return;
    }
    const { error } = await supabase.from('usuarios').update({ activo: false }).eq('id', emp.usuario_id);
    if (error) {
      if (String(error.message).includes('activo')) {
        return alert('Ejecuta supabase/fix_usuarios_activo.sql en Supabase.');
      }
      return alert(error.message);
    }
    await cargarUsuariosCat();
  };

  const nuevoDetalleEnSub = async (subcategoriaId, subNombre) => {
    if (!esAdmin) return;
    const nombre = prompt(`Nuevo detalle en «${subNombre}»:`);
    if (!nombre?.trim()) return;
    const res = await crearDetalleContVirtual(supabase, { subcategoriaId, nombre });
    if (!res.ok) return alert(res.error);
    await cargarCatalogo();
  };

  const exportarCsv = () => {
    const rows = [['fecha', 'tipo', 'sucursal', 'cuenta', 'categoria', 'subcategoria', 'monto', 'detalle']];
    for (const g of datos?.detalleGastos || []) {
      rows.push([
        g.fecha,
        'gasto',
        g.tienda || '',
        g.cuenta || '',
        g.categoria,
        g.subcategoria || '',
        g.monto,
        g.comentario || '',
      ]);
    }
    for (const i of datos?.ingresosPorDia || []) {
      rows.push([
        i.fecha,
        'ingreso',
        i.tienda || '',
        i.cuenta || '',
        'Cierre',
        '',
        i.monto,
        i.comentario || '',
      ]);
    }
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cont-virtual-${rango.desde}_${rango.hasta}${filtroTienda ? `-${filtroTienda}` : ''}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const pastelSlices = estadTab === 'gastos' ? datos?.pastelCategorias : null;
  const ingresosSlices = useMemo(() => {
    if (estadTab !== 'ingresos') return [];
    const map = {};
    for (const t of datos?.ingresosPorTienda || []) {
      if (t.ingresos > 0) map[t.label] = t.ingresos;
    }
    const entries = Object.entries(map);
    if (!entries.length) return [];
    const sum = entries.reduce((a, [, v]) => a + v, 0) || 1;
    const colors = ['#4ea8f5', '#5dade2', '#3498db', '#2980b9', '#1abc9c'];
    let start = 0;
    return entries.map(([label, total], i) => {
      const pct = (total / sum) * 100;
      const slice = { id: label, label, total, pct, color: colors[i % colors.length], pieStart: start, pieEnd: start + pct };
      start += pct;
      return slice;
    });
  }, [estadTab, datos]);

  const slicesActivos = estadTab === 'gastos' ? (pastelSlices || []) : ingresosSlices;

  const renderDiario = () => {
    if (!porDia.length) return <EmptyState />;
    return porDia.map((dia) => (
      <div key={dia.fecha} className="cv-day-block">
        <div className="cv-day-head">
          <span className="fecha">{fmtFechaCorta(dia.fecha)}</span>
          <span className="totales">
            <span style={{ color: 'var(--cv-ingreso)' }}>{fmt(dia.ingresos)}</span>
            <span style={{ color: 'var(--cv-gasto)' }}>{fmt(dia.gastos)}</span>
          </span>
        </div>
        {(dia.items || []).map((it) => (
          <div key={`${it.tipo}-${it.id}`} className="cv-row">
            <span className={`cv-row-dot ${it.tipo === 'ingreso' ? 'ingreso' : 'gasto'}`} />
            <div className="cv-row-main">
              <div className="title">
                {it.tipo === 'ingreso'
                  ? (String(it.comentario || '').startsWith('Recolección')
                    ? it.comentario
                    : (it.comentario || 'Ingreso / cierre'))
                  : `${it.categoria}${it.subcategoria ? ` · ${it.subcategoria}` : ''}`}
              </div>
              <div className="sub">
                {[
                  it.cuenta === 'garage' ? 'Garage' : it.cuenta === 'abarrotes' ? 'Abarrotes' : it.cuenta === 'virtual' ? 'Virtual' : null,
                  etiquetaTienda(it.tienda || 'MAIN'),
                  it.empleado || null,
                ]
                  .filter(Boolean)
                  .join(' · ') || '—'}
              </div>
            </div>
            <span className={`cv-row-amt ${it.tipo === 'ingreso' ? 'ingreso' : 'gasto'}`}>
              {fmt(it.monto)}
            </span>
            {esAdmin && (it.tipo === 'gasto' || (it.tipo === 'ingreso' && (it.manual || it.tipo_mov === 'manual'))) && (
              <button type="button" className="cv-row-del" title={it.tipo === 'ingreso' ? 'Eliminar ingreso' : 'Eliminar egreso'} onClick={() => borrarEgreso(it)}>✕</button>
            )}
          </div>
        ))}
      </div>
    ));
  };

  const renderCalendario = () => (
    <div className="cv-cal">
      <div className="cv-cal-head">
        {DIAS_CAL.map((d) => (
          <div key={d} className={d === 'dom' ? 'dom' : ''}>{d}</div>
        ))}
      </div>
      <div className="cv-cal-grid">
        {calCells.map((c, idx) => {
          const dow = idx % 7;
          const isDom = dow === 1;
          return (
            <div key={`${c.ymd}-${idx}`} className={`cv-cal-cell${c.other ? ' other' : ''}${isDom ? ' dom' : ''}`}>
              <span className="n">{c.label}</span>
              {c.data?.ingresos > 0 && <span className="amt-i">{fmt(c.data.ingresos)}</span>}
              {c.data?.gastos > 0 && <span className="amt-g">{fmt(c.data.gastos)}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderMensual = () => {
    if (!mesesAnio.length) return <EmptyState />;
    return mesesAnio.map((m) => (
      <div key={m.i}>
        <button
          type="button"
          className="cv-mes-row"
          onClick={() => setMesExpandido(mesExpandido === m.i ? -1 : m.i)}
        >
          <span className="mes-lbl">{m.lbl}</span>
          <span className="ing">{fmt(m.ingresos)}</span>
          <span className="gas">{fmt(m.gastos)}</span>
          <span className="bal">{fmt(m.balance)}</span>
        </button>
        {mesExpandido === m.i && m.semanas.map((s) => (
          <div key={`${s.desde}-${s.hasta}`} className="cv-semana">
            <span className="rango">{fmtRangoCorto(s.desde, s.hasta)}</span>
            <span style={{ color: 'var(--cv-ingreso)' }}>{fmt(s.ingresos)}</span>
            <span style={{ color: 'var(--cv-gasto)', textAlign: 'right' }}>{fmt(s.gastos)}</span>
            <span style={{ color: 'var(--cv-muted)', textAlign: 'right' }}>{fmt(s.balance)}</span>
          </div>
        ))}
      </div>
    ));
  };

  const renderTotal = () => (
    <>
      <button type="button" className="cv-link-row" onClick={() => { setNav('mas'); setMasVista('catalogo'); }}>
        <span>📝</span>
        <span>
          <strong>Presup</strong>
          <div style={{ fontSize: '0.75rem', color: 'var(--cv-muted)' }}>Ajustes de presupuestos ›</div>
        </span>
        <span className="chev">›</span>
      </button>
      <div className="cv-panel">
        <div className="cv-panel-hd">
          <span>🪙 Cuentas</span>
          <span className="rango">{fmtFechaCorta(rango.desde)} ~ {String(rango.hasta).slice(8)}.{String(rango.hasta).slice(5, 7)}</span>
        </div>
        <div className="cv-panel-row">
          <span>Comparar los gastos (último mes)</span>
          <strong>100%</strong>
        </div>
        <div className="cv-panel-row">
          <span>Gastos (Efectivo, Cuentas)</span>
          <strong>{fmtMoney(gastos)}</strong>
        </div>
        <div className="cv-panel-row">
          <span>Gastos (Tarjetas de crédito)</span>
          <strong>$ 0.00</strong>
        </div>
        <div className="cv-panel-row">
          <span>Transferencia (Efectivo, Cuentas → )</span>
          <strong>$ 0.00</strong>
        </div>
      </div>
      <button type="button" className="cv-export" onClick={exportarCsv}>
        <span>📊</span>
        <span>Exportar a un archivo Excel y enviarlo por e-mail</span>
      </button>
    </>
  );

  const renderNota = () => {
    const delMes = notas.filter((n) => {
      const f = String(n.fecha || '');
      return f.startsWith(`${anio}-${String(mes + 1).padStart(2, '0')}`);
    });
    return (
      <>
        <div className="cv-nota-form">
          <textarea
            value={notaDraft}
            onChange={(e) => setNotaDraft(e.target.value)}
            placeholder="Escribe una nota…"
          />
          <button type="button" className="cv-btn" onClick={agregarNota}>Guardar nota</button>
        </div>
        {delMes.length === 0 ? (
          <EmptyState />
        ) : (
          delMes.map((n) => (
            <div key={n.id} className="cv-nota-item">
              <div className="meta">{fmtFechaCorta(n.fecha)}</div>
              <div>{n.texto}</div>
            </div>
          ))
        )}
      </>
    );
  };

  const renderTrans = () => (
    <>
      <div className="cv-top">
        <PeriodNav label={labelPeriodo} onPrev={() => shiftPeriod(-1)} onNext={() => shiftPeriod(1)} />
        <div className="cv-top-actions">
          <button type="button" className="cv-icon-btn" title="Favoritos" aria-label="Favoritos">★</button>
          <button
            type="button"
            className={`cv-icon-btn${showBuscar ? ' active' : ''}`}
            title="Buscar"
            aria-label="Buscar"
            onClick={() => { setShowBuscar((v) => !v); setShowFiltro(true); }}
          >
            ⌕
          </button>
          <button
            type="button"
            className={`cv-icon-btn${showFiltro ? ' active' : ''}`}
            title="Filtro"
            aria-label="Filtro"
            onClick={() => setShowFiltro((v) => !v)}
          >
            ⚙
          </button>
        </div>
      </div>
      <div className="cv-subtabs">
        {[
          ['diario', 'Diario'],
          ['calendario', 'Calendario'],
          ['mensual', 'Mensual'],
          ['total', 'Total'],
          ['nota', 'Nota'],
        ].map(([id, lbl]) => (
          <button key={id} type="button" className={`cv-subtab${transTab === id ? ' active' : ''}`} onClick={() => setTransTab(id)}>
            {lbl}
          </button>
        ))}
      </div>
      {(showFiltro || showBuscar) && (
        <div className="cv-filter-bar">
          <select value={filtroTienda} onChange={(e) => setFiltroTienda(e.target.value)} title="Sucursal">
            <option value="">Todas las sucursales</option>
            {tiendas.map((t) => (
              <option key={t} value={t}>{etiquetaTienda(t)}</option>
            ))}
          </select>
          {!esFrancisco && (
            <select value={filtroCuenta} onChange={(e) => setFiltroCuenta(e.target.value)}>
              <option value="">Cuentas: Virtual + Garage</option>
              <option value="virtual">Solo Virtual</option>
              <option value="garage">Solo Garage</option>
            </select>
          )}
          <button type="button" className="cv-btn ghost" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }} onClick={cargar}>
            Actualizar
          </button>
        </div>
      )}
      {showBuscar && (
        <div className="cv-filter-bar cv-search-bar">
          <input
            className="cv-search-input"
            value={qBusqueda}
            onChange={(e) => setQBusqueda(e.target.value)}
            placeholder="Buscar ingreso o egreso…"
            autoFocus
          />
          <select value={filtroTipoBusq} onChange={(e) => setFiltroTipoBusq(e.target.value)}>
            <option value="">Ingresos y egresos</option>
            <option value="ingreso">Solo ingresos</option>
            <option value="gasto">Solo egresos</option>
          </select>
          {(qBusqueda || filtroTipoBusq) && (
            <button
              type="button"
              className="cv-btn ghost"
              style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
              onClick={() => { setQBusqueda(''); setFiltroTipoBusq(''); }}
            >
              Limpiar
            </button>
          )}
        </div>
      )}
      {transTab !== 'nota' && (
        <SummaryBar
          ingresos={ingresos}
          gastos={gastos}
          balance={balance}
          ingresosPorTienda={ingresosPorTiendaResumen}
        />
      )}
      {cargando && <div className="cv-loading">Cargando…</div>}
      {!cargando && transTab === 'diario' && renderDiario()}
      {!cargando && transTab === 'calendario' && renderCalendario()}
      {!cargando && transTab === 'mensual' && renderMensual()}
      {!cargando && transTab === 'total' && renderTotal()}
      {!cargando && transTab === 'nota' && renderNota()}
    </>
  );

  const renderEstad = () => {
    const tot = provReporte?.totales || {};
    const listaProv = provReporte?.porProveedor || [];
    const detalleSel = provSel
      ? (provReporte?.detalleGastos || []).filter((g) => g.proveedor === provSel)
      : [];

    return (
    <>
      <div className="cv-estad-top">
        <PeriodNav label={labelPeriodo} onPrev={() => shiftPeriod(-1)} onNext={() => shiftPeriod(1)} />
        <select
          className="cv-chip"
          value={estadPreset}
          onChange={(e) => setEstadPreset(e.target.value)}
        >
          {ESTAD_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
      </div>
      <div className="cv-filter-bar">
        <select value={filtroTienda} onChange={(e) => setFiltroTienda(e.target.value)} title="Sucursal">
          <option value="">Todas las sucursales</option>
          {tiendas.map((t) => (
            <option key={t} value={t}>{etiquetaTienda(t)}</option>
          ))}
        </select>
        {!esFrancisco && (
          <select value={filtroCuenta} onChange={(e) => setFiltroCuenta(e.target.value)}>
            <option value="">Virtual + Garage</option>
            <option value="virtual">Solo Virtual</option>
            <option value="garage">Solo Garage</option>
          </select>
        )}
      </div>
      <div className="cv-estad-tabs">
        <button type="button" className={estadTab === 'ingresos' ? 'active' : ''} onClick={() => setEstadTab('ingresos')}>Ingresos</button>
        <button type="button" className={estadTab === 'gastos' ? 'active' : ''} onClick={() => setEstadTab('gastos')}>Gastos</button>
        {esFrancisco && (
          <button type="button" className={estadTab === 'proveedores' ? 'active' : ''} onClick={() => setEstadTab('proveedores')}>
            Proveedores
          </button>
        )}
      </div>

      {estadTab === 'proveedores' && esFrancisco ? (
        <div className="cv-prov-panel">
          {(cargando || cargandoProv) && <div className="cv-loading">Cargando ventas y gastos por proveedor…</div>}
          {!cargando && !cargandoProv && provReporte?.error && (
            <div className="cv-error">{provReporte.error}</div>
          )}
          {!cargando && !cargandoProv && !provReporte?.error && (
            <>
              <div className="cv-prov-kpis">
                <div className="cv-prov-kpi">
                  <span className="lbl">Ventas</span>
                  <strong className="ingreso">{fmtMoney(tot.ventas)}</strong>
                </div>
                <div className="cv-prov-kpi">
                  <span className="lbl">Gastos prov.</span>
                  <strong className="gasto">{fmtMoney(tot.gastos_proveedores)}</strong>
                </div>
                <div className="cv-prov-kpi">
                  <span className="lbl">Utilidad bruta</span>
                  <strong className={(tot.utilidad_bruta || 0) >= 0 ? 'ingreso' : 'gasto'}>{fmtMoney(tot.utilidad_bruta)}</strong>
                </div>
                <div className="cv-prov-kpi">
                  <span className="lbl">Ganancia neta</span>
                  <strong className={(tot.ganancia_neta || 0) >= 0 ? 'ingreso' : 'gasto'}>{fmtMoney(tot.ganancia_neta)}</strong>
                </div>
              </div>
              <p className="muted cv-prov-hint">
                Ventas POS por proveedor (vínculo producto). Gastos = pagos PROVEEDORES del corte.
                Utilidad bruta = ventas − costo. Ganancia neta = utilidad − egresos operativos IE
                ({fmtMoney(tot.gastos_operativos)}).
                {tot.margen_pct != null ? ` Margen ${tot.margen_pct}%.` : ''}
              </p>
              {(provReporte?.avisos || []).length > 0 && (
                <div className="cv-aviso">{provReporte.avisos.join(' · ')}</div>
              )}
              {!listaProv.length && <EmptyState />}
              {listaProv.map((p) => {
                const abierto = provSel === p.nombre;
                return (
                  <div key={p.id} className="cv-prov-row">
                    <button
                      type="button"
                      className={`cv-prov-row-hd${abierto ? ' open' : ''}`}
                      onClick={() => setProvSel(abierto ? null : p.nombre)}
                    >
                      <span className="name">{p.nombre}</span>
                      <span className="chev">{abierto ? '▾' : '›'}</span>
                    </button>
                    <div className="cv-prov-row-vals">
                      <span><em>Ventas</em> {fmtMoney(p.ventas)}</span>
                      <span><em>Gastos</em> {fmtMoney(p.gastos)}</span>
                      <span><em>Util.</em> {fmtMoney(p.utilidad_bruta)}</span>
                    </div>
                    {abierto && (
                      <div className="cv-prov-row-det">
                        <div className="item"><span>Costo mercancía</span><span>{fmtMoney(p.costo)}</span></div>
                        <div className="item"><span>Compras recibidas</span><span>{fmtMoney(p.compras)}</span></div>
                        <div className="item"><span>Piezas / tickets</span><span>{p.piezas} · {p.tickets}</span></div>
                        <div className="item"><span>Pagos a proveedor</span><span className="gasto">{fmtMoney(p.gastos)} ({p.movimientos_gasto})</span></div>
                        {detalleSel.length > 0 && (
                          <>
                            <strong className="cv-prov-det-hd">Movimientos de gasto</strong>
                            {detalleSel.map((g) => (
                              <div key={g.id} className="cv-prov-gasto">
                                <span>{fmtFechaCorta(g.fecha)} · {etiquetaTienda(g.tienda)}{g.subcategoria ? ` · ${g.subcategoria}` : ''}</span>
                                <span className="gasto">{fmtMoney(g.monto)}</span>
                              </div>
                            ))}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      ) : (
      <div className="cv-pastel-wrap">
        {cargando && <div className="cv-loading">Cargando…</div>}
        {!cargando && !slicesActivos.length && <EmptyState />}
        {!cargando && slicesActivos.length > 0 && (
          <>
            <div className="cv-pastel" style={estiloPastel(slicesActivos)} />
            <ul className="cv-legend">
              {slicesActivos.map((s) => (
                <li key={s.id || s.label}>
                  <span className="swatch" style={{ background: s.color }} />
                  <span style={{ flex: 1 }}>{s.label}</span>
                  <strong>{fmt(s.total)}</strong>
                  <span className="pct">{s.pct.toFixed(1)}%</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      )}
    </>
    );
  };

  const renderCuentas = () => {
    const pc = datos?.porCuenta || {};
    if (esFrancisco) {
      const ab = pc.abarrotes || { ingresos: 0, egresos: 0, neto: 0, recolecciones: 0, cierres: 0 };
      const tot = provReporte?.totales || {};
      return (
        <>
          <div className="cv-cuentas-hd">
            <span>Abarrotes · Francisco</span>
            <button type="button" className="cv-icon-btn" onClick={() => { setNav('estad'); setEstadTab('proveedores'); }} aria-label="Estadísticas proveedores">
              <IconChart />
            </button>
          </div>
          <SummaryBar
            ingresos={ab.ingresos}
            gastos={ab.egresos}
            balance={ab.neto}
            ingresosPorTienda={ingresosPorTiendaResumen}
            labelGastos="Egresos"
            labelBalance="Neto IE"
          />
          <div className="cv-cuenta-group">
            <div className="hd">
              <span>Abarrotes</span>
              <strong>{fmtMoney(ab.neto)}</strong>
            </div>
            <p className="muted" style={{ fontSize: '0.78rem', margin: '0.35rem 0 0' }}>
              {ab.cierres || 0} cierres · recolecciones {fmtMoney(ab.recolecciones || 0)}
            </p>
          </div>
          <div className="cv-cuenta-group">
            <div className="hd">
              <span>Utilidades · periodo</span>
              <strong style={{ color: (tot.ganancia_neta || 0) >= 0 ? 'var(--cv-ingreso)' : 'var(--cv-gasto)' }}>
                {cargandoProv ? '…' : fmtMoney(tot.ganancia_neta)}
              </strong>
            </div>
            <div className="item">
              <span>Ventas POS (por proveedor)</span>
              <span className="amt">{fmtMoney(tot.ventas)}</span>
            </div>
            <div className="item">
              <span>Costo mercancía vendida</span>
              <span className="amt" style={{ color: 'var(--cv-gasto)' }}>{fmtMoney(tot.costo)}</span>
            </div>
            <div className="item">
              <span>Utilidad bruta</span>
              <span className="amt" style={{ color: (tot.utilidad_bruta || 0) >= 0 ? 'var(--cv-ingreso)' : 'var(--cv-gasto)' }}>
                {fmtMoney(tot.utilidad_bruta)}
              </span>
            </div>
            <div className="item">
              <span>Gastos a proveedores (corte)</span>
              <span className="amt" style={{ color: 'var(--cv-gasto)' }}>{fmtMoney(tot.gastos_proveedores)}</span>
            </div>
            <div className="item">
              <span>Egresos operativos IE</span>
              <span className="amt" style={{ color: 'var(--cv-gasto)' }}>{fmtMoney(tot.gastos_operativos)}</span>
            </div>
            <div className="item">
              <span>Ganancia neta</span>
              <span className="amt" style={{ fontWeight: 700, color: (tot.ganancia_neta || 0) >= 0 ? 'var(--cv-ingreso)' : 'var(--cv-gasto)' }}>
                {fmtMoney(tot.ganancia_neta)}
              </span>
            </div>
            <p className="muted" style={{ fontSize: '0.75rem', margin: '0.5rem 0 0' }}>
              Detalle por proveedor en Estad. → Proveedores.
            </p>
          </div>
        </>
      );
    }
    const virtual = pc.virtual || { ingresos: 0, egresos: 0, neto: 0, recolecciones: 0 };
    const garage = pc.garage || { ingresos: 0, egresos: 0, neto: 0, recolecciones: 0 };
    const capital = round2((virtual.neto || 0) + (garage.neto || 0));
    const aDeber = 0;
    const bal = capital - aDeber;
    return (
      <>
        <div className="cv-cuentas-hd">
          <span>Cuentas · Antonio</span>
          <button type="button" className="cv-icon-btn" onClick={() => setNav('estad')} aria-label="Estadísticas">
            <IconChart />
          </button>
        </div>
        <div className="cv-summary">
          <div className="cv-summary-totals">
            <div>
              <div className="lbl">Capital</div>
              <div className="val ingreso">{fmt(capital)}</div>
            </div>
            <div>
              <div className="lbl">A deber</div>
              <div className="val gasto">{fmt(aDeber)}</div>
            </div>
            <div>
              <div className="lbl">Balance</div>
              <div className="val balance">{fmt(bal)}</div>
            </div>
          </div>
        </div>
        <div className="cv-cuenta-group">
          <div className="hd">
            <span>Virtual</span>
            <span className="amt">{fmtMoney(virtual.neto)}</span>
          </div>
          <div className="item">
            <span>Ingresos (cierres + recolecciones)</span>
            <span className="amt">{fmtMoney(virtual.ingresos)}</span>
          </div>
          <div className="item">
            <span>Egresos</span>
            <span className="amt" style={{ color: 'var(--cv-gasto)' }}>{fmtMoney(virtual.egresos)}</span>
          </div>
          <div className="item">
            <span>Recolecciones</span>
            <span className="amt">{fmtMoney(virtual.recolecciones)}</span>
          </div>
        </div>
        <div className="cv-cuenta-group">
          <div className="hd">
            <span>Garage</span>
            <span className="amt">{fmtMoney(garage.neto)}</span>
          </div>
          <div className="item">
            <span>Ingresos (cierres + recolecciones)</span>
            <span className="amt">{fmtMoney(garage.ingresos)}</span>
          </div>
          <div className="item">
            <span>Egresos</span>
            <span className="amt" style={{ color: 'var(--cv-gasto)' }}>{fmtMoney(garage.egresos)}</span>
          </div>
          <div className="item">
            <span>Recolecciones</span>
            <span className="amt">{fmtMoney(garage.recolecciones)}</span>
          </div>
        </div>
        <div className="cv-cuenta-group">
          <div className="hd">
            <span>Por tienda (ingresos)</span>
            <span className="amt">{fmtMoney(ingresos)}</span>
          </div>
          {(datos?.ingresosPorTienda || []).filter((t) => t.ingresos > 0 || t.recolecciones > 0).map((t) => (
            <div key={t.id} className="item">
              <span>{t.label}</span>
              <span className="amt">{fmtMoney(t.ingresos)}</span>
            </div>
          ))}
        </div>
      </>
    );
  };

  const renderMas = () => {
    if (masVista === 'inversiones') {
      const pendientes = inversiones.filter((i) => i.estado === 'pendiente_cobro');
      const otros = inversiones.filter((i) => i.estado !== 'pendiente_cobro');
      return (
        <div className="cv-catalogo">
          <div className="cv-top">
            <button type="button" className="cv-btn ghost" style={{ padding: '0.35rem 0.7rem' }} onClick={() => setMasVista('menu')}>‹ Volver</button>
            <strong>Inversión proveedor</strong>
            <span />
          </div>
          <p className="muted" style={{ fontSize: '0.8rem', margin: '0 0 0.75rem' }}>
            Oficina paga al proveedor (egreso en {tituloLibro}) y se recupera descontando caja en el corte de la tienda.
          </p>
          {avisoInversiones && <div className="cv-aviso">{avisoInversiones || AVISO_FALTA_INVERSIONES_OFICINA}</div>}
          {esAdmin && (
            <button type="button" className="cv-btn" style={{ width: '100%', marginBottom: '0.75rem' }} onClick={() => setShowInversion(true)}>
              + Nueva inversión
            </button>
          )}
          <strong style={{ display: 'block', marginBottom: '0.4rem' }}>Pendientes de cobro ({pendientes.length})</strong>
          {!pendientes.length && <p className="muted" style={{ fontSize: '0.8rem' }}>No hay inversiones pendientes.</p>}
          {pendientes.map((inv) => (
            <div key={inv.id} className="cv-cat-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                <strong>{inv.proveedor_nombre || 'Proveedor'}</strong>
                <span className="amt">{fmtMoney(inv.saldo)}</span>
              </div>
              <div className="muted" style={{ fontSize: '0.75rem' }}>
                {String(inv.fecha || '').slice(0, 10)} · Recupera: {etiquetaTienda(inv.sucursal_destino)} · Corte {inv.modulo_corte}
                {inv.notas ? ` · ${inv.notas}` : ''}
              </div>
              {esAdmin && Number(inv.abono) <= 0 && (
                <button type="button" className="cv-row-del" style={{ marginTop: '0.35rem' }} onClick={() => cancelarInv(inv)}>
                  Cancelar
                </button>
              )}
            </div>
          ))}
          {otros.length > 0 && (
            <>
              <strong style={{ display: 'block', margin: '0.85rem 0 0.4rem' }}>Histórico</strong>
              {otros.slice(0, 30).map((inv) => (
                <div key={inv.id} className="cv-cat-card" style={{ opacity: 0.85 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{inv.proveedor_nombre || 'Proveedor'} · {inv.estado}</span>
                    <span>{fmtMoney(inv.monto)}</span>
                  </div>
                  <div className="muted" style={{ fontSize: '0.75rem' }}>
                    {etiquetaTienda(inv.sucursal_destino)} · {String(inv.fecha || '').slice(0, 10)}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      );
    }
    if (masVista === 'catalogo') {
      const catEmpVista = (catalogoVista || []).find((c) => esCategoriaEmpleado(c));
      const empMain = catEmpVista?.grupos_empleado?.main || [];
      const empTienda = catEmpVista?.grupos_empleado?.tiendaGrupos || [];

      const setFlujoCatalogo = (flujo) => {
        setCatalogoFlujo(flujo);
        const cats = filtrarCatalogoPorFlujo(catalogo, flujo);
        const first = cats[0];
        const firstSub = (first?.subcategorias || []).find((s) => s.activo !== false);
        if (first) {
          setNuevaSub((s) => ({ ...s, categoriaId: first.id }));
          setNuevaDet((d) => ({
            ...d,
            categoriaId: first.id,
            subcategoriaId: firstSub?.id || '',
          }));
        }
      };

      return (
        <div className="cv-catalogo">
          <div className="cv-top">
            <button type="button" className="cv-btn ghost" style={{ padding: '0.35rem 0.7rem' }} onClick={() => setMasVista('menu')}>‹ Volver</button>
            <strong>Cuentas y subcuentas</strong>
            <span />
          </div>
          <div className="cv-estad-tabs" style={{ marginBottom: '0.75rem' }}>
            <button type="button" className={catalogoFlujo === 'egreso' ? 'active' : ''} onClick={() => setFlujoCatalogo('egreso')}>Egresos</button>
            <button type="button" className={catalogoFlujo === 'ingreso' ? 'active' : ''} onClick={() => setFlujoCatalogo('ingreso')}>Ingresos</button>
          </div>
          <p className="muted" style={{ fontSize: '0.78rem', margin: '0 0 0.75rem' }}>
            Catálogo compartido de IE Virtual e IE Abarrotes: <strong>Cuenta → Subcuenta → Detalle</strong>.
            Los <strong>ingresos</strong> son independientes de los <strong>egresos</strong>, con el mismo formato.
            En <strong>Empleado</strong> (egresos): los tipos son Consumo/Anticipo/…; las personas se eligen al capturar (módulo Empleados). No renombres ni elimines Empleado.
            {' '}El administrador puede <strong>enviar o quitar</strong> cada egreso del catálogo de gastos de cortes.
          </p>
          {!esAdmin && <p className="cv-error">Solo el administrador puede editar cuentas y subcuentas.</p>}
          {(catalogoFlujoVista || []).map((c) => (
            <div key={c.id} className="cv-cat-card">
              <div className="cv-cat-hd">
                <strong>
                  {c.nombre}
                  {c.fijo ? ' · sistema' : ''}
                  {esCategoriaEmpleado(c) ? ' · nómina cortes' : ''}
                  {!esCategoriaEmpleado(c) && catalogoFlujo === 'egreso' && categoriaEnCatalogoCortes(c) ? ' · en cortes' : ''}
                </strong>
                {esAdmin && (
                  <span className="cv-cat-actions">
                    {catalogoFlujo === 'egreso' && !esCategoriaEmpleado(c) && (
                      <button
                        type="button"
                        className="cv-btn ghost cv-cat-btn"
                        disabled={guardando}
                        title={
                          categoriaEnCatalogoCortes(c)
                            ? 'Quitar del catálogo de gastos de cortes'
                            : 'Evaluar y enviar esta cuenta al catálogo de cortes'
                        }
                        onClick={() => toggleEnviarACortes(c)}
                        style={
                          categoriaEnCatalogoCortes(c)
                            ? { borderColor: '#6c3483', color: '#6c3483', fontWeight: 700 }
                            : undefined
                        }
                      >
                        {categoriaEnCatalogoCortes(c) ? 'Quitar de cortes' : 'Enviar a cortes'}
                      </button>
                    )}
                    <button type="button" className="cv-btn ghost cv-cat-btn" onClick={() => nuevaSubEnCat(c.id, c.nombre)}>+ Subcuenta</button>
                    {!esCategoriaEmpleado(c) && (
                      <button type="button" className="cv-btn ghost cv-cat-btn" onClick={() => editarCategoria(c)}>Editar</button>
                    )}
                    {!esCategoriaEmpleado(c) && (
                      <button type="button" className="cv-row-del" onClick={() => borrarCategoria(c)}>
                        {c.fijo ? 'Desactivar' : 'Eliminar'}
                      </button>
                    )}
                  </span>
                )}
              </div>
              <ul>
                {(c.subcategorias || []).filter((s) => s.activo !== false).map((s) => (
                  <li key={s.id} className="cv-sub-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '0.35rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'center' }}>
                      <span>{s.nombre}{s.fijo ? ' · sistema' : ''}</span>
                      {esAdmin && (
                        <span className="cv-cat-actions">
                          <button type="button" className="cv-btn ghost cv-cat-btn" onClick={() => nuevoDetalleEnSub(s.id, s.nombre)}>+ Detalle</button>
                          <button type="button" className="cv-btn ghost cv-cat-btn" onClick={() => editarSub(s)}>Editar</button>
                          <button type="button" className="cv-row-del" onClick={() => borrarSub(s)}>
                            {s.fijo ? 'Quitar' : 'Eliminar'}
                          </button>
                        </span>
                      )}
                    </div>
                    <ul style={{ margin: 0, paddingLeft: '1rem', listStyle: 'disc' }}>
                      {(s.detalles || []).filter((d) => d.activo !== false).map((d) => (
                        <li key={d.id} className="cv-sub-row" style={{ border: 'none', padding: '0.15rem 0' }}>
                          <span className="muted" style={{ fontSize: '0.82rem' }}>{d.nombre}</span>
                          {esAdmin && (
                            <span className="cv-cat-actions">
                              <button type="button" className="cv-btn ghost cv-cat-btn" onClick={() => editarDetalle(d)}>Editar</button>
                              <button type="button" className="cv-row-del" onClick={() => borrarDetalle(d)}>Eliminar</button>
                            </span>
                          )}
                        </li>
                      ))}
                      {!(s.detalles || []).filter((d) => d.activo !== false).length && (
                        <li className="muted" style={{ fontSize: '0.75rem', listStyle: 'none', paddingLeft: 0 }}>Sin detalle</li>
                      )}
                    </ul>
                  </li>
                ))}
                {!(c.subcategorias || []).filter((s) => s.activo !== false).length && (
                  <li className="muted">Sin subcategorías</li>
                )}
              </ul>
              {esCategoriaEmpleado(c) && (
                <div style={{ marginTop: '0.75rem', paddingTop: '0.65rem', borderTop: '1px dashed var(--border, #ddd)' }}>
                  <p className="muted" style={{ fontSize: '0.75rem', margin: '0 0 0.45rem' }}>
                    Personal que puede recibir estos gastos: <strong>Main</strong> (todas las tiendas) y <strong>tienda</strong> (solo la sucursal).
                    Al capturar en corte o egreso manual se elige la persona. Altas en módulo Empleados.
                  </p>
                  <label className="muted" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', marginBottom: '0.5rem' }}>
                    Sucursal tienda
                    <select
                      className="select"
                      style={{ minWidth: 140 }}
                      value={catEmpSucursal}
                      onChange={(e) => setCatEmpSucursal(e.target.value)}
                    >
                      <option value="">Todas</option>
                      {tiendas.filter((t) => normalizarCodigoTienda(t) !== 'MAIN').map((t) => (
                        <option key={t} value={normalizarCodigoTienda(t)}>{etiquetaTienda(t)}</option>
                      ))}
                    </select>
                  </label>
                  <ul>
                    <li className="cv-sub-row" style={{ background: 'rgba(0,0,0,0.04)', fontWeight: 700, fontSize: '0.82rem' }}>
                      Empleados de Main
                    </li>
                    {empMain.length ? empMain.map((e) => (
                      <li key={`m-${e.id}`} className="cv-sub-row" style={{ justifyContent: 'space-between' }}>
                        <span>{e.nombre}</span>
                        {esAdmin && (
                          <span className="cv-cat-actions">
                            <button type="button" className="cv-btn ghost cv-cat-btn" onClick={() => editarEmpleadoCat({ usuario_id: e.id, nombre: e.nombre })}>Editar</button>
                            <button type="button" className="cv-row-del" onClick={() => eliminarEmpleadoCat({ usuario_id: e.id, nombre: e.nombre })}>Eliminar</button>
                          </span>
                        )}
                      </li>
                    )) : (
                      <li className="muted" style={{ fontSize: '0.78rem' }}>Sin Main / indirectos</li>
                    )}
                    <li className="cv-sub-row" style={{ background: 'rgba(0,0,0,0.04)', fontWeight: 700, fontSize: '0.82rem', marginTop: '0.25rem' }}>
                      Empleados de tienda
                    </li>
                    {empTienda.map((g) => (
                      <React.Fragment key={`tg-${g.sucursalId}`}>
                        <li className="muted" style={{ fontSize: '0.75rem', listStyle: 'none' }}>{g.label} · {(g.empleados || []).length}/2</li>
                        {(g.empleados || []).length ? (g.empleados || []).map((e) => (
                          <li key={`t-${e.id}`} className="cv-sub-row" style={{ justifyContent: 'space-between' }}>
                            <span>{e.nombre}</span>
                            {esAdmin && (
                              <span className="cv-cat-actions">
                                <button type="button" className="cv-btn ghost cv-cat-btn" onClick={() => editarEmpleadoCat({ usuario_id: e.id, nombre: e.nombre })}>Editar</button>
                                <button type="button" className="cv-row-del" onClick={() => eliminarEmpleadoCat({ usuario_id: e.id, nombre: e.nombre })}>Eliminar</button>
                              </span>
                            )}
                          </li>
                        )) : (
                          <li className="muted" style={{ fontSize: '0.78rem' }}>Sin empleados de tienda</li>
                        )}
                      </React.Fragment>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
          {esAdmin && (
            <div className="cv-nota-form">
              <input value={nuevaCat} onChange={(e) => setNuevaCat(e.target.value)} placeholder="Nueva cuenta" />
              <button type="button" className="cv-btn" disabled={guardando || !nuevaCat.trim()} onClick={agregarCategoria}>Agregar cuenta</button>
              <select value={nuevaSub.categoriaId} onChange={(e) => setNuevaSub({ ...nuevaSub, categoriaId: e.target.value })}>
                {catalogoFlujoVista.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
              <input value={nuevaSub.nombre} onChange={(e) => setNuevaSub({ ...nuevaSub, nombre: e.target.value })} placeholder="Nueva subcuenta" />
              <button type="button" className="cv-btn" disabled={guardando || !nuevaSub.nombre.trim()} onClick={agregarSub}>Agregar subcuenta</button>
              <select
                value={nuevaDet.categoriaId}
                onChange={(e) => {
                  const categoriaId = e.target.value;
                  const firstSub = (catalogoFlujoVista.find((c) => c.id === categoriaId)?.subcategorias || []).find((s) => s.activo !== false);
                  setNuevaDet({ categoriaId, subcategoriaId: firstSub?.id || '', nombre: nuevaDet.nombre });
                }}
              >
                {catalogoFlujoVista.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
              <select
                value={nuevaDet.subcategoriaId}
                onChange={(e) => setNuevaDet({ ...nuevaDet, subcategoriaId: e.target.value })}
              >
                <option value="">Subcategoría…</option>
                {subsParaNuevoDet.map((s) => (
                  <option key={s.id} value={s.id}>{s.nombre}</option>
                ))}
              </select>
              <input value={nuevaDet.nombre} onChange={(e) => setNuevaDet({ ...nuevaDet, nombre: e.target.value })} placeholder="Nuevo detalle (3er nivel)" />
              <button type="button" className="cv-btn" disabled={guardando || !nuevaDet.nombre.trim() || !nuevaDet.subcategoriaId} onClick={agregarDetalle}>Agregar detalle</button>
            </div>
          )}
        </div>
      );
    }
    return (
      <>
        <div className="cv-mas-hd">
          <h2>Ajustes</h2>
          <span className="ver">{tituloLibro}</span>
        </div>
        <div className="cv-mas-grid">
          <button type="button" className="cv-mas-item" onClick={() => setMasVista('inversiones')}>
            <span className="ico">$</span>
            Inversión proveedor
          </button>
          <button type="button" className="cv-mas-item" onClick={() => setMasVista('catalogo')}>
            <span className="ico">⚙</span>
            Cuentas / subcuentas
          </button>
          <button type="button" className="cv-mas-item" onClick={() => { setNav('trans'); setShowFiltro(true); setShowBuscar(true); }}>
            <span className="ico">🖥</span>
            Sucursal / búsqueda
          </button>
          <button type="button" className="cv-mas-item" onClick={cargar}>
            <span className="ico">↺</span>
            Respaldo
          </button>
          <button type="button" className="cv-mas-item" onClick={() => setNav('trans')}>
            <span className="ico">🎨</span>
            Apariencia
          </button>
          <button type="button" className="cv-mas-item" onClick={() => alert(esFrancisco
            ? 'IE ABARROTES (Francisco): ingresos y egresos de Abarrotes.\n\nEstad. → Proveedores: ventas POS y gastos PROVEEDORES del corte por proveedor, con utilidad bruta y ganancia neta.\n\nAdmin: botones ＋I / ＋E en Transacciones para captura manual; Más → Cuentas/subcuentas para el catálogo.'
            : 'IE VIRTUAL (Antonio): Virtual y Garage. Vales y gastos CUBRE TURNO/TAXIS se registran solos.\n\nAdmin: botones ＋I / ＋E en Transacciones para captura manual; Más → Cuentas/subcuentas para el catálogo. Abarrotes va en IE ABARROTES.')}>
            <span className="ico">?</span>
            Ayuda
          </button>
          <button type="button" className="cv-mas-item" onClick={exportarCsv}>
            <span className="ico">✉</span>
            Exportar
          </button>
        </div>
      </>
    );
  };

  const showFab = nav === 'trans' && (transTab === 'diario' || transTab === 'calendario' || transTab === 'mensual' || transTab === 'total');
  const showFabNota = nav === 'trans' && transTab === 'nota';

  return (
    <div className="cv-app">
      <div className="cv-libro-banner" style={{ padding: '0.55rem 0.85rem', background: esFrancisco ? 'rgba(181,166,66,0.12)' : 'rgba(142,68,173,0.1)', borderBottom: '1px solid var(--border, #e5e7eb)' }}>
        <strong style={{ color: esFrancisco ? '#b5a642' : '#8e44ad' }}>{tituloLibro}</strong>
        <span className="muted" style={{ display: 'block', fontSize: '0.78rem', marginTop: 2 }}>{subtituloLibro}</span>
      </div>
      {(avisoSql || datos?.avisoCatalogo) && (
        <div className="cv-aviso">{avisoSql || datos?.avisoCatalogo || AVISO_FALTA_CONT_VIRTUAL}</div>
      )}
      {error && <div className="cv-error">{error}</div>}

      <div className="cv-body">
        {nav === 'trans' && renderTrans()}
        {nav === 'estad' && renderEstad()}
        {nav === 'cuentas' && renderCuentas()}
        {nav === 'mas' && renderMas()}
      </div>

      {showFab && esAdmin && (
        <div className="cv-fab-group">
          <button type="button" className="cv-fab ingreso" aria-label="Agregar ingreso" title="Ingreso manual" onClick={() => abrirManual('ingreso')}>＋I</button>
          <button type="button" className="cv-fab" aria-label="Agregar egreso" title="Egreso manual" onClick={() => abrirManual('egreso')}>＋E</button>
        </div>
      )}
      {showFabNota && (
        <button type="button" className="cv-fab nota" aria-label="Nueva nota" onClick={() => document.querySelector('.cv-nota-form textarea')?.focus()}>
          ✎
        </button>
      )}

      <nav className="cv-nav">
        <button type="button" className={nav === 'trans' ? 'active' : ''} onClick={() => setNav('trans')}>
          <IconBook active={nav === 'trans'} />
          Trans.
        </button>
        <button type="button" className={nav === 'estad' ? 'active' : ''} onClick={() => setNav('estad')}>
          <IconChart />
          Estad.
        </button>
        <button type="button" className={nav === 'cuentas' ? 'active' : ''} onClick={() => setNav('cuentas')}>
          <IconCoins />
          Cuentas
        </button>
        <button type="button" className={nav === 'mas' ? 'active' : ''} onClick={() => { setNav('mas'); setMasVista('menu'); }}>
          <IconMore />
          Más
        </button>
      </nav>

      {showInversion && (
        <div className="cv-modal-backdrop" onClick={() => setShowInversion(false)} role="presentation">
          <div className="cv-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Inversión oficina">
            <h3>Inversión oficina → proveedor</h3>
            <p className="muted" style={{ fontSize: '0.78rem', marginTop: 0 }}>
              Registra egreso en {tituloLibro} y deja el cobro pendiente en el corte de la tienda.
            </p>
            <label>
              Fecha
              <input type="date" value={inversionForm.fecha} onChange={(e) => setInversionForm({ ...inversionForm, fecha: e.target.value })} />
            </label>
            <label>
              Proveedor
              <input
                value={inversionForm.proveedor_nombre}
                onChange={(e) => setInversionForm({ ...inversionForm, proveedor_nombre: e.target.value })}
                placeholder="Nombre del proveedor"
              />
            </label>
            <label>
              Monto
              <input
                type="number"
                min="0"
                step="0.01"
                value={inversionForm.monto}
                onChange={(e) => setInversionForm({ ...inversionForm, monto: e.target.value })}
              />
            </label>
            <label>
              Tienda a recuperar
              <select
                value={inversionForm.sucursal_destino}
                onChange={(e) => setInversionForm({ ...inversionForm, sucursal_destino: e.target.value })}
              >
                <option value="">Selecciona tienda…</option>
                {tiendas.map((t) => (
                  <option key={t} value={t}>{etiquetaTienda(t)}</option>
                ))}
              </select>
            </label>
            <label>
              Cuenta IE
              <select
                value={inversionForm.cuenta}
                onChange={(e) => {
                  const cuenta = e.target.value;
                  const modulo_corte = cuenta === 'garage' ? 'garage' : cuenta === 'abarrotes' ? 'abarrotes' : 'virtual';
                  setInversionForm({ ...inversionForm, cuenta, modulo_corte });
                }}
              >
                {esFrancisco ? (
                  <option value="abarrotes">Abarrotes</option>
                ) : (
                  <>
                    <option value="virtual">Virtual</option>
                    <option value="garage">Garage</option>
                  </>
                )}
              </select>
            </label>
            <label>
              Corte donde se cobra
              <select
                value={inversionForm.modulo_corte}
                onChange={(e) => setInversionForm({ ...inversionForm, modulo_corte: e.target.value })}
              >
                {esFrancisco ? (
                  <option value="abarrotes">Corte Abarrotes</option>
                ) : (
                  <>
                    <option value="virtual">Corte Virtual</option>
                    <option value="garage">Corte Garage</option>
                  </>
                )}
              </select>
            </label>
            <label>
              Notas
              <input
                value={inversionForm.notas}
                onChange={(e) => setInversionForm({ ...inversionForm, notas: e.target.value })}
                placeholder="Opcional"
              />
            </label>
            <div className="cv-modal-actions">
              <button type="button" className="cv-btn ghost" onClick={() => setShowInversion(false)}>Cancelar</button>
              <button type="button" className="cv-btn" disabled={guardando} onClick={guardarInversion}>
                {guardando ? 'Guardando…' : 'Registrar inversión'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showManual && (
        <div className="cv-modal-backdrop" onClick={() => setShowManual(false)} role="presentation">
          <div className="cv-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Captura manual">
            <h3>{manualTipo === 'ingreso' ? 'Nuevo ingreso' : 'Nuevo egreso'}</h3>
            <div className="cv-estad-tabs" style={{ marginBottom: '0.75rem' }}>
              <button
                type="button"
                className={manualTipo === 'egreso' ? 'active' : ''}
                onClick={() => abrirManual('egreso')}
              >
                Egreso
              </button>
              <button
                type="button"
                className={manualTipo === 'ingreso' ? 'active' : ''}
                onClick={() => abrirManual('ingreso')}
              >
                Ingreso
              </button>
            </div>
            <label>
              Fecha
              <input type="date" value={manual.fecha} onChange={(e) => setManual({ ...manual, fecha: e.target.value })} />
            </label>
            <label>
              Sucursal
              <select value={manual.sucursal_id} onChange={(e) => setManual({ ...manual, sucursal_id: e.target.value })} required>
                <option value="">— Elige sucursal —</option>
                {tiendas.map((t) => (
                  <option key={t} value={t}>{etiquetaTienda(t)}</option>
                ))}
              </select>
            </label>
            <label>
              Cuenta IE
              <select value={manual.cuenta} onChange={(e) => setManual({ ...manual, cuenta: e.target.value })}>
                {esFrancisco ? (
                  <option value="abarrotes">Abarrotes</option>
                ) : (
                  <>
                    <option value="virtual">Virtual</option>
                    <option value="garage">Garage</option>
                  </>
                )}
              </select>
            </label>
            <label>
              Categoría
              <select
                value={manual.categoria_id}
                onChange={(e) => {
                  const categoria_id = e.target.value;
                  const catM = catalogoManual.find((c) => c.id === categoria_id);
                  const firstSub = (catM?.subcategorias || []).find((s) => s.activo !== false);
                  const firstDet = (firstSub?.detalles || catM?.plantilla_detalles || []).find((d) => d.activo !== false)
                    || (catM?.plantilla_detalles || [])[0];
                  setManual({
                    ...manual,
                    categoria_id,
                    subcategoria_id: firstSub?.id || '',
                    detalle_id: firstDet?.id || '',
                    empleado_id: '',
                  });
                }}
              >
                {catalogoManual.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </label>
            <label>
              {manualEsEmpleado ? 'Empleado' : 'Subcategoría'}
              <select
                value={manual.subcategoria_id}
                onChange={(e) => {
                  const subcategoria_id = e.target.value;
                  const sub = subsManual.find((s) => s.id === subcategoria_id);
                  const firstDet = (sub?.detalles || []).find((d) => d.activo !== false)
                    || (manualEsEmpleado ? detsManual[0] : null);
                  setManual({
                    ...manual,
                    subcategoria_id,
                    detalle_id: firstDet?.id || '',
                    empleado_id: sub?.es_empleado_vivo ? String(sub.usuario_id || '') : '',
                  });
                }}
              >
                <option value="">{manualEsEmpleado ? 'Elige empleado…' : '— Opcional —'}</option>
                {!subsManual.length && manualEsEmpleado && (
                  <option value="" disabled>Sin empleados en esta sucursal</option>
                )}
                {subsManual.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.es_empleado_vivo
                      ? `${s.grupo_empleado === 'main' ? 'Main · ' : 'Tienda · '}${s.nombre}`
                      : s.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {manualEsEmpleado ? 'Concepto' : 'Detalle'}
              <select
                value={manual.detalle_id}
                onChange={(e) => setManual({ ...manual, detalle_id: e.target.value })}
                disabled={!detsManual.length}
              >
                <option value="">
                  {manualEsEmpleado
                    ? (detsManual.length ? 'Concepto…' : 'Sin conceptos')
                    : (detsManual.length ? '— Sin detalle —' : 'Sin detalles en esta sub')}
                </option>
                {detsManual.map((d) => (
                  <option key={d.id} value={d.id}>{d.nombre}</option>
                ))}
              </select>
            </label>
            <label>
              Monto
              <input type="number" min="0" step="0.01" value={manual.monto} onChange={(e) => setManual({ ...manual, monto: e.target.value })} />
            </label>
            <label>
              Descripción
              <input value={manual.descripcion} onChange={(e) => setManual({ ...manual, descripcion: e.target.value })} placeholder="Nota u observación" />
            </label>
            <div className="cv-modal-actions">
              <button type="button" className="cv-btn ghost" onClick={() => setShowManual(false)}>Cancelar</button>
              <button type="button" className="cv-btn" disabled={guardando} onClick={guardarManual}>
                {guardando ? 'Guardando…' : (manualTipo === 'ingreso' ? 'Registrar ingreso' : 'Registrar egreso')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
