import test from "node:test";
import assert from "node:assert/strict";

import { buildTpMediaLink, buildAviasalesLink, buildAviasalesSearchPath, parseEditorialRoundTrip, publicAviasalesUrlForOffer, applyEditorialAviasalesWraps } from "../src/partners/travelpayouts.js";
import { getDealLinkTravelpayouts, searchDealsTravelpayouts } from "../src/partners/travelpayouts.js";
import { setFetchImpl, resetFetchImpl } from "../src/http.js";

// -----------------------------------------------------------------------
// buildTpMediaLink: montagem local do link do redirecionador tp.media
// -----------------------------------------------------------------------

test("buildTpMediaLink monta URL correta sem subId", () => {
  const url = buildTpMediaLink({
    marker: "78606",
    programId: 4114,
    url: "https://www.aviasales.com",
  });
  assert.equal(url, "https://tp.media/r?marker=78606&p=4114&u=https%3A%2F%2Fwww.aviasales.com");
});

test("buildTpMediaLink aplica subId ao marker no formato marker.subId", () => {
  const url = buildTpMediaLink({
    marker: "1234567",
    programId: 4114,
    url: "https://www.aviasales.com",
    subId: "WLActions",
  });
  const params = new URL(url).searchParams;
  assert.equal(params.get("marker"), "1234567.WLActions");
});

test("buildTpMediaLink faz encoding correto de URL com caracteres especiais", () => {
  const destino = "https://www.aviasales.com/search/GRULIS0109?adults=2&currency=brl";
  const url = buildTpMediaLink({ marker: "111", programId: 4114, url: destino });
  const params = new URL(url).searchParams;
  // URLSearchParams decodifica automaticamente ao ler — comparamos o valor decodificado
  assert.equal(params.get("u"), destino);
  // mas a string bruta deve conter os caracteres codificados (sem & literal fora de params)
  assert.match(url, /u=https%3A%2F%2Fwww\.aviasales\.com/);
});

test("buildTpMediaLink lanca erro claro quando falta marker/programId/url", () => {
  assert.throws(() => buildTpMediaLink({ programId: 1, url: "https://x.com" }), /marker/);
  assert.throws(() => buildTpMediaLink({ marker: "1", url: "https://x.com" }), /programId/);
  assert.throws(() => buildTpMediaLink({ marker: "1", programId: 1 }), /url/);
});

// -----------------------------------------------------------------------
// buildAviasalesLink: composicao de link a partir de path relativo da Data API
// -----------------------------------------------------------------------

test("buildAviasalesLink compoe URL absoluta a partir de path relativo e aplica marker", () => {
  const url = buildAviasalesLink({ marker: "999", path: "/search/GRULIS0109" });
  assert.match(url, /^https:\/\/tp\.media\/r\?/);
  const params = new URL(url).searchParams;
  assert.equal(params.get("marker"), "999");
  assert.equal(params.get("u"), "https://www.aviasales.com/search/GRULIS0109");
});

test("buildAviasalesLink retorna URL direta (sem tracking) quando nao ha marker", () => {
  const url = buildAviasalesLink({ marker: "", path: "/search/GRULIS0109" });
  assert.equal(url, "https://www.aviasales.com/search/GRULIS0109");
});

test("buildAviasalesLink retorna null quando nao ha path", () => {
  assert.equal(buildAviasalesLink({ marker: "999", path: null }), null);
});

// -----------------------------------------------------------------------
// Path editorial: mesmo formato dos tres locks (GRU1209BUE19091)
// -----------------------------------------------------------------------

test("parseEditorialRoundTrip le ida-e-volta no mesmo mes e entre meses", () => {
  assert.deepEqual(parseEditorialRoundTrip("12–24 out"), {
    departDay: "12",
    departMonth: "10",
    returnDay: "24",
    returnMonth: "10",
  });
  assert.deepEqual(parseEditorialRoundTrip("27 set–3 out"), {
    departDay: "27",
    departMonth: "09",
    returnDay: "03",
    returnMonth: "10",
  });
  assert.deepEqual(parseEditorialRoundTrip("7–14 nov"), {
    departDay: "07",
    departMonth: "11",
    returnDay: "14",
    returnMonth: "11",
  });
});

test("parseEditorialRoundTrip recusa datas que nao sao ida-e-volta", () => {
  assert.equal(parseEditorialRoundTrip(""), null);
  assert.equal(parseEditorialRoundTrip("outubro"), null);
  assert.equal(parseEditorialRoundTrip("12 out"), null);
  assert.equal(parseEditorialRoundTrip("ida livre"), null);
  assert.equal(parseEditorialRoundTrip(null), null);
});

test("buildAviasalesSearchPath reproduz os tres locks", () => {
  assert.equal(
    buildAviasalesSearchPath({
      origin: "GRU",
      destination: "EZE",
      departDay: "12",
      departMonth: "09",
      returnDay: "19",
      returnMonth: "09",
    }),
    "/search/GRU1209BUE19091"
  );
  assert.equal(
    buildAviasalesSearchPath({
      origin: "GRU",
      destination: "FLN",
      departDay: "27",
      departMonth: "09",
      returnDay: "03",
      returnMonth: "10",
    }),
    "/search/GRU2709FLN03101"
  );
  assert.equal(
    buildAviasalesSearchPath({
      origin: "GIG",
      destination: "SSA",
      departDay: "07",
      departMonth: "11",
      returnDay: "14",
      returnMonth: "11",
    }),
    "/search/GIG0711SSA14111"
  );
});

test("publicAviasalesUrlForOffer devolve URL publica sem marker", () => {
  const url = publicAviasalesUrlForOffer({
    origem: "GRU",
    destino: "LIS",
    datas: "12–24 out",
  });
  assert.equal(url, "https://www.aviasales.com/search/GRU1210LIS24101");
  assert.ok(!url.includes("tp.media"));
  assert.ok(!url.includes("marker"));
});

test("applyEditorialAviasalesWraps nao sobrescreve lock e pula datas ilegíveis", () => {
  const lock = { id: "gru-eze", origem: "GRU", destino: "EZE", datas: "12–19 set", aviasalesUrl: "https://www.aviasales.com/search/GRU1209BUE19091" };
  const ok = { id: "cnf-fln", origem: "CNF", destino: "FLN", datas: "14–21 out" };
  const skip = { id: "sem-data", origem: "GRU", destino: "REC", datas: "quando der" };
  const { wrapped, skipped } = applyEditorialAviasalesWraps([lock, ok, skip]);
  assert.equal(lock.aviasalesUrl, "https://www.aviasales.com/search/GRU1209BUE19091");
  assert.equal(ok.aviasalesUrl, "https://www.aviasales.com/search/CNF1410FLN21101");
  assert.equal(skip.aviasalesUrl, undefined);
  assert.deepEqual(wrapped, ["cnf-fln"]);
  assert.deepEqual(skipped, ["sem-data"]);
});

// -----------------------------------------------------------------------
// getDealLinkTravelpayouts: comportamento com credenciais ausentes
// -----------------------------------------------------------------------

test("getDealLinkTravelpayouts retorna ok:false com mensagem clara sem marker configurado", async () => {
  const originalMarker = process.env.TRAVELPAYOUTS_MARKER;
  delete process.env.TRAVELPAYOUTS_MARKER;

  try {
    const result = await getDealLinkTravelpayouts({ destinationUrl: "https://www.aviasales.com" });
    assert.equal(result.ok, false);
    assert.equal(result.partner, "travelpayouts");
    assert.match(result.error, /TRAVELPAYOUTS_MARKER/);
  } finally {
    if (originalMarker !== undefined) process.env.TRAVELPAYOUTS_MARKER = originalMarker;
  }
});

test("getDealLinkTravelpayouts (modo template) retorna link valido quando marker configurado", async () => {
  const originalMarker = process.env.TRAVELPAYOUTS_MARKER;
  process.env.TRAVELPAYOUTS_MARKER = "555555";

  try {
    const result = await getDealLinkTravelpayouts({
      destinationUrl: "https://www.aviasales.com",
      programId: 4114,
    });
    assert.equal(result.ok, true);
    assert.equal(result.method, "template");
    assert.match(result.url, /marker=555555/);
  } finally {
    if (originalMarker === undefined) delete process.env.TRAVELPAYOUTS_MARKER;
    else process.env.TRAVELPAYOUTS_MARKER = originalMarker;
  }
});

test("getDealLinkTravelpayouts (modo api) retorna ok:false sem TRAVELPAYOUTS_TOKEN", async () => {
  const originalMarker = process.env.TRAVELPAYOUTS_MARKER;
  const originalToken = process.env.TRAVELPAYOUTS_TOKEN;
  process.env.TRAVELPAYOUTS_MARKER = "555555";
  delete process.env.TRAVELPAYOUTS_TOKEN;

  try {
    const result = await getDealLinkTravelpayouts({
      destinationUrl: "https://www.aviasales.com",
      useApi: true,
    });
    assert.equal(result.ok, false);
    assert.match(result.error, /TRAVELPAYOUTS_TOKEN/);
  } finally {
    if (originalMarker === undefined) delete process.env.TRAVELPAYOUTS_MARKER;
    else process.env.TRAVELPAYOUTS_MARKER = originalMarker;
    if (originalToken !== undefined) process.env.TRAVELPAYOUTS_TOKEN = originalToken;
  }
});

// -----------------------------------------------------------------------
// searchDealsTravelpayouts: normalizacao da resposta da Data API (com mock)
// -----------------------------------------------------------------------

test("searchDealsTravelpayouts retorna ok:false sem TRAVELPAYOUTS_TOKEN", async () => {
  const originalToken = process.env.TRAVELPAYOUTS_TOKEN;
  delete process.env.TRAVELPAYOUTS_TOKEN;

  try {
    const result = await searchDealsTravelpayouts({ origin: "GRU", destination: "LIS" });
    assert.equal(result.ok, false);
    assert.deepEqual(result.deals, []);
    assert.match(result.error, /TRAVELPAYOUTS_TOKEN/);
  } finally {
    if (originalToken !== undefined) process.env.TRAVELPAYOUTS_TOKEN = originalToken;
  }
});

test("searchDealsTravelpayouts normaliza resposta da Data API e aplica marker no link", async (t) => {
  const originalToken = process.env.TRAVELPAYOUTS_TOKEN;
  const originalMarker = process.env.TRAVELPAYOUTS_MARKER;
  process.env.TRAVELPAYOUTS_TOKEN = "fake-token";
  process.env.TRAVELPAYOUTS_MARKER = "424242";

  const fixture = {
    success: true,
    data: [
      {
        origin: "GRU",
        destination: "LIS",
        price: 3200,
        airline: "TP",
        flight_number: "77",
        departure_at: "2026-09-01T10:00:00",
        return_at: "2026-09-10T10:00:00",
        transfers: 0,
        found_at: "2026-07-20T00:00:00",
        expires_at: "2026-07-27T00:00:00",
        link: "/search/GRULIS0109",
      },
    ],
  };

  setFetchImpl(async (url, options) => {
    assert.match(String(url), /prices_for_dates/);
    assert.equal(options.headers["X-Access-Token"], "fake-token");
    return new Response(JSON.stringify(fixture), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });

  t.after(() => {
    resetFetchImpl();
    if (originalToken === undefined) delete process.env.TRAVELPAYOUTS_TOKEN;
    else process.env.TRAVELPAYOUTS_TOKEN = originalToken;
    if (originalMarker === undefined) delete process.env.TRAVELPAYOUTS_MARKER;
    else process.env.TRAVELPAYOUTS_MARKER = originalMarker;
  });

  const result = await searchDealsTravelpayouts({
    origin: "GRU",
    destination: "LIS",
    dateFrom: "2026-09-01",
  });

  assert.equal(result.ok, true);
  assert.equal(result.deals.length, 1);

  const deal = result.deals[0];
  assert.equal(deal.origin, "GRU");
  assert.equal(deal.destination, "LIS");
  assert.equal(deal.price, 3200);
  assert.equal(deal.currency, "BRL");
  assert.equal(deal.airline, "TP");
  assert.equal(deal.departDate, "2026-09-01T10:00:00");
  assert.match(deal.link, /^https:\/\/tp\.media\/r\?/);
  assert.match(deal.link, /marker=424242/);
});

test("searchDealsTravelpayouts retorna ok:false quando a API responde success:false", async (t) => {
  const originalToken = process.env.TRAVELPAYOUTS_TOKEN;
  process.env.TRAVELPAYOUTS_TOKEN = "fake-token";

  setFetchImpl(async () =>
    new Response(JSON.stringify({ success: false, error: "invalid params" }), { status: 200 })
  );

  t.after(() => {
    resetFetchImpl();
    if (originalToken === undefined) delete process.env.TRAVELPAYOUTS_TOKEN;
    else process.env.TRAVELPAYOUTS_TOKEN = originalToken;
  });

  const result = await searchDealsTravelpayouts({ origin: "GRU", destination: "LIS" });
  assert.equal(result.ok, false);
  assert.match(result.error, /invalid params/);
});

test("searchDealsTravelpayouts trata JSON invalido sem lancar excecao", async (t) => {
  const originalToken = process.env.TRAVELPAYOUTS_TOKEN;
  process.env.TRAVELPAYOUTS_TOKEN = "fake-token";

  setFetchImpl(async () => new Response("<html>not json</html>", { status: 200 }));

  t.after(() => {
    resetFetchImpl();
    if (originalToken === undefined) delete process.env.TRAVELPAYOUTS_TOKEN;
    else process.env.TRAVELPAYOUTS_TOKEN = originalToken;
  });

  const result = await searchDealsTravelpayouts({ origin: "GRU", destination: "LIS" });
  assert.equal(result.ok, false);
  assert.ok(result.error);
});

test("searchDealsTravelpayouts trata falha de rede sem lancar excecao", async (t) => {
  const originalToken = process.env.TRAVELPAYOUTS_TOKEN;
  process.env.TRAVELPAYOUTS_TOKEN = "fake-token";

  setFetchImpl(async () => {
    throw new Error("network down");
  });

  t.after(() => {
    resetFetchImpl();
    if (originalToken === undefined) delete process.env.TRAVELPAYOUTS_TOKEN;
    else process.env.TRAVELPAYOUTS_TOKEN = originalToken;
  });

  const result = await searchDealsTravelpayouts({ origin: "GRU", destination: "LIS" });
  assert.equal(result.ok, false);
  assert.match(result.error, /network down/);
});
