import test from "node:test";
import assert from "node:assert/strict";

import {
  httpRequest,
  setFetchImpl,
  resetFetchImpl,
  setClockImpl,
  resetClockImpl,
  clearHttpCache,
} from "../src/http.js";

// URL da Data API (aviasales) — unica com cache por default (TTL 15 min).
const AVIASALES = "https://api.travelpayouts.com/aviasales/v3/prices_for_dates?origin=GRU&destination=LIS";
const NEUTRAL = "https://example.com/data";

function jsonResponse(obj) {
  return new Response(JSON.stringify(obj), { status: 200 });
}

test("cache hit nao refaz o fetch (URL da Data API, GET 200)", async (t) => {
  let calls = 0;
  setFetchImpl(async () => {
    calls++;
    return jsonResponse({ n: calls });
  });
  t.after(() => resetFetchImpl());

  const first = await httpRequest(AVIASALES, { headers: { "X-Access-Token": "tokenA" } });
  const second = await httpRequest(AVIASALES, { headers: { "X-Access-Token": "tokenA" } });

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(calls, 1); // segunda veio do cache
  assert.deepEqual(second.data, first.data);
  assert.equal(second.fromCache, true);
});

test("cache expira apos o TTL e refaz o fetch", async (t) => {
  const clock = { t: 0 };
  let calls = 0;
  setFetchImpl(async () => {
    calls++;
    return jsonResponse({ n: calls });
  });
  setClockImpl(() => clock.t);
  t.after(() => {
    resetFetchImpl();
    resetClockImpl();
  });

  await httpRequest(AVIASALES, { headers: { "X-Access-Token": "tokenA" } });
  assert.equal(calls, 1);

  // Antes do TTL (15 min = 900_000ms): ainda cacheado.
  clock.t = 899_999;
  await httpRequest(AVIASALES, { headers: { "X-Access-Token": "tokenA" } });
  assert.equal(calls, 1);

  // Depois do TTL: refaz o fetch.
  clock.t = 900_001;
  const after = await httpRequest(AVIASALES, { headers: { "X-Access-Token": "tokenA" } });
  assert.equal(calls, 2);
  assert.notEqual(after.fromCache, true);
});

test("tokens diferentes geram chaves de cache diferentes (sem vazamento)", async (t) => {
  let calls = 0;
  setFetchImpl(async () => {
    calls++;
    return jsonResponse({ tokenCall: calls });
  });
  t.after(() => resetFetchImpl());

  const a1 = await httpRequest(AVIASALES, { headers: { "X-Access-Token": "tokenA" } });
  assert.equal(calls, 1);

  // Token diferente -> chave diferente -> novo fetch (nao herda a resposta de A).
  const b1 = await httpRequest(AVIASALES, { headers: { "X-Access-Token": "tokenB" } });
  assert.equal(calls, 2);
  assert.notDeepEqual(b1.data, a1.data);

  // Token A de novo -> cache hit, sem novo fetch.
  const a2 = await httpRequest(AVIASALES, { headers: { "X-Access-Token": "tokenA" } });
  assert.equal(calls, 2);
  assert.deepEqual(a2.data, a1.data);
});

test("URLs fora da Data API nao sao cacheadas por default", async (t) => {
  let calls = 0;
  setFetchImpl(async () => {
    calls++;
    return jsonResponse({ n: calls });
  });
  t.after(() => resetFetchImpl());

  await httpRequest(NEUTRAL);
  await httpRequest(NEUTRAL);
  assert.equal(calls, 2); // sem cache => dois fetches
});

test("cacheTtlMs por chamada habilita cache em URL arbitraria", async (t) => {
  let calls = 0;
  setFetchImpl(async () => {
    calls++;
    return jsonResponse({ n: calls });
  });
  t.after(() => resetFetchImpl());

  await httpRequest(NEUTRAL, { cacheTtlMs: 60_000 });
  const second = await httpRequest(NEUTRAL, { cacheTtlMs: 60_000 });
  assert.equal(calls, 1);
  assert.equal(second.fromCache, true);
});

test("AONDE_CACHE_TTL_MS=0 desliga o cache", async (t) => {
  const original = process.env.AONDE_CACHE_TTL_MS;
  process.env.AONDE_CACHE_TTL_MS = "0";
  let calls = 0;
  setFetchImpl(async () => {
    calls++;
    return jsonResponse({ n: calls });
  });
  t.after(() => {
    resetFetchImpl();
    if (original === undefined) delete process.env.AONDE_CACHE_TTL_MS;
    else process.env.AONDE_CACHE_TTL_MS = original;
  });

  await httpRequest(AVIASALES, { headers: { "X-Access-Token": "tokenA" } });
  await httpRequest(AVIASALES, { headers: { "X-Access-Token": "tokenA" } });
  assert.equal(calls, 2); // cache desligado => dois fetches
});

test("clearHttpCache() invalida o cache", async (t) => {
  let calls = 0;
  setFetchImpl(async () => {
    calls++;
    return jsonResponse({ n: calls });
  });
  t.after(() => resetFetchImpl());

  await httpRequest(AVIASALES, { headers: { "X-Access-Token": "tokenA" } });
  assert.equal(calls, 1);
  clearHttpCache();
  await httpRequest(AVIASALES, { headers: { "X-Access-Token": "tokenA" } });
  assert.equal(calls, 2);
});
