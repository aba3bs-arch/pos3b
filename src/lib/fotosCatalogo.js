const UA = 'POS3B/1.0 (catalog-photo-sync; abarrotes-3b)';
const FETCH_TIMEOUT_MS = 5000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(url, { ...opts, signal: ctrl.signal });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export function tieneFoto(producto) {
  const u = String(producto?.foto_url || '').trim();
  if (!u || u === 'null' || u === 'undefined') return false;
  return (
    u.startsWith('data:image') ||
    u.startsWith('http://') ||
    u.startsWith('https://') ||
    u.startsWith('blob:') ||
    u.startsWith('/') ||
    /^[A-Za-z0-9+/=\s]{80,}/.test(u)
  );
}

const APIS_CODIGO = [
  'https://world.openfoodfacts.org',
  'https://world.openproductsfacts.org',
  'https://world.openbeautyfacts.org',
  'https://world.openpetfoodfacts.org',
];

function variantesCodigo(codigoRaw) {
  const codigo = String(codigoRaw || '').trim();
  if (!codigo || !/^\d{6,18}$/.test(codigo)) return [];
  const set = new Set([codigo]);
  // Variantes comunes EAN/UPC
  if (codigo.length === 12) set.add(`0${codigo}`);
  if (codigo.length === 13 && codigo.startsWith('0')) set.add(codigo.slice(1));
  if (codigo.length < 13) set.add(codigo.padStart(13, '0'));
  return [...set];
}

async function buscarEnApiCodigo(base, codigo) {
  const url = `${base}/api/v2/product/${encodeURIComponent(codigo)}?fields=code,product_name,image_front_small_url,image_front_url,image_url`;
  const j = await fetchJson(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!j || j.status !== 1 || !j.product) return null;
  return (
    j.product.image_front_small_url ||
    j.product.image_front_url ||
    j.product.image_url ||
    null
  );
}

/** Busca por nombre en Open Food Facts (cuando el código no trae foto). */
async function buscarPorNombre(nombreRaw) {
  const q = String(nombreRaw || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 80);
  if (q.length < 4) return null;

  const intentos = [
    { search_terms: q, tagtype_0: 'countries', tag_contains_0: 'contains', tag_0: 'mexico' },
    { search_terms: q },
  ];

  for (const extra of intentos) {
    const params = new URLSearchParams({
      search_simple: '1',
      action: 'process',
      json: '1',
      page_size: '8',
      fields: 'code,product_name,image_front_small_url,image_front_url,image_url',
      ...extra,
    });
    const j = await fetchJson(`https://world.openfoodfacts.org/cgi/search.pl?${params}`, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    });
    if (!j) continue;
    for (const p of j.products || []) {
      const url = p.image_front_small_url || p.image_front_url || p.image_url;
      if (url) return url;
    }
  }
  return null;
}

/** Busca foto por código de barras (varias bases) y, si hay nombre, por búsqueda. */
export async function buscarFotoPorCodigo(codigoRaw, nombreHint = '') {
  const codigos = variantesCodigo(codigoRaw);
  for (const codigo of codigos) {
    for (const base of APIS_CODIGO) {
      try {
        const url = await buscarEnApiCodigo(base, codigo);
        if (url) return url;
      } catch {
        /* siguiente fuente */
      }
    }
  }
  if (nombreHint) {
    const porNombre = await buscarPorNombre(nombreHint);
    if (porNombre) return porNombre;
  }
  return null;
}

/**
 * Rellena foto_url en productos sin imagen, consultando internet.
 * opts: { soloSinFoto=true, limite=null, delayMs=350, onProgress, forzar=false, buscarNombre=true }
 */
export async function sincronizarFotosCatalogo(supabase, inventario, opts = {}) {
  const {
    soloSinFoto = true,
    limite = null,
    delayMs = 350,
    onProgress = null,
    forzar = false,
    buscarNombre = true,
  } = opts;

  if (!supabase) return { ok: false, error: 'Sin conexión a Supabase.' };

  let candidatos = (inventario || []).filter((p) => p?.id);
  if (soloSinFoto && !forzar) {
    candidatos = candidatos.filter((p) => !tieneFoto(p));
  }
  if (limite != null && limite > 0) candidatos = candidatos.slice(0, limite);
  if (!candidatos.length) {
    return { ok: true, actualizados: 0, sinFoto: 0, errores: 0, mensaje: 'No hay productos pendientes de foto.' };
  }

  let actualizados = 0;
  let sinFoto = 0;
  let errores = 0;

  for (let i = 0; i < candidatos.length; i++) {
    const p = candidatos[i];
    onProgress?.({
      actual: i + 1,
      total: candidatos.length,
      id: p.id,
      nombre: p.nombre,
      actualizados,
      sinFoto,
    });

    const url = await buscarFotoPorCodigo(p.id, buscarNombre ? p.nombre : '');
    if (!url) {
      sinFoto += 1;
    } else {
      const { error } = await supabase.from('productos').update({ foto_url: url }).eq('id', p.id);
      if (error) errores += 1;
      else actualizados += 1;
    }

    if (delayMs > 0 && i < candidatos.length - 1) await sleep(delayMs);
  }

  return {
    ok: true,
    actualizados,
    sinFoto,
    errores,
    total: candidatos.length,
    mensaje: `Fotos: ${actualizados} encontradas · ${sinFoto} sin imagen en internet · ${errores} error(es).`,
  };
}

export { sleep };
