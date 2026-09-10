# Meus Medicamentos

Sistema web mobile para controle de estoque dos medicamentos que você tem em casa. Evita comprar caixas novas de algo que já sobrou na gaveta.

## Funcionalidades

### Login / conta
- Cadastro e login com e-mail e senha (autenticação local no aparelho).
- Senha guardada como hash SHA-256 + salt (Web Crypto). Não fica em texto puro.
- Cada usuário tem seu próprio estoque isolado.

### Estoque
- Cadastro por tipo de embalagem:
  - **Caixa fechada** (quantidade de caixas)
  - **Comprimidos** (quantidade)
  - **Frasco líquido** (nível: cheio / metade / pouco / vazio)
  - **Outro**
- Ajuste de estoque na própria lista com os botões `+` / `−` (para líquido, sobe/desce o nível).
- **Estoque mínimo** por item → etiqueta "Acabando" quando atinge o limite.
- **Validade** com alertas "Vence em breve" (3 meses) e "Vencido".

### Telas
- **Início**: saudação, resumo (itens / acabando / vencendo), painel de alertas e a lista completa.
- **Consulta**: busca por nome/observação + filtros combinados (tipo, situação) e ordenação (prioridade, nome, validade).
- **Histórico**: registro automático de cadastros, entradas e saídas de estoque.
- **Ajustes**: perfil, exportar/importar backup e sair.
- Navegação inferior estilo app + botão flutuante para novo cadastro.

### Backup
- Exporta os dados para um arquivo `.json`.
- Importa com opção de **substituir** tudo ou **mesclar** com o estoque atual (sem duplicar).
- Resolve a limitação de os dados ficarem só no aparelho.

## Como usar

Abra o `index.html` no navegador. No celular, use "Adicionar à tela inicial" para instalar como app (PWA).

Para rodar com servidor local (recomendado, por causa do roteamento e do Web Crypto):

```bash
# a partir da pasta do projeto
npx serve
# ou
python -m http.server
```

Depois acesse o endereço mostrado (ideal usar o modo responsivo/mobile do DevTools).

> Observação: o Web Crypto (usado no hash da senha) exige contexto seguro. Funciona em `localhost` e em `https`. Abrir o arquivo direto via `file://` pode bloquear o login em alguns navegadores — nesse caso, use um servidor local.

## Estrutura

```
meus-medicamentos/
├── index.html          # carrega os módulos na ordem
├── styles.css          # estilo mobile-first
├── manifest.json       # PWA instalável
├── js/
│   ├── store.js        # acesso ao localStorage (isolado)
│   ├── auth.js         # cadastro/login, hash de senha, sessão
│   ├── meds.js         # domínio: medicamentos, regras, histórico, backup
│   ├── ui.js           # componentes de UI compartilhados (card, toast)
│   ├── form-med.js     # modal de cadastro/edição
│   ├── views.js        # telas: login, início, consulta, histórico, ajustes
│   └── app.js          # roteador por hash + navegação
└── README.md
```

A separação segue camadas: dados (`store`) → domínio (`meds`, `auth`) → apresentação (`ui`, `form-med`, `views`, `app`). Cada camada só conhece a de baixo.

## Tecnologia

HTML, CSS e JavaScript puro (sem dependências ou build). Persistência via `localStorage`, hash de senha via Web Crypto, roteamento por hash (SPA).

## Ideias para evoluir

- Lembretes/notificações de horário de tomar o remédio.
- Foto da embalagem em cada item.
- Compartilhar estoque entre pessoas da casa (exigiria backend).
- Leitura de código de barras para cadastro rápido.
- Sincronização em nuvem (hoje é só local).
