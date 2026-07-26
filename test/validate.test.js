import test from "node:test";
import assert from "node:assert/strict";

import {
  isIataCode,
  normalizeIata,
  isValidDate,
  validateSearchOptions,
} from "../src/validate.js";

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
  });
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
