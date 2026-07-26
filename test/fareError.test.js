import test from "node:test";
import assert from "node:assert/strict";

import { detectFareError } from "../src/fareError.js";

test("sinaliza erro de tarifa com amostra suficiente e desconto acima do limiar", () => {
  const r = detectFareError({ precoCentavos: 30000, mediaCentavos: 100000, sampleCount: 12 });
  assert.equal(r.isFareError, true);
  assert.equal(r.discountPct, 70);
  assert.match(r.reason, /Suspeita de erro de tarifa/i);
});

test("NAO sinaliza quando a amostra e insuficiente (mesmo com desconto alto)", () => {
  const r = detectFareError({ precoCentavos: 30000, mediaCentavos: 100000, sampleCount: 3 });
  assert.equal(r.isFareError, false);
  assert.equal(r.discountPct, 70);
  assert.match(r.reason, /amostra insuficiente/i);
});

test("NAO sinaliza quando o desconto fica abaixo do limiar", () => {
  const r = detectFareError({ precoCentavos: 80000, mediaCentavos: 100000, sampleCount: 20 });
  assert.equal(r.isFareError, false);
  assert.equal(r.discountPct, 20);
  assert.match(r.reason, /abaixo do limiar/i);
});

test("respeita minDiscountPct e minSamples customizados", () => {
  // desconto 50% >= 40% e amostra 5 >= 3 -> sinaliza
  const r = detectFareError(
    { precoCentavos: 50000, mediaCentavos: 100000, sampleCount: 5 },
    { minDiscountPct: 40, minSamples: 3 }
  );
  assert.equal(r.isFareError, true);
  assert.equal(r.discountPct, 50);
});

test("NAO sinaliza sem media historica valida", () => {
  const r = detectFareError({ precoCentavos: 30000, mediaCentavos: null, sampleCount: 50 });
  assert.equal(r.isFareError, false);
  assert.equal(r.discountPct, null);
  assert.match(r.reason, /sem media historica/i);
});

test("desconto nunca e negativo (preco acima da media)", () => {
  const r = detectFareError({ precoCentavos: 120000, mediaCentavos: 100000, sampleCount: 20 });
  assert.equal(r.isFareError, false);
  assert.equal(r.discountPct, 0);
});
