import React, { useEffect, useMemo, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { TUTORIALES } from '../content/tutoriales.js';

function renderTexto(text) {
  const parts = String(text).split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={i}>{part.slice(1, -1)}</code>;
    }
    return <span key={i}>{part}</span>;
  });
}

function fmtMx(n) {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  return v.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function calcCaja(campos) {
  const c = campos || {};
  const subtotal = round2(
    (Number(c.venta) || 0) -
      (Number(c.gastos) || 0) -
      (Number(c.faltante) || 0) -
      (Number(c.tarjeta) || 0),
  );
  const caja = round2(
    (Number(c.caja_anterior) || 0) + subtotal - (Number(c.recoleccion) || 0),
  );
  return { caja, subtotal };
}

function MapaHotspots({ imagen, hotspots, activo, onSelect, alt }) {
  const entries = Object.entries(hotspots || {});
  if (!imagen) return null;
  return (
    <figure className="tut-mapa">
      <div className="tut-mapa__frame">
        <img src={imagen} alt={alt || 'Pantalla del módulo'} className="tut-mapa__img" />
        {entries.map(([id, hs]) => {
          const isOn = activo === id;
          return (
            <button
              key={id}
              type="button"
              className={`tut-mapa__spot${isOn ? ' tut-mapa__spot--on' : ''}`}
              style={{
                top: `${hs.top}%`,
                left: `${hs.left}%`,
                width: `${hs.width}%`,
                height: `${hs.height}%`,
              }}
              onClick={() => onSelect?.(id)}
              title={hs.label}
              aria-label={hs.label}
            >
              <span className="tut-mapa__spot-lbl">{hs.label}</span>
            </button>
          );
        })}
      </div>
      <figcaption className="muted tut-mapa__cap">
        Toca una zona de la captura real para ir a ese paso.
      </figcaption>
    </figure>
  );
}

function EjemploCaja({ ejemplo }) {
  const [campos, setCampos] = useState({ ...(ejemplo.campos || {}) });
  const { caja, subtotal } = calcCaja(campos);
  const negativo = caja < -0.001;

  useEffect(() => {
    setCampos({ ...(ejemplo.campos || {}) });
  }, [ejemplo]);

  const set = (key) => (e) => {
    const raw = e.target.value;
    setCampos((prev) => ({ ...prev, [key]: raw === '' ? '' : Number(raw) }));
  };

  const filas = [
    { key: 'caja_anterior', label: 'Caja chica anterior (+)' },
    { key: 'venta', label: 'Venta total (+)' },
    { key: 'gastos', label: 'Gastos / egresos (−)' },
    { key: 'tarjeta', label: 'Pago tarjeta (−)' },
    { key: 'faltante', label: 'Faltante (−)' },
    { key: 'recoleccion', label: 'Recolección (−)' },
  ];

  return (
    <div className="tut-ejemplo">
      <h4 className="tut-ejemplo__titulo">{ejemplo.titulo}</h4>
      <p className="muted" style={{ margin: '0 0 0.65rem', fontSize: '0.85rem' }}>
        Misma lógica que en pantalla: subtotal = venta − egresos − tarjeta − faltante;
        caja = anterior + subtotal − recolección.
      </p>
      {(ejemplo.presets || []).length > 0 ? (
        <div className="tut-ejemplo__tabs" role="tablist">
          {ejemplo.presets.map((p) => (
            <button
              key={p.id}
              type="button"
              className="btn btn-ghost"
              style={{ fontSize: '0.78rem', padding: '0.35rem 0.65rem' }}
              onClick={() => setCampos({ ...p.campos })}
            >
              {p.label}
            </button>
          ))}
        </div>
      ) : null}
      <div className="tut-ejemplo__grid">
        <div className="tut-ejemplo__campos">
          {filas.map(({ key, label }) => (
            <label key={key} className="tut-ejemplo__campo">
              <span>{label}</span>
              <input
                className="input"
                type="number"
                step="1"
                value={campos[key] ?? 0}
                onChange={set(key)}
              />
            </label>
          ))}
        </div>
        <div className="tut-ejemplo__resultado">
          <div style={{ fontSize: '0.8rem', opacity: 0.9 }}>Subtotal turno</div>
          <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#f1c40f' }}>{fmtMx(subtotal)}</div>
          <div style={{ fontSize: '0.72rem', opacity: 0.75, marginTop: '0.15rem' }}>
            Venta − egresos − tarjeta − faltante
          </div>
          <div style={{ fontSize: '0.8rem', opacity: 0.9, marginTop: '0.85rem' }}>Caja chica actual</div>
          <div
            style={{
              fontSize: '1.9rem',
              fontWeight: 800,
              color: negativo ? '#e74c3c' : '#2ecc71',
            }}
          >
            {fmtMx(caja)}
          </div>
          <div style={{ fontSize: '0.72rem', opacity: 0.75 }}>Anterior + subtotal − recolección</div>
          {negativo ? (
            <p className="tut-ejemplo__alerta" role="status">
              Negativo: en el corte real este monto se ve en rojo.
            </p>
          ) : (
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.78rem', opacity: 0.8 }}>
              En verde = caja en cero o positivo (como en la captura).
            </p>
          )}
        </div>
      </div>
      {ejemplo.explicacion ? (
        <p className="tut-ejemplo__nota">{renderTexto(ejemplo.explicacion)}</p>
      ) : null}
    </div>
  );
}

function QuizBloque({ quiz }) {
  const [respuestas, setRespuestas] = useState({});
  const total = quiz.length;
  const correctas = quiz.filter((q) => respuestas[q.id] === q.correcta).length;
  const respondidas = Object.keys(respuestas).length;

  return (
    <div className="tut-quiz">
      {quiz.map((q, i) => {
        const elegida = respuestas[q.id];
        const respondio = elegida != null;
        const ok = elegida === q.correcta;
        return (
          <fieldset key={q.id} className="tut-quiz__item">
            <legend>
              {i + 1}. {q.pregunta}
            </legend>
            <div className="tut-quiz__opts">
              {q.opciones.map((op, oi) => {
                let cls = 'tut-quiz__opt';
                if (respondio) {
                  if (oi === q.correcta) cls += ' tut-quiz__opt--ok';
                  else if (oi === elegida) cls += ' tut-quiz__opt--bad';
                }
                return (
                  <button
                    key={oi}
                    type="button"
                    className={cls}
                    disabled={respondio}
                    onClick={() => setRespuestas((r) => ({ ...r, [q.id]: oi }))}
                  >
                    {op}
                  </button>
                );
              })}
            </div>
            {respondio ? (
              <p className={`tut-quiz__feedback${ok ? ' tut-quiz__feedback--ok' : ' tut-quiz__feedback--bad'}`}>
                {ok ? 'Correcto. ' : 'Incorrecto. '}
                {renderTexto(q.explicacion)}
              </p>
            ) : null}
          </fieldset>
        );
      })}
      {respondidas === total ? (
        <p className="tut-quiz__score" role="status">
          Resultado: <strong>{correctas}/{total}</strong>
          {correctas === total ? ' — dominio de la pantalla real.' : ' — revisa las zonas de la captura y reintenta.'}
        </p>
      ) : null}
      {respondidas > 0 ? (
        <button type="button" className="btn btn-ghost" onClick={() => setRespuestas({})}>
          Reintentar
        </button>
      ) : null}
    </div>
  );
}

function Seccion({ seccion, tutorial, onHotspot }) {
  const baseImg = tutorial?.imagenBase || seccion.imagen;
  const showMapa = seccion.mapaInteractivo && tutorial?.hotspots;
  const showMiniMapa = !showMapa && seccion.hotspotActivo && tutorial?.hotspots && tutorial?.imagenBase;
  const showZoom =
    !showMapa &&
    seccion.imagen &&
    seccion.imagen !== tutorial?.imagenBase;

  return (
    <article
      id={`tut-${seccion.id}`}
      className="card tut-seccion"
      style={{ borderTop: '3px solid #b5a642' }}
    >
      <h3 className="tut-seccion__titulo">{seccion.titulo}</h3>
      <div className="tut-seccion__cuerpo">
        {(seccion.cuerpo || []).map((linea, i) => (
          <p key={i}>{renderTexto(linea)}</p>
        ))}
      </div>

      {showMapa ? (
        <MapaHotspots
          imagen={baseImg}
          hotspots={tutorial.hotspots}
          activo={seccion.hotspotActivo}
          onSelect={onHotspot}
          alt={seccion.imagenAlt}
        />
      ) : null}

      {showMiniMapa ? (
        <MapaHotspots
          imagen={tutorial.imagenBase}
          hotspots={tutorial.hotspots}
          activo={seccion.hotspotActivo}
          onSelect={onHotspot}
          alt="Zona resaltada en la captura real"
        />
      ) : null}

      {showZoom ? (
        <figure className="tut-seccion__fig">
          <img src={seccion.imagen} alt={seccion.imagenAlt || seccion.titulo} loading="lazy" />
          {seccion.imagenAlt ? (
            <figcaption className="muted">{seccion.imagenAlt}</figcaption>
          ) : null}
        </figure>
      ) : null}

      {seccion.ejemplo?.tipo === 'caja' ? <EjemploCaja ejemplo={seccion.ejemplo} /> : null}
      {seccion.quiz?.length ? <QuizBloque quiz={seccion.quiz} /> : null}

      {(seccion.notas || []).length > 0 ? (
        <div className="tut-nota">
          {(seccion.notas || []).map((n, i) => (
            <p key={i}>{renderTexto(n)}</p>
          ))}
        </div>
      ) : null}
    </article>
  );
}

export default function Tutorial() {
  const [tutorialId, setTutorialId] = useState(TUTORIALES[0]?.id || '');
  const tutorial = useMemo(
    () => TUTORIALES.find((t) => t.id === tutorialId) || TUTORIALES[0],
    [tutorialId],
  );
  const secciones = tutorial?.secciones || [];
  const esInteractivo = Boolean(tutorial?.interactivo);
  const [modoPaso, setModoPaso] = useState(true);
  const [paso, setPaso] = useState(0);

  useEffect(() => {
    setPaso(0);
    setModoPaso(Boolean(tutorial?.interactivo));
  }, [tutorial?.id, tutorial?.interactivo]);

  const irHotspot = (hotspotId) => {
    const idx = secciones.findIndex((s) => s.hotspotActivo === hotspotId || s.id === hotspotId);
    if (idx >= 0) {
      setModoPaso(true);
      setPaso(idx);
    }
  };

  if (!tutorial) {
    return (
      <div className="card">
        <p className="muted">No hay tutoriales disponibles.</p>
      </div>
    );
  }

  const pasoActual = Math.min(Math.max(0, paso), Math.max(0, secciones.length - 1));
  const seccionPaso = secciones[pasoActual];
  const progreso = secciones.length ? Math.round(((pasoActual + 1) / secciones.length) * 100) : 0;

  return (
    <div className="tut-root">
      <header>
        <h2 style={{ margin: 0, color: 'var(--brand-blue)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Icon name="file" size={22} />
          Tutorial
        </h2>
        <p className="muted" style={{ margin: '0.35rem 0 0' }}>
          Guías con pantallas reales para capacitar en tienda.
        </p>
      </header>

      {TUTORIALES.length > 1 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {TUTORIALES.map((t) => (
            <button
              key={t.id}
              type="button"
              className={t.id === tutorial.id ? 'btn btn-primary' : 'btn btn-ghost'}
              onClick={() => setTutorialId(t.id)}
            >
              {t.titulo}
              {t.interactivo ? ' · interactivo' : ''}
            </button>
          ))}
        </div>
      ) : null}

      <div className="card tut-hero">
        <h3 style={{ margin: '0 0 0.35rem', color: '#8a7a2a' }}>{tutorial.titulo}</h3>
        <p className="muted" style={{ margin: 0, fontSize: '0.9rem' }}>
          {tutorial.resumen}
        </p>
        {esInteractivo ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.75rem' }}>
            <button
              type="button"
              className={modoPaso ? 'btn btn-primary' : 'btn btn-ghost'}
              style={{ fontSize: '0.8rem' }}
              onClick={() => setModoPaso(true)}
            >
              Paso a paso
            </button>
            <button
              type="button"
              className={!modoPaso ? 'btn btn-primary' : 'btn btn-ghost'}
              style={{ fontSize: '0.8rem' }}
              onClick={() => setModoPaso(false)}
            >
              Ver todo
            </button>
          </div>
        ) : null}
      </div>

      {modoPaso && esInteractivo ? (
        <>
          <div className="card" style={{ padding: '0.75rem 1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.45rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>
                Paso {pasoActual + 1} de {secciones.length}
              </span>
              <span className="muted" style={{ fontSize: '0.8rem' }}>{progreso}%</span>
            </div>
            <div className="tut-progreso" aria-hidden>
              <div className="tut-progreso__bar" style={{ width: `${progreso}%` }} />
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.65rem' }}>
              {secciones.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  className={i === pasoActual ? 'btn btn-primary' : 'btn btn-ghost'}
                  style={{ fontSize: '0.72rem', padding: '0.28rem 0.5rem' }}
                  onClick={() => setPaso(i)}
                  title={s.titulo}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          </div>

          {seccionPaso ? (
            <Seccion seccion={seccionPaso} tutorial={tutorial} onHotspot={irHotspot} />
          ) : null}

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={pasoActual <= 0}
              onClick={() => setPaso((p) => Math.max(0, p - 1))}
            >
              ← Anterior
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={pasoActual >= secciones.length - 1}
              onClick={() => setPaso((p) => Math.min(secciones.length - 1, p + 1))}
            >
              Siguiente →
            </button>
          </div>
        </>
      ) : (
        <>
          <nav
            className="card"
            style={{ padding: '0.75rem 1rem', display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}
            aria-label="Secciones del tutorial"
          >
            {secciones.map((s) => (
              <a
                key={s.id}
                href={`#tut-${s.id}`}
                className="btn btn-ghost"
                style={{ fontSize: '0.8rem', padding: '0.35rem 0.65rem', textDecoration: 'none' }}
              >
                {s.titulo.replace(/^\d+\.\s*/, '')}
              </a>
            ))}
          </nav>
          {secciones.map((s) => (
            <Seccion key={s.id} seccion={s} tutorial={tutorial} onHotspot={irHotspot} />
          ))}
        </>
      )}
    </div>
  );
}
