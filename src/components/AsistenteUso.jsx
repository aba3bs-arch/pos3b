import React, { useEffect, useMemo, useRef, useState } from 'react';
import { responderUso, SUGERENCIAS_USO } from '../lib/asistenteUso.js';
import './AsistenteUso.css';

function renderTexto(text) {
  const parts = String(text || '').split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={i}>{part.slice(1, -1)}</code>;
    }
    return <span key={i}>{part}</span>;
  });
}

function Burbuja({ msg }) {
  const mio = msg.rol === 'user';
  return (
    <div className={`asistente-msg ${mio ? 'asistente-msg--user' : 'asistente-msg--bot'}`}>
      <div className="asistente-bubble">
        {String(msg.texto || '')
          .split('\n')
          .map((line, i) => (
            <p key={i} style={{ margin: line.trim() ? '0 0 0.35rem' : '0.2rem 0' }}>
              {renderTexto(line)}
            </p>
          ))}
        {!mio && msg.modo ? (
          <div className="asistente-meta">
            {msg.modo === 'ia' ? 'IA · manual POS' : 'Manual POS'}
            {msg.fuentes?.length
              ? ` · ${msg.fuentes
                  .slice(0, 2)
                  .map((f) => f.titulo)
                  .join(' · ')}`
              : ''}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function AsistenteUso({ supabase, user }) {
  const [input, setInput] = useState('');
  const [msgs, setMsgs] = useState(() => [
    {
      id: 'hola',
      rol: 'bot',
      modo: 'local',
      texto:
        'Hola. Pregúntame **cómo usar el POS**: cobrar, corte de caja, PIN, precios, traspasos o compras. Respondo con el manual de Las 3B.',
    },
  ]);
  const [enviando, setEnviando] = useState(false);
  const cajaRef = useRef(null);

  useEffect(() => {
    const el = cajaRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, enviando]);

  const sugerencias = useMemo(() => SUGERENCIAS_USO, []);

  const enviar = async (texto) => {
    const q = String(texto || input).trim();
    if (!q || enviando) return;
    setInput('');
    const idUser = `u-${Date.now()}`;
    setMsgs((prev) => [...prev, { id: idUser, rol: 'user', texto: q }]);
    setEnviando(true);
    try {
      const r = await responderUso(q, { supabase, rol: user?.rol });
      setMsgs((prev) => [
        ...prev,
        {
          id: `b-${Date.now()}`,
          rol: 'bot',
          modo: r.modo,
          texto: r.texto,
          fuentes: r.fuentes,
        },
      ]);
    } catch (e) {
      setMsgs((prev) => [
        ...prev,
        {
          id: `b-${Date.now()}`,
          rol: 'bot',
          modo: 'local',
          texto: `No pude responder: ${e?.message || e}`,
        },
      ]);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="asistente-card">
      <div className="asistente-head">
        <div>
          <strong>Asistente de uso</strong>
          <div className="muted" style={{ fontSize: '0.82rem', marginTop: 2 }}>
            Preguntas sobre cómo usar POS CONTROL 3B. No cobra ni cambia inventario.
          </div>
        </div>
      </div>
      <div className="asistente-sugerencias">
        {sugerencias.map((s) => (
          <button key={s} type="button" className="asistente-chip" onClick={() => void enviar(s)} disabled={enviando}>
            {s}
          </button>
        ))}
      </div>
      <div className="asistente-caja" ref={cajaRef}>
        {msgs.map((m) => (
          <Burbuja key={m.id} msg={m} />
        ))}
        {enviando ? (
          <div className="asistente-msg asistente-msg--bot">
            <div className="asistente-bubble muted">Buscando en el manual…</div>
          </div>
        ) : null}
      </div>
      <form
        className="asistente-form"
        onSubmit={(e) => {
          e.preventDefault();
          void enviar();
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ej. ¿Cómo hago el corte de caja?"
          maxLength={400}
          disabled={enviando}
        />
        <button type="submit" className="btn btn-primary" disabled={enviando || !input.trim()}>
          Preguntar
        </button>
      </form>
    </div>
  );
}
