// Barreiras de compreensao apontadas pela auditoria de usuarios: jargao, sigla
// de aeroporto sem cidade, telefone escondido no celular e o conselho de
// hospedagem que era identico nos 22 roteiros.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  renderHomePage,
  renderOffersPage,
  renderOfferPage,
  renderGuidePage,
  renderExitPage,
  renderAlertsPage,
  renderCancelPage,
  renderResultsPage,
} from "../src/render/htmlRenderer.js";
import { cidadeDoIata, rotuloAeroporto } from "../src/render/aeroportos.js";
import { OFFERS } from "../src/render/aondeContent.js";

const GUIA_IDS = [
  "portodegalinhas", "salvador", "noronha", "rio", "bariloche", "chapada", "foz",
  "jeri", "buenosaires", "gramado", "maceio", "lencois", "trancoso", "ouropreto",
  "florianopolis", "paraty", "bonito", "veadeiros", "manaus", "cusco", "atacama",
  "montevideu",
];

test("nenhuma pagina usa o jargao que os usuarios nao entenderam", () => {
  // Lista literal do que um usuario de 68 anos apontou como incompreensivel.
  const proibido = [
    [/\bdouble opt-in\b/i, "double opt-in (ingles)"],
    [/\bcheckout\b/i, "checkout (ingles)"],
    [/,\s*OTA\)/, "OTA (sigla de mercado)"],
    [/controla o estoque/i, '"estoque" de passagem'],
  ];
  const paginas = {
    home: renderHomePage({}),
    ofertas: renderOffersPage([], {}),
    resultados: renderResultsPage({ searched: true, rota: { origem: "GRU", destino: "REC", resumo: "x" } }),
    alertas: renderAlertsPage(),
    cancelamentos: renderCancelPage(),
    saida: renderExitPage({ id: "x", origem: "GRU", destino: "LIS", cidade: "Lisboa", cia: "TAP" }, { affiliateUrl: "https://ex.com" }),
  };
  for (const [nome, html] of Object.entries(paginas)) {
    for (const [re, rotulo] of proibido) {
      assert.ok(!re.test(html), `${nome} ainda usa ${rotulo}`);
    }
  }
});

test('"localizador" nunca aparece sem explicacao', () => {
  const saida = renderExitPage(
    { id: "x", origem: "GRU", destino: "LIS", cidade: "Lisboa", cia: "TAP" },
    { affiliateUrl: "https://ex.com" }
  );
  if (/localizador/i.test(saida)) {
    assert.match(saida, /código da reserva[\s\S]{0,60}localizador/i, "o termo tecnico vem depois do nome comum");
  }
});

test("codigo de aeroporto sempre vem acompanhado da cidade", () => {
  assert.equal(cidadeDoIata("GRU"), "São Paulo");
  assert.equal(cidadeDoIata("gru"), "São Paulo", "aceita minusculo");
  assert.equal(rotuloAeroporto("LIS"), "LIS · Lisboa");
  // Codigo desconhecido degrada para o proprio codigo, sem inventar cidade.
  assert.equal(cidadeDoIata("XXX"), "");
  assert.equal(rotuloAeroporto("XXX"), "XXX");
  assert.equal(rotuloAeroporto(""), "");

  // Filtro "Partindo de" nomeava so a sigla.
  const ofertas = renderOffersPage([], {});
  assert.match(ofertas, /class="orig-pill[^"]*"[^>]*>GRU · São Paulo</, "pilula de origem nomeia a cidade");

  // Detalhe da oferta nomeia as duas pontas.
  const detalhe = renderOfferPage(OFFERS[0], { related: [] });
  assert.match(detalhe, /class="det-rota">GRU · São Paulo → LIS · Lisboa</);

  // Card do feed nomeia a origem (o destino ja vem no titulo do card).
  assert.match(renderHomePage({}), /class="of-rota">saindo de São Paulo \(GRU\)</);
});

test("telefone de atendimento nao desaparece no celular", () => {
  const home = renderHomePage({});
  const mobile = home.slice(home.indexOf("@media(max-width:860px)"));
  const regra = mobile.match(/\.site-atend\{[^}]*\}/);
  assert.ok(regra, "existe regra mobile para o bloco de atendimento");
  assert.ok(!/display:none/.test(regra[0]), `telefone nao pode ser escondido: ${regra[0]}`);
});

test("cabecalho no celular mantem respiro lateral", () => {
  // padding:10px 0 zerava o respiro do .wrap: marca colava na borda esquerda e
  // o botao "Meus alertas" na direita.
  const home = renderHomePage({});
  const mobile = home.slice(home.indexOf("@media(max-width:860px)"));
  const regra = mobile.match(/\.site-header-in\{[^}]*\}/);
  assert.ok(regra, "existe regra mobile do cabecalho");
  assert.ok(
    /padding:10px 20px/.test(regra[0]),
    `cabecalho precisa de padding lateral no celular, veio: ${regra[0]}`
  );
});

test("os 22 roteiros mostram conselho de hospedagem proprio, nao a frase-molde", () => {
  const molde = "a base que deixa o roteiro todo a curta distância";
  const vistos = new Set();
  for (const id of GUIA_IDS) {
    const html = renderGuidePage(id, { apiKey: "" });
    assert.ok(!html.includes(molde), `${id} ainda cai na frase-molde`);
    const m = html.match(/class="lodging-base">([^<]+)</);
    assert.ok(m, `${id} nao renderizou o bloco de hospedagem`);
    const texto = m[1].trim();
    assert.ok(texto.length >= 60, `${id}: conselho curto demais (${texto.length} chars)`);
    assert.ok(!vistos.has(texto), `${id}: conselho repetido de outro roteiro`);
    vistos.add(texto);
  }
  assert.equal(vistos.size, GUIA_IDS.length, "os 22 conselhos sao distintos entre si");
});

test("a interstitial de saida aceita nota extra sem cirurgia em string", () => {
  const nota = "Aviso especifico desta saida.";
  const html = renderExitPage(
    { id: "", origem: "GRU", destino: "REC", cidade: "voos GRU → REC", cia: "Aviasales" },
    { affiliateUrl: "https://www.aviasales.com/search/GRUREC", notaExtra: nota }
  );
  assert.ok(html.includes(nota), "a nota entra na pagina");
  assert.ok(html.indexOf("exit-nota-extra") < html.indexOf("</main>"), "a nota fica dentro do <main>");
  // Sem nota, nada de sobra no HTML.
  const semNota = renderExitPage(
    { id: "", origem: "GRU", destino: "REC", cidade: "voos", cia: "Aviasales" },
    { affiliateUrl: "https://www.aviasales.com/search/GRUREC" }
  );
  assert.ok(!semNota.includes("exit-nota-extra"));
});
