import React from 'react';

/** Etiqueta visible de caja en modo offline (solo Ventas). */
export function BannerModoOffline({
  pendientes = 0,
  syncing = false,
  ultimoSyncMsg = '',
  onSyncAhora,
}) {
  return (
    <div className="modo-offline-banner" role="status" aria-live="polite">
      <div className="modo-offline-banner__main">
        <span className="modo-offline-banner__pill">MODO OFFLINE</span>
        <span className="modo-offline-banner__txt">
          Sin internet · solo <strong>Ventas</strong> · inventario y cortes bloqueados
          {pendientes > 0 ? (
            <>
              {' '}
              · <strong>{pendientes}</strong> venta{pendientes === 1 ? '' : 's'} pendiente
              {pendientes === 1 ? '' : 's'} de sync
            </>
          ) : null}
        </span>
      </div>
      <div className="modo-offline-banner__actions">
        {syncing ? <span className="modo-offline-banner__sync">Sincronizando…</span> : null}
        {!syncing && ultimoSyncMsg ? (
          <span className="modo-offline-banner__msg">{ultimoSyncMsg}</span>
        ) : null}
        {typeof onSyncAhora === 'function' && pendientes > 0 ? (
          <button type="button" className="btn btn-ghost modo-offline-banner__btn" onClick={onSyncAhora}>
            Reintentar sync
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** Banner cuando ya hay red pero aún quedan ventas por subir. */
export function BannerSyncPendiente({ pendientes = 0, syncing = false, onSyncAhora }) {
  if (!pendientes && !syncing) return null;
  return (
    <div className="modo-offline-banner modo-offline-banner--sync" role="status">
      <span className="modo-offline-banner__pill modo-offline-banner__pill--ok">ONLINE</span>
      <span className="modo-offline-banner__txt">
        {syncing
          ? 'Subiendo ventas guardadas en offline…'
          : `${pendientes} venta(s) pendiente(s) de sincronizar`}
      </span>
      {typeof onSyncAhora === 'function' && !syncing ? (
        <button type="button" className="btn btn-ghost modo-offline-banner__btn" onClick={onSyncAhora}>
          Sincronizar ahora
        </button>
      ) : null}
    </div>
  );
}

export default BannerModoOffline;
