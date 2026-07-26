import test from "node:test";
import assert from "node:assert/strict";

import {
  buildRouteKey,
  parseLinkRegistry,
  resolveTrackedLink,
} from "../src/manualLinkRegistry.js";

// ---------------------------------------------------------------------------
// parseLinkRegistry
// ---------------------------------------------------------------------------

test("parseLinkRegistry retorna {} para valor vazio/undefined", () => {
  assert.deepEqual(parseLinkRegistry(undefined), {});
  assert.deepEqual(parseLinkRegistry(""), {});
});

test("parseLinkRegistry faz parse de um JSON valido (objeto plano)", () => {
  const raw = JSON.stringify({ "GRU-LIS": "https://exemplo.com/1", "offer-1": "https://exemplo.com/2" });
  assert.deepEqual(parseLinkRegistry(raw), {
    "GRU-LIS": "https://exemplo.com/1",
    "offer-1": "https://exemplo.com/2",
  });
});

test("parseLinkRegistry retorna {} silenciosamente para JSON malformado", () => {
  assert.deepEqual(parseLinkRegistry("{isso nao e json"), {});
});

test("parseLinkRegistry retorna {} para JSON valido que nao e objeto plano (array)", () => {
  assert.deepEqual(parseLinkRegistry("[1,2,3]"), {});
});

test("parseLinkRegistry retorna {} para JSON valido que nao e objeto plano (string)", () => {
  assert.deepEqual(parseLinkRegistry('"apenas uma string"'), {});
});

test("parseLinkRegistry retorna {} para JSON valido que nao e objeto plano (numero)", () => {
  assert.deepEqual(parseLinkRegistry("42"), {});
});

test("parseLinkRegistry retorna {} para JSON 'null'", () => {
  assert.deepEqual(parseLinkRegistry("null"), {});
});

test("parseLinkRegistry nunca lanca excecao, mesmo com entradas bizarras", () => {
  assert.doesNotThrow(() => parseLinkRegistry("{{{"));
  assert.doesNotThrow(() => parseLinkRegistry("undefined"));
  assert.doesNotThrow(() => parseLinkRegistry("{"));
});

// ---------------------------------------------------------------------------
// buildRouteKey
// ---------------------------------------------------------------------------

test("buildRouteKey monta a chave em maiusculas", () => {
  assert.equal(buildRouteKey("gru", "lis"), "GRU-LIS");
  assert.equal(buildRouteKey("GRU", "LIS"), "GRU-LIS");
});

test("buildRouteKey retorna null se origin ou destination estiver ausente", () => {
  assert.equal(buildRouteKey(undefined, "LIS"), null);
  assert.equal(buildRouteKey("GRU", undefined), null);
  assert.equal(buildRouteKey(undefined, undefined), null);
  assert.equal(buildRouteKey("", "LIS"), null);
});

// ---------------------------------------------------------------------------
// resolveTrackedLink
// ---------------------------------------------------------------------------

test("resolveTrackedLink: explicitLink (override) vence tudo", () => {
  const result = resolveTrackedLink({
    registry: { "offer-1": "https://exemplo.com/registro" },
    offerId: "offer-1",
    origin: "GRU",
    destination: "LIS",
    explicitLink: "https://exemplo.com/override",
    fallbackLink: "https://exemplo.com/fallback",
  });
  assert.deepEqual(result, { url: "https://exemplo.com/override", source: "override" });
});

test("resolveTrackedLink: match exato por offerId tem prioridade sobre rota e fallback", () => {
  const result = resolveTrackedLink({
    registry: {
      "offer-1": "https://exemplo.com/por-oferta",
      "GRU-LIS": "https://exemplo.com/por-rota",
    },
    offerId: "offer-1",
    origin: "GRU",
    destination: "LIS",
    fallbackLink: "https://exemplo.com/fallback",
  });
  assert.deepEqual(result, { url: "https://exemplo.com/por-oferta", source: "registry:offerId" });
});

test("resolveTrackedLink: match por rota quando nao ha offerId no registro", () => {
  const result = resolveTrackedLink({
    registry: { "GRU-LIS": "https://exemplo.com/por-rota" },
    offerId: "offer-desconhecido",
    origin: "gru",
    destination: "lis",
    fallbackLink: "https://exemplo.com/fallback",
  });
  assert.deepEqual(result, { url: "https://exemplo.com/por-rota", source: "registry:route" });
});

test("resolveTrackedLink: cai no fallback global quando nada bate no registro", () => {
  const result = resolveTrackedLink({
    registry: { "GRU-LIS": "https://exemplo.com/por-rota" },
    offerId: "offer-desconhecido",
    origin: "GRU",
    destination: "GIG",
    fallbackLink: "https://exemplo.com/fallback",
  });
  assert.deepEqual(result, { url: "https://exemplo.com/fallback", source: "fallback-global" });
});

test("resolveTrackedLink: retorna null quando nao ha nenhuma fonte disponivel", () => {
  const result = resolveTrackedLink({
    registry: {},
    offerId: undefined,
    origin: undefined,
    destination: undefined,
    explicitLink: undefined,
    fallbackLink: "",
  });
  assert.equal(result, null);
});

test("resolveTrackedLink: registry ausente/invalido nao lanca excecao (trata como vazio)", () => {
  assert.doesNotThrow(() => resolveTrackedLink({}));
  assert.equal(resolveTrackedLink({}), null);

  const result = resolveTrackedLink({
    registry: null,
    fallbackLink: "https://exemplo.com/fallback",
  });
  assert.deepEqual(result, { url: "https://exemplo.com/fallback", source: "fallback-global" });
});

test("resolveTrackedLink: offerId presente mas ausente do registro nao quebra a resolucao por rota", () => {
  const result = resolveTrackedLink({
    registry: { "GRU-LIS": "https://exemplo.com/por-rota" },
    offerId: "offer-que-nao-existe",
    origin: "GRU",
    destination: "LIS",
  });
  assert.deepEqual(result, { url: "https://exemplo.com/por-rota", source: "registry:route" });
});
