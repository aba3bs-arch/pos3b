# Tutorial: Negativos, Pagaré, Abonos y Liquidaciones

Guía ilustrada para cajeros, recolectores, gerentes y administradores.

Aplica en **Corte Virtual**, **Corte Abarrotes** y **Corte Garage**.  
Documento hermano (sin imágenes): [INSTRUCTIVO_CORTES_RECOLECCIONES_ALERTAS.md](./INSTRUCTIVO_CORTES_RECOLECCIONES_ALERTAS.md).

---

## 1. El mapa completo

Cuando la caja o una deuda queda en rojo, el flujo correcto es:

1. Aparece la alerta **DINERO EN RECUPERACIÓN** (Negativo).
2. Si hace falta formalizar la deuda → **Pagaré** (2 tickets).
3. Si aún falta dinero → **Abono** (pago parcial).
4. Cuando ya se recuperó todo → **Liquidar** (cierra la alerta).

![Flujo Negativo → Pagaré → Abono → Liquidar](./img/tutorial-negativos/tutorial-01-flujo-negativos.png)

> **Nota:** esto es el *negativo de dinero* (caja / deuda).  
> El *inventario negativo* (stock &lt; 0 en Productos) es otro tema: solo lo ve el Administrador y se corrige con ajuste de inventario, no con pagaré.

---

## 2. Qué es el “Negativo”

En el corte verás una alerta parpadeante cuando:

- hay un **pagaré** o **préstamo de área** abierto, o  
- la **caja chica** está en negativo.

Muestra dos cifras:

| Campo | Significado |
|---|---|
| **Negativo** | Lo que **aún falta** recuperar |
| **Recuperado** | Lo que **ya cubrió** la venta del corte |

![Alerta DINERO EN RECUPERACIÓN con negativo pendiente](./img/tutorial-negativos/tutorial-02-alerta-dinero-recuperacion.png)

### Cómo bajar el negativo

La **venta del corte** (efectivo) va reduciendo el negativo sola.  
No necesitas hacer nada especial mientras cobras: cada venta suma a **Recuperado** y baja **Negativo**.

---

## 3. Quién hace qué

![Tabla de roles: quién puede Pagaré, Abono y Liquidar](./img/tutorial-negativos/tutorial-04-roles-quien-hace-que.png)

| Acción | Cajero | Admin / Gerente | Recolector | Cubre turno |
|---|---|---|---|---|
| Ver la alerta | Sí | Sí | Sí | Sí |
| **Pagaré** | No | Sí | Sí | No |
| **Abono** | Sí | Sí | No (en corte) | No |
| **Liquidar** | Sí | Sí | No (en corte) | No |

**Regla clave:** el cubre turno *ve* la alerta, pero **no** puede Abonar, Liquidar ni generar Pagaré. Debe esperar al cajero (o a admin/gerente).

---

## 4. Generar un Pagaré

Usa **Pagaré** cuando hay que dejar constancia formal del dinero pendiente (caja en negativo o deuda a recuperar).

![Ejemplo de ticket Pagaré](./img/tutorial-negativos/tutorial-06-pagare-ticket.png)

### Pasos

1. Entra a **Corte Virtual** (o Garage / Abarrotes) de la tienda correcta.
2. Si aparece **DINERO EN RECUPERACIÓN**, pulsa el botón dorado **Pagaré**.
3. Confirma el monto en el cuadro de diálogo.
4. El sistema:
   - registra el pagaré en **Vales y Préstamos → Pagaré**
   - lo deja visible en **Contabilidad → RC Virtual → Pagaré**
   - imprime **2 tickets** (*“Debo y pagaré la cantidad de…”*)

### Importante

- Generar el pagaré **no liquida** la deuda: solo la documenta.  
- Después hay que **Abonar** o **Liquidar** cuando se recupere el dinero.  
- Folio típico: `PAG-YYYYMMDD-xxxx`.

### Alta / seguimiento sin estar en el corte

Menú → **Vales y Préstamos** → pestaña **Pagaré**  
→ formulario (Área, Monto, Cajero, Turno) → **Generar pagaré (2 tickets)**  
→ botones **Abonar** / **Liquidar** / **Reimprimir ×2**.

---

## 5. Abono (pago parcial)

Usa **Abono** cuando todavía hay **Negativo &gt; $0** y quieres registrar un pago parcial (o el monto que indiques).

![Comparación Abono vs Liquidar](./img/tutorial-negativos/tutorial-05-abono-vs-liquidar.png)

### Pasos desde el corte

1. En la alerta, con Negativo restante, pulsa **Abono**.
2. Captura el monto en el prompt.
3. El saldo baja. Si el abono deja el saldo en $0, el documento se liquida solo.

### También puedes abonar en

| Documento | Ruta | Botón |
|---|---|---|
| Pagaré | **Vales y Préstamos → Pagaré** | **Abonar** |
| Préstamo área / sucursal | **Vales y Préstamos → Préstamos área / sucursal** | **Abonar** |
| Vale | **Vales y Préstamos → Vales** | **Abonar** |
| RIF | **Vales y Préstamos → RIF** | **Abonar** |
| Préstamo empleado | **Vales y Préstamos → Préstamos empleados** | **Abonar** |

---

## 6. Liquidar (cerrar la deuda)

Usa **Liquidar** cuando el **Negativo ya está en $0** (la venta recuperó el dinero) pero la alerta sigue visible.

![Alerta con negativo recuperado y botón Liquidar](./img/tutorial-negativos/tutorial-03-negativo-recuperado-liquidar.png)

### Pasos

1. Verás la leyenda verde:  
   **NEGATIVO RECUPERADO, FAVOR DE LIQUIDAR Y PAGAR PRÉSTAMO**  
   (si es cubre turno: *…EL CAJERO DEBE LIQUIDAR O ABONAR EN SU SESIÓN*).
2. Entra con sesión de **cajero**, **admin** o **gerente**.
3. Pulsa **Liquidar** y confirma.
4. La alerta desaparece. **No** se imprime ticket nuevo.

### Abono vs Liquidar (resumen)

| | **Abono** | **Liquidar** |
|---|---|---|
| Cuándo | Negativo &gt; $0 | Negativo = $0 y aún hay deuda pendiente |
| Monto | El que indiques (parcial o total) | Todo el saldo / lo recuperado |
| Efecto | Baja el saldo | Cierra el documento y quita la alerta |
| Ticket | No (desde corte) | No |

---

## 7. Orden correcto en tienda

```
1. Capturar TODOS los gastos del turno (incl. bonos pagados de caja)
2. Atender DINERO EN RECUPERACIÓN
      ├─ Pagaré (si hace falta documentar)
      ├─ Abono (si aún falta)
      └─ Liquidar (cuando Negativo = $0)
3. Cerrar corte
4. Recolectar → caja chica en $0.00
```

### Errores frecuentes

| Situación | Qué hacer |
|---|---|
| Recolectar con caja en negativo | El sistema lo **bloquea**. Abona / recupera / genera pagaré primero. |
| Negativo ya en $0 pero la alerta sigue | El **cajero** debe pulsar **Liquidar**. |
| Cubre turno no ve botones | Normal. Solo puede ver; liquidar/abonar el cajero. |
| Generaron pagaré y creen que ya está cerrado | Falso. Falta Abonar o Liquidar. |

---

## 8. Checklist rápido

- [ ] Tienda y área correctas (Virtual / Garage / Abarrotes)
- [ ] Revisar alerta **DINERO EN RECUPERACIÓN**
- [ ] Si hay que documentar: **Pagaré** ×2 tickets
- [ ] Si falta dinero: **Abono**
- [ ] Si Negativo = $0: **Liquidar**
- [ ] Cerrar corte → Recolectar → caja chica **$0.00**
- [ ] Guardar tickets (corte / recolección / pagaré)

---

## 9. Dónde consultar después

| Pantalla | Para qué |
|---|---|
| **Vales y Préstamos → Pagaré** | Seguimiento, abonar, liquidar, reimprimir |
| **Contabilidad → RC Virtual → Pagaré** | Custodia / revisión contable |
| **Incidencias → Pendientes** | Aprobaciones de vales / préstamos (otro flujo) |

---

## Frase para capacitar

> Si hay negativo: documenta con **Pagaré**, recupera con la venta o con **Abono**, y cuando el Negativo llegue a **$0**, el cajero debe **Liquidar** para quitar la alerta. Sin liquidar, la alerta no se va.
