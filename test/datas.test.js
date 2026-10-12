import test from "node:test";
import assert from "node:assert/strict";
import { parseDataPtBr } from "../src/flights/datas.js";

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
