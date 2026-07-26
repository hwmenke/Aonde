import test from "node:test";
import assert from "node:assert/strict";

import { searchPlaces } from "../src/guides/placesClient.js";
import {
  buildPhotoMediaUrl,
  resolvePhotoUri,
  firstPhotoFrom,
} from "../src/guides/placePhotos.js";
import { buildItinerary, renderItineraryMarkdown } from "../src/guides/itineraryBuilder.js";
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

// Constroi um array `photos[]` no formato cru da Places API (New).
function makePhotos(i) {
  return [
    {
      name: `places/place-${i}/photos/PHOTO_RESOURCE_${i}`,
      widthPx: 4032,
      heightPx: 3024,
      authorAttributions: [
        { displayName: `Autor ${i}`, uri: `https://maps.google.com/author/${i}`, photoUri: "x" },
      ],
    },
    {
      name: `places/place-${i}/photos/PHOTO_RESOURCE_${i}_b`,
      widthPx: 800,
      heightPx: 600,
      authorAttributions: [{ displayName: `Autor ${i}b`, uri: "https://x", photoUri: "y" }],
    },
  ];
}

// place com fotos (para itinerario). Score decresce com i.
function makeAttraction(i, { total = 6, withPhotos = true, geo = false } = {}) {
  const place = {
    id: `attr-${i}`,
    displayName: { text: `Atracao ${i}`, languageCode: "pt-BR" },
    formattedAddress: `Rua ${i}, Recife`,
    types: ["tourist_attraction"],
    googleMapsUri: `https://maps.google.com/?cid=${i}`,
    rating: 4.5,
    userRatingCount: (total - i + 1) * 1000,
  };
  if (geo) place.location = { latitude: -8.0 - i * 0.01, longitude: -34.9 + i * 0.01 };
  if (withPhotos) place.photos = makePhotos(i);
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
// FieldMask agora inclui places.photos
// -----------------------------------------------------------------------

test(
  "searchPlaces default FieldMask inclui places.photos e normaliza photos[]",
  withApiKey("fake-key", async () => {
    let capturedFieldMask = null;
    setFetchImpl(async (url, options) => {
      capturedFieldMask = options.headers["X-Goog-FieldMask"];
      return jsonResponse({ places: [makeAttraction(1)] });
    });

    const res = await searchPlaces({ query: "pontos turisticos em Recife" });
    assert.match(capturedFieldMask, /places\.photos/);
    assert.equal(res.ok, true);
    // photos cru repassado ao consumidor (nao transformado).
    assert.ok(Array.isArray(res.places[0].photos));
    assert.equal(res.places[0].photos.length, 2);
  })
);

test(
  "searchPlaces normaliza photos como [] quando o place nao tem fotos",
  withApiKey("fake-key", async () => {
    setFetchImpl(async () =>
      jsonResponse({ places: [makeAttraction(1, { withPhotos: false })] })
    );
    const res = await searchPlaces({ query: "x" });
    assert.deepEqual(res.places[0].photos, []);
  })
);

// -----------------------------------------------------------------------
// buildPhotoMediaUrl (funcao pura)
// -----------------------------------------------------------------------

test("buildPhotoMediaUrl monta a URL /media com maxWidthPx e a API key", () => {
  const url = buildPhotoMediaUrl("places/abc/photos/xyz", {
    maxWidthPx: 640,
    apiKey: "key-123",
  });
  assert.match(url, /^https:\/\/places\.googleapis\.com\/v1\/places\/abc\/photos\/xyz\/media\?/);
  assert.match(url, /maxWidthPx=640/);
  assert.match(url, /key=key-123/);
});

test("buildPhotoMediaUrl usa a apiKey do config quando nao passada", withApiKey("env-key", async () => {
  const url = buildPhotoMediaUrl("places/abc/photos/xyz");
  assert.match(url, /key=env-key/);
  assert.match(url, /maxWidthPx=800/); // default
}));

test("buildPhotoMediaUrl lanca sem photoName", () => {
  assert.throws(() => buildPhotoMediaUrl("", { apiKey: "k" }), /photoName/);
});

test("buildPhotoMediaUrl lanca sem apiKey", withApiKey(undefined, async () => {
  assert.throws(() => buildPhotoMediaUrl("places/abc/photos/xyz"), /GOOGLE_MAPS_API_KEY/);
}));

test("buildPhotoMediaUrl faz clamp de maxWidthPx ao teto de 4800", () => {
  const url = buildPhotoMediaUrl("places/abc/photos/xyz", { maxWidthPx: 99999, apiKey: "k" });
  assert.match(url, /maxWidthPx=4800/);
});

// -----------------------------------------------------------------------
// firstPhotoFrom
// -----------------------------------------------------------------------

test("firstPhotoFrom extrai url + atribuicao da 1a foto", () => {
  const place = { photos: makePhotos(2) };
  const foto = firstPhotoFrom(place, { apiKey: "k", maxWidthPx: 500 });
  assert.ok(foto);
  assert.match(foto.mediaUrl, /places\/place-2\/photos\/PHOTO_RESOURCE_2\/media/);
  assert.match(foto.mediaUrl, /maxWidthPx=500/);
  assert.equal(foto.attribution.text, "Autor 2");
  assert.equal(foto.attribution.uri, "https://maps.google.com/author/2");
  assert.equal(foto.widthPx, 4032);
  assert.equal(foto.heightPx, 3024);
});

test("firstPhotoFrom retorna null quando o place nao tem fotos", () => {
  assert.equal(firstPhotoFrom({ photos: [] }, { apiKey: "k" }), null);
  assert.equal(firstPhotoFrom({}, { apiKey: "k" }), null);
  assert.equal(firstPhotoFrom(null, { apiKey: "k" }), null);
});

test("firstPhotoFrom degrada para null sem API key (sem lancar)", withApiKey(undefined, async () => {
  const foto = firstPhotoFrom({ photos: makePhotos(1) });
  assert.equal(foto, null);
}));

test("firstPhotoFrom usa credito neutro 'Google' quando falta authorAttributions", () => {
  const place = { photos: [{ name: "places/a/photos/z", widthPx: 100, heightPx: 100 }] };
  const foto = firstPhotoFrom(place, { apiKey: "k" });
  assert.equal(foto.attribution.text, "Google");
  assert.equal(foto.attribution.uri, null);
});

// -----------------------------------------------------------------------
// resolvePhotoUri (rede mockada, skipHttpRedirect)
// -----------------------------------------------------------------------

test(
  "resolvePhotoUri chama /media com skipHttpRedirect e retorna photoUri",
  withApiKey("fake-key", async () => {
    let capturedUrl = null;
    setFetchImpl(async (url) => {
      capturedUrl = String(url);
      return jsonResponse({
        name: "places/abc/photos/xyz",
        photoUri: "https://lh3.googleusercontent.com/short-lived-uri",
      });
    });

    const res = await resolvePhotoUri("places/abc/photos/xyz", { maxWidthPx: 700 });
    assert.equal(res.ok, true);
    assert.equal(res.photoUri, "https://lh3.googleusercontent.com/short-lived-uri");
    assert.match(capturedUrl, /skipHttpRedirect=true/);
    assert.match(capturedUrl, /maxWidthPx=700/);
    assert.match(capturedUrl, /\/media\?/);
  })
);

test("resolvePhotoUri sem API key retorna ok:false com instrucao", withApiKey(undefined, async () => {
  const res = await resolvePhotoUri("places/abc/photos/xyz");
  assert.equal(res.ok, false);
  assert.match(res.error, /GOOGLE_MAPS_API_KEY/);
}));

test(
  "resolvePhotoUri trata erro HTTP sem lancar",
  withApiKey("fake-key", async () => {
    setFetchImpl(async () => jsonResponse({ error: { message: "nope" } }, 403));
    const res = await resolvePhotoUri("places/abc/photos/xyz");
    assert.equal(res.ok, false);
    assert.ok(res.error);
  })
);

test(
  "resolvePhotoUri retorna ok:false quando a resposta nao traz photoUri",
  withApiKey("fake-key", async () => {
    setFetchImpl(async () => jsonResponse({ name: "places/abc/photos/xyz" }));
    const res = await resolvePhotoUri("places/abc/photos/xyz");
    assert.equal(res.ok, false);
    assert.match(res.error, /photoUri/);
  })
);

// -----------------------------------------------------------------------
// Integracao no roteiro: ponto ganha `foto`, roteiro ganha `hero`
// -----------------------------------------------------------------------

function installItineraryFetch({ attractions = [], restaurants = [] } = {}) {
  setFetchImpl(async (url, options) => {
    const body = JSON.parse(options.body);
    if (body.includedType === "restaurant") return jsonResponse({ places: restaurants });
    return jsonResponse({ places: attractions });
  });
}

test(
  "buildItinerary: cada ponto ganha foto e o roteiro ganha hero do ponto top",
  withApiKey("fake-key", async () => {
    const attractions = Array.from({ length: 4 }, (_, k) => makeAttraction(k + 1));
    installItineraryFetch({ attractions, restaurants: [] });

    const it = await buildItinerary({ destination: "Recife", days: 2, withRestaurants: false });
    assert.equal(it.ok, true);

    // Cada ponto tem foto com url + atribuicao.
    const pontos = it.days.flatMap((d) => d.pontos);
    for (const p of pontos) {
      assert.ok(p.foto, `ponto ${p.nome} deve ter foto`);
      assert.match(p.foto.url, /\/media\?/);
      assert.ok(p.foto.attribution.text);
    }

    // hero = foto do ponto de maior nota ponderada (Atracao 1, maior ratingCount).
    assert.ok(it.hero);
    assert.match(it.hero.url, /places\/place-1\/photos/);
    assert.equal(it.hero.attribution.text, "Autor 1");
  })
);

test(
  "buildItinerary: ponto sem foto fica com foto null e hero cai no proximo com foto",
  withApiKey("fake-key", async () => {
    // Atracao 1 (top) SEM foto; Atracao 2 COM foto.
    const attractions = [
      makeAttraction(1, { withPhotos: false }),
      makeAttraction(2, { withPhotos: true }),
    ];
    installItineraryFetch({ attractions, restaurants: [] });

    const it = await buildItinerary({ destination: "Recife", days: 2, withRestaurants: false });
    const pontos = it.days.flatMap((d) => d.pontos);
    const semFoto = pontos.find((p) => p.nome === "Atracao 1");
    const comFoto = pontos.find((p) => p.nome === "Atracao 2");
    assert.equal(semFoto.foto, null);
    assert.ok(comFoto.foto);

    // hero cai no proximo ponto com foto (Atracao 2), evitando capa vazia.
    assert.ok(it.hero);
    assert.match(it.hero.url, /places\/place-2\/photos/);
  })
);

test(
  "buildItinerary: sem nenhuma foto, hero e null e nenhum ponto tem foto",
  withApiKey("fake-key", async () => {
    const attractions = [makeAttraction(1, { withPhotos: false })];
    installItineraryFetch({ attractions, restaurants: [] });
    const it = await buildItinerary({ destination: "Recife", days: 1, withRestaurants: false });
    assert.equal(it.hero, null);
    assert.equal(it.days.flatMap((d) => d.pontos)[0].foto, null);
  })
);

// -----------------------------------------------------------------------
// renderItineraryMarkdown com fotos
// -----------------------------------------------------------------------

test(
  "renderItineraryMarkdown inclui imagem por ponto, credito e bullet de capa",
  withApiKey("fake-key", async () => {
    const attractions = [makeAttraction(1), makeAttraction(2, { withPhotos: false })];
    installItineraryFetch({ attractions, restaurants: [] });

    const it = await buildItinerary({ destination: "Recife", days: 1, withRestaurants: false });
    const md = renderItineraryMarkdown(it);

    // Sem "undefined" mesmo com um ponto sem foto.
    assert.equal(md.includes("undefined"), false);

    // Bullet de capa (hero) no topo, com imagem e credito.
    assert.match(md, /- !\[Capa — Recife\]\(https:\/\/places\.googleapis\.com/);

    // Imagem markdown do ponto com foto (Atracao 1).
    assert.match(md, /!\[Atracao 1\]\(https:\/\/places\.googleapis\.com/);

    // Linha de credito por foto (atribuicao obrigatoria).
    assert.match(md, /— Foto: \[Autor 1\]\(https:\/\/maps\.google\.com\/author\/1\)/);

    // Atracao 2 (sem foto) NAO gera linha de imagem nem "undefined".
    assert.equal(md.includes("![Atracao 2]"), false);

    // Atribuicao "Dados de lugares: Google" permanece.
    assert.match(md, /- Dados de lugares: Google/);

    // Tudo em bullets (titulo ou bullet, possivelmente indentado).
    const lines = md.split("\n").filter((l) => l.trim() !== "");
    for (const line of lines) {
      const ok = line.startsWith("#") || /^\s*- /.test(line);
      assert.ok(ok, `linha nao e titulo nem bullet: "${line}"`);
    }
  })
);
