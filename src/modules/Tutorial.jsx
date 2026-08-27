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

function calcCaja(campos) {
  const c = campos || {};
  const caja = round2(
    (Number(c.caja_anterior) || 0) +
      (Number(c.venta) || 0) -
      (Number(c.gastos) || 0) -
      (Number(c.recoleccion) || 0) -
      (Number(c.faltante) || 0) -
      (Number(c.tarjeta) || 0),
  );
  const subtotal = round2(
    (Number(c.venta) || 0) -
      (Number(c.gastos) || 0) -
      (Number(c.faltante) || 0) -
      (Number(c.tarjeta) || 0),
  );
  return { caja, subtotal };
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function EjemploCaja({ ejemplo }) {
  const [campos, setCampos] = useState({ ...(ejemplo.campos || {}) });
  const { caja, subtotal } = calcCaja(campos);
  const negativo = caja < -0.001;

  const set = (key) => (e) => {
    const raw = e.target.value;
    setCampos((prev) => ({ ...prev, [key]: raw === '' ? '' : Number(raw) }));
  };

  const filas = [
    { key: 'caja_anterior', label: 'Caja chica anterior (+)' },
    { key: 'venta', label: 'Venta total (+)' },
    { key: 'gastos', label: 'Gastos (−)' },
    { key: 'tarjeta', label: 'Pago tarjeta (−)' },
    { key: 'faltante', label: 'Faltante (−)' },
    { key: 'recoleccion', label: 'Recolección (−)' },
  ];

  return (
    <div className="tut-ejemplo">
      <h4 className="tut-ejemplo__titulo">{ejemplo.titulo}</h4>
      <p className="muted" style={{ margin: '0 0 0.75rem', fontSize: '0.85rem' }}>
        Cambia los montos y mira cómo se mueve la caja (misma fórmula del Corte Abarrotes).
      </p>
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
          <div className="muted" style={{ fontSize: '0.8rem' }}>Subtotal turno</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f1c40f' }}>{fmtMx(subtotal)}</div>
          <div className="muted" style={{ fontSize: '0.8rem', marginTop: '0.75rem' }}>Caja chica actual</div>
          <div
            style={{
              fontSize: '1.85rem',
              fontWeight: 800,
              color: negativo ? 'var(--danger, #c0392b)' : '#27ae60',
            }}
          >
            {fmtMx(caja)}
          </div>
          {negativo ? (
            <p className="tut-ejemplo__alerta" role="status">
              Caja en negativo — recupera o documenta (Pagaré en recolección si aplica).
            </p>
          ) : (
            <p className="muted" style={{ margin: '0.5rem 0 0', fontSize: '0.8rem' }}>
              Caja en positivo / cero.
            </p>
          )}
        </div>
      </div>
      {ejemplo.explicacion ? (
        <p className="tut-ejemplo__nota">{renderTexto(ejemplo.explicacion)}</p>
      ) : null}
      <button
        type="button"
        className="btn btn-ghost"
        style={{ marginTop: '0.5rem', fontSize: '0.8rem' }}
        onClick={() => setCampos({ ...(ejemplo.campos || {}) })}
      >
        Restablecer ejemplo
      </button>
    </div>
  );
}

function EjemploRecuperacion({ ejemplo }) {
  const escenarios = ejemplo.escenarios || [];
  const [idx, setIdx] = useState(0);
  const esc = escenarios[idx] || escenarios[0];
  if (!esc) return null;

  const deuda = Number(esc.deuda) || 0;
  const aplicada = Math.min(deuda, Math.max(0, Number(esc.ventaAplicada) || 0));
  const recuperado = aplicada;
  const negativo = Math.max(0, deuda - aplicada);
  const recuperadoOk = negativo < 0.001 && deuda > 0;

  return (
    <div className="tut-ejemplo">
      <h4 className="tut-ejemplo__titulo">{ejemplo.titulo}</h4>
      <div className="tut-ejemplo__tabs" role="tablist">
        {escenarios.map((s, i) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={i === idx}
            className={i === idx ? 'btn btn-primary' : 'btn btn-ghost'}
            style={{ fontSize: '0.8rem', padding: '0.4rem 0.7rem' }}
            onClick={() => setIdx(i)}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div
        className={`tut-alerta-demo${recuperadoOk ? ' tut-alerta-demo--ok' : ''}`}
        role="status"
      >
        <div className="tut-alerta-demo__etiq">
          DINERO EN RECUPERACIÓN · ABARROTES{recuperadoOk || negativo > 0 ? ' · PENDIENTE' : ''}
        </div>
        <div className="tut-alerta-demo__cifras">
          <div>
            <div className="tut-alerta-demo__lbl">Negativo</div>
            <div className="tut-alerta-demo__monto tut-alerta-demo__monto--neg">
              {fmtMx(recuperadoOk ? 0 : -negativo)}
            </div>
          </div>
          <div>
            <div className="tut-alerta-demo__lbl">Recuperado</div>
            <div className="tut-alerta-demo__monto tut-alerta-demo__monto--ok">{fmtMx(recuperado)}</div>
          </div>
        </div>
        {recuperadoOk ? (
          <div className="tut-alerta-demo__leyenda">
            NEGATIVO RECUPERADO, FAVOR DE LIQUIDAR Y PAGAR PRÉSTAMO
          </div>
        ) : (
          <div className="tut-alerta-demo__hint">
            Pendiente de recuperación — la venta del corte reduce el negativo
          </div>
        )}
        <div className="tut-alerta-demo__btns">
          {!recuperadoOk ? (
            <span className="btn btn-ghost" style={{ pointerEvents: 'none', opacity: 0.9 }}>Abono</span>
          ) : (
            <span className="btn btn-primary" style={{ pointerEvents: 'none' }}>Liquidar</span>
          )}
          {!recuperadoOk ? (
            <span className="btn btn-gold" style={{ pointerEvents: 'none', opacity: 0.9 }}>Pagaré</span>
          ) : null}
        </div>
      </div>
      <p className="tut-ejemplo__nota">{renderTexto(esc.narracion)}</p>
    </div>
  );
}

function EjemploAbono({ ejemplo }) {
  const deuda = Number(ejemplo.deudaInicial) || 0;
  const rec0 = Number(ejemplo.recuperadoInicial) || 0;
  const [abono, setAbono] = useState(Number(ejemplo.montoAbonoDefault) || 100);
  const aplicado = Math.max(0, Math.min(deuda - rec0, Number(abono) || 0));
  const recuperado = rec0 + aplicado;
  const negativo = Math.max(0, deuda - recuperado);

  return (
    <div className="tut-ejemplo">
      <h4 className="tut-ejemplo__titulo">{ejemplo.titulo}</h4>
      <p className="muted" style={{ margin: '0 0 0.5rem', fontSize: '0.85rem' }}>
        {ejemplo.narracionAntes}
      </p>
      <label className="tut-ejemplo__campo" style={{ maxWidth: 220 }}>
        <span>Monto del abono</span>
        <input
          className="input"
          type="number"
          min={0}
          step="10"
          value={abono}
          onChange={(e) => setAbono(e.target.value === '' ? '' : Number(e.target.value))}
        />
      </label>
      <div className="tut-alerta-demo" style={{ marginTop: '0.75rem' }} role="status">
        <div className="tut-alerta-demo__etiq">DESPUÉS DEL ABONO · ABARROTES</div>
        <div className="tut-alerta-demo__cifras">
          <div>
            <div className="tut-alerta-demo__lbl">Negativo</div>
            <div className="tut-alerta-demo__monto tut-alerta-demo__monto--neg">{fmtMx(-negativo)}</div>
          </div>
          <div>
            <div className="tut-alerta-demo__lbl">Recuperado (venta + abono)</div>
            <div className="tut-alerta-demo__monto tut-alerta-demo__monto--ok">{fmtMx(recuperado)}</div>
          </div>
        </div>
      </div>
      <p className="tut-ejemplo__nota">
        {renderTexto(
          ejemplo.narracionDespues ||
            `Tras abonar ${fmtMx(aplicado)}: Negativo ${fmtMx(-negativo)}.`,
        )}
      </p>
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
                } else if (elegida === oi) {
                  cls += ' tut-quiz__opt--pick';
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
          {correctas === total ? ' — ¡Listo para capacitar en tienda!' : ' — Revisa las explicaciones y reintenta.'}
        </p>
      ) : null}
      {respondidas > 0 ? (
        <button type="button" className="btn btn-ghost" onClick={() => setRespuestas({})}>
          Reintentar preguntas
        </button>
      ) : null}
    </div>
  );
}

function Seccion({ seccion }) {
  return (
    <article
      id={`tut-${seccion.id}`}
      className="card"
      style={{ marginBottom: '1rem', borderTop: '3px solid var(--brand-blue)' }}
    >
      <h3 style={{ margin: '0 0 0.75rem', color: 'var(--brand-blue-dark)', fontSize: '1.05rem' }}>
        {seccion.titulo}
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
        {(seccion.cuerpo || []).map((linea, i) => (
          <p key={i} style={{ margin: 0, lineHeight: 1.55, fontSize: '0.92rem' }}>
            {renderTexto(linea)}
          </p>
        ))}
      </div>
      {seccion.imagen ? (
        <figure style={{ margin: '1rem 0 0' }}>
          <img
            src={seccion.imagen}
            alt={seccion.imagenAlt || seccion.titulo}
            style={{
              width: '100%',
              maxWidth: 720,
              height: 'auto',
              borderRadius: 10,
              border: '1px solid var(--border)',
              display: 'block',
              background: '#f8fafc',
            }}
            loading="lazy"
          />
          {seccion.imagenAlt ? (
            <figcaption className="muted" style={{ marginTop: '0.4rem', fontSize: '0.78rem' }}>
              {seccion.imagenAlt}
            </figcaption>
          ) : null}
        </figure>
      ) : null}
      {seccion.ejemplo?.tipo === 'caja' ? <EjemploCaja ejemplo={seccion.ejemplo} /> : null}
      {seccion.ejemplo?.tipo === 'recuperacion' ? <EjemploRecuperacion ejemplo={seccion.ejemplo} /> : null}
      {seccion.ejemplo?.tipo === 'abono' ? <EjemploAbono ejemplo={seccion.ejemplo} /> : null}
      {seccion.quiz?.length ? <QuizBloque quiz={seccion.quiz} /> : null}
      {(seccion.notas || []).length > 0 ? (
        <div
          style={{
            marginTop: '0.9rem',
            padding: '0.65rem 0.85rem',
            borderRadius: 8,
            borderLeft: '4px solid var(--brand-gold)',
            background: 'rgba(225,153,41,0.1)',
            fontSize: '0.88rem',
            lineHeight: 1.5,
          }}
        >
          {(seccion.notas || []).map((n, i) => (
            <p key={i} style={{ margin: i ? '0.35rem 0 0' : 0 }}>
              {renderTexto(n)}
            </p>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: 900 }}>
      <header>
        <h2 style={{ margin: 0, color: 'var(--brand-blue)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Icon name="file" size={22} />
          Tutorial
        </h2>
        <p className="muted" style={{ margin: '0.35rem 0 0' }}>
          Guías ilustradas para capacitar en tienda. Ábrelas cuando necesites el paso a paso.
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

      <div
        className="card"
        style={{
          borderLeft: '4px solid var(--brand-gold)',
          background: 'linear-gradient(135deg, #fff 0%, rgba(59,105,181,0.06) 100%)',
        }}
      >
        <h3 style={{ margin: '0 0 0.35rem', color: 'var(--brand-blue-dark)' }}>{tutorial.titulo}</h3>
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

          {seccionPaso ? <Seccion seccion={seccionPaso} /> : null}

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
            <Seccion key={s.id} seccion={s} />
          ))}
        </>
      )}
    </div>
  );
}
