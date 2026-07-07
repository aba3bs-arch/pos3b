import React, { useEffect, useState } from 'react';
import { puedeCrearProveedor } from '../lib/roles.js';
import {
  eliminarItemCatalogo,
  guardarItemCatalogo,
  listarCatalogoProveedor,
  nombreCatalogoItem,
  registrarCatalogoEnInventario,
} from '../lib/proveedorCatalogo.js';
import { etiquetaTienda } from '../constants/sucursales.js';
import CampoCodigo from '../components/CampoCodigo.jsx';

const empty = { nombre: '', contacto: '', telefono: '', email: '', notas: '' };
const emptyCatalogo = {
  nombre: '',
  presentacion: '',
  sku_proveedor: '',
  codigo_barras: '',
  cat: 'GENERAL',
  precio_compra_sugerido: '',
};

export default function Proveedores({ supabase, inventario = [], user, sucursal = 'MAIN', cargarDatos }) {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState(null);
  const [vinculos, setVinculos] = useState([]);
  const [catalogo, setCatalogo] = useState([]);
  const [formCat, setFormCat] = useState(emptyCatalogo);
  const [editCatId, setEditCatId] = useState(null);
  const [busqProd, setBusqProd] = useState('');
  const [mostrarVinculos, setMostrarVinculos] = useState(false);
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

  const loadCatalogo = async (proveedorId) => {
    if (!proveedorId) {
      setCatalogo([]);
      return;
    }
    const { data, error } = await listarCatalogoProveedor(supabase, proveedorId);
    if (error) {
      setCatalogo([]);
      return;
    }
    setCatalogo(data);
  };

  useEffect(() => {
    load();
  }, [supabase]);

  useEffect(() => {
    loadVinculos(editId);
    loadCatalogo(editId);
    setBusqProd('');
    setFormCat(emptyCatalogo);
    setEditCatId(null);
    setMostrarVinculos(false);
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

  const guardarCatalogo = async () => {
    if (!editId) return;
    const res = await guardarItemCatalogo(supabase, editId, formCat, editCatId);
    if (!res.ok) return alert(res.error);
    setFormCat(emptyCatalogo);
    setEditCatId(null);
    loadCatalogo(editId);
  };

  const editarCatalogo = (item) => {
    setEditCatId(item.id);
    setFormCat({
      nombre: item.nombre || '',
      presentacion: item.presentacion || '',
      sku_proveedor: item.sku_proveedor || '',
      codigo_barras: item.codigo_barras || '',
      cat: item.cat || 'GENERAL',
      precio_compra_sugerido: item.precio_compra_sugerido != null ? String(item.precio_compra_sugerido) : '',
    });
  };

  const borrarCatalogo = async (id) => {
    if (!confirm('¿Quitar este producto del catálogo del proveedor?')) return;
    const res = await eliminarItemCatalogo(supabase, id);
    if (!res.ok) return alert(res.error);
    if (editCatId === id) {
      setEditCatId(null);
      setFormCat(emptyCatalogo);
    }
    loadCatalogo(editId);
  };

  const registrarEnInventario = async (item) => {
    let codigo = String(item.codigo_barras || '').trim();
    if (!codigo) {
      const ing = prompt(`Código de barras para «${nombreCatalogoItem(item)}»:`, '');
      if (ing == null) return;
      codigo = String(ing).trim();
    }
    if (!codigo) return alert('Indica el código de barras.');

    const stockStr = prompt('Stock inicial en piso de venta (0 si aún no hay existencia):', '0');
    if (stockStr == null) return;
    const stockInicial = Math.max(0, parseInt(String(stockStr), 10) || 0);

    let precioCompra = item.precio_compra_sugerido;
    if (precioCompra == null || precioCompra === '') {
      const pStr = prompt('Precio de compra con IVA (MXN):', '0');
      if (pStr == null) return;
      precioCompra = parseFloat(String(pStr).replace(',', '.')) || 0;
    }

    const res = await registrarCatalogoEnInventario(supabase, item.id, {
      sucursal,
      codigo,
      stockInicial,
      precioCompra,
      cargarDatos,
    });
    if (!res.ok) return alert(res.error);
    if (res.yaRegistrado) return alert(`Ya estaba en inventario (${res.producto_id}).`);
    if (res.existente) {
      alert(`Enlazado al producto existente: ${res.nombre} (${res.producto_id})`);
    } else {
      alert(`Registrado en inventario de ${etiquetaTienda(sucursal)}: ${res.nombre} (${res.producto_id})`);
    }
    loadCatalogo(editId);
    loadVinculos(editId);
  };

  const productosFiltrados = inventario.filter((p) => {
    const t = busqProd.trim().toLowerCase();
    if (!t) return false;
    return (
      String(p.nombre || '')
        .toLowerCase()
        .includes(t) || String(p.id || '').includes(t)
    );
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

  const pendientesCatalogo = catalogo.filter((c) => !c.producto_id && c.activo !== false);

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
              <textarea
                className="input"
                placeholder="Notas (pagos, días de entrega…)"
                style={{ gridColumn: '1 / -1', minHeight: '72px' }}
                value={form.notas}
                onChange={(e) => setForm({ ...form, notas: e.target.value })}
              />
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
          <h3 style={{ margin: '0 0 0.5rem', color: 'var(--brand-blue)' }}>Catálogo del proveedor</h3>
          <p className="muted" style={{ marginTop: 0, fontSize: '0.85rem' }}>
            Define los productos que vende este distribuidor (ej. Coca Cola 600, 500, 1 lt, 2 lts). Cada sucursal los registra en su inventario con{' '}
            <strong>Registrar en inventario</strong> ({etiquetaTienda(sucursal)}).
          </p>

          <div className="grid-2" style={{ marginTop: '0.75rem' }}>
            <input className="input" placeholder="Nombre producto * (ej. Coca Cola)" value={formCat.nombre} onChange={(e) => setFormCat({ ...formCat, nombre: e.target.value })} />
            <input className="input" placeholder="Presentación (ej. 600 ml, 1 lt)" value={formCat.presentacion} onChange={(e) => setFormCat({ ...formCat, presentacion: e.target.value })} />
            <input className="input" placeholder="SKU proveedor" value={formCat.sku_proveedor} onChange={(e) => setFormCat({ ...formCat, sku_proveedor: e.target.value })} />
            <CampoCodigo
              className="input"
              value={formCat.codigo_barras}
              onChange={(e) => setFormCat({ ...formCat, codigo_barras: e.target.value })}
              placeholder="Código de barras (opcional)"
              tituloCamara="Código catálogo proveedor"
            />
            <input className="input" placeholder="Categoría" value={formCat.cat} onChange={(e) => setFormCat({ ...formCat, cat: e.target.value })} />
            <input
              className="input"
              type="number"
              min="0"
              step="0.01"
              placeholder="Precio compra sugerido (MXN)"
              value={formCat.precio_compra_sugerido}
              onChange={(e) => setFormCat({ ...formCat, precio_compra_sugerido: e.target.value })}
            />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-primary" onClick={guardarCatalogo}>
              {editCatId ? 'Actualizar ítem' : 'Agregar al catálogo'}
            </button>
            {editCatId && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setEditCatId(null);
                  setFormCat(emptyCatalogo);
                }}
              >
                Cancelar ítem
              </button>
            )}
          </div>

          <div className="table-wrap" style={{ marginTop: '0.75rem' }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>SKU prov.</th>
                  <th>Código</th>
                  <th>P. compra</th>
                  <th>Inventario</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {catalogo.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="muted">
                      Sin productos en el catálogo. Agrega ítems arriba (ej. Coca Cola + presentación 600 ml).
                    </td>
                  </tr>
                ) : (
                  catalogo.map((c) => (
                    <tr key={c.id}>
                      <td>{nombreCatalogoItem(c)}</td>
                      <td>{c.sku_proveedor || '—'}</td>
                      <td>{c.codigo_barras || '—'}</td>
                      <td>{c.precio_compra_sugerido != null ? `$${Number(c.precio_compra_sugerido).toFixed(2)}` : '—'}</td>
                      <td>
                        {c.producto_id ? (
                          <span style={{ color: 'var(--ok)' }}>
                            {nombreProducto(c.producto_id)} <span className="muted">({c.producto_id})</span>
                          </span>
                        ) : (
                          <span className="muted">Pendiente</span>
                        )}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {!c.producto_id && (
                          <button type="button" className="btn btn-primary" style={{ padding: '0.25rem 0.45rem', fontSize: '0.75rem' }} onClick={() => registrarEnInventario(c)}>
                            Registrar
                          </button>
                        )}
                        <button type="button" className="btn btn-ghost" style={{ padding: '0.25rem 0.45rem', fontSize: '0.75rem', marginLeft: '0.25rem' }} onClick={() => editarCatalogo(c)}>
                          Editar
                        </button>
                        <button type="button" className="btn btn-danger" style={{ padding: '0.25rem 0.45rem', fontSize: '0.75rem', marginLeft: '0.25rem' }} onClick={() => borrarCatalogo(c.id)}>
                          Quitar
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {pendientesCatalogo.length > 0 && (
            <p className="muted" style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
              {pendientesCatalogo.length} producto(s) pendiente(s) de registrar en inventario de {etiquetaTienda(sucursal)}.
            </p>
          )}

          <button type="button" className="btn btn-ghost" style={{ marginTop: '0.75rem', fontSize: '0.85rem' }} onClick={() => setMostrarVinculos((v) => !v)}>
            {mostrarVinculos ? 'Ocultar' : 'Mostrar'} vínculos manuales a inventario existente
          </button>

          {mostrarVinculos && (
            <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)' }}>
              <p className="muted" style={{ marginTop: 0, fontSize: '0.85rem' }}>
                Opcional: enlaza productos que ya existen en inventario sin pasar por el catálogo.
              </p>
              <CampoCodigo value={busqProd} onChange={(e) => setBusqProd(e.target.value)} placeholder="Buscar por nombre o código…" tituloCamara="Buscar producto proveedor" />
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
                          Sin vínculos manuales.
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
        </div>
      )}

      <div className="card">
        <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Catálogo de proveedores</h3>
        <p className="muted" style={{ fontSize: '0.85rem', marginTop: 0 }}>
          Pulsa <strong>Editar</strong> en un proveedor para armar su catálogo de productos y registrar cada ítem en el inventario de tu tienda.
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
