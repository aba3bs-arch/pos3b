import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { listarSucursalesOperativas, etiquetaTienda } from '../constants/sucursales.js';
import FiltroPeriodo from '../components/FiltroPeriodo.jsx';
import { puedeGestionarUsuarios } from '../lib/roles.js';
import { estiloPastel } from '../lib/estadisticasData.js';
import {
  cargarContVirtual,
  PRESETS_CONT_VIRTUAL,
  rangoDesdePresetContVirtual,
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
import { eliminarEgresoContVirtual, registrarEgresoContVirtual } from '../lib/contVirtualEgresos.js';

function fmt(n) {
  return `$${(Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function hoyYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function Kpi({ label, value, sub, accent }) {
  return (
    <div className="card" style={{ borderTop: accent ? `4px solid ${accent}` : undefined }}>
      <div className="muted" style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--brand-blue)', marginTop: '0.35rem' }}>{value}</div>
      {sub && <div className="muted" style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>{sub}</div>}
    </div>
  );
}

function TabBtn({ active, onClick, children }) {
  return (
    <button type="button" className={`btn ${active ? 'btn-primary' : 'btn-ghost'}`} style={{ fontSize: '0.85rem' }} onClick={onClick}>
      {children}
    </button>
  );
}

function PastelEgresos({ slices, titulo }) {
  if (!slices?.length) return <p className="muted">Sin egresos para graficar.</p>;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.25rem', alignItems: 'center' }}>
      <div style={{ width: 150, height: 150, borderRadius: '50%', flexShrink: 0, ...estiloPastel(slices) }} title={titulo} />
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', fontSize: '0.85rem' }}>
        {slices.map((s) => (
          <li key={s.id || s.label} style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.35rem' }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: s.color, flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{s.label}</span>
            <strong>{fmt(s.total)}</strong>
            <span className="muted">{s.pct.toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function ContVirtual({ supabase, user }) {
  const esAdmin = puedeGestionarUsuarios(user?.rol);
  const tiendas = useMemo(() => listarSucursalesOperativas(), []);
  const [tab, setTab] = useState('resumen');
  const [filtroTienda, setFiltroTienda] = useState('');
  const [presetFecha, setPresetFecha] = useState('semana');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [cargando, setCargando] = useState(false);
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [catalogo, setCatalogo] = useState([]);
  const [avisoSql, setAvisoSql] = useState('');

  const [manual, setManual] = useState({
    fecha: hoyYmd(),
    sucursal_id: '',
    categoria_id: 'manual',
    subcategoria_id: 'manual-otros',
    monto: '',
    descripcion: '',
  });
  const [nuevaCat, setNuevaCat] = useState('');
  const [nuevaSub, setNuevaSub] = useState({ categoriaId: 'vales', nombre: '' });
  const [guardando, setGuardando] = useState(false);

  const rango = useMemo(() => {
    if (presetFecha === 'rango') return { desde: desde || null, hasta: hasta || null };
    return rangoDesdePresetContVirtual(presetFecha);
  }, [presetFecha, desde, hasta]);

  const cargarCatalogo = useCallback(async () => {
    const res = await listarCatalogoContVirtual(supabase);
    setCatalogo((res.data || []).filter((c) => c.activo !== false));
    if (res.aviso) setAvisoSql(res.aviso);
  }, [supabase]);

  const cargar = useCallback(async () => {
    if (!supabase || !rango?.desde || !rango?.hasta) return;
    setCargando(true);
    setError('');
    const res = await cargarContVirtual(supabase, {
      desde: rango.desde,
      hasta: rango.hasta,
      sucursal: filtroTienda || null,
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
  }, [supabase, rango, filtroTienda]);

  useEffect(() => {
    cargarCatalogo();
  }, [cargarCatalogo]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const subsManual = useMemo(() => {
    const cat = catalogo.find((c) => c.id === manual.categoria_id);
    return (cat?.subcategorias || []).filter((s) => s.activo !== false);
  }, [catalogo, manual.categoria_id]);

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
    alert('Egreso manual registrado.');
    cargar();
  };

  const agregarCategoria = async () => {
    if (!esAdmin) return;
    setGuardando(true);
    const res = await crearCategoriaContVirtual(supabase, { nombre: nuevaCat });
    setGuardando(false);
    if (!res.ok) return alert(res.error);
    setNuevaCat('');
    await cargarCatalogo();
    alert('Categoría creada.');
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
    alert('Subcategoría creada.');
  };

  const borrarEgreso = async (row) => {
    if (!esAdmin || !row?.borrable) return;
    if (!confirm('¿Eliminar este egreso manual?')) return;
    const res = await eliminarEgresoContVirtual(supabase, row.id);
    if (!res.ok) return alert(res.error);
    cargar();
  };

  const catEntries = Object.entries(datos?.egresosPorCat || {});

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <h2 style={{ margin: 0, color: '#8e44ad' }}>Cont Virtual</h2>
        <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.88rem' }}>
          Ingresos y egresos de Virtual por categoría/subcategoría. Vales de gasolina, herramienta y accesorios
          se registran automáticamente. Independiente de Abarrotes.
        </p>
      </div>

      {(avisoSql || datos?.avisoCatalogo) && (
        <div className="card" style={{ borderLeft: '4px solid var(--brand-gold)', fontSize: '0.85rem' }}>
          {avisoSql || datos?.avisoCatalogo || AVISO_FALTA_CONT_VIRTUAL}
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        <TabBtn active={tab === 'resumen'} onClick={() => setTab('resumen')}>Resumen</TabBtn>
        <TabBtn active={tab === 'egresos'} onClick={() => setTab('egresos')}>Egresos</TabBtn>
        {esAdmin && <TabBtn active={tab === 'manual'} onClick={() => setTab('manual')}>Captura manual</TabBtn>}
        {esAdmin && <TabBtn active={tab === 'catalogo'} onClick={() => setTab('catalogo')}>Categorías</TabBtn>}
      </div>

      <div className="card">
        <h3 style={{ margin: '0 0 0.75rem', color: '#8e44ad' }}>Filtros</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
          <label className="muted" style={{ fontSize: '0.8rem' }}>
            Tienda
            <select className="select" style={{ display: 'block', marginTop: '0.2rem', minWidth: 160 }} value={filtroTienda} onChange={(e) => setFiltroTienda(e.target.value)}>
              <option value="">Todas las tiendas</option>
              {tiendas.map((t) => (
                <option key={t} value={t}>{etiquetaTienda(t)}</option>
              ))}
            </select>
          </label>
          <FiltroPeriodo
            labelPeriodo="Periodo (día / semana / mes / año)"
            preset={presetFecha}
            onPresetChange={setPresetFecha}
            desde={desde}
            hasta={hasta}
            onDesdeChange={setDesde}
            onHastaChange={setHasta}
            presets={PRESETS_CONT_VIRTUAL}
            className="cal-picker-wrap--inline"
          />
          <button type="button" className="btn btn-primary" disabled={cargando} onClick={cargar}>
            {cargando ? 'Actualizando…' : 'Actualizar'}
          </button>
        </div>
        {error && <p style={{ color: 'var(--brand-red)', margin: '0.75rem 0 0' }}>{error}</p>}
      </div>

      {tab === 'resumen' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem' }}>
            <Kpi label="Ingresos (corte)" value={fmt(datos?.ingresosTotal)} sub={`${datos?.cierresCount || 0} cierres`} accent="#8e44ad" />
            <Kpi label="Egresos" value={fmt(datos?.egresosTotal)} sub="Por categoría" accent="#c0392b" />
            <Kpi label="Neto" value={fmt(datos?.neto)} sub={`${rango?.desde || '—'} → ${rango?.hasta || '—'}`} accent="#16a34a" />
          </div>

          <div className="grid-2" style={{ gap: '1rem' }}>
            <div className="card">
              <h3 style={{ margin: '0 0 0.75rem', color: '#8e44ad' }}>Pastel de egresos por categoría</h3>
              <p className="muted" style={{ fontSize: '0.8rem', marginTop: 0 }}>
                Periodo: {PRESETS_CONT_VIRTUAL.find((p) => p.id === presetFecha)?.label || presetFecha}
              </p>
              <PastelEgresos slices={datos?.pastelCategorias} titulo="Egresos por categoría" />
            </div>
            <div className="card">
              <h3 style={{ margin: '0 0 0.75rem', color: '#8e44ad' }}>Pastel por subcategoría</h3>
              <PastelEgresos slices={datos?.pastelSubcategorias} titulo="Egresos por subcategoría" />
            </div>
          </div>

          <div className="card">
            <h3 style={{ margin: '0 0 0.75rem', color: '#8e44ad' }}>Totales por categoría</h3>
            {catEntries.length === 0 ? (
              <p className="muted">Sin egresos en el periodo.</p>
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Categoría</th>
                      <th style={{ textAlign: 'right' }}>Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {catEntries
                      .sort((a, b) => b[1] - a[1])
                      .map(([nombre, total]) => (
                        <tr key={nombre}>
                          <td>{nombre}</td>
                          <td style={{ textAlign: 'right' }}>{fmt(total)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="grid-2" style={{ gap: '1rem' }}>
            <div className="card">
              <h3 style={{ margin: '0 0 0.75rem', color: '#8e44ad' }}>Ingresos por tienda</h3>
              {(datos?.ingresosPorTienda || []).length === 0 ? (
                <p className="muted">Sin cierres.</p>
              ) : (
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Tienda</th>
                        <th>Ingresos</th>
                        <th>Cierres</th>
                      </tr>
                    </thead>
                    <tbody>
                      {datos.ingresosPorTienda.map((r) => (
                        <tr key={r.id}>
                          <td>{r.label}</td>
                          <td>{fmt(r.ingresos)}</td>
                          <td>{r.cierres}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="card">
              <h3 style={{ margin: '0 0 0.75rem', color: '#8e44ad' }}>Egresos por tienda</h3>
              {(datos?.egresosPorTienda || []).length === 0 ? (
                <p className="muted">Sin egresos.</p>
              ) : (
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Tienda</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {datos.egresosPorTienda.map((r) => (
                        <tr key={r.id}>
                          <td>{r.label}</td>
                          <td>{fmt(r.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {tab === 'egresos' && (
        <div className="card">
          <h3 style={{ margin: '0 0 0.75rem', color: '#8e44ad' }}>Detalle de egresos</h3>
          <p className="muted" style={{ fontSize: '0.82rem' }}>
            Incluye libro Cont Virtual (manual + vales auto), consumos/operativos del Corte Virtual y desembolsos de préstamos.
          </p>
          {(datos?.detalleGastos || []).length === 0 ? (
            <p className="muted">Sin movimientos.</p>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Tienda</th>
                    <th>Fuente</th>
                    <th>Categoría</th>
                    <th>Detalle</th>
                    <th>Monto</th>
                    {esAdmin && <th />}
                  </tr>
                </thead>
                <tbody>
                  {datos.detalleGastos.map((g) => (
                    <tr key={`${g.fuente}-${g.id}`}>
                      <td>{g.fecha}</td>
                      <td>{etiquetaTienda(g.tienda)}</td>
                      <td>{g.fuente}</td>
                      <td>
                        {g.categoria}
                        {g.subcategoria ? ` / ${g.subcategoria}` : ''}
                      </td>
                      <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.comentario || g.empleado || '—'}</td>
                      <td>{fmt(g.monto)}</td>
                      {esAdmin && (
                        <td>
                          {g.borrable && (
                            <button type="button" className="btn btn-ghost" style={{ fontSize: '0.75rem', color: 'var(--brand-red)' }} onClick={() => borrarEgreso(g)}>
                              Borrar
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'manual' && esAdmin && (
        <div className="card" style={{ borderLeft: '4px solid #8e44ad' }}>
          <h3 style={{ margin: '0 0 0.5rem', color: '#8e44ad' }}>Captura manual de egreso</h3>
          <p className="muted" style={{ fontSize: '0.85rem', marginTop: 0 }}>
            Para gastos de Virtual que no se capturan en la app (pagos externos, compras, etc.).
          </p>
          <div className="grid-2" style={{ gap: '0.75rem' }}>
            <label className="muted">
              Fecha
              <input className="input" type="date" style={{ marginTop: '0.35rem' }} value={manual.fecha} onChange={(e) => setManual({ ...manual, fecha: e.target.value })} />
            </label>
            <label className="muted">
              Tienda
              <select className="select" style={{ marginTop: '0.35rem' }} value={manual.sucursal_id} onChange={(e) => setManual({ ...manual, sucursal_id: e.target.value })}>
                <option value="">MAIN / oficina</option>
                {tiendas.map((t) => (
                  <option key={t} value={t}>{etiquetaTienda(t)}</option>
                ))}
              </select>
            </label>
            <label className="muted">
              Categoría
              <select
                className="select"
                style={{ marginTop: '0.35rem' }}
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
            <label className="muted">
              Subcategoría
              <select className="select" style={{ marginTop: '0.35rem' }} value={manual.subcategoria_id} onChange={(e) => setManual({ ...manual, subcategoria_id: e.target.value })}>
                {subsManual.map((s) => (
                  <option key={s.id} value={s.id}>{s.nombre}</option>
                ))}
              </select>
            </label>
            <label className="muted">
              Monto
              <input className="input" type="number" min="0" step="0.01" style={{ marginTop: '0.35rem' }} value={manual.monto} onChange={(e) => setManual({ ...manual, monto: e.target.value })} />
            </label>
            <label className="muted" style={{ gridColumn: '1 / -1' }}>
              Descripción
              <input className="input" style={{ marginTop: '0.35rem' }} value={manual.descripcion} onChange={(e) => setManual({ ...manual, descripcion: e.target.value })} placeholder="Detalle del egreso" />
            </label>
          </div>
          <button type="button" className="btn btn-primary" style={{ marginTop: '0.85rem' }} disabled={guardando} onClick={guardarManual}>
            {guardando ? 'Guardando…' : 'Registrar egreso'}
          </button>
        </div>
      )}

      {tab === 'catalogo' && esAdmin && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="card">
            <h3 style={{ margin: '0 0 0.5rem', color: '#8e44ad' }}>Categorías y subcategorías</h3>
            <p className="muted" style={{ fontSize: '0.85rem' }}>
              El administrador define cómo se clasifican los egresos. Las fijas del sistema (Vales → Gasolina, etc.) no se eliminan.
            </p>
            {(catalogo || []).map((c) => (
              <div key={c.id} style={{ marginTop: '0.75rem', padding: '0.75rem', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <strong>{c.nombre}</strong>
                  {!c.fijo && (
                    <button type="button" className="btn btn-ghost" style={{ fontSize: '0.75rem', color: 'var(--brand-red)' }} onClick={() => desactivarCategoriaContVirtual(supabase, c.id).then(cargarCatalogo)}>
                      Desactivar
                    </button>
                  )}
                </div>
                <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.1rem', fontSize: '0.85rem' }}>
                  {(c.subcategorias || []).filter((s) => s.activo !== false).map((s) => (
                    <li key={s.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                      <span>{s.nombre}{s.fijo ? ' · sistema' : ''}</span>
                      {!s.fijo && (
                        <button type="button" className="btn btn-ghost" style={{ fontSize: '0.72rem', padding: '0.1rem 0.35rem' }} onClick={() => desactivarSubcategoriaContVirtual(supabase, s.id).then(cargarCatalogo)}>
                          Quitar
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="card grid-2" style={{ gap: '0.75rem' }}>
            <div>
              <h4 style={{ margin: '0 0 0.5rem' }}>Nueva categoría</h4>
              <input className="input" value={nuevaCat} onChange={(e) => setNuevaCat(e.target.value)} placeholder="Nombre" />
              <button type="button" className="btn btn-primary" style={{ marginTop: '0.5rem' }} disabled={guardando || !nuevaCat.trim()} onClick={agregarCategoria}>
                Agregar
              </button>
            </div>
            <div>
              <h4 style={{ margin: '0 0 0.5rem' }}>Nueva subcategoría</h4>
              <select className="select" value={nuevaSub.categoriaId} onChange={(e) => setNuevaSub({ ...nuevaSub, categoriaId: e.target.value })}>
                {catalogo.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
              <input className="input" style={{ marginTop: '0.5rem' }} value={nuevaSub.nombre} onChange={(e) => setNuevaSub({ ...nuevaSub, nombre: e.target.value })} placeholder="Nombre subcategoría" />
              <button type="button" className="btn btn-primary" style={{ marginTop: '0.5rem' }} disabled={guardando || !nuevaSub.nombre.trim()} onClick={agregarSub}>
                Agregar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
