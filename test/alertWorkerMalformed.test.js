import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setFetchImpl, resetFetchImpl } from "../src/http.js";
import { subscribe, confirm, hashEmail } from "../src/newsletter/subscriberStore.js";
import { addAlertRule } from "../src/newsletter/alertRules.js";
import { processarFila } from "../src/newsletter/worker.js";

for (const malformed of [["null", "42", '"x"', "[]"], ["{broken"]]) {
  test(`worker skips malformed queue lines ${malformed.join(", ")} and delivers the next alert once`, async t => {
    const dir = mkdtempSync(path.join(tmpdir(), "aonde-worker-malformed-"));
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
    addAlertRule({ subscriberId: sub.id, origem: "GRU", canais: ["email"] });
    writeFileSync(path.join(dir, "offers.json"), JSON.stringify([
      { id: "offer", origem: "GRU", destino: "REC", preco_centavos: 60000, status: "publicada", ida: "2026-09-15" },
    ]));
    const alert = { id: "valid", canal: "email", offerId: "offer", subscriberEmailHash: hashEmail(sub.email) };
    writeFileSync(path.join(dir, "alert_queue.jsonl"), [...malformed, JSON.stringify(alert)].join("\n") + "\n");
    let sends = 0;
    setFetchImpl(async () => {
      sends++;
      return new Response("{}", { status: 200 });
    });
    const agora = new Date("2026-09-11T12:00:00Z");
    let result;
    await assert.doesNotReject(async () => { result = await processarFila({ agora }); });
    assert.equal(result.lidos, malformed.length + 1);
    assert.equal(result.pulados, malformed.length);
    assert.equal(result.enviados, 1);
    assert.equal(result.falhas, 0);
    assert.equal(result.pendentesRestantes, 0);
    assert.equal(sends, 1);
    const checkpoint = path.join(dir, "alert_queue.checkpoint");
    assert.equal(readFileSync(checkpoint, "utf8"), String(malformed.length + 1));
    assert.deepEqual(JSON.parse(readFileSync(path.join(dir, "alert_queue.states.json"), "utf8")), { valid: "enviado" });
    const second = await processarFila({ agora });
    assert.equal(second.lidos, 0);
    assert.equal(second.enviados, 0);
    assert.equal(sends, 1);
    assert.equal(readFileSync(checkpoint, "utf8"), String(malformed.length + 1));
  });
}
