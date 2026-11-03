import test from "node:test";
import assert from "node:assert/strict";
import { guideWindowStatus, windowEnd, windowSeenAt } from "../src/guides/priceWindow.js";

test("windowEnd lê o último dia com ano explícito; sem ano retorna null", () => {
  assert.equal(windowEnd("14 – 21 abr 2026"), "2026-04-21");
  assert.equal(windowEnd("3 – 10 mar"), null);
  assert.equal(windowEnd("31 fev 2026"), null);
});

test("guideWindowStatus mantém o rótulo e marca janela passada", () => {
  const w = { label: "14 – 21 abr 2026" };
  assert.deepEqual(guideWindowStatus(w, "2026-11-03"), { label: "14 – 21 abr 2026", ended: true, seenAt: null });
  assert.equal(guideWindowStatus(w, "2026-04-21").ended, false);
  assert.equal(guideWindowStatus({ label: "abr" }, "2026-11-03").ended, false, "sem data completa não afirma encerrada");
  assert.equal(guideWindowStatus(null, "2026-11-03"), null);
});

test("visto em só vem de data real nos dados", () => {
  assert.equal(windowSeenAt({ vistoEm: "2026-02-10" }), "2026-02-10");
  assert.equal(windowSeenAt({ seenAt: "2026-02-10T12:00:00Z" }), "2026-02-10T12:00:00Z");
  assert.equal(windowSeenAt({ vistoEm: "2026-02-30" }), null);
  assert.equal(windowSeenAt({ label: "x" }), null);
});
