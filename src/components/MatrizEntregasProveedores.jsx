import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { etiquetaTienda } from '../constants/sucursales.js';
import {
  AVISO_FALTA_TABLA_ENTREGAS,
  DIAS_ENTREGA,
  agregarEntregaProveedor,
  listarEntregasProveedores,
  mapaEntregasPorCelda,
  quitarEntregaProveedor,
  sucursalesParaMatrizEntregas,
} from '../lib/proveedorEntregas.js';

const LS_ABIERTA = 'pos3b_matriz_entregas_abierta';

function leerAbierta() {
  try {
    return localStorage.getItem(LS_ABIERTA) === '1';
  } catch {
    return false;
  }
}

export default function MatrizEntregasProveedores({ supabase, proveedores = [] }) {
  const [filas, setFilas] = useState([]);
  const [aviso, setAviso] = useState('');
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [agregarEn, setAgregarEn] = useState(null);
  const [abierta, setAbierta] = useState(leerAbierta);
  const [sucAbiertas, setSucAbiertas] = useState(() => new Set(['3B2', '3B5']));

  const sucursales = useMemo(() => sucursalesParaMatrizEntregas(), []);
  const porNombre = useMemo(() => {
    const m = {};
    for (const p of proveedores) m[p.id] = p.nombre || p.id;
    return m;
  }, [proveedores]);

  const mapa = useMemo(() => mapaEntregasPorCelda(filas), [filas]);

  const resumen = useMemo(() => {
    const porSuc = {};
    for (const f of filas) {
      const s = f.sucursal_id;
      if (!porSuc[s]) porSuc[s] = new Set();
      porSuc[s].add(f.proveedor_id);
    }
    const tiendas = Object.keys(porSuc).sort();
    const proveedoresUnicos = new Set(filas.map((f) => f.proveedor_id)).size;
    return { tiendas, proveedoresUnicos, asignaciones: filas.length };
  }, [filas]);

  const cargar = useCallback(async () => {
    if (!supabase) return;
    setCargando(true);
    const { data, error, faltaTabla } = await listarEntregasProveedores(supabase);
    setCargando(false);
    if (error) {
      setAviso(faltaTabla ? AVISO_FALTA_TABLA_ENTREGAS : error);
      setFilas([]);
      return;
    }
    setAviso('');
    setFilas(data);
  }, [supabase]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const togglePanel = () => {
    setAbierta((v) => {
      const next = !v;
      try {
        localStorage.setItem(LS_ABIERTA, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const toggleSuc = (suc) => {
    setSucAbiertas((prev) => {
      const next = new Set(prev);
      if (next.has(suc)) next.delete(suc);
      else next.add(suc);
      return next;
    });
  };

  const celda = (sucursal, dia) => mapa[`${sucursal}|${dia}`] || [];

  const onAgregar = async (sucursal, dia, proveedorId) => {
    if (!proveedorId) return;
    setGuardando(true);
    const res = await agregarEntregaProveedor(supabase, { proveedorId, sucursalId: sucursal, diaSemana: dia });
    setGuardando(false);
    if (!res.ok) {
      alert(res.error || 'No se pudo agregar.');
      if (res.faltaTabla) setAviso(AVISO_FALTA_TABLA_ENTREGAS);
      return;
    }
    setAgregarEn(null);
    await cargar();
  };

  const onQuitar = async (entregaId, nombre) => {
    if (!confirm(`¿Quitar a ${nombre || 'este proveedor'} de este día?`)) return;
    setGuardando(true);
    const res = await quitarEntregaProveedor(supabase, entregaId);
    setGuardando(false);
    if (!res.ok) {
      alert(res.error || 'No se pudo quitar.');
      return;
    }
    await cargar();
  };

  const textoResumen =
    resumen.asignaciones > 0
      ? `${resumen.tiendas.join(', ') || '—'} · ${resumen.proveedoresUnicos} proveedor(es) · ${resumen.asignaciones} día(s)`
      : 'Sin entregas programadas';

  return (
    <div
      className="card"
      style={{
        padding: 0,
        overflow: 'hidden',
        border: '1px solid var(--border)',
      }}
    >
      <button
        type="button"
        onClick={togglePanel}
        aria-expanded={abierta}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          padding: '0.85rem 1rem',
          border: 'none',
          background: abierta ? 'rgba(59,102,181,0.06)' : 'transparent',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span
          aria-hidden
          style={{
            display: 'inline-flex',
            width: 22,
            height: 22,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 4,
            border: '1px solid var(--border)',
            color: 'var(--brand-blue)',
            fontSize: '0.75rem',
            flexShrink: 0,
            transform: abierta ? 'rotate(90deg)' : 'none',
            transition: 'transform 0.15s ease',
          }}
        >
          ›
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontWeight: 700, color: 'var(--brand-blue)', fontSize: '0.95rem' }}>
            Días de entrega por sucursal
          </span>
          <span className="muted" style={{ display: 'block', fontSize: '0.8rem', marginTop: 2 }}>
            {cargando ? 'Cargando…' : textoResumen}
          </span>
        </span>
        <span className="muted" style={{ fontSize: '0.75rem', flexShrink: 0 }}>
          {abierta ? 'Ocultar' : 'Ver matriz'}
        </span>
      </button>

      {abierta && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '0.85rem 1rem 1rem' }}>
          <p className="muted" style={{ margin: '0 0 0.75rem', fontSize: '0.8rem' }}>
            Despliega cada sucursal. En cada día puedes agregar varios proveedores; pulsa un nombre para quitarlo.
          </p>

          {aviso && (
            <div
              style={{
                marginBottom: '0.75rem',
                padding: '0.55rem 0.7rem',
                borderLeft: '3px solid var(--brand-gold)',
                background: 'rgba(225,153,41,0.08)',
                fontSize: '0.85rem',
              }}
            >
              {aviso}
            </div>
          )}

          {cargando ? (
            <p className="muted" style={{ margin: 0 }}>
              Cargando matriz…
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              {sucursales.map((suc) => {
                const abiertaSuc = sucAbiertas.has(suc);
                const totalSuc = DIAS_ENTREGA.reduce((a, d) => a + celda(suc, d.dia).length, 0);
                return (
                  <div
                    key={suc}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      overflow: 'hidden',
                      background: '#fff',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSuc(suc)}
                      aria-expanded={abiertaSuc}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.55rem',
                        padding: '0.55rem 0.7rem',
                        border: 'none',
                        background: abiertaSuc ? 'rgba(59,102,181,0.04)' : '#fff',
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      <span
                        aria-hidden
                        style={{
                          color: 'var(--brand-blue)',
                          fontSize: '0.7rem',
                          transform: abiertaSuc ? 'rotate(90deg)' : 'none',
                          transition: 'transform 0.12s ease',
                          width: 12,
                        }}
                      >
                        ›
                      </span>
                      <strong style={{ fontSize: '0.88rem' }} title={etiquetaTienda(suc)}>
                        {suc}
                      </strong>
                      <span className="muted" style={{ fontSize: '0.75rem', marginLeft: 'auto' }}>
                        {totalSuc > 0 ? `${totalSuc} entrega(s)` : 'Sin programa'}
                      </span>
                    </button>

                    {abiertaSuc && (
                      <div className="table-wrap" style={{ borderTop: '1px solid var(--border)' }}>
                        <table className="data" style={{ minWidth: '640px', margin: 0 }}>
                          <thead>
                            <tr>
                              {DIAS_ENTREGA.map((d) => (
                                <th
                                  key={d.dia}
                                  style={{
                                    textAlign: 'center',
                                    fontSize: '0.72rem',
                                    fontWeight: 600,
                                    padding: '0.4rem 0.35rem',
                                    color: 'var(--brand-blue)',
                                    background: 'rgba(59,102,181,0.04)',
                                  }}
                                  title={d.largo}
                                >
                                  {d.corto}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              {DIAS_ENTREGA.map((d) => {
                                const items = celda(suc, d.dia);
                                const abriendo = agregarEn?.sucursal === suc && agregarEn?.dia === d.dia;
                                const yaIds = new Set(items.map((x) => x.proveedor_id));
                                const disponibles = proveedores.filter((p) => !yaIds.has(p.id));
                                return (
                                  <td
                                    key={d.dia}
                                    style={{
                                      verticalAlign: 'top',
                                      padding: '0.4rem',
                                      minWidth: '86px',
                                      borderColor: 'var(--border)',
                                    }}
                                  >
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minHeight: '1.8rem' }}>
                                      {items.length === 0 && !abriendo && (
                                        <span className="muted" style={{ fontSize: '0.75rem', textAlign: 'center' }}>
                                          —
                                        </span>
                                      )}
                                      {items.map((it) => {
                                        const nom = porNombre[it.proveedor_id] || 'Proveedor';
                                        return (
                                          <button
                                            key={it.id}
                                            type="button"
                                            disabled={guardando}
                                            title={`Quitar ${nom}`}
                                            onClick={() => onQuitar(it.id, nom)}
                                            style={{
                                              border: '1px solid rgba(59,102,181,0.35)',
                                              borderRadius: 4,
                                              padding: '0.18rem 0.35rem',
                                              background: 'rgba(59,102,181,0.06)',
                                              color: 'var(--brand-blue-dark)',
                                              fontSize: '0.68rem',
                                              lineHeight: 1.25,
                                              fontWeight: 600,
                                              textAlign: 'left',
                                              cursor: 'pointer',
                                              whiteSpace: 'normal',
                                              wordBreak: 'break-word',
                                            }}
                                          >
                                            {nom}
                                          </button>
                                        );
                                      })}
                                      {abriendo ? (
                                        <select
                                          className="select"
                                          autoFocus
                                          disabled={guardando || disponibles.length === 0}
                                          style={{ fontSize: '0.72rem', padding: '0.15rem', width: '100%' }}
                                          defaultValue=""
                                          onChange={(e) => {
                                            const v = e.target.value;
                                            if (v) onAgregar(suc, d.dia, v);
                                          }}
                                          onBlur={() => setTimeout(() => setAgregarEn(null), 150)}
                                        >
                                          <option value="">{disponibles.length ? 'Elegir…' : 'Sin más'}</option>
                                          {disponibles.map((p) => (
                                            <option key={p.id} value={p.id}>
                                              {p.nombre}
                                            </option>
                                          ))}
                                        </select>
                                      ) : (
                                        <button
                                          type="button"
                                          className="btn btn-ghost"
                                          disabled={guardando || proveedores.length === 0 || Boolean(aviso)}
                                          style={{
                                            padding: '0.1rem 0.3rem',
                                            fontSize: '0.68rem',
                                            alignSelf: 'center',
                                            color: 'var(--brand-blue)',
                                            minWidth: 24,
                                          }}
                                          onClick={() => setAgregarEn({ sucursal: suc, dia: d.dia })}
                                          title="Agregar proveedor"
                                        >
                                          +
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                );
                              })}
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
