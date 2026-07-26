// Testes dos dados estruturados (JSON-LD) para SEO: builders puros em
// structuredData.js + a integracao nas paginas via htmlDocument
// (htmlRenderer.js). Puros (sem rede).

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  renderHomePage,
  renderHelpPage,
  renderGuidePage,
  renderOfferPage,
} from "../src/render/htmlRenderer.js";
import { OFFERS as CONTENT_OFFERS } from "../src/render/aondeContent.js";
import {
  SITE_URL,
  buildOrganization,
  buildWebSite,
  buildBreadcrumbList,
  buildFaqPage,
  buildTouristTrip,
  buildOfferProduct,
  FAQ_GROUPS,
} from "../src/render/structuredData.js";

// Extrai o conteudo de todos os <script type="application/ld+json"> de um
// documento HTML e devolve os objetos ja parseados (lanca se algum nao for
// JSON valido).
function extractJsonLd(html) {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  return blocks.map((m) => JSON.parse(m[1]));
}

// ---------------------------------------------------------------------------
// Builders puros
// ---------------------------------------------------------------------------

test("buildOrganization devolve um Organization valido com @id e url absolutos", () => {
  const org = buildOrganization();
  assert.equal(org["@type"], "Organization");
  assert.equal(org.name, "Aonde");
  assert.equal(org.url, SITE_URL);
  assert.ok(org["@id"].startsWith(SITE_URL));
});

test("buildWebSite referencia a Organization via publisher.@id e nao inventa SearchAction", () => {
  const site = buildWebSite();
  assert.equal(site["@type"], "WebSite");
  assert.equal(site.publisher["@id"], buildOrganization()["@id"]);
  assert.equal(site.potentialAction, undefined, "sem caixa de busca real, nao deve fabricar SearchAction");
});

test("buildBreadcrumbList monta ListItem sequenciais com URL absoluta", () => {
  const bc = buildBreadcrumbList([
    { name: "Início", url: "/" },
    { name: "Guias de destino", url: "/guias" },
    { name: "Salvador", url: "/guias/salvador" },
  ]);
  assert.equal(bc["@type"], "BreadcrumbList");
  assert.equal(bc.itemListElement.length, 3);
  assert.deepEqual(
    bc.itemListElement.map((i) => i.position),
    [1, 2, 3]
  );
  assert.equal(bc.itemListElement[2].item, `${SITE_URL}/guias/salvador`);
});

test("buildBreadcrumbList devolve null sem itens validos", () => {
  assert.equal(buildBreadcrumbList([]), null);
  assert.equal(buildBreadcrumbList(null), null);
});

test("buildFaqPage usa FAQ_GROUPS por padrao e cobre todas as perguntas", () => {
  const faq = buildFaqPage();
  const totalItems = FAQ_GROUPS.reduce((n, g) => n + g.items.length, 0);
  assert.equal(faq["@type"], "FAQPage");
  assert.equal(faq.mainEntity.length, totalItems);
  for (const q of faq.mainEntity) {
    assert.equal(q["@type"], "Question");
    assert.ok(q.name.length > 0);
    assert.equal(q.acceptedAnswer["@type"], "Answer");
    assert.ok(q.acceptedAnswer.text.length > 0);
  }
});

test("buildFaqPage devolve null sem perguntas", () => {
  assert.equal(buildFaqPage([]), null);
});

test("buildTouristTrip monta o itinerario a partir dos dias/pontos do guia", () => {
  const g = {
    id: "salvador",
    titulo: "Salvador em 5 dias, sem pressa",
    breadcrumb: "Salvador",
    intro: "Intro do guia.",
    dias: [
      { n: 1, pontos: [{ nome: "Pelourinho", nota: "casario colorido" }] },
      { n: 2, pontos: [{ nome: "Farol da Barra" }] },
    ],
  };
  const trip = buildTouristTrip(g);
  assert.equal(trip["@type"], "TouristTrip");
  assert.equal(trip.name, g.titulo);
  assert.equal(trip.url, `${SITE_URL}/guias/salvador`);
  assert.equal(trip.itinerary["@type"], "ItemList");
  assert.equal(trip.itinerary.itemListElement.length, 2);
  assert.equal(trip.itinerary.itemListElement[0].item.name, "Pelourinho");
  assert.equal(trip.itinerary.itemListElement[0].item.description, "casario colorido");
});

test("buildTouristTrip devolve null sem titulo", () => {
  assert.equal(buildTouristTrip(null), null);
  assert.equal(buildTouristTrip({ dias: [] }), null);
});

test("buildOfferProduct converte o preco em BRL formatado para numero + Offer valido", () => {
  const product = buildOfferProduct({
    id: "gru-lis",
    origem: "GRU",
    destino: "LIS",
    cidade: "Lisboa",
    preco: "R$ 1.847",
    thumbUrl: "https://example.com/lis.jpg",
    href: "/ofertas/gru-lis",
  });
  assert.equal(product["@type"], "Product");
  assert.match(product.name, /Lisboa/);
  assert.equal(product.image, "https://example.com/lis.jpg");
  assert.equal(product.offers["@type"], "Offer");
  assert.equal(product.offers.price, 1847);
  assert.equal(product.offers.priceCurrency, "BRL");
  assert.equal(product.offers.availability, "https://schema.org/InStock");
  assert.equal(product.offers.url, `${SITE_URL}/ofertas/gru-lis`);
});

test("buildOfferProduct lida com preco com centavos (virgula pt-BR)", () => {
  const product = buildOfferProduct({ cidade: "Recife", preco: "R$ 1.847,50", href: "/ofertas/x" });
  assert.equal(product.offers.price, 1847.5);
});

test("buildOfferProduct sem preco reconhecivel omite offers, mas ainda devolve o Product", () => {
  const product = buildOfferProduct({ cidade: "Recife", preco: "", href: "/ofertas/x" });
  assert.equal(product["@type"], "Product");
  assert.equal(product.offers, undefined);
});

test("buildOfferProduct devolve null sem destino", () => {
  assert.equal(buildOfferProduct(null), null);
  assert.equal(buildOfferProduct({ preco: "R$ 10" }), null);
});

// ---------------------------------------------------------------------------
// Integracao nas paginas — cada pagina relevante deve conter
// application/ld+json PARSEAVEL com o(s) tipo(s) correto(s).
// ---------------------------------------------------------------------------

test("renderHomePage inclui Organization + WebSite parseaveis", () => {
  const html = renderHomePage({});
  assert.ok(html.includes('type="application/ld+json"'));
  const objs = extractJsonLd(html);
  const types = objs.map((o) => o["@type"]);
  assert.ok(types.includes("Organization"));
  assert.ok(types.includes("WebSite"));
});

test("renderHelpPage inclui um FAQPage parseavel com todas as perguntas", () => {
  const html = renderHelpPage();
  assert.ok(html.includes('type="application/ld+json"'));
  const objs = extractJsonLd(html);
  const faq = objs.find((o) => o["@type"] === "FAQPage");
  assert.ok(faq, "deve conter um bloco FAQPage");
  const totalItems = FAQ_GROUPS.reduce((n, g) => n + g.items.length, 0);
  assert.equal(faq.mainEntity.length, totalItems);
});

test("renderGuidePage (roteiro editorial) inclui TouristTrip + BreadcrumbList parseaveis", () => {
  const html = renderGuidePage("salvador");
  assert.ok(html.includes('type="application/ld+json"'));
  const objs = extractJsonLd(html);
  const trip = objs.find((o) => o["@type"] === "TouristTrip");
  const bc = objs.find((o) => o["@type"] === "BreadcrumbList");
  assert.ok(trip, "deve conter um bloco TouristTrip");
  assert.equal(trip.name, "Salvador em 5 dias, sem pressa");
  assert.ok(trip.itinerary.itemListElement.length > 0, "itinerario com pontos");
  assert.ok(bc, "deve conter um bloco BreadcrumbList");
  assert.equal(bc.itemListElement.at(-1).name, "Salvador");
});

test("renderOfferPage inclui Product/Offer + BreadcrumbList parseaveis", () => {
  const offer = CONTENT_OFFERS.find((o) => o.id === "gru-lis");
  const html = renderOfferPage(offer, {});
  assert.ok(html.includes('type="application/ld+json"'));
  const objs = extractJsonLd(html);
  const product = objs.find((o) => o["@type"] === "Product");
  const bc = objs.find((o) => o["@type"] === "BreadcrumbList");
  assert.ok(product, "deve conter um bloco Product");
  assert.equal(product.offers["@type"], "Offer");
  assert.equal(product.offers.priceCurrency, "BRL");
  assert.ok(product.offers.price > 0);
  assert.ok(bc, "deve conter um bloco BreadcrumbList");
});

// ---------------------------------------------------------------------------
// Seguranca — um nome de guia/oferta com "</script>" nao pode escapar do
// bloco JSON-LD (breakout classico). O JSON-LD continua parseavel e a string
// crua de breakout nunca aparece no HTML.
// ---------------------------------------------------------------------------

test("XSS: titulo de guia com </script> nao escapa do bloco JSON-LD", () => {
  const payload = 'Evil</script><script>alert(1)</script>';
  const evilGuide = {
    id: "evil-guide",
    breadcrumb: payload,
    titulo: payload,
    intro: "intro",
    dias: [{ n: 1, pontos: [{ nome: payload }] }],
  };
  const html = renderGuidePage(evilGuide);
  assert.ok(!html.includes(payload), "a string crua de breakout nao deve aparecer no HTML");
  const objs = extractJsonLd(html); // lanca se algum bloco nao for JSON valido
  const trip = objs.find((o) => o["@type"] === "TouristTrip");
  assert.equal(trip.name, payload, "o dado original e preservado dentro do JSON parseado");
});

test("XSS: nome de destino de oferta com </script> nao escapa do bloco JSON-LD", () => {
  const payload = 'Recife</script><script>alert(2)</script>';
  const offer = {
    id: "evil-offer",
    origem: "GRU",
    destino: "XXX",
    cidade: payload,
    preco: "R$ 100",
    href: "/ofertas/evil-offer",
  };
  const html = renderOfferPage(offer, {});
  assert.ok(!html.includes(payload), "a string crua de breakout nao deve aparecer no HTML");
  const objs = extractJsonLd(html); // lanca se algum bloco nao for JSON valido
  const product = objs.find((o) => o["@type"] === "Product");
  assert.match(product.name, /Recife/);
});
