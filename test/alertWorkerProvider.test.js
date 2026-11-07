import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setFetchImpl, resetFetchImpl } from "../src/http.js";
import { subscribe, confirm, hashEmail } from "../src/newsletter/subscriberStore.js";
import { addAlertRule } from "../src/newsletter/alertRules.js";
import { processarFila } from "../src/newsletter/worker.js";

function setup(t, ida = "2026-09-15") {
  const dir = mkdtempSync(path.join(tmpdir(), "aonde-worker-provider-"));
  const vars = { AONDE_DATA_DIR: dir, AONDE_EMAIL_PROVIDER: "", AONDE_EMAIL_API_KEY: "fake", AONDE_EMAIL_FROM: "sender@example.com" };
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
  writeFileSync(path.join(dir, "offers.json"), JSON.stringify([
    { id: "offer", origem: "GRU", destino: "REC", preco_centavos: 60000, status: "publicada", ida },
  ]));
  writeFileSync(path.join(dir, "alert_queue.jsonl"), JSON.stringify({
    id: "queued", offerId: "offer", subscriberEmailHash: hashEmail(sub.email),
  }) + "\n");
  writeFileSync(path.join(dir, "alert_queue.checkpoint"), "0");
  writeFileSync(path.join(dir, "alert_queue.states.json"), '{"previous":"enviado"}');
  return dir;
}

test("registration mode preserves pending alerts for exactly one later delivery", async t => {
  const dir = setup(t);
  const agora = new Date("2026-09-11T12:00:00Z");
  let sends = 0;
  setFetchImpl(async () => {
    sends++;
    return { ok: true, status: 200, headers: new Map(), text: async () => "{}" };
  });
  const result = await processarFila({ agora });
  assert.equal(readFileSync(path.join(dir, "alert_queue.checkpoint"), "utf8"), "0");
  assert.equal(readFileSync(path.join(dir, "alert_queue.states.json"), "utf8"), '{"previous":"enviado"}');
  assert.equal(result.modo, "registro");
  assert.equal(result.pendentesRestantes, 1);
  assert.equal(result.enviados, 0);
  assert.equal(sends, 0);
  process.env.AONDE_EMAIL_PROVIDER = "resend";
  assert.equal((await processarFila({ agora })).enviados, 1);
  assert.equal((await processarFila({ agora })).enviados, 0);
  assert.equal(sends, 1);
});

for (const args of [[], ["--json"]]) {
  test(`CLI registration mode fails clearly and preserves queue (${args.join(" ") || "text"})`, async t => {
    const dir = setup(t);
    const previous = { argv: process.argv, exitCode: process.exitCode, log: console.log, error: console.error };
    const stdout = [];
    const stderr = [];
    try {
      process.argv = [process.execPath, "scripts/enviar-alertas.js", ...args];
      console.log = value => stdout.push(value);
      console.error = value => stderr.push(value);
      await import(`../scripts/enviar-alertas.js?format=${args.length}`);
      assert.equal(process.exitCode, 1);
    } finally {
      process.argv = previous.argv;
      process.exitCode = previous.exitCode;
      console.log = previous.log;
      console.error = previous.error;
    }
    assert.match(stderr.join("\n"), /AONDE_EMAIL_PROVIDER/);
    assert.match(stderr.join("\n"), /pendente/i);
    if (args.length) {
      const report = JSON.parse(stdout.join("\n"));
      assert.equal(report.modo, "registro");
      assert.equal(report.pendentesRestantes, 1);
    }
    assert.equal(readFileSync(path.join(dir, "alert_queue.checkpoint"), "utf8"), "0");
    assert.equal(readFileSync(path.join(dir, "alert_queue.states.json"), "utf8"), '{"previous":"enviado"}');
  });
}

for (const status of [401, 403]) {
  test(`HTTP ${status} preserves the alert for exactly one delivery after recovery`, async t => {
    const dir = setup(t, "2099-09-15");
    process.env.AONDE_EMAIL_PROVIDER = "resend";
    let calls = 0;
    setFetchImpl(async () => {
      calls++;
      return new Response('{"message":"Invalid API key"}', { status });
    });
    const result = await processarFila();
    assert.equal(result.falhas, 1);
    assert.equal(result.pulados, 0);
    assert.equal(result.enviados, 0);
    assert.equal(result.pendentesRestantes, 1);
    assert.equal(calls, 1);
    assert.equal(readFileSync(path.join(dir, "alert_queue.checkpoint"), "utf8"), "0");
    assert.deepEqual(JSON.parse(readFileSync(path.join(dir, "alert_queue.states.json"), "utf8")), { previous: "enviado" });

    const previous = { argv: process.argv, exitCode: process.exitCode, log: console.log, error: console.error };
    const stdout = [];
    const stderr = [];
    try {
      process.argv = [process.execPath, "scripts/enviar-alertas.js", "--json"];
      process.exitCode = 0;
      console.log = value => stdout.push(value);
      console.error = (...values) => stderr.push(values.join(" "));
      await import(`../scripts/enviar-alertas.js?auth=${status}`);
      assert.equal(process.exitCode, 1);
    } finally {
      process.argv = previous.argv;
      process.exitCode = previous.exitCode;
      console.log = previous.log;
      console.error = previous.error;
    }
    assert.equal(JSON.parse(stdout.join("\n")).falhas, 1);
    assert.match(stderr.join("\n"), new RegExp(`HTTP ${status}`));
    assert.equal(calls, 2);
    assert.equal(readFileSync(path.join(dir, "alert_queue.checkpoint"), "utf8"), "0");
    assert.deepEqual(JSON.parse(readFileSync(path.join(dir, "alert_queue.states.json"), "utf8")), { previous: "enviado" });

    let sent = 0;
    setFetchImpl(async () => {
      sent++;
      return new Response("{}", { status: 200 });
    });
    assert.equal((await processarFila()).enviados, 1);
    assert.equal((await processarFila()).enviados, 0);
    assert.equal(sent, 1);
    assert.equal(readFileSync(path.join(dir, "alert_queue.checkpoint"), "utf8"), "1");
  });
}

for (const status of [400, 422]) {
  test(`HTTP ${status} recipient rejection is consumed and never retried`, async t => {
    const dir = setup(t, "2099-09-15");
    process.env.AONDE_EMAIL_PROVIDER = "resend";
    let calls = 0;
    setFetchImpl(async () => {
      calls++;
      return new Response('{"message":"recipient rejected"}', { status });
    });
    const result = await processarFila();
    assert.equal(result.pulados, 1);
    assert.equal(result.falhas, 0);
    assert.equal(result.pendentesRestantes, 0);
    assert.equal(readFileSync(path.join(dir, "alert_queue.checkpoint"), "utf8"), "1");
    assert.equal(JSON.parse(readFileSync(path.join(dir, "alert_queue.states.json"), "utf8")).queued, "falha");
    setFetchImpl(async () => {
      calls++;
      return new Response("{}", { status: 200 });
    });
    assert.equal((await processarFila()).enviados, 0);
    assert.equal(calls, 1);
  });
}
