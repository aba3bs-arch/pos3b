import React, { useCallback, useEffect, useRef, useState } from 'react';
import { etiquetaTienda } from '../constants/sucursales.js';
import { EVENTO_NOTIFICACIONES, EVENTO_NOTIFICACION_DISPOSITIVO } from '../lib/contabilidadNotificaciones.js';
import { esPrestamoArrendatario } from '../lib/beneficiariosExternos.js';
import { esAndresMarrero } from '../lib/roles.js';
import {
  ESTADO_ABB_FJBB,
  ESTADO_DESEMBOLSO,
  ESTADO_VISTO_BUENO,
  METODO_PAGO_NOMINA,
  autorizarPrestamoAbbFjbb,
  darVistoBuenoPrestamo,
  desembolsarPrestamo,
  listarMovimientosFondo,
  puedeAutorizarPrestamoAbbFjbb,
  puedeDarVistoBuenoPrestamo,
  puedeDesembolsarPrestamo,
  resumenFondoPrestamos,
} from '../lib/fondoPrestamos.js';
import { fmtMonto } from '../lib/consultasUi.js';
import PortalFlotante from './PortalFlotante.jsx';

function pasoDe(prestamo, user) {
  const estado = prestamo?.estado;
  if ((estado === ESTADO_VISTO_BUENO || estado === 'pendiente_admin') && puedeDarVistoBuenoPrestamo(user)) {
    return 'visto';
  }
  if ((estado === ESTADO_ABB_FJBB || estado === 'pendiente_socio') && puedeAutorizarPrestamoAbbFjbb(user)) {
    return 'autorizar';
  }
  if (estado === ESTADO_DESEMBOLSO && puedeDesembolsarPrestamo(user)) return 'desembolso';
  return null;
}

const TITULO = {
  visto: 'Visto bueno del préstamo',
  autorizar: 'Autorizar préstamo',
  desembolso: 'Desembolso del préstamo',
};

/**
 * Ventana flotante: visto bueno, autorización ABB/FJBB o desembolso de JLBB.
 * Cada acción queda en el préstamo (historial de Vales y préstamos).
 */
export default function AlertaPrestamoOverlay({ supabase, user, sucursal }) {
  const [prestamo, setPrestamo] = useState(null);
  const [capital, setCapital] = useState(0);
  const [procesando, setProcesando] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const pospuestasRef = useRef(new Set());
  const puede = puedeDarVistoBuenoPrestamo(user)
    || puedeAutorizarPrestamoAbbFjbb(user)
    || puedeDesembolsarPrestamo(user);

  const cargar = useCallback(async () => {
    if (!supabase || !puede) {
      setPrestamo(null);
      return;
    }
    const estados = [];
    if (puedeDarVistoBuenoPrestamo(user)) estados.push(ESTADO_VISTO_BUENO, 'pendiente_admin');
    if (puedeAutorizarPrestamoAbbFjbb(user)) estados.push(ESTADO_ABB_FJBB, 'pendiente_socio');
    if (puedeDesembolsarPrestamo(user)) estados.push(ESTADO_DESEMBOLSO);
    let { data, error } = await supabase
      .from('prestamos')
      .select('*')
      .in('estado', estados)
      .is('archived_at', null)
      .order('created_at', { ascending: true })
      .limit(40);
    if (error && /archived_at|schema cache|column/i.test(String(error.message || ''))) {
      ({ data, error } = await supabase.from('prestamos').select('*').in('estado', estados).order('created_at', { ascending: true }).limit(40));
    }
    if (error) return;
    const sucSesion = String(sucursal || '').toUpperCase();
    const veTodas = user?.es_admin_principal === true || esAndresMarrero(user) || sucSesion === 'MAIN' || !sucSesion;
    const lista = (data || []).filter((p) => {
      if (!p || esPrestamoArrendatario(p) || pospuestasRef.current.has(String(p.id))) return false;
      const paso = pasoDe(p, user);
      if (!paso) return false;
      if (paso === 'visto' && !veTodas && String(p.sucursal_id || '').toUpperCase() !== sucSesion) return false;
      return true;
    });
    const actual = lista[0] || null;
    setPrestamo(actual);
    if (actual && pasoDe(actual, user) === 'desembolso') {
      const movs = await listarMovimientosFondo(supabase);
      setCapital(resumenFondoPrestamos(movs.data).capital);
    }
  }, [supabase, user, puede, sucursal]);

  useEffect(() => {
    void cargar();
    if (!puede) return undefined;
    const t = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void cargar();
    }, 20_000);
    const onEvt = () => void cargar();
    window.addEventListener(EVENTO_NOTIFICACIONES, onEvt);
    window.addEventListener(EVENTO_NOTIFICACION_DISPOSITIVO, onEvt);
    return () => {
      clearInterval(t);
      window.removeEventListener(EVENTO_NOTIFICACIONES, onEvt);
      window.removeEventListener(EVENTO_NOTIFICACION_DISPOSITIVO, onEvt);
    };
  }, [cargar, puede]);

  if (!prestamo) return null;
  const paso = pasoDe(prestamo, user);
  if (!paso) return null;
  const monto = Number(prestamo.monto_original) || 0;
  const alcanza = capital + 0.001 >= monto;

  const cerrar = () => {
    pospuestasRef.current.add(String(prestamo.id));
    setErrorMsg('');
    setPrestamo(null);
  };

  const confirmar = async () => {
    if (procesando) return;
    setErrorMsg('');
    setProcesando(true);
    const opts = { user, nombre: user?.nombre };
    const res = paso === 'visto'
      ? await darVistoBuenoPrestamo(supabase, prestamo.id, opts)
      : paso === 'autorizar'
        ? await autorizarPrestamoAbbFjbb(supabase, prestamo.id, opts)
        : await desembolsarPrestamo(supabase, prestamo.id, opts);
    setProcesando(false);
    if (!res.ok) {
      setErrorMsg(res.error || 'No se pudo registrar.');
      return;
    }
    setPrestamo(null);
    await cargar();
  };

  return (
    <PortalFlotante>
      <div className="anuncio-pos-backdrop" role="dialog" aria-modal="true" aria-labelledby="alerta-prestamo-titulo" style={{ zIndex: 12020 }}>
        <div className="card" style={{ maxWidth: 460, width: '100%', borderTop: '5px solid #b45309', boxShadow: '0 12px 40px rgba(0,0,0,0.35)', position: 'relative' }}>
          <button type="button" className="btn btn-ghost" aria-label="Cerrar" onClick={cerrar} style={{ position: 'absolute', top: 8, right: 8, minWidth: 36, padding: '0.25rem 0.5rem' }}>
            ×
          </button>
          <p className="muted" style={{ margin: 0, fontSize: '0.75rem', fontWeight: 700, paddingRight: 36 }}>
            {etiquetaTienda(prestamo.sucursal_id)} · electrónico
          </p>
          <h2 id="alerta-prestamo-titulo" style={{ margin: '0.35rem 0 0.75rem', color: '#b45309', fontSize: '1.15rem' }}>
            {TITULO[paso]}
          </h2>
          <div style={{ display: 'grid', gap: '0.45rem' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.85rem' }}>
              Nombre del empleado
              <input className="input" value={prestamo.nombre_empleado || ''} readOnly />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.85rem' }}>
              Monto del préstamo
              <input className="input" value={fmtMonto(monto)} readOnly />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.85rem' }}>
              Cuotas
              <input className="input" value={prestamo.num_cuotas || ''} readOnly />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.85rem' }}>
              Método de pago
              <input className="input" value={METODO_PAGO_NOMINA} readOnly />
            </label>
          </div>
          {paso === 'desembolso' && (
            <p className="muted" style={{ margin: '0.6rem 0 0', fontSize: '0.82rem' }}>
              Capital disponible: <strong>{fmtMonto(capital)}</strong>
              {!alcanza ? '. No alcanza para este desembolso.' : ''}
            </p>
          )}
          {errorMsg && <p style={{ color: 'var(--danger)', margin: '0.55rem 0 0', fontSize: '0.85rem' }}>{errorMsg}</p>}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.85rem' }}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={procesando || (paso === 'desembolso' && !alcanza)}
              onClick={() => void confirmar()}
            >
              {paso === 'visto' ? 'Dar visto bueno' : paso === 'autorizar' ? 'Autorizar' : 'Desembolsar'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={cerrar}>Ahora no</button>
          </div>
        </div>
      </div>
    </PortalFlotante>
  );
}
