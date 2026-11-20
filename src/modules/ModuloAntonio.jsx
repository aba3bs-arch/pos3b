import React, { useCallback, useEffect, useState } from 'react';
import CaratulaRcRecolectores from '../components/CaratulaRcRecolectores.jsx';
import TableroInventarioCamion from '../components/TableroInventarioCamion.jsx';
import { useInventariosCamion } from '../components/InventarioCamionRecolector.jsx';
import { resumenCaratulaRcPorRepartidor } from '../lib/controlEfectivo.js';
import CobranzaRuta from './CobranzaRuta.jsx';

const PESTANAS = [
  { id: 'rc', label: 'RC' },
  { id: 'camion', label: 'Camión' },
  { id: 'creditos', label: 'Créditos' },
];

const ETIQUETA_CASILLA = {
  venta: 'Rc/venta',
  creditos: 'Rc/créditos',
  servicios: 'Rc/servicios',
};

/**
 * Diseño de Antonio, separado de Venta en ruta.
 * Las pantallas de ruta, preinventario y liquidación no cambian.
 */
export default function ModuloAntonio({ supabase, user, sucursal }) {
  const [pestana, setPestana] = useState('rc');
  const [resumenReps, setResumenReps] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [aviso, setAviso] = useState('');
  const inventarios = useInventariosCamion(supabase, pestana === 'rc');

  const cargar = useCallback(async () => {
    if (!supabase) return;
    setCargando(true);
    try {
      setResumenReps(await resumenCaratulaRcPorRepartidor(supabase));
    } catch (e) {
      setAviso(e?.message || 'No se pudo leer el efectivo en tránsito.');
    } finally {
      setCargando(false);
    }
  }, [supabase]);

  useEffect(() => {
    if (pestana !== 'rc') return undefined;
    void cargar();
    const t = setInterval(() => { void cargar(); }, 15000);
    return () => clearInterval(t);
  }, [pestana, cargar]);

  const tocar = (casilla) => (id) => {
    const rep = resumenReps.find((r) => String(r.id) === String(id));
    const nombre = rep?.nombre || 'recolector';
    setAviso(`${ETIQUETA_CASILLA[casilla] || casilla} · ${nombre}. La liquidación sigue en Liquidación recolecciones.`);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      <div>
        <h2 style={{ margin: 0, color: 'var(--brand-blue)' }}>Antonio</h2>
        <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.85rem' }}>
          Carátulas del diseño, aparte de Venta en ruta. Créditos por pagar, Preinventario y la liquidación no cambian.
        </p>
      </div>
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
        {PESTANAS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`btn ${pestana === p.id ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => { setAviso(''); setPestana(p.id); }}
          >
            {p.label}
          </button>
        ))}
      </div>
      {aviso && <p style={{ margin: 0, fontSize: '0.85rem' }}>{aviso}</p>}
      {pestana === 'rc' && (
        <CaratulaRcRecolectores
          resumenReps={resumenReps}
          cargando={cargando}
          inventarios={inventarios}
          onAbrirVenta={tocar('venta')}
          onAbrirCreditos={tocar('creditos')}
          onAbrirServicios={tocar('servicios')}
        />
      )}
      {pestana === 'camion' && (
        <TableroInventarioCamion supabase={supabase} user={user} />
      )}
      {pestana === 'creditos' && (
        <CobranzaRuta
          supabase={supabase}
          user={user}
          sucursal={sucursal}
          embedded
          caratula
          titulo="Créditos por cobrar"
        />
      )}
    </div>
  );
}
