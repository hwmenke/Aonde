import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { runMonitor } from "../src/monitor.js";
import { listOffers, getOffer } from "../src/store/offersStore.js";
import { setFetchImpl, resetFetchImpl, clearHttpCache } from "../src/http.js";

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

// Ambiente de teste: token fake (a Data API exige), diretorio de dados
// temporario (AONDE_DATA_DIR) e fetch mockado. Restaura tudo no fim.
async function setup(t, fetchImpl) {
  const snap = {
    token: process.env.TRAVELPAYOUTS_TOKEN,
    marker: process.env.TRAVELPAYOUTS_MARKER,
    dataDir: process.env.AONDE_DATA_DIR,
  };
  const dir = await mkdtemp(path.join(os.tmpdir(), "aonde-monitor-"));
  process.env.TRAVELPAYOUTS_TOKEN = "fake-token";
  process.env.TRAVELPAYOUTS_MARKER = "555555";
  process.env.AONDE_DATA_DIR = dir;
  setFetchImpl(fetchImpl);

  t.after(async () => {
    resetFetchImpl();
    for (const [key, envKey] of [
      [snap.token, "TRAVELPAYOUTS_TOKEN"],
      [snap.marker, "TRAVELPAYOUTS_MARKER"],
      [snap.dataDir, "AONDE_DATA_DIR"],
    ]) {
      if (key === undefined) delete process.env[envKey];
      else process.env[envKey] = key;
    }
    await rm(dir, { recursive: true, force: true });
  });
  return dir;
}

test("runMonitor isola a falha de uma rota sem interromper as demais", async (t) => {
  await setup(t, async (url) => {
    const u = String(url);
    if (u.includes("destination=MIA")) {
      // Rota que falha (a API responde success:false).
      return jsonResponse({ success: false, error: "rota indisponivel" });
    }
    // Rotas que funcionam: 6 deals (>= minimo de 5 p/ estatistica).
    const [, dest] = u.match(/destination=([A-Z]{3})/) || [];
    const deals = [1000, 1100, 1200, 1300, 1400, 1500].map((p, i) =>
      apiDeal("GRU", dest || "LIS", p, i)
    );
    return jsonResponse({ success: true, data: deals });
  });

  const result = await runMonitor({
    routes: [
      { origin: "GRU", destination: "LIS" },
      { origin: "GRU", destination: "MIA" },
      { origin: "GRU", destination: "CDG" },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.perRoute["GRU-LIS"].ok, true);
  assert.equal(result.perRoute["GRU-LIS"].dealsFound, 6);
  assert.equal(result.perRoute["GRU-CDG"].ok, true);

  // A rota MIA falhou de forma isolada.
  assert.equal(result.perRoute["GRU-MIA"].ok, false);
  assert.match(result.perRoute["GRU-MIA"].error, /indisponivel/);

  // Duas ofertas geradas (LIS e CDG), nenhuma para MIA.
  assert.equal(result.offers.length, 2);
  const ids = result.offers.map((o) => o.id).sort();
  assert.deepEqual(ids, ["gru-cdg", "gru-lis"]);
});

test("runMonitor faz upsert por id sem duplicar entre rodadas", async (t) => {
  let currentPrice = 1000;
  await setup(t, async (url) => {
    const u = String(url);
    const [, dest] = u.match(/destination=([A-Z]{3})/) || [];
    const deals = [0, 1, 2, 3, 4].map((i) => apiDeal("GRU", dest || "LIS", currentPrice + i * 10, i));
    return jsonResponse({ success: true, data: deals });
  });

  const routes = [{ origin: "GRU", destination: "LIS" }];

  await runMonitor({ routes });
  let stored = listOffers();
  assert.equal(stored.length, 1);
  const firstUpdated = stored[0].updated_at;
  const firstCreated = stored[0].created_at;
  assert.equal(stored[0].preco_centavos, 100000);

  // Segunda rodada com preco menor: mesmo id, atualiza preco/timestamp, sem duplicar.
  // A camada HTTP cacheia GETs da Data API (15 min); numa producao com cron, cada
  // rodada e um processo novo (sem cache compartilhado). No teste, limpamos o cache
  // para simular uma nova coleta.
  clearHttpCache();
  currentPrice = 800;
  await new Promise((r) => setTimeout(r, 5)); // garante timestamp diferente
  await runMonitor({ routes });
  stored = listOffers();
  assert.equal(stored.length, 1, "nao deve duplicar a oferta da mesma rota");
  assert.equal(stored[0].preco_centavos, 80000);
  assert.equal(stored[0].created_at, firstCreated, "created_at preservado");
  assert.notEqual(stored[0].updated_at, firstUpdated, "updated_at atualizado");

  assert.ok(getOffer("gru-lis"));
});

test("runMonitor marca is_erro_tarifa quando ha desconto forte e amostra suficiente", async (t) => {
  await setup(t, async (url) => {
    const u = String(url);
    const [, dest] = u.match(/destination=([A-Z]{3})/) || [];
    // 11 deals caros + 1 baratissimo -> media alta, melhor deal com desconto ~89%.
    const deals = [];
    for (let i = 0; i < 11; i++) deals.push(apiDeal("GRU", dest || "LIS", 1000, i));
    deals.push(apiDeal("GRU", dest || "LIS", 100, 99));
    return jsonResponse({ success: true, data: deals });
  });

  const result = await runMonitor({ routes: [{ origin: "GRU", destination: "LIS" }] });
  assert.equal(result.offers.length, 1);
  const offer = result.offers[0];
  assert.equal(offer.is_erro_tarifa, true);
  assert.match(offer.fare_error_reason, /Suspeita de erro de tarifa/i);
  assert.equal(result.perRoute["GRU-LIS"].isFareError, true);
});

test("runMonitor retorna ok:false quando todas as rotas falham", async (t) => {
  await setup(t, async () => jsonResponse({ success: false, error: "falha geral" }));

  const result = await runMonitor({ routes: [{ origin: "GRU", destination: "LIS" }] });
  assert.equal(result.ok, false);
  assert.equal(result.perRoute["GRU-LIS"].ok, false);
  assert.equal(result.offers.length, 0);
});
