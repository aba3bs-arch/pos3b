import React, { useEffect, useMemo, useRef, useState } from 'react';
import { etiquetaDepartamento, listarDepartamentos } from '../lib/departamentos.js';
import {
  descargarPlantillaCsv,
  exportarCatalogoCsv,
  importarCatalogoSupabase,
  leerArchivoCatalogo,
} from '../lib/importarCatalogo.js';
import { mensajeErrorColumnasProducto, productoDesdeDb, productoParaGuardar, productoVacio } from '../lib/productoForm.js';
import { puedeCrearProveedor } from '../lib/roles.js';
import FormularioProducto from '../components/FormularioProducto.jsx';
import CampoCodigo from '../components/CampoCodigo.jsx';
import MenuPuntos from '../components/MenuPuntos.jsx';
import Icon from '../components/Icon.jsx';
import { imprimirEtiquetasEstante } from '../lib/impresion.js';
import AjusteInventario from './AjusteInventario.jsx';

const empty = productoVacio();

const TITULOS_VISTA = {
  lista: 'Catálogo de productos',
  alta: 'Nuevo producto',
  editar: 'Editar producto',
  ajustes: 'Ajuste de inventario',
  traspaso: 'Traspasos',
  etiquetas: 'Etiquetas de estante',
  importexport: 'Importar / Exportar',
  precios: 'Administrador de precios',
  eliminar: 'Eliminar productos',
};

export default function Productos({ supabase, inventario, inventarioCompleto, cargarDatos, user, sucursal }) {
  const [vista, setVista] = useState('lista');
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
  const [esEdicionProducto, setEsEdicionProducto] = useState(false);
  const [tickDepartamentos, setTickDepartamentos] = useState(0);
  const [preciosDraft, setPreciosDraft] = useState({});
  const [guardandoPrecios, setGuardandoPrecios] = useState(false);
  const [seleccionEliminar, setSeleccionEliminar] = useState(() => new Set());
  const [etiquetasSel, setEtiquetasSel] = useState(() => new Set());
  const fileImportRef = useRef(null);
  const puedeAltaProveedor = puedeCrearProveedor(user?.rol);

  const departamentos = useMemo(() => listarDepartamentos(inventario), [inventario, tickDepartamentos]);

  useEffect(() => {
    if (!supabase) return;
    (async () => {
      const { data } = await supabase.from('proveedores').select('id, nombre').order('nombre');
      setProveedores(data || []);
    })();
  }, [supabase]);

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    let list = inventario || [];
    if (t) {
      list = list.filter(
        (p) =>
          String(p.nombre || '')
            .toLowerCase()
            .includes(t) || String(p.id || '').toLowerCase().includes(t),
      );
    }
    return list;
  }, [inventario, q]);

  const loadVinculos = async (productoId) => {
    if (!supabase || !productoId?.trim()) {
      setVinculos([]);
      return;
    }
    const { data, error } = await supabase
      .from('proveedor_producto')
      .select('id, proveedor_id, producto_id, sku_proveedor, proveedores(nombre)')
      .eq('producto_id', productoId.trim());
    if (error) setVinculos([]);
    else setVinculos(data || []);
  };

  useEffect(() => {
    loadVinculos(form.id);
  }, [supabase, form.id]);

  const irLista = () => {
    setVista('lista');
    setForm(empty);
    setEsEdicionProducto(false);
    setVinculos([]);
  };

  const editar = (p) => {
    setForm(productoDesdeDb(p));
    setEsEdicionProducto(true);
    setVista('editar');
  };

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
    cargarDatos();
    irLista();
  };

  const eliminar = async (id) => {
    if (!supabase) return;
    if (!confirm('¿Eliminar producto del catálogo?')) return;
    const { error } = await supabase.from('productos').delete().eq('id', id);
    if (error) return alert(error.message);
    cargarDatos();
    setSeleccionEliminar((prev) => {
      const n = new Set(prev);
      n.delete(id);
      return n;
    });
  };

  const eliminarSeleccionados = async () => {
    const ids = [...seleccionEliminar];
    if (!ids.length) return alert('Marca al menos un producto.');
    if (!confirm(`¿Eliminar ${ids.length} producto(s) del catálogo?`)) return;
    for (const id of ids) {
      const { error } = await supabase.from('productos').delete().eq('id', id);
      if (error) return alert(`${id}: ${error.message}`);
    }
    setSeleccionEliminar(new Set());
    cargarDatos();
    alert('Productos eliminados.');
  };

  const toggleSelEliminar = (id) => {
    setSeleccionEliminar((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const toggleEtiqueta = (id) => {
    setEtiquetasSel((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const imprimirEtiquetas = () => {
    const ids = etiquetasSel.size ? [...etiquetasSel] : rows.map((p) => p.id);
    const productos = inventario.filter((p) => ids.includes(p.id));
    if (!productos.length) return alert('No hay productos para imprimir.');
    imprimirEtiquetasEstante(productos, { sucursal });
  };

  const initPreciosDraft = () => {
    const d = {};
    for (const p of inventario) d[p.id] = String(Number(p.precio || 0).toFixed(2));
    setPreciosDraft(d);
  };

  const guardarPrecios = async () => {
    if (!supabase) return;
    const cambios = Object.entries(preciosDraft).filter(([id, v]) => {
      const p = inventario.find((x) => x.id === id);
      return p && Number(v) !== Number(p.precio);
    });
    if (!cambios.length) return alert('No hay cambios de precio.');
    if (!confirm(`¿Actualizar precio de ${cambios.length} producto(s)?`)) return;
    setGuardandoPrecios(true);
    for (const [id, precio] of cambios) {
      const { error } = await supabase.from('productos').update({ precio: Number(precio) || 0 }).eq('id', id);
      if (error) {
        setGuardandoPrecios(false);
        return alert(error.message);
      }
    }
    setGuardandoPrecios(false);
    cargarDatos();
    alert('Precios actualizados.');
  };

  const elegirArchivoImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const r = await leerArchivoCatalogo(file);
    if (!r.ok) return alert(r.error);
    setImportFilas(r.filas);
    setImportNombre(r.origen);
    e.target.value = '';
  };

  const confirmarImport = async () => {
    if (!importFilas.length) return alert('No hay filas para importar.');
    if (!confirm(`¿Importar ${importFilas.length} producto(s)?`)) return;
    setImportando(true);
    const r = await importarCatalogoSupabase(supabase, importFilas);
    setImportando(false);
    if (!r.ok) return alert(r.error);
    alert(`Catálogo importado: ${r.count} producto(s).`);
    setImportFilas([]);
    setImportNombre('');
    cargarDatos();
  };

  const menuItems = [
    { id: 'alta', label: 'Nuevo producto', icon: 'plus', onClick: () => { setForm(empty); setEsEdicionProducto(false); setVista('alta'); } },
    { id: 'ajustes', label: 'Ajuste de inventario', icon: 'refresh', onClick: () => setVista('ajustes') },
    { id: 'traspaso', label: 'Traspasos', icon: 'truck', onClick: () => setVista('traspaso') },
    { id: 'etiquetas', label: 'Imprimir etiquetas de estante', icon: 'print', onClick: () => { setEtiquetasSel(new Set()); setVista('etiquetas'); } },
    { id: 'importexport', label: 'Importar / Exportar archivos', icon: 'download', onClick: () => setVista('importexport') },
    { id: 'precios', label: 'Administrador de precios', icon: 'dollar', onClick: () => { initPreciosDraft(); setVista('precios'); } },
    { id: 'eliminar', label: 'Eliminar productos', icon: 'trash', onClick: () => { setSeleccionEliminar(new Set()); setVista('eliminar'); } },
  ];

  const tablaProductos = (opts = {}) => {
    const { selectable, onSelect, selected, onRowClick, showActions = true } = opts;
    return (
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              {selectable && <th style={{ width: 36 }} />}
              <th>Código</th>
              <th>Nombre</th>
              <th>Precio</th>
              <th>Piso</th>
              <th>CEDIS</th>
              <th>Cat.</th>
              {showActions && <th />}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={selectable ? 8 : 7} className="muted">
                  Sin productos. Usa el menú ⋮ para dar de alta o importar.
                </td>
              </tr>
            ) : (
              rows.map((p) => (
                <tr key={p.id} onClick={onRowClick ? () => onRowClick(p) : undefined} style={onRowClick ? { cursor: 'pointer' } : undefined}>
                  {selectable && (
                    <td>
                      <input type="checkbox" checked={selected?.has(p.id)} onChange={() => onSelect?.(p.id)} onClick={(e) => e.stopPropagation()} />
                    </td>
                  )}
                  <td>{p.id}</td>
                  <td>{p.nombre}</td>
                  <td>${Number(p.precio).toFixed(2)}</td>
                  <td>{p.stock}</td>
                  <td>{p.stock_cedis ?? 0}</td>
                  <td>{etiquetaDepartamento(p.cat)}</td>
                  {showActions && (
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button type="button" className="btn btn-ghost" style={{ padding: '0.35rem 0.5rem', fontSize: '0.8rem' }} onClick={() => editar(p)}>
                        Editar
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="productos-toolbar">
        <div>
          <h2>{TITULOS_VISTA[vista] || 'Productos'}</h2>
          {vista === 'lista' && (
            <p className="muted" style={{ margin: '0.25rem 0 0', fontSize: '0.85rem' }}>
              {inventario.length} producto(s) en catálogo
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {vista === 'lista' && (
            <CampoCodigo
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar producto…"
              tituloCamara="Buscar en catálogo"
              inputStyle={{ minWidth: '220px' }}
            />
          )}
          {vista !== 'lista' && (
            <button type="button" className="btn btn-ghost" onClick={irLista}>
              <Icon name="home" size={16} />
              Volver al catálogo
            </button>
          )}
          <MenuPuntos items={menuItems} />
        </div>
      </div>

      {vista === 'lista' && (
        <div className="card">
          {tablaProductos({ showActions: true })}
        </div>
      )}

      {(vista === 'alta' || vista === 'editar') && (
        <>
          <FormularioProducto
            form={form}
            setForm={setForm}
            departamentos={departamentos}
            esEdicion={esEdicionProducto}
            onDepartamentoAgregado={() => setTickDepartamentos((n) => n + 1)}
            onGuardar={guardar}
            onEliminar={() => eliminar(form.id)}
            onLimpiar={irLista}
          />
          {form.id.trim() && vista === 'editar' && (
            <div className="card">
              <h4 style={{ margin: '0 0 0.5rem', color: 'var(--brand-blue)' }}>Proveedores de este producto</h4>
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
                  SKU proveedor (opcional)
                  <input className="input" style={{ marginTop: '0.35rem' }} value={nuevoSkuProv} onChange={(e) => setNuevoSkuProv(e.target.value)} />
                </label>
              </div>
              <button
                type="button"
                className="btn btn-primary"
                style={{ marginTop: '0.75rem' }}
                onClick={async () => {
                  if (!nuevoProvId) return alert('Elige proveedor.');
                  const { error } = await supabase.from('proveedor_producto').insert([
                    { proveedor_id: nuevoProvId, producto_id: form.id.trim(), sku_proveedor: nuevoSkuProv.trim() || null },
                  ]);
                  if (error) return alert(error.message);
                  setNuevoProvId('');
                  setNuevoSkuProv('');
                  loadVinculos(form.id);
                }}
              >
                Vincular proveedor
              </button>
              {vinculos.length > 0 && (
                <ul style={{ marginTop: '0.75rem' }}>
                  {vinculos.map((v) => (
                    <li key={v.id}>
                      {v.proveedores?.nombre || v.proveedor_id}
                      <button type="button" className="btn btn-danger" style={{ marginLeft: '0.5rem', padding: '0.2rem 0.4rem', fontSize: '0.75rem' }} onClick={async () => {
                        await supabase.from('proveedor_producto').delete().eq('id', v.id);
                        loadVinculos(form.id);
                      }}>
                        Quitar
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}

      {vista === 'ajustes' && (
        <AjusteInventario supabase={supabase} inventario={inventario} inventarioCompleto={inventarioCompleto || inventario} cargarDatos={cargarDatos} user={user} sucursal={sucursal} modoInicial="libre" />
      )}

      {vista === 'traspaso' && (
        <AjusteInventario supabase={supabase} inventario={inventario} inventarioCompleto={inventarioCompleto || inventario} cargarDatos={cargarDatos} user={user} sucursal={sucursal} modoInicial="traspaso" />
      )}

      {vista === 'etiquetas' && (
        <div className="card">
          <p className="muted" style={{ marginTop: 0, fontSize: '0.85rem' }}>
            Marca los productos o imprime todos los de la búsqueda actual ({rows.length}).
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-primary" onClick={imprimirEtiquetas}>
              <Icon name="print" size={16} />
              Imprimir etiquetas
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setEtiquetasSel(new Set(rows.map((p) => p.id)))}>
              Seleccionar todos (filtro)
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setEtiquetasSel(new Set())}>
              Limpiar selección
            </button>
          </div>
          {tablaProductos({
            selectable: true,
            selected: etiquetasSel,
            onSelect: toggleEtiqueta,
            showActions: false,
          })}
        </div>
      )}

      {vista === 'importexport' && (
        <div className="card">
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            <button type="button" className="btn btn-ghost" onClick={descargarPlantillaCsv}>
              Descargar plantilla CSV
            </button>
            <button type="button" className="btn btn-primary" onClick={() => fileImportRef.current?.click()}>
              Importar Excel / CSV
            </button>
            <button type="button" className="btn btn-gold" onClick={() => exportarCatalogoCsv(inventario)}>
              Exportar catálogo CSV
            </button>
            <input ref={fileImportRef} type="file" accept=".xlsx,.xls,.csv,.txt" style={{ display: 'none' }} onChange={elegirArchivoImport} />
          </div>
          {importFilas.length > 0 && (
            <>
              <p className="muted">
                Vista previa: <strong>{importNombre}</strong> · {importFilas.length} fila(s)
              </p>
              <button type="button" className="btn btn-success" onClick={confirmarImport} disabled={importando}>
                {importando ? 'Importando…' : `Confirmar importación (${importFilas.length})`}
              </button>
            </>
          )}
        </div>
      )}

      {vista === 'precios' && (
        <div className="card">
          <p className="muted" style={{ marginTop: 0 }}>Edita precios de venta y guarda todos los cambios.</p>
          <div className="table-wrap" style={{ maxHeight: '480px' }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Producto</th>
                  <th>Precio actual</th>
                  <th>Nuevo precio</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td>{p.id}</td>
                    <td>{p.nombre}</td>
                    <td>${Number(p.precio).toFixed(2)}</td>
                    <td>
                      <input
                        className="input"
                        type="number"
                        step="0.01"
                        min={0}
                        style={{ width: '7rem', padding: '0.35rem' }}
                        value={preciosDraft[p.id] ?? ''}
                        onChange={(e) => setPreciosDraft({ ...preciosDraft, [p.id]: e.target.value })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" className="btn btn-success" style={{ marginTop: '0.75rem' }} onClick={guardarPrecios} disabled={guardandoPrecios}>
            {guardandoPrecios ? 'Guardando…' : 'Guardar precios'}
          </button>
        </div>
      )}

      {vista === 'eliminar' && (
        <div className="card">
          <p className="muted" style={{ marginTop: 0, color: 'var(--brand-red)' }}>
            Marca productos para eliminarlos del catálogo. Esta acción no se puede deshacer.
          </p>
          <button type="button" className="btn btn-danger" style={{ marginBottom: '0.75rem' }} onClick={eliminarSeleccionados} disabled={!seleccionEliminar.size}>
            Eliminar seleccionados ({seleccionEliminar.size})
          </button>
          {tablaProductos({
            selectable: true,
            selected: seleccionEliminar,
            onSelect: toggleSelEliminar,
            showActions: false,
          })}
        </div>
      )}
    </div>
  );
}
