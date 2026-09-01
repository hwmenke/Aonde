// Sete semanas lock em /ofertas/{id}. Nao entram em /hoje nem nos guias de 5 dias.
// Editorial 28 ago 2026. USD fica USD. Share com utm_source=wa daquela oferta.

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createServer } from "../src/server.js";
import {
  OFFERS,
  GUIDES,
  GRU_EZE_SEMANA,
  GIG_SSA_SEMANA,
  GRU_SCL_SEMANA,
  REC_GIG_SEMANA,
  POA_MVD_SEMANA,
  CGH_IGU_SEMANA,
  GRU_BRC_SEMANA,
  FOR_SSA_SEMANA,
} from "../src/render/aondeContent.js";
import { escolhaDoDia, pacoteDoDia } from "../src/daily/dailyPick.js";
import { renderOfferPage, renderGuidePage, renderTodayPage } from "../src/render/htmlRenderer.js";
import { ogSharePathForOffer } from "../src/render/ogShare.js";

const offerById = (id) => OFFERS.find((o) => o.id === id);

const LOCKS = [
  {
    id: "gru-eze",
    semana: GRU_EZE_SEMANA,
    wrap: "https://www.aviasales.com/search/GRU1209BUE19091",
    origin: "GRU",
    dest: "EZE",
    usd: "USD $322",
    marker: "Cabaña Las Lilas",
    guideId: "buenosaires",
    guideKeep: "Caminito",
  },
  {
    id: "gig-ssa",
    semana: GIG_SSA_SEMANA,
    wrap: "https://www.aviasales.com/search/GIG0711SSA14111",
    origin: "GIG",
    dest: "SSA",
    usd: "USD $259",
    marker: "15h GIG",
    guideId: "salvador",
    guideKeep: "Boteco do França",
  },
  {
    id: "gru-scl",
    semana: GRU_SCL_SEMANA,
    wrap: "https://www.aviasales.com/search/GRU0211SCL09111",
    origin: "GRU",
    dest: "SCL",
    usd: "USD $268",
    marker: "Bar Liguria",
    guideId: null,
  },
  {
    id: "rec-gig",
    semana: REC_GIG_SEMANA,
    wrap: "https://www.aviasales.com/search/REC1010GIG17101",
    origin: "REC",
    dest: "GIG",
    usd: "USD $270",
    marker: "8h15 REC",
    guideId: "rio",
    guideKeep: "Barraca na Prainha",
  },
  {
    id: "poa-mvd",
    semana: POA_MVD_SEMANA,
    wrap: "https://www.aviasales.com/search/POA1010MVD17101",
    origin: "POA",
    dest: "MVD",
    usd: "USD $513",
    marker: "USD $513",
    guideId: "montevideu",
    guideKeep: "Charco Bistró",
  },
  {
    id: "cgh-igu",
    semana: CGH_IGU_SEMANA,
    wrap: "https://www.aviasales.com/search/CGH1010IGU17101",
    origin: "CGH",
    dest: "IGU",
    usd: "USD $279",
    marker: "Congonhas (CGH)",
    guideId: "foz",
    guideKeep: "Parrilla em Puerto Iguazú",
  },
  {
    id: "gru-brc",
    semana: GRU_BRC_SEMANA,
    wrap: "https://www.aviasales.com/search/GRU1110BRC18101",
    origin: "GRU",
    dest: "BRC",
    usd: "USD $565",
    marker: "1 parada em AEP",
    guideId: "bariloche",
    guideKeep: "Cerro Catedral — dia 1",
  },
];

function waSharedUrl(html) {
  const m = html.match(/wa\.me\/\?text=([^"&]+)/);
  if (!m) return "";
  return decodeURIComponent(m[1]).split("\n").pop() || "";
}

function ogImage(html) {
  return (html.match(/property="og:image" content="([^"]+)"/) || [])[1] || "";
}

async function withServer(t) {
  const original = process.env.AONDE_DATA_DIR;
  const originalMarker = process.env.TRAVELPAYOUTS_MARKER;
  const dir = await mkdtemp(path.join(os.tmpdir(), "aonde-lock-weeks-"));
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

test("as sete semanas lock existem, com wrap Aviasales e offerId da secao", () => {
  for (const lock of LOCKS) {
    const offer = offerById(lock.id);
    assert.ok(offer, `${lock.id} deve existir`);
    assert.equal(offer.aviasalesUrl, lock.wrap);
    assert.equal(offer.semana, lock.semana);
    assert.equal(lock.semana.offerId, lock.id);
    assert.equal(lock.semana.tarifa, lock.usd);
    assert.equal(lock.semana.tarifaFonteEm, "2026-08-28");
    assert.equal(offer.origem, lock.origin);
    assert.equal(offer.destino, lock.dest);
  }
  assert.notEqual(offerById("gig-ssa").semana, FOR_SSA_SEMANA);
  assert.notEqual(offerById("for-ssa").semana, GIG_SSA_SEMANA);
});

test("cada semana vive so em /ofertas/{id}; guias de 5 dias nao crescem", () => {
  for (const lock of LOCKS) {
    const oferta = renderOfferPage(offerById(lock.id), { related: [] });
    assert.match(oferta, new RegExp(`id="semana-${lock.id}"`));
    assert.match(oferta, /Editorial, escrito em 28 de agosto de 2026/);
    assert.match(oferta, /Não é um texto de quem mora aí/);
    assert.ok(oferta.includes(lock.usd), `${lock.id} mostra ${lock.usd}`);
    assert.ok(oferta.includes(lock.marker), `${lock.id} mostra ${lock.marker}`);
    assert.match(oferta, /Tarifa vista no Aviasales em 28 de agosto de 2026/);
    assert.doesNotMatch(oferta, /Tarifa ao vivo/);
    assert.doesNotMatch(oferta, /ao vivo no Aviasales/);
    assert.doesNotMatch(oferta, /encontramos (hoje|esta manhã|esta manha)/i);
    assert.doesNotMatch(oferta, /publicado há/);
    assert.doesNotMatch(oferta, /há 2h|há 2 horas/);
    assert.doesNotMatch(oferta, /class="semana-lock-horarios"/);
    assert.doesNotMatch(oferta, /Horários que travam a semana/);

    if (lock.guideId) {
      const guia = renderGuidePage(lock.guideId);
      assert.equal(GUIDES[lock.guideId].semana, undefined);
      assert.doesNotMatch(guia, new RegExp(`id="semana-${lock.id}"`));
      assert.doesNotMatch(guia, /Editorial, escrito em 28 de agosto/);
      if (lock.guideKeep) assert.match(guia, new RegExp(lock.guideKeep));
    }
  }
  assert.equal(GUIDES.buenosaires.dias.length, 5);
  assert.equal(GUIDES.salvador.dias.length, 5);
  assert.equal(GUIDES.rio.dias.length, 5);
  assert.equal(GUIDES.bariloche.dias.length, 5);
  assert.equal(GUIDES.foz.dias.length, 4);
  assert.equal(GUIDES.montevideu.dias.length, 5);
});

test("Foz e Congonhas (CGH), nunca GRU; BRC e POA-MVD sao 1 parada", () => {
  const igu = renderOfferPage(offerById("cgh-igu"), { related: [] });
  assert.match(igu, /Congonhas/);
  assert.match(igu, /CGH1010IGU17101|Congonhas \(CGH\)/);
  assert.doesNotMatch(igu, /GRU1010IGU/);
  assert.doesNotMatch(igu, /\$260/);
  assert.doesNotMatch(igu, /saindo de São Paulo/);
  assert.match(igu, /saindo de Congonhas/);
  assert.match(igu, /<title>Congonhas–Foz do Iguaçu/);
  assert.doesNotMatch(igu, /Puerto Iguazú parrilla|Parrilla em Puerto Iguazú/i);

  const eze = renderOfferPage(offerById("gru-eze"), { related: [] });
  assert.match(eze, /Roberto Fiadone/);

  const brc = renderOfferPage(offerById("gru-brc"), { related: [] });
  assert.match(brc, /1 parada/);
  assert.match(brc, /não é temporada de neve/);
  assert.doesNotMatch(brc, /ainda dentro da temporada de neve/);
  assert.doesNotMatch(brc, /Cerro Catedral — dia 1/);
  assert.doesNotMatch(brc, /Alto el Fuego/);

  const mvd = renderOfferPage(offerById("poa-mvd"), { related: [] });
  assert.match(mvd, /1 parada/);
  assert.doesNotMatch(mvd, /\$438/);
  assert.doesNotMatch(mvd, /Charco/);
  assert.match(mvd, /USD \$532/);
  assert.match(mvd, /ótimo|18h40/);

  const rec = renderOfferPage(offerById("rec-gig"), { related: [] });
  assert.doesNotMatch(rec, /\$222/);
  assert.doesNotMatch(rec, /Barraca na Prainha/);
  assert.doesNotMatch(rec, /12–19 jul/);

  const scl = renderOfferPage(offerById("gru-scl"), { related: [] });
  assert.match(scl, /2–9 nov/);
  assert.doesNotMatch(scl, /2–12 nov/);
  assert.match(scl, /\$299/);
});

test("USD nao vira reais; consulta fica ao lado de Reservar", () => {
  for (const lock of LOCKS) {
    const html = renderOfferPage(offerById(lock.id), { related: [] });
    const n = lock.usd.replace(/[^\d]/g, "");
    assert.doesNotMatch(html, new RegExp(`R\\$\\s*${n}\\b`));
    const buy = (html.match(/<div class="det-buy">([\s\S]*?)<p class="det-buy-perks">/) || [])[1] || "";
    const ctaAt = buy.indexOf("Reservar no Aviasales");
    const fonteAt = buy.search(/Visto no (Aviasales|Google Flights)/);
    assert.ok(ctaAt > -1, `${lock.id} tem Reservar no Aviasales`);
    assert.ok(fonteAt > ctaAt, `${lock.id}: consulta ao lado de Reservar, nao acima`);
  }
});

test("share de cada oferta e /ofertas/{id}?utm_source=wa, nunca /hoje, e URLs distintas", () => {
  const urls = LOCKS.map((lock) => {
    const html = renderOfferPage(offerById(lock.id), { related: [] });
    const share = waSharedUrl(html);
    assert.match(share, new RegExp(`/ofertas/${lock.id}\\?utm_source=wa$`));
    assert.doesNotMatch(share, /\/hoje/);
    assert.doesNotMatch(share, /\/saida\//);
    assert.match(html, new RegExp(`ofertas%2F${lock.id}%3Futm_source%3Dwa`));
    return share;
  });
  assert.equal(new Set(urls).size, urls.length, "cada oferta tem URL de share propria");
});

test("og:image nunca cruza cartoes (GIG-SSA vs FOR-SSA, GRU vs CGH-IGU)", () => {
  const forSsa = renderOfferPage(offerById("for-ssa"), { related: [] });
  const gig = renderOfferPage(offerById("gig-ssa"), { related: [] });
  const igu = renderOfferPage(offerById("cgh-igu"), { related: [] });
  const rec = renderOfferPage(offerById("rec-gig"), { related: [] });

  assert.doesNotMatch(ogImage(forSsa), /GIG-SSA\.jpg/);
  assert.doesNotMatch(ogImage(forSsa), /HOJE\.jpg/);
  assert.match(ogImage(gig), /GIG-SSA\.jpg/);
  assert.doesNotMatch(ogImage(igu), /GRU-EZE\.jpg|GRU-FLN\.jpg|GRU-SCL\.jpg|GRU-BRC\.jpg/);
  assert.doesNotMatch(ogImage(rec), /GIG-SSA\.jpg/);
  assert.equal(ogSharePathForOffer("cgh-igu"), existsSync(path.join(process.cwd(), "public", "og", "CGH-IGU.jpg")) ? "/og/CGH-IGU.jpg" : "");
});

test("/hoje nao cresce estas semanas; rotacao fica nos tres locks antigos", () => {
  const vistos = new Set();
  for (let d = 0; d < 90; d++) {
    const data = new Date(Date.UTC(2026, 7, 1 + d));
    for (const item of escolhaDoDia(data)) {
      vistos.add(item.offer.id);
      assert.ok(
        ["gru-eze", "gru-fln", "gig-ssa"].includes(item.offer.id),
        `${item.offer.id} nao pode entrar em /hoje`
      );
    }
  }
  assert.deepEqual([...vistos].sort(), ["gig-ssa", "gru-eze", "gru-fln"]);

  for (const dia of ["2026-08-21", "2026-08-22", "2026-08-23", "2026-08-28"]) {
    const html = renderTodayPage(pacoteDoDia(dia));
    assert.doesNotMatch(html, /class="semana-lock"/);
    assert.doesNotMatch(html, /id="semana-cgh-igu"/);
    assert.doesNotMatch(html, /id="semana-gru-scl"/);
    assert.doesNotMatch(html, /id="semana-rec-gig"/);
    assert.doesNotMatch(html, /id="semana-poa-mvd"/);
    assert.doesNotMatch(html, /id="semana-gru-brc"/);
    assert.doesNotMatch(html, /Cabaña Las Lilas/);
    assert.doesNotMatch(html, /Bar Liguria/);
    assert.doesNotMatch(html, /Editorial, escrito em 28 de agosto/);
  }
});

test("GET serve cada /ofertas/{id} com a semana e sem vazar para o guia", async (t) => {
  const base = await withServer(t);
  for (const lock of LOCKS) {
    const oferta = await (await fetch(`${base}/ofertas/${lock.id}`)).text();
    assert.match(oferta, new RegExp(`id="semana-${lock.id}"`));
    assert.match(oferta, /Editorial, escrito em 28 de agosto de 2026/);
    assert.doesNotMatch(oferta, /Tarifa ao vivo/);
    if (lock.guideId) {
      const guia = await (await fetch(`${base}/guias/${lock.guideId}`)).text();
      assert.doesNotMatch(guia, new RegExp(`id="semana-${lock.id}"`));
    }
  }
  const hoje = await (await fetch(`${base}/hoje`)).text();
  assert.doesNotMatch(hoje, /id="semana-cgh-igu"/);
  assert.doesNotMatch(hoje, /id="semana-gru-brc"/);
});

test("este PR nao adiciona *-story.jpg nem *-ig.jpg", () => {
  const ogDir = path.join(process.cwd(), "public", "og");
  for (const pair of ["FOR-SSA", "GRU-SCL", "REC-GIG", "POA-MVD", "CGH-IGU", "GRU-BRC"]) {
    for (const suffix of ["-story.jpg", "-ig.jpg"]) {
      const name = pair + suffix;
      assert.equal(existsSync(path.join(ogDir, name)), false, `${name} nao entra`);
    }
  }
});

test("credito OG esta no README (Omnespsx, nao Gueldem)", async () => {
  const { readFile } = await import("node:fs/promises");
  const readme = await readFile(path.join(process.cwd(), "public", "og", "README.md"), "utf8");
  assert.match(readme, /Omnespsx, CC BY-SA 4\.0/);
  assert.match(readme, /NOT Güldem Üstün|nao Gueldem|NOT Güldem/i);
  assert.match(readme, /Donatas Dabravolskas, CC BY-SA 4\.0/);
  assert.match(readme, /Christian Córdova, CC BY 2\.0/);
  assert.match(readme, /Emesbe, CC BY-SA 3\.0/);
  assert.match(readme, /Phil Whitehouse, CC BY 2\.0/);
  assert.match(readme, /Paul R\. Burley, CC BY-SA 4\.0/);
  assert.match(readme, /\/ofertas\/cgh-igu/);
  assert.match(readme, /Congonhas/);
});

const OG_PAIRS = [
  { name: "FOR-SSA.jpg", min: 10_000 },
  { name: "GRU-SCL.jpg", min: 100_000 },
  { name: "REC-GIG.jpg", min: 10_000 },
  { name: "POA-MVD.jpg", min: 10_000 },
  { name: "CGH-IGU.jpg", min: 10_000 },
  { name: "GRU-BRC.jpg", min: 10_000 },
];

for (const card of OG_PAIRS) {
  const filePath = path.join(process.cwd(), "public", "og", card.name);
  const onDisk = existsSync(filePath);
  test(
    `GET /og/${card.name} serve o cartao landscape`,
    {
      skip: onDisk
        ? false
        : `${card.name} nao chegou neste checkout (so preview); nao inventar JPEG`,
    },
    async (t) => {
      const info = await stat(filePath);
      assert.ok(info.size > card.min, `${card.name} parece um stub`);
      const base = await withServer(t);
      const res = await fetch(`${base}/og/${card.name}`);
      assert.equal(res.status, 200);
      assert.match(res.headers.get("content-type") || "", /image\/jpeg/);
      const buf = Buffer.from(await res.arrayBuffer());
      assert.ok(buf.length > card.min);
      assert.equal(buf[0], 0xff);
      assert.equal(buf[1], 0xd8);
    }
  );
}

test("hora armadilha e linha de texto, sem countdown", () => {
  const scl = renderOfferPage(offerById("gru-scl"), { related: [] });
  assert.match(scl, /class="semana-lock-aviso"/);
  assert.match(scl, /9 de novembro/);
  assert.match(scl, /5h de SCL/);
  assert.match(scl, /2h30/);
  assert.match(scl, /parece uma manhã normal/);
  assert.doesNotMatch(scl, /countdown|há 2h/i);

  const igu = renderOfferPage(offerById("cgh-igu"), { related: [] });
  assert.match(igu, /5h15/);
  assert.match(igu, /madrugada/);
  assert.match(igu, /CGH1010IGU17101/);
  assert.doesNotMatch(igu, /GRU1010IGU/);
});

test("Recife–Rio e REC-GIG, nao GRU nem Salvador; Bariloche e 1 parada", () => {
  const rec = renderOfferPage(offerById("rec-gig"), { related: [] });
  const weekAt = rec.indexOf('id="semana-rec-gig"');
  const week = rec.slice(weekAt, rec.indexOf("</section>", weekAt));
  assert.match(rec, /id="semana-rec-gig"/);
  assert.match(week, /Recife \(REC\) → Rio de Janeiro \(GIG\)/);
  assert.match(week, /REC1010GIG17101/);
  assert.match(rec, /<title>Recife–Rio de Janeiro em outubro/);
  assert.equal(offerById("rec-gig").aviasalesUrl, "https://www.aviasales.com/search/REC1010GIG17101");
  assert.doesNotMatch(ogImage(rec), /GIG-SSA\.jpg|GRU-EZE\.jpg|FOR-SSA\.jpg/);
  assert.doesNotMatch(week, /Fortaleza|Salvador em outubro|saindo de GRU|GRU1010/);
  assert.doesNotMatch(rec, /id="semana-for-ssa"|id="semana-gig-ssa"/);

  const brc = renderOfferPage(offerById("gru-brc"), { related: [] });
  assert.match(brc, /1 parada/);
  assert.match(brc, /det-badge[^>]*>1 parada · AEP/);
  assert.match(brc, /1 parada em AEP/);
});
