import React, { useMemo, useRef, useState } from 'react';
import BrandLogo from '../components/BrandLogo.jsx';
import { leerNombreNegocio } from '../lib/branding.js';
import { leerImagenProductoComoDataUrl } from '../lib/imagenProducto.js';
import {
  DISPONIBILIDAD_TURNO,
  DOC_EVALUACION_CONTRATACION,
  EDAD_MAYORIA,
  EDAD_MIN_CUBRE,
  EVALUACION_FA3B003,
  EVALUACION_MIN_PCT,
  FORM_CONTRATACION_VACIO,
  GRADOS_ESTUDIOS,
  NOTA_HONESTIDAD_EVALUACION,
  TIPOS_CONTRATACION,
  edadEfectivaAspirante,
  enviarSolicitudContratacion,
  opcionesSucursalesContratacion,
  validarFiltroTipoEdad,
  validarFotoAspirante,
  validarFormularioContratacion,
  validarPerfilLaboral,
  validarRespuestasEvaluacion,
} from '../lib/contratacion.js';

/**
 * Portal público de postulación (enlace / QR).
 * Pasos: tipo → datos → foto → perfil laboral → evaluación FA3B-003 → ok
 */
export default function ContratacionPublica({ supabase }) {
  const brand = leerNombreNegocio();
  const [paso, setPaso] = useState(1);
  const [form, setForm] = useState({
    ...FORM_CONTRATACION_VACIO,
    perfil_laboral: { ...FORM_CONTRATACION_VACIO.perfil_laboral },
    evaluacion_respuestas: {},
  });
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState(null);
  const [fotoBusy, setFotoBusy] = useState(false);
  const fileRef = useRef(null);
  const sucursales = useMemo(() => opcionesSucursalesContratacion(), []);

  const edadN = edadEfectivaAspirante(form);
  const esMenorCubre =
    form.tipo === 'cubre_turno' && edadN != null && edadN >= EDAD_MIN_CUBRE && edadN < EDAD_MAYORIA;

  const setCampo = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setPerfil = (k, v) =>
    setForm((f) => ({
      ...f,
      perfil_laboral: { ...f.perfil_laboral, [k]: v },
    }));
  const setEval = (qid, v) =>
    setForm((f) => ({
      ...f,
      evaluacion_respuestas: { ...f.evaluacion_respuestas, [qid]: v },
    }));

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

  const continuarDatos = () => {
    setError('');
    const r = validarFormularioContratacion(form);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    if (r.edad != null) setCampo('edad', r.edad);
    setPaso(3);
  };

  const continuarFoto = () => {
    setError('');
    const r = validarFotoAspirante(form.foto_url);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setPaso(4);
  };

  const continuarPerfil = () => {
    setError('');
    const r = validarPerfilLaboral(form.perfil_laboral, { tipo: form.tipo, edad: edadEfectivaAspirante(form) });
    if (r.incompleto) {
      setError(r.error);
      return;
    }
    // Aunque no cumpla, dejamos enviar: el sistema marcará no_califica.
    setPaso(5);
  };

  const onElegirFoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setFotoBusy(true);
    try {
      const dataUrl = await leerImagenProductoComoDataUrl(file, { maxSide: 640, quality: 0.72 });
      setCampo('foto_url', dataUrl);
    } catch (err) {
      setError(err?.message || 'No se pudo procesar la foto.');
    } finally {
      setFotoBusy(false);
    }
  };

  const enviar = async () => {
    setError('');
    const ev = validarRespuestasEvaluacion(form.evaluacion_respuestas);
    if (!ev.ok) {
      setError(ev.error);
      return;
    }
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
      setResultado({
        estado: res.solicitud?.estado || res.decision?.estado,
        pct: res.solicitud?.evaluacion_pct,
        motivo: res.decision?.motivo,
      });
      setPaso(6);
    } finally {
      setEnviando(false);
    }
  };

  const SiNo = ({ value, onChange }) => (
    <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.35rem' }}>
      <button
        type="button"
        className={`btn btn-sm ${value === true ? 'btn-gold' : 'btn-ghost'}`}
        onClick={() => onChange(true)}
      >
        Sí
      </button>
      <button
        type="button"
        className={`btn btn-sm ${value === false ? 'btn-gold' : 'btn-ghost'}`}
        onClick={() => onChange(false)}
      >
        No
      </button>
    </div>
  );

  return (
    <div className="contratacion-publica" style={{ minHeight: '100vh', padding: '1.25rem', maxWidth: 560, margin: '0 auto' }}>
      <header style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
        <BrandLogo alt={brand} maxHeight={72} style={{ margin: '0 auto' }} />
        <h1 style={{ margin: '0.65rem 0 0.25rem', fontSize: '1.35rem' }}>{brand}</h1>
        <p className="muted" style={{ margin: 0, fontSize: '0.9rem' }}>Postulación de empleo</p>
        {paso >= 1 && paso <= 5 && (
          <p className="muted" style={{ margin: '0.4rem 0 0', fontSize: '0.75rem' }}>
            Paso {paso} de 5
          </p>
        )}
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
                  min={EDAD_MAYORIA}
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
            <div style={{ display: 'grid', gap: '0.5rem' }}>
              <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
                Cubre turno desde {EDAD_MIN_CUBRE} años. De {EDAD_MIN_CUBRE} a {EDAD_MAYORIA - 1} se requiere permiso de padres.
              </p>
              <label className="muted">
                Edad *
                <input
                  className="input"
                  type="number"
                  min={EDAD_MIN_CUBRE}
                  max={80}
                  value={form.edad}
                  onChange={(e) => setCampo('edad', e.target.value)}
                  style={{ marginTop: '0.35rem' }}
                />
              </label>
            </div>
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
            <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Tus datos</h2>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPaso(1)}>← Tipo</button>
          </div>
          <p className="muted" style={{ margin: 0, fontSize: '0.82rem' }}>
            Postulas a: <strong>{TIPOS_CONTRATACION.find((t) => t.id === form.tipo)?.label}</strong>
            {' · '}Experiencia no es necesaria.
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
            Años de experiencia (opcional)
            <input className="input" type="number" min={0} step={0.5} value={form.anios_experiencia} onChange={(e) => setCampo('anios_experiencia', e.target.value)} style={{ marginTop: '0.3rem' }} />
          </label>

          <label className="muted">
            Experiencia laboral (opcional)
            <textarea
              className="input"
              rows={2}
              value={form.experiencia}
              onChange={(e) => setCampo('experiencia', e.target.value)}
              placeholder="Si tienes experiencia, cuéntanos brevemente…"
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

          <button type="button" className="btn btn-gold" onClick={continuarDatos}>
            Continuar → Foto
          </button>
        </section>
      )}

      {paso === 3 && (
        <section className="card" style={{ padding: '1rem', display: 'grid', gap: '0.85rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
            <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Foto para la solicitud</h2>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPaso(2)}>← Datos</button>
          </div>
          <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
            Tómate una foto clara de tu rostro (cámara del celular) o sube una imagen reciente.
          </p>

          <div
            style={{
              width: '100%',
              maxWidth: 280,
              margin: '0 auto',
              aspectRatio: '3 / 4',
              borderRadius: 12,
              overflow: 'hidden',
              background: 'var(--bg-muted, #f3f4f6)',
              border: '1px solid var(--border, #ddd)',
            }}
          >
            {form.foto_url ? (
              <img src={form.foto_url} alt="Tu foto" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div className="muted" style={{ display: 'grid', placeItems: 'center', height: '100%', fontSize: '0.85rem', padding: '1rem', textAlign: 'center' }}>
                Sin foto aún
              </div>
            )}
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="user"
            style={{ display: 'none' }}
            onChange={(e) => void onElegirFoto(e)}
          />

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', justifyContent: 'center' }}>
            <button
              type="button"
              className="btn btn-gold"
              disabled={fotoBusy}
              onClick={() => fileRef.current?.click()}
            >
              {fotoBusy ? 'Procesando…' : form.foto_url ? 'Cambiar foto' : 'Tomar / subir foto'}
            </button>
            {form.foto_url && (
              <button type="button" className="btn btn-ghost" onClick={() => setCampo('foto_url', '')}>
                Quitar
              </button>
            )}
          </div>

          {error && <p style={{ color: 'var(--danger, #b91c1c)', margin: 0, fontSize: '0.9rem' }}>{error}</p>}

          <button type="button" className="btn btn-gold" onClick={continuarFoto}>
            Continuar → Perfil laboral
          </button>
        </section>
      )}

      {paso === 4 && (
        <section className="card" style={{ padding: '1rem', display: 'grid', gap: '0.85rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
            <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Perfil laboral</h2>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPaso(3)}>← Foto</button>
          </div>
          <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
            Responde con honestidad. Experiencia no es necesaria; sí lo es cumplir este perfil.
          </p>

          <label className="muted" style={{ display: 'block' }}>
            ¿Tienes disponibilidad de horario para el turno que te interesa?
            <SiNo value={form.perfil_laboral.disponibilidad_horario} onChange={(v) => setPerfil('disponibilidad_horario', v)} />
          </label>

          <label className="muted" style={{ display: 'block' }}>
            ¿Cuentas con teléfono celular propio?
            <SiNo value={form.perfil_laboral.tiene_celular} onChange={(v) => setPerfil('tiene_celular', v)} />
          </label>

          <label className="muted" style={{ display: 'block' }}>
            ¿Estás casado(a) o en unión con responsabilidades de hogar?
            <SiNo
              value={form.perfil_laboral.casado}
              onChange={(v) => {
                setPerfil('casado', v);
                if (!v) setPerfil('deberes_permiten_turno', null);
              }}
            />
          </label>

          {form.perfil_laboral.casado === true && (
            <label className="muted" style={{ display: 'block' }}>
              ¿Tus deberes te permiten laborar el turno?
              <SiNo value={form.perfil_laboral.deberes_permiten_turno} onChange={(v) => setPerfil('deberes_permiten_turno', v)} />
            </label>
          )}

          <label className="muted" style={{ display: 'block' }}>
            ¿Confirmas que no usas drogas?
            <SiNo value={form.perfil_laboral.sin_drogas} onChange={(v) => setPerfil('sin_drogas', v)} />
          </label>

          <label className="muted" style={{ display: 'block' }}>
            ¿Confirmas que no tienes vicio del juego?
            <SiNo value={form.perfil_laboral.sin_vicio_juego} onChange={(v) => setPerfil('sin_vicio_juego', v)} />
          </label>

          <label className="muted" style={{ display: 'block' }}>
            ¿Estás dispuesto(a) a trabajar en fin de semana?
            <SiNo value={form.perfil_laboral.dispuesto_fin_semana} onChange={(v) => setPerfil('dispuesto_fin_semana', v)} />
          </label>

          <label className="muted" style={{ display: 'block' }}>
            ¿Sabes usar computadora (básico)?
            <SiNo value={form.perfil_laboral.sabe_computadora} onChange={(v) => setPerfil('sabe_computadora', v)} />
          </label>

          {esMenorCubre && (
            <label className="muted" style={{ display: 'block' }}>
              ¿Cuentas con permiso de tus padres para laborar como cubre turno?
              <SiNo value={form.perfil_laboral.permiso_padres} onChange={(v) => setPerfil('permiso_padres', v)} />
            </label>
          )}

          {error && <p style={{ color: 'var(--danger, #b91c1c)', margin: 0, fontSize: '0.9rem' }}>{error}</p>}

          <button type="button" className="btn btn-gold" onClick={continuarPerfil}>
            Continuar → Evaluación {DOC_EVALUACION_CONTRATACION}
          </button>
        </section>
      )}

      {paso === 5 && (
        <section className="card" style={{ padding: '1rem', display: 'grid', gap: '0.85rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
            <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Evaluación {DOC_EVALUACION_CONTRATACION}</h2>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPaso(4)}>← Perfil</button>
          </div>

          <aside
            style={{
              padding: '0.75rem',
              borderRadius: 8,
              background: 'rgba(212,175,55,0.12)',
              border: '1px solid rgba(212,175,55,0.35)',
              fontSize: '0.85rem',
              lineHeight: 1.45,
            }}
          >
            <strong>Nota:</strong> {NOTA_HONESTIDAD_EVALUACION}
          </aside>

          <p className="muted" style={{ margin: 0, fontSize: '0.8rem' }}>
            Mínimo {EVALUACION_MIN_PCT}%. Si contestas mal las primeras 5 preguntas, no calificarás para contratación ni bolsa de trabajo.
          </p>

          {EVALUACION_FA3B003.secciones.map((sec) => (
            <div key={sec.id} style={{ display: 'grid', gap: '0.65rem' }}>
              <h3 style={{ margin: '0.35rem 0 0', fontSize: '0.98rem' }}>{sec.titulo}</h3>
              {sec.preguntas.map((p, idx) => (
                <fieldset
                  key={p.id}
                  style={{ border: '1px solid var(--border, #ddd)', borderRadius: 8, padding: '0.65rem', margin: 0 }}
                >
                  <legend className="muted" style={{ fontSize: '0.78rem', padding: '0 0.25rem' }}>
                    {idx + 1}
                  </legend>
                  <p style={{ margin: '0 0 0.45rem', fontSize: '0.9rem' }}>{p.texto}</p>
                  <div style={{ display: 'grid', gap: '0.3rem' }}>
                    {p.opciones.map((o) => {
                      const on = form.evaluacion_respuestas[p.id] === o.id;
                      return (
                        <button
                          key={o.id}
                          type="button"
                          className={`btn btn-sm ${on ? 'btn-gold' : 'btn-ghost'}`}
                          style={{ textAlign: 'left', justifyContent: 'flex-start' }}
                          onClick={() => setEval(p.id, o.id)}
                        >
                          <strong style={{ marginRight: '0.35rem' }}>{o.id})</strong> {o.texto}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              ))}
            </div>
          ))}

          {error && <p style={{ color: 'var(--danger, #b91c1c)', margin: 0, fontSize: '0.9rem' }}>{error}</p>}

          <button type="button" className="btn btn-gold" disabled={enviando} onClick={() => void enviar()}>
            {enviando ? 'Enviando…' : 'Enviar postulación'}
          </button>
        </section>
      )}

      {paso === 6 && (
        <section className="card" style={{ padding: '1.25rem', textAlign: 'center' }}>
          <h2 style={{ marginTop: 0 }}>¡Gracias!</h2>
          {resultado?.estado === 'bolsa_de_trabajo' ? (
            <p className="muted">
              Recibimos tu postulación. Cumpliste el perfil y la evaluación
              {resultado.pct != null ? ` (${resultado.pct}%)` : ''}; quedaste en nuestra
              {' '}<strong>bolsa de trabajo</strong>. El equipo de {brand} te contactará si hay una plaza.
            </p>
          ) : resultado?.estado === 'no_califica' ? (
            <p className="muted">
              Recibimos tu solicitud. Por ahora no calificas para contratación ni bolsa de trabajo
              {resultado.pct != null ? ` (evaluación ${resultado.pct}%)` : ''}.
              Gracias por tu interés en {brand}.
            </p>
          ) : (
            <p className="muted">
              Recibimos tu postulación. El equipo de {brand} la revisará y, si hay coincidencia,
              te contactarán al teléfono que registraste.
            </p>
          )}
          <p className="muted" style={{ fontSize: '0.85rem' }}>Ya puedes cerrar esta ventana.</p>
        </section>
      )}

      <p className="muted" style={{ textAlign: 'center', fontSize: '0.75rem', marginTop: '1.5rem' }}>
        Solo para aspirantes · No es el acceso de empleados
      </p>
    </div>
  );
}
