// Testes para a segunda oferta bloqueada (GRU-FLN) com aviasalesUrl.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createServer } from "../src/server.js";

async function withServer(t) {
  const original = process.env.AONDE_DATA_DIR;
  const originalMarker = process.env.TRAVELPAYOUTS_MARKER;
  const dir = await mkdtemp(path.join(os.tmpdir(), "aonde-gru-fln-"));
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

test("GET /saida/gru-fln COM marker constroi tp.media com aviasalesUrl exato", async (t) => {
  process.env.TRAVELPAYOUTS_MARKER = "test-marker-fln";
  const { baseUrl } = await withServer(t);
  const res = await fetch(`${baseUrl}/saida/gru-fln`, { redirect: "manual" });
  assert.strictEqual(res.status, 200, "deve devolver 200 OK");
  const html = await res.text();
  
  // Deve construir tp.media com a URL exata do Aviasales.
  assert.ok(html.includes("tp.media/r?"), "deve ter tp.media");
  assert.ok(html.includes("GRU2709FLN03101"), "deve ter a URL exata do Aviasales");
  assert.ok(html.includes("marker=test-marker-fln.gru-fln"), "deve ter marker com sub_id");
  assert.ok(html.includes("p=4114"), "deve ter program ID 4114");
});

test("GET /ofertas/gru-fln mostra duas etiquetas de preco: Google Flights e Aviasales", async (t) => {
  const { baseUrl } = await withServer(t);
  const res = await fetch(`${baseUrl}/ofertas/gru-fln`);
  assert.strictEqual(res.status, 200, "deve devolver 200 OK");
  const html = await res.text();
  
  // Preco principal: R$ 770 (Google Flights).
  assert.ok(html.includes("R$ 770"), "deve mostrar R$ 770");
  
  // Preco USD no Aviasales: $149.
  assert.ok(html.includes("$149"), "deve mostrar $149");
  assert.ok(html.includes("Aviasales"), "deve mencionar Aviasales para o preco USD");
  
  // NAO deve converter $149 para reais nem rotular R$ 770 como Aviasales.
  assert.ok(!html.includes("R$ 149") && !html.includes("R$149"), "nao deve converter USD para reais");
});

test("GET /saida/gru-fln SEM marker nao cria botao falso de reserva", async (t) => {
  delete process.env.TRAVELPAYOUTS_MARKER;
  const { baseUrl } = await withServer(t);
  const res = await fetch(`${baseUrl}/saida/gru-fln`, { redirect: "manual" });
  assert.strictEqual(res.status, 200, "deve devolver 200 OK");
  const html = await res.text();
  
  // Sem marker, nao deve ter tp.media (honestidade).
  assert.ok(!html.includes("tp.media/r?"), "nao deve ter tp.media sem marker");
  
  // Deve devolver a pagina da oferta sem link de reserva.
  assert.ok(html.includes("Florianópolis"), "deve mostrar o destino");
});

test("GET /saida/gru-fln?origem=REC reconstroi URL do Aviasales com REC", async (t) => {
  process.env.TRAVELPAYOUTS_MARKER = "test-marker-fln";
  const { baseUrl } = await withServer(t);
  const res = await fetch(`${baseUrl}/saida/gru-fln?origem=REC`, { redirect: "manual" });
  assert.strictEqual(res.status, 200, "deve devolver 200 OK");
  const html = await res.text();
  
  // Deve trocar GRU por REC na URL do Aviasales.
  assert.ok(html.includes("REC2709FLN03101"), "deve trocar GRU por REC");
  assert.ok(html.includes("gru-fln_rec"), "deve incluir origem no sub_id");
});

test("GET /hoje para 2026-08-22 mostra GRU-FLN com roteiro de Florianópolis", async (t) => {
  const { baseUrl } = await withServer(t);
  const res = await fetch(`${baseUrl}/hoje?dia=2026-08-22`);
  assert.strictEqual(res.status, 200, "deve devolver 200 OK");
  const html = await res.text();
  
  // Deve mostrar GRU-FLN no /hoje de 22 ago 2026.
  assert.ok(html.includes("Florianópolis"), "deve mostrar Florianópolis");
  assert.ok(html.includes("R$ 770"), "deve mostrar o preco");
  assert.ok(html.includes("27 set"), "deve mostrar as datas");
  
  // Deve ter o seletor de origem (GRU-FLN tem aviasalesUrl).
  assert.ok(html.includes("data-origin-selector"), "deve ter seletor de origem");
});

test("GET /ofertas/gru-fln mostra seletor de origem", async (t) => {
  const { baseUrl } = await withServer(t);
  const res = await fetch(`${baseUrl}/ofertas/gru-fln`);
  assert.strictEqual(res.status, 200, "deve devolver 200 OK");
  const html = await res.text();
  
  // Deve ter o seletor de origem.
  assert.ok(html.includes("data-origin-selector"), "deve ter seletor de origem");
  assert.ok(html.includes("Saindo de"), "deve ter rotulo 'Saindo de'");
  assert.ok(html.includes('value="GRU"'), "deve ter GRU como opcao");
  assert.ok(html.includes('value="REC"'), "deve ter REC como opcao");
});
