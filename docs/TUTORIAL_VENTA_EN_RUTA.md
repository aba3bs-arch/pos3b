# Tutorial Venta en Ruta

Guía en la app: menú **Tutorial** → *Venta en Ruta: de la carga al corte*.

También: **Venta en Ruta → Ver tutorial** (hub).

Incluye diagramas en `/public/tutorial-venta-ruta/*.svg` y evaluación final calificada (A–F; aprueba desde 70%).

## Pasos (actualizado)

1. Mapa del flujo (mercancía + vía servicios) — `01-mapa-flujo.svg`
2. Camiones — `02-camiones.svg`
3. Carga de camión (ticket + registro) — `03-carga-camion.svg`
4. Precios de ruta — `04-precios-ruta.svg`
5. POS · sesión vendedor — `05-pos-sesion.svg`
6. POS · destino, catálogo y cobro — `06-pos-venta.svg`
7. Preinventario — `07-preinventario.svg`
8. Créditos por pagar **por tienda** (ruta + Recolecciones, sync al abrir) — `08-creditos.svg`
9. Consultas (Eliminar ingreso · Créditos por tienda · sin Limpiar) — `09-consultas.svg`
10. Cobro servicios · RC · Tesorería — `13-servicios-rc.svg`
11. Corte y RC mercancía (Pendientes ≠ RC Servicios) — `10-corte-liquidacion.svg`
12. Errores típicos — `11-errores.svg`
13. Evaluación (8 preguntas) — `12-evaluacion.svg`
14. Frase para capacitar

Contenido: `src/content/tutorialVentaEnRuta.js`

Tutorial hermano: **Cobro de servicios hasta Tesorería** (`tutorialCobroServicios.js`).
