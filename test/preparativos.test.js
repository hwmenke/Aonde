// "Antes de viajar": documento, moeda, tomada, saude, seguro.
// Existe porque duas rodadas de avaliacao com pessoas simuladas apontaram a
// MESMA falta, de forma independente. Errar aqui faz alguem ser barrado no
// embarque, entao os testes cobram honestidade, nao so presenca.

import { test } from "node:test";
import assert from "node:assert/strict";

import { renderGuidePage } from "../src/render/htmlRenderer.js";
import { GUIDES } from "../src/render/aondeContent.js";
import { preparativosDoGuia, PAISES, CONFERIDO_EM, FONTES } from "../src/render/preparativos.js";

const INTERNACIONAIS = ["buenosaires", "bariloche", "cusco", "atacama", "montevideu"];

test("todo roteiro internacional diz qual documento o brasileiro precisa", () => {
  for (const id of INTERNACIONAIS) {
    const p = preparativosDoGuia(GUIDES[id]);
    assert.ok(p, `${id}: sem bloco de preparativos`);
    assert.ok(p.internacional, `${id}: deveria ser reconhecido como internacional`);
    assert.match(p.documento, /RG|passaporte/i, `${id}: nao diz o documento`);
    assert.ok(p.moeda, `${id}: nao diz a moeda`);
    assert.ok(p.tomada, `${id}: nao diz o tipo de tomada`);
  }
});

test("o bloco aparece na pagina renderizada dos internacionais", () => {
  for (const id of INTERNACIONAIS) {
    const h = renderGuidePage(id);
    assert.match(h, /Antes de viajar/, `${id}: bloco nao renderizou`);
    assert.match(h, /class="prep-grid"/, `${id}: grade de preparativos ausente`);
  }
});

test("destino nacional sem particularidade NAO ganha bloco vazio", () => {
  // Bloco vazio e ruido: ensina a pessoa a ignorar a secao justamente onde ela
  // as vezes importa (Manaus, Noronha).
  assert.equal(preparativosDoGuia(GUIDES.salvador), null);
  assert.doesNotMatch(renderGuidePage("salvador"), /Antes de viajar/);
});

test("Manaus avisa sobre febre amarela no ROTEIRO, nao so numa oferta", () => {
  // O alerta existia so numa oferta que nem sempre esta no ar. Quem le o
  // roteiro e quem esta planejando a viagem.
  const h = renderGuidePage("manaus");
  assert.match(h, /febre amarela/i);
  assert.match(h, /10 dias/, "precisa dizer com quanta antecedencia tomar");
});

test("Noronha avisa das taxas que nao estao no preco da passagem", () => {
  const h = renderGuidePage("noronha");
  assert.match(h, /Taxa de Preservação Ambiental/i);
  assert.match(h, /Parque Nacional/i);
});

test("Cusco e Atacama avisam da altitude", () => {
  for (const id of ["cusco", "atacama"]) {
    const h = renderGuidePage(id);
    assert.match(h, /altitude|altura/i, `${id}: sem aviso de altitude`);
  }
});

test("o bloco mostra QUANDO foi conferido e aponta a fonte oficial", () => {
  // Regra de fronteira e de vacina muda. O site nao pode fingir que a
  // informacao e permanente nem que a autoridade e ele.
  const h = renderGuidePage("buenosaires");
  assert.match(h, /Informação escrita em/, "sem data de conferencia");
  assert.match(h, /confirme/i, "nao manda confirmar na fonte");
  for (const f of Object.values(FONTES)) {
    assert.ok(h.includes(f.url), `falta o link da fonte: ${f.nome}`);
  }
  assert.match(CONFERIDO_EM, /^\d{4}-\d{2}-\d{2}$/, "data de conferencia malformada");
});

test("o texto nao promete garantia — usa linguagem condicional", () => {
  // "Voce PODE entrar com RG" e diferente de "voce vai entrar com RG". Quem
  // garante entrada e a autoridade de fronteira, nunca o site.
  for (const pais of Object.values(PAISES)) {
    const tudo = [pais.documento, pais.seguro, pais.vacina].filter(Boolean).join(" ");
    assert.doesNotMatch(tudo, /garantid|com certeza|sem risco de/i, `${pais.pais}: promete garantia`);
  }
});

test("o bloco deixa claro que vale para cidadao brasileiro", () => {
  // Estrangeiro residente no Brasil segue outra regra — dizer isso evita que
  // alguem tome a informacao para si sem que ela se aplique.
  const h = renderGuidePage("cusco");
  assert.match(h, /cidadão brasileiro/i);
  assert.match(h, /estrangeiro residente/i);
});
