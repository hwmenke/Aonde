import { getOffer } from "../store/offersStore.js";
import { OFFERS } from "../render/aondeContent.js";
import { matchAlerts } from "./alertMatcher.js";
import { listAlertRules } from "./alertRules.js";
import { viagemAindaVale } from "../offers/elegibilidade.js";

import { precoCentavosOferta } from "../offers/price.js";
export { precoCentavosOferta } from "../offers/price.js";

export function queuedOfferEligibility(item, subscriber, { rules, today = new Date().toISOString().slice(0, 10) } = {}) {
  if (!item.offerId) return { eligible: false, reason: "sem-offerId" };
  // A stored draft/withdrawal takes precedence over editorial fallback.
  const source = getOffer(item.offerId) || OFFERS.find((offer) => offer.id === item.offerId);
  if (!source) return { eligible: false, reason: "oferta-ausente" };
  const offer = { ...source };
  if (!viagemAindaVale(offer, today)) return { eligible: false, reason: "oferta-inelegivel" };

  // Never fall back to the queued price — use live cents, including parsed editorial BRL.
  offer.preco_centavos = precoCentavosOferta(offer);
  const activeRules = rules ?? listAlertRules({ subscriberId: subscriber?.id });
  const context = { rules: activeRules, subscribers: subscriber ? [subscriber] : [], dia: today };
  // Match the original price: normalizing an invalid number to null must not
  // enable the display-price fallback on a second parse.
  const matches = matchAlerts(source, context).filter(match => match.canal === (item.canal || "email"));
  if (matches.length) {
    return { eligible: true, offer };
  }

  // Distinguish a matching route whose ceiling cannot be checked from a
  // changed route, removed rule, or price that now exceeds the ceiling.
  if (offer.preco_centavos === null) {
    // Diagnostic only: a valid placeholder tests the route with ceilings removed.
    const routeMatches = matchAlerts({ ...offer, preco_centavos: 1 }, {
      ...context,
      rules: activeRules.map(rule => rule ? { ...rule, preco_alvo_centavos: null } : rule),
    }).filter(match => match.canal === (item.canal || "email"));
    if (routeMatches.length) return { eligible: false, reason: "preco-nao-verificavel" };
  }
  return { eligible: false, reason: "regra-nao-casa" };
}
