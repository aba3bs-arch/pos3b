# Asistente Groq

1. En **Supabase → SQL Editor** pega **todo** `supabase/fix_asistente_groq.sql` y pulsa **Run**.
   Debe devolver una fila: `id = global`.
2. Crea una clave en [console.groq.com/keys](https://console.groq.com/keys) (gratis, sin tarjeta).
3. En el POS: **Configuración → Asistente Groq** → pega la clave → **Guardar** → **Probar conexión**.
4. Pregunta en **Ayuda → Asistente**. Debe decir **IA · Groq**.

La clave se guarda en la tabla `pos_asistente`, no en GitHub.
