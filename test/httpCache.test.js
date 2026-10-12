import test from "node:test";
import assert from "node:assert/strict";
import { makeCacheKey } from "../src/httpCache.js";

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

test("cache separa tokens que colidiam no hash antigo", () => {
  assert.notEqual(
    makeCacheKey(AVIASALES, { Authorization: "Aa" }),
    makeCacheKey(AVIASALES, { Authorization: "B@" }),
  );
});

test("cache considera ambos os headers de auth sem depender de ordem ou capitalizacao", () => {
  const first = makeCacheKey(AVIASALES, { Authorization: "Bearer A", "X-Access-Token": "tokenA" });
  assert.notEqual(first, makeCacheKey(AVIASALES, { Authorization: "Bearer A", "X-Access-Token": "tokenB" }));
  assert.notEqual(first, makeCacheKey(AVIASALES, { Authorization: "Bearer B", "X-Access-Token": "tokenA" }));
  assert.equal(first, makeCacheKey(AVIASALES, { "x-access-token": "tokenA", authorization: "Bearer A" }));
  assert.equal(first.includes("tokenA"), false);
  assert.equal(first.includes("Bearer A"), false);
});

function jsonResponse(obj) {
  return new Response(JSON.stringify(obj), { status: 200 });
}

for (const [label, fail] of [
  ["HTTP 503", () => new Response('{"error":"unavailable"}', { status: 503 })],
  ["JSON invalido", () => new Response("invalid JSON", { status: 200 })],
  ["erro de rede", () => { throw new Error("network unavailable"); }],
]) {
  test(`cache nao guarda ${label} e permite recuperacao do provedor`, async (t) => {
    let calls = 0;
    const payload = { results: [] };
    setFetchImpl(async () => {
      calls++;
      return calls === 1 ? fail() : jsonResponse(payload);
    });
    t.after(() => resetFetchImpl());

    const failed = await httpRequest(AVIASALES, { retries: 0 });
    assert.equal(failed.ok, false);
    assert.equal(calls, 1);

    const recovered = await httpRequest(AVIASALES, { retries: 0 });
    assert.equal(recovered.ok, true);
    assert.notEqual(recovered.fromCache, true);
    assert.deepEqual(recovered.data, payload);
    assert.equal(calls, 2);

    const cached = await httpRequest(AVIASALES, { retries: 0 });
    assert.equal(cached.ok, true);
    assert.equal(cached.fromCache, true);
    assert.deepEqual(cached.data, payload);
    assert.equal(calls, 2);
  });
}

for (const [label, makeHeaders] of [
  ["Headers", (token) => new Headers({ Authorization: token })],
  ["tuplas", (token) => [["Authorization", token]]],
]) {
  test(`cache isola credenciais em ${label} e chamadas anonimas`, async (t) => {
    let calls = 0;
    setFetchImpl(async () => jsonResponse({ call: ++calls }));
    t.after(() => resetFetchImpl());

    const anonymous = await httpRequest(AVIASALES);
    const a = await httpRequest(AVIASALES, { headers: makeHeaders("Bearer A") });
    const b = await httpRequest(AVIASALES, { headers: makeHeaders("Bearer B") });
    assert.equal(calls, 3);
    assert.notDeepEqual(a.data, anonymous.data);
    assert.notDeepEqual(a.data, b.data);

    const again = await httpRequest(AVIASALES, { headers: makeHeaders("Bearer A") });
    assert.equal(calls, 3);
    assert.equal(again.fromCache, true);
    assert.deepEqual(again.data, a.data);
    assert.equal(makeCacheKey(AVIASALES, makeHeaders("Bearer A")),
      makeCacheKey(AVIASALES, { Authorization: "Bearer A" }));
  });
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

test("mutacoes em respostas iniciais e cacheadas nao alteram o cache", async (t) => {
  const payload = { results: [{ route: { origin: "GRU", destination: "LIS" } }] };
  let calls = 0;
  setFetchImpl(async () => {
    calls++;
    return jsonResponse(payload);
  });
  t.after(() => resetFetchImpl());

  const first = await httpRequest(AVIASALES);
  assert.equal(first.ok, true);
  first.data.results[0].route.origin = "GIG";
  first.data.results.push({ route: { origin: "SSA", destination: "LIS" } });

  const second = await httpRequest(AVIASALES);
  assert.equal(second.fromCache, true);
  assert.deepEqual(second.data, payload);
  second.data.results[0].route.destination = "MAD";
  second.data.results.length = 0;

  const third = await httpRequest(AVIASALES);
  assert.equal(third.fromCache, true);
  assert.deepEqual(third.data, payload);
  assert.equal(calls, 1);
});

test("cache expira no instante do TTL e refaz o fetch", async (t) => {
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

  // No instante do TTL: refaz o fetch.
  clock.t = 900_000;
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
