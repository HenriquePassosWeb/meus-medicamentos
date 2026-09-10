// ===== Cliente Supabase =====
// Cria a instância única do Supabase usada por auth.js e store.js.
// A biblioteca é carregada via CDN no index.html (window.supabase).
//
// A publishable key é PÚBLICA por natureza (pode ficar no frontend). A segurança
// real vem das policies de RLS no banco — ver supabase/schema.sql.
//
// Verificação de e-mail: ATIVA no painel. Após o cadastro, o usuário precisa
//   confirmar o e-mail pelo link antes de entrar (tratado em auth.js/views.js).
(function (global) {
  'use strict';

  const SUPABASE_URL = 'https://zfvlvhqwrbarrtztophk.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_NxuKgsHGFlZCAdabhRTo7Q_pHL2tRl4';

  if (!global.supabase || typeof global.supabase.createClient !== 'function') {
    console.error(
      'Biblioteca do Supabase não encontrada. ' +
      'Verifique se o <script> do @supabase/supabase-js está antes de supabaseClient.js no index.html.'
    );
    return;
  }

  const client = global.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  global.supabaseClient = client;
})(window);
