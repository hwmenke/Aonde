import test from "node:test";
import assert from "node:assert/strict";

import { EXTRA_GUIDES } from "../src/render/moreGuides.js";

const COMMONS_PREFIX = "https://commons.wikimedia.org/wiki/Special:FilePath/";

test("EXTRA_GUIDES e importavel e mantem o shape esperado", () => {
  assert.ok(EXTRA_GUIDES && typeof EXTRA_GUIDES === "object");
  const keys = Object.keys(EXTRA_GUIDES);
  assert.equal(keys.length, 12);

  for (const key of keys) {
    const guide = EXTRA_GUIDES[key];
    assert.equal(guide.id, key, `guide.id deve bater com a chave "${key}"`);
    assert.equal(typeof guide.breadcrumb, "string");
    assert.equal(typeof guide.titulo, "string");
    assert.equal(typeof guide.heroFoto, "string");
    assert.equal(typeof guide.heroSrc, "string");
    assert.equal(typeof guide.heroCredit, "string");
    assert.equal(typeof guide.heroCreditHref, "string");
    assert.ok(Array.isArray(guide.dias));
    assert.ok(Array.isArray(guide.meta));
    assert.ok(guide.coords && typeof guide.coords.lat === "number" && typeof guide.coords.lng === "number");
  }
});

test("a maioria dos guias extras tem foto de capa do Wikimedia Commons preenchida", () => {
  const keys = Object.keys(EXTRA_GUIDES);
  const comFoto = keys.filter((k) => {
    const g = EXTRA_GUIDES[k];
    return typeof g.heroSrc === "string" && g.heroSrc.startsWith(COMMONS_PREFIX);
  });

  // Pelo menos 10 dos 12 roteiros devem ter heroSrc valido; os demais podem
  // ficar com "" e cair no placeholder generico do renderer.
  assert.ok(
    comFoto.length >= 10,
    `esperado >= 10 guias com heroSrc do Commons, encontrado ${comFoto.length}: ${comFoto.join(", ")}`
  );
});

test("guias com heroSrc preenchido tambem tem heroCredit e heroCreditHref coerentes", () => {
  for (const [key, guide] of Object.entries(EXTRA_GUIDES)) {
    if (!guide.heroSrc) continue;
    assert.ok(guide.heroSrc.startsWith(COMMONS_PREFIX), `${key}: heroSrc deve usar Special:FilePath do Commons`);
    assert.ok(guide.heroCredit.length > 0, `${key}: heroCredit nao deve ficar vazio quando heroSrc existe`);
    assert.match(
      guide.heroCreditHref,
      /^https:\/\/commons\.wikimedia\.org\//,
      `${key}: heroCreditHref deve apontar para o Wikimedia Commons`
    );
  }
});

test("heroSrc, quando presente, e uma URL bem formada", () => {
  for (const [key, guide] of Object.entries(EXTRA_GUIDES)) {
    if (!guide.heroSrc) continue;
    assert.doesNotThrow(() => new URL(guide.heroSrc), `${key}: heroSrc deve ser uma URL valida`);
    assert.doesNotThrow(() => new URL(guide.heroCreditHref), `${key}: heroCreditHref deve ser uma URL valida`);
  }
});
