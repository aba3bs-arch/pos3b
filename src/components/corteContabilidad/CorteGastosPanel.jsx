import React, { useState } from 'react';

function fmt(n) {
  return `$${(Number(n) || 0).toFixed(2)}`;
}

export default function CorteGastosPanel({ gastos, onAgregar, onEliminar, habilitado }) {
  const [cat, setCat] = useState('GENERAL');
  const [sub, setSub] = useState('');
  const [monto, setMonto] = useState('');
  const [comentario, setComentario] = useState('');

  const agregar = () => {
    const m = Number(monto);
    if (!(m > 0)) return alert('Monto inválido.');
    if (!cat.trim()) return alert('Indica categoría.');
    onAgregar?.({ categoria: cat.trim().toUpperCase(), subcategoria: sub.trim().toUpperCase(), monto: m, comentario: comentario.trim().toUpperCase() });
    setMonto('');
    setComentario('');
  };

  return (
    <div className="card" style={{ margin: 0 }}>
      <h4 style={{ margin: '0 0 0.5rem', color: 'var(--brand-blue)' }}>Gastos del turno</h4>
      {habilitado && (
        <div className="grid-2" style={{ marginBottom: '0.5rem' }}>
          <input className="input" placeholder="Categoría" value={cat} onChange={(e) => setCat(e.target.value)} />
          <input className="input" placeholder="Subcategoría" value={sub} onChange={(e) => setSub(e.target.value)} />
          <input className="input" type="number" min="0" step="0.01" placeholder="Monto" value={monto} onChange={(e) => setMonto(e.target.value)} />
          <input className="input" placeholder="Comentario" value={comentario} onChange={(e) => setComentario(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && agregar()} />
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
                <td colSpan={habilitado ? 5 : 4} className="muted">
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
