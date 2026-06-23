import React, { useEffect, useState } from 'react';
import { puedeCrearProveedor } from '../lib/roles.js';

const empty = { nombre: '', contacto: '', telefono: '', email: '', notas: '' };

export default function Proveedores({ supabase, inventario = [], user }) {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState(null);
  const [vinculos, setVinculos] = useState([]);
  const [busqProd, setBusqProd] = useState('');
  const puedeAlta = puedeCrearProveedor(user?.rol);

  const load = async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from('proveedores').select('*').order('nombre');
    if (error) {
      setRows([]);
      return;
    }
    setRows(data || []);
  };

  const loadVinculos = async (proveedorId) => {
    if (!supabase || !proveedorId) {
      setVinculos([]);
      return;
    }
    const { data, error } = await supabase.from('proveedor_producto').select('id, producto_id, sku_proveedor').eq('proveedor_id', proveedorId);
    if (error) {
      setVinculos([]);
      return;
    }
    setVinculos(data || []);
  };

  useEffect(() => {
    load();
  }, [supabase]);

  useEffect(() => {
    loadVinculos(editId);
    setBusqProd('');
  }, [supabase, editId]);

  const guardar = async () => {
    if (!supabase) return;
    if (!form.nombre.trim()) return alert('Nombre obligatorio');
    if (editId) {
      const { error } = await supabase.from('proveedores').update(form).eq('id', editId);
      if (error) return alert(error.message);
    } else {
      if (!puedeAlta) return alert('Solo el administrador puede dar de alta proveedores.');
      const { error } = await supabase.from('proveedores').insert([form]);
      if (error) {
        if (error.message.includes('relation') || error.code === '42P01') {
          return alert('Ejecuta supabase/schema.sql para crear la tabla proveedores.');
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
      contacto: r.contacto || '',
      telefono: r.telefono || '',
      email: r.email || '',
      notas: r.notas || '',
    });
  };

  const borrar = async (id) => {
    if (!supabase || !confirm('¿Eliminar proveedor?')) return;
    if (!puedeAlta) return alert('Solo el administrador puede eliminar proveedores.');
    const { error } = await supabase.from('proveedores').delete().eq('id', id);
    if (error) return alert(error.message);
    if (editId === id) {
      setEditId(null);
      setForm(empty);
    }
    load();
  };

  const productosFiltrados = inventario.filter((p) => {
    const t = busqProd.trim().toLowerCase();
    if (!t) return false;
    return String(p.nombre || '')
      .toLowerCase()
      .includes(t) || String(p.id || '').includes(t);
  });

  const vincularProducto = async (p) => {
    if (!supabase || !editId) return;
    const { error } = await supabase.from('proveedor_producto').insert([{ proveedor_id: editId, producto_id: p.id }]);
    if (error) {
      if (error.code === '23505' || error.message.includes('duplicate')) return alert('Ese producto ya está vinculado.');
      if (error.message.includes('relation') || error.code === '42P01') {
        return alert('Ejecuta el SQL de la tabla proveedor_producto (supabase/schema.sql).');
      }
      return alert(error.message);
    }
    setBusqProd('');
    loadVinculos(editId);
  };

  const quitarVinculoProducto = async (rowId) => {
    if (!supabase || !confirm('¿Quitar producto de este proveedor?')) return;
    const { error } = await supabase.from('proveedor_producto').delete().eq('id', rowId);
    if (error) return alert(error.message);
    loadVinculos(editId);
  };

  const nombreProducto = (productoId) => inventario.find((x) => String(x.id) === String(productoId))?.nombre || productoId;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="card">
        <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>{editId ? 'Editar proveedor' : 'Nuevo proveedor'}</h3>
        {!puedeAlta && !editId && (
          <p className="muted" style={{ marginTop: 0, fontSize: '0.9rem' }}>
            Solo el <strong>administrador</strong> puede dar de alta proveedores. Puedes editar un proveedor existente desde la lista.
          </p>
        )}
        {(puedeAlta || editId) && (
        <>
        <div className="grid-2">
          <input className="input" placeholder="Nombre empresa *" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
          <input className="input" placeholder="Contacto" value={form.contacto} onChange={(e) => setForm({ ...form, contacto: e.target.value })} />
          <input className="input" placeholder="Teléfono" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
          <input className="input" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <textarea className="input" placeholder="Notas (pagos, días de entrega…)" style={{ gridColumn: '1 / -1', minHeight: '72px' }} value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
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
        </>
        )}
      </div>

      {editId && (
        <div className="card" style={{ borderTop: '4px solid var(--brand-gold)' }}>
          <h3 style={{ margin: '0 0 0.5rem', color: 'var(--brand-blue)' }}>Productos vinculados a este proveedor</h3>
          <p className="muted" style={{ marginTop: 0, fontSize: '0.85rem' }}>
            Busca en tu catálogo y enlaza SKU; en Productos puedes añadir la clave del proveedor por ítem.
          </p>
          <input className="input" style={{ marginTop: '0.75rem' }} placeholder="Buscar por nombre o código…" value={busqProd} onChange={(e) => setBusqProd(e.target.value)} />
          {productosFiltrados.length > 0 && (
            <div style={{ maxHeight: '160px', overflowY: 'auto', marginTop: '0.5rem', border: '1px solid var(--border)', borderRadius: '10px' }}>
              {productosFiltrados.slice(0, 25).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => vincularProducto(p)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '0.45rem 0.65rem',
                    border: 'none',
                    borderBottom: '1px solid var(--border)',
                    background: '#fff',
                    cursor: 'pointer',
                  }}
                >
                  {p.nombre} <span className="muted">({p.id})</span>
                </button>
              ))}
            </div>
          )}
          <div className="table-wrap" style={{ marginTop: '0.75rem' }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Producto</th>
                  <th>SKU prov.</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {vinculos.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="muted">
                      Sin productos vinculados.
                    </td>
                  </tr>
                ) : (
                  vinculos.map((v) => (
                    <tr key={v.id}>
                      <td>{v.producto_id}</td>
                      <td>{nombreProducto(v.producto_id)}</td>
                      <td>{v.sku_proveedor || '—'}</td>
                      <td>
                        <button type="button" className="btn btn-danger" style={{ padding: '0.25rem 0.45rem', fontSize: '0.75rem' }} onClick={() => quitarVinculoProducto(v.id)}>
                          Quitar
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card">
        <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Catálogo de proveedores</h3>
        <p className="muted" style={{ fontSize: '0.85rem', marginTop: 0 }}>
          Pulsa <strong>Editar</strong> en un proveedor para gestionar qué productos compras habitualmente a ese distribuidor.
        </p>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Contacto</th>
                <th>Teléfono</th>
                <th>Email</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="muted">
                    Sin proveedores registrados.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.nombre}</td>
                    <td>{r.contacto}</td>
                    <td>{r.telefono}</td>
                    <td>{r.email}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button type="button" className="btn btn-ghost" style={{ padding: '0.35rem 0.5rem', fontSize: '0.8rem' }} onClick={() => editar(r)}>
                        Editar
                      </button>
                      {puedeAlta && (
                        <button type="button" className="btn btn-danger" style={{ padding: '0.35rem 0.5rem', fontSize: '0.8rem', marginLeft: '0.25rem' }} onClick={() => borrar(r.id)}>
                          Borrar
                        </button>
                      )}
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
