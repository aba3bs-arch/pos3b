import React, { useCallback, useEffect, useState } from 'react';
import {
  agregarSubcategoriaGasto,
  eliminarCategoriaGasto,
  guardarCategoriaGasto,
  listarCatalogoGastos,
  renombrarCategoriaGasto,
} from '../../lib/corteContabilidad/catalogoGastos.js';

function fmt(n) {
  return `$${(Number(n) || 0).toFixed(2)}`;
}

const btnSm = { fontSize: '0.75rem', padding: '0.25rem 0.5rem' };

export default function CorteGastosPanel({
  modulo,
  supabase,
  sucursal,
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

  const cargarCat = useCallback(async () => {
    const res = await listarCatalogoGastos(supabase, sucursal, modulo);
    const lista = res.data || [];
    setCatalogo(lista);
    if (!cat && lista.length) setCat(lista[0].categoria);
  }, [supabase, sucursal, modulo, cat]);

  useEffect(() => {
    cargarCat();
  }, [cargarCat]);

  const subsDeCat = catalogo.find((c) => c.categoria === cat)?.subcategorias || [];

  const agregar = () => {
    const m = Number(monto);
    if (!(m > 0)) return alert('Monto inválido.');
    if (!cat.trim()) return alert('Selecciona categoría.');
    if (!usuarioId) return alert('Selecciona el empleado a quien se descontará en nómina.');
    const emp = (empleados || []).find((e) => String(e.id) === String(usuarioId));
    onAgregar?.({
      categoria: cat.trim().toUpperCase(),
      subcategoria: sub.trim().toUpperCase(),
      monto: m,
      comentario: comentario.trim().toUpperCase(),
      usuario_id: usuarioId,
      usuario_nombre: emp?.nombre || '',
    });
    setMonto('');
    setComentario('');
  };

  const nuevaCategoria = async () => {
    const nombre = prompt('Nombre de la categoría:');
    if (!nombre?.trim()) return;
    const res = await guardarCategoriaGasto(supabase, sucursal, modulo, nombre, []);
    if (!res.ok) return alert(res.error);
    cargarCat();
  };

  const nuevaSubcategoria = async (categoria) => {
    const nombre = prompt(`Subcategoría para ${categoria}:`);
    if (!nombre?.trim()) return;
    const res = await agregarSubcategoriaGasto(supabase, sucursal, modulo, categoria, nombre);
    if (!res.ok) return alert(res.error);
    cargarCat();
  };

  const editarCategoria = async (categoria) => {
    const row = catalogo.find((c) => c.categoria === categoria);
    if (!row) return;
    const nombre = prompt('Nuevo nombre de categoría:', row.categoria);
    if (!nombre?.trim()) return;
    const subsTxt = prompt('Subcategorías (separadas por coma):', (row.subcategorias || []).join(', '));
    if (subsTxt == null) return;
    const subs = subsTxt
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const res = await renombrarCategoriaGasto(supabase, sucursal, modulo, categoria, nombre, subs);
    if (!res.ok) return alert(res.error);
    if (cat === categoria) setCat(nombre.trim().toUpperCase());
    cargarCat();
  };

  const borrarCat = async (categoria) => {
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
        {notaNomina || 'El consumo se descuenta en nómina al empleado que elijas (no al usuario que captura).'}
      </p>

      {mostrarCat && puedeCatalogo && (
        <div style={{ marginBottom: '0.75rem', padding: '0.5rem', background: 'var(--surface)', borderRadius: 8 }}>
          <p className="muted" style={{ fontSize: '0.75rem', margin: '0 0 0.5rem' }}>
            Catálogo compartido en <strong>todas las sucursales</strong>.
          </p>
          <button type="button" className="btn btn-ghost" style={{ ...btnSm, marginBottom: '0.5rem' }} onClick={nuevaCategoria}>
            + Categoría
          </button>
          {catalogo.map((c) => (
            <div
              key={c.categoria}
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
              <strong style={{ fontSize: '0.85rem', minWidth: 90 }}>{c.categoria}</strong>
              <span className="muted" style={{ fontSize: '0.8rem', flex: 1 }}>
                {(c.subcategorias || []).length ? c.subcategorias.join(' · ') : 'Sin subcategorías'}
              </span>
              <button type="button" className="btn btn-ghost" style={btnSm} onClick={() => nuevaSubcategoria(c.categoria)}>
                + Sub
              </button>
              <button type="button" className="btn btn-ghost" style={btnSm} onClick={() => editarCategoria(c.categoria)}>
                Editar
              </button>
              <button type="button" className="btn btn-ghost" style={{ ...btnSm, color: 'var(--danger)' }} onClick={() => borrarCat(c.categoria)}>
                Eliminar
              </button>
            </div>
          ))}
          {!catalogo.length && <p className="muted" style={{ fontSize: '0.8rem', margin: 0 }}>Sin categorías. Usa + Categoría.</p>}
        </div>
      )}

      {habilitado && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.4rem', marginBottom: '0.4rem' }}>
            <select className="select" value={usuarioId} onChange={(e) => setUsuarioId(e.target.value)}>
              <option value="">Empleado</option>
              {(empleados || []).map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre}
                </option>
              ))}
            </select>
            <select
              className="select"
              value={cat}
              onChange={(e) => {
                setCat(e.target.value);
                setSub('');
              }}
            >
              <option value="">Categoría</option>
              {catalogo.map((c) => (
                <option key={c.categoria} value={c.categoria}>
                  {c.categoria}
                </option>
              ))}
            </select>
            <select className="select" value={sub} onChange={(e) => setSub(e.target.value)}>
              <option value="">Subcategoría</option>
              {subsDeCat.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <input className="input" type="number" min="0" step="0.01" placeholder="Monto" value={monto} onChange={(e) => setMonto(e.target.value)} />
          </div>
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
      )}

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Empleado</th>
              <th>Cat.</th>
              <th>Sub</th>
              <th>Monto</th>
              <th>Nota</th>
              {habilitado && <th />}
            </tr>
          </thead>
          <tbody>
            {(gastos || []).map((g) => (
              <tr key={g.id}>
                <td>{g.usuario_nombre || '—'}</td>
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
            ))}
            {(!gastos || gastos.length === 0) && (
              <tr>
                <td colSpan={habilitado ? 6 : 5} className="muted">
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
