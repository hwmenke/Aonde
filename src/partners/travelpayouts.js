// Travelpayouts (Aviasales / Kiwi / Hotellook / WayAway)
//
// Este e o unico parceiro do conjunto com API real tanto para geracao de
// links quanto para busca de ofertas (Data API). Ver docs/PESQUISA-PARCEIROS.md
// para as fontes oficiais e o detalhamento completo.
//
// Modos de geracao de link:
//   (a) "template" — monta localmente o link do redirecionador tp.media.
//       Nao requer TRAVELPAYOUTS_TOKEN, apenas o marker (Partner ID).
//   (b) "api"      — chama POST /links/v1/create quando TRAVELPAYOUTS_TOKEN
//       esta presente e o chamador pede explicitamente (options.useApi=true).
//
// Rate limits documentados (nao aplicados/throttled dentro do modulo — apenas
// documentados aqui para quem for orquestrar chamadas em lote):
//   - Data API (busca de precos): ~200 requisicoes/hora por IP.
//   - /links/v1/create: max. 100 requisicoes/minuto por marker; max. 10 links
//     por requisicao; deve-se usar links completos (nao links curtos da marca).
//   - Flights Search API (busca em tempo real, NAO implementada aqui): exige
//     projeto com >= 50.000 MAU (usuarios ativos mensais) — fora de escopo.

import { httpRequest } from "../http.js";
import { getConfig } from "../config.js";

const TP_MEDIA_BASE = "https://tp.media/r";
const API_BASE = "https://api.travelpayouts.com";

// ID de programa (brand) usado nos exemplos oficiais de tp.media para a
// Aviasales. Pode ser sobrescrito via options.programId em cada chamada.
const DEFAULT_TP_PROGRAM_ID = 4114;

export const TRAVELPAYOUTS_LINKS_API_RATE_LIMIT = {
  requestsPerMinute: 100,
  maxLinksPerRequest: 10,
};

export const TRAVELPAYOUTS_DATA_API_RATE_LIMIT = {
  requestsPerHourPerIp: 200,
};

/**
 * Monta o link de afiliado via redirecionador tp.media, sem chamar nenhuma API.
 * Formato oficial: https://tp.media/r?marker={marker}&p={programId}&u={urlEncoded}
 * SubID de tracking: acrescentado ao marker como "{marker}.{subId}".
 */
export function buildTpMediaLink({ marker, programId, url, subId }) {
  if (!marker) {
    throw new Error("marker (TRAVELPAYOUTS_MARKER) e obrigatorio para montar o link tp.media");
  }
  if (!programId) {
    throw new Error("programId e obrigatorio para montar o link tp.media");
  }
  if (!url) {
    throw new Error("url de destino e obrigatoria para montar o link tp.media");
  }

  const markerParam = subId ? `${marker}.${subId}` : String(marker);
  const params = new URLSearchParams({
    marker: markerParam,
    p: String(programId),
    u: url,
  });
  return `${TP_MEDIA_BASE}?${params.toString()}`;
}

/**
 * A Data API retorna paths relativos (ex.: "/search/GRULIS0109") apontando
 * para aviasales.com. Aqui compomos a URL absoluta e aplicamos o marker de
 * afiliado via tp.media, para que o link do "deal" ja saia rastreavel.
 */
export function buildAviasalesLink({ marker, path, programId = DEFAULT_TP_PROGRAM_ID }) {
  if (!path) return null;

  const absoluteUrl = path.startsWith("http")
    ? path
    : `https://www.aviasales.com${path.startsWith("/") ? "" : "/"}${path}`;

  if (!marker) return absoluteUrl; // sem marker nao ha como aplicar tracking

  return buildTpMediaLink({ marker, programId, url: absoluteUrl });
}

/**
 * getDealLink("travelpayouts", options)
 * options: { destinationUrl, programId, affiliateId, subId, useApi }
 */
export async function getDealLinkTravelpayouts(options = {}) {
  const config = getConfig().travelpayouts;
  const marker = options.affiliateId || config.marker;
  const destinationUrl = options.destinationUrl;
  const subId = options.subId;

  if (!marker) {
    return {
      ok: false,
      partner: "travelpayouts",
      method: "template",
      error:
        "TRAVELPAYOUTS_MARKER nao configurado. Cadastre-se em travelpayouts.com e pegue seu Partner ID em Profile.",
    };
  }
  if (!destinationUrl) {
    return {
      ok: false,
      partner: "travelpayouts",
      method: options.useApi ? "api" : "template",
      error: "destinationUrl e obrigatorio",
    };
  }

  if (options.useApi) {
    if (!config.token) {
      return {
        ok: false,
        partner: "travelpayouts",
        method: "api",
        error:
          "TRAVELPAYOUTS_TOKEN nao configurado. Necessario para usar a API de criacao de links (/links/v1/create).",
      };
    }
    return createLinkViaApi({
      token: config.token,
      marker,
      destinationUrl,
      subId,
      trs: options.trs, // ID do projeto conectado a brand (ver createLinkViaApi)
      shorten: options.shorten,
    });
  }

  const programId = options.programId || DEFAULT_TP_PROGRAM_ID;

  try {
    const url = buildTpMediaLink({ marker, programId, url: destinationUrl, subId });
    return { ok: true, url, partner: "travelpayouts", method: "template" };
  } catch (err) {
    return { ok: false, partner: "travelpayouts", method: "template", error: err.message };
  }
}

// POST https://api.travelpayouts.com/links/v1/create
//
// Formato do CORPO confirmado em 22/07/2026 via os exemplos oficiais do artigo
// "API for Travelpayouts partner links" (obtidos por WebSearch dos resumos
// indexados da pagina oficial; a pagina em si retorna HTTP 403 neste ambiente):
//   https://support.travelpayouts.com/hc/en-us/articles/25289759198226-API-for-Travelpayouts-partner-links
//
//   {
//     "trs": 197987,            // ID do PROJETO conectado a brand (nao e o marker)
//     "marker": 339296,         // Partner ID
//     "shorten": true,          // encurtar a URL?
//     "links": [                // ate 10 objetos por requisicao
//       { "url": "https://...", "sub_id": "opcional" }
//     ]
//   }
//
// Correcoes vs. a versao anterior (que fora montada "de cabeca"):
//   - `links` e um array de OBJETOS { url, sub_id? }, NAO de strings.
//   - `sub_id` vai DENTRO do objeto do link (nao concatenado ao marker).
//   - `trs` e o ID do projeto conectado a brand, NAO `marker.subId`.
//
// Ressalva: o formato exato da RESPOSTA nao pode ser confirmado (as paginas
// oficiais retornam 403 aqui). Por isso o parsing abaixo (extractGeneratedLink)
// tolera varios formatos plausiveis e, quando nao reconhece nenhum, devolve
// ok:false com o corpo bruto resumido no erro — o que facilita depurar quando
// o usuario tiver uma credencial real em maos.
async function createLinkViaApi({ token, marker, destinationUrl, subId, trs, shorten }) {
  const link = { url: destinationUrl };
  if (subId) link.sub_id = String(subId);

  const body = {
    marker,
    shorten: Boolean(shorten),
    links: [link],
  };
  // `trs` (ID do projeto/brand) e exigido pela API; so o incluimos se o
  // chamador o forneceu — sem ele, a propria API respondera com erro, que
  // sera propagado normalmente.
  if (trs !== undefined && trs !== null && trs !== "") {
    body.trs = trs;
  }

  const res = await httpRequest(`${API_BASE}/links/v1/create`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Access-Token": token,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    return {
      ok: false,
      partner: "travelpayouts",
      method: "api",
      error: res.error || "Falha ao chamar a API de criacao de links do Travelpayouts",
    };
  }

  const generatedUrl = extractGeneratedLink(res.data);
  if (!generatedUrl) {
    return {
      ok: false,
      partner: "travelpayouts",
      method: "api",
      error: `Resposta da API em formato inesperado (nao foi possivel extrair o link gerado). Corpo: ${summarizeBody(res.data)}`,
    };
  }

  return { ok: true, url: generatedUrl, partner: "travelpayouts", method: "api" };
}

// Extrai a URL gerada da resposta de /links/v1/create tolerando os formatos
// plausiveis (o schema oficial da resposta nao pode ser confirmado neste
// ambiente — ver comentario de createLinkViaApi). Procura, em ordem:
//   - array de itens, cada um com link/partner_link/url/shorten/shorten_link
//   - objeto unico com link/partner_link/url/...
//   - objeto com { data: [...] } ou { links: [...] } aninhado
function extractGeneratedLink(data) {
  if (!data) return null;

  const linkFromItem = (item) => {
    if (!item) return null;
    if (typeof item === "string") return item;
    return (
      item.link ||
      item.partner_link ||
      item.partnerLink ||
      item.shorten ||
      item.shorten_link ||
      item.shortenLink ||
      item.short_link ||
      item.url ||
      null
    );
  };

  if (Array.isArray(data)) return linkFromItem(data[0]);
  if (Array.isArray(data.links)) return linkFromItem(data.links[0]);
  if (Array.isArray(data.data)) return linkFromItem(data.data[0]);
  return linkFromItem(data);
}

// Resume o corpo bruto (para diagnostico em mensagens de erro) sem estourar o
// tamanho: serializa e trunca em ~300 caracteres.
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

/**
 * searchDeals via Travelpayouts Data API (precos em cache, nao tempo real).
 * Endpoint: GET /aviasales/v3/prices_for_dates
 * Auth: header X-Access-Token.
 * options: { origin, destination, dateFrom, dateTo, currency, limit, page,
 *            oneWay, direct, affiliateId }
 */
export async function searchDealsTravelpayouts(options = {}) {
  const config = getConfig().travelpayouts;
  const token = config.token;

  if (!token) {
    return {
      ok: false,
      partner: "travelpayouts",
      deals: [],
      error: "TRAVELPAYOUTS_TOKEN nao configurado (necessario para a Data API)",
    };
  }

  const {
    origin,
    destination,
    dateFrom,
    dateTo,
    currency = "BRL",
    limit = 30,
    page = 1,
    oneWay,
    direct,
  } = options;

  if (!origin || !destination) {
    return {
      ok: false,
      partner: "travelpayouts",
      deals: [],
      error: "origin e destination sao obrigatorios",
    };
  }

  const params = new URLSearchParams({
    origin,
    destination,
    currency,
    market: "br",
    limit: String(limit),
    page: String(page),
  });
  if (dateFrom) params.set("departure_at", dateFrom);
  if (dateTo) params.set("return_at", dateTo);
  if (typeof oneWay === "boolean") params.set("one_way", String(oneWay));
  if (typeof direct === "boolean") params.set("direct", String(direct));

  const res = await httpRequest(`${API_BASE}/aviasales/v3/prices_for_dates?${params.toString()}`, {
    method: "GET",
    headers: { "X-Access-Token": token },
  });

  if (!res.ok) {
    return {
      ok: false,
      partner: "travelpayouts",
      deals: [],
      error: res.error || "Falha ao consultar a Data API do Travelpayouts",
    };
  }

  if (!res.data || res.data.success === false) {
    return {
      ok: false,
      partner: "travelpayouts",
      deals: [],
      error: res.data?.error || "A API respondeu com success=false",
    };
  }

  const marker = options.affiliateId || config.marker;
  const rawDeals = Array.isArray(res.data.data) ? res.data.data : [];
  const deals = rawDeals.map((item) => normalizeDataApiItem(item, { origin, destination, currency, marker }));

  return { ok: true, partner: "travelpayouts", deals, error: null };
}

function normalizeDataApiItem(item, { origin, destination, currency, marker }) {
  return {
    origin: item.origin || origin,
    destination: item.destination || destination,
    departDate: item.departure_at || null,
    returnDate: item.return_at || null,
    price: item.price ?? null,
    currency,
    airline: item.airline || null,
    flightNumber: item.flight_number || null,
    transfers: item.transfers ?? null,
    foundAt: item.found_at || null,
    expiresAt: item.expires_at || null,
    link: buildAviasalesLink({ marker, path: item.link }),
  };
}

/**
 * searchDealsByPriceRange — "achados abaixo de um teto de preco".
 *
 * Este e o caso de uso central de um site de curadoria de ofertas: listar as
 * passagens mais baratas de uma origem cujo preco esteja dentro de uma faixa
 * (ex.: tudo abaixo de R$ 2.000). Usa a Data API do Travelpayouts:
 *   GET /aviasales/v3/search_by_price_range
 * Auth por header X-Access-Token (mesmo padrao de searchDealsTravelpayouts).
 *
 * options:
 *   { origin, destination?, priceMin?, priceMax, currency="BRL",
 *     oneWay?, direct?, limit=30, page=1, affiliateId? }
 * - `priceMax` e OBRIGATORIO (e a razao de ser do endpoint).
 * - `destination` e opcional (busca aberta por origem, quando a API permite);
 *   ausencia e tratada de forma tolerante (simplesmente nao envia o param).
 *
 * Retorna o MESMO shape de searchDealsTravelpayouts
 * ({ ok, partner, deals, error }), reutilizando normalizeDataApiItem, e
 * nunca lanca excecao.
 */
export async function searchDealsByPriceRange(options = {}) {
  const config = getConfig().travelpayouts;
  const token = config.token;

  if (!token) {
    return {
      ok: false,
      partner: "travelpayouts",
      deals: [],
      error: "TRAVELPAYOUTS_TOKEN nao configurado (necessario para a Data API)",
    };
  }

  const {
    origin,
    destination,
    priceMin,
    priceMax,
    currency = "BRL",
    limit = 30,
    page = 1,
    oneWay,
    direct,
  } = options;

  if (!origin) {
    return {
      ok: false,
      partner: "travelpayouts",
      deals: [],
      error: "origin e obrigatorio",
    };
  }
  if (priceMax === undefined || priceMax === null || priceMax === "") {
    return {
      ok: false,
      partner: "travelpayouts",
      deals: [],
      error: "priceMax e obrigatorio (o endpoint busca ofertas abaixo de um teto de preco)",
    };
  }

  const params = new URLSearchParams({
    origin,
    value_max: String(priceMax),
    currency,
    market: "br",
    limit: String(limit),
    page: String(page),
  });
  if (destination) params.set("destination", destination);
  if (priceMin !== undefined && priceMin !== null && priceMin !== "") {
    params.set("value_min", String(priceMin));
  }
  if (typeof oneWay === "boolean") params.set("one_way", String(oneWay));
  if (typeof direct === "boolean") params.set("direct", String(direct));

  const res = await httpRequest(
    `${API_BASE}/aviasales/v3/search_by_price_range?${params.toString()}`,
    {
      method: "GET",
      headers: { "X-Access-Token": token },
    }
  );

  if (!res.ok) {
    return {
      ok: false,
      partner: "travelpayouts",
      deals: [],
      error: res.error || "Falha ao consultar search_by_price_range do Travelpayouts",
    };
  }

  if (!res.data || res.data.success === false) {
    return {
      ok: false,
      partner: "travelpayouts",
      deals: [],
      error: res.data?.error || "A API respondeu com success=false",
    };
  }

  const marker = options.affiliateId || config.marker;
  const rawDeals = Array.isArray(res.data.data) ? res.data.data : [];
  const deals = rawDeals.map((item) =>
    normalizeDataApiItem(item, { origin, destination, currency, marker })
  );

  return { ok: true, partner: "travelpayouts", deals, error: null };
}

/**
 * searchDealsAllPages — agrega varias paginas da Data API (prices_for_dates).
 *
 * A Data API pagina via o parametro `page`. Este helper chama
 * searchDealsTravelpayouts pagina a pagina e concatena os deals, com:
 *   - `maxPages` (default 5): teto de seguranca para nao varrer indefinidamente.
 *   - Parada quando uma pagina vier vazia OU com menos itens que `limit`
 *     (heuristica de "ultima pagina").
 *   - Tolerancia a falha intermediaria: se uma pagina (apos a 1a) falhar,
 *     retorna os deals JA coletados com ok:true e um campo `warning`
 *     explicando a interrupcao — nao descarta o que ja veio. Se a PRIMEIRA
 *     pagina falhar, propaga o erro (ok:false, deals:[]).
 *
 * ATENCAO ao rate limit: cada pagina e uma requisicao e consome a cota
 * documentada da Data API (~200 requisicoes/hora por IP). Ajuste `maxPages`
 * e a frequencia de chamadas de acordo.
 *
 * options: mesmos de searchDealsTravelpayouts + { maxPages=5 }. O `page`
 * informado e ignorado (o helper controla a paginacao a partir da pagina 1).
 *
 * Retorno: { ok, partner, deals, error, warning? }.
 */
export async function searchDealsAllPages(options = {}) {
  const { maxPages = 5, limit = 30 } = options;
  const allDeals = [];

  for (let page = 1; page <= maxPages; page++) {
    const result = await searchDealsTravelpayouts({ ...options, limit, page });

    if (!result.ok) {
      // Falha na primeira pagina: nada coletado, propaga o erro.
      if (page === 1) {
        return {
          ok: false,
          partner: "travelpayouts",
          deals: [],
          error: result.error || "Falha ao consultar a primeira pagina",
        };
      }
      // Falha em pagina intermediaria: preserva o que ja veio, com aviso.
      return {
        ok: true,
        partner: "travelpayouts",
        deals: allDeals,
        error: null,
        warning: `Paginacao interrompida na pagina ${page}: ${result.error || "erro desconhecido"}. Retornando ${allDeals.length} deal(s) das paginas anteriores.`,
      };
    }

    const pageDeals = Array.isArray(result.deals) ? result.deals : [];
    allDeals.push(...pageDeals);

    // Ultima pagina: vazia ou incompleta (menos itens que o limit por pagina).
    if (pageDeals.length === 0 || pageDeals.length < limit) {
      break;
    }
  }

  return { ok: true, partner: "travelpayouts", deals: allDeals, error: null };
}
