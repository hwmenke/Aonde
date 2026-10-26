// Semana de LLM-search: /metodologia, FAQ A/B/C, /llms.txt, FAQPage + Article.
// Cobre o checklist do handoff sem inventar urgencia nem data de consulta.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createServer } from "../src/server.js";
import {
  renderTodayPage,
  renderOfferPage,
  renderGuidePage,
  renderMetodologiaPage,
} from "../src/render/htmlRenderer.js";
import { OFFERS as CONTENT_OFFERS } from "../src/render/aondeContent.js";
import { pacoteDoDia } from "../src/daily/dailyPick.js";
import { buildLlmsTxt } from "../src/render/llmsTxt.js";
import { FAQ_BLOCO_A, FAQ_BLOCO_C, fillBlocoB, faqItemsForJsonLd } from "../src/render/faqContent.js";
import { buildArticle, buildFaqPageFromItems } from "../src/render/structuredData.js";

function extractJsonLd(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) =>
    JSON.parse(m[1])
  );
}

function stripTags(html) {
  return String(html || "")
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function visibleFaq(html) {
  const items = [];
  const re = /<div class="faq-item"><dt><h3>([^<]+)<\/h3><\/dt><dd>([\s\S]*?)<\/dd><\/div>/g;
  let m;
  while ((m = re.exec(html))) items.push({ q: stripTags(m[1]), a: stripTags(m[2]) });
  return items;
}

function faqFromLd(html) {
  const faq = extractJsonLd(html).find((o) => o["@type"] === "FAQPage");
  assert.ok(faq, "pagina precisa de FAQPage");
  return faq.mainEntity.map((q) => ({ q: q.name, a: q.acceptedAnswer.text }));
}

function assertFaqMatch(html) {
  const vis = visibleFaq(html);
  const ld = faqFromLd(html);
  assert.ok(vis.length > 0, "FAQ visivel em HTML");
  assert.equal(vis.length, ld.length, "mesmo numero de perguntas no HTML e no JSON-LD");
  for (let i = 0; i < vis.length; i++) {
    assert.equal(vis[i].q, ld[i].q, `pergunta ${i} diverge`);
    assert.equal(vis[i].a, ld[i].a, `resposta ${i} diverge`);
    assert.doesNotMatch(ld[i].a, /\*\*/, "JSON-LD sem markdown");
  }
}

async function withServer(t) {
  const original = process.env.AONDE_DATA_DIR;
  const dir = await mkdtemp(path.join(os.tmpdir(), "aonde-llm-"));
  process.env.AONDE_DATA_DIR = dir;
  const server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    if (original === undefined) delete process.env.AONDE_DATA_DIR;
    else process.env.AONDE_DATA_DIR = original;
    await rm(dir, { recursive: true, force: true });
  });
  return { baseUrl };
}

test("fillBlocoB preenche gru-fln com preco, consulta e Ver busca", () => {
  const offer = CONTENT_OFFERS.find((o) => o.id === "gru-fln");
  const items = fillBlocoB(offer, {
    origem: offer.origem,
    destino: offer.destino,
    preco: offer.preco,
    fontePreco: offer.fontePreco,
    fontePrecoEm: offer.fontePrecoEm,
    cia: offer.cia,
    ida: offer.ida,
    volta: offer.volta,
    aviasalesBuy: false,
    affiliateUrl: "pending",
    dicas: offer.dicas,
    badge: offer.badge,
    texto: offer.texto,
  });
  const custo = items.find((it) => it.q.includes("GRU–FLN"));
  assert.ok(custo);
  assert.match(custo.a, /10\/09\/2026/);
  assert.match(custo.a, /R\$ 1\.566/);
  assert.match(custo.a, /consulta/);
  const reserva = items.find((it) => it.q === "Como reservar?");
  assert.match(reserva.a, /Ver busca/);
  assert.doesNotMatch(reserva.a, /Reservar no Aviasales/);
  const base = items.find((it) => it.q.startsWith("Onde fica"));
  assert.match(base.a, /Lagoa da Conceição/);
});

test("/metodologia renderiza o texto aprovado com canonical e og", () => {
  const html = renderMetodologiaPage();
  assert.match(html, /<h1 class="map-title">Metodologia — como o Aonde encontra e mostra tarifas<\/h1>/);
  assert.match(html, /revista de viagem com busca/);
  assert.match(html, /O que é “consulta”/);
  assert.match(html, /26 de outubro de 2026/);
  assert.match(html, /<link rel="canonical" href="https:\/\/aonde\.com\.br\/metodologia">/);
  assert.match(html, /<meta property="og:title" content="Metodologia · Aonde">/);
  assert.match(
    html,
    /<meta property="og:description" content="O Aonde é uma revista de viagem com busca:/
  );
  assert.match(html, /href="\/metodologia">Metodologia<\/a>/);
  assert.match(html, /href="\/hoje#faq"/);
  assertFaqMatch(html);
  const article = extractJsonLd(html).find((o) => o["@type"] === "Article");
  assert.equal(article.dateModified, "2026-10-26");
});

test("/hoje mostra Bloco A + C em HTML e o FAQPage bate", () => {
  const html = renderTodayPage(pacoteDoDia("2026-08-21"));
  for (const q of FAQ_BLOCO_C) assert.ok(html.includes(q.q), q.q);
  for (const q of FAQ_BLOCO_A) assert.ok(html.includes(q.q), q.q);
  assert.match(html, /<h2 class="det-h2" id="faq-hoje-titulo">Antes de ler o preço<\/h2>/);
  assert.match(html, /<h2 class="det-h2" id="faq-titulo">Perguntas frequentes<\/h2>/);
  assert.match(html, /href="\/metodologia"/);
  assertFaqMatch(html);
  const article = extractJsonLd(html).find((o) => o["@type"] === "Article");
  assert.ok(article);
  assert.equal(article.dateModified, "2026-08-21");
  assert.equal(article.inLanguage, "pt-BR");
  const outra = renderTodayPage(pacoteDoDia("2026-08-21"));
  const article2 = extractJsonLd(outra).find((o) => o["@type"] === "Article");
  assert.equal(article2.dateModified, article.dateModified);
});

test("Article do /hoje nao usa timestamp de agora", () => {
  const html = renderTodayPage(pacoteDoDia("2026-08-22"));
  const article = extractJsonLd(html).find((o) => o["@type"] === "Article");
  assert.equal(article.dateModified, "2026-08-22");
  assert.doesNotMatch(article.dateModified, /T\d{2}:\d{2}/);
});

test("oferta gru-fln tem FAQ B com consulta datada e CTA de busca", () => {
  const offer = CONTENT_OFFERS.find((o) => o.id === "gru-fln");
  const html = renderOfferPage(offer, {});
  assertFaqMatch(html);
  assert.match(html, /Quanto custa voar GRU–FLN\?/);
  assert.match(html, /10\/09\/2026/);
  assert.match(html, /R\$ 1\.566/);
  assert.match(html, /Ver busca/);
  assert.match(html, /consulta/);
  assert.match(html, /Visto no Google Flights, 10 set 2026/);
  assert.doesNotMatch(html, /publicado há 2h/);
});

test("guia ganha Article sem dateModified inventado", () => {
  const html = renderGuidePage("salvador");
  const article = extractJsonLd(html).find((o) => o["@type"] === "Article");
  assert.ok(article);
  assert.equal(article.headline, "Salvador em 5 dias, sem pressa");
  assert.equal(article.dateModified, undefined);
  assert.doesNotMatch(JSON.stringify(article), /T\d{2}:\d{2}:\d{2}/);
});

test("buildArticle omite dateModified sem data editorial", () => {
  const a = buildArticle({ headline: "X", url: "/hoje" });
  assert.equal(a.dateModified, undefined);
  assert.equal(buildFaqPageFromItems([]), null);
  assert.equal(faqItemsForJsonLd(FAQ_BLOCO_A).length, FAQ_BLOCO_A.length);
});

test("GET /metodologia, /llms.txt e sitemap", async (t) => {
  const { baseUrl } = await withServer(t);
  const meto = await fetch(`${baseUrl}/metodologia`);
  assert.equal(meto.status, 200);
  assert.match(meto.headers.get("content-type") || "", /text\/html/);
  const html = await meto.text();
  assert.match(html, /Metodologia — como o Aonde encontra e mostra tarifas/);

  const llms = await fetch(`${baseUrl}/llms.txt`);
  assert.equal(llms.status, 200);
  assert.match(llms.headers.get("content-type") || "", /text\/plain/);
  const txt = await llms.text();
  assert.match(txt, /^# Aonde/);
  assert.match(txt, /\/metodologia/);
  assert.match(txt, /Caspar@aonde\.com\.br/);
  for (const slug of [
    "sao-paulo-florianopolis",
    "rio-salvador",
    "sao-paulo-buenos-aires",
    "fortaleza-salvador",
    "sao-paulo-santiago",
    "sao-paulo-foz-do-iguacu",
  ]) {
    assert.match(txt, new RegExp(`/respostas/${slug}`));
  }

  const map = await (await fetch(`${baseUrl}/sitemap.xml`)).text();
  assert.match(map, /\/metodologia/);
});

test("GET /llms.txt troca o host por AONDE_SITE_URL", async (t) => {
  const prev = process.env.AONDE_SITE_URL;
  process.env.AONDE_SITE_URL = "https://test.aonde.com.br";
  t.after(() => {
    if (prev === undefined) delete process.env.AONDE_SITE_URL;
    else process.env.AONDE_SITE_URL = prev;
  });
  const { baseUrl } = await withServer(t);
  const txt = await (await fetch(`${baseUrl}/llms.txt`)).text();
  assert.match(txt, /https:\/\/test\.aonde\.com\.br\/hoje/);
  assert.doesNotMatch(txt, /https:\/\/aonde\.com\.br\/hoje/);
  assert.equal(buildLlmsTxt("https://test.aonde.com.br/"), txt);
});
