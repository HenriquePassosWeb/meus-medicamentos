// ===== Modal de cadastro/edição de medicamento =====
(function (global) {
  'use strict';

  const Meds = global.Meds;
  const UI = global.UI;
  const el = UI.el;

  const Api = global.Api;
  let nivelSelecionado = 'cheio';
  let aoSalvarCallback = null;
  // fotoAtual = o que será salvo: data URL (foto nova), caminho do Storage
  // (foto existente inalterada) ou '' (sem foto).
  let fotoAtual = '';
  // fotoPreviewUrl = URL exibível no <img> (data URL nova ou URL assinada da existente).
  let fotoPreviewUrl = '';
  let bulaAtual = null; // resultado da bula (para persistir junto do medicamento)
  let nomeOriginal = ''; // nome ao abrir a edição (para saber se o usuário mudou)

  function html() {
    return `
    <div class="modal" id="modalMed" hidden>
      <div class="modal-backdrop" data-fechar></div>
      <div class="modal-painel" role="dialog" aria-modal="true" aria-labelledby="modalTitulo">
        <div class="modal-cabecalho">
          <h2 id="modalTitulo">Novo medicamento</h2>
          <button class="botao-icone" aria-label="Fechar" data-fechar>✕</button>
        </div>
        <form id="formMed" class="form" novalidate>
          <input type="hidden" id="fId" />

          <!-- Foto + IA -->
          <div class="foto-area">
            <div class="foto-preview" id="fotoPreview">
              <span class="foto-placeholder">📷</span>
            </div>
            <div class="foto-acoes">
              <input type="file" id="fFoto" accept="image/*" capture="environment" hidden />
              <button type="button" class="btn btn-secundario btn-mini" id="btnFoto">Tirar / escolher foto</button>
              <button type="button" class="btn btn-secundario btn-mini" id="btnIA" hidden>✨ Identificar por IA</button>
              <button type="button" class="btn btn-mini btn-remover-foto" id="btnRemoverFoto" hidden>Remover foto</button>
            </div>
            <p class="foto-status" id="fotoStatus" hidden></p>
          </div>

          <input type="hidden" id="fFotoDados" />

          <label class="campo">
            <span class="campo-label">Nome do medicamento *</span>
            <input type="text" id="fNome" class="campo-input" placeholder="Ex: Paracetamol 750mg" required />
          </label>
          <label class="campo">
            <span class="campo-label">Tipo de embalagem *</span>
            <select id="fTipo" class="campo-input"></select>
          </label>
          <div id="blocoQtd">
            <label class="campo">
              <span class="campo-label" id="lblQtd">Quantidade</span>
              <input type="number" id="fQtd" class="campo-input" min="0" step="1" inputmode="numeric" placeholder="0" />
            </label>
            <label class="campo">
              <span class="campo-label">Avisar quando tiver (ou menos)</span>
              <input type="number" id="fMinimo" class="campo-input" min="0" step="1" inputmode="numeric" placeholder="ex: 2" />
            </label>
          </div>
          <div id="blocoLiq" hidden>
            <span class="campo-label">Nível do frasco</span>
            <div class="niveis" id="niveis">
              <button type="button" class="nivel-btn" data-nivel="cheio">Cheio</button>
              <button type="button" class="nivel-btn" data-nivel="metade">Metade</button>
              <button type="button" class="nivel-btn" data-nivel="pouco">Pouco</button>
              <button type="button" class="nivel-btn" data-nivel="vazio">Vazio</button>
            </div>
          </div>
          <label class="campo">
            <span class="campo-label">Validade</span>
            <input type="month" id="fValidade" class="campo-input" />
          </label>
          <label class="campo">
            <span class="campo-label">Observações</span>
            <textarea id="fObs" class="campo-input" rows="2" placeholder="Ex: guardar na geladeira"></textarea>
          </label>

          <!-- Bula (resumo por IA) -->
          <div class="campo">
            <span class="campo-label">Informações da bula (IA)</span>
            <button type="button" class="btn btn-secundario btn-mini" id="btnBula">💊 Buscar informações</button>
            <p class="bula-status-edicao" id="bulaStatus"></p>
            <div class="bula-resultado" id="bulaResultado" hidden></div>
          </div>

          <div class="form-acoes">
            <button type="button" class="btn btn-perigo" id="fExcluir" hidden>Excluir</button>
            <button type="submit" class="btn btn-primario">Salvar</button>
          </div>
        </form>
      </div>
    </div>`;
  }

  let montado = false;
  function montar() {
    if (montado) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = html();
    document.body.appendChild(wrap.firstElementChild);
    ligar();
    montado = true;
  }

  function q(id) { return document.getElementById(id); }

  function ligar() {
    q('formMed').addEventListener('submit', salvar);
    q('fTipo').addEventListener('change', atualizarPorTipo);
    // Na edição, reavalia o botão de bula conforme o nome é alterado.
    q('fNome').addEventListener('input', () => {
      if (ehEdicao()) atualizarBulaEdicao();
    });
    q('fExcluir').addEventListener('click', excluir);
    q('niveis').addEventListener('click', (ev) => {
      const b = ev.target.closest('.nivel-btn');
      if (b) marcarNivel(b.dataset.nivel);
    });
    q('modalMed').querySelectorAll('[data-fechar]').forEach((n) =>
      n.addEventListener('click', fechar));
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && !q('modalMed').hidden) fechar();
    });

    // Foto + IA
    q('btnFoto').addEventListener('click', () => q('fFoto').click());
    q('fFoto').addEventListener('change', aoEscolherFoto);
    q('btnRemoverFoto').addEventListener('click', removerFoto);
    q('btnIA').addEventListener('click', identificarPorIA);
    // Bula
    q('btnBula').addEventListener('click', buscarBula);
  }

  async function aoEscolherFoto(ev) {
    const arquivo = ev.target.files[0];
    if (!arquivo) return;
    try {
      status('Processando foto...');
      fotoAtual = await UI.lerImagemComprimida(arquivo, 900);
      fotoPreviewUrl = fotoAtual; // data URL nova é exibível direto
      mostrarFoto();
      status('');
    } catch (e) {
      status(e.message, true);
    }
    ev.target.value = '';
  }

  function mostrarFoto() {
    const preview = q('fotoPreview');
    if (fotoPreviewUrl) {
      preview.innerHTML = '';
      const img = document.createElement('img');
      img.src = fotoPreviewUrl;
      img.alt = 'Foto do medicamento';
      preview.appendChild(img);
      // IA só faz sentido para uma foto recém-escolhida (data URL disponível).
      q('btnIA').hidden = !ehFotoNova(fotoAtual);
      q('btnRemoverFoto').hidden = false;
    } else {
      preview.innerHTML = '<span class="foto-placeholder">📷</span>';
      q('btnIA').hidden = true;
      q('btnRemoverFoto').hidden = true;
    }
  }

  function ehFotoNova(valor) {
    return typeof valor === 'string' && valor.startsWith('data:');
  }

  function removerFoto() {
    fotoAtual = '';
    fotoPreviewUrl = '';
    mostrarFoto();
    status('');
  }

  async function identificarPorIA() {
    if (!fotoAtual) return;
    const btn = q('btnIA');
    btn.disabled = true;
    status('Analisando a imagem com IA...');
    try {
      const resp = await Api.identificar(fotoAtual);
      const d = resp.dados || {};
      // Preenche o que veio, sem sobrescrever o que o usuário já digitou à força
      if (d.nome) {
        const nomeCompleto = [capitalizar(d.nome), d.concentracao].filter(Boolean).join(' ');
        q('fNome').value = nomeCompleto;
      }
      if (d.tipo && Meds.tipos()[d.tipo]) {
        q('fTipo').value = d.tipo;
        atualizarPorTipo();
      }
      const obsExtra = [
        d.principioAtivo ? 'Princípio ativo: ' + d.principioAtivo : '',
        d.fabricante ? 'Fabricante: ' + d.fabricante : '',
        d.observacao || '',
      ].filter(Boolean).join(' | ');
      if (obsExtra) {
        q('fObs').value = q('fObs').value ? q('fObs').value + ' | ' + obsExtra : obsExtra;
      }
      const conf = d.confianca ? ' (confiança: ' + d.confianca + ')' : '';
      status('Identificado' + conf + '. Buscando informações da bula...', false);
      // Dispara a busca da bula automaticamente com o nome identificado.
      await buscarBula();
      status('Identificado' + conf + '. Confira os campos.', false);
    } catch (e) {
      status('IA indisponível: ' + e.message, true);
    } finally {
      btn.disabled = false;
    }
  }

  function ehEdicao() {
    return Boolean(q('fId').value);
  }

  function textoBotaoBula() {
    return bulaAtual ? '🔄 Atualizar bula' : '💊 Buscar bula';
  }

  function nomeFoiAlterado() {
    return q('fNome').value.trim().toLowerCase() !== (nomeOriginal || '').trim().toLowerCase();
  }

  // Na edição, não exibe o texto completo (o detalhe já mostra). Só informa o estado.
  // O botão só é habilitado se o nome do produto foi alterado.
  function atualizarBulaEdicao() {
    const box = q('bulaResultado');
    const btn = q('btnBula');
    box.hidden = true;
    box.innerHTML = '';
    btn.textContent = textoBotaoBula();

    if (bulaAtual && !nomeFoiAlterado()) {
      // Tem bula e o nome não mudou: nada a fazer, botão desabilitado.
      btn.disabled = true;
      q('bulaStatus').textContent = '✓ Bula salva.';
    } else if (bulaAtual && nomeFoiAlterado()) {
      // Nome mudou: permite atualizar.
      btn.disabled = false;
      q('bulaStatus').textContent = 'O nome mudou. Toque em "Atualizar bula".';
    } else {
      // Sem bula salva: permite buscar.
      btn.disabled = false;
      q('bulaStatus').textContent = 'Nenhuma bula salva. Toque em "Buscar bula".';
    }
  }

  async function buscarBula() {
    const nome = q('fNome').value.trim();
    if (!nome) {
      UI.toast('Preencha o nome antes de buscar a bula');
      return;
    }
    const btn = q('btnBula');
    const box = q('bulaResultado');
    btn.disabled = true;
    if (ehEdicao()) {
      q('bulaStatus').textContent = 'Buscando informações...';
    } else {
      box.hidden = false;
      box.innerHTML = '<p class="bula-carregando">Buscando informações...</p>';
    }
    try {
      const r = await Api.bula(nome);
      bulaAtual = r; // guarda para persistir ao salvar
      // Novo cadastro: mostra o conteúdo para conferência. Edição: só marca como salva.
      if (ehEdicao()) {
        nomeOriginal = nome; // a bula agora corresponde ao nome atual
        atualizarBulaEdicao(); // desabilita o botão de novo até mudar o nome outra vez
      } else {
        renderBula(box, r);
      }
    } catch (e) {
      if (ehEdicao()) {
        q('bulaStatus').textContent = 'Não foi possível buscar: ' + e.message;
      } else {
        bulaAtual = null;
        box.innerHTML = '<p class="bula-aviso">Não foi possível buscar: ' + e.message + '</p>';
      }
    } finally {
      btn.disabled = false;
    }
  }

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
        const item = document.createElement('div');
        item.className = 'bula-item';
        const t = document.createElement('div');
        t.className = 'bula-nome';
        t.textContent = rotulo;
        const p = document.createElement('div');
        p.className = 'bula-texto';
        p.textContent = valor;
        item.appendChild(t);
        item.appendChild(p);
        box.appendChild(item);
      });
    }

    if (r.aviso) {
      const aviso = document.createElement('p');
      aviso.className = 'bula-aviso';
      aviso.textContent = '⚠️ ' + r.aviso;
      box.appendChild(aviso);
    }
    if (r.linkBusca) {
      box.appendChild(linkBula('Ver bula completa na Anvisa', r.linkBusca));
    }
  }

  function linkBula(texto, url) {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.className = 'bula-link';
    a.textContent = texto;
    return a;
  }

  // Deixa a primeira letra de cada palavra maiúscula e o resto minúsculo.
  // Ex: "DIPIRONA monoidratada" -> "Dipirona Monoidratada".
  function capitalizar(texto) {
    return (texto || '')
      .toLowerCase()
      .replace(/\b\p{L}/gu, (letra) => letra.toUpperCase());
  }

  function status(msg, erro) {
    const node = q('fotoStatus');
    if (!msg) {
      node.hidden = true;
      return;
    }
    node.hidden = false;
    node.textContent = msg;
    node.classList.toggle('erro', Boolean(erro));
  }

  function popularTipos() {
    const select = q('fTipo');
    const todos = Meds.tipos();
    select.innerHTML = '';
    Object.keys(todos).forEach((chave) => {
      const opt = document.createElement('option');
      opt.value = chave;
      opt.textContent = todos[chave].icone + ' ' + todos[chave].rotulo;
      select.appendChild(opt);
    });
  }

  function abrir(med, aoSalvar) {
    montar();
    aoSalvarCallback = aoSalvar;
    q('formMed').reset();
    popularTipos();
    limparNiveis();

    fotoAtual = '';
    fotoPreviewUrl = '';
    bulaAtual = null;
    q('bulaResultado').hidden = true;
    q('bulaResultado').innerHTML = '';
    status('');

    if (med) {
      q('modalTitulo').textContent = 'Editar medicamento';
      q('fId').value = med.id;
      q('fNome').value = med.nome;
      q('fTipo').value = med.tipo;
      q('fQtd').value = med.quantidade != null ? med.quantidade : '';
      q('fMinimo').value = med.minimo != null ? med.minimo : '';
      q('fValidade').value = med.validade || '';
      q('fObs').value = med.obs || '';
      // med.foto é o CAMINHO no Storage. Mantém como valor a salvar e carrega a
      // URL assinada em segundo plano para exibir o preview.
      fotoAtual = med.foto || '';
      if (Meds.temFoto(med)) {
        Meds.carregarFoto(med.id).then((url) => {
          // só aplica se o usuário ainda não trocou/removeu a foto neste modal
          if (fotoAtual === med.foto) {
            fotoPreviewUrl = url;
            mostrarFoto();
          }
        }).catch(() => { /* silencioso: preview fica no placeholder */ });
      }
      nivelSelecionado = med.nivel || 'cheio';
      q('fExcluir').hidden = false;
      // Na EDIÇÃO: preserva a bula salva (sem exibir o texto todo, pois o detalhe já mostra).
      bulaAtual = med.bula || null;
      nomeOriginal = med.nome || '';
      atualizarBulaEdicao();
    } else {
      q('modalTitulo').textContent = 'Novo medicamento';
      q('fId').value = '';
      q('fTipo').value = 'caixa';
      nivelSelecionado = 'cheio';
      q('fExcluir').hidden = true;
      q('bulaStatus').textContent = '';
      // Novo cadastro: botão sempre habilitado.
      q('btnBula').disabled = false;
      q('btnBula').textContent = '💊 Buscar informações';
    }

    mostrarFoto();
    atualizarPorTipo();
    marcarNivel(nivelSelecionado);
    q('modalMed').hidden = false;
    setTimeout(() => q('fNome').focus(), 100);
  }

  function fechar() {
    q('modalMed').hidden = true;
  }

  function atualizarPorTipo() {
    const tipo = q('fTipo').value;
    const meta = Meds.obterTipo(tipo);
    const eLiquido = tipo === 'liquido';
    q('blocoLiq').hidden = !eLiquido;
    q('blocoQtd').hidden = eLiquido;
    q('lblQtd').textContent = meta.rotuloQtd;
  }

  function limparNiveis() {
    q('niveis').querySelectorAll('.nivel-btn').forEach((b) => b.classList.remove('ativo'));
  }

  function marcarNivel(nivel) {
    limparNiveis();
    const b = q('niveis').querySelector('[data-nivel="' + nivel + '"]');
    if (b) b.classList.add('ativo');
    nivelSelecionado = nivel;
  }

  async function salvar(ev) {
    ev.preventDefault();
    const nome = q('fNome').value.trim();
    if (!nome) {
      q('fNome').focus();
      UI.toast('Informe o nome do medicamento');
      return;
    }
    const tipo = q('fTipo').value;
    const meta = Meds.obterTipo(tipo);
    const eLiquido = tipo === 'liquido';
    const id = q('fId').value;

    const med = {
      id: id || '',
      nome,
      tipo,
      quantidade: eLiquido ? null : Math.max(0, Number(q('fQtd').value) || 0),
      unidade: eLiquido ? '' : meta.unidadePadrao,
      minimo: eLiquido ? null : (Number(q('fMinimo').value) || 0),
      nivel: eLiquido ? nivelSelecionado : null,
      validade: q('fValidade').value || '',
      obs: q('fObs').value.trim(),
      foto: fotoAtual || '',
      bula: bulaAtual || null,
    };

    const btnSalvar = q('formMed').querySelector('button[type="submit"]');
    if (btnSalvar) btnSalvar.disabled = true;
    try {
      await Meds.salvar(med);
      UI.toast(id ? 'Medicamento atualizado' : 'Medicamento cadastrado');
      fechar();
      if (aoSalvarCallback) aoSalvarCallback();
      global.dispatchEvent(new CustomEvent('estoque:mudou'));
    } catch (e) {
      UI.toast(e.message || 'Não foi possível salvar');
    } finally {
      if (btnSalvar) btnSalvar.disabled = false;
    }
  }

  async function excluir() {
    const id = q('fId').value;
    if (!id) return;
    const med = Meds.obter(id);
    if (!confirm('Excluir "' + (med ? med.nome : 'este item') + '"?')) return;
    try {
      await Meds.excluir(id);
      UI.toast('Medicamento excluído');
      fechar();
      if (aoSalvarCallback) aoSalvarCallback();
      global.dispatchEvent(new CustomEvent('estoque:mudou'));
    } catch (e) {
      UI.toast(e.message || 'Não foi possível excluir');
    }
  }

  global.FormMed = { abrir };
})(window);
