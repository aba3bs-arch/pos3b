import React, { useCallback, useEffect, useState } from 'react';
import {
  agregarCategoriaIncidencia,
  agregarSubcategoriaIncidencia,
  EVENTO_CATALOGO_INCIDENCIAS,
  listarCatalogoIncidencias,
  quitarCategoriaIncidencia,
  quitarSubcategoriaIncidencia,
} from '../lib/incidenciasCatalogo.js';

export default function PanelCatalogoIncidencias({ supabase }) {
  const [catalogo, setCatalogo] = useState([]);
  const [nuevaCat, setNuevaCat] = useState('');
  const [nuevaSubCat, setNuevaSubCat] = useState('');
  const [catParaSub, setCatParaSub] = useState('');
  const [aviso, setAviso] = useState('');

  const cargar = useCallback(async () => {
    const res = await listarCatalogoIncidencias(supabase);
    setCatalogo(res.data || []);
    setAviso(res.aviso || '');
  }, [supabase]);

  useEffect(() => {
    void cargar();
    const sync = () => void cargar();
    window.addEventListener(EVENTO_CATALOGO_INCIDENCIAS, sync);
    return () => window.removeEventListener(EVENTO_CATALOGO_INCIDENCIAS, sync);
  }, [cargar]);

  const crearCategoria = async () => {
    const res = await agregarCategoriaIncidencia(supabase, { label: nuevaCat });
    if (!res.ok) return alert(res.error);
    setNuevaCat('');
    setCatalogo(res.catalogo);
  };

  const crearSubcategoria = async () => {
    if (!catParaSub) return alert('Elige una categoría.');
    const res = await agregarSubcategoriaIncidencia(supabase, catParaSub, nuevaSubCat);
    if (!res.ok) return alert(res.error);
    setNuevaSubCat('');
    setCatalogo(res.catalogo);
  };

  return (
    <div className="card" style={{ borderTop: '4px solid var(--brand-olive)' }}>
      <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Categorías de incidencias</h3>
      <p className="muted" style={{ marginTop: 0, fontSize: '0.85rem' }}>
        Administre categorías y subcategorías para los reportes en <strong>Incidencias</strong>. Las del sistema (Operación, Virtual, Garage, etc.) pueden ampliarse con subcategorías; las personalizadas también se pueden eliminar.
      </p>
      {aviso && (
        <p className="muted" style={{ margin: '0.5rem 0', fontSize: '0.8rem', color: 'var(--brand-gold)' }}>
          {aviso}
        </p>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end', marginBottom: '1rem' }}>
        <label className="muted" style={{ flex: '1 1 180px' }}>
          Nueva categoría
          <input
            className="input"
            style={{ marginTop: '0.35rem' }}
            value={nuevaCat}
            onChange={(e) => setNuevaCat(e.target.value)}
            placeholder="Ej. Seguridad"
            maxLength={48}
          />
        </label>
        <button type="button" className="btn btn-primary" onClick={crearCategoria}>
          Agregar categoría
        </button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end', marginBottom: '1rem' }}>
        <label className="muted" style={{ flex: '1 1 160px' }}>
          Categoría
          <select className="select" style={{ marginTop: '0.35rem' }} value={catParaSub} onChange={(e) => setCatParaSub(e.target.value)}>
            <option value="">— Elegir —</option>
            {catalogo.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="muted" style={{ flex: '1 1 180px' }}>
          Nueva subcategoría
          <input
            className="input"
            style={{ marginTop: '0.35rem' }}
            value={nuevaSubCat}
            onChange={(e) => setNuevaSubCat(e.target.value)}
            placeholder="Ej. Puerta / acceso"
            maxLength={64}
          />
        </label>
        <button type="button" className="btn btn-ghost" onClick={crearSubcategoria}>
          Agregar subcategoría
        </button>
      </div>

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Categoría</th>
              <th>Subcategorías</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {catalogo.map((c) => (
              <tr key={c.id}>
                <td style={{ fontWeight: 600 }}>
                  {c.label}
                  {!c.esPersonalizada && <span className="muted" style={{ fontSize: '0.72rem', marginLeft: 6 }}>(sistema)</span>}
                </td>
                <td>
                  {(c.subcategorias || []).length ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                      {c.subcategorias.map((s) => (
                        <span key={s} className="badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                          {s}
                          <button
                            type="button"
                            title="Quitar subcategoría"
                            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--brand-red)', fontWeight: 700, lineHeight: 1 }}
                            onClick={async () => {
                              if (!confirm(`¿Quitar subcategoría «${s}»?`)) return;
                              const res = await quitarSubcategoriaIncidencia(supabase, c.id, s);
                              if (!res.ok) alert(res.error);
                              else setCatalogo(res.catalogo);
                            }}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td style={{ textAlign: 'right' }}>
                  {c.esPersonalizada && (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ fontSize: '0.8rem', color: 'var(--brand-red)' }}
                      onClick={async () => {
                        if (!confirm(`¿Quitar categoría «${c.label}»?`)) return;
                        const res = await quitarCategoriaIncidencia(supabase, c.id);
                        if (!res.ok) alert(res.error);
                        else setCatalogo(res.catalogo);
                      }}
                    >
                      Quitar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
