// ===== App: roteamento por hash + navegação =====
(function (global) {
  'use strict';

  const Auth = global.Auth;
  const Views = global.Views;

  const ROTAS = {
    '#/login': { view: Views.login, publica: true, nav: false },
    '#/nova-senha': { view: Views.novaSenha, publica: true, nav: false },
    '#/inicio': { view: Views.inicio, nav: 'inicio' },
    '#/consulta': { view: Views.consulta, nav: 'consulta' },
    '#/agendamentos': { view: Views.agendamentos, nav: 'agendamentos' },
    '#/compartilhar': { view: Views.compartilhar, nav: 'compartilhar' },
    '#/historico': { view: Views.historico, nav: 'historico' },
    '#/ajustes': { view: Views.ajustes, nav: 'ajustes' },
  };

  const ITENS_NAV = [
    { id: 'inicio', hash: '#/inicio', icone: '🏠', rotulo: 'Início' },
    { id: 'consulta', hash: '#/consulta', icone: '🔎', rotulo: 'Consulta' },
    { id: 'agendamentos', hash: '#/agendamentos', icone: '⏰', rotulo: 'Agenda' },
    { id: 'compartilhar', hash: '#/compartilhar', icone: '🤝', rotulo: 'Compartilhar' },
    { id: 'ajustes', hash: '#/ajustes', icone: '⚙️', rotulo: 'Ajustes' },
  ];

  const app = document.getElementById('app');
  const tela = document.createElement('div');
  tela.id = 'tela';
  app.appendChild(tela);

  const nav = document.createElement('nav');
  nav.className = 'nav-inferior';
  nav.id = 'navInferior';
  app.appendChild(nav);

  function ir(hash) {
    if (global.location.hash === hash) render();
    else global.location.hash = hash;
  }

  function render() {
    let hash = global.location.hash || '#/inicio';

    // O Supabase adiciona parâmetros após o hash no link de reset.
    // Ex: #/nova-senha ou #/login?senha-alterada=1 — extraímos só o path.
    const hashPath = hash.split('?')[0];
    let rota = ROTAS[hashPath];

    // rota inexistente
    if (!rota) {
      hash = Auth.estaLogado() ? '#/inicio' : '#/login';
      rota = ROTAS[hash];
    }

    // A tela de nova senha é pública e tem precedência — não redirecionar.
    if (hashPath === '#/nova-senha') {
      tela.innerHTML = '';
      tela.scrollTop = 0;
      global.scrollTo(0, 0);
      rota.view(tela, ir);
      renderNav(null);
      return;
    }

    // proteção de rota
    if (!rota.publica && !Auth.estaLogado()) {
      global.location.hash = '#/login';
      return;
    }
    if (hashPath === '#/login' && Auth.estaLogado()) {
      global.location.hash = '#/inicio';
      return;
    }

    tela.innerHTML = '';
    tela.scrollTop = 0;
    global.scrollTo(0, 0);
    rota.view(tela, ir);
    renderNav(rota.nav);
  }

  function renderNav(ativo) {
    if (!ativo) {
      nav.hidden = true;
      document.body.classList.remove('com-nav');
      return;
    }
    nav.hidden = false;
    document.body.classList.add('com-nav');
    nav.innerHTML = '';
    ITENS_NAV.forEach((item) => {
      const btn = document.createElement('button');
      btn.className = 'nav-btn' + (item.id === ativo ? ' ativo' : '');
      btn.innerHTML = '<span class="nav-icone">' + item.icone + '</span>' +
        '<span class="nav-rotulo">' + item.rotulo + '</span>';
      btn.addEventListener('click', () => ir(item.hash));
      nav.appendChild(btn);
    });
  }

  global.addEventListener('hashchange', render);

  // Aguarda a sessão do Supabase carregar antes do primeiro render.
  // Sem isso, estaLogado() retornaria false no boot mesmo com sessão válida.
  Auth.boot().then(() => {
    // Se o boot já redirecionou para #/nova-senha (fluxo de recovery),
    // não sobrescrever o hash — só renderizar a tela atual.
    if (global.location.hash === '#/nova-senha') {
      render();
      return;
    }
    if (!global.location.hash) {
      global.location.hash = Auth.estaLogado() ? '#/inicio' : '#/login';
      if (!global.location.hash) render();
    } else {
      render();
    }
    if (global.location.hash) render();
  });
})(window);
