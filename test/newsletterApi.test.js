import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createServer } from "../src/server.js";
import { getSubscriberByEmail } from "../src/newsletter/subscriberStore.js";

// Sobe o servidor numa porta livre (listen 0) com AONDE_DATA_DIR temporario.
async function withServer(t) {
  const original = process.env.AONDE_DATA_DIR;
  const dir = await mkdtemp(path.join(os.tmpdir(), "aonde-nl-api-"));
  process.env.AONDE_DATA_DIR = dir;

  const server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    if (original === undefined) delete process.env.AONDE_DATA_DIR;
    else process.env.AONDE_DATA_DIR = original;
    await rm(dir, { recursive: true, force: true });
  });

  return { baseUrl, dir };
}

function postJson(baseUrl, route, body) {
  return fetch(`${baseUrl}${route}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("fluxo completo: subscribe -> confirm -> alerts", async (t) => {
  const { baseUrl } = await withServer(t);

  // subscribe: token NUNCA na resposta.
  const subRes = await postJson(baseUrl, "/api/newsletter/subscribe", {
    email: "flow@example.com",
    origem: "GRU",
  });
  assert.equal(subRes.status, 200);
  const subBody = await subRes.json();
  // Status generico de proposito (nao revela pending_optin vs already_confirmed).
  assert.equal(subBody.status, "ok");
  assert.equal(subBody.token, undefined);

  // Antes de confirmar, criar alerta e 409 (nao confirmado).
  const early = await postJson(baseUrl, "/api/alerts", { email: "flow@example.com", origem: "GRU" });
  assert.equal(early.status, 409);

  // Pega o token do store (em producao viria por e-mail).
  const token = getSubscriberByEmail("flow@example.com").optin_token;
  const confirmRes = await fetch(`${baseUrl}/api/newsletter/confirm?token=${token}`);
  assert.equal(confirmRes.status, 200);
  const confirmBody = await confirmRes.json();
  assert.equal(confirmBody.ok, true);
  assert.match(confirmBody.message, /confirmad/i);

  // Agora cria alerta com sucesso (201).
  const alertRes = await postJson(baseUrl, "/api/alerts", {
    email: "flow@example.com",
    origem: "GRU",
    destino: "LIS",
    precoAlvoCentavos: 300000,
  });
  assert.equal(alertRes.status, 201);
  const alertBody = await alertRes.json();
  assert.equal(alertBody.ok, true);
  assert.equal(alertBody.rule.origem, "GRU");
});

test("subscribe com e-mail invalido -> 400", async (t) => {
  const { baseUrl } = await withServer(t);
  const res = await postJson(baseUrl, "/api/newsletter/subscribe", { email: "sem-arroba", origem: "GRU" });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.ok(body.error);
});

test("confirm com token invalido -> 400", async (t) => {
  const { baseUrl } = await withServer(t);
  const res = await fetch(`${baseUrl}/api/newsletter/confirm?token=abc123`);
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.ok, false);
  assert.ok(body.error);
});

test("re-subscribe confirmado -> resposta HTTP generica (nao vaza already_confirmed)", async (t) => {
  const { baseUrl } = await withServer(t);
  const first = await postJson(baseUrl, "/api/newsletter/subscribe", { email: "again@example.com", origem: "GRU" });
  const firstBody = await first.json();
  const token = getSubscriberByEmail("again@example.com").optin_token;
  await fetch(`${baseUrl}/api/newsletter/confirm?token=${token}`);

  const again = await postJson(baseUrl, "/api/newsletter/subscribe", { email: "again@example.com", origem: "GIG" });
  const body = await again.json();
  // A resposta HTTP e identica (generica) tanto na primeira inscricao quanto
  // na re-inscricao de um e-mail ja confirmado: nao deve revelar qual dos
  // dois estados internos ocorreu (evita enumeracao de e-mails cadastrados).
  assert.deepEqual(body, firstBody);
  assert.equal(body.status, "ok");

  // Internamente, porem, o comportamento CONTINUA diferenciado: como o
  // e-mail ja estava confirmado, o subscriber nao deveria ter ganhado um
  // novo token de opt-in pendente (nao reenvia opt-in para quem ja confirmou).
  const subscriber = getSubscriberByEmail("again@example.com");
  assert.equal(subscriber.double_optin_confirmed, true);
  assert.equal(subscriber.optin_token, null);
});

test("unsubscribe e idempotente e nao vaza existencia", async (t) => {
  const { baseUrl } = await withServer(t);

  // E-mail que nunca existiu: mesma resposta 200.
  const r1 = await postJson(baseUrl, "/api/newsletter/unsubscribe", { email: "ghost@example.com" });
  assert.equal(r1.status, 200);
  const b1 = await r1.json();

  // E-mail que existia.
  await postJson(baseUrl, "/api/newsletter/subscribe", { email: "real@example.com", origem: "GRU" });
  const r2 = await postJson(baseUrl, "/api/newsletter/unsubscribe", { email: "real@example.com" });
  const b2 = await r2.json();

  // Respostas indistinguiveis (nao revela se o e-mail existia).
  assert.deepEqual(b1, b2);

  // Chamar de novo: idempotente.
  const r3 = await postJson(baseUrl, "/api/newsletter/unsubscribe", { email: "real@example.com" });
  assert.equal(r3.status, 200);
});

test("unsubscribe com e-mail invalido -> 400", async (t) => {
  const { baseUrl } = await withServer(t);
  const res = await postJson(baseUrl, "/api/newsletter/unsubscribe", { email: "invalido" });
  assert.equal(res.status, 400);
});

test("POST /api/alerts para assinante inexistente -> 404", async (t) => {
  const { baseUrl } = await withServer(t);
  const res = await postJson(baseUrl, "/api/alerts", { email: "ninguem@example.com", origem: "GRU" });
  assert.equal(res.status, 404);
});

test("metodo errado nas rotas de newsletter -> 405", async (t) => {
  const { baseUrl } = await withServer(t);
  const res = await fetch(`${baseUrl}/api/newsletter/subscribe`); // GET
  assert.equal(res.status, 405);
});

test("body JSON invalido -> 400", async (t) => {
  const { baseUrl } = await withServer(t);
  const res = await fetch(`${baseUrl}/api/newsletter/subscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{ nao e json",
  });
  assert.equal(res.status, 400);
});
