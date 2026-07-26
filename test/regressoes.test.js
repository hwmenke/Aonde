// Regressoes de erros encontrados numa varredura dedicada. Cada teste aqui
// existe porque a coisa QUEBROU de verdade uma vez.

import { test } from "node:test";
import assert from "node:assert/strict";

import { chaveDoDia, dataValida, escolhaDoDia, pacoteDoDia } from "../src/daily/dailyPick.js";
import {
  OFFERS,
  OFFER_COORDS,
  OFFER_ORIGINS,
  GUIDES,
  GUIDE_LIST,
  GUIDE_COORDS,
} from "../src/render/aondeContent.js";

test("data invalida nao derruba o robo do dia", () => {
  // Era: new Date("lixo") -> chave "NaN-NaN-NaN" -> indice NaN -> item undefined
  // -> "Cannot destructure property 'offer' of 'undefined'". Um cron com
  // parametro errado tirava a pagina do dia do ar.
  for (const ruim of ["lixo", "2026-13-99", "", "31/02/2026", null, NaN, {}, []]) {
    assert.doesNotThrow(() => pacoteDoDia(ruim), `pacoteDoDia(${JSON.stringify(ruim)}) estourou`);
    const chave = chaveDoDia(ruim);
    assert.match(chave, /^\d{4}-\d{2}-\d{2}$/, `chave malformada para ${JSON.stringify(ruim)}: ${chave}`);
    assert.ok(!chave.includes("NaN"));
  }
});

test("a escolha do dia nunca devolve item vazio", () => {
  for (const data of ["lixo", "2026-08-15", new Date(), null]) {
    for (const e of escolhaDoDia(data)) {
      assert.ok(e && e.offer && e.guide, `item incompleto para data ${String(data)}`);
    }
  }
});

test("dataValida separa data usavel de lixo", () => {
  assert.equal(dataValida("2026-08-15"), true);
  assert.equal(dataValida(new Date()), true);
  assert.equal(dataValida(undefined), true, "ausente = hoje, de proposito");
  assert.equal(dataValida("lixo"), false);
  assert.equal(dataValida("2026-13-99"), false);
});

test("toda oferta tem coordenada para o mini-mapa", () => {
  // As 4 ofertas do Nordeste entraram sem coordenada e o mapa da pagina de
  // detalhe caia no link de busca em vez de renderizar.
  for (const o of OFFERS) {
    const c = OFFER_COORDS[o.id];
    assert.ok(c, `oferta ${o.id} sem coordenada`);
    assert.ok(Number.isFinite(c.lat) && Number.isFinite(c.lng), `oferta ${o.id}: coordenada invalida`);
    assert.ok(Math.abs(c.lat) <= 90 && Math.abs(c.lng) <= 180, `oferta ${o.id}: coordenada fora do globo`);
  }
});

test("toda oferta e alcancavel pelo filtro de origem", () => {
  for (const o of OFFERS) {
    assert.ok(OFFER_ORIGINS.includes(o.origem), `origem ${o.origem} (oferta ${o.id}) nao tem pilula no filtro`);
  }
});

test("indice de roteiros e GUIDES nao divergem", () => {
  const ids = Object.keys(GUIDES);
  for (const g of GUIDE_LIST) assert.ok(GUIDES[g.id], `GUIDE_LIST cita "${g.id}", que nao existe`);
  for (const id of ids) {
    assert.ok(GUIDE_LIST.some((g) => g.id === id), `roteiro "${id}" nao aparece no indice`);
    assert.ok(GUIDE_COORDS[id], `roteiro "${id}" sem coordenada (fica fora do mapa)`);
  }
  assert.equal(new Set(ids).size, ids.length, "id de roteiro duplicado");
  const oids = OFFERS.map((o) => o.id);
  assert.equal(new Set(oids).size, oids.length, "id de oferta duplicado");
});

test("nenhum roteiro esta pela metade", () => {
  for (const [id, g] of Object.entries(GUIDES)) {
    assert.ok(g.titulo, `${id}: sem titulo`);
    assert.ok(g.heroSrc, `${id}: sem foto de capa`);
    assert.ok(g.hospedagem && g.hospedagem.texto, `${id}: sem conselho de hospedagem`);
    assert.ok(Array.isArray(g.dias) && g.dias.length >= 4, `${id}: roteiro curto demais`);
    for (const d of g.dias) {
      assert.ok(d.titulo, `${id} dia ${d.n}: sem titulo`);
      assert.ok((d.pontos || []).length > 0, `${id} dia ${d.n}: sem pontos`);
    }
  }
});
