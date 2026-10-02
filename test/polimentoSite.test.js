// Velocidade, SEO e acessibilidade: o que a varredura de Lighthouse/mobile apontou.

import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { brotliDecompressSync, gunzipSync } from "node:zlib";

import { createServer } from "../src/server.js";
import {
  renderHomePage,
  renderNotFoundPage,
  renderResultsPage,
  renderExitPage,
  renderUnsubscribePage,
  renderNewsletterStatusPage,
  renderOfferPage,
  styleAssetPath,
} from "../src/render/htmlRenderer.js";
import { renderExitFlightPage } from "../src/render/exitFlight.js";
import { pageStyles } from "../src/render/estilos.js";
import { OFFERS } from "../src/render/aondeContent.js";

async function withServer(t) {
  const original = process.env.AONDE_DATA_DIR;
  const dir = await mkdtemp(path.join(os.tmpdir(), "aonde-polimento-"));
  process.env.AONDE_DATA_DIR = dir;
  const server = createServer();
  await new Promise((r) => server.listen(0, r));
  t.after(async () => {
    await new Promise((r) => server.close(r));
    if (original === undefined) delete process.env.AONDE_DATA_DIR;
    else process.env.AONDE_DATA_DIR = original;
    await rm(dir, { recursive: true, force: true });
  });
  return `http://127.0.0.1:${server.address().port}`;
}

// fetch do Node descomprime sozinho e esconde o header; aqui queremos os bytes.
function getRaw(url, acceptEncoding) {
  return new Promise((resolve, reject) => {
    http
      .get(url, { headers: { "accept-encoding": acceptEncoding } }, (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve({ res, body: Buffer.concat(chunks) }));
      })
      .on("error", reject);
  });
}

const tag = (html, re) => (html.match(re) || [])[0] || "";

test("CSS e servido comprimido (brotli e gzip) e idêntico ao original", async (t) => {
  const base = await withServer(t);
  const original = Buffer.from(pageStyles(), "utf-8");

  const br = await getRaw(base + styleAssetPath(), "br, gzip");
  assert.equal(br.res.headers["content-encoding"], "br");
  assert.match(br.res.headers.vary || "", /Accept-Encoding/i);
  assert.match(br.res.headers["cache-control"] || "", /immutable/);
  assert.ok(br.body.length < original.length / 3, "brotli precisa encolher o CSS de verdade");
  assert.deepEqual(brotliDecompressSync(br.body), original);

  const gz = await getRaw(base + styleAssetPath(), "gzip");
  assert.equal(gz.res.headers["content-encoding"], "gzip");
  assert.deepEqual(gunzipSync(gz.body), original);

  const cru = await getRaw(base + styleAssetPath(), "identity");
  assert.equal(cru.res.headers["content-encoding"], undefined);
  assert.equal(Number(cru.res.headers["content-length"]), original.length);
});

test("só a foto acima da dobra carrega com prioridade; as demais seguem lazy", async (t) => {
  const base = await withServer(t);
  const hoje = await (await fetch(`${base}/hoje?dia=2026-10-02`)).text();
  const imgs = hoje.match(/<img\b[^>]*>/g) || [];
  assert.ok(imgs.length >= 1);
  assert.match(imgs[0], /loading="eager"/);
  assert.match(imgs[0], /fetchpriority="high"/);
  for (const img of imgs.slice(1)) assert.match(img, /loading="lazy"/);

  const home = renderHomePage({});
  const slides = (home.match(/<div class="hero-bg[^"]*" data-hero="\d+">\s*<img\b[^>]*>/g) || []).map((s) => tag(s, /<img\b[^>]*>/));
  assert.ok(slides.length > 1, "o carrossel tem mais de um slide");
  assert.match(slides[0], /fetchpriority="high"/);
  for (const s of slides.slice(1)) {
    assert.match(s, /loading="lazy"/);
    assert.match(s, /fetchpriority="low"/);
  }
});

test("/hoje: título do cartão é h2 (sem pular de h1 para h3)", async (t) => {
  const base = await withServer(t);
  const hoje = await (await fetch(`${base}/hoje?dia=2026-10-02`)).text();
  assert.match(hoje, /<h2 class="hoje-titulo">/);
  assert.ok(!/<h3 class="hoje-titulo">/.test(hoje));
  assert.match(hoje, /alt="Foto de /, "alt descreve o que é a imagem");
});

test("detalhe da oferta: imagem principal é prioritária e o cartão OG aparece inteiro", () => {
  const gruFln = OFFERS.find((o) => o.id === "gru-fln");
  assert.ok(gruFln);
  const html = renderOfferPage(gruFln, {});
  const prova = tag(html, /<div class="det-prova[^"]*">/);
  assert.match(prova, /det-prova--cartao/, "cartão 1200x630 não pode ser cortado por object-fit:cover");
  const img = tag(html, /<div class="det-prova[^"]*"><div class="det-prova-media"><img\b[^>]*>/);
  assert.match(img, /fetchpriority="high"/);
  assert.match(img, /loading="eager"/);
  assert.match(pageStyles(), /\.det-prova--cartao\{height:auto;aspect-ratio:1200\/630;\}/);
});

test("/resultados tem description própria (não a genérica da home)", () => {
  const home = tag(renderHomePage({}), /<meta name="description" content="[^"]*">/);
  const res = tag(renderResultsPage({}), /<meta name="description" content="[^"]*">/);
  assert.ok(res && res !== home);
  assert.match(res, /Exemplos de voo de/, "sem busca ao vivo a description também diz que é exemplo");
});

test("páginas sem valor de busca saem do índice (noindex) e as públicas não", () => {
  const noindex = /<meta name="robots" content="noindex, nofollow">/;
  const exit = renderExitFlightPage({ origem: "GRU", destino: "REC", searchUrl: "https://example.com/busca" });
  assert.match(exit, noindex);
  assert.match(exit, /<meta name="description" content="Você está saindo do Aonde para Aviasales/);
  assert.match(renderExitPage(OFFERS[0], { affiliateUrl: "https://example.com/x" }), noindex);
  assert.match(renderNotFoundPage({ caminho: "/nada" }), noindex);
  assert.match(renderUnsubscribePage({}), noindex);
  assert.match(renderNewsletterStatusPage({ ok: true }), noindex);

  assert.ok(!noindex.test(renderHomePage({})));
  assert.ok(!noindex.test(renderResultsPage({})));
});

test("formulários de alerta mostram o nome da cidade, não só a sigla", () => {
  const home = renderHomePage({});
  assert.match(home, /<option value="BSB">Brasília \(BSB\)<\/option>/);
  assert.match(home, /<option value="FOR">Fortaleza \(FOR\)<\/option>/);
});

test("foco visível usa cor com contraste no tema claro e o link da caixa de confiança é sublinhado", () => {
  const css = pageStyles();
  assert.match(css, /button:focus-visible[^{]*\{outline:3px solid var\(--green\)/);
  assert.match(css, /\.trust-mini-item a\{text-decoration:underline;\}/);
  assert.ok(!/\.extra-card--soon\{opacity/.test(css), "opacity derruba o contraste do texto abaixo de AA");
});

test("o link do mapa na home leva o texto visível no nome acessível", () => {
  const home = renderHomePage({});
  assert.match(home, /class="explore-map" href="\/mapa" aria-label="22 destinos:/);
  assert.match(home, /<span class="explore-map-badge">📍 22 destinos<\/span>/);
});

test("preparativos aponta o CIVP da Anvisa para a página que existe", async () => {
  const { FONTES } = await import("../src/render/preparativos.js");
  assert.match(FONTES.saude.url, /\/anvisa\/pt-br\/assuntos\/paf\/certificado-internacional-de-vacinacao$/);
});
