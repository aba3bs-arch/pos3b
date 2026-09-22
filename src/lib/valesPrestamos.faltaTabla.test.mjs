import assert from 'node:assert/strict';
import { faltaTablaVales, faltaTablaPrestamos } from './valesPrestamos.js';

// Tabla realmente ausente
assert.equal(faltaTablaVales({ code: '42P01', message: 'relation "public.vales" does not exist' }), true);
assert.equal(faltaTablaVales({ code: 'PGRST205', message: "Could not find the table 'public.vales' in the schema cache" }), true);
assert.equal(
  faltaTablaVales({ message: "Could not find the table 'public.vales' in the schema cache" }),
  true,
);

// Columna faltante ≠ tabla faltante (antes disparaba el aviso falso)
assert.equal(
  faltaTablaVales({
    message: "Could not find the 'detalle' column of 'vales' in the schema cache",
  }),
  false,
);
assert.equal(
  faltaTablaVales({
    code: 'PGRST204',
    message: "Could not find the 'subcategoria' column of 'vales' in the schema cache",
  }),
  false,
);

// No confundir vales_categorias con vales
assert.equal(
  faltaTablaVales({ message: "Could not find the table 'public.vales_categorias' in the schema cache" }),
  false,
);

assert.equal(faltaTablaPrestamos({ code: '42P01', message: 'relation "prestamos" does not exist' }), true);
assert.equal(
  faltaTablaPrestamos({
    message: "Could not find the 'omitir_corte' column of 'prestamos' in the schema cache",
  }),
  false,
);

console.log('valesPrestamos.faltaTabla.test.mjs ok');
