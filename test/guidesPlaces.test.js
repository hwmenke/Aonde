import test from "node:test";
import assert from "node:assert/strict";

import { searchPlaces } from "../src/guides/placesClient.js";
import { setFetchImpl, resetFetchImpl } from "../src/http.js";

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Um `place` no formato da Places API (New).
function makePlace(i, { rating, ratingCount, summary } = {}) {
  const place = {
    id: `place-${i}`,
    displayName: { text: `Lugar ${i}`, languageCode: "pt-BR" },
    formattedAddress: `Rua ${i}, Recife`,
    location: { latitude: -8.0 - i * 0.01, longitude: -34.9 - i * 0.01 },
    types: ["tourist_attraction"],
    googleMapsUri: `https://maps.google.com/?cid=${i}`,
  };
  if (rating != null) place.rating = rating;
  if (ratingCount != null) place.userRatingCount = ratingCount;
  if (summary != null) place.editorialSummary = { text: summary, languageCode: "pt-BR" };
  return place;
}

function withApiKey(value, fn) {
  return async (t) => {
    const original = process.env.GOOGLE_MAPS_API_KEY;
    if (value === undefined) delete process.env.GOOGLE_MAPS_API_KEY;
    else process.env.GOOGLE_MAPS_API_KEY = value;
    t.after(() => {
      resetFetchImpl();
      if (original === undefined) delete process.env.GOOGLE_MAPS_API_KEY;
      else process.env.GOOGLE_MAPS_API_KEY = original;
    });
    await fn(t);
  };
}

// -----------------------------------------------------------------------
// Sem API key
// -----------------------------------------------------------------------

test(
  "searchPlaces sem GOOGLE_MAPS_API_KEY retorna ok:false com instrucao de onde obter",
  withApiKey(undefined, async () => {
    const res = await searchPlaces({ query: "pontos turisticos em Recife" });
    assert.equal(res.ok, false);
    assert.deepEqual(res.places, []);
    assert.match(res.error, /GOOGLE_MAPS_API_KEY/);
    assert.match(res.error, /console\.cloud\.google\.com/);
    assert.match(res.error, /billing/i);
  })
);

// -----------------------------------------------------------------------
// Headers e FieldMask corretos + corpo do POST
// -----------------------------------------------------------------------

test(
  "searchPlaces envia headers, FieldMask, e corpo corretos e desliga o cache",
  withApiKey("fake-key", async () => {
    let capturedUrl = null;
    let capturedOptions = null;

    setFetchImpl(async (url, options) => {
      capturedUrl = String(url);
      capturedOptions = options;
      return jsonResponse({ places: [makePlace(1, { rating: 4.5, ratingCount: 100 })] });
    });

    const res = await searchPlaces({
      query: "pontos turisticos em Recife",
      includedType: "tourist_attraction",
      maxResults: 20,
      regionCode: "BR",
    });

    // Endpoint e metodo
    assert.equal(capturedUrl, "https://places.googleapis.com/v1/places:searchText");
    assert.equal(capturedOptions.method, "POST");

    // Headers obrigatorios
    assert.equal(capturedOptions.headers["Content-Type"], "application/json");
    assert.equal(capturedOptions.headers["X-Goog-Api-Key"], "fake-key");
    const fieldMask = capturedOptions.headers["X-Goog-FieldMask"];
    assert.ok(fieldMask, "FieldMask e obrigatorio");
    assert.match(fieldMask, /places\.id/);
    assert.match(fieldMask, /places\.displayName/);
    assert.match(fieldMask, /places\.rating/);
    assert.match(fieldMask, /places\.editorialSummary/);
    assert.match(fieldMask, /places\.googleMapsUri/);

    // Corpo do POST
    const body = JSON.parse(capturedOptions.body);
    assert.equal(body.textQuery, "pontos turisticos em Recife");
    assert.equal(body.languageCode, "pt-BR");
    assert.equal(body.regionCode, "BR");
    assert.equal(body.includedType, "tourist_attraction");
    assert.equal(body.maxResultCount, 20);

    // Resultado normalizado
    assert.equal(res.ok, true);
    assert.equal(res.places.length, 1);
    const p = res.places[0];
    assert.equal(p.id, "place-1");
    assert.equal(p.name, "Lugar 1");
    assert.equal(p.rating, 4.5);
    assert.equal(p.ratingCount, 100);
    assert.equal(typeof p.lat, "number");
    assert.equal(typeof p.lng, "number");
    assert.equal(p.mapsUri, "https://maps.google.com/?cid=1");
  })
);

// -----------------------------------------------------------------------
// Politica do Google: respostas Places nao sao cacheadas — duas chamadas
// identicas batem no fetch duas vezes (nenhum hit de cache serve a 2a).
// -----------------------------------------------------------------------

test(
  "searchPlaces nao cacheia respostas (duas chamadas => dois fetches)",
  withApiKey("fake-key", async () => {
    let calls = 0;
    setFetchImpl(async () => {
      calls++;
      return jsonResponse({ places: [makePlace(1, { rating: 4.5, ratingCount: 100 })] });
    });

    await searchPlaces({ query: "pontos turisticos em Recife", regionCode: "BR" });
    await searchPlaces({ query: "pontos turisticos em Recife", regionCode: "BR" });
    assert.equal(calls, 2);
  })
);

// -----------------------------------------------------------------------
// FieldMask customizado (enxuto/mais barato)
// -----------------------------------------------------------------------

test(
  "searchPlaces respeita FieldMask customizado via option fields",
  withApiKey("fake-key", async () => {
    let capturedFieldMask = null;
    setFetchImpl(async (url, options) => {
      capturedFieldMask = options.headers["X-Goog-FieldMask"];
      return jsonResponse({ places: [] });
    });

    await searchPlaces({
      query: "x",
      fields: "places.displayName,places.formattedAddress",
    });
    assert.equal(capturedFieldMask, "places.displayName,places.formattedAddress");
  })
);

// -----------------------------------------------------------------------
// editorialSummary ausente => summary null
// -----------------------------------------------------------------------

test(
  "searchPlaces deixa summary null quando nao ha editorialSummary",
  withApiKey("fake-key", async () => {
    setFetchImpl(async () =>
      jsonResponse({ places: [makePlace(1, { rating: 4.2, ratingCount: 50 })] })
    );
    const res = await searchPlaces({ query: "x" });
    assert.equal(res.ok, true);
    assert.equal(res.places[0].summary, null);
  })
);

// -----------------------------------------------------------------------
// Resposta sem resultados => ok:true, lista vazia
// -----------------------------------------------------------------------

test(
  "searchPlaces trata resposta vazia como ok:true e lista vazia",
  withApiKey("fake-key", async () => {
    setFetchImpl(async () => jsonResponse({}));
    const res = await searchPlaces({ query: "x" });
    assert.equal(res.ok, true);
    assert.deepEqual(res.places, []);
  })
);

// -----------------------------------------------------------------------
// Erro HTTP => ok:false
// -----------------------------------------------------------------------

test(
  "searchPlaces retorna ok:false em erro HTTP (com corpo resumido)",
  withApiKey("fake-key", async () => {
    setFetchImpl(async () =>
      jsonResponse({ error: { message: "API key invalida" } }, 403)
    );
    const res = await searchPlaces({ query: "x" });
    assert.equal(res.ok, false);
    assert.deepEqual(res.places, []);
    assert.match(res.error, /HTTP 403/);
    assert.match(res.error, /API key invalida/);
  })
);

// -----------------------------------------------------------------------
// Falha de rede => ok:false, nunca lanca
// -----------------------------------------------------------------------

test(
  "searchPlaces trata falha de rede sem lancar excecao",
  withApiKey("fake-key", async () => {
    setFetchImpl(async () => {
      throw new Error("network down");
    });
    const res = await searchPlaces({ query: "x" });
    assert.equal(res.ok, false);
    assert.match(res.error, /network down/);
  })
);

// -----------------------------------------------------------------------
// query obrigatoria
// -----------------------------------------------------------------------

test(
  "searchPlaces exige query",
  withApiKey("fake-key", async () => {
    const res = await searchPlaces({});
    assert.equal(res.ok, false);
    assert.match(res.error, /query/);
  })
);
