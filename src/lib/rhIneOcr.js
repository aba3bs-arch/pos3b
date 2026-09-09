/**
 * Lectura de INE (credencial para votar) vía OCR + parseo de CURP / nombre / domicilio.
 * Usa tesseract.js solo al subir foto (carga diferida).
 */

import { leerImagenProductoComoDataUrl } from './imagenProducto.js';

const ESTADOS_MX = {
  AS: 'Aguascalientes', BC: 'Baja California', BS: 'Baja California Sur', CC: 'Campeche',
  CL: 'Coahuila', CM: 'Colima', CS: 'Chiapas', CH: 'Chihuahua', DF: 'Ciudad de México',
  DG: 'Durango', GT: 'Guanajuato', GR: 'Guerrero', HG: 'Hidalgo', JC: 'Jalisco',
  MC: 'México', MN: 'Michoacán', MS: 'Morelos', NT: 'Nayarit', NL: 'Nuevo León',
  OC: 'Oaxaca', PL: 'Puebla', QT: 'Querétaro', QR: 'Quintana Roo', SP: 'San Luis Potosí',
  SL: 'Sinaloa', SR: 'Sonora', TC: 'Tabasco', TS: 'Tamaulipas', TL: 'Tlaxcala',
  VZ: 'Veracruz', YN: 'Yucatán', ZS: 'Zacatecas', NE: 'Nacido en el Extranjero',
};

const PALABRAS_RUIDO = new Set([
  'INSTITUTO', 'NACIONAL', 'ELECTORAL', 'CREDENCIAL', 'PARA', 'VOTAR', 'MEXICO',
  'NOMBRE', 'DOMICILIO', 'CURP', 'CLAVE', 'ELECTOR', 'SECCION', 'SECCIÓN', 'VIGENCIA',
  'FECHA', 'NACIMIENTO', 'SEXO', 'ESTADO', 'MUNICIPIO', 'LOCALIDAD', 'EMISION',
  'EMISIÓN', 'REGISTRO', 'FEDERAL', 'CIUDADANO', 'CIUDADANA', 'INE', 'OCR',
  'ANO', 'AÑO', 'MES', 'DIA', 'DÍA', 'CALLE', 'AV', 'AVENIDA', 'COL', 'COLONIA',
]);

function normalizarTextoOcr(raw) {
  return String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[|]/g, 'I')
    .replace(/[“”«»]/g, '"')
    .toUpperCase()
    .replace(/[^A-Z0-9\n\s<.,#\/\-]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

export function extraerCurpDeTexto(texto) {
  const spaced = normalizarTextoOcr(texto);
  const continuous = spaced.replace(/[^A-Z0-9]/g, '');
  const candidatos = [];
  const pushAll = (src) => {
    const re = /([A-Z][AEIOUX][A-Z]{2}\d{6}[HM][A-Z]{2}[BCDFGHJKLMNPQRSTVWXYZ]{3}[A-Z0-9]\d)/g;
    let m;
    while ((m = re.exec(src)) !== null) candidatos.push(m[1]);
  };
  pushAll(spaced);
  pushAll(spaced.replace(/\s+/g, ''));
  pushAll(continuous);
  // OCR a veces inserta espacios dentro de la CURP
  pushAll(spaced.replace(/([A-Z0-9])\s+(?=[A-Z0-9])/g, '$1'));

  if (!candidatos.length && continuous.length >= 18) {
    for (let i = 0; i <= continuous.length - 18; i += 1) {
      const corr = corregirCurpOcr(continuous.slice(i, i + 18));
      if (/^[A-Z][AEIOUX][A-Z]{2}\d{6}[HM][A-Z]{2}[BCDFGHJKLMNPQRSTVWXYZ]{3}[A-Z0-9]\d$/.test(corr)) {
        candidatos.push(corr);
        break;
      }
    }
  }
  return candidatos[0] || null;
}

/** Corrige O/0, I/1, etc. en posiciones típicas de una CURP leída por OCR. */
export function corregirCurpOcr(raw) {
  const s = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (s.length < 18) return s;
  const chars = s.slice(0, 18).split('');
  const aDig = { O: '0', D: '0', Q: '0', I: '1', L: '1', Z: '2', S: '5', B: '8', G: '6' };
  const aLet = { 0: 'O', 1: 'I', 5: 'S', 8: 'B', 6: 'G', 2: 'Z' };
  for (let i = 0; i < 4; i += 1) {
    if (aLet[chars[i]]) chars[i] = aLet[chars[i]];
  }
  for (let i = 4; i < 10; i += 1) {
    if (aDig[chars[i]]) chars[i] = aDig[chars[i]];
  }
  if (chars[10] !== 'H' && chars[10] !== 'M') {
    if (chars[10] === 'N') chars[10] = 'M';
    else if (aLet[chars[10]] === 'H' || chars[10] === '4') chars[10] = 'H';
  }
  for (let i = 11; i < 16; i += 1) {
    if (aLet[chars[i]]) chars[i] = aLet[chars[i]];
  }
  if (aDig[chars[17]]) chars[17] = aDig[chars[17]];
  return chars.join('');
}

export function fechaNacimientoDesdeCurp(curp) {
  const c = String(curp || '').toUpperCase();
  if (c.length < 10) return null;
  const yy = Number(c.slice(4, 6));
  const mm = c.slice(6, 8);
  const dd = c.slice(8, 10);
  if (!(yy >= 0 && yy <= 99) || !(Number(mm) >= 1 && Number(mm) <= 12) || !(Number(dd) >= 1 && Number(dd) <= 31)) {
    return null;
  }
  const year = yy <= 30 ? 2000 + yy : 1900 + yy;
  return `${year}-${mm}-${dd}`;
}

export function rfcDesdeCurp(curp) {
  const c = String(curp || '').toUpperCase();
  if (c.length < 10) return null;
  // RFC base (10) + homoclave desconocida → se deja XXX para que el usuario complete
  return `${c.slice(0, 10)}XXX`;
}

export function estadoDesdeCurp(curp) {
  const c = String(curp || '').toUpperCase();
  if (c.length < 13) return null;
  const codigo = c.slice(11, 13);
  return ESTADOS_MX[codigo] || null;
}

function lineasLimpias(texto) {
  return normalizarTextoOcr(texto)
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
}

function esLineaRuido(linea) {
  const toks = linea.split(/\s+/).filter(Boolean);
  if (!toks.length) return true;
  if (toks.length <= 3 && toks.every((t) => PALABRAS_RUIDO.has(t) || /^\d+$/.test(t))) return true;
  if (/^(IDMEX|MEX|<<<)/.test(linea.replace(/\s/g, ''))) return false;
  return false;
}

/**
 * MRZ (zona de lectura mecánica) de INE moderna:
 * línea 3: APELLIDO1<APELLIDO2<<NOMBRE1<NOMBRE2
 */
export function parsearMrzIne(texto) {
  const lines = String(texto || '')
    .toUpperCase()
    .replace(/[^A-Z0-9<\n]/g, '')
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l.includes('<'));
  if (!lines.length) return null;

  const nombreLine = [...lines].reverse().find((l) => /[A-Z]+<<[A-Z]/.test(l) || /[A-Z]+<[A-Z]+<<[A-Z]/.test(l));
  if (!nombreLine) return null;

  const parts = nombreLine.replace(/<+$/g, '').split('<<');
  if (parts.length < 2) return null;
  const apellidos = parts[0].replace(/</g, ' ').replace(/\s+/g, ' ').trim();
  const nombres = parts.slice(1).join(' ').replace(/</g, ' ').replace(/\s+/g, ' ').trim();
  if (!nombres && !apellidos) return null;
  return { nombre: nombres, apellidos };
}

function tituloCasePalabra(w) {
  if (!w) return '';
  if (w.length <= 2 && ['DE', 'LA', 'EL', 'Y', 'DEL', 'LOS', 'LAS'].includes(w)) {
    return w.toLowerCase();
  }
  return w.charAt(0) + w.slice(1).toLowerCase();
}

export function tituloCaseNombre(s) {
  return String(s || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(tituloCasePalabra)
    .join(' ');
}

/**
 * Extrae nombre / apellidos de etiquetas NOMBRE en el anverso.
 */
export function parsearNombreVisual(texto) {
  const lines = lineasLimpias(texto);
  const esEtiquetaNombre = (l) => /^N[O0]MBRE\b/.test(l) || l === 'NOMBRE' || l === 'N0MBRE';
  const idx = lines.findIndex((l) => esEtiquetaNombre(l));
  if (idx >= 0) {
    const bloque = [];
    const restoPrimera = lines[idx].replace(/^N[O0]MBRE\s*/, '').trim();
    if (restoPrimera.length >= 3 && !esLineaRuido(restoPrimera)) bloque.push(restoPrimera);
    for (let i = idx + 1; i < Math.min(idx + 5, lines.length); i += 1) {
      const l = lines[i];
      if (/^(DOMICILIO|CURP|CLAVE|SECCION|SECCIÓN|SEXO|FECHA|VIGENCIA)\b/.test(l)) break;
      if (esLineaRuido(l)) continue;
      if (/^\d{4,}/.test(l)) continue;
      if (l.length < 3) continue;
      bloque.push(l.replace(/^N[O0]MBRE\s*/, '').trim());
    }
    const limpio = bloque.filter(Boolean);
    if (limpio.length >= 2) {
      // En muchas INE: línea1 apellidos, línea2 nombres
      return {
        apellidos: tituloCaseNombre(limpio[0]),
        nombre: tituloCaseNombre(limpio[1]),
      };
    }
    if (limpio.length === 1) {
      const toks = limpio[0].split(/\s+/);
      if (toks.length >= 3) {
        return {
          apellidos: tituloCaseNombre(toks.slice(0, 2).join(' ')),
          nombre: tituloCaseNombre(toks.slice(2).join(' ')),
        };
      }
      return { nombre: tituloCaseNombre(limpio[0]), apellidos: '' };
    }
  }
  const mrz = parsearMrzIne(texto);
  return mrz
    ? {
        nombre: tituloCaseNombre(mrz.nombre),
        apellidos: tituloCaseNombre(mrz.apellidos),
      }
    : null;
}

export function parsearDomicilioVisual(texto) {
  const lines = lineasLimpias(texto);
  const idx = lines.findIndex((l) => /^DOMICILIO\b/.test(l) || l === 'DOMICILIO');
  if (idx < 0) return null;

  const bloque = [];
  for (let i = idx + 1; i < Math.min(idx + 6, lines.length); i += 1) {
    const l = lines[i];
    if (/^(CURP|CLAVE|SECCION|SECCIÓN|SEXO|FECHA|VIGENCIA|NOMBRE|EMISION|EMISIÓN)\b/.test(l)) break;
    if (/^[A-Z][AEIOUX][A-Z]{2}\d{6}/.test(l.replace(/\s/g, ''))) break;
    if (esLineaRuido(l) && bloque.length) break;
    if (l.length < 3) continue;
    bloque.push(l);
  }
  if (!bloque.length) return null;

  let colonia = '';
  let ciudad = '';
  let estado_mx = '';
  let cp = '';
  let direccion = bloque[0];

  for (const l of bloque) {
    const cpMatch = l.match(/\b(\d{5})\b/);
    if (cpMatch) cp = cpMatch[1];
    if (/^(COL\.?|COLONIA)\b/.test(l)) {
      colonia = l.replace(/^(COL\.?|COLONIA)\s*/i, '').trim();
    }
  }

  // Última línea a menudo: "12345 MUNICIPIO, ESTADO" o "MUNICIPIO, ESTADO"
  const ultima = bloque[bloque.length - 1];
  const muniEst = ultima.match(/(?:\d{5}\s+)?([^,]+),\s*([A-ZÁÉÍÓÚÑ\s]+)$/i);
  if (muniEst) {
    ciudad = tituloCaseNombre(muniEst[1].replace(/^\d{5}\s*/, '').trim());
    estado_mx = tituloCaseNombre(muniEst[2].trim());
  }

  if (bloque.length >= 2 && !colonia) {
    const l2 = bloque[1];
    if (!/,\s*[A-Z]/.test(l2) || bloque.length > 2) {
      colonia = l2.replace(/^(COL\.?|COLONIA)\s*/i, '').replace(/\b\d{5}\b.*/, '').trim();
    }
  }

  return {
    direccion: tituloCaseNombre(direccion.replace(/^(C\.?|CALLE|AV\.?|AVENIDA)\s+/i, (m) => m)),
    colonia: tituloCaseNombre(colonia),
    ciudad,
    estado_mx,
    cp,
  };
}

/**
 * Parsea texto OCR completo de una INE → campos del formulario RH.
 */
export function parsearTextoIne(textoOcr) {
  const texto = String(textoOcr || '');
  const curp = extraerCurpDeTexto(texto);
  const nombreInfo = parsearNombreVisual(texto);
  const domicilio = parsearDomicilioVisual(texto);
  const fecha_nacimiento = curp ? fechaNacimientoDesdeCurp(curp) : null;
  const rfc = curp ? rfcDesdeCurp(curp) : null;
  const estadoCurp = curp ? estadoDesdeCurp(curp) : null;

  const patch = {
    curp: curp || '',
    rfc: rfc || '',
    fecha_nacimiento: fecha_nacimiento || '',
    nombre: nombreInfo?.nombre || '',
    apellidos: nombreInfo?.apellidos || '',
    direccion: domicilio?.direccion || '',
    colonia: domicilio?.colonia || '',
    ciudad: domicilio?.ciudad || '',
    estado_mx: domicilio?.estado_mx || estadoCurp || '',
    cp: domicilio?.cp || '',
    doc_ine: true,
  };

  const campos = Object.entries(patch).filter(([, v]) => v !== '' && v !== false).map(([k]) => k);
  const camposUtiles = campos.filter((c) => c !== 'doc_ine');
  return {
    ok: camposUtiles.length > 0,
    patch,
    campos: camposUtiles,
    curp,
    textoNormalizado: normalizarTextoOcr(texto).slice(0, 2000),
  };
}

/**
 * Aplica patch INE sobre el form actual sin borrar campos ya llenos (salvo overwrite).
 */
export function fusionarDatosIneEnForm(form, patch, { sobrescribir = true } = {}) {
  const next = { ...form };
  for (const [k, v] of Object.entries(patch || {})) {
    if (v === '' || v == null) continue;
    if (typeof v === 'boolean') {
      next[k] = v;
      continue;
    }
    const actual = String(next[k] ?? '').trim();
    if (sobrescribir || !actual) next[k] = v;
  }
  return next;
}

const OCR_INE_TIMEOUT_MS = 90_000;
const IMG_INE_TIMEOUT_MS = 20_000;

function urlPublica(rel) {
  const base = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || '/';
  const r = String(rel || '').replace(/^\//, '');
  return `${String(base).endsWith('/') ? base : `${base}/`}${r}`;
}

function conTimeout(promise, ms, mensaje) {
  let id;
  const timeout = new Promise((_, reject) => {
    id = setTimeout(() => reject(new Error(mensaje)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(id));
}

function emitirProgreso(onProgress, pct, etapa) {
  if (typeof onProgress === 'function') onProgress(pct, etapa);
}

function esHeic(file) {
  const t = String(file?.type || '').toLowerCase();
  const n = String(file?.name || '').toLowerCase();
  return t.includes('heic') || t.includes('heif') || /\.heic$|\.heif$/.test(n);
}

function archivoPareceImagen(file) {
  const t = String(file?.type || '').toLowerCase();
  if (!t || t === 'application/octet-stream') return true;
  return t.startsWith('image/');
}

function cargarImagenDesdeSrc(src, timeoutMs) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const id = setTimeout(() => {
      img.src = '';
      reject(new Error('La foto tardó demasiado en abrirse. Prueba JPG o una toma más liviana.'));
    }, timeoutMs);
    img.onload = () => {
      clearTimeout(id);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(id);
      reject(new Error('No se pudo leer la imagen.'));
    };
    img.src = src;
  });
}

function canvasToJpeg(canvas, quality) {
  return canvas.toDataURL('image/jpeg', quality);
}

function pintarIneParaOcr(img) {
  let w = img.naturalWidth || img.width;
  let h = img.naturalHeight || img.height;
  if (!w || !h) throw new Error('No se pudo leer la imagen.');
  const maxSide = 1800;
  const scale = Math.min(1, maxSide / Math.max(w, h));
  w = Math.max(1, Math.round(w * scale));
  h = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('No se pudo procesar la imagen.');
  ctx.drawImage(img, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h);
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const g = Math.round(d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114);
    const c = g < 128 ? Math.max(0, Math.round((g - 40) * 1.25)) : Math.min(255, Math.round((g + 20) * 1.1));
    d[i] = d[i + 1] = d[i + 2] = c;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvasToJpeg(canvas, 0.88);
}

async function prepararImagenIneParaOcr(file) {
  if (!file) throw new Error('No se eligió archivo.');
  if (!archivoPareceImagen(file)) {
    throw new Error('El archivo debe ser una imagen (JPG, PNG o WebP).');
  }
  if (esHeic(file)) {
    throw new Error('Este teléfono envió HEIC. Toma la foto de nuevo o súbela como JPG/PNG.');
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await conTimeout(
      cargarImagenDesdeSrc(objectUrl, IMG_INE_TIMEOUT_MS),
      IMG_INE_TIMEOUT_MS + 500,
      'La foto tardó demasiado en abrirse.',
    );
    return pintarIneParaOcr(img);
  } catch {
    const reader = new FileReader();
    const dataUrl = await conTimeout(
      new Promise((resolve, reject) => {
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
        reader.readAsDataURL(file);
      }),
      12_000,
      'No se pudo leer el archivo.',
    );
    const img = await cargarImagenDesdeSrc(dataUrl, IMG_INE_TIMEOUT_MS);
    return pintarIneParaOcr(img);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function progresoDesdeLoggerTesseract(m) {
  const status = String(m?.status || '');
  const p = Number(m?.progress);
  const frac = Number.isFinite(p) ? Math.max(0, Math.min(1, p)) : 0;
  if (status.includes('loading tesseract core') || status === 'loading tesseract core') {
    return { pct: 8 + Math.round(frac * 10), etapa: 'Cargando motor de lectura…' };
  }
  if (status.includes('initializing tesseract')) {
    return { pct: 18 + Math.round(frac * 8), etapa: 'Iniciando OCR…' };
  }
  if (status.includes('loading language')) {
    return { pct: 28 + Math.round(frac * 22), etapa: 'Cargando español (INE)…' };
  }
  if (status.includes('initializing api')) {
    return { pct: 52 + Math.round(frac * 8), etapa: 'Preparando lectura…' };
  }
  if (status.includes('recognizing text')) {
    return { pct: 62 + Math.round(frac * 33), etapa: 'Leyendo texto del INE…' };
  }
  if (status) {
    return { pct: null, etapa: 'Leyendo INE…' };
  }
  return null;
}

let workerIne = null;
let workerIneCreando = null;

async function crearWorkerIne(onProgress) {
  const { createWorker } = await import('tesseract.js');
  const workerPath = urlPublica('tesseract/worker.min.js');
  const corePath = urlPublica('tesseract/core');
  const langPath = urlPublica('tessdata').replace(/\/$/, '');

  return createWorker('spa', 1, {
    workerPath,
    corePath,
    langPath,
    gzip: true,
    logger: (m) => {
      const info = progresoDesdeLoggerTesseract(m);
      if (info?.pct != null) emitirProgreso(onProgress, info.pct, info.etapa);
    },
    errorHandler: (err) => {
      console.warn('[INE OCR]', err);
    },
  }, {
    tessedit_pageseg_mode: '6',
    preserve_interword_spaces: '1',
  });
}

async function ocrConTesseract(dataUrl, onProgress) {
  emitirProgreso(onProgress, 8, 'Cargando motor de lectura…');
  if (!workerIne) {
    if (!workerIneCreando) {
      workerIneCreando = crearWorkerIne(onProgress).then((w) => {
        workerIne = w;
        return w;
      }).catch((err) => {
        workerIneCreando = null;
        throw err;
      });
    }
    try {
      workerIne = await conTimeout(
        workerIneCreando,
        OCR_INE_TIMEOUT_MS,
        'El lector del INE tardó demasiado (motor OCR). Revisa la conexión o captura los datos a mano.',
      );
    } catch (err) {
      workerIne = null;
      workerIneCreando = null;
      throw err;
    }
  }

  emitirProgreso(onProgress, 62, 'Leyendo texto del INE…');
  const { data } = await conTimeout(
    workerIne.recognize(dataUrl),
    OCR_INE_TIMEOUT_MS,
    'La lectura del INE se detuvo. Toma una foto más nítida del anverso o captura los datos a mano.',
  );
  return String(data?.text || '');
}

/**
 * Flujo completo: archivo imagen → comprimir → OCR → parsear campos RH.
 */
export async function leerIneDesdeArchivo(file, { onProgress } = {}) {
  if (!file) return { ok: false, error: 'No se eligió archivo.' };
  let dataUrl;
  try {
    emitirProgreso(onProgress, 3, 'Preparando foto…');
    dataUrl = await prepararImagenIneParaOcr(file);
  } catch (err) {
    return { ok: false, error: err?.message || 'No se pudo leer la imagen.' };
  }

  emitirProgreso(onProgress, 6, 'Iniciando lectura…');

  let texto;
  try {
    texto = await ocrConTesseract(dataUrl, onProgress);
  } catch (err) {
    return {
      ok: false,
      error: `No se pudo leer el texto del INE (${err?.message || 'OCR'}). Prueba otra foto más nítida del anverso (CURP y nombre) o captura los datos a mano.`,
      ine_foto: dataUrl,
    };
  }

  emitirProgreso(onProgress, 98, 'Completando datos…');

  let fotoGuardar = dataUrl;
  try {
    const blob = await (await fetch(dataUrl)).blob();
    fotoGuardar = await leerImagenProductoComoDataUrl(
      new File([blob], 'ine.jpg', { type: 'image/jpeg' }),
      { maxSide: 900, quality: 0.72, maxBytes: 700 * 1024 },
    );
  } catch {
    fotoGuardar = dataUrl;
  }

  const parsed = parsearTextoIne(texto);
  if (!parsed.ok) {
    return {
      ok: false,
      error: 'No se detectaron nombre o CURP. Sube una foto más clara del anverso (frente, no el reverso) o captura los datos a mano.',
      ine_foto: fotoGuardar,
      textoOcr: parsed.textoNormalizado,
    };
  }

  emitirProgreso(onProgress, 100, 'Listo');
  return {
    ok: true,
    patch: {
      ...parsed.patch,
      ine_foto: fotoGuardar,
    },
    campos: parsed.campos,
    curp: parsed.curp,
    textoOcr: parsed.textoNormalizado,
    mensaje: `Se cargaron: ${parsed.campos.join(', ')}. Revisa y completa lo que falte.`,
  };
}

export function mapearExtrasAFormDocs(empleado) {
  const ex = empleado?.extras && typeof empleado.extras === 'object' ? empleado.extras : {};
  return {
    doc_ine: Boolean(ex.ine),
    doc_comprobante: Boolean(ex.comprobante_domicilio),
    doc_acta: Boolean(ex.acta_nacimiento),
    doc_csf: Boolean(ex.constancia_fiscal),
    doc_contrato: Boolean(ex.contrato_firmado),
    doc_foto: Boolean(ex.foto),
    ine_foto: ex.ine_foto || '',
    notas: ex.notas_alta || empleado?.notas || '',
    ct_sucursales: Array.isArray(ex.ct_sucursales) ? ex.ct_sucursales : undefined,
    ct_solo_dia: Boolean(ex.ct_solo_dia),
  };
}

export function armarExtrasDesdeForm(form, extrasPrev = {}) {
  const prev = extrasPrev && typeof extrasPrev === 'object' ? extrasPrev : {};
  const base = {
    ...prev,
    ine: Boolean(form.doc_ine),
    comprobante_domicilio: Boolean(form.doc_comprobante),
    acta_nacimiento: Boolean(form.doc_acta),
    constancia_fiscal: Boolean(form.doc_csf),
    contrato_firmado: Boolean(form.doc_contrato),
    foto: Boolean(form.doc_foto),
    notas_alta: String(form.notas || '').trim() || null,
    ...(form.ine_foto ? { ine_foto: form.ine_foto } : {}),
  };

  // Campos exclusivos de Cubre Turno (no nómina / multi-tienda / solo día).
  if (String(form.tipo_empleado || '') === 'cubre_turno') {
    const ops = typeof form.ct_sucursales !== 'undefined'
      ? form.ct_sucursales
      : prev.ct_sucursales;
    const lista = Array.isArray(ops)
      ? [...new Set(ops.map((s) => String(s || '').trim().toUpperCase()).filter(Boolean))]
      : [];
    // Sin lista explícita → las 7 operativas (legado / alta incompleta).
    base.ct_sucursales = lista.length
      ? lista
      : (Array.isArray(prev.ct_sucursales) && prev.ct_sucursales.length
        ? prev.ct_sucursales
        : null);
    base.ct_solo_dia = form.ct_solo_dia != null
      ? Boolean(form.ct_solo_dia)
      : Boolean(prev.ct_solo_dia);
    base.ct_disponibilidad = prev.ct_disponibilidad || 'disponible';
    base.sin_nomina = true;
    base.pago_via = 'gasto_cubre_turno';
  }

  return base;
}
