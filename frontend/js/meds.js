// ===== Domínio: medicamentos, regras de estoque, histórico =====
// Mantém um CACHE em memória dos dados do usuário. Os getters (listar, obter,
// resumo, historico...) são SÍNCRONOS e leem do cache, então as telas não
// precisam mudar. As escritas são ASSÍNCRONAS: atualizam o Supabase e o cache.
//
// O cache é preenchido por carregar(usuarioId), chamado no boot do app após o
// login (ver app.js). Enquanto não carregar, os getters retornam listas vazias.
(function (global) {
  'use strict';

  const Store = global.Store;
  const Auth = global.Auth;

  // Cache em memória (fonte de leitura síncrona das telas).
  let cache = { medicamentos: [], historico: [], agendamentos: [], tiposCustom: [] };
  let carregado = false;

  // Cache de URLs assinadas de foto por id de medicamento (evita regerar a cada abertura).
  const urlFotoCache = new Map();

  // Tipos fixos do sistema (não podem ser removidos).
  const TIPOS_FIXOS = {
    caixa:      { icone: '📦', unidadePadrao: 'caixas', rotuloQtd: 'Quantidade de caixas', rotulo: 'Caixa fechada' },
    comprimido: { icone: '💊', unidadePadrao: 'comp.',  rotuloQtd: 'Quantidade de comprimidos', rotulo: 'Comprimidos' },
    liquido:    { icone: '🧴', unidadePadrao: 'frasco', rotuloQtd: 'Quantidade', rotulo: 'Frasco líquido' },
  };

  const NIVEIS = {
    cheio:  { rotulo: 'Cheio',  icone: '🟩', ordem: 3 },
    metade: { rotulo: 'Metade', icone: '🟨', ordem: 2 },
    pouco:  { rotulo: 'Pouco',  icone: '🟧', ordem: 1 },
    vazio:  { rotulo: 'Vazio',  icone: '🟥', ordem: 0 },
  };
  const ORDEM_NIVEL = ['vazio', 'pouco', 'metade', 'cheio'];

  function usuarioId() {
    const u = Auth.usuarioAtual();
    return u ? u.id : null;
  }

  // Carrega todos os dados do usuário para o cache. Chamado no boot.
  async function carregar() {
    if (!usuarioId()) {
      cache = { medicamentos: [], historico: [], agendamentos: [], tiposCustom: [] };
      carregado = false;
      return;
    }
    cache = await Store.carregarTudo(usuarioId());
    carregado = true;
  }

  function limpar() {
    cache = { medicamentos: [], historico: [], agendamentos: [], tiposCustom: [] };
    carregado = false;
    urlFotoCache.clear();
  }

  function estaCarregado() {
    return carregado;
  }

  function listar() {
    return cache.medicamentos;
  }

  function obter(id) {
    return listar().find((m) => m.id === id) || null;
  }

  function historico() {
    return cache.historico;
  }

  // ---- Tipos de embalagem (fixos + personalizados do usuário) ----
  function tiposPersonalizados() {
    return cache.tiposCustom || [];
  }

  function tipos() {
    const todos = Object.assign({}, TIPOS_FIXOS);
    tiposPersonalizados().forEach((t) => {
      todos[t.chave] = {
        icone: t.icone || '💠',
        unidadePadrao: t.unidadePadrao || 'un.',
        rotuloQtd: 'Quantidade',
        rotulo: t.rotulo,
        custom: true,
      };
    });
    return todos;
  }

  function obterTipo(chave) {
    const todos = tipos();
    return todos[chave] || todos.caixa;
  }

  function ehTipoFixo(chave) {
    return Object.prototype.hasOwnProperty.call(TIPOS_FIXOS, chave);
  }

  function normalizarChave(rotulo) {
    return (rotulo || '')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 30);
  }

  async function adicionarTipo(rotulo, icone, unidadePadrao) {
    rotulo = (rotulo || '').trim();
    if (!rotulo) throw new Error('Informe o nome do tipo.');
    const chave = normalizarChave(rotulo);
    if (!chave) throw new Error('Nome inválido.');
    if (tipos()[chave]) throw new Error('Já existe um tipo com esse nome.');

    const novo = {
      id: Store.gerarId(),
      chave,
      rotulo,
      icone: (icone || '💠').trim() || '💠',
      unidadePadrao: (unidadePadrao || 'un.').trim() || 'un.',
    };
    const salvo = await Store.inserirTipo(novo, usuarioId());
    cache.tiposCustom.push(salvo);
    return chave;
  }

  async function removerTipo(chave) {
    if (ehTipoFixo(chave)) throw new Error('Tipos padrão não podem ser removidos.');
    const emUso = listar().some((m) => m.tipo === chave);
    if (emUso) throw new Error('Há medicamentos usando esse tipo. Altere-os antes de remover.');
    await Store.excluirTipoPorChave(chave, usuarioId());
    cache.tiposCustom = (cache.tiposCustom || []).filter((t) => t.chave !== chave);
  }

  // ---- Agendamentos ----
  function listarAgendamentos() {
    return cache.agendamentos || [];
  }

  function agendamentosDoMed(medId) {
    return listarAgendamentos().filter((a) => a.medId === medId);
  }

  async function adicionarAgendamento(ag) {
    const salvo = await Store.inserirAgendamento(ag, usuarioId());
    cache.agendamentos.push(salvo);
    return salvo;
  }

  async function removerAgendamento(id) {
    await Store.excluirAgendamento(id);
    cache.agendamentos = (cache.agendamentos || []).filter((a) => a.id !== id);
  }

  // ---- Medicamentos ----
  // Uma foto "nova" chega como data URL (base64) vinda do formulário. Um caminho
  // já salvo no Storage não começa com "data:". Vazio significa sem foto.
  function ehFotoNova(valor) {
    return typeof valor === 'string' && valor.startsWith('data:');
  }

  async function salvar(med) {
    const ehNovo = !med.id;
    if (ehNovo) {
      med.id = Store.gerarId();
    }

    // Foto anterior (para decidir se precisa apagar do Storage).
    const anterior = ehNovo ? null : obter(med.id);
    const caminhoAntigo = anterior && !ehFotoNova(anterior.foto) ? anterior.foto : '';

    // Resolve o campo foto: envia ao Storage se for nova; mantém o caminho se não mudou.
    if (ehFotoNova(med.foto)) {
      med.foto = await Store.enviarFoto(med.foto, usuarioId(), med.id);
    }
    // Se med.foto vier vazio, o medicamento fica sem foto (a antiga é apagada abaixo).

    const salvo = await Store.salvarMedicamento(med, usuarioId());

    // Limpa a foto antiga do bucket se ela foi trocada ou removida.
    if (caminhoAntigo && caminhoAntigo !== salvo.foto) {
      await Store.apagarFoto(caminhoAntigo);
      urlFotoCache.delete(med.id);
    }

    const idx = cache.medicamentos.findIndex((m) => m.id === salvo.id);
    if (idx !== -1) {
      cache.medicamentos[idx] = salvo;
    } else {
      cache.medicamentos.push(salvo);
    }

    if (ehNovo) {
      await registrar(salvo, 'cadastro', 'Cadastrado no sistema');
    }
    return salvo;
  }

  async function excluir(id) {
    const med = obter(id);
    await Store.excluirMedicamento(id);
    // Apaga a foto do bucket (best-effort). O caminho está em med.foto.
    if (med && med.foto && !ehFotoNova(med.foto)) {
      await Store.apagarFoto(med.foto);
    }
    urlFotoCache.delete(id);
    cache.medicamentos = cache.medicamentos.filter((m) => m.id !== id);
    // agendamentos do medicamento somem em cascata no banco (on delete cascade);
    // refletimos isso no cache.
    cache.agendamentos = (cache.agendamentos || []).filter((a) => a.medId !== id);
  }

  // Retorna a URL de exibição da foto do medicamento (sob demanda). Vazio se não tem.
  async function carregarFoto(id) {
    const med = obter(id);
    if (!med || !med.foto || ehFotoNova(med.foto)) return '';
    if (urlFotoCache.has(id)) return urlFotoCache.get(id);
    const url = await Store.urlDaFoto(med.foto);
    urlFotoCache.set(id, url);
    return url;
  }

  // Indica se o medicamento tem foto salva (sem precisar carregá-la).
  function temFoto(med) {
    return Boolean(med && med.foto && !ehFotoNova(med.foto));
  }

  async function ajustarQuantidade(id, delta) {
    const med = obter(id);
    if (!med) return null;
    const anterior = Number(med.quantidade) || 0;
    if (anterior + delta < 0 && anterior === 0) return med;

    // Usa a função segura do banco (Forma B): serve para o dono e, no futuro,
    // para convidados. Ela aplica o greatest(0, ...) e só mexe na quantidade.
    const atualizado = await Store.ajustarQuantidadeSegura(id, delta);
    if (atualizado.quantidade === anterior) return atualizado;

    substituirNoCache(atualizado);
    const verbo = delta > 0 ? 'entrada' : 'saida';
    await registrar(atualizado, verbo, (delta > 0 ? '+' : '') + delta + ' ' + (med.unidade || ''));
    return atualizado;
  }

  async function ajustarNivel(id, delta) {
    const med = obter(id);
    if (!med) return null;
    let idx = ORDEM_NIVEL.indexOf(med.nivel);
    if (idx === -1) idx = ORDEM_NIVEL.length - 1;
    const novoIdx = Math.min(ORDEM_NIVEL.length - 1, Math.max(0, idx + delta));
    if (novoIdx === idx) return med;

    const novoNivel = ORDEM_NIVEL[novoIdx];
    const atualizado = await Store.atualizarCamposMedicamento(id, { nivel: novoNivel });
    substituirNoCache(atualizado);
    await registrar(atualizado, delta > 0 ? 'entrada' : 'saida', 'Nível: ' + NIVEIS[novoNivel].rotulo);
    return atualizado;
  }

  function substituirNoCache(med) {
    const idx = cache.medicamentos.findIndex((m) => m.id === med.id);
    if (idx !== -1) cache.medicamentos[idx] = med;
  }

  async function registrar(med, tipo, descricao) {
    const registro = {
      id: Store.gerarId(),
      medId: med.id,
      medNome: med.nome,
      tipo, // cadastro | entrada | saida
      descricao,
      em: new Date().toISOString(),
    };
    const salvo = await Store.inserirHistorico(registro, usuarioId());
    cache.historico.unshift(salvo);
    if (cache.historico.length > 300) cache.historico.length = 300;
  }

  // ---- Regras de status ----
  function estaAcabando(med) {
    if (med.tipo === 'liquido') return med.nivel === 'pouco' || med.nivel === 'vazio';
    const minimo = Number(med.minimo);
    if (!minimo || minimo <= 0) return false;
    return Number(med.quantidade) <= minimo;
  }

  function mesesAteVencer(validade) {
    if (!validade) return null;
    const [ano, mes] = validade.split('-').map(Number);
    if (!ano || !mes) return null;
    const fim = new Date(ano, mes, 0);
    return (fim - new Date()) / (1000 * 60 * 60 * 24 * 30.44);
  }

  function estaVencendo(med) {
    const m = mesesAteVencer(med.validade);
    return m !== null && m >= 0 && m <= 3;
  }

  function estaVencido(med) {
    const m = mesesAteVencer(med.validade);
    return m !== null && m < 0;
  }

  function prioridade(med) {
    if (estaVencido(med)) return 0;
    if (estaAcabando(med)) return 1;
    if (estaVencendo(med)) return 2;
    return 3;
  }

  function descricaoEstoque(med) {
    if (med.tipo === 'liquido') {
      const nivel = NIVEIS[med.nivel] || NIVEIS.cheio;
      return 'Frasco: ' + nivel.rotulo.toLowerCase();
    }
    const unidade = med.unidade || obterTipo(med.tipo).unidadePadrao;
    return (Number(med.quantidade) || 0) + ' ' + unidade;
  }

  function resumo() {
    const meds = listar();
    return {
      total: meds.length,
      acabando: meds.filter(estaAcabando).length,
      vencendo: meds.filter((m) => estaVencendo(m) || estaVencido(m)).length,
    };
  }

  // ---- Compartilhamento ----

  // Gera um convite (o usuário atual passa a compartilhar o próprio estoque).
  async function gerarConvite() {
    const u = Auth.usuarioAtual();
    if (!u) throw new Error('Faça login para compartilhar.');
    return Store.criarConvite(u.id, u.nome);
  }

  // Aceita um convite pelo código.
  async function aceitarConvite(codigo) {
    if (!codigo || !codigo.trim()) throw new Error('Informe o código do convite.');
    return Store.aceitarConvite(codigo);
  }

  // Lista os compartilhamentos do usuário como UMA lista unificada, já que o
  // acesso é mão dupla (não importa quem convidou quem). Cada item traz:
  //   { id, status, pendente, codigo, parceiroNome }
  // - status 'aceito'  -> vínculo ativo (parceiroNome = a outra pessoa)
  // - status 'pendente'-> convite que EU gerei e ninguém aceitou ainda
  // Revogados são omitidos. Convites pendentes só aparecem para quem os criou (o dono).
  async function listarCompartilhamentos() {
    const u = Auth.usuarioAtual();
    if (!u) return [];
    const todos = await Store.listarCompartilhamentos(u.id);

    return todos
      .filter((c) => c.status !== 'revogado')
      .filter((c) => c.status === 'aceito' || c.donoId === u.id) // pendente só p/ o dono
      .map((c) => {
        const souDono = c.donoId === u.id;
        const parceiroNome = souDono ? c.convidadoNome : c.donoNome;
        return {
          id: c.id,
          status: c.status,
          pendente: c.status === 'pendente',
          codigo: c.codigo,
          parceiroNome: parceiroNome || 'Outro usuário',
        };
      });
  }

  async function revogarCompartilhamento(id) {
    await Store.revogarCompartilhamento(id);
  }

  // Lista os "parceiros" cujo estoque eu posso ver (compartilhamento é MÃO DUPLA):
  // - donos que me aceitaram (eu sou convidado)
  // - convidados que aceitaram meu convite (eu sou dono)
  // Retorna [{ usuarioId, nome }] sem duplicar.
  async function parceirosDeCompartilhamento() {
    const u = Auth.usuarioAtual();
    if (!u) return [];
    const todos = await Store.listarCompartilhamentos(u.id);
    const aceitos = todos.filter((c) => c.status === 'aceito');
    const parceiros = new Map();
    aceitos.forEach((c) => {
      // O parceiro é sempre a OUTRA pessoa do vínculo (nunca eu mesmo).
      const outroId = c.donoId === u.id ? c.convidadoId : c.donoId;
      const outroNome = c.donoId === u.id ? c.convidadoNome : c.donoNome;
      if (!outroId || outroId === u.id) return; // proteção: nunca me listar
      if (!parceiros.has(outroId)) {
        parceiros.set(outroId, outroNome || 'Outro usuário');
      }
    });
    return Array.from(parceiros, ([usuarioId, nome]) => ({ usuarioId, nome }));
  }

  // Busca cruzada: dado um termo, retorna os medicamentos dos estoques dos
  // parceiros (mão dupla), já anotados com a origem.
  // Cada item ganha { compartilhado: true, donoNome } para a UI diferenciar.
  async function buscarEmCompartilhados(termo) {
    const u = Auth.usuarioAtual();
    if (!u) return [];
    const parceiros = await parceirosDeCompartilhamento();
    if (!parceiros.length) return [];
    const t = (termo || '').trim().toLowerCase();

    const resultados = [];
    const vistos = new Set(); // evita o mesmo medicamento aparecer 2x
    for (const parceiro of parceiros) {
      const meds = await Store.listarMedicamentosDoDono(parceiro.usuarioId);
      meds.forEach((m) => {
        // Proteções: nunca mostrar meus próprios itens, nem duplicar.
        if (m.usuarioId === u.id) return;
        if (vistos.has(m.id)) return;
        if (t && !((m.nome + ' ' + (m.obs || '')).toLowerCase().includes(t))) return;
        vistos.add(m.id);
        m.compartilhado = true;
        m.donoNome = parceiro.nome;
        resultados.push(m);
      });
    }
    return resultados;
  }

  // Ajusta a quantidade de um medicamento compartilhado (de outro dono).
  // Passa pela função segura; não mexe no cache local (não é meu estoque).
  async function ajustarQuantidadeCompartilhado(medId, delta) {
    return Store.ajustarQuantidadeSegura(medId, delta);
  }

  // ---- Backup / portabilidade (LGPD) ----
  // NOTA: com o Storage, o campo "foto" é apenas o CAMINHO no bucket, não a imagem.
  // Um backup exportado não carrega as fotos (nem as restaura ao importar).
  //
  // async: além dos dados em cache, inclui os compartilhamentos (busca no banco),
  // para a exportação cobrir TUDO que é do usuário (direito de portabilidade).
  async function exportar() {
    const u = Auth.usuarioAtual();
    let compartilhamentos = [];
    try {
      compartilhamentos = await listarCompartilhamentos();
    } catch (e) {
      console.warn('Não foi possível incluir compartilhamentos no backup:', e.message);
    }
    return {
      versao: 3,
      exportadoEm: new Date().toISOString(),
      usuario: u ? { id: u.id, nome: u.nome, email: u.email } : null,
      dados: {
        medicamentos: cache.medicamentos,
        historico: cache.historico,
        agendamentos: cache.agendamentos,
        tiposCustom: cache.tiposCustom,
        compartilhamentos,
      },
    };
  }

  // Importa um backup para a nuvem. Sempre MESCLA por id/chave (não duplica).
  // O parâmetro substituir apaga os medicamentos atuais antes de importar.
  async function importar(pacote, substituir) {
    if (!pacote || !pacote.dados || !Array.isArray(pacote.dados.medicamentos)) {
      throw new Error('Arquivo de backup inválido.');
    }
    const entrada = pacote.dados;

    if (substituir) {
      // Remove os medicamentos atuais (agendamentos somem em cascata).
      const atuais = cache.medicamentos.slice();
      for (const m of atuais) {
        await excluir(m.id);
      }
    }

    let adicionados = 0;
    const idsExistentes = new Set(cache.medicamentos.map((m) => m.id));
    for (const m of entrada.medicamentos) {
      if (idsExistentes.has(m.id)) continue;
      // gera novo id para evitar colisão entre usuários diferentes
      const copia = Object.assign({}, m, { id: '' });
      await salvar(copia);
      adicionados++;
    }

    // tipos personalizados
    const chavesTipos = new Set((cache.tiposCustom || []).map((t) => t.chave));
    for (const t of (entrada.tiposCustom || [])) {
      if (!chavesTipos.has(t.chave)) {
        try {
          await adicionarTipo(t.rotulo, t.icone, t.unidadePadrao);
        } catch (e) {
          // ignora tipo duplicado/ inválido no import
          console.warn('Tipo ignorado no import:', t.chave, e.message);
        }
      }
    }

    return adicionados;
  }

  global.Meds = {
    carregar,
    limpar,
    estaCarregado,
    tipos,
    obterTipo,
    ehTipoFixo,
    adicionarTipo,
    removerTipo,
    tiposPersonalizados,
    NIVEIS,
    listar,
    obter,
    historico,
    listarAgendamentos,
    agendamentosDoMed,
    adicionarAgendamento,
    removerAgendamento,
    salvar,
    excluir,
    carregarFoto,
    temFoto,
    ajustarQuantidade,
    ajustarNivel,
    gerarConvite,
    aceitarConvite,
    listarCompartilhamentos,
    revogarCompartilhamento,
    buscarEmCompartilhados,
    ajustarQuantidadeCompartilhado,
    estaAcabando,
    estaVencendo,
    estaVencido,
    mesesAteVencer,
    prioridade,
    descricaoEstoque,
    resumo,
    exportar,
    importar,
  };
})(window);
