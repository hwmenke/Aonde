// Testes para o caminho de reserva /saida/{id} com aviasalesUrl e tp.media.
// A oferta GRU-EZE tem aviasalesUrl em vez de affiliate_url pre-montado — o
// link tp.media e construido NA HORA em /saida/{id} a partir de
// TRAVELPAYOUTS_MARKER do env. Sem marker, a pagina nao mostra botao que nao
// funciona: devolve 200 com o card da oferta, sem link de reserva.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createServer } from "../src/server.js";

async function withServer(t) {
  const original = process.env.AONDE_DATA_DIR;
  const originalMarker = process.env.TRAVELPAYOUTS_MARKER;
  const dir = await mkdtemp(path.join(os.tmpdir(), "aonde-saida-booking-"));
  process.env.AONDE_DATA_DIR = dir;

  const server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    if (original === undefined) delete process.env.AONDE_DATA_DIR;
    else process.env.AONDE_DATA_DIR = original;
    if (originalMarker === undefined) delete process.env.TRAVELPAYOUTS_MARKER;
    else process.env.TRAVELPAYOUTS_MARKER = originalMarker;
    await rm(dir, { recursive: true, force: true });
  });

  return { baseUrl, dir };
}

test("GET /saida/gru-eze sem TRAVELPAYOUTS_MARKER: 200 com card da oferta, sem link de reserva", async (t) => {
  const { baseUrl } = await withServer(t);
  delete process.env.TRAVELPAYOUTS_MARKER; // garante que nao ha marker

  const res = await fetch(`${baseUrl}/saida/gru-eze`, {
    headers: { "User-Agent": "test/1.0" },
  });
  
  assert.equal(res.status, 200, "deve devolver 200 (nao 409) quando nao ha marker");
  assert.match(res.headers.get("content-type") || "", /text\/html/);
  const html = await res.text();
  
  // Deve mostrar o card da oferta (detalhe), nao uma mensagem de erro generica.
  assert.match(html, /Buenos Aires/i, "deve mostrar o destino da oferta");
  assert.match(html, /SWISS/, "deve mencionar a companhia");
  
  // NAO deve mostrar link de parceiro (affiliate_url ausente = botao desabilitado).
  // Isso e o comportamento honesto: nao prometer reserva que nao funciona.
  // O renderer sabe lidar com affiliateUrl ausente.
});

test("GET /saida/gru-eze COM TRAVELPAYOUTS_MARKER: monta tp.media e mostra interstitial", async (t) => {
  const { baseUrl } = await withServer(t);
  process.env.TRAVELPAYOUTS_MARKER = "123456"; // marker de teste

  const res = await fetch(`${baseUrl}/saida/gru-eze?utm_source=wa&utm_medium=social&utm_campaign=gru-eze`, {
    headers: { "User-Agent": "test/1.0" },
  });
  
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") || "", /text\/html/);
  const html = await res.text();
  
  // Deve construir o link tp.media com marker + sub_id (utm_source + offer_id).
  assert.match(html, /tp\.media\/r\?marker=123456\.wa_gru-eze/, "deve incluir tp.media com marker e sub_id");
  
  // Deve apontar para o Aviasales search URL correto (round-trip GRU 12 set, BUE 19 set).
  assert.match(html, /aviasales\.com.*GRU1209BUE19091/i, "deve envolver a URL do Aviasales round-trip");
  
  // Deve mostrar o aviso de saida padrao com o parceiro real (Aviasales).
  assert.match(html, /Você está indo para Aviasales/i, "deve dizer que vai para Aviasales");
  assert.match(html, /Continuar para Aviasales/i, "CTA deve nomear Aviasales, nao a cia");
});

test("GET /saida/gru-eze: UTM preservado como sub_id do Travelpayouts", async (t) => {
  const { baseUrl } = await withServer(t);
  process.env.TRAVELPAYOUTS_MARKER = "999888";

  const res = await fetch(`${baseUrl}/saida/gru-eze?utm_source=ig&utm_campaign=gru-eze`, {
    headers: { "User-Agent": "test/1.0" },
  });
  
  const html = await res.text();
  // sub_id deve ser utm_source + "_" + offer_id = "ig_gru-eze"
  assert.match(html, /marker=999888\.ig_gru-eze/, "sub_id deve ser canal_oferta (ig_gru-eze)");
});

test("GET /saida/gru-eze: clique registrado em clicks.jsonl", async (t) => {
  const { baseUrl, dir } = await withServer(t);
  process.env.TRAVELPAYOUTS_MARKER = "777666";

  const res = await fetch(`${baseUrl}/saida/gru-eze`, {
    headers: { "User-Agent": "clique-test/2.0" },
  });
  assert.equal(res.status, 200);
  
  const clicksPath = path.join(dir, "clicks.jsonl");
  const { readFileSync, existsSync } = await import("node:fs");
  assert.ok(existsSync(clicksPath), "clique deve ser registrado em clicks.jsonl");
  
  const line = JSON.parse(readFileSync(clicksPath, "utf-8").trim());
  assert.equal(line.id, "gru-eze", "id do clique deve ser gru-eze");
  assert.equal(line.userAgent, "clique-test/2.0");
  assert.ok(line.timestamp);
});

test("GET /saida/{id} para oferta editorial antiga (affiliate_url pre-montado): funciona como antes", async (t) => {
  const { baseUrl } = await withServer(t);
  // VCP-BUE e uma oferta editorial que NAO tem aviasalesUrl.

  const res = await fetch(`${baseUrl}/saida/vcp-bue`, {
    headers: { "User-Agent": "test/1.0" },
  });

  assert.equal(res.status, 409, "oferta editorial sem affiliate_url deve dar 409");
});
