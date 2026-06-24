import React, { useEffect, useMemo, useState } from 'react';
import { MANUAL_ADMIN_SECCIONES, MANUAL_ADMIN_VERSION } from '../content/manualAdminSections.js';

function renderInline(text, highlight = '') {
  const parts = String(text).split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      const inner = part.slice(2, -2);
      return <strong key={i}>{highlightText(inner, highlight)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={i}>{part.slice(1, -1)}</code>;
    }
    return <span key={i}>{highlightText(part, highlight)}</span>;
  });
}

function highlightText(text, q) {
  const term = q.trim();
  if (!term || term.length < 2) return text;
  const re = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const bits = String(text).split(re);
  if (bits.length === 1) return text;
  return bits.map((bit, i) =>
    re.test(bit) ? (
      <mark key={i} style={{ background: 'rgba(225,153,41,0.45)', padding: '0 0.1rem', borderRadius: '2px' }}>
        {bit}
      </mark>
    ) : (
      bit
    ),
  );
}

function renderBlock(block, key, highlight) {
  const t = block.trim();
  if (!t) return null;
  if (t.startsWith('### ')) {
    return (
      <h4 key={key} style={{ margin: '1rem 0 0.35rem', color: 'var(--brand-blue)', fontSize: '0.95rem' }}>
        {renderInline(t.slice(4), highlight)}
      </h4>
    );
  }
  if (t.startsWith('|')) {
    return (
      <pre key={key} style={{ fontSize: '0.78rem', overflow: 'auto', padding: '0.65rem', background: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--border)' }}>
        {highlightText(t, highlight)}
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
            {renderInline(item.slice(2), highlight)}
          </li>
        ))}
      </ul>
    );
  }
  return (
    <p key={key} style={{ margin: '0.35rem 0', lineHeight: 1.6 }}>
      {renderInline(t, highlight)}
    </p>
  );
}

function renderBody(body, highlight) {
  return body.split('\n\n').map((block, i) => renderBlock(block, i, highlight));
}

function sectionMatches(s, q) {
  const t = q.trim().toLowerCase();
  if (!t) return true;
  if (s.title.toLowerCase().includes(t)) return true;
  if (s.body.toLowerCase().includes(t)) return true;
  if ((s.keywords || []).some((k) => k.toLowerCase().includes(t) || t.includes(k.toLowerCase()))) return true;
  return false;
}

export default function ManualAdministrador() {
  const [open, setOpen] = useState('intro');
  const [q, setQ] = useState('');

  const filtradas = useMemo(() => MANUAL_ADMIN_SECCIONES.filter((s) => sectionMatches(s, q)), [q]);

  const buscando = q.trim().length > 0;

  useEffect(() => {
    if (buscando && filtradas.length > 0) {
      setOpen(filtradas[0].id);
    }
  }, [q, buscando, filtradas]);

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

  const expandirTodas = () => {
    if (filtradas.length === 1) setOpen(filtradas[0].id);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="card" style={{ borderTop: '4px solid var(--brand-blue)' }}>
        <h3 style={{ margin: '0 0 0.35rem', color: 'var(--brand-blue)' }}>Manual del administrador</h3>
        <p className="muted" style={{ margin: '0 0 0.75rem', fontSize: '0.85rem' }}>
          Instructivo detallado de configuración, usuarios, inventario multitienda, turnos, ventas y Supabase.
          {' '}{MANUAL_ADMIN_VERSION} · {MANUAL_ADMIN_SECCIONES.length} secciones.
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            className="input"
            placeholder="Buscar: inventario, turnos, PIN, MAIN, SQL…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && expandirTodas()}
            style={{ flex: '1 1 220px', maxWidth: '400px' }}
            autoComplete="off"
          />
          {q && (
            <button type="button" className="btn btn-ghost" onClick={() => setQ('')}>
              Limpiar
            </button>
          )}
          <button type="button" className="btn btn-primary" onClick={imprimir}>
            Imprimir / PDF
          </button>
        </div>
        {buscando && (
          <p className="muted" style={{ margin: '0.5rem 0 0', fontSize: '0.8rem' }}>
            {filtradas.length} sección(es) encontrada(s). Las coincidencias se resaltan en amarillo.
          </p>
        )}
        {!buscando && (
          <p className="muted" style={{ margin: '0.5rem 0 0', fontSize: '0.78rem' }}>
            Sugerencias: usuarios, traspaso, almacén central, corte, Netlify, escáner, privilegios
          </p>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
        {filtradas.length === 0 ? (
          <p className="muted">Sin resultados para &quot;{q}&quot;. Prueba otra palabra (ej. inventario, pin, sql).</p>
        ) : (
          filtradas.map((s) => {
            const isOpen = buscando || open === s.id;
            return (
              <div key={s.id} style={{ border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', background: '#fff' }}>
                <button
                  type="button"
                  onClick={() => setOpen(open === s.id ? '' : s.id)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '0.85rem 1rem',
                    border: 'none',
                    background: isOpen ? 'rgba(59,105,181,0.08)' : '#fff',
                    fontWeight: 700,
                    cursor: 'pointer',
                    color: 'var(--brand-blue-dark)',
                  }}
                >
                  {highlightText(s.title, q)}
                </button>
                {isOpen && (
                  <div style={{ padding: '0.25rem 1rem 1rem', color: 'var(--muted)', fontSize: '0.92rem' }}>
                    {renderBody(s.body, q)}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
