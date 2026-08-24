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
  return candidatos[0] || null;
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
  const idx = lines.findIndex((l) => /^NOMBRE\b/.test(l) || l === 'NOMBRE');
  if (idx >= 0) {
    const bloque = [];
    for (let i = idx + 1; i < Math.min(idx + 5, lines.length); i += 1) {
      const l = lines[i];
      if (/^(DOMICILIO|CURP|CLAVE|SECCION|SECCIÓN|SEXO|FECHA|VIGENCIA)\b/.test(l)) break;
      if (esLineaRuido(l)) continue;
      if (/^\d{4,}/.test(l)) continue;
      if (l.length < 3) continue;
      bloque.push(l.replace(/^NOMBRE\s*/, '').trim());
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
  return {
    ok: campos.length > 0,
    patch,
    campos,
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

async function ocrConTesseract(dataUrl, onProgress) {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('spa+eng', 1, {
    logger: (m) => {
      if (typeof onProgress === 'function' && m?.status === 'recognizing text') {
        onProgress(Math.round((m.progress || 0) * 100));
      }
    },
  });
  try {
    const { data } = await worker.recognize(dataUrl);
    return String(data?.text || '');
  } finally {
    await worker.terminate();
  }
}

/**
 * Flujo completo: archivo imagen → comprimir → OCR → parsear campos RH.
 */
export async function leerIneDesdeArchivo(file, { onProgress } = {}) {
  if (!file) return { ok: false, error: 'No se eligió archivo.' };
  let dataUrl;
  try {
    // Mayor resolución ayuda al OCR de CURP
    dataUrl = await leerImagenProductoComoDataUrl(file, {
      maxSide: 1600,
      quality: 0.85,
      maxBytes: 1.4 * 1024 * 1024,
    });
  } catch (err) {
    return { ok: false, error: err?.message || 'No se pudo leer la imagen.' };
  }

  if (typeof onProgress === 'function') onProgress(5);

  let texto;
  try {
    texto = await ocrConTesseract(dataUrl, (p) => {
      if (typeof onProgress === 'function') onProgress(Math.min(95, 5 + Math.round(p * 0.9)));
    });
  } catch (err) {
    return {
      ok: false,
      error: `No se pudo leer el texto del INE (${err?.message || 'OCR'}). Revisa la conexión o intenta con otra foto más nítida.`,
      ine_foto: dataUrl,
    };
  }

  if (typeof onProgress === 'function') onProgress(100);

  // Versión más liviana para guardar en expediente
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
      error: 'No se detectaron datos del INE. Sube una foto más clara del anverso (donde se ve CURP y nombre) o captura los datos a mano.',
      ine_foto: fotoGuardar,
      textoOcr: parsed.textoNormalizado,
    };
  }

  return {
    ok: true,
    patch: {
      ...parsed.patch,
      ine_foto: fotoGuardar,
    },
    campos: parsed.campos,
    curp: parsed.curp,
    textoOcr: parsed.textoNormalizado,
    mensaje: `Se cargaron: ${parsed.campos.filter((c) => c !== 'doc_ine').join(', ') || 'datos del INE'}. Revisa y completa lo que falte.`,
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
  };
}

export function armarExtrasDesdeForm(form, extrasPrev = {}) {
  const prev = extrasPrev && typeof extrasPrev === 'object' ? extrasPrev : {};
  return {
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
}
