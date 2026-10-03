import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Preinventario from './Preinventario.jsx';
import {
  disponibleEnLineaCarga,
  inventarioCamionDesdeLineas,
  lineasDeCarga,
  lineasDeVariasCargas,
  listarCargasRuta,
  resolverCargasEnRutaParaVenta,
} from '../lib/ventaEnRuta.js';
import { esRolRepartidor } from '../lib/roles.js';
import { SUCURSAL_RUTA } from '../constants/sucursales.js';
import { etiquetaCamion, resolverCamionVendedor } from '../lib/rutaCamiones.js';

const COLOR = '#0f766e';
/** Alcance de plantillas compartidas de ruta (no mezcla con tiendas). */
export const SUCURSAL_PREINVENTARIO_RUTA = SUCURSAL_RUTA;
/** Valor del selector para consolidar todas las cargas en ruta. */
export const CARGA_TODAS = '__TODAS__';

/**
 * Preinventario del camión: mismo sistema de plantillas que Productos,
 * pero el teórico = disponible en la carga (qty_cargada − vendida − devuelta).
 * Opción «Todas las cargas»: suma el disponible de cada producto en todas las cargas en ruta.
 * Tras ventas POS, «Actualizar» / al elegir carga se lee qty_vendida fresca.
 */
export default function PreinventarioRuta({ supabase, user, inventario = [], productoPorId, setAviso, onVolver }) {
  const [cargas, setCargas] = useState([]);
  const [cargaId, setCargaId] = useState('');
  const [lineas, setLineas] = useState([]);
  const [cargandoLineas, setCargandoLineas] = useState(false);
  const [tick, setTick] = useState(0);
  const [camionSesion, setCamionSesion] = useState(null);

  const esRep = esRolRepartidor(user?.rol);
  const todas = cargaId === CARGA_TODAS;

  useEffect(() => {
    if (!supabase || !esRep || !user?.id) {
      setCamionSesion(null);
      return undefined;
    }
    let cancel = false;
    (async () => {
      const cam = await resolverCamionVendedor(supabase, {
        id: user.id,
        usuario_id: user.id,
        nombre: user.nombre,
      });
      if (!cancel) setCamionSesion(cam.data || null);
    })();
    return () => { cancel = true; };
  }, [supabase, esRep, user?.id, user?.nombre]);

  const cargarCargas = useCallback(async () => {
    if (esRep && (user?.id || camionSesion?.id)) {
      const r = await resolverCargasEnRutaParaVenta(supabase, {
        camionId: camionSesion?.id || undefined,
        vendedorId: user?.id || undefined,
        vendedorNombre: user?.nombre || undefined,
      });
      if (r.aviso) setAviso?.(r.aviso);
      if (r.ok) setCargas(r.cargas || []);
      else {
        if (r.error && !/no hay mercancía/i.test(r.error)) setAviso?.(r.error);
        setCargas([]);
      }
      return;
    }
    const filtros = { estado: 'en_ruta' };
    const r = await listarCargasRuta(supabase, { ...filtros, limit: 80 });
    if (r.aviso) setAviso?.(r.aviso);
    setCargas(r.data || []);
  }, [supabase, esRep, user?.id, user?.nombre, camionSesion?.id, setAviso]);

  useEffect(() => {
    void cargarCargas();
  }, [cargarCargas, tick]);

  const refrescarLineas = useCallback(async () => {
    if (!cargaId) {
      setLineas([]);
      setCargandoLineas(false);
      return;
    }
    setCargandoLineas(true);
    try {
      if (cargaId === CARGA_TODAS) {
        if (!cargas.length) {
          setLineas([]);
          return;
        }
        const r = await lineasDeVariasCargas(supabase, cargas);
        if (r.aviso) setAviso?.(r.aviso);
        if (r.error) setAviso?.(r.error);
        setLineas(r.data || []);
      } else {
        const r = await lineasDeCarga(supabase, cargaId);
        if (r.aviso) setAviso?.(r.aviso);
        if (r.error) setAviso?.(r.error);
        setLineas(r.data || []);
      }
    } finally {
      setCargandoLineas(false);
    }
  }, [supabase, cargaId, cargas, setAviso]);

  useEffect(() => {
    void refrescarLineas();
  }, [refrescarLineas, tick]);

  // Al volver a la pestaña, refrescar existencias (ventas hechas en otro equipo / POS).
  useEffect(() => {
    const onFocus = () => setTick((n) => n + 1);
    const onVis = () => {
      if (document.visibilityState === 'visible') onFocus();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  const inventarioCamion = useMemo(
    () => inventarioCamionDesdeLineas(lineas, { productoPorId, inventario }),
    [lineas, productoPorId, inventario],
  );

  const teoricoFn = useCallback((p) => Math.max(0, Math.floor(Number(p?._disp_camion) || 0)), []);

  const totales = useMemo(() => {
    let cargada = 0;
    let vendida = 0;
    let disponible = 0;
    for (const p of inventarioCamion) {
      cargada += Number(p._qty_cargada) || 0;
      vendida += Number(p._qty_vendida) || 0;
      disponible += Number(p._disp_camion) || 0;
    }
    return { cargada, vendida, disponible, productos: inventarioCamion.length };
  }, [inventarioCamion]);

  const carga = cargas.find((c) => String(c.id) === String(cargaId));
  const etiquetaAlcance = todas
    ? `Todas las cargas (${cargas.length})`
    : (carga?.folio || '');

  const actualizar = () => setTick((n) => n + 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div className="card" style={{ borderTop: `4px solid ${COLOR}`, margin: 0 }}>
        <h3 style={{ margin: '0 0 0.35rem', color: COLOR }}>Preinventario · camión</h3>
        <p className="muted" style={{ margin: '0 0 0.75rem', fontSize: '0.85rem' }}>
          El teórico es la <strong>existencia actual</strong> de la carga
          (cargada − vendida − devuelta). Tras vender en el POS, pulsa <strong>Actualizar</strong>
          para ver el disponible fresco.
          {camionSesion ? ` Camión: ${etiquetaCamion(camionSesion)}.` : ''}
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'flex-end' }}>
          <label className="muted" style={{ display: 'block', fontSize: '0.8rem', flex: '1 1 220px', maxWidth: 420 }}>
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
          <button type="button" className="btn btn-ghost" onClick={actualizar} disabled={cargandoLineas}>
            Actualizar
          </button>
        </div>
        {cargaId && !cargandoLineas && (
          <p className="muted" style={{ margin: '0.5rem 0 0', fontSize: '0.8rem' }}>
            {totales.productos} producto(s)
            {etiquetaAlcance ? ` · ${etiquetaAlcance}` : ''}
            {' · '}
            cargada {totales.cargada}
            {' · '}
            vendida {totales.vendida}
            {' · '}
            <strong style={{ color: COLOR }}>disponible {totales.disponible}</strong>
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
          {todas ? 'No hay productos en las cargas en ruta.' : 'Esta carga no tiene líneas de producto (o ya se vendió / devolvió todo).'}
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
              ? `${cargas.length} carga(s) · teórico = existencia actual (cargada − vendida) · no modifica stock`
              : `Camión ${carga?.folio || ''} · teórico = existencia actual · vendida ${totales.vendida} · no modifica stock`
          }
          onVolver={onVolver}
        />
      )}
    </div>
  );
}

// Reexport por si tests / consumidores necesitan la fn de consolidación
export { inventarioCamionDesdeLineas, disponibleEnLineaCarga };
