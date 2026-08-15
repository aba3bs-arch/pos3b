import React, { useEffect, useState } from 'react';
import {
  completarGroq,
  enmascararClaveGroq,
  EVENTO_GROQ,
  groqActivo,
  guardarClaveGroqLocal,
  leerClaveGroq,
  sincronizarClaveGroqDesdeNube,
  subirClaveGroqANube,
} from '../lib/asistenteGroq.js';
import { responderUsoLocal } from '../lib/asistenteUso.js';

export default function PanelAsistenteGroq({ supabase }) {
  const [clave, setClave] = useState('');
  const [guardada, setGuardada] = useState(() => leerClaveGroq());
  const [aviso, setAviso] = useState('');
  const [error, setError] = useState('');
  const [probando, setProbando] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    const sync = () => setGuardada(leerClaveGroq());
    window.addEventListener(EVENTO_GROQ, sync);
    if (supabase) {
      sincronizarClaveGroqDesdeNube(supabase).then((r) => {
        if (r.cambio) setGuardada(leerClaveGroq());
      });
    }
    return () => window.removeEventListener(EVENTO_GROQ, sync);
  }, [supabase]);

  const guardar = async () => {
    const k = clave.trim();
    if (!k) {
      setError('Pega la clave de Groq (empieza con gsk_).');
      return;
    }
    setGuardando(true);
    setError('');
    setAviso('');
    guardarClaveGroqLocal(k);
    setGuardada(k);
    setClave('');
    const nube = await subirClaveGroqANube(supabase, k);
    setGuardando(false);
    if (nube.sinColumna) {
      setAviso(
        'Guardada en este equipo. Para todas las sucursales, en Supabase → SQL Editor pega TODO supabase/fix_asistente_groq.sql, Run, y vuelve a Guardar.',
      );
      return;
    }
    if (!nube.ok) {
      setError(nube.error || 'No se pudo subir a la nube. Quedó en este equipo.');
      return;
    }
    setAviso('Groq guardado. Ya puedes preguntar en Ayuda → Asistente (etiqueta IA · Groq).');
  };

  const quitar = async () => {
    if (!window.confirm('¿Quitar la clave Groq de este equipo y de la nube?')) return;
    guardarClaveGroqLocal('');
    setGuardada('');
    setClave('');
    await subirClaveGroqANube(supabase, '');
    setAviso('Clave Groq eliminada. El asistente sigue con el manual local.');
  };

  const probar = async () => {
    const k = clave.trim() || guardada;
    if (!k) {
      setError('Primero pega y guarda una clave Groq.');
      return;
    }
    setProbando(true);
    setError('');
    setAviso('');
    const local = responderUsoLocal('¿Cómo cobro una venta?');
    const r = await completarGroq({
      clave: k,
      pregunta: '¿Cómo cobro una venta?',
      fragmentos: local.fragmentos,
    });
    setProbando(false);
    if (!r.ok) {
      setError(r.error || 'No se pudo conectar a Groq. Revisa la clave.');
      return;
    }
    setAviso(`Conexión OK. Groq respondió: “${r.texto.slice(0, 140)}…”`);
  };

  return (
    <div className="card" style={{ borderTop: '4px solid var(--brand-gold)' }}>
      <h3 style={{ margin: '0 0 0.5rem', color: 'var(--brand-blue)' }}>Asistente Groq</h3>
      <p className="muted" style={{ marginTop: 0, fontSize: '0.88rem', lineHeight: 1.5 }}>
        Groq redacta las respuestas de <strong>Ayuda → Asistente</strong> usando el manual de Las 3B.
        Capa gratis, sin tarjeta. La clave no va en GitHub.
      </p>
      <ol className="muted" style={{ margin: '0 0 0.85rem', paddingLeft: '1.2rem', fontSize: '0.88rem', lineHeight: 1.55 }}>
        <li>
          Abre{' '}
          <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer">
            console.groq.com/keys
          </a>{' '}
          y crea una cuenta (Google o correo).
        </li>
        <li>
          Pulsa <strong>Create API key</strong>, copia la clave (empieza con <code>gsk_</code>).
        </li>
        <li>Pégala abajo → Guardar → Probar conexión.</li>
      </ol>
      {guardada ? (
        <p style={{ margin: '0 0 0.65rem', fontWeight: 700, color: 'var(--brand-green, #15803d)' }}>
          Groq activo · {enmascararClaveGroq(guardada)}
        </p>
      ) : (
        <p className="muted" style={{ margin: '0 0 0.65rem' }}>
          Aún no hay clave. El asistente responde con el manual hasta que la guardes.
        </p>
      )}
      <label className="muted" style={{ display: 'block' }}>
        Clave API de Groq
        <input
          className="input"
          type="password"
          autoComplete="off"
          value={clave}
          onChange={(e) => setClave(e.target.value)}
          placeholder={guardada ? 'Pegar una clave nueva para reemplazar' : 'gsk_…'}
          style={{ marginTop: '0.35rem' }}
        />
      </label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.75rem' }}>
        <button type="button" className="btn btn-primary" disabled={guardando || !clave.trim()} onClick={() => void guardar()}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" className="btn btn-ghost" disabled={probando || !(clave.trim() || groqActivo())} onClick={() => void probar()}>
          {probando ? 'Probando…' : 'Probar conexión'}
        </button>
        {guardada ? (
          <button type="button" className="btn btn-ghost" onClick={() => void quitar()}>
            Quitar clave
          </button>
        ) : null}
      </div>
      {aviso ? (
        <p style={{ margin: '0.75rem 0 0', fontSize: '0.85rem', color: 'var(--brand-green, #15803d)' }}>{aviso}</p>
      ) : null}
      {error ? (
        <p style={{ margin: '0.75rem 0 0', fontSize: '0.85rem', color: 'var(--brand-red, #dc2626)' }}>{error}</p>
      ) : null}
    </div>
  );
}
