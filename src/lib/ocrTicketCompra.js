/**
 * OCR de ticket de compra (prueba).
 * 1) Si hay VITE_GROQ_API_KEY → visión Groq (mejor en tickets térmicos).
 * 2) Si no → Tesseract.js en el navegador.
 */

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_VISION_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';

const PROMPT_JSON = `Eres un extractor de tickets/notas de proveedor de abarrotes en México.
Devuelve SOLO un JSON válido (sin markdown) con esta forma:
{"proveedor_sugerido":string|null,"folio_ticket":string|null,"total_ticket":number|null,"lineas":[{"codigo":string|null,"descripcion":string,"qty":number,"precio_unit":number|null,"importe":number|null}]}
Reglas:
- qty es piezas enteras.
- codigo es código de barras si aparece (8-14 dígitos); si no, null.
- Ignora encabezados, IVA desglosado, cambio, leyendas fiscales.
- total_ticket es el total a pagar del ticket.
- Si no hay líneas claras, lineas=[].`;

function claveGroq() {
  try {
    const env = String(import.meta.env?.VITE_GROQ_API_KEY || '').trim();
    if (env) return env;
  } catch {
    /* ignore */
  }
  try {
    return String(localStorage.getItem('pos3b_groq_ticket_key') || '').trim();
  } catch {
    return '';
  }
}

export function guardarClaveGroqTicket(key) {
  const k = String(key || '').trim();
  try {
    if (k) localStorage.setItem('pos3b_groq_ticket_key', k);
    else localStorage.removeItem('pos3b_groq_ticket_key');
  } catch {
    /* ignore */
  }
}

export function leerClaveGroqTicket() {
  return claveGroq();
}

function parseJsonSuelto(texto) {
  const raw = String(texto || '').trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    /* try fenced */
  }
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

async function ocrConGroq(dataUrl) {
  const key = claveGroq();
  if (!key) return null;

  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: GROQ_VISION_MODEL,
      temperature: 0,
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: PROMPT_JSON },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const errTxt = await res.text().catch(() => '');
    throw new Error(`Groq visión falló (${res.status}): ${errTxt.slice(0, 180) || res.statusText}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  const parsed = parseJsonSuelto(content);
  if (!parsed || !Array.isArray(parsed.lineas)) {
    throw new Error('Groq no devolvió JSON de líneas usable.');
  }

  return {
    motor: 'groq',
    texto: typeof content === 'string' ? content : JSON.stringify(parsed),
    lineas: parsed.lineas.map((l) => ({
      codigo: l.codigo ? String(l.codigo).trim() : null,
      descripcion: String(l.descripcion || '').trim() || 'Sin descripción',
      qty: Math.max(1, Math.round(Number(l.qty) || 1)),
      precio_unit: l.precio_unit != null ? Number(l.precio_unit) : null,
      importe: l.importe != null ? Number(l.importe) : null,
    })),
    total_ticket: parsed.total_ticket != null ? Number(parsed.total_ticket) : null,
    proveedor_sugerido: parsed.proveedor_sugerido || null,
    folio_ticket: parsed.folio_ticket || null,
  };
}

async function ocrConTesseract(dataUrl, onProgress) {
  const { default: Tesseract } = await import('tesseract.js');
  const result = await Tesseract.recognize(dataUrl, 'spa+eng', {
    logger: (m) => {
      if (m?.status === 'recognizing text' && typeof onProgress === 'function') {
        onProgress(Math.round((m.progress || 0) * 100));
      }
    },
  });
  const texto = String(result?.data?.text || '');
  return { motor: 'tesseract', texto };
}

/**
 * @param {string} dataUrl
 * @param {{ onProgress?: (pct:number)=>void, forzar?: 'groq'|'tesseract' }} [opts]
 */
export async function ocrTicketDesdeDataUrl(dataUrl, opts = {}) {
  if (!dataUrl) throw new Error('Falta la imagen del ticket.');

  const forzar = opts.forzar;
  const onProgress = opts.onProgress;

  if (forzar !== 'tesseract') {
    try {
      const groq = await ocrConGroq(dataUrl);
      if (groq) return groq;
    } catch (err) {
      if (forzar === 'groq') throw err;
      // cae a Tesseract
      console.warn('[ocrTicketCompra] Groq no disponible, usando Tesseract:', err);
    }
  }

  if (typeof onProgress === 'function') onProgress(5);
  return ocrConTesseract(dataUrl, onProgress);
}
