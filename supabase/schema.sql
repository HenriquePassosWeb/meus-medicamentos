-- ============================================================
-- Meus Medicamentos v3 — Schema inicial (Supabase / PostgreSQL)
-- Cole este arquivo inteiro no SQL Editor do painel do Supabase
-- e execute (RUN). Idempotente: pode rodar mais de uma vez.
-- ============================================================

-- ------------------------------------------------------------
-- 1. TABELAS
-- ------------------------------------------------------------

-- Perfil público do usuário (nome exibível, etc.)
create table if not exists perfis (
  id         uuid primary key references auth.users(id) on delete cascade,
  nome       text not null,
  criado_em  timestamptz not null default now()
);

-- Medicamentos
create table if not exists medicamentos (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null references auth.users(id) on delete cascade,
  nome        text not null,
  tipo        text not null,
  quantidade  numeric,
  nivel       text,
  minimo      numeric,
  unidade     text,
  validade    text,          -- 'AAAA-MM'
  obs         text,
  foto        text,          -- data URL (base64) ou URL do Storage
  bula        jsonb,
  criado_em   timestamptz not null default now()
);

-- Agendamentos (lembretes)
create table if not exists agendamentos (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null references auth.users(id) on delete cascade,
  med_id      uuid references medicamentos(id) on delete cascade,
  med_nome    text,
  hora        text,          -- 'HH:MM'
  repeticao   text,
  recorrencia text,          -- RRULE do Google
  criado_em   timestamptz not null default now()
);

-- Histórico de movimentações de estoque
create table if not exists historico (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null references auth.users(id) on delete cascade,
  med_id      uuid references medicamentos(id) on delete set null,
  med_nome    text,
  tipo        text not null, -- 'cadastro' | 'entrada' | 'saida'
  descricao   text,
  em          timestamptz not null default now()
);

-- Tipos de embalagem personalizados
create table if not exists tipos_custom (
  id             uuid primary key default gen_random_uuid(),
  usuario_id     uuid not null references auth.users(id) on delete cascade,
  chave          text not null,
  rotulo         text not null,
  icone          text,
  unidade_padrao text,
  criado_em      timestamptz not null default now(),
  unique (usuario_id, chave)
);

-- ------------------------------------------------------------
-- 2. ÍNDICES (busca por dono)
-- ------------------------------------------------------------
create index if not exists idx_medicamentos_usuario on medicamentos(usuario_id);
create index if not exists idx_agendamentos_usuario on agendamentos(usuario_id);
create index if not exists idx_agendamentos_med      on agendamentos(med_id);
create index if not exists idx_historico_usuario     on historico(usuario_id);
create index if not exists idx_tipos_custom_usuario  on tipos_custom(usuario_id);

-- ------------------------------------------------------------
-- 3. ROW LEVEL SECURITY
-- Cada usuário só acessa as próprias linhas.
-- ------------------------------------------------------------

-- ---- perfis ----
alter table perfis enable row level security;

drop policy if exists "perfil dono le"     on perfis;
drop policy if exists "perfil dono insere" on perfis;
drop policy if exists "perfil dono altera" on perfis;
drop policy if exists "perfil dono apaga"  on perfis;

create policy "perfil dono le"     on perfis for select using (id = auth.uid());
create policy "perfil dono insere" on perfis for insert with check (id = auth.uid());
create policy "perfil dono altera" on perfis for update using (id = auth.uid());
create policy "perfil dono apaga"  on perfis for delete using (id = auth.uid());

-- ---- medicamentos ----
alter table medicamentos enable row level security;

drop policy if exists "med dono le"     on medicamentos;
drop policy if exists "med dono insere" on medicamentos;
drop policy if exists "med dono altera" on medicamentos;
drop policy if exists "med dono apaga"  on medicamentos;

create policy "med dono le"     on medicamentos for select using (usuario_id = auth.uid());
create policy "med dono insere" on medicamentos for insert with check (usuario_id = auth.uid());
create policy "med dono altera" on medicamentos for update using (usuario_id = auth.uid());
create policy "med dono apaga"  on medicamentos for delete using (usuario_id = auth.uid());

-- ---- agendamentos ----
alter table agendamentos enable row level security;

drop policy if exists "ag dono le"     on agendamentos;
drop policy if exists "ag dono insere" on agendamentos;
drop policy if exists "ag dono altera" on agendamentos;
drop policy if exists "ag dono apaga"  on agendamentos;

create policy "ag dono le"     on agendamentos for select using (usuario_id = auth.uid());
create policy "ag dono insere" on agendamentos for insert with check (usuario_id = auth.uid());
create policy "ag dono altera" on agendamentos for update using (usuario_id = auth.uid());
create policy "ag dono apaga"  on agendamentos for delete using (usuario_id = auth.uid());

-- ---- historico ----
alter table historico enable row level security;

drop policy if exists "hist dono le"     on historico;
drop policy if exists "hist dono insere" on historico;
drop policy if exists "hist dono apaga"  on historico;

create policy "hist dono le"     on historico for select using (usuario_id = auth.uid());
create policy "hist dono insere" on historico for insert with check (usuario_id = auth.uid());
create policy "hist dono apaga"  on historico for delete using (usuario_id = auth.uid());

-- ---- tipos_custom ----
alter table tipos_custom enable row level security;

drop policy if exists "tipo dono le"     on tipos_custom;
drop policy if exists "tipo dono insere" on tipos_custom;
drop policy if exists "tipo dono altera" on tipos_custom;
drop policy if exists "tipo dono apaga"  on tipos_custom;

create policy "tipo dono le"     on tipos_custom for select using (usuario_id = auth.uid());
create policy "tipo dono insere" on tipos_custom for insert with check (usuario_id = auth.uid());
create policy "tipo dono altera" on tipos_custom for update using (usuario_id = auth.uid());
create policy "tipo dono apaga"  on tipos_custom for delete using (usuario_id = auth.uid());

-- ------------------------------------------------------------
-- 4. CRIAÇÃO AUTOMÁTICA DO PERFIL AO REGISTRAR
-- Cria uma linha em `perfis` sempre que um usuário se cadastra.
-- O nome vem de raw_user_meta_data->>'nome' (enviado no signUp).
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.perfis (id, nome)
  values (new.id, coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
