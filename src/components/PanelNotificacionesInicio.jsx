import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  EVENTO_NOTIFICACIONES,
  agruparNotificacionesPorSucursal,
  contarNotificacionesPendientes,
  etiquetaTipoNotificacion,
  TIPOS_NOTIF,
} from '../lib/contabilidadNotificaciones.js';
import { normalizarRol, puedeAbrirBandejaIncidencias, puedeVerTodasIncidencias } from '../lib/roles.js';
import { esSocioAprobadorPrestamo } from '../lib/contabilidadConstants.js';
import { etiquetaTienda } from '../constants/sucursales.js';
import { BtnLabel } from './Icon.jsx';

function filtrarParaUsuario(notifs, { esAdmin, esGerente, esSocio }) {
  if (esAdmin || esGerente) return notifs;
  if (esSocio) return notifs.filter((n) => n.tipo === TIPOS_NOTIF.PRESTAMO_SOCIO);
  return notifs;
}

export default function PanelNotificacionesInicio({ supabase, sucursal, user, onNavigate, puedeModulo }) {
  const rol = normalizarRol(user?.rol);
  const esAdmin = rol === 'Administrador';
  const esGerente = rol === 'Gerente';
  const esSocio = esSocioAprobadorPrestamo(user?.nombre);
  const veTodasTiendas = puedeVerTodasIncidencias(rol, user?.id, sucursal) || esAdmin || esGerente;
  const puedeVer = esAdmin || esGerente || esSocio || rol === 'Supervisor' || puedeAbrirBandejaIncidencias(rol, user?.id);

  const [notifs, setNotifs] = useState([]);
  const [aviso, setAviso] = useState('');

  const refrescar = useCallback(async () => {
    if (!supabase || !puedeVer) {
      setNotifs([]);
      return;
    }
    const nRes = await contarNotificacionesPendientes(supabase, {
      sucursal: veTodasTiendas ? undefined : sucursal,
      todasTiendas: veTodasTiendas,
    });
    if (nRes.aviso) setAviso(nRes.aviso);
    else setAviso('');
    setNotifs(filtrarParaUsuario(nRes.data || [], { esAdmin, esGerente, esSocio }));
  }, [supabase, sucursal, puedeVer, veTodasTiendas, esAdmin, esGerente, esSocio]);

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

  const total = notifs.length;
  const agrupado = useMemo(() => agruparNotificacionesPorSucursal(notifs), [notifs]);

  const resumenPorTipo = useMemo(() => {
    const m = new Map();
    for (const n of notifs) {
      const k = n.tipo;
      m.set(k, (m.get(k) || 0) + 1);
    }
    return m;
  }, [notifs]);

  if (!puedeVer || total === 0) return null;

  const puedeIncidencias = typeof puedeModulo === 'function' ? puedeModulo('Incidencias') : true;
  const puedeVales = typeof puedeModulo === 'function' ? puedeModulo('Vales y Préstamos') : false;

  return (
    <div
      className="card"
      style={{
        borderLeft: '5px solid var(--danger)',
        background: 'linear-gradient(135deg, #fff5f5 0%, #fff 55%)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0, color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            🔔 {total} pendiente{total !== 1 ? 's' : ''}
            {veTodasTiendas ? ' · todas las tiendas' : ` · ${etiquetaTienda(sucursal)}`}
          </h3>
          <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.88rem' }}>
            Vales, préstamos e incidencias que requieren atención.
          </p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {puedeAbrirBandejaIncidencias(rol, user?.id) && puedeIncidencias && (
            <button type="button" className="btn btn-primary" onClick={() => onNavigate('Incidencias')}>
              <BtnLabel icon="alert">Abrir incidencias</BtnLabel>
            </button>
          )}
          {puedeVales && (notifs.some((n) => n.tipo !== TIPOS_NOTIF.INCIDENCIA) || !(puedeAbrirBandejaIncidencias(rol, user?.id) && puedeIncidencias)) && (
            <button type="button" className="btn btn-gold" onClick={() => onNavigate('Vales y Préstamos', { pestana: 'pendientes' })}>
              Vales y préstamos
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.85rem' }}>
        {[...resumenPorTipo.entries()].map(([tipo, n]) => (
          <span key={tipo} className="badge" style={{ background: 'rgba(220,38,38,0.12)', color: 'var(--danger)' }}>
            {etiquetaTipoNotificacion(tipo)}: {n}
          </span>
        ))}
      </div>

      {veTodasTiendas && agrupado.size > 0 && (
        <div style={{ marginTop: '1rem', display: 'grid', gap: '0.65rem' }}>
          {[...agrupado.entries()].map(([tienda, lista]) => (
            <div
              key={tienda}
              style={{
                padding: '0.65rem 0.85rem',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'rgba(255,255,255,0.9)',
              }}
            >
              <strong>{etiquetaTienda(tienda)}</strong>
              <span className="muted" style={{ marginLeft: '0.5rem', fontSize: '0.85rem' }}>
                {lista.length} notificación{lista.length !== 1 ? 'es' : ''}
              </span>
              <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.1rem', fontSize: '0.88rem' }}>
                {lista.slice(0, 4).map((n) => (
                  <li key={n.id}>
                    <span className="muted">{etiquetaTipoNotificacion(n.tipo)} · </span>
                    {n.titulo}
                  </li>
                ))}
                {lista.length > 4 && <li className="muted">… y {lista.length - 4} más</li>}
              </ul>
            </div>
          ))}
        </div>
      )}

      {aviso && (
        <p className="muted" style={{ margin: '0.75rem 0 0', fontSize: '0.82rem', color: 'var(--brand-gold-dark)' }}>
          {aviso}
        </p>
      )}
    </div>
  );
}
