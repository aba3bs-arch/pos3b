import React, { useCallback, useEffect, useState } from 'react';
import {
  agregarSubcategoriaGasto,
  eliminarCategoriaGasto,
  eliminarSubcategoriaGasto,
  guardarCategoriaGasto,
  listarCatalogoGastos,
  renombrarCategoriaGasto,
} from '../../lib/corteContabilidad/catalogoGastos.js';

function fmt(n) {
  return `$${(Number(n) || 0).toFixed(2)}`;
}

export default function CorteGastosPanel({
  modulo,
  supabase,
  sucursal,
  gastos,
  empleados,
  onAgregar,
  onEliminar,
  habilitado,
  puedeCatalogo,
}) {
  const [catalogo, setCatalogo] = useState([]);
  const [cat, setCat] = useState('');
  const [sub, setSub] = useState('');
  const [monto, setMonto] = useState('');
  const [comentario, setComentario] = useState('');
  const [usuarioId, setUsuarioId] = useState('');
  const [nuevaCat, setNuevaCat] = useState('');
  const [nuevaSub, setNuevaSub] = useState('');
  const [mostrarCat, setMostrarCat] = useState(false);
  const [editRows, setEditRows] = useState({});

  const cargarCat = useCallback(async () => {
    const res = await listarCatalogoGastos(supabase, sucursal, modulo);
    const lista = res.data || [];
    setCatalogo(lista);
    const edits = {};
    for (const c of lista) {
      edits[c.categoria] = { nombre: c.categoria, subs: [...(c.subcategorias || [])], nuevaSub: '' };
    }
    setEditRows(edits);
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

  const crearCategoria = async () => {
    const res = await guardarCategoriaGasto(supabase, sucursal, modulo, nuevaCat, nuevaSub ? [nuevaSub] : []);
    if (!res.ok) return alert(res.error);
    setNuevaCat('');
    setNuevaSub('');
    cargarCat();
  };

  const guardarEdicionCategoria = async (categoriaOriginal) => {
    const row = editRows[categoriaOriginal];
    if (!row) return;
    const subs = (row.subs || []).map((s) => String(s).trim().toUpperCase()).filter(Boolean);
    const res = await renombrarCategoriaGasto(supabase, sucursal, modulo, categoriaOriginal, row.nombre, subs);
    if (!res.ok) return alert(res.error);
    if (cat === categoriaOriginal) setCat(row.nombre.trim().toUpperCase());
    cargarCat();
  };

  const agregarSubEnEdicion = async (categoriaOriginal) => {
    const row = editRows[categoriaOriginal];
    if (!row?.nuevaSub?.trim()) return;
    const res = await agregarSubcategoriaGasto(supabase, sucursal, modulo, categoriaOriginal, row.nuevaSub);
    if (!res.ok) return alert(res.error);
    cargarCat();
  };

  const quitarSub = async (categoriaOriginal, sub) => {
    const res = await eliminarSubcategoriaGasto(supabase, sucursal, modulo, categoriaOriginal, sub);
    if (!res.ok) return alert(res.error);
    cargarCat();
  };

  const borrarCat = async (categoria) => {
    if (!confirm(`¿Eliminar categoría ${categoria}?`)) return;
    const res = await eliminarCategoriaGasto(supabase, sucursal, modulo, categoria);
    if (!res.ok) return alert(res.error);
    cargarCat();
  };

  const patchEditRow = (categoriaOriginal, patch) => {
    setEditRows((prev) => ({
      ...prev,
      [categoriaOriginal]: { ...prev[categoriaOriginal], ...patch },
    }));
  };

  const patchSubEnRow = (categoriaOriginal, idx, valor) => {
    setEditRows((prev) => {
      const row = prev[categoriaOriginal];
      if (!row) return prev;
      const subs = [...row.subs];
      subs[idx] = valor;
      return { ...prev, [categoriaOriginal]: { ...row, subs } };
    });
  };

  return (
    <div className="card" style={{ margin: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h4 style={{ margin: 0, color: 'var(--brand-blue)' }}>Gastos del turno</h4>
        {puedeCatalogo && (
          <button type="button" className="btn btn-ghost" style={{ fontSize: '0.8rem' }} onClick={() => setMostrarCat((o) => !o)}>
            {mostrarCat ? 'Ocultar catálogo' : 'Editar categorías'}
          </button>
        )}
      </div>
      <p className="muted" style={{ fontSize: '0.75rem', margin: '0.35rem 0 0.5rem' }}>
        Se descontarán automáticamente en nómina (semana sáb–vie).
      </p>

      {mostrarCat && puedeCatalogo && (
        <div style={{ marginBottom: '0.75rem', padding: '0.5rem', background: 'var(--surface)', borderRadius: 8 }}>
          <div className="grid-2" style={{ marginBottom: '0.5rem' }}>
            <input className="input" placeholder="Nueva categoría" value={nuevaCat} onChange={(e) => setNuevaCat(e.target.value)} />
            <input className="input" placeholder="Subcategoría inicial (opc.)" value={nuevaSub} onChange={(e) => setNuevaSub(e.target.value)} />
          </div>
          <button type="button" className="btn btn-ghost" style={{ marginBottom: '0.75rem' }} onClick={crearCategoria}>
            + Nueva categoría
          </button>

          {catalogo.map((c) => {
            const ed = editRows[c.categoria] || { nombre: c.categoria, subs: c.subcategorias || [], nuevaSub: '' };
            return (
              <div key={c.categoria} style={{ marginBottom: '0.75rem', padding: '0.5rem', border: '1px solid var(--border)', borderRadius: 6 }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 700 }}>Categoría</label>
                <input
                  className="input"
                  style={{ marginBottom: '0.35rem' }}
                  value={ed.nombre}
                  onChange={(e) => patchEditRow(c.categoria, { nombre: e.target.value })}
                />
                <label style={{ fontSize: '0.75rem', fontWeight: 700 }}>Subcategorías</label>
                {(ed.subs || []).map((s, i) => (
                  <div key={`${c.categoria}-${i}`} style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.25rem' }}>
                    <input className="input" value={s} onChange={(e) => patchSubEnRow(c.categoria, i, e.target.value)} style={{ flex: 1 }} />
                    <button type="button" className="btn btn-ghost" style={{ color: 'var(--danger)' }} onClick={() => quitarSub(c.categoria, s)}>
                      ×
                    </button>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.35rem' }}>
                  <input
                    className="input"
                    placeholder="Nueva subcategoría"
                    value={ed.nuevaSub || ''}
                    onChange={(e) => patchEditRow(c.categoria, { nuevaSub: e.target.value })}
                    style={{ flex: 1 }}
                  />
                  <button type="button" className="btn btn-ghost" onClick={() => agregarSubEnEdicion(c.categoria)}>
                    + Sub
                  </button>
                </div>
                <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.5rem' }}>
                  <button type="button" className="btn btn-primary" style={{ fontSize: '0.8rem' }} onClick={() => guardarEdicionCategoria(c.categoria)}>
                    Guardar cambios
                  </button>
                  <button type="button" className="btn btn-ghost" style={{ fontSize: '0.8rem', color: 'var(--danger)' }} onClick={() => borrarCat(c.categoria)}>
                    Eliminar categoría
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {habilitado && (
        <div className="grid-2" style={{ marginBottom: '0.5rem' }}>
          <select className="select" value={usuarioId} onChange={(e) => setUsuarioId(e.target.value)}>
            <option value="">— Empleado (desc. nómina) —</option>
            {(empleados || []).map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
              </option>
            ))}
          </select>
          <select className="select" value={cat} onChange={(e) => { setCat(e.target.value); setSub(''); }}>
            <option value="">— Categoría —</option>
            {catalogo.map((c) => (
              <option key={c.categoria} value={c.categoria}>
                {c.categoria}
              </option>
            ))}
          </select>
          <select className="select" value={sub} onChange={(e) => setSub(e.target.value)}>
            <option value="">— Subcategoría —</option>
            {subsDeCat.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <input className="input" type="number" min="0" step="0.01" placeholder="Monto" value={monto} onChange={(e) => setMonto(e.target.value)} />
          <input
            className="input"
            placeholder="Comentario"
            style={{ gridColumn: '1 / -1' }}
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && agregar()}
          />
        </div>
      )}
      {habilitado && (
        <button type="button" className="btn btn-primary" style={{ marginBottom: '0.5rem' }} onClick={agregar}>
          Agregar gasto
        </button>
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
                <td style={{ fontWeight: 700 }}>{fmt(g.monto)}</td>
                <td className="muted">{g.comentario || '—'}</td>
                {habilitado && (
                  <td>
                    <button type="button" className="btn btn-ghost" style={{ padding: '0.2rem 0.4rem', color: 'var(--danger)' }} onClick={() => onEliminar?.(g.id)}>
                      ×
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
