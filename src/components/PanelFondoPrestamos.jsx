import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { listarPrestamos } from '../lib/valesPrestamos.js';
import { listarMovimientosFondo, resumenFondoPrestamos } from '../lib/fondoPrestamos.js';
import { esPrestamoArrendatario } from '../lib/beneficiariosExternos.js';
import { etiquetaEstadoPrestamo } from '../lib/contabilidadConstants.js';
import { fmtMonto } from '../lib/consultasUi.js';

function esControlFondo(p) {
  if (!p || esPrestamoArrendatario(p)) return false;
  return ['pendiente_visto_bueno', 'pendiente_abb_fjbb', 'pendiente_admin', 'pendiente_socio', 'activo', 'liquidado'].includes(p.estado);
}

export default function PanelFondoPrestamos({ supabase }) {
  const [prestamos, setPrestamos] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [aviso, setAviso] = useState('');

  const cargar = useCallback(async () => {
    if (!supabase) return;
    const [p, m] = await Promise.all([
      listarPrestamos(supabase, { incluirHistorial: true, limit: 400 }),
      listarMovimientosFondo(supabase),
    ]);
    setPrestamos((p.data || []).filter(esControlFondo));
    setMovimientos(m.data || []);
    setAviso(m.aviso || p.aviso || '');
  }, [supabase]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const resumen = useMemo(
    () => resumenFondoPrestamos(movimientos, prestamos.filter((p) => p.estado === 'activo' || p.estado === 'liquidado')),
    [movimientos, prestamos],
  );
  const reingresos = movimientos.filter((m) => m.tipo === 'reingreso_nomina');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <p className="muted" style={{ margin: 0, fontSize: '0.88rem' }}>
        JLBB lleva este fondo. El préstamo no entra al corte ni a contabilidad.
        Nómina descuenta la cuota y ese dinero reingresa aquí.
      </p>
      {aviso && <p className="muted" style={{ margin: 0, color: 'var(--warning, #c47f00)' }}>{aviso}</p>}
      <div className="grid-2">
        <div className="card">
          <div className="muted" style={{ fontSize: '0.8rem' }}>Desembolsado</div>
          <strong style={{ fontSize: '1.25rem' }}>{fmtMonto(resumen.desembolsado)}</strong>
        </div>
        <div className="card">
          <div className="muted" style={{ fontSize: '0.8rem' }}>Reingresado por nómina</div>
          <strong style={{ fontSize: '1.25rem', color: 'var(--brand-green, #15803d)' }}>{fmtMonto(resumen.reingresado)}</strong>
        </div>
        <div className="card">
          <div className="muted" style={{ fontSize: '0.8rem' }}>Saldo del fondo</div>
          <strong style={{ fontSize: '1.25rem' }}>{fmtMonto(resumen.saldo)}</strong>
        </div>
        <div className="card">
          <div className="muted" style={{ fontSize: '0.8rem' }}>Por recuperar en nómina</div>
          <strong style={{ fontSize: '1.25rem' }}>{fmtMonto(resumen.porRecuperar)}</strong>
        </div>
      </div>
      <div className="card">
        <h3 style={{ margin: '0 0 0.75rem' }}>Préstamos</h3>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Estado</th>
                <th>Empleado</th>
                <th>Monto</th>
                <th>Abonado</th>
                <th>Saldo</th>
                <th>Visto bueno</th>
                <th>Autorizó</th>
              </tr>
            </thead>
            <tbody>
              {prestamos.length === 0 ? (
                <tr><td colSpan={7} className="muted">Aún no hay préstamos en el fondo.</td></tr>
              ) : prestamos.map((p) => (
                <tr key={p.id}>
                  <td>{etiquetaEstadoPrestamo(p)}</td>
                  <td>{p.nombre_empleado}</td>
                  <td>{fmtMonto(p.monto_original)}</td>
                  <td>{fmtMonto(p.abono)}</td>
                  <td style={{ fontWeight: 700 }}>{fmtMonto(p.saldo)}</td>
                  <td className="muted">{p.aprobado_admin_por || '—'}</td>
                  <td className="muted">{p.aprobado_socio_por || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="card">
        <h3 style={{ margin: '0 0 0.75rem' }}>Reingresos de nómina</h3>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Empleado</th>
                <th>Monto</th>
                <th>Nota</th>
              </tr>
            </thead>
            <tbody>
              {reingresos.length === 0 ? (
                <tr><td colSpan={4} className="muted">Cuando nómina descuente una cuota, el monto aparece aquí.</td></tr>
              ) : reingresos.map((m) => (
                <tr key={m.id}>
                  <td className="muted">{String(m.created_at || '').slice(0, 16).replace('T', ' ')}</td>
                  <td>{m.nombre_empleado || '—'}</td>
                  <td style={{ fontWeight: 700 }}>{fmtMonto(m.monto)}</td>
                  <td className="muted">{m.notas || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
