import test from "node:test";
import assert from "node:assert/strict";

import {
  deriveTipo,
  formatDateRangePtBr,
  centavosFromPrice,
  computeDiscount,
  toOffer,
  toOffers,
  enrichOfferWithImage,
  enrichOffersWithImages,
} from "../src/offerAdapter.js";
import { setFetchImpl, resetFetchImpl } from "../src/http.js";

// -----------------------------------------------------------------------
// deriveTipo
// -----------------------------------------------------------------------

test("deriveTipo retorna Nacional quando origem e destino sao aeroportos brasileiros", () => {
  assert.equal(deriveTipo("GRU", "REC"), "Nacional");
});

test("deriveTipo retorna Internacional quando destino nao e aeroporto brasileiro", () => {
  assert.equal(deriveTipo("GRU", "LIS"), "Internacional");
});

test("deriveTipo retorna Internacional quando origem e destino ausentes/invalidos", () => {
  assert.equal(deriveTipo(null, undefined), "Internacional");
});

// -----------------------------------------------------------------------
// formatDateRangePtBr
// -----------------------------------------------------------------------

test("formatDateRangePtBr formata ida e volta no mesmo mes", () => {
  const result = formatDateRangePtBr("2026-10-12T10:00:00", "2026-10-24T10:00:00");
  assert.equal(result, "12–24 out");
});

test("formatDateRangePtBr formata ida e volta em meses diferentes", () => {
  const result = formatDateRangePtBr("2026-09-28T10:00:00", "2026-10-03T10:00:00");
  assert.equal(result, "28 set–03 out");
});

test("formatDateRangePtBr formata apenas ida (one-way)", () => {
  const result = formatDateRangePtBr("2026-10-12T10:00:00", null);
  assert.equal(result, "a partir de 12 out");
});

test("formatDateRangePtBr retorna null quando ambas as datas estao ausentes", () => {
  assert.equal(formatDateRangePtBr(null, null), null);
  assert.equal(formatDateRangePtBr(undefined, undefined), null);
});

test("formatDateRangePtBr retorna null para datas invalidas sem lancar excecao", () => {
  assert.equal(formatDateRangePtBr("nao-e-uma-data", "tambem-nao"), null);
});

// -----------------------------------------------------------------------
// centavosFromPrice
// -----------------------------------------------------------------------

test("centavosFromPrice converte preco valido para centavos", () => {
  assert.equal(centavosFromPrice(3200.5), 320050);
  assert.equal(centavosFromPrice(10), 1000);
});

test("centavosFromPrice retorna null para price null/undefined", () => {
  assert.equal(centavosFromPrice(null), null);
  assert.equal(centavosFromPrice(undefined), null);
});

test("centavosFromPrice retorna null para NaN", () => {
  assert.equal(centavosFromPrice(NaN), null);
});

// -----------------------------------------------------------------------
// computeDiscount
// -----------------------------------------------------------------------

test("computeDiscount calcula desconto positivo quando preco atual e menor que a media", () => {
  const result = computeDiscount(160000, 320000); // preco 1600, media 3200
  assert.equal(result.desconto_pct, 50);
  assert.equal(result.economia_centavos, 160000);
});

test("computeDiscount faz clamp em 0 quando preco atual e maior que a media", () => {
  const result = computeDiscount(400000, 320000);
  assert.equal(result.desconto_pct, 0);
  assert.equal(result.economia_centavos, 0);
});

test("computeDiscount retorna null/null quando media nao e fornecida", () => {
  assert.deepEqual(computeDiscount(160000, null), { desconto_pct: null, economia_centavos: null });
  assert.deepEqual(computeDiscount(160000, undefined), { desconto_pct: null, economia_centavos: null });
});

// -----------------------------------------------------------------------
// toOffer
// -----------------------------------------------------------------------

const SAMPLE_DEAL = {
  origin: "GRU",
  destination: "LIS",
  departDate: "2026-09-01T10:00:00",
  returnDate: "2026-09-10T10:00:00",
  price: 3200,
  currency: "BRL",
  airline: "TP",
  flightNumber: "77",
  transfers: 0,
  foundAt: "2026-07-20T00:00:00",
  expiresAt: "2026-07-27T00:00:00",
  link: "https://tp.media/r?marker=424242&p=4114&u=https%3A%2F%2Fwww.aviasales.com%2Fsearch%2FGRULIS0109",
};

test("toOffer monta Offer parcial a partir de um deal, sem mediaCentavos", () => {
  const offer = toOffer(SAMPLE_DEAL);

  assert.deepEqual(offer, {
    id: "gru-lis",
    origem: "GRU",
    destino: "LIS",
    tipo: "Internacional",
    cia: "TAP",
    preco_centavos: 320000,
    media_centavos: null,
    desconto_pct: null,
    economia_centavos: null,
    is_erro_tarifa: false,
    datas_sugeridas: "01–10 set",
    affiliate_url: SAMPLE_DEAL.link,
    thumb_url: null,
    status: "rascunho",
  });
});

test("toOffer usa options.thumbUrl quando fornecido", () => {
  const offer = toOffer(SAMPLE_DEAL, { thumbUrl: "https://upload.wikimedia.org/x.jpg" });
  assert.equal(offer.thumb_url, "https://upload.wikimedia.org/x.jpg");
});

test("toOffer deixa thumb_url null quando options.thumbUrl nao e fornecido", () => {
  const offer = toOffer(SAMPLE_DEAL);
  assert.equal(offer.thumb_url, null);
});

test("toOffer calcula desconto e economia quando mediaCentavos e fornecido", () => {
  const offer = toOffer(SAMPLE_DEAL, { mediaCentavos: 400000 });

  assert.equal(offer.media_centavos, 400000);
  assert.equal(offer.desconto_pct, 20);
  assert.equal(offer.economia_centavos, 80000);
});

test("toOffer respeita options.id, options.isErroTarifa e options.status", () => {
  const offer = toOffer(SAMPLE_DEAL, {
    id: "promo-lisboa-set",
    isErroTarifa: true,
    status: "publicada",
  });

  assert.equal(offer.id, "promo-lisboa-set");
  assert.equal(offer.is_erro_tarifa, true);
  assert.equal(offer.status, "publicada");
});

test("toOffer usa codigo IATA cru como cia quando companhia nao esta no mapa", () => {
  const offer = toOffer({ ...SAMPLE_DEAL, airline: "XX" });
  assert.equal(offer.cia, "XX");
});

test("toOffer nao inclui campos que exigem curadoria editorial", () => {
  const offer = toOffer(SAMPLE_DEAL);
  for (const campo of [
    "cidade",
    "local",
    "texto",
    "dicas",
    "prova_url",
    "datas_flex",
    "published_at",
    "expires_at",
    "created_by",
  ]) {
    assert.equal(Object.prototype.hasOwnProperty.call(offer, campo), false, `nao deveria ter ${campo}`);
  }
});

// -----------------------------------------------------------------------
// toOffers
// -----------------------------------------------------------------------

test("toOffers mapeia um array de deals para Offers parciais", () => {
  const secondDeal = {
    ...SAMPLE_DEAL,
    origin: "GRU",
    destination: "REC",
    airline: "G3",
    price: 800,
    link: "https://tp.media/r?marker=424242&p=4114&u=https%3A%2F%2Fwww.aviasales.com%2Fsearch%2FGRUREC",
  };

  const offers = toOffers([SAMPLE_DEAL, secondDeal], { mediaCentavos: 400000 });

  assert.equal(offers.length, 2);
  assert.equal(offers[0].id, "gru-lis");
  assert.equal(offers[0].tipo, "Internacional");
  assert.equal(offers[1].id, "gru-rec");
  assert.equal(offers[1].tipo, "Nacional");
  assert.equal(offers[1].cia, "GOL");
  assert.equal(offers[1].preco_centavos, 80000);
});

// -----------------------------------------------------------------------
// enrichOfferWithImage / enrichOffersWithImages (com rede mockada)
// -----------------------------------------------------------------------

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Mock de fetch do Wikimedia: etapa 1 (generator=search) e etapa 2 (imageinfo).
function wikimediaFetchMock() {
  return async (url) => {
    const u = String(url);
    if (u.includes("generator=search")) {
      return jsonResponse({
        query: {
          pages: {
            "111": {
              pageid: 111,
              index: 1,
              title: "Lisboa",
              pageimage: "Lisboa_ajuda.jpg",
              thumbnail: { source: "https://upload.wikimedia.org/thumb/1200px-Lisboa.jpg", width: 1200, height: 800 },
              original: { source: "https://upload.wikimedia.org/Lisboa.jpg", width: 4000, height: 3000 },
            },
          },
        },
      });
    }
    if (u.includes("prop=imageinfo")) {
      return jsonResponse({
        query: {
          pages: {
            "222": {
              title: "File:Lisboa_ajuda.jpg",
              imageinfo: [
                {
                  user: "Fotografo",
                  descriptionurl: "https://commons.wikimedia.org/wiki/File:Lisboa_ajuda.jpg",
                  extmetadata: {
                    LicenseShortName: { value: "CC BY-SA 4.0" },
                    LicenseUrl: { value: "https://creativecommons.org/licenses/by-sa/4.0" },
                    Artist: { value: '<a href="https://example.org/u">Maria Silva</a>' },
                  },
                },
              ],
            },
          },
        },
      });
    }
    return jsonResponse({ query: { pages: {} } });
  };
}

test("enrichOfferWithImage preenche thumb_url e thumb_attribution (HTML do Artist limpo)", async (t) => {
  setFetchImpl(wikimediaFetchMock());
  t.after(() => resetFetchImpl());

  const offer = toOffer(SAMPLE_DEAL, { id: "gru-lis" });
  const enriched = await enrichOfferWithImage(offer, { query: "Lisboa" });

  assert.equal(enriched.thumb_url, "https://upload.wikimedia.org/thumb/1200px-Lisboa.jpg");
  assert.equal(enriched.thumb_attribution.author, "Maria Silva");
  assert.equal(enriched.thumb_attribution.license, "CC BY-SA 4.0");
  assert.equal(enriched.thumb_attribution.licenseUrl, "https://creativecommons.org/licenses/by-sa/4.0");
  assert.equal(enriched.thumb_attribution.sourceUrl, "https://commons.wikimedia.org/wiki/File:Lisboa_ajuda.jpg");
  // Não deve mutar o offer original.
  assert.equal(offer.thumb_url, null);
});

test("enrichOfferWithImage usa cidade||destino como query default", async (t) => {
  let captured = null;
  setFetchImpl(async (url) => {
    if (captured === null) captured = String(url);
    return wikimediaFetchMock()(url);
  });
  t.after(() => resetFetchImpl());

  const offer = { ...toOffer(SAMPLE_DEAL), cidade: "Lisboa" };
  await enrichOfferWithImage(offer);
  assert.match(captured, /gsrsearch=Lisboa/);
});

test("enrichOfferWithImage devolve o offer intacto quando o provider falha", async (t) => {
  setFetchImpl(async () => jsonResponse({}, 500));
  t.after(() => resetFetchImpl());

  const offer = toOffer(SAMPLE_DEAL, { id: "gru-lis" });
  const enriched = await enrichOfferWithImage(offer, { query: "Lisboa" });

  assert.equal(enriched.thumb_url, null);
  assert.equal(Object.prototype.hasOwnProperty.call(enriched, "thumb_attribution"), false);
});

test("enrichOffersWithImages isola falha de uma oferta (allSettled)", async (t) => {
  // Primeira oferta acha imagem; segunda (query 'boom') recebe erro HTTP.
  setFetchImpl(async (url) => {
    const u = String(url);
    if (u.includes("gsrsearch=boom")) return jsonResponse({}, 500);
    return wikimediaFetchMock()(u);
  });
  t.after(() => resetFetchImpl());

  const okOffer = { ...toOffer(SAMPLE_DEAL, { id: "ok" }), cidade: "Lisboa" };
  const badOffer = { ...toOffer(SAMPLE_DEAL, { id: "bad" }), cidade: "boom" };

  const [a, b] = await enrichOffersWithImages([okOffer, badOffer]);
  assert.equal(a.thumb_url, "https://upload.wikimedia.org/thumb/1200px-Lisboa.jpg");
  assert.equal(b.thumb_url, null); // falha isolada: offer original preservado
});
