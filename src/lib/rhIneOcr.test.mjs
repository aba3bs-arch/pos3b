import assert from 'node:assert/strict';
import {
  estadoDesdeCurp,
  extraerCurpDeTexto,
  fechaNacimientoDesdeCurp,
  fusionarDatosIneEnForm,
  parsearDomicilioVisual,
  parsearMrzIne,
  parsearNombreVisual,
  parsearTextoIne,
  rfcDesdeCurp,
} from './rhIneOcr.js';

const CURP = 'PEGJ850315HDFRRN09';
assert.equal(extraerCurpDeTexto(`CURP ${CURP}`), CURP);
assert.equal(extraerCurpDeTexto(`C U R P\n${CURP.slice(0, 9)} ${CURP.slice(9)}`), CURP);
assert.equal(fechaNacimientoDesdeCurp(CURP), '1985-03-15');
assert.equal(rfcDesdeCurp(CURP), 'PEGJ850315XXX');
assert.equal(estadoDesdeCurp(CURP), 'Ciudad de México');

const mrz = parsearMrzIne(`
IDMEX1234567890<<<<<<<<<<<<<<<
8503150H1234567MEX<<<<<<<<<<<6
PEREZ<GARCIA<<JUAN<CARLOS<<<<<
`);
assert.equal(mrz.nombre, 'JUAN CARLOS');
assert.equal(mrz.apellidos, 'PEREZ GARCIA');

const visual = parsearNombreVisual(`
INSTITUTO NACIONAL ELECTORAL
NOMBRE
PEREZ GARCIA
JUAN CARLOS
DOMICILIO
`);
assert.equal(visual.nombre, 'Juan Carlos');
assert.equal(visual.apellidos, 'Perez Garcia');

const dom = parsearDomicilioVisual(`
DOMICILIO
C MORELOS 120
COL CENTRO
44100 GUADALAJARA, JALISCO
CURP
`);
assert.match(dom.direccion, /Morelos/i);
assert.match(dom.colonia, /Centro/i);
assert.equal(dom.cp, '44100');
assert.match(dom.ciudad, /Guadalajara/i);
assert.match(dom.estado_mx, /Jalisco/i);

const parsed = parsearTextoIne(`
NOMBRE
LOPEZ MARTINEZ
ANA MARIA
DOMICILIO
AV REFORMA 50
COL JUAREZ
06600 CIUDAD DE MEXICO, CIUDAD DE MEXICO
CURP
${CURP}
`);
assert.equal(parsed.ok, true);
assert.equal(parsed.patch.curp, CURP);
assert.equal(parsed.patch.nombre, 'Ana Maria');
assert.equal(parsed.patch.apellidos, 'Lopez Martinez');
assert.equal(parsed.patch.fecha_nacimiento, '1985-03-15');
assert.equal(parsed.patch.doc_ine, true);

const merged = fusionarDatosIneEnForm(
  { nombre: 'X', telefono: '555' },
  { nombre: 'Ana', curp: CURP },
  { sobrescribir: true },
);
assert.equal(merged.nombre, 'Ana');
assert.equal(merged.telefono, '555');
assert.equal(merged.curp, CURP);

console.log('rhIneOcr.test.mjs OK');
