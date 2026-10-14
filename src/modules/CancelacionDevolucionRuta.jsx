import React, { useCallback, useEffect, useState } from 'react';
import { fmtMonto } from '../lib/consultasUi.js';
import {
  AVISO_FALTA_CANCELACIONES,
  listarCancelacionesPendientes,
  repararTransitosCancelacionesAprobadas,
  solicitarCancelacionVentaRuta,
} from '../lib/rutaCancelaciones.js';
import { listarVentasRuta } from '../lib/ventaEnRuta.js';

const COLOR = '#b91c1c';

/**
 * Venta en Ruta → Cancelación / Devolución.
 * Solicita cancelar una venta (efectivo, crédito o mixto); un admin aprueba con PIN.
 */
export default function CancelacionDevolucionRuta({
  supabase,
  user,
  setAviso,
  onVolver,
}) {
  const [ventas, setVentas] = useState([]);
  const [pendientes, setPendientes] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [ventaId, setVentaId] = useState('');
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [tick, setTick] = useState(0);

  const cargar = useCallback(async () => {
    if (!supabase) return;
    setCargando(true);
    try {
      // Repara cancelaciones aprobadas que no limpiaron venta/crédito/RC/inventario.
      try {
        await repararTransitosCancelacionesAprobadas(supabase, { limit: 80 });
      } catch {
        /* no bloquear la pantalla */
      }
      const [v, p] = await Promise.all([
        listarVentasRuta(supabase, { limit: 80 }),
        listarCancelacionesPendientes(supabase, { limit: 40 }),
      ]);
      if (v.aviso || v.error) setAviso?.(v.aviso || v.error);
      if (p.aviso) setAviso?.(p.aviso);
      const activas = (v.data || []).filter(
        (x) => String(x.estado || '').toLowerCase() !== 'cancelada'
          && !(Array.isArray(x.articulos) && x.articulos.some((a) => a && a._cancelada)),
      );
      setVentas(activas);
      setPendientes(p.data || []);
    } finally {
      setCargando(false);
    }
  }, [supabase, setAviso]);

  useEffect(() => {
    void cargar();
  }, [cargar, tick]);

  const ventaSel = ventas.find((v) => String(v.id) === String(ventaId)) || null;

  const solicitar = async () => {
    if (!ventaId) return alert('Selecciona una venta.');
    if (!motivo.trim()) return alert('Indica el motivo de la cancelación.');
    if (!confirm(
      `¿Solicitar cancelación de ${ventaSel?.folio || ventaId}?\n`
      + 'Un administrador debe aprobar con PIN.\n'
      + 'Se devolverá inventario y se eliminará la venta, crédito/efectivo y compra en todos lados.',
    )) return;
    setEnviando(true);
    try {
      const r = await solicitarCancelacionVentaRuta(supabase, {
        ventaId,
        motivo: motivo.trim(),
        solicitadoPor: user?.nombre || null,
        solicitadoPorId: user?.id || null,
      });
      if (!r.ok) {
        alert(r.error || AVISO_FALTA_CANCELACIONES);
        if (r.aviso) setAviso?.(r.aviso);
        return;
      }
      alert('Solicitud enviada. El administrador debe aprobar con PIN en la notificación.');
      setMotivo('');
      setVentaId('');
      setTick((t) => t + 1);
    } finally {
      setEnviando(false);
    }
  };

  const fmtFecha = (iso) => {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
    } catch {
      return String(iso);
    }
  };

  return (
    <div className="card" style={{ borderTop: `4px solid ${COLOR}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: '0 0 0.35rem', color: COLOR }}>Cancelación / Devolución</h3>
          <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
            Si una venta (efectivo, crédito o mixto) se hizo por error, solicita cancelarla.
            Un <strong>administrador</strong> aprueba con PIN y se elimina en todos lados:
            primero devuelve inventario al camión (y descuenta piso si ya se recibió), luego
            borra crédito y/o efectivo, la compra y el registro de la venta.
          </p>
        </div>
        {onVolver ? (
          <button type="button" className="btn btn-ghost" onClick={onVolver}>← Volver</button>
        ) : null}
      </div>

      <div style={{ marginTop: '1rem', display: 'grid', gap: '0.75rem', maxWidth: 560 }}>
        <label style={{ fontSize: '0.85rem' }}>
          Venta a cancelar
          <select
            className="input"
            style={{ marginTop: '0.35rem', width: '100%' }}
            value={ventaId}
            onChange={(e) => setVentaId(e.target.value)}
            disabled={cargando || enviando}
          >
            <option value="">— Elige folio —</option>
            {ventas.map((v) => (
              <option key={v.id} value={v.id}>
                {v.folio || String(v.id).slice(0, 8)} · {v.cliente_nombre || v.cliente_id || '—'} ·{' '}
                {v.metodo_pago || '—'} · {fmtMonto(v.total)}
              </option>
            ))}
          </select>
        </label>

        {ventaSel ? (
          <div
            style={{
              padding: '0.65rem 0.75rem',
              borderRadius: 8,
              background: 'rgba(185,28,28,0.06)',
              border: '1px solid #fecaca',
              fontSize: '0.84rem',
            }}
          >
            <div><strong>{ventaSel.folio}</strong> · {fmtFecha(ventaSel.created_at)}</div>
            <div className="muted">
              {ventaSel.cliente_nombre || ventaSel.cliente_id} · {ventaSel.metodo_pago}
              {ventaSel.vendedor_nombre ? ` · ${ventaSel.vendedor_nombre}` : ''}
            </div>
            <div style={{ marginTop: 4 }}>
              Total {fmtMonto(ventaSel.total)}
              {ventaSel.transito_id ? ' · con efectivo RC/VentaRuta' : ''}
              {ventaSel.compra_id ? ' · con pedido Compras' : ''}
            </div>
          </div>
        ) : null}

        <label style={{ fontSize: '0.85rem' }}>
          Motivo
          <textarea
            className="input"
            rows={3}
            style={{ marginTop: '0.35rem', width: '100%', resize: 'vertical' }}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ej. Venta a crédito por error a la tienda equivocada"
            disabled={enviando}
          />
        </label>

        <button
          type="button"
          className="btn btn-primary"
          style={{ background: COLOR, borderColor: COLOR, justifySelf: 'start' }}
          disabled={enviando || !ventaId || !motivo.trim()}
          onClick={() => void solicitar()}
        >
          {enviando ? 'Enviando…' : 'Solicitar cancelación (PIN admin)'}
        </button>
      </div>

      <div style={{ marginTop: '1.5rem' }}>
        <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.95rem' }}>Pendientes de aprobación</h4>
        {cargando ? (
          <p className="muted">Cargando…</p>
        ) : !pendientes.length ? (
          <p className="muted" style={{ fontSize: '0.85rem' }}>No hay solicitudes pendientes.</p>
        ) : (
          <div className="table-wrap">
            <table className="consultas-table" style={{ fontSize: '0.84rem' }}>
              <thead>
                <tr>
                  <th>Folio</th>
                  <th>Fecha</th>
                  <th>Cliente</th>
                  <th>Total</th>
                  <th>Solicitó</th>
                </tr>
              </thead>
              <tbody>
                {pendientes.map((c) => (
                  <tr key={c.id}>
                    <td><strong>{c.folio_venta}</strong></td>
                    <td className="muted">{fmtFecha(c.created_at)}</td>
                    <td>{c.cliente_nombre || c.cliente_id || '—'}</td>
                    <td>{fmtMonto(c.total)}</td>
                    <td className="muted">{c.solicitado_por || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
