// Uma oferta só entra em superfície "de agora" (escolha do dia, feed, ofertas
// relacionadas, sitemap) quando está publicada e a ida ainda não passou.
// Sem data de ida explícita, a oferta não é tratada como expirada: o código
// não inventa o ano. Com ida AAAA-MM-DD anterior ao dia pedido, fica de fora.

import { auditOfferDates, dateValue } from '../audit/offerDates.js';

const ISO_DIA = /^\d{4}-\d{2}-\d{2}$/;
const logsElegibilidade = new Set();

function achadosDatas(offer, diaIso) {
  // Sem dia válido, verifica calendário e ordem, mas não observações futuras.
  const now = typeof diaIso === "string" && ISO_DIA.test(diaIso) && Number.isFinite(dateValue(diaIso)) ? diaIso : null;
  return auditOfferDates([offer], now);
}

export function datasImpossiveis(offer, diaIso) {
  return achadosDatas(offer, diaIso).length > 0;
}

export function _resetLogElegibilidade() {
  logsElegibilidade.clear();
}

function excluirPorDatas(offer, diaIso) {
  const findings = achadosDatas(offer, diaIso);
  if (!findings.length) return false;
  if (process.env.NODE_TEST_CONTEXT && process.env.AONDE_LOG_ELEGIBILIDADE !== '1') return true;
  const id = offer.id ?? JSON.stringify(offer);
  const reasons = findings.map(({ field, message }) => `${field}: ${message}`).join('; ');
  const key = JSON.stringify([id, reasons]);
  if (!logsElegibilidade.has(key)) {
    logsElegibilidade.add(key);
    console.warn(`[elegibilidade] oferta ${id} fora do site: ${reasons}`.replace(/[\r\n]+/g, ' '));
  }
  return true;
}

export function viagemAindaVale(offer, diaIso) {
  if (!offer || typeof offer !== "object") return false;
  if (offer.status && offer.status !== "publicada") return false;
  if (excluirPorDatas(offer, diaIso)) return false;
  let ida = typeof offer.ida === "string" ? offer.ida : typeof offer.dataIda === "string" ? offer.dataIda : "";
  if (!ISO_DIA.test(ida)) {
    const timestamp = dateValue(ida);
    if (!Number.isFinite(timestamp)) return true;
    ida = new Date(timestamp).toISOString().slice(0, 10);
  }
  if (!ISO_DIA.test(String(diaIso || ""))) return false;
  return ida >= diaIso;
}

/**
 * Junta ofertas publicadas do store com o catálogo editorial. Um id guardado
 * de propósito como não publicado não volta pelo texto editorial de mesmo id.
 */
export function offersParaEscolha(storeOffers, editoriais, diaIso) {
  const store = Array.isArray(storeOffers) ? storeOffers : [];
  const bloqueados = new Set(
    store.filter((o) => o && o.id && o.status !== "publicada").map((o) => o.id)
  );
  const publicadas = store.filter((o) => o && o.status === "publicada" && o.id && !bloqueados.has(o.id));
  const idsPublicados = new Set(publicadas.map((o) => o.id));
  const base = Array.isArray(editoriais) ? editoriais : [];
  const resto = base.filter((o) => o && o.id && !bloqueados.has(o.id) && !idsPublicados.has(o.id));
  return [...publicadas, ...resto].filter((o) => !excluirPorDatas(o, diaIso));
}
