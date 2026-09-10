-- ============================================================
-- Meus Medicamentos v3 — Policies do Storage (bucket de fotos)
-- Cole no SQL Editor do Supabase e execute (RUN) DEPOIS de criar
-- o bucket "fotos-medicamentos" (privado) pelo painel.
--
-- Estratégia de segurança:
--   Cada usuário só acessa arquivos dentro de uma "pasta" com o próprio id.
--   Ex.: fotos-medicamentos/<uid>/<arquivo>.jpg
--   A checagem usa storage.foldername(name)[1] = primeiro nível do caminho.
--   Como o bucket é PRIVADO, a exibição usa URLs assinadas (temporárias).
-- ============================================================

-- OBS: o RLS em storage.objects já vem LIGADO por padrão no Supabase.
-- Não usamos "alter table ... enable row level security" aqui porque essa
-- tabela pertence ao Supabase e o SQL Editor não tem permissão de ALTER
-- (geraria: "must be owner of table objects"). Criar policies é permitido.

-- Limpa policies anteriores com estes nomes (idempotente)
drop policy if exists "fotos med dono le"     on storage.objects;
drop policy if exists "fotos med dono insere" on storage.objects;
drop policy if exists "fotos med dono altera" on storage.objects;
drop policy if exists "fotos med dono apaga"  on storage.objects;

-- SELECT (ler/baixar): só arquivos na pasta do próprio usuário
create policy "fotos med dono le"
  on storage.objects for select
  using (
    bucket_id = 'fotos-medicamentos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- INSERT (upload): só pode gravar dentro da própria pasta
create policy "fotos med dono insere"
  on storage.objects for insert
  with check (
    bucket_id = 'fotos-medicamentos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- UPDATE (substituir arquivo): só na própria pasta
create policy "fotos med dono altera"
  on storage.objects for update
  using (
    bucket_id = 'fotos-medicamentos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- DELETE (apagar): só na própria pasta
create policy "fotos med dono apaga"
  on storage.objects for delete
  using (
    bucket_id = 'fotos-medicamentos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
