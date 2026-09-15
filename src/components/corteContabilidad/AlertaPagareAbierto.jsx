import React, { useState } from 'react';
import { fmtCorte } from '../../lib/corteContabilidad/useCorteContabilidad.js';
import {
  ETIQUETA_AREA_PAGARE,
  abonarPagare,
  liquidarPagare,
  montoPendienteRecoleccion,
  pagarePendienteCajero,
  pagarePendienteRecoleccion,
  puedeAbonarLiquidarPagare,
  saldoPagare,
} from '../../lib/pagares.js';

function montoPagareVisible(p) {
  if (pagarePendienteRecoleccion(p)) return montoPendienteRecoleccion(p);
  return saldoPagare(p);
}

/**
 * Recuadro de alerta en cortes: pagaré abierto del área.
 * Cajero / admin / gerente pueden Abonar o Liquidar aquí (misma lógica que Vales → Pagaré).
 * La alerta se oculta solo cuando el recolector marca Recolectar (u otro cierre de saldo).
 * Acreedor operativo: RC Virtual (“Pague a Virtual”).
 */
export default function AlertaPagareAbierto({
  pagares = [],
  area = '',
  visible = true,
  supabase = null,
  user = null,
  onCambio = null,
}) {
  const [busyId, setBusyId] = useState(null);
  const lista = Array.isArray(pagares) ? pagares : [];
  if (!visible || !lista.length) return null;

  const total = lista.reduce((acc, p) => acc + montoPagareVisible(p), 0);
  if (!(total > 0.001)) return null;

  const areaLbl = ETIQUETA_AREA_PAGARE[area] || String(area || '').toUpperCase() || 'ÁREA';
  const n = lista.length;
  const folioHint = n === 1
    ? (lista[0]?.folio ? ` · ${lista[0].folio}` : '')
    : ` · ${n} pagarés`;

  const acreedores = [...new Set(
    lista.map((p) => {
      const k = String(p?.area_acreedora || 'virtual').toLowerCase();
      return ETIQUETA_AREA_PAGARE[k] || k || 'Virtual';
    }),
  )];
  const acreedorLbl = acreedores.length === 1 ? acreedores[0] : acreedores.join(' / ');

  const puedeAcciones = Boolean(supabase) && puedeAbonarLiquidarPagare(user?.rol, user);
  const algunoPendienteCajero = lista.some(pagarePendienteCajero);
  const algunoPorRecolectar = lista.some(pagarePendienteRecoleccion);

  const refrescar = async () => {
    if (typeof onCambio === 'function') await onCambio();
  };

  const onAbonar = async (p) => {
    if (!puedeAcciones || busyId) return;
    const saldo = saldoPagare(p);
    const raw = window.prompt(
      `Abonar pagaré ${p.folio || ''}\nSaldo: $${saldo.toFixed(2)}\n\n¿Cuánto abonas?`,
      String(saldo),
    );
    if (raw === null) return;
    const monto = parseFloat(String(raw).replace(',', '.'));
    if (!(monto > 0)) {
      window.alert('Monto inválido.');
      return;
    }
    setBusyId(p.id);
    try {
      const res = await abonarPagare(supabase, p, monto, {
        nombreActor: user?.nombre,
        rolActor: user?.rol,
        user,
      });
      if (!res.ok) {
        window.alert(res.error);
        return;
      }
      window.alert(res.mensaje);
      await refrescar();
    } finally {
      setBusyId(null);
    }
  };

  const onLiquidar = async (p) => {
    if (!puedeAcciones || busyId) return;
    const saldo = saldoPagare(p);
    if (!window.confirm(
      `¿Liquidar pagaré ${p.folio || ''} por $${saldo.toFixed(2)}?\n\n`
      + 'Confirma que ya tienes el total. Quedará solo para recolección en RC Virtual → Pagaré.',
    )) return;
    setBusyId(p.id);
    try {
      const res = await liquidarPagare(supabase, p, {
        nombreActor: user?.nombre,
        rolActor: user?.rol,
        user,
      });
      if (!res.ok) {
        window.alert(res.error);
        return;
      }
      window.alert(res.mensaje);
      await refrescar();
    } finally {
      setBusyId(null);
    }
  };

  let hint = 'La alerta se quita cuando un recolector pulse Recolectar (Vales → Pagaré / RC Virtual).';
  if (puedeAcciones && algunoPendienteCajero) {
    hint = 'Abona o liquida aquí con el efectivo de caja. La alerta se quita cuando un recolector pulse Recolectar.';
  } else if (algunoPorRecolectar && !algunoPendienteCajero) {
    hint = 'Ya liquidado por caja. Pendiente de recolección (RC Virtual → Pagaré).';
  }

  return (
    <div className="alerta-pagare-abierto" role="alert" aria-live="assertive">
      <div className="alerta-pagare-abierto__titulo">
        PAGARÉ ABIERTO · {String(areaLbl).toUpperCase()}
        {folioHint}
      </div>
      <div className="alerta-pagare-abierto__monto">{fmtCorte(total)}</div>
      <div className="alerta-pagare-abierto__acreedor">
        Debe a: <strong>{acreedorLbl}</strong>
        <span className="alerta-pagare-abierto__acreedor-alt"> · Pague a {acreedorLbl}</span>
      </div>

      {lista.map((p) => {
        const pendienteCajero = pagarePendienteCajero(p);
        const pendienteRec = pagarePendienteRecoleccion(p);
        const saldo = montoPagareVisible(p);
        const busy = busyId === p.id;
        return (
          <div key={p.id || p.folio} className="alerta-pagare-abierto__item">
            {n > 1 || pendienteRec ? (
              <div className="alerta-pagare-abierto__item-meta">
                <span>{p.folio || 'Sin folio'}</span>
                <span>{fmtCorte(saldo)}</span>
                {pendienteRec ? (
                  <span className="alerta-pagare-abierto__badge">Por recolectar</span>
                ) : null}
              </div>
            ) : null}
            {puedeAcciones && pendienteCajero ? (
              <div className="alerta-pagare-abierto__acciones">
                <button
                  type="button"
                  className="btn btn-ghost alerta-pagare-abierto__btn"
                  disabled={Boolean(busyId)}
                  onClick={() => { void onAbonar(p); }}
                >
                  {busy ? '…' : 'Abonar'}
                </button>
                <button
                  type="button"
                  className="btn btn-primary alerta-pagare-abierto__btn"
                  disabled={Boolean(busyId)}
                  onClick={() => { void onLiquidar(p); }}
                >
                  {busy ? '…' : 'Liquidar'}
                </button>
              </div>
            ) : null}
          </div>
        );
      })}

      <div className="alerta-pagare-abierto__hint">{hint}</div>
    </div>
  );
}
