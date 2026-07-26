import test from "node:test";
import assert from "node:assert/strict";

import { createRateLimiter } from "../src/rateLimiter.js";

// Relogio falso: `t` avanca manualmente nos testes, tornando o token bucket
// deterministico (sem depender de tempo real).
function fakeClock(start = 0) {
  const c = { t: start };
  c.now = () => c.t;
  c.advance = (ms) => {
    c.t += ms;
  };
  return c;
}

test("token bucket permite ate capacity requisicoes e depois falha", () => {
  const clock = fakeClock();
  const limiter = createRateLimiter({ now: clock.now });
  const cfg = { capacity: 3, windowMs: 60_000 };

  assert.equal(limiter.take("k", cfg).ok, true);
  assert.equal(limiter.take("k", cfg).ok, true);
  assert.equal(limiter.take("k", cfg).ok, true);

  const fourth = limiter.take("k", cfg);
  assert.equal(fourth.ok, false);
  assert.ok(fourth.retryAfterMs > 0);
});

test("retryAfterMs indica o tempo ate a proxima ficha e recarrega com o clock", () => {
  const clock = fakeClock();
  const limiter = createRateLimiter({ now: clock.now });
  const cfg = { capacity: 2, windowMs: 60_000 }; // 1 ficha a cada 30_000ms

  limiter.take("k", cfg);
  limiter.take("k", cfg);
  const blocked = limiter.take("k", cfg);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.retryAfterMs, 30_000);

  // Avanca menos que o necessario: ainda bloqueado.
  clock.advance(29_999);
  assert.equal(limiter.take("k", cfg).ok, false);

  // Avanca o restante: uma ficha disponivel.
  clock.advance(1);
  assert.equal(limiter.take("k", cfg).ok, true);
  // E esgota de novo em seguida.
  assert.equal(limiter.take("k", cfg).ok, false);
});

test("recarga nao ultrapassa a capacidade (sem acumulo infinito)", () => {
  const clock = fakeClock();
  const limiter = createRateLimiter({ now: clock.now });
  const cfg = { capacity: 5, windowMs: 5_000 };

  limiter.take("k", cfg); // consome 1 (restam 4)
  clock.advance(10_000_000); // muito tempo: satura em capacity, nao alem
  assert.equal(limiter.peek("k"), 5);
});

test("baldes de chaves diferentes sao independentes", () => {
  const clock = fakeClock();
  const limiter = createRateLimiter({ now: clock.now });
  const cfg = { capacity: 1, windowMs: 60_000 };

  assert.equal(limiter.take("a", cfg).ok, true);
  assert.equal(limiter.take("a", cfg).ok, false); // esgotou "a"
  assert.equal(limiter.take("b", cfg).ok, true); // "b" intacto
});

test("reset() zera o estado do balde", () => {
  const clock = fakeClock();
  const limiter = createRateLimiter({ now: clock.now });
  const cfg = { capacity: 1, windowMs: 60_000 };

  assert.equal(limiter.take("k", cfg).ok, true);
  assert.equal(limiter.take("k", cfg).ok, false);
  limiter.reset("k");
  assert.equal(limiter.take("k", cfg).ok, true); // balde recriado cheio
});
