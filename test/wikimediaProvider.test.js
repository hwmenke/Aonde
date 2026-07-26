import test from "node:test";
import assert from "node:assert/strict";

import {
  getDestinationImage,
  buildSearchImageUrl,
  buildImageInfoUrl,
  stripHtml,
  WIKIMEDIA_USER_AGENT,
  PT_WIKIPEDIA_API,
  COMMONS_API,
} from "../src/images/wikimediaProvider.js";
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

// Payload da etapa 1 (generator=search + pageimages).
function searchPayload({ pageimage = "Lisboa_ajuda.jpg" } = {}) {
  return {
    query: {
      pages: {
        "111": {
          pageid: 111,
          index: 1,
          title: "Lisboa",
          pageimage,
          thumbnail: {
            source: "https://upload.wikimedia.org/thumb/1200px-Lisboa.jpg",
            width: 1200,
            height: 800,
          },
          original: {
            source: "https://upload.wikimedia.org/Lisboa.jpg",
            width: 4000,
            height: 3000,
          },
        },
      },
    },
  };
}

// Payload da etapa 2 (imageinfo + extmetadata).
function imageInfoPayload() {
  return {
    query: {
      pages: {
        "222": {
          title: "File:Lisboa_ajuda.jpg",
          imageinfo: [
            {
              user: "UploaderFallback",
              descriptionurl: "https://commons.wikimedia.org/wiki/File:Lisboa_ajuda.jpg",
              extmetadata: {
                LicenseShortName: { value: "CC BY-SA 4.0" },
                LicenseUrl: { value: "https://creativecommons.org/licenses/by-sa/4.0" },
                Artist: { value: '<a href="https://example.org/u">Maria&nbsp;Silva</a>' },
                Credit: { value: "<span>Wikimedia Commons</span>" },
              },
            },
          ],
        },
      },
    },
  };
}

// -----------------------------------------------------------------------
// Construcao de URL
// -----------------------------------------------------------------------

test("buildSearchImageUrl monta a Action API com generator=search e params corretos", () => {
  const url = buildSearchImageUrl(PT_WIKIPEDIA_API, "Lisboa", 1200);
  assert.match(url, /^https:\/\/pt\.wikipedia\.org\/w\/api\.php\?/);
  assert.match(url, /action=query/);
  assert.match(url, /format=json/);
  assert.match(url, /generator=search/);
  assert.match(url, /gsrsearch=Lisboa/);
  assert.match(url, /gsrlimit=1/);
  assert.match(url, /prop=pageimages/);
  assert.match(url, /piprop=thumbnail/);
  assert.match(url, /pithumbsize=1200/);
});

test("buildImageInfoUrl monta imageinfo com extmetadata e prefixa File:", () => {
  const url = buildImageInfoUrl(COMMONS_API, "Lisboa_ajuda.jpg");
  assert.match(url, /^https:\/\/commons\.wikimedia\.org\/w\/api\.php\?/);
  assert.match(url, /prop=imageinfo/);
  assert.match(url, /iiprop=extmetadata/);
  assert.match(url, /titles=File%3ALisboa_ajuda\.jpg/);
});

test("buildImageInfoUrl nao duplica o prefixo File: quando ja presente", () => {
  const url = buildImageInfoUrl(COMMONS_API, "File:Lisboa.jpg");
  assert.match(url, /titles=File%3ALisboa\.jpg/);
  assert.doesNotMatch(url, /File%3AFile%3A/);
});

// -----------------------------------------------------------------------
// stripHtml
// -----------------------------------------------------------------------

test("stripHtml remove tags e decodifica entidades basicas", () => {
  assert.equal(stripHtml('<a href="x">Maria&nbsp;Silva</a>'), "Maria Silva");
  assert.equal(stripHtml("<b>A</b> &amp; <i>B</i>"), "A & B");
  assert.equal(stripHtml(null), null);
  assert.equal(stripHtml("   "), null);
});

// -----------------------------------------------------------------------
// getDestinationImage — caminho feliz
// -----------------------------------------------------------------------

test("getDestinationImage retorna imageUrl/thumbUrl e atribuicao (Artist com HTML limpo)", async (t) => {
  const calls = [];
  setFetchImpl(async (url, options) => {
    calls.push({ url: String(url), headers: options?.headers || {} });
    const u = String(url);
    if (u.includes("generator=search")) return jsonResponse(searchPayload());
    if (u.includes("prop=imageinfo")) return jsonResponse(imageInfoPayload());
    return jsonResponse({ query: { pages: {} } });
  });
  t.after(() => resetFetchImpl());

  const res = await getDestinationImage({ query: "Lisboa", width: 1200 });

  assert.equal(res.ok, true);
  assert.equal(res.imageUrl, "https://upload.wikimedia.org/Lisboa.jpg");
  assert.equal(res.thumbUrl, "https://upload.wikimedia.org/thumb/1200px-Lisboa.jpg");
  assert.equal(res.width, 1200);
  assert.equal(res.height, 800);
  assert.equal(res.attribution.author, "Maria Silva");
  assert.equal(res.attribution.license, "CC BY-SA 4.0");
  assert.equal(res.attribution.licenseUrl, "https://creativecommons.org/licenses/by-sa/4.0");
  assert.equal(res.attribution.sourceUrl, "https://commons.wikimedia.org/wiki/File:Lisboa_ajuda.jpg");

  // Enviou o header User-Agent obrigatorio da Wikimedia em toda chamada.
  assert.ok(calls.length >= 1);
  for (const c of calls) {
    assert.equal(c.headers["User-Agent"], WIKIMEDIA_USER_AGENT);
  }
  // Bateu no endpoint pt.wikipedia (fonte primaria).
  assert.match(calls[0].url, /pt\.wikipedia\.org/);
});

// -----------------------------------------------------------------------
// getDestinationImage — sem resultado / fallback / validacao
// -----------------------------------------------------------------------

test("getDestinationImage retorna ok:false quando nenhum endpoint acha imagem", async (t) => {
  setFetchImpl(async () => jsonResponse({ query: { pages: {} } }));
  t.after(() => resetFetchImpl());

  const res = await getDestinationImage({ query: "LugarInexistenteXYZ" });
  assert.equal(res.ok, false);
  assert.match(res.error, /Nenhuma imagem encontrada no Wikimedia para 'LugarInexistenteXYZ'/);
});

test("getDestinationImage cai no fallback do Commons quando pt.wikipedia nao acha", async (t) => {
  setFetchImpl(async (url) => {
    const u = String(url);
    if (u.includes("pt.wikipedia.org")) return jsonResponse({ query: { pages: {} } });
    if (u.includes("commons.wikimedia.org") && u.includes("generator=search")) {
      return jsonResponse(searchPayload());
    }
    if (u.includes("prop=imageinfo")) return jsonResponse(imageInfoPayload());
    return jsonResponse({ query: { pages: {} } });
  });
  t.after(() => resetFetchImpl());

  const res = await getDestinationImage({ query: "Lisboa" });
  assert.equal(res.ok, true);
  assert.equal(res.thumbUrl, "https://upload.wikimedia.org/thumb/1200px-Lisboa.jpg");
});

test("getDestinationImage retorna imagem mesmo sem imageinfo (atribuicao com campos null)", async (t) => {
  setFetchImpl(async (url) => {
    const u = String(url);
    if (u.includes("generator=search")) return jsonResponse(searchPayload());
    // imageinfo falha -> atribuicao fica com campos null, mas a imagem sai.
    return jsonResponse({}, 500);
  });
  t.after(() => resetFetchImpl());

  const res = await getDestinationImage({ query: "Lisboa" });
  assert.equal(res.ok, true);
  assert.equal(res.thumbUrl, "https://upload.wikimedia.org/thumb/1200px-Lisboa.jpg");
  assert.equal(res.attribution.author, null);
  assert.equal(res.attribution.license, null);
});

test("getDestinationImage valida query obrigatoria", async () => {
  const res = await getDestinationImage({});
  assert.equal(res.ok, false);
  assert.match(res.error, /query e obrigatoria/);
});

test("getDestinationImage nunca lanca (fetch que estoura vira ok:false)", async (t) => {
  setFetchImpl(async () => {
    throw new Error("kaboom");
  });
  t.after(() => resetFetchImpl());

  const res = await getDestinationImage({ query: "Lisboa" });
  assert.equal(res.ok, false);
});
