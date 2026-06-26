import React, { useCallback, useEffect, useState } from 'react';
import { contarNotificacionesPendientes } from '../lib/contabilidadNotificaciones.js';
import { normalizarRol } from '../lib/roles.js';
import { esSocioAprobadorPrestamo } from '../lib/contabilidadConstants.js';

export default function BadgeNotificacionesContabilidad({ supabase, sucursal, user, onClick }) {
  const [count, setCount] = useState(0);
  const esAdmin = normalizarRol(user?.rol) === 'Administrador';
  const esSocio = esSocioAprobadorPrestamo(user?.nombre);

  const refrescar = useCallback(async () => {
    if (!supabase || (!esAdmin && !esSocio)) {
      setCount(0);
      return;
    }
    const res = await contarNotificacionesPendientes(supabase, { sucursal });
    let n = res.count || 0;
    if (esSocio && !esAdmin) {
      n = (res.data || []).filter((x) => x.tipo === 'prestamo_pendiente_socio').length;
    }
    setCount(n);
  }, [supabase, sucursal, esAdmin, esSocio]);

  useEffect(() => {
    refrescar();
    const id = setInterval(refrescar, 45_000);
    return () => clearInterval(id);
  }, [refrescar]);

  if (!count || (!esAdmin && !esSocio)) return null;

  return (
    <button
      type="button"
      className="btn btn-ghost"
      onClick={onClick}
      title="Pendientes de aprobar (vales / préstamos)"
      style={{ position: 'relative', padding: '0.4rem 0.65rem' }}
    >
      🔔
      <span
        style={{
          position: 'absolute',
          top: 2,
          right: 2,
          background: 'var(--danger)',
          color: '#fff',
          borderRadius: 999,
          fontSize: '0.65rem',
          fontWeight: 800,
          minWidth: 16,
          height: 16,
          lineHeight: '16px',
          textAlign: 'center',
        }}
      >
        {count > 9 ? '9+' : count}
      </span>
    </button>
  );
}
