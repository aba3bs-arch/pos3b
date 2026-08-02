import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from './Icon.jsx';
import { EVENTO_CALENDARIO_INVENTARIO } from '../lib/calendarioInventario.js';
import { agruparEventosPorTurno, cargarProyeccionFaltante } from '../lib/proyeccionFaltante.js';
import { fmtMxn } from '../lib/valorInventario.js';
import { esAlmacenCentral } from '../constants/sucursales.js';
import { EVENTO_TURNOS, leerTurnos } from '../lib/turnos.js';

function claseConfianza(color) {
  if (color === 'verde') return 'proyeccion-confianza proyeccion-confianza--verde';
  if (color === 'naranja') return 'proyeccion-confianza proyeccion-confianza--naranja';
  return 'proyeccion-confianza proyeccion-confianza--rojo';
}

function bordeUrgencia(color) {
  if (color === 'rojo') return 'var(--brand-red)';
  if (color === 'naranja') return 'var(--brand-gold)';
  return 'var(--brand-green)';
}

function fmtHora(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-MX', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

function itemsDeSenal(data, senalId) {
  if (!data) return [];
  if (senalId === 'carrito') return data.remociones || [];
  if (senalId === 'cancelacion') return data.lineasCancelacion || [];
  if (senalId === 'precio') return data.consultasPrecio || [];
  return [];
}

function ListaPorTurno({ items, vacioLabel, tickTurnos = 0 }) {
  const { grupos, sinTurno } = useMemo(() => {
    void tickTurnos;
    return agruparEventosPorTurno(items, leerTurnos());
  }, [items, tickTurnos]);

  if (!items?.length) {
    return <p className="muted" style={{ margin: '0.5rem 0 0', fontSize: '0.82rem' }}>{vacioLabel}</p>;
  }

  const bloques = [
    ...grupos.map((g) => ({
      key: g.turnoId,
      titulo: g.turnoNombre,
      monto: g.monto,
      items: g.items,
    })),
  ];
  if (sinTurno.length) {
    bloques.push({
      key: 'sin-turno',
      titulo: 'Sin turno asignado',
      monto: sinTurno.reduce((a, r) => a + (Number(r.monto) || 0), 0),
      items: sinTurno,
    });
  }

  return (
    <div className="proyeccion-detalle-listas">
      {bloques.map((b) => (
        <div key={b.key} className="proyeccion-detalle-turno">
          <div className="proyeccion-detalle-turno-head">
            <strong>{b.titulo}</strong>
            <span className="muted">
              {b.items.length} · {fmtMxn(b.monto)}
            </span>
          </div>
          <ul className="proyeccion-detalle-ul">
            {b.items.map((it) => (
              <li key={it.id || `${it.producto_id}-${it.created_at}-${it.nombre}`}>
                <div className="proyeccion-detalle-linea">
                  <div>
                    <strong>{it.nombre || it.producto_id || 'Artículo'}</strong>
                    <div className="muted" style={{ fontSize: '0.72rem' }}>
                      {fmtHora(it.created_at)}
                      {it.producto_id ? ` · ${it.producto_id}` : ''}
                      {it.usuario ? ` · ${it.usuario}` : ''}
                      {it.motivo ? ` · ${it.motivo}` : ''}
                    </div>
                  </div>
                  <div className="proyeccion-detalle-montos">
                    <span>
                      {Number(it.qty) || 1} × {fmtMxn(it.precio)}
                    </span>
                    <strong>{fmtMxn(it.monto)}</strong>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export default function PanelProyeccionFaltante({ supabase, sucursal, inventario, onNavigateConfig }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [abierto, setAbierto] = useState(true);
  const [detalleId, setDetalleId] = useState(null);
  const [tickTurnos, setTickTurnos] = useState(0);

  const cargar = useCallback(async () => {
    if (esAlmacenCentral(sucursal)) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const r = await cargarProyeccionFaltante(supabase, { sucursal, inventario });
    setData(r);
    setLoading(false);
  }, [supabase, sucursal, inventario]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  useEffect(() => {
    const onCal = () => void cargar();
    window.addEventListener(EVENTO_CALENDARIO_INVENTARIO, onCal);
    const id = setInterval(() => void cargar(), 60000);
    return () => {
      window.removeEventListener(EVENTO_CALENDARIO_INVENTARIO, onCal);
      clearInterval(id);
    };
  }, [cargar]);

  useEffect(() => {
    const sync = () => setTickTurnos((n) => n + 1);
    window.addEventListener(EVENTO_TURNOS, sync);
    return () => window.removeEventListener(EVENTO_TURNOS, sync);
  }, []);

  if (esAlmacenCentral(sucursal)) return null;

  if (loading && !data) {
    return (
      <div className="card" style={{ borderLeft: '5px solid var(--brand-gold)' }}>
        <p className="muted" style={{ margin: 0 }}>Calculando proyección de faltante…</p>
      </div>
    );
  }

  if (data?.sinCalendario) {
    return (
      <div className="card" style={{ borderLeft: '5px solid var(--brand-gold)' }}>
        <h3 style={{ margin: '0 0 0.35rem', color: 'var(--brand-blue-dark)', fontSize: '1.05rem' }}>
          Proyección de faltante
        </h3>
        <p className="muted" style={{ margin: 0, fontSize: '0.9rem' }}>
          {data.error}{' '}
          {typeof onNavigateConfig === 'function' && (
            <button type="button" className="btn btn-ghost" style={{ padding: '0.2rem 0.45rem', fontSize: '0.85rem' }} onClick={onNavigateConfig}>
              Ir a Configuración
            </button>
          )}
        </p>
      </div>
    );
  }

  if (!data?.ok) return null;

  const urg = data.urgencia;
  const ciclo = data.ciclo;

  const toggleDetalle = (id) => {
    setDetalleId((cur) => (cur === id ? null : id));
  };

  return (
    <div
      className="card proyeccion-faltante-card"
      style={{
        borderLeft: `5px solid ${bordeUrgencia(urg.color)}`,
        background:
          urg.color === 'rojo'
            ? 'linear-gradient(135deg, rgba(255,49,49,0.1) 0%, #fff 55%)'
            : urg.color === 'naranja'
              ? 'linear-gradient(135deg, rgba(225,153,41,0.12) 0%, #fff 55%)'
              : 'linear-gradient(135deg, rgba(46,125,50,0.08) 0%, #fff 55%)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 220px' }}>
          <div className="muted" style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Icon name="alert" size={14} />
            Proyección de faltante · ciclo semanal
            <span className={claseConfianza(urg.color)} title={urg.label} />
          </div>
          <div
            className={`proyeccion-faltante-monto proyeccion-faltante-monto--${urg.color}`}
            style={{ fontSize: 'clamp(1.75rem, 4vw, 2.4rem)', fontWeight: 800, lineHeight: 1.1, marginTop: '0.4rem' }}
          >
            {fmtMxn(data.montoBruto)}
          </div>
          <p style={{ margin: '0.4rem 0 0', fontSize: '0.95rem', fontWeight: 600, color: 'var(--brand-blue-dark)' }}>
            {data.pctBruto.toFixed(2)}% del inventario en observación
            {data.valorInventario > 0 ? ` (${fmtMxn(data.valorInventario)})` : ''}
          </p>
          <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.85rem' }}>
            Proyección confiable (verde 100% + naranja 50% + rojo 0%):{' '}
            <strong>{fmtMxn(data.montoProyectado)}</strong> · {data.pctProyectado.toFixed(2)}%
          </p>
          <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.85rem' }}>
            {data.mensaje}
          </p>
          <p className="muted" style={{ margin: '0.25rem 0 0', fontSize: '0.8rem' }}>
            Inventario {ciclo.etiquetaDia} · último {ciclo.ymd} · próximo {ciclo.proximoYmd}
            {ciclo.esHoyInventario ? ' · HOY' : ''}
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className={`proyeccion-urgencia-badge proyeccion-urgencia-badge--${urg.color}`}>{urg.label}</div>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ marginTop: '0.65rem', fontSize: '0.8rem', padding: '0.3rem 0.55rem' }}
            onClick={() => setAbierto((v) => !v)}
          >
            {abierto ? 'Ocultar desglose' : 'Ver desglose'}
          </button>
        </div>
      </div>

      {abierto && (
        <div style={{ marginTop: '1rem' }}>
          <p style={{ margin: '0 0 0.65rem', fontSize: '0.88rem', color: 'var(--brand-blue-dark)' }}>
            Si no haces bien el proceso de venta, este monto <strong>sigue creciendo</strong> hasta el próximo inventario.
            Usa el desglose para verificar en el conteo qué tan confiable es el método.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '0.65rem' }}>
            {data.desglose.map((s) => {
              const items = itemsDeSenal(data, s.id);
              const abiertoDetalle = detalleId === s.id;
              const labelBtn =
                s.id === 'carrito'
                  ? 'Artículos quitados'
                  : s.id === 'cancelacion'
                    ? 'Cancelaciones'
                    : 'Checador de precio';
              return (
                <div
                  key={s.id}
                  style={{
                    padding: '0.75rem 0.85rem',
                    borderRadius: '10px',
                    border: '1px solid var(--border)',
                    background: 'rgba(255,255,255,0.92)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.35rem' }}>
                    <span className={claseConfianza(s.color)} />
                    <strong style={{ fontSize: '0.88rem' }}>{s.titulo}</strong>
                  </div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 750 }}>{fmtMxn(s.monto)}</div>
                  <div className="muted" style={{ fontSize: '0.78rem', marginTop: '0.2rem' }}>
                    {s.eventos} evento(s) · confianza {s.confianzaPct}% · aporta {fmtMxn(s.montoPonderado)}
                  </div>
                  <div className="muted" style={{ fontSize: '0.72rem', marginTop: '0.35rem', lineHeight: 1.35 }}>
                    {s.detalle}
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ marginTop: '0.55rem', width: '100%', fontSize: '0.8rem', padding: '0.4rem 0.5rem' }}
                    onClick={() => toggleDetalle(s.id)}
                  >
                    {abiertoDetalle ? `Ocultar ${labelBtn.toLowerCase()}` : `Ver ${labelBtn.toLowerCase()} por turno`}
                    {items.length ? ` (${items.length})` : ''}
                  </button>
                  {abiertoDetalle && (
                    <ListaPorTurno
                      items={items}
                      tickTurnos={tickTurnos}
                      vacioLabel={
                        s.id === 'carrito'
                          ? 'No hay artículos quitados del carrito en este ciclo.'
                          : s.id === 'cancelacion'
                            ? 'No hay cancelaciones en este ciclo.'
                            : 'No hay consultas de precio en este ciclo.'
                      }
                    />
                  )}
                </div>
              );
            })}
          </div>
          <div className="muted" style={{ marginTop: '0.75rem', fontSize: '0.78rem' }}>
            Observación bruta (sin peso): {fmtMxn(data.montoBruto)} ({data.pctBruto.toFixed(2)}% del inventario)
            {data.desglose.find((d) => d.id === 'precio')?.monto > 0
              ? ` · checador en rojo: ${fmtMxn(data.desglose.find((d) => d.id === 'precio').monto)} (no suma a la proyección confiable; sí alerta operación).`
              : '.'}
            {data.avisos?.length ? ` · ${data.avisos[0]}` : ''}
            {data.soloLocal ? ' · Datos locales / nube pendiente.' : ''}
          </div>
        </div>
      )}
    </div>
  );
}
