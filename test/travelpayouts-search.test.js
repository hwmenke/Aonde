import test from "node:test";
import assert from "node:assert/strict";

import {
  searchDealsByPriceRange,
  searchDealsAllPages,
  getDealLinkTravelpayouts,
} from "../src/partners/travelpayouts.js";
import { setFetchImpl, resetFetchImpl } from "../src/http.js";

// -----------------------------------------------------------------------
// Helpers de fixture: resposta ok da Data API com N deals sinteticos
// -----------------------------------------------------------------------

function makeDeal(i, price) {
  return {
    origin: "GRU",
    destination: "LIS",
    price,
    airline: "TP",
    flight_number: String(i),
    departure_at: "2026-09-01T10:00:00",
    return_at: "2026-09-10T10:00:00",
    transfers: 0,
    found_at: "2026-07-20T00:00:00",
    expires_at: "2026-07-27T00:00:00",
    link: `/search/GRULIS${i}`,
  };
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// -----------------------------------------------------------------------
// searchDealsByPriceRange
// -----------------------------------------------------------------------

test("searchDealsByPriceRange retorna ok:false sem TRAVELPAYOUTS_TOKEN", async () => {
  const originalToken = process.env.TRAVELPAYOUTS_TOKEN;
  delete process.env.TRAVELPAYOUTS_TOKEN;

  try {
    const result = await searchDealsByPriceRange({ origin: "GRU", priceMax: 2000 });
    assert.equal(result.ok, false);
    assert.deepEqual(result.deals, []);
    assert.match(result.error, /TRAVELPAYOUTS_TOKEN/);
  } finally {
    if (originalToken !== undefined) process.env.TRAVELPAYOUTS_TOKEN = originalToken;
  }
});

test("searchDealsByPriceRange exige priceMax", async () => {
  const originalToken = process.env.TRAVELPAYOUTS_TOKEN;
  process.env.TRAVELPAYOUTS_TOKEN = "fake-token";

  try {
    const result = await searchDealsByPriceRange({ origin: "GRU" });
    assert.equal(result.ok, false);
    assert.match(result.error, /priceMax/);
  } finally {
    if (originalToken === undefined) delete process.env.TRAVELPAYOUTS_TOKEN;
    else process.env.TRAVELPAYOUTS_TOKEN = originalToken;
  }
});

test("searchDealsByPriceRange exige origin", async () => {
  const originalToken = process.env.TRAVELPAYOUTS_TOKEN;
  process.env.TRAVELPAYOUTS_TOKEN = "fake-token";

  try {
    const result = await searchDealsByPriceRange({ priceMax: 2000 });
    assert.equal(result.ok, false);
    assert.match(result.error, /origin/);
  } finally {
    if (originalToken === undefined) delete process.env.TRAVELPAYOUTS_TOKEN;
    else process.env.TRAVELPAYOUTS_TOKEN = originalToken;
  }
});

test("searchDealsByPriceRange chama search_by_price_range com o filtro de preco na URL e normaliza a resposta", async (t) => {
  const originalToken = process.env.TRAVELPAYOUTS_TOKEN;
  const originalMarker = process.env.TRAVELPAYOUTS_MARKER;
  process.env.TRAVELPAYOUTS_TOKEN = "fake-token";
  process.env.TRAVELPAYOUTS_MARKER = "424242";

  let capturedUrl = null;

  setFetchImpl(async (url, options) => {
    capturedUrl = String(url);
    assert.equal(options.headers["X-Access-Token"], "fake-token");
    return jsonResponse({ success: true, data: [makeDeal(1, 1500)] });
  });

  t.after(() => {
    resetFetchImpl();
    if (originalToken === undefined) delete process.env.TRAVELPAYOUTS_TOKEN;
    else process.env.TRAVELPAYOUTS_TOKEN = originalToken;
    if (originalMarker === undefined) delete process.env.TRAVELPAYOUTS_MARKER;
    else process.env.TRAVELPAYOUTS_MARKER = originalMarker;
  });

  const result = await searchDealsByPriceRange({
    origin: "GRU",
    destination: "LIS",
    priceMin: 500,
    priceMax: 2000,
    oneWay: true,
    direct: false,
  });

  // endpoint correto + params de preco refletidos na URL chamada
  assert.match(capturedUrl, /search_by_price_range/);
  const params = new URL(capturedUrl).searchParams;
  assert.equal(params.get("origin"), "GRU");
  assert.equal(params.get("destination"), "LIS");
  assert.equal(params.get("value_min"), "500");
  assert.equal(params.get("value_max"), "2000");
  assert.equal(params.get("one_way"), "true");
  assert.equal(params.get("direct"), "false");
  assert.equal(params.get("currency"), "BRL");

  // shape normalizado, mesmo de normalizeDataApiItem, com marker aplicado
  assert.equal(result.ok, true);
  assert.equal(result.deals.length, 1);
  const deal = result.deals[0];
  assert.equal(deal.origin, "GRU");
  assert.equal(deal.destination, "LIS");
  assert.equal(deal.price, 1500);
  assert.equal(deal.currency, "BRL");
  assert.match(deal.link, /^https:\/\/tp\.media\/r\?/);
  assert.match(deal.link, /marker=424242/);
});

test("searchDealsByPriceRange funciona sem destination (busca aberta por origem)", async (t) => {
  const originalToken = process.env.TRAVELPAYOUTS_TOKEN;
  process.env.TRAVELPAYOUTS_TOKEN = "fake-token";

  let capturedUrl = null;
  setFetchImpl(async (url) => {
    capturedUrl = String(url);
    return jsonResponse({ success: true, data: [makeDeal(1, 900)] });
  });

  t.after(() => {
    resetFetchImpl();
    if (originalToken === undefined) delete process.env.TRAVELPAYOUTS_TOKEN;
    else process.env.TRAVELPAYOUTS_TOKEN = originalToken;
  });

  const result = await searchDealsByPriceRange({ origin: "GRU", priceMax: 1000 });
  const params = new URL(capturedUrl).searchParams;
  assert.equal(params.has("destination"), false);
  assert.equal(result.ok, true);
  assert.equal(result.deals.length, 1);
});

test("searchDealsByPriceRange retorna ok:false quando a API responde success:false", async (t) => {
  const originalToken = process.env.TRAVELPAYOUTS_TOKEN;
  process.env.TRAVELPAYOUTS_TOKEN = "fake-token";

  setFetchImpl(async () => jsonResponse({ success: false, error: "invalid params" }));

  t.after(() => {
    resetFetchImpl();
    if (originalToken === undefined) delete process.env.TRAVELPAYOUTS_TOKEN;
    else process.env.TRAVELPAYOUTS_TOKEN = originalToken;
  });

  const result = await searchDealsByPriceRange({ origin: "GRU", priceMax: 2000 });
  assert.equal(result.ok, false);
  assert.deepEqual(result.deals, []);
  assert.match(result.error, /invalid params/);
});

test("searchDealsByPriceRange trata falha de rede sem lancar excecao", async (t) => {
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

  const result = await searchDealsByPriceRange({ origin: "GRU", priceMax: 2000 });
  assert.equal(result.ok, false);
  assert.match(result.error, /network down/);
});

// -----------------------------------------------------------------------
// searchDealsAllPages
// -----------------------------------------------------------------------

test("searchDealsAllPages agrega 2 paginas cheias + 1 parcial e para no fim", async (t) => {
  const originalToken = process.env.TRAVELPAYOUTS_TOKEN;
  process.env.TRAVELPAYOUTS_TOKEN = "fake-token";

  const limit = 2;
  const pages = {
    1: [makeDeal(1, 100), makeDeal(2, 200)], // cheia
    2: [makeDeal(3, 300), makeDeal(4, 400)], // cheia
    3: [makeDeal(5, 500)], // parcial (1 < limit) => ultima
  };
  const seenPages = [];

  setFetchImpl(async (url) => {
    const page = Number(new URL(String(url)).searchParams.get("page"));
    seenPages.push(page);
    return jsonResponse({ success: true, data: pages[page] || [] });
  });

  t.after(() => {
    resetFetchImpl();
    if (originalToken === undefined) delete process.env.TRAVELPAYOUTS_TOKEN;
    else process.env.TRAVELPAYOUTS_TOKEN = originalToken;
  });

  const result = await searchDealsAllPages({
    origin: "GRU",
    destination: "LIS",
    limit,
  });

  assert.equal(result.ok, true);
  assert.equal(result.warning, undefined);
  assert.equal(result.deals.length, 5); // 2 + 2 + 1
  assert.deepEqual(seenPages, [1, 2, 3]); // parou apos a pagina parcial
});

test("searchDealsAllPages preserva pagina 1 com warning quando a pagina 2 falha", async (t) => {
  const originalToken = process.env.TRAVELPAYOUTS_TOKEN;
  process.env.TRAVELPAYOUTS_TOKEN = "fake-token";

  const limit = 2;
  setFetchImpl(async (url) => {
    const page = Number(new URL(String(url)).searchParams.get("page"));
    if (page === 1) {
      return jsonResponse({ success: true, data: [makeDeal(1, 100), makeDeal(2, 200)] });
    }
    // pagina 2 falha (HTTP 500)
    return jsonResponse({ error: "boom" }, 500);
  });

  t.after(() => {
    resetFetchImpl();
    if (originalToken === undefined) delete process.env.TRAVELPAYOUTS_TOKEN;
    else process.env.TRAVELPAYOUTS_TOKEN = originalToken;
  });

  const result = await searchDealsAllPages({ origin: "GRU", destination: "LIS", limit });

  assert.equal(result.ok, true); // nao descarta o que ja veio
  assert.equal(result.deals.length, 2); // so a pagina 1
  assert.match(result.warning, /pagina 2/);
});

test("searchDealsAllPages propaga erro (ok:false) quando a pagina 1 falha", async (t) => {
  const originalToken = process.env.TRAVELPAYOUTS_TOKEN;
  process.env.TRAVELPAYOUTS_TOKEN = "fake-token";

  setFetchImpl(async () => jsonResponse({ error: "boom" }, 500));

  t.after(() => {
    resetFetchImpl();
    if (originalToken === undefined) delete process.env.TRAVELPAYOUTS_TOKEN;
    else process.env.TRAVELPAYOUTS_TOKEN = originalToken;
  });

  const result = await searchDealsAllPages({ origin: "GRU", destination: "LIS", limit: 2 });
  assert.equal(result.ok, false);
  assert.deepEqual(result.deals, []);
  assert.ok(result.error);
});

test("searchDealsAllPages respeita maxPages (teto de seguranca)", async (t) => {
  const originalToken = process.env.TRAVELPAYOUTS_TOKEN;
  process.env.TRAVELPAYOUTS_TOKEN = "fake-token";

  const limit = 2;
  const seenPages = [];
  // sempre retorna pagina cheia => so o maxPages interrompe
  setFetchImpl(async (url) => {
    const page = Number(new URL(String(url)).searchParams.get("page"));
    seenPages.push(page);
    return jsonResponse({ success: true, data: [makeDeal(page * 10, 100), makeDeal(page * 10 + 1, 200)] });
  });

  t.after(() => {
    resetFetchImpl();
    if (originalToken === undefined) delete process.env.TRAVELPAYOUTS_TOKEN;
    else process.env.TRAVELPAYOUTS_TOKEN = originalToken;
  });

  const result = await searchDealsAllPages({
    origin: "GRU",
    destination: "LIS",
    limit,
    maxPages: 3,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(seenPages, [1, 2, 3]); // parou no teto
  assert.equal(result.deals.length, 6); // 3 paginas * 2
});

// -----------------------------------------------------------------------
// createLinkViaApi (via getDealLinkTravelpayouts useApi:true): corpo do POST
// no formato confirmado (links = array de objetos {url, sub_id}) e parsing
// tolerante da resposta
// -----------------------------------------------------------------------

test("getDealLinkTravelpayouts (api) monta corpo no formato confirmado: links e array de objetos com sub_id dentro", async (t) => {
  const originalToken = process.env.TRAVELPAYOUTS_TOKEN;
  const originalMarker = process.env.TRAVELPAYOUTS_MARKER;
  process.env.TRAVELPAYOUTS_TOKEN = "fake-token";
  process.env.TRAVELPAYOUTS_MARKER = "339296";

  let capturedBody = null;
  setFetchImpl(async (url, options) => {
    assert.match(String(url), /\/links\/v1\/create$/);
    capturedBody = JSON.parse(options.body);
    return jsonResponse([{ link: "https://tp.media/r?marker=339296&u=x" }]);
  });

  t.after(() => {
    resetFetchImpl();
    if (originalToken === undefined) delete process.env.TRAVELPAYOUTS_TOKEN;
    else process.env.TRAVELPAYOUTS_TOKEN = originalToken;
    if (originalMarker === undefined) delete process.env.TRAVELPAYOUTS_MARKER;
    else process.env.TRAVELPAYOUTS_MARKER = originalMarker;
  });

  const result = await getDealLinkTravelpayouts({
    destinationUrl: "https://www.aviasales.com/search/GRULIS0109",
    useApi: true,
    subId: "home-banner",
    trs: 197987,
    shorten: true,
  });

  // corpo confirmado: links e array de OBJETOS, sub_id dentro do objeto,
  // trs separado (nao marker.subId)
  assert.ok(Array.isArray(capturedBody.links));
  assert.equal(typeof capturedBody.links[0], "object");
  assert.equal(capturedBody.links[0].url, "https://www.aviasales.com/search/GRULIS0109");
  assert.equal(capturedBody.links[0].sub_id, "home-banner");
  assert.equal(capturedBody.marker, "339296");
  assert.equal(capturedBody.shorten, true);
  assert.equal(capturedBody.trs, 197987);

  assert.equal(result.ok, true);
  assert.equal(result.method, "api");
  assert.match(result.url, /^https:\/\/tp\.media\/r\?/);
});

test("createLinkViaApi retorna ok:false com corpo bruto resumido quando a resposta e inesperada", async (t) => {
  const originalToken = process.env.TRAVELPAYOUTS_TOKEN;
  const originalMarker = process.env.TRAVELPAYOUTS_MARKER;
  process.env.TRAVELPAYOUTS_TOKEN = "fake-token";
  process.env.TRAVELPAYOUTS_MARKER = "339296";

  setFetchImpl(async () => jsonResponse({ unexpected: "shape", nada: [1, 2, 3] }));

  t.after(() => {
    resetFetchImpl();
    if (originalToken === undefined) delete process.env.TRAVELPAYOUTS_TOKEN;
    else process.env.TRAVELPAYOUTS_TOKEN = originalToken;
    if (originalMarker === undefined) delete process.env.TRAVELPAYOUTS_MARKER;
    else process.env.TRAVELPAYOUTS_MARKER = originalMarker;
  });

  const result = await getDealLinkTravelpayouts({
    destinationUrl: "https://www.aviasales.com",
    useApi: true,
  });

  assert.equal(result.ok, false);
  assert.equal(result.method, "api");
  assert.match(result.error, /formato inesperado/);
  assert.match(result.error, /unexpected/); // corpo bruto resumido no erro
});
