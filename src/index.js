// aonde-affiliates — modulo Node.js de links de afiliado de viagem e busca
// de ofertas de passagens (Aonde.com.br).
//
// Ver README.md para visao geral e exemplos de uso, e
// docs/PESQUISA-PARCEIROS.md para a pesquisa que fundamenta cada integracao.

import {
  buildAviasalesLink,
  buildTpMediaLink,
  getDealLinkTravelpayouts,
  searchDealsTravelpayouts,
  searchDealsByPriceRange as searchDealsByPriceRangeTravelpayouts,
  searchDealsAllPages as searchDealsAllPagesTravelpayouts,
} from "./partners/travelpayouts.js";
import { getDealLinkAwin, getDealLinksAwinBatch as getDealLinksAwinBatchImpl } from "./partners/awin.js";
import { getTypicalPrices as getTypicalPricesImpl } from "./partners/amadeus.js";
import { getDealLinkHurb } from "./partners/hurb.js";
import { getDealLinkPassagensPromo } from "./partners/passagensPromo.js";
import { toOffer, toOffers, enrichOfferWithImage, enrichOffersWithImages } from "./offerAdapter.js";
import { getDestinationImage } from "./images/wikimediaProvider.js";
import { validateSearchOptions } from "./validate.js";
import { validateConfig } from "./health.js";
import { runMonitor } from "./monitor.js";
import { detectFareError } from "./fareError.js";
import { getRouteStats, recordPrices, listRoutes } from "./store/priceHistory.js";
import { listOffers, getOffer } from "./store/offersStore.js";
import { createServer } from "./server.js";
import { searchPlaces } from "./guides/placesClient.js";
import { buildItinerary, renderItineraryMarkdown } from "./guides/itineraryBuilder.js";
import {
  buildPhotoMediaUrl,
  resolvePhotoUri as resolvePhotoUriImpl,
} from "./guides/placePhotos.js";
import {
  subscribe as subscribeNewsletterImpl,
  confirm as confirmNewsletterImpl,
  unsubscribe as unsubscribeNewsletterImpl,
} from "./newsletter/subscriberStore.js";
import { addAlertRule as addAlertRuleImpl } from "./newsletter/alertRules.js";
import { matchAlerts, dispatchAlerts as dispatchAlertsImpl } from "./newsletter/alertMatcher.js";

export const SUPPORTED_PARTNERS = ["travelpayouts", "awin", "hurb", "passagens-promo"];

const PARTNER_HANDLERS = {
  travelpayouts: getDealLinkTravelpayouts,
  awin: getDealLinkAwin,
  hurb: getDealLinkHurb,
  "passagens-promo": getDealLinkPassagensPromo,
};

/**
 * Gera (ou recupera) o link de afiliado de um parceiro.
 *
 * @param {"travelpayouts"|"awin"|"hurb"|"passagens-promo"} partner
 * @param {object} options campos variam por parceiro — ver README.md
 * @returns {Promise<{ok: boolean, url?: string, partner: string, method: string, error?: string}>}
 */
export async function getDealLink(partner, options = {}) {
  const handler = PARTNER_HANDLERS[partner];

  if (!handler) {
    return {
      ok: false,
      partner,
      method: "unknown",
      error: `Parceiro desconhecido: "${partner}". Parceiros suportados: ${SUPPORTED_PARTNERS.join(", ")}`,
    };
  }

  try {
    return await handler(options);
  } catch (err) {
    // Rede de seguranca: nenhum erro inesperado de um parceiro deve escapar
    // como excecao nao tratada.
    return {
      ok: false,
      partner,
      method: "unknown",
      error: (err && err.message) || String(err),
    };
  }
}

/**
 * Gera varios links de afiliado Awin em uma unica operacao (Link Builder em
 * lote). Ver getDealLinksAwinBatch em partners/awin.js. Resiliente: nunca
 * lanca excecao (toda falha inesperada vira { ok: false, ... }).
 *
 * @param {Array<{destinationUrl: string, advertiserId?: string|number, campaign?: string, clickref?: string}>} items
 * @param {{publisherId?: string}} [options]
 * @returns {Promise<{ok: boolean, partner: string, method: string, error?: string, results?: Array, succeeded?: number, failed?: number}>}
 */
export async function getDealLinksAwinBatch(items, options = {}) {
  try {
    return await getDealLinksAwinBatchImpl(items, options);
  } catch (err) {
    return {
      ok: false,
      partner: "awin",
      method: "api-batch",
      error: (err && err.message) || String(err),
    };
  }
}

/**
 * Busca ofertas de passagens via Travelpayouts Data API (precos em cache).
 * E o unico parceiro do conjunto com API de busca de ofertas publica.
 *
 * @returns {Promise<{ok: boolean, partner: string, deals: Array, error?: string}>}
 */
export async function searchDeals(options = {}) {
  try {
    // Validacao de entrada antes de tocar a camada HTTP: rejeita cedo entradas
    // invalidas (IATA/data) com mensagem clara em pt-BR e normaliza os campos
    // (origin/destination em maiusculas). Ver src/validate.js.
    const validation = validateSearchOptions(options);
    if (!validation.ok) {
      return { ok: false, partner: "travelpayouts", deals: [], error: validation.error };
    }
    return await searchDealsTravelpayouts({ ...options, ...validation.normalized });
  } catch (err) {
    return {
      ok: false,
      partner: "travelpayouts",
      deals: [],
      error: (err && err.message) || String(err),
    };
  }
}

// Alias explicito: searchDeals ja e resiliente (nunca lanca excecao — toda
// falha de rede/HTTP/credencial/parsing e capturada e devolvida como
// { ok: false, ... }). searchDealsSafe existe para deixar essa garantia
// clara no ponto de chamada, sem duplicar logica.
export const searchDealsSafe = searchDeals;

/**
 * Busca ofertas abaixo de um teto de preco (Travelpayouts
 * search_by_price_range) — caso de uso central de curadoria de achados.
 * Resiliente: nunca lanca excecao (toda falha vira { ok: false, ... }).
 *
 * @returns {Promise<{ok: boolean, partner: string, deals: Array, error?: string}>}
 */
export async function searchDealsByPriceRange(options = {}) {
  try {
    return await searchDealsByPriceRangeTravelpayouts(options);
  } catch (err) {
    return {
      ok: false,
      partner: "travelpayouts",
      deals: [],
      error: (err && err.message) || String(err),
    };
  }
}

/**
 * Agrega varias paginas da Data API do Travelpayouts (ver
 * searchDealsAllPages em partners/travelpayouts.js). Resiliente: nunca lanca
 * excecao. Pode retornar ok:true com um campo `warning` quando a paginacao e
 * interrompida no meio (preservando os deals ja coletados).
 *
 * @returns {Promise<{ok: boolean, partner: string, deals: Array, error?: string, warning?: string}>}
 */
export async function searchDealsAllPages(options = {}) {
  try {
    return await searchDealsAllPagesTravelpayouts(options);
  } catch (err) {
    return {
      ok: false,
      partner: "travelpayouts",
      deals: [],
      error: (err && err.message) || String(err),
    };
  }
}

/**
 * Consulta o "preco tipico de rota" (distribuicao em quartis, em centavos) via
 * Amadeus Flight Price Analysis API — fonte oficial de referencia estatistica
 * imediata (o historico proprio leva semanas para acumular amostra suficiente).
 * Resiliente: nunca lanca excecao (toda falha vira { ok: false, ... }).
 * Ver src/partners/amadeus.js e docs/PESQUISA-PARCEIROS.md (secao Amadeus).
 *
 * @returns {Promise<{ok: boolean, partner: "amadeus", route?: string,
 *   quartiles?: {min: number|null, first: number|null, median: number|null, third: number|null, max: number|null},
 *   currency?: string, oneWay?: boolean|null, error: string|null}>}
 */
export async function getTypicalPrices(params = {}) {
  try {
    return await getTypicalPricesImpl(params);
  } catch (err) {
    return {
      ok: false,
      partner: "amadeus",
      error: (err && err.message) || String(err),
    };
  }
}

/**
 * Roda getDealLink para todos os parceiros suportados em paralelo, isolando
 * falhas individuais: um parceiro com erro nunca impede os demais de
 * retornar seu resultado.
 *
 * @returns {Promise<Record<string, {ok: boolean, url?: string, partner: string, method: string, error?: string}>>}
 */
export async function getAllDealLinks(options = {}) {
  const settled = await Promise.allSettled(
    SUPPORTED_PARTNERS.map((partner) => getDealLink(partner, options))
  );

  const results = {};
  settled.forEach((outcome, index) => {
    const partner = SUPPORTED_PARTNERS[index];
    if (outcome.status === "fulfilled") {
      results[partner] = outcome.value;
    } else {
      results[partner] = {
        ok: false,
        partner,
        method: "unknown",
        error: (outcome.reason && outcome.reason.message) || String(outcome.reason),
      };
    }
  });

  return results;
}

// Reexportados por conveniencia (util para quem quer montar links manualmente
// sem passar pela camada de options/config, ex.: scripts utilitarios).
export { buildTpMediaLink, buildAviasalesLink };
export { toOffer, toOffers };

// Imagens reais de destino via Wikimedia Commons (Action API, sem chave). Ver
// README (secao "Imagens de destino (Wikimedia Commons)") e src/images/. Os
// wrappers abaixo sao resilientes: nunca lancam (toda falha vira ok:false ou o
// offer inalterado). enrich* fazem 1-2 chamadas de rede POR oferta — use no
// pipeline de curadoria, nao no hot path de request.

/** Busca imagem representativa de um destino no Wikimedia (com atribuicao). */
export async function getDestinationImageSafe(params = {}) {
  try {
    return await getDestinationImage(params);
  } catch (err) {
    return { ok: false, error: (err && err.message) || String(err) };
  }
}
export { getDestinationImage, enrichOfferWithImage, enrichOffersWithImages };
// Health-check de configuracao (sem rede) — ver src/health.js.
export { validateConfig };
// Curadoria: historico de precos, monitor de tarifas, deteccao de erro de
// tarifa, store de ofertas e API REST. Ver README (secao "Curadoria: historico,
// monitoramento e API").
export { runMonitor };
export { detectFareError };
export { getRouteStats, recordPrices, listRoutes };
export { listOffers, getOffer };
export { createServer };
// Gerador de roteiros com pontos turisticos reais (Google Places API New).
// Ver src/guides/ e docs/PESQUISA-GOOGLE.md.
export { searchPlaces, buildItinerary, renderItineraryMarkdown };
// Fotos reais dos lugares (Google Place Photos New). buildPhotoMediaUrl e pura
// (monta a URL /media, sem rede — pode lancar em uso invalido); resolvePhotoUri
// faz rede (SKU Place Photo) e ganha aqui uma rede de seguranca resiliente.
export { buildPhotoMediaUrl };

/**
 * Resolve a URL curta da imagem de uma foto do Places (skipHttpRedirect).
 * Resiliente: nunca lanca excecao (toda falha vira { ok: false, error }).
 * Ver resolvePhotoUri em src/guides/placePhotos.js.
 *
 * @returns {Promise<{ok: boolean, photoUri?: string, error?: string}>}
 */
export async function resolvePhotoUri(photoName, opts = {}) {
  try {
    return await resolvePhotoUriImpl(photoName, opts);
  } catch (err) {
    return { ok: false, error: (err && err.message) || String(err) };
  }
}

// Renderizacao HTML: monta paginas de amostra (feed de ofertas e roteiro) a
// partir da saida de toOffer+enrichOfferWithImage / buildItinerary. Funcoes
// puras (sem rede). Ver src/render/ e scripts/render-samples.js (secao
// "Renderizacao e paginas de amostra" no README).
export {
  renderOfferCard,
  renderOffersPage,
  renderItineraryPage,
  formatBRL,
} from "./render/htmlRenderer.js";

// Newsletter e alertas de preco com double opt-in (LGPD). Ver README (secao
// "Newsletter e alertas de preco (LGPD)") e src/newsletter/. Os wrappers de
// store ja retornam { ok, ... } (nao lancam em uso normal); dispatchAlerts
// ganha uma rede de seguranca resiliente (padrao do arquivo) porque faz I/O
// de fila.

/** Inscreve um e-mail na newsletter/alertas (dispara double opt-in). */
export const subscribeNewsletter = subscribeNewsletterImpl;
/** Confirma o double opt-in a partir do token (registra consentimento LGPD). */
export const confirmNewsletter = confirmNewsletterImpl;
/** Descadastra um e-mail (idempotente; preserva o registro para auditoria). */
export const unsubscribeNewsletter = unsubscribeNewsletterImpl;
/** Cria uma regra de alerta de preco para um assinante confirmado. */
export const addAlertRule = addAlertRuleImpl;
/** Casa ofertas com regras de alerta (funcao pura, testavel). */
export { matchAlerts };

/**
 * Casa ofertas e enfileira notificacoes (data/alert_queue.jsonl). Resiliente:
 * nunca lanca excecao (toda falha vira { ok: false, ... }).
 */
export function dispatchAlerts(offers = []) {
  try {
    return dispatchAlertsImpl(offers);
  } catch (err) {
    return { ok: false, queued: 0, items: [], error: (err && err.message) || String(err) };
  }
}
