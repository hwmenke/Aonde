// Compartilhamento (canonical/og:image), composicao de passageiros e o bloco
// "o que o preco cobre". Tudo veio da auditoria de usuarios.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  renderHomePage,
  renderOffersPage,
  renderGuidePage,
  renderOfferPage,
  renderHelpPage,
} from "../src/render/htmlRenderer.js";
import { OFFERS } from "../src/render/aondeContent.js";
import { createServer } from "../src/server.js";

const meta = (html, re) => (html.match(re) || [])[1] || "";
const canonical = (html) => meta(html, /rel="canonical" href="([^"]+)"/);
const ogImage = (html) => meta(html, /property="og:image" content="([^"]+)"/);

test("toda pagina principal declara seu canonical absoluto", () => {
  const casos = [
    [renderHomePage({}), "https://aonde.com.br/"],
    [renderOffersPage([], {}), "https://aonde.com.br/ofertas"],
    [renderGuidePage("cusco", { apiKey: "" }), "https://aonde.com.br/guias/cusco"],
    [renderOfferPage(OFFERS[0], { related: [] }), "https://aonde.com.br/saida/gru-lis"],
    [renderHelpPage(), "https://aonde.com.br/ajuda"],
  ];
  for (const [html, esperado] of casos) {
    assert.equal(canonical(html), esperado);
    // og:url tem que concordar com o canonical, senao a rede social indexa outro.
    assert.equal(meta(html, /property="og:url" content="([^"]+)"/), esperado);
  }
});

test("o feed de ofertas nao divide forca entre variantes de filtro", () => {
  // /ofertas?origem=GRU e /ofertas sao a MESMA pagina para busca.
  const filtrado = renderOffersPage([], { origem: "GRU" });
  assert.equal(canonical(filtrado), "https://aonde.com.br/ofertas", "canonical sem querystring");
});

test("link compartilhado leva imagem — e o roteiro leva a foto DELE", () => {
  const home = renderHomePage({});
  assert.ok(/^https?:\/\//.test(ogImage(home)), "og:image precisa ser URL absoluta");
  assert.match(home, /name="twitter:card" content="summary_large_image"/);

  // Cada roteiro compartilha a propria capa, nao a imagem padrao do site.
  const cusco = ogImage(renderGuidePage("cusco", { apiKey: "" }));
  const gramado = ogImage(renderGuidePage("gramado", { apiKey: "" }));
  assert.notEqual(cusco, gramado, "roteiros diferentes, imagens diferentes");
  assert.match(decodeURIComponent(cusco), /Machu Picchu/i);
});

test("busca aceita adultos, criancas e bebes — nao so 'adultos'", () => {
  const home = renderHomePage({});
  for (const campo of ["adultos", "criancas", "bebes"]) {
    assert.match(home, new RegExp(`<select name="${campo}">`), `campo ${campo} existe`);
  }
  // Nao da para viajar com zero adultos.
  const bloco = home.slice(home.indexOf('<select name="adultos">'));
  assert.ok(!/<option value="0"/.test(bloco.slice(0, 200)), "adultos comeca em 1");
});

async function withServer(t) {
  const original = process.env.AONDE_DATA_DIR;
  const dir = await mkdtemp(path.join(os.tmpdir(), "aonde-pax-"));
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

test("a composicao de passageiros chega na tela de resultados", async (t) => {
  const base = await withServer(t);
  const get = async (qs) => (await fetch(`${base}/resultados?${qs}`)).text();
  const resumo = (h) => (h.match(/class="res-resumo">([^<]*)</) || [])[1] || "";
  const avisoPax = (h) => /<p class="res-amostra res-amostra--pax">/.test(h);

  const familia = await get("origem=GRU&destino=REC&adultos=2&criancas=2");
  assert.match(resumo(familia), /2 adultos e 2 crianças/);
  assert.ok(avisoPax(familia), "avisa que o valor de exemplo e por adulto");

  const sozinho = await get("origem=GRU&destino=REC&adultos=1");
  assert.match(resumo(sozinho), /1 adulto/, "plural correto no singular");
  assert.ok(!avisoPax(sozinho), "sem criança, sem aviso de tarifa infantil");

  const bebe = await get("origem=GRU&destino=REC&adultos=1&bebes=1");
  assert.match(resumo(bebe), /1 adulto e 1 bebê de colo/);
  assert.ok(avisoPax(bebe), "bebê de colo tambem dispara o aviso");
});

test("valores absurdos de passageiro sao contidos, nao propagados", async (t) => {
  const base = await withServer(t);
  const h = await (await fetch(`${base}/resultados?origem=GRU&destino=REC&adultos=999&criancas=-5`)).text();
  const resumo = (h.match(/class="res-resumo">([^<]*)</) || [])[1] || "";
  assert.match(resumo, /9 adultos/, "teto aplicado");
  assert.ok(!/crianç/.test(resumo), "negativo vira zero, nao aparece");
});

test("o roteiro diz o que o preco NAO cobre, sem inventar estimativa", () => {
  const html = renderGuidePage("noronha", { apiKey: "" });
  assert.match(html, /O que esse valor cobre — e o que não cobre/);
  assert.match(html, /Hospedagem/);
  assert.match(html, /Comida, transporte no destino e passeios/);
  // Honestidade: nao promete total da viagem nem chuta valor de hospedagem.
  const bloco = html.slice(html.indexOf("escopo-card"), html.indexOf("escopo-card") + 1600);
  assert.ok(!/total da viagem/i.test(bloco), "nao promete total fechado");
  assert.ok(!/R\$\s?\d/.test(bloco.replace(/<style[\s\S]*?<\/style>/g, "")), "nao chuta valor");
});
