import React, { useEffect, useMemo, useRef, useState } from 'react';
import { etiquetaDepartamento, listarDepartamentos } from '../lib/departamentos.js';
import {
  PROVEEDOR_CEDIS_NOMBRE,
  aplicaFiltroCatalogoCedis,
  asegurarVinculosCatalogoCedis,
  filtrarInventarioCatalogoCedis,
  listarDepartamentosCatalogoCedis,
  departamentoFiltroCoincideCedis,
} from '../lib/catalogoCedis.js';
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
import { vaciarInventario, opcionesVaciado } from '../lib/borrarInventario.js';
import { registrarCambioPrecio, leerProductoInventarioFresco } from '../lib/inventarioMovimientos.js';
import { mensajeErrorColumnasProducto, productoDesdeDb, productoParaGuardar, productoVacio } from '../lib/productoForm.js';
import { codigoOcupadoPorOtro, normalizarCodigosAlt } from '../lib/buscarProductoTexto.js';
import {
  puedeCrearProveedor,
  puedeEliminarProductosCatalogo,
  puedeGestionarInventarioMultitienda,
  puedeConsolidarVentasInventario,
  puedeEditarCatalogoProductos,
  puedeAjustarInventario,
  puedeTraspasarInventario,
  puedeHacerPreinventario,
  esRolMostradorRestringido,
  puedeVerStockNegativo,
} from '../lib/roles.js';
import FormularioProducto from '../components/FormularioProducto.jsx';
import MenuPuntos from '../components/MenuPuntos.jsx';
import Icon from '../components/Icon.jsx';
import CampoCodigo from '../components/CampoCodigo.jsx';
import DetalleProducto from '../components/DetalleProducto.jsx';
import ModalAjusteInventario from '../components/ModalAjusteInventario.jsx';
import ProductoThumb from '../components/ProductoThumb.jsx';
import MoverProductosLote from '../components/MoverProductosLote.jsx';
import { imprimirEtiquetasEstante } from '../lib/impresion.js';
import AjusteInventario from './AjusteInventario.jsx';
import Traspasos from './Traspasos.jsx';
import Preinventario from './Preinventario.jsx';
import HistorialProducto from '../components/HistorialProducto.jsx';
import ConsolidarVentasInventario from '../components/ConsolidarVentasInventario.jsx';
import { etiquetaTienda } from '../constants/sucursales.js';
import { esAlmacenCentral, etiquetaCedisEmpresa, etiquetaStockLista, stockVisible } from '../lib/inventarioMultitienda.js';
import { fmtMxn, resumirValorInventario } from '../lib/valorInventario.js';
import { sincronizarFotosCatalogo, tieneFoto } from '../lib/fotosCatalogo.js';
import { productoCoincideBusqueda, productoPorCodigoExacto } from '../lib/buscarProductoTexto.js';

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
  proveedor: '',
};

const TITULOS_VISTA = {
  lista: 'Producto',
  alta: 'Nuevo producto',
  editar: 'Editar producto',
  ajustes: 'Ajuste de inventario',
  traspaso: 'Traspasos',
  preinventario: 'Preinventario',
  mover: 'Mover productos',
  etiquetas: 'Etiquetas de estante',
  importexport: 'Importar / Exportar',
  vaciarinventario: 'Vaciar inventario',
  historial: 'Historial del producto',
  precios: 'Administrador de precios',
  eliminar: 'Eliminar productos',
};

export default function Productos({ supabase, inventario, inventarioCompleto, cargarDatos, fusionarProducto, user, sucursal, consolaCentral = false }) {
  const [vista, setVista] = useState('lista');
  const [form, setForm] = useState(empty);
  const [q, setQ] = useState('');
  const [proveedores, setProveedores] = useState([]);
  const [vinculos, setVinculos] = useState([]);
  /** Map proveedor_id → Set(producto_id) para filtrar el catálogo. */
  const [productosPorProveedor, setProductosPorProveedor] = useState(() => new Map());
  const [idsConProveedor, setIdsConProveedor] = useState(() => new Set());
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
  const [preciosQ, setPreciosQ] = useState('');
  const [preciosDepto, setPreciosDepto] = useState('');
  const [preciosProveedor, setPreciosProveedor] = useState('');
  const preciosBuscarRef = useRef(null);
  const preciosFilaRefs = useRef(new Map());
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
  const puedeConsolidar = puedeConsolidarVentasInventario(user?.rol);
  const puedeEliminarCatalogo = puedeEliminarProductosCatalogo(user?.rol);
  /** Cajero: consulta de catálogo + ingreso/ajuste, traspasos y preinventario (sin editar productos). */
  const esCajero = esRolMostradorRestringido(user?.rol);
  const puedeGestionCatalogo = puedeEditarCatalogoProductos(user?.rol);
  const puedeAjustes = puedeAjustarInventario(user?.rol);
  /** En MAIN/CEDIS el surtido va por Venta en Ruta — se ocultan traspasos en este flujo. */
  const puedeTraspasos = puedeTraspasarInventario(user?.rol) && !esAlmacenCentral(sucursal);
  const puedePreinventario = puedeHacerPreinventario(user?.rol);
  const verNegativos = puedeVerStockNegativo(user?.rol);
  const tiendaLabel = sucursal ? etiquetaTienda(sucursal) : 'MAIN';
  const enCentral = esAlmacenCentral(sucursal);
  /** Solo CEDIS: recorta la vista. Tiendas y MAIN siguen con catálogo completo. */
  const filtroCatalogoCedis = aplicaFiltroCatalogoCedis(sucursal);
  const [proveedorCedisId, setProveedorCedisId] = useState(null);
  const [avisoCatalogoCedis, setAvisoCatalogoCedis] = useState('');
  const vinculosCedisOnceRef = useRef(false);

  const idsProveedorCedis = useMemo(() => {
    if (!filtroCatalogoCedis || !proveedorCedisId) return null;
    return productosPorProveedor.get(String(proveedorCedisId)) || new Set();
  }, [filtroCatalogoCedis, proveedorCedisId, productosPorProveedor]);

  /** Inventario mostrado en listas CEDIS (no muta el catálogo global). */
  const inventarioVista = useMemo(() => {
    if (!filtroCatalogoCedis) return inventario || [];
    // Hasta resolver proveedor, mostrar solo deptos; luego exigir vínculo CEDIS LAS 3B.
    return filtrarInventarioCatalogoCedis(inventario, {
      idsProveedorCedis,
      exigirProveedor: Boolean(proveedorCedisId),
    });
  }, [filtroCatalogoCedis, inventario, idsProveedorCedis, proveedorCedisId]);

  const chipsExistencia = useMemo(
    () => (verNegativos ? FILTROS_CHIP.existencia : FILTROS_CHIP.existencia.filter((c) => c.id !== 'negativa')),
    [verNegativos],
  );
  const negativosCount = useMemo(() => {
    if (!verNegativos) return 0;
    return (inventarioVista || []).filter((p) => {
      if (Number(p.stock) < 0) return true;
      if (enCentral && Number(p.stock_cedis) < 0) return true;
      return false;
    }).length;
  }, [verNegativos, inventarioVista, enCentral]);
  const resumenInv = useMemo(
    () => (consolaCentral ? resumirValorInventario(inventarioVista) : null),
    [consolaCentral, inventarioVista],
  );

  const departamentos = useMemo(() => {
    if (filtroCatalogoCedis) return listarDepartamentosCatalogoCedis();
    return listarDepartamentos(inventario);
  }, [filtroCatalogoCedis, inventario, tickDepartamentos]);

  useEffect(() => {
    if (vista === 'eliminar' && !puedeEliminarCatalogo) setVista('lista');
  }, [vista, puedeEliminarCatalogo]);

  useEffect(() => {
    if (vista === 'traspaso' && !puedeTraspasos) setVista('lista');
  }, [vista, puedeTraspasos]);

  useEffect(() => {
    if (!esCajero) return;
    const vistasCajero = new Set(['lista', 'historial', 'ajustes', 'traspaso', 'preinventario']);
    if (!vistasCajero.has(vista)) setVista('lista');
  }, [esCajero, vista]);

  useEffect(() => {
    if (verNegativos) return;
    if (filtros.existencia === 'negativa' || filtrosDraft.existencia === 'negativa') {
      setFiltros((f) => ({ ...f, existencia: 'todo' }));
      setFiltrosDraft((f) => ({ ...f, existencia: 'todo' }));
    }
  }, [verNegativos, filtros.existencia, filtrosDraft.existencia]);

  useEffect(() => {
    if (!supabase) return;
    (async () => {
      const { data } = await supabase.from('proveedores').select('id, nombre').order('nombre');
      setProveedores(data || []);
    })();
  }, [supabase]);

  const cargarMapaProveedores = async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from('proveedor_producto').select('proveedor_id, producto_id');
    if (error) {
      setProductosPorProveedor(new Map());
      setIdsConProveedor(new Set());
      return;
    }
    const map = new Map();
    const todos = new Set();
    for (const row of data || []) {
      const prov = String(row.proveedor_id ?? '').trim();
      const prod = String(row.producto_id ?? '').trim();
      if (!prov || !prod) continue;
      if (!map.has(prov)) map.set(prov, new Set());
      map.get(prov).add(prod);
      todos.add(prod);
    }
    setProductosPorProveedor(map);
    setIdsConProveedor(todos);
  };

  useEffect(() => {
    void cargarMapaProveedores();
  }, [supabase]);

  // CEDIS: vincular deptos del catálogo al proveedor CEDIS LAS 3B (solo proveedor_producto).
  useEffect(() => {
    if (!filtroCatalogoCedis || !supabase) {
      setProveedorCedisId(null);
      setAvisoCatalogoCedis('');
      vinculosCedisOnceRef.current = false;
      return;
    }
    let cancel = false;
    (async () => {
      const base = inventarioCompleto || inventario || [];
      if (!base.length) return;
      if (vinculosCedisOnceRef.current) return;
      vinculosCedisOnceRef.current = true;
      const res = await asegurarVinculosCatalogoCedis(supabase, base);
      if (cancel) return;
      if (!res.ok) {
        setAvisoCatalogoCedis(res.error || 'No se pudieron vincular productos a CEDIS LAS 3B.');
        return;
      }
      setProveedorCedisId(res.proveedorId || null);
      if (res.vinculados > 0) {
        setAvisoCatalogoCedis(
          `Catálogo CEDIS: ${res.vinculados} producto(s) vinculados a «${PROVEEDOR_CEDIS_NOMBRE}».`,
        );
      } else {
        setAvisoCatalogoCedis(
          `Catálogo CEDIS: solo ${listarDepartamentosCatalogoCedis().join(', ')} · proveedor «${PROVEEDOR_CEDIS_NOMBRE}».`,
        );
      }
      await cargarMapaProveedores();
    })();
    return () => {
      cancel = true;
    };
  }, [filtroCatalogoCedis, supabase, inventarioCompleto, inventario]);

  const rows = useMemo(() => {
    const t = q.trim();
    let list = inventarioVista || [];
    if (t) {
      list = list.filter((p) => productoCoincideBusqueda(p, t));
    }
    if (filtros.departamento) {
      list = list.filter((p) =>
        filtroCatalogoCedis
          ? departamentoFiltroCoincideCedis(p.cat, filtros.departamento)
          : String(p.cat || '').toUpperCase() === filtros.departamento.toUpperCase(),
      );
    }
    if (filtros.proveedor === '__ninguno__') {
      list = list.filter((p) => !idsConProveedor.has(String(p.id)));
    } else if (filtros.proveedor) {
      const ids = productosPorProveedor.get(String(filtros.proveedor));
      list = list.filter((p) => ids?.has(String(p.id)));
    }
    if (filtros.favoritos === 'si') list = list.filter((p) => Boolean(p.en_favoritos) || p.cat === 'FAVORITOS');
    if (filtros.favoritos === 'no') list = list.filter((p) => !p.en_favoritos && p.cat !== 'FAVORITOS');
    if (filtros.existencia === 'si') {
      list = list.filter((p) => {
        if (enCentral) return Number(p.stock_cedis) > 0 || Number(p.stock) > 0;
        return Number(p.stock) > 0;
      });
    }
    if (filtros.existencia === 'no') {
      list = list.filter((p) => {
        if (enCentral) return Number(p.stock_cedis) <= 0 && Number(p.stock) <= 0;
        // Cajero/repartidor: negativo se ve como 0 → entra en “sin existencia”
        if (!verNegativos) return Number(p.stock) <= 0;
        return Number(p.stock) === 0;
      });
    }
    if (filtros.existencia === 'negativa') {
      if (!verNegativos) list = [];
      else {
        list = list.filter((p) => {
          if (Number(p.stock) < 0) return true;
          if (enCentral && Number(p.stock_cedis) < 0) return true;
          return false;
        });
      }
    }
    if (filtros.disponible === 'si') list = list.filter((p) => p.en_venta !== false);
    if (filtros.disponible === 'no') list = list.filter((p) => p.en_venta === false);
    return list;
  }, [inventarioVista, q, filtros, productosPorProveedor, idsConProveedor, enCentral, verNegativos, filtroCatalogoCedis]);

  const rowsPrecios = useMemo(() => {
    const t = preciosQ.trim();
    let list = inventarioVista || [];
    if (t) list = list.filter((p) => productoCoincideBusqueda(p, t));
    if (preciosDepto) {
      list = list.filter((p) =>
        filtroCatalogoCedis
          ? departamentoFiltroCoincideCedis(p.cat, preciosDepto)
          : String(p.cat || '').toUpperCase() === preciosDepto.toUpperCase(),
      );
    }
    if (preciosProveedor === '__ninguno__') {
      list = list.filter((p) => !idsConProveedor.has(String(p.id)));
    } else if (preciosProveedor) {
      const ids = productosPorProveedor.get(String(preciosProveedor));
      list = list.filter((p) => ids?.has(String(p.id)));
    }
    return list;
  }, [inventarioVista, preciosQ, preciosDepto, preciosProveedor, productosPorProveedor, idsConProveedor, filtroCatalogoCedis]);

  const preciosFiltrosActivos = Boolean(preciosQ.trim() || preciosDepto || preciosProveedor);

  useEffect(() => {
    if (vista !== 'precios') return;
    const t = window.setTimeout(() => preciosBuscarRef.current?.focus?.(), 80);
    return () => window.clearTimeout(t);
  }, [vista]);

  const enfocarProductoPrecios = (productoId) => {
    const id = String(productoId || '');
    window.requestAnimationFrame(() => {
      const el = preciosFilaRefs.current.get(id);
      el?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
      const input = el?.querySelector?.('input[type="number"]');
      input?.focus?.();
      input?.select?.();
    });
  };

  const productoSeleccionado = useMemo(() => {
    if (!productoSelId) return rows[0] || inventarioVista?.[0] || null;
    return (inventarioVista || []).find((p) => p.id === productoSelId) || rows[0] || null;
  }, [inventarioVista, productoSelId, rows]);

  useEffect(() => {
    if (!productoSelId && rows[0]) setProductoSelId(rows[0].id);
    else if (productoSelId && !(inventarioVista || []).some((p) => p.id === productoSelId) && rows[0]) {
      setProductoSelId(rows[0].id);
    }
  }, [rows, inventarioVista, productoSelId]);

  const filtrosActivos = useMemo(() => {
    let n = 0;
    if (filtros.favoritos !== 'todo') n += 1;
    if (filtros.existencia !== 'todo') n += 1;
    if (filtros.disponible !== 'todo') n += 1;
    if (filtros.departamento) n += 1;
    if (filtros.proveedor) n += 1;
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
    if (!puedeGestionCatalogo) return alert('Tu rol no puede editar productos.');
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
    void cargarMapaProveedores();
  };

  const quitarVinculo = async (vinculoId) => {
    if (!supabase) return;
    await supabase.from('proveedor_producto').delete().eq('id', vinculoId);
    if (productoSeleccionado?.id) loadVinculos(productoSeleccionado.id);
    void cargarMapaProveedores();
  };

  const guardar = async () => {
    if (!puedeGestionCatalogo) return alert('Tu rol no puede crear ni editar productos.');
    if (!supabase) return;
    let productoDb = (inventarioCompleto || inventario).find((p) => p.id === form.id);
    if (form.id?.trim()) {
      const fresco = await leerProductoInventarioFresco(supabase, form.id.trim());
      if (fresco.ok) productoDb = fresco.producto;
    }
    const payload = productoParaGuardar(form, { productoDb, sucursal });
    if (!payload.id || !payload.nombre) return alert('Código y nombre son obligatorios');
    const catalogo = inventarioCompleto || inventario || [];
    for (const alt of normalizarCodigosAlt(payload.codigos_alt)) {
      const choque = codigoOcupadoPorOtro(catalogo, alt, payload.id);
      if (choque.ocupado) {
        return alert(
          `El código alterno «${alt}» ya pertenece a «${choque.producto?.nombre || choque.producto?.id}»` +
            (choque.como === 'id' ? ' (código principal).' : ' (código alterno).'),
        );
      }
    }
    const choqueId = codigoOcupadoPorOtro(catalogo, payload.id, esEdicionProducto ? payload.id : null);
    if (!esEdicionProducto && choqueId.ocupado) {
      return alert(
        `El código «${payload.id}» ya está en «${choqueId.producto?.nombre || choqueId.producto?.id}».`,
      );
    }
    let { data: saved, error } = await supabase.from('productos').upsert([payload]).select('*').single();
    if (error && String(error.message || '').includes('codigos_alt')) {
      const { codigos_alt: _omit, ...sinAlt } = payload;
      const retry = await supabase.from('productos').upsert([sinAlt]).select('*').single();
      if (!retry.error) {
        alert(
          'Guardado sin códigos alternos: falta la columna en Supabase.\nEjecuta: supabase/fix_productos_codigos_alt.sql',
        );
        saved = retry.data;
        error = null;
      } else {
        error = retry.error;
      }
    }
    if (error) {
      const aviso = mensajeErrorColumnasProducto(error);
      return alert(aviso || error.message);
    }
    alert('Guardado. Catálogo actualizado para todas las tiendas; inventario aplicado a ' + tiendaLabel + '.');
    const row = saved || payload;
    fusionarProducto?.(row);
    setProductoSelId(row.id);
    setQ(String(row.id));
    setFiltros(FILTROS_VACIOS);
    setFiltrosDraft(FILTROS_VACIOS);
    if (typeof cargarDatos === 'function') await cargarDatos();
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
    setPreciosQ('');
    setPreciosDepto('');
    setPreciosProveedor('');
  };

  const guardarPrecios = async () => {
    if (!puedeGestionCatalogo) return alert('Tu rol no puede cambiar precios.');
    if (!supabase) return;
    const cambios = Object.entries(preciosDraft).filter(([id, v]) => {
      const p = inventario.find((x) => x.id === id);
      return p && Number(v) !== Number(p.precio);
    });
    if (!cambios.length) return alert('No hay cambios de precio.');
    if (!confirm(`¿Actualizar precio de ${cambios.length} producto(s)?`)) return;
    setGuardandoPrecios(true);
    for (const [id, precio] of cambios) {
      const p = inventario.find((x) => x.id === id);
      const precioAntes = Number(p?.precio) || 0;
      const precioDespues = Number(precio) || 0;
      const { error } = await supabase.from('productos').update({ precio: precioDespues }).eq('id', id);
      if (error) {
        setGuardandoPrecios(false);
        return alert(error.message);
      }
      await registrarCambioPrecio(supabase, {
        producto_id: id,
        producto_nombre: p?.nombre || id,
        precio_antes: precioAntes,
        precio_despues: precioDespues,
        usuario: user?.nombre || '—',
        sucursal,
      });
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
    if (!puedeGestionCatalogo) return alert('Tu rol no puede importar el catálogo.');
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

  const opcionesVaciadoTienda = useMemo(() => opcionesVaciado(sucursal), [sucursal]);

  const ejecutarVaciado = async () => {
    if (!puedeVaciarInventario) return alert('Solo Gerente o Administrador pueden vaciar inventario.');
    const nProds = inventarioCompleto?.length || inventario.length;
    const opcion = opcionesVaciadoTienda.find((o) => o.id === alcanceVaciado);
    const msg =
      alcanceVaciado === 'global'
        ? `¿VACIAR inventario de TODAS las sucursales (${nProds} producto(s))?\n\nSe pondrá en CERO el CEDIS central y el piso de ${tiendaLabel} y de todas las demás tiendas.\nEsta acción no se puede deshacer.`
        : alcanceVaciado === 'cedis'
          ? `¿Vaciar ${opcion?.label} en ${nProds} producto(s)?\n\nNo se modifica el piso de ${tiendaLabel} ni de otras tiendas.`
          : `¿Vaciar inventario de «${tiendaLabel}»?\n\nAlcance: ${opcion?.label}\nProductos: ${nProds}\n\nSolo afecta el inventario de esta tienda.`;
    if (!confirm(msg)) return;
    if (
      alcanceVaciado === 'global' &&
      !confirm(`Confirma de nuevo: se pondrá en CERO el stock en CEDIS, ${tiendaLabel} y TODAS las tiendas.`)
    ) {
      return;
    }
    setVaciando(true);
    const r = await vaciarInventario(supabase, {
      inventarioCompleto: inventarioCompleto || inventario,
      sucursal,
      alcance: alcanceVaciado,
      usuario: user?.nombre,
      motivo: motivoVaciado,
      rol: user?.rol,
    });
    setVaciando(false);
    if (!r.ok) return alert(r.error);
    alert(
      alcanceVaciado === 'global'
        ? r.mensaje
        : `${r.mensaje}\nTienda: ${tiendaLabel}`,
    );
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
          'Usa Open Food Facts (código y nombre). Puede tardar varios minutos; no cierres esta pestaña.',
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

  const menuItems = esCajero
    ? [
        ...(puedeAjustes
          ? [{ id: 'ajustes', label: 'Ajuste de inventario', icon: 'refresh', onClick: () => setModalAjusteOpen(true) }]
          : []),
        ...(puedeTraspasos
          ? [{ id: 'traspaso', label: 'Traspasos', icon: 'truck', onClick: () => setVista('traspaso') }]
          : []),
        ...(puedePreinventario
          ? [{ id: 'preinventario', label: 'Preinventario', icon: 'package', onClick: () => setVista('preinventario') }]
          : []),
      ]
    : [
        ...(puedeGestionCatalogo
          ? [{ id: 'alta', label: 'Nuevo producto', icon: 'plus', onClick: () => { setForm(empty); setEsEdicionProducto(false); setVista('alta'); } }]
          : []),
        ...(puedeAjustes
          ? [{ id: 'ajustes', label: 'Ajuste de inventario', icon: 'refresh', onClick: () => setModalAjusteOpen(true) }]
          : []),
        ...(puedeTraspasos
          ? [{ id: 'traspaso', label: 'Traspasos', icon: 'truck', onClick: () => setVista('traspaso') }]
          : []),
        ...(puedePreinventario
          ? [{ id: 'preinventario', label: 'Preinventario', icon: 'package', onClick: () => setVista('preinventario') }]
          : []),
        ...(puedeGestionCatalogo
          ? [{ id: 'mover', label: 'Mover productos (proveedor / depto)', icon: 'refresh', onClick: () => setVista('mover') }]
          : []),
        { id: 'etiquetas', label: 'Imprimir etiquetas', icon: 'print', onClick: () => { setEtiquetasSel(new Set()); setVista('etiquetas'); } },
        ...(puedeGestionCatalogo
          ? [
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
            ]
          : []),
        ...(puedeVaciarInventario
          ? [{ id: 'vaciarinventario', label: `Vaciar inventario · ${tiendaLabel}`, icon: 'trash', onClick: () => setVista('vaciarinventario') }]
          : []),
        ...(puedeGestionCatalogo
          ? [{ id: 'precios', label: 'Administrador de precios', icon: 'dollar', onClick: () => { initPreciosDraft(); setVista('precios'); } }]
          : []),
        ...(puedeConsolidar
          ? [{ id: 'consolidar', label: 'Inventario vs ventas del día', icon: 'refresh', onClick: () => setVista('consolidar') }]
          : []),
        ...(verNegativos
          ? [
              {
                id: 'negativos',
                label: negativosCount > 0 ? `Inventario negativo (${negativosCount})` : 'Inventario negativo',
                icon: 'package',
                onClick: () => {
                  const next = { ...FILTROS_VACIOS, existencia: 'negativa' };
                  setFiltros(next);
                  setFiltrosDraft(next);
                  setQ('');
                  setMostrarFiltros(false);
                  setVista('lista');
                },
              },
            ]
          : []),
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
                  <td>
                    <div>{p.id}</div>
                    {normalizarCodigosAlt(p.codigos_alt).length > 0 && (
                      <div className="muted" style={{ fontSize: '0.72rem', marginTop: 2 }}>
                        + {normalizarCodigosAlt(p.codigos_alt).join(' · ')}
                      </div>
                    )}
                  </td>
                  <td>{p.nombre}</td>
                  <td>${Math.round(Number(p.precio) || 0)}</td>
                  <td style={verNegativos && Number(p.stock) < 0 ? { color: 'var(--brand-red)', fontWeight: 700 } : undefined}>
                    {stockVisible(p.stock, verNegativos)}
                  </td>
                  {enCentral && (
                    <td style={verNegativos && Number(p.stock_cedis) < 0 ? { color: 'var(--brand-red)', fontWeight: 700 } : undefined}>
                      {stockVisible(p.stock_cedis, verNegativos)}
                    </td>
                  )}
                  <td>{etiquetaDepartamento(p.cat)}</td>
                  {showActions && (
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button type="button" className="btn btn-ghost" style={{ padding: '0.35rem 0.5rem', fontSize: '0.8rem' }} onClick={() => verHistorial(p)}>
                        Historial
                      </button>
                      {puedeGestionCatalogo && (
                        <button type="button" className="btn btn-ghost" style={{ padding: '0.35rem 0.5rem', fontSize: '0.8rem' }} onClick={() => editar(p)}>
                          Editar
                        </button>
                      )}
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
          <h2>
            {vista === 'ajustes'
              ? ajusteConfig.modo === 'masivo' && ajusteConfig.tipo === 'retiro'
                ? 'Retiro de inventario'
                : ajusteConfig.modo === 'masivo'
                  ? 'Ingreso de inventarios'
                  : 'Ajuste de inventario'
              : vista === 'vaciarinventario'
                ? `Vaciar inventario · ${tiendaLabel}`
                : TITULOS_VISTA[vista] || 'Productos'}
          </h2>
          {vista === 'lista' && (
            <p className="muted" style={{ margin: '0.25rem 0 0', fontSize: '0.85rem' }}>
              {filtroCatalogoCedis ? inventarioVista.length : inventario.length} producto(s)
              {filtroCatalogoCedis
                ? ` · catálogo CEDIS · ${PROVEEDOR_CEDIS_NOMBRE}`
                : <> · piso en <strong>{tiendaLabel}</strong></>}
              {enCentral && !filtroCatalogoCedis && ' · CEDIS central en MAIN'}
              {consolaCentral && resumenInv && (
                <>
                  {' · '}
                  <strong>{resumenInv.unidades.toLocaleString('es-MX')}</strong> u · {fmtMxn(resumenInv.valorVenta)}
                  {resumenInv.skusConStock > 0 && (
                    <span className="muted"> ({resumenInv.skusConStock} con stock)</span>
                  )}
                </>
              )}
            </p>
          )}
          {filtroCatalogoCedis && avisoCatalogoCedis && (
            <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.78rem' }}>
              {avisoCatalogoCedis}
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
          {vista === 'lista' && productoSeleccionado && puedeGestionCatalogo && (
            <button type="button" className="btn btn-ghost" onClick={() => editar(productoSeleccionado)} title="Editar producto">
              <Icon name="settings" size={16} />
              Editar
            </button>
          )}
          {vista === 'lista' && verNegativos && (
            <button
              type="button"
              className={filtros.existencia === 'negativa' ? 'btn btn-primary' : 'btn btn-ghost'}
              title="Solo productos con inventario teórico negativo"
              onClick={() => {
                if (filtros.existencia === 'negativa') {
                  setFiltros(FILTROS_VACIOS);
                  setFiltrosDraft(FILTROS_VACIOS);
                  return;
                }
                const next = { ...FILTROS_VACIOS, existencia: 'negativa' };
                setFiltros(next);
                setFiltrosDraft(next);
                setQ('');
                setMostrarFiltros(false);
              }}
              style={negativosCount > 0 && filtros.existencia !== 'negativa' ? { borderColor: 'var(--brand-red)', color: 'var(--brand-red)' } : undefined}
            >
              Negativos{negativosCount > 0 ? ` (${negativosCount})` : ''}
            </button>
          )}
          {menuItems.length > 0 && <MenuPuntos items={menuItems} />}
          {esCajero && (
            <span className="muted" style={{ fontSize: '0.8rem' }}>
              Catálogo solo consulta · sí a ingreso, traspasos y preinventario
            </span>
          )}
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
              <div className="prod-search-row" style={{ flexWrap: 'wrap', gap: '0.35rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flex: '1 1 160px', minWidth: 0 }}>
                  <Icon name="search" size={16} />
                  <CampoCodigo
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    onEscanear={(codigo) => {
                      const c = String(codigo || '').trim();
                      setFiltros(FILTROS_VACIOS);
                      setFiltrosDraft(FILTROS_VACIOS);
                      const exacto = productoPorCodigoExacto(inventario, c);
                      if (exacto) {
                        setQ(String(exacto.id));
                        seleccionarProducto(exacto);
                        return;
                      }
                      setQ(c);
                      alert(`No se encontró el producto con código ${c} en el catálogo.`);
                    }}
                    beepAlEnter
                    placeholder="Buscar o escanear con cámara…"
                    tituloCamara="Buscar producto en catálogo"
                    inputStyle={{ flex: 1, minWidth: 0 }}
                  />
                </div>
                <button
                  type="button"
                  className={`prod-filtro-btn ${mostrarFiltros || filtrosActivos ? 'activo' : ''}`}
                  onClick={() => {
                    setFiltrosDraft(filtros);
                    setMostrarFiltros(true);
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
                style={puedeGestionCatalogo ? undefined : { display: 'none' }}
                disabled={!puedeGestionCatalogo}
              >
                <Icon name="plus" size={20} />
              </button>
            </div>

            {mostrarFiltros && (
              <div
                className="prod-modal-backdrop prod-filtros-backdrop"
                role="dialog"
                aria-modal="true"
                aria-labelledby="prod-filtros-titulo"
                onClick={(e) => {
                  if (e.target === e.currentTarget) setMostrarFiltros(false);
                }}
              >
                <div className="prod-filtros-modal">
                  <header className="prod-modal-header">
                    <h2 id="prod-filtros-titulo">Filtros de productos</h2>
                    <button
                      type="button"
                      className="prod-modal-close"
                      onClick={() => setMostrarFiltros(false)}
                      aria-label="Cerrar"
                    >
                      <Icon name="x" size={18} />
                    </button>
                  </header>
                  <div className="prod-filtros-modal-body">
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
                        {chipsExistencia.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            className={filtrosDraft.existencia === c.id ? 'activo' : ''}
                            onClick={() => setFiltrosDraft({ ...filtrosDraft, existencia: c.id })}
                          >
                            {c.label}
                            {c.id === 'negativa' && negativosCount > 0 ? ` (${negativosCount})` : ''}
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
                    <label className="muted" style={{ display: 'block', marginTop: '0.35rem' }}>
                      Departamento
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
                    <label className="muted" style={{ display: 'block', marginTop: '0.65rem' }}>
                      Proveedor
                      <select
                        className="select"
                        style={{ marginTop: '0.35rem' }}
                        value={filtrosDraft.proveedor}
                        onChange={(e) => setFiltrosDraft({ ...filtrosDraft, proveedor: e.target.value })}
                      >
                        <option value="">Todos</option>
                        <option value="__ninguno__">Sin proveedor vinculado</option>
                        {proveedores.map((pr) => (
                          <option key={pr.id} value={String(pr.id)}>
                            {pr.nombre}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="prod-filtros-modal-acciones">
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ color: 'var(--brand-red)' }}
                      onClick={() => {
                        setFiltrosDraft(FILTROS_VACIOS);
                        setFiltros(FILTROS_VACIOS);
                      }}
                    >
                      Limpiar
                    </button>
                    <button type="button" className="btn btn-ghost" onClick={() => setMostrarFiltros(false)}>
                      Cancelar
                    </button>
                    <button type="button" className="btn btn-primary" onClick={aplicarFiltros}>
                      Aplicar filtros
                    </button>
                  </div>
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
                  const stockVista = etiquetaStockLista(p, sucursal, { verNegativos });
                  const stockNeg = verNegativos && (Number(p.stock) < 0 || (enCentral && Number(p.stock_cedis) < 0));
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className={`prod-lista-item ${activo ? 'activo' : ''}`}
                      onClick={() => seleccionarProducto(p)}
                    >
                      <ProductoThumb producto={p} size={48} className="prod-lista-thumb" sucursal={sucursal} verNegativos={verNegativos} />
                      <div className="prod-lista-meta">
                        <div className="prod-lista-codigo">{p.id}</div>
                        <div className="prod-lista-nombre">{p.nombre}</div>
                        <div className="prod-lista-stock" style={stockNeg ? { color: 'var(--brand-red)', fontWeight: 700 } : undefined}>
                          {enCentral ? (
                            <>
                              <span className="muted">{stockVista.etiquetaPrimario}</span> {stockVista.primario}
                              <span className="muted"> · {stockVista.etiquetaSecundario}</span> {stockVista.secundario}
                            </>
                          ) : (
                            <>
                              <span className="muted">{stockVista.etiquetaPrimario}</span> {stockVista.primario}
                            </>
                          )}
                        </div>
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
              {productoSeleccionado && puedeGestionCatalogo && (
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
                verNegativos={verNegativos}
                onEditar={puedeGestionCatalogo ? editar : undefined}
                onToggleFavorito={puedeGestionCatalogo ? toggleFavorito : undefined}
                onVincularProveedor={puedeGestionCatalogo ? vincularProveedor : undefined}
                onQuitarVinculo={puedeGestionCatalogo ? quitarVinculo : undefined}
                onFotoActualizada={puedeGestionCatalogo ? (row) => fusionarProducto?.(row) : undefined}
              />
            </div>
          </section>
        </div>
      )}

      <ModalAjusteInventario
        open={modalAjusteOpen && puedeAjustes}
        onClose={() => setModalAjusteOpen(false)}
        inventario={inventario}
        sucursal={sucursal}
        tiendaLabel={tiendaLabel}
        onElegir={abrirAjusteDesdeModal}
        onBorrarInventario={puedeVaciarInventario ? () => setVista('vaciarinventario') : undefined}
      />

      {(vista === 'alta' || vista === 'editar') && puedeGestionCatalogo && (
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

      {vista === 'ajustes' && puedeAjustes && (
        <AjusteInventario
          key={`ajuste-${ajusteConfig.modo}-${ajusteConfig.tipo}-${ajusteConfig.departamento || ''}-${ajusteConfig.borrador?.id || ''}`}
          supabase={supabase}
          inventario={inventario}
          inventarioCompleto={inventarioCompleto || inventario}
          cargarDatos={cargarDatos}
          fusionarProducto={fusionarProducto}
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

      {vista === 'traspaso' && puedeTraspasos && (
        <Traspasos
          supabase={supabase}
          inventario={inventario}
          inventarioCompleto={inventarioCompleto || inventario}
          cargarDatos={cargarDatos}
          fusionarProducto={fusionarProducto}
          user={user}
          sucursal={sucursal}
          onVolver={irLista}
        />
      )}

      {vista === 'preinventario' && puedePreinventario && (
        <div className="card">
          <Preinventario
            supabase={supabase}
            inventario={inventario}
            user={user}
            sucursal={sucursal}
            onVolver={irLista}
          />
        </div>
      )}

      {vista === 'mover' && puedeGestionCatalogo && (
        <MoverProductosLote
          supabase={supabase}
          inventario={inventarioCompleto || inventario}
          proveedores={proveedores}
          productosPorProveedor={productosPorProveedor}
          idsConProveedor={idsConProveedor}
          onMapaProveedoresChange={cargarMapaProveedores}
          onCatalogoChange={cargarDatos}
        />
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

      {vista === 'importexport' && puedeGestionCatalogo && (
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
            Pone en <strong>cero</strong> el inventario según el alcance elegido. Se registra en el historial de movimientos (Consultas → Consulta producto).
          </p>
          <p style={{ margin: '0 0 1rem', padding: '0.65rem 0.85rem', background: 'var(--surface-2, #f5f5f5)', borderRadius: 8, borderLeft: '4px solid var(--brand-red)' }}>
            Tienda que se vaciará:{' '}
            <strong style={{ color: 'var(--brand-red)' }}>{tiendaLabel}</strong>
            <span className="muted"> ({sucursal || 'MAIN'})</span>
            <span className="muted"> · {inventarioCompleto?.length || inventario.length} producto(s)</span>
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
            {opcionesVaciadoTienda.map((o) => (
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
            {vaciando
              ? 'Vaciando…'
              : alcanceVaciado === 'global'
                ? 'Vaciar inventario de TODAS las tiendas'
                : alcanceVaciado === 'cedis'
                  ? 'Vaciar CEDIS central ahora'
                  : `Vaciar inventario de ${tiendaLabel}`}
          </button>
        </div>
      )}

      {vista === 'historial' && productoHistorial && (
        <HistorialProducto
          supabase={supabase}
          producto={productoHistorial}
          sucursal={sucursal}
          verNegativos={verNegativos}
          onVolver={() => {
            setProductoHistorial(null);
            setVista('lista');
          }}
        />
      )}

      {vista === 'consolidar' && puedeConsolidar && (
        <ConsolidarVentasInventario
          supabase={supabase}
          inventario={inventario}
          inventarioCompleto={inventarioCompleto || inventario}
          sucursal={sucursal}
          user={user}
          cargarDatos={cargarDatos}
          onVolver={irLista}
          periodoInicial="hoy"
        />
      )}

      {vista === 'precios' && (
        <div className="card">
          <p className="muted" style={{ marginTop: 0 }}>
            Edita precios de venta para todo el catálogo (aplican en todas las tiendas) y guarda los cambios.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', marginBottom: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flex: '1 1 240px', minWidth: 0 }}>
              <Icon name="search" size={16} />
              <CampoCodigo
                inputRef={preciosBuscarRef}
                value={preciosQ}
                onChange={(e) => setPreciosQ(e.target.value)}
                onEscanear={(codigo) => {
                  const c = String(codigo || '').trim();
                  const exacto = productoPorCodigoExacto(inventario, c);
                  if (exacto) {
                    setPreciosDepto('');
                    setPreciosProveedor('');
                    setPreciosQ(String(exacto.id));
                    enfocarProductoPrecios(exacto.id);
                    return;
                  }
                  setPreciosQ(c);
                  alert(`No se encontró el producto con código ${c} en el catálogo.`);
                }}
                beepAlEnter
                autoFocus
                placeholder="Buscar por nombre, código o escanear…"
                tituloCamara="Buscar producto para precio"
                inputStyle={{ flex: 1, minWidth: 0 }}
              />
            </div>
            <select
              className="select"
              style={{ flex: '0 1 180px', minWidth: 140 }}
              value={preciosDepto}
              onChange={(e) => setPreciosDepto(e.target.value)}
              title="Filtrar por departamento"
            >
              <option value="">Todos los departamentos</option>
              {departamentos.map((d) => (
                <option key={d} value={d}>
                  {etiquetaDepartamento(d)}
                </option>
              ))}
            </select>
            <select
              className="select"
              style={{ flex: '0 1 180px', minWidth: 140 }}
              value={preciosProveedor}
              onChange={(e) => setPreciosProveedor(e.target.value)}
              title="Filtrar por proveedor"
            >
              <option value="">Todos los proveedores</option>
              <option value="__ninguno__">Sin proveedor</option>
              {proveedores.map((pr) => (
                <option key={pr.id} value={String(pr.id)}>
                  {pr.nombre || pr.id}
                </option>
              ))}
            </select>
            {preciosFiltrosActivos ? (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setPreciosQ('');
                  setPreciosDepto('');
                  setPreciosProveedor('');
                }}
              >
                Limpiar filtros
              </button>
            ) : null}
            <span className="muted" style={{ fontSize: '0.82rem' }}>
              {rowsPrecios.length} producto{rowsPrecios.length === 1 ? '' : 's'}
            </span>
          </div>
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
                {rowsPrecios.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="muted" style={{ textAlign: 'center', padding: '1rem' }}>
                      Sin productos con los filtros actuales
                      {preciosQ.trim() ? ` («${preciosQ.trim()}»)` : ''}
                    </td>
                  </tr>
                ) : (
                  rowsPrecios.map((p) => (
                    <tr
                      key={p.id}
                      ref={(el) => {
                        if (el) preciosFilaRefs.current.set(String(p.id), el);
                        else preciosFilaRefs.current.delete(String(p.id));
                      }}
                    >
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
                  ))
                )}
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
