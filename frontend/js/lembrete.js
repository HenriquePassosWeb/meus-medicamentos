// ===== Lembrete via Google Agenda =====
// Gera um link "adicionar ao Google Agenda" já preenchido. O Google cuida de
// notificar a pessoa no horário, mesmo com o nosso app fechado.
(function (global) {
  'use strict';

  const UI = global.UI;
  const Meds = global.Meds;
  const el = UI.el;

  let medAtual = null;

  const DIAS = [
    { chave: 'MO', rotulo: 'Seg' },
    { chave: 'TU', rotulo: 'Ter' },
    { chave: 'WE', rotulo: 'Qua' },
    { chave: 'TH', rotulo: 'Qui' },
    { chave: 'FR', rotulo: 'Sex' },
    { chave: 'SA', rotulo: 'Sáb' },
    { chave: 'SU', rotulo: 'Dom' },
  ];

  function html() {
    return `
    <div class="modal" id="modalLembrete" hidden>
      <div class="modal-backdrop" data-fechar-lem></div>
      <div class="modal-painel" role="dialog" aria-modal="true">
        <div class="modal-cabecalho">
          <h2>⏰ Criar lembrete</h2>
          <button class="botao-icone" aria-label="Fechar" data-fechar-lem>✕</button>
        </div>
        <div class="form">
          <p class="lem-med" id="lemMed"></p>

          <label class="campo">
            <span class="campo-label">Horário *</span>
            <input type="time" id="lemHora" class="campo-input" value="08:00" />
          </label>

          <div class="campo">
            <span class="campo-label">Repetir</span>
            <select id="lemRepetir" class="campo-input">
              <option value="diario">Todos os dias</option>
              <option value="semana">Dias da semana</option>
              <option value="intervalo">A cada X horas</option>
              <option value="unico">Só uma vez (hoje)</option>
            </select>
          </div>

          <div class="campo" id="lemBlocoDias" hidden>
            <span class="campo-label">Quais dias</span>
            <div class="lem-dias" id="lemDias"></div>
          </div>

          <div class="campo" id="lemBlocoIntervalo" hidden>
            <span class="campo-label">Intervalo (horas)</span>
            <input type="number" id="lemIntervalo" class="campo-input" min="1" max="24" step="1" value="8" inputmode="numeric" />
          </div>

          <label class="campo">
            <span class="campo-label">Duração (dias) — opcional</span>
            <input type="number" id="lemDuracao" class="campo-input" min="1" step="1" placeholder="ex: 7 (deixe vazio p/ sem fim)" inputmode="numeric" />
          </label>

          <p class="lem-aviso">O lembrete é criado no seu Google Agenda. É ele quem vai te notificar no horário, mesmo com este app fechado.</p>

          <div id="lemMultiplos" class="lem-multiplos" hidden></div>

          <div class="form-acoes">
            <button type="button" class="btn btn-primario" id="lemCriar">Abrir no Google Agenda</button>
          </div>
        </div>
      </div>
    </div>`;
  }

  let montado = false;
  function montar() {
    if (montado) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = html();
    document.body.appendChild(wrap.firstElementChild);

    const dias = document.getElementById('lemDias');
    DIAS.forEach((d) => {
      const b = el('button', 'lem-dia-btn', d.rotulo);
      b.type = 'button';
      b.dataset.dia = d.chave;
      b.addEventListener('click', () => b.classList.toggle('ativo'));
      dias.appendChild(b);
    });

    document.getElementById('lemRepetir').addEventListener('change', atualizarCampos);
    document.getElementById('lemCriar').addEventListener('click', criar);
    document.getElementById('modalLembrete')
      .querySelectorAll('[data-fechar-lem]')
      .forEach((n) => n.addEventListener('click', fechar));
    montado = true;
  }

  let aoSalvarCallback = null;

  function abrir(med, aoSalvar) {
    montar();
    medAtual = med;
    aoSalvarCallback = aoSalvar || null;
    document.getElementById('lemMed').textContent = '💊 ' + med.nome;
    document.getElementById('lemRepetir').value = 'diario';
    document.getElementById('lemHora').value = '08:00';
    document.getElementById('lemIntervalo').value = '8';
    document.getElementById('lemDuracao').value = '';
    const multi = document.getElementById('lemMultiplos');
    multi.hidden = true;
    multi.innerHTML = '';
    atualizarCampos();
    document.getElementById('modalLembrete').hidden = false;
  }

  function fechar() {
    document.getElementById('modalLembrete').hidden = true;
  }

  function atualizarCampos() {
    const modo = document.getElementById('lemRepetir').value;
    document.getElementById('lemBlocoDias').hidden = modo !== 'semana';
    document.getElementById('lemBlocoIntervalo').hidden = modo !== 'intervalo';
  }

  // ---- Datas em formato do Google Agenda: AAAAMMDDTHHMMSS ----
  function formatarData(data) {
    const p = (n) => String(n).padStart(2, '0');
    return data.getFullYear() + p(data.getMonth() + 1) + p(data.getDate()) +
      'T' + p(data.getHours()) + p(data.getMinutes()) + '00';
  }

  function proximaOcorrencia(hora, minuto) {
    const agora = new Date();
    const d = new Date();
    d.setHours(hora, minuto, 0, 0);
    if (d <= agora) d.setDate(d.getDate() + 1); // se já passou hoje, começa amanhã
    return d;
  }

  // Monta a regra de recorrência (o Google via link só aceita DAILY/WEEKLY, não HOURLY).
  // Retorna null se faltou escolher dia da semana.
  function montarRecorrencia(modo, duracao) {
    let regra = '';
    if (modo === 'diario' || modo === 'intervalo') {
      // intervalo é tratado como vários eventos DIÁRIOS (um por horário do dia)
      regra = 'RRULE:FREQ=DAILY';
    } else if (modo === 'semana') {
      const dias = Array.from(document.querySelectorAll('#lemDias .lem-dia-btn.ativo'))
        .map((b) => b.dataset.dia);
      if (!dias.length) return null;
      regra = 'RRULE:FREQ=WEEKLY;BYDAY=' + dias.join(',');
    } else {
      return ''; // único: sem recorrência
    }
    if (regra && duracao && duracao > 0) {
      regra += ';COUNT=' + duracao; // uma ocorrência por dia
    }
    return regra;
  }

  // Gera a lista de horários {hora, minuto} do dia. No modo intervalo, calcula
  // 08:00, 16:00, ... a partir do horário inicial somando o intervalo dentro de 24h.
  function montarHorarios(modo, horaInicial, minutoInicial) {
    if (modo !== 'intervalo') {
      return [{ hora: horaInicial, minuto: minutoInicial }];
    }
    const intervalo = Math.min(24, Math.max(1, parseInt(document.getElementById('lemIntervalo').value, 10) || 8));
    const horarios = [];
    const totalMin = horaInicial * 60 + minutoInicial;
    for (let m = totalMin; m < totalMin + 24 * 60; m += intervalo * 60) {
      const minutosNoDia = m % (24 * 60);
      horarios.push({ hora: Math.floor(minutosNoDia / 60), minuto: minutosNoDia % 60 });
    }
    return horarios;
  }

  function fusoHorario() {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    } catch {
      return '';
    }
  }

  function linkEvento(titulo, detalhes, hora, minuto, recorrencia) {
    const inicio = proximaOcorrencia(hora, minuto);
    const fim = new Date(inicio.getTime() + 15 * 60 * 1000);
    const params = new URLSearchParams();
    params.set('action', 'TEMPLATE');
    params.set('text', titulo);
    params.set('dates', formatarData(inicio) + '/' + formatarData(fim));
    params.set('details', detalhes);
    // Envia o fuso explícito para o Google interpretar o horário no fuso do usuário.
    const tz = fusoHorario();
    if (tz) params.set('ctz', tz);
    if (recorrencia) params.set('recur', recorrencia);
    return 'https://calendar.google.com/calendar/render?' + params.toString();
  }

  async function criar() {
    const [hora, minuto] = document.getElementById('lemHora').value.split(':').map(Number);
    if (isNaN(hora)) {
      UI.toast('Informe o horário');
      return;
    }
    const modo = document.getElementById('lemRepetir').value;
    const duracao = parseInt(document.getElementById('lemDuracao').value, 10);

    const recorrencia = montarRecorrencia(modo, duracao);
    if (recorrencia === null) {
      UI.toast('Escolha ao menos um dia da semana');
      return;
    }

    const titulo = 'Tomar ' + medAtual.nome;
    const detalhes = 'Lembrete criado pelo app Meus Medicamentos.';
    const horarios = montarHorarios(modo, hora, minuto);
    const p = (n) => String(n).padStart(2, '0');
    const descricaoRepeticao = descreverRepeticao(modo, duracao);

    const btnCriar = document.getElementById('lemCriar');
    btnCriar.disabled = true;
    try {
      // Salva um agendamento por horário (persistido no medicamento).
      for (const h of horarios) {
        await Meds.adicionarAgendamento({
          medId: medAtual.id,
          medNome: medAtual.nome,
          hora: p(h.hora) + ':' + p(h.minuto),
          repeticao: descricaoRepeticao,
          recorrencia,
        });
      }
    } catch (e) {
      UI.toast(e.message || 'Não foi possível salvar o agendamento');
      btnCriar.disabled = false;
      return;
    }
    btnCriar.disabled = false;
    if (aoSalvarCallback) aoSalvarCallback();

    if (horarios.length === 1) {
      global.open(linkEvento(titulo, detalhes, horarios[0].hora, horarios[0].minuto, recorrencia), '_blank', 'noopener');
      UI.toast('Agendamento salvo. Abrindo o Google Agenda...');
      fechar();
      return;
    }

    // Modo intervalo: salvo. Abre um link por horário para adicionar ao Google.
    confirmarMultiplos(titulo, detalhes, horarios, recorrencia);
  }

  function descreverRepeticao(modo, duracao) {
    let base;
    if (modo === 'diario') base = 'Todos os dias';
    else if (modo === 'semana') {
      const dias = Array.from(document.querySelectorAll('#lemDias .lem-dia-btn.ativo'))
        .map((b) => b.textContent);
      base = dias.join(', ');
    } else if (modo === 'intervalo') {
      const horas = Math.max(1, parseInt(document.getElementById('lemIntervalo').value, 10) || 8);
      base = 'A cada ' + horas + 'h';
    } else base = 'Uma vez';
    if (duracao && duracao > 0) base += ' • por ' + duracao + ' dia(s)';
    return base;
  }

  // Como o navegador bloqueia abrir várias abas de uma vez, mostramos um botão
  // por horário para o usuário adicionar cada um ao Google Agenda.
  function confirmarMultiplos(titulo, detalhes, horarios, recorrencia) {
    const box = document.getElementById('lemMultiplos');
    box.innerHTML = '';
    box.hidden = false;
    const p = (n) => String(n).padStart(2, '0');
    box.appendChild(el('p', 'lem-multi-titulo', 'Agendamento salvo! Adicione cada horário ao Google Agenda:'));
    horarios.forEach((h) => {
      const a = document.createElement('a');
      a.href = linkEvento(titulo, detalhes, h.hora, h.minuto, recorrencia);
      a.target = '_blank';
      a.rel = 'noopener';
      a.className = 'btn btn-secundario btn-bloco lem-multi-btn';
      a.textContent = '➕ Adicionar ' + p(h.hora) + ':' + p(h.minuto);
      box.appendChild(a);
    });
  }

  // Gera o link do Google Agenda a partir de um agendamento salvo (para re-sincronizar).
  function linkDoAgendamento(ag) {
    const [hora, minuto] = (ag.hora || '08:00').split(':').map(Number);
    return linkEvento('Tomar ' + ag.medNome, 'Lembrete criado pelo app Meus Medicamentos.', hora, minuto, ag.recorrencia || '');
  }

  global.Lembrete = { abrir, linkDoAgendamento };
})(window);
