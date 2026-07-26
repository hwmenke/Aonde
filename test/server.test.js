import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { existsSync } from "node:fs";

import { createServer } from "../src/server.js";
import { upsert } from "../src/store/offersStore.js";
import { listAlertRules } from "../src/newsletter/alertRules.js";

// Sobe o servidor numa porta livre (listen 0), roda `fn(baseUrl)` e encerra.
async function withServer(t, fn) {
  const original = process.env.AONDE_DATA_DIR;
  const dir = await mkdtemp(path.join(os.tmpdir(), "aonde-server-"));
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

function seedOffer(overrides = {}) {
  return upsert({
    id: "gru-lis",
    origem: "GRU",
    destino: "LIS",
    preco_centavos: 320000,
    affiliate_url: "https://tp.media/r?marker=555&u=aviasales",
    status: "publicada",
    ...overrides,
  });
}

test("GET /api/health responde config + contagens", async (t) => {
  const { baseUrl } = await withServer(t);
  seedOffer();

  const res = await fetch(`${baseUrl}/api/health`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.ok(body.config);
  assert.ok(Array.isArray(body.config.ready));
  assert.equal(body.storedOffers, 1);
  assert.equal(typeof body.storedRoutes, "number");
});

test("GET /api/offers público lista SÓ publicadas (rascunho não vaza)", async (t) => {
  const { baseUrl } = await withServer(t);
  seedOffer({ id: "gru-lis", status: "rascunho" });
  seedOffer({ id: "gig-eze", status: "publicada" });

  const pub = await (await fetch(`${baseUrl}/api/offers`)).json();
  assert.equal(pub.count, 1);
  assert.equal(pub.offers[0].id, "gig-eze");

  // rascunho também não é acessível por id sem admin
  assert.equal((await fetch(`${baseUrl}/api/offers/gru-lis`)).status, 404);
});

test("GET /api/offers com admin token lista todas e filtra por status", async (t) => {
  const prev = process.env.AONDE_ADMIN_TOKEN;
  process.env.AONDE_ADMIN_TOKEN = "seg-123";
  t.after(() => {
    if (prev === undefined) delete process.env.AONDE_ADMIN_TOKEN;
    else process.env.AONDE_ADMIN_TOKEN = prev;
  });
  const { baseUrl } = await withServer(t);
  seedOffer({ id: "gru-lis", status: "rascunho" });
  seedOffer({ id: "gig-eze", status: "publicada" });
  const headers = { "x-admin-token": "seg-123" };

  const all = await (await fetch(`${baseUrl}/api/offers`, { headers })).json();
  assert.equal(all.count, 2);

  const draft = await (await fetch(`${baseUrl}/api/offers?status=rascunho`, { headers })).json();
  assert.equal(draft.count, 1);
  assert.equal(draft.offers[0].id, "gru-lis");
});

test("GET /api/offers/:id retorna a oferta ou 404 JSON", async (t) => {
  const { baseUrl } = await withServer(t);
  seedOffer();

  const ok = await fetch(`${baseUrl}/api/offers/gru-lis`);
  assert.equal(ok.status, 200);
  const okBody = await ok.json();
  assert.equal(okBody.offer.id, "gru-lis");

  const notFound = await fetch(`${baseUrl}/api/offers/nao-existe`);
  assert.equal(notFound.status, 404);
  const nfBody = await notFound.json();
  assert.match(nfBody.error, /nao encontrada/i);
});

test("POST /api/offers/:id/click registra o clique e devolve redirect", async (t) => {
  const { baseUrl, dir } = await withServer(t);
  seedOffer();

  const res = await fetch(`${baseUrl}/api/offers/gru-lis/click`, {
    method: "POST",
    headers: { "User-Agent": "test-agent/1.0" },
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.redirect, "https://tp.media/r?marker=555&u=aviasales");

  // O clique foi registrado em data/clicks.jsonl.
  const clicksPath = path.join(dir, "clicks.jsonl");
  assert.ok(existsSync(clicksPath));
  const content = await readFile(clicksPath, "utf-8");
  const line = JSON.parse(content.trim());
  assert.equal(line.id, "gru-lis");
  assert.equal(line.userAgent, "test-agent/1.0");
  assert.ok(line.timestamp);
});

test("POST /api/offers/:id/click responde 404 quando a oferta nao existe", async (t) => {
  const { baseUrl } = await withServer(t);

  const res = await fetch(`${baseUrl}/api/offers/inexistente/click`, { method: "POST" });
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.match(body.error, /nao encontrada/i);
});

test("POST /api/offers/:id/click responde 409 quando a oferta nao tem affiliate_url", async (t) => {
  const { baseUrl } = await withServer(t);
  seedOffer({ id: "sem-link", affiliate_url: null });

  const res = await fetch(`${baseUrl}/api/offers/sem-link/click`, { method: "POST" });
  assert.equal(res.status, 409);
  const body = await res.json();
  assert.match(body.error, /affiliate_url/);
});

test("GET /saida/:id registra o clique e serve a pagina de saida", async (t) => {
  const { baseUrl, dir } = await withServer(t);
  seedOffer({ id: "gru-lis", status: "publicada" });

  const res = await fetch(`${baseUrl}/saida/gru-lis`, { headers: { "User-Agent": "ua/2.0" } });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") || "", /text\/html/);
  const html = await res.text();
  assert.match(html, /Você está indo para/);
  assert.ok(html.includes("https://tp.media/r?marker=555&amp;u=aviasales"), "link do parceiro presente");

  const clicksPath = path.join(dir, "clicks.jsonl");
  assert.ok(existsSync(clicksPath), "clique gravado por /saida");
  const line = JSON.parse((await readFile(clicksPath, "utf-8")).trim());
  assert.equal(line.id, "gru-lis");
});

test("GET /saida/:id responde 404 (inexistente) e 409 (sem affiliate_url)", async (t) => {
  const { baseUrl } = await withServer(t);
  seedOffer({ id: "sem-link", affiliate_url: null, status: "publicada" });

  assert.equal((await fetch(`${baseUrl}/saida/nao-existe`)).status, 404);
  assert.equal((await fetch(`${baseUrl}/saida/sem-link`)).status, 409);
});

test("GET /ajuda, /cancelamentos e /alertas servem HTML", async (t) => {
  const { baseUrl } = await withServer(t);
  for (const p of ["/ajuda", "/cancelamentos", "/alertas"]) {
    const res = await fetch(`${baseUrl}${p}`);
    assert.equal(res.status, 200, `${p} deve responder 200`);
    assert.match(res.headers.get("content-type") || "", /text\/html/, `${p} deve ser HTML`);
    assert.ok((await res.text()).trimStart().toLowerCase().startsWith("<!doctype html>"));
  }
});

test("GET /api/newsletter/confirm devolve HTML quando o navegador aceita text/html", async (t) => {
  const { baseUrl, dir } = await withServer(t);
  await fetch(`${baseUrl}/api/newsletter/subscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "html@ex.com", origem: "GRU" }),
  });
  const subs = JSON.parse(await readFile(path.join(dir, "subscribers.json"), "utf-8"));
  const token = subs.find((s) => s.email === "html@ex.com").optin_token;

  const res = await fetch(`${baseUrl}/api/newsletter/confirm?token=${token}`, {
    headers: { Accept: "text/html" },
  });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") || "", /text\/html/);
  assert.match(await res.text(), /Inscrição confirmada/);
});

test("alerta de rota/preço é criado automaticamente após o double opt-in", async (t) => {
  const { baseUrl, dir } = await withServer(t);
  // inscricao COM contexto de rota/preco (o que os forms de captura agora enviam)
  const sub = await fetch(`${baseUrl}/api/newsletter/subscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "rota@ex.com", origem: "GRU", destino: "REC", precoAlvoCentavos: 60000 }),
  });
  // Resposta HTTP generica de proposito (nao revela o estado interno).
  assert.equal((await sub.json()).status, "ok");

  const subs = JSON.parse(await readFile(path.join(dir, "subscribers.json"), "utf-8"));
  const stored = subs.find((s) => s.email === "rota@ex.com");
  assert.ok(stored.pending_alert, "pending_alert guardado antes da confirmacao");

  // antes de confirmar: nenhuma regra
  assert.equal(listAlertRules({ subscriberId: stored.id }).length, 0);

  // confirma o double opt-in -> a AlertRule real deve nascer
  const conf = await fetch(`${baseUrl}/api/newsletter/confirm?token=${stored.optin_token}`);
  assert.equal(conf.status, 200);

  const rules = listAlertRules({ subscriberId: stored.id });
  assert.equal(rules.length, 1, "uma AlertRule criada apos o opt-in");
  assert.equal(rules[0].destino, "REC");
  assert.equal(rules[0].preco_alvo_centavos, 60000);
});

test("rota desconhecida responde 404 JSON", async (t) => {
  const { baseUrl } = await withServer(t);
  const res = await fetch(`${baseUrl}/api/qualquer-coisa`);
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.match(body.error, /nao encontrada/i);
});

test("CORS: header presente apenas quando AONDE_CORS_ORIGIN esta definido", async (t) => {
  const originalCors = process.env.AONDE_CORS_ORIGIN;
  t.after(() => {
    if (originalCors === undefined) delete process.env.AONDE_CORS_ORIGIN;
    else process.env.AONDE_CORS_ORIGIN = originalCors;
  });

  const { baseUrl } = await withServer(t);
  seedOffer();

  // Sem env: nenhum header CORS.
  delete process.env.AONDE_CORS_ORIGIN;
  let res = await fetch(`${baseUrl}/api/offers`);
  assert.equal(res.headers.get("access-control-allow-origin"), null);

  // Com env: header liberando a origem configurada.
  process.env.AONDE_CORS_ORIGIN = "https://aonde.com.br";
  res = await fetch(`${baseUrl}/api/offers`);
  assert.equal(res.headers.get("access-control-allow-origin"), "https://aonde.com.br");
});
