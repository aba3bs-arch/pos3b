import React, { useEffect, useMemo, useState } from 'react';
import Icon from './Icon.jsx';
import { etiquetaDepartamento, listarDepartamentos, normalizarDepartamento } from '../lib/departamentos.js';
import { productoCoincideBusqueda } from '../lib/buscarProductoTexto.js';

const MODOS = [
  { id: 'proveedor', label: 'Por proveedor' },
  { id: 'departamento', label: 'Por departamento' },
];

/**
 * Reasigna productos en lote:
 * - Proveedor: mueve el vínculo proveedor_producto de un proveedor a otro
 * - Departamento: actualiza productos.cat
 */
export default function MoverProductosLote({
  supabase,
  inventario = [],
  proveedores = [],
  productosPorProveedor = new Map(),
  idsConProveedor = new Set(),
  onMapaProveedoresChange,
  onCatalogoChange,
}) {
  const [modo, setModo] = useState('proveedor');
  const [origen, setOrigen] = useState('');
  const [destino, setDestino] = useState('');
  const [q, setQ] = useState('');
  const [seleccion, setSeleccion] = useState(() => new Set());
  const [moviendo, setMoviendo] = useState(false);

  const departamentos = useMemo(() => listarDepartamentos(inventario), [inventario]);

  useEffect(() => {
    setOrigen('');
    setDestino('');
    setSeleccion(new Set());
    setQ('');
  }, [modo]);

  useEffect(() => {
    setSeleccion(new Set());
  }, [origen]);

  const productosIzquierda = useMemo(() => {
    let list = inventario || [];
    if (modo === 'proveedor') {
      if (!origen) return [];
      if (origen === '__ninguno__') {
        list = list.filter((p) => !idsConProveedor.has(String(p.id)));
      } else {
        const ids = productosPorProveedor.get(String(origen));
        list = list.filter((p) => ids?.has(String(p.id)));
      }
    } else {
      if (!origen) return [];
      list = list.filter((p) => normalizarDepartamento(p.cat) === normalizarDepartamento(origen));
    }
    if (q.trim()) {
      list = list.filter((p) => productoCoincideBusqueda(p, q));
    }
    return [...list].sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es'));
  }, [inventario, modo, origen, q, productosPorProveedor, idsConProveedor]);

  const toggle = (id) => {
    setSeleccion((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const toggleTodosVisibles = () => {
    const ids = productosIzquierda.map((p) => p.id);
    setSeleccion((prev) => {
      const todos = ids.every((id) => prev.has(id));
      if (todos) return new Set();
      return new Set(ids);
    });
  };

  const etiquetaOrigen = () => {
    if (modo === 'proveedor') {
      if (origen === '__ninguno__') return 'Sin proveedor';
      return proveedores.find((p) => String(p.id) === String(origen))?.nombre || origen;
    }
    return etiquetaDepartamento(origen);
  };

  const etiquetaDestino = () => {
    if (modo === 'proveedor') {
      return proveedores.find((p) => String(p.id) === String(destino))?.nombre || destino;
    }
    return etiquetaDepartamento(destino);
  };

  const mover = async () => {
    if (!supabase) return;
    const ids = [...seleccion];
    if (!ids.length) return alert('Marca al menos un producto a la izquierda.');
    if (!origen) return alert('Elige el origen (izquierda).');
    if (!destino) return alert('Elige el destino (derecha).');
    if (String(origen) === String(destino)) return alert('Origen y destino deben ser distintos.');

    const msg =
      modo === 'proveedor'
        ? `¿Mover ${ids.length} producto(s) de «${etiquetaOrigen()}» a «${etiquetaDestino()}»?\n\nSe cambia el vínculo de proveedor (el catálogo y stock no se borran).`
        : `¿Cambiar el departamento de ${ids.length} producto(s) de «${etiquetaOrigen()}» a «${etiquetaDestino()}»?`;
    if (!confirm(msg)) return;

    setMoviendo(true);
    try {
      if (modo === 'proveedor') {
        // Quitar vínculo origen (si había) e insertar destino
        if (origen !== '__ninguno__') {
          const { error: eDel } = await supabase
            .from('proveedor_producto')
            .delete()
            .eq('proveedor_id', origen)
            .in('producto_id', ids);
          if (eDel) throw new Error(eDel.message);
        }
        // Evitar duplicados: solo insertar los que aún no tienen el destino
        const { data: ya, error: eYa } = await supabase
          .from('proveedor_producto')
          .select('producto_id')
          .eq('proveedor_id', destino)
          .in('producto_id', ids);
        if (eYa) throw new Error(eYa.message);
        const yaSet = new Set((ya || []).map((r) => String(r.producto_id)));
        const pendientes = ids.filter((id) => !yaSet.has(String(id)));
        if (pendientes.length) {
          const rows = pendientes.map((producto_id) => ({
            proveedor_id: destino,
            producto_id,
            sku_proveedor: null,
          }));
          const { error: eIns } = await supabase.from('proveedor_producto').insert(rows);
          if (eIns) throw new Error(eIns.message);
        }
        await onMapaProveedoresChange?.();
        alert(`Listo: ${ids.length} producto(s) quedaron con proveedor «${etiquetaDestino()}».`);
      } else {
        const { error } = await supabase.from('productos').update({ cat: destino }).in('id', ids);
        if (error) throw new Error(error.message);
        await onCatalogoChange?.();
        alert(`Listo: ${ids.length} producto(s) pasaron a departamento «${etiquetaDestino()}».`);
      }
      setSeleccion(new Set());
    } catch (err) {
      alert(err.message || String(err));
    } finally {
      setMoviendo(false);
    }
  };

  const todosVisiblesMarcados =
    productosIzquierda.length > 0 && productosIzquierda.every((p) => seleccion.has(p.id));

  return (
    <div className="card mover-prod">
      <p className="muted" style={{ marginTop: 0 }}>
        Elige productos a la <strong>izquierda</strong> y el destino a la <strong>derecha</strong>. Sirve para pasar un lote de un
        proveedor a otro, o cambiar su departamento.
      </p>

      <div className="prod-chips" style={{ marginBottom: '0.85rem' }}>
        {MODOS.map((m) => (
          <button key={m.id} type="button" className={modo === m.id ? 'activo' : ''} onClick={() => setModo(m.id)}>
            {m.label}
          </button>
        ))}
      </div>

      <div className="mover-prod-grid">
        <section className="mover-prod-col">
          <h4>
            <Icon name="package" size={16} /> Origen
          </h4>
          <label className="muted" style={{ display: 'block' }}>
            {modo === 'proveedor' ? 'Proveedor actual' : 'Departamento actual'}
            <select className="select" style={{ marginTop: '0.35rem' }} value={origen} onChange={(e) => setOrigen(e.target.value)}>
              <option value="">— Elegir —</option>
              {modo === 'proveedor' ? (
                <>
                  <option value="__ninguno__">Sin proveedor vinculado</option>
                  {proveedores.map((pr) => (
                    <option key={pr.id} value={String(pr.id)}>
                      {pr.nombre}
                    </option>
                  ))}
                </>
              ) : (
                departamentos.map((d) => (
                  <option key={d} value={d}>
                    {etiquetaDepartamento(d)}
                  </option>
                ))
              )}
            </select>
          </label>
          <input
            className="input"
            style={{ marginTop: '0.5rem' }}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filtrar lista…"
            disabled={!origen}
          />
          <div className="mover-prod-lista-head">
            <label className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={todosVisiblesMarcados} onChange={toggleTodosVisibles} disabled={!productosIzquierda.length} />
              Seleccionar visibles ({productosIzquierda.length})
            </label>
            <span className="muted">{seleccion.size} marcados</span>
          </div>
          <div className="mover-prod-lista">
            {!origen ? (
              <p className="muted" style={{ padding: '0.75rem', margin: 0 }}>
                Elige un origen para ver productos.
              </p>
            ) : productosIzquierda.length === 0 ? (
              <p className="muted" style={{ padding: '0.75rem', margin: 0 }}>
                No hay productos en este origen{q.trim() ? ' con ese filtro' : ''}.
              </p>
            ) : (
              productosIzquierda.map((p) => (
                <label key={p.id} className={`mover-prod-item ${seleccion.has(p.id) ? 'activo' : ''}`}>
                  <input type="checkbox" checked={seleccion.has(p.id)} onChange={() => toggle(p.id)} />
                  <span className="mover-prod-item-meta">
                    <strong>{p.nombre}</strong>
                    <small className="muted">
                      {p.id} · {etiquetaDepartamento(p.cat)}
                    </small>
                  </span>
                </label>
              ))
            )}
          </div>
        </section>

        <div className="mover-prod-flecha" aria-hidden>
          <Icon name="truck" size={22} />
        </div>

        <section className="mover-prod-col">
          <h4>
            <Icon name="building" size={16} /> Destino
          </h4>
          <label className="muted" style={{ display: 'block' }}>
            {modo === 'proveedor' ? 'Nuevo proveedor' : 'Nuevo departamento'}
            <select className="select" style={{ marginTop: '0.35rem' }} value={destino} onChange={(e) => setDestino(e.target.value)}>
              <option value="">— Elegir —</option>
              {modo === 'proveedor'
                ? proveedores
                    .filter((pr) => String(pr.id) !== String(origen))
                    .map((pr) => (
                      <option key={pr.id} value={String(pr.id)}>
                        {pr.nombre}
                      </option>
                    ))
                : departamentos
                    .filter((d) => normalizarDepartamento(d) !== normalizarDepartamento(origen))
                    .map((d) => (
                      <option key={d} value={d}>
                        {etiquetaDepartamento(d)}
                      </option>
                    ))}
            </select>
          </label>

          <div className="mover-prod-resumen">
            <p style={{ margin: 0 }}>
              <strong>{seleccion.size}</strong> producto(s) listos para mover
            </p>
            {origen && destino ? (
              <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.85rem' }}>
                De <strong>{etiquetaOrigen()}</strong> → <strong>{etiquetaDestino()}</strong>
              </p>
            ) : (
              <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.85rem' }}>
                Completa origen, selección y destino.
              </p>
            )}
          </div>

          <button
            type="button"
            className="btn btn-primary"
            style={{ marginTop: 'auto', width: '100%' }}
            disabled={moviendo || !seleccion.size || !origen || !destino}
            onClick={mover}
          >
            {moviendo ? 'Moviendo…' : `Mover ${seleccion.size || ''} producto(s)`}
          </button>
        </section>
      </div>
    </div>
  );
}
