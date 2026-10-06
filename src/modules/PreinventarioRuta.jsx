import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Preinventario from './Preinventario.jsx';
import {
  inventarioCamionDesdeLineas,
  lineasDeCarga,
  lineasDeVariasCargas,
  listarCargasRuta,
} from '../lib/ventaEnRuta.js';
import { esRolRepartidor } from '../lib/roles.js';
import { SUCURSAL_RUTA } from '../constants/sucursales.js';
import { etiquetaCamion, resolverCamionVendedor } from '../lib/rutaCamiones.js';

const COLOR = '#0f766e';
/** Alcance de plantillas compartidas de ruta (no mezcla con tiendas). */
export const SUCURSAL_PREINVENTARIO_RUTA = SUCURSAL_RUTA;
/** Valor del selector: consolidar todo lo del camión (todas las cargas en ruta). */
export const CARGA_TODAS = '__TODAS__';

/**
 * Preinventario del camión.
 * Por defecto muestra **toda** la mercancía en ruta (todas las cargas / folios
 * consolidados), sin exigir elegir un folio. Sigue visible mientras quede
 * carga en ruta (hasta devolver todo a CEDIS / liquidar).
 * Teórico = disponible (cargada − vendida − devuelta).
 */
export default function PreinventarioRuta({ supabase, user, inventario = [], productoPorId, setAviso, onVolver }) {
  const [cargas, setCargas] = useState([]);
  /** Default: todo el camión. */
  const [cargaId, setCargaId] = useState(CARGA_TODAS);
  const [lineas, setLineas] = useState([]);
  const [cargandoCargas, setCargandoCargas] = useState(true);
  const [cargandoLineas, setCargandoLineas] = useState(false);
  const [tick, setTick] = useState(0);
  const [camionSesion, setCamionSesion] = useState(null);

  const esRep = esRolRepartidor(user?.rol);
  const todas = !cargaId || cargaId === CARGA_TODAS;

  useEffect(() => {
    if (!supabase || !user?.id) {
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
  }, [supabase, user?.id, user?.nombre]);

  const cargarCargas = useCallback(async () => {
    setCargandoCargas(true);
    try {
      // Preferir cargas del camión asignado; si no, del vendedor; admin ve todas en ruta.
      let r;
      if (camionSesion?.id) {
        r = await listarCargasRuta(supabase, {
          estado: 'en_ruta',
          camionId: camionSesion.id,
          limit: 80,
        });
      } else if (esRep && user?.id) {
        r = await listarCargasRuta(supabase, {
          estado: 'en_ruta',
          vendedorId: user.id,
          limit: 80,
        });
      } else {
        r = await listarCargasRuta(supabase, { estado: 'en_ruta', limit: 80 });
      }
      if (r.aviso) setAviso?.(r.aviso);
      if (r.error) setAviso?.(r.error);
      let lista = r.data || [];

      // Repartidor sin camion_id en cargas: filtrar por nombre si hace falta.
      if (esRep && user?.nombre && camionSesion?.id && !lista.length) {
        const r2 = await listarCargasRuta(supabase, { estado: 'en_ruta', limit: 80 });
        const nom = String(user.nombre).trim().toLowerCase();
        lista = (r2.data || []).filter((c) => {
          if (String(c.camion_id || '') === String(camionSesion.id)) return true;
          if (user.id && String(c.vendedor_id || '') === String(user.id)) return true;
          return String(c.vendedor_nombre || '').trim().toLowerCase() === nom;
        });
      }

      setCargas(lista);
      // Si el folio elegido ya no existe, volver a «todo el camión».
      setCargaId((prev) => {
        if (!prev || prev === CARGA_TODAS) return CARGA_TODAS;
        if (lista.some((c) => String(c.id) === String(prev))) return prev;
        return CARGA_TODAS;
      });
    } finally {
      setCargandoCargas(false);
    }
  }, [supabase, esRep, user?.id, user?.nombre, camionSesion?.id, setAviso]);

  useEffect(() => {
    void cargarCargas();
  }, [cargarCargas, tick]);

  const refrescarLineas = useCallback(async () => {
    if (cargandoCargas) return;
    if (!cargas.length) {
      setLineas([]);
      setCargandoLineas(false);
      return;
    }
    setCargandoLineas(true);
    try {
      if (todas) {
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
  }, [supabase, todas, cargaId, cargas, cargandoCargas, setAviso]);

  useEffect(() => {
    void refrescarLineas();
  }, [refrescarLineas, tick]);

  // Al volver a la pestaña, refrescar (ventas hechas en POS / otro equipo).
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
    ? (cargas.length ? `Todo el camión · ${cargas.length} carga(s)` : 'Todo el camión')
    : (carga?.folio || '');

  const actualizar = () => setTick((n) => n + 1);
  const cargando = cargandoCargas || cargandoLineas;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div className="card" style={{ borderTop: `4px solid ${COLOR}`, margin: 0 }}>
        <h3 style={{ margin: '0 0 0.35rem', color: COLOR }}>Preinventario · camión</h3>
        <p className="muted" style={{ margin: '0 0 0.75rem', fontSize: '0.85rem' }}>
          Se muestra <strong>toda la mercancía del camión</strong> (todas las cargas en ruta,
          sin importar el folio), hasta que se devuelva / liquide a CEDIS.
          Teórico = disponible (cargada − vendida − devuelta).
          {camionSesion ? ` Camión: ${etiquetaCamion(camionSesion)}.` : ''}
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'flex-end' }}>
          <label className="muted" style={{ display: 'block', fontSize: '0.8rem', flex: '1 1 220px', maxWidth: 420 }}>
            Alcance (opcional)
            <select
              className="input"
              style={{ marginTop: '0.35rem' }}
              value={cargaId || CARGA_TODAS}
              onChange={(e) => setCargaId(e.target.value || CARGA_TODAS)}
              disabled={cargandoCargas}
            >
              <option value={CARGA_TODAS}>
                Todo el camión{cargas.length ? ` (${cargas.length} carga${cargas.length === 1 ? '' : 's'})` : ''}
              </option>
              {cargas.map((c) => (
                <option key={c.id} value={c.id}>
                  Solo {c.folio}{c.vendedor_nombre ? ` · ${c.vendedor_nombre}` : ''}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn btn-ghost" onClick={actualizar} disabled={cargando}>
            Actualizar
          </button>
        </div>
        {!cargando && (
          <p className="muted" style={{ margin: '0.5rem 0 0', fontSize: '0.8rem' }}>
            {cargas.length === 0
              ? 'No hay cargas en ruta. Cuando cargues el camión, aquí aparece el inventario completo.'
              : (
                <>
                  {totales.productos} producto(s)
                  {etiquetaAlcance ? ` · ${etiquetaAlcance}` : ''}
                  {' · '}
                  cargada {totales.cargada}
                  {' · '}
                  vendida {totales.vendida}
                  {' · '}
                  <strong style={{ color: COLOR }}>disponible {totales.disponible}</strong>
                </>
              )}
          </p>
        )}
        {cargando && (
          <p className="muted" style={{ margin: '0.5rem 0 0', fontSize: '0.8rem' }}>Cargando inventario del camión…</p>
        )}
      </div>

      {cargando ? (
        <div className="card"><p className="muted" style={{ margin: 0 }}>Cargando productos del camión…</p></div>
      ) : cargas.length === 0 ? (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            Sin mercancía en ruta. Carga el camión (o espera a que haya una carga abierta);
            el preinventario muestra todo lo del camión hasta devolverlo a CEDIS.
          </p>
        </div>
      ) : inventarioCamion.length === 0 ? (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            Hay {cargas.length} carga(s) en ruta pero sin líneas de producto.
          </p>
        </div>
      ) : (
        <Preinventario
          supabase={supabase}
          inventario={inventarioCamion}
          user={user}
          sucursal={SUCURSAL_PREINVENTARIO_RUTA}
          teoricoFn={teoricoFn}
          titulo={todas ? 'Preinventario de ruta · todo el camión' : 'Preinventario de ruta'}
          ayudaExtra={
            todas
              ? `${cargas.length} carga(s) · teórico = disponible consolidado · no modifica stock`
              : `Carga ${carga?.folio || ''} · teórico = disponible · no modifica stock`
          }
          onVolver={onVolver}
        />
      )}
    </div>
  );
}

export { inventarioCamionDesdeLineas };
