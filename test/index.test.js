import test from "node:test";
import assert from "node:assert/strict";

import { getDealLink, getAllDealLinks, SUPPORTED_PARTNERS } from "../src/index.js";
import { setFetchImpl, resetFetchImpl } from "../src/http.js";

const ENV_KEYS = [
  "TRAVELPAYOUTS_TOKEN",
  "TRAVELPAYOUTS_MARKER",
  "AWIN_API_TOKEN",
  "AWIN_PUBLISHER_ID",
  "AWIN_ADVERTISER_ID_DECOLAR",
  "HURB_TRACKED_LINK",
  "PASSAGENS_PROMO_TRACKED_LINK",
];

function snapshotEnv() {
  const snap = {};
  for (const key of ENV_KEYS) snap[key] = process.env[key];
  return snap;
}

function restoreEnv(snap) {
  for (const key of ENV_KEYS) {
    if (snap[key] === undefined) delete process.env[key];
    else process.env[key] = snap[key];
  }
}

test("getDealLink retorna ok:false para parceiro desconhecido", async () => {
  const result = await getDealLink("nao-existe", {});
  assert.equal(result.ok, false);
  assert.match(result.error, /Parceiro desconhecido/);
});

test("getAllDealLinks roda os 4 parceiros e isola falhas individuais", async (t) => {
  const snap = snapshotEnv();
  for (const key of ENV_KEYS) delete process.env[key];

  // Apenas Hurb configurado com sucesso; os demais devem falhar de forma
  // isolada (sem lancar excecao e sem afetar o resultado dos outros).
  process.env.HURB_TRACKED_LINK = "https://www.clubehu.com.br/go/abc123";

  t.after(() => restoreEnv(snap));

  const results = await getAllDealLinks({ destinationUrl: "https://example.com" });

  assert.deepEqual(Object.keys(results).sort(), [...SUPPORTED_PARTNERS].sort());

  assert.equal(results.hurb.ok, true);
  assert.equal(results.hurb.url, "https://www.clubehu.com.br/go/abc123");

  assert.equal(results.travelpayouts.ok, false); // sem TRAVELPAYOUTS_MARKER
  assert.equal(results.awin.ok, false); // sem AWIN_API_TOKEN
  assert.equal(results["passagens-promo"].ok, false); // sem PASSAGENS_PROMO_TRACKED_LINK

  // Nenhum erro deve ter derrubado os demais: todos os 4 tem uma resposta.
  for (const partner of SUPPORTED_PARTNERS) {
    assert.ok(results[partner], `faltou resultado para ${partner}`);
    assert.equal(results[partner].partner, partner);
  }
});

test("getAllDealLinks isola falha de rede de um parceiro (awin) sem afetar os demais", async (t) => {
  const snap = snapshotEnv();
  for (const key of ENV_KEYS) delete process.env[key];

  process.env.TRAVELPAYOUTS_MARKER = "555555";
  process.env.AWIN_API_TOKEN = "fake-token";
  process.env.AWIN_PUBLISHER_ID = "123";
  process.env.AWIN_ADVERTISER_ID_DECOLAR = "456";
  process.env.HURB_TRACKED_LINK = "https://www.clubehu.com.br/go/abc123";
  process.env.PASSAGENS_PROMO_TRACKED_LINK = "https://www.parceirospromo.com.br/go/xyz";

  setFetchImpl(async (url) => {
    if (String(url).includes("awin.com")) {
      throw new Error("network down (awin)");
    }
    throw new Error("nao deveria ser chamado para outros parceiros neste teste");
  });

  t.after(() => {
    resetFetchImpl();
    restoreEnv(snap);
  });

  const results = await getAllDealLinks({
    destinationUrl: "https://example.com",
    programId: 4114,
  });

  assert.equal(results.awin.ok, false);
  assert.match(results.awin.error, /network down/);

  assert.equal(results.travelpayouts.ok, true);
  assert.equal(results.hurb.ok, true);
  assert.equal(results["passagens-promo"].ok, true);
});
