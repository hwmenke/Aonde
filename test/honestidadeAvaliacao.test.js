// Testes nascidos da avaliacao de julho (10 avaliadores). Cada um existe
// porque o site AFIRMAVA alguma coisa que o codigo nao sustentava.
// Ver docs/AVALIACAO-2026-07.md.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  renderHomePage,
  renderResultsPage,
  renderGuidePage,
} from "../src/render/htmlRenderer.js";
import { OFFERS, GUIDES, formatRelativePublicado } from "../src/render/aondeContent.js";
import { resolveAeroporto } from "../src/render/aeroportos.js";
import { buildOfferProduct } from "../src/render/structuredData.js";

// ---------------------------------------------------------------------------
// Urgencia fabricada e superlativo
// ---------------------------------------------------------------------------

test("nenhuma oferta finge urgencia que o codigo nao sustenta", () => {
  // "Preco encontrado as 9h de hoje — tarifas assim somem em horas" era uma
  // string ESTATICA, exibida ao lado de "publicado ha 6 dias" na mesma dobra.
  const proibido = [
    /somem em horas/i,
    /encontrado às \d+h de hoje/i,
    /últimas? \d+ (vagas?|lugares?)/i,
    /corre que (vai )?acaba/i,
    /só hoje/i,
  ];
  for (const o of OFFERS) {
    const txt = [o.texto, ...(o.dicas || [])].join(" ");
    for (const re of proibido) {
      assert.doesNotMatch(txt, re, `oferta ${o.id} usa urgencia fabricada: ${re}`);
    }
  }
});

test("nenhuma oferta faz alegacao superlativa que nao da para provar", () => {
  const proibido = [/somos o melhor preço/i, /o menor preço do brasil/i, /imbatível/i, /o mais barato do mercado/i];
  for (const o of OFFERS) {
    for (const re of proibido) {
      assert.doesNotMatch(String(o.texto || ""), re, `oferta ${o.id}: alegacao insustentavel ${re}`);
    }
  }
});

// ---------------------------------------------------------------------------
// Tempo relativo
// ---------------------------------------------------------------------------

test("o tempo decorrido nunca e arredondado para cima", () => {
  // round() INVENTAVA tempo: 6,6 dias virava "ha mais de uma semana" (falso).
  const atras = (ms) => new Date(Date.now() - ms).toISOString();
  assert.equal(formatRelativePublicado(atras(6.6 * 86400000)), "há 6 dias");
  assert.equal(formatRelativePublicado(atras(6.99 * 86400000)), "há 6 dias");
  assert.equal(formatRelativePublicado(atras(7.1 * 86400000)), "há mais de uma semana");
  assert.equal(formatRelativePublicado(atras(23.9 * 3600000)), "há 23 horas");
  assert.equal(formatRelativePublicado(atras(59.9 * 60000)), "há 59 minutos");
});

// ---------------------------------------------------------------------------
// Promessas condicionais
// ---------------------------------------------------------------------------

test("a home so promete WhatsApp quando ha WhatsApp configurado", () => {
  // Sem AONDE_WHATSAPP, esta era a unica frase do site que prometia
  // atendimento por WhatsApp mesmo assim.
  const h = renderHomePage();
  if (!h.includes("wa.me")) {
    assert.doesNotMatch(
      h,
      /Atendimento humano por WhatsApp/,
      "prometeu WhatsApp sem ter WhatsApp configurado"
    );
  }
});

test("parcelamento e Pix nao sao apresentados como garantia do Aonde", () => {
  // Quem processa o pagamento e sempre o parceiro — o proprio FAQ diz isso.
  const h = renderHomePage();
  assert.doesNotMatch(h, /No Aonde o valor já inclui 12x sem juros/i);
  if (/12x/.test(h)) {
    assert.match(h, /conforme o parceiro|no parceiro|dos parceiros/i,
      "se cita 12x, precisa deixar claro que a condicao e do parceiro");
  }
});

test("o otimizador de datas nao afirma monitoramento diario que nao existe", () => {
  // O bloco se contradizia: manchete dizia "monitoramos todos os dias" e
  // "atualizados nas ultimas 24h"; o rodape do MESMO bloco admitia coleta
  // manual que "pode nao refletir o preco agora".
  const g = GUIDES[Object.keys(GUIDES)[0]];
  const h = renderGuidePage(g);
  assert.doesNotMatch(h, /Monitoramos as tarifas/i);
  assert.doesNotMatch(h, /atualizados nas últimas 24h/i);
});

// ---------------------------------------------------------------------------
// Dado estruturado
// ---------------------------------------------------------------------------

test("o JSON-LD nao anuncia preco garantido sem preco garantido", () => {
  const semLink = buildOfferProduct({ cidade: "Lisboa", preco: "R$ 1.847", href: "/ofertas/a" });
  assert.equal(semLink.offers, undefined, "sem link de afiliado nao ha preco garantido");

  const erro = buildOfferProduct({
    cidade: "Recife", preco: "R$ 587", href: "/ofertas/b",
    affiliateUrl: "https://parceiro.exemplo/x", erro: true,
  });
  assert.equal(erro.offers, undefined, "erro de tarifa nao pode virar InStock");
});

// ---------------------------------------------------------------------------
// Busca de rota: entender ou avisar, nunca adivinhar em silencio
// ---------------------------------------------------------------------------

test("nome de cidade vira o aeroporto certo", () => {
  assert.equal(resolveAeroporto("Porto Alegre"), "POA");
  assert.equal(resolveAeroporto("porto alegre"), "POA");
  assert.equal(resolveAeroporto("Sao Paulo"), "GRU");
  assert.equal(resolveAeroporto("São Paulo"), "GRU");
  assert.equal(resolveAeroporto("Rio de Janeiro"), "GIG");
  assert.equal(resolveAeroporto("GRU"), "GRU");
  assert.equal(resolveAeroporto("gru"), "GRU");
});

test("entrada irreconhecivel devolve null em vez de inventar aeroporto", () => {
  // extractIata() pegava QUALQUER palavra de 3 letras: "xyz" virava aeroporto
  // XYZ, e "Porto Alegre" (sem palavra de 3 letras) caia no padrao GRU.
  for (const lixo of ["xyz", "abc", "", "   ", "asdfghjkl", "123"]) {
    assert.equal(resolveAeroporto(lixo), null, `"${lixo}" nao deveria virar aeroporto`);
  }
});

test("a pagina avisa quando nao entendeu a rota, em vez de trocar em silencio", () => {
  const h = renderResultsPage({
    rota: { origem: "GRU", destino: "REC", resumo: "" },
    searched: true,
    naoEntendi: ["xyz"],
  });
  assert.match(h, /Não reconhecemos/, "sem aviso de rota nao reconhecida");
  assert.match(h, /<strong>xyz<\/strong>/, "o aviso precisa citar o que a pessoa digitou");

  const ok = renderResultsPage({ rota: { origem: "POA", destino: "GRU", resumo: "" }, searched: true, naoEntendi: [] });
  assert.doesNotMatch(ok, /Não reconhecemos/, "avisou sem ter o que avisar");
});

// ---------------------------------------------------------------------------
// O rotulo real x exemplo tambem no JS do cliente
// ---------------------------------------------------------------------------

test("o contador de voos do cliente le o rotulo do servidor", () => {
  // O JS cravava "voos de exemplo": com busca ao vivo, o primeiro clique em
  // qualquer filtro rotulava preco REAL da Amadeus como exemplo.
  const reais = [{ cia: "LATAM", saida: "08:10", chegada: "10:35", duracao: "2h25", paradas: "Direto", direto: true, preco: "R$ 612", melhor: true }];
  const h = renderResultsPage({ searched: true, voos: reais, voosReais: true });
  assert.match(h, /data-res-rotulo="voos encontrados"/, "o servidor precisa publicar o rotulo");
  assert.doesNotMatch(h, /'\s*voos de exemplo · ordenar por'/, "o JS nao pode cravar o rotulo");

  const exemplo = renderResultsPage({ searched: true });
  assert.match(exemplo, /data-res-rotulo="voos de exemplo"/);
});
