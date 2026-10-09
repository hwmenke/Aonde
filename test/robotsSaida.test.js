// /saida/:id sem TRAVELPAYOUTS_MARKER devolve a pagina da oferta sem botao de
// reserva. E uma copia de /ofertas/:id sob outra URL: precisa de noindex.
// Com marker, a interstitial continua noindex como sempre. /ofertas/:id segue
// indexavel nos dois casos.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createServer } from "../src/server.js";
import { renderOfferPage } from "../src/render/htmlRenderer.js";
import { OFFERS as CONTENT_OFFERS } from "../src/render/aondeContent.js";

const META_NOINDEX = /<meta name="robots" content="noindex, nofollow">/;

async function withServer(t, { marker } = {}) {
  const original = process.env.AONDE_DATA_DIR;
  const originalMarker = process.env.TRAVELPAYOUTS_MARKER;
  const dir = await mkdtemp(path.join(os.tmpdir(), "aonde-robots-saida-"));
  process.env.AONDE_DATA_DIR = dir;
  if (marker) process.env.TRAVELPAYOUTS_MARKER = marker;
  else delete process.env.TRAVELPAYOUTS_MARKER;

  const server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

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

test("renderOfferPage so emite noindex quando pedido", () => {
  const offer = CONTENT_OFFERS.find((o) => o.id === "gig-ssa");
  assert.ok(offer, "oferta gig-ssa precisa existir no catalogo");
  assert.doesNotMatch(renderOfferPage(offer, {}), /name="robots"/);
  assert.match(renderOfferPage(offer, { noindex: true }), META_NOINDEX);
});

test("GET /saida/gru-fln SEM marker e noindex (meta + X-Robots-Tag) e nao cria tp.media", async (t) => {
  const { baseUrl } = await withServer(t);
  const res = await fetch(`${baseUrl}/saida/gru-fln`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("x-robots-tag"), "noindex, nofollow");
  const html = await res.text();
  assert.match(html, META_NOINDEX);
  assert.ok(!html.includes("tp.media/r?"), "sem marker nao pode haver link de afiliado");
});

test("GET /saida/gru-fln COM marker continua noindex e com o mesmo link tp.media", async (t) => {
  const { baseUrl } = await withServer(t, { marker: "test-marker-robots" });
  const res = await fetch(`${baseUrl}/saida/gru-fln`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("x-robots-tag"), "noindex, nofollow");
  const html = await res.text();
  assert.match(html, META_NOINDEX);
  assert.ok(html.includes("tp.media/r?marker=test-marker-robots.gru-fln"), "logica do marker intacta");
});

test("GET /ofertas/gig-ssa continua indexavel com e sem marker", async (t) => {
  for (const marker of [undefined, "test-marker-robots"]) {
    const { baseUrl } = await withServer(t, { marker });
    const res = await fetch(`${baseUrl}/ofertas/gig-ssa`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("x-robots-tag"), null);
    assert.doesNotMatch(await res.text(), /name="robots"/);
  }
});

test("GET /saida/:id de oferta sem link de reserva (409) tambem e noindex", async (t) => {
  const { baseUrl } = await withServer(t);
  const res = await fetch(`${baseUrl}/saida/gru-lis`);
  assert.equal(res.status, 409);
  assert.equal(res.headers.get("x-robots-tag"), "noindex, nofollow");
  assert.match(await res.text(), META_NOINDEX);
});

test("GET /saida/voo continua noindex", async (t) => {
  const { baseUrl } = await withServer(t);
  const res = await fetch(`${baseUrl}/saida/voo?origem=GRU&destino=REC`);
  assert.equal(res.status, 200);
  assert.match(await res.text(), META_NOINDEX);
});
