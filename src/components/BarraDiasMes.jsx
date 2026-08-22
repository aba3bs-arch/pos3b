import React, { useMemo, useRef, useState } from 'react';
import { hoyYmdNogales } from '../lib/corteCaja.js';
import {
  colorEstadoPanorama,
  diasEnMes,
  etiquetaPeriodoDias,
  normalizarSeleccionDias,
  pctProgresoMes,
  ymdDiaMes,
} from '../lib/barraDiasMes.js';

export {
  colorEstadoPanorama,
  colorProgresoDia,
  etiquetaPeriodoDias,
  ymdDiaMes,
} from '../lib/barraDiasMes.js';

/**
 * Barra continua del periodo (solo panorama IE Abarrotes).
 * - Relleno sólido con gradiente según ganancia neta (rojo / naranja / verde).
 * - Ancho = avance del mes hasta hoy.
 * - Filtros desde/hasta día (sin cuadritos).
 * - Clic o arrastre sobre la barra = seleccionar rango.
 */
export default function BarraDiasMes({
  anio,
  mes, // 0–11
  seleccion = null, // { start, end } | null
  onChange,
  gananciaNeta = 0,
  className = '',
}) {
  const hoy = hoyYmdNogales();
  const [yHoy, mHoy, dHoy] = hoy.split('-').map(Number);
  const daysInMonth = diasEnMes(anio, mes);
  const pctMes = pctProgresoMes(anio, mes, yHoy, mHoy, dHoy);
  const esMesActual = yHoy === anio && mHoy === mes + 1;
  const estado = colorEstadoPanorama(gananciaNeta);

  const trackRef = useRef(null);
  const dragRef = useRef(null);
  const [dragPreview, setDragPreview] = useState(null);

  const activo = dragPreview || seleccion;

  const optsDias = useMemo(
    () => Array.from({ length: daysInMonth }, (_, i) => i + 1),
    [daysInMonth],
  );

  const diaDesdeX = (clientX) => {
    const el = trackRef.current;
    if (!el) return 1;
    const rect = el.getBoundingClientRect();
    const x = Math.min(Math.max(clientX - rect.left, 0), rect.width);
    const ratio = rect.width <= 0 ? 0 : x / rect.width;
    return Math.max(1, Math.min(daysInMonth, Math.ceil(ratio * daysInMonth) || 1));
  };

  const aplicar = (start, end) => {
    const next = normalizarSeleccionDias(start, end, daysInMonth);
    if (seleccion && seleccion.start === next.start && seleccion.end === next.end) {
      onChange?.(null);
      return;
    }
    onChange?.(next);
  };

  const selLeft = activo
    ? ((Math.min(activo.start, activo.end) - 1) / daysInMonth) * 100
    : 0;
  const selWidth = activo
    ? ((Math.abs(activo.end - activo.start) + 1) / daysInMonth) * 100
    : 0;

  const onPointerDown = (e) => {
    if (e.button != null && e.button !== 0) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const dia = diaDesdeX(e.clientX);
    if (e.shiftKey && seleccion) {
      aplicar(seleccion.start, dia);
      return;
    }
    dragRef.current = { start: dia };
    setDragPreview({ start: dia, end: dia });
  };

  const onPointerMove = (e) => {
    if (!dragRef.current) return;
    const dia = diaDesdeX(e.clientX);
    setDragPreview({ start: dragRef.current.start, end: dia });
  };

  const onPointerUp = (e) => {
    if (!dragRef.current) return;
    const end = diaDesdeX(e.clientX);
    const start = dragRef.current.start;
    dragRef.current = null;
    setDragPreview(null);
    aplicar(start, end);
  };

  const setDesde = (v) => {
    const start = Number(v);
    const end = seleccion ? seleccion.end : start;
    onChange?.(normalizarSeleccionDias(start, end, daysInMonth));
  };

  const setHasta = (v) => {
    const end = Number(v);
    const start = seleccion ? seleccion.start : end;
    onChange?.(normalizarSeleccionDias(start, end, daysInMonth));
  };

  return (
    <div className={`cv-dias-bar cv-dias-bar--solida ${className}`.trim()}>
      <div className="cv-dias-bar-meta">
        <span className="cv-dias-bar-periodo">
          {seleccion ? 'Viendo: ' : 'Periodo: '}
          <strong>{etiquetaPeriodoDias(anio, mes, seleccion)}</strong>
        </span>
        <span className="cv-dias-bar-estado" title={`Ganancia neta del panorama: ${gananciaNeta}`}>
          {estado.label}
        </span>
        {seleccion ? (
          <button type="button" className="cv-dias-bar-clear" onClick={() => onChange?.(null)}>
            Ver mes completo
          </button>
        ) : null}
      </div>

      <div
        ref={trackRef}
        className="cv-dias-bar-track-solid"
        role="slider"
        aria-valuemin={1}
        aria-valuemax={daysInMonth}
        aria-valuenow={activo ? Math.max(activo.start, activo.end) : (esMesActual ? dHoy : daysInMonth)}
        aria-label="Avance del mes y filtro de días"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          dragRef.current = null;
          setDragPreview(null);
        }}
      >
        <div
          className="cv-dias-bar-fill"
          style={{ width: `${pctMes}%`, background: estado.fill }}
        />
        {activo ? (
          <div
            className="cv-dias-bar-sel"
            style={{ left: `${selLeft}%`, width: `${selWidth}%` }}
            title={`${ymdDiaMes(anio, mes, Math.min(activo.start, activo.end))} → ${ymdDiaMes(anio, mes, Math.max(activo.start, activo.end))}`}
          />
        ) : null}
        {esMesActual && pctMes > 0 && pctMes < 100 ? (
          <div className="cv-dias-bar-hoy-mark" style={{ left: `${pctMes}%` }} title={`Hoy · día ${dHoy}`} />
        ) : null}
      </div>

      <div className="cv-dias-bar-scale" aria-hidden>
        <span>1</span>
        <span>{esMesActual ? `Hoy ${dHoy}` : ''}</span>
        <span>{daysInMonth}</span>
      </div>

      <div className="cv-dias-bar-filtros">
        <label>
          Desde día
          <select
            value={seleccion ? seleccion.start : ''}
            onChange={(e) => {
              if (!e.target.value) {
                onChange?.(null);
                return;
              }
              setDesde(e.target.value);
            }}
          >
            <option value="">Mes</option>
            {optsDias.map((d) => (
              <option key={`d-${d}`} value={d}>{d}</option>
            ))}
          </select>
        </label>
        <label>
          Hasta día
          <select
            value={seleccion ? seleccion.end : ''}
            onChange={(e) => {
              if (!e.target.value) {
                onChange?.(null);
                return;
              }
              setHasta(e.target.value);
            }}
          >
            <option value="">Mes</option>
            {optsDias.map((d) => (
              <option key={`h-${d}`} value={d}>{d}</option>
            ))}
          </select>
        </label>
        <span className="cv-dias-bar-hint muted">
          Arrastra la barra o elige días · color = estado del panorama
        </span>
      </div>
    </div>
  );
}
