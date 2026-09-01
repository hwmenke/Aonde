// Quarto lock: FOR-SSA. Os 16 ids de catalogo da Roteiro diaria ficam
// sem wrap. /hoje continua so gru-eze, gru-fln e gig-ssa.

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createServer } from "../src/server.js";
import { OFFERS, GUIDES, FOR_SSA_SEMANA } from "../src/render/aondeContent.js";
import { escolhaDoDia, guiaDaOferta, pacoteDoDia } from "../src/daily/dailyPick.js";
import { renderOfferPage, renderGuidePage, renderTodayPage } from "../src/render/htmlRenderer.js";
import { ogSharePathForOffer } from "../src/render/ogShare.js";

const LOCK_URLS = {
  "gru-eze": "https://www.aviasales.com/search/GRU1209BUE19091",
  "gru-fln": "https://www.aviasales.com/search/GRU2709FLN03101",
  "gig-ssa": "https://www.aviasales.com/search/GIG0711SSA14111",
};

const FOR_SSA_URL = "https://www.aviasales.com/search/FOR0310SSA10101";

const UNWRAPPED_IDS = [
  "gru-lis",
  "vcp-bue",
  "cnf-fln",
  "gig-mia",
  "gru-mco",
  "rec-gru",
  "ssa-cnf",
  "gru-cuz",
  "cnf-mao",
  "gig-cnf-op",
  "bsb-cgr",
];

const offerById = (id) => OFFERS.find((o) => o.id === id);

const meta = (html, re) => (html.match(re) || [])[1] || "";
const ogImage = (html) => meta(html, /property="og:image" content="([^"]+)"/);
const canonical = (html) => meta(html, /rel="canonical" href="([^"]+)"/);

function extractJsonLd(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(
    (m) => JSON.parse(m[1])
  );
}

async function withServer(t) {
  const original = process.env.AONDE_DATA_DIR;
  const originalMarker = process.env.TRAVELPAYOUTS_MARKER;
  const dir = await mkdtemp(path.join(os.tmpdir(), "aonde-for-ssa-"));
  process.env.AONDE_DATA_DIR = dir;

  const server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    if (original === undefined) delete process.env.AONDE_DATA_DIR;
    else process.env.AONDE_DATA_DIR = original;
    if (originalMarker === undefined) delete process.env.TRAVELPAYOUTS_MARKER;
    else process.env.TRAVELPAYOUTS_MARKER = originalMarker;
    await rm(dir, { recursive: true, force: true });
  });

  return { baseUrl };
}

test("for-ssa continua wrapped; ids da Roteiro sem lock continuam sem wrap", () => {
  const offer = offerById("for-ssa");
  assert.equal(offer.aviasalesUrl, FOR_SSA_URL);
  for (const id of UNWRAPPED_IDS) {
    const o = offerById(id);
    assert.ok(o, `${id} deve existir no catalogo`);
    assert.equal(o.aviasalesUrl, undefined, `${id} nao pode ter wrap Aviasales`);
    assert.equal(o.semana, undefined, `${id} nao e semana lock`);
  }
});

test("os tres locks antigos mantem a URL publica original", () => {
  for (const [id, url] of Object.entries(LOCK_URLS)) {
    const offer = offerById(id);
    assert.ok(offer, `${id} deve existir`);
    assert.equal(offer.aviasalesUrl, url, `${id} nao pode mudar a URL do lock`);
  }
});

test("for-ssa e o quarto lock: URL, datas, LATAM, USD $242, roteiro de Salvador", () => {
  const offer = offerById("for-ssa");
  assert.ok(offer);
  assert.equal(offer.origem, "FOR");
  assert.equal(offer.destino, "SSA");
  assert.equal(offer.cidade, "Salvador");
  assert.equal(offer.cia, "LATAM");
  assert.equal(offer.datas, "3–10 out");
  assert.equal(offer.badge, "Direto · 1h50");
  assert.equal(offer.preco, "USD $242");
  assert.equal(offer.preco_usd, "$242");
  assert.equal(offer.aviasalesUrl, FOR_SSA_URL);
  assert.equal(offer.fontePreco, "Aviasales");
  assert.equal(offer.fontePrecoEm, "2026-08-28");
  assert.equal(offer.media, undefined);
  assert.equal(offer.economia, undefined);
  assert.equal(guiaDaOferta(offer), GUIDES.salvador);
});

test("GET /saida/for-ssa COM marker constroi tp.media com FOR0310SSA10101", async (t) => {
  process.env.TRAVELPAYOUTS_MARKER = "test-marker-for";
  const { baseUrl } = await withServer(t);
  const res = await fetch(`${baseUrl}/saida/for-ssa`, { redirect: "manual" });
  assert.equal(res.status, 200, "/saida/for-ssa deve devolver 200");
  const html = await res.text();
  assert.ok(html.includes("tp.media/r?"), "deve ter tp.media");
  assert.ok(html.includes("FOR0310SSA10101"), "path Aviasales exato");
  assert.ok(html.includes("marker=test-marker-for.for-ssa"), "marker com sub_id");
  assert.ok(html.includes("p=4114"), "program ID 4114");
});

test("GET /saida dos tres locks continua 200 com o path original", async (t) => {
  process.env.TRAVELPAYOUTS_MARKER = "lock-marker";
  const { baseUrl } = await withServer(t);
  for (const [id, url] of Object.entries(LOCK_URLS)) {
    const token = url.split("/search/")[1];
    const res = await fetch(`${baseUrl}/saida/${id}`, { redirect: "manual" });
    assert.equal(res.status, 200, `/saida/${id} lock deve continuar 200`);
    const html = await res.text();
    assert.ok(html.includes(token), `${id} deve manter o path do lock`);
  }
});

test("GET /saida/gru-lis e /saida/vcp-bue continuam 409", async (t) => {
  process.env.TRAVELPAYOUTS_MARKER = "wrap-marker";
  const { baseUrl } = await withServer(t);
  for (const id of ["gru-lis", "vcp-bue"]) {
    const res = await fetch(`${baseUrl}/saida/${id}`, { redirect: "manual" });
    assert.equal(res.status, 409, `/saida/${id} sem wrap deve ser 409`);
  }
});

test("pagina /ofertas/for-ssa mostra USD $242 no Aviasales, nao R$ 287 nem R$ 242", async (t) => {
  const { baseUrl } = await withServer(t);
  const res = await fetch(`${baseUrl}/ofertas/for-ssa`);
  assert.equal(res.status, 200);
  const html = await res.text();

  assert.match(html, /USD \$242/);
  assert.match(html, /Visto no Aviasales, 28 ago 2026/);
  assert.match(html, /LATAM/);
  assert.match(html, /1h50/);
  assert.match(html, /Fortaleza/);
  assert.match(html, /Salvador/);
  assert.match(html, /Reservar no Aviasales/);
  assert.ok(html.includes('href="/saida/for-ssa"'), "CTA Buy passa por /saida");

  assert.doesNotMatch(html, /R\$\s*287/);
  assert.doesNotMatch(html, /R\$\s*242/);
  assert.doesNotMatch(html, /R\$242/);
  assert.doesNotMatch(html, /R\$ 505/);
  assert.doesNotMatch(html, /R\$ 218/);
  assert.doesNotMatch(html, /43% abaixo/);

  assert.match(canonical(html), /\/ofertas\/for-ssa$/);
  assert.doesNotMatch(canonical(html), /\/hoje/);

  const product = extractJsonLd(html).find((o) => o["@type"] === "Product");
  if (product && product.offers) {
    assert.equal(product.offers.priceCurrency, "USD");
    assert.notEqual(product.offers.priceCurrency, "BRL");
  }
});

test("WhatsApp de for-ssa aponta para /ofertas/for-ssa?utm_source=wa, nunca /hoje", () => {
  const html = renderOfferPage(offerById("for-ssa"), { related: [] });
  assert.match(html, /ofertas%2Ffor-ssa%3Futm_source%3Dwa/);
  assert.doesNotMatch(html, /hoje%3Futm_source%3Dwa/);
  assert.doesNotMatch(html, /saida%2Ffor-ssa%3Futm_source/);
});

test("og:image de for-ssa nunca e GIG-SSA.jpg (Rio) nem HOJE.jpg", async (t) => {
  const cardOnDisk = existsSync(path.join(process.cwd(), "public", "og", "FOR-SSA.jpg"));
  assert.equal(
    ogSharePathForOffer("for-ssa"),
    cardOnDisk ? "/og/FOR-SSA.jpg" : "",
    "sem cartao proprio nao inventa caminho, e nunca herda o do Rio"
  );

  const { baseUrl } = await withServer(t);
  const html = await (await fetch(`${baseUrl}/ofertas/for-ssa`)).text();
  const img = ogImage(html);
  assert.doesNotMatch(img, /GIG-SSA\.jpg/);
  assert.doesNotMatch(img, /HOJE\.jpg/);
  assert.doesNotMatch(img, /-story\.jpg/);
  if (cardOnDisk) {
    assert.match(img, /\/og\/FOR-SSA\.jpg/);
  } else {
    assert.match(img, /Pelourinho|Salvador|commons\.wikimedia\.org/i);
  }
});

test("/hoje nunca heroi for-ssa; rotacao fica nos tres locks", () => {
  const vistos = new Set();
  for (let d = 0; d < 90; d++) {
    const data = new Date(Date.UTC(2026, 7, 1 + d));
    for (const item of escolhaDoDia(data)) {
      vistos.add(item.offer.id);
      assert.notEqual(item.offer.id, "for-ssa", "for-ssa nao entra em /hoje");
      assert.ok(
        ["gru-eze", "gru-fln", "gig-ssa"].includes(item.offer.id),
        `${item.offer.id} nao pode entrar em /hoje`
      );
    }
  }
  assert.deepEqual([...vistos].sort(), ["gig-ssa", "gru-eze", "gru-fln"]);
});

const WEEK_RESTAURANTS = [
  "Acarajé da Dinha",
  "Restaurante Escola Senac",
  "Dona Mariquita",
  "Casa de Tereza",
  "Origem",
  "Pereira",
];

test("a semana editorial FOR-SSA vive so em /ofertas/for-ssa, nao em /guias/salvador", () => {
  const guia = renderGuidePage("salvador");
  const oferta = renderOfferPage(offerById("for-ssa"), { related: [] });

  assert.equal(GUIDES.salvador.semanaForSsa, undefined, "semana nao vive no guia");
  assert.equal(GUIDES.salvador.dias.length, 5, "guia de Salvador continua com 5 dias");
  assert.ok(GUIDES.salvador.dias.some((d) => d.restaurante === "Boteco do França"));
  assert.ok(GUIDES.salvador.dias.some((d) => d.restaurante === "Barraca do Lôro"));
  assert.ok(FOR_SSA_SEMANA);
  assert.equal(FOR_SSA_SEMANA.offerId, "for-ssa");
  assert.equal(FOR_SSA_SEMANA.tarifa, "USD $242");
  assert.equal(offerById("for-ssa").semana, FOR_SSA_SEMANA);

  assert.doesNotMatch(guia, /Editorial, escrito em 28 de agosto/);
  assert.doesNotMatch(guia, /id="semana-for-ssa"/);
  assert.doesNotMatch(guia, /Alameda das Algarobas/);
  assert.doesNotMatch(guia, /Rua do Meio 178/);
  assert.doesNotMatch(guia, /Fortaleza \(FOR\) → Salvador \(SSA\)/);
  assert.doesNotMatch(guia, /Tarifa ao vivo/);
  assert.match(guia, /Boteco do França/);
  assert.match(guia, /Barraca do Lôro/);
  assert.match(guia, /ROTEIRO DE 5 DIAS/);

  for (const restaurante of WEEK_RESTAURANTS) {
    assert.ok(oferta.includes(restaurante), `oferta deve citar ${restaurante}`);
  }
  assert.match(oferta, /Editorial, escrito em 28 de agosto de 2026/);
  assert.match(oferta, /Não é um texto de quem mora aí/);
  assert.match(oferta, /id="semana-for-ssa"/);
  assert.match(oferta, /Fortaleza \(FOR\) → Salvador \(SSA\)/);
  assert.match(oferta, /USD \$242/);
  assert.match(oferta, /Tarifa vista no Aviasales em 28 de agosto de 2026/);
  assert.match(oferta, /Visto no Aviasales, 28 ago 2026/);
  assert.match(oferta, /Alameda das Algarobas/);
  assert.match(oferta, /Rua do Meio 178/);
  assert.doesNotMatch(oferta, /Tarifa ao vivo/);
  assert.doesNotMatch(oferta, /ao vivo no Aviasales/);
  assert.doesNotMatch(oferta, /R\$\s*287/);
  assert.doesNotMatch(oferta, /R\$\s*242/);
  assert.doesNotMatch(oferta, /eu moro|moro em Salvador|quem vive aí/i);
});

test("este PR nao adiciona FOR-SSA-story.jpg nem FOR-SSA-ig.jpg", () => {
  const ogDir = path.join(process.cwd(), "public", "og");
  for (const name of ["FOR-SSA-story.jpg", "FOR-SSA-ig.jpg", "for-ssa-story.jpg", "for-ssa-ig.jpg"]) {
    assert.equal(existsSync(path.join(ogDir, name)), false, `${name} nao entra no git`);
  }
});

test("GET /guias/salvador nao tem a semana lock; GET /ofertas/for-ssa tem, sem tarifa ao vivo", async (t) => {
  const { baseUrl } = await withServer(t);
  const guia = await (await fetch(`${baseUrl}/guias/salvador`)).text();
  const oferta = await (await fetch(`${baseUrl}/ofertas/for-ssa`)).text();

  assert.doesNotMatch(guia, /Editorial, escrito em 28 de agosto/);
  assert.doesNotMatch(guia, /id="semana-for-ssa"/);
  assert.doesNotMatch(guia, /Alameda das Algarobas/);
  assert.match(guia, /Salvador em 5 dias/);

  assert.match(oferta, /Editorial, escrito em 28 de agosto de 2026/);
  assert.match(oferta, /id="semana-for-ssa"/);
  assert.match(oferta, /Tarifa vista no Aviasales em 28 de agosto de 2026/);
  assert.doesNotMatch(oferta, /Tarifa ao vivo/);
  assert.doesNotMatch(oferta, /R\$\s*287/);
});

test("GET /hoje nao mostra for-ssa nem a semana editorial da janela", async (t) => {
  const { baseUrl } = await withServer(t);
  const html = await (await fetch(`${baseUrl}/hoje`)).text();
  assert.doesNotMatch(html, /for-ssa/);
  assert.doesNotMatch(html, /semana-for-ssa/);
  assert.doesNotMatch(html, /Alameda das Algarobas/);
  assert.doesNotMatch(html, /R\$\s*287/);

  const pacote = renderTodayPage(pacoteDoDia("2026-08-28"));
  assert.doesNotMatch(pacote, /for-ssa/);
  assert.doesNotMatch(pacote, /semana-for-ssa/);
  assert.doesNotMatch(pacote, /Alameda das Algarobas/);
});
