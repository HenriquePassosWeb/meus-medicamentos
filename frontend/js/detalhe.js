// ===== Modal de detalhe (somente leitura) do medicamento =====
(function (global) {
  'use strict';

  const Meds = global.Meds;
  const UI = global.UI;
  const FormMed = global.FormMed;
  const el = UI.el;

  let idAtual = null;
  let aoMudarCallback = null;

  function html() {
    return `
    <div class="modal" id="modalDetalhe" hidden>
      <div class="modal-backdrop" data-fechar-det></div>
      <div class="modal-painel" role="dialog" aria-modal="true">
        <div class="modal-cabecalho">
          <h2 id="detTitulo">Detalhe</h2>
          <button class="botao-icone" aria-label="Fechar" data-fechar-det>✕</button>
        </div>
        <div id="detCorpo"></div>
      </div>
    </div>`;
  }

  let montado = false;
  function montar() {
    if (montado) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = html();
    document.body.appendChild(wrap.firstElementChild);
    document.getElementById('modalDetalhe')
      .querySelectorAll('[data-fechar-det]')
      .forEach((n) => n.addEventListener('click', fechar));
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && !document.getElementById('modalDetalhe').hidden) fechar();
    });
    montado = true;
  }

  function abrir(med, aoMudar) {
    montar();
    idAtual = med.id;
    aoMudarCallback = aoMudar;
    render();
    document.getElementById('modalDetalhe').hidden = false;
  }

  function fechar() {
    document.getElementById('modalDetalhe').hidden = true;
  }

  function render() {
    const med = Meds.obter(idAtual);
    if (!med) { fechar(); return; }
    const corpo = document.getElementById('detCorpo');
    corpo.innerHTML = '';

    document.getElementById('detTitulo').textContent = med.nome;

    // Cabeçalho: foto + dados principais
    const topo = el('div', 'det-topo');
    const meta = Meds.obterTipo(med.tipo);
    if (Meds.temFoto(med)) {
      // Mostra o ícone do tipo enquanto a foto (URL assinada) é carregada sob demanda.
      const fig = el('div', 'det-foto det-foto-icone', meta.icone);
      topo.appendChild(fig);
      Meds.carregarFoto(med.id).then((url) => {
        if (!url) return;
        fig.classList.remove('det-foto-icone');
        fig.textContent = '';
        const img = document.createElement('img');
        img.src = url;
        img.alt = med.nome;
        fig.appendChild(img);
      }).catch(() => { /* mantém o ícone se a foto falhar */ });
    } else {
      const fig = el('div', 'det-foto det-foto-icone', meta.icone);
      topo.appendChild(fig);
    }

    const info = el('div', 'det-info');
    info.appendChild(el('div', 'det-nome', med.nome));
    info.appendChild(el('div', 'det-linha', meta.rotulo));
    info.appendChild(el('div', 'det-estoque', Meds.descricaoEstoque(med)));
    if (med.validade) {
      info.appendChild(el('div', 'det-linha', 'Validade: ' + UI.formatarValidade(med.validade)));
    }
    const tags = el('div', 'item-tags');
    UI.tagsDoMed(med).forEach((t) => tags.appendChild(el('span', 'tag ' + t.classe, t.texto)));
    if (tags.children.length) info.appendChild(tags);
    topo.appendChild(info);
    corpo.appendChild(topo);

    // Controle de estoque
    corpo.appendChild(controleEstoque(med));

    // Observações
    if (med.obs) {
      const obs = el('div', 'det-secao');
      obs.appendChild(el('div', 'det-secao-titulo', 'Observações'));
      obs.appendChild(el('div', 'det-texto', med.obs));
      corpo.appendChild(obs);
    }

    // Bula
    if (med.bula) {
      const sec = el('div', 'det-secao');
      sec.appendChild(el('div', 'det-secao-titulo', '📋 Bula (resumo por IA)'));
      const box = el('div', 'bula-resultado');
      box.hidden = false;
      renderBula(box, med.bula);
      sec.appendChild(box);
      corpo.appendChild(sec);
    }

    // Agendamentos salvos deste medicamento
    const ags = Meds.agendamentosDoMed(med.id);
    if (ags.length) {
      const sec = el('div', 'det-secao');
      sec.appendChild(el('div', 'det-secao-titulo', '⏰ Agendamentos'));
      ags.forEach((a) => {
        const linha = el('div', 'ag-linha');
        const txt = el('div', 'ag-txt');
        txt.appendChild(el('span', 'ag-hora', a.hora));
        txt.appendChild(el('span', 'ag-rep', a.repeticao || ''));
        linha.appendChild(txt);
        const rem = el('button', 'ag-remover', '✕');
        rem.type = 'button';
        rem.title = 'Remover agendamento';
        rem.addEventListener('click', async () => {
          try {
            await Meds.removerAgendamento(a.id);
            render();
            if (aoMudarCallback) aoMudarCallback();
          } catch (e) {
            UI.toast(e.message || 'Não foi possível remover o agendamento');
          }
        });
        linha.appendChild(rem);
        sec.appendChild(linha);
      });
      corpo.appendChild(sec);
    }

    // Botão de lembrete (Google Agenda)
    const btnLembrete = el('button', 'btn btn-secundario btn-bloco', '⏰ Criar lembrete no Google Agenda');
    btnLembrete.type = 'button';
    btnLembrete.style.marginBottom = '10px';
    btnLembrete.addEventListener('click', () => global.Lembrete.abrir(med, () => {
      render(); // atualiza o detalhe para mostrar os agendamentos salvos
      if (aoMudarCallback) aoMudarCallback();
    }));
    corpo.appendChild(btnLembrete);

    // Ações
    const acoes = el('div', 'det-acoes');
    const btnEditar = el('button', 'btn btn-primario', 'Editar');
    btnEditar.type = 'button';
    btnEditar.addEventListener('click', () => {
      fechar();
      FormMed.abrir(med, () => { if (aoMudarCallback) aoMudarCallback(); });
    });
    acoes.appendChild(btnEditar);
    corpo.appendChild(acoes);
  }

  function controleEstoque(med) {
    const wrap = el('div', 'det-controle');
    const eLiquido = med.tipo === 'liquido';
    wrap.appendChild(el('span', 'det-controle-label', 'Estoque'));

    const grupo = el('div', 'det-controle-grupo');
    const menos = botao('−', () => ajustar(med, -1));
    const valor = el('span', 'det-controle-valor');
    if (eLiquido) {
      const nivel = Meds.NIVEIS[med.nivel] || Meds.NIVEIS.cheio;
      valor.textContent = nivel.icone + ' ' + nivel.rotulo;
    } else {
      valor.textContent = (Number(med.quantidade) || 0) + ' ' + (med.unidade || '');
      if ((Number(med.quantidade) || 0) <= 0) menos.disabled = true;
    }
    const mais = botao('+', () => ajustar(med, +1));
    grupo.appendChild(menos);
    grupo.appendChild(valor);
    grupo.appendChild(mais);
    wrap.appendChild(grupo);
    return wrap;
  }

  async function ajustar(med, delta) {
    try {
      if (med.tipo === 'liquido') await Meds.ajustarNivel(med.id, delta);
      else await Meds.ajustarQuantidade(med.id, delta);
      render(); // re-renderiza o detalhe com o novo valor
      if (aoMudarCallback) aoMudarCallback();
      global.dispatchEvent(new CustomEvent('estoque:mudou'));
    } catch (e) {
      UI.toast(e.message || 'Não foi possível atualizar o estoque');
    }
  }

  function botao(texto, aoClicar) {
    const b = el('button', 'qtd-btn');
    b.type = 'button';
    b.textContent = texto;
    b.addEventListener('click', aoClicar);
    return b;
  }

  // Reaproveita o mesmo layout de bula do formulário
  function renderBula(box, r) {
    box.innerHTML = '';
    if (r.resumo) {
      const campos = [
        ['Princípio ativo', r.resumo.principioAtivo],
        ['Indicações', r.resumo.indicacoes],
        ['Como usar', r.resumo.comoUsar],
        ['Contraindicações', r.resumo.contraindicacoes],
        ['Efeitos colaterais', r.resumo.efeitosColaterais],
        ['Alerta', r.resumo.alerta],
      ];
      campos.forEach(([rotulo, valor]) => {
        if (!valor) return;
        const item = el('div', 'bula-item');
        item.appendChild(el('div', 'bula-nome', rotulo));
        item.appendChild(el('div', 'bula-texto', valor));
        box.appendChild(item);
      });
    }
    if (r.aviso) box.appendChild(el('p', 'bula-aviso', '⚠️ ' + r.aviso));
    if (r.linkBusca) {
      const a = document.createElement('a');
      a.href = r.linkBusca;
      a.target = '_blank';
      a.rel = 'noopener';
      a.className = 'bula-link';
      a.textContent = 'Ver bula completa na Anvisa';
      box.appendChild(a);
    }
  }

  global.Detalhe = { abrir };
})(window);
