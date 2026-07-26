import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  recordPrices,
  getRouteStats,
  listRoutes,
  priceToCentavos,
  routeKey,
} from "../src/store/priceHistory.js";

// Helper: cria um diretorio temporario, aponta AONDE_DATA_DIR para ele e
// restaura a env + limpa o diretorio no fim do teste.
async function withTempDataDir(t) {
  const original = process.env.AONDE_DATA_DIR;
  const dir = await mkdtemp(path.join(os.tmpdir(), "aonde-history-"));
  process.env.AONDE_DATA_DIR = dir;
  t.after(async () => {
    if (original === undefined) delete process.env.AONDE_DATA_DIR;
    else process.env.AONDE_DATA_DIR = original;
    await rm(dir, { recursive: true, force: true });
  });
  return dir;
}

function makeDeal(price, overrides = {}) {
  return {
    origin: "GRU",
    destination: "LIS",
    departDate: "2026-09-01T10:00:00",
    returnDate: "2026-09-10T10:00:00",
    price,
    currency: "BRL",
    airline: "TP",
    ...overrides,
  };
}

test("priceToCentavos usa Math.round(price*100) e rejeita invalidos", () => {
  assert.equal(priceToCentavos(3200), 320000);
  assert.equal(priceToCentavos(19.99), 1999);
  assert.equal(priceToCentavos(null), null);
  assert.equal(priceToCentavos("x"), null);
});

test("recordPrices grava observacoes e getRouteStats calcula media/min/max", async (t) => {
  await withTempDataDir(t);

  const deals = [makeDeal(1000), makeDeal(2000), makeDeal(3000), makeDeal(4000), makeDeal(5000)];
  const res = recordPrices(deals);
  assert.equal(res.recorded, 5);
  assert.deepEqual(res.routes, ["GRU-LIS"]);

  const stats = getRouteStats("GRU", "LIS");
  assert.equal(stats.ok, true);
  assert.equal(stats.route, "GRU-LIS");
  assert.equal(stats.sampleCount, 5);
  assert.equal(stats.mediaCentavos, 300000); // media de 1000..5000 = 3000 reais
  assert.equal(stats.minCentavos, 100000);
  assert.equal(stats.maxCentavos, 500000);
});

test("getRouteStats retorna ok:false com dados insuficientes", async (t) => {
  await withTempDataDir(t);

  recordPrices([makeDeal(1000), makeDeal(2000)]); // so 2 (< minimo 5)
  const stats = getRouteStats("GRU", "LIS");
  assert.equal(stats.ok, false);
  assert.equal(stats.sampleCount, 2);
  assert.match(stats.error, /insuficiente/i);
});

test("getRouteStats respeita minSamples configuravel", async (t) => {
  await withTempDataDir(t);

  recordPrices([makeDeal(1000), makeDeal(2000)]);
  const stats = getRouteStats("GRU", "LIS", { minSamples: 2 });
  assert.equal(stats.ok, true);
  assert.equal(stats.sampleCount, 2);
});

test("getRouteStats filtra observacoes fora da janela de tempo", async (t) => {
  await withTempDataDir(t);

  // 3 observacoes antigas (100 dias atras) e 3 recentes.
  const old = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();
  recordPrices([makeDeal(9000), makeDeal(9000), makeDeal(9000)], { observedAt: old });
  recordPrices([makeDeal(1000), makeDeal(1000), makeDeal(1000)], { observedAt: now });

  // Janela de 90 dias deve ver so as 3 recentes (minSamples 3 para validar).
  const recent = getRouteStats("GRU", "LIS", { windowDays: 90, minSamples: 3 });
  assert.equal(recent.ok, true);
  assert.equal(recent.sampleCount, 3);
  assert.equal(recent.mediaCentavos, 100000);

  // Janela ampla (200 dias) enxerga as 6.
  const all = getRouteStats("GRU", "LIS", { windowDays: 200, minSamples: 3 });
  assert.equal(all.sampleCount, 6);
});

test("recordPrices ignora deals sem preco numerico ou sem rota", async (t) => {
  await withTempDataDir(t);

  const res = recordPrices([
    makeDeal(1000),
    makeDeal(null),
    makeDeal(2000, { origin: null }),
    { destination: "LIS", price: 3000 }, // sem origin
  ]);
  assert.equal(res.recorded, 1);
});

test("getRouteStats tolera arquivo corrompido sem lancar (recomeca vazio)", async (t) => {
  const dir = await withTempDataDir(t);

  await mkdir(path.join(dir, "history"), { recursive: true });
  await writeFile(path.join(dir, "history", "GRU-LIS.json"), "{ nao e json valido ]", "utf-8");

  // Silencia o console.warn esperado durante este teste.
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const stats = getRouteStats("GRU", "LIS");
    assert.equal(stats.ok, false);
    assert.equal(stats.sampleCount, 0);
  } finally {
    console.warn = originalWarn;
  }
});

test("listRoutes lista as rotas com historico", async (t) => {
  await withTempDataDir(t);

  recordPrices([makeDeal(1000)]);
  recordPrices([makeDeal(2000, { origin: "GIG", destination: "EZE" })]);

  assert.deepEqual(listRoutes(), ["GIG-EZE", "GRU-LIS"]);
});

test("routeKey normaliza para maiusculas", () => {
  assert.equal(routeKey("gru", "lis"), "GRU-LIS");
});
