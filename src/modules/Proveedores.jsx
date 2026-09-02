import React, { useEffect, useMemo, useState } from 'react';
import { puedeCrearProveedor } from '../lib/roles.js';
import {
  eliminarItemCatalogo,
  guardarItemCatalogo,
  listarCatalogoProveedor,
  nombreCatalogoItem,
  registrarCatalogoEnInventario,
  registrarCatalogoPendientesEnInventario,
} from '../lib/proveedorCatalogo.js';
import { etiquetaTienda } from '../constants/sucursales.js';
import CampoCodigo from '../components/CampoCodigo.jsx';
import MatrizEntregasProveedores from '../components/MatrizEntregasProveedores.jsx';
import { productoCoincideBusqueda } from '../lib/buscarProductoTexto.js';
import { MODOS_COMPRA_PROVEEDOR, etiquetaModoCompraProveedor, normalizarModoCompraProveedor } from '../lib/comprasProveedor.js';
import { etiquetaDepartamento, listarDepartamentos } from '../lib/departamentos.js';
import {
  DEPARTAMENTOS_CEDIS_UI,
  PROVEEDOR_CEDIS_NOMBRE,
  catCedisDesdeUi,
  departamentoCedisUiDesdeCat,
  esProveedorCedisLas3b,
} from '../lib/catalogoCedis.js';

const empty = {
  nombre: '',
  contacto: '',
  telefono: '',
  email: '',
  rfc: '',
  direccion: '',
  notas: '',
  modo_compra: 'pedido',
};

/** Columnas opcionales: si faltan en Supabase, se omiten al guardar y se indica el script. */
const COLUMNAS_OPCIONALES = [
  ['email', 'supabase/fix_proveedores_columnas.sql'],
  ['rfc', 'supabase/fix_proveedores_columnas.sql'],
  ['direccion', 'supabase/fix_proveedores_columnas.sql'],
  ['modo_compra', 'supabase/fix_proveedores_columnas.sql'],
];

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
  const [registrandoMasivo, setRegistrandoMasivo] = useState(false);
  const [filtroDeptoCat, setFiltroDeptoCat] = useState('');
  const puedeAlta = puedeCrearProveedor(user?.rol);

  const esProvCedis = esProveedorCedisLas3b(form.nombre) || esProveedorCedisLas3b(rows.find((r) => r.id === editId));
  const departamentosCatalogo = useMemo(
    () => (esProvCedis ? DEPARTAMENTOS_CEDIS_UI : listarDepartamentos(inventario)),
    [esProvCedis, inventario],
  );

  const catalogoFiltrado = useMemo(() => {
    if (!filtroDeptoCat) return catalogo;
    if (esProvCedis) {
      const want = catCedisDesdeUi(filtroDeptoCat);
      return catalogo.filter((c) => {
        const cat = String(c.cat || '').trim().toUpperCase();
        return cat === want || cat === String(filtroDeptoCat).toUpperCase();
      });
    }
    return catalogo.filter(
      (c) => String(c.cat || '').trim().toUpperCase() === String(filtroDeptoCat).trim().toUpperCase(),
    );
  }, [catalogo, filtroDeptoCat, esProvCedis]);

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
    setFormCat({
      ...emptyCatalogo,
      cat: esProveedorCedisLas3b(rows.find((r) => r.id === editId)) ? 'CIGARROS' : 'GENERAL',
    });
    setEditCatId(null);
    setMostrarVinculos(false);
    setFiltroDeptoCat('');
  }, [supabase, editId]);

  const guardar = async () => {
    if (!supabase) return;
    if (!form.nombre.trim()) return alert('Nombre obligatorio');
    if (!editId && !puedeAlta) {
      return alert('Solo el administrador puede dar de alta proveedores.');
    }

    const faltaColumna = (error, col) => {
      const msg = String(error?.message || error || '').toLowerCase();
      return msg.includes(String(col).toLowerCase()) && (
        msg.includes('column') || msg.includes('columna') || msg.includes('schema cache') || msg.includes('does not exist')
      );
    };

    let payload = {
      nombre: form.nombre.trim(),
      contacto: String(form.contacto || '').trim() || null,
      telefono: String(form.telefono || '').trim() || null,
      email: String(form.email || '').trim() || null,
      rfc: String(form.rfc || '').trim().toUpperCase() || null,
      direccion: String(form.direccion || '').trim() || null,
      notas: String(form.notas || '').trim() || null,
      modo_compra: normalizarModoCompraProveedor(form.modo_compra),
    };

    const persistir = (row) => (
      editId
        ? supabase.from('proveedores').update(row).eq('id', editId)
        : supabase.from('proveedores').insert([row])
    );

    const avisos = [];
    let { error } = await persistir(payload);

    // Tablas antiguas: quitar columnas que aún no existen y reintentar.
    for (const [col, script] of COLUMNAS_OPCIONALES) {
      if (!error || !faltaColumna(error, col)) continue;
      const { [col]: _omit, ...rest } = payload;
      payload = rest;
      ({ error } = await persistir(payload));
      if (!error) avisos.push(`Para guardar «${col}», ejecuta ${script} en Supabase.`);
    }

    if (error) {
      if (String(error.message || '').includes('relation') || error.code === '42P01') {
        return alert('Ejecuta supabase/schema.sql para crear la tabla proveedores.');
      }
      return alert(error.message);
    }

    if (avisos.length) {
      alert(`Proveedor guardado parcialmente.\n\n${avisos.join('\n')}\n\nPara completar la tabla ejecuta: supabase/fix_proveedores_columnas.sql`);
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
      rfc: r.rfc || '',
      direccion: r.direccion || '',
      notas: r.notas || '',
      modo_compra: normalizarModoCompraProveedor(r.modo_compra),
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
    const catGuardar = esProvCedis ? catCedisDesdeUi(formCat.cat) : String(formCat.cat || 'GENERAL').trim() || 'GENERAL';
    if (esProvCedis && !formCat.cat) {
      return alert('Elige un departamento (cigarros, bluntwrap, ropa, etc.).');
    }
    const res = await guardarItemCatalogo(supabase, editId, { ...formCat, cat: catGuardar }, editCatId);
    if (!res.ok) return alert(res.error);
    setFormCat({
      ...emptyCatalogo,
      cat: esProvCedis ? 'CIGARROS' : 'GENERAL',
    });
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
      cat: esProvCedis ? departamentoCedisUiDesdeCat(item.cat) || 'CIGARROS' : item.cat || 'GENERAL',
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

  const registrarTodosPendientes = async () => {
    if (!supabase || !editId) return;
    const pendientes = catalogo.filter((c) => !c.producto_id && c.activo !== false);
    if (!pendientes.length) return alert('No hay productos pendientes.');

    const conCodigo = pendientes.filter((c) => String(c.codigo_barras || '').trim());
    const sinCodigo = pendientes.filter((c) => !String(c.codigo_barras || '').trim());
    if (!conCodigo.length) {
      return alert(
        'Ningún pendiente tiene código de barras.\n\nEdita cada ítem del catálogo y pon el código (o SKU de barras) antes de registrar.',
      );
    }

    const msg =
      `¿Registrar ${conCodigo.length} producto(s) en inventario de ${etiquetaTienda(sucursal)}?\n\n` +
      `• Usa el código y precio de compra del catálogo\n` +
      `• Stock inicial: 0 (luego ajustas con conteo/ajuste)\n` +
      (sinCodigo.length ? `\nSe omitirán ${sinCodigo.length} sin código de barras.` : '');
    if (!confirm(msg)) return;

    setRegistrandoMasivo(true);
    const res = await registrarCatalogoPendientesEnInventario(supabase, pendientes, {
      sucursal,
      stockInicial: 0,
      cargarDatos,
    });
    setRegistrandoMasivo(false);

    await loadCatalogo(editId);
    await loadVinculos(editId);

    const partes = [
      `Creados: ${res.registrados || 0}`,
      `Enlazados a existentes: ${res.enlazados || 0}`,
    ];
    if (res.omitidos?.length) partes.push(`Sin código (omitidos): ${res.omitidos.length}`);
    if (res.errores?.length) partes.push(`Errores:\n${res.errores.slice(0, 8).join('\n')}`);
    alert(partes.join('\n'));
  };

  const productosFiltrados = inventario.filter((p) => {
    const t = busqProd.trim();
    if (!t) return false;
    return productoCoincideBusqueda(p, t);
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
      <MatrizEntregasProveedores supabase={supabase} proveedores={rows} />

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
              <label className="muted" style={{ display: 'block' }}>
                Nombre empresa *
                <input className="input" style={{ marginTop: '0.35rem' }} placeholder="Razón social" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
              </label>
              <label className="muted" style={{ display: 'block' }}>
                Contacto
                <input className="input" style={{ marginTop: '0.35rem' }} placeholder="Nombre de contacto" value={form.contacto} onChange={(e) => setForm({ ...form, contacto: e.target.value })} />
              </label>
              <label className="muted" style={{ display: 'block' }}>
                Teléfono
                <input className="input" style={{ marginTop: '0.35rem' }} placeholder="Teléfono" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} type="tel" />
              </label>
              <label className="muted" style={{ display: 'block' }}>
                Email
                <input className="input" style={{ marginTop: '0.35rem' }} placeholder="correo@proveedor.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} type="email" autoComplete="email" />
              </label>
              <label className="muted" style={{ display: 'block' }}>
                RFC
                <input className="input" style={{ marginTop: '0.35rem' }} placeholder="RFC" value={form.rfc} onChange={(e) => setForm({ ...form, rfc: e.target.value.toUpperCase() })} autoComplete="off" />
              </label>
              <label className="muted" style={{ display: 'block' }}>
                Tipo de compra
                <select
                  className="select"
                  style={{ marginTop: '0.35rem' }}
                  value={normalizarModoCompraProveedor(form.modo_compra)}
                  onChange={(e) => setForm({ ...form, modo_compra: e.target.value })}
                >
                  {MODOS_COMPRA_PROVEEDOR.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="muted" style={{ gridColumn: '1 / -1', display: 'block' }}>
                Dirección
                <input className="input" style={{ marginTop: '0.35rem' }} placeholder="Calle, colonia, ciudad…" value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} />
              </label>
              <p className="muted" style={{ gridColumn: '1 / -1', margin: 0, fontSize: '0.78rem' }}>
                {MODOS_COMPRA_PROVEEDOR.find((m) => m.id === normalizarModoCompraProveedor(form.modo_compra))?.hint}
              </p>
              <label className="muted" style={{ gridColumn: '1 / -1', display: 'block' }}>
                Notas
                <textarea
                  className="input"
                  placeholder="Pagos, condiciones, días de entrega…"
                  style={{ marginTop: '0.35rem', minHeight: '72px' }}
                  value={form.notas}
                  onChange={(e) => setForm({ ...form, notas: e.target.value })}
                />
              </label>
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
            {esProvCedis ? (
              <>
                Proveedor <strong>{PROVEEDOR_CEDIS_NOMBRE}</strong>: elige el <strong>departamento</strong> de cada
                producto (cigarros, bluntwrap, electrónicos, abarrotes, medicamento, ropa).
              </>
            ) : (
              <>
                Define los productos que vende este distribuidor (ej. Coca Cola 600, 500, 1 lt, 2 lts). Cada sucursal los registra en su inventario con{' '}
                <strong>Registrar en inventario</strong> ({etiquetaTienda(sucursal)}).
              </>
            )}
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
            <label className="muted" style={{ display: 'block' }}>
              Departamento {esProvCedis ? '*' : ''}
              <select
                className="select"
                style={{ marginTop: '0.35rem', width: '100%' }}
                value={formCat.cat}
                onChange={(e) => setFormCat({ ...formCat, cat: e.target.value })}
              >
                {!esProvCedis && <option value="GENERAL">GENERAL</option>}
                {departamentosCatalogo.map((d) => (
                  <option key={d} value={d}>
                    {etiquetaDepartamento(d)}
                  </option>
                ))}
              </select>
            </label>
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
                  setFormCat({
                    ...emptyCatalogo,
                    cat: esProvCedis ? 'CIGARROS' : 'GENERAL',
                  });
                }}
              >
                Cancelar ítem
              </button>
            )}
            <label className="muted" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginLeft: 'auto' }}>
              Filtrar depto
              <select className="select" value={filtroDeptoCat} onChange={(e) => setFiltroDeptoCat(e.target.value)}>
                <option value="">Todos</option>
                {departamentosCatalogo.map((d) => (
                  <option key={d} value={d}>{etiquetaDepartamento(d)}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="table-wrap" style={{ marginTop: '0.75rem' }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Depto</th>
                  <th>SKU prov.</th>
                  <th>Código</th>
                  <th>P. compra</th>
                  <th>Inventario</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {catalogoFiltrado.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="muted">
                      {catalogo.length === 0
                        ? 'Sin productos en el catálogo. Agrega ítems arriba.'
                        : 'Ningún ítem en ese departamento.'}
                    </td>
                  </tr>
                ) : (
                  catalogoFiltrado.map((c) => (
                    <tr key={c.id}>
                      <td>{nombreCatalogoItem(c)}</td>
                      <td>{etiquetaDepartamento(departamentoCedisUiDesdeCat(c.cat) || c.cat || 'GENERAL')}</td>
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
            <div style={{ marginTop: '0.65rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
              <p className="muted" style={{ margin: 0, fontSize: '0.85rem', flex: '1 1 220px' }}>
                {pendientesCatalogo.length} pendiente(s) en {etiquetaTienda(sucursal)}. Si ya tienen código de barras en el
                catálogo, puedes pasarlos todos de una vez (stock 0).
              </p>
              <button
                type="button"
                className="btn btn-primary"
                disabled={registrandoMasivo}
                onClick={registrarTodosPendientes}
              >
                {registrandoMasivo ? 'Registrando…' : `Registrar todos (${pendientesCatalogo.length})`}
              </button>
            </div>
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
                <th>RFC</th>
                <th>Dirección</th>
                <th>Tipo compra</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="muted">
                    Sin proveedores registrados.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.nombre || '—'}</td>
                    <td>{r.contacto || '—'}</td>
                    <td>{r.telefono || '—'}</td>
                    <td>{r.email || '—'}</td>
                    <td>{r.rfc || '—'}</td>
                    <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.direccion || ''}>
                      {r.direccion || '—'}
                    </td>
                    <td>{etiquetaModoCompraProveedor(r.modo_compra)}</td>
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
