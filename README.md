# Meus Medicamentos v3

App de controle de estoque de medicamentos em casa, com sincronização na nuvem
(Supabase), fotos, lembretes e compartilhamento de estoque entre usuários.

- **Frontend**: JavaScript puro (HTML/CSS/JS), sem build. Servido pelo backend.
- **Backend**: Node.js + Express. Faz identificação por IA, resumo de bula por IA,
  valida a sessão dos usuários e exclui contas (LGPD).
- **Banco/Auth/Storage**: Supabase (PostgreSQL + Auth + Storage).

Documentação detalhada da arquitetura e decisões: `V3-SUPABASE-SETUP.md`.

---

## Como rodar localmente

Pré-requisitos: Node.js 18+.

```bash
cd backend
npm install
# copie o .env.example para .env e preencha os valores (veja abaixo)
npm start
```

O app fica disponível em `http://localhost:3001` (o backend serve o frontend).

### Variáveis de ambiente (backend/.env)

Copie `backend/.env.example` para `backend/.env` e preencha:

| Variável | Descrição |
|----------|-----------|
| `PORT` | Porta do servidor (o Render define automaticamente). |
| `IA_PROVIDER` | `openai` ou `gemini`. |
| `IA_API_KEY` | Chave da API de IA. |
| `IA_MODEL` | Modelo (opcional). |
| `SUPABASE_URL` | URL do projeto Supabase. |
| `SUPABASE_ANON_KEY` | Publishable/anon key (valida o token do usuário). |
| `SUPABASE_SERVICE_KEY` | Secret key (service_role). Usada só para excluir contas. |
| `CORS_ORIGIN` | Origens permitidas (vazio = same-origin). Em produção, o domínio real. |

> **Nunca** versione o `.env` real. Ele está no `.gitignore`.

---

## Banco de dados (Supabase)

No SQL Editor do painel, execute na ordem:

1. `supabase/schema.sql` — tabelas base, RLS e trigger de perfil.
2. `supabase/storage-fotos.sql` — policies do bucket de fotos (criar o bucket
   privado `fotos-medicamentos` antes, pelo painel).
3. `supabase/compartilhamento.sql` — compartilhamento de estoque.

---

## Testes

```bash
cd backend
npm test
```

---

## Deploy no Render (plano free)

1. Suba o projeto para um repositório no GitHub.
2. No Render, crie um **Web Service** conectado ao repositório.
3. Configurações:
   - **Root Directory**: `backend`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
4. Em **Environment**, cadastre as variáveis do `.env` (exceto `PORT`, que o Render
   define). Coloque `CORS_ORIGIN` com a URL pública do serviço quando ela existir.
5. Deploy. O app ficará no ar na URL fornecida pelo Render.

> Atenção (free tier): o serviço "dorme" após 15 min de inatividade e leva ~1 min
> para acordar na próxima visita. Aceitável para validação; para produção sem essa
> espera, use um plano pago.
