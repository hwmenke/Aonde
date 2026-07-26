import test from "node:test";
import assert from "node:assert/strict";

import {
  httpRequest,
  setFetchImpl,
  resetFetchImpl,
  setClockImpl,
  resetClockImpl,
} from "../src/http.js";

// URL neutra (sem regra de rate limit) para isolar o comportamento de retry.
const NEUTRAL = "https://example.com/api";

function jsonResponse(obj, init = {}) {
  return new Response(JSON.stringify(obj), { status: 200, ...init });
}

// ---------------------------------------------------------------------------
// Retry com backoff
// ---------------------------------------------------------------------------

test("retry em 5xx ate obter sucesso", async (t) => {
  let calls = 0;
  setFetchImpl(async () => {
    calls++;
    if (calls < 3) return jsonResponse({ e: "boom" }, { status: 503 });
    return jsonResponse({ ok: true });
  });
  t.after(() => resetFetchImpl());

  const delays = [];
  const res = await httpRequest(NEUTRAL, {
    jitterFn: () => 0,
    sleepImpl: async (ms) => delays.push(ms),
  });

  assert.equal(res.ok, true);
  assert.equal(calls, 3); // 1 inicial + 2 retries
  assert.equal(delays.length, 2);
});

test("retry em erro de rede (throw) ate obter sucesso", async (t) => {
  let calls = 0;
  setFetchImpl(async () => {
    calls++;
    if (calls < 2) throw new Error("ECONNRESET");
    return jsonResponse({ ok: true });
  });
  t.after(() => resetFetchImpl());

  const res = await httpRequest(NEUTRAL, {
    jitterFn: () => 0,
    sleepImpl: async () => {},
  });

  assert.equal(res.ok, true);
  assert.equal(calls, 2);
});

test("backoff exponencial: os atrasos crescem a cada tentativa", async (t) => {
  setFetchImpl(async () => jsonResponse({ e: "x" }, { status: 500 }));
  t.after(() => resetFetchImpl());

  const delays = [];
  const res = await httpRequest(NEUTRAL, {
    retries: 3,
    retryBaseMs: 100,
    jitterFn: () => 0, // equal jitter com jitter=0 => delay = base*2^attempt / 2
    sleepImpl: async (ms) => delays.push(ms),
  });

  assert.equal(res.ok, false);
  assert.equal(delays.length, 3);
  // 50, 100, 200 (crescente)
  assert.ok(delays[1] > delays[0]);
  assert.ok(delays[2] > delays[1]);
});

test("NAO faz retry em 4xx (exceto 429)", async (t) => {
  let calls = 0;
  setFetchImpl(async () => {
    calls++;
    return jsonResponse({ e: "bad request" }, { status: 400 });
  });
  t.after(() => resetFetchImpl());

  const res = await httpRequest(NEUTRAL, { sleepImpl: async () => {} });

  assert.equal(res.ok, false);
  assert.match(res.error, /400/);
  assert.equal(calls, 1); // sem retry
});

test("faz retry em 429 e respeita o header Retry-After", async (t) => {
  let calls = 0;
  setFetchImpl(async () => {
    calls++;
    if (calls === 1) {
      return jsonResponse({ e: "slow down" }, { status: 429, headers: { "Retry-After": "2" } });
    }
    return jsonResponse({ ok: true });
  });
  t.after(() => resetFetchImpl());

  const delays = [];
  const res = await httpRequest(NEUTRAL, {
    jitterFn: () => 0,
    sleepImpl: async (ms) => delays.push(ms),
  });

  assert.equal(res.ok, true);
  assert.equal(calls, 2);
  assert.equal(delays[0], 2000); // Retry-After: 2s respeitado (em ms)
});

test("esgota os retries e retorna o ultimo erro", async (t) => {
  let calls = 0;
  setFetchImpl(async () => {
    calls++;
    return jsonResponse({ e: "down" }, { status: 500 });
  });
  t.after(() => resetFetchImpl());

  const res = await httpRequest(NEUTRAL, { retries: 2, sleepImpl: async () => {} });

  assert.equal(res.ok, false);
  assert.match(res.error, /500/);
  assert.equal(calls, 3); // 1 + 2 retries
});

// ---------------------------------------------------------------------------
// Rate limiting (token bucket) via regra da Awin (20 req/min)
// ---------------------------------------------------------------------------

const AWIN_URL = "https://api.awin.com/publishers/1/linkbuilder/generate";

async function exhaustAwinBucket() {
  // 20 chamadas bem-sucedidas esgotam o balde da Awin (capacity=20).
  for (let i = 0; i < 20; i++) {
    const r = await httpRequest(AWIN_URL, { sleepImpl: async () => {} });
    assert.equal(r.ok, true, `chamada ${i} deveria passar`);
  }
}

test("rate limit fail-fast: retorna erro claro ao esgotar o balde", async (t) => {
  setFetchImpl(async () => jsonResponse({ ok: true }));
  t.after(() => resetFetchImpl());

  await exhaustAwinBucket();

  const blocked = await httpRequest(AWIN_URL, { sleepImpl: async () => {} });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.rateLimited, true);
  assert.match(blocked.error, /Limite de requisicoes/);
  assert.match(blocked.error, /Awin/);
});

test("rate limit modo wait: aguarda a recarga e entao passa", async (t) => {
  const clock = { t: 0 };
  setFetchImpl(async () => jsonResponse({ ok: true }));
  setClockImpl(() => clock.t);
  t.after(() => {
    resetFetchImpl();
    resetClockImpl();
  });

  await exhaustAwinBucket(); // balde vazio em t=0

  // sleep que AVANCA o relogio falso, permitindo a recarga do balde.
  const waited = await httpRequest(AWIN_URL, {
    rateLimit: "wait",
    sleepImpl: async (ms) => {
      clock.t += ms;
    },
  });

  assert.equal(waited.ok, true);
  assert.equal(clock.t, 3000); // 60_000ms / 20 = 3000ms por ficha
});

test("rate limit modo wait: falha se a espera excede maxWaitMs", async (t) => {
  const clock = { t: 0 };
  setFetchImpl(async () => jsonResponse({ ok: true }));
  setClockImpl(() => clock.t);
  t.after(() => {
    resetFetchImpl();
    resetClockImpl();
  });

  await exhaustAwinBucket();

  const res = await httpRequest(AWIN_URL, {
    rateLimit: "wait",
    maxWaitMs: 1000, // menor que os 3000ms necessarios
    sleepImpl: async (ms) => {
      clock.t += ms;
    },
  });

  assert.equal(res.ok, false);
  assert.equal(res.rateLimited, true);
  assert.match(res.error, /teto/);
});

test("AONDE_RATE_LIMIT=off desliga o rate limiting", async (t) => {
  const original = process.env.AONDE_RATE_LIMIT;
  process.env.AONDE_RATE_LIMIT = "off";
  setFetchImpl(async () => jsonResponse({ ok: true }));
  t.after(() => {
    resetFetchImpl();
    if (original === undefined) delete process.env.AONDE_RATE_LIMIT;
    else process.env.AONDE_RATE_LIMIT = original;
  });

  await exhaustAwinBucket();
  // 21a chamada ainda passa, pois o limitador esta desligado.
  const extra = await httpRequest(AWIN_URL, { sleepImpl: async () => {} });
  assert.equal(extra.ok, true);
});
