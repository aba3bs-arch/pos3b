import React, { useCallback, useEffect, useState } from 'react';
import {
  actualizarCategoriaGastoRuta,
  crearCategoriaGastoRuta,
  eliminarCategoriaGastoRuta,
  listarCategoriasGastoRutaAdmin,
  puedeAdministrarCategoriasGastoRuta,
} from '../lib/rutaGastosCategorias.js';

/**
 * CRUD de categorías de gasto (solo Administrador).
 */
export default function CategoriasGastoRutaAdmin({ supabase, user, setAviso, onChanged }) {
  const [lista, setLista] = useState([]);
  const [avisoTabla, setAvisoTabla] = useState('');
  const [nombre, setNombre] = useState('');
  const [editId, setEditId] = useState(null);
  const [editNombre, setEditNombre] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [cargando, setCargando] = useState(true);

  const puede = puedeAdministrarCategoriasGastoRuta(user?.rol);

  const cargar = useCallback(async () => {
    if (!supabase || !puedeAdministrarCategoriasGastoRuta(user?.rol)) return;
    setCargando(true);
    try {
      const r = await listarCategoriasGastoRutaAdmin(supabase);
      if (r.aviso) setAvisoTabla(r.aviso);
      else setAvisoTabla('');
      if (r.error) setAviso?.(r.error);
      setLista(r.data || []);
    } finally {
      setCargando(false);
    }
  }, [supabase, setAviso, user?.rol]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  if (!puede) return null;

  const crear = async () => {
    setGuardando(true);
    try {
      const r = await crearCategoriaGastoRuta(supabase, {
        nombre,
        orden: lista.length,
        rolActor: user?.rol,
      });
      if (!r.ok) return alert(r.error || 'No se pudo crear.');
      setNombre('');
      setAviso?.(`Categoría «${r.data?.nombre}» creada.`);
      await cargar();
      onChanged?.();
    } finally {
      setGuardando(false);
    }
  };

  const guardarEdit = async () => {
    if (!editId) return;
    setGuardando(true);
    try {
      const r = await actualizarCategoriaGastoRuta(supabase, {
        id: editId,
        nombre: editNombre,
        rolActor: user?.rol,
      });
      if (!r.ok) return alert(r.error || 'No se pudo guardar.');
      setEditId(null);
      setEditNombre('');
      setAviso?.('Categoría actualizada.');
      await cargar();
      onChanged?.();
    } finally {
      setGuardando(false);
    }
  };

  const toggleActivo = async (cat) => {
    const r = await actualizarCategoriaGastoRuta(supabase, {
      id: cat.id,
      activo: !cat.activo,
      rolActor: user?.rol,
    });
    if (!r.ok) return alert(r.error || 'No se pudo cambiar.');
    await cargar();
    onChanged?.();
  };

  const borrar = async (cat) => {
    if (!confirm(`¿Eliminar la categoría «${cat.nombre}»?\nLos gastos ya registrados no se borran.`)) return;
    const r = await eliminarCategoriaGastoRuta(supabase, {
      id: cat.id,
      rolActor: user?.rol,
    });
    if (!r.ok) return alert(r.error || 'No se pudo eliminar.');
    setAviso?.(`Categoría «${cat.nombre}» eliminada.`);
    await cargar();
    onChanged?.();
  };

  return (
    <div
      className="card"
      style={{
        padding: '0.85rem 1rem',
        borderTop: '4px solid #1d4ed8',
        marginBottom: '0.65rem',
      }}
    >
      <h4 style={{ margin: '0 0 0.25rem', color: '#1d4ed8' }}>Categorías de gasto</h4>
      <p className="muted" style={{ margin: '0 0 0.75rem', fontSize: '0.8rem' }}>
        Solo administradores. El repartidor elige de este catálogo al registrar un gasto.
      </p>

      {avisoTabla ? (
        <p style={{ margin: '0 0 0.75rem', color: '#b91c1c', fontSize: '0.85rem' }}>{avisoTabla}</p>
      ) : null}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'flex-end' }}>
        <label style={{ flex: '1 1 180px', display: 'grid', gap: 4, fontSize: '0.85rem' }}>
          Nueva categoría
          <input
            className="input"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej. Combustible"
            maxLength={80}
            disabled={guardando}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void crear();
            }}
          />
        </label>
        <button
          type="button"
          className="btn btn-primary"
          disabled={guardando || !nombre.trim()}
          onClick={() => void crear()}
        >
          Crear
        </button>
      </div>

      <div style={{ marginTop: '0.85rem' }}>
        {cargando ? (
          <p className="muted" style={{ margin: 0 }}>Cargando…</p>
        ) : !lista.length ? (
          <p className="muted" style={{ margin: 0 }}>
            Aún no hay categorías. Crea la primera arriba.
          </p>
        ) : (
          lista.map((c) => (
            <div
              key={c.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.5rem 0',
                borderBottom: '1px solid var(--border, #e5e7eb)',
                flexWrap: 'wrap',
              }}
            >
              {editId === c.id ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', flex: 1, alignItems: 'center' }}>
                  <input
                    className="input"
                    value={editNombre}
                    onChange={(e) => setEditNombre(e.target.value)}
                    maxLength={80}
                    style={{ flex: '1 1 160px' }}
                    autoFocus
                  />
                  <button type="button" className="btn btn-success" disabled={guardando} onClick={() => void guardarEdit()}>
                    Guardar
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => { setEditId(null); setEditNombre(''); }}
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <>
                  <span>
                    <strong>{c.nombre}</strong>
                    {!c.activo ? (
                      <span className="badge" style={{ marginLeft: '0.35rem' }}>Inactiva</span>
                    ) : null}
                  </span>
                  <span style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                      onClick={() => { setEditId(c.id); setEditNombre(c.nombre); }}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                      onClick={() => void toggleActivo(c)}
                    >
                      {c.activo ? 'Desactivar' : 'Activar'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', color: '#b91c1c' }}
                      onClick={() => void borrar(c)}
                    >
                      Eliminar
                    </button>
                  </span>
                </>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
