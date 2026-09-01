// Testes para a terceira oferta bloqueada (GIG-SSA) com aviasalesUrl.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createServer } from "../src/server.js";

async function withServer(t) {
  const original = process.env.AONDE_DATA_DIR;
  const originalMarker = process.env.TRAVELPAYOUTS_MARKER;
  const dir = await mkdtemp(path.join(os.tmpdir(), "aonde-gig-ssa-"));
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

test("GET /saida/gig-ssa COM marker constroi tp.media com aviasalesUrl exato", async (t) => {
  process.env.TRAVELPAYOUTS_MARKER = "test-marker-ssa";
  const { baseUrl } = await withServer(t);
  const res = await fetch(`${baseUrl}/saida/gig-ssa`, { redirect: "manual" });
  assert.strictEqual(res.status, 200, "deve devolver 200 OK");
  const html = await res.text();
  
  // Deve construir tp.media com a URL exata do Aviasales.
  assert.ok(html.includes("tp.media/r?"), "deve ter tp.media");
  assert.ok(html.includes("GIG0711SSA14111"), "deve ter a URL exata do Aviasales");
  assert.ok(html.includes("marker=test-marker-ssa.gig-ssa"), "deve ter marker com sub_id");
  assert.ok(html.includes("p=4114"), "deve ter program ID 4114");
});

test("GET /ofertas/gig-ssa mostra duas etiquetas de preco: Google Flights e Aviasales", async (t) => {
  const { baseUrl } = await withServer(t);
  const res = await fetch(`${baseUrl}/ofertas/gig-ssa`);
  assert.strictEqual(res.status, 200, "deve devolver 200 OK");
  const html = await res.text();
  
  // Preco principal: R$ 1.320 (Google Flights).
  assert.ok(html.includes("R$ 1.320"), "deve mostrar R$ 1.320");
  
  // Preco USD no Aviasales: $259 (28 ago).
  assert.ok(html.includes("$259"), "deve mostrar $259");
  assert.ok(html.includes("Aviasales"), "deve mencionar Aviasales para o preco USD");
  
  // NAO deve converter $259 para reais nem rotular R$ 1.320 como Aviasales.
  assert.ok(!html.includes("R$ 259") && !html.includes("R$259"), "nao deve converter USD para reais");
  assert.ok(!html.includes("$273"), "consulta Aviasales desta janela e $259");
});

test("GET /saida/gig-ssa SEM marker nao cria botao falso de reserva", async (t) => {
  delete process.env.TRAVELPAYOUTS_MARKER;
  const { baseUrl } = await withServer(t);
  const res = await fetch(`${baseUrl}/saida/gig-ssa`, { redirect: "manual" });
  assert.strictEqual(res.status, 200, "deve devolver 200 OK");
  const html = await res.text();
  
  // Sem marker, nao deve ter tp.media (honestidade).
  assert.ok(!html.includes("tp.media/r?"), "nao deve ter tp.media sem marker");
  
  // Deve devolver a pagina da oferta sem link de reserva.
  assert.ok(html.includes("Salvador"), "deve mostrar o destino");
});

test("GET /saida/gig-ssa?origem=REC reconstroi URL do Aviasales com REC", async (t) => {
  process.env.TRAVELPAYOUTS_MARKER = "test-marker-ssa";
  const { baseUrl } = await withServer(t);
  const res = await fetch(`${baseUrl}/saida/gig-ssa?origem=REC`, { redirect: "manual" });
  assert.strictEqual(res.status, 200, "deve devolver 200 OK");
  const html = await res.text();
  
  // Deve trocar GIG por REC na URL do Aviasales.
  assert.ok(html.includes("REC0711SSA14111"), "deve trocar GIG por REC");
  assert.ok(html.includes("gig-ssa_rec"), "deve incluir origem no sub_id");
});

test("GET /hoje para 2026-08-23 mostra GIG-SSA com roteiro de Salvador", async (t) => {
  const { baseUrl } = await withServer(t);
  const res = await fetch(`${baseUrl}/hoje?dia=2026-08-23`);
  assert.strictEqual(res.status, 200, "deve devolver 200 OK");
  const html = await res.text();
  
  // Deve mostrar GIG-SSA no /hoje de 23 ago 2026.
  assert.ok(html.includes("Salvador"), "deve mostrar Salvador");
  assert.ok(html.includes("R$ 1.320"), "deve mostrar o preco");
  assert.ok(html.includes("7") && html.includes("nov"), "deve mostrar as datas");
  
  // Deve ter o seletor de origem (GIG-SSA tem aviasalesUrl).
  assert.ok(html.includes("data-origin-selector"), "deve ter seletor de origem");
});

test("GET /ofertas/gig-ssa mostra seletor de origem", async (t) => {
  const { baseUrl } = await withServer(t);
  const res = await fetch(`${baseUrl}/ofertas/gig-ssa`);
  assert.strictEqual(res.status, 200, "deve devolver 200 OK");
  const html = await res.text();
  
  // Deve ter o seletor de origem.
  assert.ok(html.includes("data-origin-selector"), "deve ter seletor de origem");
  assert.ok(html.includes("Saindo de"), "deve ter rotulo 'Saindo de'");
  assert.ok(html.includes('value="GIG"'), "deve ter GIG como opcao");
  assert.ok(html.includes('value="REC"'), "deve ter REC como opcao");
});

test("GIG-SSA marca preco como especifico de GIG (nao GRU)", async (t) => {
  const { baseUrl } = await withServer(t);
  const res = await fetch(`${baseUrl}/ofertas/gig-ssa`);
  assert.strictEqual(res.status, 200, "deve devolver 200 OK");
  const html = await res.text();
  
  // O preco deve estar marcado com data-origin-price="GIG" (origem GIG, não GRU).
  assert.ok(html.includes('data-origin-price="GIG"'), "deve marcar como preco de GIG");
  assert.ok(!html.includes('data-origin-price="GRU"'), "nao deve marcar como preco de GRU");
});
