// Ofertas cuja data de ida ja passou somem dos feeds e da rotacao do dia.
// O detalhe continua no ar (200), com aviso, noindex, sem CTA de reserva e
// sem Product no JSON-LD. O sitemap tambem deixa de cita-las.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createServer } from "../src/server.js";
import { OFFERS } from "../src/render/aondeContent.js";
import {
  renderHomePage,
  renderOfferPage,
  renderOffersPage,
  renderTodayPage,
} from "../src/render/htmlRenderer.js";
import { escolhaDoDia, pacoteDoDia } from "../src/daily/dailyPick.js";
import { ofertaEncerrada, ofertasAtivas } from "../src/offerDeparture.js";

const HOJE = "2026-10-09";
const NO_AR = "2026-08-01";
const BANNER =
  /Esta oferta já encerrou — as datas já passaram\. Veja os <a href="\/ofertas">achados atuais<\/a> ou <a href="\/alertas">crie um alerta para essa rota<\/a>\./;

const byId = (id) => OFFERS.find((o) => o.id === id);

function cardsDe(html) {
  return html.match(/<a class="of-card[^"]*"[\s\S]*?<\/a>/g) || [];
}

function cardIds(html) {
  return cardsDe(html)
    .map((c) => (c.match(/href="\/(?:saida|ofertas)\/([a-z0-9-]+)"/) || [])[1])
    .filter(Boolean);
}

function productsDe(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((m) => JSON.parse(m[1]))
    .filter((j) => j["@type"] === "Product");
}

async function withServer(t) {
  const original = process.env.AONDE_DATA_DIR;
  const dir = await mkdtemp(path.join(os.tmpdir(), "aonde-encerrada-"));
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

test("home 'achados' nao lista oferta encerrada", () => {
  const passada = renderHomePage({ hoje: HOJE });
  assert.doesNotMatch(passada, /href="\/ofertas\/gru-eze"/);
  assert.doesNotMatch(passada, /href="\/ofertas\/gru-rec"/);
  assert.match(passada, /href="\/ofertas\/gru-lis"/, "ida em 12 out ainda entra");

  const noAr = renderHomePage({ hoje: NO_AR });
  assert.match(noAr, /href="\/ofertas\/gru-eze"/, "em agosto gru-eze ainda estava no ar e no topo");
});

test("feed /ofertas recorta encerradas e cai no estado vazio existente", () => {
  const feed = renderOffersPage([], { hoje: HOJE });
  const ids = cardIds(feed);
  assert.ok(!ids.includes("gru-fln"));
  assert.ok(!ids.includes("for-ssa"));
  assert.ok(!ids.includes("gru-eze"));
  assert.ok(ids.includes("gru-lis"));
  assert.ok(ids.includes("gig-ssa"));
  assert.doesNotMatch(feed, /class="feed-vazio"/);

  const soPassadas = [
    { id: "x-set", origem: "GRU", destino: "REC", cidade: "Recife", datas_sugeridas: "3–10 set", preco_centavos: 100 },
    { id: "y-ago", origem: "GRU", destino: "SSA", cidade: "Salvador", datas_sugeridas: "10–20 ago", preco_centavos: 200 },
  ];
  const vazio = renderOffersPage(soPassadas, { hoje: HOJE });
  assert.equal(cardsDe(vazio).length, 0);
  assert.match(vazio, /class="feed-vazio" role="status">Ainda não há achados publicados/);
  assert.match(vazio, /<a href="\/alertas">crie um alerta grátis<\/a>/);
});

test("/hoje nao gira lock cuja ida ja passou; pagina vazia usa o estado existente", () => {
  const ids = (data) => escolhaDoDia(data).map((x) => x.offer.id);
  const locks = new Set(["gru-eze", "gru-fln", "gig-ssa"]);
  const emAgo = ids("2026-08-24");
  assert.equal(emAgo.length, 2);
  assert.ok(emAgo.every((id) => locks.has(id)));
  assert.ok(!ids(HOJE).includes("gru-eze"), "gru-eze (12 set) some depois da ida");
  assert.ok(!ids(HOJE).includes("gru-fln"), "gru-fln (27 set) some depois da ida");
  assert.deepEqual(ids(HOJE), ["gig-ssa"]);
  assert.equal(escolhaDoDia("2026-08-21")[0].offer.id, "gru-eze", "lock historico permanece no dia do lock");

  const html = renderTodayPage(pacoteDoDia(HOJE));
  assert.doesNotMatch(html, /gru-eze/);
  assert.doesNotMatch(html, /gru-fln/);
  assert.match(html, /gig-ssa|Salvador/);

  const semNinguem = escolhaDoDia(HOJE, {
    offers: OFFERS.filter((o) => o.id === "gru-eze" || o.id === "gru-fln"),
  });
  assert.equal(semNinguem.length, 0);
  const vazio = renderTodayPage({ dia: HOJE, itens: [] });
  assert.match(vazio, /class="hoje-vazio"/);
  assert.match(vazio, /Hoje não há uma escolha do dia publicada/);
});

test("detalhe de encerrada: banner pt-BR, noindex, sem CTA e sem Product JSON-LD", () => {
  const html = renderOfferPage(byId("gru-fln"), { related: [byId("gru-lis")], hoje: HOJE });
  assert.match(html, BANNER);
  assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
  assert.doesNotMatch(html, /class="btn btn-green det-buy-cta"/);
  assert.doesNotMatch(html, /href="\/saida\/gru-fln"/);
  assert.equal(productsDe(html).length, 0);
  assert.match(html, /class="rel-card" href="\/ofertas\/gru-lis"/, "relacionada ainda no ar continua");

  const ativa = renderOfferPage(byId("gru-lis"), { related: [], hoje: HOJE });
  assert.doesNotMatch(ativa, /class="det-encerrada"/);
  assert.doesNotMatch(ativa, /name="robots"/);
  assert.match(ativa, /class="btn btn-green det-buy-cta"/);

  const comProduto = renderOfferPage(byId("gig-ssa"), { related: [], hoje: HOJE });
  assert.doesNotMatch(comProduto, /class="det-encerrada"/);
  assert.ok(productsDe(comProduto).some((p) => p.offers), "oferta no ar com wrap segue com Product");
});

test("GET /ofertas/:id encerrada responde 200 com aviso, noindex e sem reserva", async (t) => {
  const base = await withServer(t);
  const res = await fetch(`${base}/ofertas/for-ssa`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("x-robots-tag"), "noindex, nofollow");
  const html = await res.text();
  assert.match(html, BANNER);
  assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
  assert.doesNotMatch(html, /class="btn btn-green det-buy-cta"/);
  assert.doesNotMatch(html, /href="\/saida\/for-ssa"/);
  assert.equal(productsDe(html).length, 0);

  const ativa = await fetch(`${base}/ofertas/gru-lis`);
  assert.equal(ativa.status, 200);
  assert.equal(ativa.headers.get("x-robots-tag"), null);
  assert.doesNotMatch(await ativa.text(), /class="det-encerrada"/);
});

test("GET /sitemap.xml omite ofertas encerradas e mantem as no ar", async (t) => {
  const base = await withServer(t);
  const xml = await (await fetch(`${base}/sitemap.xml`)).text();
  assert.doesNotMatch(xml, /\/ofertas\/gru-fln</);
  assert.doesNotMatch(xml, /\/ofertas\/for-ssa</);
  assert.doesNotMatch(xml, /\/ofertas\/gru-eze</);
  assert.match(xml, /\/ofertas\/gru-lis</);
  assert.match(xml, /\/ofertas\/gig-ssa</);
  for (const o of ofertasAtivas(OFFERS)) {
    assert.match(xml, new RegExp(`/ofertas/${o.id}<`));
  }
  for (const o of OFFERS.filter((x) => ofertaEncerrada(x))) {
    assert.doesNotMatch(xml, new RegExp(`/ofertas/${o.id}<`));
  }
});
