// TESTES QUE EXECUTAM O JAVASCRIPT DO NAVEGADOR.
//
// Por que este arquivo existe: ate agora NENHUM teste rodava o script que o
// site embute na pagina. O projeto nao tem DOM, entao os testes so conferiam
// substring do HTML. Um bug de logica no cliente nao derrubava nada — e foi
// exatamente assim que passou o caso em que o contador de voos rotulava preco
// REAL da Amadeus como "voos de exemplo" no primeiro clique em um filtro.
//
// Roda com Playwright quando ele existe no ambiente; quando nao existe, os
// testes se declaram PULADOS em vez de passar em silencio — teste que "passa"
// sem exercitar nada e pior que teste nenhum.

import { test } from "node:test";
import assert from "node:assert/strict";

const CHROMIUM = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const PLAYWRIGHT = "/opt/node22/lib/node_modules/playwright/index.mjs";

let chromium = null;
try {
  ({ chromium } = await import(PLAYWRIGHT));
} catch {
  chromium = null;
}

async function comNavegador(fn, { viewport = { width: 1280, height: 900 } } = {}) {
  const { createServer } = await import("../src/server.js");
  const srv = createServer();
  await new Promise((r) => srv.listen(0, r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const navegador = await chromium.launch({ executablePath: CHROMIUM });
  const pagina = await navegador.newPage({ viewport });
  const erros = [];
  pagina.on("pageerror", (e) => erros.push(String(e.message).slice(0, 200)));
  try {
    await fn({ pagina, base, erros });
  } finally {
    await navegador.close();
    srv.close();
  }
}

const pular = { skip: chromium ? false : "Playwright indisponivel neste ambiente" };

test("o filtro de roteiros do /guias filtra de verdade", pular, async () => {
  await comNavegador(async ({ pagina, base, erros }) => {
    await pagina.goto(`${base}/guias`, { waitUntil: "load" });
    const total = await pagina.locator(".rot-card").count();
    assert.ok(total > 0, "sem roteiros na pagina");

    // sem acento tem de achar destino com acento
    await pagina.fill("[data-guia-busca-campo]", "florianopolis");
    await pagina.waitForTimeout(120);
    assert.equal(await pagina.locator(".rot-card:visible").count(), 1);

    // caso zero explica como voltar
    await pagina.fill("[data-guia-busca-campo]", "zzzznaoexiste");
    await pagina.waitForTimeout(120);
    assert.equal(await pagina.locator(".rot-card:visible").count(), 0);
    assert.match(await pagina.locator("[data-guia-busca-conta]").textContent(), /Apague o texto/);

    // Esc devolve a lista inteira
    await pagina.press("[data-guia-busca-campo]", "Escape");
    await pagina.waitForTimeout(120);
    assert.equal(await pagina.locator(".rot-card:visible").count(), total);
    assert.deepEqual(erros, []);
  });
});

test("o contador NUNCA chama preco real de exemplo, nem depois de filtrar", pular, async () => {
  // ESTE E O BUG QUE MOTIVOU O ARQUIVO. O servidor rotulava certo; o JS do
  // cliente cravava "voos de exemplo" e desfazia isso no primeiro clique.
  //
  // ATENCAO ao montar este teste: a primeira versao pedia /resultados ao
  // servidor, que SEM credencial cai em voos de exemplo. Ali o rotulo cravado
  // e o correto coincidem, e o teste passava mesmo com o bug reintroduzido de
  // proposito. So o caso AO VIVO expoe o defeito — por isso a pagina e
  // renderizada aqui com voosReais:true e injetada com setContent.
  const { renderResultsPage } = await import("../src/render/htmlRenderer.js");
  const html = renderResultsPage({
    searched: true,
    rota: { origem: "GRU", destino: "REC", resumo: "" },
    voosReais: true,
    voos: [
      { cia: "LATAM", numero: "LA 1", saida: "06:15", chegada: "08:35", duracao: "2h20", paradas: "Direto", direto: true, preco: "R$ 587", parcela: "R$ 48,92", melhor: true },
      { cia: "GOL", numero: "G3 2", saida: "11:40", chegada: "14:05", duracao: "2h25", paradas: "Direto", direto: true, preco: "R$ 634", parcela: "R$ 52,83", melhor: false },
    ],
  });

  const navegador = await chromium.launch({ executablePath: CHROMIUM });
  const pagina = await navegador.newPage();
  const erros = [];
  pagina.on("pageerror", (e) => erros.push(String(e.message).slice(0, 200)));
  try {
    await pagina.setContent(html, { waitUntil: "load" });
    const contador = pagina.locator("[data-res-count]");
    assert.equal(await contador.getAttribute("data-res-rotulo"), "voos encontrados");

    const antes = await contador.textContent();
    assert.match(antes, /voos encontrados/, "o servidor ja deveria rotular como encontrados");
    assert.doesNotMatch(antes, /de exemplo/);

    // O clique no filtro faz o JS reescrever o texto. Aqui e onde quebrava.
    await pagina.locator("[data-res-filtro]").first().click();
    await pagina.waitForTimeout(150);
    const depois = await contador.textContent();
    assert.doesNotMatch(
      depois,
      /de exemplo/,
      `apos filtrar, preco REAL da Amadeus foi rotulado como exemplo: "${depois}"`
    );
    assert.match(depois, /voos encontrados/);
    assert.deepEqual(erros, []);
  } finally {
    await navegador.close();
  }
});

test("a ordenacao de voos ordena mesmo", pular, async () => {
  await comNavegador(async ({ pagina, base, erros }) => {
    await pagina.goto(`${base}/resultados?origem=GRU&destino=REC`, { waitUntil: "load" });
    const precos = () => pagina.$$eval("[data-res-voo]", (els) => els.map((e) => +e.getAttribute("data-preco")));
    const duracoes = () => pagina.$$eval("[data-res-voo]", (els) => els.map((e) => +e.getAttribute("data-duracao")));

    await pagina.click('[data-res-sort="preco"]');
    await pagina.waitForTimeout(120);
    const p = await precos();
    assert.deepEqual(p, [...p].sort((a, b) => a - b), "nao ordenou por preco");

    await pagina.click('[data-res-sort="duracao"]');
    await pagina.waitForTimeout(120);
    const d = await duracoes();
    assert.deepEqual(d, [...d].sort((a, b) => a - b), "nao ordenou por duracao");

    // o botao ativo precisa dizer que esta ativo
    const pressed = await pagina.$$eval("[data-res-sort]", (els) => els.map((e) => e.getAttribute("aria-pressed")));
    assert.equal(pressed.filter((x) => x === "true").length, 1, "exatamente um botao ativo");
    assert.deepEqual(erros, []);
  });
});

test("o tema escuro aplica e sobrevive ao recarregamento", pular, async () => {
  await comNavegador(async ({ pagina, base, erros }) => {
    await pagina.goto(base, { waitUntil: "load" });
    const fundo = () => pagina.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const claro = await fundo();
    await pagina.click("[data-tema-toggle]");
    await pagina.waitForTimeout(150);
    const escuro = await fundo();
    assert.notEqual(claro, escuro, "o fundo nao mudou ao alternar o tema");
    assert.equal(await pagina.locator("[data-tema-toggle]").getAttribute("aria-pressed"), "true");

    await pagina.reload({ waitUntil: "load" });
    assert.equal(
      await pagina.evaluate(() => document.documentElement.getAttribute("data-tema")),
      "escuro",
      "a escolha de tema nao sobreviveu ao reload"
    );
    assert.deepEqual(erros, []);
  });
});

test("o carrossel para de verdade quando a pessoa manda parar (WCAG 2.2.2)", pular, async () => {
  await comNavegador(async ({ pagina, base, erros }) => {
    await pagina.goto(base, { waitUntil: "load" });
    const pausa = pagina.locator("[data-hero-pause]");
    if ((await pausa.count()) === 0) return; // sem carrossel nesta pagina
    await pausa.click();
    await pagina.waitForTimeout(120);
    assert.equal(await pausa.getAttribute("aria-pressed"), "true", "o botao de pausa nao anuncia o estado");
    const slide = () => pagina.evaluate(() => document.querySelector("[data-hero].is-active")?.className || "");
    const a = await slide();
    await pagina.waitForTimeout(1200);
    assert.equal(await slide(), a, "o carrossel continuou trocando depois de pausado");
    assert.deepEqual(erros, []);
  });
});

test("nenhuma pagina principal lanca erro de JavaScript", pular, async () => {
  await comNavegador(async ({ pagina, base, erros }) => {
    for (const rota of ["/", "/ofertas", "/ofertas/gru-lis", "/guias", "/guias/salvador", "/resultados", "/hoje", "/alertas"]) {
      await pagina.goto(base + rota, { waitUntil: "load" });
      await pagina.waitForTimeout(80);
    }
    assert.deepEqual(erros, [], "erro de JS em alguma pagina");
  });
});
