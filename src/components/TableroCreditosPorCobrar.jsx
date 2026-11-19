import React, { useEffect, useMemo, useState } from 'react';
import { fmtMonto } from '../lib/consultasUi.js';
import { listarMovimientosCxc } from '../lib/rutaCxc.js';
import { armarTableroCreditos } from '../lib/tableroCreditosPorCobrar.js';
import {
  DibujoBandera,
  DibujoBilletes,
  DibujoCalculadora,
  DibujoCamion,
  DibujoDocumento,
  DibujoGrafica,
  DibujoImpresora,
  DibujoPalomita,
  DibujoRefresco,
  DibujoReloj,
  DibujoTarjeta,
  DibujoTienda,
} from './DibujosRc.jsx';

const TZ = 'America/Hermosillo';

function fmtFechaFolio(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-MX', {
    timeZone: TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function esc(s) {
  return String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

function imprimirHtml(titulo, cuerpo) {
  const w = window.open('', '_blank', 'noopener,noreferrer,width=860,height=900');
  if (!w) {
    window.alert('Permite ventanas emergentes para imprimir el estado.');
    return;
  }
  w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(titulo)}</title>
    <style>
      body{font-family:sans-serif;padding:24px;color:#0f172a}
      h1{font-size:20px;margin:0 0 8px}
      table{border-collapse:collapse;width:100%;margin-top:12px}
      td,th{border:1px solid #cbd5e1;padding:6px 8px;font-size:13px}
      th{background:#1e3a8a;color:#fff;text-align:left}
      td.num,th.num{text-align:right}
    </style></head><body>
    <h1>${esc(titulo)}</h1>${cuerpo}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => { try { w.print(); } catch { /* el usuario imprime a mano */ } }, 250);
}

function tablaTiendasHtml(tiendas, totales) {
  const filas = tiendas.map((t) => `<tr>
    <td>${esc(t.codigo || t.nombre)} ${esc(t.codigo ? t.nombre : '')}</td>
    <td class="num">${t.folios.length}</td>
    <td class="num">${esc(fmtMonto(t.credito))}</td>
    <td class="num">${esc(fmtMonto(t.abono))}</td>
    <td class="num">${esc(fmtMonto(t.actualizado))}</td>
  </tr>`).join('');
  return `<table><thead><tr>
    <th>Tienda</th><th class="num">Folios</th><th class="num">Crédito por pagar</th>
    <th class="num">Abono</th><th class="num">Crédito actualizado</th>
  </tr></thead><tbody>${filas}
    <tr><td><strong>Totales</strong></td>
      <td class="num"><strong>${totales.folios}</strong></td>
      <td class="num"><strong>${esc(fmtMonto(totales.credito))}</strong></td>
      <td class="num"><strong>${esc(fmtMonto(totales.abono))}</strong></td>
      <td class="num"><strong>${esc(fmtMonto(totales.actualizado))}</strong></td>
    </tr></tbody></table>`;
}

function Kpi({ fondo, icono, titulo, monto }) {
  return (
    <div style={{
      background: fondo,
      color: '#fff',
      borderRadius: 14,
      padding: '0.7rem 0.75rem',
      minHeight: 92,
      boxShadow: 'inset 0 0 0 2px rgba(255,255,255,0.28)',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
    }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        {icono}
        <span style={{ fontWeight: 800, fontSize: '0.86rem', lineHeight: 1.15, minWidth: 0 }}>{titulo}</span>
      </div>
      <strong style={{ fontSize: 'clamp(1.05rem, 2.2vw, 1.45rem)', letterSpacing: '-0.02em' }}>{fmtMonto(monto)}</strong>
    </div>
  );
}

/**
 * Carátula RC / Créditos por cobrar, dentro de Créditos por pagar.
 * Los botones de abono y liquidar reusan el cobro con aprobación del vendedor.
 */
export default function TableroCreditosPorCobrar({
  supabase,
  cargos = [],
  tiendaAbierta = '',
  onElegirTienda,
  montoAbono = '',
  onMontoAbono,
  guardando = false,
  onGuardarAbono,
  onLiquidar,
  puedeEliminar = false,
  eliminando = false,
  onEliminar,
  onCerrarSesion,
  onActualizar,
  actualizando = false,
  idsEnAprobacion,
  cajeroNombre = '',
}) {
  const [abonos, setAbonos] = useState([]);
  const [historialAbierto, setHistorialAbierto] = useState(false);

  useEffect(() => {
    let vivo = true;
    if (!supabase) return undefined;
    listarMovimientosCxc(supabase, { todos: true }).then((r) => {
      if (!vivo) return;
      setAbonos((r.data || []).filter((m) => m.tipo === 'abono'));
    }).catch(() => {
      if (vivo) setAbonos([]);
    });
    return () => { vivo = false; };
  }, [supabase, cargos]);

  useEffect(() => {
    setHistorialAbierto(false);
  }, [tiendaAbierta]);

  const tablero = useMemo(
    () => armarTableroCreditos(cargos, abonos),
    [cargos, abonos],
  );
  const tienda = tablero.tiendas.find((t) => t.id === tiendaAbierta) || null;
  const enAprobacion = idsEnAprobacion || new Set();

  const imprimirReporte = () => {
    imprimirHtml(
      'Reporte RC · Créditos por cobrar',
      `<p>Cajero: ${esc(cajeroNombre || '—')}</p>${tablaTiendasHtml(tablero.tiendas, tablero.totales)}`,
    );
  };

  const imprimirEstado = () => {
    if (!tienda) return;
    const filas = tienda.folios.map((f) => `<tr>
      <td>${esc(f.folio)}</td><td>${esc(fmtFechaFolio(f.fecha))}</td>
      <td class="num">${esc(fmtMonto(f.importe))}</td><td>${esc(f.estado)}</td>
    </tr>`).join('');
    imprimirHtml(
      `Estado de crédito · ${tienda.codigo || ''} ${tienda.nombre}`,
      `<p>Crédito por pagar ${esc(fmtMonto(tienda.credito))} · Abonos ${esc(fmtMonto(tienda.abono))} · Actualizado ${esc(fmtMonto(tienda.actualizado))}</p>
       <table><thead><tr><th>Folio</th><th>Fecha</th><th class="num">Importe</th><th>Estado</th></tr></thead>
       <tbody>${filas}</tbody></table>`,
    );
  };

  return (
    <section style={{
      background: 'linear-gradient(180deg, #12398f 0%, #0c2f78 100%)',
      border: '3px solid #e8b931',
      borderRadius: 18,
      padding: '0.85rem',
      color: '#fff',
      boxShadow: '0 10px 28px rgba(15, 23, 42, 0.28)',
    }}
    >
      <header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
        <DibujoCamion size={78} />
        <div style={{ flex: '1 1 180px', minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 'clamp(1.25rem, 3vw, 1.85rem)', fontWeight: 900, letterSpacing: '-0.02em' }}>
            <span style={{ fontStyle: 'italic' }}>RC</span>
            <span style={{ color: '#f6c445' }}> / Créditos por Cobrar</span>
          </h2>
          {cajeroNombre ? (
            <p style={{ margin: '0.15rem 0 0', fontSize: '0.78rem', color: '#dbeafe' }}>
              Cajero: <strong>{cajeroNombre}</strong>
            </p>
          ) : null}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onCerrarSesion} disabled={guardando || eliminando}>
            Cerrar sesión
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onActualizar} disabled={guardando || eliminando || actualizando}>
            {actualizando ? 'Actualizando…' : 'Actualizar'}
          </button>
        </div>
      </header>

      <div className="tablero-creditos-kpis">
        <Kpi fondo="linear-gradient(180deg,#f6b429,#e09112)" icono={<DibujoTarjeta size={36} />} titulo="Crédito por pagar" monto={tablero.totales.credito} />
        <Kpi fondo="linear-gradient(180deg,#34c06a,#159447)" icono={<DibujoBilletes size={36} />} titulo="Abonos recibidos" monto={tablero.totales.abono} />
        <Kpi fondo="linear-gradient(180deg,#3b82f6,#1d4ed8)" icono={<DibujoRefresco size={36} tono="claro" />} titulo="Crédito actualizado" monto={tablero.totales.actualizado} />
      </div>

      <div style={{
        marginTop: '0.75rem',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '0.65rem',
        background: 'rgba(255,255,255,0.08)',
        borderRadius: 12,
        padding: '0.55rem 0.7rem',
      }}
      >
        <DibujoTienda size={34} />
        <div style={{ flex: '1 1 200px' }}>
          <strong style={{ fontSize: '1.02rem' }}>
            {tablero.tiendas.length} {tablero.tiendas.length === 1 ? 'Tienda con crédito' : 'Tiendas con crédito'}
          </strong>
          <div style={{ fontSize: '0.78rem', color: '#dbeafe' }}>
            Toca una tienda para ver folios, registrar abono o liquidar.
          </div>
        </div>
        <button
          type="button"
          onClick={imprimirReporte}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            background: '#fff',
            color: '#1e3a8a',
            border: 'none',
            borderRadius: 12,
            padding: '0.45rem 0.75rem',
            fontWeight: 800,
            cursor: 'pointer',
          }}
        >
          <DibujoGrafica size={22} />
          Reporte RC
        </button>
      </div>

      <div className="tablero-creditos-split" style={{ marginTop: '0.75rem' }}>
        <div style={{ background: '#f8fafc', color: '#0f172a', borderRadius: 14, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem', minWidth: 520 }}>
            <thead>
              <tr>
                <th style={th('tienda')}>Tienda</th>
                <th style={th('folios')}>Folios</th>
                <th style={th('pagar')}>Crédito por pagar</th>
                <th style={th('abono')}>Abono</th>
                <th style={th('actual')}>Crédito actualizado</th>
              </tr>
            </thead>
            <tbody>
              {tablero.tiendas.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: '1rem', color: '#64748b' }}>
                    No hay créditos pendientes. Si en Recolecciones aún hay folios «Por Cobrar», pulsa Actualizar.
                  </td>
                </tr>
              ) : tablero.tiendas.map((t) => {
                const abierta = t.id === tiendaAbierta;
                return (
                  <tr
                    key={t.id}
                    onClick={() => onElegirTienda?.(t.id)}
                    style={{
                      cursor: 'pointer',
                      background: abierta ? '#dbeafe' : '#fff',
                      borderBottom: '1px solid #e2e8f0',
                    }}
                  >
                    <td style={{ padding: '0.45rem 0.55rem' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <DibujoTienda size={26} />
                        <span>
                          <strong style={{ display: 'block', color: '#1d4ed8' }}>{t.codigo || t.nombre}</strong>
                          {t.codigo ? <span style={{ color: '#64748b', fontSize: '0.75rem' }}>{t.nombre}</span> : null}
                        </span>
                      </span>
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 800 }}>{t.folios.length}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, paddingRight: 8 }}>{fmtMonto(t.credito)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: '#15803d', paddingRight: 8 }}>{fmtMonto(t.abono)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 800, color: '#1d4ed8', paddingRight: 8 }}>{fmtMonto(t.actualizado)}</td>
                  </tr>
                );
              })}
            </tbody>
            {tablero.tiendas.length > 0 && (
              <tfoot>
                <tr>
                  <td style={pie('#1e3a8a')}>Totales</td>
                  <td style={{ ...pie('#1e3a8a'), textAlign: 'center' }}>{tablero.totales.folios}</td>
                  <td style={{ ...pie('#e09112'), textAlign: 'right' }}>{fmtMonto(tablero.totales.credito)}</td>
                  <td style={{ ...pie('#159447'), textAlign: 'right' }}>{fmtMonto(tablero.totales.abono)}</td>
                  <td style={{ ...pie('#1d4ed8'), textAlign: 'right' }}>{fmtMonto(tablero.totales.actualizado)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        <aside style={{
          background: '#f8fafc',
          color: '#0f172a',
          borderRadius: 16,
          border: '3px solid #1d4ed8',
          overflow: 'hidden',
          minHeight: 280,
        }}
        >
          {!tienda ? (
            <div style={{ padding: '1.2rem', textAlign: 'center' }}>
              <DibujoTienda size={48} />
              <p style={{ margin: '0.6rem 0 0', fontWeight: 800, color: '#1e3a8a' }}>Elige una tienda</p>
              <p style={{ margin: '0.25rem 0 0', color: '#64748b', fontSize: '0.82rem' }}>
                Aquí ves sus folios, registras un abono o liquidas el crédito.
              </p>
            </div>
          ) : (
            <>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '0.55rem 0.7rem',
                background: 'linear-gradient(90deg,#1d4ed8,#2563eb)',
                color: '#fff',
              }}
              >
                <DibujoTienda size={30} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong style={{ display: 'block' }}>{tienda.codigo || tienda.nombre}</strong>
                  <span style={{ fontSize: '0.78rem', opacity: 0.9 }}>{tienda.codigo ? tienda.nombre : 'Crédito'}</span>
                </div>
                <button
                  type="button"
                  aria-label="Cerrar detalle"
                  onClick={() => onElegirTienda?.(tienda.id)}
                  style={{
                    width: 28, height: 28, borderRadius: 8, border: 'none', background: 'rgba(255,255,255,0.2)',
                    color: '#fff', fontWeight: 900, cursor: 'pointer',
                  }}
                >
                  ×
                </button>
              </div>

              <div style={{ display: 'grid', gap: 6, padding: '0.65rem 0.75rem 0' }}>
                <FilaResumen icono={<DibujoDocumento size={18} />} label="Folios pendientes:" valor={String(tienda.folios.length)} />
                <FilaResumen icono={<DibujoTarjeta size={18} />} label="Crédito por pagar:" valor={fmtMonto(tienda.credito)} />
                <FilaResumen icono={<DibujoBilletes size={18} />} label="Abonos aplicados:" valor={fmtMonto(tienda.abono)} />
                <FilaResumen icono={<DibujoRefresco size={18} />} label="Crédito actualizado:" valor={fmtMonto(tienda.actualizado)} />
              </div>

              <div style={{ margin: '0.65rem 0.75rem 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, color: '#1e3a8a', marginBottom: 4 }}>
                  <DibujoDocumento size={18} />
                  Folios del crédito ({tienda.folios.length})
                </div>
                <div style={{ maxHeight: 220, overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                    <thead>
                      <tr>
                        {['Folio', 'Fecha', 'Importe', 'Estado'].map((h) => (
                          <th key={h} style={{ position: 'sticky', top: 0, background: '#1e3a8a', color: '#fff', padding: '0.28rem 0.35rem', textAlign: h === 'Importe' ? 'right' : 'left' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {tienda.folios.map((f) => (
                        <tr key={f.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                          <td style={{ padding: '0.28rem 0.35rem', fontWeight: 700 }}>
                            {f.folio}
                            {enAprobacion.has(String(f.id)) ? (
                              <div style={{ color: '#b45309', fontSize: '0.68rem' }}>En aprobación</div>
                            ) : null}
                          </td>
                          <td style={{ padding: '0.28rem 0.35rem', whiteSpace: 'nowrap' }}>{fmtFechaFolio(f.fecha)}</td>
                          <td style={{ padding: '0.28rem 0.35rem', textAlign: 'right', fontWeight: 700 }}>{fmtMonto(f.importe)}</td>
                          <td style={{ padding: '0.28rem 0.35rem' }}>
                            <span style={{
                              background: '#e11d48', color: '#fff', borderRadius: 999, padding: '0.05rem 0.4rem',
                              fontSize: '0.68rem', fontWeight: 800,
                            }}
                            >
                              {f.estado}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={{
                margin: '0.65rem 0.75rem 0.75rem',
                background: 'linear-gradient(180deg,#ecfdf3,#d1fae5)',
                border: '2px solid #86efac',
                borderRadius: 14,
                padding: '0.65rem',
              }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 900, color: '#166534' }}>
                  <DibujoBilletes size={26} />
                  Registrar abono
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    className="input"
                    value={montoAbono}
                    disabled={guardando || !(tienda.actualizado > 0)}
                    onChange={(e) => onMontoAbono?.(e.target.value)}
                    placeholder="$ 0.00"
                    aria-label="Monto del abono"
                    style={{ flex: 1, fontSize: '1.15rem', fontWeight: 800, textAlign: 'center' }}
                  />
                  <span aria-hidden><DibujoCalculadora size={30} /></span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                  <button
                    type="button"
                    disabled={guardando || eliminando || !(tienda.actualizado > 0)}
                    onClick={onGuardarAbono}
                    style={btnAccion('#16a34a')}
                  >
                    <DibujoPalomita size={20} />
                    {guardando ? 'Enviando…' : 'Guardar abono'}
                  </button>
                  <button
                    type="button"
                    disabled={guardando || eliminando || !(tienda.actualizado > 0)}
                    onClick={onLiquidar}
                    style={btnAccion('#e11d48')}
                  >
                    <DibujoBandera size={20} />
                    Liquidar crédito
                  </button>
                </div>
                <p style={{ margin: '0.45rem 0 0', fontSize: '0.72rem', color: '#166534' }}>
                  El vendedor de ruta aprueba el abono con su PIN. Hasta entonces no se registra el pago.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                  <button type="button" onClick={() => setHistorialAbierto((v) => !v)} style={btnSuave('#1d4ed8')}>
                    <DibujoReloj size={16} />
                    Ver historial de abonos
                  </button>
                  <button type="button" onClick={imprimirEstado} style={btnSuave('#7c3aed')}>
                    <DibujoImpresora size={16} />
                    Imprimir estado
                  </button>
                </div>
                {puedeEliminar && (
                  <button
                    type="button"
                    onClick={onEliminar}
                    disabled={guardando || eliminando}
                    style={{ ...btnSuave('#b91c1c'), marginTop: 8, width: '100%' }}
                  >
                    {eliminando ? 'Eliminando…' : 'Eliminar folios por error'}
                  </button>
                )}
                {historialAbierto && (
                  <div style={{ marginTop: 8, background: '#fff', borderRadius: 10, padding: '0.45rem 0.55rem', maxHeight: 160, overflow: 'auto' }}>
                    {tienda.historial.length === 0 ? (
                      <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748b' }}>Esta tienda todavía no tiene abonos.</p>
                    ) : tienda.historial.map((h) => (
                      <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: '0.78rem', padding: '0.2rem 0', borderBottom: '1px solid #e2e8f0' }}>
                        <span>
                          <strong>{h.folio}</strong>
                          <span style={{ color: '#64748b' }}> · {fmtFechaFolio(h.fecha)}</span>
                        </span>
                        <strong style={{ color: '#15803d' }}>{fmtMonto(h.monto)}</strong>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </aside>
      </div>
    </section>
  );
}

function FilaResumen({ icono, label, valor }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      background: '#fff', border: '1px solid #dbeafe', borderRadius: 10, padding: '0.28rem 0.45rem',
    }}
    >
      {icono}
      <span style={{ flex: 1, fontSize: '0.8rem', color: '#334155' }}>{label}</span>
      <strong>{valor}</strong>
    </div>
  );
}

function th(tipo) {
  const fondo = {
    tienda: '#1e3a8a',
    folios: '#1d4ed8',
    pagar: '#e09112',
    abono: '#159447',
    actual: '#1d4ed8',
  }[tipo];
  return {
    background: fondo,
    color: '#fff',
    padding: '0.45rem 0.4rem',
    textAlign: tipo === 'tienda' ? 'left' : tipo === 'folios' ? 'center' : 'right',
    fontSize: '0.75rem',
  };
}

function pie(fondo) {
  return { background: fondo, color: '#fff', fontWeight: 800, padding: '0.45rem 0.5rem' };
}

function btnAccion(fondo) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    background: fondo,
    color: '#fff',
    border: 'none',
    borderRadius: 12,
    padding: '0.55rem 0.4rem',
    fontWeight: 800,
    cursor: 'pointer',
    fontSize: '0.82rem',
  };
}

function btnSuave(color) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    background: '#fff',
    color,
    border: `2px solid ${color}`,
    borderRadius: 12,
    padding: '0.4rem 0.35rem',
    fontWeight: 800,
    cursor: 'pointer',
    fontSize: '0.75rem',
  };
}
