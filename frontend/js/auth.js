// ===== Autenticação via Supabase Auth =====
// Substitui a autenticação local (localStorage) da v2 pelo Supabase Auth.
//
// As telas (views.js / app.js) chamam usuarioAtual() e estaLogado() de forma
// SÍNCRONA. O Supabase, porém, é assíncrono. Para conciliar, mantemos um cache
// síncrono do usuário atual, populado no boot() e mantido atualizado pelo
// onAuthStateChange. Assim as telas não precisam mudar sua forma de consultar.
(function (global) {
  'use strict';

  const client = global.supabaseClient;

  // Cache síncrono do usuário logado: { id, email, nome } ou null.
  let usuarioCache = null;

  function mapearUsuario(user) {
    if (!user) return null;
    const nome =
      (user.user_metadata && user.user_metadata.nome) ||
      (user.email ? user.email.split('@')[0] : 'Usuário');
    return { id: user.id, email: user.email, nome };
  }

  // Inicializa o cache a partir da sessão persistida e passa a ouvir mudanças.
  // Deve ser aguardado no boot do app (app.js) antes do primeiro render.
  // Se houver sessão, já carrega os dados do usuário (Meds.carregar) antes de retornar.
  async function boot() {
    const { data } = await client.auth.getSession();
    usuarioCache = mapearUsuario(data.session ? data.session.user : null);

    client.auth.onAuthStateChange((_evento, sessao) => {
      usuarioCache = mapearUsuario(sessao ? sessao.user : null);
    });

    if (usuarioCache && global.Meds) {
      await global.Meds.carregar();
    }
    return usuarioCache;
  }

  async function registrar(nome, email, senha) {
    nome = (nome || '').trim();
    email = (email || '').trim().toLowerCase();

    if (!nome) throw new Error('Informe seu nome.');
    if (!validarEmail(email)) throw new Error('E-mail inválido.');
    if (!senha || senha.length < 6) throw new Error('A senha precisa de ao menos 6 caracteres.');

    const { data, error } = await client.auth.signUp({
      email,
      password: senha,
      options: { data: { nome } },
    });
    if (error) throw new Error(traduzirErro(error));

    // Se a confirmação de e-mail estiver ATIVA, o signUp não cria sessão:
    // data.session vem null e a pessoa precisa clicar no link enviado por e-mail.
    if (!data.session) {
      return { precisaConfirmarEmail: true, email };
    }

    // Confirmação desligada: a sessão já vem ativa, entra direto.
    usuarioCache = mapearUsuario(data.user);
    if (global.Meds) await global.Meds.carregar();
    return { precisaConfirmarEmail: false, usuario: usuarioCache };
  }

  async function entrar(email, senha) {
    email = (email || '').trim().toLowerCase();
    const { data, error } = await client.auth.signInWithPassword({ email, password: senha });
    if (error) throw new Error(traduzirErro(error));
    usuarioCache = mapearUsuario(data.user);
    if (global.Meds) await global.Meds.carregar();
    return usuarioCache;
  }

  async function sair() {
    await client.auth.signOut();
    usuarioCache = null;
    if (global.Meds) global.Meds.limpar();
  }

  function usuarioAtual() {
    return usuarioCache;
  }

  function estaLogado() {
    return usuarioCache !== null;
  }

  function validarEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  // Traduz as mensagens mais comuns do Supabase para português.
  function traduzirErro(error) {
    const msg = (error && error.message) || 'Erro de autenticação.';
    if (/email not confirmed/i.test(msg)) return 'Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.';
    if (/invalid login credentials/i.test(msg)) return 'E-mail ou senha incorretos.';
    if (/user already registered/i.test(msg)) return 'Já existe uma conta com esse e-mail.';
    if (/email.*invalid/i.test(msg)) return 'E-mail inválido.';
    if (/password/i.test(msg)) return 'Senha inválida (mínimo de 6 caracteres).';
    return msg;
  }

  global.Auth = {
    boot,
    registrar,
    entrar,
    sair,
    usuarioAtual,
    estaLogado,
    validarEmail,
  };
})(window);
