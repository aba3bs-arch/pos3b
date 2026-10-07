import assert from 'node:assert/strict';
import { distanciaLevenshtein, nombresMismaPersona } from './empleadosVisibles.js';

assert.equal(distanciaLevenshtein('geovani', 'giovani'), 1);

// Caso real Angel (screenshot Usuarios): typo + acento
assert.equal(
  nombresMismaPersona('Angel Geovani Garduño Pelayo', 'Ángel giovani Garduño Pelayo'),
  true,
);

assert.equal(nombresMismaPersona('Angel', 'Ángel'), true);
assert.equal(nombresMismaPersona('Gonzalo', 'Gonzalo Leal'), true);
assert.equal(nombresMismaPersona('Sandra Lourdes', 'Sandra Lourdes Martinez'), true);

// No fusionar personas distintas con mismo primer nombre
assert.equal(nombresMismaPersona('Juan Carlos Perez', 'Juan Carlos Lopez'), false);
assert.equal(nombresMismaPersona('Maria Lopez', 'Maria Garcia'), false);

console.log('empleadosVisibles.nombresMismaPersona.test.mjs OK');
