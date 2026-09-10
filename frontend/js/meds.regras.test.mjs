// ===== Testes das regras de negócio (Meds) =====
// Usa o test runner nativo do Node (node --test), sem dependências externas.
//
// O meds.js é um IIFE que espera um objeto global (window) com Store e Auth.
// Aqui montamos um "window" falso mínimo, carregamos o arquivo e testamos as
// funções PURAS de regra (validade/estoque), que dependem só do objeto `med`.
//
// Rodar:  node --test  (a partir da pasta frontend/js) — ou  npm test no backend? não.
//         cd frontend/js && node --test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Monta um ambiente (sandbox) com um window falso e carrega o meds.js nele.
function carregarMeds() {
  const codigo = readFileSync(path.join(__dirname, 'meds.js'), 'utf8');
  const windowFalso = {
    // Store e Auth não são usados pelas funções de regra testadas aqui,
    // mas precisam existir para o IIFE inicializar sem erro.
    Store: { gerarId: () => 'id' },
    Auth: { usuarioAtual: () => null },
  };
  const sandbox = { window: windowFalso, console };
  vm.createContext(sandbox);
  vm.runInContext(codigo, sandbox);
  return windowFalso.Meds;
}

const Meds = carregarMeds();

// ---- Helpers ----
// Gera uma validade 'AAAA-MM' deslocada por N meses a partir de hoje.
function validadeEmMeses(offsetMeses) {
  const d = new Date();
  d.setMonth(d.getMonth() + offsetMeses);
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  return ano + '-' + mes;
}

// ---- mesesAteVencer ----
test('mesesAteVencer retorna null quando não há validade', () => {
  assert.equal(Meds.mesesAteVencer(''), null);
  assert.equal(Meds.mesesAteVencer(null), null);
});

test('mesesAteVencer retorna negativo para validade passada', () => {
  const m = Meds.mesesAteVencer(validadeEmMeses(-6));
  assert.ok(m < 0, 'esperado valor negativo para 6 meses atrás');
});

// ---- estaVencido ----
test('estaVencido true para validade passada', () => {
  assert.equal(Meds.estaVencido({ validade: validadeEmMeses(-2) }), true);
});

test('estaVencido false para validade futura', () => {
  assert.equal(Meds.estaVencido({ validade: validadeEmMeses(12) }), false);
});

test('estaVencido false quando não há validade', () => {
  assert.equal(Meds.estaVencido({ validade: '' }), false);
});

// ---- estaVencendo (dentro de 3 meses, ainda não vencido) ----
test('estaVencendo true para validade dentro de ~2 meses', () => {
  assert.equal(Meds.estaVencendo({ validade: validadeEmMeses(2) }), true);
});

test('estaVencendo false para validade distante', () => {
  assert.equal(Meds.estaVencendo({ validade: validadeEmMeses(12) }), false);
});

// ---- estaAcabando (por quantidade e por nível de líquido) ----
test('estaAcabando true quando quantidade <= mínimo', () => {
  assert.equal(Meds.estaAcabando({ tipo: 'comprimido', quantidade: 2, minimo: 2 }), true);
});

test('estaAcabando false quando quantidade > mínimo', () => {
  assert.equal(Meds.estaAcabando({ tipo: 'comprimido', quantidade: 10, minimo: 2 }), false);
});

test('estaAcabando false quando não há mínimo definido', () => {
  assert.equal(Meds.estaAcabando({ tipo: 'comprimido', quantidade: 0, minimo: 0 }), false);
});

test('estaAcabando (líquido) true para nível pouco/vazio', () => {
  assert.equal(Meds.estaAcabando({ tipo: 'liquido', nivel: 'pouco' }), true);
  assert.equal(Meds.estaAcabando({ tipo: 'liquido', nivel: 'vazio' }), true);
});

test('estaAcabando (líquido) false para nível cheio/metade', () => {
  assert.equal(Meds.estaAcabando({ tipo: 'liquido', nivel: 'cheio' }), false);
  assert.equal(Meds.estaAcabando({ tipo: 'liquido', nivel: 'metade' }), false);
});

// ---- prioridade (0=vencido, 1=acabando, 2=vencendo, 3=ok) ----
test('prioridade 0 para vencido', () => {
  assert.equal(Meds.prioridade({ tipo: 'comprimido', validade: validadeEmMeses(-1), quantidade: 10, minimo: 2 }), 0);
});

test('prioridade 1 para acabando (não vencido)', () => {
  assert.equal(Meds.prioridade({ tipo: 'comprimido', validade: validadeEmMeses(24), quantidade: 1, minimo: 2 }), 1);
});

test('prioridade 3 para item em dia', () => {
  assert.equal(Meds.prioridade({ tipo: 'comprimido', validade: validadeEmMeses(24), quantidade: 10, minimo: 2 }), 3);
});

// ---- descricaoEstoque ----
test('descricaoEstoque usa unidade para não-líquido', () => {
  const texto = Meds.descricaoEstoque({ tipo: 'comprimido', quantidade: 5, unidade: 'comp.' });
  assert.equal(texto, '5 comp.');
});

test('descricaoEstoque usa nível para líquido', () => {
  const texto = Meds.descricaoEstoque({ tipo: 'liquido', nivel: 'metade' });
  assert.ok(texto.toLowerCase().includes('metade'));
});
