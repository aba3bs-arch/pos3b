import assert from 'node:assert/strict';
import { esErrorCargaChunk, resumenErrorPantalla } from '../lib/errorPantalla.js';

assert.equal(esErrorCargaChunk(new Error('Failed to fetch dynamically imported module: /assets/x.js')), true);
assert.equal(esErrorCargaChunk(new Error('Loading chunk 5 failed')), true);
assert.equal(esErrorCargaChunk(new Error("Cannot read properties of undefined (reading 'map')")), false);

const r = resumenErrorPantalla(new Error('boom'), { componentStack: '\n at A\n at B' });
assert.equal(r.mensaje, 'boom');
assert.ok(r.componentes.includes('at A'));
console.log('errorPantalla.test.mjs ok');
