// Testes para a segunda oferta bloqueada (GRU-FLN) com aviasalesUrl.

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createServer } from "../src/server.js";
import { OFFERS, GUIDES, GRU_FLN_SEMANA, FOR_SSA_SEMANA } from "../src/render/aondeContent.js";
import { pacoteDoDia } from "../src/daily/dailyPick.js";
import { renderOfferPage, renderGuidePage, renderTodayPage } from "../src/render/htmlRenderer.js";

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

  assert.ok(html.includes("R$ 770"), "deve mostrar R$ 770");
  assert.match(html, /Visto no Google Flights, 21 ago 2026/, "R$ 770 e consulta Google Flights 21 ago");

  assert.ok(html.includes("$153"), "deve mostrar USD $153 do Aviasales");
  assert.ok(html.includes("Aviasales"), "deve mencionar Aviasales para o preco USD");
  assert.match(html, /28 de agosto de 2026/, "consulta Aviasales e 28 ago");

  assert.doesNotMatch(html, /R\$\s*153\b/, "nao imprime $153 como reais");
  assert.doesNotMatch(html, /\$149/, "consulta Aviasales desta janela e $153");
  assert.doesNotMatch(html, /Tarifa ao vivo/);
  assert.doesNotMatch(html, /ao vivo no Aviasales/);
  assert.doesNotMatch(html, /encontramos (hoje|esta manhã|esta manha)/i);
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

  assert.ok(html.includes("Florianópolis"), "deve mostrar Florianópolis");
  assert.ok(html.includes("R$ 770"), "deve mostrar o preco");
  assert.ok(html.includes("27 set"), "deve mostrar as datas");

  assert.ok(html.includes("data-origin-selector"), "deve ter seletor de origem");
  assert.doesNotMatch(html, /id="semana-gru-fln"/, "/hoje nao renderiza a semana lock");
  assert.doesNotMatch(html, /Editorial, escrito em 28 de agosto/, "/hoje nao leva o aviso editorial da janela");
  assert.doesNotMatch(html, /Henrique Veras do Nascimento/, "/hoje nao cresce a semana lock");
});

test("GET /ofertas/gru-fln mostra seletor de origem", async (t) => {
  const { baseUrl } = await withServer(t);
  const res = await fetch(`${baseUrl}/ofertas/gru-fln`);
  assert.strictEqual(res.status, 200, "deve devolver 200 OK");
  const html = await res.text();

  assert.ok(html.includes("data-origin-selector"), "deve ter seletor de origem");
  assert.ok(html.includes("Saindo de"), "deve ter rotulo 'Saindo de'");
  assert.ok(html.includes('value="GRU"'), "deve ter GRU como opcao");
  assert.ok(html.includes('value="REC"'), "deve ter REC como opcao");
});

const offerById = (id) => OFFERS.find((o) => o.id === id);

const LOCK_WEEK_MARKERS = [
  "Henrique Veras do Nascimento",
  "box 04S",
  "Baldicero Filomeno",
  "Av. das Lagostas",
  "Abelardo Otacílio Gomes",
];

const WEEK_RESTAURANTS = [
  "Restaurante Oliveira",
  "Box 32",
  "Ostradamus",
  "Ammo Beach",
  "Bar do Arante",
];

test("a semana editorial GRU-FLN vive so em /ofertas/gru-fln, nao no guia de Floripa", () => {
  const guia = renderGuidePage("florianopolis");
  const oferta = renderOfferPage(offerById("gru-fln"), { related: [] });

  assert.equal(GUIDES.florianopolis.dias.length, 5, "guia de Floripa continua com 5 dias");
  assert.ok(GUIDES.florianopolis.dias.some((d) => d.restaurante === "Box 32 (Mercado Público)"));
  assert.ok(GUIDES.florianopolis.dias.some((d) => d.titulo === "Centro Histórico e Mercado Público"));
  assert.equal(GUIDES.florianopolis.semana, undefined);
  assert.ok(GRU_FLN_SEMANA);
  assert.equal(GRU_FLN_SEMANA.offerId, "gru-fln");
  assert.equal(GRU_FLN_SEMANA.tarifa, "USD $153");
  assert.equal(offerById("gru-fln").semana, GRU_FLN_SEMANA);
  assert.notEqual(offerById("for-ssa").semana, GRU_FLN_SEMANA);
  assert.equal(offerById("for-ssa").semana, FOR_SSA_SEMANA);

  assert.doesNotMatch(guia, /Editorial, escrito em 28 de agosto/);
  assert.doesNotMatch(guia, /id="semana-gru-fln"/);
  assert.doesNotMatch(guia, /Não é um texto de quem mora aí/);
  assert.doesNotMatch(guia, /Domingo 27, chegada/);
  for (const marker of LOCK_WEEK_MARKERS) {
    assert.ok(!guia.includes(marker), `guia nao deve citar ${marker}`);
  }
  assert.match(guia, /ROTEIRO DE 5 DIAS/);
  assert.match(guia, /Centro Histórico e Mercado Público/);

  for (const restaurante of WEEK_RESTAURANTS) {
    assert.ok(oferta.includes(restaurante), `oferta deve citar ${restaurante}`);
  }
  for (const marker of LOCK_WEEK_MARKERS) {
    assert.ok(oferta.includes(marker), `oferta deve citar ${marker}`);
  }
  assert.match(oferta, /Editorial, escrito em 28 de agosto de 2026/);
  assert.match(oferta, /Não é um texto de quem mora aí/);
  assert.match(oferta, /id="semana-gru-fln"/);
  assert.doesNotMatch(oferta, /id="semana-for-ssa"/);
  assert.match(oferta, /São Paulo \(GRU\) → Florianópolis \(FLN\)/);
  assert.match(oferta, /USD \$153/);
  assert.match(oferta, /Tarifa vista no Aviasales em 28 de agosto de 2026/);
  assert.match(oferta, /Visto no Google Flights, 21 ago 2026/);
  assert.match(oferta, /href="\/guias\/florianopolis"/);
  assert.doesNotMatch(oferta, /Tarifa ao vivo/);
  assert.doesNotMatch(oferta, /ao vivo no Aviasales/);
  assert.doesNotMatch(oferta, /R\$\s*153\b/);
  assert.doesNotMatch(oferta, /Centro Histórico e Mercado Público/, "oferta nao despeja o guia evergreen");
  assert.doesNotMatch(oferta, /eu moro|moro em Floripa|quem vive aí/i);
});

test("titulos editoriais das tres ofertas lock", () => {
  const fln = renderOfferPage(offerById("gru-fln"), { related: [] });
  const forSsa = renderOfferPage(offerById("for-ssa"), { related: [] });
  const gig = renderOfferPage(offerById("gig-ssa"), { related: [] });
  assert.match(fln, /<title>São Paulo–Florianópolis em setembro: voo direto e 5 dias na ilha<\/title>/);
  assert.match(forSsa, /<title>Fortaleza–Salvador em outubro: voo direto, base no Rio Vermelho\.<\/title>/);
  assert.match(gig, /<title>Rio–Salvador em novembro: voo direto, Pelourinho e praia<\/title>/);
});

test("semana lock nao vaza para for-ssa, salvador, gig-ssa nem /hoje", () => {
  const forSsa = renderOfferPage(offerById("for-ssa"), { related: [] });
  const gig = renderOfferPage(offerById("gig-ssa"), { related: [] });
  const salvador = renderGuidePage("salvador");
  const hoje = renderTodayPage(pacoteDoDia("2026-08-22"));
  const hoje28 = renderTodayPage(pacoteDoDia("2026-08-28"));

  for (const html of [forSsa, gig, salvador, hoje, hoje28]) {
    assert.doesNotMatch(html, /id="semana-gru-fln"/);
    assert.doesNotMatch(html, /Henrique Veras do Nascimento/);
    assert.doesNotMatch(html, /Baldicero Filomeno/);
  }
  assert.match(forSsa, /id="semana-for-ssa"/);
  assert.match(forSsa, /Acarajé da Dinha/);
  assert.doesNotMatch(hoje, /class="semana-lock"/);
  assert.equal((hoje.match(/hoje-card/g) || []).length > 0, true);
});

test("origin-swap esconde a tarifa lock da semana, sem implicar outra origem", () => {
  const html = renderOfferPage(offerById("gru-fln"), { related: [] });
  assert.match(html, /id="semana-gru-fln"/);
  assert.match(html, /semana-lock-fare" data-origin-price="GRU"/);
  assert.match(html, /saindo de GRU/);
  assert.match(html, /closest\('\.hoje-card'\)\|\|select\.closest\('main'\)/);
  assert.match(html, /el\.hidden=true/);
});

test("este PR nao adiciona *-ig.jpg nem inventa FOR-SSA.jpg", () => {
  const ogDir = path.join(process.cwd(), "public", "og");
  for (const name of ["GRU-FLN-ig.jpg", "gru-fln-ig.jpg", "FOR-SSA.jpg", "FOR-SSA-story.jpg", "FOR-SSA-ig.jpg"]) {
    assert.equal(existsSync(path.join(ogDir, name)), false, `${name} nao entra neste PR`);
  }
});

test("GET /guias/florianopolis nao tem a semana lock; GET /ofertas/gru-fln tem, sem tarifa ao vivo", async (t) => {
  const { baseUrl } = await withServer(t);
  const guia = await (await fetch(`${baseUrl}/guias/florianopolis`)).text();
  const oferta = await (await fetch(`${baseUrl}/ofertas/gru-fln`)).text();
  const forSsa = await (await fetch(`${baseUrl}/ofertas/for-ssa`)).text();
  const hoje = await (await fetch(`${baseUrl}/hoje?dia=2026-08-22`)).text();

  assert.doesNotMatch(guia, /Editorial, escrito em 28 de agosto/);
  assert.doesNotMatch(guia, /id="semana-gru-fln"/);
  assert.doesNotMatch(guia, /Henrique Veras do Nascimento/);
  assert.match(guia, /Florianópolis em 5 dias/);

  assert.match(oferta, /Editorial, escrito em 28 de agosto de 2026/);
  assert.match(oferta, /id="semana-gru-fln"/);
  assert.match(oferta, /Tarifa vista no Aviasales em 28 de agosto de 2026/);
  assert.match(oferta, /Visto no Google Flights, 21 ago 2026/);
  assert.doesNotMatch(oferta, /Tarifa ao vivo/);
  assert.doesNotMatch(oferta, /R\$\s*153\b/);

  assert.match(forSsa, /id="semana-for-ssa"/);
  assert.doesNotMatch(forSsa, /id="semana-gru-fln"/);
  assert.doesNotMatch(forSsa, /Henrique Veras do Nascimento/);

  assert.doesNotMatch(hoje, /id="semana-gru-fln"/);
  assert.doesNotMatch(hoje, /Editorial, escrito em 28 de agosto/);
});
