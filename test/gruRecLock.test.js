// Semana lock GRU-REC (Sao Paulo Guarulhos → Recife). Vive so em
// /ofertas/gru-rec. Nao entra em /hoje, nao substitui o guia de 5 dias,
// nao e rec-gig (Recife→Rio) e nao e Congonhas.

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createServer } from "../src/server.js";
import {
  OFFERS,
  GUIDES,
  GRU_REC_SEMANA,
  REC_GIG_SEMANA,
} from "../src/render/aondeContent.js";
import { escolhaDoDia, pacoteDoDia } from "../src/daily/dailyPick.js";
import { renderOfferPage, renderGuidePage, renderTodayPage } from "../src/render/htmlRenderer.js";
import { ogSharePathForOffer } from "../src/render/ogShare.js";

const WRAP = "https://www.aviasales.com/search/GRU1710REC24101";
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

function ogImage(html) {
  return (html.match(/property="og:image" content="([^"]+)"/) || [])[1] || "";
}

function heroImgSrc(html) {
  const prova = html.match(/<div class="det-prova-media">([\s\S]*?)<\/div>/);
  if (!prova) return "";
  return (prova[1].match(/src="([^"]+)"/) || [])[1] || "";
}

async function withServer(t) {
  const original = process.env.AONDE_DATA_DIR;
  const originalMarker = process.env.TRAVELPAYOUTS_MARKER;
  const dir = await mkdtemp(path.join(os.tmpdir(), "aonde-gru-rec-"));
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

test("gru-rec e LATAM direto GRU→REC, USD $235, wrap Aviasales 1 set", () => {
  const offer = offerById("gru-rec");
  assert.ok(offer);
  assert.equal(offer.origem, "GRU");
  assert.equal(offer.destino, "REC");
  assert.equal(offer.cidade, "Recife");
  assert.equal(offer.origemCidade, "Guarulhos");
  assert.equal(offer.cia, "LATAM");
  assert.equal(offer.preco, "USD $235");
  assert.equal(offer.preco_usd, "$235");
  assert.equal(offer.datas, "17–24 out");
  assert.equal(offer.aviasalesUrl, WRAP);
  assert.equal(offer.fontePreco, "Aviasales");
  assert.equal(offer.fontePrecoEm, "2026-09-01");
  assert.equal(offer.erro, false);
  assert.equal(offer.media, undefined);
  assert.equal(offer.economia, undefined);
  assert.equal(offer.semana, GRU_REC_SEMANA);
  assert.equal(GRU_REC_SEMANA.offerId, "gru-rec");
  assert.equal(GRU_REC_SEMANA.tarifa, "USD $235");
  assert.equal(GRU_REC_SEMANA.tarifaFonteEm, "2026-09-01");
  assert.equal(GRU_REC_SEMANA.origem, "GRU");
  assert.equal(GRU_REC_SEMANA.destino, "REC");
  assert.notEqual(offer.semana, REC_GIG_SEMANA);
  assert.notEqual(offerById("rec-gig").semana, GRU_REC_SEMANA);
});

test("a semana vive so em /ofertas/gru-rec; guia de 5 dias e /hoje nao crescem", () => {
  const oferta = renderOfferPage(offerById("gru-rec"), { related: [] });
  const guia = renderGuidePage("portodegalinhas");
  const hoje = renderTodayPage(pacoteDoDia("2026-08-22"));
  const hoje28 = renderTodayPage(pacoteDoDia("2026-08-28"));
  const recGig = renderOfferPage(offerById("rec-gig"), { related: [] });

  assert.match(oferta, /id="semana-gru-rec"/);
  assert.match(oferta, /Editorial, escrito em 1º de setembro de 2026/);
  assert.match(oferta, /Não é um texto de quem mora em Pernambuco/);
  assert.match(oferta, /USD \$235/);
  assert.match(oferta, /Aviasales/);
  assert.match(oferta, /17h30/);
  assert.match(oferta, /2h45/);
  assert.match(oferta, /Leite/);
  assert.match(oferta, /Beijupirá/);
  assert.match(oferta, /Guarulhos/);
  assert.match(oferta, /GRU1710REC24101/);
  assert.match(oferta, /precisa estar no REC por volta da 1h/);
  assert.match(oferta, /Sexta à noite em Porto perde o voo/);
  assert.match(oferta, /class="semana-lock-aviso"/);
  assert.match(oferta, /saindo de[\s\S]{0,80}Guarulhos/);
  assert.match(oferta, /<title>São Paulo–Recife em outubro/);
  assert.doesNotMatch(oferta, /Tarifa ao vivo/);
  assert.doesNotMatch(oferta, /ao vivo no Aviasales/);
  assert.doesNotMatch(oferta, /Google Flights/);
  assert.doesNotMatch(oferta, /\$211/);
  assert.doesNotMatch(oferta, /\$233/);
  assert.doesNotMatch(oferta, /R\$\s*235\b/);
  assert.doesNotMatch(oferta, /R\$\s*1\.?2/);
  assert.doesNotMatch(oferta, /saindo de Congonhas/);
  assert.doesNotMatch(oferta, /CGH1710REC/);
  assert.doesNotMatch(oferta, /countdown|há 2h|publicado há/i);
  assert.doesNotMatch(oferta, /id="semana-rec-gig"/);

  const week = weekSlice(oferta, "gru-rec");
  assert.match(week, /São Paulo \(GRU\) → Recife \(REC\)/);
  assert.match(week, /Guarulhos nos dois sentidos/);
  assert.doesNotMatch(week, /Congonhas/);
  assert.doesNotMatch(week, /countdown/i);

  assert.equal(GUIDES.portodegalinhas.dias.length, 5);
  assert.equal(GUIDES.portodegalinhas.semana, undefined);
  assert.ok(GUIDES.portodegalinhas.dias.some((d) => d.restaurante === "Leite"));
  assert.ok(GUIDES.portodegalinhas.dias.some((d) => d.restaurante === "Beijupirá"));
  assert.doesNotMatch(guia, /id="semana-gru-rec"/);
  assert.doesNotMatch(guia, /Editorial, escrito em 1º de setembro/);
  assert.doesNotMatch(guia, /Despertador meia-noite/);
  assert.doesNotMatch(guia, /17 a 24 de outubro de 2026/);
  assert.match(guia, /Recife e Porto de Galinhas em 5 dias/);

  for (const html of [hoje, hoje28]) {
    assert.doesNotMatch(html, /id="semana-gru-rec"/);
    assert.doesNotMatch(html, /class="semana-lock"/);
    assert.doesNotMatch(html, /Editorial, escrito em 1º de setembro/);
    assert.doesNotMatch(html, /Despertador meia-noite/);
  }

  assert.match(recGig, /id="semana-rec-gig"/);
  assert.doesNotMatch(recGig, /id="semana-gru-rec"/);
  assert.equal(offerById("rec-gig").aviasalesUrl, "https://www.aviasales.com/search/REC1010GIG17101");
  assert.equal(offerById("rec-gig").preco, "USD $270");
});

test("share copia /ofertas/gru-rec?utm_source=wa, nunca /hoje", () => {
  const html = renderOfferPage(offerById("gru-rec"), { related: [] });
  const share = waSharedUrl(html);
  assert.match(share, /\/ofertas\/gru-rec\?utm_source=wa$/);
  assert.doesNotMatch(share, /\/hoje/);
  assert.doesNotMatch(share, /\/saida\//);
  assert.match(html, /ofertas%2Fgru-rec%3Futm_source%3Dwa/);
});

test("consulta Aviasales fica ao lado de Reservar; USD nao vira reais", () => {
  const html = renderOfferPage(offerById("gru-rec"), { related: [] });
  const buy = (html.match(/<div class="det-buy">([\s\S]*?)<p class="det-buy-perks">/) || [])[1] || "";
  const ctaAt = buy.indexOf("Reservar no Aviasales");
  const fonteAt = buy.search(/Visto no Aviasales/);
  assert.ok(ctaAt > -1, "tem Reservar no Aviasales");
  assert.ok(fonteAt > ctaAt, "consulta ao lado de Reservar, nao acima");
  assert.match(html, /Visto no Aviasales, 1 set 2026/);
  assert.doesNotMatch(html, /Visto no Google Flights/);
  assert.doesNotMatch(html, /R\$\s*235\b/);
});

test("escolhaDoDia nao escolhe gru-rec para /hoje; Floripa continua no lock", () => {
  const vistos = new Set();
  for (let d = 0; d < 90; d++) {
    const data = new Date(Date.UTC(2026, 7, 1 + d));
    for (const item of escolhaDoDia(data)) {
      vistos.add(item.offer.id);
      assert.notEqual(item.offer.id, "gru-rec", "gru-rec nao pode entrar em /hoje");
    }
  }
  assert.deepEqual([...vistos].sort(), ["gig-ssa", "gru-eze", "gru-fln"]);

  const floripa = renderTodayPage(pacoteDoDia("2026-08-22"));
  assert.match(floripa, /Florianópolis/);
  assert.doesNotMatch(floripa, /id="semana-gru-rec"/);
  assert.doesNotMatch(floripa, /17h30 GRU/);
});

test("GET /ofertas/gru-rec 200 com a semana; wrap, hour trap e share desta oferta", async (t) => {
  const base = await withServer(t);
  const res = await fetch(`${base}/ofertas/gru-rec`);
  assert.equal(res.status, 200);
  const html = await res.text();

  assert.match(html, /\$235|USD \$235/);
  assert.match(html, /Aviasales/);
  assert.match(html, /17h30/);
  assert.match(html, /2h45/);
  assert.match(html, /Leite/);
  assert.match(html, /Beijupirá/);
  assert.match(html, /Guarulhos/);
  assert.match(html, /GRU1710REC24101/);
  assert.match(html, /id="semana-gru-rec"/);
  assert.match(html, /precisa estar no REC por volta da 1h/);
  assert.match(html, /ofertas%2Fgru-rec%3Futm_source%3Dwa/);
  assert.doesNotMatch(html, /\$211/);
  assert.doesNotMatch(html, /\$233/);
  assert.doesNotMatch(html, /saindo de Congonhas/);
  assert.doesNotMatch(html, /R\$\s*235\b/);
  assert.doesNotMatch(html, /Google Flights/);
  assert.doesNotMatch(waSharedUrl(html), /\/hoje/);

  const guia = await (await fetch(`${base}/guias/portodegalinhas`)).text();
  assert.doesNotMatch(guia, /id="semana-gru-rec"/);
  assert.doesNotMatch(guia, /Editorial, escrito em 1º de setembro/);
  assert.match(guia, /Leite/);

  const hoje = await (await fetch(`${base}/hoje`)).text();
  assert.doesNotMatch(hoje, /id="semana-gru-rec"/);
  assert.doesNotMatch(hoje, /Despertador meia-noite/);

  const recGig = await (await fetch(`${base}/ofertas/rec-gig`)).text();
  assert.match(recGig, /id="semana-rec-gig"/);
  assert.doesNotMatch(recGig, /id="semana-gru-rec"/);
  assert.match(recGig, /REC1010GIG17101/);
});

test("hero e og:image: GRU-REC.jpg se existir, senao foto do destino; nunca REC-GIG", () => {
  const html = renderOfferPage(offerById("gru-rec"), { related: [] });
  const cardOnDisk = existsSync(path.join(process.cwd(), "public", "og", "GRU-REC.jpg"));
  assert.equal(ogSharePathForOffer("gru-rec"), cardOnDisk ? "/og/GRU-REC.jpg" : "");
  const hero = heroImgSrc(html);
  const og = ogImage(html);
  assert.doesNotMatch(hero, /REC-GIG\.jpg|GIG-SSA\.jpg|HOJE\.jpg|CGH-IGU\.jpg/);
  assert.doesNotMatch(og, /REC-GIG\.jpg|GIG-SSA\.jpg|HOJE\.jpg|CGH-IGU\.jpg/);
  if (cardOnDisk) {
    assert.match(hero, /\/og\/GRU-REC\.jpg/);
    assert.match(og, /\/og\/GRU-REC\.jpg/);
  } else {
    assert.doesNotMatch(hero, /\/og\/GRU-REC\.jpg/);
    assert.match(hero, /Marco%20Zero%20Recife|Marco Zero Recife|commons\.wikimedia\.org/i);
  }
});

test("este PR nao inventa GRU-REC.jpg nem stills 9:16", () => {
  const ogDir = path.join(process.cwd(), "public", "og");
  for (const name of ["GRU-REC-story.jpg", "gru-rec-ig.jpg", "GRU-REC-ig.jpg"]) {
    assert.equal(existsSync(path.join(ogDir, name)), false, `${name} nao entra`);
  }
});
