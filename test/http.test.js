import test from "node:test";
import assert from "node:assert/strict";

import { httpRequest, setFetchImpl, resetFetchImpl } from "../src/http.js";

test("httpRequest retorna ok:true com data parseado em resposta JSON 2xx", async (t) => {
  setFetchImpl(async () => new Response(JSON.stringify({ hello: "world" }), { status: 200 }));
  t.after(() => resetFetchImpl());

  const result = await httpRequest("https://example.com/api");
  assert.equal(result.ok, true);
  assert.deepEqual(result.data, { hello: "world" });
});

test("httpRequest retorna ok:false em status HTTP nao-2xx", async (t) => {
  setFetchImpl(async () => new Response(JSON.stringify({ message: "erro" }), { status: 500 }));
  t.after(() => resetFetchImpl());

  const result = await httpRequest("https://example.com/api");
  assert.equal(result.ok, false);
  assert.match(result.error, /500/);
});

test("httpRequest retorna ok:false em JSON invalido sem lancar excecao", async (t) => {
  setFetchImpl(async () => new Response("nao e json", { status: 200 }));
  t.after(() => resetFetchImpl());

  const result = await httpRequest("https://example.com/api");
  assert.equal(result.ok, false);
  assert.match(result.error, /JSON/);
});

test("httpRequest captura excecao de rede e retorna ok:false", async (t) => {
  setFetchImpl(async () => {
    throw new Error("ECONNREFUSED");
  });
  t.after(() => resetFetchImpl());

  const result = await httpRequest("https://example.com/api");
  assert.equal(result.ok, false);
  assert.match(result.error, /ECONNREFUSED/);
});

test("httpRequest aplica timeout e retorna ok:false ao abortar", async (t) => {
  setFetchImpl(
    (url, { signal }) =>
      new Promise((resolve, reject) => {
        signal.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      })
  );
  t.after(() => resetFetchImpl());

  const result = await httpRequest("https://example.com/api", { timeoutMs: 20 });
  assert.equal(result.ok, false);
  assert.match(result.error, /Tempo limite/);
});
