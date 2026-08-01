// Testes de HONESTIDADE — cobrem as 5 violacoes apontadas pela auditoria de
// seis usuarios reais e corrigidas em src/render/htmlRenderer.js:
//   1. "atualizado agora" era texto fixo (nao havia atualizacao nenhuma).
//   2. Filtros de voo eram decoracao (sem listener nenhum).
//   3. "Selecionar" pulava a tela de saida e ia direto pro parceiro.
//   4. O rodape prometia hotel/carro/seguro em /ofertas (que so tem passagem).
//   5. O aviso de "sem busca ao vivo" so aparecia DEPOIS de buscar.
//
// Testamos comportamento (o que o HTML realmente diz e para onde os links
// realmente apontam), nao so presenca de string.

import { test } from "node:test";
import assert from "node:assert/strict";

import { renderOffersPage, renderResultsPage, renderHomePage } from "../src/render/htmlRenderer.js";
import { FLIGHT_FILTERS, FLIGHTS, RESULTS_ROUTE } from "../src/render/aondeContent.js";

function assertNoUndefinedNull(html, msg) {
  const clean = html.replace(/onerror="[^"]*"/g, "");
  assert.ok(!/\bundefined\b/.test(clean), `${msg}: contém "undefined"`);
  assert.ok(!/\bnull\b/.test(clean), `${msg}: contém "null"`);
}

// ---------------------------------------------------------------------------
// 1. "atualizado agora" e mentira — nao ha atualizacao nenhuma acontecendo.
// ---------------------------------------------------------------------------

test("renderOffersPage nao promete uma atualizacao que nao existe", () => {
  const html = renderOffersPage([]);
  assert.ok(!html.includes("atualizado agora"), 'não deve mais dizer "atualizado agora"');
  assert.match(html, /<span class="feed-count">\d+ ofertas ativas<\/span>/, "mantém a contagem, sem a alegação falsa");
});

test("renderOffersPage conta certo o numero de ofertas (com filtro de origem)", () => {
  const html = renderOffersPage([], { origem: "GIG" });
  const m = html.match(/<span class="feed-count">(\d+) ofertas ativas<\/span>/);
  assert.ok(m, "contador presente");
  // A contagem tem que ser comportamental: bate com quantos cards de fato saem.
  const cards = (html.match(/class="of-card/g) || []).length;
  assert.equal(Number(m[1]), cards, "número anunciado bate com os cards renderizados");
});

// ---------------------------------------------------------------------------
// 2. Filtros de voo: escolhemos fazê-los funcionar de verdade (client-side),
//    em vez de remover. Aqui testamos o CONTRATO de dados que o script do
//    enhancementScript() consome: cada checkbox carrega data-ftype/data-fval
//    coerentes com seu próprio rótulo, e cada voo carrega data-stops/
//    data-cia/data-hora coerentes com os dados do voo.
// ---------------------------------------------------------------------------

test("cada checkbox de filtro carrega data-ftype/data-fval coerentes com o rotulo (nao e so decoracao)", () => {
  const html = renderResultsPage();
  const inputRe = /<label class="res-check"><input type="checkbox" data-res-filtro data-ftype="([a-z]+)" data-fval="([^"]*)"[^>]*>([^<]+)<\/label>/g;
  let match;
  let total = 0;
  while ((match = inputRe.exec(html))) {
    total++;
    const [, tipo, valor, label] = match;
    assert.notEqual(tipo, "outro", `grupo de filtro nao reconhecido para o rotulo "${label}"`);
    if (tipo === "cia") {
      assert.equal(valor, label.trim(), "filtro de companhia usa o proprio nome da cia como valor");
    } else if (tipo === "paradas") {
      assert.match(valor, /^\d+\+?$/, "filtro de paradas vira um numero (opcionalmente aberto com +)");
    } else if (tipo === "horario") {
      assert.match(valor, /^\d+-\d+$/, "filtro de horario vira uma faixa numerica inicio-fim");
    }
  }
  const totalOpcoes = FLIGHT_FILTERS.reduce((n, g) => n + g.opcoes.length, 0);
  assert.equal(total, totalOpcoes, "todo checkbox declarado em FLIGHT_FILTERS saiu com data-ftype/data-fval");
});

test("cada voo carrega data-stops/data-cia/data-hora coerentes com os proprios dados do voo", () => {
  const voos = [
    { cia: "Azul", numero: "AD 1", saida: "07:05", chegada: "09:00", duracao: "1h55", paradas: "Direto", direto: true, preco: "R$ 500", parcela: "R$ 41,67", melhor: true },
    { cia: "GOL", numero: "G3 2", saida: "13:40", chegada: "18:10", duracao: "4h30", paradas: "2 paradas · CNF, BSB", direto: false, preco: "R$ 700", parcela: "R$ 58,33", melhor: false },
    { cia: "LATAM", numero: "LA 3", saida: "22:10", chegada: "23:59", duracao: "1h49", paradas: "1 parada · GIG", direto: false, preco: "R$ 600", parcela: "R$ 50,00", melhor: false },
  ];
  const html = renderResultsPage({ voos });

  const artigos = [...html.matchAll(/<article class="res-voo[^"]*" data-res-voo data-stops="(-?\d+)" data-cia="([^"]+)" data-hora="(-?\d+)"/g)];
  assert.equal(artigos.length, 3, "um artigo de voo por item, cada um com os 3 data-*");

  assert.equal(artigos[0][1], "0", "voo direto tem 0 paradas");
  assert.equal(artigos[0][2], "Azul");
  assert.equal(artigos[0][3], "7", "hora extraida de 07:05");

  assert.equal(artigos[1][1], "2", "extrai o numero de paradas do texto quando nao e direto");
  assert.equal(artigos[1][2], "GOL");
  assert.equal(artigos[1][3], "13");

  assert.equal(artigos[2][1], "1");
  assert.equal(artigos[2][2], "LATAM");
  assert.equal(artigos[2][3], "22");

  assertNoUndefinedNull(html, "renderResultsPage com voos customizados");
});

test("renderResultsPage com os voos de amostra reais nao vaza undefined/null nos data-*", () => {
  const html = renderResultsPage({ voos: FLIGHTS });
  assertNoUndefinedNull(html, "renderResultsPage com FLIGHTS");
  // Nenhum voo de amostra fica sem stops/cia/hora coerentes (regressao contra
  // uma reintroducao acidental de filtro decorativo).
  const stops = [...html.matchAll(/data-stops="(-?\d+)"/g)].map((m) => Number(m[1]));
  assert.equal(stops.length, FLIGHTS.length);
  assert.ok(stops.every((n) => Number.isInteger(n) && n >= 0), "stops sempre um inteiro nao-negativo");
});

// ---------------------------------------------------------------------------
// 3. "Selecionar" tem que passar pela pagina de saida do proprio site, nunca
//    pular direto para o parceiro (contrato: /saida/voo?origem=&destino=).
// ---------------------------------------------------------------------------

test('"Selecionar" aponta para /saida/voo com origem/destino, nunca direto pro parceiro', () => {
  const html = renderResultsPage({ rota: { origem: "GRU", destino: "REC", resumo: "" }, voos: FLIGHTS });
  const links = [...html.matchAll(/<a class="btn res-sel"([^>]*)>Selecionar →<\/a>/g)];
  assert.equal(links.length, FLIGHTS.length, "todo voo tem um botao Selecionar");
  for (const [, attrs] of links) {
    assert.match(attrs, /href="\/saida\/voo\?origem=GRU&amp;destino=REC"/, "vai para a interstitial do proprio site, com a rota certa");
    assert.ok(!attrs.includes("target="), 'a interstitial e do proprio site: sem target="_blank"');
    assert.ok(!attrs.includes("aviasales.com"), "nunca aponta direto para o site do parceiro");
  }
});

test('"Selecionar" escapa origem/destino corretamente na URL (sem quebrar o atributo href)', () => {
  const html = renderResultsPage({
    rota: { origem: "G&U", destino: "R U", resumo: "" },
    voos: [FLIGHTS[0]],
  });
  assert.match(html, /href="\/saida\/voo\?origem=G%26U&amp;destino=R%20U"/, "parametros vao percent-encoded, e o separador & vira &amp; no atributo");
  assertNoUndefinedNull(html, "renderResultsPage com rota com caracteres especiais");
});

test('"Selecionar" usa a rota informada mesmo quando nao e a rota padrao', () => {
  const html = renderResultsPage({
    rota: { origem: "CNF", destino: "SSA", resumo: "" },
    voos: [FLIGHTS[0]],
  });
  assert.match(html, /href="\/saida\/voo\?origem=CNF&amp;destino=SSA"/);
  assert.ok(!html.includes(`origem=${RESULTS_ROUTE.origem}&amp;destino=${RESULTS_ROUTE.destino}`), "nao fica preso na rota padrao");
});

// ---------------------------------------------------------------------------
// 4. Rodape: "Reservas" so pode prometer o que existe. Hoteis vai pro parceiro
//    real; carro/seguro ficam marcados "em breve" e sem link nenhum.
// ---------------------------------------------------------------------------

function reservasColumn(html) {
  const m = html.match(/<span class="foot-title">Reservas<\/span>(.*?)<\/div>/s);
  assert.ok(m, "coluna Reservas do rodape encontrada");
  return m[1];
}

for (const [nome, render] of [
  ["renderOffersPage", () => renderOffersPage([])],
  ["renderHomePage", () => renderHomePage({})],
  ["renderResultsPage", () => renderResultsPage()],
]) {
  test(`${nome}: rodape nunca manda Hoteis/Carros/Seguro para /ofertas`, () => {
    const col = reservasColumn(render());
    assert.ok(!/href="\/ofertas"/.test(col), 'nenhum link de "Reservas" aponta para /ofertas (que so lista passagem)');
  });

  test(`${nome}: rodape - Passagens vai para /resultados`, () => {
    const col = reservasColumn(render());
    assert.match(col, /<a href="\/resultados">Passagens aéreas<\/a>/);
  });

  test(`${nome}: rodape - Hoteis vai para a busca real do parceiro (Hotellook)`, () => {
    const col = reservasColumn(render());
    assert.match(col, /<a href="https:\/\/search\.hotellook\.com\/[^"]*" target="_blank" rel="noopener sponsored">Hotéis<\/a>/);
  });

  test(`${nome}: rodape - Carros e Seguro sao "em breve" e NAO sao links`, () => {
    const col = reservasColumn(render());
    assert.match(col, /<span class="foot-link--soon" aria-disabled="true" title="Em breve">Aluguel de carros<\/span>/);
    assert.match(col, /<span class="foot-link--soon" aria-disabled="true" title="Em breve">Seguro viagem<\/span>/);
    assert.ok(!/<a[^>]*>Aluguel de carros<\/a>/.test(col), '"Aluguel de carros" nao pode ser um <a> clicavel');
    assert.ok(!/<a[^>]*>Seguro viagem<\/a>/.test(col), '"Seguro viagem" nao pode ser um <a> clicavel');
  });
}

// ---------------------------------------------------------------------------
// 5. O aviso de "sem busca ao vivo" tem que aparecer ANTES do clique em
//    "Buscar voos", no card de busca da home — nao so depois, nos resultados.
// ---------------------------------------------------------------------------

test("home mostra o aviso de busca ao vivo DENTRO do card de busca, ANTES do botao Buscar voos", () => {
  const html = renderHomePage({});
  const noticeIdx = html.indexOf('class="sc-notice"');
  const submitIdx = html.indexOf('class="btn btn-green sc-submit"');
  assert.ok(noticeIdx !== -1, "aviso presente no card de busca");
  assert.ok(submitIdx !== -1, "botao Buscar voos presente");
  assert.ok(noticeIdx < submitIdx, "o aviso vem ANTES do botao — a pessoa sabe antes de clicar, nao depois");
});

test("aviso da home e visivel (nao e letra miuda escondida) e nao tem tom de desculpa", () => {
  const html = renderHomePage({});
  const m = html.match(/<p class="sc-notice">([\s\S]*?)<\/p>/);
  assert.ok(m, "aviso e um paragrafo de verdade, nao um title/tooltip");
  const texto = m[1].replace(/<[^>]+>/g, "");
  assert.ok(texto.length > 20, "tem texto de verdade, nao so um icone");
  assert.ok(!/desculp/i.test(texto), "sem tom de desculpa");
  assert.ok(!/infelizmente/i.test(texto), "sem tom de desculpa");
  assert.ok(!/checkout/i.test(texto), "sem jargao em ingles (persona nao entende)");
  assert.ok(/exemplo/i.test(texto), "deixa claro que o que vai aparecer sao exemplos");
  // Nao deve estar escondido via atributo hidden nem display:none inline.
  const bloco = html.slice(html.indexOf('class="sc-notice"') - 40, html.indexOf('class="sc-notice"') + 20);
  assert.ok(!bloco.includes("hidden"), "aviso nao esta escondido");
});

test("aviso da home nao vaza undefined/null e documento inteiro continua valido", () => {
  const html = renderHomePage({});
  assertNoUndefinedNull(html, "renderHomePage");
  assert.ok(html.trimStart().toLowerCase().startsWith("<!doctype html>"));
});
