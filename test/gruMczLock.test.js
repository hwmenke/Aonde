// Semana lock GRU-MCZ (Sao Paulo Guarulhos → Maceio). Vive so em
// /ofertas/gru-mcz. Nao entra em /hoje, nao substitui o guia de 5 dias.

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createServer } from "../src/server.js";
import { OFFERS, GUIDES, GRU_MCZ_SEMANA, GRU_REC_SEMANA } from "../src/render/aondeContent.js";
import { escolhaDoDia, pacoteDoDia } from "../src/daily/dailyPick.js";
import { renderOfferPage, renderGuidePage, renderTodayPage } from "../src/render/htmlRenderer.js";
import { ogSharePathForOffer } from "../src/render/ogShare.js";

const WRAP = "https://www.aviasales.com/search/GRU1710MCZ24101";
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
  const dir = await mkdtemp(path.join(os.tmpdir(), "aonde-gru-mcz-"));
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

test("gru-mcz e GOL direto GRU→MCZ, USD $372, wrap Aviasales 1 set", () => {
  const offer = offerById("gru-mcz");
  assert.ok(offer);
  assert.equal(offer.origem, "GRU");
  assert.equal(offer.destino, "MCZ");
  assert.equal(offer.cidade, "Maceió");
  assert.equal(offer.origemCidade, "Guarulhos");
  assert.equal(offer.cia, "GOL");
  assert.equal(offer.preco, "USD $372");
  assert.equal(offer.preco_usd, "$372");
  assert.equal(offer.datas, "17–24 out");
  assert.equal(offer.aviasalesUrl, WRAP);
  assert.equal(offer.fontePreco, "Aviasales");
  assert.equal(offer.fontePrecoEm, "2026-09-01");
  assert.equal(offer.erro, false);
  assert.equal(offer.semana, GRU_MCZ_SEMANA);
  assert.equal(GRU_MCZ_SEMANA.offerId, "gru-mcz");
  assert.equal(GRU_MCZ_SEMANA.tarifa, "USD $372");
  assert.notEqual(offer.semana, GRU_REC_SEMANA);
});

test("a semana vive so em /ofertas/gru-mcz; guia de 5 dias e /hoje nao crescem", () => {
  const oferta = renderOfferPage(offerById("gru-mcz"), { related: [] });
  const guia = renderGuidePage("maceio");
  const hoje = renderTodayPage(pacoteDoDia("2026-08-22"));
  const rec = renderOfferPage(offerById("gru-rec"), { related: [] });

  assert.match(oferta, /id="semana-gru-mcz"/);
  assert.match(oferta, /USD \$372/);
  assert.match(oferta, /Aviasales/);
  assert.match(oferta, /22h25/);
  assert.match(oferta, /4h/);
  assert.match(oferta, /Janga Praia/);
  assert.match(oferta, /Wanchako/);
  assert.match(oferta, /Guarulhos/);
  assert.match(oferta, /GRU1710MCZ24101/);
  assert.match(oferta, /1h15/);
  assert.match(oferta, /sábado 17 não é um dia em Maceió/);
  assert.match(oferta, /despertador às 2h/);
  assert.match(oferta, /Editorial, escrito em 1º de setembro de 2026/);
  assert.match(oferta, /Não é um texto de quem mora em Alagoas/);
  assert.doesNotMatch(oferta, /\$230/);
  assert.doesNotMatch(oferta, /\$390/);
  assert.doesNotMatch(oferta, /saindo de Congonhas/);
  assert.doesNotMatch(oferta, /CGH1710MCZ/);
  assert.doesNotMatch(oferta, /R\$\s*372\b/);
  assert.doesNotMatch(oferta, /Google Flights/);
  assert.doesNotMatch(oferta, /countdown|Tarifa ao vivo/i);
  assert.doesNotMatch(oferta, /id="semana-gru-rec"/);

  const week = weekSlice(oferta, "gru-mcz");
  assert.match(week, /São Paulo \(GRU\) → Maceió \(MCZ\)/);
  assert.doesNotMatch(week, /Congonhas/);
  const frances = week.slice(week.indexOf("Segunda 19"), week.indexOf("Terça 20"));
  assert.match(frances, /sem casa nomeada|não tem nome/i);
  assert.doesNotMatch(frances, /<strong>/);

  assert.equal(GUIDES.maceio.dias.length, 5);
  assert.equal(GUIDES.maceio.semana, undefined);
  assert.doesNotMatch(guia, /id="semana-gru-mcz"/);
  assert.doesNotMatch(guia, /Editorial, escrito em 1º de setembro/);
  assert.doesNotMatch(guia, /22h25 GRU/);
  assert.match(guia, /Maceió e Maragogi em 5 dias/);

  assert.doesNotMatch(hoje, /id="semana-gru-mcz"/);
  assert.doesNotMatch(hoje, /22h25 GRU/);
  assert.match(hoje, /Florianópolis/);

  assert.match(rec, /USD \$235/);
  assert.doesNotMatch(rec, /USD \$372/);
  assert.doesNotMatch(rec, /id="semana-gru-mcz"/);
});

test("share copia /ofertas/gru-mcz?utm_source=wa, nunca /hoje", () => {
  const html = renderOfferPage(offerById("gru-mcz"), { related: [] });
  const share = waSharedUrl(html);
  assert.match(share, /\/ofertas\/gru-mcz\?utm_source=wa$/);
  assert.doesNotMatch(share, /\/hoje/);
  assert.match(html, /ofertas%2Fgru-mcz%3Futm_source%3Dwa/);
});

test("escolhaDoDia nao escolhe gru-mcz, gru-rec nem gru-cuz", () => {
  const vistos = new Set();
  for (let d = 0; d < 90; d++) {
    const data = new Date(Date.UTC(2026, 7, 1 + d));
    for (const item of escolhaDoDia(data)) {
      vistos.add(item.offer.id);
      assert.ok(!["gru-mcz", "gru-rec", "gru-cuz"].includes(item.offer.id));
    }
  }
  assert.deepEqual([...vistos].sort(), ["gig-ssa", "gru-eze", "gru-fln"]);
});

test("GET /ofertas/gru-mcz 200 com semana, wrap e hour traps", async (t) => {
  const base = await withServer(t);
  const res = await fetch(`${base}/ofertas/gru-mcz`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /USD \$372/);
  assert.match(html, /22h25/);
  assert.match(html, /4h/);
  assert.match(html, /Janga Praia/);
  assert.match(html, /Wanchako/);
  assert.match(html, /Guarulhos/);
  assert.match(html, /GRU1710MCZ24101/);
  assert.match(html, /id="semana-gru-mcz"/);
  assert.doesNotMatch(html, /\$230/);
  assert.doesNotMatch(html, /\$390/);
  assert.doesNotMatch(html, /saindo de Congonhas/);
  assert.doesNotMatch(html, /R\$\s*372\b/);
  assert.doesNotMatch(waSharedUrl(html), /\/hoje/);

  const guia = await (await fetch(`${base}/guias/maceio`)).text();
  assert.doesNotMatch(guia, /id="semana-gru-mcz"/);
  const hoje = await (await fetch(`${base}/hoje?dia=2026-08-22`)).text();
  assert.doesNotMatch(hoje, /id="semana-gru-mcz"/);
});

test("hero e og: dest photo se GRU-MCZ.jpg faltar; sem stills inventados", () => {
  const html = renderOfferPage(offerById("gru-mcz"), { related: [] });
  const cardOnDisk = existsSync(path.join(process.cwd(), "public", "og", "GRU-MCZ.jpg"));
  assert.equal(ogSharePathForOffer("gru-mcz"), cardOnDisk ? "/og/GRU-MCZ.jpg" : "");
  const hero = heroImgSrc(html);
  assert.doesNotMatch(hero, /GRU-REC\.jpg|REC-GIG\.jpg|HOJE\.jpg|CGH-IGU\.jpg/);
  if (!cardOnDisk) {
    assert.match(hero, /Macei|commons\.wikimedia\.org/i);
  }
  const ogDir = path.join(process.cwd(), "public", "og");
  assert.equal(existsSync(path.join(ogDir, "GRU-MCZ-story.jpg")), false);
  assert.equal(existsSync(path.join(ogDir, "GRU-MCZ-ig.jpg")), false);
});
