import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  recordPrices,
  getRouteStats,
  getRouteSeries,
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

test("getRouteStats tolera arquivo corrompido sem lancar e sem apagar o arquivo", async (t) => {
  const dir = await withTempDataDir(t);
  const arquivo = path.join(dir, "history", "GRU-LIS.json");
  const bruto = "{ nao e json valido ]";

  await mkdir(path.join(dir, "history"), { recursive: true });
  await writeFile(arquivo, bruto, "utf-8");

  const originalError = console.error;
  console.error = () => {};
  try {
    const stats = getRouteStats("GRU", "LIS");
    assert.equal(stats.ok, false);
    assert.equal(stats.sampleCount, 0);
    assert.equal(stats.error, "dados-ilegíveis");
    assert.equal(recordPrices([makeDeal(1000)]).recorded, 0);
    assert.equal(await readFile(arquivo, "utf-8"), bruto);
  } finally {
    console.error = originalError;
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

for (const query of [getRouteStats, getRouteSeries]) {
  test(`${query.name} isolates currencies and excludes legacy rows`, async (t) => {
    const dir = await withTempDataDir(t);
    recordPrices([
      makeDeal(1000), makeDeal(1200, { currency: "brl" }),
      makeDeal(10000, { currency: "USD" }), makeDeal(12000, { currency: "usd" }),
      makeDeal(99999, { currency: null }),
    ]);
    // A legacy row can lack the currency field entirely.
    const file = path.join(dir, "history", "GRU-LIS.json");
    const rows = JSON.parse(await readFile(file, "utf-8"));
    rows.push({ observedAt: new Date().toISOString(), price: 99999 });
    await writeFile(file, JSON.stringify(rows));

    for (const options of [{ minSamples: 2 }, { minSamples: 2, currency: "bRl" }]) {
      const brl = query("GRU", "LIS", options);
      assert.equal(brl.ok, true);
      assert.equal(brl.currency, "BRL");
      assert.equal(brl.sampleCount, 2);
      assert.equal(brl.mediaCentavos, 110000);
      assert.equal(brl.minCentavos, 100000);
      assert.equal(brl.maxCentavos, 120000);
      if (brl.points) assert.deepEqual(brl.points.map(p => p.priceCentavos), [100000, 120000]);
    }
    const usd = query("GRU", "LIS", { minSamples: 2, currency: "usd" });
    assert.equal(usd.ok, true);
    assert.equal(usd.currency, "USD");
    assert.equal(usd.sampleCount, 2);
    assert.equal(usd.mediaCentavos, 1100000);
    assert.equal(usd.minCentavos, 1000000);
    assert.equal(usd.maxCentavos, 1200000);
    if (usd.points) assert.deepEqual(usd.points.map(p => p.priceCentavos), [1000000, 1200000]);
    const insufficient = query("GRU", "LIS");
    assert.equal(insufficient.ok, false);
    assert.equal(insufficient.currency, "BRL");
    assert.equal(insufficient.sampleCount, 2);
  });
}

for (const query of [getRouteStats, getRouteSeries]) {
  test(`${query.name} skips invalid legacy prices without rewriting history`, async (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-07-22T12:00:00Z") });
    const dir = await withTempDataDir(t);
    const file = path.join(dir, "history", "GRU-LIS.json");
    await mkdir(path.dirname(file), { recursive: true });
    const raw = JSON.stringify([0, -10, 100, 100, 100].map(price => ({
      price, currency: "BRL", observedAt: new Date().toISOString(),
    })));
    await writeFile(file, raw);
    const stats = query("GRU", "LIS");
    assert.equal(stats.sampleCount, 3, JSON.stringify(stats));
    assert.equal(stats.ok, false);
    const usable = query("GRU", "LIS", { minSamples: 3 });
    assert.equal(usable.ok, true);
    assert.equal(usable.mediaCentavos, 10000);
    assert.equal(usable.minCentavos, 10000);
    assert.equal(usable.maxCentavos, 10000);
    if (usable.points) assert.deepEqual(usable.points.map(p => p.priceCentavos), [10000, 10000, 10000]);
    assert.equal(await readFile(file, "utf-8"), raw);
  });
}

test("recordPrices rejects invalid converted cents and preserves valid rounding", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-07-22T12:00:00Z") });
  await withTempDataDir(t);
  for (const price of [0, -10, 0.001, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER]) {
    assert.equal(priceToCentavos(price), null, String(price));
  }
  assert.equal(priceToCentavos(1.235), 124);
  const result = recordPrices([0, -10, 0.001, NaN, Infinity, Number.MAX_SAFE_INTEGER, 1.235, 100].map(p => makeDeal(p)));
  assert.equal(result.recorded, 2);
  const stats = getRouteStats("GRU", "LIS", { minSamples: 2 });
  assert.equal(stats.sampleCount, 2);
  assert.equal(stats.minCentavos, 124);
  assert.equal(stats.maxCentavos, 10000);
  assert.equal(stats.mediaCentavos, 5062);
});
