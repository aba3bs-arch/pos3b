# Manual: Panel RT, gastos y recolecciones

> **Cortes en tienda (caja chica, cerrar corte, Recolectar, alertas y pagaré):** ver  
> [`INSTRUCTIVO_CORTES_RECOLECCIONES_ALERTAS.md`](./INSTRUCTIVO_CORTES_RECOLECCIONES_ALERTAS.md).

## Qué es la cuenta RT

Las **cuentas RT** son el efectivo ya entregado en oficina y acreditado a:

| Cuenta en sistema | Etiqueta de origen en gastos |
|---|---|
| Francisco | **Cuenta FJBB** |
| Andrés | **Cuenta AMR** |

El saldo de cada cuenta es:

```
disponible = liquidaciones + transferencias recibidas − transferencias enviadas − gastos de cuenta
```

Ese saldo **no** baja cuando el recolector acepta un gasto en ruta. Baja cuando:

1. Registras un **gasto desde cuenta RT**, o
2. Haces una **transferencia** entre Francisco y Andrés.

---

## El negativo de $6,376 (explicación)

En Panel RT → Cuentas se veía algo como:

```
Recolectado en tránsito   $8,292
− gastos históricos       $14,668
= neto                    −$6,376
```

**Causa:** el panel restaba **todos** los gastos ya aceptados por Luis (Smoking, Marlboro, nómina, etc.), aunque esas liquidaciones de mercancía **ya se habían sellado** el 27-jul. Esos gastos ya no debían restar.

**¿Afectaba de verdad a liberar / liquidar?**  
En la operación real de liberación, **no**: el sistema solo descuenta gastos “activos” (aceptados **después** de la última liquidación y sin sello `LIQ_APLICADA`). En ese momento los gastos activos reales eran **$0**.

**Qué se corrigió:**

1. El neto en tránsito solo resta **gastos activos**.
2. Al abrir Cuentas RT se **sellan** gastos huérfanos viejos para que no vuelvan a aparecer.
3. Si al liberar los gastos se comen toda la mercancía, igual se sellan (ya no quedan pegados).

Tras actualizar, el neto debe verse cercano a solo el efectivo en tránsito (sin el −6,376 fantasma).

---

## Ciclo de un gasto del recolector

1. **Contabilidad → Panel RT → Gastos**  
   Autorizas monto + descripción + **origen** (Cuenta FJBB / Cuenta AMR o una tienda).
2. El gasto queda **Por Aceptar**.
3. El recolector entra a **Recolecciones → Gastos**, pone su PIN y **acepta**.
4. El gasto pasa a **Liquidado** (aceptado), pero **aún no** se descuenta de la cuenta Francisco/Andrés.
5. Al **liberar** o hacer **Liquidación recolecciones**, el gasto se aplica al neto de mercancía y se sella (`LIQ_APLICADA`). Ya no vuelve a restar.

### Importante

| Momento | ¿Resta del dinero del recolector? | ¿Resta de cuenta Francisco/Andrés? |
|---|---|---|
| Autorizar gasto | No (solo reserva lógica al liberar) | No |
| Aceptar con PIN | No en pantalla del recolector | No |
| Liberar / liquidar en oficina | Sí (baja el neto a entregar) | Solo se acredita el **neto** (mercancía − gastos + servicios) |

Una **recolección en tienda** (pickup) **no** cierra gastos. Eso es a propósito: el gasto vive hasta la entrega en oficina.

---

## Origen del gasto (FJBB / AMR)

Al autorizar un gasto ya no dice “Oficina”. Debes elegir:

- **Cuenta FJBB** — sale del flujo / caja asociada a Francisco  
- **Cuenta AMR** — sale del flujo / caja asociada a Andrés  
- o una **tienda** concreta, si el gasto se imputa a esa sucursal

El origen queda guardado en `sucursal_origen` del movimiento para reportes.

---

## Liberar efectivo (paso a paso)

1. Panel RT → pestaña **Gastos / liberar**.  
2. Elige recolector.  
3. Revisa:
   - En tránsito (recolecciones + servicios)
   - Gastos aceptados activos
   - **A liberar / acreditar** (neto)
4. Elige cuenta RT para **mercancía** y para **servicios**.  
5. **Liberar neto**.

El dinero entra a las cuentas Francisco/Andrés. Los gastos activos de ese corte se sellan.

---

## Gasto directo desde cuenta RT

En **Cuentas RT → Registrar gasto desde cuenta RT**:

- Descuenta ya del **disponible** de Francisco o Andrés.
- No pasa por el PIN del recolector.
- Sirve para egresos de oficina / cuenta (gasolina pagada desde caja RT, etc.).

---

## Checklist si el neto se ve raro

1. Actualiza la app (Ctrl+F5) y abre de nuevo **Cuentas RT**.  
2. Confirma cuántos **gastos activos** muestra (no históricos).  
3. Si un gasto “viejo” sigue restando tras una liquidación, avisa a sistemas: debería haberse sellado solo.  
4. No borres gastos a mano: usa cancelar solo si aún están **Por Aceptar**.

---

## Resumen para Francisco

- El −$6,376 era un **error de pantalla**: restaba gastos ya viejos.  
- **No** debía impedir recolecciones en tienda.  
- **Sí** confundía el neto a liberar en el panel.  
- Ya corregido: solo restan gastos activos; los huérfanos se sellan.  
- Al autorizar gastos, el origen debe ser **Cuenta FJBB** o **Cuenta AMR** (no “Oficina”).
