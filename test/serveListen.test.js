import test from "node:test";
import assert from "node:assert/strict";
import { createServer as createNetServer } from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const serveJs = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "scripts", "serve.js");

function freePort() {
  return new Promise((resolve, reject) => {
    const tmp = createNetServer();
    tmp.listen(0, "127.0.0.1", () => {
      const { port } = tmp.address();
      tmp.close((err) => (err ? reject(err) : resolve(port)));
    });
    tmp.on("error", reject);
  });
}

function startServe(env) {
  const child = spawn(process.execPath, [serveJs], {
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = { stdout: "", stderr: "" };
  child.stdout.on("data", (chunk) => {
    output.stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    output.stderr += chunk.toString();
  });
  return { child, output };
}

function waitForListen(output, timeoutMs = 8000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (/no ar em http:\/\/0\.0\.0\.0:\d+/.test(output.stdout)) {
        resolve();
        return;
      }
      if (Date.now() - started > timeoutMs) {
        reject(new Error(`serve.js nao subiu:\n${output.stdout}\n${output.stderr}`));
        return;
      }
      setTimeout(tick, 50);
    };
    tick();
  });
}

async function withServe(t, env, fn) {
  const { child, output } = startServe(env);
  t.after(() => {
    if (!child.killed) child.kill("SIGTERM");
  });
  await waitForListen(output);
  await fn({ output, child });
}

test("serve.js honra PORT e escuta em 0.0.0.0", async (t) => {
  const port = await freePort();
  await withServe(t, { PORT: String(port), AONDE_PORT: "1" }, async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
  });
});

test("serve.js cai em AONDE_PORT quando PORT esta ausente", async (t) => {
  const port = await freePort();
  await withServe(t, { AONDE_PORT: String(port), PORT: "" }, async ({ output }) => {
    assert.match(output.stdout, new RegExp(`0\\.0\\.0\\.0:${port}`));
    const res = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.equal(res.status, 200);
  });
});
