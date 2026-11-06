import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, utimesSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { setFetchImpl, resetFetchImpl } from "../src/http.js";
import { subscribe, confirm, hashEmail } from "../src/newsletter/subscriberStore.js";
import { addAlertRule } from "../src/newsletter/alertRules.js";
import { processarFila } from "../src/newsletter/worker.js";

const agora = new Date("2026-09-11T12:00:00Z");
function setup(t) {
  const dir = mkdtempSync(path.join(tmpdir(), "aonde-worker-lock-"));
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
  writeFileSync(path.join(dir, "offers.json"), JSON.stringify([
    { id: "offer", origem: "GRU", destino: "REC", preco_centavos: 60000, status: "publicada", ida: "2026-09-15" },
  ]));
  writeFileSync(path.join(dir, "alert_queue.jsonl"), JSON.stringify({
    id: "queued", offerId: "offer", subscriberEmailHash: hashEmail(sub.email),
  }) + "\n");
  return {
    lock: path.join(dir, "alert_queue.lock"),
    states: path.join(dir, "alert_queue.states.json"),
  };
}
function age(lock) {
  const old = new Date(Date.now() - 180000);
  utimesSync(lock, old, old);
}
const success = () => ({ ok: true, status: 200, headers: new Map(), text: async () => "{}", json: async () => ({}) });

test("aged lock with live PID blocks a second worker without sending", async t => {
  const { lock } = setup(t);
  writeFileSync(lock, String(process.pid));
  age(lock);
  let sends = 0;
  setFetchImpl(async () => { sends++; return success(); });
  const result = await processarFila({ agora });
  assert.equal(result.modo, "bloqueado");
  assert.equal(result.enviados, 0);
  assert.equal(sends, 0);
  assert.equal(readFileSync(lock, "utf8"), String(process.pid));
});

test("stealing an aged dead-owner lock clears all claims and retries once", async t => {
  const { lock, states } = setup(t);
  const child = spawnSync(process.execPath, ["-e", "" ]);
  assert.equal(child.status, 0);
  assert.throws(() => process.kill(child.pid, 0), { code: "ESRCH" });
  writeFileSync(lock, String(child.pid));
  age(lock);
  writeFileSync(states, JSON.stringify({ queued: "reivindicado", other: "reivindicado", sent: "enviado", discarded: "descartado" }));
  let sends = 0;
  setFetchImpl(async () => { sends++; return success(); });
  assert.equal((await processarFila({ agora })).enviados, 1);
  assert.deepEqual(JSON.parse(readFileSync(states)), { queued: "enviado", sent: "enviado", discarded: "descartado" });
  assert.equal((await processarFila({ agora })).enviados, 0);
  assert.equal(sends, 1);
  assert.equal(existsSync(lock), false);
});

test("an aged lock stays exclusive during a slow send", async t => {
  const { lock, states } = setup(t);
  let release;
  let entered;
  const started = new Promise(resolve => { entered = resolve; });
  const pending = new Promise(resolve => { release = resolve; });
  let sends = 0;
  setFetchImpl(async () => { sends++; entered(); await pending; return success(); });
  const first = processarFila({ agora });
  try {
    await started;
    assert.equal(readFileSync(lock, "utf8"), String(process.pid));
    assert.equal(JSON.parse(readFileSync(states)).queued, "reivindicado");
    age(lock);
    const second = await processarFila({ agora });
    assert.equal(second.modo, "bloqueado");
    assert.equal(second.enviados, 0);
    assert.equal(sends, 1);
  } finally {
    release();
    assert.equal((await first).enviados, 1);
  }
  assert.equal((await processarFila({ agora })).enviados, 0);
  assert.equal(sends, 1);
});

test("claimed entries are skipped without dead-owner recovery", async t => {
  const { states } = setup(t);
  writeFileSync(states, JSON.stringify({ queued: "reivindicado" }));
  let sends = 0;
  setFetchImpl(async () => { sends++; return success(); });
  const result = await processarFila({ agora });
  assert.equal(result.pulados, 1);
  assert.equal(sends, 0);
  assert.equal(JSON.parse(readFileSync(states)).queued, "reivindicado");
});

test("cleanup preserves a replacement owner's lock", async t => {
  const { lock } = setup(t);
  setFetchImpl(async () => {
    writeFileSync(lock, "replacement-pid");
    return success();
  });
  assert.equal((await processarFila({ agora })).enviados, 1);
  assert.equal(readFileSync(lock, "utf8"), "replacement-pid");
});

for (const [owner, aged, blocked] of [["", true, false], ["", false, true]]) {
  test(`missing PID ${aged ? "aged lock recovers" : "fresh lock blocks"}`, async t => {
    const { lock, states } = setup(t);
    writeFileSync(lock, owner);
    if (aged) age(lock);
    writeFileSync(states, JSON.stringify({ queued: "reivindicado" }));
    let sends = 0;
    setFetchImpl(async () => { sends++; return success(); });
    const result = await processarFila({ agora });
    assert.equal(result.modo === "bloqueado", blocked);
    assert.equal(sends, blocked ? 0 : 1);
  });
}
