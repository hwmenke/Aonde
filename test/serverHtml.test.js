// Testes das rotas HTML do servidor (paginas portadas do prototipo). Sobem o
// http.Server numa porta livre e batem via fetch. Nao dependem do store: com
// o store vazio, as paginas caem para a curadoria editorial (sempre renderizam).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { gunzipSync, brotliDecompressSync } from "node:zlib";

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
  assert.match(sitemap.body, /\/ofertas\/[a-z0-9-]+</, "sitemap inclui ofertas");
  assert.ok(sitemap.body.includes("/privacidade"), "sitemap inclui página de privacidade");
  assert.ok(sitemap.body.includes("/termos"), "sitemap inclui termos de uso");
});

test("GET /privacidade publica a política LGPD e o rodapé linka para ela", async () => {
  const priv = await get("/privacidade");
  assert.equal(priv.status, 200);
  assert.ok(isHtmlDoc(priv));
  assert.match(priv.body, /Como tratamos seus dados no Aonde/);
  assert.match(priv.body, /double opt-in/i);
  const home = await get("/");
  assert.match(home.body, /href="\/privacidade"/);
  assert.match(home.body, /href="\/termos"/);
});

test("GET /termos publica os termos de uso com links legais no rodapé", async () => {
  const terms = await get("/termos");
  assert.equal(terms.status, 200);
  assert.ok(isHtmlDoc(terms));
  assert.match(terms.body, /Como funciona usar o Aonde/);
  assert.match(terms.body, /links do site são afiliados/i);
  assert.match(terms.body, /href="\/privacidade"/);
  assert.match(terms.body, /href="\/termos"/);
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

function getRaw(path, acceptEncoding) {
  return new Promise((resolve, reject) => {
    const headers = acceptEncoding === undefined ? {} : { "Accept-Encoding": acceptEncoding };
    http.get(base + path, { headers }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      res.on("error", reject);
    }).on("error", reject);
  });
}

test("HTML, text and CSS negotiate compression and vary every representation", async (t) => {
  const home = await getRaw("/", "identity");
  const cssPath = home.body.toString().match(/href="([^"]+\.css)"/)[1];
  const cases = [
    [undefined, undefined],
    ["identity", undefined],
    ["gzip", "gzip"],
    ["br", "br"],
    ["br;q=0, gzip", "gzip"],
    ["gzip;q=0, br;q=0", undefined],
    ["br;q=0.2, gzip;q=0.8", "gzip"],
    ["gzip;q=0.2, br;q=0.8", "br"],
    ["gzip;q=0.5, br;q=0.5", "br"],
    ["identity;q=1, br;q=0.5, gzip;q=0.8", undefined],
    ["BR;Q=0.8, GZIP;q=0.2", "br"],
    ["*;q=0.5, br;q=0", "gzip"],
    ["*;q=0, identity;q=1", undefined],
    ["x-br, x-gzip", undefined],
  ];
  for (const path of ["/", "/sitemap.xml", cssPath, "/robots.txt"]) {
    const identity = await getRaw(path, "identity");
    for (const [accept, expected] of cases) {
      await t.test(`${path}: ${accept ?? "absent"}`, async () => {
        const res = await getRaw(path, accept);
        const encoding = path === "/robots.txt" ? undefined : expected;
        assert.equal(res.status, 200);
        assert.equal(res.headers["content-encoding"], encoding);
        assert.equal(res.headers.vary, "Accept-Encoding");
        assert.equal(Number(res.headers["content-length"]), res.body.length);
        const decoded = encoding === "br" ? brotliDecompressSync(res.body)
          : encoding === "gzip" ? gunzipSync(res.body) : res.body;
        assert.deepEqual(decoded, identity.body);
      });
    }
  }
});
