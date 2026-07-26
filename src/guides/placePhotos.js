// Fotos reais dos pontos turisticos via Google Place Photos (New) — API oficial,
// SEM scraping. Complementa o gerador de roteiros (src/guides/) dando a cada
// ponto uma imagem de verdade (e uma foto de capa/hero ao guia).
//
// ---------------------------------------------------------------------------
// Como funciona (confirmado por WebSearch — ver docs/PESQUISA-GOOGLE.md, secao
// "Place Photos (New)"; a doc oficial retorna 403 neste ambiente, mas os campos
// abaixo foram confirmados em snippet indexado da pagina oficial):
//
// 1. No Text Search (searchPlaces), pedir `places.photos` no X-Goog-FieldMask
//    faz cada place retornar um array `photos[]`. Cada foto tem:
//      - `name`  : o RECURSO da foto, ex. "places/PLACE_ID/photos/PHOTO_RESOURCE"
//      - `widthPx` / `heightPx` : dimensoes da imagem original
//      - `authorAttributions[]` : { displayName, uri, photoUri } — ATRIBUICAO
//                                 OBRIGATORIA por politica do Google ao exibir.
//
// 2. Para obter a IMAGEM em si, um GET no endpoint /media do recurso da foto:
//      GET https://places.googleapis.com/v1/{photo.name}/media?maxWidthPx=800&key=API_KEY
//    - Sem `skipHttpRedirect` (default): o Google responde com um REDIRECT (302)
//      para a URL final da imagem — util para colocar direto em <img src=...>.
//    - Com `skipHttpRedirect=true`: responde JSON { name, photoUri } com uma URL
//      curta e de vida-curta (`photoUri`) ja resolvida.
//    - `maxWidthPx`/`maxHeightPx` aceitam 1..4800 px (pelo menos um e obrigatorio).
//
// ---------------------------------------------------------------------------
// POLITICA (Google Maps Platform):
//   (a) ATRIBUICAO por foto e OBRIGATORIA — o nome do autor (e idealmente o link)
//       de `authorAttributions[0]` deve acompanhar a imagem exibida. O montador
//       de roteiro inclui esse credito por foto na saida.
//   (b) NAO cachear/armazenar a imagem em disco: apenas REFERENCIAS estaveis (o
//       `place id` e o `photo name`/recurso) podem ser guardadas; a midia deve
//       ser re-obtida via /media. Por isso resolvePhotoUri usa a MESMA politica
//       de nao-cache das chamadas Places (`cacheTtlMs: 0`).
//   (c) CUSTO: pedir `places.photos` no Text Search nao muda o tier de forma
//       relevante alem do que rating/editorialSummary ja causam (Enterprise +
//       Atmosphere); mas a BUSCA da midia em si (/media) e cobrada a parte, no
//       SKU "Place Photo" — cada resolvePhotoUri/GET /media conta como 1 evento
//       desse SKU. buildPhotoMediaUrl (URL direta em <img>) NAO gasta chamada de
//       rede no seu processo, mas o navegador do usuario dispara o GET /media
//       (que e cobrado no SKU Place Photo quando a imagem carrega).
// ---------------------------------------------------------------------------

import { httpRequest } from "../http.js";
import { getConfig } from "../config.js";

const PLACES_MEDIA_BASE = "https://places.googleapis.com/v1/";

// Mesma mensagem/estilo de credencial ausente do placesClient.
const NO_API_KEY_ERROR =
  "GOOGLE_MAPS_API_KEY nao configurada. Crie uma chave em " +
  "console.cloud.google.com (Google Cloud) — exige uma conta de billing ativa " +
  "no projeto; a busca de midia consome o SKU Place Photo (cobrado a parte). " +
  "Ver docs/PESQUISA-GOOGLE.md.";

// Limites documentados do endpoint /media para maxWidthPx/maxHeightPx.
const MIN_PX = 1;
const MAX_PX = 4800;

function clampPx(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(MAX_PX, Math.max(MIN_PX, Math.round(n)));
}

/**
 * Monta (funcao PURA, sem rede) a URL do endpoint /media de uma foto do Places.
 * A URL final ja embute a API key e pode ser usada DIRETO em `<img src>` — o
 * Google responde com um redirect (302) para a imagem. Alternativamente, o
 * consumidor pode acrescentar `&skipHttpRedirect=true` (ou usar resolvePhotoUri)
 * para obter JSON `{ photoUri }` sem seguir o redirect.
 *
 * @param {string} photoName recurso da foto ("places/PLACE_ID/photos/RESOURCE")
 * @param {object} [opts]
 * @param {number} [opts.maxWidthPx=800] largura maxima (1..4800)
 * @param {number} [opts.maxHeightPx]    altura maxima (1..4800), opcional
 * @param {string} [opts.apiKey]         override da chave (default: config/env)
 * @returns {string} URL absoluta do endpoint /media (com a API key)
 * @throws {Error} se photoName for vazio/invalido, ou se faltar a API key
 *
 * OBS: e a UNICA funcao do modulo que lanca — por ser pura e de montagem, um
 * argumento invalido e erro de programacao, nao uma falha de runtime resiliente.
 */
export function buildPhotoMediaUrl(photoName, { maxWidthPx = 800, maxHeightPx, apiKey } = {}) {
  if (!photoName || typeof photoName !== "string" || photoName.trim() === "") {
    throw new Error("photoName e obrigatorio para buildPhotoMediaUrl");
  }
  const key = apiKey || getConfig().googleMaps.apiKey;
  if (!key) {
    throw new Error(NO_API_KEY_ERROR);
  }

  const params = new URLSearchParams();
  params.set("maxWidthPx", String(clampPx(maxWidthPx, 800)));
  if (maxHeightPx != null) params.set("maxHeightPx", String(clampPx(maxHeightPx, 800)));
  params.set("key", key);

  // photoName ja e um path de recurso ("places/.../photos/..."); nao o
  // encodamos inteiro (as barras sao significativas), so o anexamos ao /v1/.
  return `${PLACES_MEDIA_BASE}${photoName.trim()}/media?${params.toString()}`;
}

/**
 * Resolve a URL curta da imagem (`photoUri`) chamando o endpoint /media com
 * `skipHttpRedirect=true` — o Google devolve JSON { name, photoUri } em vez de
 * seguir o redirect. Faz REDE (consome o SKU Place Photo). Respeita a MESMA
 * politica de nao-cache das chamadas Places (`cacheTtlMs: 0`).
 *
 * @param {string} photoName recurso da foto
 * @param {object} [opts] mesmas options de buildPhotoMediaUrl
 * @returns {Promise<{ok: boolean, photoUri?: string, error?: string}>}
 *
 * Resiliente: NUNCA lanca. Sem key => { ok:false, error } com instrucao.
 */
export async function resolvePhotoUri(photoName, { maxWidthPx = 800, maxHeightPx, apiKey } = {}) {
  const key = apiKey || getConfig().googleMaps.apiKey;
  if (!key) {
    return { ok: false, error: NO_API_KEY_ERROR };
  }
  if (!photoName || typeof photoName !== "string" || photoName.trim() === "") {
    return { ok: false, error: "photoName e obrigatorio para resolvePhotoUri" };
  }

  let url;
  try {
    url = buildPhotoMediaUrl(photoName, { maxWidthPx, maxHeightPx, apiKey: key });
  } catch (err) {
    return { ok: false, error: (err && err.message) || String(err) };
  }
  url += "&skipHttpRedirect=true";

  let res;
  try {
    res = await httpRequest(url, {
      method: "GET",
      headers: { "X-Goog-Api-Key": key },
      // Politica do Google: nao cachear a midia; so referencias (name/place id).
      cacheTtlMs: 0,
    });
  } catch (err) {
    return { ok: false, error: (err && err.message) || String(err) };
  }

  if (!res.ok) {
    return { ok: false, error: res.error || "Falha ao resolver a foto (Place Photo)" };
  }
  const photoUri = res.data && typeof res.data === "object" ? res.data.photoUri : null;
  if (!photoUri) {
    return { ok: false, error: "Resposta do Place Photo sem photoUri" };
  }
  return { ok: true, photoUri };
}

/**
 * Extrai a PRIMEIRA foto de um `place` (do searchPlaces, com `photos[]` cru) e
 * devolve um objeto pronto para o roteiro — com a URL de midia (via
 * buildPhotoMediaUrl, SEM rede) e a atribuicao obrigatoria do autor.
 *
 * @param {object} place place com array `photos` (shape cru do Google)
 * @param {object} [opts]
 * @param {number} [opts.maxWidthPx=800]
 * @param {number} [opts.maxHeightPx]
 * @param {string} [opts.apiKey]
 * @returns {{ mediaUrl: string, attribution: {text: string, uri: string|null},
 *            widthPx: number|null, heightPx: number|null } | null}
 *   null quando o place nao tem fotos, ou quando falta a API key (sem key nao
 *   da para montar a URL — degrada com elegancia, sem lancar).
 *
 * OBS (politica): guardar a IMAGEM em disco e vedado; apenas o `place id` e o
 * `photo name` (contido em mediaUrl) podem ser guardados como referencia.
 */
export function firstPhotoFrom(place, { maxWidthPx = 800, maxHeightPx, apiKey } = {}) {
  const photos = place && Array.isArray(place.photos) ? place.photos : [];
  if (photos.length === 0) return null;

  const photo = photos[0];
  const photoName = photo && typeof photo.name === "string" ? photo.name : null;
  if (!photoName) return null;

  let mediaUrl;
  try {
    mediaUrl = buildPhotoMediaUrl(photoName, { maxWidthPx, maxHeightPx, apiKey });
  } catch {
    // Sem API key (ou name invalido): sem foto exibivel — degrada para null.
    return null;
  }

  const attr = Array.isArray(photo.authorAttributions) ? photo.authorAttributions[0] : null;
  const attribution = {
    // displayName e o nome do autor exigido na atribuicao; sem ele, credito neutro.
    text: (attr && (attr.displayName || attr.text)) || "Google",
    uri: (attr && attr.uri) || null,
  };

  return {
    mediaUrl,
    attribution,
    widthPx: typeof photo.widthPx === "number" ? photo.widthPx : null,
    heightPx: typeof photo.heightPx === "number" ? photo.heightPx : null,
  };
}
