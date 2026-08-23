import assert from 'node:assert/strict';
import { evaluacionCompaneroChecklist } from './checklistOperativo.js';

function mapa(estados) {
  const m = {};
  for (const [codigo, estado] of Object.entries(estados)) {
    m[codigo] = { estado };
  }
  return m;
}

// Sin respuestas → 0% rojo (pésimo)
{
  const e = evaluacionCompaneroChecklist({});
  assert.equal(e.pct, 0);
  assert.equal(e.nivel, 'rojo');
  assert.equal(e.etiqueta, 'pésimo');
  assert.equal(e.label, 'evaluación del compañero');
}

// ≤40% rojo
{
  // 37 items total; 14 ok ≈ 38%
  const estados = {};
  for (let i = 0; i < 14; i += 1) {
    const sec = Math.floor(i / 5) + 1;
    const n = (i % 5) + 1;
    estados[`${sec}.${n}`] = 'ok';
  }
  // Force known codes from plantilla
  const e = evaluacionCompaneroChecklist(mapa({
    '1.1': 'ok', '1.2': 'ok', '1.3': 'ok',
    '2.1': 'ok', '2.2': 'ok', '2.3': 'ok', '2.4': 'ok',
    '3.1': 'ok', '3.2': 'ok', '3.3': 'ok', '3.4': 'ok',
    '3.5': 'ok', '3.6': 'ok', '4.1': 'ok',
  }));
  assert.ok(e.pct <= 40, `esperado ≤40, got ${e.pct}`);
  assert.equal(e.nivel, 'rojo');
}

// 41–80 amarillo (≈50%: 19/37)
{
  const estados = {
    '1.1': 'ok', '1.2': 'ok', '1.3': 'ok',
    '2.1': 'ok', '2.2': 'ok', '2.3': 'ok', '2.4': 'ok',
    '3.1': 'ok', '3.2': 'ok', '3.3': 'ok', '3.4': 'ok', '3.5': 'ok', '3.6': 'ok',
    '4.1': 'ok', '4.2': 'ok', '4.3': 'ok', '4.4': 'ok', '4.5': 'ok',
    '5.1': 'ok',
  };
  const e = evaluacionCompaneroChecklist(mapa(estados));
  assert.ok(e.pct >= 41 && e.pct <= 80, `esperado 41-80, got ${e.pct}`);
  assert.equal(e.nivel, 'amarillo');
  assert.equal(e.etiqueta, 'regular');
}

// 81–100 verde: casi todos ok
{
  const estados = {};
  const codigos = [
    '1.1', '1.2', '1.3',
    '2.1', '2.2', '2.3', '2.4',
    '3.1', '3.2', '3.3', '3.4', '3.5', '3.6',
    '4.1', '4.2', '4.3', '4.4', '4.5',
    '5.1', '5.2', '5.3', '5.4', '5.6',
    '6.1', '6.2', '6.3', '6.4', '6.5',
    '7.1', '7.2', '7.3', '7.4', '7.5',
    '8.1', '8.2', '8.3', '8.4', '8.5',
  ];
  for (const c of codigos) estados[c] = 'ok';
  const e = evaluacionCompaneroChecklist(mapa(estados));
  assert.equal(e.pct, 100);
  assert.equal(e.nivel, 'verde');
  assert.equal(e.etiqueta, 'excelente');
  assert.equal(e.color, '#2e7d32');
}

console.log('checklistEvaluacionCompanero.test.mjs ok');
