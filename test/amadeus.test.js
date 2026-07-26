import test from "node:test";
import assert from "node:assert/strict";

import {
  getTypicalPrices,
  hasAmadeusCredentials,
  resetAmadeusState,
  setAmadeusClock,
} from "../src/partners/amadeus.js";
import { setFetchImpl, resetFetchImpl } from "../src/http.js";

// -----------------------------------------------------------------------
// Helpers de fixture
// -----------------------------------------------------------------------

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Resposta padrao do endpoint de token OAuth2.
function tokenResponse(accessToken = "tok-abc", expiresIn = 1800) {
  return jsonResponse({
    type: "amadeusOAuth2Token",
    access_token: accessToken,
    expires_in: expiresIn,
    token_type: "Bearer",
  });
}

// Resposta padrao do endpoint itinerary-price-metrics (shape a-validar).
function metricsResponse({
  min = "100.00",
  first = "200.00",
  medium = "300.00",
  third = "400.00",
  max = "500.00",
} = {}) {
  return jsonResponse({
    data: [
      {
        type: "itinerary-price-metric",
        origin: { iataCode: "GRU" },
        destination: { iataCode: "LIS" },
        departureDate: "2026-09-01",
        transportType: "FLIGHT",
        currencyCode: "BRL",
        oneWay: false,
        priceMetrics: [
          { amount: min, quartileRanking: "MINIMUM" },
          { amount: first, quartileRanking: "FIRST" },
          { amount: medium, quartileRanking: "MEDIUM" },
          { amount: third, quartileRanking: "THIRD" },
          { amount: max, quartileRanking: "MAXIMUM" },
        ],
      },
    ],
  });
}

// Prepara credenciais + fetch mock; restaura tudo no fim (inclui o estado
// interno do token cacheado, via resetAmadeusState).
function setup(t, fetchImpl) {
  const snap = {
    id: process.env.AMADEUS_CLIENT_ID,
    secret: process.env.AMADEUS_CLIENT_SECRET,
    env: process.env.AMADEUS_ENV,
  };
  process.env.AMADEUS_CLIENT_ID = "client-id";
  process.env.AMADEUS_CLIENT_SECRET = "client-secret";
  delete process.env.AMADEUS_ENV; // default test
  resetAmadeusState();
  setFetchImpl(fetchImpl);

  t.after(() => {
    resetFetchImpl();
    resetAmadeusState();
    for (const [key, envKey] of [
      [snap.id, "AMADEUS_CLIENT_ID"],
      [snap.secret, "AMADEUS_CLIENT_SECRET"],
      [snap.env, "AMADEUS_ENV"],
    ]) {
      if (key === undefined) delete process.env[envKey];
      else process.env[envKey] = key;
    }
  });
}

// -----------------------------------------------------------------------
// Credenciais ausentes
// -----------------------------------------------------------------------

test("getTypicalPrices retorna ok:false com instrucao pt-BR sem credenciais", async (t) => {
  const snap = {
    id: process.env.AMADEUS_CLIENT_ID,
    secret: process.env.AMADEUS_CLIENT_SECRET,
  };
  delete process.env.AMADEUS_CLIENT_ID;
  delete process.env.AMADEUS_CLIENT_SECRET;
  resetAmadeusState();

  t.after(() => {
    if (snap.id === undefined) delete process.env.AMADEUS_CLIENT_ID;
    else process.env.AMADEUS_CLIENT_ID = snap.id;
    if (snap.secret === undefined) delete process.env.AMADEUS_CLIENT_SECRET;
    else process.env.AMADEUS_CLIENT_SECRET = snap.secret;
  });

  assert.equal(hasAmadeusCredentials(), false);
  const result = await getTypicalPrices({
    origin: "GRU",
    destination: "LIS",
    departureDate: "2026-09-01",
  });
  assert.equal(result.ok, false);
  assert.equal(result.partner, "amadeus");
  assert.match(result.error, /AMADEUS_CLIENT_ID/);
  assert.match(result.error, /developers\.amadeus\.com/);
});

// -----------------------------------------------------------------------
// Fluxo OAuth + quartis em centavos
// -----------------------------------------------------------------------

test("getTypicalPrices faz OAuth e converte quartis para centavos", async (t) => {
  const calls = { token: 0, metrics: 0 };
  setup(t, async (url, options) => {
    const u = String(url);
    if (u.includes("/v1/security/oauth2/token")) {
      calls.token++;
      // form-urlencoded com grant_type=client_credentials
      assert.match(u, /^https:\/\/test\.api\.amadeus\.com/);
      assert.equal(options.headers["Content-Type"], "application/x-www-form-urlencoded");
      assert.match(options.body, /grant_type=client_credentials/);
      assert.match(options.body, /client_id=client-id/);
      return tokenResponse("tok-abc", 1800);
    }
    if (u.includes("/v1/analytics/itinerary-price-metrics")) {
      calls.metrics++;
      assert.equal(options.headers.Authorization, "Bearer tok-abc");
      assert.match(u, /originIataCode=GRU/);
      assert.match(u, /destinationIataCode=LIS/);
      assert.match(u, /departureDate=2026-09-01/);
      assert.match(u, /currencyCode=BRL/);
      return metricsResponse();
    }
    throw new Error(`URL inesperada: ${u}`);
  });

  const result = await getTypicalPrices({
    origin: "GRU",
    destination: "LIS",
    departureDate: "2026-09-01",
  });

  assert.equal(result.ok, true);
  assert.equal(result.partner, "amadeus");
  assert.equal(result.route, "GRU-LIS");
  assert.equal(result.currency, "BRL");
  // Valores em centavos (Math.round(x*100)).
  assert.deepEqual(result.quartiles, {
    min: 10000,
    first: 20000,
    median: 30000,
    third: 40000,
    max: 50000,
  });
  assert.equal(calls.token, 1);
  assert.equal(calls.metrics, 1);
});

test("getTypicalPrices normaliza origin/destination minusculos e monta a query", async (t) => {
  setup(t, async (url) => {
    const u = String(url);
    if (u.includes("/oauth2/token")) return tokenResponse();
    assert.match(u, /originIataCode=GRU/);
    assert.match(u, /destinationIataCode=LIS/);
    assert.match(u, /oneWay=true/);
    return metricsResponse();
  });

  const result = await getTypicalPrices({
    origin: "gru",
    destination: "lis",
    departureDate: "2026-09-01",
    oneWay: true,
  });
  assert.equal(result.ok, true);
  assert.equal(result.route, "GRU-LIS");
  assert.equal(result.oneWay, true);
});

// -----------------------------------------------------------------------
// Cache de token: pedido 1x e reusado; renovado apos expirar
// -----------------------------------------------------------------------

test("getTypicalPrices pede token 1x e reusa em chamadas seguintes", async (t) => {
  const calls = { token: 0 };
  setup(t, async (url) => {
    const u = String(url);
    if (u.includes("/oauth2/token")) {
      calls.token++;
      return tokenResponse("tok-reuse", 1800);
    }
    return metricsResponse();
  });

  const a = await getTypicalPrices({ origin: "GRU", destination: "LIS", departureDate: "2026-09-01" });
  const b = await getTypicalPrices({ origin: "GRU", destination: "MIA", departureDate: "2026-09-01" });
  const c = await getTypicalPrices({ origin: "GIG", destination: "EZE", departureDate: "2026-09-01" });

  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  assert.equal(c.ok, true);
  // Token pedido uma unica vez, reusado nas 3 consultas.
  assert.equal(calls.token, 1);
});

test("getTypicalPrices renova o token apos expirar (com margem)", async (t) => {
  const calls = { token: 0 };
  let clock = 0;
  setup(t, async (url) => {
    const u = String(url);
    if (u.includes("/oauth2/token")) {
      calls.token++;
      return tokenResponse(`tok-${calls.token}`, 1800); // 1800s de validade
    }
    return metricsResponse();
  });
  setAmadeusClock(() => clock);

  // 1a chamada: pede token (validade 1800s = 1.800.000ms, margem 60s ->
  // expira, no relogio interno, em 1.740.000ms).
  await getTypicalPrices({ origin: "GRU", destination: "LIS", departureDate: "2026-09-01" });
  assert.equal(calls.token, 1);

  // Avanca menos que a validade menos a margem: ainda reusa.
  clock = 1_000_000;
  await getTypicalPrices({ origin: "GRU", destination: "LIS", departureDate: "2026-09-01" });
  assert.equal(calls.token, 1);

  // Avanca alem da validade com margem: renova.
  clock = 1_800_000;
  await getTypicalPrices({ origin: "GRU", destination: "LIS", departureDate: "2026-09-01" });
  assert.equal(calls.token, 2);
});

// -----------------------------------------------------------------------
// Validacao de entrada (IATA / data)
// -----------------------------------------------------------------------

test("getTypicalPrices valida origin/destination IATA sem tocar a rede", async (t) => {
  let fetched = false;
  setup(t, async () => {
    fetched = true;
    return metricsResponse();
  });

  const bad1 = await getTypicalPrices({ origin: "XX", destination: "LIS", departureDate: "2026-09-01" });
  assert.equal(bad1.ok, false);
  assert.match(bad1.error, /origin invalido/);

  const bad2 = await getTypicalPrices({ origin: "GRU", destination: "LISBON", departureDate: "2026-09-01" });
  assert.equal(bad2.ok, false);
  assert.match(bad2.error, /destination invalido/);

  assert.equal(fetched, false, "nao deve tocar a rede quando a validacao falha");
});

test("getTypicalPrices exige departureDate no formato YYYY-MM-DD", async (t) => {
  setup(t, async () => metricsResponse());

  const missing = await getTypicalPrices({ origin: "GRU", destination: "LIS" });
  assert.equal(missing.ok, false);
  assert.match(missing.error, /departureDate/);

  // YYYY-MM (sem dia) nao serve para este endpoint.
  const partial = await getTypicalPrices({
    origin: "GRU",
    destination: "LIS",
    departureDate: "2026-09",
  });
  assert.equal(partial.ok, false);
  assert.match(partial.error, /departureDate/);
});

// -----------------------------------------------------------------------
// Respostas malformadas / erros
// -----------------------------------------------------------------------

test("getTypicalPrices trata resposta de metricas malformada (ok:false com corpo)", async (t) => {
  setup(t, async (url) => {
    const u = String(url);
    if (u.includes("/oauth2/token")) return tokenResponse();
    // Sem priceMetrics reconheciveis.
    return jsonResponse({ data: [{ foo: "bar" }] });
  });

  const result = await getTypicalPrices({
    origin: "GRU",
    destination: "LIS",
    departureDate: "2026-09-01",
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /formato inesperado/);
});

test("getTypicalPrices trata token OAuth malformado (sem access_token)", async (t) => {
  setup(t, async (url) => {
    const u = String(url);
    if (u.includes("/oauth2/token")) return jsonResponse({ error: "invalid_client" });
    return metricsResponse();
  });

  const result = await getTypicalPrices({
    origin: "GRU",
    destination: "LIS",
    departureDate: "2026-09-01",
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /token OAuth2/);
});

test("getTypicalPrices trata falha HTTP no endpoint de metricas", async (t) => {
  setup(t, async (url) => {
    const u = String(url);
    if (u.includes("/oauth2/token")) return tokenResponse();
    return jsonResponse({ errors: [{ detail: "boom" }] }, 500);
  });

  const result = await getTypicalPrices({
    origin: "GRU",
    destination: "LIS",
    departureDate: "2026-09-01",
  });
  assert.equal(result.ok, false);
  assert.ok(result.error);
});

// -----------------------------------------------------------------------
// AMADEUS_ENV=production seleciona a base de producao
// -----------------------------------------------------------------------

test("getTypicalPrices usa a base de producao quando AMADEUS_ENV=production", async (t) => {
  setup(t, async (url) => {
    const u = String(url);
    assert.match(u, /^https:\/\/api\.amadeus\.com/);
    if (u.includes("/oauth2/token")) return tokenResponse();
    return metricsResponse();
  });
  process.env.AMADEUS_ENV = "production";

  const result = await getTypicalPrices({
    origin: "GRU",
    destination: "LIS",
    departureDate: "2026-09-01",
  });
  assert.equal(result.ok, true);
});

// -----------------------------------------------------------------------
// Tolerancia de parsing: quartis parciais / chaves alternativas
// -----------------------------------------------------------------------

test("getTypicalPrices tolera quartis parciais (median presente, min ausente)", async (t) => {
  setup(t, async (url) => {
    const u = String(url);
    if (u.includes("/oauth2/token")) return tokenResponse();
    return jsonResponse({
      data: [
        {
          priceMetrics: [
            { amount: "300.50", quartileRanking: "MEDIUM" },
            { amount: "500.00", quartileRanking: "MAXIMUM" },
          ],
        },
      ],
    });
  });

  const result = await getTypicalPrices({
    origin: "GRU",
    destination: "LIS",
    departureDate: "2026-09-01",
  });
  assert.equal(result.ok, true);
  assert.equal(result.quartiles.median, 30050);
  assert.equal(result.quartiles.max, 50000);
  assert.equal(result.quartiles.min, null);
  assert.equal(result.quartiles.first, null);
});
