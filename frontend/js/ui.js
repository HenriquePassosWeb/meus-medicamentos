// ===== Utilitários de UI compartilhados =====
(function (global) {
  'use strict';

  const Meds = global.Meds;

  function el(tag, classe, texto) {
    const node = document.createElement(tag);
    if (classe) node.className = classe;
    if (texto != null) node.textContent = texto;
    return node;
  }

  let toastTimer = null;
  function toast(mensagem) {
    let node = document.getElementById('toast');
    if (!node) {
      node = el('div', 'toast');
      node.id = 'toast';
      document.body.appendChild(node);
    }
    node.textContent = mensagem;
    node.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { node.hidden = true; }, 2200);
  }

  function formatarValidade(validade) {
    if (!validade) return '';
    const [ano, mes] = validade.split('-');
    return mes + '/' + ano;
  }

  function formatarDataHora(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR') + ' ' +
      d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  function tagsDoMed(med) {
    const tags = [];
    if (Meds.estaVencido(med)) tags.push({ texto: 'Vencido', classe: 'perigo' });
    else if (Meds.estaVencendo(med)) tags.push({ texto: 'Vence em breve', classe: 'alerta' });
    if (Meds.estaAcabando(med)) tags.push({ texto: 'Acabando', classe: 'alerta' });
    if (med.validade && !Meds.estaVencido(med) && !Meds.estaVencendo(med)) {
      tags.push({ texto: 'Val: ' + formatarValidade(med.validade), classe: '' });
    }
    return tags;
  }

  // Card de item usado na lista de início e na consulta
  function cardMedicamento(med, aoAbrir) {
    const meta = Meds.obterTipo(med.tipo);
    const li = el('li', 'item' + (Meds.estaAcabando(med) || Meds.estaVencido(med) ? ' baixo' : ''));
    li.dataset.id = med.id;

    // A lista usa sempre o ícone do tipo (leve). A foto real, quando existe,
    // é exibida sob demanda na tela de detalhe — evita baixar imagens no boot.
    const icone = el('div', 'item-icone', meta.icone);
    const corpo = el('div', 'item-corpo');
    corpo.appendChild(el('div', 'item-nome', med.nome));
    corpo.appendChild(el('div', 'item-info', Meds.descricaoEstoque(med)));

    const tags = el('div', 'item-tags');
    tagsDoMed(med).forEach((t) => tags.appendChild(el('span', 'tag ' + t.classe, t.texto)));
    if (tags.children.length) corpo.appendChild(tags);

    const controle = controleEstoque(med);

    li.appendChild(icone);
    li.appendChild(corpo);
    li.appendChild(controle);

    const abrir = () => aoAbrir && aoAbrir(med);
    icone.addEventListener('click', abrir);
    corpo.addEventListener('click', abrir);
    return li;
  }

  // Card de um item de OUTRO usuário (busca cruzada). Mostra etiqueta de origem
  // e permite SOMENTE alterar a quantidade (via função segura). Sem abrir detalhe.
  function cardCompartilhado(med) {
    const meta = Meds.obterTipo(med.tipo);
    const li = el('li', 'item item-compartilhado');
    li.dataset.id = med.id;

    const icone = el('div', 'item-icone', meta.icone);
    const corpo = el('div', 'item-corpo');
    corpo.appendChild(el('div', 'item-nome', med.nome));
    corpo.appendChild(el('div', 'item-info', Meds.descricaoEstoque(med)));
    corpo.appendChild(el('span', 'tag tag-origem', '👤 ' + (med.donoNome || 'Outro usuário')));

    // Controle de quantidade (só para tipo não-líquido; líquido usa nível, que
    // não é alterável por convidado — mostramos só o valor).
    const wrap = el('div', 'item-quantidade');
    const eLiquido = med.tipo === 'liquido';
    const valor = el('div', 'qtd-valor');
    if (eLiquido) {
      const nivel = Meds.NIVEIS[med.nivel] || Meds.NIVEIS.cheio;
      valor.textContent = nivel.icone;
      valor.title = nivel.rotulo;
      wrap.appendChild(valor);
    } else {
      valor.textContent = Number(med.quantidade) || 0;
      wrap.appendChild(valor);
      const controles = el('div', 'qtd-controles');
      const menos = botao('−', () => aplicarCompartilhado(med, -1, valor, menos));
      const mais = botao('+', () => aplicarCompartilhado(med, +1, valor, menos));
      if ((Number(med.quantidade) || 0) <= 0) menos.disabled = true;
      controles.appendChild(menos);
      controles.appendChild(mais);
      wrap.appendChild(controles);
    }

    li.appendChild(icone);
    li.appendChild(corpo);
    li.appendChild(wrap);
    return li;
  }

  async function aplicarCompartilhado(med, delta, valorNode, botaoMenos) {
    let atualizado;
    try {
      atualizado = await Meds.ajustarQuantidadeCompartilhado(med.id, delta);
    } catch (e) {
      toast(e.message || 'Não foi possível alterar a quantidade');
      return;
    }
    med.quantidade = atualizado.quantidade;
    valorNode.textContent = Number(med.quantidade) || 0;
    if (botaoMenos) botaoMenos.disabled = (Number(med.quantidade) || 0) <= 0;
  }

  function controleEstoque(med) {
    const wrap = el('div', 'item-quantidade');
    const eLiquido = med.tipo === 'liquido';

    const valor = el('div', 'qtd-valor');
    if (eLiquido) {
      const nivel = Meds.NIVEIS[med.nivel] || Meds.NIVEIS.cheio;
      valor.textContent = nivel.icone;
      valor.title = nivel.rotulo;
    } else {
      valor.textContent = Number(med.quantidade) || 0;
    }
    wrap.appendChild(valor);

    const controles = el('div', 'qtd-controles');
    const menos = botao('−', () => aplicar(med, -1, valor, menos));
    const mais = botao('+', () => aplicar(med, +1, valor, menos));
    if (!eLiquido && (Number(med.quantidade) || 0) <= 0) menos.disabled = true;
    controles.appendChild(menos);
    controles.appendChild(mais);
    wrap.appendChild(controles);
    return wrap;
  }

  async function aplicar(med, delta, valorNode, botaoMenos) {
    let atualizado;
    try {
      atualizado = med.tipo === 'liquido'
        ? await Meds.ajustarNivel(med.id, delta)
        : await Meds.ajustarQuantidade(med.id, delta);
    } catch (e) {
      toast(e.message || 'Não foi possível atualizar o estoque');
      return;
    }
    if (!atualizado) return;
    Object.assign(med, atualizado);
    if (med.tipo === 'liquido') {
      const nivel = Meds.NIVEIS[med.nivel] || Meds.NIVEIS.cheio;
      valorNode.textContent = nivel.icone;
      valorNode.title = nivel.rotulo;
    } else {
      valorNode.textContent = Number(med.quantidade) || 0;
      botaoMenos.disabled = (Number(med.quantidade) || 0) <= 0;
    }
    global.dispatchEvent(new CustomEvent('estoque:mudou'));
  }

  function botao(texto, aoClicar) {
    const b = el('button', 'qtd-btn');
    b.type = 'button';
    b.textContent = texto;
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      aoClicar();
    });
    return b;
  }

  // Lê um arquivo de imagem e devolve um data URL JPEG redimensionado/comprimido.
  // Necessário porque fotos de câmera são grandes demais para o localStorage.
  function lerImagemComprimida(arquivo, larguraMax) {
    larguraMax = larguraMax || 900;
    return new Promise((resolve, reject) => {
      if (!arquivo || !arquivo.type.startsWith('image/')) {
        reject(new Error('Selecione um arquivo de imagem.'));
        return;
      }
      const leitor = new FileReader();
      leitor.onerror = () => reject(new Error('Falha ao ler a imagem.'));
      leitor.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Imagem inválida.'));
        img.onload = () => {
          const escala = Math.min(1, larguraMax / img.width);
          const largura = Math.round(img.width * escala);
          const altura = Math.round(img.height * escala);
          const canvas = document.createElement('canvas');
          canvas.width = largura;
          canvas.height = altura;
          canvas.getContext('2d').drawImage(img, 0, 0, largura, altura);
          resolve(canvas.toDataURL('image/jpeg', 0.7));
        };
        img.src = leitor.result;
      };
      leitor.readAsDataURL(arquivo);
    });
  }

  global.UI = {
    el,
    toast,
    formatarValidade,
    formatarDataHora,
    tagsDoMed,
    cardMedicamento,
    cardCompartilhado,
    lerImagemComprimida,
  };
})(window);
