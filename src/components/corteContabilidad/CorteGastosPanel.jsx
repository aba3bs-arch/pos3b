import React, { useCallback, useEffect, useState } from 'react';
import {
  agregarSubcategoriaGasto,
  eliminarCategoriaGasto,
  guardarCategoriaGasto,
  listarCatalogoGastos,
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
  const [catAdmin, setCatAdmin] = useState('');
  const [mostrarCat, setMostrarCat] = useState(false);

  const cargarCat = useCallback(async () => {
    const res = await listarCatalogoGastos(supabase, sucursal, modulo);
    setCatalogo(res.data || []);
    if (!cat && res.data?.length) setCat(res.data[0].categoria);
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

  const crearSub = async () => {
    if (!catAdmin || !nuevaSub) return alert('Selecciona categoría y escribe subcategoría.');
    const res = await agregarSubcategoriaGasto(supabase, sucursal, modulo, catAdmin, nuevaSub);
    if (!res.ok) return alert(res.error);
    setNuevaSub('');
    cargarCat();
  };

  const borrarCat = async (categoria) => {
    if (!confirm(`¿Eliminar categoría ${categoria}?`)) return;
    const res = await eliminarCategoriaGasto(supabase, sucursal, modulo, categoria);
    if (!res.ok) return alert(res.error);
    cargarCat();
  };

  return (
    <div className="card" style={{ margin: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h4 style={{ margin: 0, color: 'var(--brand-blue)' }}>Gastos del turno</h4>
        {puedeCatalogo && (
          <button type="button" className="btn btn-ghost" style={{ fontSize: '0.8rem' }} onClick={() => setMostrarCat((o) => !o)}>
            {mostrarCat ? 'Ocultar catálogo' : 'Categorías / subcategorías'}
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
          <button type="button" className="btn btn-ghost" style={{ marginBottom: '0.5rem' }} onClick={crearCategoria}>
            + Categoría
          </button>
          <div className="grid-2">
            <select className="select" value={catAdmin} onChange={(e) => setCatAdmin(e.target.value)}>
              <option value="">— Categoría —</option>
              {catalogo.map((c) => (
                <option key={c.categoria} value={c.categoria}>
                  {c.categoria}
                </option>
              ))}
            </select>
            <input className="input" placeholder="Nueva subcategoría" value={nuevaSub} onChange={(e) => setNuevaSub(e.target.value)} />
          </div>
          <button type="button" className="btn btn-ghost" style={{ marginTop: '0.35rem' }} onClick={crearSub}>
            + Subcategoría
          </button>
          <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.1rem', fontSize: '0.8rem' }}>
            {catalogo.map((c) => (
              <li key={c.categoria}>
                <strong>{c.categoria}</strong> — {(c.subcategorias || []).join(', ') || 'sin sub'}
                <button type="button" className="btn btn-ghost" style={{ padding: '0 0.25rem', marginLeft: 4, color: 'var(--danger)' }} onClick={() => borrarCat(c.categoria)}>
                  ×
                </button>
              </li>
            ))}
          </ul>
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
