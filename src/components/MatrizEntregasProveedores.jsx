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

export default function MatrizEntregasProveedores({ supabase, proveedores = [] }) {
  const [filas, setFilas] = useState([]);
  const [aviso, setAviso] = useState('');
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [agregarEn, setAgregarEn] = useState(null); // { sucursal, dia }

  const sucursales = useMemo(() => sucursalesParaMatrizEntregas(), []);
  const porNombre = useMemo(() => {
    const m = {};
    for (const p of proveedores) m[p.id] = p.nombre || p.id;
    return m;
  }, [proveedores]);

  const mapa = useMemo(() => mapaEntregasPorCelda(filas), [filas]);

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

  return (
    <div className="card" style={{ borderTop: '4px solid var(--brand-gold)' }}>
      <h3 style={{ margin: '0 0 0.35rem', color: 'var(--brand-blue)' }}>Días de entrega por sucursal</h3>
      <p className="muted" style={{ margin: '0 0 0.75rem', fontSize: '0.85rem' }}>
        En cada casilla puedes poner <strong>varios proveedores</strong> que entregan ese día. Pulsa una pastilla para quitarla.
      </p>

      {aviso && (
        <div
          style={{
            marginBottom: '0.75rem',
            padding: '0.55rem 0.7rem',
            borderLeft: '4px solid var(--brand-gold)',
            background: 'rgba(225,153,41,0.08)',
            fontSize: '0.88rem',
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
        <div className="table-wrap">
          <table className="data" style={{ minWidth: '720px' }}>
            <thead>
              <tr>
                <th style={{ minWidth: '88px' }}>Sucursal</th>
                {DIAS_ENTREGA.map((d) => (
                  <th key={d.dia} style={{ textAlign: 'center', minWidth: '96px' }} title={d.largo}>
                    {d.corto}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sucursales.map((suc) => (
                <tr key={suc}>
                  <td style={{ fontWeight: 600, verticalAlign: 'top' }}>
                    <span title={etiquetaTienda(suc)}>{suc}</span>
                  </td>
                  {DIAS_ENTREGA.map((d) => {
                    const items = celda(suc, d.dia);
                    const abriendo = agregarEn?.sucursal === suc && agregarEn?.dia === d.dia;
                    const yaIds = new Set(items.map((x) => x.proveedor_id));
                    const disponibles = proveedores.filter((p) => !yaIds.has(p.id));
                    return (
                      <td key={d.dia} style={{ verticalAlign: 'top', padding: '0.4rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', minHeight: '2.2rem' }}>
                          {items.length === 0 && !abriendo && (
                            <span className="muted" style={{ fontSize: '0.8rem' }}>
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
                                  border: 'none',
                                  borderRadius: 6,
                                  padding: '0.2rem 0.4rem',
                                  background: 'var(--brand-blue)',
                                  color: '#fff',
                                  fontSize: '0.72rem',
                                  lineHeight: 1.25,
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
                              style={{ fontSize: '0.75rem', padding: '0.2rem', width: '100%' }}
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
                              style={{ padding: '0.15rem 0.35rem', fontSize: '0.7rem', alignSelf: 'flex-start' }}
                              onClick={() => setAgregarEn({ sucursal: suc, dia: d.dia })}
                            >
                              +
                            </button>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
