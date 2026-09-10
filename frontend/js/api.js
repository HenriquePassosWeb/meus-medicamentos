// ===== Cliente da API do backend =====
// Como o backend também serve o frontend, usamos caminho relativo por padrão.
// Se abrir o frontend em outra origem, dá para configurar window.API_BASE.
//
// Os endpoints de IA/bula exigem autenticação: enviamos o token de acesso do
// Supabase no header Authorization. O backend valida esse token antes de chamar a IA.
(function (global) {
  'use strict';

  const BASE = global.API_BASE || '';
  const client = global.supabaseClient;

  // Obtém o token de acesso da sessão atual do Supabase (ou '' se não logado).
  async function tokenAtual() {
    try {
      const { data } = await client.auth.getSession();
      return data.session ? data.session.access_token : '';
    } catch {
      return '';
    }
  }

  // Monta os headers com o token de autenticação.
  async function headersAuth(extra) {
    const token = await tokenAtual();
    const headers = Object.assign({}, extra || {});
    if (token) headers.Authorization = 'Bearer ' + token;
    return headers;
  }

  async function json(resp) {
    let corpo = null;
    try { corpo = await resp.json(); } catch { /* sem corpo */ }
    if (!resp.ok || (corpo && corpo.ok === false)) {
      const msg = (corpo && corpo.erro) || ('Erro ' + resp.status);
      throw new Error(msg);
    }
    return corpo;
  }

  async function status() {
    const resp = await fetch(BASE + '/api/status');
    return json(resp);
  }

  async function identificar(dataUrl) {
    const resp = await fetch(BASE + '/api/identificar', {
      method: 'POST',
      headers: await headersAuth({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ imagem: dataUrl }),
    });
    return json(resp);
  }

  async function bula(nome) {
    const resp = await fetch(BASE + '/api/bula?nome=' + encodeURIComponent(nome), {
      headers: await headersAuth(),
    });
    return json(resp);
  }

  // Exclui a conta e todos os dados do usuário logado (LGPD).
  async function excluirConta() {
    const resp = await fetch(BASE + '/api/conta', {
      method: 'DELETE',
      headers: await headersAuth(),
    });
    return json(resp);
  }

  global.Api = { status, identificar, bula, excluirConta };
})(window);
