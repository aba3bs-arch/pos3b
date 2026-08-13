import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  agregarSubcategoriaGasto,
  eliminarCategoriaGasto,
  guardarCategoriaGasto,
  listarCatalogoGastos,
  renombrarCategoriaGasto,
  gastoRequiereEmpleado,
  gastoDescuentaNomina,
} from '../../lib/corteContabilidad/catalogoGastos.js';
import {
  agruparEmpleadosParaSelectCorte,
  empleadosParaCorte,
} from '../../lib/empleadosVisibles.js';
import { esCategoriaEmpleado } from '../../lib/catalogoEmpleadoGastos.js';
import { etiquetaTienda, normalizarCodigoTienda } from '../../constants/sucursales.js';
import { asegurarCamposSinReservadoOPin } from '../../lib/reservadoAdminPrincipal.js';

function fmt(n) {
  return `$${(Number(n) || 0).toFixed(2)}`;
}

const btnSm = { fontSize: '0.75rem', padding: '0.25rem 0.5rem' };

function contarReales(lista) {
  return (lista || []).filter((e) => e && !String(e.id).startsWith('indirect:')).length;
}

export default function CorteGastosPanel({
  modulo,
  supabase,
  sucursal,
  user,
  gastos,
  empleados,
  onAgregar,
  onEliminar,
  onEditar,
  habilitado,
  puedeCatalogo,
  puedeEditarGastos,
  notaNomina,
}) {
  const [catalogo, setCatalogo] = useState([]);
  const [cat, setCat] = useState('');
  const [sub, setSub] = useState('');
  const [monto, setMonto] = useState('');
  const [comentario, setComentario] = useState('');
  const [usuarioId, setUsuarioId] = useState('');
  const [mostrarCat, setMostrarCat] = useState(false);
  const [usuariosRaw, setUsuariosRaw] = useState([]);
  const [avisoEmp, setAvisoEmp] = useState('');

  const cargarUsuarios = useCallback(async () => {
    if (!supabase) {
      setUsuariosRaw([]);
      return;
    }
    const intentos = [
      'id, nombre, rol, sucursal_id, tipo_empleado, nomina_pagador, activo',
      'id, nombre, rol, sucursal_id, tipo_empleado, activo',
      'id, nombre, rol, sucursal_id, activo',
      '*',
    ];
    let lastErr = null;
    for (const cols of intentos) {
      const res = await supabase.from('usuarios').select(cols).order('nombre');
      if (!res.error) {
        setUsuariosRaw(res.data || []);
        setAvisoEmp('');
        return;
      }
      lastErr = res.error;
    }
    setUsuariosRaw([]);
    setAvisoEmp(lastErr?.message || 'No se pudieron cargar empleados desde usuarios.');
  }, [supabase]);

  useEffect(() => {
    cargarUsuarios();
  }, [cargarUsuarios]);

  const empleadosEfectivos = useMemo(() => {
    const desdeRaw = empleadosParaCorte(usuariosRaw, sucursal, modulo, user?.rol);
    const desdeProp = empleados || [];
    return contarReales(desdeRaw) >= contarReales(desdeProp) ? desdeRaw : desdeProp.length ? desdeProp : desdeRaw;
  }, [usuariosRaw, empleados, sucursal, modulo, user?.rol]);

  const gruposEmpleados = useMemo(
    () => agruparEmpleadosParaSelectCorte(empleadosEfectivos),
    [empleadosEfectivos],
  );

  const cargarCat = useCallback(async () => {
    const res = await listarCatalogoGastos(supabase, sucursal, modulo);
    const lista = res.data?.length ? res.data : [];
    setCatalogo(lista);
  }, [supabase, sucursal, modulo]);

  useEffect(() => {
    cargarCat();
  }, [cargarCat]);

  const subsDeCat = catalogo.find((c) => c.categoria === cat)?.subcategorias || [];
  const filaCat = catalogo.find((c) => c.categoria === cat);
  const esCatEmpleado = Boolean(
    filaCat?.es_categoria_empleado || esCategoriaEmpleado(filaCat || { categoria: cat }),
  );
  // EMPLEADO + sus subtipos (o legacy): aparece la lista desplegable de empleados.
  const requiereEmpleado = esCatEmpleado || gastoRequiereEmpleado(modulo, cat, sub);

  const empSeleccionado = requiereEmpleado
    ? (empleadosEfectivos || []).find((e) => String(e.id) === String(usuarioId))
    : null;
  const rutaGasto = [cat || null, sub || null, empSeleccionado?.nombre || null]
    .filter(Boolean)
    .join(' · ');

  useEffect(() => {
    if (!habilitado || !catalogo.length) return;
    setCat((prev) => {
      if (prev && catalogo.some((c) => c.categoria === prev)) return prev;
      const emp = catalogo.find((c) => c.es_categoria_empleado || esCategoriaEmpleado(c));
      return emp?.categoria || catalogo[0].categoria;
    });
  }, [habilitado, catalogo]);

  useEffect(() => {
    if (!habilitado || !cat) return;
    const subs = catalogo.find((c) => c.categoria === cat)?.subcategorias || [];
    setSub((prev) => {
      if (prev && subs.includes(prev)) return prev;
      return subs[0] || '';
    });
    if (!(esCategoriaEmpleado({ categoria: cat }) || gastoRequiereEmpleado(modulo, cat, subs[0] || ''))) {
      setUsuarioId('');
    }
  }, [habilitado, cat, catalogo, modulo]);

  const agregar = async () => {
    const m = Number(monto);
    if (!(m > 0)) return alert('Monto inválido.');
    if (!cat.trim()) return alert('Selecciona categoría.');
    if (requiereEmpleado && !usuarioId) {
      return alert('Selecciona el empleado a quien se descontará el consumo en nómina.');
    }
    const authTxt = await asegurarCamposSinReservadoOPin(
      supabase,
      [cat, sub, comentario],
      { user, sucursal },
    );
    if (!authTxt.ok) return alert(authTxt.error);
    const emp = requiereEmpleado ? (empleadosEfectivos || []).find((e) => String(e.id) === String(usuarioId)) : null;
    const uid = emp?.id != null ? String(emp.id) : '';
    onAgregar?.({
      categoria: cat.trim().toUpperCase(),
      subcategoria: sub.trim().toUpperCase(),
      monto: m,
      comentario: comentario.trim().toUpperCase(),
      usuario_id: requiereEmpleado && uid && !uid.startsWith('indirect:') ? uid : null,
      usuario_nombre: emp?.nombre || '',
    });
    setMonto('');
    setComentario('');
    if (!requiereEmpleado) setUsuarioId('');
  };

  const nuevaCategoria = async () => {
    const nombre = prompt('Nombre de la categoría:');
    if (!nombre?.trim()) return;
    const authTxt = await asegurarCamposSinReservadoOPin(supabase, [nombre], { user, sucursal });
    if (!authTxt.ok) return alert(authTxt.error);
    const res = await guardarCategoriaGasto(supabase, sucursal, modulo, nombre, []);
    if (!res.ok) return alert(res.error);
    cargarCat();
  };

  const nuevaSubcategoria = async (categoria) => {
    const nombre = prompt(`Subcategoría para ${categoria}:`);
    if (!nombre?.trim()) return;
    const authTxt = await asegurarCamposSinReservadoOPin(supabase, [nombre], { user, sucursal });
    if (!authTxt.ok) return alert(authTxt.error);
    const res = await agregarSubcategoriaGasto(supabase, sucursal, modulo, categoria, nombre);
    if (!res.ok) return alert(res.error);
    cargarCat();
  };

  const editarCategoria = async (categoria) => {
    const row = catalogo.find((c) => c.categoria === categoria);
    if (!row) return;
    const esEmp = Boolean(row.es_categoria_empleado || esCategoriaEmpleado(row));
    let nombre = row.categoria;
    if (!esEmp) {
      const nuevo = prompt('Nuevo nombre de categoría:', row.categoria);
      if (!nuevo?.trim()) return;
      nombre = nuevo;
    }
    const subsTxt = prompt(
      esEmp
        ? 'Tipos de EMPLEADO (Consumo, Anticipo…). Separados por coma. No renombres la categoría ni pongas nombres de personas aquí.'
        : 'Subcategorías (separadas por coma):',
      (row.subcategorias || []).join(', '),
    );
    if (subsTxt == null) return;
    const authTxt = await asegurarCamposSinReservadoOPin(supabase, [nombre, subsTxt], { user, sucursal });
    if (!authTxt.ok) return alert(authTxt.error);
    const subs = subsTxt
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const res = await renombrarCategoriaGasto(supabase, sucursal, modulo, categoria, nombre, subs);
    if (!res.ok) return alert(res.error);
    if (cat === categoria && !esEmp) setCat(nombre.trim().toUpperCase());
    cargarCat();
  };

  const borrarCat = async (categoria) => {
    const row = catalogo.find((c) => c.categoria === categoria);
    if (row?.es_categoria_empleado || esCategoriaEmpleado(row || { categoria })) {
      return alert('EMPLEADO no se elimina. Es la categoría de nómina (tienda + indirectos).');
    }
    if (!confirm(`¿Eliminar categoría ${categoria}?`)) return;
    const res = await eliminarCategoriaGasto(supabase, sucursal, modulo, categoria);
    if (!res.ok) return alert(res.error);
    if (cat === categoria) {
      setCat('');
      setSub('');
    }
    cargarCat();
  };

  return (
    <div className="card" style={{ margin: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h4 style={{ margin: 0, color: 'var(--brand-blue)' }}>Gastos del turno</h4>
        {puedeCatalogo && (
          <button type="button" className="btn btn-ghost" style={btnSm} onClick={() => setMostrarCat((o) => !o)}>
            {mostrarCat ? 'Ocultar catálogo' : 'Catálogo'}
          </button>
        )}
      </div>
      <p className="muted" style={{ fontSize: '0.75rem', margin: '0.35rem 0 0.5rem' }}>
        {notaNomina ||
          (modulo === 'abarrotes'
            ? 'Categorías de IE Abarrotes (+ PROVEEDORES). Gastos del corte no requieren aprobación. CUBRE TURNO va a IE Abarrotes (nómina). Solo CONSUMO/RECARGAS/ANTICIPOS/FALTANTE descuentan al empleado.'
            : 'Categorías de IE Virtual. Gastos del corte no requieren aprobación. CUBRE TURNO va a IE (nómina). Solo CONSUMO/RECARGAS/ANTICIPOS/FALTANTE descuentan al empleado. Vales y préstamos sí requieren admin.')}
      </p>

      {mostrarCat && puedeCatalogo && (
        <div style={{ marginBottom: '0.75rem', padding: '0.5rem', background: 'var(--surface)', borderRadius: 8 }}>
          <p className="muted" style={{ fontSize: '0.75rem', margin: '0 0 0.5rem' }}>
            {modulo === 'abarrotes' ? (
              <>
                Catálogo de <strong>IE Abarrotes</strong> (compartido con IE Virtual) más <strong>PROVEEDORES</strong> solo en este corte.
                Proveedores no se mueven a IE.
              </>
            ) : (
              <>
                Catálogo compartido desde <strong>IE Virtual</strong>. También se edita en Contabilidad → IE Virtual → Catálogo.
              </>
            )}
          </p>
          <button type="button" className="btn btn-ghost" style={{ ...btnSm, marginBottom: '0.5rem' }} onClick={nuevaCategoria}>
            + Categoría
          </button>
          {catalogo.map((c) => {
            const esEmp = esCategoriaEmpleado(c) || c.es_categoria_empleado;
            return (
            <div
              key={c.ieId || c.categoria}
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: '0.35rem',
                marginBottom: '0.4rem',
                padding: '0.35rem 0',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <strong style={{ fontSize: '0.85rem', minWidth: 90 }}>
                {c.categoria}
                {c.fuente === 'proveedores' ? (
                  <span className="muted" style={{ fontWeight: 500, fontSize: '0.72rem' }}>
                    {' '}
                    · prov.
                  </span>
                ) : null}
              </strong>
              <span className="muted" style={{ fontSize: '0.8rem', flex: 1 }}>
                {(c.subcategorias || []).length ? c.subcategorias.join(' · ') : 'Sin subcategorías'}
                {esEmp ? ' · (al capturar: lista desplegable de empleados)' : ''}
              </span>
              <button type="button" className="btn btn-ghost" style={btnSm} onClick={() => nuevaSubcategoria(c.categoria)}>
                {esEmp ? '+ Tipo' : '+ Sub'}
              </button>
              <button type="button" className="btn btn-ghost" style={btnSm} onClick={() => editarCategoria(c.categoria)}>
                {esEmp ? 'Editar tipos' : 'Editar'}
              </button>
              {!esEmp && (
                <button type="button" className="btn btn-ghost" style={{ ...btnSm, color: 'var(--danger)' }} onClick={() => borrarCat(c.categoria)}>
                  Eliminar
                </button>
              )}
            </div>
            );
          })}
          {!catalogo.length && <p className="muted" style={{ fontSize: '0.8rem', margin: 0 }}>Sin categorías. Usa + Categoría.</p>}
        </div>
      )}

      {habilitado ? (
        <>
          {!catalogo.length && (
            <p className="muted" style={{ fontSize: '0.8rem', marginBottom: '0.5rem', color: 'var(--brand-gold)' }}>
              Sin categorías de gasto. Pide al administrador que configure el catálogo o usa el botón Catálogo si tienes permiso.
            </p>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.4rem', marginBottom: '0.4rem' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', fontSize: '0.72rem', fontWeight: 700 }}>
              <span className="muted">Categoría</span>
              <select
                className="select"
                value={cat}
                onChange={(e) => {
                  setCat(e.target.value);
                  setSub('');
                  setUsuarioId('');
                }}
              >
                <option value="">Categoría</option>
                {catalogo.map((c) => (
                  <option key={c.categoria} value={c.categoria}>
                    {c.categoria}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', fontSize: '0.72rem', fontWeight: 700 }}>
              <span className="muted">Subcategoría</span>
              <select className="select" value={sub} onChange={(e) => setSub(e.target.value)} disabled={!cat}>
                <option value="">Subcategoría</option>
                {subsDeCat.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            {requiereEmpleado && (
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', fontSize: '0.72rem', fontWeight: 700, gridColumn: '1 / -1' }}>
                <span className="muted">Empleado (lista vinculada a {sub || 'esta subcategoría'})</span>
                <select className="select" value={usuarioId} onChange={(e) => setUsuarioId(e.target.value)}>
                  <option value="">Elige empleado…</option>
                  {gruposEmpleados.tienda.length > 0 && (
                    <optgroup label="Empleados de esta tienda">
                      {gruposEmpleados.tienda.map((e) => (
                        <option key={e.id} value={e.id}>
                          {normalizarCodigoTienda(sucursal) === 'MAIN' || !sucursal
                            ? `${e.nombre} · ${etiquetaTienda(e.sucursal_id)}`
                            : e.nombre}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {gruposEmpleados.indirectos.length > 0 && (
                    <optgroup label="Indirectos / MAIN">
                      {gruposEmpleados.indirectos.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.nombre}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {gruposEmpleados.admins.length > 0 && (
                    <optgroup label="Administradores">
                      {gruposEmpleados.admins.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.nombre}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </label>
            )}
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', fontSize: '0.72rem', fontWeight: 700 }}>
              <span className="muted">Monto</span>
              <input className="input" type="number" min="0" step="0.01" placeholder="Monto" value={monto} onChange={(e) => setMonto(e.target.value)} />
            </label>
          </div>
          {rutaGasto ? (
            <p className="muted" style={{ fontSize: '0.78rem', margin: '0 0 0.45rem', fontWeight: 600 }}>
              {rutaGasto}
            </p>
          ) : null}
          {requiereEmpleado && avisoEmp ? (
            <p className="muted" style={{ fontSize: '0.75rem', color: 'var(--danger)', margin: '0 0 0.4rem' }}>
              {avisoEmp}
            </p>
          ) : null}
          {requiereEmpleado && !avisoEmp && !gruposEmpleados.tienda.length && !gruposEmpleados.indirectos.length ? (
            <p className="muted" style={{ fontSize: '0.75rem', margin: '0 0 0.4rem' }}>
              Sin empleados cargados. Revisa módulo Empleados (tipo tienda / indirecto) y la tienda activa del corte.
            </p>
          ) : null}
          <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
            <input
              className="input"
              placeholder="Comentario (opcional)"
              style={{ flex: 1, minWidth: 140 }}
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && agregar()}
            />
            <button type="button" className="btn btn-primary" onClick={agregar}>
              Agregar
            </button>
          </div>
        </>
      ) : (
        <p className="muted" style={{ fontSize: '0.8rem', marginBottom: '0.5rem' }}>
          Sin permiso para capturar gastos en este corte.
        </p>
      )}

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Hora</th>
              <th>Empleado</th>
              <th>Cat.</th>
              <th>Sub</th>
              <th>Monto</th>
              <th>Estado</th>
              <th>Nota</th>
              {habilitado && <th />}
            </tr>
          </thead>
          <tbody>
            {(gastos || []).map((g) => {
              const est = g.estado_aprobacion || 'aprobado';
              const pendiente = est === 'pendiente_admin';
              const rechazado = est === 'rechazado';
              const hora = g.created_at
                ? new Date(g.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
                : '—';
              return (
              <tr key={g.id} style={pendiente ? { background: 'rgba(225,153,41,0.08)' } : rechazado ? { opacity: 0.55 } : undefined}>
                <td style={{ fontWeight: 700, whiteSpace: 'nowrap', fontSize: '0.8rem' }}>{hora}</td>
                <td>
                  {gastoDescuentaNomina(modulo, g.categoria) ? g.usuario_nombre || '—' : <span className="muted">—</span>}
                </td>
                <td>{g.categoria}</td>
                <td className="muted">{g.subcategoria || '—'}</td>
                <td style={{ fontWeight: 700 }}>
                  {puedeEditarGastos ? (
                    <input
                      className="input"
                      type="number"
                      min="0"
                      step="0.01"
                      style={{ width: '90px', fontWeight: 700 }}
                      value={g.monto}
                      onChange={(e) => onEditar?.(g.id, { monto: e.target.value })}
                    />
                  ) : (
                    fmt(g.monto)
                  )}
                </td>
                <td style={{ fontSize: '0.75rem', fontWeight: 700, color: pendiente ? 'var(--brand-gold)' : rechazado ? 'var(--danger)' : '#2e7d32' }}>
                  {pendiente ? 'Pendiente admin' : rechazado ? 'Rechazado' : 'Aprobado'}
                </td>
                <td className="muted">{g.comentario || '—'}</td>
                {habilitado && (
                  <td>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ padding: '0.2rem 0.4rem', color: 'var(--danger)' }}
                      onClick={() => onEliminar?.(g.id)}
                    >
                      Eliminar
                    </button>
                  </td>
                )}
              </tr>
            );
            })}
            {(!gastos || gastos.length === 0) && (
              <tr>
                <td colSpan={habilitado ? 8 : 7} className="muted">
                  Sin gastos en este turno.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
