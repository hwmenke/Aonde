// Uma oferta só entra em superfície "de agora" (escolha do dia, feed, ofertas
// relacionadas, sitemap) quando está publicada e a ida ainda não passou.
// Sem data de ida explícita, a oferta não é tratada como expirada: o código
// não inventa o ano. Com ida AAAA-MM-DD anterior ao dia pedido, fica de fora.

const ISO_DIA = /^\d{4}-\d{2}-\d{2}$/;

export function viagemAindaVale(offer, diaIso) {
  if (!offer || typeof offer !== "object") return false;
  if (offer.status && offer.status !== "publicada") return false;
  const ida = typeof offer.ida === "string" ? offer.ida : typeof offer.dataIda === "string" ? offer.dataIda : "";
  if (!ISO_DIA.test(ida)) return true;
  if (!ISO_DIA.test(String(diaIso || ""))) return false;
  return ida >= diaIso;
}

/**
 * Junta ofertas publicadas do store com o catálogo editorial. Um id guardado
 * de propósito como não publicado não volta pelo texto editorial de mesmo id.
 */
export function offersParaEscolha(storeOffers, editoriais) {
  const store = Array.isArray(storeOffers) ? storeOffers : [];
  const bloqueados = new Set(
    store.filter((o) => o && o.id && o.status && o.status !== "publicada").map((o) => o.id)
  );
  const publicadas = store.filter((o) => o && o.status === "publicada" && o.id && !bloqueados.has(o.id));
  const idsPublicados = new Set(publicadas.map((o) => o.id));
  const base = Array.isArray(editoriais) ? editoriais : [];
  const resto = base.filter((o) => o && o.id && !bloqueados.has(o.id) && !idsPublicados.has(o.id));
  return [...publicadas, ...resto];
}
