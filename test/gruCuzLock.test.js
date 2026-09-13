// Semana lock GRU-CUZ (Sao Paulo Guarulhos → Cusco). Vive so em
// /ofertas/gru-cuz. 1 parada LIM. Nao entra em /hoje, nao substitui o guia.

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createServer } from "../src/server.js";
import { OFFERS, GUIDES, GRU_CUZ_SEMANA, GRU_REC_SEMANA } from "../src/render/aondeContent.js";
import { escolhaDoDia, pacoteDoDia } from "../src/daily/dailyPick.js";
import { renderOfferPage, renderGuidePage, renderTodayPage } from "../src/render/htmlRenderer.js";
import { ogSharePathForOffer } from "../src/render/ogShare.js";

const WRAP = "https://www.aviasales.com/search/GRU0111CUZ08111";
const offerById = (id) => OFFERS.find((o) => o.id === id);

function waSharedUrl(html) {
  const m = html.match(/wa\.me\/\?text=([^"&]+)/);
  if (!m) return "";
  return decodeURIComponent(m[1]).split("\n").pop() || "";
}

function weekSlice(html, id) {
  const start = html.indexOf(`id="semana-${id}"`);
  if (start < 0) return "";
  const end = html.indexOf("</section>", start);
  return end < 0 ? html.slice(start) : html.slice(start, end);
}

function heroImgSrc(html) {
  const prova = html.match(/<div class="det-prova-media">([\s\S]*?)<\/div>/);
  if (!prova) return "";
  return (prova[1].match(/src="([^"]+)"/) || [])[1] || "";
}

async function withServer(t) {
  const original = process.env.AONDE_DATA_DIR;
  const originalMarker = process.env.TRAVELPAYOUTS_MARKER;
  const dir = await mkdtemp(path.join(os.tmpdir(), "aonde-gru-cuz-"));
  process.env.AONDE_DATA_DIR = dir;
  const server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    if (original === undefined) delete process.env.AONDE_DATA_DIR;
    else process.env.AONDE_DATA_DIR = original;
    if (originalMarker === undefined) delete process.env.TRAVELPAYOUTS_MARKER;
    else process.env.TRAVELPAYOUTS_MARKER = originalMarker;
    await rm(dir, { recursive: true, force: true });
  });
  return `http://127.0.0.1:${port}`;
}

test("gru-cuz e LATAM 1 parada LIM, USD $533, wrap Aviasales 1 set", () => {
  const offer = offerById("gru-cuz");
  assert.ok(offer);
  assert.equal(offer.origem, "GRU");
  assert.equal(offer.destino, "CUZ");
  assert.equal(offer.cidade, "Cusco");
  assert.equal(offer.origemCidade, "Guarulhos");
  assert.equal(offer.cia, "LATAM");
  assert.equal(offer.preco, "USD $533");
  assert.equal(offer.preco_usd, "$533");
  assert.equal(offer.datas, "1–8 nov");
  assert.equal(offer.badge, "1 parada · LIM");
  assert.equal(offer.aviasalesUrl, WRAP);
  assert.equal(offer.fontePreco, "Aviasales");
  assert.equal(offer.fontePrecoEm, "2026-09-01");
  assert.equal(offer.semana, GRU_CUZ_SEMANA);
  assert.equal(GRU_CUZ_SEMANA.offerId, "gru-cuz");
  assert.equal(GRU_CUZ_SEMANA.tarifa, "USD $533");
  assert.notEqual(offer.semana, GRU_REC_SEMANA);
});

test("a semana vive so em /ofertas/gru-cuz; guia de 5 dias e /hoje nao crescem", () => {
  const oferta = renderOfferPage(offerById("gru-cuz"), { related: [] });
  const guia = renderGuidePage("cusco");
  const hoje = renderTodayPage(pacoteDoDia("2026-08-22"));
  const rec = renderOfferPage(offerById("gru-rec"), { related: [] });

  assert.match(oferta, /id="semana-gru-cuz"/);
  assert.match(oferta, /USD \$533/);
  assert.match(oferta, /1 parada/);
  assert.match(oferta, /6h30/);
  assert.match(oferta, /22h40/);
  assert.match(oferta, /8h45/);
  assert.match(oferta, /segunda/);
  assert.match(oferta, /MAP Café/);
  assert.match(oferta, /Cicciolina/);
  assert.match(oferta, /Chicha/);
  assert.match(oferta, /GRU0111CUZ08111/);
  assert.match(oferta, /Editorial, escrito em 1º de setembro de 2026/);
  assert.match(oferta, /Não é um texto de quem mora no Peru/);
  assert.match(oferta, /só se o ingresso/);
  assert.match(oferta, /não reserva/);
  assert.match(oferta, /não inventamos disponibilidade/i);
  assert.doesNotMatch(oferta, /\$382/);
  assert.doesNotMatch(oferta, /R\$\s*533\b/);
  assert.doesNotMatch(oferta, /R\$ 2\.100/);
  assert.doesNotMatch(oferta, /Google Flights/);
  assert.doesNotMatch(oferta, /ingresso incluso|ingresso confirmado|já temos ingresso|reserve o ingresso aqui/i);
  assert.doesNotMatch(oferta, /countdown|Tarifa ao vivo/i);
  assert.doesNotMatch(oferta, /id="semana-gru-rec"/);

  const week = weekSlice(oferta, "gru-cuz");
  assert.match(week, /1 parada em Lima/);
  assert.match(week, /Guarulhos segunda 9/);

  assert.equal(GUIDES.cusco.dias.length, 5);
  assert.equal(GUIDES.cusco.semana, undefined);
  assert.doesNotMatch(guia, /id="semana-gru-cuz"/);
  assert.doesNotMatch(guia, /Editorial, escrito em 1º de setembro/);
  assert.doesNotMatch(guia, /6h30 GRU/);
  assert.match(guia, /Cusco e Machu Picchu em 5 dias/);

  assert.doesNotMatch(hoje, /id="semana-gru-cuz"/);
  assert.doesNotMatch(hoje, /22h40 CUZ/);
  assert.match(hoje, /Florianópolis/);

  assert.match(rec, /USD \$235/);
  assert.doesNotMatch(rec, /USD \$533/);
  assert.doesNotMatch(rec, /id="semana-gru-cuz"/);
});

test("share copia /ofertas/gru-cuz?utm_source=wa, nunca /hoje", () => {
  const html = renderOfferPage(offerById("gru-cuz"), { related: [] });
  const share = waSharedUrl(html);
  assert.match(share, /\/ofertas\/gru-cuz\?utm_source=wa$/);
  assert.doesNotMatch(share, /\/hoje/);
  assert.match(html, /ofertas%2Fgru-cuz%3Futm_source%3Dwa/);
});

test("escolhaDoDia nao escolhe gru-cuz, gru-rec nem gru-mcz", () => {
  const vistos = new Set();
  for (let d = 0; d < 90; d++) {
    const data = new Date(Date.UTC(2026, 7, 1 + d));
    for (const item of escolhaDoDia(data)) {
      vistos.add(item.offer.id);
      assert.ok(!["gru-cuz", "gru-rec", "gru-mcz"].includes(item.offer.id));
    }
  }
  assert.deepEqual([...vistos].sort(), ["gig-ssa", "gru-eze", "gru-fln"]);
});

test("GET /ofertas/gru-cuz 200 com 1 parada, wrap e Machu Picchu editorial", async (t) => {
  const base = await withServer(t);
  const res = await fetch(`${base}/ofertas/gru-cuz`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /USD \$533/);
  assert.match(html, /1 parada/);
  assert.match(html, /6h30/);
  assert.match(html, /22h40/);
  assert.match(html, /8h45/);
  assert.match(html, /MAP Café/);
  assert.match(html, /Cicciolina/);
  assert.match(html, /Chicha/);
  assert.match(html, /GRU0111CUZ08111/);
  assert.match(html, /id="semana-gru-cuz"/);
  assert.doesNotMatch(html, /\$382/);
  assert.doesNotMatch(html, /R\$\s*533\b/);
  assert.doesNotMatch(html, /ingresso incluso|já temos ingresso/i);
  assert.doesNotMatch(waSharedUrl(html), /\/hoje/);

  const guia = await (await fetch(`${base}/guias/cusco`)).text();
  assert.doesNotMatch(guia, /id="semana-gru-cuz"/);
  const hoje = await (await fetch(`${base}/hoje?dia=2026-08-22`)).text();
  assert.doesNotMatch(hoje, /id="semana-gru-cuz"/);
});

test("hero e og: dest photo se GRU-CUZ.jpg faltar; sem stills inventados", () => {
  const html = renderOfferPage(offerById("gru-cuz"), { related: [] });
  const cardOnDisk = existsSync(path.join(process.cwd(), "public", "og", "GRU-CUZ.jpg"));
  assert.equal(ogSharePathForOffer("gru-cuz"), cardOnDisk ? "/og/GRU-CUZ.jpg" : "");
  const hero = heroImgSrc(html);
  assert.doesNotMatch(hero, /GRU-REC\.jpg|GRU-MCZ\.jpg|HOJE\.jpg|CGH-IGU\.jpg/);
  if (!cardOnDisk) {
    assert.match(hero, /Machu|commons\.wikimedia\.org/i);
  }
  const ogDir = path.join(process.cwd(), "public", "og");
  assert.equal(existsSync(path.join(ogDir, "GRU-CUZ-story.jpg")), false);
  assert.equal(existsSync(path.join(ogDir, "GRU-CUZ-ig.jpg")), false);
});
