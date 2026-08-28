// CSS cacheavel (peso de banda) e alcance do feed para fora do eixo Sudeste.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createServer } from "../src/server.js";
import { renderHomePage, renderOffersPage, styleAssetPath } from "../src/render/htmlRenderer.js";
import { OFFERS, OFFER_ORIGINS } from "../src/render/aondeContent.js";

async function withServer(t) {
  const original = process.env.AONDE_DATA_DIR;
  const dir = await mkdtemp(path.join(os.tmpdir(), "aonde-perf-"));
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

test("o renderer sozinho continua emitindo CSS inline (amostras em file:// dependem disso)", () => {
  const html = renderHomePage({});
  assert.match(html, /<style>/, "sem <style> as amostras em disco ficariam sem estilo");
  assert.ok(!html.includes("/assets/estilo-"), "o link e responsabilidade do servidor");
});

test("o servidor troca o CSS inline pelo arquivo cacheavel", async (t) => {
  const base = await withServer(t);
  const html = await (await fetch(`${base}/`)).text();
  assert.ok(!/<style>/.test(html), "nada de CSS embutido na resposta do servidor");
  assert.match(html, /<link rel="stylesheet" href="\/assets\/estilo-[0-9a-f]{12}\.css">/);
});

test("o CSS e servido com cache longo e some quando o hash muda", async (t) => {
  const base = await withServer(t);
  const res = await fetch(base + styleAssetPath());
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") || "", /text\/css/);
  assert.match(res.headers.get("cache-control") || "", /immutable/);
  assert.ok((await res.text()).includes(".brand-plane"), "e o CSS de verdade");

  // Hash de um deploy anterior nao pode ser servido como eterno.
  const velho = await fetch(`${base}/assets/estilo-000000000000.css`);
  assert.equal(velho.status, 404);
  assert.ok(!(velho.headers.get("cache-control") || "").includes("immutable"));
});

test("o CSS deixa de ser baixado de novo a cada pagina", async (t) => {
  const base = await withServer(t);
  const paginas = ["/", "/ofertas", "/guias", "/guias/salvador", "/ajuda"];
  let htmlTotal = 0;
  for (const p of paginas) htmlTotal += Buffer.byteLength(await (await fetch(base + p)).text());
  const css = Buffer.byteLength(await (await fetch(base + styleAssetPath())).text());

  const antes = htmlTotal + css * paginas.length; // CSS repetido em cada pagina
  const agora = htmlTotal + css; // baixado uma vez
  assert.ok(agora < antes * 0.75, `esperava economia relevante: antes ${antes}, agora ${agora}`);
});

test("o feed sai do eixo Sudeste e o filtro acompanha as ofertas", () => {
  const origens = new Set(OFFERS.map((o) => o.origem));
  for (const nordeste of ["REC", "SSA", "FOR"]) {
    assert.ok(origens.has(nordeste), `feed precisa ter saida de ${nordeste}`);
  }
  // O filtro e DERIVADO das ofertas: nao pode existir origem sem pilula nem
  // pilula sem oferta (era fixo na mao e ficava desalinhado).
  const pilulas = new Set(OFFER_ORIGINS.filter((o) => o !== "Todas"));
  assert.deepEqual([...pilulas].sort(), [...origens].sort());

  const html = renderOffersPage([], {});
  assert.match(html, /class="orig-pill[^"]*"[^>]*>REC · Recife</);
});

test("todo desconto anunciado bate com a conta", () => {
  const n = (s) => Number(String(s).replace(/[^0-9]/g, ""));
  for (const o of OFFERS) {
    const dito = (o.badge.match(/(\d+)%/) || [])[1];
    if (dito) {
      const real = Math.round(100 * (1 - n(o.preco) / n(o.media)));
      assert.ok(Math.abs(real - Number(dito)) <= 1, `${o.id}: diz ${dito}%, a conta da ${real}%`);
    }
    if (o.media && o.economia) {
      assert.equal(n(o.media) - n(o.preco), n(o.economia), `${o.id}: economia anunciada nao fecha`);
    }
  }
});

test("filtro sem resultado oferece caminho, nao tela vazia", () => {
  const html = renderOffersPage([], { origem: "MAO" });
  assert.match(html, /class="feed-vazio"/);
  assert.match(html, /Nenhum achado saindo de <strong>Manaus<\/strong>/, "nomeia a cidade, nao a sigla");
  assert.match(html, /href="\/alertas"/, "aponta o alerta de preço");
  assert.match(html, /href="\/ofertas"/, "e a volta para o feed completo");
});
