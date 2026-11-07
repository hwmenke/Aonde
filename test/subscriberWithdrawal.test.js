import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { subscribe, unsubscribe, confirm, getSubscriberById, listSubscribers } from "../src/newsletter/subscriberStore.js";
import { addAlertRule } from "../src/newsletter/alertRules.js";

const NOW = "2026-01-01T12:00:00.000Z";
const EMAIL = "reader@example.com";

async function setup(t) {
  const originalDir = process.env.AONDE_DATA_DIR;
  const dir = await mkdtemp(path.join(os.tmpdir(), "aonde-withdrawal-"));
  process.env.AONDE_DATA_DIR = dir;
  const RealDate = globalThis.Date;
  globalThis.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : [NOW])); }
    static now() { return RealDate.parse(NOW); }
  };
  t.after(async () => {
    globalThis.Date = RealDate;
    if (originalDir === undefined) delete process.env.AONDE_DATA_DIR;
    else process.env.AONDE_DATA_DIR = originalDir;
    await rm(dir, { recursive: true, force: true });
  });
  return path.join(dir, "subscribers.json");
}

test("unused confirmation cannot reverse withdrawal or authorize an alert", async (t) => {
  await setup(t);
  const pending = subscribe({ email: EMAIL, origem: "GRU", destino: "REC" });
  assert.equal(pending.ok, true);
  assert.equal(pending.subscriber.optin_token_expires_at, "2026-01-03T12:00:00.000Z");
  assert.equal(unsubscribe(EMAIL).ok, true);
  const withdrawn = getSubscriberById(pending.subscriber.id);
  const result = confirm(pending.token);
  const alert = addAlertRule({ subscriberId: pending.subscriber.id, origem: "GRU" });
  assert.deepEqual({ confirmOk: result.ok, alertOk: alert.ok }, { confirmOk: false, alertOk: false });
  assert.deepEqual(getSubscriberById(pending.subscriber.id), withdrawn);
  assert.equal(withdrawn.double_optin_confirmed, false);
  assert.equal(withdrawn.unsubscribed_at, NOW);
  assert.equal(withdrawn.pii_purged_at, NOW);
  assert.equal(withdrawn.consent_lgpd_at, null);
  for (const field of ["optin_token", "optin_token_expires_at", "pending_alert", "pending_rule"]) {
    assert.equal(withdrawn[field], null, field);
  }
  assert.deepEqual(listSubscribers({ confirmedOnly: true }), []);
});

test("legacy retained tokens reject withdrawn, purged, and invalid-contact records without writes", async (t) => {
  const file = await setup(t);
  const pending = subscribe({ email: EMAIL, origem: "GRU" });
  const variants = [
    { unsubscribed_at: NOW },
    { pii_purged_at: NOW },
    { unsubscribed_at: null, pii_purged_at: NOW, email: "" },
    { email: "" },
    { email: null },
    { email: undefined },
    { email: "invalid-address" },
  ];
  for (const overrides of variants) {
    const legacy = { ...pending.subscriber, ...overrides };
    const before = JSON.stringify([legacy], null, 2);
    await writeFile(file, before);
    const result = confirm(pending.token);
    assert.equal(result.ok, false, JSON.stringify(overrides));
    assert.equal(typeof result.error, "string");
    assert.deepEqual(Object.keys(result).sort(), ["error", "ok"]);
    assert.equal(await readFile(file, "utf8"), before);
    assert.equal(addAlertRule({ subscriberId: legacy.id, origem: "GRU" }).ok, false);
  }
});

test("unsubscribe clears a confirmed subscriber's pending rule and preserves prior consent", async (t) => {
  await setup(t);
  const pending = subscribe({ email: EMAIL, origem: "GRU" });
  assert.equal(confirm(pending.token).ok, true);
  const route = subscribe({ email: EMAIL, origem: "GRU", destino: "REC" });
  assert.equal(route.status, "pending_rule");
  assert.ok(route.subscriber.pending_rule);
  unsubscribe(EMAIL);
  const withdrawn = getSubscriberById(pending.subscriber.id);
  assert.equal(withdrawn.pending_rule, null);
  assert.equal(withdrawn.consent_lgpd_at, NOW);
  assert.equal(addAlertRule({ subscriberId: withdrawn.id, origem: "GRU" }).ok, false);
});

test("normal confirmation and fresh subscription after withdrawal authorize alerts", async (t) => {
  await setup(t);
  const original = subscribe({ email: EMAIL, origem: "GRU" });
  const confirmed = confirm(original.token);
  assert.equal(confirmed.ok, true);
  assert.equal(confirmed.subscriber.consent_lgpd_at, NOW);
  assert.equal(confirmed.subscriber.double_optin_confirmed, true);
  assert.equal(confirmed.subscriber.optin_token, null);
  assert.equal(confirmed.subscriber.optin_token_expires_at, null);
  assert.equal(confirm(original.token).ok, false);
  assert.equal(addAlertRule({ subscriberId: original.subscriber.id, origem: "GRU" }).ok, true);
  unsubscribe(EMAIL);
  const tombstone = getSubscriberById(original.subscriber.id);
  const fresh = subscribe({ email: EMAIL, origem: "GRU" });
  assert.equal(fresh.status, "pending_optin");
  assert.notEqual(fresh.subscriber.id, tombstone.id);
  assert.equal(confirm(fresh.token).ok, true);
  assert.equal(addAlertRule({ subscriberId: fresh.subscriber.id, origem: "GRU" }).ok, true);
  assert.deepEqual(getSubscriberById(tombstone.id), tombstone);
  assert.deepEqual(listSubscribers({ confirmedOnly: true }).map((s) => s.id), [fresh.subscriber.id]);
});
