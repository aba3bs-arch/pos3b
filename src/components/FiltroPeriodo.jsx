import React, { useMemo } from 'react';
import { PRESETS_FECHA_PRODUCTO, rangoDesdePreset } from '../lib/consultasInventario.js';
import { fmtFechaCorta } from '../lib/fechas.js';
import FiltroRangoCalendario from './FiltroRangoCalendario.jsx';

/**
 * Preset de periodo + calendario desplegable cuando el preset es "rango".
 */
export default function FiltroPeriodo({
  preset,
  onPresetChange,
  desde,
  hasta,
  onDesdeChange,
  onHastaChange,
  presets = PRESETS_FECHA_PRODUCTO,
  labelPeriodo = 'Periodo',
  className = '',
  style,
  mostrarResumen = true,
}) {
  const rangoResumen = useMemo(() => {
    if (preset === 'rango') return { desde, hasta };
    const r = rangoDesdePreset(preset);
    if (r?.desde && r?.hasta) return r;
    return { desde, hasta };
  }, [preset, desde, hasta]);

  return (
    <div className={className} style={style}>
      <label className="muted" style={{ display: 'block' }}>
        {labelPeriodo}
        <select className="select" style={{ marginTop: '0.35rem' }} value={preset} onChange={(e) => onPresetChange(e.target.value)}>
          {presets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      {preset === 'rango' ? (
        <FiltroRangoCalendario
          style={{ marginTop: '0.75rem' }}
          desde={desde}
          hasta={hasta}
          onDesdeChange={onDesdeChange}
          onHastaChange={onHastaChange}
        />
      ) : mostrarResumen && rangoResumen.desde && rangoResumen.hasta ? (
        <p className="muted" style={{ margin: '0.5rem 0 0', fontSize: '0.85rem' }}>
          {rangoResumen.desde === rangoResumen.hasta
            ? `Fecha: ${fmtFechaCorta(rangoResumen.desde)}`
            : `${fmtFechaCorta(rangoResumen.desde)} — ${fmtFechaCorta(rangoResumen.hasta)}`}
        </p>
      ) : null}
    </div>
  );
}
