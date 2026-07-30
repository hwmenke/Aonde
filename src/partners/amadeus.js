// Amadeus Self-Service — Flight Price Analysis API (itinerary-price-metrics).
//
// Papel no modulo: fonte OFICIAL de "preco tipico de rota". O historico proprio
// (Travelpayouts + src/store/priceHistory.js) leva semanas para acumular as 5
// observacoes minimas que getRouteStats exige; a Amadeus devolve a referencia
// estatistica (distribuicao em quartis) imediatamente, com um unico GET. Serve
// de FALLBACK para a media de rota do monitor (ver src/monitor.js, opcao
// mediaFallback). Nao existe API oficial do Google Flights (ja pesquisado —
// ver docs/PESQUISA-GOOGLE.md, secao Amadeus).
//
// Autenticacao: OAuth2 Client Credentials Grant.
//   POST {base}/v1/security/oauth2/token
//   body form-urlencoded: grant_type=client_credentials&client_id=..&client_secret=..
//   -> { access_token, expires_in (~1800s), token_type: "Bearer", ... }
// O token e cacheado em memoria e renovado com margem de 60s antes de expirar.
//
// Endpoint de dados:
//   GET {base}/v1/analytics/itinerary-price-metrics
//       ?originIataCode=GRU&destinationIataCode=LIS&departureDate=2026-09-01
//       [&currencyCode=BRL][&oneWay=false]
//   -> distribuicao em quartis (MINIMUM/FIRST/MEDIUM/THIRD/MAXIMUM).
//
// Base URL selecionavel por env AMADEUS_ENV=test|production (default test):
//   test       -> https://test.api.amadeus.com  (sandbox, tier gratuito)
//   production -> https://api.amadeus.com
//
// RESSALVA (a-validar): o shape EXATO da resposta nao pode ser confirmado neste
// ambiente (as paginas oficiais da Amadeus retornam 403 aqui — ver
// docs/PESQUISA-GOOGLE.md). Por isso o parsing abaixo (extractQuartiles) e
// TOLERANTE: aceita os formatos plausiveis do array priceMetrics e, quando nao
// reconhece nenhum, devolve ok:false com o corpo bruto resumido no erro — o que
// facilita depurar quando o usuario tiver uma credencial real em maos.
//
// RATE LIMIT: aplicado na camada src/http.js (RATE_RULES) por prefixo de host
// "amadeus.com/" — cobre test e producao, tanto o endpoint de token quanto o de
// analytics. Escolhi centralizar no http.js (e nao no rateLimiter dentro deste
// arquivo) para manter o padrao dos demais parceiros: TODA chamada de rede do
// modulo passa pelo http.js e o balde e unico por processo. Ver comentario da
// regra "amadeus" em src/http.js. Limite documentado do tier test: 10 req/s.

import { httpRequest } from "../http.js";
import { getConfig } from "../config.js";
import { isIataCode, normalizeIata } from "../validate.js";

const TOKEN_PATH = "/v1/security/oauth2/token";
const METRICS_PATH = "/v1/analytics/itinerary-price-metrics";

// Margem de seguranca: renova o token 60s antes do vencimento informado pela
// API (expires_in), para nunca usar um token que expira durante a requisicao.
const TOKEN_MARGIN_MS = 60_000;
// Validade padrao caso a API nao informe expires_in (docs citam ~30 min).
const DEFAULT_TOKEN_TTL_S = 1800;

// Estado interno do modulo (token em cache + relogio injetavel para testes).
// NAO exportado no index.js — apenas resetAmadeusState/setAmadeusClock, abaixo,
// existem para os testes (seguem o padrao de setFetchImpl do http.js).
const state = {
  now: () => Date.now(),
  token: null, // access_token (string) atualmente em cache
  tokenExpiresAt: 0, // epoch ms em que o token cacheado deve ser considerado expirado (ja com margem)
};

/** Zera o token em cache e restaura o relogio real (uso: testes). */
export function resetAmadeusState() {
  state.token = null;
  state.tokenExpiresAt = 0;
  state.now = () => Date.now();
}

/** Injeta o relogio usado para expiracao do token (uso: testes de renovacao). */
export function setAmadeusClock(fn) {
  state.now = fn;
}

/** Base URL conforme AMADEUS_ENV (default: ambiente de teste/sandbox). */
function baseUrl() {
  const env = String(getConfig().amadeus.env || "test").trim().toLowerCase();
  return env === "production" ? "https://api.amadeus.com" : "https://test.api.amadeus.com";
}

// Mensagem padrao de credenciais ausentes (pt-BR, com onde obter).
const MISSING_CREDS_ERROR =
  "AMADEUS_CLIENT_ID/AMADEUS_CLIENT_SECRET nao configurados. " +
  "Crie uma conta gratuita em developers.amadeus.com (Self-Service), registre um app " +
  "e copie a API Key (client_id) e o API Secret (client_secret). O tier gratuito ja " +
  "cobre a Flight Price Analysis API tanto no ambiente de teste quanto em producao.";

/** true quando ambas as credenciais Amadeus estao presentes na config. */
export function hasAmadeusCredentials() {
  const { clientId, clientSecret } = getConfig().amadeus;
  return Boolean(clientId && clientSecret);
}

/**
 * Obtem um Bearer token valido, reusando o cache em memoria enquanto nao
 * expirar (com margem). Renova via Client Credentials Grant quando necessario.
 * Nunca lanca excecao.
 *
 * @returns {Promise<{ok: true, token: string} | {ok: false, error: string}>}
 */
// httpOptions permite ao chamador (ex.: searchFlightOffers, para a busca ao
// vivo) apertar timeoutMs/retries para nao deixar a pagina esperando demais —
// sem isso, o request de token usaria os defaults do http.js (10s + 2
// retries), o que sozinho ja estouraria o teto curto que a busca ao vivo
// exige. getTypicalPrices nao passa nada, entao mantem o comportamento
// (defaults do http.js) inalterado.
async function getAccessToken(httpOptions = {}) {
  const { clientId, clientSecret } = getConfig().amadeus;
  if (!clientId || !clientSecret) {
    return { ok: false, error: MISSING_CREDS_ERROR };
  }

  // Reuso do token em cache enquanto valido.
  if (state.token && state.now() < state.tokenExpiresAt) {
    return { ok: true, token: state.token };
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  }).toString();

  const res = await httpRequest(`${baseUrl()}${TOKEN_PATH}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    ...httpOptions,
  });

  if (!res.ok) {
    return { ok: false, error: res.error || "Falha ao obter token OAuth2 da Amadeus" };
  }

  const token = res.data && res.data.access_token;
  if (!token || typeof token !== "string") {
    return {
      ok: false,
      error: `Resposta do token OAuth2 em formato inesperado (sem access_token). Corpo: ${summarizeBody(res.data)}`,
    };
  }

  const expiresIn =
    res.data && typeof res.data.expires_in === "number" && res.data.expires_in > 0
      ? res.data.expires_in
      : DEFAULT_TOKEN_TTL_S;
  const ttlMs = expiresIn * 1000;

  state.token = token;
  // Aplica a margem: um TTL menor que a margem simplesmente vence de imediato.
  state.tokenExpiresAt = state.now() + Math.max(0, ttlMs - TOKEN_MARGIN_MS);

  return { ok: true, token };
}

/**
 * Consulta o "preco tipico" (distribuicao em quartis) de uma rota/data via
 * Amadeus Flight Price Analysis API. Nunca lanca excecao.
 *
 * @param {object} params
 * @param {string} params.origin codigo IATA de origem (ex.: GRU)
 * @param {string} params.destination codigo IATA de destino (ex.: LIS)
 * @param {string} params.departureDate data da ida no formato YYYY-MM-DD
 * @param {string} [params.currency="BRL"] moeda dos valores (currencyCode)
 * @param {boolean} [params.oneWay] somente ida?
 * @returns {Promise<{
 *   ok: boolean,
 *   partner: "amadeus",
 *   route?: string,
 *   quartiles?: { min: number|null, first: number|null, median: number|null, third: number|null, max: number|null },
 *   currency?: string,
 *   oneWay?: boolean|null,
 *   error: string|null
 * }>}
 *   Os valores dos quartis saem em CENTAVOS (mesmo criterio do modulo:
 *   Math.round(valor * 100)).
 */
export async function getTypicalPrices(params = {}) {
  const { origin, destination, departureDate, currency = "BRL", oneWay } = params;

  if (!hasAmadeusCredentials()) {
    return { ok: false, partner: "amadeus", error: MISSING_CREDS_ERROR };
  }

  // Validacao de entrada (reutiliza src/validate.js) — rejeita cedo, com
  // mensagem clara em pt-BR, antes de gastar uma chamada de token/rede.
  if (!isIataCode(origin)) {
    return {
      ok: false,
      partner: "amadeus",
      error: `origin invalido: "${origin}". Esperado codigo IATA de 3 letras (A-Z), ex.: GRU`,
    };
  }
  if (!isIataCode(destination)) {
    return {
      ok: false,
      partner: "amadeus",
      error: `destination invalido: "${destination}". Esperado codigo IATA de 3 letras (A-Z), ex.: LIS`,
    };
  }
  if (!isFullDate(departureDate)) {
    return {
      ok: false,
      partner: "amadeus",
      error: `departureDate invalido: "${departureDate}". Esperado data no formato YYYY-MM-DD (obrigatoria)`,
    };
  }

  const normalizedOrigin = normalizeIata(origin);
  const normalizedDest = normalizeIata(destination);

  const tokenResult = await getAccessToken();
  if (!tokenResult.ok) {
    return { ok: false, partner: "amadeus", error: tokenResult.error };
  }

  const query = new URLSearchParams({
    originIataCode: normalizedOrigin,
    destinationIataCode: normalizedDest,
    departureDate,
  });
  if (currency) query.set("currencyCode", currency);
  if (typeof oneWay === "boolean") query.set("oneWay", String(oneWay));

  const res = await httpRequest(`${baseUrl()}${METRICS_PATH}?${query.toString()}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${tokenResult.token}` },
  });

  if (!res.ok) {
    return {
      ok: false,
      partner: "amadeus",
      error: res.error || "Falha ao consultar itinerary-price-metrics da Amadeus",
    };
  }

  const quartiles = extractQuartiles(res.data);
  if (!quartiles) {
    return {
      ok: false,
      partner: "amadeus",
      error: `Resposta em formato inesperado (nao foi possivel extrair os quartis de preco). Corpo: ${summarizeBody(res.data)}`,
    };
  }

  return {
    ok: true,
    partner: "amadeus",
    route: `${normalizedOrigin}-${normalizedDest}`,
    quartiles,
    currency,
    oneWay: typeof oneWay === "boolean" ? oneWay : null,
    error: null,
  };
}

const FLIGHT_OFFERS_PATH = "/v2/shopping/flight-offers";

/**
 * Busca ofertas de voo (Amadeus Self-Service — Flight Offers Search) para uma
 * rota/data especifica. E a fonte da busca "ao vivo" de /resultados (ver
 * src/flights/buscarVoos.js, que chama esta funcao e mapeia o resultado para
 * o formato do site). Nunca lanca excecao.
 *
 * RESSALVA (mesma limitacao das demais secoes deste arquivo): o shape exato
 * da resposta nao pode ser confirmado neste ambiente (paginas oficiais da
 * Amadeus retornam 403 aqui). O shape usado abaixo — { data: [ { itineraries:
 * [ { duration, segments: [ { departure:{iataCode,at}, arrival:{...},
 * carrierCode, number } ] } ], price: { grandTotal|total } } ],
 * dictionaries: { carriers: { CODE: "NOME" } } } — e o documentado
 * publicamente pela Amadeus para esse endpoint (Postman/dev portal). Antes de
 * produzir com uma credencial real em maos, vale validar uma resposta de
 * verdade (ver mapeamento tolerante em src/flights/mapAmadeus.js: uma oferta
 * que nao bate o shape esperado e simplesmente pulada, nunca derruba as
 * demais).
 *
 * @param {object} params
 * @param {string} params.origin codigo IATA de origem
 * @param {string} params.destination codigo IATA de destino
 * @param {string} params.departureDate YYYY-MM-DD (obrigatorio)
 * @param {string} [params.returnDate] YYYY-MM-DD — presente = busca ida e volta
 * @param {number} [params.adults=1]
 * @param {number} [params.children=0]
 * @param {number} [params.infants=0]
 * @param {string} [params.currency="BRL"]
 * @param {number} [params.max=10] numero maximo de ofertas pedidas a API
 * @param {number} [params.timeoutMs] timeout desta chamada HTTP (token +
 *   busca); sem isso, usa o default do http.js (10s). A busca ao vivo (ver
 *   src/flights/buscarVoos.js) SEMPRE passa um valor curto aqui.
 * @param {number} [params.retries] tentativas extras alem da 1a (default do
 *   http.js e 2, com backoff — a busca ao vivo passa 0 para responder rapido)
 * @returns {Promise<{ok:boolean, partner:"amadeus", data?: object, error: string|null}>}
 *   `data` e o corpo bruto da resposta ({ data:[...], dictionaries:{...} }) —
 *   o mapeamento para o formato de FLIGHTS fica em src/flights/mapAmadeus.js.
 */
export async function searchFlightOffers(params = {}) {
  const {
    origin,
    destination,
    departureDate,
    returnDate,
    adults = 1,
    children = 0,
    infants = 0,
    currency = "BRL",
    max = 10,
    timeoutMs,
    retries,
  } = params;

  if (!hasAmadeusCredentials()) {
    return { ok: false, partner: "amadeus", error: MISSING_CREDS_ERROR };
  }
  if (!isIataCode(origin)) {
    return {
      ok: false,
      partner: "amadeus",
      error: `origin invalido: "${origin}". Esperado codigo IATA de 3 letras (A-Z), ex.: GRU`,
    };
  }
  if (!isIataCode(destination)) {
    return {
      ok: false,
      partner: "amadeus",
      error: `destination invalido: "${destination}". Esperado codigo IATA de 3 letras (A-Z), ex.: LIS`,
    };
  }
  if (!isFullDate(departureDate)) {
    return {
      ok: false,
      partner: "amadeus",
      error: `departureDate invalido: "${departureDate}". Esperado data no formato YYYY-MM-DD (obrigatoria)`,
    };
  }
  if (returnDate !== undefined && returnDate !== null && returnDate !== "" && !isFullDate(returnDate)) {
    return {
      ok: false,
      partner: "amadeus",
      error: `returnDate invalido: "${returnDate}". Esperado data no formato YYYY-MM-DD`,
    };
  }

  const normalizedOrigin = normalizeIata(origin);
  const normalizedDest = normalizeIata(destination);

  // Repassa o teto de tempo/retries tambem para o token: sem isso, um token
  // vencido/renovando usaria os defaults do http.js e sozinho ja estouraria o
  // orcamento de tempo curto que a busca ao vivo exige.
  const tokenHttpOptions = {};
  if (timeoutMs) tokenHttpOptions.timeoutMs = timeoutMs;
  if (typeof retries === "number") tokenHttpOptions.retries = retries;

  const tokenResult = await getAccessToken(tokenHttpOptions);
  if (!tokenResult.ok) {
    return { ok: false, partner: "amadeus", error: tokenResult.error };
  }

  const query = new URLSearchParams({
    originLocationCode: normalizedOrigin,
    destinationLocationCode: normalizedDest,
    departureDate,
    adults: String(Math.max(1, Math.trunc(adults) || 1)),
  });
  if (returnDate) query.set("returnDate", returnDate);
  if (children > 0) query.set("children", String(Math.trunc(children)));
  if (infants > 0) query.set("infants", String(Math.trunc(infants)));
  if (currency) query.set("currencyCode", currency);
  const maxN = Math.max(1, Math.min(50, Math.trunc(max) || 10));
  query.set("max", String(maxN));

  const httpOptions = {
    method: "GET",
    headers: { Authorization: `Bearer ${tokenResult.token}` },
  };
  if (timeoutMs) httpOptions.timeoutMs = timeoutMs;
  if (typeof retries === "number") httpOptions.retries = retries;

  const res = await httpRequest(`${baseUrl()}${FLIGHT_OFFERS_PATH}?${query.toString()}`, httpOptions);

  if (!res.ok) {
    return {
      ok: false,
      partner: "amadeus",
      error: res.error || "Falha ao consultar flight-offers da Amadeus",
    };
  }

  if (!res.data || !Array.isArray(res.data.data)) {
    return {
      ok: false,
      partner: "amadeus",
      error: `Resposta em formato inesperado (sem lista de ofertas). Corpo: ${summarizeBody(res.data)}`,
    };
  }

  return { ok: true, partner: "amadeus", data: res.data, error: null };
}

// true apenas para datas completas YYYY-MM-DD (o endpoint exige o dia; a
// validacao de calendario fica por conta da propria API upstream — aqui basta
// garantir o formato antes de montar a query).
function isFullDate(str) {
  return typeof str === "string" && /^\d{4}-\d{2}-\d{2}$/.test(str.trim());
}

// Extrai os quartis (em centavos) da resposta, tolerando os formatos plausiveis
// (o schema oficial nao pode ser confirmado neste ambiente — ver comentario do
// topo). Shape esperado (a-validar):
//   { data: [ { priceMetrics: [ { amount: "123.45", quartileRanking: "MEDIUM" }, ... ] } ] }
// Tolerancias: `data` pode ser o proprio objeto (nao array); o array de metricas
// pode se chamar priceMetrics ou price_metrics; cada metrica pode expor a chave
// como quartileRanking/quartile_ranking/ranking e o valor como amount/value/price.
function extractQuartiles(data) {
  if (!data) return null;

  const items = Array.isArray(data.data)
    ? data.data
    : Array.isArray(data)
    ? data
    : null;
  const item = items ? items[0] : data;
  if (!item || typeof item !== "object") return null;

  const metrics = Array.isArray(item.priceMetrics)
    ? item.priceMetrics
    : Array.isArray(item.price_metrics)
    ? item.price_metrics
    : null;
  if (!metrics || metrics.length === 0) return null;

  const byRank = {};
  for (const m of metrics) {
    if (!m || typeof m !== "object") continue;
    const rank = String(m.quartileRanking || m.quartile_ranking || m.ranking || "")
      .trim()
      .toUpperCase();
    const centavos = amountToCentavos(m.amount ?? m.value ?? m.price);
    if (rank && centavos !== null) byRank[rank] = centavos;
  }

  const quartiles = {
    min: byRank.MINIMUM ?? null,
    first: byRank.FIRST ?? null,
    median: byRank.MEDIUM ?? null,
    third: byRank.THIRD ?? null,
    max: byRank.MAXIMUM ?? null,
  };

  // Se nenhum quartil foi reconhecido, tratamos como formato inesperado.
  const anyKnown = Object.values(quartiles).some((v) => v !== null);
  return anyKnown ? quartiles : null;
}

// Converte um valor monetario (numero ou string decimal) para centavos, com o
// MESMO criterio do resto do modulo (Math.round(x * 100)). Invalido -> null.
function amountToCentavos(amount) {
  if (amount === undefined || amount === null || amount === "") return null;
  const n = typeof amount === "number" ? amount : parseFloat(String(amount));
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

// Resume o corpo bruto (para diagnostico em mensagens de erro) sem estourar o
// tamanho: serializa e trunca em ~300 caracteres. (Mesmo criterio do
// travelpayouts.js.)
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
