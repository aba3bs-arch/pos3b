# Instructivo: cortes, recolecciones, alertas y pagaré

Guía para **recolectores** (y cajeros/admin) de cómo debe cuadrar la caja chica al recolectar, con el flujo de **DINERO EN RECUPERACIÓN** y **Pagaré**.

Aplica a **Corte Virtual** (flujo principal de caja chica + Recolectar). Garage y Abarrotes tienen variaciones; al final se resume lo diferente.

> **Tutorial ilustrado (con imágenes):** [TUTORIAL_NEGATIVOS_PAGARE_ABONOS.md](./TUTORIAL_NEGATIVOS_PAGARE_ABONOS.md) — negativos, pagaré, abonos y liquidaciones paso a paso.  
> **Tutorial Corte Abarrotes (captura real):** [TUTORIAL_CORTE_ABARROTES_NEGATIVOS.md](./TUTORIAL_CORTE_ABARROTES_NEGATIVOS.md) — también en el POS → Tutorial.

---

## Regla de oro (para que todo cuadre)

Para recolectar y dejar la **caja chica actual en $0.00**, el orden es obligatorio:

1. **Meter todos los gastos** del periodo (incluyendo **bonos** y cualquier salida de efectivo).
2. **Cerrar el corte**.
3. **Hacer la recolección** (capturar monto → **Recolectar**).

Si falta un gasto (incluido un bono pagado de caja), la caja chica **no va a cuadrar** y lo que se mande a IE / RC quedará incompleto.

> Los gastos del periodo (cierres + lo abierto desde la última recolección) se envían a IE **al recolectar**, no al cerrar turno. Por eso hay que capturarlos **antes** de recolectar.

---

## Paso a paso en tienda (Corte Virtual)

### 1. Revisar el corte abierto

Entrar a **Corte Virtual** de la tienda correcta.

Verificar:

| Campo | Qué revisar |
|---|---|
| Moneda inicial / tope | Que coincida con la operación |
| Moneda final | Conteo real en caja |
| Venta efectivo | Calculada (MI − MF) |
| Gastos del turno | Lista completa |
| Subtotal | Venta − gastos |
| Caja chica actual | Anterior + subtotal |

### 2. Capturar **todos** los gastos (incluyendo bonos)

En el panel **Gastos del turno**, registrar **todo** lo que salió de efectivo:

- Consumos, anticipos, faltantes, recargas  
- Cubre turnos / nómina empleado  
- **Bonos** pagados de caja  
- Cualquier otro egreso del periodo  

Si no se captura, al recolectar el sistema **no lo descuenta** y la caja queda descuadrada.

### 3. Revisar alerta **DINERO EN RECUPERACIÓN** (si aparece)

Alerta parpadeante en el corte cuando hay deuda (pagaré / préstamo de área) o caja en negativo.

Muestra:

- **Negativo** — lo que aún falta recuperar  
- **Recuperado** — lo que ya cubrió la venta del corte  

#### Quién hace qué

| Acción | Quién | Notas |
|---|---|---|
| **Pagaré** | Admin / Gerente / **Recolector** | Genera ticket ×2. Texto: *“Debo y pagaré…”* |
| **Abono** | Cajero / Admin / Gerente | Solo si aún hay negativo restante |
| **Liquidar** | Cajero / Admin / Gerente | Cuando el negativo ya está en $0 (venta cubrió) |
| Cubre turno | — | **Ve** la alerta, pero **no** Abono / Liquidar / Pagaré |

Importante:

- Si la venta ya cubrió el negativo, la alerta **sigue visible** hasta que el **cajero** liquide o abone en su sesión.  
- Mensaje típico: *“NEGATIVO RECUPERADO, FAVOR DE LIQUIDAR Y PAGAR PRÉSTAMO”*.  
- Cubre turno: *“EL CAJERO DEBE LIQUIDAR O ABONAR EN SU SESIÓN”*.

El recolector puede generar el **Pagaré** si procede; el cierre de la deuda lo hace el cajero (o admin/gerente).

### 4. Cerrar el corte

Botón **Cerrar corte**.

Qué hace el sistema:

- Arrastra la **caja chica actual** al siguiente turno.  
- MI del siguiente = MF de este cierre.  
- **No** manda la venta a IE.  
- Los gastos de ese turno quedan registrados en historial; el panel de gastos del nuevo corte arranca en $0.

Solo después de cerrar (con todos los gastos ya capturados) se procede a recolectar.

### 5. Recolección → caja chica en $0

1. Capturar el monto en **Recolección**.  
2. Pulsar **Recolectar** (solo admin / recolector).  

Confirmación del sistema (resumen):

- Efectivo retirado  
- Gastos del periodo van a IE (no se restan otra vez del monto aquí)  
- **Caja chica quedará en $0.00**  
- Moneda a inyectar (tope − final) para el próximo corte  

Tras confirmar:

- Caja chica = **$0.00**  
- Se imprime ticket de recolección  
- Ingresos + gastos del periodo pasan a IE / RC (a veces pendientes de aprobación ABB / FJBB / JLBB)

#### Bloqueos frecuentes

| Mensaje / situación | Qué hacer |
|---|---|
| *“Solo admin/recolector puede recolectar.”* | Usar usuario con permiso |
| *“Indique el monto a recolectar.”* | Capturar monto > 0 |
| *“No se puede recolectar: la caja chica está en negativo…”* | Recuperar / abonar / pagaré hasta salir del negativo; no forzar |
| Faltan gastos o bonos | Capturarlos **antes** de recolectar; si ya se recolectó incompleto, avisar a Contabilidad |

---

## Orden correcto vs incorrecto

### Correcto

```
Gastos completos (incl. bonos)
        ↓
   Cerrar corte
        ↓
  Recolectar → caja chica $0
```

### Incorrecto (no cuadra)

- Recolectar **sin** meter bonos u otros gastos → IE incompleto, caja no cuadra.  
- Recolectar con caja chica en **negativo** → el sistema lo bloquea.  
- Dejar la alerta de recuperación sin liquidar cuando ya se recuperó → el cajero debe **Liquidar** / **Abonar**.

---

## Dónde se consulta después

| Pantalla | Para qué |
|---|---|
| **Vales y Préstamos → Pagaré** | Seguimiento de pagarés |
| **RC Virtual → Pagaré** | Custodia / revisión contable |
| **IE VIRTUAL** | Ingresos y gastos del periodo tras recolección |
| **Inicio → Bonos {tienda}** | Bonos por recolección (incentivo calculado; distinto de un bono pagado como gasto de caja) |

> **Nota:** el panel **Bonos por recolección** (Inicio / Configuración) es el incentivo del recolector según reglas. Un **bono pagado en efectivo de la caja** sí debe ir como **gasto del corte** para que cuadre.

---

## Garage y Abarrotes (resumen)

### Garage

- También hay alerta / pagaré.  
- Recolección puede ser **definitiva** (máquinas en cero → gastos a IE) o **temporal** (gastos siguen; no va a IE).  
- Misma lógica: gastos capturados antes de recolectar en definitivo.

### Abarrotes

- Campo **Recolección (−)** baja caja chica en la fórmula.  
- Alerta y pagaré aplican igual.  
- Capturar todos los gastos del turno antes de cerrar / ajustar recolección.

---

## Checklist rápido para el recolector

- [ ] Tienda y área correctas (Virtual / Garage / Abarrotes)  
- [ ] Moneda final contada  
- [ ] **Todos** los gastos capturados, **incluyendo bonos** pagados de caja  
- [ ] Si hay **DINERO EN RECUPERACIÓN**: Pagaré si aplica; cajero abona/liquida  
- [ ] **Cerrar corte**  
- [ ] Capturar monto de **Recolección** → **Recolectar**  
- [ ] Confirmar mensaje: **Caja chica en $0.00**  
- [ ] Guardar tickets (corte / recolección / pagaré ×2 si se generó)

---

## Frase para capacitar al recolector

> Para recolectar y que todo cuadre: metan **todos** los gastos, **incluyendo los bonos**, **cierren el corte** y **después** hagan la recolección para dejar la **caja chica actual en cero**.
