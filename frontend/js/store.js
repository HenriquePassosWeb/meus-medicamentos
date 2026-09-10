// ===== Camada de dados: Supabase (nuvem) =====
// Isola todo acesso ao banco. Nenhuma outra parte do app fala direto com o
// supabaseClient — passa sempre por aqui. Todas as funções são assíncronas.
//
// Cada linha das tabelas tem usuario_id preenchido com o id do usuário logado,
// e o RLS no banco garante que ninguém lê/grava linhas de outro usuário.
(function (global) {
  'use strict';

  const client = global.supabaseClient;

  function gerarId() {
    // Usa o gerador nativo quando disponível; senão, um fallback simples.
    if (global.crypto && typeof global.crypto.randomUUID === 'function') {
      return global.crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function erroSupabase(contexto, error) {
    console.error('Supabase [' + contexto + ']:', error);
    return new Error('Não foi possível ' + contexto + '. ' + (error.message || ''));
  }

  // ---- Conversão banco (snake_case) <-> app (camelCase) ----

  function medDoBanco(r) {
    return {
      id: r.id,
      usuarioId: r.usuario_id,
      nome: r.nome,
      tipo: r.tipo,
      quantidade: r.quantidade,
      nivel: r.nivel,
      minimo: r.minimo,
      unidade: r.unidade,
      validade: r.validade || '',
      obs: r.obs || '',
      foto: r.foto || '',
      bula: r.bula || null,
      criadoEm: r.criado_em,
    };
  }

  function medParaBanco(m, usuarioId) {
    return {
      id: m.id,
      usuario_id: usuarioId,
      nome: m.nome,
      tipo: m.tipo,
      quantidade: m.quantidade,
      nivel: m.nivel,
      minimo: m.minimo,
      unidade: m.unidade,
      validade: m.validade || null,
      obs: m.obs || null,
      foto: m.foto || null,
      bula: m.bula || null,
    };
  }

  function agDoBanco(r) {
    return {
      id: r.id,
      medId: r.med_id,
      medNome: r.med_nome,
      hora: r.hora,
      repeticao: r.repeticao,
      recorrencia: r.recorrencia,
      criadoEm: r.criado_em,
    };
  }

  function agParaBanco(a, usuarioId) {
    return {
      id: a.id,
      usuario_id: usuarioId,
      med_id: a.medId || null,
      med_nome: a.medNome || null,
      hora: a.hora || null,
      repeticao: a.repeticao || null,
      recorrencia: a.recorrencia || null,
    };
  }

  function histDoBanco(r) {
    return {
      id: r.id,
      medId: r.med_id,
      medNome: r.med_nome,
      tipo: r.tipo,
      descricao: r.descricao,
      em: r.em,
    };
  }

  function histParaBanco(h, usuarioId) {
    return {
      id: h.id,
      usuario_id: usuarioId,
      med_id: h.medId || null,
      med_nome: h.medNome || null,
      tipo: h.tipo,
      descricao: h.descricao || null,
      em: h.em || new Date().toISOString(),
    };
  }

  function tipoDoBanco(r) {
    return {
      id: r.id,
      chave: r.chave,
      rotulo: r.rotulo,
      icone: r.icone,
      unidadePadrao: r.unidade_padrao,
    };
  }

  function tipoParaBanco(t, usuarioId) {
    return {
      id: t.id,
      usuario_id: usuarioId,
      chave: t.chave,
      rotulo: t.rotulo,
      icone: t.icone || null,
      unidade_padrao: t.unidadePadrao || null,
    };
  }

  // ---- Carga inicial: busca tudo do usuário de uma vez ----
  async function carregarTudo(usuarioId) {
    // IMPORTANTE: filtramos explicitamente por usuario_id. A policy de leitura de
    // medicamentos foi AMPLIADA para o compartilhamento (permite ler o estoque de
    // parceiros), então sem este filtro o cache traria itens de outras pessoas
    // como se fossem do próprio usuário. A carga inicial é SEMPRE só o meu estoque.
    const [meds, ags, hist, tipos] = await Promise.all([
      // Não trazemos "foto" na carga inicial: a coluna guarda só o caminho no
      // Storage e a imagem é carregada sob demanda (urlDaFoto) ao abrir o detalhe.
      client.from('medicamentos').select('id, usuario_id, nome, tipo, quantidade, nivel, minimo, unidade, validade, obs, foto, bula, criado_em').eq('usuario_id', usuarioId).order('criado_em', { ascending: true }),
      client.from('agendamentos').select('id, usuario_id, med_id, med_nome, hora, repeticao, recorrencia, criado_em').eq('usuario_id', usuarioId).order('hora', { ascending: true }),
      client.from('historico').select('id, usuario_id, med_id, med_nome, tipo, descricao, em').eq('usuario_id', usuarioId).order('em', { ascending: false }).limit(300),
      client.from('tipos_custom').select('id, usuario_id, chave, rotulo, icone, unidade_padrao').eq('usuario_id', usuarioId).order('rotulo', { ascending: true }),
    ]);

    if (meds.error) throw erroSupabase('carregar os medicamentos', meds.error);
    if (ags.error) throw erroSupabase('carregar os agendamentos', ags.error);
    if (hist.error) throw erroSupabase('carregar o histórico', hist.error);
    if (tipos.error) throw erroSupabase('carregar os tipos', tipos.error);

    return {
      medicamentos: meds.data.map(medDoBanco),
      agendamentos: ags.data.map(agDoBanco),
      historico: hist.data.map(histDoBanco),
      tiposCustom: tipos.data.map(tipoDoBanco),
    };
  }

  // ---- Medicamentos ----
  async function salvarMedicamento(med, usuarioId) {
    const linha = medParaBanco(med, usuarioId);
    const { data, error } = await client
      .from('medicamentos')
      .upsert(linha)
      .select()
      .single();
    if (error) throw erroSupabase('salvar o medicamento', error);
    return medDoBanco(data);
  }

  async function excluirMedicamento(id) {
    const { error } = await client.from('medicamentos').delete().eq('id', id);
    if (error) throw erroSupabase('excluir o medicamento', error);
  }

  async function atualizarCamposMedicamento(id, campos) {
    const { data, error } = await client
      .from('medicamentos')
      .update(campos)
      .eq('id', id)
      .select()
      .single();
    if (error) throw erroSupabase('atualizar o medicamento', error);
    return medDoBanco(data);
  }

  // ---- Agendamentos ----
  async function inserirAgendamento(ag, usuarioId) {
    const { data, error } = await client
      .from('agendamentos')
      .insert(agParaBanco(ag, usuarioId))
      .select()
      .single();
    if (error) throw erroSupabase('salvar o agendamento', error);
    return agDoBanco(data);
  }

  async function excluirAgendamento(id) {
    const { error } = await client.from('agendamentos').delete().eq('id', id);
    if (error) throw erroSupabase('remover o agendamento', error);
  }

  // ---- Histórico ----
  async function inserirHistorico(registro, usuarioId) {
    const { data, error } = await client
      .from('historico')
      .insert(histParaBanco(registro, usuarioId))
      .select()
      .single();
    if (error) throw erroSupabase('registrar o histórico', error);
    return histDoBanco(data);
  }

  // ---- Tipos personalizados ----
  async function inserirTipo(tipo, usuarioId) {
    const { data, error } = await client
      .from('tipos_custom')
      .insert(tipoParaBanco(tipo, usuarioId))
      .select()
      .single();
    if (error) throw erroSupabase('adicionar o tipo', error);
    return tipoDoBanco(data);
  }

  async function excluirTipoPorChave(chave, usuarioId) {
    const { error } = await client
      .from('tipos_custom')
      .delete()
      .eq('chave', chave)
      .eq('usuario_id', usuarioId);
    if (error) throw erroSupabase('remover o tipo', error);
  }

  // ---- Storage de fotos (bucket privado "fotos-medicamentos") ----
  // A coluna medicamentos.foto guarda o CAMINHO do arquivo no bucket
  // (ex.: "<uid>/<medId>.jpg"), nunca o base64. A imagem em si fica no Storage.
  const BUCKET_FOTOS = 'fotos-medicamentos';
  const VALIDADE_URL_ASSINADA = 60 * 60; // 1 hora, em segundos

  // Converte um data URL (base64) em Blob para enviar como arquivo.
  function dataUrlParaBlob(dataUrl) {
    const [cabecalho, base64] = dataUrl.split(',');
    const mime = (cabecalho.match(/data:(.*?);/) || [])[1] || 'image/jpeg';
    const binario = atob(base64);
    const bytes = new Uint8Array(binario.length);
    for (let i = 0; i < binario.length; i++) {
      bytes[i] = binario.charCodeAt(i);
    }
    return new Blob([bytes], { type: mime });
  }

  // Envia a foto (data URL JPEG) para o bucket e retorna o caminho salvo.
  // O caminho começa com o id do usuário (exigência das policies do Storage).
  async function enviarFoto(dataUrl, usuarioId, medId) {
    const caminho = usuarioId + '/' + medId + '.jpg';
    const blob = dataUrlParaBlob(dataUrl);
    const { error } = await client.storage
      .from(BUCKET_FOTOS)
      .upload(caminho, blob, { contentType: 'image/jpeg', upsert: true });
    if (error) throw erroSupabase('enviar a foto', error);
    return caminho;
  }

  // Gera uma URL assinada temporária para exibir a foto (bucket é privado).
  // Retorna '' se não houver caminho.
  async function urlDaFoto(caminho) {
    if (!caminho) return '';
    const { data, error } = await client.storage
      .from(BUCKET_FOTOS)
      .createSignedUrl(caminho, VALIDADE_URL_ASSINADA);
    if (error) throw erroSupabase('carregar a foto', error);
    return data.signedUrl;
  }

  // Apaga o arquivo de foto do bucket (ao excluir o medicamento ou trocar a foto).
  async function apagarFoto(caminho) {
    if (!caminho) return;
    const { error } = await client.storage.from(BUCKET_FOTOS).remove([caminho]);
    // Não propaga erro de arquivo inexistente: apagar é best-effort.
    if (error) console.warn('Falha ao apagar foto do Storage:', error.message);
  }

  // ---- Compartilhamento ----

  function compartDoBanco(r) {
    return {
      id: r.id,
      donoId: r.dono_id,
      convidadoId: r.convidado_id,
      donoNome: r.dono_nome,
      convidadoNome: r.convidado_nome,
      codigo: r.codigo,
      status: r.status,
      criadoEm: r.criado_em,
      respondidoEm: r.respondido_em,
    };
  }

  // Gera um código curto e legível para o convite (evita 0/O, 1/I).
  function gerarCodigo() {
    const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let codigo = '';
    for (let i = 0; i < 6; i++) {
      codigo += alfabeto[Math.floor(Math.random() * alfabeto.length)];
    }
    return codigo;
  }

  // Cria um convite (o dono compartilha o próprio estoque). Retorna o registro.
  async function criarConvite(usuarioId, donoNome) {
    const { data, error } = await client
      .from('compartilhamentos')
      .insert({
        dono_id: usuarioId,
        dono_nome: donoNome || null,
        codigo: gerarCodigo(),
        status: 'pendente',
      })
      .select()
      .single();
    if (error) throw erroSupabase('gerar o convite', error);
    return compartDoBanco(data);
  }

  // Aceita um convite pelo código (via função segura do banco).
  async function aceitarConvite(codigo) {
    const { data, error } = await client.rpc('aceitar_convite', {
      p_codigo: (codigo || '').trim().toUpperCase(),
    });
    if (error) throw new Error(error.message || 'Não foi possível aceitar o convite.');
    return Array.isArray(data) ? compartDoBanco(data[0]) : compartDoBanco(data);
  }

  // Lista todos os vínculos em que o usuário participa (como dono ou convidado).
  async function listarCompartilhamentos(usuarioId) {
    const { data, error } = await client
      .from('compartilhamentos')
      .select('id, dono_id, convidado_id, dono_nome, convidado_nome, codigo, status, criado_em, respondido_em')
      .or('dono_id.eq.' + usuarioId + ',convidado_id.eq.' + usuarioId)
      .order('criado_em', { ascending: false });
    if (error) throw erroSupabase('carregar os compartilhamentos', error);
    return data.map(compartDoBanco);
  }

  // Revoga um vínculo via função segura (funciona para o dono E para o convidado).
  async function revogarCompartilhamento(id) {
    const { error } = await client.rpc('revogar_compartilhamento', { p_id: id });
    if (error) throw new Error(error.message || 'Não foi possível revogar o compartilhamento.');
  }

  // Lê os medicamentos de um dono específico (usado na busca cruzada).
  // A leitura só funciona se houver vínculo aceito (garantido pela policy).
  async function listarMedicamentosDoDono(donoId) {
    const { data, error } = await client
      .from('medicamentos')
      .select('id, usuario_id, nome, tipo, quantidade, nivel, minimo, unidade, validade, obs, foto, bula, criado_em')
      .eq('usuario_id', donoId)
      .order('nome', { ascending: true });
    if (error) throw erroSupabase('carregar o estoque compartilhado', error);
    return data.map(medDoBanco);
  }

  // Ajusta SOMENTE a quantidade via função segura do banco (Forma B).
  // Funciona para o dono e para convidados com vínculo aceito.
  async function ajustarQuantidadeSegura(medId, delta) {
    const { data, error } = await client.rpc('ajustar_quantidade', {
      p_med_id: medId,
      p_delta: delta,
    });
    if (error) throw new Error(error.message || 'Não foi possível alterar a quantidade.');
    return Array.isArray(data) ? medDoBanco(data[0]) : medDoBanco(data);
  }

  global.Store = {
    gerarId,
    carregarTudo,
    salvarMedicamento,
    excluirMedicamento,
    atualizarCamposMedicamento,
    inserirAgendamento,
    excluirAgendamento,
    inserirHistorico,
    inserirTipo,
    excluirTipoPorChave,
    enviarFoto,
    urlDaFoto,
    apagarFoto,
    criarConvite,
    aceitarConvite,
    listarCompartilhamentos,
    revogarCompartilhamento,
    listarMedicamentosDoDono,
    ajustarQuantidadeSegura,
  };
})(window);
