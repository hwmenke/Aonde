// wikimediaProvider — busca imagens REAIS de destinos usando a MediaWiki
// Action API oficial (Wikipedia em pt + fallback Wikimedia Commons). Gratuita,
// SEM chave de API. As imagens do Commons sao livres e podem ser reutilizadas
// COM atribuicao (autor + licenca) — este provider extrai esses metadados.
//
// ---------------------------------------------------------------------------
// ENDPOINTS (Action API, sem chave):
//   - pt.wikipedia.org/w/api.php   (busca principal, conteudo em pt-BR)
//   - commons.wikimedia.org/w/api.php (fallback / banco de midia)
//
// ETIQUETA WIKIMEDIA (obrigatoria — ver Wikimedia User-Agent policy):
//   - Toda chamada DEVE enviar um header User-Agent descritivo. Requisicoes
//     sem User-Agent (ou genericas) podem ser bloqueadas (HTTP 403). Usamos
//     `Aonde-Affiliates/1.0 (+contato via repositorio)`.
//   - Nao martelar a API: este provider faz no maximo ~2 chamadas por destino
//     (1 busca + 1 imageinfo) e destina-se ao pipeline de CURADORIA/build, nao
//     ao hot path de request. Use no maximo ~1 destino por vez no build.
//
// CACHE: as URLs de imagem do Wikimedia (upload.wikimedia.org) sao ESTAVEIS e
//   livremente reutilizaveis COM atribuicao — logo, PODEM ser cacheadas com
//   seguranca. Ao contrario do cliente da Places API (que forca cacheTtlMs:0
//   por politica do Google), este provider NAO desliga o cache do http.js.
//   Observacao: a heuristica atual do http.js (resolveCacheTtl) so cacheia por
//   padrao a Data API do Travelpayouts, entao na pratica as respostas do
//   Wikimedia nao ficam em cache hoje — mas seriam seguras de cachear, e como o
//   provider faz ~1 chamada por destino no build, isso nao e um problema.
//
// LICENCA/ATRIBUICAO: obrigatorio citar autor + licenca das imagens do Commons.
//   Extraimos de `extmetadata`: LicenseShortName, LicenseUrl, Artist (pode vir
//   com HTML — limpamos as tags e deixamos so o texto), Credit; e o
//   `descriptionurl` (pagina do arquivo no Commons) como sourceUrl.
//
// A-VALIDAR: os nomes de parametros/campos abaixo seguem a doc oficial da
//   MediaWiki (API:Pageimages, API:Imageinfo, API:Page_info_in_search_results),
//   confirmada por WebSearch. A doc pode dar 403 a WebFetch no ambiente de
//   pesquisa; os shapes de resposta usados aqui foram modelados a partir da
//   doc indexada e das fixtures de teste.
// ---------------------------------------------------------------------------

import { httpRequest } from "../http.js";

// User-Agent exigido pela Wikimedia. Descritivo, identifica a aplicacao.
export const WIKIMEDIA_USER_AGENT =
  "Aonde-Affiliates/1.0 (+contato via repositorio; Node.js)";

// Endpoints da Action API. pt.wikipedia e a fonte primaria (conteudo em pt-BR);
// commons e o fallback (banco de midia livre).
export const PT_WIKIPEDIA_API = "https://pt.wikipedia.org/w/api.php";
export const COMMONS_API = "https://commons.wikimedia.org/w/api.php";

const DEFAULT_WIDTH = 1200;

/**
 * Monta a URL da Action API para a etapa 1 (busca da pagina mais relevante +
 * sua imagem principal). Usa `generator=search` para achar a pagina e
 * `prop=pageimages` para extrair thumbnail/original dessa pagina.
 *
 * @param {string} endpoint base da api.php
 * @param {string} query termo de busca (ex.: "Lisboa")
 * @param {number} width tamanho do thumbnail (pithumbsize)
 * @returns {string}
 */
export function buildSearchImageUrl(endpoint, query, width = DEFAULT_WIDTH) {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    // origin=* coloca a chamada em modo anonimo/CORS (inofensivo para leitura
    // publica; a doc oficial sugere para chamadas cross-origin).
    origin: "*",
    prop: "pageimages|pageterms",
    piprop: "thumbnail|original",
    pithumbsize: String(width),
    generator: "search",
    gsrsearch: query,
    gsrlimit: "1",
    gsrnamespace: "0",
  });
  return `${endpoint}?${params.toString()}`;
}

/**
 * Monta a URL da Action API para a etapa 2 (metadados de licenca/atribuicao do
 * arquivo de imagem). imageinfo com iiprop=extmetadata|url|user.
 *
 * @param {string} endpoint base da api.php
 * @param {string} fileTitle titulo do arquivo (ex.: "Lisboa.jpg" ou "File:Lisboa.jpg")
 * @returns {string}
 */
export function buildImageInfoUrl(endpoint, fileTitle) {
  const title = /^file:/i.test(fileTitle) ? fileTitle : `File:${fileTitle}`;
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    origin: "*",
    titles: title,
    prop: "imageinfo",
    iiprop: "extmetadata|url|user",
  });
  return `${endpoint}?${params.toString()}`;
}

// Remove tags HTML e normaliza espacos — o campo Artist do extmetadata
// frequentemente vem como HTML (ex.: `<a href="...">Fulano</a>`). Nunca lanca.
export function stripHtml(value) {
  if (value == null) return null;
  const text = String(value)
    .replace(/<[^>]*>/g, " ") // remove tags
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
  return text === "" ? null : text;
}

// Le com seguranca `extmetadata[campo].value` (o extmetadata tem shape
// { Campo: { value, source, ... } }). Retorna null se ausente.
function extValue(extmetadata, key) {
  const entry = extmetadata && extmetadata[key];
  if (entry && typeof entry === "object" && "value" in entry) {
    return entry.value;
  }
  return null;
}

// Extrai a primeira pagina "real" (com thumbnail/pageimage) do resultado de
// generator=search. As paginas vem como objeto { pageid: {...} }; ordenamos
// por `index` (ordem da busca) para pegar a mais relevante.
function firstPageWithImage(data) {
  const pages = data?.query?.pages;
  if (!pages || typeof pages !== "object") return null;
  const list = Object.values(pages).filter((p) => p && typeof p === "object");
  list.sort((a, b) => (a.index ?? 1e9) - (b.index ?? 1e9));
  // Prefere uma pagina que tenha imagem; se nenhuma tiver, usa a primeira.
  return list.find((p) => p.thumbnail || p.original || p.pageimage) || list[0] || null;
}

// Extrai o objeto imageinfo[0] da resposta da etapa 2.
function firstImageInfo(data) {
  const pages = data?.query?.pages;
  if (!pages || typeof pages !== "object") return null;
  for (const page of Object.values(pages)) {
    if (page && Array.isArray(page.imageinfo) && page.imageinfo.length > 0) {
      return page.imageinfo[0];
    }
  }
  return null;
}

// Monta o bloco de atribuicao a partir do imageinfo. Sempre retorna um objeto
// (campos ausentes viram null) — nunca lanca.
function buildAttribution(imageinfo) {
  const ext = imageinfo?.extmetadata || {};
  return {
    author: stripHtml(extValue(ext, "Artist")) || imageinfo?.user || null,
    license: stripHtml(extValue(ext, "LicenseShortName")),
    licenseUrl: extValue(ext, "LicenseUrl") || null,
    credit: stripHtml(extValue(ext, "Credit")),
    // descriptionurl aponta para a pagina do arquivo no Commons/Wikipedia.
    sourceUrl: imageinfo?.descriptionurl || null,
  };
}

// Executa UMA tentativa completa (busca + imageinfo) contra um endpoint.
// Retorna { ok, ... } ou { ok:false } para sinalizar "tente o fallback".
async function tryEndpoint(endpoint, query, width) {
  const searchUrl = buildSearchImageUrl(endpoint, query, width);
  const searchRes = await httpRequest(searchUrl, {
    headers: { "User-Agent": WIKIMEDIA_USER_AGENT },
  });
  if (!searchRes.ok || !searchRes.data) return { ok: false };

  const page = firstPageWithImage(searchRes.data);
  if (!page) return { ok: false };

  const thumb = page.thumbnail || null;
  const original = page.original || null;
  const imageUrl = original?.source || thumb?.source || null;
  const thumbUrl = thumb?.source || original?.source || null;
  if (!imageUrl && !thumbUrl) return { ok: false };

  // Etapa 2: metadados de licenca/atribuicao a partir do arquivo. O `pageimage`
  // e o nome do arquivo da imagem principal da pagina.
  let attribution = { author: null, license: null, licenseUrl: null, credit: null, sourceUrl: null };
  if (page.pageimage) {
    const infoUrl = buildImageInfoUrl(endpoint, page.pageimage);
    const infoRes = await httpRequest(infoUrl, {
      headers: { "User-Agent": WIKIMEDIA_USER_AGENT },
    });
    if (infoRes.ok && infoRes.data) {
      const imageinfo = firstImageInfo(infoRes.data);
      if (imageinfo) attribution = buildAttribution(imageinfo);
    }
  }

  return {
    ok: true,
    imageUrl: imageUrl || thumbUrl,
    thumbUrl: thumbUrl || imageUrl,
    width: thumb?.width ?? original?.width ?? null,
    height: thumb?.height ?? original?.height ?? null,
    attribution,
    error: null,
  };
}

/**
 * Busca uma imagem representativa de um destino no Wikimedia (Wikipedia pt com
 * fallback para o Commons). Resiliente: NUNCA lanca excecao.
 *
 * @param {object} params
 * @param {string} params.query termo do destino (ex.: "Lisboa", "Fernando de Noronha")
 * @param {string} [params.lang="pt"] idioma da Wikipedia (usa o subdominio {lang}.wikipedia.org)
 * @param {number} [params.width=1200] tamanho do thumbnail (pithumbsize)
 * @returns {Promise<{ok: boolean, imageUrl?: string, thumbUrl?: string,
 *   width?: number|null, height?: number|null,
 *   attribution?: { author: string|null, license: string|null, licenseUrl: string|null, credit: string|null, sourceUrl: string|null },
 *   error: string|null}>}
 */
export async function getDestinationImage({ query, lang = "pt", width = DEFAULT_WIDTH } = {}) {
  if (!query || typeof query !== "string" || query.trim() === "") {
    return { ok: false, error: "query e obrigatoria para getDestinationImage" };
  }
  const term = query.trim();

  // Endpoints a tentar, em ordem: Wikipedia no idioma pedido, depois Commons.
  const langEndpoint =
    lang && lang !== "pt"
      ? `https://${lang}.wikipedia.org/w/api.php`
      : PT_WIKIPEDIA_API;
  const endpoints = [langEndpoint];
  if (!endpoints.includes(COMMONS_API)) endpoints.push(COMMONS_API);

  try {
    for (const endpoint of endpoints) {
      const result = await tryEndpoint(endpoint, term, width);
      if (result.ok) return result;
    }
  } catch (err) {
    // Rede de seguranca: httpRequest ja nao lanca, mas garantimos o contrato.
    return { ok: false, error: (err && err.message) || String(err) };
  }

  return {
    ok: false,
    error: `Nenhuma imagem encontrada no Wikimedia para '${term}'`,
  };
}
