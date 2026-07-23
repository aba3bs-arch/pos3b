import React, { useCallback, useEffect, useState } from 'react';
import { etiquetaTienda } from '../../constants/sucursales.js';
import {
  AVISO_FALTA_INVERSIONES_OFICINA,
  cobrarInversionEnCorte,
  listarInversionesOficina,
} from '../../lib/inversionesOficinaProveedor.js';

function fmt(n) {
  return `$${(Number(n) || 0).toFixed(2)}`;
}

/**
 * Pendientes de recuperación de inversión oficina→proveedor en el corte de la tienda.
 */
export default function CorteInversionesPanel({
  modulo,
  supabase,
  sucursal,
  user,
  habilitado = true,
  onCobrado,
}) {
  const [items, setItems] = useState([]);
  const [aviso, setAviso] = useState('');
  const [cargando, setCargando] = useState(false);
  const [trabajando, setTrabajando] = useState('');

  const cargar = useCallback(async () => {
    if (!supabase || !sucursal) {
      setItems([]);
      return;
    }
    setCargando(true);
    const res = await listarInversionesOficina(supabase, {
      sucursalDestino: sucursal,
      soloPendientes: true,
      limit: 50,
    });
    setAviso(res.aviso || '');
    const delModulo = (res.data || []).filter((i) => String(i.modulo_corte) === String(modulo));
    setItems(delModulo);
    setCargando(false);
  }, [supabase, sucursal, modulo]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const cobrar = async (inv, liquidar) => {
    if (!habilitado) return alert('No tienes permiso para cobrar en este corte.');
    const saldo = Number(inv.saldo) || 0;
    let monto = saldo;
    if (!liquidar) {
      const raw = window.prompt(`Abono a recuperar (saldo ${fmt(saldo)}):`, String(saldo));
      if (raw == null) return;
      monto = Number(raw);
      if (!(monto > 0)) return alert('Monto inválido.');
    } else if (!window.confirm(`¿Recuperar ${fmt(saldo)} de la caja de este corte?`)) {
      return;
    }
    setTrabajando(inv.id);
    const res = await cobrarInversionEnCorte(supabase, inv, monto, {
      sucursal,
      modulo,
      rolActor: user?.rol,
      nombreActor: user?.nombre,
    });
    setTrabajando('');
    if (!res.ok) return alert(res.error);
    alert(res.mensaje);
    await cargar();
    onCobrado?.(res);
  };

  if (aviso && !items.length && !cargando) {
    return (
      <div className="card" style={{ padding: '0.85rem' }}>
        <div className="muted" style={{ fontSize: '0.8rem' }}>{aviso || AVISO_FALTA_INVERSIONES_OFICINA}</div>
      </div>
    );
  }

  if (!items.length && !cargando) return null;

  return (
    <div className="card" style={{ padding: '0.85rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem', marginBottom: '0.65rem' }}>
        <h4 style={{ margin: 0 }}>Inversión oficina a recuperar</h4>
        <button type="button" className="btn" style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }} onClick={cargar} disabled={cargando}>
          {cargando ? '…' : 'Actualizar'}
        </button>
      </div>
      <p className="muted" style={{ margin: '0 0 0.65rem', fontSize: '0.78rem' }}>
        Oficina pagó al proveedor; al cobrar se descuenta de la caja de {etiquetaTienda(sucursal)}.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
        {items.map((inv) => (
          <div
            key={inv.id}
            style={{
              border: '1px solid var(--border, #e5e7eb)',
              borderRadius: 8,
              padding: '0.65rem 0.75rem',
              background: 'rgba(225,153,41,0.06)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
              <strong>{inv.proveedor_nombre || 'Proveedor'}</strong>
              <span style={{ fontWeight: 800, color: 'var(--brand-gold, #e19929)' }}>{fmt(inv.saldo)}</span>
            </div>
            <div className="muted" style={{ fontSize: '0.75rem', marginTop: 2 }}>
              {String(inv.fecha || '').slice(0, 10)}
              {inv.notas ? ` · ${inv.notas}` : ''}
              {Number(inv.abono) > 0 ? ` · Abonado ${fmt(inv.abono)}` : ''}
            </div>
            {habilitado && (
              <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn"
                  style={{ fontSize: '0.75rem', padding: '0.3rem 0.55rem' }}
                  disabled={!!trabajando}
                  onClick={() => cobrar(inv, false)}
                >
                  Abono
                </button>
                <button
                  type="button"
                  className="btn btn-gold"
                  style={{ fontSize: '0.75rem', padding: '0.3rem 0.55rem' }}
                  disabled={!!trabajando}
                  onClick={() => cobrar(inv, true)}
                >
                  Recuperar todo
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
