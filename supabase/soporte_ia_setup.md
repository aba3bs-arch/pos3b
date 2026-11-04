# Soporte con IA (OpenAI)

El chat de Soporte responde primero con las guías del bot. Si no reconoce la duda, consulta la Edge Function `soporte-ia`. Sin la función desplegada, el chat sigue igual que antes.

## Activarlo

1. Secret en Supabase → Edge Functions → Secrets: `OPENAI_API_KEY` (opcional `SOPORTE_IA_MODEL`, por defecto `gpt-4o-mini`).
2. Desplegar con la CLI, porque el filtro vive en `supabase/functions/_shared`:

```
supabase functions deploy soporte-ia --no-verify-jwt
```

## Seguridad

- Las preguntas para robar, evadir, manipular, pedir claves ajenas, subir privilegios o cambiar las reglas de la IA se bloquean y no llegan a OpenAI (`_shared/soporteSeguridad.js`).
- La IA solo recibe guías de manual de los módulos que el usuario tiene (privilegios reales). Nunca recibe PIN, datos ni código.
- Cada pregunta bloqueada queda en Auditoría como evento de Seguridad; la tercera en 24 h se marca crítica.
- La respuesta de la IA se revisa antes de mostrarse. Si falla algo, se muestra el aviso de solicitud abierta.
