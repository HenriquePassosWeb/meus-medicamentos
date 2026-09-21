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

  // IMPORTANTE: Capturamos o hash ANTES de criar o cliente Supabase.
  // O Supabase com detectSessionInUrl=true processa e LIMPA o hash durante
  // a criação do cliente. Se não capturarmos antes, perdemos a informação
  // de que era um fluxo de recovery (type=recovery).
  const hashOriginal = global.location.hash || '';
  const ehRecovery = hashOriginal.includes('type=recovery');
  
  // Guardamos essa flag globalmente para o auth.js usar
  global._supabaseRecoveryDetected = ehRecovery;

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
      // Implicit flow: o link do e-mail traz os tokens direto no hash da URL
      // (#access_token=...&type=recovery). É o fluxo correto para SPAs sem
      // servidor (sem backend para trocar o code por tokens, como no PKCE).
      // O PKCE exigiria uma rota de callback no servidor — não temos.
      flowType: 'implicit',
    },
  });

  global.supabaseClient = client;
})(window);
