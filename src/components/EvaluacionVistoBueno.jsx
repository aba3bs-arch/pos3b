import { useEffect, useState } from 'react';
import {
  FACTORES_EVALUACION_PRESTAMO,
  MINIMO_VISTO_BUENO,
  PUNTAJE_EVALUACION,
  calificarEvaluacionPrestamo,
  etiquetaOpcionEvaluacion,
  leerEvaluacionPrestamo,
} from '../lib/evaluacionPrestamo.js';
import PortalFlotante from './PortalFlotante.jsx';

export function EvaluacionVistoBuenoForm({ value = {}, onChange }) {
  const cal = calificarEvaluacionPrestamo(value);
  const color = !cal.completo ? 'var(--muted)' : cal.aprobado ? '#1b7f3a' : 'var(--danger, #c0392b)';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
      <p className="muted" style={{ margin: 0, fontSize: '0.8rem' }}>
        Califica los 5 factores. Cada uno vale igual: Excelente {PUNTAJE_EVALUACION.excelente},
        Buena {PUNTAJE_EVALUACION.buena}, Deficiente o Por mejorar {PUNTAJE_EVALUACION.deficiente}.
        El visto bueno pide al menos <strong>{MINIMO_VISTO_BUENO}%</strong>.
      </p>
      {FACTORES_EVALUACION_PRESTAMO.map((factor, i) => (
        <label key={factor.id} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.85rem' }}>
          {i + 1}. {factor.label}
          <select
            className="input"
            value={value[factor.id] || ''}
            onChange={(e) => onChange?.({ ...value, [factor.id]: e.target.value })}
          >
            <option value="">— Califica —</option>
            {factor.opciones.map((op) => (
              <option key={op.id} value={op.id}>{op.label}</option>
            ))}
          </select>
        </label>
      ))}
      <p style={{ margin: 0, fontWeight: 800, color }}>
        {cal.completo
          ? `Resultado: ${cal.porcentaje}%${cal.aprobado ? ' · cumple para visto bueno' : ` · falta para el ${MINIMO_VISTO_BUENO}%`}`
          : 'Resultado: falta calificar los 5 factores'}
      </p>
    </div>
  );
}

export function VentanaVistoBuenoPrestamo({ prestamo, onCerrar, onConfirmar, procesando, error }) {
  const [value, setValue] = useState({});
  useEffect(() => { setValue({}); }, [prestamo?.id]);
  if (!prestamo) return null;
  const cal = calificarEvaluacionPrestamo(value);
  return (
    <PortalFlotante>
      <div className="anuncio-pos-backdrop" role="dialog" aria-modal="true" aria-labelledby="eval-visto-titulo" style={{ zIndex: 12030 }}>
        <div className="card" style={{ maxWidth: 520, width: '100%', maxHeight: '92vh', overflow: 'auto', borderTop: '5px solid #b45309' }}>
          <h2 id="eval-visto-titulo" style={{ margin: '0 0 0.35rem', color: '#b45309', fontSize: '1.15rem' }}>
            Visto bueno del préstamo
          </h2>
          <p style={{ margin: '0 0 0.75rem' }}>
            {prestamo.nombre_empleado} · ${Number(prestamo.monto_original || 0).toFixed(2)}
          </p>
          <EvaluacionVistoBuenoForm value={value} onChange={setValue} />
          {error ? <p style={{ color: 'var(--danger)', margin: '0.55rem 0 0', fontSize: '0.85rem' }}>{error}</p> : null}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.85rem' }}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={procesando || !cal.aprobado}
              onClick={() => onConfirmar?.(value)}
            >
              Dar visto bueno
            </button>
            <button type="button" className="btn btn-ghost" disabled={procesando} onClick={onCerrar}>
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </PortalFlotante>
  );
}

export function EvaluacionVistoBuenoResumen({ evaluacion }) {
  const ev = leerEvaluacionPrestamo(evaluacion);
  if (!ev) return <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.8rem' }}>Sin evaluación de visto bueno.</p>;
  return (
    <div style={{ marginTop: '0.35rem', fontSize: '0.8rem' }}>
      <div style={{ fontWeight: 800, color: ev.aprobado ? '#1b7f3a' : 'var(--danger, #c0392b)' }}>
        Evaluación {ev.porcentaje}%
      </div>
      <ul style={{ margin: '0.25rem 0 0', paddingLeft: '1.1rem' }}>
        {FACTORES_EVALUACION_PRESTAMO.map((f) => (
          <li key={f.id}>
            {f.label}: <strong>{etiquetaOpcionEvaluacion(ev.factores[f.id]) || '—'}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}
