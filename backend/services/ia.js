// ===== Serviço de IA de visão =====
// Recebe uma imagem (base64) e pede ao modelo para extrair dados do medicamento.
// Suporta OpenAI e Gemini. A chave fica só no servidor (via .env).

const PROMPT = `Você é um assistente que identifica medicamentos a partir da foto da embalagem.
Analise a imagem e responda APENAS com um JSON válido, sem texto extra, no formato:
{
  "nome": "nome comercial do medicamento",
  "principioAtivo": "princípio ativo / substância",
  "concentracao": "ex: 750mg",
  "fabricante": "laboratório, se visível",
  "tipo": "caixa | comprimido | liquido",
  "confianca": "alta | media | baixa",
  "observacao": "qualquer aviso relevante lido na caixa"
}
Se não conseguir identificar algum campo, use string vazia. Não invente dados.`;

function extrairJSON(texto) {
  if (!texto) return null;
  // remove cercas de código, se houver
  const limpo = texto.replace(/```json/gi, '').replace(/```/g, '').trim();
  const inicio = limpo.indexOf('{');
  const fim = limpo.lastIndexOf('}');
  if (inicio === -1 || fim === -1) return null;
  try {
    return JSON.parse(limpo.slice(inicio, fim + 1));
  } catch {
    return null;
  }
}

function espera(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Erro que sinaliza sobrecarga temporária (permite tentar outro modelo).
class ErroSobrecarga extends Error {}

// Faz o fetch e tenta de novo em erros temporários (429/503). Até 4 tentativas.
async function fetchComRetry(url, opcoes, rotulo) {
  const MAX = 4;
  let ultimoDetalhe = '';
  for (let tentativa = 1; tentativa <= MAX; tentativa++) {
    const resp = await fetch(url, opcoes);
    if (resp.ok) return resp;

    ultimoDetalhe = await resp.text();
    const temporario = resp.status === 503 || resp.status === 429;
    if (temporario && tentativa < MAX) {
      await espera(tentativa * 1500); // backoff progressivo
      continue;
    }
    if (temporario) {
      throw new ErroSobrecarga(rotulo + ' sobrecarregado.');
    }
    throw new Error('Falha no ' + rotulo + ' (' + resp.status + '): ' + ultimoDetalhe.slice(0, 200));
  }
  throw new ErroSobrecarga(rotulo + ' indisponível.');
}

// Lista de modelos Gemini a tentar em ordem: o configurado + alternativos.
// Se um estiver sobrecarregado, cai para o próximo antes de desistir.
function modelosGemini(modelConfig) {
  const alternativos = ['gemini-flash-lite-latest', 'gemini-flash-latest', 'gemini-3.6-flash'];
  const lista = [modelConfig, ...alternativos].filter(Boolean);
  return [...new Set(lista)]; // remove duplicados mantendo a ordem
}

// Executa a chamada tentando cada modelo até um responder.
async function comFallbackDeModelo(modelConfig, executar) {
  const modelos = modelosGemini(modelConfig);
  let ultimoErro;
  for (const modelo of modelos) {
    try {
      return await executar(modelo);
    } catch (e) {
      ultimoErro = e;
      if (e instanceof ErroSobrecarga) continue; // tenta o próximo modelo
      throw e; // erro real (chave inválida, etc.): não adianta trocar de modelo
    }
  }
  throw new Error('A IA está sobrecarregada no momento. Tente novamente em alguns segundos.');
}

async function identificarOpenAI({ apiKey, model, dataUrl }) {
  const resp = await fetchComRetry('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + apiKey,
    },
    body: JSON.stringify({
      model: model || 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: PROMPT },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
      max_tokens: 400,
      temperature: 0,
    }),
  }, 'OpenAI');

  const dados = await resp.json();
  const texto = dados?.choices?.[0]?.message?.content || '';
  return extrairJSON(texto);
}

async function identificarGemini({ apiKey, model, base64, mime }) {
  return comFallbackDeModelo(model, async (modelo) => {
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + modelo + ':generateContent';
    const resp = await fetchComRetry(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: PROMPT },
              { inline_data: { mime_type: mime, data: base64 } },
            ],
          },
        ],
        generationConfig: { temperature: 0 },
      }),
    }, 'Gemini');

    const dados = await resp.json();
    const texto = dados?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return extrairJSON(texto);
  });
}

// dataUrl no formato "data:image/jpeg;base64,...."
export async function identificarMedicamento(dataUrl) {
  const provider = (process.env.IA_PROVIDER || 'openai').toLowerCase();
  const apiKey = process.env.IA_API_KEY;
  const model = process.env.IA_MODEL || '';

  if (!apiKey || apiKey === 'coloque_sua_chave_aqui') {
    throw new Error('IA_API_KEY não configurada no .env do backend.');
  }

  const match = /^data:(.+?);base64,(.*)$/.exec(dataUrl || '');
  if (!match) throw new Error('Imagem inválida (esperado data URL base64).');
  const mime = match[1];
  const base64 = match[2];

  let resultado;
  if (provider === 'gemini') {
    resultado = await identificarGemini({ apiKey, model, base64, mime });
  } else {
    resultado = await identificarOpenAI({ apiKey, model, dataUrl });
  }

  if (!resultado) {
    throw new Error('Não foi possível interpretar a resposta da IA.');
  }
  return resultado;
}

// ===== Resumo de bula por texto (fallback quando a Anvisa bloqueia) =====

const PROMPT_BULA = (nome) => `Você é um farmacêutico. Sobre o medicamento "${nome}", responda APENAS com um JSON válido, sem texto extra, no formato:
{
  "nome": "nome do medicamento",
  "principioAtivo": "princípio ativo",
  "indicacoes": "para que serve (resumo curto)",
  "comoUsar": "orientação geral de uso (resumo curto)",
  "contraindicacoes": "principais contraindicações (resumo curto)",
  "efeitosColaterais": "efeitos colaterais mais comuns (resumo curto)",
  "alerta": "avisos importantes"
}
Baseie-se em informação de bula amplamente conhecida. Se não tiver certeza sobre o medicamento, retorne o campo "nome" preenchido e os demais vazios. Não invente dosagens específicas.`;

async function gerarTextoOpenAI({ apiKey, model, prompt }) {
  const resp = await fetchComRetry('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
    body: JSON.stringify({
      model: model || 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 500,
      temperature: 0.2,
    }),
  }, 'OpenAI');
  const dados = await resp.json();
  return dados?.choices?.[0]?.message?.content || '';
}

async function gerarTextoGemini({ apiKey, model, prompt }) {
  return comFallbackDeModelo(model, async (modelo) => {
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + modelo + ':generateContent';
    const resp = await fetchComRetry(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2 },
      }),
    }, 'Gemini');
    const dados = await resp.json();
    return dados?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  });
}

export async function resumirBula(nome) {
  const provider = (process.env.IA_PROVIDER || 'openai').toLowerCase();
  const apiKey = process.env.IA_API_KEY;
  const model = process.env.IA_MODEL || '';

  if (!apiKey || apiKey === 'coloque_sua_chave_aqui') {
    throw new Error('IA_API_KEY não configurada no .env do backend.');
  }
  const prompt = PROMPT_BULA(nome);
  const texto = provider === 'gemini'
    ? await gerarTextoGemini({ apiKey, model, prompt })
    : await gerarTextoOpenAI({ apiKey, model, prompt });

  const resultado = extrairJSON(texto);
  if (!resultado) throw new Error('Não foi possível gerar o resumo da bula.');
  return resultado;
}
