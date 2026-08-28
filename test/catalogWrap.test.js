// Wrap editorial: ofertas com IATA + datas parseaveis ganham aviasalesUrl
// no formato dos tres locks. /saida/{id} passa a 200. /hoje continua so
// gru-eze, gru-fln e gig-ssa.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createServer } from "../src/server.js";
import { OFFERS } from "../src/render/aondeContent.js";
import { escolhaDoDia } from "../src/daily/dailyPick.js";
import { publicAviasalesUrlForOffer } from "../src/partners/travelpayouts.js";

const LOCK_IDS = ["gru-eze", "gru-fln", "gig-ssa"];
const LOCK_URLS = {
  "gru-eze": "https://www.aviasales.com/search/GRU1209BUE19091",
  "gru-fln": "https://www.aviasales.com/search/GRU2709FLN03101",
  "gig-ssa": "https://www.aviasales.com/search/GIG0711SSA14111",
};

function catalogIds() {
  return OFFERS.map((o) => o.id);
}

function wrappedIds() {
  return OFFERS.filter((o) => o.aviasalesUrl && !LOCK_IDS.includes(o.id)).map((o) => o.id);
}

function skippedIds() {
  return OFFERS.filter((o) => !o.aviasalesUrl).map((o) => o.id);
}

async function withServer(t) {
  const original = process.env.AONDE_DATA_DIR;
  const originalMarker = process.env.TRAVELPAYOUTS_MARKER;
  const dir = await mkdtemp(path.join(os.tmpdir(), "aonde-catalog-wrap-"));
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

test("os tres locks mantem a URL publica original", () => {
  for (const id of LOCK_IDS) {
    const offer = OFFERS.find((o) => o.id === id);
    assert.ok(offer, `${id} deve existir`);
    assert.equal(offer.aviasalesUrl, LOCK_URLS[id], `${id} nao pode mudar a URL do lock`);
  }
});

test("wraps novos sao URL publica aviasales.com/search no formato dos locks", () => {
  const novos = wrappedIds();
  assert.ok(novos.length > 0, "deve haver ofertas novas com wrap");
  for (const id of novos) {
    const offer = OFFERS.find((o) => o.id === id);
    const expected = publicAviasalesUrlForOffer(offer);
    assert.equal(offer.aviasalesUrl, expected, `${id} deve usar o path deterministico`);
    assert.match(offer.aviasalesUrl, /^https:\/\/www\.aviasales\.com\/search\/[A-Z]{3}\d{4}[A-Z]{3}\d{5}$/);
    assert.ok(!offer.aviasalesUrl.includes("marker"));
    assert.ok(!offer.aviasalesUrl.includes("tp.media"));
  }
});

test("preco, badge e texto editorial nao mudam no wrap", () => {
  const lis = OFFERS.find((o) => o.id === "gru-lis");
  assert.equal(lis.preco, "R$ 1.847");
  assert.equal(lis.badge, "48% abaixo da média");
  assert.match(lis.texto, /Tarifa cheia São Paulo–Lisboa/);
  assert.equal(lis.fontePreco, undefined);
  assert.equal(lis.preco_usd, undefined);

  const rec = OFFERS.find((o) => o.id === "gru-rec");
  assert.equal(rec.preco, "R$ 587");
  assert.equal(rec.badge, "Erro de tarifa");
});

test("GET /saida/{id} devolve interstitial 200 para wraps novos", async (t) => {
  process.env.TRAVELPAYOUTS_MARKER = "wrap-marker";
  const { baseUrl } = await withServer(t);
  const novos = wrappedIds();
  assert.ok(novos.length > 0);

  for (const id of novos) {
    const offer = OFFERS.find((o) => o.id === id);
    const pathToken = offer.aviasalesUrl.split("/search/")[1];
    const res = await fetch(`${baseUrl}/saida/${id}`, { redirect: "manual" });
    assert.equal(res.status, 200, `/saida/${id} deve ser 200`);
    const html = await res.text();
    assert.match(html, /Você está indo para Aviasales/i, `${id}: interstitial nomeia Aviasales`);
    assert.ok(html.includes("tp.media/r?"), `${id}: deve montar tp.media`);
    assert.ok(html.includes(pathToken), `${id}: deve carregar o path ${pathToken}`);
    assert.ok(html.includes(`marker=wrap-marker.${id}`), `${id}: marker + sub_id`);
  }
});

test("GET /saida/{id} dos tres locks continua 200 com URL original", async (t) => {
  process.env.TRAVELPAYOUTS_MARKER = "lock-marker";
  const { baseUrl } = await withServer(t);
  for (const id of LOCK_IDS) {
    const token = LOCK_URLS[id].split("/search/")[1];
    const res = await fetch(`${baseUrl}/saida/${id}`, { redirect: "manual" });
    assert.equal(res.status, 200, `/saida/${id} lock deve continuar 200`);
    const html = await res.text();
    assert.ok(html.includes(token), `${id} deve manter o path do lock`);
  }
});

test("GET /saida/{id} continua 409 para ofertas sem wrap", async (t) => {
  process.env.TRAVELPAYOUTS_MARKER = "wrap-marker";
  const { baseUrl } = await withServer(t);
  const skipped = skippedIds();
  // Nenhuma oferta editorial ficou de fora neste catalogo (todas parseiam).
  // O 409 de "nao wrapped" continua coberto por /saida/sem-link no server.test.
  for (const id of skipped) {
    const res = await fetch(`${baseUrl}/saida/${id}`, { redirect: "manual" });
    assert.equal(res.status, 409, `/saida/${id} skip deve ser 409`);
  }
  assert.ok(catalogIds().length > 0);
});

test("/hoje continua so os tres locks, mesmo com catalogo wrapped", () => {
  const vistos = new Set();
  for (let d = 0; d < 60; d++) {
    const data = new Date(Date.UTC(2026, 7, 1 + d));
    for (const item of escolhaDoDia(data)) {
      vistos.add(item.offer.id);
      assert.ok(LOCK_IDS.includes(item.offer.id), `${item.offer.id} nao pode entrar em /hoje`);
    }
  }
  assert.deepEqual([...vistos].sort(), [...LOCK_IDS].sort());
});
