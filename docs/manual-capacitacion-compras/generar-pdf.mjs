/**
 * Genera el PDF imprimible del manual de capacitación de compras.
 *
 *   node docs/manual-capacitacion-compras/generar-pdf.mjs
 *
 * Requiere Google Chrome / Chromium (se busca en rutas comunes o en la variable CHROME_PATH).
 * Salida: docs/manual-capacitacion-compras/Manual_Capacitacion_Compras_Las3B.pdf
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { MANUAL_CAPACITACION_COMPRAS as M, PRACTICAS, COLCHON_DIAS, resolverPractica, MAQUETA_RECOMENDACION } from './contenido.mjs';
import { recomendarPedido, textoRecomendacion } from '../../src/lib/comprasRecomendacion.js';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const SALIDA = path.join(DIR, 'Manual_Capacitacion_Compras_Las3B.pdf');
const LETRAS = ['A', 'B', 'C', 'D', 'E'];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = (s) =>
  esc(s)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
const img = (rel) => pathToFileURL(path.join(DIR, rel)).href;
const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Mezcla las opciones de forma estable para que la respuesta correcta no sea siempre la misma letra. */
function preguntasImpresas(quiz) {
  return quiz.map((q, qi) => {
    const rnd = mulberry32(1000 + qi * 7919);
    const idx = q.opciones.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    const opciones = idx.map((i) => q.opciones[i]);
    return { ...q, opciones, correctaLetra: LETRAS[idx.indexOf(q.correcta)] };
  });
}

const AVATARES = {
  Beto: { x: 150, y: 125 },
  Lulú: { x: 395, y: 135 },
  Ángel: { x: 635, y: 205 },
  Chispita: { x: 858, y: 213 },
};
const REGION = 170;
function avatar(quien, tam = 64) {
  const nombre = Object.keys(AVATARES).find((n) => quien.startsWith(n));
  if (!nombre) return '';
  const k = tam / REGION;
  const { x, y } = AVATARES[nombre];
  const style = `width:${tam}px;height:${tam}px;flex-basis:${tam}px;background-image:url('${img('imagenes/elenco.jpg')}');background-size:${(1024 * k).toFixed(1)}px auto;background-position:${(-(x - REGION / 2) * k).toFixed(1)}px ${(-(y - REGION / 2) * k).toFixed(1)}px`;
  return `<span class="av" style="${style}"></span>`;
}

function dialogoHtml(dialogo) {
  return `<div class="dialogo">${dialogo
    .map((d) => {
      const lado = d.lado === 'proveedor' ? 'prov' : 'tienda';
      return `<div class="fila ${lado}">${avatar(d.quien, 50)}<div class="globo ${lado}"><span class="quien">${esc(d.quien)}</span><span>${inline(d.texto)}</span></div></div>`;
    })
    .join('')}</div>`;
}

function maquetaRecomendacionHtml() {
  const { diasACubrir, colchonDias, filas } = MAQUETA_RECOMENDACION;
  const cuerpo = filas
    .map((f) => {
      const rec = recomendarPedido({ stock: f.teorico, ventaDiaria: f.ventaDiaria, diasACubrir, colchonDias, sugerido: f.sugerido });
      const { principal, detalle } = textoRecomendacion(rec);
      const clase = rec.accion === 'pedir' ? 'si' : 'no';
      return `<tr><td class="nom">${f.estrella ? '<span class="star">★</span> ' : ''}${esc(f.producto)}</td>
        <td>${f.teorico}</td><td class="sug">${f.sugerido}</td>
        <td class="rec"><span class="pill ${clase}">${esc(principal)}</span><small>${esc(detalle)}</small></td>
        <td class="ped">${rec.pedir}</td></tr>`;
    })
    .join('');
  return `<figure class="maqueta"><table>
    <thead><tr><th>Descripción</th><th>Teórico</th><th>Sugerido</th><th class="rec">Recomendación</th><th>Pedido</th></tr></thead>
    <tbody>${cuerpo}</tbody></table>
    <figcaption>Así se ve la columna (ejemplo, martes con visita el jueves, Colchón 0). «Aplicar recomendación al Pedido» llena la última columna con lo recomendado.</figcaption></figure>`;
}

function seccionHtml(s) {
  const partes = [`<h2>${esc(s.titulo)}</h2>`];
  for (const l of s.cuerpo || []) partes.push(`<p>${inline(l)}</p>`);
  if (s.maqueta === 'recomendacion') partes.push(maquetaRecomendacionHtml());
  if (s.imagen) partes.push(`<figure><img src="${img(s.imagen)}" alt=""><figcaption>${esc(s.imagenAlt || '')}</figcaption></figure>`);
  if (s.dialogo?.length) partes.push(dialogoHtml(s.dialogo));
  if (s.notas?.length) partes.push(`<div class="nota">${s.notas.map((n) => `<p>${inline(n)}</p>`).join('')}</div>`);
  return `<section class="sec sec-${s.id}">${partes.join('')}</section>`;
}

function tarjetaHtml(s) {
  return `<section class="sec tarjeta-wrap"><h2>${esc(s.titulo)}</h2>
    <p class="muted">Recorta esta tarjeta y llévala junto a la computadora o la tableta al hacer el pedido.</p>
    <div class="tarjeta">${(s.cuerpo || []).map((l) => `<p>${inline(l)}</p>`).join('')}</div></section>`;
}

function fraseHtml(s) {
  return `<section class="sec"><h2>${esc(s.titulo)}</h2>${(s.cuerpo || []).map((l, i) => `<p class="${i === 0 ? 'frase' : ''}">${inline(l)}</p>`).join('')}</section>`;
}

function practicaHtml() {
  const filas = PRACTICAS.map((c, i) => {
    return `<tr>
      <td class="prod"><strong>${i + 1}. ${esc(c.producto)}</strong><br><span class="muted">${esc(c.nota)}</span></td>
      ${c.ventas.map((v) => `<td class="c">${v}</td>`).join('')}
      <td class="c">${c.teorico}</td><td class="c">${c.diasSurtido}</td>
      <td class="w"></td><td class="w"></td><td class="w"></td><td class="w"></td>
    </tr>`;
  }).join('');
  const vacias = Array.from({ length: 3 }, (_, i) => `<tr class="vacia"><td class="prod"><span class="muted">Producto real ${i + 1}: ______________</span></td>${'<td class="w"></td>'.repeat(7)}<td class="w"></td><td class="w"></td><td class="w"></td><td class="w"></td><td class="w"></td><td class="w"></td></tr>`).join('');
  return `<section class="sec pagina"><h2>Hoja de práctica: calcula tu pedido</h2>
    <p>Para cada producto completa las columnas en blanco con la cuenta del manual y compara con la clave del instructor. Los últimos tres renglones son para practicar con productos reales de tu tienda usando el <strong>Detalle ventas por día</strong>.</p>
    <table class="practica">
      <thead><tr>
        <th rowspan="2">Producto</th><th colspan="7">Ventas por día (hace 7 días → hoy)</th>
        <th rowspan="2">Teórico</th><th rowspan="2">Días al surtido</th>
        <th rowspan="2">Venta diaria<br><small>suma ÷ 7</small></th>
        <th rowspan="2">Cobertura<br><small>Teórico ÷ venta</small></th>
        <th rowspan="2">Días a cubrir<br><small>surtido + ${COLCHON_DIAS}</small></th>
        <th rowspan="2">PEDIR<br><small>venta × días − Teórico</small></th>
      </tr><tr>${['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7'].map((d) => `<th class="dia">${d}</th>`).join('')}</tr></thead>
      <tbody>${filas}${vacias}</tbody>
    </table>
    <div class="nota"><p><strong>Recuerda:</strong> en la herramienta compara tu resultado con la columna <strong>Recomendación</strong>. Si hubo un día raro (pico o día sin surtido) no lo cuentes y divide entre los días normales. Si el resultado es cero o negativo, <strong>no pidas</strong>. Redondea a la caja o paquete del proveedor.</p></div>
  </section>`;
}

function examenHtml(s, preguntas) {
  const items = preguntas
    .map((q, i) => `<div class="preg"><p class="enun"><strong>${i + 1}.</strong> ${inline(q.pregunta)}</p>
      ${q.opciones.map((o, k) => `<p class="opc"><span class="circ"></span><strong>${LETRAS[k]})</strong> ${inline(o)}</p>`).join('')}</div>`)
    .join('');
  return `<section class="sec pagina examen"><h2>${esc(s.titulo.replace(/^\d+\.\s*/, ''))}</h2>
    <div class="datos">
      <span>Nombre: <i class="linea l1"></i></span><span>Tienda: <i class="linea l2"></i></span><span>Fecha: <i class="linea l3"></i></span>
    </div>
    <p><strong>Instrucciones:</strong> marca con una <strong>X</strong> la opción correcta de cada pregunta. Puedes usar calculadora. Son <strong>${preguntas.length} preguntas</strong>; se aprueba con <strong>70% o más</strong> (${Math.ceil(preguntas.length * 0.7 - 1e-9)} aciertos o más).</p>
    <div class="preguntas">${items}</div>
    <div class="calif">Aciertos: <i class="linea l4"></i> de ${preguntas.length} &nbsp;&nbsp; Calificación: <i class="linea l4"></i> % &nbsp;&nbsp; Aprobó:&nbsp; ☐ Sí &nbsp; ☐ No</div>
  </section>`;
}

function constanciaHtml(s) {
  return `<section class="sec constancia"><h2>Constancia de capacitación</h2>
    <figure><img src="${img(s.imagen)}" alt=""></figure>
    <p class="cons">Se hace constar que <i class="linea l5"></i> de la tienda <i class="linea l2"></i> completó la capacitación <strong>«Cuánto pedir según la venta por día»</strong> de la herramienta de compras de Las 3B, con calificación de <i class="linea l4"></i> %.</p>
    <div class="firmas"><span><i class="linea l6"></i><br>Firma del colaborador</span><span><i class="linea l6"></i><br>Firma del instructor / encargado</span><span><i class="linea l3"></i><br>Fecha</span></div>
  </section>`;
}

function claveHtml(preguntas) {
  const filas = preguntas
    .map((q, i) => `<tr><td class="n">${i + 1}</td><td class="l">${q.correctaLetra}</td><td>${inline(q.explicacion)}</td></tr>`)
    .join('');
  const prac = PRACTICAS.map((c, i) => {
    const r = resolverPractica(c);
    return `<tr><td class="n">${i + 1}</td><td>${esc(c.producto)}</td><td class="c">${fmt(r.ventaDiaria)}</td><td class="c">${r.cobertura.toFixed(1)}</td><td class="c">${r.diasACubrir}</td><td class="c"><strong>${r.pedir}</strong></td></tr>`;
  }).join('');
  return `<section class="sec pagina clave"><h2>Clave de respuestas · solo para el instructor</h2>
    <p class="muted">Separa esta hoja antes de entregar el manual al personal.</p>
    <h3>Evaluación final</h3>
    <table class="clave-t"><thead><tr><th>#</th><th>Resp.</th><th>Por qué</th></tr></thead><tbody>${filas}</tbody></table>
    <h3>Hoja de práctica</h3>
    <table class="clave-t"><thead><tr><th>#</th><th>Producto</th><th>Venta diaria</th><th>Cobertura (días)</th><th>Días a cubrir</th><th>Pedir</th></tr></thead><tbody>${prac}</tbody></table>
    <p class="muted">Práctica 3: se calcula con los 6 días normales (sin el pico de 14). Cada pregunta vale ${(100 / preguntas.length).toFixed(1)}%. Se aprueba con ${Math.ceil(preguntas.length * 0.7 - 1e-9)} aciertos o más (${Math.round((Math.ceil(preguntas.length * 0.7 - 1e-9) / preguntas.length) * 100)}%); con ${Math.ceil(preguntas.length * 0.7 - 1e-9) - 1} o menos, repasa y repite.</p>
  </section>`;
}

function portadaHtml() {
  const cast = [
    ['Beto', 'Gerente de Las 3B. Revisa que los números cuadren.'],
    ['Lulú', 'Compras y recepción en Las 3B. Escanea y calcula.'],
    ['Ángel', 'Encargado del pan (proveedor). Entrega directa.'],
    ['Chispita', 'Proveedora de refrescos. Trabaja por pedido.'],
  ];
  return `<section class="portada">
    <div class="marca">LAS 3B · CAPACITACIÓN DE PERSONAL</div>
    <h1>Cuánto pedir según la venta por día</h1>
    <p class="sub">Manual de la herramienta de compras: cómo usar el <strong>Detalle ventas por día</strong> para calcular el pedido y evitar compras innecesarias.</p>
    <figure><img src="${img('imagenes/01-portada.jpg')}" alt=""></figure>
    <div class="elenco">${cast.map(([n, d]) => `<div>${avatar(n)}<span><strong>${n}</strong><br>${d}</span></div>`).join('')}</div>
    <p class="pie-portada">Los personajes son ilustraciones originales. Los ejemplos con números son ficticios; los pasos y botones corresponden a la herramienta de compras.</p>
  </section>`;
}

const CSS = `
@page { size: Letter; margin: 14mm 14mm 17mm;
  @bottom-center { content: "Las 3B · Manual de capacitación de compras  ·  página " counter(page); font: 8pt Arial, sans-serif; color: #6b7280; } }
@page :first { @bottom-center { content: ""; } }
* { box-sizing: border-box; }
html { font-family: "Segoe UI", "DejaVu Sans", Arial, sans-serif; color: #111827; font-size: 10.5pt; line-height: 1.42; }
body { margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
h1 { font-size: 27pt; line-height: 1.1; margin: 4mm 0 3mm; color: #1e3a8a; }
h2 { font-size: 14pt; color: #1e40af; border-bottom: 2.5px solid #b5a642; padding-bottom: 1.5mm; margin: 0 0 3mm; break-after: avoid; }
h3 { font-size: 11.5pt; color: #1e40af; margin: 4mm 0 2mm; }
p { margin: 0 0 2mm; }
code { background: #f3f4f6; padding: 0 2px; border-radius: 3px; }
.muted { color: #6b7280; font-size: 9pt; }
.portada { break-after: page; text-align: center; }
.portada .marca { letter-spacing: .14em; font-size: 9pt; font-weight: 700; color: #92400e; border: 1.5px solid #b5a642; display: inline-block; padding: 1.5mm 5mm; border-radius: 99px; }
.portada .sub { font-size: 12pt; color: #374151; max-width: 150mm; margin: 0 auto 5mm; }
.portada figure img { width: 100%; max-height: 135mm; border-radius: 10px; border: 1px solid #e5e7eb; }
.elenco { display: grid; grid-template-columns: 1fr 1fr; gap: 3mm 6mm; text-align: left; margin-top: 6mm; font-size: 9.5pt; }
.elenco > div { display: flex; align-items: center; gap: 3mm; }
.pie-portada { color: #6b7280; font-size: 8.5pt; margin-top: 6mm; }
.av { flex: 0 0 auto; border-radius: 50%; border: 2px solid #fff; box-shadow: 0 0 0 1.5px #b5a642; background-repeat: no-repeat; background-color: #fef3c7; display: inline-block; }
.sec { margin: 0 0 7mm; }
.sec + .sec.pagina, .pagina { break-before: page; }
figure { margin: 3mm 0; break-inside: avoid; }
figure img { width: 100%; max-height: 66mm; object-fit: contain; border-radius: 8px; border: 1px solid #e5e7eb; background: #fffaf0; }
figcaption { font-size: 8.5pt; color: #6b7280; font-style: italic; margin-top: 1mm; text-align: center; }
.dialogo { display: flex; flex-direction: column; gap: 2.2mm; margin: 3mm 0; }
.fila { display: flex; align-items: flex-end; gap: 2.5mm; break-inside: avoid; }
.fila.prov { flex-direction: row-reverse; }
.globo { position: relative; max-width: 78%; padding: 2mm 3.2mm; border-radius: 12px; font-size: 10pt; display: flex; flex-direction: column; gap: .5mm; }
.globo.tienda { background: #e0e7ff; border: 1px solid #a5b4fc; border-bottom-left-radius: 3px; }
.globo.prov { background: #ffedd5; border: 1px solid #fdba74; border-bottom-right-radius: 3px; }
.quien { font-size: 7.5pt; font-weight: 800; text-transform: uppercase; letter-spacing: .04em; color: #4b5563; }
.maqueta table { font-size: 9pt; border: 1px solid #d1d5db; }
.maqueta th, .maqueta td { border-bottom: 1px solid #e5e7eb; padding: 1.4mm 2.5mm; text-align: center; }
.maqueta th { background: #f3f4f6; font-size: 8pt; text-transform: uppercase; color: #4b5563; }
.maqueta td.nom, .maqueta th:first-child { text-align: left; }
.maqueta .rec { background: #fffbeb; border-left: 2px solid #f59e0b; border-right: 2px solid #f59e0b; }
.maqueta th.rec { background: #fef3c7; color: #92400e; }
.maqueta .pill { display: inline-block; padding: .4mm 3mm; border-radius: 99px; font-weight: 800; font-size: 8.5pt; }
.maqueta .pill.si { background: #16a34a; color: #fff; }
.maqueta .pill.no { background: #e5e7eb; color: #374151; }
.maqueta small { display: block; color: #6b7280; font-size: 7.5pt; margin-top: .3mm; }
.maqueta .star { color: #d97706; font-weight: 800; }
.maqueta .sug { color: #1e40af; font-weight: 700; }
.nota { margin: 3mm 0; padding: 2.5mm 3.5mm; border-left: 4px solid #b5a642; background: #fbf7e1; border-radius: 4px; font-size: 9.5pt; break-inside: avoid; }
.nota p:last-child { margin: 0; }
.tarjeta { border: 2px dashed #1e40af; border-radius: 10px; padding: 4mm 5mm; background: #eff6ff; break-inside: avoid; }
.tarjeta p { font-size: 10.5pt; }
.frase { font-size: 13pt; color: #1e3a8a; background: #fef3c7; border-radius: 8px; padding: 3.5mm 5mm; border: 1.5px solid #b5a642; }
table { border-collapse: collapse; width: 100%; }
.practica { font-size: 8.5pt; margin: 3mm 0; }
.practica th, .practica td { border: 1px solid #9ca3af; padding: 1.4mm; text-align: center; vertical-align: middle; }
.practica th { background: #dbeafe; font-size: 8pt; }
.practica .dia { background: #eff6ff; width: 8mm; }
.practica td.prod { text-align: left; width: 38mm; }
.practica td.c { font-size: 10pt; font-weight: 700; }
.practica td.w { height: 12mm; width: 15mm; background: #fffbeb; }
.practica tr.vacia td { height: 12mm; }
.examen .datos { display: flex; gap: 4mm; white-space: nowrap; margin: 1mm 0 3mm; font-size: 10pt; }
.examen .datos span { flex: 1; }
.linea { display: inline-block; border-bottom: 1px solid #111827; height: 1em; vertical-align: bottom; }
.l1 { width: 46mm; } .l2 { width: 36mm; } .l3 { width: 26mm; } .l4 { width: 14mm; } .l5 { width: 55mm; } .l6 { width: 55mm; }
.preguntas { columns: 2; column-gap: 8mm; }
.preg { break-inside: avoid; margin-bottom: 1.9mm; font-size: 7.9pt; line-height: 1.26; }
.preg .enun { margin-bottom: .6mm; }
.opc { margin: 0 0 .3mm 1mm; display: flex; gap: 1.5mm; align-items: flex-start; }
.circ { flex: 0 0 2.8mm; width: 2.8mm; height: 2.8mm; border: 1.2px solid #374151; border-radius: 50%; margin-top: .5mm; }
.calif { margin-top: 3mm; border-top: 1.5px solid #b5a642; padding-top: 3mm; font-size: 10pt; }
.constancia { break-before: page; }
.constancia figure img { max-height: 75mm; }
.cons { font-size: 11.5pt; line-height: 1.9; }
.firmas { display: flex; justify-content: space-between; gap: 6mm; margin-top: 14mm; text-align: center; font-size: 9pt; }
.clave-t { font-size: 8.8pt; margin-bottom: 3mm; }
.clave-t th, .clave-t td { border: 1px solid #d1d5db; padding: 1.2mm 2mm; text-align: left; vertical-align: top; }
.clave-t th { background: #f3f4f6; }
.clave-t td.n, .clave-t td.l { width: 10mm; text-align: center; font-weight: 800; }
.clave-t td.c { text-align: center; }
`;

function buscarChrome() {
  const candidatos = [
    process.env.CHROME_PATH,
    '/opt/google/chrome/chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
  const c = candidatos.find((x) => fs.existsSync(x));
  if (!c) throw new Error('No se encontró Chrome/Chromium. Define CHROME_PATH con la ruta del ejecutable.');
  return c;
}

export function construirHtml() {
  const quiz = M.secciones.find((s) => s.id === 'quiz');
  const preguntas = preguntasImpresas(quiz.quiz);
  const cuerpo = [portadaHtml()];
  let fraseSeccion = null;
  for (const s of M.secciones) {
    if (s.id === 'quiz') {
      cuerpo.push(practicaHtml(), examenHtml(s, preguntas), constanciaHtml(s));
    } else if (s.id === 'tarjeta') cuerpo.push(tarjetaHtml(s));
    else if (s.id === 'frase') fraseSeccion = s;
    else cuerpo.push(seccionHtml(s));
  }
  if (fraseSeccion) {
    const i = cuerpo.findIndex((h) => h.includes('class="sec pagina"><h2>Hoja de práctica'));
    cuerpo.splice(i, 0, fraseHtml(fraseSeccion));
  }
  cuerpo.push(claveHtml(preguntas));
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(M.titulo)}</title><style>${CSS}</style></head><body>${cuerpo.join('\n')}</body></html>`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const html = construirHtml();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'manual-compras-'));
  const htmlPath = path.join(tmp, 'manual.html');
  fs.writeFileSync(htmlPath, html);
  const perfil = path.join(tmp, 'perfil');
  execFileSync(buscarChrome(), [
    '--headless=new', '--no-sandbox', '--disable-gpu', `--user-data-dir=${perfil}`,
    '--allow-file-access-from-files', '--no-pdf-header-footer',
    `--print-to-pdf=${SALIDA}`, pathToFileURL(htmlPath).href,
  ], { stdio: 'ignore' });
  if (process.env.GUARDAR_HTML) fs.copyFileSync(htmlPath, process.env.GUARDAR_HTML);
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`PDF generado: ${SALIDA} (${(fs.statSync(SALIDA).size / 1024).toFixed(0)} KB)`);
}
