import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { etiquetaTienda } from '../constants/sucursales.js';
import {
  aprobarSolicitudAbonoFinAnio,
  listarSolicitudesAbonoDeRepartidor,
  rechazarSolicitudAbonoFinAnio,
} from '../lib/creditoFinAnioAbonoAprobacion.js';
import { fmtMonto } from '../lib/consultasUi.js';
import { mostrarNotificacionDispositivo } from '../lib/notificacionesDispositivo.js';
import { aliasesDeSesion } from '../lib/rutaCxcAprobacion.js';
import { resolverRepartidorId } from '../lib/rutaTransito.js';
import InputPin from './InputPin.jsx';
import PortalFlotante from './PortalFlotante.jsx';

const INTERVALO_MS = 20_000;

/**
 * Aviso al repartidor: el cajero le entrega un abono de fin de año.
 * Sin su PIN no se registra el abono ni el gasto.
 */
export default function AlertaAbonoFinAnioOverlay({ supabase, user, sesion = null }) {
  const sesionBase = useMemo(() => {
    if (sesion?.id) return sesion;
    if (user?.id) return { id: user.id, usuario_id: user.id, nombre: user.nombre, sucursal_id: user.sucursal_id };
    return null;
  }, [sesion, user]);
  const [repartidorId, setRepartidorId] = useState(null);
  const [lista, setLista] = useState([]);
  const [pin, setPin] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState('');
  const pospuestas = useRef(new Set());

  useEffect(() => {
    setRepartidorId(null);
    if (!supabase || !sesionBase?.id || sesionBase.repartidor_id) return undefined;
    let vigente = true;
    resolverRepartidorId(supabase, sesionBase.id, sesionBase.nombre).then((r) => {
      if (vigente && r?.ok) setRepartidorId(r.id);
    }).catch(() => {});
    return () => { vigente = false; };
  }, [supabase, sesionBase]);

  const aliases = useMemo(
    () => aliasesDeSesion({ ...sesionBase, aliases: repartidorId ? [repartidorId] : [] }),
    [sesionBase, repartidorId],
  );
  const llaveAliases = aliases.join('|');

  const cargar = useCallback(async () => {
    if (!supabase || !aliases.length) { setLista([]); return; }
    const r = await listarSolicitudesAbonoDeRepartidor(supabase, aliases);
    if (!r.ok) return;
    setLista(r.data);
    r.data.forEach((s) => {
      void mostrarNotificacionDispositivo({
        id: `abono-fin-anio-${s.id}`,
        titulo: 'Aprobar abono de fin de año',
        mensaje: `${etiquetaTienda(s.sucursal_id)}: ${fmtMonto(s.monto)} · cajero ${s.cajero_nombre}`,
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, llaveAliases]);

  useEffect(() => {
    void cargar();
    if (!aliases.length) return undefined;
    const t = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void cargar();
    }, INTERVALO_MS);
    const alVolver = () => { if (document.visibilityState === 'visible') void cargar(); };
    document.addEventListener('visibilitychange', alVolver);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', alVolver); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargar, llaveAliases]);

  const visibles = lista.filter((s) => !pospuestas.current.has(s.id));
  if (!visibles.length) return null;
  const actual = visibles[0];

  const responder = async (aprobar) => {
    if (procesando) return;
    if (String(pin).length < 4) { setError('Ingresa tu PIN de repartidor.'); return; }
    let motivo = '';
    if (!aprobar) motivo = window.prompt('Motivo del rechazo (opcional):') || '';
    setProcesando(true);
    setError('');
    try {
      const sesionCompleta = { ...sesionBase, aliases: repartidorId ? [repartidorId] : [] };
      const r = aprobar
        ? await aprobarSolicitudAbonoFinAnio(supabase, { solicitudId: actual.id, pin, sesion: sesionCompleta })
        : await rechazarSolicitudAbonoFinAnio(supabase, { solicitudId: actual.id, pin, sesion: sesionCompleta, motivo });
      if (!r.ok) { setError(r.error || 'No se pudo completar.'); return; }
      if (r.aviso) window.alert(r.aviso);
      setPin('');
      await cargar();
    } catch (e) {
      setError(e?.message || 'No se pudo completar. Reintenta.');
    } finally {
      setProcesando(false);
    }
  };

  return (
    <PortalFlotante>
      <div className="anuncio-pos-backdrop" role="dialog" aria-modal="true" aria-labelledby="aprob-abono-fin-titulo" style={{ zIndex: 12030 }}>
        <div className="card" style={{ maxWidth: 460, width: '100%', borderTop: '5px solid #3730a3', boxShadow: '0 12px 40px rgba(0,0,0,0.35)', position: 'relative' }}>
          <button
            type="button"
            className="btn btn-ghost"
            aria-label="Cerrar"
            title="Cerrar (la solicitud sigue pendiente)"
            style={{ position: 'absolute', top: 8, right: 8, minWidth: 36, padding: '0.25rem 0.5rem', fontSize: '1.1rem', lineHeight: 1 }}
            onClick={() => { pospuestas.current.add(actual.id); setPin(''); setError(''); setLista((p) => [...p]); }}
          >×</button>
          <p className="muted" style={{ margin: 0, fontSize: '0.75rem', fontWeight: 700, letterSpacing: 0.4, paddingRight: 36 }}>
            ABONO FIN DE AÑO{visibles.length > 1 ? ` · +${visibles.length - 1} más` : ''}
          </p>
          <h2 id="aprob-abono-fin-titulo" style={{ margin: '0.35rem 0 0.5rem', color: '#3730a3', fontSize: '1.15rem' }}>
            Recibes {fmtMonto(actual.monto)}
          </h2>
          <p style={{ margin: 0, lineHeight: 1.5 }}>
            El cajero <strong>{actual.cajero_nombre}</strong> te entrega este abono de <strong>{etiquetaTienda(actual.sucursal_id)}</strong>.
            {actual.notas ? ` Nota: ${actual.notas}.` : ''}
          </p>
          <label style={{ display: 'block', marginTop: '0.9rem', fontSize: '0.85rem' }}>
            Tu PIN de repartidor
            <InputPin
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              autoFocus
              style={{ marginTop: '0.35rem' }}
              onKeyDown={(e) => { if (e.key === 'Enter') void responder(true); }}
            />
          </label>
          {error ? (
            <p role="alert" style={{ margin: '0.65rem 0 0', padding: '0.5rem 0.65rem', borderRadius: 8, background: 'rgba(185,28,28,0.12)', color: '#991b1b', fontSize: '0.85rem' }}>{error}</p>
          ) : null}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.85rem' }}>
            <button type="button" className="btn btn-primary" disabled={procesando} onClick={() => void responder(true)} style={{ flex: '1 1 150px' }}>
              {procesando ? 'Procesando…' : 'Aprobar con PIN'}
            </button>
            <button type="button" className="btn btn-ghost" disabled={procesando} onClick={() => void responder(false)} style={{ flex: '1 1 110px' }}>
              Rechazar
            </button>
          </div>
          <p className="muted" style={{ margin: '0.65rem 0 0', fontSize: '0.75rem' }}>
            Si apruebas, el dinero se anota en gastos de Abarrotes. Si rechazas, se cancela y no se registra nada.
          </p>
        </div>
      </div>
    </PortalFlotante>
  );
}
