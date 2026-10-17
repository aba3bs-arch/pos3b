import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  fmtMonto,
  listarGastosRutaRecientes,
  registrarGastoRutaConEvidencia,
  saldoEnTransitoRepartidor,
} from '../lib/controlEfectivo.js';
import { listarCategoriasGastoRuta } from '../lib/rutaGastosCategorias.js';
import { leerImagenProductoComoDataUrl } from '../lib/imagenProducto.js';
import { resolverRepartidorId } from '../lib/rutaTransito.js';
import CategoriasGastoRutaAdmin from '../components/CategoriasGastoRutaAdmin.jsx';
import './VentaEnRuta.css';

/**
 * Venta en Ruta → Gastos (repartidor / surtidor).
 * Registra gasto con foto del ticket; queda en RC/VentaRuta como Gasto liquidado.
 * Categorías: catálogo creado por Administrador.
 */
export default function GastosRuta({
  supabase,
  user,
  vendedorSesion = null,
  setAviso,
  onVolver,
  soloCategorias = false,
}) {
  const [categorias, setCategorias] = useState([]);
  const [avisoCats, setAvisoCats] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [monto, setMonto] = useState('');
  const [nota, setNota] = useState('');
  const [foto, setFoto] = useState(null);
  const [fotoNombre, setFotoNombre] = useState('');
  const [lista, setLista] = useState([]);
  const [saldo, setSaldo] = useState(null);
  const [repartidorId, setRepartidorId] = useState(null);
  const [repartidorNombre, setRepartidorNombre] = useState('');
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [vistaFoto, setVistaFoto] = useState(null);
  const [errorResuelve, setErrorResuelve] = useState('');
  const inputFotoRef = useRef(null);

  const cargarCategorias = useCallback(async () => {
    if (!supabase) return;
    const r = await listarCategoriasGastoRuta(supabase);
    if (r.aviso) setAvisoCats(r.aviso);
    else setAvisoCats('');
    const rows = r.data || [];
    setCategorias(rows);
    setCategoriaId((prev) => {
      if (prev && rows.some((c) => String(c.id) === String(prev))) return prev;
      return rows[0]?.id ? String(rows[0].id) : '';
    });
  }, [supabase]);

  const cargar = useCallback(async () => {
    if (!supabase || !vendedorSesion || soloCategorias) {
      setCargando(false);
      return;
    }
    setCargando(true);
    setErrorResuelve('');
    try {
      await cargarCategorias();
      const res = await resolverRepartidorId(
        supabase,
        vendedorSesion.id || vendedorSesion.usuario_id,
        vendedorSesion.nombre,
        { repartidorId: vendedorSesion.repartidor_id },
      );
      if (!res.ok) {
        setErrorResuelve(res.error || 'No se pudo resolver el recolector.');
        setRepartidorId(null);
        setLista([]);
        setSaldo(null);
        return;
      }
      setRepartidorId(res.id);
      setRepartidorNombre(vendedorSesion.nombre || user?.nombre || res.id);

      const [s, g] = await Promise.all([
        saldoEnTransitoRepartidor(supabase, res.id),
        listarGastosRutaRecientes(supabase, { repartidorId: res.id, limit: 30 }),
      ]);
      setSaldo(s);
      if (g.error) setAviso?.(g.error);
      setLista(g.data || []);
    } finally {
      setCargando(false);
    }
  }, [supabase, vendedorSesion, user?.nombre, setAviso, soloCategorias, cargarCategorias]);

  useEffect(() => {
    if (soloCategorias) {
      void cargarCategorias();
      setCargando(false);
      return;
    }
    void cargar();
  }, [cargar, soloCategorias, cargarCategorias]);

  const onFoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const dataUrl = await leerImagenProductoComoDataUrl(file, {
        maxSide: 1280,
        quality: 0.78,
        maxBytes: 900 * 1024,
      });
      setFoto(dataUrl);
      setFotoNombre(file.name || 'ticket.jpg');
    } catch (err) {
      alert(err?.message || 'No se pudo leer la foto.');
    }
  };

  const registrar = async () => {
    if (!repartidorId) return alert(errorResuelve || 'Sin recolector.');
    const cat = categorias.find((c) => String(c.id) === String(categoriaId));
    if (!cat) return alert('No hay categorías. Un administrador debe crearlas primero.');
    const m = Number(String(monto).replace(',', '.'));
    if (!(m > 0)) return alert('Captura un monto válido.');
    if (!foto) return alert('Toma o adjunta la foto del ticket / nota de remisión.');
    setEnviando(true);
    try {
      const r = await registrarGastoRutaConEvidencia(supabase, {
        repartidorId,
        monto: m,
        categoriaId: cat.id,
        categoriaNombre: cat.nombre,
        descripcion: nota,
        evidenciaUrl: foto,
        registradoPor: repartidorNombre || user?.nombre,
        origen: 'Ruta',
      });
      if (!r.ok) return alert(r.error || 'No se pudo registrar el gasto.');
      setAviso?.(
        `Gasto registrado · ${r.concepto} · ${fmtMonto(r.monto)} · ${r.folio}. `
        + 'Se descuenta en RC/VentaRuta.',
      );
      setMonto('');
      setNota('');
      setFoto(null);
      setFotoNombre('');
      await cargar();
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="ruta-invop" style={{ gap: '0.65rem' }}>
      <header className="ruta-invop-hero">
        <div className="ruta-invop-hero-text">
          <p className="ruta-invop-kicker">Venta en ruta · Gastos</p>
          <h3>{soloCategorias ? 'Categorías de gasto' : 'Registrar gasto'}</h3>
          <p className="ruta-invop-lead">
            {soloCategorias
              ? 'Crea, edita o elimina las categorías que verá el repartidor al registrar un gasto.'
              : (
                <>
                  Captura categoría, monto y foto del ticket o nota de remisión.
                  El gasto se refleja en <strong>RC/VentaRuta</strong> y se descuenta del efectivo en tránsito.
                </>
              )}
          </p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center' }}>
          {onVolver && (
            <button type="button" className="btn btn-ghost" onClick={onVolver}>
              ← Hub
            </button>
          )}
        </div>
      </header>

      <CategoriasGastoRutaAdmin
        supabase={supabase}
        user={user}
        setAviso={setAviso}
        onChanged={() => void cargarCategorias()}
      />

      {soloCategorias ? null : (
        <>
          {errorResuelve ? (
            <div className="card" style={{ borderLeft: '4px solid #b91c1c', padding: '0.75rem 1rem' }}>
              <strong style={{ color: '#b91c1c' }}>No se puede registrar</strong>
              <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.85rem' }}>{errorResuelve}</p>
            </div>
          ) : null}

          {!errorResuelve && (
            <div className="card" style={{ padding: '0.85rem 1rem' }}>
              <p style={{ margin: 0, fontSize: '0.9rem' }}>
                Recolector: <strong>{repartidorNombre || '—'}</strong>
                {saldo ? (
                  <span className="muted">
                    {' '}· Disponible en tránsito: <strong>{fmtMonto(saldo.disponible)}</strong>
                  </span>
                ) : null}
              </p>
            </div>
          )}

          <div className="card" style={{ padding: '0.9rem 1rem', display: 'grid', gap: '0.75rem' }}>
            {avisoCats ? (
              <p style={{ margin: 0, color: '#b91c1c', fontSize: '0.85rem' }}>{avisoCats}</p>
            ) : null}
            {!categorias.length && !avisoCats ? (
              <p style={{ margin: 0, color: '#b91c1c', fontSize: '0.85rem' }}>
                No hay categorías activas. Un administrador debe crearlas arriba.
              </p>
            ) : null}

            <label style={{ display: 'grid', gap: 4, fontSize: '0.85rem' }}>
              Categoría
              <select
                value={categoriaId}
                onChange={(e) => setCategoriaId(e.target.value)}
                disabled={enviando || !!errorResuelve || !categorias.length}
              >
                {!categorias.length ? (
                  <option value="">Sin categorías</option>
                ) : (
                  categorias.map((c) => (
                    <option key={c.id} value={c.id}>{c.nombre}</option>
                  ))
                )}
              </select>
            </label>

            <label style={{ display: 'grid', gap: 4, fontSize: '0.85rem' }}>
              Monto ($)
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                placeholder="0.00"
                disabled={enviando || !!errorResuelve}
              />
            </label>

            <label style={{ display: 'grid', gap: 4, fontSize: '0.85rem' }}>
              Nota / detalle (opcional)
              <input
                type="text"
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                placeholder="Ej. ticket Pemex · folio 1234"
                maxLength={200}
                disabled={enviando || !!errorResuelve}
              />
            </label>

            <div>
              <p style={{ margin: '0 0 0.35rem', fontSize: '0.85rem', fontWeight: 600 }}>
                Foto del ticket / nota de remisión
              </p>
              <input
                ref={inputFotoRef}
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: 'none' }}
                onChange={(e) => void onFoto(e)}
              />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={enviando || !!errorResuelve}
                  onClick={() => inputFotoRef.current?.click()}
                >
                  {foto ? 'Cambiar foto' : 'Tomar / subir foto'}
                </button>
                {foto ? (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => { setFoto(null); setFotoNombre(''); }}
                  >
                    Quitar
                  </button>
                ) : null}
                {fotoNombre ? (
                  <span className="muted" style={{ fontSize: '0.8rem' }}>{fotoNombre}</span>
                ) : null}
              </div>
              {foto ? (
                <button
                  type="button"
                  onClick={() => setVistaFoto(foto)}
                  style={{
                    display: 'block',
                    marginTop: '0.65rem',
                    padding: 0,
                    border: '1px solid rgba(0,0,0,0.12)',
                    borderRadius: 10,
                    overflow: 'hidden',
                    background: '#111',
                    cursor: 'zoom-in',
                    maxWidth: 220,
                  }}
                >
                  <img
                    src={foto}
                    alt="Evidencia del gasto"
                    style={{ display: 'block', width: '100%', height: 'auto', maxHeight: 160, objectFit: 'cover' }}
                  />
                </button>
              ) : (
                <p className="muted" style={{ margin: '0.5rem 0 0', fontSize: '0.8rem' }}>
                  Obligatoria. Usa la cámara trasera del celular o adjunta la imagen.
                </p>
              )}
            </div>

            <button
              type="button"
              className="btn btn-primary"
              disabled={enviando || cargando || !!errorResuelve || !categorias.length}
              onClick={() => void registrar()}
              style={{ marginTop: 4 }}
            >
              {enviando ? 'Registrando…' : 'Registrar gasto'}
            </button>
          </div>

          <div className="card" style={{ padding: '0.85rem 1rem' }}>
            <h4 style={{ margin: '0 0 0.5rem' }}>Últimos gastos</h4>
            {cargando ? (
              <p className="muted" style={{ margin: 0 }}>Cargando…</p>
            ) : !lista.length ? (
              <p className="muted" style={{ margin: 0 }}>Aún no hay gastos de este recolector.</p>
            ) : (
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: '0.5rem' }}>
                {lista.map((g) => {
                  const evid = g.evidencia_url && String(g.evidencia_url).startsWith('data:image')
                    ? g.evidencia_url
                    : null;
                  return (
                    <li
                      key={g.id}
                      style={{
                        display: 'flex',
                        gap: '0.65rem',
                        alignItems: 'center',
                        padding: '0.5rem 0.55rem',
                        borderRadius: 10,
                        background: 'rgba(185,28,28,0.06)',
                        border: '1px solid rgba(185,28,28,0.15)',
                      }}
                    >
                      {evid ? (
                        <button
                          type="button"
                          onClick={() => setVistaFoto(evid)}
                          style={{
                            padding: 0,
                            border: 'none',
                            borderRadius: 8,
                            overflow: 'hidden',
                            width: 48,
                            height: 48,
                            flexShrink: 0,
                            cursor: 'zoom-in',
                            background: '#111',
                          }}
                        >
                          <img src={evid} alt="" style={{ width: 48, height: 48, objectFit: 'cover', display: 'block' }} />
                        </button>
                      ) : (
                        <span
                          style={{
                            width: 48,
                            height: 48,
                            borderRadius: 8,
                            background: 'rgba(0,0,0,0.06)',
                            flexShrink: 0,
                            display: 'grid',
                            placeItems: 'center',
                            fontSize: '0.7rem',
                            color: '#666',
                          }}
                        >
                          —
                        </span>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.88rem', fontWeight: 600 }}>
                          {g.descripcion_gasto || g.num_traspaso || 'Gasto'}
                        </div>
                        <div className="muted" style={{ fontSize: '0.75rem' }}>
                          {g.num_traspaso || '—'} · {g.estatus}
                          {g.fecha_hora ? ` · ${new Date(g.fecha_hora).toLocaleString('es-MX')}` : ''}
                        </div>
                      </div>
                      <strong style={{ color: '#b91c1c', whiteSpace: 'nowrap' }}>
                        −{fmtMonto(g.monto)}
                      </strong>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}

      {vistaFoto ? (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setVistaFoto(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 13000,
            background: 'rgba(0,0,0,0.82)',
            display: 'grid',
            placeItems: 'center',
            padding: '1rem',
          }}
        >
          <img
            src={vistaFoto}
            alt="Evidencia"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '100%', maxHeight: '90vh', borderRadius: 8 }}
          />
          <button
            type="button"
            className="btn"
            onClick={() => setVistaFoto(null)}
            style={{ position: 'fixed', top: 16, right: 16 }}
          >
            Cerrar
          </button>
        </div>
      ) : null}
    </div>
  );
}
