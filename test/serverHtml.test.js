// Testes das rotas HTML do servidor (paginas portadas do prototipo). Sobem o
// http.Server numa porta livre e batem via fetch. Nao dependem do store: com
// o store vazio, as paginas caem para a curadoria editorial (sempre renderizam).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";

import { createServer } from "../src/server.js";

let server;
let base;

before(async () => {
  server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  base = `http://localhost:${server.address().port}`;
});

after(() => {
  server.close();
});

async function get(path) {
  const res = await fetch(base + path);
  const body = await res.text();
  return { status: res.status, type: res.headers.get("content-type") || "", body };
}

function isHtmlDoc(r) {
  return r.type.includes("text/html") && r.body.trimStart().toLowerCase().startsWith("<!doctype html>");
}

test("GET / serve a home em HTML", async () => {
  const r = await get("/");
  assert.equal(r.status, 200);
  assert.ok(isHtmlDoc(r), "deve ser um documento HTML");
  assert.ok(r.body.includes("Aonde você quer"), "deve conter o hero");
});

test("GET /ofertas serve o feed de ofertas em HTML", async () => {
  const r = await get("/ofertas");
  assert.equal(r.status, 200);
  assert.ok(isHtmlDoc(r));
  assert.ok(r.body.includes("Achados de hoje"), "deve conter o feed");
});

test("GET /ofertas/:id serve o detalhe (fallback editorial)", async () => {
  const r = await get("/ofertas/gru-lis");
  assert.equal(r.status, 200);
  assert.ok(isHtmlDoc(r));
  assert.ok(r.body.includes("Lisboa"), "deve conter a cidade da oferta");
});

test("GET /resultados serve a tela de voos em HTML", async () => {
  const r = await get("/resultados");
  assert.equal(r.status, 200);
  assert.ok(isHtmlDoc(r));
  assert.ok(r.body.includes("voos de exemplo"), "deve conter a lista de voos");
});

test("GET /mapa serve a pagina do mapa em HTML", async () => {
  const r = await get("/mapa");
  assert.equal(r.status, 200);
  assert.ok(isHtmlDoc(r));
  assert.ok(r.body.includes("Onde a gente já tem roteiro"), "deve conter o cabeçalho do mapa");
  // Sem GOOGLE_MAPS_API_KEY no ambiente de teste: cai para o fallback.
  assert.ok(/href="\/guias\//.test(r.body), "deve listar destinos linkando os guias");
});

test("GET /guias serve o índice de roteiros com os destinos novos", async () => {
  const r = await get("/guias");
  assert.equal(r.status, 200);
  assert.ok(isHtmlDoc(r));
  assert.ok(r.body.includes("/guias/maceio") && r.body.includes("/guias/cusco"), "deve listar destinos novos");
});

test("GET /guias/:id serve o roteiro editorial", async () => {
  const r = await get("/guias/salvador");
  assert.equal(r.status, 200);
  assert.ok(isHtmlDoc(r));
  assert.ok(r.body.includes("O roteiro, dia a dia"), "deve conter o roteiro");
});

test("GET /guias/:id invalido responde 404 em HTML", async () => {
  const r = await get("/guias/nao-existe");
  assert.equal(r.status, 404);
  assert.ok(isHtmlDoc(r), "404 ainda e uma pagina util");
});

test("GET /robots.txt e /sitemap.xml para SEO", async () => {
  const robots = await get("/robots.txt");
  assert.equal(robots.status, 200);
  assert.ok(robots.type.includes("text/plain"));
  assert.ok(robots.body.includes("Sitemap:"), "robots aponta o sitemap");

  const sitemap = await get("/sitemap.xml");
  assert.equal(sitemap.status, 200);
  assert.ok(sitemap.type.includes("xml"));
  assert.ok(sitemap.body.includes("/guias/salvador"), "sitemap inclui roteiros");
  assert.ok(sitemap.body.includes("/ofertas/gru-lis"), "sitemap inclui ofertas");
});

test("respostas trazem headers de segurança", async () => {
  const res = await fetch(base + "/");
  await res.text();
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.ok((res.headers.get("content-security-policy") || "").includes("frame-ancestors"));
  assert.equal(res.headers.get("x-frame-options"), "SAMEORIGIN");
});

test("páginas têm meta description e Open Graph", async () => {
  const r = await get("/");
  assert.ok(r.body.includes('name="description"'), "meta description");
  assert.ok(r.body.includes('property="og:title"'), "open graph");
  assert.ok(r.body.includes('rel="icon"'), "favicon");
});

test("GET /api/health continua respondendo JSON", async () => {
  const r = await get("/api/health");
  assert.equal(r.status, 200);
  assert.ok(r.type.includes("application/json"));
  const data = JSON.parse(r.body);
  assert.equal(data.ok, true);
});
