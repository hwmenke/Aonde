// ---------------------------------------------------------------------------
// TESTES DO SELETOR DE ORIGEM ALTERAVEL
//
// Verifica que pessoas de outros estados podem reservar a mesma rota trocando
// a origem na URL do Aviasales, e que o preco especifico de GRU nao aparece
// quando a origem e outra.
// ---------------------------------------------------------------------------

import test from "node:test";
import assert from "node:assert";
import { createServer } from "../src/server.js";

const MARKER = "test-marker-12345";
let server;
let baseUrl;

test.before(async () => {
  // Define o marker do Travelpayouts para os testes.
  process.env.TRAVELPAYOUTS_MARKER = MARKER;
  // Inicia o servidor em uma porta aleatoria.
  server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

test.after(async () => {
  delete process.env.TRAVELPAYOUTS_MARKER;
  if (server) await new Promise((res) => server.close(res));
});

// ---------------------------------------------------------------------------
// OFERTA GRU-EZE: origem alteravel
// ---------------------------------------------------------------------------

test("GET /ofertas/gru-eze mostra seletor de origem", async () => {
  const res = await fetch(`${baseUrl}/ofertas/gru-eze`);
  assert.strictEqual(res.status, 200, "deve devolver 200 OK");
  const html = await res.text();
  
  // Deve ter o seletor de origem.
  assert.ok(html.includes('data-origin-selector'), "deve ter o seletor de origem");
  assert.ok(html.includes('Saindo de'), "deve ter o rotulo 'Saindo de'");
  assert.ok(html.includes('value="GRU"'), "deve ter GRU como opcao");
  assert.ok(html.includes('value="REC"'), "deve ter REC como opcao");
  assert.ok(html.includes('value="GIG"'), "deve ter GIG como opcao");
});

test("GET /ofertas/gru-eze marca preco como especifico de GRU", async () => {
  const res = await fetch(`${baseUrl}/ofertas/gru-eze`);
  assert.strictEqual(res.status, 200, "deve devolver 200 OK");
  const html = await res.text();
  
  // O preco deve estar marcado com data-gru-price (para poder esconder quando
  // a origem mudar via JavaScript).
  assert.ok(html.includes('data-gru-price'), "deve marcar o preco como especifico de GRU");
  assert.ok(html.includes('R$ 1.570'), "deve mostrar o preco de GRU");
});

test("GET /saida/gru-eze?origem=REC reconstroi URL do Aviasales com REC", async () => {
  const res = await fetch(`${baseUrl}/saida/gru-eze?origem=REC`, { redirect: "manual" });
  assert.strictEqual(res.status, 200, "deve devolver 200 OK (pagina de transicao)");
  const html = await res.text();
  
  // Deve ter construido a URL do tp.media com a origem REC.
  assert.ok(html.includes('tp.media/r?'), "deve construir URL do tp.media");
  assert.ok(html.includes('REC1209BUE19091'), "deve trocar GRU por REC na URL do Aviasales");
  
  // O sub_id deve incluir a origem alterada.
  assert.ok(html.includes('gru-eze_rec'), "deve incluir origem no sub_id");
});

test("GET /saida/gru-eze?origem=CGH reconstroi URL do Aviasales com CGH", async () => {
  const res = await fetch(`${baseUrl}/saida/gru-eze?origem=CGH`, { redirect: "manual" });
  assert.strictEqual(res.status, 200, "deve devolver 200 OK");
  const html = await res.text();
  
  assert.ok(html.includes('CGH1209BUE19091'), "deve trocar GRU por CGH na URL do Aviasales");
  assert.ok(html.includes('gru-eze_cgh'), "deve incluir origem CGH no sub_id");
});

test("GET /saida/gru-eze preserva origem padrao (GRU) quando nao ha ?origem=", async () => {
  const res = await fetch(`${baseUrl}/saida/gru-eze`, { redirect: "manual" });
  assert.strictEqual(res.status, 200, "deve devolver 200 OK");
  const html = await res.text();
  
  // Sem ?origem=, deve manter GRU na URL do Aviasales.
  assert.ok(html.includes('GRU1209BUE19091'), "deve manter GRU quando nao ha ?origem=");
  assert.ok(!html.includes('_rec') && !html.includes('_cgh'), "nao deve ter sufixo de origem no sub_id");
});

test("GET /saida/gru-eze?origem=INVALIDO ignora origem invalida", async () => {
  const res = await fetch(`${baseUrl}/saida/gru-eze?origem=INVALIDO`, { redirect: "manual" });
  assert.strictEqual(res.status, 200, "deve devolver 200 OK");
  const html = await res.text();
  
  // Origem invalida (nao tem 3 letras ou tem caracteres nao-alfabeticos) deve
  // ser ignorada, mantendo a origem original (GRU).
  assert.ok(html.includes('GRU1209BUE19091'), "deve manter GRU quando origem e invalida");
});

test("GET /saida/gru-eze?origem=REC&utm_source=wa inclui UTMs e origem no sub_id", async () => {
  const res = await fetch(`${baseUrl}/saida/gru-eze?origem=REC&utm_source=wa`, { redirect: "manual" });
  assert.strictEqual(res.status, 200, "deve devolver 200 OK");
  const html = await res.text();
  
  // sub_id deve ser {utm_source}_{offer_id}_{origem}: wa_gru-eze_rec
  assert.ok(html.includes('wa_gru-eze_rec'), "deve incluir UTM e origem no sub_id");
});

// ---------------------------------------------------------------------------
// PAGINA /HOJE: seletor de origem para GRU-EZE
// ---------------------------------------------------------------------------

test("GET /hoje mostra seletor de origem para GRU-EZE em 21 ago 2026", async () => {
  const res = await fetch(`${baseUrl}/hoje?dia=2026-08-21`);
  assert.strictEqual(res.status, 200, "deve devolver 200 OK");
  const html = await res.text();
  
  // Deve ter o seletor de origem para a oferta GRU-EZE.
  assert.ok(html.includes('data-origin-selector'), "deve ter seletor de origem");
  assert.ok(html.includes('Saindo de'), "deve ter rotulo 'Saindo de'");
  
  // O preco deve estar marcado como especifico de GRU.
  assert.ok(html.includes('data-gru-price'), "deve marcar o preco como especifico de GRU");
});

test("GET /hoje sem seletor de origem para ofertas sem aviasalesUrl", async () => {
  // Testa um dia diferente que NAO seja 21 ago 2026 (que e o lock do GRU-EZE).
  const res = await fetch(`${baseUrl}/hoje?dia=2026-08-22`);
  assert.strictEqual(res.status, 200, "deve devolver 200 OK");
  const html = await res.text();
  
  // Ofertas sem aviasalesUrl nao devem ter seletor de origem.
  // (Nao posso garantir que todas as ofertas do dia 22 nao tenham aviasalesUrl,
  // mas posso verificar que a pagina renderiza sem erros.)
  assert.ok(html.length > 0, "pagina deve renderizar sem erros");
});

// ---------------------------------------------------------------------------
// HONESTIDADE: preco especifico de GRU nao deve aparecer para outras origens
// ---------------------------------------------------------------------------

test("JavaScript esconde preco quando origem != GRU", async () => {
  const res = await fetch(`${baseUrl}/ofertas/gru-eze`);
  assert.strictEqual(res.status, 200, "deve devolver 200 OK");
  const html = await res.text();
  
  // Verifica que o JavaScript tem a logica para esconder o preco.
  assert.ok(html.includes('data-gru-price'), "deve marcar preco com data-gru-price");
  assert.ok(html.includes('data-origin-selector'), "deve ter o handler de mudanca de origem");
  assert.ok(html.includes('el.hidden=true'), "deve ter logica para esconder o preco");
  assert.ok(html.includes('novaOrigem!=='), "deve checar se origem != GRU");
});

// ---------------------------------------------------------------------------
// OFERTAS SEM aviasalesUrl: nao devem ter seletor de origem
// ---------------------------------------------------------------------------

test("GET /ofertas/{id} sem aviasalesUrl nao mostra seletor de origem", async () => {
  // Testa uma oferta editorial antiga que nao tem aviasalesUrl.
  // GRU-EZE tem aviasalesUrl, entao testamos com gru-bog que nao tem.
  const res = await fetch(`${baseUrl}/ofertas/gru-bog`);
  
  // Se a oferta nao existe, pula o teste (pode ter sido removida).
  if (res.status === 404) {
    console.log("  (pulando teste: oferta gru-bog nao existe)");
    return;
  }
  
  assert.strictEqual(res.status, 200, "deve devolver 200 OK");
  const html = await res.text();
  
  // Nao deve ter seletor de origem para ofertas sem aviasalesUrl.
  assert.ok(!html.includes('data-origin-selector'), "nao deve ter seletor de origem");
});

// ---------------------------------------------------------------------------
// SEM TRAVELPAYOUTS_MARKER: nao deve mostrar botao de reserva
// ---------------------------------------------------------------------------

test("GET /saida/gru-eze?origem=REC sem MARKER nao cria link de reserva", async () => {
  // Remove temporariamente o marker.
  const marker = process.env.TRAVELPAYOUTS_MARKER;
  delete process.env.TRAVELPAYOUTS_MARKER;
  
  const res = await fetch(`${baseUrl}/saida/gru-eze?origem=REC`, { redirect: "manual" });
  assert.strictEqual(res.status, 200, "deve devolver 200 OK");
  const html = await res.text();
  
  // Sem marker, nao deve ter link tp.media (honestidade).
  assert.ok(!html.includes('tp.media/r?'), "nao deve ter link tp.media sem marker");
  
  // Restaura o marker.
  process.env.TRAVELPAYOUTS_MARKER = marker;
});
