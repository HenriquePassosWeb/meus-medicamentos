-- ============================================================
-- Meus Medicamentos v3 — coluna google_event_id em agendamentos
-- Guarda o id do evento criado no Google Agenda, para futura
-- edição/exclusão do evento pela API. Rode no SQL Editor.
-- ============================================================

alter table agendamentos
  add column if not exists google_event_id text;
