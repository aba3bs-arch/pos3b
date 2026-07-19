import React, { useEffect, useState } from 'react';

/** Zona IANA de Nogales, Sonora (sin horario de verano). */
export const TZ_NOGALES = 'America/Hermosillo';

const fmt = new Intl.DateTimeFormat('es-MX', {
  timeZone: TZ_NOGALES,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function formatearFechaHoraNogales(date = new Date()) {
  try {
    return fmt.format(date);
  } catch {
    return date.toLocaleString('es-MX');
  }
}

/** Reloj en vivo con fecha y hora de Nogales, Sonora. */
export default function RelojNogales({ className = '' }) {
  const [ahora, setAhora] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setAhora(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <time
      className={`app-header-reloj ${className}`.trim()}
      dateTime={ahora.toISOString()}
      title="Fecha y hora de Nogales, Sonora"
    >
      {formatearFechaHoraNogales(ahora)}
    </time>
  );
}
