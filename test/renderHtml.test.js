// Testes puros (sem rede) do htmlRenderer: formatacao de preco, card de
// oferta, e paginas completas. Cobrem escape de HTML, placeholders, badges e
// a ausencia de "undefined"/"null" na saida.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  escapeHtml,
  formatBRL,
  renderOfferCard,
  renderOffersPage,
  renderItineraryPage,
} from "../src/render/htmlRenderer.js";
import { sampleItinerary, sampleOffers } from "../src/render/sampleData.js";

// Campos ausentes nunca podem vazar como texto "undefined"/"null" no HTML.
// Removemos antes os `onerror="...this.onerror=null..."` (JS legitimo do
// fallback de imagem, nao um vazamento de dado) para nao gerar falso positivo.
function assertNoUndefinedNull(html, msg) {
  const clean = html.replace(/onerror="[^"]*"/g, "");
  assert.ok(!/\bundefined\b/.test(clean), `${msg}: contém "undefined"`);
  assert.ok(!/\bnull\b/.test(clean), `${msg}: contém "null"`);
}

// --- formatBRL ---

test("formatBRL formata valor redondo sem centavos", () => {
  assert.equal(formatBRL(184700), "R$ 1.847");
});

test("formatBRL mostra centavos quando nao redondo", () => {
  assert.equal(formatBRL(184750), "R$ 1.847,50");
});

test("formatBRL com valor pequeno", () => {
  assert.equal(formatBRL(47900), "R$ 479");
});

test("formatBRL entrada invalida retorna string vazia", () => {
  assert.equal(formatBRL(null), "");
  assert.equal(formatBRL(undefined), "");
  assert.equal(formatBRL(NaN), "");
});

// --- escapeHtml ---

test("escapeHtml escapa caracteres perigosos", () => {
  assert.equal(escapeHtml('<script>&"\''), "&lt;script&gt;&amp;&quot;&#39;");
  assert.equal(escapeHtml(null), "");
  assert.equal(escapeHtml(undefined), "");
});

// --- renderOfferCard ---

const baseOffer = {
  id: "gru-rec",
  origem: "GRU",
  destino: "REC",
  cidade: "Recife",
  tipo: "Nacional",
  cia: "GOL",
  preco_centavos: 47900,
  media_centavos: 92000,
  desconto_pct: 48,
  economia_centavos: 44100,
  is_erro_tarifa: false,
  datas_sugeridas: "12–24 out",
  affiliate_url: "https://tp.media/r?marker=demo",
  thumb_url: "https://example.org/recife.jpg",
  thumb_attribution: { author: "Foto Autor", license: "CC BY-SA 4.0" },
  status: "publicada",
};

test("renderOfferCard inclui o preco formatado", () => {
  const html = renderOfferCard(baseOffer);
  assert.ok(html.includes("R$ 479"), "deve conter o preco");
});

test("renderOfferCard inclui o badge de desconto", () => {
  const html = renderOfferCard(baseOffer);
  assert.ok(html.includes("48% abaixo da média"), "deve conter o badge de desconto");
});

test("renderOfferCard inclui de/por com a media", () => {
  const html = renderOfferCard(baseOffer);
  assert.ok(html.includes("R$ 920"), "deve conter a media riscada");
});

test("renderOfferCard usa <img loading=lazy> quando ha thumb_url", () => {
  const html = renderOfferCard(baseOffer);
  assert.ok(/<img[^>]*loading="lazy"/.test(html), "deve ter img lazy");
  assert.ok(/onerror=/.test(html), "img externa deve ter fallback onerror");
});

test("renderOfferCard escapa HTML malicioso no nome/cidade", () => {
  const malicioso = { ...baseOffer, cidade: '<script>alert(1)</script>', destino: '"><img src=x>' };
  const html = renderOfferCard(malicioso);
  assert.ok(!html.includes("<script>alert(1)</script>"), "nao pode injetar script");
  assert.ok(html.includes("&lt;script&gt;"), "deve escapar o script");
});

test("renderOfferCard usa placeholder SVG quando thumb_url ausente", () => {
  const semImagem = { ...baseOffer, thumb_url: null, thumb_attribution: null };
  const html = renderOfferCard(semImagem);
  assert.ok(html.includes("<svg"), "deve conter o placeholder SVG inline");
  assert.ok(!/<img\b/.test(html), "nao deve ter <img> quando sem thumb_url");
});

test("renderOfferCard mostra badge de erro de tarifa quando aplicavel", () => {
  const erro = { ...baseOffer, is_erro_tarifa: true };
  const html = renderOfferCard(erro);
  assert.ok(html.includes("Erro de tarifa"), "deve conter badge de erro de tarifa");
});

test("renderOfferCard nao deixa undefined/null na saida", () => {
  const html = renderOfferCard(baseOffer);
  assertNoUndefinedNull(html, "offer card");
  // Card minimo (muitos campos ausentes) tambem nao pode vazar.
  const minimo = renderOfferCard({ origem: "GRU", destino: "REC", preco_centavos: 47900 });
  assertNoUndefinedNull(minimo, "offer card minimo");
});

// --- renderItineraryPage ---

test("renderItineraryPage inclui <img> para pontos com foto e placeholder para sem foto", () => {
  const html = renderItineraryPage(sampleItinerary);
  assert.ok(/<img\b/.test(html), "deve ter ao menos uma <img> (pontos com foto)");
  assert.ok(html.includes("<svg"), "deve ter placeholder SVG (ponto/hero sem foto)");
});

test("renderItineraryPage inclui a atribuicao obrigatoria de lugares", () => {
  const html = renderItineraryPage(sampleItinerary);
  assert.ok(html.includes("Dados de lugares: Google"), "deve conter a atribuicao Google");
});

test("renderItineraryPage nao deixa undefined/null na saida", () => {
  const html = renderItineraryPage(sampleItinerary);
  assertNoUndefinedNull(html, "itinerary page");
});

test("renderItineraryPage escapa conteudo malicioso", () => {
  const evil = {
    ok: true,
    destination: '<script>alert(1)</script>',
    hero: null,
    days: [
      { n: 1, titulo: "Dia 1", pontos: [{ nome: '<img src=x onerror=alert(1)>', foto: null }] },
    ],
    attribution: "Dados de lugares: Google",
  };
  const html = renderItineraryPage(evil);
  assert.ok(!html.includes("<script>alert(1)</script>"), "nao pode injetar script");
});

// --- Documento completo ---

test("paginas comecam com <!doctype html> e tem <title>", () => {
  const ofertas = renderOffersPage(sampleOffers, { title: "Ofertas — Aonde" });
  const roteiro = renderItineraryPage(sampleItinerary);
  for (const [nome, html] of [["ofertas", ofertas], ["roteiro", roteiro]]) {
    assert.ok(html.trimStart().toLowerCase().startsWith("<!doctype html>"), `${nome}: deve comecar com doctype`);
    assert.ok(/<title>[^<]+<\/title>/.test(html), `${nome}: deve ter <title> nao vazio`);
  }
});

test("renderOffersPage inclui a nota de afiliado (LGPD)", () => {
  const html = renderOffersPage(sampleOffers, {});
  assert.ok(html.includes("comissão"), "deve mencionar comissao de afiliado");
  assert.ok(html.includes("sem custo extra"), "deve trazer a nota LGPD sem custo extra");
});

test("renderOffersPage renderiza todos os cards de fixture sem undefined/null", () => {
  const html = renderOffersPage(sampleOffers, {});
  assertNoUndefinedNull(html, "offers page (fixtures)");
  // Uma das fixtures e erro de tarifa; outra e sem imagem.
  assert.ok(html.includes("Erro de tarifa"), "fixtures incluem erro de tarifa");
  assert.ok(html.includes("<svg"), "fixtures incluem card sem imagem (placeholder)");
});
