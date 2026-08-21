// Testes de seguranca inbound: rate limiting por IP nos endpoints POST
// publicos de escrita, nao-enumeracao de e-mail no subscribe, e rejeicao de
// esquemas nao seguros (ex.: "javascript:") no redirecionamento de afiliado.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createServer } from "../src/server.js";
import { getSubscriberByEmail } from "../src/newsletter/subscriberStore.js";
import { upsert } from "../src/store/offersStore.js";

// Sobe o servidor numa porta livre (listen 0), com AONDE_DATA_DIR temporario
// e, opcionalmente, overrides de env restauradas em t.after (mesmo padrao de
// test/server.test.js e test/newsletterApi.test.js).
async function withServer(t, envOverrides = {}) {
  const originalDataDir = process.env.AONDE_DATA_DIR;
  const dir = await mkdtemp(path.join(os.tmpdir(), "aonde-inbound-sec-"));
  process.env.AONDE_DATA_DIR = dir;

  const savedEnv = {};
  for (const [key, value] of Object.entries(envOverrides)) {
    savedEnv[key] = process.env[key];
    process.env[key] = value;
  }

  const server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    if (originalDataDir === undefined) delete process.env.AONDE_DATA_DIR;
    else process.env.AONDE_DATA_DIR = originalDataDir;
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(dir, { recursive: true, force: true });
  });

  return { baseUrl, dir };
}

function postJson(baseUrl, route, body, headers) {
  return fetch(`${baseUrl}${route}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(headers || {}) },
    body: JSON.stringify(body || {}),
  });
}

// ---- Rate limiting inbound ----

test("rate limit: estourar o limite responde 429 com JSON { error }", async (t) => {
  const { baseUrl } = await withServer(t, {
    AONDE_INBOUND_RATE_LIMIT_MAX: "3",
    AONDE_INBOUND_RATE_LIMIT_WINDOW_MS: "60000",
  });

  for (let i = 0; i < 3; i++) {
    const res = await postJson(baseUrl, "/api/newsletter/unsubscribe", { email: `dentro-${i}@example.com` });
    assert.notEqual(res.status, 429, `requisicao ${i} dentro do limite nao deveria ser bloqueada`);
  }

  const blocked = await postJson(baseUrl, "/api/newsletter/unsubscribe", { email: "estourou@example.com" });
  assert.equal(blocked.status, 429);
  assert.match(blocked.headers.get("content-type") || "", /application\/json/);
  const body = await blocked.json();
  assert.ok(body.error && typeof body.error === "string" && body.error.length > 0);
  // Retry-After orienta o cliente sobre quando tentar de novo.
  assert.ok(Number(blocked.headers.get("retry-after")) > 0);
});

test("rate limit: dentro do limite configurado, nenhuma requisicao e bloqueada", async (t) => {
  const { baseUrl } = await withServer(t, {
    AONDE_INBOUND_RATE_LIMIT_MAX: "5",
    AONDE_INBOUND_RATE_LIMIT_WINDOW_MS: "60000",
  });

  for (let i = 0; i < 5; i++) {
    const res = await postJson(baseUrl, "/api/alerts", { email: `ninguem-${i}@example.com`, origem: "GRU" });
    assert.notEqual(res.status, 429);
  }
});

test("rate limit: classes de rota diferentes tem contadores independentes", async (t) => {
  const { baseUrl } = await withServer(t, {
    AONDE_INBOUND_RATE_LIMIT_MAX: "1",
    AONDE_INBOUND_RATE_LIMIT_WINDOW_MS: "60000",
  });

  const unsub = await postJson(baseUrl, "/api/newsletter/unsubscribe", { email: "a@example.com" });
  assert.notEqual(unsub.status, 429);
  // unsubscribe ja esgotou a cota (max=1); a 2a chamada a MESMA rota bloqueia.
  const unsubAgain = await postJson(baseUrl, "/api/newsletter/unsubscribe", { email: "b@example.com" });
  assert.equal(unsubAgain.status, 429);

  // Mas /api/alerts e uma classe de rota diferente: nao deve estar limitada
  // so porque unsubscribe esgotou a sua.
  const alerts = await postJson(baseUrl, "/api/alerts", { email: "a@example.com", origem: "GRU" });
  assert.notEqual(alerts.status, 429);
});

test("rate limit: com AONDE_TRUST_PROXY, IPs diferentes (via x-forwarded-for) tem contadores independentes", async (t) => {
  // So vale ATRAS DE PROXY. Sem AONDE_TRUST_PROXY o cabecalho e ignorado — ver
  // o teste seguinte, que existe porque isso era explorável.
  const { baseUrl } = await withServer(t, {
    AONDE_INBOUND_RATE_LIMIT_MAX: "1",
    AONDE_INBOUND_RATE_LIMIT_WINDOW_MS: "60000",
    AONDE_TRUST_PROXY: "1",
  });

  const ip1a = await postJson(baseUrl, "/api/newsletter/unsubscribe", { email: "x@example.com" }, { "x-forwarded-for": "10.0.0.1" });
  assert.notEqual(ip1a.status, 429);
  const ip1b = await postJson(baseUrl, "/api/newsletter/unsubscribe", { email: "y@example.com" }, { "x-forwarded-for": "10.0.0.1" });
  assert.equal(ip1b.status, 429, "mesmo IP, segunda requisicao deve ser bloqueada (max=1)");

  const ip2 = await postJson(baseUrl, "/api/newsletter/unsubscribe", { email: "z@example.com" }, { "x-forwarded-for": "10.0.0.2" });
  assert.notEqual(ip2.status, 429, "IP diferente tem seu proprio contador");
});

test("rate limit: sem AONDE_TRUST_PROXY, x-forwarded-for forjado NAO cria contador novo", async (t) => {
  // ISSO ERA EXPLORAVEL DE VERDADE. Medido antes da correcao: 30 POSTs com um
  // IP forjado diferente em cada um -> 30 aceitos, 0 bloqueados. O cabecalho e
  // escrito pelo proprio cliente quando nao ha proxy na frente, entao confiar
  // nele sempre tornava o limite das rotas de escrita puramente decorativo.
  const { baseUrl } = await withServer(t, {
    AONDE_INBOUND_RATE_LIMIT_MAX: "2",
    AONDE_INBOUND_RATE_LIMIT_WINDOW_MS: "60000",
  });

  let bloqueados = 0;
  for (let i = 0; i < 8; i++) {
    const r = await postJson(
      baseUrl,
      "/api/newsletter/unsubscribe",
      { email: `f${i}@example.com` },
      { "x-forwarded-for": `203.0.113.${i}` }
    );
    if (r.status === 429) bloqueados++;
  }
  assert.ok(
    bloqueados > 0,
    "forjar x-forwarded-for nao pode render contador novo quando nao ha proxy confiavel"
  );
});

test("rate limit: GET de leitura nunca e limitado", async (t) => {
  const { baseUrl } = await withServer(t, {
    AONDE_INBOUND_RATE_LIMIT_MAX: "1",
    AONDE_INBOUND_RATE_LIMIT_WINDOW_MS: "60000",
  });

  for (let i = 0; i < 10; i++) {
    const res = await fetch(`${baseUrl}/api/offers`);
    assert.notEqual(res.status, 429);
  }
});

test("rate limit: AONDE_INBOUND_RATE_LIMIT_DISABLED=1 desliga o limitador", async (t) => {
  const { baseUrl } = await withServer(t, {
    AONDE_INBOUND_RATE_LIMIT_MAX: "1",
    AONDE_INBOUND_RATE_LIMIT_WINDOW_MS: "60000",
    AONDE_INBOUND_RATE_LIMIT_DISABLED: "1",
  });

  for (let i = 0; i < 5; i++) {
    const res = await postJson(baseUrl, "/api/newsletter/unsubscribe", { email: `livre-${i}@example.com` });
    assert.notEqual(res.status, 429);
  }
});

// ---- Nao-enumeracao de e-mail no subscribe ----

test("subscribe: resposta HTTP nao distingue e-mail novo de ja confirmado", async (t) => {
  const { baseUrl } = await withServer(t);
  const email = "enum@example.com";

  const first = await postJson(baseUrl, "/api/newsletter/subscribe", { email, origem: "GRU" });
  assert.equal(first.status, 200);
  const firstBody = await first.json();
  assert.notEqual(firstBody.status, "pending_optin");
  assert.notEqual(firstBody.status, "already_confirmed");
  assert.equal(firstBody.token, undefined);

  const token = getSubscriberByEmail(email).optin_token;
  await fetch(`${baseUrl}/api/newsletter/confirm?token=${token}`);

  const again = await postJson(baseUrl, "/api/newsletter/subscribe", { email, origem: "GIG" });
  assert.equal(again.status, 200);
  const againBody = await again.json();

  // Resposta identica em ambos os casos: nao ha como um chamador externo
  // distinguir "e-mail novo" de "e-mail ja cadastrado e confirmado".
  assert.deepEqual(againBody, firstBody);
});

// ---- Esquema de redirecionamento (afiliado) ----

test("POST /api/offers/:id/click rejeita affiliate_url com esquema inseguro", async (t) => {
  const { baseUrl } = await withServer(t);
  upsert({
    id: "esquema-js",
    origem: "GRU",
    destino: "LIS",
    preco_centavos: 100000,
    affiliate_url: "javascript:alert(1)",
    status: "publicada",
  });

  const res = await postJson(baseUrl, "/api/offers/esquema-js/click");
  assert.equal(res.status, 409);
  const body = await res.json();
  assert.ok(body.error);
});

test("POST /api/offers/:id/click aceita affiliate_url http/https normalmente", async (t) => {
  const { baseUrl } = await withServer(t);
  upsert({
    id: "esquema-ok",
    origem: "GRU",
    destino: "LIS",
    preco_centavos: 100000,
    affiliate_url: "https://tp.media/r?marker=1",
    status: "publicada",
  });

  const res = await postJson(baseUrl, "/api/offers/esquema-ok/click");
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.redirect, "https://tp.media/r?marker=1");
});

test("GET /saida/:id rejeita affiliate_url com esquema inseguro", async (t) => {
  const { baseUrl } = await withServer(t);
  upsert({
    id: "saida-esquema-js",
    origem: "GRU",
    destino: "LIS",
    preco_centavos: 100000,
    affiliate_url: "javascript:alert(1)",
    status: "publicada",
  });

  const res = await fetch(`${baseUrl}/saida/saida-esquema-js`);
  assert.equal(res.status, 409);
});
