/**
 * Edge Function: envía Web Push (VAPID) a todas las suscripciones Admin/Gerente.
 *
 * Secrets en Supabase → Edge Functions → Secrets:
 *   VAPID_PUBLIC_KEY
 *   VAPID_PRIVATE_KEY
 *   VAPID_SUBJECT=mailto:admin@tu-dominio.com
 *   SUPABASE_URL (auto)
 *   SUPABASE_SERVICE_ROLE_KEY (auto en hosted)
 */
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  try {
    const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY') || '';
    const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY') || '';
    const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:pos@abarrotes3b.local';
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    if (!vapidPublic || !vapidPrivate) {
      return json({ ok: false, error: 'Faltan secrets VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY.' }, 500);
    }
    if (!supabaseUrl || !serviceKey) {
      return json({ ok: false, error: 'Falta SUPABASE_URL o SERVICE_ROLE_KEY.' }, 500);
    }

    const body = await req.json().catch(() => ({}));
    const titulo = String(body.titulo || 'POS 3B').slice(0, 120);
    const mensaje = String(body.mensaje || '').slice(0, 240);
    const id = body.id != null ? String(body.id) : null;
    const tipo = body.tipo != null ? String(body.tipo) : null;

    webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

    const sb = createClient(supabaseUrl, serviceKey);
    const { data: subs, error } = await sb
      .from('pos_push_subscriptions')
      .select('id, endpoint, p256dh, auth, rol');

    if (error) {
      return json({ ok: false, error: error.message }, 500);
    }

    const lista = (subs || []).filter((s) => {
      const r = String(s.rol || '').toLowerCase();
      // Sin rol: permitir (dispositivos antiguos); con rol: solo admin/gerente
      if (!r) return true;
      return r.includes('admin') || r.includes('gerente');
    });

    const payload = JSON.stringify({
      titulo,
      mensaje,
      id,
      tipo,
      tag: id ? `pos3b-${id}` : `pos3b-${Date.now()}`,
    });

    let enviados = 0;
    const eliminados = [];
    const fallos = [];

    for (const s of lista) {
      const subscription = {
        endpoint: s.endpoint,
        keys: { p256dh: s.p256dh, auth: s.auth },
      };
      try {
        await webpush.sendNotification(subscription, payload, {
          TTL: 60 * 60 * 12,
          urgency: 'high',
        });
        enviados += 1;
      } catch (e) {
        const status = e?.statusCode || e?.status;
        if (status === 404 || status === 410) {
          eliminados.push(s.id);
        } else {
          fallos.push({ id: s.id, error: String(e?.message || e) });
        }
      }
    }

    if (eliminados.length) {
      await sb.from('pos_push_subscriptions').delete().in('id', eliminados);
    }

    return json({
      ok: true,
      enviados,
      total: lista.length,
      eliminados: eliminados.length,
      fallos: fallos.length,
    });
  } catch (e) {
    return json({ ok: false, error: String(e?.message || e) }, 500);
  }
});

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
