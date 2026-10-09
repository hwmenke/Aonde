// Parser da data de ida das ofertas editoriais (intervalo pt-BR sem ano) e
// o recorte de ofertas encerradas. `hoje` e injetado para o resultado nao
// depender do relogio.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  dataIdaIso,
  diaProduto,
  ofertaEncerrada,
  ofertasAtivas,
} from "../src/offerDeparture.js";
import { chaveDoDia } from "../src/daily/dailyPick.js";
import { OFFERS } from "../src/render/aondeContent.js";

const HOJE = "2026-10-09";

test("diaProduto usa o mesmo fuso America/Sao_Paulo de chaveDoDia", () => {
  assert.equal(diaProduto("2026-10-09"), "2026-10-09");
  assert.equal(diaProduto(new Date("2026-08-01T02:30:00Z")), chaveDoDia(new Date("2026-08-01T02:30:00Z")));
  assert.equal(diaProduto(new Date("2026-08-01T02:30:00Z")), "2026-07-31");
  assert.equal(diaProduto(new Date("2026-08-01T03:30:00Z")), "2026-08-01");
});

test("parseia a ida de um intervalo no mesmo mes ('12–24 out', '3–10 set')", () => {
  assert.equal(dataIdaIso("12–24 out", HOJE), "2026-10-12");
  assert.equal(dataIdaIso("3–10 set", HOJE), "2026-09-03");
  assert.equal(dataIdaIso("7–14 nov", HOJE), "2026-11-07");
  assert.equal(dataIdaIso("9–16 set", HOJE), "2026-09-09");
});

test("parseia a ida quando os meses cruzam ('27 set–3 out')", () => {
  assert.equal(dataIdaIso("27 set–3 out", HOJE), "2026-09-27");
  assert.equal(dataIdaIso("27 ago–3 set", HOJE), "2026-08-27");
});

test("aceita hifen ASCII alem do en-dash editorial", () => {
  assert.equal(dataIdaIso("12-24 out", HOJE), "2026-10-12");
  assert.equal(dataIdaIso("27 set-3 out", HOJE), "2026-09-27");
});

test("infere o ano seguinte quando a ida deste ano ja ficou o passado mais distante", () => {
  // 10 jan de 2026 esta ~9 meses atras; 10 jan de 2027 esta ~3 meses a frente.
  assert.equal(dataIdaIso("10–24 jan", HOJE), "2027-01-10");
  assert.equal(ofertaEncerrada({ datas: "10–24 jan" }, HOJE), false);
});

test("oferta cuja ida e anterior a hoje esta encerrada; no dia da ida ainda vale", () => {
  assert.equal(ofertaEncerrada({ datas: "27 set–3 out" }, HOJE), true);
  assert.equal(ofertaEncerrada({ datas: "3–10 out" }, HOJE), true);
  assert.equal(ofertaEncerrada({ datas: "12–24 out" }, HOJE), false);
  assert.equal(ofertaEncerrada({ datas: "12–24 out" }, "2026-10-12"), false);
  assert.equal(ofertaEncerrada({ datas: "12–24 out" }, "2026-10-13"), true);
  assert.equal(ofertaEncerrada({ datas: "7–14 nov" }, HOJE), false);
});

test("hoje injetavel deixa o recorte deterministico", () => {
  const o = { datas: "12–19 set" };
  assert.equal(ofertaEncerrada(o, "2026-09-11"), false);
  assert.equal(ofertaEncerrada(o, "2026-09-12"), false);
  assert.equal(ofertaEncerrada(o, "2026-09-13"), true);
  assert.equal(ofertaEncerrada(o, new Date("2026-09-13T15:00:00-03:00")), true);
});

test("datas ilegíveis, vazias ou ausentes nao encerram a oferta", () => {
  assert.equal(dataIdaIso("", HOJE), null);
  assert.equal(dataIdaIso("quando der", HOJE), null);
  assert.equal(dataIdaIso("32 out", HOJE), null);
  assert.equal(ofertaEncerrada({ datas: "" }, HOJE), false);
  assert.equal(ofertaEncerrada({ datas: "flexivel" }, HOJE), false);
  assert.equal(ofertaEncerrada({}, HOJE), false);
  assert.equal(ofertaEncerrada(null, HOJE), false);
  assert.equal(ofertaEncerrada({ datas_sugeridas: "12–24 out" }, HOJE), false);
});

test("le datas_sugeridas das ofertas ao vivo", () => {
  assert.equal(ofertaEncerrada({ datas_sugeridas: "3–10 set" }, HOJE), true);
  assert.equal(ofertaEncerrada({ datas_sugeridas: "14–21 out" }, HOJE), false);
});

test("ofertasAtivas devolve so as que ainda nao embarcaram", () => {
  const pool = [
    { id: "passada", datas: "3–10 set" },
    { id: "futura", datas: "12–24 out" },
    { id: "ilegivel", datas: "tba" },
  ];
  assert.deepEqual(
    ofertasAtivas(pool, HOJE).map((o) => o.id),
    ["futura", "ilegivel"]
  );
  assert.deepEqual(ofertasAtivas(null, HOJE), []);
});

test("no recorte de 1 ago 2026 nenhuma oferta editorial esta encerrada", () => {
  assert.equal(ofertasAtivas(OFFERS, "2026-08-01").length, OFFERS.length);
});
