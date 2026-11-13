import assert from 'node:assert/strict';
import { horaVentaAjusteRecarga } from './corteCajaRecargasMp.js';

const diurno = { id: 'diurno', hora_inicio: '07:00', hora_fin: '19:00' };
const nocturno = { id: 'nocturno', hora_inicio: '19:00', hora_fin: '07:00' };
// Nogales = UTC-7
const utc = (s) => new Date(s);

// Dentro del turno: se queda con la hora real.
const dentro = utc('2026-11-13T22:00:00Z'); // 15:00 Nogales
assert.equal(horaVentaAjusteRecarga({ turno: diurno, fecha: '2026-11-13', now: dentro }).getTime(), dentro.getTime());

// Cierre diurno a las 19:20: queda a las 18:59 (no cae en el nocturno).
const tarde = horaVentaAjusteRecarga({ turno: diurno, fecha: '2026-11-13', now: utc('2026-11-14T02:20:00Z') });
assert.equal(tarde.toISOString(), '2026-11-14T01:59:00.000Z');

// Cierre nocturno a las 07:20 del día siguiente: queda a las 06:59.
const manana = horaVentaAjusteRecarga({ turno: nocturno, fecha: '2026-11-13', now: utc('2026-11-14T14:20:00Z') });
assert.equal(manana.toISOString(), '2026-11-14T13:59:00.000Z');

// Nocturno cerrado de madrugada, dentro del turno: sin cambio.
const madrugada = utc('2026-11-14T10:00:00Z'); // 03:00 Nogales
assert.equal(horaVentaAjusteRecarga({ turno: nocturno, fecha: '2026-11-13', now: madrugada }).getTime(), madrugada.getTime());

// Sin datos suficientes: hora actual.
const ahora = utc('2026-11-13T22:00:00Z');
assert.equal(horaVentaAjusteRecarga({ turno: null, fecha: '', now: ahora }).getTime(), ahora.getTime());
console.log('recargaAjusteHora.test.mjs OK');
