/**
 * Sondea desde el cliente (anon key) qué tablas del login responden.
 * Útil cuando "no encuentra usuarios" / no se puede entrar.
 */

const TABLAS_LOGIN = [
  { tabla: 'usuarios', critica: true },
  { tabla: 'logins', critica: false },
  { tabla: 'pos_turnos_config', critica: false },
  { tabla: 'pos_pin_cubre_turno', critica: false },
  { tabla: 'pos_autorizacion_turno_fh', critica: false },
  { tabla: 'pos_solicitud_extension_turno', critica: false },
];

async function probarTabla(supabase, tabla) {
  const t0 = Date.now();
  try {
    const { data, error, count } = await supabase
      .from(tabla)
      .select('*', { count: 'exact', head: true })
      .limit(1);
    const ms = Date.now() - t0;
    if (error) {
      const msg = String(error.message || error);
      const falta =
        error.code === '42P01'
        || error.code === 'PGRST205'
        || /does not exist|schema cache/i.test(msg);
      return {
        tabla,
        ok: false,
        falta,
        error: msg,
        ms,
        count: null,
      };
    }
    return {
      tabla,
      ok: true,
      falta: false,
      error: null,
      ms,
      count: typeof count === 'number' ? count : (data ? data.length : null),
    };
  } catch (e) {
    return {
      tabla,
      ok: false,
      falta: false,
      error: e?.message || String(e),
      ms: Date.now() - t0,
      count: null,
    };
  }
}

/**
 * @returns {Promise<{ ok: boolean, resumen: string, filas: object[], usuariosMuestra: object[] }>}
 */
export async function diagnosticarTablasLogin(supabase) {
  if (!supabase) {
    return {
      ok: false,
      resumen: 'Sin cliente Supabase (revisa VITE_SUPABASE_URL / ANON_KEY).',
      filas: [],
      usuariosMuestra: [],
    };
  }

  const filas = [];
  for (const t of TABLAS_LOGIN) {
    const r = await probarTabla(supabase, t.tabla);
    filas.push({ ...r, critica: t.critica });
  }

  let usuariosMuestra = [];
  const uProbe = filas.find((f) => f.tabla === 'usuarios');
  if (uProbe?.ok) {
    const { data, error } = await supabase
      .from('usuarios')
      .select('id,nombre,rol,sucursal_id,activo')
      .order('nombre')
      .limit(8);
    if (!error) usuariosMuestra = data || [];
    else {
      uProbe.ok = false;
      uProbe.error = error.message;
    }
  }

  const fallas = filas.filter((f) => !f.ok);
  const criticasMal = fallas.filter((f) => f.critica);
  const lineas = filas.map((f) => {
    if (f.ok) return `OK  ${f.tabla} (${f.count ?? '?'} filas, ${f.ms}ms)`;
    if (f.falta) return `FALTA  ${f.tabla} — ${f.error}`;
    return `ERROR ${f.tabla} — ${f.error} (${f.ms}ms)`;
  });

  if (uProbe?.ok && (uProbe.count === 0 || usuariosMuestra.length === 0)) {
    lineas.push('AVISO: tabla usuarios responde pero está VACÍA o RLS oculta las filas.');
  }

  let resumen;
  if (criticasMal.length) {
    resumen =
      'FALLA CRÍTICA en login:\n'
      + criticasMal.map((f) => `• ${f.tabla}: ${f.error}`).join('\n')
      + '\n\n'
      + lineas.join('\n');
  } else if (fallas.length) {
    resumen =
      'Login: usuarios OK; otras tablas con aviso:\n' + lineas.join('\n');
  } else {
    resumen = 'Tablas de login OK:\n' + lineas.join('\n');
  }

  if (usuariosMuestra.length) {
    resumen +=
      '\n\nUsuarios visibles (muestra):\n'
      + usuariosMuestra
        .map((u) => `• ${u.nombre} · ${u.rol} · ${u.sucursal_id || '—'} · activo=${u.activo !== false}`)
        .join('\n');
  }

  return {
    ok: criticasMal.length === 0 && (uProbe?.count ?? 0) > 0,
    resumen,
    filas,
    usuariosMuestra,
  };
}
