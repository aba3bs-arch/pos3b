import React, { useMemo, useState } from 'react';
import BrandLogo from '../components/BrandLogo.jsx';
import { leerNombreNegocio } from '../lib/branding.js';
import {
  DISPONIBILIDAD_TURNO,
  EDAD_MAYORIA,
  FORM_CONTRATACION_VACIO,
  GRADOS_ESTUDIOS,
  TIPOS_CONTRATACION,
  enviarSolicitudContratacion,
  opcionesSucursalesContratacion,
  validarFiltroTipoEdad,
} from '../lib/contratacion.js';

/**
 * Portal público de postulación (enlace / QR).
 * Los aspirantes solo ven este módulo; no hay login ni menú del POS.
 */
export default function ContratacionPublica({ supabase }) {
  const brand = leerNombreNegocio();
  const [paso, setPaso] = useState(1); // 1 filtro · 2 formulario · 3 ok
  const [form, setForm] = useState({ ...FORM_CONTRATACION_VACIO });
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const sucursales = useMemo(() => opcionesSucursalesContratacion(), []);

  const setCampo = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const toggleSucursal = (id) => {
    setForm((f) => {
      const set = new Set(f.sucursales_interes || []);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      return { ...f, sucursales_interes: [...set] };
    });
  };

  const continuarFiltro = () => {
    setError('');
    const r = validarFiltroTipoEdad(form);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    if (r.edad != null) setCampo('edad', r.edad);
    setPaso(2);
  };

  const enviar = async () => {
    setError('');
    setEnviando(true);
    try {
      const origen = (() => {
        try {
          const q = new URLSearchParams(window.location.search);
          return q.get('qr') === '1' ? 'qr' : 'enlace';
        } catch {
          return 'enlace';
        }
      })();
      const res = await enviarSolicitudContratacion(supabase, form, { origen });
      if (!res.ok) {
        setError(res.error || 'No se pudo enviar.');
        return;
      }
      setPaso(3);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="contratacion-publica" style={{ minHeight: '100vh', padding: '1.25rem', maxWidth: 560, margin: '0 auto' }}>
      <header style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
        <BrandLogo alt={brand} maxHeight={72} style={{ margin: '0 auto' }} />
        <h1 style={{ margin: '0.65rem 0 0.25rem', fontSize: '1.35rem' }}>{brand}</h1>
        <p className="muted" style={{ margin: 0, fontSize: '0.9rem' }}>Postulación de empleo</p>
      </header>

      {paso === 1 && (
        <section className="card" style={{ padding: '1rem', display: 'grid', gap: '0.85rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem' }}>¿Qué tipo de plaza buscas?</h2>
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            {TIPOS_CONTRATACION.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`btn ${form.tipo === t.id ? 'btn-gold' : 'btn-ghost'}`}
                style={{ textAlign: 'left', padding: '0.75rem' }}
                onClick={() => setCampo('tipo', t.id)}
              >
                <strong>{t.label}</strong>
                <div className="muted" style={{ fontSize: '0.8rem', marginTop: '0.2rem' }}>{t.desc}</div>
              </button>
            ))}
          </div>

          {form.tipo === 'planta' && (
            <div style={{ display: 'grid', gap: '0.5rem' }}>
              <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
                De planta requiere mayoría de edad ({EDAD_MAYORIA}+ años).
              </p>
              <label className="muted">
                Edad
                <input
                  className="input"
                  type="number"
                  min={15}
                  max={80}
                  value={form.edad}
                  onChange={(e) => setCampo('edad', e.target.value)}
                  style={{ marginTop: '0.35rem' }}
                />
              </label>
              <label className="muted">
                O fecha de nacimiento
                <input
                  className="input"
                  type="date"
                  value={form.fecha_nacimiento}
                  onChange={(e) => setCampo('fecha_nacimiento', e.target.value)}
                  style={{ marginTop: '0.35rem' }}
                />
              </label>
            </div>
          )}

          {form.tipo === 'cubre_turno' && (
            <label className="muted">
              Edad (opcional)
              <input
                className="input"
                type="number"
                min={15}
                max={80}
                value={form.edad}
                onChange={(e) => setCampo('edad', e.target.value)}
                style={{ marginTop: '0.35rem' }}
              />
            </label>
          )}

          {error && <p style={{ color: 'var(--danger, #b91c1c)', margin: 0, fontSize: '0.9rem' }}>{error}</p>}

          <button type="button" className="btn btn-gold" disabled={!form.tipo} onClick={continuarFiltro}>
            Continuar
          </button>
        </section>
      )}

      {paso === 2 && (
        <section className="card" style={{ padding: '1rem', display: 'grid', gap: '0.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
            <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Tu perfil laboral</h2>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPaso(1)}>← Tipo</button>
          </div>
          <p className="muted" style={{ margin: 0, fontSize: '0.82rem' }}>
            Postulas a: <strong>{TIPOS_CONTRATACION.find((t) => t.id === form.tipo)?.label}</strong>
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            <label className="muted">
              Nombre *
              <input className="input" value={form.nombre} onChange={(e) => setCampo('nombre', e.target.value)} style={{ marginTop: '0.3rem' }} />
            </label>
            <label className="muted">
              Apellidos *
              <input className="input" value={form.apellidos} onChange={(e) => setCampo('apellidos', e.target.value)} style={{ marginTop: '0.3rem' }} />
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            <label className="muted">
              Teléfono *
              <input className="input" type="tel" inputMode="tel" value={form.telefono} onChange={(e) => setCampo('telefono', e.target.value)} style={{ marginTop: '0.3rem' }} />
            </label>
            <label className="muted">
              Tel. alterno
              <input className="input" type="tel" inputMode="tel" value={form.telefono_alt} onChange={(e) => setCampo('telefono_alt', e.target.value)} style={{ marginTop: '0.3rem' }} />
            </label>
          </div>

          <label className="muted">
            Correo
            <input className="input" type="email" value={form.email} onChange={(e) => setCampo('email', e.target.value)} style={{ marginTop: '0.3rem' }} />
          </label>

          <label className="muted">
            Dirección *
            <input className="input" value={form.direccion} onChange={(e) => setCampo('direccion', e.target.value)} style={{ marginTop: '0.3rem' }} />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            <label className="muted">
              Colonia
              <input className="input" value={form.colonia} onChange={(e) => setCampo('colonia', e.target.value)} style={{ marginTop: '0.3rem' }} />
            </label>
            <label className="muted">
              Ciudad *
              <input className="input" value={form.ciudad} onChange={(e) => setCampo('ciudad', e.target.value)} style={{ marginTop: '0.3rem' }} />
            </label>
            <label className="muted">
              Estado
              <input className="input" value={form.estado_mx} onChange={(e) => setCampo('estado_mx', e.target.value)} style={{ marginTop: '0.3rem' }} />
            </label>
            <label className="muted">
              C.P.
              <input className="input" value={form.cp} onChange={(e) => setCampo('cp', e.target.value)} style={{ marginTop: '0.3rem' }} />
            </label>
          </div>

          <label className="muted">
            Grado de estudios *
            <select className="input" value={form.grado_estudios} onChange={(e) => setCampo('grado_estudios', e.target.value)} style={{ marginTop: '0.3rem' }}>
              <option value="">Selecciona…</option>
              {GRADOS_ESTUDIOS.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </label>

          <label className="muted">
            Carrera / especialidad
            <input className="input" value={form.carrera} onChange={(e) => setCampo('carrera', e.target.value)} style={{ marginTop: '0.3rem' }} />
          </label>

          <label className="muted">
            Años de experiencia
            <input className="input" type="number" min={0} step={0.5} value={form.anios_experiencia} onChange={(e) => setCampo('anios_experiencia', e.target.value)} style={{ marginTop: '0.3rem' }} />
          </label>

          <label className="muted">
            Experiencia laboral *
            <textarea
              className="input"
              rows={3}
              value={form.experiencia}
              onChange={(e) => setCampo('experiencia', e.target.value)}
              placeholder="Dónde has trabajado, qué hacías, cuánto tiempo…"
              style={{ marginTop: '0.3rem', resize: 'vertical' }}
            />
          </label>

          <label className="muted">
            Puestos anteriores
            <textarea
              className="input"
              rows={2}
              value={form.puestos_anteriores}
              onChange={(e) => setCampo('puestos_anteriores', e.target.value)}
              style={{ marginTop: '0.3rem', resize: 'vertical' }}
            />
          </label>

          <label className="muted">
            Disponibilidad de turno *
            <select className="input" value={form.disponibilidad_turno} onChange={(e) => setCampo('disponibilidad_turno', e.target.value)} style={{ marginTop: '0.3rem' }}>
              {DISPONIBILIDAD_TURNO.map((d) => (
                <option key={d.id} value={d.id}>{d.label}</option>
              ))}
            </select>
          </label>

          <fieldset style={{ border: '1px solid var(--border, #ddd)', borderRadius: 8, padding: '0.65rem' }}>
            <legend className="muted" style={{ fontSize: '0.85rem' }}>Sucursales de interés</legend>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
              {sucursales.map((s) => {
                const on = (form.sucursales_interes || []).includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    className={`btn btn-sm ${on ? 'btn-gold' : 'btn-ghost'}`}
                    onClick={() => toggleSucursal(s.id)}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <label style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
            <input type="checkbox" checked={form.tiene_transporte} onChange={(e) => setCampo('tiene_transporte', e.target.checked)} />
            <span className="muted">Cuento con transporte propio</span>
          </label>
          <label style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
            <input type="checkbox" checked={form.licencia_conducir} onChange={(e) => setCampo('licencia_conducir', e.target.checked)} />
            <span className="muted">Tengo licencia de conducir</span>
          </label>
          <label style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
            <input type="checkbox" checked={form.disponibilidad_inmediata} onChange={(e) => setCampo('disponibilidad_inmediata', e.target.checked)} />
            <span className="muted">Disponibilidad inmediata</span>
          </label>

          <label className="muted">
            Expectativa de sueldo
            <input className="input" value={form.expectativa_sueldo} onChange={(e) => setCampo('expectativa_sueldo', e.target.value)} placeholder="Ej. $2,500 semanales" style={{ marginTop: '0.3rem' }} />
          </label>

          <label className="muted">
            CURP (opcional)
            <input className="input" value={form.curp} onChange={(e) => setCampo('curp', e.target.value.toUpperCase())} style={{ marginTop: '0.3rem' }} />
          </label>

          <label className="muted">
            ¿Por qué quieres trabajar con nosotros?
            <textarea className="input" rows={2} value={form.motivacion} onChange={(e) => setCampo('motivacion', e.target.value)} style={{ marginTop: '0.3rem', resize: 'vertical' }} />
          </label>

          <label className="muted">
            Referencias (nombre y teléfono)
            <textarea className="input" rows={2} value={form.referencias} onChange={(e) => setCampo('referencias', e.target.value)} style={{ marginTop: '0.3rem', resize: 'vertical' }} />
          </label>

          {error && <p style={{ color: 'var(--danger, #b91c1c)', margin: 0, fontSize: '0.9rem' }}>{error}</p>}

          <button type="button" className="btn btn-gold" disabled={enviando} onClick={enviar}>
            {enviando ? 'Enviando…' : 'Enviar postulación'}
          </button>
        </section>
      )}

      {paso === 3 && (
        <section className="card" style={{ padding: '1.25rem', textAlign: 'center' }}>
          <h2 style={{ marginTop: 0 }}>¡Gracias!</h2>
          <p className="muted">
            Recibimos tu postulación. El equipo de {brand} la revisará y, si hay coincidencia,
            te contactarán al teléfono que registraste.
          </p>
          <p className="muted" style={{ fontSize: '0.85rem' }}>Ya puedes cerrar esta ventana.</p>
        </section>
      )}

      <p className="muted" style={{ textAlign: 'center', fontSize: '0.75rem', marginTop: '1.5rem' }}>
        Solo para aspirantes · No es el acceso de empleados
      </p>
    </div>
  );
}
