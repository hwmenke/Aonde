import { getOffer } from "../store/offersStore.js";
import { OFFERS } from "../render/aondeContent.js";
import { viagemAindaVale } from "../offers/elegibilidade.js";

export function queuedOfferEligibility(item, todayUtcDate) {
  if (!item.offerId) return { eligible: false, reason: "sem-offerId" };
  // A stored draft/withdrawal takes precedence over editorial fallback.
  const source = getOffer(item.offerId) || OFFERS.find((offer) => offer.id === item.offerId);
  if (!source) return { eligible: false, reason: "oferta-ausente" };
  const offer = { ...source };
  return viagemAindaVale(offer, todayUtcDate)
    ? { eligible: true, offer }
    : { eligible: false, reason: "oferta-inelegivel" };
}
