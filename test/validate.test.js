import test from "node:test";
import assert from "node:assert/strict";
import { searchDeals } from "../src/index.js";

import {
  isIataCode,
  normalizeIata,
  isValidDate,
  validateSearchOptions,
} from "../src/validate.js";

test("busca rejeita limites passados e preserva hoje e meses ainda utilizaveis", () => {
  for (const dia of ["2026-03-15", "2024-02-29", "2026-12-31"]) {
    const [y, m, d] = dia.split("-").map(Number);
    const ontemDate = new Date(Date.UTC(y, m - 1, d - 1));
    const ontem = ontemDate.toISOString().slice(0, 10);
    for (const campo of ["dateFrom", "dateTo"]) {
      for (const data of ["2020-01-01", "2020-01", ontem]) {
        const r = validateSearchOptions({ origin: "GRU", destination: "LIS", [campo]: ` ${data} ` }, dia);
        assert.equal(r.ok, false, `${campo}=${data} em ${dia}`);
        assert.match(r.error, new RegExp(`${campo}.*hoje`));
      }
      for (const data of [dia, dia.slice(0, 7), "2030-01-01", "2030-01"]) {
        const r = validateSearchOptions({ origin: "GRU", destination: "LIS", [campo]: ` ${data} ` }, dia);
        assert.equal(r.ok, true, `${campo}=${data} em ${dia}`);
        assert.equal(r.normalized[campo], data);
      }
    }
  }
  for (const campo of ["dateFrom", "dateTo"]) {
    // Dia de calendario do produto (nao meia-noite UTC, que em SP ainda e fevereiro).
    const r = validateSearchOptions({ origin: "GRU", destination: "LIS", [campo]: "2024-02" }, "2024-03-01");
    assert.equal(r.ok, false);
  }
});

test("busca usa o dia do produto (America/Sao_Paulo), nao UTC puro", () => {
  const options = { origin: "GRU", destination: "LIS", dateFrom: "2026-03-14" };
  // 14/03 23:30 em Brasilia ainda é 14/03; um minuto depois em UTC já é 15/03, mas em SP ainda 14/03.
  assert.equal(validateSearchOptions(options, new Date("2026-03-14T23:30:00-03:00")).ok, true);
  assert.equal(validateSearchOptions(options, "2026-03-14").ok, true);
  assert.equal(validateSearchOptions(options, "2026-03-15").ok, false);
});

test("searchDeals rejeita datas historicas antes de chamar o parceiro", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", () => {
    throw new Error("nao deve chamar HTTP");
  });
  for (const campo of ["dateFrom", "dateTo"]) {
    const r = await searchDeals({ origin: "GRU", destination: "LIS", [campo]: "2020-01-01" });
    assert.equal(r.ok, false);
    assert.deepEqual(r.deals, []);
    assert.match(r.error, new RegExp(`${campo}.*hoje`));
  }
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("busca rejeita origem e destino iguais depois de normalizar", () => {
  const result = validateSearchOptions({ origin: " gru ", destination: "GRU" });
  assert.equal(result.ok, false);
  assert.match(result.error, /origin.*destination/);
});

test("busca rejeita intervalos invertidos, inclusive com meses parciais", () => {
  for (const [dateFrom, dateTo] of [
    ["2026-10-12", "2026-10-11"],
    ["2027-01", "2026-12"],
    ["2026-11", "2026-10-31"],
    ["2026-11-01", "2026-10"],
  ]) {
    const result = validateSearchOptions({ origin: "GRU", destination: "LIS", dateFrom, dateTo }, new Date("2026-09-01T00:00:00Z"));
    assert.equal(result.ok, false, `${dateFrom} > ${dateTo}`);
    assert.match(result.error, /dateTo.*dateFrom/);
  }
});

test("busca aceita mesmo dia, meses sobrepostos e limites opcionais", () => {
  for (const [dateFrom, dateTo] of [
    ["2026-10-12", "2026-10-12"],
    ["2026-10-31", "2026-10"],
    ["2026-10", "2026-10-01"],
    [" 2026-10 ", " 2026-10 "],
    ["2026-10", undefined],
    [undefined, "2026-10"],
  ]) {
    assert.equal(validateSearchOptions({ origin: "GRU", destination: "LIS", dateFrom, dateTo }, new Date("2026-09-01T00:00:00Z")).ok, true);
  }
});

// ---------------------------------------------------------------------------
// isIataCode / normalizeIata
// ---------------------------------------------------------------------------

test("isIataCode aceita 3 letras (case-insensitive) e rejeita o resto", () => {
  assert.equal(isIataCode("GRU"), true);
  assert.equal(isIataCode("gru"), true);
  assert.equal(isIataCode("GruX"), false); // 4 letras
  assert.equal(isIataCode("GRUX"), false);
  assert.equal(isIataCode("12A"), false); // digitos
  assert.equal(isIataCode("GR"), false); // 2 letras
  assert.equal(isIataCode(""), false);
  assert.equal(isIataCode(null), false);
});

test("normalizeIata devolve maiusculas ou null", () => {
  assert.equal(normalizeIata("gru"), "GRU");
  assert.equal(normalizeIata("  lis  "), "LIS");
  assert.equal(normalizeIata("GRUX"), null);
});

// ---------------------------------------------------------------------------
// isValidDate — YYYY-MM e YYYY-MM-DD com checagem real de calendario
// ---------------------------------------------------------------------------

test("isValidDate aceita YYYY-MM e YYYY-MM-DD validos", () => {
  assert.equal(isValidDate("2026-09"), true);
  assert.equal(isValidDate("2026-09-01"), true);
  assert.equal(isValidDate("2024-02-29"), true); // ano bissexto
});

test("isValidDate rejeita datas de calendario invalidas", () => {
  assert.equal(isValidDate("2026-13"), false); // mes 13
  assert.equal(isValidDate("2026-00"), false); // mes 0
  assert.equal(isValidDate("2026-02-30"), false); // fevereiro nao tem 30
  assert.equal(isValidDate("2025-02-29"), false); // 2025 nao e bissexto
  assert.equal(isValidDate("2026-9"), false); // formato invalido (sem zero)
  assert.equal(isValidDate("09/2026"), false);
  assert.equal(isValidDate("hoje"), false);
  assert.equal(isValidDate(null), false);
});

// ---------------------------------------------------------------------------
// validateSearchOptions
// ---------------------------------------------------------------------------

test("validateSearchOptions aceita e normaliza origin/destination", () => {
  const r = validateSearchOptions({ origin: "gru", destination: "Lis" });
  assert.equal(r.ok, true);
  assert.equal(r.normalized.origin, "GRU");
  assert.equal(r.normalized.destination, "LIS");
});

test("validateSearchOptions normaliza e mantem datas validas", () => {
  const r = validateSearchOptions({
    origin: "gru",
    destination: "lis",
    dateFrom: "2026-09",
    dateTo: "2026-09-15",
  }, new Date("2026-09-01T00:00:00Z"));
  assert.equal(r.ok, true);
  assert.equal(r.normalized.dateFrom, "2026-09");
  assert.equal(r.normalized.dateTo, "2026-09-15");
});

test("validateSearchOptions rejeita origin invalido com mensagem clara", () => {
  const r = validateSearchOptions({ origin: "GRUX", destination: "LIS" });
  assert.equal(r.ok, false);
  assert.match(r.error, /origin/);
  assert.match(r.error, /IATA/);
});

test("validateSearchOptions rejeita destination invalido (ex.: 12A)", () => {
  const r = validateSearchOptions({ origin: "GRU", destination: "12A" });
  assert.equal(r.ok, false);
  assert.match(r.error, /destination/);
});

test("validateSearchOptions exige origin e destination", () => {
  const semOrigin = validateSearchOptions({ destination: "LIS" });
  assert.equal(semOrigin.ok, false);
  assert.match(semOrigin.error, /origin/);

  const semDest = validateSearchOptions({ origin: "GRU" });
  assert.equal(semDest.ok, false);
  assert.match(semDest.error, /destination/);
});

test("validateSearchOptions rejeita data invalida com formato esperado na mensagem", () => {
  const r = validateSearchOptions({ origin: "GRU", destination: "LIS", dateFrom: "2026-13" });
  assert.equal(r.ok, false);
  assert.match(r.error, /dateFrom/);
  assert.match(r.error, /YYYY-MM/);
});
