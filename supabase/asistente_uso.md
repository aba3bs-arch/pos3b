# Asistente de uso (opcional, IA)

La app ya responde en **Ayuda → Asistente** con el manual local. No hace falta ninguna clave.

Si quieres respuestas redactadas por IA (mismo manual, más naturales):

1. Crea una clave gratis en [Groq](https://console.groq.com/keys) (o usa OpenAI).
2. En **Supabase → Edge Functions → Secrets** agrega:
   - `GROQ_API_KEY`  **o**
   - `OPENAI_API_KEY`
3. Despliega la función:

```bash
supabase functions deploy asistente-uso
```

4. Activa la llamada a la nube en el front (hace falta rebuild o config runtime):

```
VITE_ASISTENTE_IA=1
```

o en `public/pos3b-config.js`:

```js
window.__POS3B_CONFIG__ = {
  url: '...',
  anonKey: '...',
  asistenteIa: true,
};
```

Sin ese interruptor, el chat no espera a la función (evita demoras si aún no está desplegada). Con IA, la etiqueta del mensaje es **IA · manual POS**.

La clave **no** va en `VITE_*`: iría pública en el navegador.
