import React, { useEffect, useMemo, useRef, useState } from 'react';
import { etiquetaDepartamento, listarDepartamentos } from '../lib/departamentos.js';
import {
  COLUMNAS_CATALOGO,
  descargarPlantillaCsv,
  descargarPlantillaExcel,
  exportarCatalogoCsv,
  filtrarFilasPorProveedores,
  importarCatalogoSupabase,
  leerArchivoCatalogo,
  listarProveedoresEnFilas,
  parsearTextoPegado,
} from '../lib/importarCatalogo.js';
import { vaciarInventario, OPCIONES_VACIADO } from '../lib/borrarInventario.js';
import { mensajeErrorColumnasProducto, productoDesdeDb, productoParaGuardar, productoVacio } from '../lib/productoForm.js';
import { puedeCrearProveedor, puedeEliminarProductosCatalogo, puedeGestionarInventarioMultitienda } from '../lib/roles.js';
import FormularioProducto from '../components/FormularioProducto.jsx';
import MenuPuntos from '../components/MenuPuntos.jsx';
import Icon from '../components/Icon.jsx';
import DetalleProducto from '../components/DetalleProducto.jsx';
import ModalAjusteInventario from '../components/ModalAjusteInventario.jsx';
import ProductoThumb from '../components/ProductoThumb.jsx';
import { imprimirEtiquetasEstante } from '../lib/impresion.js';
import AjusteInventario from './AjusteInventario.jsx';
import HistorialProducto from '../components/HistorialProducto.jsx';
import { etiquetaTienda } from '../constants/sucursales.js';
import { esAlmacenCentral, etiquetaCedisEmpresa } from '../lib/inventarioMultitienda.js';
import { sincronizarFotosCatalogo, tieneFoto } from '../lib/fotosCatalogo.js';

const empty = productoVacio();

const FILTROS_CHIP = {
  tipo: [
    { id: 'todo', label: 'Todo' },
    { id: 'producto', label: 'Producto' },
  ],
  favoritos: [
    { id: 'todo', label: 'Todo' },
    { id: 'si', label: 'Sí' },
    { id: 'no', label: 'No' },
  ],
  existencia: [
    { id: 'todo', label: 'Todo' },
    { id: 'si', label: 'Sí' },
    { id: 'no', label: 'No' },
    { id: 'negativa', label: 'Negativa' },
  ],
  disponible: [
    { id: 'todo', label: 'Todo' },
    { id: 'si', label: 'Sí' },
    { id: 'no', label: 'No' },
  ],
};

const FILTROS_VACIOS = {
  tipo: 'todo',
  favoritos: 'todo',
  existencia: 'todo',
  disponible: 'todo',
  departamento: '',
};

const TITULOS_VISTA = {
  lista: 'Producto',
  alta: 'Nuevo producto',
  editar: 'Editar producto',
  ajustes: 'Ajuste de inventario',
  traspaso: 'Traspasos',
  etiquetas: 'Etiquetas de estante',
  importexport: 'Importar / Exportar',
  vaciarinventario: 'Vaciar inventario',
  historial: 'Historial del producto',
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
  const [importAviso, setImportAviso] = useState('');
  const [textoPegado, setTextoPegado] = useState('');
  const [importProvSel, setImportProvSel] = useState(() => new Set());
  const [alcanceVaciado, setAlcanceVaciado] = useState('tienda');
  const [motivoVaciado, setMotivoVaciado] = useState('');
  const [vaciando, setVaciando] = useState(false);
  const [productoHistorial, setProductoHistorial] = useState(null);
  const [esEdicionProducto, setEsEdicionProducto] = useState(false);
  const [tickDepartamentos, setTickDepartamentos] = useState(0);
  const [preciosDraft, setPreciosDraft] = useState({});
  const [guardandoPrecios, setGuardandoPrecios] = useState(false);
  const [seleccionEliminar, setSeleccionEliminar] = useState(() => new Set());
  const [etiquetasSel, setEtiquetasSel] = useState(() => new Set());
  const [productoSelId, setProductoSelId] = useState(null);
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const [filtrosDraft, setFiltrosDraft] = useState(FILTROS_VACIOS);
  const [filtros, setFiltros] = useState(FILTROS_VACIOS);
  const [modalAjusteOpen, setModalAjusteOpen] = useState(false);
  const [ajusteConfig, setAjusteConfig] = useState({ modo: 'libre', tipo: 'entrada' });
  const [sincronizandoFotos, setSincronizandoFotos] = useState(false);
  const [progresoFotos, setProgresoFotos] = useState(null);
  const fileImportRef = useRef(null);
  const puedeAltaProveedor = puedeCrearProveedor(user?.rol);
  const puedeVaciarInventario = puedeGestionarInventarioMultitienda(user?.rol);
  const puedeEliminarCatalogo = puedeEliminarProductosCatalogo(user?.rol);
  const tiendaLabel = sucursal ? etiquetaTienda(sucursal) : 'MAIN';
  const enCentral = esAlmacenCentral(sucursal);

  const departamentos = useMemo(() => listarDepartamentos(inventario), [inventario, tickDepartamentos]);

  useEffect(() => {
    if (vista === 'eliminar' && !puedeEliminarCatalogo) setVista('lista');
  }, [vista, puedeEliminarCatalogo]);

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
    if (filtros.departamento) {
      list = list.filter((p) => String(p.cat || '').toUpperCase() === filtros.departamento.toUpperCase());
    }
    if (filtros.favoritos === 'si') list = list.filter((p) => Boolean(p.en_favoritos) || p.cat === 'FAVORITOS');
    if (filtros.favoritos === 'no') list = list.filter((p) => !p.en_favoritos && p.cat !== 'FAVORITOS');
    if (filtros.existencia === 'si') list = list.filter((p) => Number(p.stock) > 0);
    if (filtros.existencia === 'no') list = list.filter((p) => Number(p.stock) === 0);
    if (filtros.existencia === 'negativa') list = list.filter((p) => Number(p.stock) < 0);
    if (filtros.disponible === 'si') list = list.filter((p) => p.en_venta !== false);
    if (filtros.disponible === 'no') list = list.filter((p) => p.en_venta === false);
    return list;
  }, [inventario, q, filtros]);

  const productoSeleccionado = useMemo(() => {
    if (!productoSelId) return rows[0] || inventario?.[0] || null;
    return (inventario || []).find((p) => p.id === productoSelId) || rows[0] || null;
  }, [inventario, productoSelId, rows]);

  useEffect(() => {
    if (!productoSelId && rows[0]) setProductoSelId(rows[0].id);
    else if (productoSelId && !(inventario || []).some((p) => p.id === productoSelId) && rows[0]) {
      setProductoSelId(rows[0].id);
    }
  }, [rows, inventario, productoSelId]);

  const filtrosActivos = useMemo(() => {
    let n = 0;
    if (filtros.favoritos !== 'todo') n += 1;
    if (filtros.existencia !== 'todo') n += 1;
    if (filtros.disponible !== 'todo') n += 1;
    if (filtros.departamento) n += 1;
    return n;
  }, [filtros]);

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
    if (vista === 'lista' && productoSeleccionado?.id) loadVinculos(productoSeleccionado.id);
    else if (form.id) loadVinculos(form.id);
  }, [supabase, form.id, productoSeleccionado?.id, vista]);

  const irLista = () => {
    setVista('lista');
    setForm(empty);
    setEsEdicionProducto(false);
    setProductoHistorial(null);
    setVinculos([]);
  };

  const seleccionarProducto = (p) => {
    setProductoSelId(p.id);
  };

  const editar = (p) => {
    setForm(productoDesdeDb(p));
    setEsEdicionProducto(true);
    setProductoSelId(p.id);
    setVista('editar');
  };

  const verHistorial = (p) => {
    setProductoHistorial(p);
    setProductoSelId(p.id);
    setVista('historial');
  };

  const abrirAjusteDesdeModal = (cfg) => {
    setAjusteConfig({
      modo: cfg.modo || 'libre',
      tipo: cfg.tipo || 'entrada',
      departamento: cfg.departamento || null,
      departamentos: cfg.departamentos || [],
      borrador: cfg.borrador || null,
    });
    setVista('ajustes');
  };

  const aplicarFiltros = () => {
    setFiltros({ ...filtrosDraft });
    setMostrarFiltros(false);
  };

  const limpiarFiltros = () => {
    setFiltrosDraft(FILTROS_VACIOS);
    setFiltros(FILTROS_VACIOS);
  };

  const toggleFavorito = async (p) => {
    if (!supabase || !p?.id) return;
    const next = !Boolean(p.en_favoritos);
    const { error } = await supabase.from('productos').update({ en_favoritos: next }).eq('id', p.id);
    if (error) return alert(error.message);
    cargarDatos();
  };

  const vincularProveedor = async (provId, sku) => {
    if (!supabase || !productoSeleccionado?.id) return;
    const { error } = await supabase.from('proveedor_producto').insert([
      { proveedor_id: provId, producto_id: productoSeleccionado.id, sku_proveedor: sku?.trim() || null },
    ]);
    if (error) return alert(error.message);
    loadVinculos(productoSeleccionado.id);
  };

  const quitarVinculo = async (vinculoId) => {
    if (!supabase) return;
    await supabase.from('proveedor_producto').delete().eq('id', vinculoId);
    if (productoSeleccionado?.id) loadVinculos(productoSeleccionado.id);
  };

  const guardar = async () => {
    if (!supabase) return;
    const productoDb = (inventarioCompleto || inventario).find((p) => p.id === form.id);
    const payload = productoParaGuardar(form, { productoDb, sucursal });
    if (!payload.id || !payload.nombre) return alert('Código y nombre son obligatorios');
    const { error } = await supabase.from('productos').upsert([payload]);
    if (error) {
      const aviso = mensajeErrorColumnasProducto(error);
      return alert(aviso || error.message);
    }
    alert('Guardado. Catálogo actualizado para todas las tiendas; inventario aplicado a ' + tiendaLabel + '.');
    setProductoSelId(payload.id);
    cargarDatos();
    irLista();
  };

  const eliminar = async (id) => {
    if (!supabase) return;
    if (!puedeEliminarCatalogo) return alert('Solo un administrador puede eliminar productos del catálogo global.');
    if (!confirm('¿Eliminar producto del catálogo global? Desaparecerá en todas las tiendas.')) return;
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
    if (!puedeEliminarCatalogo) return alert('Solo un administrador puede eliminar productos del catálogo global.');
    const ids = [...seleccionEliminar];
    if (!ids.length) return alert('Marca al menos un producto.');
    if (!confirm(`¿Eliminar ${ids.length} producto(s) del catálogo global? Desaparecerán en todas las tiendas.`)) return;
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

  const proveedoresEnImport = useMemo(() => listarProveedoresEnFilas(importFilas), [importFilas]);

  const importFilasFiltradas = useMemo(() => {
    // Sin columna proveedor: importa todo el archivo
    if (!proveedoresEnImport.length) return importFilas;
    // Con proveedores: solo los marcados (vacío = ninguno)
    if (importProvSel.size === 0) return [];
    return filtrarFilasPorProveedores(importFilas, [...importProvSel]);
  }, [importFilas, importProvSel, proveedoresEnImport.length]);

  const prepararImportFilas = (filas, origenLabel) => {
    setImportFilas(filas);
    setImportNombre(origenLabel || '');
    const provs = listarProveedoresEnFilas(filas);
    if (provs.length) {
      setImportProvSel(new Set(provs.map((p) => p.nombre)));
      setImportAviso(
        `Listo: ${filas.length} producto(s) · ${provs.length} proveedor(es) detectado(s). Elige cuáles migrar y confirma.`,
      );
    } else {
      setImportProvSel(new Set());
      setImportAviso(
        `Listo: ${filas.length} producto(s). No hay columna «proveedor»; se importan al inventario sin vincular. Puedes agregar la columna y volver a cargar.`,
      );
    }
  };

  const elegirArchivoImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportAviso('Leyendo archivo…');
    const r = await leerArchivoCatalogo(file);
    e.target.value = '';
    if (!r.ok) {
      setImportFilas([]);
      setImportNombre('');
      setImportAviso('');
      setImportProvSel(new Set());
      return alert(r.error);
    }
    prepararImportFilas(r.filas, file.name);
  };

  const confirmarImport = async () => {
    if (!importFilas.length) return alert('No hay filas para importar.');
    const filas = importFilasFiltradas;
    if (!filas.length) return alert('No hay productos con los proveedores seleccionados.');
    const filtro = proveedoresEnImport.length ? [...importProvSel] : null;
    const msgFiltro = filtro?.length
      ? `\nProveedores (${filtro.length}): ${filtro.slice(0, 8).join(', ')}${filtro.length > 8 ? '…' : ''}`
      : '';
    if (!confirm(`¿Importar ${filas.length} producto(s) a la tienda ${sucursal || 'MAIN'}?${msgFiltro}\n\nSi el proveedor no existe en el POS, se crea y se vincula.`)) return;
    setImportando(true);
    const r = await importarCatalogoSupabase(supabase, importFilas, {
      sucursal,
      proveedoresFiltro: filtro,
    });
    setImportando(false);
    if (!r.ok) return alert(r.error);
    alert(r.mensaje || `Catálogo importado: ${r.count} producto(s).`);
    setImportFilas([]);
    setImportNombre('');
    setTextoPegado('');
    setImportAviso('');
    setImportProvSel(new Set());
    cargarDatos();
  };

  const pegarDesdePortapapeles = () => {
    const r = parsearTextoPegado(textoPegado);
    if (!r.ok) return alert(r.error);
    prepararImportFilas(r.filas, 'Pegado desde Excel');
  };

  const ejecutarVaciado = async () => {
    if (!puedeVaciarInventario) return alert('Solo Gerente o Administrador pueden vaciar inventario.');
    const opcion = OPCIONES_VACIADO.find((o) => o.id === alcanceVaciado);
    const msg =
      alcanceVaciado === 'global'
        ? `¿VACIAR inventario de TODAS las sucursales en ${inventarioCompleto?.length || inventario.length} producto(s)? Esta acción no se puede deshacer.`
        : `¿Vaciar inventario (${opcion?.label}) en ${inventarioCompleto?.length || inventario.length} producto(s)?`;
    if (!confirm(msg)) return;
    if (alcanceVaciado === 'global' && !confirm('Confirma de nuevo: se pondrá en CERO el stock en MAIN y todas las tiendas.')) return;
    setVaciando(true);
    const r = await vaciarInventario(supabase, {
      inventarioCompleto: inventarioCompleto || inventario,
      sucursal,
      alcance: alcanceVaciado,
      usuario: user?.nombre,
      motivo: motivoVaciado,
    });
    setVaciando(false);
    if (!r.ok) return alert(r.error);
    alert(r.mensaje);
    cargarDatos();
    setMotivoVaciado('');
  };

  const sinFotoCount = useMemo(
    () => (inventarioCompleto || inventario || []).filter((p) => !tieneFoto(p)).length,
    [inventario, inventarioCompleto],
  );

  const jalarFotosInternet = async () => {
    const base = inventarioCompleto || inventario || [];
    const pendientes = base.filter((p) => !tieneFoto(p));
    if (!pendientes.length) return alert('Todos los productos ya tienen foto (o no hay catálogo).');
    if (
      !confirm(
        `¿Buscar fotos en internet para ${pendientes.length} producto(s) sin imagen?\n\n` +
          'Usa Open Food Facts por código de barras. Puede tardar varios minutos; no cierres esta pestaña.',
      )
    ) {
      return;
    }
    setSincronizandoFotos(true);
    setProgresoFotos({ actual: 0, total: pendientes.length, actualizados: 0, sinFoto: 0 });
    const r = await sincronizarFotosCatalogo(supabase, base, {
      soloSinFoto: true,
      delayMs: 300,
      onProgress: (p) => setProgresoFotos(p),
    });
    setSincronizandoFotos(false);
    setProgresoFotos(null);
    if (!r.ok) return alert(r.error);
    alert(r.mensaje);
    cargarDatos();
  };

  const menuItems = [
    { id: 'alta', label: 'Nuevo producto', icon: 'plus', onClick: () => { setForm(empty); setEsEdicionProducto(false); setVista('alta'); } },
    { id: 'ajustes', label: 'Ajuste de inventario', icon: 'refresh', onClick: () => setModalAjusteOpen(true) },
    { id: 'traspaso', label: 'Traspasos', icon: 'truck', onClick: () => setVista('traspaso') },
    { id: 'etiquetas', label: 'Imprimir etiquetas', icon: 'print', onClick: () => { setEtiquetasSel(new Set()); setVista('etiquetas'); } },
    { id: 'importexport', label: 'Importar archivo .xls', icon: 'download', onClick: () => setVista('importexport') },
    { id: 'exportar', label: 'Exportar productos', icon: 'download', onClick: () => exportarCatalogoCsv(inventario) },
    {
      id: 'fotos',
      label: sincronizandoFotos
        ? `Jalar fotos… ${progresoFotos ? `${progresoFotos.actual}/${progresoFotos.total}` : ''}`
        : `Jalar fotos de internet${sinFotoCount ? ` (${sinFotoCount})` : ''}`,
      icon: 'camera',
      onClick: () => {
        if (!sincronizandoFotos) jalarFotosInternet();
      },
    },
    ...(puedeVaciarInventario
      ? [{ id: 'vaciarinventario', label: 'Vaciar inventario', icon: 'trash', onClick: () => setVista('vaciarinventario') }]
      : []),
    { id: 'precios', label: 'Administrador de precios', icon: 'dollar', onClick: () => { initPreciosDraft(); setVista('precios'); } },
    ...(puedeEliminarCatalogo
      ? [{ id: 'eliminar', label: 'Eliminar productos', icon: 'trash', onClick: () => { setSeleccionEliminar(new Set()); setVista('eliminar'); } }]
      : []),
  ];

  const tablaProductos = (opts = {}) => {
    const { selectable, onSelect, selected, onRowClick, showActions = true } = opts;
    const colCount = 5 + (enCentral ? 1 : 0) + (selectable ? 1 : 0) + (showActions ? 1 : 0);
    return (
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              {selectable && <th style={{ width: 36 }} />}
              <th>Código</th>
              <th>Nombre</th>
              <th>Precio</th>
              <th>Piso ({tiendaLabel})</th>
              {enCentral && <th>{etiquetaCedisEmpresa()}</th>}
              <th>Cat.</th>
              {showActions && <th />}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="muted">
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
                  <td>${Math.round(Number(p.precio) || 0)}</td>
                  <td>{p.stock}</td>
                  {enCentral && <td>{p.stock_cedis ?? 0}</td>}
                  <td>{etiquetaDepartamento(p.cat)}</td>
                  {showActions && (
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button type="button" className="btn btn-ghost" style={{ padding: '0.35rem 0.5rem', fontSize: '0.8rem' }} onClick={() => verHistorial(p)}>
                        Historial
                      </button>
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
    <div className={vista === 'lista' ? 'prod-page' : undefined} style={vista === 'lista' ? undefined : { display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="productos-toolbar">
        <div>
          <h2>{TITULOS_VISTA[vista] || 'Productos'}</h2>
          {vista === 'lista' && (
            <p className="muted" style={{ margin: '0.25rem 0 0', fontSize: '0.85rem' }}>
              {inventario.length} producto(s) · piso en <strong>{tiendaLabel}</strong>
              {enCentral && ' · CEDIS central en MAIN'}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {vista !== 'lista' && (
            <button type="button" className="btn btn-ghost" onClick={irLista}>
              <Icon name="home" size={16} />
              Volver al catálogo
            </button>
          )}
          {vista === 'lista' && productoSeleccionado && (
            <button type="button" className="btn btn-ghost" onClick={() => editar(productoSeleccionado)} title="Editar producto">
              <Icon name="settings" size={16} />
              Editar
            </button>
          )}
          <MenuPuntos items={menuItems} />
        </div>
      </div>

      {sincronizandoFotos && progresoFotos && (
        <div
          className="card"
          style={{
            margin: vista === 'lista' ? '0 0 0.75rem' : undefined,
            padding: '0.65rem 0.85rem',
            borderTop: '3px solid var(--brand-blue)',
            fontSize: '0.88rem',
          }}
        >
          Buscando fotos en internet… <strong>{progresoFotos.actual}</strong> / {progresoFotos.total}
          {' · '}encontradas {progresoFotos.actualizados}
          {progresoFotos.nombre ? (
            <span className="muted"> · {String(progresoFotos.nombre).slice(0, 48)}</span>
          ) : null}
        </div>
      )}

      {vista === 'lista' && (
        <div className="prod-master">
          <aside className="prod-lista-panel">
            <div className="prod-lista-toolbar">
              <div className="prod-search-row">
                <Icon name="search" size={16} />
                <input
                  className="input"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Buscar"
                  aria-label="Buscar productos"
                />
                <button
                  type="button"
                  className={`prod-filtro-btn ${mostrarFiltros || filtrosActivos ? 'activo' : ''}`}
                  onClick={() => {
                    setFiltrosDraft(filtros);
                    setMostrarFiltros((v) => !v);
                  }}
                  title="Filtros"
                >
                  <Icon name="settings" size={16} />
                  {filtrosActivos > 0 && <span className="prod-filtro-badge">{filtrosActivos}</span>}
                </button>
              </div>
              <button
                type="button"
                className="btn btn-success prod-add-btn"
                onClick={() => {
                  setForm(empty);
                  setEsEdicionProducto(false);
                  setVista('alta');
                }}
                title="Nuevo producto"
              >
                <Icon name="plus" size={20} />
              </button>
            </div>

            {mostrarFiltros && (
              <div className="prod-filtros-panel">
                <div className="prod-filtro-grupo">
                  <span className="muted">Tipo</span>
                  <div className="prod-chips">
                    {FILTROS_CHIP.tipo.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className={filtrosDraft.tipo === c.id ? 'activo' : ''}
                        onClick={() => setFiltrosDraft({ ...filtrosDraft, tipo: c.id })}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="prod-filtro-grupo">
                  <span className="muted">Favoritos</span>
                  <div className="prod-chips">
                    {FILTROS_CHIP.favoritos.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className={filtrosDraft.favoritos === c.id ? 'activo' : ''}
                        onClick={() => setFiltrosDraft({ ...filtrosDraft, favoritos: c.id })}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="prod-filtro-grupo">
                  <span className="muted">Existencia</span>
                  <div className="prod-chips">
                    {FILTROS_CHIP.existencia.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className={filtrosDraft.existencia === c.id ? 'activo' : ''}
                        onClick={() => setFiltrosDraft({ ...filtrosDraft, existencia: c.id })}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="prod-filtro-grupo">
                  <span className="muted">Disponible</span>
                  <div className="prod-chips">
                    {FILTROS_CHIP.disponible.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className={filtrosDraft.disponible === c.id ? 'activo' : ''}
                        onClick={() => setFiltrosDraft({ ...filtrosDraft, disponible: c.id })}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>
                <label className="muted" style={{ display: 'block', marginTop: '0.5rem' }}>
                  Departamentos
                  <select
                    className="select"
                    style={{ marginTop: '0.35rem' }}
                    value={filtrosDraft.departamento}
                    onChange={(e) => setFiltrosDraft({ ...filtrosDraft, departamento: e.target.value })}
                  >
                    <option value="">Todos</option>
                    {departamentos.map((d) => (
                      <option key={d} value={d}>
                        {etiquetaDepartamento(d)}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="prod-filtros-acciones">
                  <button type="button" className="btn btn-ghost" style={{ color: 'var(--brand-red)' }} onClick={limpiarFiltros}>
                    Limpiar ({filtrosActivos})
                  </button>
                  <button type="button" className="btn btn-primary" onClick={aplicarFiltros}>
                    Buscar
                  </button>
                </div>
              </div>
            )}

            <div className="prod-lista-scroll">
              {rows.length === 0 ? (
                <p className="muted" style={{ padding: '1rem', textAlign: 'center' }}>
                  Sin productos. Usa + para dar de alta o el menú ⋮ para importar.
                </p>
              ) : (
                rows.map((p) => {
                  const activo = productoSeleccionado?.id === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className={`prod-lista-item ${activo ? 'activo' : ''}`}
                      onClick={() => seleccionarProducto(p)}
                    >
                      <ProductoThumb producto={p} size={48} className="prod-lista-thumb" />
                      <div className="prod-lista-meta">
                        <div className="prod-lista-codigo">
                          <span className="muted">PZA</span> {p.id}
                        </div>
                        <div className="prod-lista-nombre">{p.nombre}</div>
                        <div className="prod-lista-stock">{Number(p.stock) || 0}</div>
                      </div>
                      <div className="prod-lista-precio">${Number(p.precio || 0).toFixed(2)}</div>
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          <section className="prod-detalle-panel card">
            <div className="prod-detalle-panel-head">
              <strong>Detalles del producto</strong>
              {productoSeleccionado && (
                <button type="button" className="btn btn-ghost" style={{ padding: '0.35rem' }} onClick={() => editar(productoSeleccionado)}>
                  <Icon name="settings" size={16} />
                </button>
              )}
            </div>
            <div className="prod-detalle-panel-body">
              <DetalleProducto
                producto={productoSeleccionado}
                supabase={supabase}
                sucursal={sucursal}
                proveedores={proveedores}
                vinculos={vinculos}
                onEditar={editar}
                onToggleFavorito={toggleFavorito}
                onVincularProveedor={vincularProveedor}
                onQuitarVinculo={quitarVinculo}
              />
            </div>
          </section>
        </div>
      )}

      <ModalAjusteInventario
        open={modalAjusteOpen}
        onClose={() => setModalAjusteOpen(false)}
        inventario={inventario}
        sucursal={sucursal}
        onElegir={abrirAjusteDesdeModal}
        onBorrarInventario={puedeVaciarInventario ? () => setVista('vaciarinventario') : undefined}
      />

      {(vista === 'alta' || vista === 'editar') && (
        <>
          <FormularioProducto
            form={form}
            setForm={setForm}
            departamentos={departamentos}
            esEdicion={esEdicionProducto}
            onDepartamentoAgregado={() => setTickDepartamentos((n) => n + 1)}
            onGuardar={guardar}
            onEliminar={puedeEliminarCatalogo ? () => eliminar(form.id) : undefined}
            onLimpiar={irLista}
            sucursal={sucursal}
          />
          {form.id.trim() && vista === 'editar' && (
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button type="button" className="btn btn-ghost" onClick={() => verHistorial(inventario.find((x) => x.id === form.id) || form)}>
                Ver historial (ventas y movimientos)
              </button>
            </div>
          )}
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
        <AjusteInventario
          key={`ajuste-${ajusteConfig.modo}-${ajusteConfig.tipo}-${ajusteConfig.departamento || ''}-${ajusteConfig.borrador?.id || ''}`}
          supabase={supabase}
          inventario={inventario}
          inventarioCompleto={inventarioCompleto || inventario}
          cargarDatos={cargarDatos}
          user={user}
          sucursal={sucursal}
          modoInicial={ajusteConfig.modo || 'libre'}
          tipoInicial={ajusteConfig.tipo || 'entrada'}
          departamentoInicial={ajusteConfig.departamento || null}
          borradorInicial={ajusteConfig.borrador || null}
          ocultarSelectorModo={
            Boolean(ajusteConfig.borrador) ||
            ajusteConfig.modo === 'departamento' ||
            ajusteConfig.modo === 'libre' ||
            ajusteConfig.modo === 'movimiento' ||
            ajusteConfig.modo === 'masivo'
          }
          onVolver={irLista}
        />
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
          <p className="muted" style={{ marginTop: 0, fontSize: '0.85rem' }}>
            <strong>Paso 1:</strong> Elige archivo · <strong>Paso 2:</strong> Revisa proveedores · <strong>Paso 3:</strong> Confirma.
            Acepta la plantilla del POS o el Excel de <strong>SICAR</strong> (<code>Plantilla_Productos.xlsx</code>: el campo <em>departamento</em> se usa como proveedor/marca).
            Si el proveedor no existe, se crea solo. <strong>existencia</strong> → stock de la tienda activa.
          </p>
          {importAviso && (
            <p style={{ margin: '0 0 0.75rem', padding: '0.6rem 0.75rem', borderRadius: 8, background: 'rgba(59,105,181,0.1)', color: 'var(--brand-blue)', fontSize: '0.88rem' }}>
              {importAviso}
            </p>
          )}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            <button type="button" className="btn btn-primary" onClick={descargarPlantillaExcel}>
              Plantilla Excel (.xlsx)
            </button>
            <button type="button" className="btn btn-ghost" onClick={descargarPlantillaCsv}>
              Plantilla CSV
            </button>
            <button type="button" className="btn btn-primary" onClick={() => fileImportRef.current?.click()}>
              Importar Excel / CSV
            </button>
            <button type="button" className="btn btn-gold" onClick={() => exportarCatalogoCsv(inventario)}>
              Exportar catálogo CSV
            </button>
            <input
              ref={fileImportRef}
              type="file"
              accept=".xlsx,.xls,.xlsm,.csv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              style={{ display: 'none' }}
              onChange={elegirArchivoImport}
            />
          </div>
          <details style={{ marginBottom: '1rem' }}>
            <summary className="muted" style={{ cursor: 'pointer' }}>Columnas de la plantilla</summary>
            <div className="table-wrap" style={{ marginTop: '0.5rem', maxHeight: '220px' }}>
              <table className="data">
                <thead>
                  <tr>
                    <th>Columna</th>
                    <th>Obligatoria</th>
                    <th>Descripción</th>
                  </tr>
                </thead>
                <tbody>
                  {COLUMNAS_CATALOGO.map((c) => (
                    <tr key={c.key}>
                      <td><code>{c.label}</code></td>
                      <td>{c.required ? 'Sí' : 'No'}</td>
                      <td className="muted" style={{ fontSize: '0.82rem' }}>{c.desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <label className="muted" style={{ display: 'block' }}>
            Pegar desde Excel (copiar filas con encabezados)
            <textarea
              className="input"
              rows={4}
              style={{ marginTop: '0.35rem', width: '100%', fontFamily: 'monospace', fontSize: '0.8rem' }}
              value={textoPegado}
              onChange={(e) => setTextoPegado(e.target.value)}
              placeholder="codigo,nombre,precio_venta,stock_piso…"
            />
          </label>
          <button type="button" className="btn btn-ghost" style={{ marginTop: '0.5rem' }} onClick={pegarDesdePortapapeles} disabled={!textoPegado.trim()}>
            Previsualizar pegado
          </button>
          {importFilas.length === 0 && (
            <p className="muted" style={{ marginTop: '1rem', fontSize: '0.85rem' }}>
              Tras elegir el archivo verás la vista previa aquí. Si no aparece nada, revisa que la columna <code>codigo</code> y <code>nombre</code> tengan datos.
            </p>
          )}
          {importFilas.length > 0 && (
            <>
              <p className="muted" style={{ marginTop: '1rem' }}>
                Vista previa: <strong>{importNombre}</strong> · {importFilas.length} en archivo
                {proveedoresEnImport.length > 0 ? ` · ${importFilasFiltradas.length} con filtro actual` : ''}
              </p>

              {proveedoresEnImport.length > 0 && (
                <div className="card" style={{ marginBottom: '0.75rem', padding: '0.75rem', background: 'rgba(59,105,181,0.06)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <strong style={{ color: 'var(--brand-blue)', fontSize: '0.9rem' }}>
                      Migrar por proveedor ({proveedoresEnImport.length})
                    </strong>
                    <span style={{ display: 'flex', gap: '0.35rem' }}>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ padding: '0.25rem 0.45rem', fontSize: '0.75rem' }}
                        onClick={() => setImportProvSel(new Set(proveedoresEnImport.map((p) => p.nombre)))}
                      >
                        Todos
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ padding: '0.25rem 0.45rem', fontSize: '0.75rem' }}
                        onClick={() => setImportProvSel(new Set())}
                      >
                        Ninguno
                      </button>
                    </span>
                  </div>
                  <p className="muted" style={{ margin: '0 0 0.5rem', fontSize: '0.8rem' }}>
                    Marca solo los proveedores que quieres pasar al POS. Los que no existan se crean automáticamente.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', maxHeight: 180, overflowY: 'auto' }}>
                    {proveedoresEnImport.map((p) => {
                      const checked = importProvSel.has(p.nombre);
                      return (
                        <label key={p.nombre} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', cursor: 'pointer', fontSize: '0.88rem' }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setImportProvSel((prev) => {
                                const next = new Set(prev);
                                if (next.has(p.nombre)) next.delete(p.nombre);
                                else next.add(p.nombre);
                                return next;
                              });
                            }}
                          />
                          <span style={{ flex: 1 }}>{p.nombre}</span>
                          <span className="muted">{p.count} prod.</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="table-wrap" style={{ maxHeight: '280px', marginBottom: '0.75rem' }}>
                <table className="data">
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Nombre</th>
                      <th>Proveedor</th>
                      <th>Categoría</th>
                      <th>P. venta</th>
                      <th>Piso</th>
                      <th>En venta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importFilasFiltradas.slice(0, 50).map((f) => (
                      <tr key={`${f.id}-${f.proveedor || ''}`}>
                        <td>{f.id}</td>
                        <td>{f.nombre}</td>
                        <td>{f.proveedor || '—'}</td>
                        <td>{f.cat}</td>
                        <td>${Number(f.precio).toFixed(2)}</td>
                        <td>{f.stock_piso}</td>
                        <td>{f.en_venta ? 'Sí' : 'No'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {importFilasFiltradas.length > 50 && (
                <p className="muted" style={{ fontSize: '0.82rem' }}>Mostrando 50 de {importFilasFiltradas.length} filas.</p>
              )}
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-success" onClick={confirmarImport} disabled={importando || !importFilasFiltradas.length}>
                  {importando ? 'Importando…' : `Confirmar importación (${importFilasFiltradas.length})`}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    setImportFilas([]);
                    setImportNombre('');
                    setTextoPegado('');
                    setImportProvSel(new Set());
                    setImportAviso('');
                  }}
                >
                  Cancelar
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {vista === 'vaciarinventario' && puedeVaciarInventario && (
        <div className="card" style={{ borderTop: '4px solid var(--brand-red)' }}>
          <p className="muted" style={{ marginTop: 0 }}>
            Pone en <strong>cero</strong> el inventario seleccionado. Se registra en el historial de movimientos (Consultas → Consulta producto).
            Tienda activa: <strong>{sucursal || 'MAIN'}</strong> · {inventarioCompleto?.length || inventario.length} producto(s).
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
            {OPCIONES_VACIADO.map((o) => (
              <label key={o.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', cursor: 'pointer' }}>
                <input type="radio" name="alcanceVaciado" value={o.id} checked={alcanceVaciado === o.id} onChange={() => setAlcanceVaciado(o.id)} style={{ marginTop: '0.25rem' }} />
                <span>
                  <strong>{o.label}</strong>
                  <span className="muted" style={{ display: 'block', fontSize: '0.82rem' }}>{o.desc}</span>
                </span>
              </label>
            ))}
          </div>
          <label className="muted" style={{ display: 'block' }}>
            Motivo (opcional)
            <input className="input" style={{ marginTop: '0.35rem' }} value={motivoVaciado} onChange={(e) => setMotivoVaciado(e.target.value)} placeholder="Conteo anual, cambio de sistema…" />
          </label>
          <button type="button" className="btn btn-danger" style={{ marginTop: '1rem' }} onClick={ejecutarVaciado} disabled={vaciando}>
            {vaciando ? 'Vaciando…' : 'Vaciar inventario ahora'}
          </button>
        </div>
      )}

      {vista === 'historial' && productoHistorial && (
        <HistorialProducto
          supabase={supabase}
          producto={productoHistorial}
          sucursal={sucursal}
          onVolver={() => {
            setProductoHistorial(null);
            setVista('lista');
          }}
        />
      )}

      {vista === 'precios' && (
        <div className="card">
          <p className="muted" style={{ marginTop: 0 }}>
            Edita precios de venta para todo el catálogo (aplican en todas las tiendas) y guarda los cambios.
          </p>
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

      {vista === 'eliminar' && puedeEliminarCatalogo && (
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
