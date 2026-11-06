import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseUnsubscribeEmail, isOneClickBody, decideUnsubscribeResponse, processUnsubscribe } from "../src/newsletter/unsubscribeRequest.js";
import { subscribe, confirm, listSubscribers } from "../src/newsletter/subscriberStore.js";

test("email comes from body first, otherwise query, trimmed", () => {
  assert.equal(parseUnsubscribeEmail({ body: { email: " body@example.com " }, queryEmail: "query@example.com" }), "body@example.com");
  for (const body of [null, {}, { email: " " }, { email: [] }]) {
    assert.equal(parseUnsubscribeEmail({ body, queryEmail: " query@example.com " }), "query@example.com");
  }
  assert.equal(parseUnsubscribeEmail(), "");
});

test("one-click marker tolerates casing and whitespace only", () => {
  assert.equal(isOneClickBody({ " LIST-Unsubscribe ": " one-CLICK " }), true);
  for (const body of [null, {}, { "List-Unsubscribe": true }, { "List-Unsubscribe": "other" }]) assert.equal(isOneClickBody(body), false);
});

test("normal responses retain messages; invalid one-click remains 400", () => {
  assert.deepEqual(decideUnsubscribeResponse({ result: { ok: true } }), {
    status: 200, kind: "json", payload: { ok: true, message: "Se o e-mail estava inscrito, foi descadastrado." },
  });
  assert.deepEqual(decideUnsubscribeResponse({ result: { ok: true }, veioDeForm: true }).payload, { ok: true, descadastrado: true });
  for (const veioDeForm of [false, true]) {
    const r = processUnsubscribe({ email: "invalid", oneClick: true, veioDeForm });
    assert.equal(r.status, 400);
    assert.equal(r.kind, "empty");
  }
  assert.equal(decideUnsubscribeResponse({ result: { ok: false, error: "bad" } }).kind, "json");
});

test("server helper handles URL email one-click, purges PII and is idempotent", (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "aonde-unsubscribe-"));
  const previous = process.env.AONDE_DATA_DIR;
  process.env.AONDE_DATA_DIR = dir;
  t.after(() => {
    if (previous === undefined) delete process.env.AONDE_DATA_DIR;
    else process.env.AONDE_DATA_DIR = previous;
    rmSync(dir, { recursive: true, force: true });
  });
  confirm(subscribe({ email: "reader@example.com", origem: "GRU" }).token);
  const body = Object.fromEntries(new URLSearchParams("List-Unsubscribe=One-Click"));
  const input = { email: parseUnsubscribeEmail({ body, queryEmail: " reader@example.com " }), oneClick: isOneClickBody(body), veioDeForm: true };
  for (let i = 0; i < 2; i++) assert.deepEqual(processUnsubscribe(input), { status: 200, kind: "empty", payload: "" });
  assert.equal(listSubscribers()[0].email, "");
  assert.ok(listSubscribers()[0].unsubscribed_at);
});

test("server request handler accepts one-click with or without Content-Type; GET is read-only", async t => {
  const { Readable } = await import("node:stream");
  const { createServer } = await import("../src/server.js");
  const dir = mkdtempSync(path.join(tmpdir(), "aonde-unsubscribe-route-"));
  const previous = process.env.AONDE_DATA_DIR;
  process.env.AONDE_DATA_DIR = dir;
  t.after(() => {
    if (previous === undefined) delete process.env.AONDE_DATA_DIR;
    else process.env.AONDE_DATA_DIR = previous;
    rmSync(dir, { recursive: true, force: true });
  });
  const server = createServer();
  t.after(() => server.close());
  const handler = server.listeners("request")[0];
  async function request({ method = "POST", headers = {}, body = "", email = "reader@example.com" } = {}) {
    const req = Readable.from([Buffer.from(body)]);
    Object.assign(req, { method, headers, url: `/api/newsletter/unsubscribe?email=${encodeURIComponent(email)}`, socket: { remoteAddress: "127.0.0.1" } });
    const res = {
      headers: {},
      setHeader(k, v) { this.headers[k] = v; },
      writeHead(status, headers) { this.status = status; Object.assign(this.headers, headers); },
      end(data) { this.body = data === undefined ? "" : String(data); },
    };
    await handler(req, res);
    return res;
  }
  confirm(subscribe({ email: "reader@example.com", origem: "GRU" }).token);
  assert.equal((await request({ method: "GET" })).status, 200);
  assert.equal(listSubscribers()[0].unsubscribed_at, null);
  for (const headers of [{ "content-type": "application/x-www-form-urlencoded" }, {}]) {
    const res = await request({ headers, body: "List-Unsubscribe=One-Click" });
    assert.equal(res.status, 200);
    assert.equal(res.body, "");
    assert.equal(res.headers["X-Content-Type-Options"], "nosniff");
    assert.ok(res.headers["Content-Security-Policy"]);
    assert.ok(listSubscribers()[0].unsubscribed_at);
  }
  assert.equal((await request({ body: "List-Unsubscribe=One-Click", email: "invalid" })).status, 400);
  const json = await request({ headers: { "content-type": "application/json" }, body: '{"email":"reader@example.com"}' });
  assert.equal(JSON.parse(json.body).ok, true);
  const form = await request({ headers: { "content-type": "application/x-www-form-urlencoded" }, body: "email=reader%40example.com" });
  assert.equal(form.status, 200);
  assert.match(form.headers["Content-Type"], /text\/html/);
});
