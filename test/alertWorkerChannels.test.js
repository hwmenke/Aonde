import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setFetchImpl, resetFetchImpl } from "../src/http.js";
import { subscribe, confirm } from "../src/newsletter/subscriberStore.js";
import { addAlertRule } from "../src/newsletter/alertRules.js";
import { dispatchAlerts } from "../src/newsletter/alertMatcher.js";
import { processarFila } from "../src/newsletter/worker.js";

const agora = new Date("2026-09-11T12:00:00Z");

function setup(t, canais) {
  const dir = mkdtempSync(path.join(tmpdir(), "aonde-worker-channels-"));
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
  const sub = confirm(subscribe({ email: "reader@example.com", origem: "GRU" }).token).subscriber;
  addAlertRule({ subscriberId: sub.id, origem: "GRU", canais });
  const offer = { id: "offer", origem: "GRU", destino: "REC", preco_centavos: 60000, status: "publicada", ida: "2026-09-15" };
  writeFileSync(path.join(dir, "offers.json"), JSON.stringify([offer]));
  const queued = dispatchAlerts([offer], { agora: agora.getTime() });
  assert.deepEqual(queued.items.map(item => item.canal), canais);
  const requests = [];
  setFetchImpl(async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    return new Response("{}", { status: 200 });
  });
  const warnings = [];
  t.mock.method(console, "warn", (...args) => warnings.push(args.join(" ")));
  return { dir, items: queued.items, requests, warnings };
}

for (const canais of [["email", "whatsapp"], ["whatsapp"]]) {
  test(`worker only emails email items for rule with ${canais.join(" + ")}`, async t => {
    const { dir, items, requests, warnings } = setup(t, canais);
    const expectedEmails = canais.includes("email") ? 1 : 0;
    const result = await processarFila({ agora });
    assert.equal(requests.length, expectedEmails);
    assert.equal(result.enviados, expectedEmails);
    assert.equal(result.pulados, 1);
    assert.equal(result.falhas, 0);
    assert.equal(result.pendentesRestantes, 0);
    const states = JSON.parse(readFileSync(path.join(dir, "alert_queue.states.json"), "utf8"));
    for (const item of items) assert.equal(states[item.id], item.canal === "email" ? "enviado" : "descartado");
    assert.match(warnings.join("\n"), /canal-nao-suportado/);
    assert.match(warnings.join("\n"), /whatsapp/);
    assert.equal(readFileSync(path.join(dir, "alert_queue.checkpoint"), "utf8"), String(items.length));
    assert.equal((await processarFila({ agora })).enviados, 0);
    assert.equal(requests.length, expectedEmails);
  });
}

test("unsupported channel advances checkpoint and allows later legacy email delivery", async t => {
  const { dir, items, requests } = setup(t, ["whatsapp", "email"]);
  const legacyEmail = { ...items[1], id: "legacy-email" };
  delete legacyEmail.canal;
  writeFileSync(path.join(dir, "alert_queue.jsonl"), [items[0], legacyEmail].map(JSON.stringify).join("\n") + "\n");
  const result = await processarFila({ agora });
  assert.equal(requests.length, 1);
  assert.equal(result.enviados, 1);
  assert.equal(result.pulados, 1);
  assert.equal(result.pendentesRestantes, 0);
  const states = JSON.parse(readFileSync(path.join(dir, "alert_queue.states.json"), "utf8"));
  assert.equal(states[items[0].id], "descartado");
  assert.equal(states[legacyEmail.id], "enviado");
  assert.equal(readFileSync(path.join(dir, "alert_queue.checkpoint"), "utf8"), "2");
  // Even if the checkpoint is lost, a discarded channel remains terminal.
  writeFileSync(path.join(dir, "alert_queue.checkpoint"), "0");
  assert.equal((await processarFila({ agora })).pulados, 2);
  assert.equal(requests.length, 1);
});
