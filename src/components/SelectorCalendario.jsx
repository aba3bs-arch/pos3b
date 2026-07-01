import React, { useEffect, useRef, useState } from 'react';
import {
  buildCalendarDays,
  DIAS_ES,
  fmtFechaCalendario,
  MESES_ES,
  parseYmd,
  toYmd,
} from '../lib/fechas.js';

export default function SelectorCalendario({
  value,
  onChange,
  label,
  min,
  max,
  placeholder = 'Elegir fecha',
  className = '',
  disabled = false,
}) {
  const [abierto, setAbierto] = useState(false);
  const wrapRef = useRef(null);
  const parsed = parseYmd(value);
  const [vistaMes, setVistaMes] = useState(() => parsed || new Date());

  useEffect(() => {
    if (abierto) setVistaMes(parsed || new Date());
  }, [abierto, value, parsed]);

  useEffect(() => {
    if (!abierto) return undefined;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setAbierto(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [abierto]);

  const hoy = toYmd(new Date());
  const y = vistaMes.getFullYear();
  const m = vistaMes.getMonth();
  const dias = buildCalendarDays(y, m);

  const fueraDeRango = (ymd) => (min && ymd < min) || (max && ymd > max);

  const seleccionar = (ymd) => {
    if (!ymd || fueraDeRango(ymd)) return;
    onChange(ymd);
    setAbierto(false);
  };

  const mesAnterior = () => setVistaMes(new Date(y, m - 1, 1));
  const mesSiguiente = () => setVistaMes(new Date(y, m + 1, 1));

  return (
    <div className={`cal-picker-wrap ${className}`} ref={wrapRef}>
      {label ? <span className="cal-picker-label muted">{label}</span> : null}
      <button
        type="button"
        className="cal-picker-btn"
        onClick={() => !disabled && setAbierto((o) => !o)}
        disabled={disabled}
        aria-expanded={abierto}
        aria-haspopup="dialog"
      >
        <span className="cal-picker-icon" aria-hidden>
          📅
        </span>
        <span className="cal-picker-text">{value ? fmtFechaCalendario(value) : placeholder}</span>
      </button>
      {abierto && (
        <div className="cal-picker-pop" role="dialog" aria-label={label || 'Calendario'}>
          <div className="cal-picker-head">
            <button type="button" className="cal-picker-nav" onClick={mesAnterior} aria-label="Mes anterior">
              ‹
            </button>
            <span className="cal-picker-title">
              {MESES_ES[m]} {y}
            </span>
            <button type="button" className="cal-picker-nav" onClick={mesSiguiente} aria-label="Mes siguiente">
              ›
            </button>
          </div>
          <div className="cal-picker-dow">
            {DIAS_ES.map((d) => (
              <span key={d} className="cal-picker-dow-cell">
                {d}
              </span>
            ))}
          </div>
          <div className="cal-picker-grid">
            {dias.map((ymd, i) =>
              ymd ? (
                <button
                  key={ymd}
                  type="button"
                  className={[
                    'cal-picker-day',
                    value === ymd ? 'is-selected' : '',
                    hoy === ymd ? 'is-today' : '',
                    fueraDeRango(ymd) ? 'is-disabled' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => seleccionar(ymd)}
                  disabled={fueraDeRango(ymd)}
                >
                  {parseYmd(ymd)?.getDate()}
                </button>
              ) : (
                <span key={`e-${i}`} className="cal-picker-day cal-picker-day--empty" />
              ),
            )}
          </div>
          <div className="cal-picker-foot">
            <button type="button" className="cal-picker-today" onClick={() => seleccionar(hoy)} disabled={fueraDeRango(hoy)}>
              Hoy
            </button>
            {value ? (
              <button type="button" className="cal-picker-clear" onClick={() => { onChange(''); setAbierto(false); }}>
                Limpiar
              </button>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
