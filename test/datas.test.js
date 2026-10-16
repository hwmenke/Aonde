import test from "node:test";
import assert from "node:assert/strict";
import { parseDataPtBr, dataIdaPadrao, dataVoltaPadrao } from "../src/flights/datas.js";

test("Portuguese dates accept only recognized month names and abbreviations", () => {
  const months = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const abbreviations = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  months.forEach((month, index) => {
    const expected = `2026-${String(index + 1).padStart(2, "0")}-12`;
    assert.equal(parseDataPtBr(`12 de ${month.toUpperCase()} de 2026`), expected);
    assert.equal(parseDataPtBr(`12 ${abbreviations[index]}. 2026`), expected);
    assert.equal(parseDataPtBr(`12 ${month}xyz 2026`), null);
  });
  assert.equal(parseDataPtBr("12 marco 2026"), "2026-03-12");
  assert.equal(parseDataPtBr("12 agenda 2026"), null);
});

test("date parsing validates leap days and calendar boundaries in every format", () => {
  for (const date of ["2024-02-29", "29/02/2024", "29 fevereiro 2024", "2000-02-29"]) {
    assert.equal(parseDataPtBr(date), date.startsWith("2000") ? "2000-02-29" : "2024-02-29");
  }
  for (const date of [
    "2026-02-29", "29/02/2026", "29 fevereiro 2026", "1900-02-29",
    "2026-04-31", "31/04/2026", "31 abril 2026",
    "2026-00-12", "2026-13-12", "2026-01-00", "2026-01-32",
  ]) {
    assert.equal(parseDataPtBr(date), null, date);
  }
});

test("default trip dates use UTC calendar days across leap days and year boundaries", () => {
  assert.equal(dataIdaPadrao(new Date("2026-12-15T23:59:59.999Z")), "2027-01-14");
  assert.equal(dataIdaPadrao(new Date("2024-02-28T23:59:59.999Z"), 1), "2024-02-29");
  assert.equal(dataIdaPadrao(new Date("2026-02-28T00:00:00.000Z"), 1), "2026-03-01");
  assert.equal(dataVoltaPadrao("2026-12-28"), "2027-01-04");
  assert.equal(dataVoltaPadrao("2024-02-28", 2), "2024-03-01");
  assert.equal(dataVoltaPadrao("2026-02-28", 2), "2026-03-02");
  for (const date of ["2026-02-29", "2026-04-31", "28/02/2026", "invalid", null]) {
    assert.equal(dataVoltaPadrao(date), null);
  }
});
