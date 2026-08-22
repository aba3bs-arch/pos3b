import React, { useMemo, useRef, useState } from 'react';
import { hoyYmdNogales } from '../lib/corteCaja.js';
import { colorProgresoDia, etiquetaPeriodoDias, ymdDiaMes } from '../lib/barraDiasMes.js';

export { colorProgresoDia, etiquetaPeriodoDias, ymdDiaMes } from '../lib/barraDiasMes.js';

/**
 * Barra día a día del mes (1…N).
 * - Se rellena hasta “hoy” con gradiente rojo→naranja→verde.
 * - Clic: un día. Shift+clic o arrastre: rango.
 * - Clic otra vez en la misma selección: limpia (mes completo).
 */
export default function BarraDiasMes({
  anio,
  mes, // 0–11
  seleccion = null, // { start, end } | null
  onChange,
  className = '',
}) {
  const hoy = hoyYmdNogales();
  const [yHoy, mHoy, dHoy] = hoy.split('-').map(Number);
  const daysInMonth = new Date(anio, mes + 1, 0).getDate();
  const esMesActual = yHoy === anio && mHoy === mes + 1;
  const esMesFuturo = anio > yHoy || (anio === yHoy && mes + 1 > mHoy);
  const diaProgreso = esMesFuturo ? 0 : esMesActual ? dHoy : daysInMonth;

  const dragRef = useRef(null);
  const [dragPreview, setDragPreview] = useState(null);

  const activo = dragPreview || seleccion;

  const dias = useMemo(() => Array.from({ length: daysInMonth }, (_, i) => i + 1), [daysInMonth]);

  const enRango = (dia) => {
    if (!activo) return false;
    const a = Math.min(activo.start, activo.end);
    const b = Math.max(activo.start, activo.end);
    return dia >= a && dia <= b;
  };

  const aplicar = (start, end) => {
    const a = Math.min(start, end);
    const b = Math.max(start, end);
    if (seleccion && seleccion.start === a && seleccion.end === b) {
      onChange?.(null);
      return;
    }
    onChange?.({ start: a, end: b });
  };

  const onPointerDown = (dia, e) => {
    if (e.shiftKey && seleccion) {
      aplicar(seleccion.start, dia);
      return;
    }
    dragRef.current = { start: dia, moved: false };
    setDragPreview({ start: dia, end: dia });
  };

  const onPointerEnter = (dia) => {
    if (!dragRef.current) return;
    dragRef.current.moved = true;
    setDragPreview({ start: dragRef.current.start, end: dia });
  };

  const onPointerUp = (dia) => {
    if (!dragRef.current) return;
    const start = dragRef.current.start;
    const end = dragRef.current.moved ? dia : start;
    dragRef.current = null;
    setDragPreview(null);
    aplicar(start, end);
  };

  return (
    <div className={`cv-dias-bar ${className}`.trim()}>
      <div className="cv-dias-bar-meta">
        <span className="cv-dias-bar-periodo">
          {seleccion ? 'Viendo: ' : 'Mes: '}
          <strong>{etiquetaPeriodoDias(anio, mes, seleccion)}</strong>
        </span>
        {seleccion ? (
          <button type="button" className="cv-dias-bar-clear" onClick={() => onChange?.(null)}>
            Ver mes completo
          </button>
        ) : (
          <span className="cv-dias-bar-hint muted">
            Toca un día o arrastra varios · progreso {diaProgreso}/{daysInMonth}
          </span>
        )}
      </div>
      <div
        className="cv-dias-bar-track"
        onPointerUp={() => {
          if (dragRef.current && dragPreview) {
            const { start, end } = dragPreview;
            dragRef.current = null;
            setDragPreview(null);
            aplicar(start, end);
          }
        }}
      >
        {dias.map((dia) => {
          const pasadoOHoy = dia <= diaProgreso;
          const sel = enRango(dia);
          const esHoy = esMesActual && dia === dHoy;
          const style = pasadoOHoy
            ? { background: colorProgresoDia(dia - 1, daysInMonth), color: '#fff' }
            : undefined;
          return (
            <button
              key={dia}
              type="button"
              className={[
                'cv-dias-bar-day',
                pasadoOHoy ? 'filled' : 'future',
                sel ? 'selected' : '',
                esHoy ? 'today' : '',
              ].filter(Boolean).join(' ')}
              style={style}
              title={ymdDiaMes(anio, mes, dia)}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture?.(e.pointerId);
                onPointerDown(dia, e);
              }}
              onPointerEnter={() => onPointerEnter(dia)}
              onPointerUp={() => onPointerUp(dia)}
            >
              {dia}
            </button>
          );
        })}
      </div>
      <div className="cv-dias-bar-legend" aria-hidden>
        <span className="leg-start">Inicio del mes</span>
        <span className="leg-grad" />
        <span className="leg-end">Fin del mes</span>
      </div>
    </div>
  );
}
