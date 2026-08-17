import React, { useCallback, useEffect, useState } from 'react';
import {
  contarNotificacionesPendientes,
  EVENTO_NOTIFICACIONES,
} from '../lib/contabilidadNotificaciones.js';
import { normalizarRol, puedeVerBandejaPendientesIncidencias, puedeVerTodasIncidencias } from '../lib/roles.js';
import { esAprobadorRecoleccionIe, esSocioAprobadorPrestamo } from '../lib/contabilidadConstants.js';
import { esUsuarioMainNotificable, filtrarNotificacionesMiBuzon } from '../lib/buzonUsuario.js';

export default function BadgeNotificacionesContabilidad({ supabase, sucursal, user, onClick }) {
  const [count, setCount] = useState(0);
  const rol = normalizarRol(user?.rol);
  const esAdmin = rol === 'Administrador';
  const esGerente = rol === 'Gerente';
  const esSocio = esSocioAprobadorPrestamo(user?.nombre);
  const esAprobadorRecIe = esAprobadorRecoleccionIe(user?.nombre);
  const veTodasTiendas = puedeVerTodasIncidencias(rol, user?.id, sucursal) || esAdmin || esGerente || esAprobadorRecIe;
  const puedeVer =
    esUsuarioMainNotificable(user)
    || puedeVerBandejaPendientesIncidencias(rol, user?.id);

  const refrescar = useCallback(async () => {
    if (!supabase || !puedeVer) {
      setCount(0);
      return;
    }
    const nRes = await contarNotificacionesPendientes(supabase, {
      sucursal: veTodasTiendas ? undefined : sucursal,
      todasTiendas: veTodasTiendas,
    });
    // Badge = Mi buzón (lo que este usuario debe atender).
    const lista = filtrarNotificacionesMiBuzon(nRes.data || [], user, { verTodo: false });
    setCount(lista.length);
  }, [supabase, sucursal, puedeVer, veTodasTiendas, user]);

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

  if (!count || !puedeVer) return null;

  return (
    <button
      type="button"
      className="btn btn-ghost"
      onClick={onClick}
      title="Abrir Incidencias · pendientes a tu cargo"
      style={{ position: 'relative', padding: '0.4rem 0.65rem' }}
    >
      📬
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
