import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { listarSucursalesOperativas, etiquetaTienda } from '../constants/sucursales.js';
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
  desactivarCategoriaContVirtual,
  desactivarSubcategoriaContVirtual,
  listarCatalogoContVirtual,
  resolverNombresCatalogo,
  AVISO_FALTA_CONT_VIRTUAL,
} from '../lib/contVirtualCatalogo.js';
import { eliminarEgresoDesdePanelIe, registrarEgresoContVirtual } from '../lib/contVirtualEgresos.js';
import {
  AVISO_FALTA_INVERSIONES_OFICINA,
  cancelarInversionOficina,
  defaultsInversionPorLibro,
  listarInversionesOficina,
  registrarInversionOficinaProveedor,
} from '../lib/inversionesOficinaProveedor.js';
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
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtFechaCorta(ymd) {
  const [y, m, d] = String(ymd).split('-');
  return `${Number(d)}.${Number(m)}.${y}`;
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

function SummaryBar({ ingresos, gastos, balance }) {
  return (
    <div className="cv-summary">
      <div>
        <div className="lbl">Ingresos</div>
        <div className="val ingreso">{fmt(ingresos)}</div>
      </div>
      <div>
        <div className="lbl">Gastos</div>
        <div className="val gasto">{fmt(gastos)}</div>
      </div>
      <div>
        <div className="lbl">Balance</div>
        <div className="val balance">{fmt(balance)}</div>
      </div>
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

export default function ContVirtual({ supabase, user, libro = 'antonio' }) {
  const esAdmin = puedeGestionarUsuarios(user?.rol);
  const esFrancisco = libro === 'francisco';
  const tituloLibro = esFrancisco ? 'IE ABARROTES' : 'IE VIRTUAL';
  const subtituloLibro = esFrancisco
    ? 'Francisco · ingresos y egresos de Abarrotes'
    : 'Antonio · ingresos y egresos de Virtual y Garage';
  const tiendas = useMemo(() => listarSucursalesOperativas(), []);

  const [nav, setNav] = useState('trans'); // trans | estad | cuentas | mas
  const [transTab, setTransTab] = useState('diario');
  const [anio, setAnio] = useState(() => new Date().getFullYear());
  const [mes, setMes] = useState(() => new Date().getMonth());
  const [estadPreset, setEstadPreset] = useState('mes');
  const [estadTab, setEstadTab] = useState('gastos');
  const [mesExpandido, setMesExpandido] = useState(() => new Date().getMonth());
  const hoyRef = useMemo(() => new Date(), []);
  const [filtroTienda, setFiltroTienda] = useState('');
  const [filtroCuenta, setFiltroCuenta] = useState(''); // '' | virtual | garage
  const [showFiltro, setShowFiltro] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [showInversion, setShowInversion] = useState(false);
  const [masVista, setMasVista] = useState('menu'); // menu | catalogo | inversiones

  const [cargando, setCargando] = useState(false);
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [catalogo, setCatalogo] = useState([]);
  const [avisoSql, setAvisoSql] = useState('');
  const [notas, setNotas] = useState(() => leerNotas());
  const [notaDraft, setNotaDraft] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [inversiones, setInversiones] = useState([]);
  const [avisoInversiones, setAvisoInversiones] = useState('');

  const defsInv = defaultsInversionPorLibro(libro);
  const [manual, setManual] = useState({
    fecha: hoyYmd(),
    sucursal_id: '',
    cuenta: esFrancisco ? 'abarrotes' : 'virtual',
    categoria_id: 'manual',
    subcategoria_id: 'manual-otros',
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
    cargar();
  }, [cargar]);

  const porDia = useMemo(
    () => agruparMovimientosPorDia({
      detalleGastos: datos?.detalleGastos || [],
      ingresosPorDia: datos?.ingresosPorDia || [],
    }),
    [datos],
  );

  const byFecha = useMemo(() => Object.fromEntries(porDia.map((d) => [d.fecha, d])), [porDia]);

  const ingresos = datos?.ingresosTotal || 0;
  const gastos = datos?.egresosTotal || 0;
  const balance = datos?.neto ?? ingresos - gastos;

  const mesesAnio = useMemo(() => {
    if (transTab !== 'mensual' || !datos) return [];
    return MESES_CORTO_ES.map((lbl, i) => {
      const { desde, hasta } = rangoMesContVirtual(anio, i);
      let ing = 0;
      let gas = 0;
      for (const d of porDia) {
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
        semanas: semanasDelMesContVirtual(anio, i, porDia),
      };
    }).filter((m) => m.i <= hoyRef.getMonth() || anio < hoyRef.getFullYear() || m.ingresos || m.gastos)
      .reverse();
  }, [transTab, datos, anio, porDia, hoyRef]);

  const calCells = useMemo(() => buildCalendarCells(anio, mes, byFecha), [anio, mes, byFecha]);

  const subsManual = useMemo(() => {
    const cat = catalogo.find((c) => c.id === manual.categoria_id);
    return (cat?.subcategorias || []).filter((s) => s.activo !== false);
  }, [catalogo, manual.categoria_id]);

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
    if (!esAdmin) return alert('Solo el administrador puede capturar egresos manuales.');
    const monto = Number(manual.monto);
    if (!(monto > 0)) return alert('Indica un monto válido.');
    if (!manual.categoria_id) return alert('Elige categoría.');
    const nombres = resolverNombresCatalogo(catalogo, manual.categoria_id, manual.subcategoria_id);
    setGuardando(true);
    const res = await registrarEgresoContVirtual(supabase, {
      fecha: manual.fecha || hoyYmd(),
      sucursal_id: manual.sucursal_id || filtroTienda || 'MAIN',
      cuenta: manual.cuenta || 'virtual',
      categoria_id: manual.categoria_id,
      categoria_nombre: nombres.categoria_nombre,
      subcategoria_id: manual.subcategoria_id || null,
      subcategoria_nombre: nombres.subcategoria_nombre,
      monto,
      descripcion: manual.descripcion,
      fuente: 'manual',
      usuario_nombre: user?.nombre || 'Administrador',
    });
    setGuardando(false);
    if (!res.ok) return alert(res.error);
    if (res.aviso) alert(res.aviso);
    setManual((m) => ({ ...m, monto: '', descripcion: '' }));
    setShowManual(false);
    cargar();
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
    if (!esAdmin || row?.tipo === 'ingreso') return;
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
    const res = await crearCategoriaContVirtual(supabase, { nombre: nuevaCat });
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

  const exportarCsv = () => {
    const rows = [['fecha', 'tipo', 'categoria', 'subcategoria', 'monto', 'detalle']];
    for (const g of datos?.detalleGastos || []) {
      rows.push([g.fecha, 'gasto', g.categoria, g.subcategoria || '', g.monto, g.comentario || '']);
    }
    for (const i of datos?.ingresosPorDia || []) {
      rows.push([i.fecha, 'ingreso', 'Cierre', '', i.monto, i.comentario || '']);
    }
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cont-virtual-${rango.desde}_${rango.hasta}.csv`;
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
                  it.empleado || etiquetaTienda(it.tienda),
                ]
                  .filter(Boolean)
                  .join(' · ') || '—'}
              </div>
            </div>
            <span className={`cv-row-amt ${it.tipo === 'ingreso' ? 'ingreso' : 'gasto'}`}>
              {fmt(it.monto)}
            </span>
            {esAdmin && it.tipo === 'gasto' && (
              <button type="button" className="cv-row-del" title="Eliminar egreso" onClick={() => borrarEgreso(it)}>✕</button>
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
          <button type="button" className="cv-icon-btn" title="Buscar" aria-label="Buscar">⌕</button>
          <button type="button" className="cv-icon-btn" title="Filtro" aria-label="Filtro" onClick={() => setShowFiltro((v) => !v)}>⚙</button>
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
      {showFiltro && (
        <div className="cv-filter-bar">
          {!esFrancisco && (
            <select value={filtroCuenta} onChange={(e) => setFiltroCuenta(e.target.value)}>
              <option value="">Cuentas: Virtual + Garage</option>
              <option value="virtual">Solo Virtual</option>
              <option value="garage">Solo Garage</option>
            </select>
          )}
          <select value={filtroTienda} onChange={(e) => setFiltroTienda(e.target.value)}>
            <option value="">Todas las tiendas</option>
            {tiendas.map((t) => (
              <option key={t} value={t}>{etiquetaTienda(t)}</option>
            ))}
          </select>
          <button type="button" className="cv-btn ghost" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }} onClick={cargar}>
            Actualizar
          </button>
        </div>
      )}
      {transTab !== 'nota' && <SummaryBar ingresos={ingresos} gastos={gastos} balance={balance} />}
      {cargando && <div className="cv-loading">Cargando…</div>}
      {!cargando && transTab === 'diario' && renderDiario()}
      {!cargando && transTab === 'calendario' && renderCalendario()}
      {!cargando && transTab === 'mensual' && renderMensual()}
      {!cargando && transTab === 'total' && renderTotal()}
      {!cargando && transTab === 'nota' && renderNota()}
    </>
  );

  const renderEstad = () => (
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
      <div className="cv-estad-tabs">
        <button type="button" className={estadTab === 'ingresos' ? 'active' : ''} onClick={() => setEstadTab('ingresos')}>Ingresos</button>
        <button type="button" className={estadTab === 'gastos' ? 'active' : ''} onClick={() => setEstadTab('gastos')}>Gastos</button>
      </div>
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
    </>
  );

  const renderCuentas = () => {
    const pc = datos?.porCuenta || {};
    if (esFrancisco) {
      const ab = pc.abarrotes || { ingresos: 0, egresos: 0, neto: 0, recolecciones: 0, cierres: 0 };
      return (
        <>
          <div className="cv-cuentas-hd">
            <span>Abarrotes · Francisco</span>
            <button type="button" className="cv-icon-btn" onClick={() => setNav('estad')} aria-label="Estadísticas">
              <IconChart />
            </button>
          </div>
          <div className="cv-summary">
            <div>
              <div className="lbl">Ingresos</div>
              <div className="val ingreso">{fmt(ab.ingresos)}</div>
            </div>
            <div>
              <div className="lbl">Egresos</div>
              <div className="val gasto">{fmt(ab.egresos)}</div>
            </div>
            <div>
              <div className="lbl">Neto</div>
              <div className="val balance">{fmt(ab.neto)}</div>
            </div>
          </div>
          <div className="cv-cuenta-group">
            <div className="hd">
              <span>Abarrotes</span>
              <strong>{fmtMoney(ab.neto)}</strong>
            </div>
            <p className="muted" style={{ fontSize: '0.78rem', margin: '0.35rem 0 0' }}>
              {ab.cierres || 0} cierres · recolecciones {fmtMoney(ab.recolecciones || 0)}
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
      return (
        <div className="cv-catalogo">
          <div className="cv-top">
            <button type="button" className="cv-btn ghost" style={{ padding: '0.35rem 0.7rem' }} onClick={() => setMasVista('menu')}>‹ Volver</button>
            <strong>Categorías</strong>
            <span />
          </div>
          {!esAdmin && <p className="cv-error">Solo el administrador puede editar categorías.</p>}
          {(catalogo || []).map((c) => (
            <div key={c.id} className="cv-cat-card">
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong>{c.nombre}</strong>
                {esAdmin && !c.fijo && (
                  <button type="button" className="cv-row-del" onClick={() => desactivarCategoriaContVirtual(supabase, c.id).then(cargarCatalogo)}>
                    Desactivar
                  </button>
                )}
              </div>
              <ul>
                {(c.subcategorias || []).filter((s) => s.activo !== false).map((s) => (
                  <li key={s.id} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{s.nombre}{s.fijo ? ' · sistema' : ''}</span>
                    {esAdmin && !s.fijo && (
                      <button type="button" className="cv-row-del" onClick={() => desactivarSubcategoriaContVirtual(supabase, s.id).then(cargarCatalogo)}>
                        Quitar
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {esAdmin && (
            <div className="cv-nota-form">
              <input value={nuevaCat} onChange={(e) => setNuevaCat(e.target.value)} placeholder="Nueva categoría" />
              <button type="button" className="cv-btn" disabled={guardando || !nuevaCat.trim()} onClick={agregarCategoria}>Agregar categoría</button>
              <select value={nuevaSub.categoriaId} onChange={(e) => setNuevaSub({ ...nuevaSub, categoriaId: e.target.value })}>
                {catalogo.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
              <input value={nuevaSub.nombre} onChange={(e) => setNuevaSub({ ...nuevaSub, nombre: e.target.value })} placeholder="Nueva subcategoría" />
              <button type="button" className="cv-btn" disabled={guardando || !nuevaSub.nombre.trim()} onClick={agregarSub}>Agregar subcategoría</button>
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
            Configuración
          </button>
          <button type="button" className="cv-mas-item" onClick={() => setShowFiltro(true)}>
            <span className="ico">🖥</span>
            Tienda
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
            ? 'IE ABARROTES (Francisco): solo ingresos y egresos del departamento Abarrotes. No incluye Virtual ni Garage.'
            : 'IE VIRTUAL (Antonio): Virtual y Garage. Vales de gasolina/herramienta/accesorios y gastos CUBRE TURNO/TAXIS de Virtual se registran solos. Abarrotes va en IE ABARROTES.')}>
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
        <button type="button" className="cv-fab" aria-label="Agregar egreso" onClick={() => setShowManual(true)}>+</button>
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
            <h3>Nuevo egreso</h3>
            <label>
              Fecha
              <input type="date" value={manual.fecha} onChange={(e) => setManual({ ...manual, fecha: e.target.value })} />
            </label>
            <label>
              Tienda
              <select value={manual.sucursal_id} onChange={(e) => setManual({ ...manual, sucursal_id: e.target.value })}>
                <option value="">MAIN / oficina</option>
                {tiendas.map((t) => (
                  <option key={t} value={t}>{etiquetaTienda(t)}</option>
                ))}
              </select>
            </label>
            <label>
              Cuenta
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
                  const firstSub = (catalogo.find((c) => c.id === categoria_id)?.subcategorias || []).find((s) => s.activo !== false);
                  setManual({ ...manual, categoria_id, subcategoria_id: firstSub?.id || '' });
                }}
              >
                {catalogo.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </label>
            <label>
              Subcategoría
              <select value={manual.subcategoria_id} onChange={(e) => setManual({ ...manual, subcategoria_id: e.target.value })}>
                {subsManual.map((s) => (
                  <option key={s.id} value={s.id}>{s.nombre}</option>
                ))}
              </select>
            </label>
            <label>
              Monto
              <input type="number" min="0" step="0.01" value={manual.monto} onChange={(e) => setManual({ ...manual, monto: e.target.value })} />
            </label>
            <label>
              Descripción
              <input value={manual.descripcion} onChange={(e) => setManual({ ...manual, descripcion: e.target.value })} placeholder="Detalle" />
            </label>
            <div className="cv-modal-actions">
              <button type="button" className="cv-btn ghost" onClick={() => setShowManual(false)}>Cancelar</button>
              <button type="button" className="cv-btn" disabled={guardando} onClick={guardarManual}>
                {guardando ? 'Guardando…' : 'Registrar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
