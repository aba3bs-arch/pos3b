const UA = 'POS3B/1.0 (https://github.com/local; catalog photo sync)';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function tieneFoto(producto) {
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

async function buscarEnApi(base, codigo) {
  const url = `${base}/api/v2/product/${encodeURIComponent(codigo)}?fields=code,product_name,image_front_small_url,image_front_url,image_url`;
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) return null;
  const j = await r.json();
  if (j.status !== 1 || !j.product) return null;
  return (
    j.product.image_front_small_url ||
    j.product.image_front_url ||
    j.product.image_url ||
    null
  );
}

/** Busca foto por código de barras en Open Food Facts / Open Products Facts. */
export async function buscarFotoPorCodigo(codigoRaw) {
  const codigo = String(codigoRaw || '').trim();
  if (!codigo || !/^\d{6,18}$/.test(codigo)) return null;
  try {
    const off = await buscarEnApi('https://world.openfoodfacts.org', codigo);
    if (off) return off;
    const opf = await buscarEnApi('https://world.openproductsfacts.org', codigo);
    if (opf) return opf;
  } catch {
    return null;
  }
  return null;
}

/**
 * Rellena foto_url en productos sin imagen, consultando internet por código de barras.
 * opts: { soloSinFoto=true, limite=null, delayMs=350, onProgress, forzar=false }
 */
export async function sincronizarFotosCatalogo(supabase, inventario, opts = {}) {
  const {
    soloSinFoto = true,
    limite = null,
    delayMs = 350,
    onProgress = null,
    forzar = false,
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

    const url = await buscarFotoPorCodigo(p.id);
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

export { tieneFoto };
