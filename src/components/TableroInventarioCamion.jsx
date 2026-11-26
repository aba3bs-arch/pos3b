import React, { useCallback, useEffect, useState } from 'react';
import { listarCamionesRuta } from '../lib/rutaCamiones.js';
import { listarCargasRuta, listarRecolectoresCargaRuta } from '../lib/ventaEnRuta.js';
import { leerFilasInventario, resumirInventarioCamion } from '../lib/resumenInventarioCamion.js';
import { liberarEfectivoRepartidor, listarTodoEnTransito } from '../lib/controlEfectivo.js';
import { normalizarCodigoTienda } from '../constants/sucursales.js';
import {
  armarTableroInventarioCamion,
  dineroTablero,
  textoResumenCamion,
} from '../lib/tableroInventarioCamion.js';
import TableroInventarioCamionVista from './TableroInventarioCamionVista.jsx';

function nombreCamion(camion) {
  return String(camion?.alias || camion?.codigo || 'Camión').trim();
}

function recolectorDeCamion(camion, recolectores) {
  const rid = String(camion?.repartidor_id || '');
  const uid = String(camion?.usuario_id || '');
  return (recolectores || []).find((r) => (
    (rid && String(r.repartidor_id || r.id) === rid)
    || (uid && String(r.usuario_id || '') === uid)
  )) || null;
}

async function leerInventario(supabase, cargaIds) {
  const lineas = [];
  for (let i = 0; i < cargaIds.length; i += 100) {
    const ids = cargaIds.slice(i, i + 100);
    lineas.push(...await leerFilasInventario(() => supabase
      .from('ruta_carga_lineas')
      .select('id, producto_id, precio, qty_cargada, qty_vendida, qty_devuelta')
      .in('carga_id', ids)));
  }
  const productos = [];
  const idsProducto = [...new Set(lineas.map((l) => l.producto_id).filter(Boolean))];
  for (let i = 0; i < idsProducto.length; i += 100) {
    productos.push(...await leerFilasInventario(() => supabase
      .from('productos')
      .select('id, precio_ruta')
      .in('id', idsProducto.slice(i, i + 100))));
  }
  return resumirInventarioCamion(lineas, productos);
}

async function leerVentas(supabase, cargaIds) {
  const ventas = [];
  for (let i = 0; i < cargaIds.length; i += 80) {
    const ids = cargaIds.slice(i, i + 80);
    const { data, error } = await supabase
      .from('ruta_ventas')
      .select('id, folio, cliente_tipo, cliente_id, cliente_nombre, metodo_pago, total, articulos, created_at, estado, carga_id')
      .in('carga_id', ids)
      .order('created_at', { ascending: true })
      .limit(500);
    if (error) throw new Error(error.message || 'No se pudieron leer las ventas.');
    ventas.push(...(data || []));
  }
  return ventas;
}

function imprimirNodo(nodo, titulo) {
  if (!nodo) return;
  const ventana = window.open('', '_blank', 'noopener,width=480,height=720');
  if (!ventana) return;
  ventana.document.write(`<!doctype html><html><head><title>${titulo}</title>
    <style>body{font-family:sans-serif;color:#102044;padding:16px}table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #d7e3f5;padding:6px;text-align:left}</style>
    </head><body><h1>${titulo}</h1>${nodo.innerHTML}</body></html>`);
  ventana.document.close();
  ventana.focus();
  ventana.print();
}

export default function TableroInventarioCamion({ supabase, user }) {
  const [camiones, setCamiones] = useState([]);
  const [camionId, setCamionId] = useState('');
  const [ficha, setFicha] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [tiendaId, setTiendaId] = useState(null);
  const [marcadas, setMarcadas] = useState({});
  const [liquidando, setLiquidando] = useState(false);

  const cargarLista = useCallback(async () => {
    const [camRes, recRes] = await Promise.all([
      listarCamionesRuta(supabase, { soloActivos: true }),
      listarRecolectoresCargaRuta(supabase),
    ]);
    if (camRes.error) throw new Error(camRes.error);
    if (recRes.error) throw new Error(recRes.error);
    const lista = (camRes.data || []).map((camion) => {
      const recolector = recolectorDeCamion(camion, recRes.data);
      return {
        id: String(camion.id),
        nombre: nombreCamion(camion),
        repartidorId: recolector?.repartidor_id || camion.repartidor_id || null,
        recolector: recolector?.nombre || '',
      };
    });
    setCamiones(lista);
    setCamionId((actual) => (lista.some((c) => c.id === actual) ? actual : (lista[0]?.id || '')));
    return lista;
  }, [supabase]);

  const cargarFicha = useCallback(async (id) => {
    if (!id) {
      setFicha(null);
      return;
    }
    const camion = camiones.find((c) => c.id === id);
    const cargas = await listarCargasRuta(supabase, {
      estado: 'en_ruta',
      camionId: id,
      vendedorId: camion?.repartidorId || undefined,
      limit: 40,
    });
    if (cargas.error) throw new Error(cargas.error);
    const cargaIds = (cargas.data || []).map((c) => c.id);
    const inventario = cargaIds.length
      ? await leerInventario(supabase, cargaIds)
      : { cargado: 0, disponible: 0, sinPrecio: false };
    const ventas = cargaIds.length ? await leerVentas(supabase, cargaIds) : [];
    const ultimaCarga = (cargas.data || []).reduce((mayor, carga) => (
      !mayor || String(carga.created_at || '') > String(mayor) ? carga.created_at : mayor
    ), null);
    setFicha({
      ...armarTableroInventarioCamion({
        cargado: inventario.cargado,
        disponible: inventario.disponible,
        ventas,
      }),
      sinPrecio: inventario.sinPrecio,
      sinCargas: !cargaIds.length,
      ultimaCarga,
      actualizado: new Date().toISOString(),
      nombre: camion?.nombre || 'Camión',
      recolector: camion?.recolector || '',
      repartidorId: camion?.repartidorId || null,
    });
    setMarcadas((prev) => {
      const siguiente = {};
      for (const tienda of armarTableroInventarioCamion({ ventas }).tiendas) {
        siguiente[tienda.id] = prev[tienda.id] !== false;
      }
      return siguiente;
    });
  }, [camiones, supabase]);

  useEffect(() => {
    let vivo = true;
    const correr = async () => {
      try {
        await cargarLista();
        if (vivo) setError('');
      } catch (e) {
        if (vivo) setError(e?.message || 'No se pudieron leer los camiones.');
      } finally {
        if (vivo) setCargando(false);
      }
    };
    void correr();
    const timer = setInterval(() => { if (!document.hidden) void correr(); }, 15000);
    return () => { vivo = false; clearInterval(timer); };
  }, [cargarLista]);

  useEffect(() => {
    if (!camionId) return;
    let vivo = true;
    const correr = async () => {
      try {
        await cargarFicha(camionId);
        if (vivo) setError('');
      } catch (e) {
        if (vivo) setError(e?.message || 'No se pudo leer el inventario del camión.');
      }
    };
    void correr();
    const timer = setInterval(() => { if (!document.hidden) void correr(); }, 15000);
    return () => { vivo = false; clearInterval(timer); };
  }, [camionId, cargarFicha]);

  const liquidar = async () => {
    if (!ficha?.repartidorId) {
      setAviso('Este camión no tiene recolector asignado.');
      return;
    }
    const elegidas = (ficha.tiendas || []).filter((t) => marcadas[t.id] !== false);
    if (!elegidas.length) {
      setAviso('Marca al menos una tienda.');
      return;
    }
    const sigue = window.confirm(
      `¿Liquidar el efectivo en tránsito de ${elegidas.map((t) => t.etiqueta).join(', ')}?\n`
      + `Las ventas marcadas suman ${dineroTablero(totalMarcadoImporte(elegidas))}. Se libera el efectivo que ya está en tránsito de esas tiendas.`,
    );
    if (!sigue) return;
    setLiquidando(true);
    setAviso('');
    try {
      const movs = await listarTodoEnTransito(supabase, { repartidorId: ficha.repartidorId });
      const codigos = new Set(elegidas.map((t) => normalizarCodigoTienda(t.id)).filter(Boolean));
      const ids = (movs || [])
        .filter((m) => codigos.has(normalizarCodigoTienda(m.sucursal_origen)))
        .map((m) => m.id);
      if (!ids.length) {
        setAviso('Esas tiendas todavía no tienen efectivo en tránsito. El cajero recibe la venta y ahí queda el dinero.');
        return;
      }
      const res = await liberarEfectivoRepartidor(supabase, {
        repartidorId: ficha.repartidorId,
        adminNombre: user?.nombre || 'Venta en Ruta',
        ids,
      });
      if (!res.ok) {
        setAviso(res.error || 'No se pudo liquidar.');
        return;
      }
      setAviso(res.aviso || `Efectivo liquidado: ${dineroTablero(res.montoTotal)}.`);
      await cargarFicha(camionId);
    } catch (e) {
      setAviso(e?.message || 'No se pudo liquidar.');
    } finally {
      setLiquidando(false);
    }
  };

  const imprimir = (cual) => {
    const nodo = document.getElementById(cual === 'tickets' ? 'icam-tickets' : 'icam-reporte');
    imprimirNodo(nodo, cual === 'tickets' ? `Tickets ${ficha?.nombre || ''}` : `Inventario ${ficha?.nombre || ''}`);
  };

  const compartir = (tienda) => {
    const texto = textoResumenCamion({ nombre: ficha?.nombre, tablero: ficha, tienda });
    const url = `https://wa.me/?text=${encodeURIComponent(texto)}`;
    window.open(url, '_blank', 'noopener');
  };

  return (
    <TableroInventarioCamionVista
      camiones={camiones}
      camionId={camionId}
      onElegirCamion={(id) => { setTiendaId(null); setCamionId(id); }}
      tablero={ficha}
      cargando={cargando}
      error={error}
      aviso={aviso}
      nombre={ficha?.nombre || camiones.find((c) => c.id === camionId)?.nombre}
      recolector={ficha?.recolector}
      ultimaCarga={ficha?.ultimaCarga}
      actualizado={ficha?.actualizado}
      sinCamiones={!cargando && camiones.length === 0}
      sinCargas={ficha?.sinCargas}
      sinPrecio={ficha?.sinPrecio}
      tiendaId={tiendaId}
      onElegirTienda={setTiendaId}
      marcadas={marcadas}
      onMarcar={(id, valor) => setMarcadas((prev) => ({ ...prev, [id]: valor }))}
      onLiquidar={liquidar}
      liquidando={liquidando}
      onImprimir={imprimir}
      onCompartir={compartir}
    />
  );
}

function totalMarcadoImporte(tiendas) {
  return tiendas.reduce((s, t) => Math.round((s + t.venta) * 100) / 100, 0);
}
