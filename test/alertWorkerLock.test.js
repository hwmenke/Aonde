import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, utimesSync, existsSync, watch, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync, spawn } from "node:child_process";
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
    dir,
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
    assert.equal(JSON.parse(readFileSync(lock, "utf8")).pid, process.pid);
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

// Watch before checking: every advance is driven by a filesystem handshake.
function waitForFile(file) {
  const files = Array.isArray(file) ? file : [file];
  return new Promise((resolve, reject) => {
    const watcher = watch(path.dirname(files[0]), check);
    const timeout = setTimeout(() => { watcher.close(); reject(new Error(`Timeout: ${file}`)); }, 10000);
    function check() {
      if (!files.some(existsSync)) return;
      clearTimeout(timeout);
      watcher.close();
      resolve();
    }
    check();
  });
}

test("two stale-lock contenders send the queued item only once", async t => {
  const { dir, lock } = setup(t);
  const today = new Date();
  const departure = new Date(today.getTime() + 4 * 86400000).toISOString().slice(0, 10);
  writeFileSync(path.join(dir, "offers.json"), JSON.stringify([
    { id: "offer", origem: "GRU", destino: "REC", preco_centavos: 60000, status: "publicada", ida: departure },
  ]));
  writeFileSync(path.join(dir, "alert_queue.checkpoint"), "0");
  const deadEnv = { ...process.env };
  delete deadEnv.NODE_TEST_CONTEXT;
  const dead = spawnSync(process.execPath, ["-e", ""], { env: deadEnv });
  assert.throws(() => process.kill(dead.pid, 0), { code: "ESRCH" });
  writeFileSync(lock, String(dead.pid));
  age(lock);
  const workerUrl = new URL("../src/newsletter/worker.js", import.meta.url).href;
  const httpUrl = new URL("../src/http.js", import.meta.url).href;
  const children = [];
  function start(name) {
    const base = path.join(dir, name);
    const childEnv = { ...process.env, AONDE_TEST_LOCK_BARRIER: base };
    delete childEnv.NODE_TEST_CONTEXT;
    const child = spawn(process.execPath, ["--input-type=module", "-e", `
      import { appendFileSync, writeFileSync, existsSync } from 'node:fs';
      import { setFetchImpl } from ${JSON.stringify(httpUrl)};
      import { processarFila } from ${JSON.stringify(workerUrl)};
      const base = process.env.AONDE_TEST_LOCK_BARRIER;
      setFetchImpl(async (url, options) => {
        appendFileSync(${JSON.stringify(path.join(dir, 'requests'))}, JSON.stringify({url, body: options.body}) + '\\n');
        writeFileSync(base + '.request', '');
        const deadline = Date.now() + 15000;
        while (!existsSync(${JSON.stringify(path.join(dir, 'provider.go'))})) {
          if (Date.now() > deadline) throw new Error('Provider barrier timeout');
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
        }
        return {ok:true, status:200, headers:new Map(), text:async()=> '{}'};
      });
      const result = await processarFila({agora: new Date(${JSON.stringify(today.toISOString())})});
      writeFileSync(base + '.result', JSON.stringify(result));
    `], { env: childEnv, stdio: ["ignore", "pipe", "pipe"] });
    let errors = "";
    child.stderr.on("data", data => { errors += data; });
    const done = new Promise((resolve, reject) => {
      child.on("error", reject);
      child.on("close", code => code === 0 ? resolve() : reject(new Error(errors || `Child exit ${code}`)));
    });
    done.catch(() => {});
    children.push(child);
    return { base, done };
  }
  t.after(() => { for (const child of children) child.kill(); });
  const a = start("A"), b = start("B");
  await Promise.all([waitForFile(a.base + ".ready"), waitForFile(b.base + ".ready")]);
  writeFileSync(a.base + ".go", "");
  await waitForFile(a.base + ".request");
  writeFileSync(b.base + ".go", "");
  await waitForFile([b.base + ".request", b.base + ".result"]);
  const requests = readFileSync(path.join(dir, "requests"), "utf8").trim().split("\n").map(JSON.parse);
  // Both requests in the broken implementation contain this same offer URL.
  for (const request of requests) assert.match(JSON.parse(request.body).html, /ofertas\/offer/);
  writeFileSync(path.join(dir, "provider.go"), "");
  await Promise.all([a.done, b.done]);
  assert.equal(requests.length, 1);
});


test("obsolete token cannot release a replacement lock with the same PID", async t => {
  const { lock } = setup(t);
  let replacement;
  setFetchImpl(async () => {
    const original = JSON.parse(readFileSync(lock, "utf8"));
    assert.equal(typeof original.acquiredAt, "string");
    replacement = { ...original, token: "replacement-token" };
    writeFileSync(lock, JSON.stringify(replacement));
    return success();
  });
  assert.equal((await processarFila({ agora })).enviados, 1);
  assert.deepEqual(JSON.parse(readFileSync(lock, "utf8")), replacement);
});

test("held gate blocks acquisition and is never reclaimed", async t => {
  const { lock } = setup(t);
  const gate = `${lock}.gate`;
  mkdirSync(gate);
  age(gate);
  let sends = 0;
  setFetchImpl(async () => { sends++; return success(); });
  assert.equal((await processarFila({ agora })).modo, "bloqueado");
  assert.equal(sends, 0);
  assert.equal(existsSync(lock), false);
  assert.equal(existsSync(gate), true);
});

function startReleaseWorker(t, dir, extraEnv = {}) {
  const base = path.join(dir, 'release');
  const childEnv = { ...process.env, AONDE_TEST_LOCK_RELEASE_BARRIER: base, ...extraEnv };
  delete childEnv.NODE_TEST_CONTEXT;
  const child = spawn(process.execPath, ['--input-type=module', '-e', `
    import { writeFileSync, existsSync } from 'node:fs';
    import { setFetchImpl } from ${JSON.stringify(new URL('../src/http.js', import.meta.url).href)};
    import { processarFila } from ${JSON.stringify(new URL('../src/newsletter/worker.js', import.meta.url).href)};
    const base = process.env.AONDE_TEST_LOCK_RELEASE_BARRIER;
    let sends = 0;
    const loggedErrors = [];
    const originalError = console.error;
    console.error = (...args) => { loggedErrors.push(args.join(' ')); originalError(...args); };
    setFetchImpl(async () => {
      sends++;
      writeFileSync(base + '.sending', '');
      const deadline = Date.now() + 15000;
      while (!existsSync(base + '.go')) {
        if (Date.now() > deadline) throw new Error('Provider handshake timeout');
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
      }
      return {ok:true, status:200, headers:new Map(), text:async()=> '{}'};
    });
    const result = await processarFila({agora: new Date(${JSON.stringify(agora.toISOString())})});
    writeFileSync(base + '.result', JSON.stringify({result, sends, loggedErrors}));
  `], {env: childEnv, stdio: ['ignore', 'pipe', 'pipe']});
  let errors = '';
  child.stderr.on('data', data => { errors += data; });
  const done = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve() : reject(new Error(errors || `Child exit ${code}`)));
  });
  done.catch(() => {});
  t.after(() => child.kill());
  return {base, done, errors: () => errors};
}

test('release contention is reported without losing send results or removing ownership', async t => {
  const {dir, lock} = setup(t);
  const child = startReleaseWorker(t, dir, {AONDE_TEST_LOCK_RELEASE_TIMEOUT_MS: '50'});
  await waitForFile(child.base + '.sending');
  const owner = readFileSync(lock, 'utf8');
  mkdirSync(lock + '.gate');
  writeFileSync(child.base + '.go', '');
  await child.done;
  const {result, sends} = JSON.parse(readFileSync(child.base + '.result'));
  assert.equal(result.lockLiberado, false);
  assert.equal(result.enviados, 1);
  assert.equal(sends, 1);
  assert.equal(readFileSync(lock, 'utf8'), owner);
  assert.equal(existsSync(lock + '.gate'), true);
  assert.match(JSON.parse(readFileSync(child.base + '.result')).loggedErrors.join(' '), /alert_queue\.lock.*recupera/i);
});


test('release retries a held gate and removes its own lock after parent yields', async t => {
  const {dir, lock} = setup(t);
  const child = startReleaseWorker(t, dir);
  await waitForFile(child.base + '.sending');
  mkdirSync(lock + '.gate');
  writeFileSync(child.base + '.go', '');
  await waitForFile(child.base + '.retrying');
  rmSync(lock + '.gate', {recursive: true});
  await child.done;
  const {result, sends} = JSON.parse(readFileSync(child.base + '.result'));
  assert.equal(result.enviados, 1);
  assert.equal(sends, 1);
  assert.notEqual(result.lockLiberado, false);
  assert.equal(existsSync(lock), false);
  assert.equal(existsSync(lock + '.gate'), false);
  assert.equal(child.errors(), '');
});

test('non-contention gate failure blocks acquisition distinctly without sending', async t => {
  const {dir, lock} = setup(t);
  const child = startReleaseWorker(t, dir, {AONDE_TEST_LOCK_MKDIR_ERROR: 'EACCES'});
  await child.done;
  const {result, sends} = JSON.parse(readFileSync(child.base + '.result'));
  assert.equal(result.modo, 'bloqueado');
  assert.equal(result.motivo, 'erro-lock');
  assert.equal(sends, 0);
  assert.equal(existsSync(lock), false);
  assert.equal(existsSync(lock + '.gate'), false);
  assert.match(JSON.parse(readFileSync(child.base + '.result')).loggedErrors.join(' '), /EACCES/);
});
