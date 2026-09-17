import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Preinventario from './Preinventario.jsx';
import {
  disponibleEnLineaCarga,
  inventarioCamionDesdeLineas,
  lineasDeCarga,
  lineasDeVariasCargas,
  listarCargasRuta,
} from '../lib/ventaEnRuta.js';
import { esRolRepartidor } from '../lib/roles.js';
import { SUCURSAL_RUTA } from '../constants/sucursales.js';

const COLOR = '#0f766e';
/** Alcance de plantillas compartidas de ruta (no mezcla con tiendas). */
export const SUCURSAL_PREINVENTARIO_RUTA = SUCURSAL_RUTA;
/** Valor del selector para consolidar todas las cargas en ruta. */
export const CARGA_TODAS = '__TODAS__';

/**
 * Preinventario del camión: mismo sistema de plantillas que Productos,
 * pero el teórico = disponible en la carga (qty_cargada − vendida − devuelta).
 * Opción «Todas las cargas»: suma el disponible de cada producto en todas las cargas en ruta.
 */
export default function PreinventarioRuta({ supabase, user, inventario = [], productoPorId, setAviso, onVolver }) {
  const [cargas, setCargas] = useState([]);
  const [cargaId, setCargaId] = useState('');
  const [lineas, setLineas] = useState([]);
  const [cargandoLineas, setCargandoLineas] = useState(false);

  const esRep = esRolRepartidor(user?.rol);
  const todas = cargaId === CARGA_TODAS;

  const cargarCargas = useCallback(async () => {
    const filtros = { estado: 'en_ruta' };
    if (esRep && user?.id) filtros.vendedorId = user.id;
    const r = await listarCargasRuta(supabase, { ...filtros, limit: 80 });
    if (r.aviso) setAviso?.(r.aviso);
    setCargas(r.data || []);
  }, [supabase, esRep, user?.id, setAviso]);

  useEffect(() => {
    void cargarCargas();
  }, [cargarCargas]);

  useEffect(() => {
    if (!cargaId) {
      setLineas([]);
      setCargandoLineas(false);
      return undefined;
    }
    let cancel = false;
    setCargandoLineas(true);
    (async () => {
      if (cargaId === CARGA_TODAS) {
        if (!cargas.length) {
          if (!cancel) {
            setLineas([]);
            setCargandoLineas(false);
          }
          return;
        }
        const r = await lineasDeVariasCargas(supabase, cargas);
        if (cancel) return;
        if (r.aviso) setAviso?.(r.aviso);
        if (r.error) setAviso?.(r.error);
        setLineas(r.data || []);
      } else {
        const r = await lineasDeCarga(supabase, cargaId);
        if (cancel) return;
        setLineas(r.data || []);
      }
      if (!cancel) setCargandoLineas(false);
    })();
    return () => {
      cancel = true;
    };
  }, [supabase, cargaId, cargas, setAviso]);

  const inventarioCamion = useMemo(
    () => inventarioCamionDesdeLineas(lineas, { productoPorId, inventario }),
    [lineas, productoPorId, inventario],
  );

  const teoricoFn = useCallback((p) => Math.max(0, Math.floor(Number(p?._disp_camion) || 0)), []);

  const carga = cargas.find((c) => String(c.id) === String(cargaId));
  const etiquetaAlcance = todas
    ? `Todas las cargas (${cargas.length})`
    : (carga?.folio || '');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div className="card" style={{ borderTop: `4px solid ${COLOR}`, margin: 0 }}>
        <h3 style={{ margin: '0 0 0.35rem', color: COLOR }}>Preinventario · camión</h3>
        <p className="muted" style={{ margin: '0 0 0.75rem', fontSize: '0.85rem' }}>
          Plantillas y conteo como en Productos. El teórico es lo disponible en la carga del camión (no el piso de tienda).
          Puedes elegir una carga o <strong>todas las cargas</strong> en ruta (suma por producto).
        </p>
        <label className="muted" style={{ display: 'block', fontSize: '0.8rem', maxWidth: 420 }}>
          Carga en ruta
          <select
            className="input"
            style={{ marginTop: '0.35rem' }}
            value={cargaId}
            onChange={(e) => setCargaId(e.target.value)}
          >
            <option value="">— Elige carga —</option>
            {cargas.length > 0 && (
              <option value={CARGA_TODAS}>
                Todas las cargas ({cargas.length})
              </option>
            )}
            {cargas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.folio}{c.vendedor_nombre ? ` · ${c.vendedor_nombre}` : ''}
              </option>
            ))}
          </select>
        </label>
        {cargaId && !cargandoLineas && (
          <p className="muted" style={{ margin: '0.5rem 0 0', fontSize: '0.8rem' }}>
            {inventarioCamion.length} producto(s)
            {etiquetaAlcance ? ` · ${etiquetaAlcance}` : ''}
            {todas ? ' · teórico = suma de disponible en todas' : ''}
          </p>
        )}
        {cargandoLineas && (
          <p className="muted" style={{ margin: '0.5rem 0 0', fontSize: '0.8rem' }}>Cargando líneas…</p>
        )}
      </div>

      {!cargaId ? (
        <div className="card"><p className="muted" style={{ margin: 0 }}>Elige una carga o «Todas las cargas» para armar plantillas y contar.</p></div>
      ) : cargandoLineas ? (
        <div className="card"><p className="muted" style={{ margin: 0 }}>Cargando productos del camión…</p></div>
      ) : inventarioCamion.length === 0 ? (
        <div className="card"><p className="muted" style={{ margin: 0 }}>
          {todas ? 'No hay productos en las cargas en ruta.' : 'Esta carga no tiene líneas de producto.'}
        </p></div>
      ) : (
        <Preinventario
          supabase={supabase}
          inventario={inventarioCamion}
          user={user}
          sucursal={SUCURSAL_PREINVENTARIO_RUTA}
          teoricoFn={teoricoFn}
          titulo={todas ? 'Preinventario de ruta · todas las cargas' : 'Preinventario de ruta'}
          ayudaExtra={
            todas
              ? `${cargas.length} carga(s) · teórico = suma disponible · no modifica stock`
              : `Camión ${carga?.folio || ''} · teórico = disponible en carga · no modifica stock`
          }
          onVolver={onVolver}
        />
      )}
    </div>
  );
}

// Reexport por si tests / consumidores necesitan la fn de consolidación
export { inventarioCamionDesdeLineas, disponibleEnLineaCarga };
