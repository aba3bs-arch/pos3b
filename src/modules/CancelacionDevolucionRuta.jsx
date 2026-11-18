import React, { useCallback, useEffect, useState } from 'react';
import { fmtMonto } from '../lib/consultasUi.js';
import {
  opcionesDevolucionCuetes,
  solicitarDevolucionCuetes,
} from '../lib/devolucionCuetesRuta.js';
import { listarCuentasFinAnio, listarMovimientosFinAnio } from '../lib/creditoFinAnio.js';
import {
  AVISO_FALTA_CANCELACIONES,
  aprobarCancelacionVentaConPin,
  listarCancelacionesPendientes,
  rechazarCancelacionVentaConPin,
  repararTransitosCancelacionesAprobadas,
  solicitarCancelacionVentaRuta,
} from '../lib/rutaCancelaciones.js';
import { listarVentasRuta } from '../lib/ventaEnRuta.js';
import { normalizarRol } from '../lib/roles.js';
import InputPin from '../components/InputPin.jsx';
import VisorTutorialModal from '../components/VisorTutorialModal.jsx';
import { TUTORIAL_CANCELACION_RUTA } from '../content/tutorialCancelacionRuta.js';

const COLOR = '#b91c1c';

/**
 * Venta en Ruta → Cancelación / Devolución.
 * Solicita cancelar una venta (efectivo, crédito o mixto); un admin aprueba con PIN.
 * Admin/Gerente también pueden aprobar desde esta pantalla (no solo por notificación).
 */
export default function CancelacionDevolucionRuta({
  supabase,
  user,
  setAviso,
  onVolver,
}) {
  const [ventas, setVentas] = useState([]);
  const [cuetes, setCuetes] = useState([]);
  const [pendientes, setPendientes] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [ventaId, setVentaId] = useState('');
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [tick, setTick] = useState(0);
  const [pinAdmin, setPinAdmin] = useState('');
  const [aprobandoId, setAprobandoId] = useState(null);
  const [tutorialAbierto, setTutorialAbierto] = useState(false);

  const rol = normalizarRol(user?.rol);
  const esAdminPin = rol === 'Administrador' || rol === 'Gerente';

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
      const [v, p, cuentas, movs] = await Promise.all([
        listarVentasRuta(supabase, { limit: 80 }),
        listarCancelacionesPendientes(supabase, { limit: 40 }),
        listarCuentasFinAnio(supabase),
        listarMovimientosFinAnio(supabase),
      ]);
      if (v.aviso || v.error) setAviso?.(v.aviso || v.error);
      if (p.aviso) setAviso?.(p.aviso);
      if (cuentas.error && !cuentas.faltaTabla) setAviso?.(cuentas.error);
      if (movs.error && !movs.faltaTabla) setAviso?.(movs.error);
      const activas = (v.data || []).filter(
        (x) => String(x.estado || '').toLowerCase() !== 'cancelada'
          && !(Array.isArray(x.articulos) && x.articulos.some((a) => a && a._cancelada)),
      );
      const pendientesLista = p.data || [];
      const ocupados = new Set(
        pendientesLista
          .filter((s) => s?.meta?.tipo === 'cuetes')
          .map((s) => `${s.meta.cuenta_id}|${s.meta.clave}`),
      );
      const opciones = opcionesDevolucionCuetes(cuentas.data, movs.data)
        .filter((o) => !ocupados.has(`${o.cuentaId}|${o.clave}`));
      setVentas(activas);
      setCuetes(opciones);
      setPendientes(pendientesLista);
    } finally {
      setCargando(false);
    }
  }, [supabase, setAviso]);

  useEffect(() => {
    void cargar();
  }, [cargar, tick]);

  const ventaSel = ventas.find((v) => String(v.id) === String(ventaId)) || null;
  const cueteSel = cuetes.find((c) => String(c.id) === String(ventaId)) || null;

  const solicitar = async () => {
    if (!ventaId) return alert('Selecciona una venta o un cuete.');
    if (!motivo.trim()) return alert('Indica el motivo de la cancelación.');
    const texto = cueteSel
      ? `¿Solicitar devolución de ${cueteSel.cantidad} pza de ${cueteSel.nombre || cueteSel.codigo}?\n`
        + 'Un administrador debe aprobar con PIN.\n'
        + `Sale de la cuenta de la tienda y regresa al camión de ${cueteSel.repartidorNombre || 'el repartidor'}.`
      : `¿Solicitar cancelación de ${ventaSel?.folio || ventaId}?\n`
        + 'Un administrador debe aprobar con PIN.\n'
        + 'Se devolverá inventario y se eliminará la venta, crédito/efectivo y compra en todos lados.';
    if (!confirm(texto)) return;
    setEnviando(true);
    try {
      const r = cueteSel
        ? await solicitarDevolucionCuetes(supabase, {
          opcion: cueteSel,
          motivo: motivo.trim(),
          solicitadoPor: user?.nombre || null,
          solicitadoPorId: user?.id || null,
        })
        : await solicitarCancelacionVentaRuta(supabase, {
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
      alert(cueteSel
        ? `Solicitud enviada. Al aprobar, ${cueteSel.cantidad} pza regresan al camión${r.camionNombre ? ` de ${r.camionNombre}` : ''}.`
        : 'Solicitud enviada. El administrador debe aprobar con PIN en la notificación o aquí abajo.');
      setMotivo('');
      setVentaId('');
      setTick((t) => t + 1);
    } finally {
      setEnviando(false);
    }
  };

  const resumenResultado = (res = {}) => {
    const partes = [];
    if (res.cuetes) {
      partes.push(`camión de ${res.camionNombre || 'repartidor'} +${res.piezas || 0} pza`);
      partes.push('cuenta de cuetes');
    } else if (res.camion?.length) partes.push(`camión ${res.camion.length} línea(s)`);
    if (res.inventarioTienda?.aplicados) partes.push(`tienda −${res.inventarioTienda.aplicados} prod.`);
    if (res.creditos?.eliminados) partes.push(`crédito ×${res.creditos.eliminados}`);
    if (res.transito?.eliminado) partes.push('efectivo RC quitado');
    if (res.compra?.eliminada || res.compra?.cancelada) partes.push('compra eliminada');
    if (res.venta?.eliminada || res.venta?.ok) partes.push('venta eliminada');
    return partes;
  };

  const aprobarPendiente = async (sol) => {
    if (!esAdminPin || !sol?.id) return;
    if (!pinAdmin || String(pinAdmin).length < 4) {
      return alert('Ingresa el PIN de administrador para aprobar.');
    }
    const esCuete = sol?.meta?.tipo === 'cuetes' || String(sol?.metodo_pago || '').toLowerCase() === 'cuetes';
    if (!confirm(esCuete
      ? `¿Aprobar devolución ${sol.folio_venta}?\n`
        + 'Los cuetes salen de la cuenta de la tienda y regresan al camión del repartidor.'
      : `¿Aprobar cancelación ${sol.folio_venta}?\n`
        + 'Se revertirá inventario, crédito/mixto y efectivo RC, y se borrará la venta.',
    )) return;
    setAprobandoId(sol.id);
    try {
      const r = await aprobarCancelacionVentaConPin(supabase, {
        cancelacionId: sol.id,
        pin: pinAdmin,
      });
      if (!r.ok) {
        alert(r.error || 'No se pudo aprobar.');
        return;
      }
      const partes = resumenResultado(r.resultado || {});
      if (!partes.length) {
        alert(
          `Cancelación marcada, pero no se detectaron reversiones.\n`
          + 'Revisa inventario / créditos / RC.\n'
          + (r.admin || ''),
        );
      } else {
        alert(
          `Cancelación aplicada · ${r.resultado?.folio || sol.folio_venta}\n`
          + `${partes.join(' · ')}\n${r.admin || 'admin'}`,
        );
      }
      setPinAdmin('');
      setTick((t) => t + 1);
    } finally {
      setAprobandoId(null);
    }
  };

  const rechazarPendiente = async (sol) => {
    if (!esAdminPin || !sol?.id) return;
    if (!pinAdmin || String(pinAdmin).length < 4) {
      return alert('Ingresa el PIN para rechazar.');
    }
    const motivoR = window.prompt('Motivo del rechazo (opcional):') || '';
    setAprobandoId(sol.id);
    try {
      const r = await rechazarCancelacionVentaConPin(supabase, {
        cancelacionId: sol.id,
        pin: pinAdmin,
        motivo: motivoR,
      });
      if (!r.ok) {
        alert(r.error || 'No se pudo rechazar.');
        return;
      }
      setPinAdmin('');
      setTick((t) => t + 1);
    } finally {
      setAprobandoId(null);
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
            La mercancía de <strong>cuetes</strong> dejada en la tienda también se devuelve aquí:
            sale de la cuenta y regresa al camión del repartidor.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ fontSize: '0.8rem' }}
            onClick={() => setTutorialAbierto(true)}
          >
            Ver tutorial
          </button>
          {onVolver ? (
            <button type="button" className="btn btn-ghost" onClick={onVolver}>← Volver</button>
          ) : null}
        </div>
      </div>

      <div style={{ marginTop: '1rem', display: 'grid', gap: '0.75rem', maxWidth: 560 }}>
        <label style={{ fontSize: '0.85rem' }}>
          Venta o cuetes a devolver
          <select
            className="input"
            style={{ marginTop: '0.35rem', width: '100%' }}
            value={ventaId}
            onChange={(e) => setVentaId(e.target.value)}
            disabled={cargando || enviando}
          >
            <option value="">— Elige folio —</option>
            {cuetes.length ? (
              <optgroup label="Cuetes (regresan al camión)">
                {cuetes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.etiqueta} · {fmtMonto(c.valor)}
                  </option>
                ))}
              </optgroup>
            ) : null}
            {ventas.map((v) => (
              <option key={v.id} value={v.id}>
                {v.folio || String(v.id).slice(0, 8)} · {v.cliente_nombre || v.cliente_id || '—'} ·{' '}
                {v.metodo_pago || '—'} · {fmtMonto(v.total)}
              </option>
            ))}
          </select>
        </label>

        {cueteSel ? (
          <div
            style={{
              padding: '0.65rem 0.75rem',
              borderRadius: 8,
              background: 'rgba(185,28,28,0.06)',
              border: '1px solid #fecaca',
              fontSize: '0.84rem',
            }}
          >
            <div><strong>{cueteSel.folio}</strong> · Cuetes</div>
            <div className="muted">
              {cueteSel.nombre || cueteSel.codigo} · {cueteSel.cantidad} pza
              {cueteSel.repartidorNombre ? ` · dejó ${cueteSel.repartidorNombre}` : ''}
            </div>
            <div style={{ marginTop: 4 }}>
              {fmtMonto(cueteSel.valor)} · al aprobar regresan al camión del repartidor
            </div>
          </div>
        ) : null}

        {ventaSel && !cueteSel ? (
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
            placeholder={cueteSel
              ? 'Ej. Se dejaron los cuetes en la tienda equivocada'
              : 'Ej. Venta a crédito por error a la tienda equivocada'}
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
          {enviando ? 'Enviando…' : (cueteSel ? 'Solicitar devolución al camión (PIN admin)' : 'Solicitar cancelación (PIN admin)')}
        </button>
      </div>

      <div style={{ marginTop: '1.5rem' }}>
        <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.95rem' }}>Pendientes de aprobación</h4>
        {esAdminPin && pendientes.length > 0 ? (
          <label style={{ display: 'block', marginBottom: '0.65rem', fontSize: '0.85rem', maxWidth: 280 }}>
            PIN admin para aprobar / rechazar
            <InputPin
              value={pinAdmin}
              onChange={(e) => setPinAdmin(e.target.value)}
              style={{ marginTop: '0.35rem', width: '100%' }}
            />
          </label>
        ) : null}
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
                  <th>Pago</th>
                  <th>Total</th>
                  <th>Solicitó</th>
                  {esAdminPin ? <th>Acción</th> : null}
                </tr>
              </thead>
              <tbody>
                {pendientes.map((c) => (
                  <tr key={c.id}>
                    <td><strong>{c.folio_venta}</strong></td>
                    <td className="muted">{fmtFecha(c.created_at)}</td>
                    <td>{c.cliente_nombre || c.cliente_id || '—'}</td>
                    <td className="muted">{c.metodo_pago || '—'}</td>
                    <td>{fmtMonto(c.total)}</td>
                    <td className="muted">{c.solicitado_por || '—'}</td>
                    {esAdminPin ? (
                      <td>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className="btn btn-primary"
                            style={{
                              background: COLOR,
                              borderColor: COLOR,
                              padding: '0.25rem 0.55rem',
                              fontSize: '0.78rem',
                            }}
                            disabled={!!aprobandoId}
                            onClick={() => void aprobarPendiente(c)}
                          >
                            {aprobandoId === c.id ? '…' : 'Aprobar'}
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            style={{ padding: '0.25rem 0.55rem', fontSize: '0.78rem' }}
                            disabled={!!aprobandoId}
                            onClick={() => void rechazarPendiente(c)}
                          >
                            Rechazar
                          </button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!esAdminPin && pendientes.length > 0 ? (
          <p className="muted" style={{ marginTop: '0.5rem', fontSize: '0.78rem' }}>
            Esperando PIN de administrador (notificación flotante o usuario admin en esta pantalla).
          </p>
        ) : null}
      </div>

      <VisorTutorialModal
        abierto={tutorialAbierto}
        tutorial={TUTORIAL_CANCELACION_RUTA}
        onCerrar={() => setTutorialAbierto(false)}
      />
    </div>
  );
}
