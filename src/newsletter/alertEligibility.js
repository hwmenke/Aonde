import { getOffer } from "../store/offersStore.js";
import { OFFERS } from "../render/aondeContent.js";
import { matchAlerts } from "./alertMatcher.js";
import { listAlertRules } from "./alertRules.js";
import { viagemAindaVale } from "../offers/elegibilidade.js";

/** Parse display strings like "R$ 1.570" / "R$ 1.570,50" into centavos; else null. */
export function precoCentavosOferta(offer) {
  if (typeof offer?.preco_centavos === "number" && Number.isFinite(offer.preco_centavos)) {
    return offer.preco_centavos;
  }
  const raw = typeof offer?.preco === "string" ? offer.preco.trim() : "";
  if (!raw) return null;
  const cleaned = raw.replace(/\s/g, "").replace(/^R\$/i, "");
  // pt-BR: 1.570,50 or 1570,50 or 1.570
  if (/^\d{1,3}(\.\d{3})*(,\d{1,2})?$/.test(cleaned)) {
    const [reais, cents = "0"] = cleaned.replace(/\./g, "").split(",");
    const value = Number(reais) * 100 + Number(cents.padEnd(2, "0").slice(0, 2));
    return Number.isFinite(value) ? value : null;
  }
  if (/^\d+([.,]\d{1,2})?$/.test(cleaned)) {
    const n = Number(cleaned.replace(",", "."));
    return Number.isFinite(n) ? Math.round(n * 100) : null;
  }
  return null;
}

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
  const matches = matchAlerts(offer, context).filter(match => match.canal === (item.canal || "email"));
  if (matches.length) {
    // Refuse to email an empty price even when the rule has no ceiling.
    if (offer.preco_centavos === null) return { eligible: false, reason: "preco-nao-verificavel" };
    return { eligible: true, offer };
  }

  // Distinguish a matching route whose ceiling cannot be checked from a
  // changed route, removed rule, or price that now exceeds the ceiling.
  if (offer.preco_centavos === null) {
    const routeMatches = matchAlerts(offer, {
      ...context,
      rules: activeRules.map(rule => rule ? { ...rule, preco_alvo_centavos: null } : rule),
    }).filter(match => match.canal === (item.canal || "email"));
    if (routeMatches.length) return { eligible: false, reason: "preco-nao-verificavel" };
  }
  return { eligible: false, reason: "regra-nao-casa" };
}
