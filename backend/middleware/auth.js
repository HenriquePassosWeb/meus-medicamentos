// ===== Middleware de autenticação =====
// Valida o token de acesso (JWT) do Supabase enviado pelo frontend no header
// Authorization: Bearer <token>. A validação é feita chamando o endpoint REST
// /auth/v1/user do Supabase (sem SDK, usando fetch nativo do Node).
//
// Se o token for válido, anexa req.usuario = { id, email } e segue.
// Caso contrário, responde 401 e bloqueia o acesso ao endpoint.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// Cache simples de tokens válidos (evita chamar o Supabase a cada request).
// Chave: token; valor: { usuario, expiraEm }. TTL curto por segurança.
const cacheTokens = new Map();
const TTL_CACHE_MS = 5 * 60 * 1000; // 5 minutos

function limparCacheExpirado() {
  const agora = Date.now();
  for (const [token, entrada] of cacheTokens) {
    if (entrada.expiraEm <= agora) cacheTokens.delete(token);
  }
}

async function validarToken(token) {
  const emCache = cacheTokens.get(token);
  if (emCache && emCache.expiraEm > Date.now()) {
    return emCache.usuario;
  }

  const resp = await fetch(SUPABASE_URL + '/auth/v1/user', {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: 'Bearer ' + token,
    },
  });

  if (!resp.ok) return null;

  const user = await resp.json();
  if (!user || !user.id) return null;

  const usuario = { id: user.id, email: user.email };
  cacheTokens.set(token, { usuario, expiraEm: Date.now() + TTL_CACHE_MS });
  return usuario;
}

// Middleware Express: exige token válido para acessar a rota.
export async function exigirAutenticacao(req, res, next) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return res.status(500).json({ ok: false, erro: 'Servidor sem configuração de autenticação.' });
  }

  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) {
    return res.status(401).json({ ok: false, erro: 'Autenticação necessária.' });
  }

  try {
    const usuario = await validarToken(token);
    if (!usuario) {
      return res.status(401).json({ ok: false, erro: 'Sessão inválida ou expirada.' });
    }
    req.usuario = usuario;
    if (cacheTokens.size > 500) limparCacheExpirado();
    next();
  } catch (e) {
    console.error('Erro ao validar token:', e.message);
    return res.status(401).json({ ok: false, erro: 'Não foi possível validar a sessão.' });
  }
}
