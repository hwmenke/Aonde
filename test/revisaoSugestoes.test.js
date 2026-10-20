// Reprodução das falhas apontadas na revisão de main (048d0e0), com dados
// de teste. Cada caso registra o esperado e o que o código fazia antes do
// conserto. Nenhum teste lê ou grava dado de produção: offers/subscribers
// usam AONDE_DATA_DIR temporário.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { setFetchImpl, resetFetchImpl } from "../src/http.js";
import { mapAmadeusOffersToFlights } from "../src/flights/mapAmadeus.js";
import { renderHomePage, renderMapPage, renderResultsPage } from "../src/render/htmlRenderer.js";
import { pacoteDoDia } from "../src/daily/dailyPick.js";
import { createServer } from "../src/server.js";
import { upsert } from "../src/store/offersStore.js";
import { subscribe, confirm, getSubscriberByEmail } from "../src/newsletter/subscriberStore.js";
import { listAlertRules } from "../src/newsletter/alertRules.js";
import { listEmailJobs } from "../src/newsletter/emailJobs.js";
import { recordPrices, getRouteStats } from "../src/store/priceHistory.js";
import { processarFila } from "../src/newsletter/worker.js";

function offerGrupo({ grandTotal = "2368.00", currency = "BRL", viajantes = null, volta = null } = {}) {
  const price = { currency, total: grandTotal, grandTotal };
  const itineraries = [
    {
      duration: "PT3H05M",
      segments: [
        {
          departure: { iataCode: "GRU", at: "2026-11-12T07:15:00" },
          arrival: { iataCode: "REC", at: "2026-11-12T10:20:00" },
          carrierCode: "AD",
          number: "4102",
        },
      ],
    },
  ];
  if (volta) itineraries.push(volta);
  return {
    type: "flight-offer",
    id: "oferta-teste",
    itineraries,
    price,
    travelerPricings: viajantes,
    validatingAirlineCodes: ["AD"],
  };
}

test("repro #1: total de dois adultos não pode ser rotulado por pessoa", () => {
  // Esperado: R$ 2.368 é o grandTotal dos dois adultos, com rótulo de grupo.
  // Antes: o mesmo número ia para a tela como "ida e volta, por pessoa".
  const voos = mapAmadeusOffersToFlights(
    { data: [offerGrupo({ grandTotal: "2368.00" })], dictionaries: {} },
    { pax: { adultos: 2, criancas: 0, bebes: 0 } }
  );
  assert.equal(voos.length, 1);
  assert.equal(voos[0].preco, "R$ 2.368");
  assert.match(voos[0].precoRotulo, /total para 2 adultos/);
  assert.doesNotMatch(voos[0].precoRotulo, /por pessoa/);
  assert.equal(voos[0].parcela, "R$ 197,33");

  const html = renderResultsPage({
    rota: { origem: "GRU", destino: "REC", resumo: "2 adultos" },
    voos,
    voosReais: true,
    pax: { adultos: 2, criancas: 0, bebes: 0 },
  });
  assert.match(html, /total para 2 adultos/);
  assert.doesNotMatch(html, /ida e volta, por pessoa/);
});

test("repro #1: um adulto continua por pessoa; moeda estranha não vira real", () => {
  const um = mapAmadeusOffersToFlights(
    { data: [offerGrupo({ grandTotal: "1184.00" })], dictionaries: {} },
    { pax: { adultos: 1, criancas: 0, bebes: 0 } }
  );
  assert.equal(um[0].preco, "R$ 1.184");
  assert.match(um[0].precoRotulo, /por pessoa/);
  assert.equal(um[0].parcela, "R$ 98,67");

  const eur = mapAmadeusOffersToFlights(
    {
      data: [
        offerGrupo({
          grandTotal: "200.50",
          currency: "EUR",
          viajantes: [
            { travelerType: "ADULT", price: { currency: "EUR", total: "100.25" } },
            { travelerType: "ADULT", price: { currency: "EUR", total: "100.25" } },
          ],
        }),
      ],
      dictionaries: {},
    },
    { pax: { adultos: 2, criancas: 0, bebes: 0 } }
  );
  assert.equal(eur[0].moeda, "EUR");
  assert.equal(eur[0].preco, "EUR 200.50");
  assert.equal(eur[0].parcela, "");
  assert.equal(eur[0].viajantes.length, 2);
  assert.equal(eur[0].viajantes[0].preco, "EUR 100.25");
  assert.doesNotMatch(eur[0].preco, /R\$/);
});

test("repro #1: a volta da oferta permanece visível", () => {
  const voos = mapAmadeusOffersToFlights(
    {
      data: [
        offerGrupo({
          volta: {
            duration: "PT3H10M",
            segments: [
              {
                departure: { iataCode: "REC", at: "2026-11-19T18:00:00" },
                arrival: { iataCode: "GRU", at: "2026-11-19T21:10:00" },
                carrierCode: "AD",
                number: "4103",
              },
            ],
          },
        }),
      ],
      dictionaries: {},
    },
    { pax: { adultos: 1, criancas: 0, bebes: 0 } }
  );
  assert.equal(voos[0].volta.saida, "18:00");
  assert.equal(voos[0].volta.chegada, "21:10");
  assert.equal(voos[0].volta.duracao, "3h 10");
  const html = renderResultsPage({
    rota: { origem: "GRU", destino: "REC", resumo: "" },
    voos,
    voosReais: true,
    pax: { adultos: 1, criancas: 0, bebes: 0 },
  });
  assert.match(html, /Volta 18:00/);
});

test("repro #3: em 2026-10-19 a escolha do dia não usa viagem já partida", () => {
  // Esperado: gru-eze (ida 12 set) e gru-fln (ida 27 set) ficam de fora.
  // Antes: pacoteDoDia("2026-10-19") ainda escolhia esses dois.
  const ids = pacoteDoDia("2026-10-19").itens.map((item) => item.oferta.id);
  assert.ok(!ids.includes("gru-eze"), `gru-eze expirada apareceu: ${ids.join(",")}`);
  assert.ok(!ids.includes("gru-fln"), `gru-fln expirada apareceu: ${ids.join(",")}`);
  for (const id of ids) assert.equal(id, "gig-ssa");
});

test("repro #3: o override de 21 ago continua, e depois de novembro o dia fica vazio", () => {
  const agosto = pacoteDoDia("2026-08-21").itens.map((item) => item.oferta.id);
  assert.deepEqual(agosto, ["gru-eze"]);
  const depois = pacoteDoDia("2026-11-20").itens;
  assert.equal(depois.length, 0);
});

async function withServer(t) {
  const original = process.env.AONDE_DATA_DIR;
  const dir = await mkdtemp(path.join(os.tmpdir(), "aonde-revisao-"));
  process.env.AONDE_DATA_DIR = dir;
  const server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    if (original === undefined) delete process.env.AONDE_DATA_DIR;
    else process.env.AONDE_DATA_DIR = original;
    await rm(dir, { recursive: true, force: true });
  });
  return { baseUrl: `http://127.0.0.1:${port}`, dir };
}

test("repro #4: rascunho, retirada e id desconhecido não vazam HTML, link nem clique", async (t) => {
  const { baseUrl, dir } = await withServer(t);
  upsert({
    id: "gru-eze",
    origem: "GRU",
    destino: "EZE",
    cidade: "Buenos Aires",
    preco_centavos: 157000,
    affiliate_url: "https://tp.media/r?marker=teste&u=https%3A%2F%2Fexample.invalid%2Frascunho",
    status: "rascunho",
    texto: "RASCUNHO-NAO-PUBLICAR",
  });
  upsert({
    id: "oferta-retirada",
    origem: "GRU",
    destino: "REC",
    affiliate_url: "https://tp.media/r?marker=teste&u=https%3A%2F%2Fexample.invalid%2Fretirada",
    status: "retirada",
    texto: "RETIRADA-NAO-PUBLICAR",
  });

  for (const id of ["gru-eze", "oferta-retirada", "nao-existe"]) {
    const html = await fetch(`${baseUrl}/ofertas/${id}`);
    const body = await html.text();
    assert.equal(html.status, 404, id);
    assert.doesNotMatch(body, /RASCUNHO-NAO-PUBLICAR|RETIRADA-NAO-PUBLICAR|tp\.media/);

    const saida = await fetch(`${baseUrl}/saida/${id}`);
    const saidaBody = await saida.text();
    assert.equal(saida.status, 404, `saida ${id}`);
    assert.doesNotMatch(saidaBody, /tp\.media|example\.invalid/);

    const click = await fetch(`${baseUrl}/api/offers/${id}/click`, { method: "POST" });
    assert.equal(click.status, 404, `click ${id}`);
    const clickBody = await click.json();
    assert.equal(clickBody.redirect, undefined);
  }

  const clicks = path.join(dir, "clicks.jsonl");
  assert.equal(existsSync(clicks), false, "oferta não publicada não gera clique");

  upsert({
    id: "publica-teste",
    origem: "GRU",
    destino: "SSA",
    cidade: "Salvador",
    preco_centavos: 100000,
    affiliate_url: "https://example.com/publica",
    status: "publicada",
  });
  const ok = await fetch(`${baseUrl}/api/offers/publica-teste`);
  assert.equal(ok.status, 200);
  const pagina = await fetch(`${baseUrl}/ofertas/publica-teste`);
  assert.equal(pagina.status, 200);
});

test("busca inválida não consulta outra rota e a URL do parceiro leva a busca", async (t) => {
  const { baseUrl } = await withServer(t);
  const ruim = await fetch(`${baseUrl}/resultados?origem=xyz&destino=REC&ida=2026-11-12&volta=2026-11-01`);
  const html = await ruim.text();
  assert.equal(ruim.status, 200);
  assert.match(html, /Não consultamos nenhuma rota/);
  assert.match(html, /value="xyz"/);
  assert.match(html, /aria-describedby="busca-origem-erro"/);
  assert.match(html, /<fieldset class="sc-pax"><legend>Passageiros<\/legend>/);
  assert.doesNotMatch(html, /AD 4102/);
  assert.doesNotMatch(html, /ida e volta, por pessoa/);

  const saida = await fetch(
    `${baseUrl}/saida/voo?origem=GRU&destino=REC&ida=2027-08-12&volta=2027-08-19&adultos=2`
  );
  const interstitial = await saida.text();
  assert.equal(saida.status, 200);
  const urlParceiro = (interstitial.match(/https:\/\/www\.aviasales\.com\/search\/[A-Za-z0-9]+/) || [])[0] || "";
  assert.match(urlParceiro, /\/search\/GRU1208REC19082$/);
  assert.match(interstitial, /Buscar esta rota no parceiro/);

  const home = await fetch(`${baseUrl}/home`, { redirect: "manual" });
  assert.equal(home.status, 301);
  assert.equal(home.headers.get("location"), "/");

  const mapa = renderMapPage({ apiKey: "chave-teste" });
  assert.match(mapa, /<a class="map-dest-link" href="\/guias\/salvador">/);
  assert.match(mapa, /<button type="button" class="map-pin" data-dest="\d+">Ver no mapa<\/button>/);
  assert.doesNotMatch(mapa, /<a[^>]*data-dest=/);
  assert.match(renderHomePage({}), /<fieldset class="res-filtro"|<legend>Passageiros<\/legend>/);
  assert.match(renderResultsPage({}), /<fieldset class="res-filtro"><legend class="res-filtro-title">/);
});

test("sitemap omite busca interna e oferta com ida já passada", async (t) => {
  const { baseUrl } = await withServer(t);
  const xml = await (await fetch(`${baseUrl}/sitemap.xml`)).text();
  assert.doesNotMatch(xml, /\/resultados/);
  assert.match(xml, /\/ofertas\/gru-lis/);
  assert.doesNotMatch(xml, /\/ofertas\/gru-eze/);
  assert.match(xml, /<lastmod>2026-07-25<\/lastmod>/);
  const robots = await (await fetch(`${baseUrl}/robots.txt`)).text();
  assert.match(robots, /Disallow: \/resultados/);
  const resultados = await (await fetch(`${baseUrl}/resultados`)).text();
  assert.match(resultados, /noindex, nofollow/);
});

test("assinante confirmado pede outra rota por link, e o job fica no disco", async (t) => {
  const { baseUrl, dir } = await withServer(t);
  const pedido = subscribe({ email: "rota@example.com", origem: "GRU" });
  assert.equal(pedido.status, "pending_optin");
  assert.equal(confirm(pedido.token).ok, true);

  const deNovo = subscribe({ email: "rota@example.com", origem: "GRU", destino: "REC" });
  assert.equal(deNovo.status, "pending_rule");
  assert.equal(listAlertRules({ subscriberId: deNovo.subscriber.id }).length, 0);

  const http = await fetch(`${baseUrl}/api/newsletter/subscribe`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "rota@example.com", origem: "GRU", destino: "SSA" }),
  });
  const corpo = await http.json();
  assert.equal(http.status, 200);
  assert.deepEqual(corpo.status, "ok");
  assert.equal(corpo.token, undefined);
  assert.equal(listAlertRules({ subscriberId: deNovo.subscriber.id }).length, 0);

  const token = getSubscriberByEmail("rota@example.com").pending_rule.token;
  const confirma = await fetch(`${baseUrl}/api/newsletter/confirm-rota?token=${token}`);
  assert.equal(confirma.status, 200);
  const regras = listAlertRules({ subscriberId: deNovo.subscriber.id });
  assert.equal(regras.length, 1);
  assert.equal(regras[0].destino, "SSA");

  const anteriores = ["AONDE_EMAIL_PROVIDER", "AONDE_EMAIL_API_KEY", "AONDE_EMAIL_FROM"];
  const snap = Object.fromEntries(anteriores.map((k) => [k, process.env[k]]));
  process.env.AONDE_EMAIL_PROVIDER = "resend";
  process.env.AONDE_EMAIL_API_KEY = "k";
  process.env.AONDE_EMAIL_FROM = "a@b.com";
  setFetchImpl(async () => new Response("falhou", { status: 500 }));
  const originalError = console.error;
  console.error = () => {};
  t.after(() => {
    resetFetchImpl();
    console.error = originalError;
    for (const k of anteriores) {
      if (snap[k] === undefined) delete process.env[k];
      else process.env[k] = snap[k];
    }
  });
  const comEmail = await fetch(`${baseUrl}/api/newsletter/subscribe`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "novo@example.com", origem: "GRU" }),
  });
  assert.equal(comEmail.status, 200);
  const jobs = listEmailJobs();
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].tipo, "optin");
  assert.equal(jobs[0].estado, "pendente");
  const limite = Date.now() + 4000;
  let estado = jobs[0].estado;
  while (estado !== "falha" && Date.now() < limite) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    estado = listEmailJobs()[0].estado;
  }
  assert.equal(estado, "falha");
  assert.ok(existsSync(path.join(dir, "email_jobs.json")));
});

test("worker sobreposto não envia a mesma fila", async (t) => {
  const { dir } = await withServer(t);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "alert_queue.lock"), "outro-processo", "utf-8");
  await writeFile(
    path.join(dir, "alert_queue.jsonl"),
    JSON.stringify({ id: "linha-1", subscriberEmailHash: "abc", offerRoute: "GRU-REC" }) + "\n",
    "utf-8"
  );
  const resultado = await processarFila();
  assert.equal(resultado.modo, "bloqueado");
  assert.equal(resultado.motivo, "em-andamento");
  assert.equal(resultado.enviados, 0);
});

test("histórico corrompido não é substituído por coleção vazia", async (t) => {
  const { baseUrl, dir } = await withServer(t);
  const arquivo = path.join(dir, "history", "GRU-REC.json");
  const bruto = "{ quebrado";
  await mkdir(path.join(dir, "history"), { recursive: true });
  await writeFile(arquivo, bruto, "utf-8");
  const originalError = console.error;
  console.error = () => {};
  t.after(() => {
    console.error = originalError;
  });
  const stats = getRouteStats("GRU", "REC");
  assert.equal(stats.ok, false);
  assert.equal(stats.error, "dados-ilegíveis");
  assert.equal(recordPrices([{ origin: "GRU", destination: "REC", price: 10, currency: "BRL" }]).recorded, 0);
  assert.equal(await readFile(arquivo, "utf-8"), bruto);

  await writeFile(path.join(dir, "offers.json"), "{ quebrado", "utf-8");
  const health = await fetch(`${baseUrl}/api/health`);
  assert.equal(health.status, 503);
  const corpo = await health.json();
  assert.equal(corpo.ok, false);
  assert.equal(corpo.storage.ready, false);
  assert.equal(corpo.storage.files["offers.json"], "ilegivel");
});
