import React, { useEffect, useState } from 'react';
import { consultarVentas } from '../lib/ventasQuery.js';

export default function Estadisticas({ supabase }) {
  const [series, setSeries] = useState([]);
  const [totalPeriodo, setTotalPeriodo] = useState(0);
  const [tickets, setTickets] = useState(0);

  useEffect(() => {
    let ok = true;
    (async () => {
      if (!supabase) return;
      const ini = new Date();
      ini.setDate(ini.getDate() - 13);
      ini.setHours(0, 0, 0, 0);
      const { data, error } = await consultarVentas(supabase, {
        columns: 'total,created_at',
        desde: ini,
        limit: 800,
        orderAsc: true,
      });
      if (!ok) return;
      if (error) {
        console.error(error);
        aggregate([]);
        return;
      }
      aggregate(data || []);
    })();
    return () => {
      ok = false;
    };
  }, [supabase]);

  const aggregate = (rows) => {
    const map = {};
    let sum = 0;
    for (const v of rows) {
      const d = v.created_at ? new Date(v.created_at).toISOString().slice(0, 10) : null;
      if (!d) continue;
      const t = Number(v.total) || 0;
      map[d] = (map[d] || 0) + t;
      sum += t;
    }
    const keys = Object.keys(map).sort();
    const max = Math.max(...keys.map((k) => map[k]), 1);
    setSeries(keys.map((k) => ({ fecha: k, total: map[k], pct: (map[k] / max) * 100 })));
    setTotalPeriodo(sum);
    setTickets(rows.length);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="grid-2">
        <div className="card">
          <h3 style={{ margin: '0 0 0.25rem', color: 'var(--brand-blue)' }}>Ventas últimos ~14 días</h3>
          <p className="muted" style={{ marginTop: 0 }}>Suma de totales por día (según fecha en registro).</p>
          <div style={{ marginTop: '0.75rem', fontSize: '1.5rem', fontWeight: 800, color: 'var(--brand-gold-dark)' }}>${totalPeriodo.toFixed(2)} MXN</div>
          <div className="muted">{tickets} tickets en el periodo consultado</div>
        </div>
        <div className="card">
          <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue)' }}>Barras por día</h3>
          {series.length === 0 ? (
            <p className="muted">Sin datos con fecha. Agrega columna created_at a ventas o registra ventas nuevas.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              {series.map((s) => (
                <div key={s.fecha} style={{ display: 'grid', gridTemplateColumns: '88px 1fr 72px', gap: '0.5rem', alignItems: 'center', fontSize: '0.85rem' }}>
                  <span className="muted">{s.fecha.slice(5)}</span>
                  <div style={{ height: '10px', borderRadius: '6px', background: 'var(--surface)', overflow: 'hidden' }}>
                    <div style={{ width: `${s.pct}%`, height: '100%', background: 'linear-gradient(90deg, var(--brand-blue), var(--brand-gold))' }} />
                  </div>
                  <strong style={{ textAlign: 'right' }}>${s.total.toFixed(0)}</strong>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
