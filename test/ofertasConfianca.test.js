// Paginas de oferta (/ofertas e /ofertas/:id): CTA claro, sinais de confianca
// que o codigo/dados sustentam, marcador unico de moeda, busca/filtros e
// estados vazio/erro.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createServer } from "../src/server.js";
import { OFFERS } from "../src/render/aondeContent.js";
import { formatMoedaExibicao } from "../src/render/texto.js";
import { buildOfferProduct } from "../src/render/structuredData.js";
import { renderOfferCard, renderOfferPage, renderOffersPage } from "../src/render/htmlRenderer.js";

async function withServer(t) {
  const original = process.env.AONDE_DATA_DIR;
  const dir = await mkdtemp(path.join(os.tmpdir(), "aonde-ofertas-ux-"));
  process.env.AONDE_DATA_DIR = dir;
  const server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    if (original === undefined) delete process.env.AONDE_DATA_DIR;
    else process.env.AONDE_DATA_DIR = original;
    await rm(dir, { recursive: true, force: true });
  });
  return `http://127.0.0.1:${server.address().port}`;
}

const byId = (id) => OFFERS.find((o) => o.id === id);

const AO_VIVO = {
  id: "gru-rec",
  origem: "GRU",
  destino: "REC",
  cidade: "Recife",
  local: "Pernambuco",
  tipo: "Nacional",
  cia: "GOL",
  preco_centavos: 47900,
  media_centavos: 92000,
  economia_centavos: 44100,
  is_erro_tarifa: false,
  datas_sugeridas: "12–24 out",
  affiliate_url: "https://tp.media/r?p=gru-rec",
  status: "publicada",
};

// ---------------------------------------------------------------------------
// Marcador de moeda: "USD $268" nos dados, "US$ 268" na tela.
// ---------------------------------------------------------------------------

test("formatMoedaExibicao: um unico marcador de dolar; reais e vazios intactos", () => {
  assert.equal(formatMoedaExibicao("USD $268"), "US$ 268");
  assert.equal(formatMoedaExibicao("USD $1.234"), "US$ 1.234");
  assert.equal(formatMoedaExibicao("USD 268"), "US$ 268");
  assert.equal(formatMoedaExibicao("o $513 e o USD $532"), "o US$ 513 e o US$ 532");
  assert.equal(formatMoedaExibicao("R$ 1.570 e USD $322"), "R$ 1.570 e US$ 322");
  assert.equal(formatMoedaExibicao("US$ 268"), "US$ 268", "idempotente");
  assert.equal(formatMoedaExibicao("R$ 587"), "R$ 587");
  assert.equal(formatMoedaExibicao("o dólar não é o real"), "o dólar não é o real");
  assert.equal(formatMoedaExibicao(null), "");
  assert.equal(formatMoedaExibicao(undefined), "");
});

test("os dados continuam com 'USD $' (so a exibicao muda)", () => {
  assert.equal(byId("gru-scl").preco, "USD $268");
  assert.equal(byId("gru-scl").flex[0].p, "USD $268");
});

test("nenhuma pagina de oferta mostra 'USD $' na tela", async (t) => {
  const base = await withServer(t);
  const paginas = ["/ofertas", "/hoje", ...OFFERS.map((o) => `/ofertas/${o.id}`)];
  for (const p of paginas) {
    const res = await fetch(`${base}${p}`);
    const html = await res.text();
    assert.doesNotMatch(html, /USD\s*\$/, `${p} nao deve repetir o marcador de moeda`);
  }
});

test("preco em dolar aparece como US$ no card, no hero e no buy box", () => {
  const scl = byId("gru-scl");
  const feed = renderOffersPage([]);
  const card = feed.match(/<a class="of-card[^"]*" href="\/saida\/gru-scl">[\s\S]*?<\/a>/);
  assert.ok(card, "card do gru-scl no feed");
  assert.match(card[0], /<span class="of-preco">US\$ 268<\/span>/);
  const pagina = renderOfferPage(scl, { related: [] });
  assert.match(pagina, /<span class="det-preco">US\$ 268<\/span>/);
  assert.match(pagina, /<p class="det-buy-preco"[^>]*>US\$ 268<\/p>/);
});

test("JSON-LD continua em USD com o numero certo (dado estruturado nao muda)", () => {
  const html = renderOfferPage(byId("for-ssa"), { related: [] });
  const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const product = ld.find((j) => j["@type"] === "Product");
  assert.ok(product && product.offers, "Product com offers");
  assert.equal(product.offers.priceCurrency, "USD");
  assert.equal(product.offers.price, 242);
  const direto = buildOfferProduct({
    id: "x", origem: "GRU", destino: "SCL", cidade: "Santiago", preco: "US$ 268",
    affiliateUrl: "https://tp.media/r", aviasalesBuy: true, erro: false, href: "/saida/x",
  });
  assert.equal(direto.offers.priceCurrency, "USD");
  assert.equal(direto.offers.price, 268);
});

// ---------------------------------------------------------------------------
// CTA dos cards
// ---------------------------------------------------------------------------

test("card com link de parceiro diz para onde vai e que a compra termina la", () => {
  const html = renderOfferCard(AO_VIVO);
  assert.match(html, /href="\/saida\/gru-rec"/);
  assert.match(html, /<span class="of-cta">Ver no Aviasales →<\/span>/);
  assert.match(html, /A compra termina no site do parceiro/);
  assert.doesNotMatch(html, /Ver oferta →/);
});

test("card sem link de parceiro leva ao detalhe e nao promete parceiro", () => {
  const { affiliate_url: _omit, ...semLink } = AO_VIVO;
  const html = renderOfferCard(semLink);
  assert.match(html, /href="\/ofertas\/gru-rec"/);
  assert.match(html, /Ver detalhes da oferta →/);
  assert.doesNotMatch(html, /parceiro/);
  assert.doesNotMatch(html, /Aviasales/);
});

test("card sem botao Buy (gru-fln) nao finge reserva", () => {
  const fln = byId("gru-fln");
  assert.equal(fln.aviasalesBuy, false, "premissa: gru-fln e so busca");
  const feed = renderOffersPage([]);
  const card = feed.match(/<a class="of-card[^"]*" href="\/saida\/gru-fln">[\s\S]*?<\/a>/);
  assert.ok(card, "card do gru-fln no feed");
  assert.match(card[0], /Ver busca no Aviasales →/);
  assert.doesNotMatch(card[0], /Reservar/);
});

test("card so mostra 'Visto no ...' quando a oferta traz fonte/data", () => {
  const comFonte = renderOfferCard({ ...AO_VIVO, fonte_preco: "Aviasales", fonte_preco_em: "2026-08-28" });
  assert.match(comFonte, /<span class="of-fonte">Visto no Aviasales, 28 ago 2026<\/span>/);
  const semFonte = renderOfferCard(AO_VIVO);
  assert.doesNotMatch(semFonte, /Visto/);
  assert.doesNotMatch(semFonte, /of-fonte/);
});

// ---------------------------------------------------------------------------
// Pagina de oferta: confianca
// ---------------------------------------------------------------------------

test("detalhe com parceiro: passo claro antes do CTA e preco explicado", () => {
  const html = renderOfferPage(byId("for-ssa"), { related: [] });
  const buy = (html.match(/<div class="det-buy">([\s\S]*?)<p class="det-buy-perks">/) || [])[1] || "";
  const passoAt = buy.indexOf("Você finaliza a compra no site do parceiro");
  const ctaAt = buy.indexOf("Reservar no Aviasales");
  assert.ok(passoAt > -1, "passo explicito");
  assert.ok(ctaAt > passoAt, "o passo vem antes do botao");
  assert.match(buy, /O Aonde não vende passagem nem cobra pagamento/);
  assert.match(html, /<details class="det-preco-info"><summary>O que significa este preço\?<\/summary>/);
  assert.match(html, /preço de <strong>ida e volta<\/strong> para as datas <strong>3–10 out<\/strong>/);
  assert.match(html, /Visto no Aviasales, 28 ago 2026\. O preço pode ter mudado desde essa consulta\./);
  assert.match(html, /valor está em <strong>dólares \(US\$\)<\/strong>, não em reais/);
  assert.match(html, /só são confirmados no site do parceiro, antes de você pagar/);
});

test("detalhe sem botao Buy descreve uma busca, nao uma compra", () => {
  const html = renderOfferPage(byId("gru-fln"), { related: [] });
  assert.match(html, /Este botão abre uma busca no Aviasales/);
  assert.doesNotMatch(html, /Reservar no Aviasales/);
  assert.doesNotMatch(html, /Você finaliza a compra no site do parceiro/);
});

test("detalhe editorial sem link de parceiro admite que sao voos de exemplo", () => {
  const html = renderOfferPage(byId("gru-lis"), { related: [] });
  assert.match(html, /Estes são voos de exemplo desta rota/);
  assert.match(html, /Ver voos de GRU para LIS →/);
  assert.doesNotMatch(html, /Ver voos GRU → LIS →/);
});

test("explicacao do preco so cita dolar/media/data quando os dados existem", () => {
  const reais = renderOfferPage({ ...AO_VIVO, economia_centavos: undefined }, {});
  assert.doesNotMatch(reais, /dólares/);
  assert.doesNotMatch(reais, /O preço pode ter mudado desde essa consulta/, "sem data nao inventa consulta");
  assert.match(reais, /valor riscado \(R\$ 920\) é a média de referência da rota informada na oferta\./);
  const semMedia = renderOfferPage({ ...AO_VIVO, media_centavos: undefined, economia_centavos: undefined }, {});
  assert.doesNotMatch(semMedia, /valor riscado/);
  assert.doesNotMatch(semMedia, /por pessoa|taxas inclu|bagagem inclu/i, "nada alem do que os dados dizem");
});

// ---------------------------------------------------------------------------
// Busca e filtros em /ofertas
// ---------------------------------------------------------------------------

function cardsDe(html) {
  return html.match(/<a class="of-card[^"]*"[\s\S]*?<\/a>/g) || [];
}

test("/ofertas tem formulario de busca com role=search e sem JavaScript", () => {
  const html = renderOffersPage([]);
  assert.match(html, /<form class="feed-filtros" method="get" action="\/ofertas" role="search"/);
  assert.match(html, /<input type="search" name="q"/);
  assert.match(html, /<select name="tipo"><option value="">Todos<\/option>/);
  assert.doesNotMatch(html, /Limpar filtros/, "sem filtro ativo nao ha o que limpar");
});

test("busca ignora acento e caixa, e acha por cidade, pais ou companhia", () => {
  const todos = cardsDe(renderOffersPage([])).length;
  const flo = cardsDe(renderOffersPage([], { q: "FLORIANOPOLIS" }));
  assert.ok(flo.length > 0 && flo.length < todos);
  for (const c of flo) assert.match(c, /Florianópolis/);
  const pais = cardsDe(renderOffersPage([], { q: "portugal" }));
  assert.ok(pais.some((c) => /Lisboa/.test(c)));
  const cia = cardsDe(renderOffersPage([], { q: "swiss" }));
  assert.ok(cia.length > 0);
  for (const c of cia) assert.match(c, /SWISS/);
});

test("filtro de tipo e combinavel com origem e busca", () => {
  const nac = cardsDe(renderOffersPage([], { tipo: "Nacional" }));
  const intl = cardsDe(renderOffersPage([], { tipo: "Internacional" }));
  assert.ok(nac.length > 0 && intl.length > 0);
  assert.equal(nac.length + intl.length, cardsDe(renderOffersPage([])).length);
  const combo = renderOffersPage([], { tipo: "Nacional", origem: "GRU", q: "recife" });
  for (const c of cardsDe(combo)) assert.match(c, /Recife/);
  assert.match(combo, /<option value="Nacional" selected>/);
  assert.match(combo, /<input type="hidden" name="origem" value="GRU">/);
  assert.match(combo, /de \d+ no total/);
});

test("tipo desconhecido e ignorado; busca enorme e cortada; nada vaza sem escape", () => {
  const html = renderOffersPage([], { tipo: "<script>x</script>", q: `"><img src=x onerror=alert(1)>${"a".repeat(200)}` });
  assert.doesNotMatch(html, /<img src=x/);
  assert.doesNotMatch(html, /<script>x<\/script>/);
  assert.doesNotMatch(html, /selected>Nacional/);
  const valor = html.match(/name="q" value="([^"]*)"/);
  assert.ok(valor && valor[1].length <= 60 * 6, "valor limitado a 60 caracteres (antes do escape)");
});

test("pilulas de origem preservam a busca e o tipo", () => {
  const html = renderOffersPage([], { q: "recife", tipo: "Nacional", origem: "GRU" });
  assert.match(html, /<a class="orig-pill is-active" href="\/ofertas\?origem=GRU&amp;q=recife&amp;tipo=Nacional" aria-current="true">/);
  assert.match(html, /<a class="orig-pill" href="\/ofertas\?q=recife&amp;tipo=Nacional">Todas as origens<\/a>/);
});

test("contagem usa singular e plural certos", () => {
  const um = renderOffersPage([AO_VIVO]);
  assert.match(um, /<span class="feed-count">1 oferta ativa<\/span>/);
  const varias = renderOffersPage([AO_VIVO, { ...AO_VIVO, id: "gru-mac", destino: "MCZ", cidade: "Maceió" }]);
  assert.match(varias, /<span class="feed-count">2 ofertas ativas<\/span>/);
});

// ---------------------------------------------------------------------------
// Estados vazio e de erro
// ---------------------------------------------------------------------------

test("busca sem resultado: estado vazio com o que foi filtrado, limpar e alerta", () => {
  const html = renderOffersPage([], { q: "zzzzzz" });
  assert.equal(cardsDe(html).length, 0);
  assert.match(html, /<p class="feed-vazio" role="status">Nenhum achado para <strong>“zzzzzz”<\/strong> hoje\./);
  assert.match(html, /<a href="\/ofertas">Limpar filtros<\/a>/);
  assert.match(html, /<a href="\/alertas">crie um alerta grátis<\/a>/);
  assert.match(html, /<span class="feed-count">0 ofertas ativas<\/span>/);
  assert.match(html, /<a class="feed-limpar" href="\/ofertas">Limpar filtros<\/a>/);
});

test("estado vazio nomeia origem, busca e tipo juntos", () => {
  const html = renderOffersPage([], { origem: "MAO", q: "lisboa", tipo: "Nacional" });
  assert.match(html, /Nenhum achado saindo de <strong>[^<]+<\/strong> para <strong>“lisboa”<\/strong> do tipo <strong>Nacional<\/strong> hoje\./);
});

test("GET /ofertas?q=... filtra no servidor", async (t) => {
  const base = await withServer(t);
  const res = await fetch(`${base}/ofertas?q=${encodeURIComponent("florianópolis")}`);
  assert.equal(res.status, 200);
  const html = await res.text();
  const cards = cardsDe(html);
  assert.ok(cards.length > 0);
  for (const c of cards) assert.match(c, /Florianópolis/);
  assert.match(html, /<link rel="canonical" href="[^"]*\/ofertas">/, "filtros nao criam URL canonica nova");
  const vazio = await (await fetch(`${base}/ofertas?q=zzzz`)).text();
  assert.match(vazio, /Nenhum achado para/);
});

test("oferta inexistente: 404 com aviso claro, noindex e a lista logo abaixo", async (t) => {
  const base = await withServer(t);
  const res = await fetch(`${base}/ofertas/nao-existe-<b>`);
  assert.equal(res.status, 404);
  const html = await res.text();
  assert.match(html, /<div class="feed-aviso" role="alert"><strong>Não encontramos essa oferta\.<\/strong>/);
  assert.match(html, /<code>nao-existe-&lt;b&gt;<\/code>/);
  assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
  assert.doesNotMatch(html, /rel="canonical"/);
  assert.match(html, /<title>Oferta não encontrada — Aonde<\/title>/);
  assert.ok(cardsDe(html).length > 0, "a pessoa nao fica num beco sem saida");
});

test("feed normal nao mostra aviso de erro e continua indexavel", () => {
  const html = renderOffersPage([]);
  assert.doesNotMatch(html, /class="feed-aviso"/);
  assert.doesNotMatch(html, /name="robots"/);
  assert.match(html, /rel="canonical" href="[^"]*\/ofertas"/);
});
