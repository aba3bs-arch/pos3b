/**
 * Genera el PDF imprimible del manual de capacitación del Libro diario.
 *
 *   node docs/manual-capacitacion-libro-diario/generar-pdf.mjs
 *
 * Requiere Google Chrome / Chromium (se busca en rutas comunes o en la variable CHROME_PATH).
 * Reutiliza estilos y globos de diálogo del manual de compras.
 * Salida: docs/manual-capacitacion-libro-diario/Manual_Capacitacion_Libro_Diario_Las3B.pdf
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { MANUAL_LIBRO_DIARIO as M, PRACTICAS, resolverPractica } from './contenido.mjs';
import {
  CSS as CSS_BASE, LETRAS, esc, inline, avatar, preguntasImpresas, dialogoHtml, tarjetaHtml, fraseHtml, examenHtml, buscarChrome,
} from '../manual-capacitacion-compras/generar-pdf.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const SALIDA = path.join(DIR, 'Manual_Capacitacion_Libro_Diario_Las3B.pdf');
const img = (rel) => pathToFileURL(path.join(DIR, rel)).href;
const dinero = (n) => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const CSS = `${CSS_BASE.replace('Las 3B · Manual de capacitación de compras', 'Las 3B · Manual de capacitación del Libro diario')}
.practica td.m { font-size: 9.5pt; font-weight: 700; }
`;

function seccionHtml(s) {
  const partes = [`<h2>${esc(s.titulo)}</h2>`];
  for (const l of s.cuerpo || []) partes.push(`<p>${inline(l)}</p>`);
  if (s.imagen) partes.push(`<figure><img src="${img(s.imagen)}" alt=""><figcaption>${esc(s.imagenAlt || '')}</figcaption></figure>`);
  if (s.dialogo?.length) partes.push(dialogoHtml(s.dialogo));
  if (s.notas?.length) partes.push(`<div class="nota">${s.notas.map((n) => `<p>${inline(n)}</p>`).join('')}</div>`);
  return `<section class="sec sec-${s.id}">${partes.join('')}</section>`;
}

function portadaHtml() {
  const cast = [
    ['Beto', 'Gerente de Las 3B. Revisa que los números cuadren.'],
    ['Lulú', 'Contabilidad y compras en Las 3B. Pregunta lo que todos quieren saber.'],
    ['Ángel', 'Cajero de turno invitado. Cierra su turno cada día.'],
    ['Chispita', 'Proveedora invitada. Sus compras aparecen como gasto.'],
  ];
  return `<section class="portada">
    <div class="marca">LAS 3B · CAPACITACIÓN DE PERSONAL</div>
    <h1>Cómo leer el Libro diario</h1>
    <p class="sub">Manual del módulo <strong>Contabilidad → Libro diario</strong>: qué entró, qué salió, cómo cuadra la caja con el ticket y qué es lo informativo.</p>
    <figure><img src="${img('imagenes/01-portada.jpg')}" alt=""></figure>
    <div class="elenco">${cast.map(([n, d]) => `<div>${avatar(n)}<span><strong>${n}</strong><br>${d}</span></div>`).join('')}</div>
    <p class="pie-portada">Los personajes son ilustraciones originales. Los ejemplos con números son ficticios; los pasos, botones y columnas corresponden al módulo Libro diario.</p>
  </section>`;
}

function practicaHtml() {
  const filas = PRACTICAS.map((c, i) => `<tr>
      <td class="prod"><strong>${i + 1}. ${esc(c.producto)}</strong><br><span class="muted">${esc(c.nota)}</span></td>
      <td class="c">${dinero(c.venta)}</td><td class="c">${dinero(c.tarjeta)}</td><td class="c">${dinero(c.tarjetaPos)}</td>
      <td class="c">${dinero(c.gastos)}</td><td class="c">${dinero(c.cajaAnterior)}</td>
      <td class="w"></td><td class="w"></td><td class="w"></td><td class="w"></td><td class="w"></td>
    </tr>`).join('');
  return `<section class="sec pagina"><h2>Hoja de práctica: calcula el libro del día</h2>
    <p>Para cada tienda completa las columnas en blanco con las fórmulas del manual y compara con la clave del instructor. Si el resultado sale negativo o la caja queda en negativo, <strong>escribe el signo</strong>: no es un error del ejercicio.</p>
    <table class="practica">
      <thead><tr>
        <th rowspan="2">Tienda</th>
        <th colspan="5">Datos del día</th>
        <th colspan="5">Tu cálculo</th>
      </tr><tr>
        <th>Venta total</th><th>Tarjeta (corte)</th><th>Tarjeta en POS</th><th>Gastos</th><th>Caja anterior</th>
        <th>Entró<br><small>venta − tarjeta</small></th>
        <th>Resultado<br><small>Entró − gastos</small></th>
        <th>Caja al cerrar<br><small>anterior + Entró − gastos</small></th>
        <th>PCT ABA<br><small>menor de corte y POS</small></th>
        <th>PCT VIRTUAL<br><small>corte − PCT ABA</small></th>
      </tr></thead>
      <tbody>${filas}</tbody>
    </table>
    <div class="nota"><p><strong>Recuerda:</strong> Entró es la venta en efectivo (venta total − tarjeta). Los <strong>gastos</strong> ya incluyen faltantes y créditos cobrados. PCT ABA nunca es mayor que la tarjeta del corte; lo que sobra del corte es PCT VIRTUAL. La venta en vivo, los gastos sin corte y los otros egresos de IE <strong>no</strong> entran en estos cálculos.</p></div>
  </section>`;
}

function constanciaHtml(s) {
  return `<section class="sec constancia"><h2>Constancia de capacitación</h2>
    <figure><img src="${img(s.imagen)}" alt=""></figure>
    <p class="cons">Se hace constar que <i class="linea l5"></i> de la tienda <i class="linea l2"></i> completó la capacitación <strong>«Cómo leer el Libro diario»</strong> de Contabilidad de Las 3B, con calificación de <i class="linea l4"></i> %.</p>
    <div class="firmas"><span><i class="linea l6"></i><br>Firma del colaborador</span><span><i class="linea l6"></i><br>Firma del instructor / encargado</span><span><i class="linea l3"></i><br>Fecha</span></div>
  </section>`;
}

function claveHtml(preguntas) {
  const filas = preguntas
    .map((q, i) => `<tr><td class="n">${i + 1}</td><td class="l">${q.correctaLetra}</td><td>${inline(q.explicacion)}</td></tr>`)
    .join('');
  const prac = PRACTICAS.map((c, i) => {
    const r = resolverPractica(c);
    return `<tr><td class="n">${i + 1}</td><td>${esc(c.producto)}</td><td class="c">${dinero(r.entro)}</td><td class="c">${dinero(r.resultado)}</td><td class="c"><strong>${dinero(r.cajaCierre)}</strong></td><td class="c">${dinero(r.pctAba)}</td><td class="c">${dinero(r.pctVirtual)}</td></tr>`;
  }).join('');
  const aciertos = Math.ceil(preguntas.length * 0.7 - 1e-9);
  return `<section class="sec pagina clave"><h2>Clave de respuestas · solo para el instructor</h2>
    <p class="muted">Separa esta hoja antes de entregar el manual al personal.</p>
    <h3>Evaluación final</h3>
    <table class="clave-t"><thead><tr><th>#</th><th>Resp.</th><th>Por qué</th></tr></thead><tbody>${filas}</tbody></table>
    <h3>Hoja de práctica</h3>
    <table class="clave-t"><thead><tr><th>#</th><th>Tienda</th><th>Entró</th><th>Resultado</th><th>Caja al cerrar</th><th>PCT ABA</th><th>PCT VIRTUAL</th></tr></thead><tbody>${prac}</tbody></table>
    <p class="muted">Práctica 2: Entró es $0 porque todo se cobró con tarjeta; el resultado y la caja salen negativos y no es un error. Cada pregunta vale ${(100 / preguntas.length).toFixed(1)}%. Se aprueba con ${aciertos} aciertos o más (${Math.round((aciertos / preguntas.length) * 100)}%); con ${aciertos - 1} o menos, repasa y repite.</p>
  </section>`;
}

export function construirHtml() {
  const quiz = M.secciones.find((s) => s.id === 'quiz');
  const preguntas = preguntasImpresas(quiz.quiz);
  const cuerpo = [portadaHtml()];
  let fraseSeccion = null;
  for (const s of M.secciones) {
    if (s.id === 'quiz') cuerpo.push(practicaHtml(), examenHtml(s, preguntas), constanciaHtml(s));
    else if (s.id === 'tarjeta-bolsillo') cuerpo.push(tarjetaHtml(s));
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
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'manual-libro-'));
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
