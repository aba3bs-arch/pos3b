import React from 'react';
import { esAlmacenCentral, etiquetaTienda } from '../../constants/sucursales.js';
import { puedeCambiarTiendaLibremente } from '../../lib/roles.js';

/** Indica qué tienda alimenta el corte y avisa si MAIN no tiene datos de sucursal. */
export default function CorteSucursalAviso({ sucursal, user }) {
  const enMain = esAlmacenCentral(sucursal);
  const puedeCambiar = puedeCambiarTiendaLibremente(user?.rol);

  return (
    <div style={{ marginBottom: '0.75rem' }}>
      <span className="badge" style={{ fontSize: '0.82rem' }}>
        Tienda del corte: {etiquetaTienda(sucursal)}
      </span>
      {enMain && puedeCambiar && (
        <p className="muted" style={{ margin: '0.5rem 0 0', fontSize: '0.82rem' }}>
          Los cortes Virtual, Abarrotes y Garage se guardan <strong>por sucursal</strong>. En MAIN no verás los de 3B2, 3B5, etc.
          Cambia la tienda en el encabezado superior para operar el corte de esa sucursal.
        </p>
      )}
    </div>
  );
}
