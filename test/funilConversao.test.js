// Caminho home → /hoje → página da oferta → parceiro.
// O próximo passo é explícito, o rótulo combina com o destino do clique,
// e cada frase usa só o que a oferta já traz (fonte, data, Buy ou busca).

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  renderHomePage,
  renderTodayPage,
  renderOfferPage,
  renderExitPage,
} from "../src/render/htmlRenderer.js";
import { OFFERS } from "../src/render/aondeContent.js";
import { pacoteDoDia } from "../src/daily/dailyPick.js";

const byId = (id) => OFFERS.find((o) => o.id === id);

function cardsDaHome(html) {
  const secao = html.split('id="ofertas"')[1] || "";
  const ateRoteiros = secao.split('id="estilos"')[0] || secao;
  return ateRoteiros.match(/<a class="of-card[\s\S]*?<\/a>/g) || [];
}

test("home: o hero aponta para a escolha do dia e para os achados", () => {
  const html = renderHomePage({});
  assert.match(html, /class="hero-ctas"/);
  assert.match(html, /class="btn btn-green" href="\/hoje">Ver a escolha do dia →/);
  assert.match(html, /class="btn btn-ghost" href="\/ofertas">Ver os achados de passagem →/);
  assert.match(html, /class="hero-passo"/);
  assert.match(html, /Nenhum deles reserva passagem/);
  assert.match(html, /o botão Buscar voos mostra <strong>exemplos<\/strong>/);
  assert.match(html, /Os cards mais abaixo são outra lista/);
  assert.doesNotMatch(html, /válidas até/);
  assert.doesNotMatch(html, /Tarifas negociadas/);
  assert.doesNotMatch(html, /domingo, 23h59/);
});

test("home: cada card abre a página da oferta, com a expectativa certa", () => {
  const html = renderHomePage({});
  const cards = cardsDaHome(html);
  assert.ok(cards.length >= 2, "a home mostra achados");
  for (const card of cards) {
    assert.match(card, /href="\/ofertas\/[a-z0-9-]+"/);
    assert.doesNotMatch(card, /href="\/saida\//);
    assert.match(card, /Ver esta oferta →/);
    assert.match(card, /class="of-cta-nota"/);
  }
  const comBusca = cards.filter((c) => /busca no Aviasales, não uma reserva/.test(c));
  const comParceiro = cards.filter((c) => /segue para o parceiro/.test(c));
  const semLink = cards.filter((c) => /exemplos de voo desta rota/.test(c));
  assert.equal(comBusca.length + comParceiro.length + semLink.length, cards.length, "cada card explica o passo seguinte");
  for (const card of cards) {
    const id = (card.match(/href="\/ofertas\/([a-z0-9-]+)"/) || [])[1];
    const oferta = byId(id);
    assert.ok(oferta, `card aponta para uma oferta que existe: ${id}`);
    const temLink = !!(oferta.aviasalesUrl || oferta.affiliateUrl || oferta.affiliate_url);
    if (!temLink) assert.match(card, /exemplos de voo desta rota/);
    else if (oferta.aviasalesBuy === false) assert.match(card, /busca no Aviasales, não uma reserva/);
    else assert.match(card, /segue para o parceiro/);
  }
  assert.match(html, /href="\/hoje">Ver a escolha do dia →/);
  assert.match(html, /href="\/ofertas">Ver todos os achados →/);
});

test("/hoje: o card leva à oferta correspondente, não pula para o parceiro", () => {
  const eze = renderTodayPage(pacoteDoDia("2026-08-21"));
  assert.match(eze, /class="btn btn-green" href="\/ofertas\/gru-eze">Ver esta oferta →/);
  assert.doesNotMatch(eze, /href="\/saida\/gru-eze"/);
  assert.match(eze, /De lá, o botão abre o Aviasales/);
  assert.match(eze, /O Aonde não cobra nada de você/);
  assert.doesNotMatch(eze, /Reservar no Aviasales/);

  const fln = renderTodayPage(pacoteDoDia("2026-08-22"));
  assert.match(fln, /class="btn btn-green" href="\/ofertas\/gru-fln">Ver esta oferta →/);
  assert.doesNotMatch(fln, /href="\/saida\/gru-fln"/);
  assert.match(fln, /sem botão Buy/);
  assert.match(fln, /Não é um preço de reserva/);
  assert.doesNotMatch(fln, /Reservar no Aviasales/);

  const ssa = renderTodayPage(pacoteDoDia("2026-08-23"));
  assert.match(ssa, /class="btn btn-green" href="\/ofertas\/gig-ssa">Ver esta oferta →/);
  assert.doesNotMatch(ssa, /href="\/saida\/gig-ssa"/);
});

test("página da oferta guarda o botão do parceiro e o canonical da própria página", () => {
  const fln = renderOfferPage(byId("gru-fln"), { related: [byId("gru-eze")] });
  assert.match(fln, /href="\/saida\/gru-fln"/);
  assert.match(fln, /Ver busca no Aviasales →/);
  assert.match(fln, /rel="canonical" href="https:\/\/aonde\.com\.br\/ofertas\/gru-fln"/);
  assert.doesNotMatch(fln, /rel="canonical" href="[^"]*\/saida\//);
  assert.match(fln, /class="rel-card" href="\/ofertas\/gru-eze"/);
  assert.match(fln, /Ver esta oferta →/);
  assert.doesNotMatch(fln, /class="rel-card" href="\/saida\//);

  const eze = renderOfferPage(byId("gru-eze"), { related: [] });
  assert.match(eze, /href="\/saida\/gru-eze"/);
  assert.match(eze, /Reservar no Aviasales →/);
  assert.match(eze, /rel="canonical" href="https:\/\/aonde\.com\.br\/ofertas\/gru-eze"/);
});

test("a saída volta para a página da oferta, não para ela mesma", () => {
  const html = renderExitPage(byId("gru-eze"), { affiliateUrl: "https://tp.media/r?p=1" });
  assert.match(html, /href="\/ofertas\/gru-eze">Buenos Aires<\/a> · <span>Saindo do Aonde<\/span>/);
  assert.match(html, /Continuar para Aviasales →/);
  assert.doesNotMatch(html, /href="\/saida\/gru-eze"/);
});
