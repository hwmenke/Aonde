import test from "node:test";
import assert from "node:assert/strict";

import { getDealLinksAwinBatch } from "../src/partners/awin.js";
import { setFetchImpl, resetFetchImpl } from "../src/http.js";

// Helper de ambiente (mesmo estilo de test/awin.test.js): aplica overrides de
// env, roda a fn e restaura os valores originais ao final.
function withEnv(overrides, fn) {
  const original = {};
  for (const key of Object.keys(overrides)) {
    original[key] = process.env[key];
    if (overrides[key] === undefined) delete process.env[key];
    else process.env[key] = overrides[key];
  }
  return async (...args) => {
    try {
      return await fn(...args);
    } finally {
      for (const key of Object.keys(original)) {
        if (original[key] === undefined) delete process.env[key];
        else process.env[key] = original[key];
      }
    }
  };
}

const CREDS = {
  AWIN_API_TOKEN: "fake-token",
  AWIN_PUBLISHER_ID: "123",
  AWIN_ADVERTISER_ID_DECOLAR: "456",
};

// Constroi um item de resposta de lote no formato { status, body }.
function okItem(url) {
  return { status: 200, body: { url } };
}

test("getDealLinksAwinBatch: lote feliz com 3 itens preserva ordem, URL e body corretos", async (t) => {
  const run = withEnv(CREDS, async () => {
    const calls = [];
    setFetchImpl(async (url, options) => {
      calls.push({ url, options });
      const sent = JSON.parse(options.body);
      // Responde na mesma ordem recebida, ecoando o destino no path.
      const responses = sent.map((r, i) => okItem(`https://awin1.com/link/${i}?u=${encodeURIComponent(r.destinationUrl)}`));
      return new Response(JSON.stringify({ responses }), { status: 200 });
    });
    t.after(() => resetFetchImpl());

    const items = [
      { destinationUrl: "https://www.decolar.com/a", clickref: "ref-a" },
      { destinationUrl: "https://www.decolar.com/b", advertiserId: "999" },
      { destinationUrl: "https://www.decolar.com/c", campaign: "promo-c" },
    ];
    const result = await getDealLinksAwinBatch(items);

    assert.equal(result.ok, true);
    assert.equal(result.partner, "awin");
    assert.equal(result.method, "api-batch");
    assert.equal(result.succeeded, 3);
    assert.equal(result.failed, 0);
    assert.equal(result.results.length, 3);

    // Uma unica chamada HTTP para 3 itens.
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://api.awin.com/publishers/123/linkbuilder/generate-batch");
    assert.equal(calls[0].options.headers.Authorization, "Bearer fake-token");

    // Body enviado: array na mesma ordem, com defaults e overrides aplicados.
    const sent = JSON.parse(calls[0].options.body);
    assert.equal(sent.length, 3);
    assert.equal(sent[0].advertiserId, 456); // default do config
    assert.equal(sent[0].destinationUrl, "https://www.decolar.com/a");
    assert.equal(sent[0].parameters.campaign, "aonde-passagens"); // default
    assert.equal(sent[0].parameters.clickref, "ref-a");
    assert.equal(sent[1].advertiserId, 999); // override por item
    assert.equal(sent[2].parameters.campaign, "promo-c"); // override por item

    // Ordem e metadados preservados item a item.
    result.results.forEach((r, i) => {
      assert.equal(r.ok, true);
      assert.equal(r.index, i);
      assert.equal(r.destinationUrl, items[i].destinationUrl);
      assert.match(r.url, /awin1\.com/);
    });
  });
  await run();
});

test("getDealLinksAwinBatch: item com status 400 no meio nao invalida os demais", async (t) => {
  const run = withEnv(CREDS, async () => {
    setFetchImpl(async () => {
      const responses = [
        okItem("https://awin1.com/link/0"),
        { status: 400, body: { message: "invalid destination" } },
        okItem("https://awin1.com/link/2"),
      ];
      return new Response(JSON.stringify({ responses }), { status: 200 });
    });
    t.after(() => resetFetchImpl());

    const items = [
      { destinationUrl: "https://www.decolar.com/a" },
      { destinationUrl: "https://www.decolar.com/bad" },
      { destinationUrl: "https://www.decolar.com/c" },
    ];
    const result = await getDealLinksAwinBatch(items);

    assert.equal(result.ok, true); // chamada HTTP funcionou
    assert.equal(result.succeeded, 2);
    assert.equal(result.failed, 1);

    assert.equal(result.results[0].ok, true);
    assert.equal(result.results[1].ok, false);
    assert.equal(result.results[1].index, 1);
    assert.equal(result.results[1].destinationUrl, "https://www.decolar.com/bad");
    assert.match(result.results[1].error, /400/);
    assert.match(result.results[1].error, /invalid destination/);
    assert.equal(result.results[2].ok, true);
  });
  await run();
});

test("getDealLinksAwinBatch: credencial ausente retorna ok:false sem tocar a rede", async () => {
  const run = withEnv(
    { AWIN_API_TOKEN: undefined, AWIN_PUBLISHER_ID: undefined, AWIN_ADVERTISER_ID_DECOLAR: undefined },
    async () => {
      let called = false;
      setFetchImpl(async () => {
        called = true;
        return new Response("{}", { status: 200 });
      });
      try {
        const result = await getDealLinksAwinBatch([{ destinationUrl: "https://www.decolar.com" }]);
        assert.equal(result.ok, false);
        assert.equal(result.partner, "awin");
        assert.equal(result.method, "api-batch");
        assert.match(result.error, /AWIN_API_TOKEN/);
        assert.equal(called, false);
      } finally {
        resetFetchImpl();
      }
    }
  );
  await run();
});

test("getDealLinksAwinBatch: array vazio retorna ok:false com erro claro", async () => {
  const run = withEnv(CREDS, async () => {
    const result = await getDealLinksAwinBatch([]);
    assert.equal(result.ok, false);
    assert.equal(result.method, "api-batch");
    assert.match(result.error, /array nao-vazio/);
  });
  await run();
});

test("getDealLinksAwinBatch: 250 itens sao divididos em 3 chamadas (100/100/50)", async (t) => {
  const run = withEnv(CREDS, async () => {
    const chunkSizes = [];
    setFetchImpl(async (url, options) => {
      const sent = JSON.parse(options.body);
      chunkSizes.push(sent.length);
      const responses = sent.map((r, i) => okItem(`https://awin1.com/link/${chunkSizes.length}-${i}`));
      return new Response(JSON.stringify({ responses }), { status: 200 });
    });
    t.after(() => resetFetchImpl());

    const items = Array.from({ length: 250 }, (_, i) => ({
      destinationUrl: `https://www.decolar.com/p/${i}`,
    }));
    const result = await getDealLinksAwinBatch(items);

    assert.equal(result.ok, true);
    assert.deepEqual(chunkSizes, [100, 100, 50]);
    assert.equal(result.results.length, 250);
    assert.equal(result.succeeded, 250);
    assert.equal(result.failed, 0);
    // Indices globais contiguos e destino correto apos os 3 chunks.
    assert.equal(result.results[0].index, 0);
    assert.equal(result.results[150].index, 150);
    assert.equal(result.results[249].index, 249);
    assert.equal(result.results[249].destinationUrl, "https://www.decolar.com/p/249");
  });
  await run();
});

test("getDealLinksAwinBatch: resposta malformada (sem responses[]) retorna ok:false", async (t) => {
  const run = withEnv(CREDS, async () => {
    setFetchImpl(async () => new Response(JSON.stringify({ unexpected: "shape" }), { status: 200 }));
    t.after(() => resetFetchImpl());

    const result = await getDealLinksAwinBatch([{ destinationUrl: "https://www.decolar.com/a" }]);
    assert.equal(result.ok, false);
    assert.equal(result.method, "api-batch");
    assert.match(result.error, /formato inesperado/);
    assert.match(result.error, /unexpected/); // corpo bruto resumido
  });
  await run();
});
