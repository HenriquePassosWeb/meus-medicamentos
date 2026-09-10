-- ============================================================
-- Meus Medicamentos v3 — Compartilhamento de estoque (VERSÃO FINAL)
-- Cole no SQL Editor do Supabase e execute (RUN). Idempotente.
--
-- Modelo (decisões tomadas):
--   - Convite por CÓDIGO: o usuário gera um código e envia para a outra pessoa.
--   - Ao ACEITAR, o acesso é MÃO DUPLA: os dois passam a ver e ajustar a
--     quantidade do estoque um do outro.
--   - Permissão única e restrita: só é possível ALTERAR A QUANTIDADE (não editar
--     dados, não excluir, não inserir) — feito via função segura (Forma B).
--   - Revogação pelos dois lados: dono OU convidado podem encerrar o vínculo.
--   - Revogados não são exibidos no app (o registro permanece como histórico).
-- ============================================================

-- ------------------------------------------------------------
-- 1. TABELA compartilhamentos
-- ------------------------------------------------------------
create table if not exists compartilhamentos (
  id             uuid primary key default gen_random_uuid(),
  dono_id        uuid not null references auth.users(id) on delete cascade,
  convidado_id   uuid references auth.users(id) on delete cascade,
  dono_nome      text,           -- nome do dono (preenchido na criação do convite)
  convidado_nome text,           -- nome do convidado (preenchido no aceite)
  codigo         text not null unique,
  status         text not null default 'pendente'
                   check (status in ('pendente', 'aceito', 'revogado')),
  criado_em      timestamptz not null default now(),
  respondido_em  timestamptz
);

create index if not exists idx_compart_dono      on compartilhamentos(dono_id);
create index if not exists idx_compart_convidado on compartilhamentos(convidado_id);
create index if not exists idx_compart_codigo    on compartilhamentos(codigo);

alter table compartilhamentos enable row level security;

-- ------------------------------------------------------------
-- 2. POLICIES da tabela compartilhamentos
-- ------------------------------------------------------------
drop policy if exists "compart dono le"      on compartilhamentos;
drop policy if exists "compart convidado le" on compartilhamentos;
drop policy if exists "compart dono insere"  on compartilhamentos;
drop policy if exists "compart dono altera"  on compartilhamentos;
drop policy if exists "compart dono apaga"   on compartilhamentos;

-- Cada lado vê os vínculos em que participa.
create policy "compart dono le"
  on compartilhamentos for select using (dono_id = auth.uid());
create policy "compart convidado le"
  on compartilhamentos for select using (convidado_id = auth.uid());

-- Só o dono cria convites (para si mesmo).
create policy "compart dono insere"
  on compartilhamentos for insert with check (dono_id = auth.uid());

-- O dono pode alterar seus convites. (A revogação pelo convidado e o aceite
-- passam por funções security definer — ver abaixo.)
create policy "compart dono altera"
  on compartilhamentos for update using (dono_id = auth.uid());

-- O dono pode apagar seus convites.
create policy "compart dono apaga"
  on compartilhamentos for delete using (dono_id = auth.uid());

-- ------------------------------------------------------------
-- 3. FUNÇÃO: aceitar convite por código
-- O convidado passa o código; a função valida e vincula.
-- Preenche o nome do convidado (perfis -> metadata -> e-mail como último recurso).
-- ------------------------------------------------------------
create or replace function public.aceitar_convite(p_codigo text)
returns compartilhamentos
language plpgsql
security definer set search_path = public
as $$
declare
  l_convite        compartilhamentos;
  l_nome_convidado text;
begin
  select * into l_convite from compartilhamentos where codigo = p_codigo;

  if not found then
    raise exception 'Código de convite inválido.';
  end if;
  if l_convite.status = 'revogado' then
    raise exception 'Este convite foi revogado.';
  end if;
  if l_convite.status = 'aceito' then
    raise exception 'Este convite já foi utilizado.';
  end if;
  if l_convite.dono_id = auth.uid() then
    raise exception 'Você não pode aceitar o próprio convite.';
  end if;

  -- Nome do convidado: 1) perfis; 2) nome do cadastro (metadata); 3) e-mail.
  select nome into l_nome_convidado from perfis where id = auth.uid();
  if l_nome_convidado is null or l_nome_convidado = '' then
    select coalesce(nullif(raw_user_meta_data->>'nome', ''), split_part(email, '@', 1))
      into l_nome_convidado
      from auth.users where id = auth.uid();
  end if;

  update compartilhamentos
    set convidado_id = auth.uid(),
        convidado_nome = l_nome_convidado,
        status = 'aceito',
        respondido_em = now()
    where id = l_convite.id
    returning * into l_convite;

  return l_convite;
end;
$$;

-- ------------------------------------------------------------
-- 4. FUNÇÃO: revogar vínculo (dono OU convidado)
-- ------------------------------------------------------------
create or replace function public.revogar_compartilhamento(p_id uuid)
returns compartilhamentos
language plpgsql
security definer set search_path = public
as $$
declare
  l_vinculo compartilhamentos;
begin
  select * into l_vinculo from compartilhamentos where id = p_id;
  if not found then
    raise exception 'Compartilhamento não encontrado.';
  end if;

  if l_vinculo.dono_id <> auth.uid() and l_vinculo.convidado_id <> auth.uid() then
    raise exception 'Sem permissão para revogar este compartilhamento.';
  end if;

  update compartilhamentos
    set status = 'revogado', respondido_em = now()
    where id = p_id
    returning * into l_vinculo;

  return l_vinculo;
end;
$$;

-- ------------------------------------------------------------
-- 5. FUNÇÃO: ajustar SOMENTE a quantidade (Forma B)
-- Única forma de alterar estoque (do próprio ou de parceiro com vínculo aceito,
-- em qualquer direção). Não permite tocar em nenhum outro campo.
-- ------------------------------------------------------------
create or replace function public.ajustar_quantidade(p_med_id uuid, p_delta numeric)
returns medicamentos
language plpgsql
security definer set search_path = public
as $$
declare
  l_med  medicamentos;
  l_dono uuid;
begin
  select * into l_med from medicamentos where id = p_med_id;
  if not found then
    raise exception 'Medicamento não encontrado.';
  end if;

  l_dono := l_med.usuario_id;

  if l_dono <> auth.uid()
     and not exists (
       select 1 from compartilhamentos
       where status = 'aceito'
         and (
           (dono_id = l_dono and convidado_id = auth.uid())
           or
           (convidado_id = l_dono and dono_id = auth.uid())
         )
     )
  then
    raise exception 'Sem permissão para alterar este medicamento.';
  end if;

  update medicamentos
    set quantidade = greatest(0, coalesce(quantidade, 0) + p_delta)
    where id = p_med_id
    returning * into l_med;

  return l_med;
end;
$$;

-- ------------------------------------------------------------
-- 6. LEITURA MÃO DUPLA de medicamentos
-- Um usuário pode LER os medicamentos de outro se há vínculo ACEITO entre eles
-- (em qualquer direção). Continua SEM insert/update/delete direto — a alteração
-- de quantidade só acontece pela função ajustar_quantidade.
--
-- OBS: no app, a carga inicial (carregarTudo) filtra por usuario_id = eu, então
-- esta policy ampliada é usada apenas na busca cruzada (estoque de parceiros).
-- ------------------------------------------------------------
drop policy if exists "med convidado le"     on medicamentos;
drop policy if exists "med compartilhado le" on medicamentos;

create policy "med compartilhado le"
  on medicamentos for select
  using (
    exists (
      select 1 from compartilhamentos
      where status = 'aceito'
        and (
          (dono_id = medicamentos.usuario_id and convidado_id = auth.uid())
          or
          (convidado_id = medicamentos.usuario_id and dono_id = auth.uid())
        )
    )
  );
