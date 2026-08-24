import { etiquetaTienda, listarSucursalesOperativas } from '../constants/sucursales.js';
import { nombreEsAdminPrincipal, verificarAdminPrincipal } from './adminPrincipal.js';
import { verificarPinAdministradorGlobal } from './autorizacionTurnoFueraHorario.js';
import { normalizarRol } from './roles.js';

export const AVISO_FALTA_RH_ABA3B =
  'Ejecuta en Supabase: supabase/fix_rh_aba3b.sql para el módulo RH ABA3B.';

export const TIPOS_EMPLEADO_RH = [
  { id: 'tienda', label: 'Empleado de tienda' },
  { id: 'cubre_turno', label: 'Cubre turnos' },
  { id: 'indirecto', label: 'Empleado indirecto (MAIN)' },
];

export const MOTIVOS_BAJA_RH = [
  'Renuncia voluntaria',
  'Despido',
  'Abandono de empleo',
  'Fin de contrato / temporal',
  'Fin de cubre turno',
  'Jubilación',
  'Fallecimiento',
  'Otro',
];

export const PUESTOS_RH = [
  'Cajero',
  'Auxiliar de piso',
  'Encargado de tienda',
  'Supervisor',
  'Repartidor / Recolector',
  'Cubre turnos',
  'Administrativo',
  'Contabilidad',
  'Almacén',
  'Indirecto MAIN',
  'Otro',
];

function esErrorTablaRh(error) {
  const msg = String(error?.message || '');
  return (
    error?.code === '42P01'
    || (msg.includes('relation') && msg.includes('rh_'))
    || (msg.toLowerCase().includes('schema cache') && msg.includes('rh_'))
  );
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function hoyYmd() {
  return new Date().toISOString().slice(0, 10);
}

export function etiquetaTipoEmpleadoRh(tipo) {
  return TIPOS_EMPLEADO_RH.find((t) => t.id === tipo)?.label || tipo || '—';
}

export function etiquetaEstadoRh(estado) {
  if (estado === 'baja') return 'Inactivo (baja)';
  if (estado === 'activo') return 'Activo';
  return estado || '—';
}

export function nombreCompletoRh(row) {
  if (row?.nombre_completo) return String(row.nombre_completo).trim();
  return [row?.nombre, row?.apellidos].filter(Boolean).join(' ').trim() || 'Sin nombre';
}

function armarNombreCompleto(patch = {}) {
  if (patch.nombre_completo) return String(patch.nombre_completo).trim();
  return [patch.nombre, patch.apellidos].filter(Boolean).join(' ').trim();
}

function normalizarTipo(tipo, sucursalId) {
  const t = String(tipo || 'tienda').toLowerCase();
  if (t === 'cubre_turno' || t === 'cubre' || t === 'cubreturno') return 'cubre_turno';
  if (t === 'indirecto' || t === 'main') return 'indirecto';
  return 'tienda';
}

function sucursalParaTipo(tipo, sucursalId) {
  if (tipo === 'indirecto') return 'MAIN';
  return String(sucursalId || '').trim().toUpperCase() || null;
}

export function puedeGestionarRh(user) {
  const r = normalizarRol(user?.rol);
  return r === 'Administrador' || r === 'Gerente';
}

async function registrarMovimiento(supabase, {
  empleadoId,
  tipo,
  titulo,
  detalle,
  payload,
  actor,
}) {
  const row = {
    empleado_id: empleadoId,
    tipo,
    titulo: titulo || tipo,
    detalle: detalle || null,
    payload: payload || {},
    actor_id: actor?.id || null,
    actor_nombre: actor?.nombre || null,
  };
  const { error } = await supabase.from('rh_movimientos').insert([row]);
  if (error && esErrorTablaRh(error)) return { ok: false, error: AVISO_FALTA_RH_ABA3B };
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function listarEmpleadosRh(supabase, opts = {}) {
  if (!supabase) return { data: [], error: null };
  const estado = opts.estado || null;
  const tipo = opts.tipo || null;
  const q = String(opts.q || '').trim().toLowerCase();
  let query = supabase
    .from('rh_empleados')
    .select('*')
    .order('nombre_completo', { ascending: true })
    .limit(opts.limit || 500);
  if (estado) query = query.eq('estado', estado);
  if (tipo) query = query.eq('tipo_empleado', tipo);
  if (opts.sucursal) query = query.eq('sucursal_id', String(opts.sucursal).toUpperCase());
  const { data, error } = await query;
  if (error) {
    if (esErrorTablaRh(error)) return { data: [], error: AVISO_FALTA_RH_ABA3B };
    return { data: [], error: error.message };
  }
  let list = data || [];
  if (q) {
    list = list.filter((e) => {
      const blob = [
        e.nombre_completo, e.nombre, e.apellidos, e.curp, e.rfc, e.nss,
        e.telefono, e.email, e.folio, e.puesto, e.sucursal_id,
      ].join(' ').toLowerCase();
      return blob.includes(q);
    });
  }
  return { data: list, error: null };
}

export async function obtenerEmpleadoRh(supabase, id) {
  if (!supabase || !id) return { ok: false, error: 'Empleado inválido.' };
  const { data, error } = await supabase.from('rh_empleados').select('*').eq('id', id).maybeSingle();
  if (error) {
    if (esErrorTablaRh(error)) return { ok: false, error: AVISO_FALTA_RH_ABA3B };
    return { ok: false, error: error.message };
  }
  if (!data) return { ok: false, error: 'Empleado no encontrado.' };
  return { ok: true, empleado: data };
}

export async function listarHistorialRh(supabase, empleadoId, limit = 100) {
  if (!supabase || !empleadoId) return { data: [], error: null };
  const { data, error } = await supabase
    .from('rh_movimientos')
    .select('*')
    .eq('empleado_id', empleadoId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    if (esErrorTablaRh(error)) return { data: [], error: AVISO_FALTA_RH_ABA3B };
    return { data: [], error: error.message };
  }
  return { data: data || [], error: null };
}

/**
 * Lista administradores para aprobación unánime de recontratación.
 * Incluye admins dados de baja (activo=false) para que el creador de la app
 * pueda aprobar aunque ya no labore en la empresa.
 */
export async function listarAdminsParaRecontratacion(supabase) {
  if (!supabase) return { ok: false, error: 'Sin conexión.', admins: [] };
  const { data, error } = await supabase
    .from('usuarios')
    .select('id, nombre, pin, rol, activo, sucursal_id')
    .order('nombre', { ascending: true });
  if (error) return { ok: false, error: error.message, admins: [] };

  const admins = (data || [])
    .filter((u) => normalizarRol(u.rol) === 'Administrador')
    .map((u) => ({
      id: u.id,
      nombre: u.nombre,
      activo: u.activo !== false,
      esPrincipal: nombreEsAdminPrincipal(u.nombre),
      sucursal_id: u.sucursal_id,
    }));

  // Garantizar que el admin principal exista en la lista aunque no haya fila.
  if (!admins.some((a) => a.esPrincipal)) {
    admins.unshift({
      id: null,
      nombre: 'AMR / Andrés (admin principal)',
      activo: false,
      esPrincipal: true,
      sucursal_id: 'MAIN',
      virtual: true,
    });
  }

  // Principal primero, luego activos, luego bajas.
  admins.sort((a, b) => {
    if (a.esPrincipal !== b.esPrincipal) return a.esPrincipal ? -1 : 1;
    if (a.activo !== b.activo) return a.activo ? -1 : 1;
    return String(a.nombre).localeCompare(String(b.nombre), 'es');
  });

  return { ok: true, admins };
}

export async function altaEmpleadoRh(supabase, form = {}, { user } = {}) {
  if (!puedeGestionarRh(user)) {
    return { ok: false, error: 'Solo administrador o gerente pueden dar de alta.' };
  }
  if (!supabase) return { ok: false, error: 'Sin conexión.' };
  const nombre = String(form.nombre || '').trim();
  if (!nombre) return { ok: false, error: 'Indica el nombre.' };
  const tipo = normalizarTipo(form.tipo_empleado, form.sucursal_id);
  const sucursal_id = sucursalParaTipo(tipo, form.sucursal_id);
  if (tipo === 'tienda' && !sucursal_id) {
    return { ok: false, error: 'Indica la sucursal del empleado de tienda.' };
  }
  if (tipo === 'tienda' && !listarSucursalesOperativas().includes(sucursal_id) && sucursal_id !== 'MAIN') {
    // permitir cualquier código operativo o MAIN
  }
  if (tipo === 'cubre_turno' && !sucursal_id) {
    return { ok: false, error: 'Indica la sucursal del cubre turnos.' };
  }

  const nombre_completo = armarNombreCompleto({ ...form, nombre }) || nombre;
  const row = {
    nombre,
    apellidos: String(form.apellidos || '').trim() || null,
    nombre_completo,
    tipo_empleado: tipo,
    estado: 'activo',
    sucursal_id,
    puesto: String(form.puesto || '').trim() || null,
    rol_sistema: String(form.rol_sistema || '').trim() || null,
    fecha_nacimiento: form.fecha_nacimiento || null,
    curp: String(form.curp || '').trim().toUpperCase() || null,
    rfc: String(form.rfc || '').trim().toUpperCase() || null,
    nss: String(form.nss || '').trim() || null,
    telefono: String(form.telefono || '').trim() || null,
    telefono_emergencia: String(form.telefono_emergencia || '').trim() || null,
    contacto_emergencia: String(form.contacto_emergencia || '').trim() || null,
    email: String(form.email || '').trim() || null,
    direccion: String(form.direccion || '').trim() || null,
    colonia: String(form.colonia || '').trim() || null,
    ciudad: String(form.ciudad || '').trim() || null,
    estado_mx: String(form.estado_mx || '').trim() || null,
    cp: String(form.cp || '').trim() || null,
    banco: String(form.banco || '').trim() || null,
    clabe: String(form.clabe || '').trim() || null,
    salario_diario: form.salario_diario != null && form.salario_diario !== ''
      ? round2(form.salario_diario)
      : null,
    fecha_alta: form.fecha_alta || hoyYmd(),
    recontratable: true,
    documentos: form.documentos && typeof form.documentos === 'object' ? form.documentos : {},
    extras: {
      ine: Boolean(form.doc_ine),
      comprobante_domicilio: Boolean(form.doc_comprobante),
      acta_nacimiento: Boolean(form.doc_acta),
      constancia_fiscal: Boolean(form.doc_csf),
      contrato_firmado: Boolean(form.doc_contrato),
      foto: Boolean(form.doc_foto),
      notas_alta: String(form.notas || '').trim() || null,
    },
    created_by: user?.nombre || null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase.from('rh_empleados').insert([row]).select('*').single();
  if (error) {
    if (esErrorTablaRh(error)) return { ok: false, error: AVISO_FALTA_RH_ABA3B };
    return { ok: false, error: error.message };
  }

  const folio = `RH-${String(data.id).replace(/-/g, '').slice(0, 8).toUpperCase()}`;
  await supabase.from('rh_empleados').update({ folio }).eq('id', data.id);

  await registrarMovimiento(supabase, {
    empleadoId: data.id,
    tipo: 'alta',
    titulo: 'Alta de empleado',
    detalle: `${etiquetaTipoEmpleadoRh(tipo)} · ${sucursal_id ? etiquetaTienda(sucursal_id) : '—'} · ingreso ${row.fecha_alta}`,
    payload: { tipo, sucursal_id, puesto: row.puesto },
    actor: user,
  });

  return { ok: true, empleado: { ...data, folio }, mensaje: `Alta registrada · ${nombre_completo}` };
}

export async function editarEmpleadoRh(supabase, empleadoId, patch = {}, { user } = {}) {
  if (!puedeGestionarRh(user)) {
    return { ok: false, error: 'Solo administrador o gerente pueden editar.' };
  }
  if (!supabase || !empleadoId) return { ok: false, error: 'Empleado inválido.' };
  const prev = await obtenerEmpleadoRh(supabase, empleadoId);
  if (!prev.ok) return prev;

  const tipo = patch.tipo_empleado != null
    ? normalizarTipo(patch.tipo_empleado)
    : prev.empleado.tipo_empleado;
  const sucursal_id = patch.sucursal_id != null || patch.tipo_empleado != null
    ? sucursalParaTipo(tipo, patch.sucursal_id ?? prev.empleado.sucursal_id)
    : prev.empleado.sucursal_id;

  const upd = {
    updated_at: new Date().toISOString(),
  };
  const campos = [
    'nombre', 'apellidos', 'puesto', 'rol_sistema', 'fecha_nacimiento',
    'curp', 'rfc', 'nss', 'telefono', 'telefono_emergencia', 'contacto_emergencia',
    'email', 'direccion', 'colonia', 'ciudad', 'estado_mx', 'cp', 'banco', 'clabe',
    'fecha_alta', 'recontratable', 'motivo_no_recontratable',
  ];
  for (const c of campos) {
    if (patch[c] !== undefined) {
      if (typeof patch[c] === 'string') upd[c] = patch[c].trim() || null;
      else upd[c] = patch[c];
    }
  }
  if (patch.tipo_empleado != null) upd.tipo_empleado = tipo;
  if (patch.sucursal_id != null || patch.tipo_empleado != null) upd.sucursal_id = sucursal_id;
  if (patch.salario_diario !== undefined) {
    upd.salario_diario = patch.salario_diario === '' || patch.salario_diario == null
      ? null
      : round2(patch.salario_diario);
  }
  if (patch.curp != null) upd.curp = String(patch.curp).trim().toUpperCase() || null;
  if (patch.rfc != null) upd.rfc = String(patch.rfc).trim().toUpperCase() || null;
  if (patch.nombre != null || patch.apellidos != null || patch.nombre_completo != null) {
    upd.nombre_completo = armarNombreCompleto({
      nombre: patch.nombre ?? prev.empleado.nombre,
      apellidos: patch.apellidos ?? prev.empleado.apellidos,
      nombre_completo: patch.nombre_completo,
    });
  }
  if (patch.recontratable === true) upd.motivo_no_recontratable = null;
  if (patch.recontratable === false && !String(patch.motivo_no_recontratable || prev.empleado.motivo_no_recontratable || '').trim()) {
    return { ok: false, error: 'Indica el motivo por el que no es recontratable.' };
  }

  const { data, error } = await supabase
    .from('rh_empleados')
    .update(upd)
    .eq('id', empleadoId)
    .select('*')
    .single();
  if (error) return { ok: false, error: error.message };

  await registrarMovimiento(supabase, {
    empleadoId,
    tipo: 'edicion',
    titulo: 'Actualización de expediente',
    detalle: 'Se actualizaron datos del perfil / personales.',
    payload: { campos: Object.keys(upd) },
    actor: user,
  });

  return { ok: true, empleado: data, mensaje: 'Expediente actualizado.' };
}

export async function darDeBajaEmpleadoRh(supabase, empleadoId, opts = {}, { user } = {}) {
  if (!puedeGestionarRh(user)) {
    return { ok: false, error: 'Solo administrador o gerente pueden dar de baja.' };
  }
  if (!supabase || !empleadoId) return { ok: false, error: 'Empleado inválido.' };
  const prev = await obtenerEmpleadoRh(supabase, empleadoId);
  if (!prev.ok) return prev;
  if (prev.empleado.estado === 'baja') return { ok: false, error: 'Ya está dado de baja.' };

  const motivo = String(opts.motivo_baja || '').trim();
  if (!motivo) return { ok: false, error: 'Indica el motivo de baja.' };
  const recontratable = opts.recontratable !== false;
  const motivoNo = String(opts.motivo_no_recontratable || '').trim();
  if (!recontratable && !motivoNo) {
    return { ok: false, error: 'Si no es recontratable, indica el motivo.' };
  }

  const upd = {
    estado: 'baja',
    fecha_baja: opts.fecha_baja || hoyYmd(),
    motivo_baja: motivo,
    notas_baja: String(opts.notas_baja || '').trim() || null,
    recontratable,
    motivo_no_recontratable: recontratable ? null : motivoNo,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('rh_empleados')
    .update(upd)
    .eq('id', empleadoId)
    .select('*')
    .single();
  if (error) return { ok: false, error: error.message };

  // Si tiene usuario POS ligado, desactivarlo (queda como ex-empleado).
  if (data.usuario_id) {
    try {
      await supabase.from('usuarios').update({ activo: false }).eq('id', data.usuario_id);
    } catch {
      /* no bloquear baja RH */
    }
  }

  await registrarMovimiento(supabase, {
    empleadoId,
    tipo: 'baja',
    titulo: 'Baja de empleado',
    detalle: `${motivo}${recontratable ? ' · recontratable' : ' · NO recontratable'}`,
    payload: { ...upd },
    actor: user,
  });

  return {
    ok: true,
    empleado: data,
    mensaje: recontratable
      ? 'Baja registrada. Queda como ex-empleado recontratable.'
      : 'Baja registrada. NO recontratable: reingreso solo con PIN de todos los administradores.',
  };
}

export async function agregarNotaRh(supabase, empleadoId, texto, { user } = {}) {
  if (!puedeGestionarRh(user)) return { ok: false, error: 'Sin permiso.' };
  const detalle = String(texto || '').trim();
  if (!detalle) return { ok: false, error: 'Escribe la nota.' };
  const mov = await registrarMovimiento(supabase, {
    empleadoId,
    tipo: 'nota',
    titulo: 'Nota en expediente',
    detalle,
    actor: user,
  });
  if (!mov.ok) return mov;
  return { ok: true, mensaje: 'Nota agregada al historial.' };
}

/**
 * Recontratación directa (solo si recontratable=true).
 */
export async function recontratarEmpleadoRh(supabase, empleadoId, form = {}, { user } = {}) {
  if (!puedeGestionarRh(user)) {
    return { ok: false, error: 'Solo administrador o gerente pueden recontratar.' };
  }
  const prev = await obtenerEmpleadoRh(supabase, empleadoId);
  if (!prev.ok) return prev;
  const emp = prev.empleado;
  if (emp.estado !== 'baja') return { ok: false, error: 'El empleado no está de baja.' };
  if (!emp.recontratable) {
    return {
      ok: false,
      error: 'No es recontratable. Debes iniciar solicitud con PIN de todos los administradores.',
      requiereAprobacion: true,
    };
  }
  return aplicarRecontratacion(supabase, emp, form, user);
}

async function aplicarRecontratacion(supabase, emp, form, user) {
  const tipo = form.tipo_empleado != null
    ? normalizarTipo(form.tipo_empleado)
    : emp.tipo_empleado;
  const sucursal_id = sucursalParaTipo(
    tipo,
    form.sucursal_id != null ? form.sucursal_id : emp.sucursal_id,
  );
  const upd = {
    estado: 'activo',
    tipo_empleado: tipo,
    sucursal_id,
    fecha_alta: form.fecha_alta || hoyYmd(),
    fecha_baja: null,
    motivo_baja: null,
    notas_baja: null,
    recontratable: true,
    motivo_no_recontratable: null,
    puesto: form.puesto != null ? String(form.puesto).trim() || null : emp.puesto,
    updated_at: new Date().toISOString(),
  };
  if (form.salario_diario != null && form.salario_diario !== '') {
    upd.salario_diario = round2(form.salario_diario);
  }

  const { data, error } = await supabase
    .from('rh_empleados')
    .update(upd)
    .eq('id', emp.id)
    .select('*')
    .single();
  if (error) return { ok: false, error: error.message };

  if (data.usuario_id) {
    try {
      await supabase.from('usuarios').update({ activo: true }).eq('id', data.usuario_id);
    } catch {
      /* ignore */
    }
  }

  await registrarMovimiento(supabase, {
    empleadoId: emp.id,
    tipo: 'recontratacion',
    titulo: 'Recontratación',
    detalle: `Reingreso ${upd.fecha_alta} · ${etiquetaTipoEmpleadoRh(tipo)} · ${sucursal_id ? etiquetaTienda(sucursal_id) : '—'}`,
    payload: { ...upd },
    actor: user,
  });

  return { ok: true, empleado: data, mensaje: 'Empleado recontratado y activo.' };
}

/**
 * Inicia solicitud de recontratación para NO recontratables.
 * Requiere PIN de cada administrador (incl. bajas) + admin principal.
 */
export async function iniciarSolicitudRecontratacionRh(supabase, empleadoId, { motivo, user, form } = {}) {
  if (!puedeGestionarRh(user)) {
    return { ok: false, error: 'Solo administrador o gerente pueden solicitar recontratación.' };
  }
  const prev = await obtenerEmpleadoRh(supabase, empleadoId);
  if (!prev.ok) return prev;
  const emp = prev.empleado;
  if (emp.estado !== 'baja') return { ok: false, error: 'El empleado no está de baja.' };
  if (emp.recontratable) {
    return { ok: false, error: 'Es recontratable: usa recontratación directa.' };
  }

  // Cancelar pendientes previas
  await supabase
    .from('rh_recontratacion_solicitudes')
    .update({ estatus: 'cancelada' })
    .eq('empleado_id', empleadoId)
    .eq('estatus', 'pendiente');

  const adminsRes = await listarAdminsParaRecontratacion(supabase);
  if (!adminsRes.ok) return adminsRes;

  const { data, error } = await supabase
    .from('rh_recontratacion_solicitudes')
    .insert([{
      empleado_id: empleadoId,
      estatus: 'pendiente',
      motivo: String(motivo || '').trim() || 'Recontratación excepcional (no recontratable)',
      solicitado_por: user?.nombre || null,
      requiere_admin_principal: true,
      payload: {
        form: form || {},
        admins_requeridos: adminsRes.admins.map((a) => ({
          id: a.id,
          nombre: a.nombre,
          esPrincipal: a.esPrincipal,
          activo: a.activo,
        })),
      },
    }])
    .select('*')
    .single();
  if (error) {
    if (esErrorTablaRh(error)) return { ok: false, error: AVISO_FALTA_RH_ABA3B };
    return { ok: false, error: error.message };
  }

  await registrarMovimiento(supabase, {
    empleadoId,
    tipo: 'recontratacion',
    titulo: 'Solicitud de recontratación (no recontratable)',
    detalle: `Pendiente de PIN de ${adminsRes.admins.length} administrador(es), incluido el admin principal.`,
    payload: { solicitud_id: data.id },
    actor: user,
  });

  return {
    ok: true,
    solicitud: data,
    admins: adminsRes.admins,
    mensaje: 'Solicitud creada. Recaba el PIN de cada administrador.',
  };
}

export async function obtenerSolicitudRecontratacionPendiente(supabase, empleadoId) {
  if (!supabase || !empleadoId) return { ok: true, solicitud: null, pins: [] };
  const { data, error } = await supabase
    .from('rh_recontratacion_solicitudes')
    .select('*')
    .eq('empleado_id', empleadoId)
    .eq('estatus', 'pendiente')
    .order('solicitado_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    if (esErrorTablaRh(error)) return { ok: false, error: AVISO_FALTA_RH_ABA3B };
    return { ok: false, error: error.message };
  }
  if (!data) return { ok: true, solicitud: null, pins: [] };
  const { data: pins } = await supabase
    .from('rh_recontratacion_pins')
    .select('*')
    .eq('solicitud_id', data.id)
    .order('aprobado_at', { ascending: true });
  return { ok: true, solicitud: data, pins: pins || [] };
}

/**
 * Registra un PIN de administrador hacia una solicitud pendiente.
 * Si el admin es el principal, valida con verificarAdminPrincipal.
 * Cuando todos firmaron (y el principal sí), aplica la recontratación.
 */
export async function aprobarPinRecontratacionRh(supabase, solicitudId, pin, { user } = {}) {
  if (!puedeGestionarRh(user)) {
    return { ok: false, error: 'Sin permiso.' };
  }
  if (!supabase || !solicitudId) return { ok: false, error: 'Solicitud inválida.' };
  const p = String(pin || '').trim();
  if (!p) return { ok: false, error: 'Indica el PIN.' };

  const { data: sol, error: eSol } = await supabase
    .from('rh_recontratacion_solicitudes')
    .select('*')
    .eq('id', solicitudId)
    .maybeSingle();
  if (eSol) return { ok: false, error: eSol.message };
  if (!sol || sol.estatus !== 'pendiente') {
    return { ok: false, error: 'No hay solicitud pendiente.' };
  }

  const adminsRes = await listarAdminsParaRecontratacion(supabase);
  if (!adminsRes.ok) return adminsRes;
  const requeridos = adminsRes.admins;

  // Validar PIN: global (incluye admins de baja) o admin principal
  let adminAuth = await verificarPinAdministradorGlobal(supabase, p);
  let esPrincipal = false;
  if (adminAuth.ok) {
    esPrincipal = nombreEsAdminPrincipal(adminAuth.user?.nombre);
  } else {
    // Reintento estricto como admin principal (por si el nombre virtual no está en usuarios)
    const principal = await verificarAdminPrincipal(supabase, p);
    if (!principal.ok) {
      return { ok: false, error: adminAuth.error || principal.error || 'PIN incorrecto.' };
    }
    adminAuth = principal;
    esPrincipal = true;
  }

  const nombreAdmin = String(adminAuth.user?.nombre || adminAuth.nombre || '').trim();
  if (!nombreAdmin) return { ok: false, error: 'No se identificó al administrador.' };

  // Debe ser uno de los requeridos (por id o por ser principal)
  const match = requeridos.find((a) => {
    if (a.id && adminAuth.user?.id && String(a.id) === String(adminAuth.user.id)) return true;
    if (a.esPrincipal && esPrincipal) return true;
    const na = String(a.nombre || '').toLowerCase();
    const nb = nombreAdmin.toLowerCase();
    return na && nb && (na === nb || na.includes(nb) || nb.includes(na.split('(')[0].trim()));
  });
  if (!match && !esPrincipal) {
    return { ok: false, error: 'Ese administrador no está en la lista de aprobación requerida.' };
  }

  const claveNombre = (match?.esPrincipal || esPrincipal)
    ? (requeridos.find((a) => a.esPrincipal)?.nombre || nombreAdmin)
    : (match?.nombre || nombreAdmin);

  const { error: ePin } = await supabase.from('rh_recontratacion_pins').upsert([{
    solicitud_id: solicitudId,
    admin_usuario_id: adminAuth.user?.id || match?.id || null,
    admin_nombre: claveNombre,
    es_admin_principal: Boolean(match?.esPrincipal || esPrincipal),
    pin_ok: true,
    aprobado_at: new Date().toISOString(),
  }], { onConflict: 'solicitud_id,admin_nombre' });
  if (ePin) return { ok: false, error: ePin.message };

  await registrarMovimiento(supabase, {
    empleadoId: sol.empleado_id,
    tipo: 'aprobacion_pin',
    titulo: 'PIN de recontratación',
    detalle: `Aprobó: ${claveNombre}${esPrincipal ? ' (admin principal)' : ''}`,
    payload: { solicitud_id: solicitudId, admin: claveNombre, esPrincipal },
    actor: user,
  });

  const { data: pins } = await supabase
    .from('rh_recontratacion_pins')
    .select('*')
    .eq('solicitud_id', solicitudId);

  const firmados = new Set((pins || []).map((x) => String(x.admin_nombre).toLowerCase()));
  const principalFirmado = (pins || []).some((x) => x.es_admin_principal);
  const faltan = requeridos.filter((a) => {
    if (a.esPrincipal) return !principalFirmado;
    return ![...firmados].some((f) => {
      const an = String(a.nombre).toLowerCase();
      return f === an || f.includes(an) || an.includes(f);
    });
  });

  if (faltan.length > 0 || !principalFirmado) {
    return {
      ok: true,
      pendiente: true,
      pins: pins || [],
      faltan,
      mensaje: `PIN registrado (${claveNombre}). Faltan ${faltan.length} aprobación(es)`
        + (!principalFirmado ? ' · aún falta el admin principal' : '') + '.',
    };
  }

  // Todos firmaron → recontratar
  const empRes = await obtenerEmpleadoRh(supabase, sol.empleado_id);
  if (!empRes.ok) return empRes;
  const form = sol.payload?.form || {};
  const applied = await aplicarRecontratacion(supabase, empRes.empleado, form, user);
  if (!applied.ok) return applied;

  await supabase
    .from('rh_recontratacion_solicitudes')
    .update({
      estatus: 'aprobada',
      completada_at: new Date().toISOString(),
    })
    .eq('id', solicitudId);

  return {
    ok: true,
    pendiente: false,
    completada: true,
    empleado: applied.empleado,
    pins: pins || [],
    mensaje: 'Todos los administradores (incluido el principal) aprobaron. Empleado recontratado.',
  };
}

export function resumenProgresoRecontratacion(admins = [], pins = []) {
  const firmados = pins || [];
  const principalOk = firmados.some((p) => p.es_admin_principal);
  const items = (admins || []).map((a) => {
    const ok = a.esPrincipal
      ? principalOk
      : firmados.some((p) => {
        const an = String(a.nombre).toLowerCase();
        const pn = String(p.admin_nombre).toLowerCase();
        return pn === an || pn.includes(an) || an.includes(pn);
      });
    return { ...a, aprobado: ok };
  });
  const total = items.length;
  const listos = items.filter((i) => i.aprobado).length;
  return { items, total, listos, completo: total > 0 && listos >= total && principalOk };
}
