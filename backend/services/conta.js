// ===== Serviço de exclusão de conta (LGPD) =====
// Apaga TODOS os dados do usuário e a própria conta de autenticação.
// Usa a SECRET KEY do Supabase (service_role) — que ignora o RLS e permite
// operações administrativas. Esta chave fica SÓ no backend (.env), nunca no
// frontend. Usamos a API REST via fetch nativo (sem SDK).
//
// As tabelas de dados (medicamentos, agendamentos, historico, tipos_custom,
// compartilhamentos, perfis) somem em cascata ao apagar o usuário do auth
// (todas têm "on delete cascade" referenciando auth.users). Mas os arquivos
// do Storage precisam ser removidos explicitamente antes.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BUCKET_FOTOS = 'fotos-medicamentos';

function headersAdmin() {
  return {
    apikey: SERVICE_KEY,
    Authorization: 'Bearer ' + SERVICE_KEY,
    'Content-Type': 'application/json',
  };
}

// Lista e remove todas as fotos do usuário (pasta <uid>/ no bucket).
async function apagarFotosDoUsuario(usuarioId) {
  // Lista os arquivos dentro da "pasta" do usuário.
  const respLista = await fetch(
    SUPABASE_URL + '/storage/v1/object/list/' + BUCKET_FOTOS,
    {
      method: 'POST',
      headers: headersAdmin(),
      body: JSON.stringify({ prefix: usuarioId + '/', limit: 1000 }),
    }
  );
  if (!respLista.ok) {
    console.warn('Não foi possível listar fotos do usuário para exclusão.');
    return;
  }
  const arquivos = await respLista.json();
  if (!Array.isArray(arquivos) || arquivos.length === 0) return;

  const caminhos = arquivos.map((a) => usuarioId + '/' + a.name);
  const respRemove = await fetch(
    SUPABASE_URL + '/storage/v1/object/' + BUCKET_FOTOS,
    {
      method: 'DELETE',
      headers: headersAdmin(),
      body: JSON.stringify({ prefixes: caminhos }),
    }
  );
  if (!respRemove.ok) {
    console.warn('Falha ao remover fotos do Storage (seguindo com a exclusão).');
  }
}

// Apaga a conta de autenticação. Isso dispara o cascade nas tabelas de dados.
async function apagarUsuarioAuth(usuarioId) {
  const resp = await fetch(SUPABASE_URL + '/auth/v1/admin/users/' + usuarioId, {
    method: 'DELETE',
    headers: headersAdmin(),
  });
  if (!resp.ok) {
    const detalhe = await resp.text();
    throw new Error('Falha ao excluir a conta: ' + detalhe.slice(0, 200));
  }
}

// Exclui tudo do usuário: fotos + conta (cascade cuida das tabelas).
export async function excluirConta(usuarioId) {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    throw new Error('Servidor sem SUPABASE_SERVICE_KEY configurada.');
  }
  await apagarFotosDoUsuario(usuarioId);
  await apagarUsuarioAuth(usuarioId);
}
