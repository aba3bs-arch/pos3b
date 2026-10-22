import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { fmtFechaHora, fmtMonto } from '../lib/controlEfectivo.js';
import {
  agruparLiquidaciones,
  enriquecerConSaldoCxc,
  listarFilasLiquidadasGlobal,
  listarMovimientosCxcParaSaldo,
  listarUltimaLiquidacionGlobal,
  saldoCxcEn,
} from '../lib/historialLiquidaciones.js';
import { PRESETS_FECHA_PRODUCTO, rangoDesdePreset } from '../lib/consultasInventario.js';
import FiltroPeriodo from './FiltroPeriodo.jsx';

const COLOR_CREDITO = 'var(--brand-blue)';
const COLOR_EFECTIVO = '#0d9488';

function Dato({ label, valor, color, grande = false, nota }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div className="muted" style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.03em', fontWeight: 700 }}>
        {label}
      </div>
      <div
        style={{
          fontSize: grande ? '1.5rem' : '1.1rem',
          fontWeight: 800,
          color: color || 'inherit',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {valor}
      </div>
      {nota && <div className="muted" style={{ fontSize: '0.72rem' }}>{nota}</div>}
    </div>
  );
}

function TarjetaGrande({ titulo, monto, color, children }) {
  return (
    <div
      style={{
        padding: '1.1rem 1.25rem',
        borderRadius: '14px',
        border: `2px solid ${color}`,
        background: 'var(--surface, transparent)',
      }}
    >
      <div className="muted" style={{ fontSize: '0.85rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {titulo}
      </div>
      <div
        style={{
          margin: '0.3rem 0 0.4rem',
          fontSize: '2.9rem',
          lineHeight: 1.05,
          fontWeight: 900,
          color,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {monto}
      </div>
      {children}
    </div>
  );
}

function TarjetaLiquidacion({ l, abierta, onToggle }) {
  const desglose = [
    { label: 'Crédito total', valor: l.creditoTotal == null ? '—' : fmtMonto(l.creditoTotal), nota: 'por cobrar antes de cobrar' },
    { label: 'Cobrado', valor: fmtMonto(l.totalCreditos), color: COLOR_CREDITO, nota: `${l.creditos.length} crédito(s)` },
    { label: 'Quedan por cobrar', valor: l.creditoQuedan == null ? '—' : fmtMonto(l.creditoQuedan), nota: 'al sellar' },
    { label: 'Efectivo ventas', valor: fmtMonto(l.totalEfectivo), color: COLOR_EFECTIVO, nota: `${l.efectivo.length} venta(s)` },
  ];
  return (
    <div className="card" style={{ padding: '0.9rem 1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div>
          <strong>{fmtFechaHora(l.fecha)}</strong>
          <div className="muted" style={{ fontSize: '0.8rem' }}>
            {l.repartidorNombre || 'Recolector'}
            {l.adminNombre && ` · recibió ${l.adminNombre}`} · {l.count} mov.
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="muted" style={{ fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: 700 }}>Liquidado</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--brand-blue)', fontVariantNumeric: 'tabular-nums' }}>
            {fmtMonto(l.neto)}
          </div>
          {l.totalGastos > 0 && (
            <div style={{ fontSize: '0.72rem', color: 'var(--brand-red)' }}>
              {fmtMonto(l.bruto)} − gastos {fmtMonto(l.totalGastos)}
            </div>
          )}
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
          gap: '0.75rem',
          marginTop: '0.75rem',
          paddingTop: '0.75rem',
          borderTop: '1px solid var(--border)',
        }}
      >
        {desglose.map((d) => (
          <Dato key={d.label} label={d.label} valor={d.valor} color={d.color} nota={d.nota} />
        ))}
      </div>

      <button
        type="button"
        className="btn btn-ghost"
        style={{ marginTop: '0.6rem', fontSize: '0.8rem', padding: '0.25rem 0.6rem' }}
        onClick={onToggle}
      >
        {abierta ? 'Ocultar tiendas' : 'Ver por tienda'}
      </button>

      {abierta && (
        <div className="table-wrap" style={{ marginTop: '0.5rem' }}>
          <table className="table" style={{ fontSize: '0.85rem' }}>
            <thead>
              <tr>
                <th>Tienda</th>
                <th style={{ textAlign: 'right' }}>Créditos cobrados</th>
                <th style={{ textAlign: 'right' }}>Efectivo mercancía</th>
                <th style={{ textAlign: 'right' }}>Mov.</th>
                <th style={{ textAlign: 'right' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {l.tiendas.map((t) => (
                <tr key={t.tienda}>
                  <td><strong>{t.tienda}</strong></td>
                  <td style={{ textAlign: 'right', color: t.creditos ? COLOR_CREDITO : 'var(--muted)' }}>
                    {t.creditos ? fmtMonto(t.creditos) : '—'}
                  </td>
                  <td style={{ textAlign: 'right', color: t.efectivo ? COLOR_EFECTIVO : 'var(--muted)' }}>
                    {t.efectivo ? fmtMonto(t.efectivo) : '—'}
                  </td>
                  <td style={{ textAlign: 'right' }}>{t.count}</td>
                  <td style={{ textAlign: 'right' }}><strong>{fmtMonto(t.creditos + t.efectivo)}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Historial global de liquidaciones (todos los recolectores). */
export default function HistorialLiquidacionesGlobal({ supabase }) {
  const [preset, setPreset] = useState('mes');
  const [desde, setDesde] = useState(() => rangoDesdePreset('mes')?.desde || '');
  const [hasta, setHasta] = useState(() => rangoDesdePreset('mes')?.hasta || '');
  const [filas, setFilas] = useState([]);
  const [anterior, setAnterior] = useState(null);
  const [movsCxc, setMovsCxc] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);
  const [abiertas, setAbiertas] = useState({});

  const cambiarPreset = (p) => {
    setPreset(p);
    if (p === 'rango') return;
    const r = rangoDesdePreset(p);
    if (r) {
      setDesde(r.desde);
      setHasta(r.hasta);
    }
  };

  const cargar = useCallback(async () => {
    if (!supabase) return;
    setCargando(true);
    setError(null);
    try {
      const [rows, ultima] = await Promise.all([
        listarFilasLiquidadasGlobal(supabase, { desde, hasta }),
        listarUltimaLiquidacionGlobal(supabase),
      ]);
      setFilas(rows);
      setAnterior(ultima);
    } catch (e) {
      setError(e?.message || String(e));
    }
    try {
      setMovsCxc(await listarMovimientosCxcParaSaldo(supabase));
    } catch {
      setMovsCxc(null);
    }
    setCargando(false);
  }, [supabase, desde, hasta]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const liquidaciones = useMemo(
    () => enriquecerConSaldoCxc(agruparLiquidaciones(filas), movsCxc),
    [filas, movsCxc],
  );
  const ultima = useMemo(
    () => (anterior ? enriquecerConSaldoCxc([anterior], movsCxc)[0] : null),
    [anterior, movsCxc],
  );
  const balance = useMemo(() => (movsCxc ? saldoCxcEn(movsCxc) : null), [movsCxc]);
  const totalPeriodo = useMemo(() => liquidaciones.reduce((a, l) => a + l.neto, 0), [liquidaciones]);

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.75rem' }}>
        <TarjetaGrande
          titulo="Liquidación anterior"
          monto={ultima ? fmtMonto(ultima.neto) : cargando ? '…' : '—'}
          color="var(--brand-blue)"
        >
          {ultima ? (
            <div style={{ fontSize: '0.85rem', lineHeight: 1.5 }}>
              <div className="muted">
                {fmtFechaHora(ultima.fecha)} · {ultima.repartidorNombre || 'Recolector'}
              </div>
              <div>
                Créditos cobrados <strong style={{ color: COLOR_CREDITO }}>{fmtMonto(ultima.totalCreditos)}</strong>
                {' · '}Efectivo ventas <strong style={{ color: COLOR_EFECTIVO }}>{fmtMonto(ultima.totalEfectivo)}</strong>
                {ultima.totalGastos > 0 && (
                  <span style={{ color: 'var(--brand-red)' }}> · gastos −{fmtMonto(ultima.totalGastos)}</span>
                )}
              </div>
            </div>
          ) : (
            <div className="muted" style={{ fontSize: '0.85rem' }}>
              {cargando ? 'Cargando…' : 'Aún no hay liquidaciones selladas.'}
            </div>
          )}
        </TarjetaGrande>

        <TarjetaGrande
          titulo="Balance"
          monto={balance == null ? (cargando ? '…' : '—') : fmtMonto(balance)}
          color={balance ? 'var(--brand-gold-dark, #b45309)' : 'var(--muted)'}
        >
          <div style={{ fontSize: '0.85rem', lineHeight: 1.5 }}>
            <div>Créditos que siguen por cobrar a hoy.</div>
            {ultima && ultima.creditoQuedan != null && (
              <div className="muted">
                Al sellar la liquidación anterior quedaban {fmtMonto(ultima.creditoQuedan)} de {fmtMonto(ultima.creditoTotal)}.
              </div>
            )}
            {balance == null && !cargando && (
              <div className="muted">No se pudo leer la cartera de créditos.</div>
            )}
          </div>
        </TarjetaGrande>
      </div>

      <FiltroPeriodo
        presets={PRESETS_FECHA_PRODUCTO}
        preset={preset}
        onPresetChange={cambiarPreset}
        desde={desde}
        hasta={hasta}
        onDesdeChange={setDesde}
        onHastaChange={setHasta}
        labelPeriodo="Periodo de liquidación"
        style={{ marginTop: '1rem' }}
        mostrarResumen={preset !== 'todos'}
      />

      {error && <p style={{ color: 'var(--brand-red)', fontSize: '0.85rem' }}>{error}</p>}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', margin: '1rem 0 0.5rem' }}>
        <h4 style={{ margin: 0, color: 'var(--brand-blue)' }}>Liquidaciones pasadas</h4>
        <span className="muted" style={{ fontSize: '0.82rem' }}>
          {liquidaciones.length} liquidación(es) · total del periodo <strong>{fmtMonto(totalPeriodo)}</strong>
        </span>
      </div>

      {!liquidaciones.length ? (
        <p className="muted">{cargando ? 'Cargando liquidaciones…' : 'Sin liquidaciones selladas en el periodo seleccionado.'}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
          {liquidaciones.map((l) => (
            <TarjetaLiquidacion
              key={l.key}
              l={l}
              abierta={Boolean(abiertas[l.key])}
              onToggle={() => setAbiertas((p) => ({ ...p, [l.key]: !p[l.key] }))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
