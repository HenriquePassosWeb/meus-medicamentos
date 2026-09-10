// ===== Telas do app =====
(function (global) {
  'use strict';

  const Meds = global.Meds;
  const Auth = global.Auth;
  const UI = global.UI;
  const FormMed = global.FormMed;
  const el = UI.el;

  // ---------- LOGIN / CADASTRO ----------
  function login(root, ir) {
    let modoCadastro = false;

    function render() {
      root.innerHTML = `
      <div class="auth">
        <div class="auth-logo">💊</div>
        <h1 class="auth-titulo">Meus Medicamentos</h1>
        <p class="auth-sub">${modoCadastro ? 'Crie sua conta' : 'Entre para ver seu estoque'}</p>
        <form class="auth-form" id="authForm">
          ${modoCadastro ? `
          <label class="campo">
            <span class="campo-label">Nome</span>
            <input type="text" id="aNome" class="campo-input" placeholder="Seu nome" autocomplete="name" />
          </label>` : ''}
          <label class="campo">
            <span class="campo-label">E-mail</span>
            <input type="email" id="aEmail" class="campo-input" placeholder="voce@email.com" autocomplete="email" />
          </label>
          <label class="campo">
            <span class="campo-label">Senha</span>
            <input type="password" id="aSenha" class="campo-input" placeholder="••••" autocomplete="${modoCadastro ? 'new-password' : 'current-password'}" />
          </label>
          <p class="auth-erro" id="aErro" hidden></p>
          <button type="submit" class="btn btn-primario btn-bloco">${modoCadastro ? 'Criar conta' : 'Entrar'}</button>
        </form>
        <p class="auth-troca">
          ${modoCadastro ? 'Já tem conta?' : 'Ainda não tem conta?'}
          <a href="#" id="aTroca">${modoCadastro ? 'Entrar' : 'Cadastre-se'}</a>
        </p>
      </div>`;

      document.getElementById('aTroca').addEventListener('click', (ev) => {
        ev.preventDefault();
        modoCadastro = !modoCadastro;
        render();
      });

      function mostrarConfirmacaoEmail(email) {
        root.innerHTML = `
        <div class="auth">
          <div class="auth-logo">📧</div>
          <h1 class="auth-titulo">Confirme seu e-mail</h1>
          <p class="auth-sub">Enviamos um link de confirmação para<br><strong>${email}</strong></p>
          <p class="auth-sub">Abra o e-mail e clique no link para ativar sua conta. Depois é só entrar.</p>
          <div class="auth-form">
            <button type="button" class="btn btn-primario btn-bloco" id="aVoltar">Voltar para o login</button>
          </div>
        </div>`;
        document.getElementById('aVoltar').addEventListener('click', () => {
          modoCadastro = false;
          render();
        });
      }

      document.getElementById('authForm').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const erro = document.getElementById('aErro');
        erro.hidden = true;
        try {
          const email = document.getElementById('aEmail').value;
          const senha = document.getElementById('aSenha').value;
          if (modoCadastro) {
            const nome = document.getElementById('aNome').value;
            const resultado = await Auth.registrar(nome, email, senha);
            // Com confirmação de e-mail ativa, não entra direto: pede confirmação.
            if (resultado && resultado.precisaConfirmarEmail) {
              mostrarConfirmacaoEmail(resultado.email);
              return;
            }
          } else {
            await Auth.entrar(email, senha);
          }
          ir('#/inicio');
        } catch (e) {
          erro.textContent = e.message;
          erro.hidden = false;
        }
      });
    }

    render();
  }

  // ---------- INÍCIO (dashboard + lista) ----------
  function inicio(root) {
    const u = Auth.usuarioAtual();
    root.innerHTML = `
      <header class="app-header">
        <div class="header-top">
          <div>
            <p class="ola">Olá, ${primeiroNome(u)} 👋</p>
            <h1 class="app-title">Seus medicamentos</h1>
          </div>
        </div>
      </header>
      <section class="resumo" id="resumo"></section>
      <section class="alertas" id="alertas"></section>
      <main class="conteudo">
        <div class="secao-titulo">
          <h2>Todos os itens</h2>
          <a href="#/consulta" class="link-ver">Consultar</a>
        </div>
        <ul class="lista-medicamentos" id="lista"></ul>
        <div class="vazio" id="vazio" hidden>
          <div class="vazio-icone">📦</div>
          <p class="vazio-titulo">Nenhum medicamento ainda</p>
          <p class="vazio-texto">Toque no + para cadastrar o primeiro.</p>
        </div>
      </main>
      <button class="fab" id="fab" aria-label="Adicionar">+</button>`;

    function atualizar() {
      renderResumo(document.getElementById('resumo'));
      renderAlertas(document.getElementById('alertas'));
      const meds = Meds.listar().slice().sort(ordenar);
      const lista = document.getElementById('lista');
      lista.innerHTML = '';
      document.getElementById('vazio').hidden = meds.length > 0;
      meds.forEach((m) => lista.appendChild(UI.cardMedicamento(m, abrirDetalhe)));
    }

    function abrirDetalhe(med) {
      global.Detalhe.abrir(med, atualizar);
    }

    document.getElementById('fab').addEventListener('click', () => FormMed.abrir(null, atualizar));
    escutarMudanca(root, atualizar);
    atualizar();
  }

  function renderAlertas(container) {
    const meds = Meds.listar();
    const criticos = meds.filter((m) => Meds.estaVencido(m) || Meds.estaAcabando(m) || Meds.estaVencendo(m));
    container.innerHTML = '';
    if (!criticos.length) return;
    const box = el('div', 'alerta-box');
    box.appendChild(el('div', 'alerta-titulo', '⚠️ Precisam de atenção'));
    criticos.slice(0, 4).forEach((m) => {
      const linha = el('div', 'alerta-linha');
      linha.appendChild(el('span', 'alerta-nome', m.nome));
      const motivo = Meds.estaVencido(m) ? 'vencido'
        : Meds.estaAcabando(m) ? 'acabando' : 'vence em breve';
      linha.appendChild(el('span', 'alerta-motivo', motivo));
      box.appendChild(linha);
    });
    container.appendChild(box);
  }

  // ---------- CONSULTA ----------
  function consulta(root) {
    root.innerHTML = `
      <header class="app-header">
        <div class="header-top"><h1 class="app-title">🔎 Consultar</h1></div>
        <div class="search-wrap">
          <input type="search" id="cBusca" class="search-input" placeholder="Buscar por nome ou observação..." autocomplete="off" />
        </div>
      </header>
      <section class="filtros-consulta">
        <div class="filtro-grupo">
          <label class="campo-label">Tipo</label>
          <select id="cTipo" class="campo-input">
            <option value="">Todos os tipos</option>
            ${Object.keys(Meds.tipos()).map((c) => {
              const t = Meds.tipos()[c];
              return '<option value="' + c + '">' + t.rotulo + '</option>';
            }).join('')}
          </select>
        </div>
        <div class="filtro-grupo">
          <label class="campo-label">Situação</label>
          <select id="cStatus" class="campo-input">
            <option value="">Todas</option>
            <option value="acabando">Acabando</option>
            <option value="vencendo">Vencendo / vencido</option>
            <option value="ok">Em dia</option>
          </select>
        </div>
        <div class="filtro-grupo">
          <label class="campo-label">Ordenar</label>
          <select id="cOrdem" class="campo-input">
            <option value="prioridade">Prioridade</option>
            <option value="nome">Nome (A-Z)</option>
            <option value="validade">Validade</option>
          </select>
        </div>
      </section>
      <main class="conteudo">
        <p class="contador" id="cContador"></p>
        <ul class="lista-medicamentos" id="cLista"></ul>
        <div class="vazio" id="cVazio" hidden>
          <div class="vazio-icone">🔍</div>
          <p class="vazio-titulo">Nada encontrado</p>
          <p class="vazio-texto">Ajuste a busca ou os filtros.</p>
        </div>
      </main>`;

    const cBusca = document.getElementById('cBusca');
    const cTipo = document.getElementById('cTipo');
    const cStatus = document.getElementById('cStatus');
    const cOrdem = document.getElementById('cOrdem');

    // controla a busca cruzada para não disparar rede a cada tecla.
    // O token invalida buscas antigas: só a última anexa resultados.
    let buscaCruzadaTimer = null;
    let buscaToken = 0;

    function aplicar() {
      const termo = cBusca.value.trim().toLowerCase();
      let meds = Meds.listar().filter((m) => {
        if (termo && !((m.nome + ' ' + (m.obs || '')).toLowerCase().includes(termo))) return false;
        if (cTipo.value && m.tipo !== cTipo.value) return false;
        if (cStatus.value === 'acabando' && !Meds.estaAcabando(m)) return false;
        if (cStatus.value === 'vencendo' && !(Meds.estaVencendo(m) || Meds.estaVencido(m))) return false;
        if (cStatus.value === 'ok' && (Meds.estaAcabando(m) || Meds.estaVencendo(m) || Meds.estaVencido(m))) return false;
        return true;
      });

      meds.sort(ordenadorPor(cOrdem.value));

      const lista = document.getElementById('cLista');
      lista.innerHTML = '';
      document.getElementById('cVazio').hidden = meds.length > 0;
      document.getElementById('cContador').textContent =
        meds.length + (meds.length === 1 ? ' item encontrado' : ' itens encontrados');
      meds.forEach((m) => lista.appendChild(UI.cardMedicamento(m, (med) => global.Detalhe.abrir(med, aplicar))));

      // Busca cruzada: só com termo digitado, com um pequeno atraso (debounce).
      // Cada re-render invalida a busca anterior via token.
      clearTimeout(buscaCruzadaTimer);
      buscaToken++;
      const tokenAtual = buscaToken;
      if (termo) {
        buscaCruzadaTimer = setTimeout(() => buscarCompartilhados(termo, tokenAtual), 350);
      }
    }

    async function buscarCompartilhados(termo, token) {
      let itens;
      try {
        itens = await Meds.buscarEmCompartilhados(termo);
      } catch (e) {
        // silencioso: a busca no próprio estoque já foi exibida
        console.warn('Busca em compartilhados falhou:', e.message);
        return;
      }
      // Se houve outra busca/re-render nesse meio tempo, descarta este resultado.
      if (token !== buscaToken) return;

      // aplica o filtro de tipo (status/validade fazem menos sentido em item de terceiro)
      if (cTipo.value) itens = itens.filter((m) => m.tipo === cTipo.value);
      if (!itens.length) return;

      // pega a lista atual (foi re-renderizada) e evita duplicar o cabeçalho
      const lista = document.getElementById('cLista');
      if (!lista || lista.querySelector('.compart-separador')) return;

      lista.appendChild(cabecalhoCompartilhado());
      itens.forEach((m) => lista.appendChild(UI.cardCompartilhado(m)));
    }

    function cabecalhoCompartilhado() {
      const li = el('li', 'compart-separador');
      li.textContent = 'Estoques compartilhados com você';
      return li;
    }

    [cBusca, cTipo, cStatus, cOrdem].forEach((n) => {
      n.addEventListener('input', aplicar);
      n.addEventListener('change', aplicar);
    });
    escutarMudanca(root, aplicar);
    aplicar();
  }

  // ---------- HISTÓRICO ----------
  function historico(root) {
    root.innerHTML = `
      <header class="app-header">
        <div class="header-top"><h1 class="app-title">🕑 Histórico</h1></div>
      </header>
      <main class="conteudo">
        <ul class="historico" id="hLista"></ul>
        <div class="vazio" id="hVazio" hidden>
          <div class="vazio-icone">🕑</div>
          <p class="vazio-titulo">Sem movimentações</p>
          <p class="vazio-texto">As entradas e saídas de estoque aparecem aqui.</p>
        </div>
      </main>`;

    const registros = Meds.historico();
    const lista = document.getElementById('hLista');
    document.getElementById('hVazio').hidden = registros.length > 0;

    const iconePorTipo = { cadastro: '➕', entrada: '⬆️', saida: '⬇️' };
    registros.forEach((r) => {
      const li = el('li', 'hist-item');
      li.appendChild(el('div', 'hist-icone', iconePorTipo[r.tipo] || '•'));
      const corpo = el('div', 'hist-corpo');
      corpo.appendChild(el('div', 'hist-nome', r.medNome));
      corpo.appendChild(el('div', 'hist-desc', r.descricao));
      li.appendChild(corpo);
      li.appendChild(el('div', 'hist-data', UI.formatarDataHora(r.em)));
      lista.appendChild(li);
    });
  }

  // ---------- AGENDAMENTOS ----------
  function agendamentos(root) {
    root.innerHTML = `
      <header class="app-header">
        <div class="header-top"><h1 class="app-title">⏰ Agendamentos</h1></div>
      </header>
      <main class="conteudo">
        <ul class="ag-lista" id="agLista"></ul>
        <div class="vazio" id="agVazio" hidden>
          <div class="vazio-icone">⏰</div>
          <p class="vazio-titulo">Nenhum agendamento</p>
          <p class="vazio-texto">Abra um medicamento e toque em "Criar lembrete".</p>
        </div>
      </main>`;

    function atualizar() {
      const ags = Meds.listarAgendamentos()
        .slice()
        .sort((a, b) => (a.hora || '').localeCompare(b.hora || ''));
      const lista = document.getElementById('agLista');
      lista.innerHTML = '';
      document.getElementById('agVazio').hidden = ags.length > 0;

      ags.forEach((a) => {
        const li = el('li', 'ag-card');

        const topo = el('div', 'ag-card-topo');
        topo.appendChild(el('span', 'ag-card-hora', a.hora));
        const info = el('div', 'ag-card-info');
        info.appendChild(el('div', 'ag-card-nome', a.medNome));
        info.appendChild(el('div', 'ag-card-rep', a.repeticao || ''));
        topo.appendChild(info);
        li.appendChild(topo);

        const acoes = el('div', 'ag-card-acoes');
        const sinc = document.createElement('a');
        sinc.href = global.Lembrete.linkDoAgendamento(a);
        sinc.target = '_blank';
        sinc.rel = 'noopener';
        sinc.className = 'btn btn-secundario btn-mini';
        sinc.textContent = '📅 Google Agenda';
        acoes.appendChild(sinc);

        const rem = el('button', 'btn btn-mini btn-remover-foto', 'Remover');
        rem.type = 'button';
        rem.addEventListener('click', () => {
          if (!confirm('Remover o agendamento de ' + a.hora + ' (' + a.medNome + ')?')) return;
          Meds.removerAgendamento(a.id);
          UI.toast('Agendamento removido');
          atualizar();
        });
        acoes.appendChild(rem);
        li.appendChild(acoes);

        lista.appendChild(li);
      });
    }

    atualizar();
  }

  // ---------- COMPARTILHAR ----------
  function compartilhar(root) {
    root.innerHTML = `
      <header class="app-header">
        <div class="header-top"><h1 class="app-title">🤝 Compartilhar</h1></div>
      </header>
      <main class="conteudo">
        <div class="cartao-ajuste">
          <h3>Convidar alguém</h3>
          <p class="ajuste-texto">Gere um código e envie para a pessoa (WhatsApp, etc.). Ao aceitar, vocês dois passam a ver e ajustar a quantidade do estoque um do outro.</p>
          <button class="btn btn-primario btn-bloco" id="btnGerar">Gerar código de convite</button>
          <div id="codigoGerado" class="codigo-gerado" hidden></div>
        </div>

        <div class="cartao-ajuste">
          <h3>Usar um código</h3>
          <p class="ajuste-texto">Recebeu um código? Digite abaixo. Ao aceitar, vocês dois passam a ver o estoque um do outro.</p>
          <div class="tipo-form">
            <input type="text" id="campoCodigo" class="campo-input" placeholder="Ex: ABC123" maxlength="6" autocomplete="off" style="text-transform:uppercase" />
          </div>
          <button class="btn btn-secundario btn-bloco" id="btnUsarCodigo" style="margin-top:8px">Aceitar convite</button>
        </div>

        <div class="cartao-ajuste">
          <h3>Compartilhando com</h3>
          <p class="ajuste-texto">Quando alguém aceita seu convite, vocês passam a ver e ajustar o estoque um do outro. Abaixo estão seus vínculos ativos e os convites que ainda não foram aceitos.</p>
          <ul class="compart-lista" id="listaVinculos"></ul>
          <p class="ajuste-texto" id="vazioVinculos" hidden>Você ainda não compartilha seu estoque com ninguém.</p>
        </div>
      </main>`;

    document.getElementById('btnGerar').addEventListener('click', gerar);
    document.getElementById('btnUsarCodigo').addEventListener('click', usarCodigo);
    atualizarListas();

    async function gerar() {
      const btn = document.getElementById('btnGerar');
      btn.disabled = true;
      try {
        const convite = await Meds.gerarConvite();
        const box = document.getElementById('codigoGerado');
        box.hidden = false;
        box.innerHTML = '';
        box.appendChild(el('p', 'codigo-rotulo', 'Envie este código para a pessoa:'));
        box.appendChild(el('div', 'codigo-valor', convite.codigo));
        const copiar = el('button', 'btn btn-secundario btn-mini', '📋 Copiar código');
        copiar.type = 'button';
        copiar.addEventListener('click', () => {
          navigator.clipboard.writeText(convite.codigo).then(
            () => UI.toast('Código copiado'),
            () => UI.toast('Copie manualmente: ' + convite.codigo)
          );
        });
        box.appendChild(copiar);
        atualizarListas();
      } catch (e) {
        UI.toast(e.message || 'Não foi possível gerar o convite');
      } finally {
        btn.disabled = false;
      }
    }

    async function usarCodigo() {
      const campo = document.getElementById('campoCodigo');
      const codigo = campo.value.trim().toUpperCase();
      if (!codigo) {
        UI.toast('Digite o código do convite');
        return;
      }
      const btn = document.getElementById('btnUsarCodigo');
      btn.disabled = true;
      try {
        const vinculo = await Meds.aceitarConvite(codigo);
        UI.toast('Agora você tem acesso ao estoque de ' + (vinculo.donoNome || 'outro usuário'));
        campo.value = '';
        atualizarListas();
      } catch (e) {
        UI.toast(e.message || 'Não foi possível aceitar o convite');
      } finally {
        btn.disabled = false;
      }
    }

    async function atualizarListas() {
      let vinculos;
      try {
        vinculos = await Meds.listarCompartilhamentos();
      } catch (e) {
        UI.toast(e.message || 'Não foi possível carregar os compartilhamentos');
        return;
      }

      const lista = document.getElementById('listaVinculos');
      lista.innerHTML = '';
      document.getElementById('vazioVinculos').hidden = vinculos.length > 0;
      vinculos.forEach((v) => lista.appendChild(itemVinculo(v, atualizarListas)));
    }
  }

  // Renderiza um item da lista unificada de compartilhamentos.
  function itemVinculo(v, aoMudar) {
    const li = el('li', 'compart-item');

    const info = el('div', 'compart-info');
    if (v.pendente) {
      info.appendChild(el('span', 'compart-nome', '⏳ Convite: ' + v.codigo));
      info.appendChild(el('span', 'compart-status pendente', 'aguardando'));
    } else {
      info.appendChild(el('span', 'compart-nome', '👤 ' + v.parceiroNome));
      info.appendChild(el('span', 'compart-status ok', 'ativo'));
    }
    li.appendChild(info);

    const rem = el('button', 'ag-remover', '✕');
    rem.type = 'button';
    rem.title = v.pendente ? 'Cancelar convite' : 'Encerrar compartilhamento';
    rem.addEventListener('click', async () => {
      const msg = v.pendente
        ? 'Cancelar este convite?'
        : 'Encerrar o compartilhamento com ' + v.parceiroNome + '? Vocês dois perderão o acesso ao estoque um do outro.';
      if (!confirm(msg)) return;
      try {
        await Meds.revogarCompartilhamento(v.id);
        UI.toast('Feito');
        if (aoMudar) aoMudar();
      } catch (e) {
        UI.toast(e.message || 'Não foi possível encerrar');
      }
    });
    li.appendChild(rem);
    return li;
  }

  // ---------- AJUSTES ----------
  function ajustes(root, ir) {
    const u = Auth.usuarioAtual();
    root.innerHTML = `
      <header class="app-header">
        <div class="header-top"><h1 class="app-title">⚙️ Ajustes</h1></div>
      </header>
      <main class="conteudo">
        <div class="perfil">
          <div class="perfil-avatar">${(primeiroNome(u)[0] || '?').toUpperCase()}</div>
          <div>
            <div class="perfil-nome">${u ? u.nome : ''}</div>
            <div class="perfil-email">${u ? u.email : ''}</div>
          </div>
        </div>

        <div class="cartao-ajuste">
          <h3>Backup dos dados</h3>
          <p class="ajuste-texto">Seus dados ficam salvos na sua conta na nuvem e sincronizam entre aparelhos. Você ainda pode exportar um arquivo como cópia de segurança.</p>
          <div class="ajuste-acoes">
            <button class="btn btn-secundario" id="btnExportar">Exportar backup</button>
            <button class="btn btn-secundario" id="btnImportar">Importar backup</button>
            <input type="file" id="arquivoImport" accept="application/json" hidden />
          </div>
        </div>

        <div class="cartao-ajuste">
          <h3>Tipos de embalagem</h3>
          <p class="ajuste-texto">Adicione tipos além dos padrão (ex: sachê, ampola, adesivo).</p>
          <ul class="tipos-lista" id="tiposLista"></ul>
          <div class="tipo-form">
            <input type="text" id="tipoIcone" class="campo-input tipo-icone" maxlength="2" placeholder="💠" />
            <input type="text" id="tipoNome" class="campo-input" placeholder="Nome (ex: Sachê)" />
          </div>
          <input type="text" id="tipoUnidade" class="campo-input" placeholder="Unidade (ex: sachês)" />
          <button class="btn btn-secundario btn-bloco" id="btnAddTipo" style="margin-top:8px">Adicionar tipo</button>
        </div>

        <div class="cartao-ajuste">
          <h3>Histórico de movimentações</h3>
          <p class="ajuste-texto">Veja todas as entradas e saídas de estoque.</p>
          <a href="#/historico" class="btn btn-secundario btn-bloco">Abrir histórico</a>
        </div>

        <div class="cartao-ajuste">
          <h3>Conta</h3>
          <button class="btn btn-secundario btn-bloco" id="btnSair" style="margin-bottom:8px">Sair</button>
          <button class="btn btn-perigo btn-bloco" id="btnExcluirConta">Excluir minha conta</button>
          <p class="ajuste-texto" style="margin-top:8px">Apaga permanentemente sua conta, seus medicamentos, agendamentos, histórico, fotos e compartilhamentos. Não pode ser desfeito.</p>
        </div>

        <p class="rodape-info">Meus Medicamentos • dados sincronizados na nuvem</p>
      </main>`;

    renderTipos();
    document.getElementById('btnAddTipo').addEventListener('click', adicionarTipo);
    document.getElementById('btnExportar').addEventListener('click', exportar);
    document.getElementById('btnImportar').addEventListener('click', () =>
      document.getElementById('arquivoImport').click());
    document.getElementById('arquivoImport').addEventListener('change', importar);
    document.getElementById('btnSair').addEventListener('click', async () => {
      await Auth.sair();
      ir('#/login');
    });
    document.getElementById('btnExcluirConta').addEventListener('click', () => excluirConta(ir));

    function renderTipos() {
      const lista = document.getElementById('tiposLista');
      lista.innerHTML = '';
      const todos = Meds.tipos();
      Object.keys(todos).forEach((chave) => {
        const t = todos[chave];
        const li = el('li', 'tipo-item');
        li.appendChild(el('span', 'tipo-info', t.icone + ' ' + t.rotulo));
        if (t.custom) {
          const rem = el('button', 'ag-remover', '✕');
          rem.type = 'button';
          rem.title = 'Remover tipo';
          rem.addEventListener('click', async () => {
            try {
              await Meds.removerTipo(chave);
              renderTipos();
              UI.toast('Tipo removido');
            } catch (e) {
              UI.toast(e.message);
            }
          });
          li.appendChild(rem);
        } else {
          li.appendChild(el('span', 'tipo-badge', 'padrão'));
        }
        lista.appendChild(li);
      });
    }

    async function adicionarTipo() {
      const nome = document.getElementById('tipoNome').value;
      const icone = document.getElementById('tipoIcone').value;
      const unidade = document.getElementById('tipoUnidade').value;
      try {
        await Meds.adicionarTipo(nome, icone, unidade);
        document.getElementById('tipoNome').value = '';
        document.getElementById('tipoIcone').value = '';
        document.getElementById('tipoUnidade').value = '';
        renderTipos();
        UI.toast('Tipo adicionado');
      } catch (e) {
        UI.toast(e.message);
      }
    }
  }

  // Exclusão de conta com dupla confirmação (ação destrutiva e irreversível).
  async function excluirConta(ir) {
    const primeira = confirm(
      'Tem certeza que deseja EXCLUIR sua conta?\n\n' +
      'Isso apaga permanentemente todos os seus medicamentos, agendamentos, ' +
      'histórico, fotos e compartilhamentos. Esta ação NÃO pode ser desfeita.'
    );
    if (!primeira) return;

    const confirmacao = prompt('Para confirmar, digite EXCLUIR (em maiúsculas):');
    if (confirmacao !== 'EXCLUIR') {
      UI.toast('Exclusão cancelada');
      return;
    }

    try {
      UI.toast('Excluindo sua conta...');
      await global.Api.excluirConta();
      await Auth.sair();
      UI.toast('Conta excluída');
      ir('#/login');
    } catch (e) {
      UI.toast(e.message || 'Não foi possível excluir a conta');
    }
  }

  async function exportar() {
    try {
      const pacote = await Meds.exportar();
      const blob = new Blob([JSON.stringify(pacote, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'meus-medicamentos-backup.json';
      a.click();
      URL.revokeObjectURL(url);
      UI.toast('Backup exportado');
    } catch (e) {
      UI.toast(e.message || 'Não foi possível exportar');
    }
  }

  function importar(ev) {
    const arquivo = ev.target.files[0];
    if (!arquivo) return;
    const leitor = new FileReader();
    leitor.onload = async () => {
      try {
        const pacote = JSON.parse(leitor.result);
        const substituir = confirm(
          'Importar backup.\n\nOK = SUBSTITUIR tudo pelo backup.\nCancelar = MESCLAR (manter o atual e adicionar o que faltar).'
        );
        UI.toast('Importando backup...');
        const qtd = await Meds.importar(pacote, substituir);
        UI.toast(substituir ? 'Backup restaurado (' + qtd + ' itens)' : qtd + ' itens adicionados');
        global.dispatchEvent(new CustomEvent('estoque:mudou'));
      } catch (e) {
        UI.toast(e.message || 'Arquivo inválido');
      }
    };
    leitor.readAsText(arquivo);
    ev.target.value = '';
  }

  // ---------- helpers ----------
  function renderResumo(container) {
    const r = Meds.resumo();
    container.innerHTML = '';
    container.appendChild(card(r.total, 'Itens', ''));
    container.appendChild(card(r.acabando, 'Acabando', r.acabando ? 'alerta' : ''));
    container.appendChild(card(r.vencendo, 'Vencendo', r.vencendo ? 'perigo' : ''));
  }

  function card(num, rotulo, classe) {
    const div = el('div', 'card-resumo ' + classe);
    div.innerHTML = '<div class="num">' + num + '</div><div class="rotulo">' + rotulo + '</div>';
    return div;
  }

  function ordenar(a, b) {
    const pa = Meds.prioridade(a);
    const pb = Meds.prioridade(b);
    if (pa !== pb) return pa - pb;
    return a.nome.localeCompare(b.nome, 'pt-BR');
  }

  function ordenadorPor(criterio) {
    if (criterio === 'nome') return (a, b) => a.nome.localeCompare(b.nome, 'pt-BR');
    if (criterio === 'validade') {
      return (a, b) => (a.validade || '9999-99').localeCompare(b.validade || '9999-99');
    }
    return ordenar;
  }

  function primeiroNome(u) {
    return u ? (u.nome || '').split(' ')[0] : '';
  }

  function escutarMudanca(root, callback) {
    const handler = () => {
      if (document.body.contains(root)) callback();
      else global.removeEventListener('estoque:mudou', handler);
    };
    global.addEventListener('estoque:mudou', handler);
  }

  global.Views = { login, inicio, consulta, historico, agendamentos, compartilhar, ajustes };
})(window);
