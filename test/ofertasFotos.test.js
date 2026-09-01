// Testes das fotos das ofertas editoriais (OFFERS) e das 6 ofertas novas
// para destinos que ja tem roteiro. Cobre: toda oferta com foto tem credito,
// as URLs sao do Commons, a matematica de badge/economia fecha, toda oferta
// tem coordenada e nenhum id se repete.

import { test } from "node:test";
import assert from "node:assert/strict";

import { OFFERS, OFFER_COORDS, GUIDES } from "../src/render/aondeContent.js";
import { guiaDaOferta } from "../src/daily/dailyPick.js";

// Ids das 6 ofertas criadas para destinos que ja tem roteiro editorial (ver
// comentario em aondeContent.js, logo antes de "gru-cuz").
const OFERTAS_NOVAS = ["gru-cuz", "gru-brc", "cnf-mao", "gig-cnf-op", "poa-mvd", "bsb-cgr"];

test("toda oferta com foto (thumbUrl) tem credito e link do credito", () => {
  for (const o of OFFERS) {
    if (!o.thumbUrl) continue; // sem foto e valido: cai no placeholder do renderer
    assert.ok(o.credit && o.credit.trim(), `${o.id}: tem thumbUrl mas nao tem credit`);
    assert.ok(o.creditHref && o.creditHref.trim(), `${o.id}: tem thumbUrl mas nao tem creditHref`);
  }
});

test("todas as 12 ofertas editoriais originais ganharam foto", () => {
  // Antes desta mudanca NENHUMA oferta tinha thumbUrl: card do feed caia no
  // placeholder generico e o og:image caia na foto padrao do site (Noronha),
  // entao uma oferta de Lisboa compartilhada mostrava Fernando de Noronha.
  const idsOriginais = [
    "gru-lis", "gru-rec", "vcp-bue", "cnf-fln", "gig-mia", "gru-scl",
    "gru-mco", "gig-ssa", "rec-gru", "rec-gig", "ssa-cnf", "for-ssa",
  ];
  const porId = Object.fromEntries(OFFERS.map((o) => [o.id, o]));
  for (const id of idsOriginais) {
    const o = porId[id];
    assert.ok(o, `oferta ${id} nao existe mais`);
    assert.ok(o.thumbUrl, `${id}: ainda sem foto`);
  }
});

test("thumbUrl de oferta, quando existe, aponta para o Wikimedia Commons", () => {
  for (const o of OFFERS) {
    if (!o.thumbUrl) continue;
    assert.match(
      o.thumbUrl,
      /^https:\/\/commons\.wikimedia\.org\/wiki\/Special:FilePath\//,
      `${o.id}: thumbUrl nao e do formato Special:FilePath do Commons`,
    );
    assert.match(
      o.creditHref,
      /^https:\/\/commons\.wikimedia\.org\//,
      `${o.id}: creditHref nao aponta para o Commons`,
    );
  }
});

test("a foto de Montevidéu nao e a de Colonia del Sacramento (outra cidade do Uruguai)", () => {
  // O roteiro editorial "montevideu" usa uma foto de Colonia del Sacramento
  // como capa. Reaproveitar essa mesma foto na oferta de voo para Montevideu
  // seria o mesmo erro de og:image que motivou esta tarefa (destino errado
  // na foto). A oferta precisa da sua PROPRIA foto de Montevideu.
  const mvd = OFFERS.find((o) => o.id === "poa-mvd");
  assert.ok(mvd, "oferta poa-mvd nao existe");
  assert.doesNotMatch(mvd.thumbUrl, /Colonia/i, "poa-mvd: foto ainda e de Colonia del Sacramento, nao de Montevideu");
});

test("badge e economia das ofertas novas fecham com a conta", () => {
  const n = (s) => Number(String(s).replace(/[^0-9]/g, ""));
  for (const id of OFERTAS_NOVAS) {
    const o = OFFERS.find((x) => x.id === id);
    assert.ok(o, `oferta nova ${id} nao existe`);
    if (o.semana || o.aviasalesUrl) continue;
    const dito = (o.badge.match(/(\d+)%/) || [])[1];
    assert.ok(dito, `${id}: badge sem percentual ("${o.badge}")`);
    const real = Math.round(100 * (1 - n(o.preco) / n(o.media)));
    assert.equal(Number(dito), real, `${id}: badge diz ${dito}%, a conta da ${real}%`);
    assert.equal(n(o.media) - n(o.preco), n(o.economia), `${id}: economia anunciada nao fecha`);
  }
});

test("publicadoEm das ofertas novas e um instante ISO real e o rotulo e derivado dele", () => {
  for (const id of OFERTAS_NOVAS) {
    const o = OFFERS.find((x) => x.id === id);
    assert.ok(o.publicadoEm, `${id}: sem publicadoEm`);
    assert.ok(!Number.isNaN(new Date(o.publicadoEm).getTime()), `${id}: publicadoEm invalido`);
    assert.ok(typeof o.publicado === "string" && o.publicado.length > 0, `${id}: getter "publicado" nao devolveu texto`);
  }
});

test("as ofertas novas casam com o roteiro editorial do mesmo destino", () => {
  // E o proposito das ofertas novas: dar mais candidatos ao robo do dia
  // (dailyPick.js so usa oferta com roteiro).
  for (const id of OFERTAS_NOVAS) {
    const o = OFFERS.find((x) => x.id === id);
    const guia = guiaDaOferta(o, GUIDES);
    assert.ok(guia, `${id} (${o.cidade}): nao casou com nenhum roteiro`);
  }
});

test("toda oferta (incluindo as novas) tem coordenada valida", () => {
  for (const o of OFFERS) {
    const c = OFFER_COORDS[o.id];
    assert.ok(c, `oferta ${o.id} sem coordenada`);
    assert.ok(Number.isFinite(c.lat) && Number.isFinite(c.lng), `${o.id}: coordenada invalida`);
    assert.ok(Math.abs(c.lat) <= 90 && Math.abs(c.lng) <= 180, `${o.id}: coordenada fora do globo`);
  }
});

test("nenhum id de oferta se repete", () => {
  const ids = OFFERS.map((o) => o.id);
  assert.equal(new Set(ids).size, ids.length, "id de oferta duplicado em OFFERS");
});

test("as ofertas novas tem origens variadas (nao repetem o mesmo aeroporto)", () => {
  const origens = OFERTAS_NOVAS.map((id) => OFFERS.find((o) => o.id === id).origem);
  assert.ok(new Set(origens).size >= 4, `origens pouco variadas: ${origens.join(", ")}`);
});
