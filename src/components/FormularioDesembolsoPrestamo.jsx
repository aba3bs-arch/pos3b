import React, { useCallback, useEffect, useState } from 'react';
import {
  desembolsarPrestamo,
  listarMovimientosFondo,
  METODO_PAGO_NOMINA,
  puedeDesembolsarPrestamo,
  resumenFondoPrestamos,
} from '../lib/fondoPrestamos.js';
import { fmtMonto } from '../lib/consultasUi.js';

/** Formulario corto para que JLBB desembolse desde el capital. */
export default function FormularioDesembolsoPrestamo({ prestamo, capital, onDesembolsar, guardando }) {
  if (!prestamo) return null;
  const monto = Number(prestamo.monto_original) || 0;
  const alcanza = (Number(capital) || 0) + 0.001 >= monto;
  return (
    <form
      className="card"
      style={{ display: 'grid', gap: '0.55rem', maxWidth: 520, borderLeft: '4px solid #b45309' }}
      onSubmit={(e) => {
        e.preventDefault();
        if (alcanza && !guardando) onDesembolsar?.(prestamo);
      }}
    >
      <strong style={{ color: '#b45309' }}>Desembolso</strong>
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
      <p className="muted" style={{ margin: 0, fontSize: '0.8rem' }}>
        Capital disponible: <strong>{fmtMonto(capital)}</strong>
        {!alcanza && ' · no alcanza para este desembolso'}
      </p>
      <button type="submit" className="btn btn-primary" disabled={!alcanza || guardando || !onDesembolsar} style={{ justifySelf: 'start' }}>
        Desembolsar
      </button>
    </form>
  );
}

/** Formularios de desembolso dentro de Vales y préstamos, para JLBB. */
export function DesembolsosPrestamo({ supabase, user, prestamos, onHecho }) {
  const [capital, setCapital] = useState(0);
  const [guardando, setGuardando] = useState(false);
  const pendientes = (prestamos || []).filter((p) => p.estado === 'pendiente_desembolso');
  const puede = puedeDesembolsarPrestamo(user);

  const cargarCapital = useCallback(async () => {
    if (!supabase) return;
    const m = await listarMovimientosFondo(supabase);
    setCapital(resumenFondoPrestamos(m.data).capital);
  }, [supabase]);

  useEffect(() => {
    if (pendientes.length) void cargarCapital();
  }, [pendientes.length, cargarCapital]);

  if (!pendientes.length || !puede) return null;

  const desembolsar = async (prestamo) => {
    if (!confirm(`¿Desembolsar ${fmtMonto(prestamo.monto_original)} a ${prestamo.nombre_empleado} desde el capital del fondo?`)) return;
    setGuardando(true);
    const r = await desembolsarPrestamo(supabase, prestamo.id, { user, nombre: user?.nombre });
    setGuardando(false);
    if (!r.ok) return alert(r.error);
    alert(r.mensaje);
    onHecho?.();
    await cargarCapital();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {pendientes.map((p) => (
        <FormularioDesembolsoPrestamo
          key={p.id}
          prestamo={p}
          capital={capital}
          guardando={guardando}
          onDesembolsar={desembolsar}
        />
      ))}
    </div>
  );
}
