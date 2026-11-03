import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { upsert, getOffer } from "../src/store/offersStore.js";

async function withDataDir(t) {
  const original = process.env.AONDE_DATA_DIR;
  const dir = await mkdtemp(path.join(os.tmpdir(), "aonde-offers-datas-"));
  process.env.AONDE_DATA_DIR = dir;
  t.after(async () => {
    if (original === undefined) delete process.env.AONDE_DATA_DIR;
    else process.env.AONDE_DATA_DIR = original;
    await rm(dir, { recursive: true, force: true });
  });
  return dir;
}

function assertInvalid(offer, expectedFields) {
  assert.throws(() => upsert(offer), (err) => {
    assert.ok(err instanceof Error);
    assert.equal(err.code, "OFERTA_DATAS_INVALIDAS");
    assert.ok(err.message.includes(`Datas inválidas na oferta ${offer.id}:`));
    assert.deepEqual(err.findings.map(({ field }) => field), expectedFields);
    for (const finding of err.findings) {
      assert.equal(finding.id, offer.id);
      assert.ok(err.message.includes(`${finding.field}: ${finding.message}`));
    }
    return true;
  });
}

for (const [name, dates, fields] of [
  ["ida inexistente", { ida: "2026-02-30" }, ["ida"]],
  ["volta antes da ida", { ida: "2026-03-10", volta: "2026-03-09" }, ["volta"]],
  ["intervalo de exibição com 31 fev", { datas: "20–31 fev" }, ["datas"]],
  ["múltiplas datas inválidas", { ida: "2026-02-30", datas: "20–31 fev" }, ["datas", "ida"]],
]) {
  test(`upsert rejeita ${name} sem gravar arquivos`, async (t) => {
    const dir = await withDataDir(t);
    assertInvalid({ id: "gru-lis", ...dates }, fields);
    assert.deepEqual(await readdir(dir), []);
  });
}

test("upsert salva uma oferta com datas válidas", async (t) => {
  const dir = await withDataDir(t);
  const offer = { id: "gru-lis", ida: "2026-03-10", volta: "2026-03-20", datas: "10–20 mar" };
  const stored = upsert(offer);
  assert.deepEqual(getOffer(offer.id), stored);
  assert.equal(stored.ida, offer.ida);
  assert.equal(stored.volta, offer.volta);
  assert.equal(stored.datas, offer.datas);
  assert.ok(Number.isFinite(Date.parse(stored.created_at)));
  assert.equal(stored.updated_at, stored.created_at);
  assert.deepEqual(JSON.parse(await readFile(path.join(dir, "offers.json"), "utf8")), [stored]);
});

test("update valida a oferta mesclada e mantém o arquivo intacto se inválida", async (t) => {
  const dir = await withDataDir(t);
  const stored = upsert({ id: "gru-lis", ida: "2026-03-10", volta: "2026-03-20" });
  const file = path.join(dir, "offers.json");
  const before = await readFile(file);
  assertInvalid({ id: stored.id, ida: "2026-03-21" }, ["volta"]);
  assert.deepEqual(await readFile(file), before);
  assert.deepEqual(getOffer(stored.id), stored);
  assert.deepEqual(await readdir(dir), ["offers.json"]);
});
