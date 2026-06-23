import React, { useEffect, useMemo, useRef, useState } from 'react';
import { etiquetaDepartamento, listarDepartamentos } from '../lib/departamentos.js';
import { descargarPlantillaCsv, importarCatalogoSupabase, leerArchivoCatalogo } from '../lib/importarCatalogo.js';
import { mensajeErrorColumnasProducto, productoDesdeDb, productoParaGuardar, productoVacio } from '../lib/productoForm.js';
import { puedeCrearProveedor } from '../lib/roles.js';
import FormularioProducto from '../components/FormularioProducto.jsx';
import { BtnLabel } from '../components/Icon.jsx';
import { fmtMxn, resumirValorInventario } from '../lib/valorInventario.js';
import AjusteInventario from './AjusteInventario.jsx';

const empty = productoVacio();

export default function Productos({ supabase, inventario, cargarDatos, user, sucursal }) {
  const [pestana, setPestana] = useState('catalogo');
  const [form, setForm] = useState(empty);
  const [q, setQ] = useState('');
  const [proveedores, setProveedores] = useState([]);
  const [vinculos, setVinculos] = useState([]);
  const [nuevoProvId, setNuevoProvId] = useState('');
  const [nuevoSkuProv, setNuevoSkuProv] = useState('');
  const [mostrarNuevoProv, setMostrarNuevoProv] = useState(false);
  const [nuevoProvForm, setNuevoProvForm] = useState({ nombre: '', contacto: '', telefono: '', email: '', notas: '' });
  const [guardandoProv, setGuardandoProv] = useState(false);
  const [importFilas, setImportFilas] = useState([]);
  const [importNombre, setImportNombre] = useState('');
  const [importando, setImportando] = useState(false);
  const [mostrarImport, setMostrarImport] = useState(false);
  const [esEdicionProducto, setEsEdicionProducto] = useState(false);
  const fileImportRef = useRef(null);
  const [tickDepartamentos, setTickDepartamentos] = useState(0);
  const [mostrarValorInv, setMostrarValorInv] = useState(false);
  const departamentos = useMemo(() => listarDepartamentos(inventario), [inventario, tickDepartamentos]);
  const valorInventario = useMemo(() => resumirValorInventario(inventario), [inventario]);
  const puedeAltaProveedor = puedeCrearProveedor(user?.rol);

  useEffect(() => {
    if (!supabase) return;
    (async () => {
      const { data } = await supabase.from('proveedores').select('id, nombre').order('nombre');
      setProveedores(data || []);
    })();
  }, [supabase]);

  const recargarProveedores = async () => {
    if (!supabase) return [];
    const { data, error } = await supabase.from('proveedores').select('id, nombre').order('nombre');
    if (error) {
      console.error(error);
      return [];
    }
    setProveedores(data || []);
    return data || [];
  };

  const crearProveedor = async () => {
    if (!supabase) return;
    if (!puedeAltaProveedor) return alert('Solo el administrador puede dar de alta proveedores.');
    const nombre = nuevoProvForm.nombre.trim();
    if (!nombre) return alert('Indica el nombre del proveedor.');
    setGuardandoProv(true);
    const { data, error } = await supabase
      .from('proveedores')
      .insert([
        {
          nombre,
          contacto: nuevoProvForm.contacto.trim() || null,
          telefono: nuevoProvForm.telefono.trim() || null,
          email: nuevoProvForm.email.trim() || null,
          notas: nuevoProvForm.notas.trim() || null,
        },
      ])
      .select('id, nombre')
      .single();
    setGuardandoProv(false);
    if (error) {
      if (error.message.includes('relation') || error.code === '42P01') {
        return alert('Ejecuta supabase/fix_productos_campos.sql en Supabase (tabla proveedores).');
      }
      return alert(error.message);
    }
    await recargarProveedores();
    setNuevoProvId(data.id);
    setNuevoProvForm({ nombre: '', contacto: '', telefono: '', email: '', notas: '' });
    setMostrarNuevoProv(false);
    alert(`Proveedor "${data.nombre}" creado y seleccionado.`);
  };

  const loadVinculos = async (productoId) => {
    if (!supabase || !productoId?.trim()) {
      setVinculos([]);
      return;
    }
    const { data, error } = await supabase
      .from('proveedor_producto')
      .select('id, proveedor_id, producto_id, sku_proveedor, proveedores(nombre)')
      .eq('producto_id', productoId.trim());
    if (error) {
      setVinculos([]);
      return;
    }
    setVinculos(data || []);
  };

  useEffect(() => {
    loadVinculos(form.id);
  }, [supabase, form.id]);

  const rows = inventario.filter((p) => {
    const t = q.trim().toLowerCase();
    if (!t) return true;
    return String(p.nombre || '')
      .toLowerCase()
      .includes(t) || String(p.id || '').includes(t);
  });

  const guardar = async () => {
    if (!supabase) return;
    const payload = productoParaGuardar(form);
    if (!payload.id || !payload.nombre) return alert('Código y nombre son obligatorios');
    const { error } = await supabase.from('productos').upsert([payload]);
    if (error) {
      const aviso = mensajeErrorColumnasProducto(error);
      return alert(aviso || error.message);
    }
    alert('Guardado');
    setForm(empty);
    setEsEdicionProducto(false);
    setVinculos([]);
    cargarDatos();
  };

  const eliminar = async (id) => {
    if (!supabase) return;
    if (!confirm('¿Eliminar producto del catálogo?')) return;
    const { error } = await supabase.from('productos').delete().eq('id', id);
    if (error) return alert(error.message);
    if (form.id === id) {
      setForm(empty);
      setEsEdicionProducto(false);
      setVinculos([]);
    }
    cargarDatos();
  };

  const editar = (p) => {
    setForm(productoDesdeDb(p));
    setEsEdicionProducto(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const vincularProveedor = async () => {
    if (!supabase) return;
    const pid = form.id.trim();
    if (!pid) return alert('Indica primero el código del producto.');
    if (!nuevoProvId) return alert('Elige un proveedor.');
    const { error } = await supabase.from('proveedor_producto').insert([
      { proveedor_id: nuevoProvId, producto_id: pid, sku_proveedor: nuevoSkuProv.trim() || null },
    ]);
    if (error) {
      if (error.code === '23505' || error.message.includes('duplicate')) return alert('Ese proveedor ya está vinculado a este código.');
      if (error.message.includes('relation') || error.code === '42P01') {
        return alert('Ejecuta en Supabase el SQL de la tabla proveedor_producto (supabase/schema.sql).');
      }
      return alert(error.message);
    }
    setNuevoProvId('');
    setNuevoSkuProv('');
    loadVinculos(pid);
  };

  const quitarVinculo = async (rowId) => {
    if (!supabase || !confirm('¿Quitar vínculo con este proveedor?')) return;
    const { error } = await supabase.from('proveedor_producto').delete().eq('id', rowId);
    if (error) return alert(error.message);
    loadVinculos(form.id);
  };

  const elegirArchivoImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const r = await leerArchivoCatalogo(file);
    if (!r.ok) return alert(r.error);
    setImportFilas(r.filas);
    setImportNombre(r.origen);
    setMostrarImport(true);
    e.target.value = '';
  };

  const confirmarImport = async () => {
    if (!importFilas.length) return alert('No hay filas para importar.');
    if (!confirm(`¿Importar ${importFilas.length} producto(s)? Los códigos existentes se actualizarán.`)) return;
    setImportando(true);
    const r = await importarCatalogoSupabase(supabase, importFilas);
    setImportando(false);
    if (!r.ok) return alert(r.error);
    alert(`Catálogo importado: ${r.count} producto(s).`);
    setImportFilas([]);
    setImportNombre('');
    setMostrarImport(false);
    cargarDatos();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button type="button" className={pestana === 'catalogo' ? 'btn btn-primary' : 'btn btn-ghost'} onClick={() => setPestana('catalogo')}>
          <BtnLabel icon="package">Catálogo</BtnLabel>
        </button>
        <button type="button" className={pestana === 'ajustes' ? 'btn btn-primary' : 'btn btn-ghost'} onClick={() => setPestana('ajustes')}>
          <BtnLabel icon="refresh">Ajuste de inventario</BtnLabel>
        </button>
      </div>

      {pestana === 'ajustes' && (
        <AjusteInventario supabase={supabase} inventario={inventario} cargarDatos={cargarDatos} user={user} sucursal={sucursal} />
      )}

      {pestana === 'catalogo' && (
        <>
      <div className="card" style={{ borderTop: '4px solid var(--brand-gold)', background: 'linear-gradient(145deg, #fff 0%, rgba(225,153,41,0.08) 100%)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ margin: 0, color: 'var(--brand-blue)' }}>Total del inventario en tienda</h3>
            <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.85rem' }}>
              Suma de <strong>stock × precio de venta</strong> de todos los productos con existencia.
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--brand-green)', lineHeight: 1.1 }}>{fmtMxn(valorInventario.valorTotal)}</div>
            <div className="muted" style={{ fontSize: '0.82rem', marginTop: '0.25rem' }}>
              {valorInventario.unidades.toLocaleString('es-MX')} uds. · {valorInventario.skusConStock} productos con stock
            </div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.65rem', marginTop: '1rem' }}>
          <div style={{ padding: '0.65rem 0.75rem', borderRadius: '10px', background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="muted" style={{ fontSize: '0.7rem', textTransform: 'uppercase' }}>A costo compra</div>
            <div style={{ fontWeight: 700 }}>{fmtMxn(valorInventario.valorCosto)}</div>
          </div>
          <div style={{ padding: '0.65rem 0.75rem', borderRadius: '10px', background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="muted" style={{ fontSize: '0.7rem', textTransform: 'uppercase' }}>Margen potencial</div>
            <div style={{ fontWeight: 700, color: 'var(--brand-gold-dark)' }}>{fmtMxn(valorInventario.margenPotencial)}</div>
          </div>
          <div style={{ padding: '0.65rem 0.75rem', borderRadius: '10px', background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="muted" style={{ fontSize: '0.7rem', textTransform: 'uppercase' }}>SKUs en catálogo</div>
            <div style={{ fontWeight: 700 }}>{valorInventario.totalSkus}</div>
          </div>
        </div>
        {valorInventario.skusSinPrecio > 0 && (
          <p className="muted" style={{ margin: '0.75rem 0 0', fontSize: '0.82rem', color: 'var(--brand-gold-dark)' }}>
            {valorInventario.skusSinPrecio} producto(s) tienen stock pero no precio de venta — se contaron a $0. Edítalos en el formulario de arriba.
          </p>
        )}
        {valorInventario.skusSinPrecio === 0 && valorInventario.skusSinCosto > 0 && (
          <p className="muted" style={{ margin: '0.75rem 0 0', fontSize: '0.82rem', color: 'var(--brand-gold-dark)' }}>
            {valorInventario.skusSinCosto} producto(s) tienen stock pero no precio de compra — se contaron a $0. Edítalos en el formulario de arriba.
          </p>
        )}
        <button
          type="button"
          className="btn btn-ghost"
          style={{ marginTop: '0.75rem', fontSize: '0.85rem' }}
          onClick={() => setMostrarValorInv((v) => !v)}
        >
          <BtnLabel icon="chart">{mostrarValorInv ? 'Ocultar desglose por departamento' : 'Ver desglose por departamento'}</BtnLabel>
        </button>
        {mostrarValorInv && valorInventario.departamentos.length > 0 && (
          <div className="table-wrap" style={{ marginTop: '0.75rem', maxHeight: '240px' }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Departamento</th>
                  <th>Productos</th>
                  <th>Unidades</th>
                  <th>Valor venta</th>
                  <th>Valor a costo</th>
                </tr>
              </thead>
              <tbody>
                {valorInventario.departamentos.map((d) => (
                  <tr key={d.codigo}>
                    <td>{d.etiqueta}</td>
                    <td>{d.skus}</td>
                    <td>{d.unidades}</td>
                    <td>{fmtMxn(d.valorVenta)}</td>
                    <td>{fmtMxn(d.valorCosto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <FormularioProducto
        form={form}
        setForm={setForm}
        departamentos={departamentos}
        esEdicion={esEdicionProducto}
        onDepartamentoAgregado={() => setTickDepartamentos((n) => n + 1)}
        onGuardar={guardar}
        onEliminar={() => eliminar(form.id)}
        onLimpiar={() => {
          setEsEdicionProducto(false);
          setVinculos([]);
        }}
      />

      {form.id.trim() && (
        <div className="card">
          <h4 style={{ margin: '0 0 0.5rem', color: 'var(--brand-blue)' }}>Proveedores de este producto</h4>
            <p className="muted" style={{ marginTop: 0, fontSize: '0.85rem' }}>
              Vincula distribuidores habituales para filtrar el pedido de compra por proveedor.
            </p>
            <div className="grid-2" style={{ marginTop: '0.75rem' }}>
              <label className="muted">
                Proveedor
                <select className="select" style={{ marginTop: '0.35rem' }} value={nuevoProvId} onChange={(e) => setNuevoProvId(e.target.value)}>
                  <option value="">— Elegir —</option>
                  {proveedores.map((pr) => (
                    <option key={pr.id} value={pr.id}>
                      {pr.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <label className="muted">
                SKU / clave en factura del proveedor (opcional)
                <input className="input" style={{ marginTop: '0.35rem' }} value={nuevoSkuProv} onChange={(e) => setNuevoSkuProv(e.target.value)} placeholder="Ej. Caja 12pzs" />
              </label>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem', alignItems: 'center' }}>
              <button type="button" className="btn btn-primary" onClick={vincularProveedor}>
                Vincular proveedor
              </button>
              {puedeAltaProveedor && (
                <button type="button" className="btn btn-gold" onClick={() => setMostrarNuevoProv((v) => !v)}>
                  {mostrarNuevoProv ? 'Ocultar nuevo proveedor' : '+ Nuevo proveedor'}
                </button>
              )}
            </div>
            {puedeAltaProveedor && mostrarNuevoProv && (
              <div style={{ marginTop: '0.75rem', padding: '1rem', borderRadius: '10px', background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <h5 style={{ margin: '0 0 0.65rem', color: 'var(--brand-blue)', fontSize: '0.9rem' }}>Alta rápida de proveedor</h5>
                <div className="grid-2">
                  <label className="muted">
                    Nombre *
                    <input className="input" style={{ marginTop: '0.35rem' }} value={nuevoProvForm.nombre} onChange={(e) => setNuevoProvForm({ ...nuevoProvForm, nombre: e.target.value })} placeholder="Ej. Coca-Cola FEMSA" />
                  </label>
                  <label className="muted">
                    Contacto
                    <input className="input" style={{ marginTop: '0.35rem' }} value={nuevoProvForm.contacto} onChange={(e) => setNuevoProvForm({ ...nuevoProvForm, contacto: e.target.value })} />
                  </label>
                  <label className="muted">
                    Teléfono
                    <input className="input" style={{ marginTop: '0.35rem' }} value={nuevoProvForm.telefono} onChange={(e) => setNuevoProvForm({ ...nuevoProvForm, telefono: e.target.value })} />
                  </label>
                  <label className="muted">
                    Email
                    <input className="input" type="email" style={{ marginTop: '0.35rem' }} value={nuevoProvForm.email} onChange={(e) => setNuevoProvForm({ ...nuevoProvForm, email: e.target.value })} />
                  </label>
                  <label className="muted" style={{ gridColumn: '1 / -1' }}>
                    Notas
                    <input className="input" style={{ marginTop: '0.35rem' }} value={nuevoProvForm.notas} onChange={(e) => setNuevoProvForm({ ...nuevoProvForm, notas: e.target.value })} />
                  </label>
                </div>
                <button type="button" className="btn btn-success" style={{ marginTop: '0.65rem' }} onClick={crearProveedor} disabled={guardandoProv}>
                  {guardandoProv ? 'Guardando…' : 'Crear y seleccionar proveedor'}
                </button>
              </div>
            )}
            <div className="table-wrap" style={{ marginTop: '0.75rem' }}>
              <table className="data">
                <thead>
                  <tr>
                    <th>Proveedor</th>
                    <th>SKU proveedor</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {vinculos.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="muted">
                        Sin vínculos aún.
                      </td>
                    </tr>
                  ) : (
                    vinculos.map((v) => (
                      <tr key={v.id}>
                        <td>{v.proveedores?.nombre || v.proveedor_id}</td>
                        <td>{v.sku_proveedor || '—'}</td>
                        <td>
                          <button type="button" className="btn btn-danger" style={{ padding: '0.25rem 0.45rem', fontSize: '0.75rem' }} onClick={() => quitarVinculo(v.id)}>
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0, color: 'var(--brand-blue)' }}>Catálogo</h3>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <input className="input" style={{ maxWidth: '280px' }} placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />
            <button type="button" className="btn btn-ghost" onClick={descargarPlantillaCsv}>
              Plantilla CSV
            </button>
            <button type="button" className="btn btn-primary" onClick={() => fileImportRef.current?.click()}>
              Importar Excel / CSV
            </button>
            <input ref={fileImportRef} type="file" accept=".xlsx,.xls,.csv,.txt" style={{ display: 'none' }} onChange={elegirArchivoImport} />
          </div>
        </div>

        {(mostrarImport || importFilas.length > 0) && (
          <div style={{ marginTop: '1rem', padding: '1rem', borderRadius: '10px', background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <div>
                <strong style={{ color: 'var(--brand-blue)' }}>Vista previa de importación</strong>
                {importNombre && <span className="muted" style={{ marginLeft: '0.5rem', fontSize: '0.85rem' }}>({importNombre})</span>}
                <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.85rem' }}>
                  Columnas: código, nombre, precio, stock, stock_minimo, categoría. Se detectan varios nombres de columna en español.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-success" onClick={confirmarImport} disabled={importando || !importFilas.length}>
                  {importando ? 'Importando…' : `Confirmar (${importFilas.length})`}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    setImportFilas([]);
                    setImportNombre('');
                    setMostrarImport(false);
                  }}
                >
                  Cancelar
                </button>
              </div>
            </div>
            <div className="table-wrap" style={{ marginTop: '0.75rem', maxHeight: '240px', overflow: 'auto' }}>
              <table className="data">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Nombre</th>
                    <th>Precio</th>
                    <th>Stock</th>
                    <th>Mín.</th>
                    <th>Cat.</th>
                  </tr>
                </thead>
                <tbody>
                  {importFilas.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="muted">
                        Sin filas válidas. Revisa que cada fila tenga código y nombre.
                      </td>
                    </tr>
                  ) : (
                    importFilas.slice(0, 50).map((p) => (
                      <tr key={p.id}>
                        <td>{p.id}</td>
                        <td>{p.nombre}</td>
                        <td>${Number(p.precio).toFixed(2)}</td>
                        <td>{p.stock}</td>
                        <td>{p.stock_minimo}</td>
                        <td>{etiquetaDepartamento(p.cat)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {importFilas.length > 50 && (
              <p className="muted" style={{ margin: '0.5rem 0 0', fontSize: '0.8rem' }}>
                Mostrando 50 de {importFilas.length} filas. Todas se importarán al confirmar.
              </p>
            )}
          </div>
        )}
        <div className="table-wrap" style={{ marginTop: '1rem' }}>
          <table className="data">
            <thead>
              <tr>
                <th>Código</th>
                <th>Nombre</th>
                <th>Precio</th>
                <th>Stock</th>
                <th>IVA</th>
                <th>Venta</th>
                <th>Cat.</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td>{p.id}</td>
                  <td>
                    {p.nombre}
                    {p.en_favoritos && <span className="badge" style={{ marginLeft: '0.35rem', fontSize: '0.65rem' }}>★</span>}
                  </td>
                  <td>${Number(p.precio).toFixed(2)}</td>
                  <td>
                    <span className={Number(p.stock) < 5 ? 'badge' : ''}>{p.stock}</span>
                  </td>
                  <td>{p.impuesto != null ? `${p.impuesto}%` : '16%'}</td>
                  <td>{p.en_venta === false ? <span className="muted">No</span> : <span style={{ color: 'var(--brand-green)' }}>Sí</span>}</td>
                  <td>{etiquetaDepartamento(p.cat)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button type="button" className="btn btn-ghost" style={{ padding: '0.35rem 0.5rem', fontSize: '0.8rem' }} onClick={() => editar(p)}>
                      Editar
                    </button>
                    <button type="button" className="btn btn-danger" style={{ padding: '0.35rem 0.5rem', fontSize: '0.8rem', marginLeft: '0.25rem' }} onClick={() => eliminar(p.id)}>
                      Borrar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
        </>
      )}
    </div>
  );
}
