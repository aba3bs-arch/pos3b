import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { listarSucursalesOperativas, etiquetaTienda } from '../constants/sucursales.js';
import {
  EVENTO_DIAS_ARCHIVO,
  TIPOS_ARCHIVO,
  agruparArchivoPorSucursalDeptoFecha,
  archivarPendientesOperativos,
  leerDiasArchivoOperativo,
  listarArchivoOperativo,
  restaurarDesdeArchivo,
  ymdUmbralArchivo,
} from '../lib/archivo.js';
import { normalizarRol } from '../lib/roles.js';

const DEPTOS = [
  { id: '', label: 'Todos' },
  { id: 'virtual', label: 'Virtual' },
  { id: 'abarrotes', label: 'Abarrotes' },
  { id: 'garage', label: 'Garage' },
];

/**
 * Módulo Archivo: consulta registros soft-archivados (plazo en Configuración).
 * IE VIRTUAL / IE ABARROTES no usan archived_at → contabilidad intacta.
 */
export default function Archivo({ supabase, user }) {
  const esAdmin = normalizarRol(user?.rol) === 'Administrador';
  const [diasRetencion, setDiasRetencion] = useState(() => leerDiasArchivoOperativo());
  const [tipo, setTipo] = useState('');
  const [sucursal, setSucursal] = useState('');
  const [departamento, setDepartamento] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [archivando, setArchivando] = useState(false);
  const [aviso, setAviso] = useState('');
  const [error, setError] = useState('');
  const umbral = useMemo(() => ymdUmbralArchivo(new Date(), diasRetencion), [diasRetencion]);

  useEffect(() => {
    const sync = () => setDiasRetencion(leerDiasArchivoOperativo());
    window.addEventListener(EVENTO_DIAS_ARCHIVO, sync);
    return () => window.removeEventListener(EVENTO_DIAS_ARCHIVO, sync);
  }, []);

  const cargar = useCallback(async () => {
    if (!supabase) return;
    setCargando(true);
    setError('');
    const res = await listarArchivoOperativo(supabase, {
      tipo: tipo || undefined,
      sucursal: sucursal || undefined,
      departamento: departamento || undefined,
      desde: desde || undefined,
      hasta: hasta || undefined,
      limit: 400,
    });
    setCargando(false);
    if (!res.ok) {
      setError(res.error || 'No se pudo cargar el archivo.');
      setFilas([]);
      return;
    }
    setFilas(res.filas || []);
    if (res.avisos?.length) setAviso(res.avisos.join(' · '));
    else setAviso('');
  }, [supabase, tipo, sucursal, departamento, desde, hasta]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const grupos = useMemo(() => agruparArchivoPorSucursalDeptoFecha(filas), [filas]);

  const ejecutarArchivo = async () => {
    if (!supabase || !esAdmin) return;
    if (
      !confirm(
        `¿Archivar registros operativos anteriores a ${umbral}?\n\n`
        + `Se quitan de cortes, reportes, vales, pagarés, préstamos y nóminas.\n`
        + `IE VIRTUAL / IE ABARROTES / Garage en IE NO se modifican.`,
      )
    ) {
      return;
    }
    setArchivando(true);
    setError('');
    const res = await archivarPendientesOperativos(supabase, { user });
    setArchivando(false);
    if (!res.ok && res.error) {
      setError(res.error);
      return;
    }
    setAviso(res.mensaje || 'Listo.');
    await cargar();
  };

  const restaurar = async (f) => {
    if (!esAdmin) return;
    if (!confirm(`¿Restaurar este registro a ${f.tipoLabel}? Volverá a verse en el módulo operativo.`)) return;
    const res = await restaurarDesdeArchivo(supabase, f.tipo, f.id, { user });
    if (!res.ok) return alert(res.error);
    await cargar();
  };

  const sucursales = useMemo(() => listarSucursalesOperativas(), []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <h2 style={{ margin: 0, color: '#475569' }}>Archivo</h2>
        <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.85rem', maxWidth: 720 }}>
          Registros de más de <strong>{diasRetencion} días</strong> salen de cortes, reportes,
          gastos, vales, pagarés, préstamos y nóminas. Se consultan aquí por{' '}
          <strong>sucursal · departamento · fecha</strong>.
          {' '}
          <strong>No afectan</strong> IE VIRTUAL, IE ABARROTES ni Garage en IE.
        </p>
        <p className="muted" style={{ margin: '0.25rem 0 0', fontSize: '0.8rem' }}>
          Umbral actual: anteriores a <strong>{umbral}</strong>
          {' · '}plazo en <strong>Configuración → Operación</strong>.
          {' '}Deudas abiertas (pagarés / préstamos activos) no se archivan.
        </p>
      </div>

      <div className="card" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'flex-end' }}>
        <label className="muted" style={{ fontSize: '0.8rem' }}>
          Tipo
          <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value)} style={{ display: 'block', marginTop: 4, minWidth: 160 }}>
            <option value="">Todos</option>
            {TIPOS_ARCHIVO.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        </label>
        <label className="muted" style={{ fontSize: '0.8rem' }}>
          Sucursal
          <select className="input" value={sucursal} onChange={(e) => setSucursal(e.target.value)} style={{ display: 'block', marginTop: 4, minWidth: 140 }}>
            <option value="">Todas</option>
            {sucursales.map((s) => (
              <option key={s} value={s}>{etiquetaTienda(s)}</option>
            ))}
          </select>
        </label>
        <label className="muted" style={{ fontSize: '0.8rem' }}>
          Departamento
          <select className="input" value={departamento} onChange={(e) => setDepartamento(e.target.value)} style={{ display: 'block', marginTop: 4, minWidth: 120 }}>
            {DEPTOS.map((d) => (
              <option key={d.id || 'all'} value={d.id}>{d.label}</option>
            ))}
          </select>
        </label>
        <label className="muted" style={{ fontSize: '0.8rem' }}>
          Desde
          <input className="input" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} style={{ display: 'block', marginTop: 4 }} />
        </label>
        <label className="muted" style={{ fontSize: '0.8rem' }}>
          Hasta
          <input className="input" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} style={{ display: 'block', marginTop: 4 }} />
        </label>
        <button type="button" className="btn btn-ghost" onClick={() => void cargar()} disabled={cargando}>
          {cargando ? 'Cargando…' : 'Actualizar'}
        </button>
        {esAdmin && (
          <button type="button" className="btn btn-primary" onClick={() => void ejecutarArchivo()} disabled={archivando}>
            {archivando ? 'Archivando…' : `Archivar +${diasRetencion} días`}
          </button>
        )}
      </div>

      {error && (
        <div className="card" style={{ borderColor: 'rgba(185,28,28,0.35)', background: '#fef2f2' }}>
          <strong>Error:</strong> <span className="muted">{error}</span>
        </div>
      )}
      {aviso && !error && (
        <div className="card" style={{ borderColor: 'rgba(15,118,110,0.3)', background: '#f0fdfa' }}>
          <span className="muted">{aviso}</span>
        </div>
      )}

      {grupos.length === 0 && !cargando ? (
        <div className="card muted">No hay registros archivados con esos filtros.</div>
      ) : (
        grupos.map((g) => (
          <div key={`${g.sucursal_id}-${g.departamento}-${g.fecha}`} className="card" style={{ padding: '0.85rem' }}>
            <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem', color: 'var(--brand-blue)' }}>
              {etiquetaTienda(g.sucursal_id)} · {g.departamento} · {g.fecha}
              <span className="muted" style={{ fontWeight: 400, fontSize: '0.8rem', marginLeft: '0.5rem' }}>
                ({g.items.length})
              </span>
            </h3>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Tipo</th>
                    <th>Resumen</th>
                    <th>Archivado</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {g.items.map((f) => (
                    <tr key={`${f.tipo}-${f.id}`}>
                      <td>{f.tipoLabel}</td>
                      <td>{f.resumen}</td>
                      <td className="muted" style={{ fontSize: '0.8rem' }}>
                        {f.archived_at ? new Date(f.archived_at).toLocaleString('es-MX') : '—'}
                        {f.archived_by ? ` · ${f.archived_by}` : ''}
                      </td>
                      <td>
                        {esAdmin && (
                          <button type="button" className="btn btn-ghost" style={{ fontSize: '0.8rem' }} onClick={() => void restaurar(f)}>
                            Restaurar
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
