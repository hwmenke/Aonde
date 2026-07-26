// conteudoHonesto.test.js — cobre as duas correcoes de honestidade de dados
// apontadas na auditoria de usuarios:
//
// 1) OFFERS.publicado nao pode ser uma string fixa ("ha 2h") — precisa ser
//    calculada a partir de um instante real (publicadoEm) e mudar com o tempo.
// 2) Os 22 roteiros (10 em aondeContent.js + 12 em moreGuides.js) precisam ter
//    um hospedagem.texto proprio, especifico do destino — nao a mesma frase
//    generica repetida ("Fique em X — a base que deixa o roteiro todo a curta
//    distancia, com boas opcoes de pousada e hotel.").

import { test } from "node:test";
import assert from "node:assert/strict";

import { OFFERS, formatRelativePublicado, GUIDE_LIST } from "../src/render/aondeContent.js";

// ---------------------------------------------------------------------------
// TAREFA 1 — carimbo de tempo honesto
// ---------------------------------------------------------------------------

test("formatRelativePublicado calcula o rotulo relativo com plural correto", () => {
  const now = new Date("2026-07-25T12:00:00Z");
  const minutesAgo = (n) => new Date(now.getTime() - n * 60000).toISOString();
  const hoursAgo = (n) => new Date(now.getTime() - n * 3600000).toISOString();
  const daysAgo = (n) => new Date(now.getTime() - n * 86400000).toISOString();

  assert.equal(formatRelativePublicado(minutesAgo(0.2), now), "agora mesmo");
  assert.equal(formatRelativePublicado(minutesAgo(1), now), "há 1 minuto");
  assert.equal(formatRelativePublicado(minutesAgo(20), now), "há 20 minutos");
  assert.equal(formatRelativePublicado(hoursAgo(1), now), "há 1 hora");
  assert.equal(formatRelativePublicado(hoursAgo(2), now), "há 2 horas");
  assert.equal(formatRelativePublicado(hoursAgo(8), now), "há 8 horas");
  assert.equal(formatRelativePublicado(daysAgo(1), now), "há 1 dia");
  assert.equal(formatRelativePublicado(daysAgo(3), now), "há 3 dias");
  // Nao pode virar um numero absurdo tipo "ha 8000 horas": depois de uma
  // semana o rotulo degrada para algo honesto e nao especifico.
  assert.equal(formatRelativePublicado(daysAgo(9), now), "há mais de uma semana");
  assert.equal(formatRelativePublicado(daysAgo(120), now), "há mais de uma semana");
});

test("cada oferta expoe 'publicado' como getter calculado, nao como string fixa", () => {
  assert.ok(OFFERS.length > 0, "ha ofertas para testar");
  for (const offer of OFFERS) {
    assert.ok(
      typeof offer.publicadoEm === "string" && !Number.isNaN(new Date(offer.publicadoEm).getTime()),
      `oferta ${offer.id} precisa ter publicadoEm (ISO valido)`
    );
    const descriptor = Object.getOwnPropertyDescriptor(offer, "publicado");
    assert.equal(typeof descriptor.get, "function", `oferta ${offer.id}.publicado precisa ser um getter`);
    // O rotulo lido agora bate com o que a funcao pura calcularia para o
    // mesmo instante — ou seja, publicado NAO e uma string congelada.
    assert.equal(offer.publicado, formatRelativePublicado(offer.publicadoEm));
  }
});

test("o rotulo 'publicado' muda quando o instante publicadoEm muda (prova de que e calculado na leitura, nao fixo)", () => {
  const offer = OFFERS[0];
  const rotuloOriginal = offer.publicado;
  const publicadoEmOriginal = offer.publicadoEm;

  try {
    // Se fosse uma string fixa, isso nao teria efeito nenhum sobre `publicado`.
    offer.publicadoEm = new Date(Date.now() - 10 * 86400000).toISOString(); // 10 dias atras
    assert.equal(offer.publicado, "há mais de uma semana");
    assert.notEqual(offer.publicado, rotuloOriginal);

    offer.publicadoEm = new Date(Date.now() - 3 * 60000).toISOString(); // 3 min atras
    assert.equal(offer.publicado, "há 3 minutos");
  } finally {
    // Nao deixa estado mutado vazar para outros testes do mesmo processo.
    offer.publicadoEm = publicadoEmOriginal;
  }
});

test("nenhuma oferta ainda usa uma string fixa tipo 'ha Nh'/'ha Nmin' para publicado", () => {
  // Se algum item do array ainda tivesse `publicado: "há 2h"` como valor
  // literal (nao um getter), essa string ficaria congelada para sempre — o
  // problema original que a auditoria encontrou.
  for (const offer of OFFERS) {
    const raw = Object.getOwnPropertyDescriptor(offer, "publicado");
    assert.equal(raw.value, undefined, `oferta ${offer.id} nao pode ter publicado como valor fixo`);
  }
});

// ---------------------------------------------------------------------------
// TAREFA 2 — hospedagem.texto proprio por destino, nos 22 roteiros
// ---------------------------------------------------------------------------

const FRASE_GENERICA_MOLDE = "a base que deixa o roteiro todo a curta distância";

test("os 22 roteiros existem e todos tem hospedagem.texto preenchido", () => {
  assert.equal(GUIDE_LIST.length, 22, "10 guias base + 12 novos = 22 roteiros");
  for (const g of GUIDE_LIST) {
    assert.ok(g.hospedagem && typeof g.hospedagem.texto === "string", `${g.id} precisa ter hospedagem.texto`);
    assert.ok(g.hospedagem.texto.trim().length >= 60, `${g.id}: hospedagem.texto muito curto para ser especifico`);
  }
});

test("hospedagem.texto nao repete a frase-molde generica que o htmlRenderer usa como fallback", () => {
  for (const g of GUIDE_LIST) {
    assert.ok(
      !g.hospedagem.texto.includes(FRASE_GENERICA_MOLDE),
      `${g.id}: hospedagem.texto nao pode ser a frase generica de fallback`
    );
  }
});

test("hospedagem.texto nao usa linguagem de propaganda (hotel inventado, nota, promessa)", () => {
  const proibidas = /\bmelhor hotel\b|\d\s*estrelas|imperdível|imperdivel|avalia[cç][aã]o de \d|\bpromo[cç][aã]o\b/i;
  for (const g of GUIDE_LIST) {
    assert.ok(!proibidas.test(g.hospedagem.texto), `${g.id}: hospedagem.texto parece propaganda, nao conselho`);
  }
});

test("hospedagem.texto e realmente diferente de destino para destino (sem copiar e colar o molde)", () => {
  const textos = GUIDE_LIST.map((g) => ({ id: g.id, texto: g.hospedagem.texto.trim() }));

  // Nenhum texto e identico a outro.
  const vistos = new Map();
  for (const { id, texto } of textos) {
    const chave = texto.toLowerCase();
    assert.ok(!vistos.has(chave), `${id} tem o mesmo texto de ${vistos.get(chave)}`);
    vistos.set(chave, id);
  }

  // E nenhum par de textos e "quase igual" (mesmo trocando so o nome do
  // destino) — medido por similaridade de Jaccard sobre as palavras.
  const tokenize = (s) =>
    new Set(
      s
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter(Boolean)
    );
  const sets = textos.map((t) => ({ id: t.id, tokens: tokenize(t.texto) }));

  const jaccard = (a, b) => {
    let inter = 0;
    for (const w of a) if (b.has(w)) inter++;
    const union = new Set([...a, ...b]).size;
    return union === 0 ? 0 : inter / union;
  };

  const LIMIAR = 0.5; // textos escritos de proposito ficam bem abaixo disso (~0.27 no maior par observado)
  for (let i = 0; i < sets.length; i++) {
    for (let j = i + 1; j < sets.length; j++) {
      const sim = jaccard(sets[i].tokens, sets[j].tokens);
      assert.ok(
        sim < LIMIAR,
        `${sets[i].id} e ${sets[j].id} tem textos parecidos demais (similaridade ${sim.toFixed(2)}) — parece o mesmo molde`
      );
    }
  }
});
