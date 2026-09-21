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

  // Token de acesso do Google (provider_token). Só existe logo após o login com
  // Google e dura ~1h. É usado para chamar a API do Google Agenda. O Supabase NÃO
  // renova automaticamente; se expirar, o usuário precisa reconectar com o Google.
  let tokenGoogleCache = null;

  // Flag para indicar que estamos em modo de recuperação de senha.
  // Capturamos ANTES de qualquer processamento do Supabase, pois ele altera o hash.
  let modoRecuperacao = false;

  function tokenGoogle() {
    return tokenGoogleCache;
  }

  // Retorna true se estamos no fluxo de recuperação de senha.
  function emRecuperacao() {
    return modoRecuperacao;
  }

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
    // A flag _supabaseRecoveryDetected é definida em supabaseClient.js ANTES
    // do cliente Supabase ser criado (e antes dele limpar o hash).
    // Isso garante que sabemos se era um fluxo de recovery mesmo após o Supabase
    // ter processado e removido os tokens da URL.
    modoRecuperacao = global._supabaseRecoveryDetected || false;

    // Registra o listener ANTES de chamar getSession, para não perder eventos
    // que disparem durante o processamento dos tokens da URL.
    client.auth.onAuthStateChange(async (evento, sessao) => {
      usuarioCache = mapearUsuario(sessao ? sessao.user : null);
      if (sessao && sessao.provider_token) {
        tokenGoogleCache = sessao.provider_token;
      }
      if (!sessao) tokenGoogleCache = null;

      // Supabase dispara PASSWORD_RECOVERY quando os tokens de reset foram
      // processados com sucesso. Redireciona para a tela de nova senha.
      if (evento === 'PASSWORD_RECOVERY') {
        modoRecuperacao = true;
        global.location.hash = '#/nova-senha';
        return;
      }

      // SIGNED_IN: não redirecionar se estamos em modo de recuperação
      // (a sessão é estabelecida antes do PASSWORD_RECOVERY em alguns casos).
      if (evento === 'SIGNED_IN') {
        if (modoRecuperacao || global.location.hash === '#/nova-senha') {
          return;
        }
        if (global.Meds) await global.Meds.carregar();
        if (global.location.hash !== '#/inicio') {
          global.location.hash = '#/inicio';
        }
      }
    });

    // getSession processa os tokens da URL (se houver) e popula a sessão.
    // Com implicit flow isso acontece de forma síncrona dentro do getSession.
    const { data } = await client.auth.getSession();
    
    usuarioCache = mapearUsuario(data.session ? data.session.user : null);
    tokenGoogleCache = data.session ? data.session.provider_token || null : null;

    // Se detectamos recovery no hash original e temos sessão, vamos para nova-senha.
    // Isso cobre o caso onde o PASSWORD_RECOVERY já foi disparado antes do listener.
    if (modoRecuperacao && data.session) {
      global.location.hash = '#/nova-senha';
      return usuarioCache;
    }

    // Se detectamos recovery mas NÃO temos sessão, algo deu errado.
    // O Supabase deveria ter criado a sessão a partir dos tokens da URL.
    if (modoRecuperacao && !data.session) {
      // Ainda assim, tentamos ir para nova-senha para mostrar erro amigável
      global.location.hash = '#/nova-senha';
      return null;
    }

    if (usuarioCache && global.Meds && !modoRecuperacao) {
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

  // Login com Google (OAuth). Redireciona para o Google e volta para o app.
  // Pedimos também o escopo do Google Agenda (calendar.events) para poder, no
  // futuro, gravar lembretes direto na agenda do usuário sem ele sair do app.
  // access_type=offline + prompt=consent garantem o refresh token para uso da API.
  async function entrarComGoogle() {
    const { error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        scopes: 'https://www.googleapis.com/auth/calendar.events',
        redirectTo: global.location.origin,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    });
    if (error) throw new Error(traduzirErro(error));
    // O navegador é redirecionado para o Google; o retorno é tratado no boot().
  }

  // Envia e-mail com link de recuperação de senha para o endereço informado.
  // O link redireciona para a origem do app, onde o boot() detecta type=recovery
  // no hash e redireciona para a tela de nova senha.
  // NÃO colocamos /#/nova-senha no redirectTo porque o Supabase substitui
  // tudo após o # pelos tokens (access_token, type=recovery, etc).
  async function solicitarRecuperacao(email) {
    email = (email || '').trim().toLowerCase();
    if (!validarEmail(email)) throw new Error('E-mail inválido.');
    const { error } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: global.location.origin,
    });
    if (error) throw new Error(traduzirErro(error));
  }

  // Atualiza a senha do usuário autenticado pela sessão de recuperação.
  // Chamado na tela #/nova-senha, após o usuário clicar no link do e-mail.
  async function atualizarSenha(novaSenha) {
    if (!novaSenha || novaSenha.length < 6) {
      throw new Error('A senha precisa ter ao menos 6 caracteres.');
    }
    const { error } = await client.auth.updateUser({ password: novaSenha });
    if (error) throw new Error(traduzirErro(error));
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
    entrarComGoogle,
    tokenGoogle,
    solicitarRecuperacao,
    atualizarSenha,
    sair,
    usuarioAtual,
    estaLogado,
    emRecuperacao,
    validarEmail,
  };
})(window);
