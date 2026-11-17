import React, { useState } from 'react';

/**
 * Alta de arrendatarios: no son empleados. Fiado y anticipo de renta salen como egreso.
 */
export default function PanelArrendatarios({ lista = [], puedeEditar = false, onAgregar, onQuitar }) {
  const [nombre, setNombre] = useState('');
  const [nota, setNota] = useState('');

  const agregar = () => {
    const res = onAgregar?.({ nombre, nota });
    if (res?.ok) {
      setNombre('');
      setNota('');
    } else if (res?.error) {
      alert(res.error);
    }
  };

  return (
    <div className="card">
      <h3 style={{ margin: '0 0 0.35rem', color: 'var(--brand-blue)' }}>Arrendatarios</h3>
      <p className="muted" style={{ margin: '0 0 0.75rem', fontSize: '0.85rem' }}>
        No son empleados de las 3B. Aquí se da de alta el nombre. En Vales y préstamos
        se elige para fiado o anticipo de renta: sale como egreso del corte y no se descuenta en nómina.
      </p>
      {puedeEditar && (
        <div className="grid-2" style={{ marginBottom: '0.75rem' }}>
          <input
            className="input"
            placeholder="Nombre del arrendatario"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
          />
          <input
            className="input"
            placeholder="Local o nota (opcional)"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
          />
          <button type="button" className="btn btn-primary" onClick={agregar}>
            Agregar arrendatario
          </button>
        </div>
      )}
      {lista.length === 0 ? (
        <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>Todavía no hay arrendatarios.</p>
      ) : (
        <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
          {lista.map((a) => (
            <li key={a.id} style={{ marginBottom: '0.35rem' }}>
              <strong>{a.nombre}</strong>
              {a.nota ? <span className="muted"> · {a.nota}</span> : null}
              {puedeEditar && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: 'var(--danger)' }}
                  onClick={() => onQuitar?.(a)}
                >
                  Quitar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
