import React, { useEffect, useState } from 'react';

const empty = { nombre: '', telefono: '', email: '', rfc: '', notas: '' };

export default function Clientes({ supabase }) {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState(null);

  const load = async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from('clientes').select('*').order('nombre');
    if (error) {
      setRows([]);
      return;
    }
    setRows(data || []);
  };

  useEffect(() => {
    load();
  }, [supabase]);

  const guardar = async () => {
    if (!supabase) return;
    if (!form.nombre.trim()) return alert('Nombre obligatorio');
    if (editId) {
      const { error } = await supabase.from('clientes').update(form).eq('id', editId);
      if (error) return alert(error.message);
    } else {
      const { error } = await supabase.from('clientes').insert([form]);
      if (error) {
        if (error.message.includes('relation') || error.code === '42P01') {
          return alert('Ejecuta supabase/schema.sql para crear la tabla clientes.');
        }
        return alert(error.message);
      }
    }
    setForm(empty);
    setEditId(null);
    load();
  };

  const editar = (r) => {
    setEditId(r.id);
    setForm({
      nombre: r.nombre || '',
      telefono: r.telefono || '',
      email: r.email || '',
      rfc: r.rfc || '',
      notas: r.notas || '',
    });
  };

  const borrar = async (id) => {
    if (!supabase || !confirm('¿Eliminar cliente?')) return;
    const { error } = await supabase.from('clientes').delete().eq('id', id);
    if (error) return alert(error.message);
    load();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="card">
        <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>{editId ? 'Editar cliente' : 'Nuevo cliente'}</h3>
        <div className="grid-2">
          <input className="input" placeholder="Nombre *" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
          <input className="input" placeholder="Teléfono" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
          <input className="input" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input className="input" placeholder="RFC" value={form.rfc} onChange={(e) => setForm({ ...form, rfc: e.target.value })} />
          <textarea className="input" placeholder="Notas" style={{ gridColumn: '1 / -1', minHeight: '72px' }} value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
          <button type="button" className="btn btn-primary" onClick={guardar}>
            Guardar
          </button>
          {editId && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setEditId(null);
                setForm(empty);
              }}
            >
              Cancelar edición
            </button>
          )}
        </div>
      </div>

      <div className="card">
        <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Directorio</h3>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Teléfono</th>
                <th>Email</th>
                <th>RFC</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="muted">
                    Sin clientes. Crea la tabla en Supabase si aún no existe.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.nombre}</td>
                    <td>{r.telefono}</td>
                    <td>{r.email}</td>
                    <td>{r.rfc}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button type="button" className="btn btn-ghost" style={{ padding: '0.35rem 0.5rem', fontSize: '0.8rem' }} onClick={() => editar(r)}>
                        Editar
                      </button>
                      <button type="button" className="btn btn-danger" style={{ padding: '0.35rem 0.5rem', fontSize: '0.8rem', marginLeft: '0.25rem' }} onClick={() => borrar(r.id)}>
                        Borrar
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
