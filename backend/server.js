// ===== Servidor da v2 =====
// - POST /api/identificar : recebe foto (base64) e devolve dados do medicamento via IA
// - GET  /api/bula        : busca a bula na Anvisa pelo nome
// - serve o frontend estático em /
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { identificarMedicamento } from './services/ia.js';
import { buscarBula } from './services/bula.js';
import { excluirConta } from './services/conta.js';
import { exigirAutenticacao } from './middleware/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

// CORS restrito: lista de origens permitidas separada por vírgula no .env.
// Ex.: CORS_ORIGIN=https://meuapp.com,https://www.meuapp.com
// Sem configuração, assume same-origin (o backend serve o próprio frontend).
const ORIGENS = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    // Requisições same-origin (sem header Origin) ou de origens na lista.
    if (!origin || ORIGENS.length === 0 || ORIGENS.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Origem não permitida pelo CORS.'));
  },
}));
// imagens em base64 podem ser grandes; aumenta o limite
app.use(express.json({ limit: '12mb' }));

// Rate limiting nos endpoints de IA (protege custo/abuso).
// Por usuário autenticado quando possível; senão, por IP.
const limiteIA = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 15,             // até 15 chamadas por minuto
  standardHeaders: true,
  legacyHeaders: false,
  // Chaveia pelo id do usuário autenticado; sem ele, cai no IP (com helper IPv6).
  keyGenerator: (req) => (req.usuario && req.usuario.id) || ipKeyGenerator(req.ip),
  message: { ok: false, erro: 'Muitas requisições. Aguarde um momento e tente novamente.' },
});

// Serve o frontend (assim dá para abrir tudo no mesmo endereço, sem problema de CORS)
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Saúde
app.get('/api/status', (req, res) => {
  res.json({
    ok: true,
    iaConfigurada: Boolean(process.env.IA_API_KEY && process.env.IA_API_KEY !== 'coloque_sua_chave_aqui'),
    provider: process.env.IA_PROVIDER || 'openai',
  });
});

// Identificar medicamento pela foto (exige login + rate limit)
app.post('/api/identificar', exigirAutenticacao, limiteIA, async (req, res) => {
  try {
    const { imagem } = req.body || {};
    if (!imagem) return res.status(400).json({ erro: 'Envie a imagem no campo "imagem" (data URL base64).' });
    const dados = await identificarMedicamento(imagem);
    res.json({ ok: true, dados });
  } catch (e) {
    console.error('Erro /api/identificar:', e.message);
    res.status(500).json({ ok: false, erro: e.message });
  }
});

// Buscar bula (exige login + rate limit)
app.get('/api/bula', exigirAutenticacao, limiteIA, async (req, res) => {
  try {
    const termo = req.query.nome || '';
    const resultado = await buscarBula(termo);
    res.json({ ok: true, ...resultado });
  } catch (e) {
    console.error('Erro /api/bula:', e.message);
    res.status(500).json({ ok: false, erro: e.message });
  }
});

// Excluir a própria conta e todos os dados (LGPD).
// O id vem do TOKEN (req.usuario.id), nunca de parâmetro — assim ninguém
// consegue apagar a conta de outra pessoa.
app.delete('/api/conta', exigirAutenticacao, async (req, res) => {
  try {
    await excluirConta(req.usuario.id);
    res.json({ ok: true });
  } catch (e) {
    console.error('Erro /api/conta (DELETE):', e.message);
    res.status(500).json({ ok: false, erro: e.message });
  }
});

// Tratador de erros global do Express: garante uma resposta JSON consistente
// para qualquer erro não capturado nas rotas (ex.: CORS bloqueado, body inválido).
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('Erro não tratado:', err.message);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({ ok: false, erro: err.message || 'Erro interno.' });
});

// Rede de segurança: registra falhas graves sem derrubar o processo em silêncio.
// (Em produção, aqui é o ponto de integração com um monitor tipo Sentry.)
process.on('unhandledRejection', (motivo) => {
  console.error('Promise rejeitada sem tratamento:', motivo);
});
process.on('uncaughtException', (err) => {
  console.error('Exceção não capturada:', err.message);
});

app.listen(PORT, () => {
  console.log('Meus Medicamentos v2 rodando em http://localhost:' + PORT);
  console.log('Frontend servido a partir de ../frontend');
});
