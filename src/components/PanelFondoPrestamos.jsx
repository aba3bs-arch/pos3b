import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { listarPrestamos } from '../lib/valesPrestamos.js';
import {
  aportarCapitalFondo,
  desembolsarPrestamo,
  listarMovimientosFondo,
  puedeDesembolsarPrestamo,
  resumenFondoPrestamos,
} from '../lib/fondoPrestamos.js';
import { esPrestamoArrendatario } from '../lib/beneficiariosExternos.js';
import { fmtMonto } from '../lib/consultasUi.js';
import FormularioDesembolsoPrestamo from './FormularioDesembolsoPrestamo.jsx';

export default function PanelFondoPrestamos({ supabase, user }) {
  const [prestamos, setPrestamos] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [aviso, setAviso] = useState('');
  const [capitalNuevo, setCapitalNuevo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const puede = puedeDesembolsarPrestamo(user);

  const cargar = useCallback(async () => {
    if (!supabase) return;
    const [p, m] = await Promise.all([
      listarPrestamos(supabase, { incluirPendientes: true, limit: 400 }),
      listarMovimientosFondo(supabase),
    ]);
    setPrestamos((p.data || []).filter((x) => x && !esPrestamoArrendatario(x)));
    setMovimientos(m.data || []);
    setAviso(m.aviso || '');
  }, [supabase]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const resumen = useMemo(() => resumenFondoPrestamos(movimientos), [movimientos]);
  const porDesembolsar = prestamos.filter((p) => p.estado === 'pendiente_desembolso');
  const idsDesembolso = new Set(
    movimientos.filter((m) => m.tipo === 'desembolso' && m.prestamo_id).map((m) => String(m.prestamo_id)),
  );
  const libro = prestamos.filter((p) => idsDesembolso.has(String(p.id)));

  const registrarCapital = async () => {
    if (!puede) return alert('El capital lo registra JLBB.');
    setGuardando(true);
    const r = await aportarCapitalFondo(supabase, capitalNuevo, { user, nombre: user?.nombre });
    setGuardando(false);
    if (!r.ok) return alert(r.error);
    if (r.aviso) alert(r.aviso);
    setCapitalNuevo('');
    await cargar();
  };

  const desembolsar = async (prestamo) => {
    if (!confirm(`¿Desembolsar ${fmtMonto(prestamo.monto_original)} a ${prestamo.nombre_empleado} desde el capital?`)) return;
    setGuardando(true);
    const r = await desembolsarPrestamo(supabase, prestamo.id, { user, nombre: user?.nombre });
    setGuardando(false);
    if (!r.ok) return alert(r.error);
    alert(r.mensaje);
    await cargar();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <p className="muted" style={{ margin: 0, fontSize: '0.88rem' }}>
        El fondo tiene un capital. De ahí salen los préstamos. Cada cuota de nómina resta el saldo del préstamo y vuelve a sumar al capital.
      </p>
      {aviso && <p className="muted" style={{ margin: 0, color: 'var(--warning, #c47f00)' }}>{aviso}</p>}
      <div className="card" style={{ maxWidth: 520 }}>
        <div className="muted" style={{ fontSize: '0.8rem' }}>Capital del fondo</div>
        <strong style={{ fontSize: '1.6rem', color: '#b45309' }}>{fmtMonto(resumen.capital)}</strong>
        <p className="muted" style={{ margin: '0.35rem 0 0.6rem', fontSize: '0.8rem' }}>
          Aportado {fmtMonto(resumen.capitalAportado)} · desembolsado {fmtMonto(resumen.desembolsado)} · cuotas reingresadas {fmtMonto(resumen.reingresado)}
        </p>
        {puede && (
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <input
              className="input"
              type="number"
              min="0"
              step="0.01"
              placeholder="Capital a agregar"
              value={capitalNuevo}
              onChange={(e) => setCapitalNuevo(e.target.value)}
              style={{ maxWidth: 180 }}
            />
            <button type="button" className="btn btn-primary" disabled={guardando || !(Number(capitalNuevo) > 0)} onClick={() => void registrarCapital()}>
              Registrar capital
            </button>
          </div>
        )}
      </div>

      {porDesembolsar.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <h3 style={{ margin: 0 }}>Por desembolsar</h3>
          {porDesembolsar.map((p) => (
            <FormularioDesembolsoPrestamo
              key={p.id}
              prestamo={p}
              capital={resumen.capital}
              guardando={guardando}
              onDesembolsar={puede ? desembolsar : undefined}
            />
          ))}
          {!puede && <p className="muted" style={{ margin: 0 }}>JLBB confirma el desembolso.</p>}
        </div>
      )}

      <div className="card">
        <h3 style={{ margin: '0 0 0.75rem' }}>Lo que se prestó</h3>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Empleado</th>
                <th>Monto</th>
                <th>Saldo</th>
                <th>Cuotas</th>
                <th>Método</th>
              </tr>
            </thead>
            <tbody>
              {libro.length === 0 ? (
                <tr><td colSpan={5} className="muted">Cuando JLBB desembolse, aquí queda a quién se prestó y cuánto falta.</td></tr>
              ) : libro.map((p) => (
                <tr key={p.id}>
                  <td>{p.nombre_empleado}</td>
                  <td>{fmtMonto(p.monto_original)}</td>
                  <td style={{ fontWeight: 700 }}>{fmtMonto(p.saldo)}</td>
                  <td>{p.num_cuotas || '—'}</td>
                  <td className="muted">Descuento en nómina</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
