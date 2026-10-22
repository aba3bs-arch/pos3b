import React, { useMemo } from 'react';
import { construirLineaTiempo, fmtFechaHoraContratacion } from '../lib/contratacionEstatus.js';

const COLORES = {
  hecho: { punto: '#16a34a', texto: 'inherit', etiqueta: 'Listo' },
  actual: { punto: '#d4af37', texto: 'inherit', etiqueta: 'En curso' },
  pendiente: { punto: '#cbd5e1', texto: '#94a3b8', etiqueta: 'Pendiente' },
  rechazado: { punto: '#b91c1c', texto: '#b91c1c', etiqueta: 'Rechazado aquí' },
  omitido: { punto: '#e2e8f0', texto: '#cbd5e1', etiqueta: 'No aplica' },
};

const TONOS = {
  ok: { fondo: 'rgba(34,197,94,0.10)', borde: 'rgba(34,197,94,0.45)' },
  info: { fondo: 'rgba(212,175,55,0.12)', borde: 'rgba(212,175,55,0.5)' },
  mal: { fondo: 'rgba(185,28,28,0.08)', borde: 'rgba(185,28,28,0.4)' },
};

function Punto({ estado }) {
  const c = COLORES[estado] || COLORES.pendiente;
  const marca = estado === 'hecho' ? '✓' : estado === 'rechazado' ? '✕' : estado === 'actual' ? '●' : '';
  return (
    <span
      aria-hidden="true"
      style={{
        width: 24,
        height: 24,
        borderRadius: '50%',
        background: c.punto,
        color: '#fff',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '0.75rem',
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {marca}
    </span>
  );
}

/**
 * Línea de tiempo del proceso de reclutamiento.
 * La ven igual el candidato (portal) y el encargado (módulo Contratación).
 */
export default function LineaTiempoContratacion({ solicitud, mostrarMensajes = true }) {
  const linea = useMemo(() => construirLineaTiempo(solicitud), [solicitud]);
  if (!linea) return null;
  const tono = TONOS[linea.resumen.tono] || TONOS.info;

  return (
    <div style={{ display: 'grid', gap: '0.85rem', textAlign: 'left' }}>
      <div
        role="status"
        style={{
          padding: '0.8rem 0.95rem',
          borderRadius: 12,
          background: tono.fondo,
          border: `1px solid ${tono.borde}`,
        }}
      >
        <strong style={{ display: 'block', fontSize: '1.05rem' }}>{linea.resumen.titulo}</strong>
        <span style={{ fontSize: '0.92rem', lineHeight: 1.4 }}>{linea.resumen.texto}</span>
        {linea.resumen.detalle ? (
          <p style={{ margin: '0.4rem 0 0', fontSize: '0.88rem' }}>
            <strong>Motivo:</strong> {linea.resumen.detalle}
          </p>
        ) : null}
      </div>

      <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {linea.pasos.map((p, i) => {
          const c = COLORES[p.estado] || COLORES.pendiente;
          const ultimo = i === linea.pasos.length - 1;
          return (
            <li key={p.id} style={{ display: 'flex', gap: '0.7rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <Punto estado={p.estado} />
                {!ultimo && (
                  <span
                    aria-hidden="true"
                    style={{
                      flex: 1,
                      width: 2,
                      minHeight: 18,
                      background: p.estado === 'hecho' ? '#16a34a' : '#e2e8f0',
                    }}
                  />
                )}
              </div>
              <div style={{ paddingBottom: ultimo ? 0 : '0.85rem', color: c.texto, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                  {p.label}
                  <span style={{ marginLeft: '0.45rem', fontSize: '0.72rem', fontWeight: 500, opacity: 0.8 }}>
                    {c.etiqueta}
                  </span>
                </div>
                {p.fecha ? <div style={{ fontSize: '0.85rem' }}>{p.fecha}</div> : null}
                {p.detalles.map((d) => (
                  <div key={d} style={{ fontSize: '0.82rem', opacity: 0.85 }}>{d}</div>
                ))}
                {p.estado === 'rechazado' && linea.rechazo?.motivo ? (
                  <div style={{ fontSize: '0.84rem', marginTop: '0.15rem' }}>Motivo: {linea.rechazo.motivo}</div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      {mostrarMensajes && linea.mensajes.length > 0 && (
        <div>
          <strong style={{ fontSize: '0.9rem' }}>Mensajes de contratación</strong>
          <div style={{ display: 'grid', gap: '0.4rem', marginTop: '0.4rem' }}>
            {linea.mensajes.map((m) => (
              <div
                key={m.id || m.at}
                style={{
                  padding: '0.55rem 0.7rem',
                  borderRadius: 10,
                  background: 'rgba(100,116,139,0.1)',
                  fontSize: '0.88rem',
                }}
              >
                <div>{m.texto}</div>
                <div className="muted" style={{ fontSize: '0.74rem', marginTop: '0.2rem' }}>
                  {fmtFechaHoraContratacion(m.at)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
