import assert from 'node:assert/strict';
import { partirAlertasCancelacionRuta } from './rutaCancelaciones.js';

const pendiente = { id: 'n1', ref_id: 'c1', titulo: 'Cancelar' };
const vieja = { id: 'n2', ref_id: 'c2', titulo: 'Ya cancelada' };
const huerfana = { id: 'n3', ref_id: 'c3', titulo: 'Sin solicitud' };

const partes = partirAlertasCancelacionRuta(
  [pendiente, vieja, huerfana],
  [
    { id: 'c1', estado: 'pendiente' },
    { id: 'c2', estado: 'aprobado' },
  ],
);

assert.deepEqual(partes.vigentes.map((n) => n.id), ['n1']);
assert.deepEqual(partes.obsoletas.map((n) => n.id), ['n2', 'n3']);

console.log('rutaCancelaciones.alertas.test.mjs ok');
