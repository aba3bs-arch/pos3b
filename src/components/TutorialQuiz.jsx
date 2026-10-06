import React, { useState } from 'react';
import { calificarTutorialQuiz } from '../lib/tutorialQuiz.js';

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

export { calificarTutorialQuiz };

/**
 * Bloque de preguntas de tutorial con feedback y calificación final.
 */
export default function TutorialQuiz({ quiz }) {
  const [respuestas, setRespuestas] = useState({});
  const items = quiz || [];
  const total = items.length;
  const correctas = items.filter((q) => respuestas[q.id] === q.correcta).length;
  const respondidas = Object.keys(respuestas).length;
  const grado = respondidas === total && total > 0
    ? calificarTutorialQuiz(correctas, total)
    : null;

  if (!total) return null;

  return (
    <div className="tut-quiz">
      {items.map((q, i) => {
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
      {grado ? (
        <div
          className={`tut-quiz__score tut-quiz__grade${grado.aprueba ? ' tut-quiz__grade--ok' : ' tut-quiz__grade--bad'}`}
          role="status"
        >
          <div className="tut-quiz__grade-letra" aria-hidden>{grado.letra}</div>
          <div>
            <strong>{correctas}/{total}</strong>
            {' · '}
            <strong>{grado.pct}%</strong>
            {' — '}
            {grado.label}
            {grado.aprueba
              ? ' · ¡Listo para operar!'
              : ' · Repasa los pasos y pulsa Reintentar.'}
          </div>
        </div>
      ) : null}
      {respondidas > 0 ? (
        <button type="button" className="btn btn-ghost" onClick={() => setRespuestas({})}>
          Reintentar
        </button>
      ) : null}
    </div>
  );
}
