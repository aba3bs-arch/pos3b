import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { etiquetaTienda } from '../constants/sucursales.js';
import {
  LIMITE_IMPRESION_LOTE,
  agruparCgaPorDia,
  cargarCortesGeneralesCompletos,
  csvCortesGenerales,
  listarCortesGenerales,
  unirRecibosHtml,
} from '../lib/cortesGenerales.js';
import { dinero } from '../lib/libroDiarioAbarrotes.js';
import { abrirVentanaImpresion } from '../lib/impresion.js';
import { datosImpresionDesdeHistorial, htmlReciboCorteGeneral } from '../lib/impresionCorteContabilidad.js';

function fechaCorta(ymd) {
  const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return ymd || '—';
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const dia = d.toLocaleDateString('es-MX', { weekday: 'short', timeZone: 'UTC' });
  return `${dia} ${m[3]}/${m[2]}/${m[1]}`;
}

/**
 * Cortes generales (CGA) de Abarrotes del periodo del libro, de todas las tiendas (o una):
 * lista por día, impresión de un recibo, de todos los de un día o de todos los del periodo, y CSV.
 */
export default function CortesGeneralesPanel({ supabase, sucursal = null, desde, hasta }) {
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [imprimiendo, setImprimiendo] = useState(false);
  const [filas, setFilas] = useState(null);
  const [error, setError] = useState('');
  const [truncado, setTruncado] = useState(false);

  const cargar = useCallback(async () => {
    if (!supabase || !desde || !hasta) return;
    setCargando(true);
    setError('');
    const r = await listarCortesGenerales(supabase, { desde, hasta, sucursal });
    setCargando(false);
    if (r.error) {
      setError(r.error);
      setFilas([]);
      return;
    }
    setTruncado(r.truncado);
    setFilas(r.data);
  }, [supabase, desde, hasta, sucursal]);

  useEffect(() => {
    setFilas(null);
  }, [desde, hasta, sucursal]);

  useEffect(() => {
    if (abierto && filas === null && !cargando) void cargar();
  }, [abierto, filas, cargando, cargar]);

  const grupos = useMemo(() => agruparCgaPorDia(filas || []), [filas]);

  const imprimir = async (lista, titulo) => {
    if (!lista.length || imprimiendo) return;
    if (lista.length > LIMITE_IMPRESION_LOTE) {
      alert(`Se pueden imprimir hasta ${LIMITE_IMPRESION_LOTE} recibos a la vez. Elige un periodo más corto o imprime por día.`);
      return;
    }
    setImprimiendo(true);
    const r = await cargarCortesGeneralesCompletos(supabase, lista.map((f) => f.id));
    if (r.error) {
      setImprimiendo(false);
      alert(r.error);
      return;
    }
    const porId = new Map(r.data.map((x) => [String(x.id), x]));
    const htmls = lista
      .map((f) => porId.get(String(f.id)))
      .filter(Boolean)
      .map((row) => htmlReciboCorteGeneral(datosImpresionDesdeHistorial(row, 'abarrotes')));
    setImprimiendo(false);
    if (!htmls.length) {
      alert('No se encontraron los recibos para imprimir.');
      return;
    }
    const res = abrirVentanaImpresion(htmls.length === 1 ? htmls[0] : unirRecibosHtml(htmls), titulo);
    if (res && res.ok === false) alert(res.error || 'No se pudo abrir la impresión.');
  };

  const descargarCsv = () => {
    const csv = csvCortesGenerales(filas || [], etiquetaTienda);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `cortes-generales-CGA_${desde}_a_${hasta}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const total = (filas || []).length;

  return (
    <details
      className="card"
      style={{ padding: '0.6rem 0.8rem' }}
      open={abierto}
      onToggle={(e) => setAbierto(e.currentTarget.open)}
    >
      <summary style={{ cursor: 'pointer', fontWeight: 700 }}>
        Cortes generales (CGA) del periodo
        {filas ? <span className="muted" style={{ fontWeight: 400 }}> · {total} recibo{total === 1 ? '' : 's'}</span> : null}
      </summary>

      <div style={{ marginTop: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        <p className="muted" style={{ margin: 0, fontSize: '0.82rem' }}>
          Un recibo por tienda y por día (folio CGA-00001…), generado a medianoche. Puedes imprimir uno, todos los de un día
          (todas las tiendas) o todos los del periodo, y descargar la lista en CSV.
          {sucursal ? ` Tienda: ${etiquetaTienda(sucursal)}.` : ' Todas las tiendas.'}
        </p>

        {cargando && <p className="muted" style={{ margin: 0 }}>Cargando cortes generales…</p>}
        {error && <p style={{ margin: 0, color: '#b91c1c' }}>{error}</p>}
        {truncado && (
          <p style={{ margin: 0, color: '#92400e', fontSize: '0.82rem' }}>
            La lista se limitó a los más recientes. Elige un periodo más corto para ver todos.
          </p>
        )}

        {filas && total === 0 && !cargando && !error && (
          <p className="muted" style={{ margin: 0 }}>
            No hay cortes generales en este periodo. Se generan a medianoche, desde el 13 de noviembre de 2026.
          </p>
        )}

        {total > 0 && (
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={imprimiendo}
              onClick={() => void imprimir(filas, `Cortes generales ${desde} a ${hasta}`)}
            >
              {imprimiendo ? 'Preparando…' : `Imprimir todos (${total})`}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={descargarCsv}>Descargar lista (CSV)</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void cargar()} disabled={cargando}>Actualizar</button>
          </div>
        )}

        {grupos.map((g) => (
          <div key={g.fecha} style={{ border: '1px solid rgba(100,116,139,0.3)', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.4rem 1rem', padding: '0.45rem 0.7rem', background: 'rgba(100,116,139,0.1)' }}>
              <strong style={{ flex: '1 1 160px' }}>{fechaCorta(g.fecha)}</strong>
              <span className="muted" style={{ fontSize: '0.82rem' }}>
                Ventas {dinero(g.ventas)} · Egresos {dinero(g.egresos)}
              </span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={imprimiendo}
                onClick={() => void imprimir(g.filas, `Cortes generales ${g.fecha}`)}
              >
                Imprimir los {g.filas.length} del día
              </button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(100,116,139,0.3)' }}>
                    <th style={{ padding: '0.3rem 0.6rem' }}>Tienda</th>
                    <th style={{ padding: '0.3rem 0.6rem' }}>Folio</th>
                    <th style={{ padding: '0.3rem 0.6rem', textAlign: 'right' }}>Ventas</th>
                    <th style={{ padding: '0.3rem 0.6rem', textAlign: 'right' }}>Egresos del día</th>
                    <th style={{ padding: '0.3rem 0.6rem', textAlign: 'right' }}>Caja al cierre</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {g.filas.map((f) => (
                    <tr key={f.id} style={{ borderBottom: '1px solid rgba(100,116,139,0.15)' }}>
                      <td style={{ padding: '0.3rem 0.6rem' }}>{etiquetaTienda(f.sucursal)}</td>
                      <td style={{ padding: '0.3rem 0.6rem' }}>{f.folio}</td>
                      <td style={{ padding: '0.3rem 0.6rem', textAlign: 'right' }}>{dinero(f.ventas)}</td>
                      <td style={{ padding: '0.3rem 0.6rem', textAlign: 'right' }}>{dinero(f.egresos)}</td>
                      <td style={{ padding: '0.3rem 0.6rem', textAlign: 'right' }}>{dinero(f.cajaActual)}</td>
                      <td style={{ padding: '0.3rem 0.6rem', textAlign: 'right' }}>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={imprimiendo}
                          onClick={() => void imprimir([f], `Corte general ${f.folio}`)}
                        >
                          Imprimir recibo
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}
