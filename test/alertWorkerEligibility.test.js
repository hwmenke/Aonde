import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setFetchImpl, resetFetchImpl } from "../src/http.js";
import { subscribe, confirm, unsubscribe, hashEmail, listSubscribers } from "../src/newsletter/subscriberStore.js";
import { addAlertRule } from "../src/newsletter/alertRules.js";
import { processarFila } from "../src/newsletter/worker.js";
import { queuedOfferEligibility } from "../src/newsletter/alertEligibility.js";

function setup(t) {
  const dir = mkdtempSync(path.join(tmpdir(), "aonde-eligibility-"));
  const vars = { AONDE_DATA_DIR: dir, AONDE_EMAIL_PROVIDER: "resend", AONDE_EMAIL_API_KEY: "test", AONDE_EMAIL_FROM: "sender@example.com" };
  const previous = Object.fromEntries(Object.keys(vars).map(k => [k, process.env[k]]));
  Object.assign(process.env, vars);
  t.after(() => {
    resetFetchImpl();
    for (const [k, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[k]; else process.env[k] = value;
    }
    rmSync(dir, { recursive: true, force: true });
  });
  const sub = confirm(subscribe({ email: "reader@example.com", origem: "GRU" }).token).subscriber;
  addAlertRule({ subscriberId: sub.id, origem: "GRU" });
  return dir;
}

const agora = new Date("2026-09-10T23:30:00-03:00"); // UTC September 11

for (const resubscribe of [true, false]) {
  test(`worker after unsubscribe ${resubscribe ? "sends once to confirmed resubscription" : "still skips without resubscription"}`, async t => {
    const dir = setup(t);
    const original = listSubscribers()[0];
    const email = original.email;
    unsubscribe(email);
    const purged = listSubscribers()[0];
    assert.equal(purged.email, "");
    assert.equal(purged.email_hash, hashEmail(email));
    assert.ok(purged.unsubscribed_at);
    if (resubscribe) {
      const renewed = confirm(subscribe({ email, origem: "GRU" }).token).subscriber;
      assert.notEqual(renewed.id, original.id);
      assert.equal(listSubscribers()[1].id, renewed.id);
      addAlertRule({ subscriberId: renewed.id, origem: "GRU" });
    }
    writeFileSync(path.join(dir, "offers.json"), JSON.stringify([
      { id: "resub-offer", origem: "GRU", destino: "REC", preco_centavos: 60000, status: "publicada", ida: "2026-09-15" },
    ]));
    writeFileSync(path.join(dir, "alert_queue.jsonl"), JSON.stringify({
      id: "resub-alert", offerId: "resub-offer", subscriberEmailHash: hashEmail(email),
    }) + "\n");
    const messages = [];
    setFetchImpl(async (_url, options) => {
      messages.push(JSON.parse(options.body));
      return { ok: true, status: 200, headers: new Map(), text: async () => "{}", json: async () => ({}) };
    });
    const expectedSends = resubscribe ? 1 : 0;
    const result = await processarFila({ agora });
    assert.equal(result.enviados, expectedSends);
    assert.equal(result.pulados, 1 - expectedSends);
    assert.equal(result.falhas, 0);
    assert.equal((await processarFila({ agora })).enviados, 0);
    assert.equal(messages.length, expectedSends);
    if (resubscribe) assert.deepEqual(messages[0].to, [email]);
  });
}

test("worker discards ineligible offers, sends valid/store and editorial offers, persists decisions", async t => {
  const dir = setup(t);
  const offers = [
    { id: "past", status: "publicada", ida: "2026-09-10" },
    { id: "draft", status: "rascunho", ida: "2026-09-15" },
    { id: "gru-rec", status: "encerrada" }, // editorial must not override
    { id: "invalid", status: "publicada", ida: "2026-02-30" },
    { id: "today", status: "publicada", ida: "2026-09-11", volta: "2026-09-12" },
    { id: "future", status: "publicada", ida: "2026-09-15" },
  ];
  writeFileSync(path.join(dir, "offers.json"), JSON.stringify(offers.map(offer => ({ origem: "GRU", destino: "REC", preco_centavos: 60000, ...offer }))));
  const ids = ["past", "draft", "gru-rec", "invalid", "missing", null, "", "today", "future", "gru-eze"];
  const queue = ids.map((offerId, i) => ({ id: `q${i}`, offerId, subscriberEmailHash: hashEmail("reader@example.com"), offerRoute: "GRU-REC", precoCentavos: 50000 }));
  writeFileSync(path.join(dir, "alert_queue.jsonl"), queue.map(JSON.stringify).join("\n") + "\n");
  let sends = 0;
  setFetchImpl(async () => {
    sends++;
    return { ok: true, status: 200, headers: new Map(), text: async () => "{}", json: async () => ({}) };
  });
  const warnings = [];
  t.mock.method(console, "warn", (...args) => warnings.push(args.join(" ")));
  const result = await processarFila({ agora });
  assert.equal(result.enviados, 3);
  assert.equal(result.pulados, 7);
  assert.equal(sends, 3);
  assert.equal(warnings.filter(w => w.includes("sem offerId")).length, 1);
  const states = JSON.parse(readFileSync(path.join(dir, "alert_queue.states.json")));
  for (let i = 0; i < 7; i++) assert.equal(states[`q${i}`], "descartado");
  assert.equal(readFileSync(path.join(dir, "alert_queue.checkpoint"), "utf8"), "10");
  // Repair checkpoint and make formerly expired offer eligible: discard is terminal.
  writeFileSync(path.join(dir, "alert_queue.checkpoint"), "0");
  offers[0].ida = "2026-09-20";
  writeFileSync(path.join(dir, "offers.json"), JSON.stringify(offers.map(offer => ({ origem: "GRU", destino: "REC", preco_centavos: 60000, ...offer }))));
  assert.equal((await processarFila({ agora })).pulados, 10);
  assert.equal(sends, 3);
});

test("editorial fallback expires on its explicit departure date", t => {
  setup(t);
  assert.equal(queuedOfferEligibility({ offerId: "gru-eze" }, listSubscribers()[0], { today: "2026-09-12" }).eligible, true);
  assert.equal(queuedOfferEligibility({ offerId: "gru-eze" }, listSubscribers()[0], { today: "2026-09-13" }).eligible, false);
});

for (const [name, fields, expectedSends, reason] of [
  ["price above ceiling", { preco_centavos: 90000 }, 0, "regra-nao-casa"],
  ["current higher price under ceiling", { preco_centavos: 70000 }, 1],
  ["changed route outside rule", { destino: "LIS" }, 0, "regra-nao-casa"],
  ["editorial string price above ceiling", { preco_centavos: undefined, preco: "R$ 1.570" }, 0, "regra-nao-casa"],
  ["unparseable string price cannot verify ceiling", { preco_centavos: undefined, preco: "consultar" }, 0, "preco-nao-verificavel"],
  ["nonfinite price cannot verify ceiling", { preco_centavos: Infinity }, 0, "preco-nao-verificavel"],
]) {
  test(`worker rechecks live offer: ${name}`, async t => {
    const dir = setup(t);
    const sub = listSubscribers()[0];
    writeFileSync(path.join(dir, "alert_rules.json"), JSON.stringify([
      { subscriber_id: sub.id, origem: "GRU", destino: "REC", preco_alvo_centavos: 80000 },
    ]));
    const offer = { id: "changed", origem: "GRU", destino: "REC", preco_centavos: 70000,
      status: "publicada", ida: "2026-09-15", ...fields };
    writeFileSync(path.join(dir, "offers.json"), JSON.stringify([offer]));
    const item = { id: "changed-alert", offerId: offer.id, subscriberEmailHash: hashEmail(sub.email),
      offerRoute: "GRU-REC", precoCentavos: 50000, canal: "email" };
    writeFileSync(path.join(dir, "alert_queue.jsonl"), JSON.stringify(item) + "\n");
    if (reason) assert.equal(queuedOfferEligibility(item, sub, { today: "2026-09-11" }).reason, reason);
    const messages = [];
    setFetchImpl(async (_url, options) => {
      messages.push(JSON.parse(options.body));
      return { ok: true, status: 200, headers: new Map(), text: async () => "{}", json: async () => ({}) };
    });
    const result = await processarFila({ agora });
    assert.equal(result.enviados, expectedSends);
    assert.equal(result.pulados, 1 - expectedSends);
    assert.equal(messages.length, expectedSends);
    const states = JSON.parse(readFileSync(path.join(dir, "alert_queue.states.json")));
    assert.equal(states[item.id], expectedSends ? "enviado" : "descartado");
    if (expectedSends) {
      assert.match(messages[0].text, /Preço encontrado: R\$ 700\n/);
      assert.doesNotMatch(messages[0].text, /R\$ 500/);
    }
  });
}

test("worker uses live route when it still matches the subscriber rule", async t => {
  const dir = setup(t); // Origin-only rule also accepts the new destination.
  writeFileSync(path.join(dir, "offers.json"), JSON.stringify([
    { id: "rerouted", origem: "GRU", destino: "LIS", preco_centavos: 70000, status: "publicada", ida: "2026-09-15" },
  ]));
  writeFileSync(path.join(dir, "alert_queue.jsonl"), JSON.stringify({
    id: "rerouted-alert", offerId: "rerouted", subscriberEmailHash: hashEmail("reader@example.com"),
    offerRoute: "VCP-REC", precoCentavos: 50000,
  }) + "\n");
  const messages = [];
  setFetchImpl(async (_url, options) => {
    messages.push(JSON.parse(options.body));
    return { ok: true, status: 200, headers: new Map(), text: async () => "{}", json: async () => ({}) };
  });
  assert.equal((await processarFila({ agora })).enviados, 1);
  assert.match(messages[0].text, /LIS/);
  assert.match(messages[0].text, /GRU/);
  assert.doesNotMatch(messages[0].text, /VCP|REC/);
});
