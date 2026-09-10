// ===== Serviço de bula (via IA) =====
// A consulta ao bulário da Anvisa foi removida: o endpoint retorna registros
// genéricos de vários laboratórios (não o produto específico da foto) e não
// agregava valor. A informação da bula agora é um resumo gerado por IA, com a
// ressalva de que não substitui a bula oficial.
import { resumirBula } from './ia.js';

function linkBuscaAnvisa(termo) {
  return 'https://consultas.anvisa.gov.br/#/bulario/?nomeProduto=' + encodeURIComponent(termo);
}

export async function buscarBula(termo) {
  termo = (termo || '').trim();
  if (!termo) throw new Error('Informe o nome do medicamento para buscar a bula.');

  const resumo = await resumirBula(termo);
  return {
    termo,
    resumo,
    linkBusca: linkBuscaAnvisa(termo),
    aviso: 'Resumo gerado por IA. NÃO substitui a bula oficial — confira sempre a bula completa no link da Anvisa.',
  };
}
