// Páginas evergreen /respostas/: FAQ visível = FAQPage, consulta só com
// data, sem preço "hoje" inventado, llms.txt e sitemap.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createServer } from "../src/server.js";
import { renderRespostaPage, renderMetodologiaPage } from "../src/render/htmlRenderer.js";
import { OFFERS as CONTENT_OFFERS } from "../src/render/aondeContent.js";
import { buildLlmsTxt } from "../src/render/llmsTxt.js";
import {
  RESPOSTAS,
  RESPOSTAS_REVISADO_EM,
  consultaVivaDaOferta,
  listaRespostas,
  respostaPorSlug,
} from "../src/render/respostasContent.js";

const SLUGS = [
  "sao-paulo-florianopolis",
  "rio-salvador",
  "sao-paulo-buenos-aires",
];

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

function palavras(texto) {
  return String(texto || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function offerById(id) {
  return CONTENT_OFFERS.find((o) => o.id === id);
}

async function withServer(t) {
  const original = process.env.AONDE_DATA_DIR;
  const dir = await mkdtemp(path.join(os.tmpdir(), "aonde-resp-"));
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

test("tres respostas no catalogo com H1, meta, FAQ e 40–60 palavras na curta", () => {
  const lista = listaRespostas();
  assert.equal(lista.length, 3);
  for (const slug of SLUGS) {
    const page = respostaPorSlug(slug);
    assert.ok(page, slug);
    assert.equal(page.slug, slug);
    assert.ok(page.h1.startsWith("Quanto custa"));
    assert.ok(page.offerId);
    assert.ok(page.guideId);
    const n = palavras(page.respostaCurta).length;
    assert.ok(n >= 40 && n <= 60, `${slug} resposta curta tem ${n} palavras`);
    assert.ok(page.faq.length >= 3);
  }
});

test("consultaVivaDaOferta exige preco + data e recusa tarifa encerrada", () => {
  const gruFln = offerById("gru-fln");
  const viva = consultaVivaDaOferta(gruFln, "2026-09-10");
  assert.ok(viva);
  assert.equal(viva.preco, "R$ 1.566");
  assert.equal(viva.iso, "2026-09-10");
  assert.equal(viva.dataBr, "10/09/2026");

  assert.equal(consultaVivaDaOferta(gruFln, "2026-10-26"), null, "ida ja passou");
  assert.equal(consultaVivaDaOferta({ ...gruFln, fontePrecoEm: "" }, "2026-09-10"), null);
  assert.equal(consultaVivaDaOferta({ ...gruFln, preco: "" }, "2026-09-10"), null);
  assert.equal(consultaVivaDaOferta(null, "2026-09-10"), null);
  const vcp = offerById("vcp-bue");
  assert.equal(consultaVivaDaOferta(vcp, "2026-08-01"), null, "VCP–BUE sem data de consulta");
});

test("renderRespostaPage devolve null para slug desconhecido", () => {
  assert.equal(renderRespostaPage("nao-existe"), null);
});

test("cada /respostas tem H1, resposta curta, CTAs, FAQPage = HTML e Article datado", () => {
  for (const slug of SLUGS) {
    const page = RESPOSTAS[slug];
    const html = renderRespostaPage(slug, { offer: offerById(page.offerId), hoje: "2026-10-26" });
    assert.match(html, new RegExp(`<h1 class="map-title">${page.h1.replace(/[?]/g, "\\?")}</h1>`));
    assert.match(html, /<h2>Resposta curta<\/h2>/);
    assert.match(html, new RegExp(`href="/ofertas/${page.offerId}"`));
    assert.match(html, new RegExp(`href="/guias/${page.guideId}"`));
    assert.match(html, /href="\/metodologia"/);
    assert.match(html, />Guia</);
    assert.match(html, />Metodologia</);
    assert.match(html, />Ver oferta</);
    assert.doesNotMatch(html, />Oferta atual</);
    assertFaqMatch(html);
    const vis = visibleFaq(html);
    assert.equal(vis.length, page.faq.length);
    for (const item of page.faq) {
      assert.ok(html.includes(item.q), item.q);
    }
    const article = extractJsonLd(html).find((o) => o["@type"] === "Article");
    assert.ok(article);
    assert.equal(article.headline, page.h1);
    assert.equal(article.dateModified, RESPOSTAS_REVISADO_EM);
    assert.equal(article.inLanguage, "pt-BR");
    assert.doesNotMatch(article.dateModified, /T\d{2}:\d{2}/);
    assert.match(html, new RegExp(`<link rel="canonical" href="https://aonde\\.com\\.br/respostas/${slug}">`));
    assert.doesNotMatch(html, /publicado há 2h/);
    assert.doesNotMatch(html, /achado hoje/i);
    assert.doesNotMatch(html, /últimas 3 vagas/i);
    assert.doesNotMatch(html, /Reservar no Aviasales/);
  }
});

test("consulta viva aparece com data; encerrada omite o numero da oferta", () => {
  const offer = offerById("gru-fln");
  const viva = renderRespostaPage("sao-paulo-florianopolis", { offer, hoje: "2026-09-10" });
  assert.match(viva, /R\$ 1\.566/);
  assert.match(viva, /10\/09\/2026/);
  assert.match(viva, /Google Flights/);
  assert.match(viva, />Oferta atual</);
  assert.doesNotMatch(viva, /achado hoje/i);
  assert.doesNotMatch(viva, /consulta em hoje/i);

  const morta = renderRespostaPage("sao-paulo-florianopolis", { offer, hoje: "2026-10-26" });
  assert.doesNotMatch(morta, /R\$ 1\.566/);
  assert.match(morta, />Ver oferta</);
  assert.doesNotMatch(morta, />Oferta atual</);
  assert.doesNotMatch(morta, /resp-consulta/);
});

test("sem fontePrecoEm nao inventa o preco editorial", () => {
  const offer = { ...offerById("gru-fln"), fontePrecoEm: undefined, fonte_preco_em: undefined };
  const html = renderRespostaPage("sao-paulo-florianopolis", { offer, hoje: "2026-09-10" });
  assert.doesNotMatch(html, /R\$ 1\.566/);
  assert.match(html, />Ver oferta</);
});

test("Rio–Salvador nao mistura preco FOR–SSA na mesma frase que GIG–SSA", () => {
  const html = renderRespostaPage("rio-salvador", {
    offer: offerById("gig-ssa"),
    hoje: "2026-10-26",
  });
  assert.match(html, /href="\/ofertas\/gig-ssa"/);
  assert.match(html, /href="\/ofertas\/for-ssa"/);
  assert.match(html, /href="\/guias\/salvador"/);
  assert.doesNotMatch(html, /USD \$242/);
  assert.doesNotMatch(html, /\$242/);
  const curta = html.match(/<p class="resp-curta">([\s\S]*?)<\/p>/);
  assert.ok(curta);
  const texto = stripTags(curta[1]);
  assert.match(texto, /GIG–SSA|gig-ssa/i);
  assert.doesNotMatch(texto, /242/);
  assert.doesNotMatch(texto, /R\$ 1\.320.{0,80}242|242.{0,80}R\$ 1\.320/);
});

test("São Paulo–Buenos Aires cita VCP–BUE como outra consulta, sem o preco dela", () => {
  const html = renderRespostaPage("sao-paulo-buenos-aires", {
    offer: offerById("gru-eze"),
    hoje: "2026-10-26",
  });
  assert.match(html, /href="\/ofertas\/gru-eze"/);
  assert.match(html, /href="\/ofertas\/vcp-bue"/);
  assert.match(html, /href="\/guias\/buenosaires"/);
  assert.doesNotMatch(html, /R\$ 989/);
  assert.doesNotMatch(html, /R\$ 1\.570/);
  const viva = renderRespostaPage("sao-paulo-buenos-aires", {
    offer: offerById("gru-eze"),
    hoje: "2026-08-21",
  });
  assert.match(viva, /R\$ 1\.570/);
  assert.doesNotMatch(viva, /R\$ 989/);
  const mesmaFrase = viva.match(/R\$ 1\.570[\s\S]{0,120}R\$ 989|R\$ 989[\s\S]{0,120}R\$ 1\.570/);
  assert.equal(mesmaFrase, null);
});

test("Article dateModified e editorial, nao o instante do request", () => {
  const a = renderRespostaPage("rio-salvador", { offer: offerById("gig-ssa"), hoje: "2026-10-01" });
  const b = renderRespostaPage("rio-salvador", { offer: offerById("gig-ssa"), hoje: "2026-10-26" });
  const da = extractJsonLd(a).find((o) => o["@type"] === "Article").dateModified;
  const db = extractJsonLd(b).find((o) => o["@type"] === "Article").dateModified;
  assert.equal(da, RESPOSTAS_REVISADO_EM);
  assert.equal(db, da);
});

test("metodologia e rodape apontam para as tres respostas", () => {
  const html = renderMetodologiaPage();
  for (const slug of SLUGS) {
    assert.match(html, new RegExp(`href="/respostas/${slug}"`));
  }
  assert.match(html, /id="respostas"/);
});

test("GET /respostas/* 200 com FAQPage; /llms.txt e sitemap listam as URLs", async (t) => {
  const { baseUrl } = await withServer(t);
  for (const slug of SLUGS) {
    const res = await fetch(`${baseUrl}/respostas/${slug}`);
    assert.equal(res.status, 200, slug);
    assert.match(res.headers.get("content-type") || "", /text\/html/);
    const html = await res.text();
    assertFaqMatch(html);
    assert.match(html, /<h2>Resposta curta<\/h2>/);
  }

  const missing = await fetch(`${baseUrl}/respostas/nao-existe`);
  assert.equal(missing.status, 404);

  const txt = await (await fetch(`${baseUrl}/llms.txt`)).text();
  for (const slug of SLUGS) {
    assert.match(txt, new RegExp(`/respostas/${slug}`));
  }
  assert.match(txt, /## Páginas principais/);
  assert.match(buildLlmsTxt("https://aonde.com.br"), /\/respostas\/sao-paulo-florianopolis/);

  const map = await (await fetch(`${baseUrl}/sitemap.xml`)).text();
  for (const slug of SLUGS) {
    assert.match(map, new RegExp(`/respostas/${slug}`));
  }
});

test("GET /llms.txt usa AONDE_SITE_URL nas respostas", async (t) => {
  const prev = process.env.AONDE_SITE_URL;
  process.env.AONDE_SITE_URL = "https://test.aonde.com.br";
  t.after(() => {
    if (prev === undefined) delete process.env.AONDE_SITE_URL;
    else process.env.AONDE_SITE_URL = prev;
  });
  const { baseUrl } = await withServer(t);
  const txt = await (await fetch(`${baseUrl}/llms.txt`)).text();
  assert.match(txt, /https:\/\/test\.aonde\.com\.br\/respostas\/rio-salvador/);
  assert.doesNotMatch(txt, /https:\/\/aonde\.com\.br\/respostas\/rio-salvador/);
});
