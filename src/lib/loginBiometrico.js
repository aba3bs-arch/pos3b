/**
 * Acceso biométrico en PWA / móvil (WebAuthn platform: Face ID, huella, etc.).
 * El PIN sigue siendo la fuente de verdad; la biometría desbloquea el usuario
 * ya enrollado en este dispositivo y se revalida contra Supabase.
 */
import { normalizarCodigoTienda } from '../constants/sucursales.js';
import { detectarMobile, esPwaInstalada } from './notificacionesDispositivo.js';

const LS_BIO = 'pos3b_login_biometrico_v1';

function bufferToBase64Url(buf) {
  const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : new Uint8Array(buf.buffer || buf);
  let s = '';
  bytes.forEach((b) => { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBuffer(str) {
  const pad = '='.repeat((4 - (String(str).length % 4)) % 4);
  const b64 = String(str).replace(/-/g, '+').replace(/_/g, '/') + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

function claveOferta(userId, sucursal) {
  return `${String(userId || '')}|${normalizarCodigoTienda(sucursal)}`;
}

function leerStore() {
  try {
    const raw = localStorage.getItem(LS_BIO);
    if (!raw) return { creds: [], ofertas: {} };
    const parsed = JSON.parse(raw);
    return {
      creds: Array.isArray(parsed?.creds) ? parsed.creds : [],
      ofertas: parsed?.ofertas && typeof parsed.ofertas === 'object' ? parsed.ofertas : {},
    };
  } catch {
    return { creds: [], ofertas: {} };
  }
}

function guardarStore(store) {
  localStorage.setItem(LS_BIO, JSON.stringify({
    creds: store.creds || [],
    ofertas: store.ofertas && typeof store.ofertas === 'object' ? store.ofertas : {},
  }));
}

export function soporteBiometricoDisponible() {
  if (typeof window === 'undefined') return false;
  if (!window.isSecureContext) return false;
  if (!window.PublicKeyCredential) return false;
  if (typeof navigator.credentials?.create !== 'function') return false;
  if (typeof navigator.credentials?.get !== 'function') return false;
  return true;
}

/** Conviene ofrecer biometría en móvil / PWA (también en tablet). */
export function convieneOfrecerBiometria() {
  return soporteBiometricoDisponible() && (detectarMobile() || esPwaInstalada());
}

export async function plataformaBiometricaDisponible() {
  if (!soporteBiometricoDisponible()) return false;
  try {
    if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function') {
      return Boolean(await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
    }
  } catch {
    /* ignore */
  }
  return true;
}

export function listarCredencialesBiometricas(sucursal) {
  const suc = normalizarCodigoTienda(sucursal);
  return leerStore().creds.filter((c) => !suc || c.sucursal === suc);
}

export function hayBiometriaParaSucursal(sucursal) {
  return listarCredencialesBiometricas(sucursal).length > 0;
}

export function usuarioTieneBiometriaEnEquipo(userId, sucursal) {
  const uid = String(userId || '');
  if (!uid) return false;
  return listarCredencialesBiometricas(sucursal).some((c) => String(c.userId) === uid);
}

/**
 * ¿Ya se respondió la oferta de biometría y no hace falta volver a preguntar?
 * - Rechazó → no preguntar de nuevo.
 * - Ya tiene credencial → no preguntar.
 * - Aceptó pero falló el registro (sin credencial) → sí volver a ofrecer.
 */
export function yaSeOfrecioBiometria(userId, sucursal) {
  const uid = String(userId || '');
  if (!uid) return false;
  if (usuarioTieneBiometriaEnEquipo(uid, sucursal)) return true;
  const store = leerStore();
  const entry = store.ofertas?.[claveOferta(uid, sucursal)];
  return entry?.decision === 'rechazada';
}

/** Marca la oferta como respondida (aceptada o rechazada) para no repetir el mensaje. */
export function marcarOfertaBiometriaRespondida(userId, sucursal, decision = 'rechazada') {
  const uid = String(userId || '');
  if (!uid) return;
  const store = leerStore();
  store.ofertas = store.ofertas || {};
  store.ofertas[claveOferta(uid, sucursal)] = {
    decision: decision === 'aceptada' ? 'aceptada' : 'rechazada',
    respondidoEn: new Date().toISOString(),
  };
  guardarStore(store);
}

export function olvidarBiometriaUsuario(userId, sucursal) {
  const uid = String(userId || '');
  const suc = normalizarCodigoTienda(sucursal);
  const store = leerStore();
  store.creds = store.creds.filter(
    (c) => !(String(c.userId) === uid && (!suc || c.sucursal === suc)),
  );
  if (store.ofertas && uid) {
    const k = claveOferta(uid, suc);
    if (store.ofertas[k]) delete store.ofertas[k];
  }
  guardarStore(store);
}

export function olvidarTodaBiometriaSucursal(sucursal) {
  const suc = normalizarCodigoTienda(sucursal);
  const store = leerStore();
  store.creds = store.creds.filter((c) => c.sucursal !== suc);
  if (store.ofertas) {
    for (const k of Object.keys(store.ofertas)) {
      if (k.endsWith(`|${suc}`)) delete store.ofertas[k];
    }
  }
  guardarStore(store);
}

/**
 * Registra Face ID / huella para este usuario en este dispositivo.
 * Usa credencial de plataforma no descubrible (localStorage guarda el id):
 * en Android/Chrome las passkeys descubribles suelen fallar con
 * "No se puede generar la llave de acceso".
 * @returns {{ ok: true } | { ok: false, error: string, cancelado?: boolean }}
 */
export async function registrarBiometriaTrasLogin({ user, sucursal }) {
  if (!user?.id) return { ok: false, error: 'Usuario inválido.' };
  if (!soporteBiometricoDisponible()) {
    return { ok: false, error: 'Este equipo no admite biometría (Face ID / huella).' };
  }
  const suc = normalizarCodigoTienda(sucursal);
  const userId = String(user.id);
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  // user.id WebAuthn: máximo 64 bytes; UUID/texto corto cabe en UTF-8.
  const userIdBytes = new TextEncoder().encode(userId.slice(0, 64));

  const existentes = listarCredencialesBiometricas(suc).filter((c) => String(c.userId) === userId);

  const publicKeyBase = {
    challenge,
    rp: {
      name: 'POS CONTROL 3B',
      id: window.location.hostname,
    },
    user: {
      id: userIdBytes,
      name: `${user.nombre || userId}@${suc}`.slice(0, 64),
      displayName: String(user.nombre || 'Usuario POS').slice(0, 64),
    },
    pubKeyCredParams: [
      { type: 'public-key', alg: -7 },
      { type: 'public-key', alg: -257 },
    ],
    excludeCredentials: existentes.map((c) => ({
      type: 'public-key',
      id: base64UrlToBuffer(c.credentialId),
      transports: ['internal'],
    })),
    timeout: 90_000,
    attestation: 'none',
  };

  async function crearCredencial(authenticatorSelection) {
    return navigator.credentials.create({
      publicKey: { ...publicKeyBase, authenticatorSelection },
    });
  }

  try {
    // Importante: no hacer await de red/API entre el gesto del usuario y create().
    let cred;
    try {
      cred = await crearCredencial({
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        // Evita passkey en el administrador de contraseñas (falla frecuente en Android).
        residentKey: 'discouraged',
        requireResidentKey: false,
      });
    } catch (errPrimero) {
      const n = String(errPrimero?.name || '');
      if (n === 'NotAllowedError' || n === 'AbortError' || n === 'InvalidStateError') throw errPrimero;
      // Reintento más compatible (algunos Android rechazan residentKey / UV required).
      cred = await crearCredencial({
        authenticatorAttachment: 'platform',
        userVerification: 'preferred',
      });
    }
    if (!cred?.rawId) return { ok: false, error: 'No se pudo crear la credencial biométrica.' };

    const credentialId = bufferToBase64Url(cred.rawId);
    const store = leerStore();
    store.creds = store.creds.filter(
      (c) => !(String(c.userId) === userId && c.sucursal === suc),
    );
    store.creds.push({
      credentialId,
      userId,
      nombre: String(user.nombre || ''),
      sucursal: suc,
      enrolledAt: new Date().toISOString(),
    });
    guardarStore(store);
    marcarOfertaBiometriaRespondida(userId, suc, 'aceptada');
    return { ok: true };
  } catch (err) {
    const name = String(err?.name || '');
    const msg = String(err?.message || '');
    if (name === 'InvalidStateError') {
      // Ya existe una credencial en el autenticador para este usuario.
      if (existentes.length) {
        marcarOfertaBiometriaRespondida(userId, suc, 'aceptada');
        return { ok: true };
      }
      return {
        ok: false,
        error: 'Este equipo ya tiene una llave biométrica para este usuario. Prueba entrar con biometría o borra datos del sitio e inténtalo de nuevo.',
      };
    }
    if (name === 'NotAllowedError' || name === 'AbortError') {
      return { ok: false, error: 'Registro biométrico cancelado.', cancelado: true };
    }
    if (name === 'NotSupportedError' || /llave de acceso|access key|passkey/i.test(msg)) {
      return {
        ok: false,
        error: 'No se pudo generar la llave biométrica en este equipo. Revisa que Face ID / huella esté activa en el sistema e inténtalo de nuevo al entrar con PIN.',
      };
    }
    return { ok: false, error: msg || 'No se pudo activar la biometría.' };
  }
}

/**
 * Desbloquea con biometría y devuelve el userId enrollado.
 * @returns {{ ok: true, userId: string, nombre?: string } | { ok: false, error: string, cancelado?: boolean }}
 */
export async function autenticarConBiometria(sucursal) {
  if (!(await plataformaBiometricaDisponible())) {
    return { ok: false, error: 'Biometría no disponible en este equipo.' };
  }
  const lista = listarCredencialesBiometricas(sucursal);
  if (!lista.length) {
    return { ok: false, error: 'Nadie ha activado biometría en esta tienda en este equipo. Entra con PIN y actívala.' };
  }
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        timeout: 90_000,
        userVerification: 'required',
        allowCredentials: lista.map((c) => ({
          type: 'public-key',
          id: base64UrlToBuffer(c.credentialId),
          transports: ['internal'],
        })),
      },
    });
    if (!assertion?.rawId) return { ok: false, error: 'Biometría no reconocida.' };
    const id = bufferToBase64Url(assertion.rawId);
    const match = lista.find((c) => c.credentialId === id);
    if (!match) return { ok: false, error: 'Credencial biométrica no encontrada.' };
    return { ok: true, userId: match.userId, nombre: match.nombre };
  } catch (err) {
    const name = String(err?.name || '');
    if (name === 'NotAllowedError' || name === 'AbortError') {
      return { ok: false, error: 'Biometría cancelada.', cancelado: true };
    }
    return { ok: false, error: err?.message || 'No se pudo usar la biometría.' };
  }
}
