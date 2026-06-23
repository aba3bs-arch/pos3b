import React, { useState } from 'react';
import { MANUAL_ADMIN_SECCIONES, MANUAL_ADMIN_VERSION } from '../content/manualAdminSections.js';
import { puedeGestionarUsuarios } from '../lib/roles.js';

function renderInline(text) {
  const parts = String(text).split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`')) return <code key={i}>{part.slice(1, -1)}</code>;
    return part;
  });
}

function renderBlock(block, key) {
  const t = block.trim();
  if (!t) return null;
  if (t.startsWith('### ')) {
    return (
      <h4 key={key} style={{ margin: '1rem 0 0.35rem', color: 'var(--brand-blue)', fontSize: '0.95rem' }}>
        {renderInline(t.slice(4))}
      </h4>
    );
  }
  if (t.startsWith('|')) {
    return (
      <pre key={key} style={{ fontSize: '0.78rem', overflow: 'auto', padding: '0.65rem', background: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--border)' }}>
        {t}
      </pre>
    );
  }
  if (t.startsWith('```')) {
    const code = t.replace(/^```\w*\n?/, '').replace(/\n?```$/, '');
    return (
      <pre key={key} style={{ fontSize: '0.78rem', overflow: 'auto', padding: '0.65rem', background: '#1e1e1e', color: '#d4d4d4', borderRadius: '8px' }}>
        {code}
      </pre>
    );
  }
  if (t.startsWith('- ')) {
    const items = t.split('\n').filter((l) => l.startsWith('- '));
    return (
      <ul key={key} style={{ margin: '0.35rem 0', paddingLeft: '1.25rem' }}>
        {items.map((item, j) => (
          <li key={j} style={{ marginBottom: '0.25rem' }}>
            {renderInline(item.slice(2))}
          </li>
        ))}
      </ul>
    );
  }
  return (
    <p key={key} style={{ margin: '0.35rem 0', lineHeight: 1.6 }}>
      {renderInline(t)}
    </p>
  );
}

function renderBody(body) {
  return body.split('\n\n').map((block, i) => renderBlock(block, i));
}

export default function ManualAdministrador() {
  const [open, setOpen] = useState('intro');
  const [q, setQ] = useState('');

  const filtradas = q.trim()
    ? MANUAL_ADMIN_SECCIONES.filter(
        (s) =>
          s.title.toLowerCase().includes(q.toLowerCase()) || s.body.toLowerCase().includes(q.toLowerCase()),
      )
    : MANUAL_ADMIN_SECCIONES;

  const imprimir = () => {
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Manual Administrador POS 3B</title>
<style>body{font-family:Segoe UI,sans-serif;max-width:820px;margin:2rem auto;padding:0 1rem;line-height:1.55;color:#222}
h1{color:#3b69b5}h2{color:#3b69b5;margin-top:2rem;border-bottom:1px solid #ddd;padding-bottom:0.35rem}
pre{background:#f5f5f5;padding:0.75rem;overflow:auto;font-size:0.85rem}code{background:#eee;padding:0.1rem 0.3rem}
@media print{body{margin:0.5in}}</style></head><body>
<h1>Manual del Administrador — POS CONTROL 3B</h1>
<p><em>${MANUAL_ADMIN_VERSION}</em></p>
${MANUAL_ADMIN_SECCIONES.map((s) => `<h2>${s.title}</h2>${s.body.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\n/g, '<br/>')}`).join('')}
</body></html>`;
    const w = window.open('', '_blank');
    if (!w) return alert('Permite ventanas emergentes para imprimir el manual.');
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="card" style={{ borderTop: '4px solid var(--brand-blue)' }}>
        <h3 style={{ margin: '0 0 0.35rem', color: 'var(--brand-blue)' }}>Manual del administrador</h3>
        <p className="muted" style={{ margin: '0 0 0.75rem', fontSize: '0.85rem' }}>
          Guía completa de configuración, usuarios, inventario, turnos y Supabase. {MANUAL_ADMIN_VERSION}
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <input
            className="input"
            placeholder="Buscar en el manual…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ flex: '1 1 200px', maxWidth: '320px' }}
          />
          <button type="button" className="btn btn-primary" onClick={imprimir}>
            Imprimir / PDF
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
        {filtradas.length === 0 ? (
          <p className="muted">Sin resultados para &quot;{q}&quot;</p>
        ) : (
          filtradas.map((s) => (
            <div key={s.id} style={{ border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', background: '#fff' }}>
              <button
                type="button"
                onClick={() => setOpen(open === s.id ? '' : s.id)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '0.85rem 1rem',
                  border: 'none',
                  background: open === s.id ? 'rgba(59,105,181,0.08)' : '#fff',
                  fontWeight: 700,
                  cursor: 'pointer',
                  color: 'var(--brand-blue-dark)',
                }}
              >
                {s.title}
              </button>
              {open === s.id && (
                <div style={{ padding: '0.25rem 1rem 1rem', color: 'var(--muted)', fontSize: '0.92rem' }}>{renderBody(s.body)}</div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
