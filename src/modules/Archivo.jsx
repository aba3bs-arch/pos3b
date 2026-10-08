import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { etiquetaTienda } from '../constants/sucursales.js';
import {
  EVENTO_DIAS_ARCHIVO,
  construirArbolArchivoPorDepartamento,
  construirArbolArchivoPorEvento,
  archivarPendientesOperativos,
  leerDiasArchivoOperativo,
  listarArchivoOperativo,
  restaurarDesdeArchivo,
  ymdUmbralArchivo,
} from '../lib/archivo.js';
import { normalizarRol } from '../lib/roles.js';

const CARPETA_BTN = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.65rem',
  width: '100%',
  textAlign: 'left',
  padding: '0.75rem 0.9rem',
  border: '1px solid var(--border, #e2e8f0)',
  borderRadius: 10,
  background: '#fff',
  cursor: 'pointer',
  color: 'inherit',
};

function IconoCarpeta() {
  return (
    <span
      aria-hidden
      style={{
        width: 36,
        height: 28,
        borderRadius: 4,
        background: 'linear-gradient(180deg, #fbbf24 0%, #f59e0b 55%, #d97706 100%)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.45)',
        flexShrink: 0,
        position: 'relative',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: -4,
          left: 4,
          width: 14,
          height: 8,
          borderRadius: '3px 3px 0 0',
          background: '#f59e0b',
        }}
      />
    </span>
  );
}

function FilaCarpeta({ titulo, subtitulo, count, onOpen }) {
  return (
    <button type="button" style={CARPETA_BTN} onClick={onOpen}>
      <IconoCarpeta />
      <span style={{ flex: 1, minWidth: 0 }}>
        <strong style={{ display: 'block', fontSize: '0.95rem' }}>{titulo}</strong>
        {subtitulo ? (
          <span className="muted" style={{ fontSize: '0.78rem' }}>{subtitulo}</span>
        ) : null}
      </span>
      <span className="badge" style={{ flexShrink: 0 }}>{count}</span>
    </button>
  );
}

/**
 * Archivo como explorador de carpetas:
 * Tienda → Evento (cortes/vales/…) → Departamento → registros
 * (o Tienda → Departamento → Evento).
 */
export default function Archivo({ supabase, user }) {
  const esAdmin = normalizarRol(user?.rol) === 'Administrador';
  const [diasRetencion, setDiasRetencion] = useState(() => leerDiasArchivoOperativo());
  const [modo, setModo] = useState('evento'); // evento | departamento
  const [ruta, setRuta] = useState([]); // crumbs: [{kind,id,label}]
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
    const res = await listarArchivoOperativo(supabase, { limit: 800 });
    setCargando(false);
    if (!res.ok) {
      setError(res.error || 'No se pudo cargar el archivo.');
      setFilas([]);
      return;
    }
    setFilas(res.filas || []);
    if (res.avisos?.length) setAviso(res.avisos.join(' · '));
    else setAviso('');
  }, [supabase]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const arbol = useMemo(
    () => (modo === 'departamento'
      ? construirArbolArchivoPorDepartamento(filas)
      : construirArbolArchivoPorEvento(filas)),
    [filas, modo],
  );

  const ejecutarArchivo = async () => {
    if (!supabase || !esAdmin) return;
    if (
      !confirm(
        `¿Archivar registros operativos anteriores a ${umbral}?\n\n`
        + `Se organizan en carpetas por tienda → ${modo === 'evento' ? 'evento → departamento' : 'departamento → evento'}.\n`
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
    setRuta([]);
    await cargar();
  };

  const restaurar = async (f) => {
    if (!esAdmin) return;
    if (!confirm(`¿Restaurar este registro a ${f.tipoLabel}? Volverá a verse en el módulo operativo.`)) return;
    const res = await restaurarDesdeArchivo(supabase, f.tipo, f.id, { user });
    if (!res.ok) return alert(res.error);
    await cargar();
  };

  const irA = (crumbs) => setRuta(crumbs);
  const subir = () => setRuta((r) => r.slice(0, -1));

  // Resolver vista según ruta
  const vista = useMemo(() => {
    const tienda = ruta[0] ? arbol.find((t) => t.id === ruta[0].id) : null;
    if (!ruta.length) {
      return { nivel: 'tiendas', carpetas: arbol.map((t) => ({
        id: t.id,
        label: etiquetaTienda(t.id),
        count: t.count,
        sub: `${t.count} registro${t.count === 1 ? '' : 's'}`,
        onOpen: () => irA([{ kind: 'tienda', id: t.id, label: etiquetaTienda(t.id) }]),
      })) };
    }

    if (modo === 'evento') {
      if (ruta.length === 1 && tienda) {
        return {
          nivel: 'eventos',
          carpetas: (tienda.eventos || []).map((ev) => ({
            id: ev.id,
            label: ev.label,
            count: ev.count,
            sub: 'Evento',
            onOpen: () => irA([
              ruta[0],
              { kind: 'evento', id: ev.id, label: ev.label },
            ]),
          })),
        };
      }
      const ev = tienda?.eventos?.find((e) => e.id === ruta[1]?.id);
      if (ruta.length === 2 && ev) {
        return {
          nivel: 'departamentos',
          carpetas: (ev.departamentos || []).map((d) => ({
            id: d.id,
            label: d.label,
            count: d.count,
            sub: 'Departamento',
            onOpen: () => irA([
              ruta[0],
              ruta[1],
              { kind: 'departamento', id: d.id, label: d.label },
            ]),
          })),
        };
      }
      const dep = ev?.departamentos?.find((d) => d.id === ruta[2]?.id);
      if (ruta.length >= 3 && dep) {
        return { nivel: 'registros', items: dep.items || [] };
      }
    } else {
      // Tienda → Departamento → Evento
      if (ruta.length === 1 && tienda) {
        return {
          nivel: 'departamentos',
          carpetas: (tienda.departamentos || []).map((d) => ({
            id: d.id,
            label: d.label,
            count: d.count,
            sub: 'Departamento',
            onOpen: () => irA([
              ruta[0],
              { kind: 'departamento', id: d.id, label: d.label },
            ]),
          })),
        };
      }
      const dep = tienda?.departamentos?.find((d) => d.id === ruta[1]?.id);
      if (ruta.length === 2 && dep) {
        return {
          nivel: 'eventos',
          carpetas: (dep.eventos || []).map((ev) => ({
            id: ev.id,
            label: ev.label,
            count: ev.count,
            sub: 'Evento',
            onOpen: () => irA([
              ruta[0],
              ruta[1],
              { kind: 'evento', id: ev.id, label: ev.label },
            ]),
          })),
        };
      }
      const ev = dep?.eventos?.find((e) => e.id === ruta[2]?.id);
      if (ruta.length >= 3 && ev) {
        return { nivel: 'registros', items: ev.items || [] };
      }
    }

    return { nivel: 'tiendas', carpetas: [] };
  }, [arbol, ruta, modo]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <h2 style={{ margin: 0, color: '#475569' }}>Archivo</h2>
        <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.85rem', maxWidth: 720 }}>
          Carpetas por <strong>tienda</strong>, luego por{' '}
          <strong>{modo === 'evento' ? 'evento (cortes, vales, pagarés…)' : 'departamento'}</strong>
          {' '}y {modo === 'evento' ? 'departamento' : 'evento'}.
          {' '}Plazo: <strong>{diasRetencion} días</strong> (Configuración → Operación).
          {' '}No afecta IE VIRTUAL / IE ABARROTES.
        </p>
      </div>

      <div className="card" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
        <span className="muted" style={{ fontSize: '0.8rem', marginRight: 4 }}>Organizar:</span>
        <button
          type="button"
          className={`btn ${modo === 'evento' ? 'btn-primary' : 'btn-ghost'}`}
          style={{ fontSize: '0.85rem' }}
          onClick={() => { setModo('evento'); setRuta([]); }}
        >
          Tienda → Evento → Depto
        </button>
        <button
          type="button"
          className={`btn ${modo === 'departamento' ? 'btn-primary' : 'btn-ghost'}`}
          style={{ fontSize: '0.85rem' }}
          onClick={() => { setModo('departamento'); setRuta([]); }}
        >
          Tienda → Depto → Evento
        </button>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn btn-ghost" onClick={() => void cargar()} disabled={cargando}>
          {cargando ? 'Cargando…' : 'Actualizar'}
        </button>
        {esAdmin && (
          <button type="button" className="btn btn-primary" onClick={() => void ejecutarArchivo()} disabled={archivando}>
            {archivando ? 'Archivando…' : `Archivar +${diasRetencion} días`}
          </button>
        )}
      </div>

      {/* Breadcrumb */}
      <div className="card" style={{ padding: '0.55rem 0.75rem', display: 'flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'center', fontSize: '0.85rem' }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => irA([])} style={{ padding: '0.15rem 0.45rem' }}>
          📁 Archivo
        </button>
        {ruta.map((c, i) => (
          <React.Fragment key={`${c.kind}-${c.id}`}>
            <span className="muted">/</span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ padding: '0.15rem 0.45rem', fontWeight: i === ruta.length - 1 ? 700 : 400 }}
              onClick={() => irA(ruta.slice(0, i + 1))}
            >
              {c.label}
            </button>
          </React.Fragment>
        ))}
        {ruta.length > 0 && (
          <>
            <span style={{ flex: 1 }} />
            <button type="button" className="btn btn-ghost btn-sm" onClick={subir}>← Atrás</button>
          </>
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

      {vista.nivel !== 'registros' && (
        <div style={{ display: 'grid', gap: '0.55rem' }}>
          {(vista.carpetas || []).length === 0 && !cargando ? (
            <div className="card muted">
              {filas.length === 0
                ? 'Aún no hay registros archivados. Usa «Archivar» para mover los que ya pasaron el plazo.'
                : 'Esta carpeta está vacía.'}
            </div>
          ) : (
            (vista.carpetas || []).map((c) => (
              <FilaCarpeta
                key={c.id}
                titulo={c.label}
                subtitulo={c.sub}
                count={c.count}
                onOpen={c.onOpen}
              />
            ))
          )}
        </div>
      )}

      {vista.nivel === 'registros' && (
        <div className="card" style={{ padding: '0.85rem' }}>
          <h3 style={{ margin: '0 0 0.65rem', fontSize: '1rem', color: 'var(--brand-blue)' }}>
            Registros
            <span className="muted" style={{ fontWeight: 400, fontSize: '0.8rem', marginLeft: '0.45rem' }}>
              ({(vista.items || []).length})
            </span>
          </h3>
          {(vista.items || []).length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>Sin registros en esta carpeta.</p>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Resumen</th>
                    <th>Archivado</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {(vista.items || []).map((f) => (
                    <tr key={`${f.tipo}-${f.id}`}>
                      <td>{f.fecha || '—'}</td>
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
          )}
        </div>
      )}
    </div>
  );
}
