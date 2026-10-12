import test from "node:test";
import assert from "node:assert/strict";
import { createInboundRateLimiter } from "../src/inboundRateLimiter.js";

function configure(t, values) {
  for (const [name, value] of Object.entries({
    AONDE_INBOUND_RATE_LIMIT_DISABLED: "0",
    ...values,
  })) {
    const previous = process.env[name];
    process.env[name] = value;
    t.after(() => {
      if (previous === undefined) delete process.env[name];
      else process.env[name] = previous;
    });
  }
}

test("sub-unit request limits fall back to the default quota", (t) => {
  configure(t, {
    AONDE_INBOUND_RATE_LIMIT_MAX: "0.5",
    AONDE_INBOUND_RATE_LIMIT_WINDOW_MS: "60000",
  });
  const limiter = createInboundRateLimiter({ now: () => 0 });
  for (let i = 0; i < 20; i++) assert.equal(limiter.take("ip").ok, true);
  assert.deepEqual(limiter.take("ip"), { ok: false, retryAfterMs: 60000 });
});

test("sub-unit windows retain the default window and reset at its boundary", (t) => {
  configure(t, {
    AONDE_INBOUND_RATE_LIMIT_MAX: "1",
    AONDE_INBOUND_RATE_LIMIT_WINDOW_MS: "0.5",
  });
  let at = 0;
  const limiter = createInboundRateLimiter({ now: () => at });
  assert.equal(limiter.take("ip").ok, true);
  assert.deepEqual(limiter.take("ip"), { ok: false, retryAfterMs: 60000 });
  at = 59999;
  assert.deepEqual(limiter.take("ip"), { ok: false, retryAfterMs: 1 });
  at = 60000;
  assert.equal(limiter.take("ip").ok, true);
});
