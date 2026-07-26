import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { runMonitor } from "../src/monitor.js";
import { setFetchImpl, resetFetchImpl } from "../src/http.js";
import { resetAmadeusState } from "../src/partners/amadeus.js";

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function apiDeal(origin, destination, price, i) {
  return {
    origin,
    destination,
    price,
    airline: "TP",
    flight_number: String(i),
    departure_at: "2026-09-01T10:00:00",
    return_at: "2026-09-10T10:00:00",
    transfers: 0,
    found_at: "2026-07-20T00:00:00",
    expires_at: "2026-07-27T00:00:00",
    link: `/search/${origin}${destination}${i}`,
  };
}

// Resposta da Amadeus itinerary-price-metrics com mediana definida (em reais).
function amadeusMetrics(medianReais = "300.00") {
  return jsonResponse({
    data: [
      {
        priceMetrics: [
          { amount: "100.00", quartileRanking: "MINIMUM" },
          { amount: "200.00", quartileRanking: "FIRST" },
          { amount: medianReais, quartileRanking: "MEDIUM" },
          { amount: "400.00", quartileRanking: "THIRD" },
          { amount: "500.00", quartileRanking: "MAXIMUM" },
        ],
      },
    ],
  });
}

function amadeusToken() {
  return jsonResponse({ access_token: "tok-fallback", expires_in: 1800, token_type: "Bearer" });
}

// Ambiente: token/marker Travelpayouts, credenciais Amadeus, diretorio de dados
// temporario e fetch mockado. Restaura tudo (inclui estado do token Amadeus).
async function setup(t, fetchImpl, { amadeusCreds = true } = {}) {
  const snap = {
    token: process.env.TRAVELPAYOUTS_TOKEN,
    marker: process.env.TRAVELPAYOUTS_MARKER,
    dataDir: process.env.AONDE_DATA_DIR,
    amaId: process.env.AMADEUS_CLIENT_ID,
    amaSecret: process.env.AMADEUS_CLIENT_SECRET,
    amaEnv: process.env.AMADEUS_ENV,
  };
  const dir = await mkdtemp(path.join(os.tmpdir(), "aonde-fallback-"));
  process.env.TRAVELPAYOUTS_TOKEN = "fake-token";
  process.env.TRAVELPAYOUTS_MARKER = "555555";
  process.env.AONDE_DATA_DIR = dir;
  if (amadeusCreds) {
    process.env.AMADEUS_CLIENT_ID = "client-id";
    process.env.AMADEUS_CLIENT_SECRET = "client-secret";
  } else {
    delete process.env.AMADEUS_CLIENT_ID;
    delete process.env.AMADEUS_CLIENT_SECRET;
  }
  delete process.env.AMADEUS_ENV;
  resetAmadeusState();
  setFetchImpl(fetchImpl);

  t.after(async () => {
    resetFetchImpl();
    resetAmadeusState();
    for (const [key, envKey] of [
      [snap.token, "TRAVELPAYOUTS_TOKEN"],
      [snap.marker, "TRAVELPAYOUTS_MARKER"],
      [snap.dataDir, "AONDE_DATA_DIR"],
      [snap.amaId, "AMADEUS_CLIENT_ID"],
      [snap.amaSecret, "AMADEUS_CLIENT_SECRET"],
      [snap.amaEnv, "AMADEUS_ENV"],
    ]) {
      if (key === undefined) delete process.env[envKey];
      else process.env[envKey] = key;
    }
    await rm(dir, { recursive: true, force: true });
  });
  return dir;
}

test("monitor: historico insuficiente + fallback amadeus usa a mediana e marca statsSource", async (t) => {
  const calls = { amadeusToken: 0, amadeusMetrics: 0 };
  await setup(t, async (url) => {
    const u = String(url);
    if (u.includes("prices_for_dates")) {
      // Apenas 2 deals (< minimo de 5): historico insuficiente.
      const deals = [100, 120].map((p, i) => apiDeal("GRU", "LIS", p, i));
      return jsonResponse({ success: true, data: deals });
    }
    if (u.includes("/oauth2/token")) {
      calls.amadeusToken++;
      return amadeusToken();
    }
    if (u.includes("itinerary-price-metrics")) {
      calls.amadeusMetrics++;
      return amadeusMetrics("300.00"); // mediana 300 reais -> 30000 centavos
    }
    throw new Error(`URL inesperada: ${u}`);
  });

  const result = await runMonitor({
    routes: [{ origin: "GRU", destination: "LIS" }],
    mediaFallback: "amadeus",
  });

  assert.equal(result.ok, true);
  const info = result.perRoute["GRU-LIS"];
  assert.equal(info.ok, true);
  assert.equal(info.statsSource, "amadeus-median");
  assert.equal(info.mediaCentavos, 30000);
  assert.equal(info.statsUsed, null, "historico proprio permanece insuficiente");

  assert.equal(result.offers.length, 1);
  const offer = result.offers[0];
  // Melhor deal = 100 reais -> 10000 centavos; media Amadeus 30000 -> desconto ~67%.
  assert.equal(offer.preco_centavos, 10000);
  assert.equal(offer.media_centavos, 30000);
  assert.equal(offer.desconto_pct, 67);
  // Erro de tarifa NAO e sinalizado pela media Amadeus (sem sampleCount proprio).
  assert.equal(offer.is_erro_tarifa, false);

  assert.equal(calls.amadeusToken, 1);
  assert.equal(calls.amadeusMetrics, 1);
});

test("monitor: fallback amadeus falhando NAO derruba a rota (segue sem media)", async (t) => {
  await setup(t, async (url) => {
    const u = String(url);
    if (u.includes("prices_for_dates")) {
      const deals = [100, 120].map((p, i) => apiDeal("GRU", "LIS", p, i));
      return jsonResponse({ success: true, data: deals });
    }
    if (u.includes("/oauth2/token")) return amadeusToken();
    if (u.includes("itinerary-price-metrics")) {
      return jsonResponse({ errors: [{ detail: "indisponivel" }] }, 500);
    }
    throw new Error(`URL inesperada: ${u}`);
  });

  const result = await runMonitor({
    routes: [{ origin: "GRU", destination: "LIS" }],
    mediaFallback: "amadeus",
  });

  assert.equal(result.ok, true);
  const info = result.perRoute["GRU-LIS"];
  assert.equal(info.ok, true, "rota nao e derrubada pela falha da Amadeus");
  assert.equal(info.statsSource, null);
  assert.equal(info.mediaCentavos, null);

  // Oferta ainda e gerada, apenas sem media/desconto.
  assert.equal(result.offers.length, 1);
  const offer = result.offers[0];
  assert.equal(offer.preco_centavos, 10000);
  assert.equal(offer.media_centavos, null);
  assert.equal(offer.desconto_pct, null);
});

test("monitor: default (mediaFallback none) nao chama a Amadeus mesmo com credenciais", async (t) => {
  const calls = { amadeus: 0 };
  await setup(t, async (url) => {
    const u = String(url);
    if (u.includes("prices_for_dates")) {
      const deals = [100, 120].map((p, i) => apiDeal("GRU", "LIS", p, i));
      return jsonResponse({ success: true, data: deals });
    }
    if (u.includes("amadeus.com")) {
      calls.amadeus++;
      return amadeusToken();
    }
    throw new Error(`URL inesperada: ${u}`);
  });

  const result = await runMonitor({
    routes: [{ origin: "GRU", destination: "LIS" }],
    // mediaFallback omitido -> default "none"
  });

  assert.equal(result.ok, true);
  const info = result.perRoute["GRU-LIS"];
  assert.equal(info.ok, true);
  assert.equal(info.statsSource, null, "sem historico e sem fallback -> sem fonte de media");
  assert.equal(info.mediaCentavos, null);
  assert.equal(calls.amadeus, 0, "Amadeus nao deve ser chamada no modo default");

  const offer = result.offers[0];
  assert.equal(offer.media_centavos, null);
});

test("monitor: fallback amadeus ignorado quando faltam credenciais", async (t) => {
  const calls = { amadeus: 0 };
  await setup(
    t,
    async (url) => {
      const u = String(url);
      if (u.includes("prices_for_dates")) {
        const deals = [100, 120].map((p, i) => apiDeal("GRU", "LIS", p, i));
        return jsonResponse({ success: true, data: deals });
      }
      if (u.includes("amadeus.com")) {
        calls.amadeus++;
        return amadeusToken();
      }
      throw new Error(`URL inesperada: ${u}`);
    },
    { amadeusCreds: false }
  );

  const result = await runMonitor({
    routes: [{ origin: "GRU", destination: "LIS" }],
    mediaFallback: "amadeus",
  });

  assert.equal(result.ok, true);
  const info = result.perRoute["GRU-LIS"];
  assert.equal(info.statsSource, null);
  assert.equal(info.mediaCentavos, null);
  assert.equal(calls.amadeus, 0, "sem credenciais Amadeus, o fallback e ignorado");
});
