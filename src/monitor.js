// Job de monitoramento de tarifas.
//
// Fecha o ciclo da curadoria: para cada rota, busca os deals no Travelpayouts,
// grava no historico de precos, calcula a estatistica da rota e gera um
// rascunho de Offer (via offerAdapter) para o melhor deal, aplicando a
// heuristica de erro de tarifa. Os rascunhos sao persistidos no offersStore
// com upsert por id (nao duplica a cada rodada).
//
// Resiliente por rota: uma rota que falha (rede, credencial, sem deals) NAO
// interrompe as demais. Sequencial de proposito: respeita o rate limiter ja
// embutido na camada HTTP (a Data API tem cota por hora/IP).

import { searchDealsTravelpayouts } from "./partners/travelpayouts.js";
import { getTypicalPrices, hasAmadeusCredentials } from "./partners/amadeus.js";
import { toOffer } from "./offerAdapter.js";
import { recordPrices, getRouteStats, routeKey } from "./store/priceHistory.js";
import { detectFareError } from "./fareError.js";
import { upsert } from "./store/offersStore.js";

/** Escolhe o deal de menor preco (ignora precos nao numericos). */
function bestDeal(deals) {
  let best = null;
  for (const deal of deals) {
    if (!deal || typeof deal.price !== "number" || Number.isNaN(deal.price)) continue;
    if (best === null || deal.price < best.price) best = deal;
  }
  return best;
}

// Deriva uma data de ida no formato YYYY-MM-DD para consultar a Amadeus (que
// exige departureDate). Prioriza a data pedida na busca (searchOptions.dateFrom,
// quando ja for uma data completa) e, na falta, a data de ida do melhor deal
// (ex.: "2026-09-01T10:00:00" -> "2026-09-01"). Sem data utilizavel, retorna
// null e o fallback e simplesmente ignorado (rota segue sem media).
function resolveDepartureDate(searchOptions, best) {
  const fromOptions = searchOptions && searchOptions.dateFrom;
  if (typeof fromOptions === "string" && /^\d{4}-\d{2}-\d{2}/.test(fromOptions.trim())) {
    return fromOptions.trim().slice(0, 10);
  }
  const dep = best && best.departDate;
  if (typeof dep === "string" && /^\d{4}-\d{2}-\d{2}/.test(dep.trim())) {
    return dep.trim().slice(0, 10);
  }
  return null;
}

/**
 * Roda o monitor sobre uma lista de rotas.
 *
 * @param {object} options
 * @param {Array<{origin: string, destination: string}>} options.routes
 * @param {string} [options.currency="BRL"]
 * @param {number} [options.windowDays] janela para getRouteStats (default do store: 90)
 * @param {string} [options.draftStatus="rascunho"] status das ofertas geradas
 * @param {object} [options.searchOptions] options extras repassadas ao searchDeals (ex.: dateFrom)
 * @param {"amadeus"|"none"} [options.mediaFallback="none"] fonte alternativa de
 *   "media de rota" quando o historico proprio ainda nao tem amostra suficiente
 *   (getRouteStats ok:false). Com "amadeus" (e credenciais Amadeus presentes),
 *   usa a mediana dos quartis da Flight Price Analysis API como media da rota.
 *   Falha da Amadeus NAO derruba a rota (segue sem media). Default "none"
 *   preserva o comportamento atual (so historico proprio).
 * @returns {Promise<{ ok: boolean, offers: object[], perRoute: Record<string, object>,
 *   startedAt: string, finishedAt: string }>}
 */
export async function runMonitor(options = {}) {
  const {
    routes = [],
    currency = "BRL",
    windowDays,
    draftStatus = "rascunho",
    searchOptions = {},
    mediaFallback = "none",
  } = options;

  const startedAt = new Date().toISOString();
  const offers = [];
  const perRoute = {};

  for (const route of routes) {
    const origin = route && route.origin;
    const destination = route && route.destination;
    const key = routeKey(origin, destination);

    try {
      if (!origin || !destination) {
        perRoute[key] = {
          ok: false,
          dealsFound: 0,
          statsUsed: null,
          error: "Rota invalida: origin e destination sao obrigatorios.",
        };
        continue;
      }

      const search = await searchDealsTravelpayouts({ ...searchOptions, origin, destination, currency });

      if (!search.ok) {
        perRoute[key] = {
          ok: false,
          dealsFound: 0,
          statsUsed: null,
          error: search.error || "Falha ao buscar deals.",
        };
        continue;
      }

      const deals = Array.isArray(search.deals) ? search.deals : [];

      // Grava todas as observacoes no historico antes de calcular a estatistica
      // (assim a rodada atual ja entra na media).
      recordPrices(deals);

      const stats = getRouteStats(origin, destination, windowDays !== undefined ? { windowDays } : {});

      const best = bestDeal(deals);
      if (!best) {
        perRoute[key] = {
          ok: true,
          dealsFound: 0,
          statsUsed: stats.ok ? stats : null,
          statsSource: stats.ok ? "own-history" : null,
          error: null,
        };
        continue;
      }

      // Media da rota: preferimos SEMPRE o historico proprio quando confiavel.
      // Se ele ainda nao tem amostra suficiente (stats.ok === false) e o
      // chamador pediu mediaFallback === "amadeus" (com credenciais presentes),
      // usamos a mediana dos quartis da Amadeus como referencia imediata.
      let mediaCentavos = stats.ok ? stats.mediaCentavos : undefined;
      let statsSource = stats.ok ? "own-history" : null;

      if (!stats.ok && mediaFallback === "amadeus" && hasAmadeusCredentials()) {
        const departureDate = resolveDepartureDate(searchOptions, best);
        if (departureDate) {
          // Falha da Amadeus NAO derruba a rota: em qualquer erro a rota segue
          // sem media (comportamento atual), sem statsSource "amadeus-median".
          const typical = await getTypicalPrices({
            origin,
            destination,
            departureDate,
            currency,
          });
          if (typical.ok && typeof typical.quartiles?.median === "number") {
            mediaCentavos = typical.quartiles.median;
            statsSource = "amadeus-median";
          }
        }
      }

      const offer = toOffer(best, { mediaCentavos, status: draftStatus });

      // Deteccao de erro de tarifa continua exigindo HISTORICO PROPRIO (com
      // sampleCount): a mediana da Amadeus, por nao trazer contagem de amostra,
      // nunca sinaliza erro de tarifa sozinha — decisao conservadora que
      // preserva o comportamento atual da heuristica.
      const fare = detectFareError({
        precoCentavos: offer.preco_centavos,
        mediaCentavos: stats.ok ? stats.mediaCentavos : null,
        sampleCount: stats.ok ? stats.sampleCount : 0,
      });
      offer.is_erro_tarifa = fare.isFareError;
      offer.fare_error_reason = fare.reason;

      const stored = upsert(offer);
      offers.push(stored);

      perRoute[key] = {
        ok: true,
        dealsFound: deals.length,
        statsUsed: stats.ok ? stats : null,
        statsSource,
        // Media efetivamente usada na oferta (centavos), venha do historico
        // proprio ou da Amadeus; null quando nenhuma media estava disponivel.
        mediaCentavos: typeof mediaCentavos === "number" ? mediaCentavos : null,
        isFareError: fare.isFareError,
        error: null,
      };
    } catch (err) {
      // Rede de seguranca por rota: nenhum erro inesperado interrompe o job.
      perRoute[key] = {
        ok: false,
        dealsFound: 0,
        statsUsed: null,
        error: (err && err.message) || String(err),
      };
    }
  }

  const finishedAt = new Date().toISOString();
  const ok = Object.values(perRoute).some((r) => r.ok);

  return { ok, offers, perRoute, startedAt, finishedAt };
}
