import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setFetchImpl, resetFetchImpl } from "../src/http.js";
import { subscribe, confirm, hashEmail } from "../src/newsletter/subscriberStore.js";
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
  confirm(subscribe({ email: "reader@example.com", origem: "GRU" }).token);
  return dir;
}

const agora = new Date("2026-09-10T23:30:00-03:00"); // UTC September 11

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
  writeFileSync(path.join(dir, "offers.json"), JSON.stringify(offers));
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
  writeFileSync(path.join(dir, "offers.json"), JSON.stringify(offers));
  assert.equal((await processarFila({ agora })).pulados, 10);
  assert.equal(sends, 3);
});

test("editorial fallback expires on its explicit departure date", t => {
  setup(t);
  assert.equal(queuedOfferEligibility({ offerId: "gru-eze" }, "2026-09-12").eligible, true);
  assert.equal(queuedOfferEligibility({ offerId: "gru-eze" }, "2026-09-13").eligible, false);
});
