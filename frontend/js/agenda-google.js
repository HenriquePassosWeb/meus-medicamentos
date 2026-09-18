// ===== Integração com o Google Agenda (Calendar API) =====
// Grava eventos direto no Google Agenda do usuário, usando o provider_token do
// Google obtido no login (Auth.tokenGoogle()). Chamamos a API do navegador
// (a API do Google Calendar aceita CORS), então não precisa passar pelo backend.
//
// Abordagem A: usa o token da sessão (~1h de validade). Se o token expirou ou
// não existe (usuário logou por e-mail/senha), sinalizamos para o app pedir a
// reconexão com o Google.
(function (global) {
  'use strict';

  const CALENDAR_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

  // Erro específico para "sem token do Google" — o app usa para pedir reconexão.
  class SemTokenGoogle extends Error {}

  function fusoHorario() {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo';
    } catch {
      return 'America/Sao_Paulo';
    }
  }

  // Próxima ocorrência do horário (hoje se ainda não passou, senão amanhã).
  function proximaOcorrencia(hora, minuto) {
    const agora = new Date();
    const d = new Date();
    d.setHours(hora, minuto, 0, 0);
    if (d <= agora) d.setDate(d.getDate() + 1);
    return d;
  }

  // Data no formato RFC3339 (exigido pela API do Google Calendar).
  function paraRfc3339(data) {
    const p = (n) => String(n).padStart(2, '0');
    return data.getFullYear() + '-' + p(data.getMonth() + 1) + '-' + p(data.getDate()) +
      'T' + p(data.getHours()) + ':' + p(data.getMinutes()) + ':00';
  }

  // Cria um evento no Google Agenda do usuário.
  // Parâmetros:
  //   titulo, hora, minuto: dados do lembrete.
  //   recorrencia: string RRULE (ex: 'RRULE:FREQ=DAILY') ou '' para evento único.
  // Retorna o id do evento criado no Google (para futura edição/exclusão).
  async function criarEvento({ titulo, detalhes, hora, minuto, recorrencia }) {
    const token = global.Auth.tokenGoogle();
    if (!token) {
      throw new SemTokenGoogle('Conecte sua conta Google para sincronizar o lembrete.');
    }

    const inicio = proximaOcorrencia(hora, minuto);
    const fim = new Date(inicio.getTime() + 15 * 60 * 1000);
    const tz = fusoHorario();

    const corpo = {
      summary: titulo,
      description: detalhes || 'Lembrete criado pelo app Meus Medicamentos.',
      start: { dateTime: paraRfc3339(inicio), timeZone: tz },
      end: { dateTime: paraRfc3339(fim), timeZone: tz },
      reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 0 }] },
    };
    if (recorrencia) {
      // A API espera um array de regras sem o prefixo "RRULE:" duplicado.
      corpo.recurrence = [recorrencia.startsWith('RRULE:') ? recorrencia : 'RRULE:' + recorrencia];
    }

    const resp = await fetch(CALENDAR_URL, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(corpo),
    });

    if (resp.status === 401 || resp.status === 403) {
      // Token expirado/insuficiente: precisa reconectar com o Google.
      throw new SemTokenGoogle('Sua conexão com o Google expirou. Reconecte para sincronizar.');
    }
    if (!resp.ok) {
      let detalhe = '';
      try { detalhe = (await resp.json()).error?.message || ''; } catch { /* ignore */ }
      throw new Error('Não foi possível criar o evento no Google Agenda. ' + detalhe);
    }

    const evento = await resp.json();
    return evento.id;
  }

  global.AgendaGoogle = { criarEvento, SemTokenGoogle };
})(window);
