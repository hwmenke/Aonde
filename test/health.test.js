import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { validateConfig } from "../src/health.js";
import { validateConfig as validateConfigFromIndex } from "../src/index.js";

// Todas as variaveis de ambiente que o health-check inspeciona. Salvamos os
// valores originais uma vez (before), limpamos antes de cada teste
// (beforeEach) para partir sempre de um ambiente vazio e conhecido, e
// restauramos ao final (after) para nao vazar estado para outros arquivos de
// teste.
const ENV_KEYS = [
  "TRAVELPAYOUTS_TOKEN",
  "TRAVELPAYOUTS_MARKER",
  "AWIN_API_TOKEN",
  "AWIN_PUBLISHER_ID",
  "AWIN_ADVERTISER_ID_DECOLAR",
  "HURB_TRACKED_LINK",
  "HURB_TRACKED_LINKS_JSON",
  "PASSAGENS_PROMO_TRACKED_LINK",
  "PASSAGENS_PROMO_TRACKED_LINKS_JSON",
];

const originalEnv = {};

before(() => {
  for (const key of ENV_KEYS) originalEnv[key] = process.env[key];
});

after(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

beforeEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
});

test("nada configurado: todos os parceiros em notConfigured", () => {
  const result = validateConfig();

  assert.deepEqual(result.ready, []);
  assert.deepEqual(result.partial, []);
  assert.deepEqual(
    result.notConfigured.sort(),
    ["awin", "hurb", "passagens-promo", "travelpayouts"]
  );

  assert.equal(result.partners.travelpayouts.ready, false);
  assert.deepEqual(result.partners.travelpayouts.missing, [
    "TRAVELPAYOUTS_MARKER",
    "TRAVELPAYOUTS_TOKEN",
  ]);
  assert.match(result.partners.awin.missing.join(","), /AWIN_API_TOKEN/);
});

test("travelpayouts com so o marker: partial com nota sobre o token", () => {
  process.env.TRAVELPAYOUTS_MARKER = "12345";

  const result = validateConfig();

  assert.ok(result.partial.includes("travelpayouts"));
  assert.ok(!result.ready.includes("travelpayouts"));

  const tp = result.partners.travelpayouts;
  assert.equal(tp.ready, false);
  assert.deepEqual(tp.missing, ["TRAVELPAYOUTS_TOKEN"]);
  assert.match(tp.notes, /tp\.media/);
  assert.match(tp.notes, /TRAVELPAYOUTS_TOKEN/);
});

test("travelpayouts com so o token: partial com nota sobre o marker", () => {
  process.env.TRAVELPAYOUTS_TOKEN = "secret-token";

  const result = validateConfig();

  assert.ok(result.partial.includes("travelpayouts"));
  const tp = result.partners.travelpayouts;
  assert.deepEqual(tp.missing, ["TRAVELPAYOUTS_MARKER"]);
  assert.match(tp.notes, /TRAVELPAYOUTS_MARKER/);
});

test("travelpayouts com marker + token: ready", () => {
  process.env.TRAVELPAYOUTS_MARKER = "12345";
  process.env.TRAVELPAYOUTS_TOKEN = "secret-token";

  const result = validateConfig();

  assert.ok(result.ready.includes("travelpayouts"));
  const tp = result.partners.travelpayouts;
  assert.equal(tp.ready, true);
  assert.deepEqual(tp.missing, []);
});

test("awin completo (token + publisher + advertiser): ready", () => {
  process.env.AWIN_API_TOKEN = "fake-token";
  process.env.AWIN_PUBLISHER_ID = "123";
  process.env.AWIN_ADVERTISER_ID_DECOLAR = "456";

  const result = validateConfig();

  assert.ok(result.ready.includes("awin"));
  const awin = result.partners.awin;
  assert.equal(awin.ready, true);
  assert.deepEqual(awin.missing, []);
});

test("awin com token + publisher mas sem advertiser: ready com nota", () => {
  process.env.AWIN_API_TOKEN = "fake-token";
  process.env.AWIN_PUBLISHER_ID = "123";

  const result = validateConfig();

  assert.ok(result.ready.includes("awin"));
  const awin = result.partners.awin;
  assert.equal(awin.ready, true);
  assert.match(awin.notes, /AWIN_ADVERTISER_ID_DECOLAR/);
});

test("awin sem publisher: notConfigured listando o que falta", () => {
  process.env.AWIN_API_TOKEN = "fake-token";

  const result = validateConfig();

  assert.ok(result.notConfigured.includes("awin"));
  assert.deepEqual(result.partners.awin.missing, ["AWIN_PUBLISHER_ID"]);
});

test("hurb via registro JSON por rota, sem link global: ready", () => {
  process.env.HURB_TRACKED_LINKS_JSON =
    '{"GRU-LIS":"https://www.clubehu.com.br/go/rota1"}';

  const result = validateConfig();

  assert.ok(result.ready.includes("hurb"));
  const hurb = result.partners.hurb;
  assert.equal(hurb.ready, true);
  assert.deepEqual(hurb.missing, []);
  assert.match(hurb.notes, /rota\/oferta/);
});

test("hurb via link global, sem registro: ready", () => {
  process.env.HURB_TRACKED_LINK = "https://www.clubehu.com.br/go/global";

  const result = validateConfig();

  assert.ok(result.ready.includes("hurb"));
  assert.match(result.partners.hurb.notes, /link global/);
});

test("passagens-promo sem nada: notConfigured com as duas variaveis", () => {
  const result = validateConfig();

  assert.ok(result.notConfigured.includes("passagens-promo"));
  assert.deepEqual(result.partners["passagens-promo"].missing, [
    "PASSAGENS_PROMO_TRACKED_LINK",
    "PASSAGENS_PROMO_TRACKED_LINKS_JSON",
  ]);
});

test("validateConfig e reexportado por src/index.js", () => {
  assert.equal(validateConfigFromIndex, validateConfig);
});
