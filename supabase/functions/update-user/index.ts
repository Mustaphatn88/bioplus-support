import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders }
  });

const ROLES = ['admin', 'responsable', 'technicien'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  if (!token) return json({ error: 'Authentification requise.' }, 401);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } }
  );

  const { data: { user: caller }, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !caller) return json({ error: 'Session invalide.' }, 401);

  const { data: callerProfile } = await admin
    .from('profiles')
    .select('role')
    .eq('user_id', caller.id)
    .maybeSingle();
  if (callerProfile?.role !== 'admin') {
    return json({ error: "Accès réservé à l'administrateur BioPlus." }, 403);
  }

  const { user_id, action, ...params } = await req.json();
  if (!user_id) return json({ error: 'Identifiant utilisateur requis.' }, 400);

  const ACTIONS = ['role', 'laboratoire', 'password', 'ban', 'unban', 'delete', 'approve', 'email'];
  if (!ACTIONS.includes(action)) return json({ error: 'Action invalide.' }, 400);

  switch (action) {
    case 'approve': {
      const { data: target, error: targetErr } = await admin
        .from('profiles')
        .select('*')
        .eq('user_id', user_id)
        .maybeSingle();
      if (targetErr || !target) {
        return json({ error: targetErr?.message ?? 'Profil introuvable.' }, 400);
      }
      if (target.statut === 'valide') {
        return json({ error: 'Ce compte est déjà validé.' }, 400);
      }

      let laboId = params.laboratoire_id ?? null;
      if (!laboId) {
        const nom =
          target.laboratoire_nom ??
          params.laboratoire_nom ??
          'Laboratoire à renommer';
        const { data: labo, error: laboErr } = await admin
          .from('laboratoires')
          .insert({
            nom,
            ville: target.laboratoire_ville ?? null,
            adresse: target.laboratoire_adresse ?? null,
            telephone: target.laboratoire_telephone ?? null
          })
          .select('id')
          .single();
        if (laboErr) return json({ error: laboErr.message }, 500);
        laboId = labo.id;
      }

      const role = params.role ?? 'responsable';
      if (!ROLES.includes(role)) return json({ error: 'Rôle invalide.' }, 400);

      const { error: pErr } = await admin
        .from('profiles')
        .update({
          laboratoire_id: laboId,
          role,
          statut: 'valide',
          laboratoire_nom: null,
          laboratoire_ville: null,
          laboratoire_adresse: null,
          laboratoire_telephone: null
        })
        .eq('user_id', user_id);
      if (pErr) return json({ error: pErr.message }, 500);

      const { error: uErr } = await admin.auth.admin.updateUserById(user_id, {
        user_metadata: { role, laboratoire_id: laboId }
      });
      if (uErr) return json({ error: uErr.message }, 500);

      return json({ ok: true, laboratoire_id: laboId });
    }

    case 'role': {
      if (!ROLES.includes(params.role)) return json({ error: 'Rôle invalide.' }, 400);
      const { error: pErr } = await admin
        .from('profiles')
        .update({ role: params.role })
        .eq('user_id', user_id);
      if (pErr) return json({ error: pErr.message }, 500);
      const { error: uErr } = await admin.auth.admin.updateUserById(user_id, {
        user_metadata: { role: params.role }
      });
      if (uErr) return json({ error: uErr.message }, 500);
      return json({ ok: true });
    }

    case 'laboratoire': {
      const { error: pErr } = await admin
        .from('profiles')
        .update({ laboratoire_id: params.laboratoire_id ?? null })
        .eq('user_id', user_id);
      if (pErr) return json({ error: pErr.message }, 500);
      const { error: uErr } = await admin.auth.admin.updateUserById(user_id, {
        user_metadata: { laboratoire_id: params.laboratoire_id ?? null }
      });
      if (uErr) return json({ error: uErr.message }, 500);
      return json({ ok: true });
    }

    case 'password': {
      if (!params.password || params.password.length < 6) {
        return json({ error: 'Mot de passe : 6 caractères minimum.' }, 400);
      }
      const { error } = await admin.auth.admin.updateUserById(user_id, {
        password: params.password
      });
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    case 'email': {
      const email = String(params.email ?? '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return json({ error: 'Adresse email invalide.' }, 400);
      }
      const { error } = await admin.auth.admin.updateUserById(user_id, { email });
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    case 'ban': {
      const { error } = await admin.auth.admin.updateUserById(user_id, {
        ban_duration: '876000h'
      });
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    case 'unban': {
      const { error } = await admin.auth.admin.updateUserById(user_id, {
        ban_duration: 'none'
      });
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    case 'delete': {
      const { error } = await admin.auth.admin.deleteUser(user_id);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }
  }
});