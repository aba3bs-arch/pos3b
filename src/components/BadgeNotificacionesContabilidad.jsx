import React, { useCallback, useEffect, useState } from 'react';
import {
  contarNotificacionesPendientes,
  EVENTO_NOTIFICACIONES,
  TIPOS_NOTIF,
} from '../lib/contabilidadNotificaciones.js';
import { normalizarRol } from '../lib/roles.js';
import { esSocioAprobadorPrestamo } from '../lib/contabilidadConstants.js';

export default function BadgeNotificacionesContabilidad({ supabase, sucursal, user, onClick }) {
  const [count, setCount] = useState(0);
  const rol = normalizarRol(user?.rol);
  const esAdmin = rol === 'Administrador';
  const esGerente = rol === 'Gerente';
  const esSocio = esSocioAprobadorPrestamo(user?.nombre);
  const veTodasTiendas = esAdmin || esGerente;

  const refrescar = useCallback(async () => {
    if (!supabase || (!esAdmin && !esGerente && !esSocio)) {
      setCount(0);
      return;
    }
    const nRes = await contarNotificacionesPendientes(supabase, {
      sucursal: veTodasTiendas ? undefined : sucursal,
      todasTiendas: veTodasTiendas,
    });
    let lista = nRes.data || [];
    if (esSocio && !esAdmin && !esGerente) {
      lista = lista.filter((x) => x.tipo === TIPOS_NOTIF.PRESTAMO_SOCIO);
    }
    setCount(lista.length);
  }, [supabase, sucursal, esAdmin, esGerente, esSocio, veTodasTiendas]);

  useEffect(() => {
    refrescar();
    const id = setInterval(refrescar, 45_000);
    const onEvt = () => refrescar();
    window.addEventListener(EVENTO_NOTIFICACIONES, onEvt);
    return () => {
      clearInterval(id);
      window.removeEventListener(EVENTO_NOTIFICACIONES, onEvt);
    };
  }, [refrescar]);

  if (!count || (!esAdmin && !esGerente && !esSocio)) return null;

  return (
    <button
      type="button"
      className="btn btn-ghost"
      onClick={onClick}
      title="Notificaciones pendientes (vales, préstamos, incidencias)"
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
