import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { renderResultsPage, renderGuidePage, renderMapPage, renderHelpPage, renderSalvosPage } from "../src/render/htmlRenderer.js";
import { mapAmadeusOffersToFlights } from "../src/flights/mapAmadeus.js";
import { buscarVoosAoVivo } from "../src/flights/buscarVoos.js";
import { coordenarBusca, resetarBuscaAoVivo } from "../src/flights/buscaAoVivoLimite.js";
import { lembreteDeRevisao, CONFERIDO_EM } from "../src/render/preparativos.js";
import { catalogoSalvos } from "../src/render/savedTrips.js";
import { eventoPermitido, registrarEvento, resetarEventosMemoria } from "../src/analytics/events.js";
import { setCache, getCache, clearHttpCache, httpCacheStats } from "../src/httpCache.js";
import { createInboundRateLimiter } from "../src/inboundRateLimiter.js";
import { httpRequest, setFetchImpl, resetFetchImpl } from "../src/http.js";
import { pageStylesCss } from "../src/render/htmlRenderer.js";
import { createServer } from "../src/server.js";

const VOO_IBERIA = {
  cia: "Iberia",
  numero: "IB 6801",
  saida: "22:40",
  chegada: "06:10",
  duracao: "11h 30",
  paradas: "2 paradas · MAD",
  direto: false,
  preco: "EUR 10.00",
  parcela: "",
  melhor: false,
};
const VOO_AZUL = {
  cia: "Azul",
  numero: "AD 1",
  saida: "08:15",
  chegada: "10:00",
  duracao: "1h 45",
  paradas: "Direto",
  direto: true,
  preco: "R$ 10",
  parcela: "",
  melhor: true,
};

test("lote 2 item 1: filtros nascem dos voos e não escondem a lista no carregamento", () => {
  const html = renderResultsPage({ voos: [VOO_IBERIA, VOO_AZUL], voosReais: true, searched: true });
  assert.match(html, /data-fval="Iberia"/);
  assert.match(html, /data-fval="2\+"/);
  assert.match(html, /Noite \(18h – 24h\)/);
  assert.match(html, /Madrugada \(0h – 6h\)/);
  assert.doesNotMatch(html, /data-res-filtro[^>]*checked/);
  assert.match(html, /Limpar filtros/);
  assert.match(html, /data-cia="Iberia"[^>]*data-hora="22"/);
  const iberia = html.match(/data-fval="Iberia"[^>]*>[^<]*<span class="res-filtro-n">(\d+)<\/span>/);
  assert.equal(iberia && iberia[1], "1");
  const artigos = [...html.matchAll(/<article class="res-voo[^"]*"([^>]*)>/g)];
  assert.equal(artigos.length, 2);
  assert.ok(artigos.every((a) => !/\shidden\b/.test(a[1])));
});

test("lote 2 item 2: ida e volta trazem aeroportos, datas e operadora só quando veio", () => {
  const voos = mapAmadeusOffersToFlights({
    data: [
      {
        price: { grandTotal: "200.50", currency: "EUR" },
        validatingAirlineCodes: ["IB"],
        itineraries: [
          {
            duration: "PT15H",
            segments: [
              {
                carrierCode: "IB",
                number: "6801",
                operating: { carrierCode: "LA" },
                departure: { iataCode: "GRU", at: "2026-11-02T22:40:00" },
                arrival: { iataCode: "MAD", at: "2026-11-03T11:10:00" },
              },
              {
                carrierCode: "IB",
                number: "999",
                departure: { iataCode: "MAD", at: "2026-11-03T13:00:00" },
                arrival: { iataCode: "LIS", at: "2026-11-03T14:10:00" },
              },
            ],
          },
          {
            duration: "PT12H",
            segments: [
              {
                carrierCode: "IB",
                number: "6802",
                departure: { iataCode: "LIS", at: "2026-11-09T09:00:00" },
                arrival: { iataCode: "GRU", at: "2026-11-09T18:00:00" },
              },
            ],
          },
        ],
      },
    ],
    dictionaries: { carriers: { IB: "IBERIA", LA: "LATAM AIRLINES" } },
  }, { pax: { adultos: 1, criancas: 0, bebes: 0 } });
  assert.equal(voos[0].idaTrechos[0].origem, "GRU");
  assert.equal(voos[0].idaTrechos[0].destino, "MAD");
  assert.equal(voos[0].idaTrechos[0].saidaData, "2026-11-02");
  assert.equal(voos[0].idaTrechos[0].chegadaData, "2026-11-03");
  assert.equal(voos[0].idaTrechos[0].mudaDia, true);
  assert.equal(voos[0].idaTrechos[0].conexao, "MAD");
  assert.equal(voos[0].idaTrechos[0].operadora, "LATAM");
  assert.equal(voos[0].idaTrechos[1].operadora, "");
  assert.equal(voos[0].volta.trechos[0].origem, "LIS");
  assert.equal(voos[0].volta.trechos[0].operadora, "");

  const html = renderResultsPage({ voos, voosReais: true, rota: { origem: "GRU", destino: "LIS", resumo: "" } });
  assert.match(html, /<summary>Detalhes da ida e volta<\/summary>/);
  assert.match(html, /Conexão em MAD/);
  assert.match(html, /Operado por LATAM/);
  assert.match(html, /Chega em outro dia/);
  assert.match(html, /Volta 09:00/);

  const semVolta = mapAmadeusOffersToFlights({
    data: [
      {
        price: { grandTotal: "100.00", currency: "EUR" },
        itineraries: [
          {
            duration: "PT3H",
            segments: [
              {
                carrierCode: "IB",
                number: "1",
                departure: { iataCode: "GRU", at: "2026-11-02T10:00:00" },
                arrival: { iataCode: "LIS", at: "2026-11-02T13:00:00" },
              },
            ],
          },
        ],
      },
    ],
  });
  const htmlSem = renderResultsPage({ voos: semVolta, voosReais: true, rota: { origem: "GRU", destino: "LIS", resumo: "" } });
  assert.match(htmlSem, /A volta não veio nesta resposta/);
  assert.doesNotMatch(htmlSem, /Operado por Iberia/);
});

test("lote 2 item 3: falha da busca ao vivo não se apresenta como sucesso", () => {
  const timeout = renderResultsPage({
    searched: true,
    buscaAoVivo: true,
    buscaMotivo: "timeout-geral",
    consulta: { origem: "GRU", destino: "REC", ida: "2027-08-12", volta: "2027-08-19" },
    rota: { origem: "GRU", destino: "REC", resumo: "" },
  });
  assert.match(timeout, /demorou demais/);
  assert.match(timeout, /Tentar de novo/);
  assert.match(timeout, /Exemplos, separados desta busca/);
  assert.match(timeout, /voos de exemplo/);
  assert.doesNotMatch(timeout, /Preços buscados ao vivo agora/);

  const vazio = renderResultsPage({
    searched: true,
    buscaAoVivo: true,
    buscaMotivo: "sem-resultados",
    rota: { origem: "GRU", destino: "REC", resumo: "" },
  });
  assert.match(vazio, /não quer dizer que a rota não exista/);

  const semCredencial = renderResultsPage({ searched: true, buscaMotivo: "sem-credencial" });
  assert.match(semCredencial, /Busca de voos ao vivo em breve/);
  assert.match(semCredencial, /voos de exemplo/);
  assert.doesNotMatch(semCredencial, /Preços buscados ao vivo agora/);
});

test("lote 2 item 4: mapa sem script ainda deixa o roteiro acessível", () => {
  const html = renderMapPage({ apiKey: "chave-de-teste" });
  assert.match(html, /class="map-dest-link" href="\/guias\//);
  assert.match(html, /aondeMapaIndisponivel/);
  assert.match(html, /onerror=/);
  assert.match(html, /__aondeMapaTimer/);
  const guia = renderGuidePage("salvador", { apiKey: "chave-de-teste" });
  assert.match(guia, /class="btn btn-green guia-map-link"/);
  assert.match(guia, /Carregando o mapa/);
});

test("lote 2 item 5: fonte só quando já existe; o resto fica como não registrado", () => {
  const antes = CONFERIDO_EM;
  const guia = renderGuidePage("salvador");
  assert.match(guia, /fonte não registrada/);
  assert.match(guia, /data de revisão não registrada/i);
  assert.match(guia, /\/ajuda\?guia=salvador/);
  assert.equal(CONFERIDO_EM, antes);
  const futuro = lembreteDeRevisao({ conferidoEm: "2026-08-01", tipo: "preparativos", hoje: "2027-08-01" });
  assert.equal(futuro.estado, "revisar");
  assert.equal(CONFERIDO_EM, "2026-08-01");
  const semData = lembreteDeRevisao({ conferidoEm: "", hoje: "2026-10-19" });
  assert.equal(semData.estado, "data-nao-registrada");
  const ajuda = renderHelpPage({ guia: "salvador" });
  assert.match(ajuda, /relatando o guia/);
  assert.match(ajuda, /Não pedimos e-mail/);
});

test("lote 2 item 6: salvos guardam id, não preço", () => {
  const catalogo = catalogoSalvos();
  assert.ok(catalogo.some((item) => item.tipo === "guia" && item.id));
  assert.ok(catalogo.every((item) => !("preco" in item)));
  const html = renderSalvosPage();
  assert.match(html, /id="salvos-catalogo"/);
  assert.match(html, /aonde-salvos/);
  assert.match(html, /não está mais disponível|não informado/);
  assert.doesNotMatch(html, /R\$\s*\d/);
});

test("lote 2 item 7: guia tem ação de imprimir e CSS de página", () => {
  const html = renderGuidePage("salvador");
  assert.match(html, /Imprimir \/ salvar PDF/);
  assert.match(html, /data-imprimir/);
  assert.match(html, /Endereço desta página:/);
  const css = pageStylesCss();
  assert.match(css, /@media print/);
  assert.match(css, /guia-sticky-cta/);
  assert.match(css, /break-inside:\s*avoid/);
});

test("lote 2 item 8: evento do funil recusa e-mail e texto livre", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "aonde-eventos-"));
  const anterior = process.env.AONDE_DATA_DIR;
  process.env.AONDE_DATA_DIR = dir;
  resetarEventosMemoria();
  t.after(() => {
    if (anterior === undefined) delete process.env.AONDE_DATA_DIR;
    else process.env.AONDE_DATA_DIR = anterior;
    resetarEventosMemoria();
  });
  assert.equal(eventoPermitido({ tipo: "busca", local: "formulario", alvo: "", email: "a@b.c" }), null);
  assert.equal(eventoPermitido({ tipo: "compra", local: "saida", alvo: "x" }), null);
  assert.equal(registrarEvento({ tipo: "busca", local: "formulario", query: "lisboa barato" }).ok, false);
  assert.equal(registrarEvento({ tipo: "parceiro", local: "saida", alvo: "gru-eze" }).ok, true);
  assert.equal(registrarEvento({ tipo: "parceiro", local: "saida", alvo: "gru-eze" }).duplicado, true);
  const linhas = (await readFile(path.join(dir, "events.jsonl"), "utf8")).trim().split("\n");
  assert.equal(linhas.length, 1);
  assert.doesNotMatch(linhas[0], /@|query|userAgent/);
});

test("lote 2 item 9: buscas iguais compartilham trabalho e o limite recusa o excesso", async (t) => {
  resetarBuscaAoVivo();
  t.after(() => resetarBuscaAoVivo());

  let idas = 0;
  const limites = { simultaneas: 1, taxa: 10 };
  const params = { origem: "GRU", destino: "REC", ida: "2027-08-12", volta: "2027-08-19", pax: { adultos: 2, criancas: 0, bebes: 0 }, cliente: "teste" };
  let liberar;
  const trava = new Promise((resolve) => {
    liberar = resolve;
  });
  const run = async (signal) => {
    idas += 1;
    await trava;
    return { ok: true, abortado: !!(signal && signal.aborted), idas };
  };
  const a = coordenarBusca(params, run, limites);
  const b = coordenarBusca(params, run, limites);
  const outra = coordenarBusca({ ...params, destino: "SSA" }, run, limites);
  const recusada = await outra;
  assert.equal(recusada.motivo, "capacidade");
  liberar();
  const [ra, rb] = await Promise.all([a, b]);
  assert.equal(idas, 1);
  assert.equal(ra.ok, true);
  assert.equal(rb.ok, true);

  const ac = new AbortController();
  let sinal;
  const pendente = coordenarBusca({ ...params, destino: "FOR", signal: ac.signal }, async (signal) => {
    sinal = signal;
    await new Promise((resolve) => setTimeout(resolve, 30));
    return { ok: true, abortado: signal.aborted };
  }, limites);
  ac.abort();
  await pendente;
  assert.equal(sinal.aborted, true);

  const semCredencial = await Promise.all(Array.from({ length: 25 }, () => buscarVoosAoVivo({ origem: "GRU", destino: "REC" })));
  assert.ok(semCredencial.every((r) => r.motivo === "sem-credencial"));
});

test("lote 2 item 9b: httpRequest respeita o sinal de cancelamento", async (t) => {
  setFetchImpl((_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener("abort", () => {
      const err = new Error("aborted");
      err.name = "AbortError";
      reject(err);
    });
  }));
  t.after(() => resetFetchImpl());
  const ac = new AbortController();
  const pendente = httpRequest("https://example.test/busca", { signal: ac.signal, timeoutMs: 5000, retries: 0 });
  ac.abort();
  const res = await pendente;
  assert.equal(res.ok, false);
  assert.equal(res.error, "busca-cancelada");
});

test("lote 2 item 10: cache e baldes de taxa não crescem sem limite", () => {
  clearHttpCache();
  const anterior = process.env.AONDE_HTTP_CACHE_MAX;
  process.env.AONDE_HTTP_CACHE_MAX = "3";
  try {
    for (let i = 0; i < 8; i++) setCache(`k${i}`, { i }, 10_000, 1_000);
    const stats = httpCacheStats();
    assert.equal(stats.entradas, 3);
    assert.ok(stats.expurgos >= 5);
    assert.equal(getCache("k0", 1_000), undefined);
    assert.deepEqual(getCache("k7", 1_000), { i: 7 });
    for (let i = 0; i < 6; i++) setCache(`exp${i}`, { i }, 5, 0);
    setCache("vivo", { ok: true }, 100, 10);
    const depois = httpCacheStats();
    assert.ok(depois.entradas <= 3);
    assert.equal(getCache("vivo", 10).ok, true);
  } finally {
    if (anterior === undefined) delete process.env.AONDE_HTTP_CACHE_MAX;
    else process.env.AONDE_HTTP_CACHE_MAX = anterior;
    clearHttpCache();
  }

  const now = { t: 0 };
  const lim = createInboundRateLimiter({ now: () => now.t });
  const teto = process.env.AONDE_INBOUND_BUCKETS_MAX;
  const maxReq = process.env.AONDE_INBOUND_RATE_LIMIT_MAX;
  process.env.AONDE_INBOUND_BUCKETS_MAX = "2";
  process.env.AONDE_INBOUND_RATE_LIMIT_MAX = "2";
  try {
    assert.equal(lim.take("rota:a").ok, true);
    assert.equal(lim.take("rota:a").ok, true);
    assert.equal(lim.take("rota:a").ok, false);
    for (let i = 0; i < 6; i++) lim.take(`rota:ip${i}`);
    assert.ok(lim.stats().baldes <= 2);
    assert.ok(lim.stats().expurgos >= 1);
    now.t = 120_000;
    lim.podar();
    assert.equal(lim.stats().baldes, 0);
    assert.equal(lim.take("rota:a").ok, true);
  } finally {
    if (teto === undefined) delete process.env.AONDE_INBOUND_BUCKETS_MAX;
    else process.env.AONDE_INBOUND_BUCKETS_MAX = teto;
    if (maxReq === undefined) delete process.env.AONDE_INBOUND_RATE_LIMIT_MAX;
    else process.env.AONDE_INBOUND_RATE_LIMIT_MAX = maxReq;
  }
});

test("lote 2: /salvos e /api/eventos respondem sem derrubar a navegação", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "aonde-salvos-"));
  const anterior = process.env.AONDE_DATA_DIR;
  process.env.AONDE_DATA_DIR = dir;
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    server.close();
    if (anterior === undefined) delete process.env.AONDE_DATA_DIR;
    else process.env.AONDE_DATA_DIR = anterior;
  });
  const salvos = await fetch(`${base}/salvos`);
  assert.equal(salvos.status, 200);
  const html = await salvos.text();
  assert.match(html, /Viagens salvas/);
  const evento = await fetch(`${base}/api/eventos`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tipo: "busca", local: "formulario", alvo: "" }),
  });
  assert.equal(evento.status, 204);
  const ruim = await fetch(`${base}/api/eventos`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tipo: "busca", local: "formulario", email: "pessoa@example.com" }),
  });
  assert.equal(ruim.status, 204);
  const arquivo = await readFile(path.join(dir, "events.jsonl"), "utf8");
  assert.doesNotMatch(arquivo, /pessoa@example.com/);
  const health = await (await fetch(`${base}/api/health`)).json();
  assert.equal(typeof health.memoria.cache.entradas, "number");
  assert.equal(health.memoria.cache.chaves, undefined);
});
