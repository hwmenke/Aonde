import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setFetchImpl, resetFetchImpl } from "../src/http.js";
import { subscribe, confirm, hashEmail } from "../src/newsletter/subscriberStore.js";
import { addAlertRule } from "../src/newsletter/alertRules.js";
import { processarFila } from "../src/newsletter/worker.js";

test("worker discards missing or invalid subscriber hashes and delivers the following alert only to B", async t => {
  const dir = mkdtempSync(path.join(tmpdir(), "aonde-worker-missing-hash-"));
  const vars = { AONDE_DATA_DIR: dir, AONDE_EMAIL_PROVIDER: "resend", AONDE_EMAIL_API_KEY: "fake", AONDE_EMAIL_FROM: "sender@example.com" };
  const previous = Object.fromEntries(Object.keys(vars).map(k => [k, process.env[k]]));
  Object.assign(process.env, vars);
  t.after(() => {
    resetFetchImpl();
    for (const [k, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[k]; else process.env[k] = value;
    }
    rmSync(dir, { recursive: true, force: true });
  });
  const recipients = [];
  setFetchImpl(async (_url, options) => {
    recipients.push(...JSON.parse(options.body).to);
    return new Response("{}", { status: 200 });
  });
  for (const email of ["alice@example.com", "bob@example.com"]) {
    const sub = confirm(subscribe({ email, origem: "GRU" }).token).subscriber;
    assert.equal(sub.email_hash, undefined);
    addAlertRule({ subscriberId: sub.id, origem: "GRU", canais: ["email"] });
  }
  writeFileSync(path.join(dir, "offers.json"), JSON.stringify([
    { id: "offer", origem: "GRU", destino: "REC", preco_centavos: 60000, status: "publicada", ida: "2026-09-15" },
  ]));
  const badItems = [
    { id: "missing" },
    ...[undefined, null, "", "   ", 42, false, {}, []].map((subscriberEmailHash, i) => ({ id: `invalid-${i}`, subscriberEmailHash })),
  ].map(item => ({ ...item, canal: "email", offerId: "offer" }));
  const valid = { id: "valid", canal: "email", offerId: "offer", subscriberEmailHash: hashEmail("bob@example.com") };
  writeFileSync(path.join(dir, "alert_queue.jsonl"), [...badItems, valid].map(item => JSON.stringify(item)).join("\n") + "\n");
  const warnings = [];
  t.mock.method(console, "warn", (...args) => warnings.push(args.join(" ")));
  const agora = new Date("2026-09-11T12:00:00Z");
  const result = await processarFila({ agora });
  assert.equal(result.lidos, badItems.length + 1);
  assert.equal(result.pulados, badItems.length);
  assert.equal(result.enviados, 1);
  assert.equal(result.falhas, 0);
  assert.equal(result.pendentesRestantes, 0);
  assert.deepEqual(recipients, ["bob@example.com"]);
  assert.ok(warnings.length > 0);
  assert.ok(warnings.every(message => message.includes("Alerta descartado") && message.includes("subscriberEmailHash")));
  const checkpoint = path.join(dir, "alert_queue.checkpoint");
  assert.equal(readFileSync(checkpoint, "utf8"), String(badItems.length + 1));
  assert.deepEqual(JSON.parse(readFileSync(path.join(dir, "alert_queue.states.json"), "utf8")), {
    ...Object.fromEntries(badItems.map(item => [item.id, "descartado"])),
    valid: "enviado",
  });
  const second = await processarFila({ agora });
  assert.equal(second.lidos, 0);
  assert.equal(second.enviados, 0);
  assert.deepEqual(recipients, ["bob@example.com"]);
  assert.equal(readFileSync(checkpoint, "utf8"), String(badItems.length + 1));
});
