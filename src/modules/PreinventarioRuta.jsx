import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Preinventario from './Preinventario.jsx';
import { disponibleEnLineaCarga, lineasDeCarga, listarCargasRuta } from '../lib/ventaEnRuta.js';
import { esRolRepartidor } from '../lib/roles.js';

const COLOR = '#0f766e';
/** Alcance de plantillas compartidas de ruta (no mezcla con tiendas). */
export const SUCURSAL_PREINVENTARIO_RUTA = 'RUTA';

/**
 * Preinventario del camión: mismo sistema de plantillas que Productos,
 * pero el teórico = disponible en la carga (qty_cargada − vendida − devuelta).
 */
export default function PreinventarioRuta({ supabase, user, inventario = [], productoPorId, setAviso, onVolver }) {
  const [cargas, setCargas] = useState([]);
  const [cargaId, setCargaId] = useState('');
  const [lineas, setLineas] = useState([]);

  const esRep = esRolRepartidor(user?.rol);

  const cargarCargas = useCallback(async () => {
    const filtros = { estado: 'en_ruta' };
    if (esRep && user?.id) filtros.vendedorId = user.id;
    const r = await listarCargasRuta(supabase, { ...filtros, limit: 40 });
    if (r.aviso) setAviso?.(r.aviso);
    setCargas(r.data || []);
  }, [supabase, esRep, user?.id, setAviso]);

  useEffect(() => {
    void cargarCargas();
  }, [cargarCargas]);

  useEffect(() => {
    if (!cargaId) {
      setLineas([]);
      return;
    }
    void lineasDeCarga(supabase, cargaId).then((r) => setLineas(r.data || []));
  }, [supabase, cargaId]);

  const inventarioCamion = useMemo(() => {
    const out = [];
    for (const lin of lineas || []) {
      const pid = String(lin.producto_id || '');
      if (!pid) continue;
      const base = productoPorId?.get(pid) || (inventario || []).find((p) => String(p.id) === pid) || {};
      out.push({
        ...base,
        id: pid,
        nombre: lin.producto_nombre || base.nombre || pid,
        cat: base.cat || 'GENERAL',
        _qty_cargada: Number(lin.qty_cargada) || 0,
        _qty_vendida: Number(lin.qty_vendida) || 0,
        _qty_devuelta: Number(lin.qty_devuelta) || 0,
        _disp_camion: disponibleEnLineaCarga(lin),
      });
    }
    return out;
  }, [lineas, productoPorId, inventario]);

  const teoricoFn = useCallback((p) => Math.max(0, Math.floor(Number(p?._disp_camion) || 0)), []);

  const carga = cargas.find((c) => String(c.id) === String(cargaId));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div className="card" style={{ borderTop: `4px solid ${COLOR}`, margin: 0 }}>
        <h3 style={{ margin: '0 0 0.35rem', color: COLOR }}>Preinventario · camión</h3>
        <p className="muted" style={{ margin: '0 0 0.75rem', fontSize: '0.85rem' }}>
          Plantillas y conteo como en Productos. El teórico es lo disponible en la carga del camión (no el piso de tienda).
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
            {cargas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.folio}{c.vendedor_nombre ? ` · ${c.vendedor_nombre}` : ''}
              </option>
            ))}
          </select>
        </label>
        {cargaId && (
          <p className="muted" style={{ margin: '0.5rem 0 0', fontSize: '0.8rem' }}>
            {inventarioCamion.length} producto(s) en camión
            {carga?.folio ? ` · ${carga.folio}` : ''}
          </p>
        )}
      </div>

      {!cargaId ? (
        <div className="card"><p className="muted" style={{ margin: 0 }}>Elige una carga para armar plantillas y contar.</p></div>
      ) : inventarioCamion.length === 0 ? (
        <div className="card"><p className="muted" style={{ margin: 0 }}>Esta carga no tiene líneas de producto.</p></div>
      ) : (
        <Preinventario
          supabase={supabase}
          inventario={inventarioCamion}
          user={user}
          sucursal={SUCURSAL_PREINVENTARIO_RUTA}
          teoricoFn={teoricoFn}
          titulo="Preinventario de ruta"
          ayudaExtra={`Camión ${carga?.folio || ''} · teórico = disponible en carga · no modifica stock`}
          onVolver={onVolver}
        />
      )}
    </div>
  );
}
