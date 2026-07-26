// Cliente da Google Places API (New) — Text Search — para buscar pontos
// turisticos reais que alimentam o gerador de roteiros (src/guides/).
//
// Endpoint (confirmado na pesquisa — ver docs/PESQUISA-GOOGLE.md, secao 2):
//   POST https://places.googleapis.com/v1/places:searchText
//   Headers obrigatorios:
//     Content-Type: application/json
//     X-Goog-Api-Key: {GOOGLE_MAPS_API_KEY}
//     X-Goog-FieldMask: <lista de campos> (OBRIGATORIO — sem ele a chamada
//                        retorna erro; nao ha lista padrao de campos)
//   Corpo JSON: { textQuery, languageCode, regionCode, includedType,
//                 maxResultCount }
//
// A-VALIDAR com chamada real (a pesquisa marca como nao-100%-confirmado, pois
// o WebFetch estava bloqueado no ambiente de pesquisa; os nomes abaixo sao os
// da doc indexada):
//   - `includedType` (singular, um unico tipo, ex. "tourist_attraction") no
//     corpo JSON — confirmar nome exato e se aceita lista.
//   - `languageCode` / `regionCode` no CORPO JSON do POST (esperado) e nao
//     como query string.
//
// ---------------------------------------------------------------------------
// (a) CUSTO / SKU — o Text Search (New) cobra por tier conforme os campos
//     pedidos no FieldMask (billing "tiered"):
//       - so ID (places.id, ...)              -> Text Search Essentials (ID Only)
//       - endereco/localizacao/tipos/uri      -> Text Search Pro
//       - rating, userRatingCount,
//         editorialSummary (atmosfera)        -> Text Search ENTERPRISE +
//                                                ATMOSPHERE (tier mais caro)
//     Como o caso de uso pede rating + editorialSummary, a chamada default cai
//     no tier mais caro. Para reduzir custo, passe `fields` com um FieldMask
//     enxuto (ex.: so displayName/formattedAddress/location) — ver option
//     `fields` de searchPlaces.
//
// (b) POLITICA DE CACHE do Google Maps Platform: e PROIBIDO pre-buscar,
//     cachear ou armazenar o conteudo retornado pela Places API alem da
//     sessao — EXCETO o `place id`, que pode ser armazenado indefinidamente.
//     Por isso este cliente NAO usa o cache TTL em memoria do http.js para as
//     respostas Places: passamos `cacheTtlMs: 0` em cada chamada para desligar
//     o cache por chamada (ver resolveCacheTtl em src/http.js — cacheTtlMs:0
//     forca TTL 0; alem disso, o cache do http.js so vale para GET e estas
//     chamadas sao POST, mas mantemos o 0 explicito por robustez e clareza).
//
// (c) ATRIBUICAO: ao exibir dados da Places API fora de um Google Map e
//     obrigatorio atribuir ("Dados de lugares: Google"). O montador de
//     roteiro (itineraryBuilder.js) inclui essa atribuicao na saida.
// ---------------------------------------------------------------------------

import { httpRequest } from "../http.js";
import { getConfig } from "../config.js";

const PLACES_SEARCH_TEXT_URL = "https://places.googleapis.com/v1/places:searchText";

// FieldMask default — campos uteis para pontos turisticos. Inclui campos de
// "atmosfera" (rating, userRatingCount, editorialSummary) => tier Enterprise +
// Atmosphere. Use a option `fields` para um FieldMask mais enxuto/barato.
//
// `places.photos` acompanha o roteiro com imagens reais (Place Photos). Pedir
// photos NAO muda o tier de forma relevante alem do que rating/editorialSummary
// ja causam (Enterprise + Atmosphere): o array de photos aqui traz so as
// REFERENCIAS das fotos (name/widthPx/heightPx/authorAttributions). A BUSCA da
// midia em si (endpoint /media, ver src/guides/placePhotos.js) e cobrada a
// parte, no SKU "Place Photo" — nao neste Text Search.
const DEFAULT_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.rating",
  "places.userRatingCount",
  "places.editorialSummary",
  "places.types",
  "places.googleMapsUri",
  "places.photos",
].join(",");

// Mensagem de erro padrao do modulo quando falta a credencial (com instrucao
// de onde obter, seguindo o padrao dos outros parceiros).
const NO_API_KEY_ERROR =
  "GOOGLE_MAPS_API_KEY nao configurada. Crie uma chave em " +
  "console.cloud.google.com (Google Cloud) — exige uma conta de billing ativa " +
  "no projeto; ha cota gratuita mensal por SKU desde mar/2025 " +
  "(ex.: Enterprise ~1.000 chamadas/mes). Ver docs/PESQUISA-GOOGLE.md.";

// Resume o corpo bruto de uma resposta inesperada para diagnostico, sem
// estourar o tamanho (mesma abordagem de partners/travelpayouts.js).
function summarizeBody(data) {
  let text;
  try {
    text = typeof data === "string" ? data : JSON.stringify(data);
  } catch {
    text = String(data);
  }
  if (!text) return "(vazio)";
  return text.length > 300 ? `${text.slice(0, 300)}...` : text;
}

// Normaliza um `place` da resposta da Places API (New) para o shape estavel
// que o resto do modulo consome. Campos ausentes viram null (nunca undefined).
function normalizePlace(place) {
  if (!place || typeof place !== "object") return null;

  const location = place.location || {};

  return {
    id: place.id || null,
    // displayName vem como { text, languageCode } na Places API (New).
    name: place.displayName?.text || place.displayName || null,
    address: place.formattedAddress || null,
    lat: typeof location.latitude === "number" ? location.latitude : null,
    lng: typeof location.longitude === "number" ? location.longitude : null,
    rating: typeof place.rating === "number" ? place.rating : null,
    ratingCount:
      typeof place.userRatingCount === "number" ? place.userRatingCount : null,
    // editorialSummary vem como { text, languageCode }; ausente em muitos
    // lugares — nesse caso `summary` fica null (nao inventamos texto).
    summary: place.editorialSummary?.text || null,
    types: Array.isArray(place.types) ? place.types : [],
    mapsUri: place.googleMapsUri || null,
    // Array CRU de fotos do Google (name/widthPx/heightPx/authorAttributions),
    // repassado sem transformar para o builder decidir o que exibir (via
    // firstPhotoFrom em src/guides/placePhotos.js). Ausente => [].
    photos: Array.isArray(place.photos) ? place.photos : [],
  };
}

/**
 * Busca lugares via Google Places API (New) — Text Search.
 *
 * @param {object} params
 * @param {string} params.query       texto da busca (ex.: "pontos turisticos em Recife")
 * @param {string} [params.includedType] tipo unico p/ restringir (ex.: "tourist_attraction")
 * @param {number} [params.maxResults=20] maxResultCount enviado a API
 * @param {string} [params.regionCode] bias regional (ex.: "BR")
 * @param {string} [params.languageCode="pt-BR"]
 * @param {string} [params.fields]    FieldMask customizado (enxuto = mais barato)
 * @param {string} [params.apiKey]    override da chave (default: config/env)
 * @returns {Promise<{ok: boolean, places: Array, error?: string}>}
 *   places: [{ id, name, address, lat, lng, rating, ratingCount, summary, types, mapsUri }]
 *
 * Resiliente: NUNCA lanca excecao. Toda falha (credencial ausente, erro
 * HTTP/rede, JSON invalido, formato inesperado) volta como { ok:false, error }.
 */
export async function searchPlaces({
  query,
  includedType,
  maxResults = 20,
  regionCode,
  languageCode = "pt-BR",
  fields,
  apiKey,
} = {}) {
  const key = apiKey || getConfig().googleMaps.apiKey;

  if (!key) {
    return { ok: false, places: [], error: NO_API_KEY_ERROR };
  }
  if (!query || typeof query !== "string" || query.trim() === "") {
    return { ok: false, places: [], error: "query e obrigatoria para searchPlaces" };
  }

  // Corpo do POST. languageCode/regionCode/includedType/maxResultCount vao no
  // corpo (a-validar com chamada real — ver comentario de topo).
  const requestBody = { textQuery: query, languageCode };
  if (regionCode) requestBody.regionCode = regionCode;
  if (includedType) requestBody.includedType = includedType;
  if (maxResults != null) requestBody.maxResultCount = maxResults;

  let res;
  try {
    res = await httpRequest(PLACES_SEARCH_TEXT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": fields || DEFAULT_FIELD_MASK,
      },
      body: JSON.stringify(requestBody),
      // Politica do Google: nao cachear respostas Places (exceto place id).
      // Desliga o cache em memoria do http.js para esta chamada.
      cacheTtlMs: 0,
    });
  } catch (err) {
    // Rede de seguranca: httpRequest ja nao lanca, mas garantimos o contrato.
    return { ok: false, places: [], error: (err && err.message) || String(err) };
  }

  if (!res.ok) {
    // Erro HTTP/rede — inclui o corpo resumido quando o Google detalha o erro.
    const detail = res.data ? ` Corpo: ${summarizeBody(res.data)}` : "";
    return {
      ok: false,
      places: [],
      error: `${res.error || "Falha ao chamar a Places API"}.${detail}`.trim(),
    };
  }

  // Resposta ok mas em formato inesperado (sem o array `places`).
  if (!res.data || typeof res.data !== "object") {
    return {
      ok: false,
      places: [],
      error: `Resposta da Places API em formato inesperado. Corpo: ${summarizeBody(res.data)}`,
    };
  }

  // Uma busca valida sem resultados retorna { } ou { places: [] } — trate
  // como ok:true com lista vazia (nao e erro).
  const rawPlaces = Array.isArray(res.data.places) ? res.data.places : [];
  const places = rawPlaces.map(normalizePlace).filter(Boolean);

  return { ok: true, places, error: null };
}

// Exportados para reuso/testes.
export { DEFAULT_FIELD_MASK, normalizePlace };
