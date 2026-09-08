import { etiquetaTienda, normalizarCodigoTienda } from '../constants/sucursales.js';
import {
  nombresMismaPersona,
  normalizarNombrePersona,
  resolverTipoEmpleado,
} from './empleadosVisibles.js';
import { normalizarRol } from './roles.js';

/**
 * Clave de ámbito para duplicados: misma persona no debe repetirse
 * activa en la misma tienda; indirectos se agrupan en MAIN.
 */
export function ambitoDuplicadoUsuario(u) {
  if (!u) return '';
  if (resolverTipoEmpleado(u) === 'indirecto') return 'MAIN';
  return normalizarCodigoTienda(u.sucursal_id) || 'MAIN';
}

/** Score para elegir qué registro conservar al depurar. */
export function scoreUsuarioParaConservar(u) {
  let s = 0;
  if (!u) return s;
  if (u.activo !== false) s += 100;
  if (u.dispositivo_id || u.dispositivo_id_2) s += 40;
  if (u.pin) s += 10;
  s += Math.min(String(u.nombre || '').trim().length, 80);
  if (u.turno_id || u.turno_horario) s += 5;
  if (u.updated_at) {
    const t = Date.parse(u.updated_at);
    if (!Number.isNaN(t)) s += Math.min(Math.floor(t / 1e10), 20);
  }
  return s;
}

/**
 * Agrupa usuarios activos que parecen la misma persona en el mismo ámbito (tienda/MAIN).
 * Ignora administradores (pueden existir varios).
 */
export function encontrarGruposDuplicadosActivos(usuarios = []) {
  const candidatos = (usuarios || []).filter((u) => {
    if (!u || u.activo === false) return false;
    if (normalizarRol(u.rol) === 'Administrador') return false;
    if (normalizarRol(u.rol) === 'Cliente') return false;
    return Boolean(String(u.nombre || '').trim());
  });

  const grupos = [];
  const usados = new Set();

  for (let i = 0; i < candidatos.length; i += 1) {
    const a = candidatos[i];
    const idA = String(a.id);
    if (usados.has(idA)) continue;
    const ambitoA = ambitoDuplicadoUsuario(a);
    const grupo = [a];
    usados.add(idA);

    for (let j = i + 1; j < candidatos.length; j += 1) {
      const b = candidatos[j];
      const idB = String(b.id);
      if (usados.has(idB)) continue;
      if (ambitoDuplicadoUsuario(b) !== ambitoA) continue;
      if (!nombresMismaPersona(a.nombre, b.nombre)) continue;
      grupo.push(b);
      usados.add(idB);
    }

    if (grupo.length > 1) {
      grupo.sort((x, y) => scoreUsuarioParaConservar(y) - scoreUsuarioParaConservar(x));
      grupos.push({
        ambito: ambitoA,
        nombre: grupo[0].nombre,
        conservar: grupo[0],
        duplicados: grupo.slice(1),
        todos: grupo,
      });
    }
  }

  return grupos.sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'));
}

/**
 * Busca conflicto al dar de alta: activo en misma tienda, o baja con mismo nombre
 * (debe usarse reingreso).
 */
export function detectarConflictoAltaUsuario(usuarios = [], { nombre, sucursal_id, tipo_empleado, excluirId = null } = {}) {
  const nom = String(nombre || '').trim();
  if (!nom) return { ok: true };

  const tipo = String(tipo_empleado || '').toLowerCase() === 'indirecto' ? 'indirecto' : 'tienda';
  const ambito = tipo === 'indirecto'
    ? 'MAIN'
    : (normalizarCodigoTienda(sucursal_id) || 'MAIN');

  const excl = excluirId != null ? String(excluirId) : null;
  const mismos = (usuarios || []).filter((u) => {
    if (!u || (excl && String(u.id) === excl)) return false;
    if (normalizarRol(u.rol) === 'Administrador') return false;
    if (normalizarRol(u.rol) === 'Cliente') return false;
    if (!nombresMismaPersona(u.nombre, nom)) return false;
    return ambitoDuplicadoUsuario(u) === ambito;
  });

  const activos = mismos.filter((u) => u.activo !== false);
  if (activos.length > 0) {
    const sample = activos
      .slice(0, 3)
      .map((u) => `${u.nombre} (PIN ${u.pin || '—'})`)
      .join('; ');
    return {
      ok: false,
      tipo: 'activo',
      matches: activos,
      error:
        `Ya hay ${activos.length === 1 ? 'un empleado activo' : `${activos.length} empleados activos`} `
        + `con el mismo nombre en ${etiquetaTienda(ambito)}: ${sample}. `
        + 'No crees otro alta: edita el existente, cámbialo de tienda o usa Reingreso si estaba de baja.',
    };
  }

  const bajas = mismos.filter((u) => u.activo === false);
  if (bajas.length > 0) {
    const sample = bajas[0];
    return {
      ok: false,
      tipo: 'baja',
      matches: bajas,
      error:
        `${sample.nombre} ya está registrado (dado de baja) en ${etiquetaTienda(ambito)}. `
        + 'Usa Reingreso en Usuarios o RH ABA3B; no crees un segundo empleado.',
    };
  }

  return { ok: true };
}

/**
 * Desactiva registros duplicados activos (conserva el de mayor score).
 * También marca baja en expedientes RH ligados a los desactivados.
 */
export async function depurarUsuariosDuplicados(supabase, usuarios = [], { user } = {}) {
  if (!supabase) return { ok: false, error: 'Sin conexión.', grupos: [], desactivados: [] };

  const grupos = encontrarGruposDuplicadosActivos(usuarios);
  if (grupos.length === 0) {
    return { ok: true, grupos: [], desactivados: [], mensaje: 'No hay empleados repetidos activos.' };
  }

  const desactivados = [];
  const errores = [];

  for (const g of grupos) {
    for (const dup of g.duplicados) {
      const { error } = await supabase
        .from('usuarios')
        .update({ activo: false })
        .eq('id', dup.id);
      if (error) {
        if (String(error.message || '').toLowerCase().includes('activo')) {
          return {
            ok: false,
            error: 'Ejecuta supabase/fix_usuarios_activo.sql en Supabase para poder depurar.',
            grupos,
            desactivados,
          };
        }
        errores.push(`${dup.nombre}: ${error.message}`);
        continue;
      }
      desactivados.push({
        id: dup.id,
        nombre: dup.nombre,
        sucursal_id: dup.sucursal_id,
        conservarId: g.conservar.id,
        conservarNombre: g.conservar.nombre,
      });

      // Expediente RH del duplicado → baja (si existe y no es el del conservado)
      try {
        const { data: rhRows } = await supabase
          .from('rh_empleados')
          .select('id, usuario_id, estado')
          .eq('usuario_id', dup.id)
          .limit(5);
        for (const rh of rhRows || []) {
          if (String(rh.usuario_id) === String(g.conservar.id)) continue;
          await supabase
            .from('rh_empleados')
            .update({
              estado: 'baja',
              fecha_baja: new Date().toISOString().slice(0, 10),
              motivo_baja: 'Otro',
              notas_baja: `Depuración automática: duplicado de ${g.conservar.nombre} (id ${g.conservar.id}).`,
              recontratable: false,
              motivo_no_recontratable: 'Registro duplicado consolidado',
              updated_at: new Date().toISOString(),
            })
            .eq('id', rh.id);
        }
      } catch {
        // RH opcional: no bloquear depuración POS
      }
    }
  }

  const nPers = grupos.length;
  const nDup = desactivados.length;
  const base =
    nDup > 0
      ? `Depurados ${nDup} registro${nDup === 1 ? '' : 's'} duplicado${nDup === 1 ? '' : 's'} `
        + `(${nPers} persona${nPers === 1 ? '' : 's'}). Se conserva una ficha activa por tienda.`
      : 'No se pudo desactivar ningún duplicado.';
  const mensaje = errores.length ? `${base} Errores: ${errores.join(' · ')}` : base;

  return {
    ok: errores.length === 0,
    grupos,
    desactivados,
    errores,
    mensaje,
    actor: user?.nombre || null,
  };
}

/** Resumen corto para UI. */
export function resumenGruposDuplicados(grupos = []) {
  if (!grupos.length) return '';
  return grupos
    .map((g) => {
      const extras = g.duplicados.map((d) => d.nombre).join(', ');
      return `${g.nombre} ×${g.todos.length} en ${etiquetaTienda(g.ambito)} (se conserva 1; sobran: ${extras})`;
    })
    .join('\n');
}

export function claveNombreAmbito(nombre, ambito) {
  return `${normalizarNombrePersona(nombre)}|${ambito}`;
}
