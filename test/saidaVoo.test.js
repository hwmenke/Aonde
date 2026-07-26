// Testes de GET /saida/voo?origem=&destino= — a interstitial de saida para
// BUSCA DE VOO por rota (o botao "Selecionar" da lista de voos aponta pra
// ca, em vez de ir direto para o Aviasales). Ver contexto completo em
// src/render/exitFlight.js e src/server.js (handleExitFlightHtml).

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { existsSync } from "node:fs";

import { createServer } from "../src/server.js";

// Sobe o servidor numa porta livre (listen 0), roda `fn(baseUrl)` e encerra.
// Mesmo padrao usado em test/server.test.js.
async function withServer(t) {
  const original = process.env.AONDE_DATA_DIR;
  const dir = await mkdtemp(path.join(os.tmpdir(), "aonde-saida-voo-"));
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

test("GET /saida/voo com origem/destino validos: 200, HTML valido e avisos essenciais", async (t) => {
  const { baseUrl } = await withServer(t);

  const res = await fetch(`${baseUrl}/saida/voo?origem=gru&destino=rec`, {
    headers: { "User-Agent": "ua-teste/1.0" },
  });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") || "", /text\/html/);

  const html = await res.text();
  assert.ok(html.trimStart().toLowerCase().startsWith("<!doctype html>"), "documento HTML completo");

  // Headers de seguranca iguais aos das outras paginas.
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.equal(res.headers.get("x-frame-options"), "SAMEORIGIN");
  assert.ok(res.headers.get("content-security-policy"));

  // Avisos essenciais em portugues claro (auditoria de usuarios).
  assert.match(html, /Você está indo para/, "diz que a pessoa esta saindo do Aonde");
  assert.match(html, /GRU/, "identifica a origem da rota");
  assert.match(html, /REC/, "identifica o destino da rota");
  assert.match(html, /não processa pagamento/, "deixa claro que o pagamento nao e com o Aonde");
  assert.match(html, /Preço e disponibilidade podem mudar/, "avisa que o preco pode mudar no parceiro");
  assert.match(html, /não vê nem guarda os dados do seu cartão/, "avisa que o Aonde nao guarda cartao");

  // Nenhum "undefined"/"null" solto vazando de template quebrado.
  assert.ok(!/\bundefined\b/.test(html), "sem 'undefined' solto no HTML");
  assert.ok(!/\bnull\b/.test(html), "sem 'null' solto no HTML");

  // O link para o parceiro (Aviasales) esta presente e usa https.
  assert.match(html, /https:\/\/www\.aviasales\.com\/search\/GRUREC/);
});

test("GET /saida/voo normaliza codigos IATA minusculos para maiusculos", async (t) => {
  const { baseUrl } = await withServer(t);

  const res = await fetch(`${baseUrl}/saida/voo?origem=gru&destino=rec`);
  const html = await res.text();
  assert.match(html, /GRUREC/, "URL do parceiro usa os codigos em maiusculo");
});

test("GET /saida/voo responde 400 quando origem/destino faltam ou sao invalidos", async (t) => {
  const { baseUrl } = await withServer(t);

  const casos = [
    "/saida/voo",
    "/saida/voo?origem=GRU",
    "/saida/voo?destino=REC",
    "/saida/voo?origem=GRU&destino=RECIFE",
    "/saida/voo?origem=G1U&destino=REC",
    "/saida/voo?origem=&destino=",
  ];
  for (const p of casos) {
    const res = await fetch(`${baseUrl}${p}`);
    assert.equal(res.status, 400, `${p} deveria responder 400`);
    const body = await res.json();
    assert.match(body.error, /IATA/i, `${p}: mensagem clara sobre codigo IATA`);
  }
});

test("GET /saida/voo registra o clique em data/clicks.jsonl com id de rota", async (t) => {
  const { baseUrl, dir } = await withServer(t);

  const res = await fetch(`${baseUrl}/saida/voo?origem=gru&destino=rec`, {
    headers: { "User-Agent": "ua-clique/9.0" },
  });
  assert.equal(res.status, 200);

  const clicksPath = path.join(dir, "clicks.jsonl");
  assert.ok(existsSync(clicksPath), "clique gravado por /saida/voo");
  const line = JSON.parse((await readFile(clicksPath, "utf-8")).trim());
  assert.equal(line.id, "voo:GRU-REC", "id do clique identifica busca por rota");
  assert.equal(line.userAgent, "ua-clique/9.0");
  assert.ok(line.timestamp);
});

test("GET /saida/voo nao conflita com GET /saida/:id (rota /saida/voo tem prioridade)", async (t) => {
  const { baseUrl } = await withServer(t);

  // "/saida/voo" sem query valida deve cair no validador de IATA (400), e
  // NUNCA ser tratado como se "voo" fosse um id de oferta do catalogo (404).
  const res = await fetch(`${baseUrl}/saida/voo`);
  assert.equal(res.status, 400);
});
