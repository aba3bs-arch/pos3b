import React from 'react';
import SelectorCalendario from './SelectorCalendario.jsx';

/** Dos selectores de calendario: desde / hasta. */
export default function FiltroRangoCalendario({
  desde,
  hasta,
  onDesdeChange,
  onHastaChange,
  labelDesde = 'Desde',
  labelHasta = 'Hasta',
  className = '',
  style,
}) {
  return (
    <div className={`cal-rango ${className}`} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end', ...style }}>
      <SelectorCalendario value={desde} onChange={onDesdeChange} label={labelDesde} max={hasta || undefined} />
      <SelectorCalendario value={hasta} onChange={onHastaChange} label={labelHasta} min={desde || undefined} />
    </div>
  );
}
