import test from "node:test";
import assert from "node:assert/strict";

import { getDealLinkAwin } from "../src/partners/awin.js";
import { setFetchImpl, resetFetchImpl } from "../src/http.js";

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

test("getDealLinkAwin retorna ok:false sem AWIN_API_TOKEN", async () => {
  const run = withEnv(
    { AWIN_API_TOKEN: undefined, AWIN_PUBLISHER_ID: undefined, AWIN_ADVERTISER_ID_DECOLAR: undefined },
    async () => {
      const result = await getDealLinkAwin({ destinationUrl: "https://www.decolar.com" });
      assert.equal(result.ok, false);
      assert.equal(result.partner, "awin");
      assert.match(result.error, /AWIN_API_TOKEN/);
    }
  );
  await run();
});

test("getDealLinkAwin retorna ok:false sem AWIN_PUBLISHER_ID (mesmo com token)", async () => {
  const run = withEnv(
    { AWIN_API_TOKEN: "fake-token", AWIN_PUBLISHER_ID: undefined, AWIN_ADVERTISER_ID_DECOLAR: undefined },
    async () => {
      const result = await getDealLinkAwin({ destinationUrl: "https://www.decolar.com" });
      assert.equal(result.ok, false);
      assert.match(result.error, /AWIN_PUBLISHER_ID/);
    }
  );
  await run();
});

test("getDealLinkAwin retorna ok:false sem advertiserId", async () => {
  const run = withEnv(
    {
      AWIN_API_TOKEN: "fake-token",
      AWIN_PUBLISHER_ID: "123",
      AWIN_ADVERTISER_ID_DECOLAR: undefined,
    },
    async () => {
      const result = await getDealLinkAwin({ destinationUrl: "https://www.decolar.com" });
      assert.equal(result.ok, false);
      assert.match(result.error, /advertiserId/);
    }
  );
  await run();
});

test("getDealLinkAwin chama o Link Builder e retorna a url gerada", async (t) => {
  const run = withEnv(
    { AWIN_API_TOKEN: "fake-token", AWIN_PUBLISHER_ID: "123", AWIN_ADVERTISER_ID_DECOLAR: "456" },
    async () => {
      setFetchImpl(async (url, options) => {
        assert.equal(url, "https://api.awin.com/publishers/123/linkbuilder/generate");
        assert.equal(options.headers.Authorization, "Bearer fake-token");
        const body = JSON.parse(options.body);
        assert.equal(body.advertiserId, 456);
        assert.equal(body.destinationUrl, "https://www.decolar.com/promo");
        return new Response(JSON.stringify({ url: "https://www.awin1.com/cread.php?awinmid=456&awinaffid=123" }), {
          status: 200,
        });
      });

      t.after(() => resetFetchImpl());

      const result = await getDealLinkAwin({ destinationUrl: "https://www.decolar.com/promo" });
      assert.equal(result.ok, true);
      assert.equal(result.method, "api");
      assert.match(result.url, /awin1\.com/);
    }
  );
  await run();
});

test("getDealLinkAwin retorna ok:false em resposta HTTP nao-2xx", async (t) => {
  const run = withEnv(
    { AWIN_API_TOKEN: "fake-token", AWIN_PUBLISHER_ID: "123", AWIN_ADVERTISER_ID_DECOLAR: "456" },
    async () => {
      setFetchImpl(async () => new Response(JSON.stringify({ message: "unauthorized" }), { status: 401 }));
      t.after(() => resetFetchImpl());

      const result = await getDealLinkAwin({ destinationUrl: "https://www.decolar.com/promo" });
      assert.equal(result.ok, false);
      assert.match(result.error, /401/);
    }
  );
  await run();
});
