// Mapeia a resposta da Amadeus Flight Offers Search (GET /v2/shopping/
// flight-offers, ver searchFlightOffers em src/partners/amadeus.js) para o
// MESMO formato que FLIGHTS usa em src/render/aondeContent.js:
//   { cia, numero, saida, chegada, duracao, paradas, direto, preco, parcela, melhor }
// E o unico ponto de contato entre o shape bruto da Amadeus e o shape que
// renderResultsPage (src/render/htmlRenderer.js) ja sabe desenhar.
//
// Cada oferta mostra so o trecho de IDA (primeiro voo -> ultima chegada do
// primeiro itinerary), igual ao dado de amostra — o preco total exibido, no
// entanto, e sempre o preco de ida E volta (grandTotal da oferta), porque o
// rotulo fixo da tela diz "ida e volta, por pessoa" e nao pode ser trocado
// aqui (ver limitacao no relatorio/README da integracao).
//
// Tolerante como o resto do parsing de Amadeus no projeto (ver
// extractQuartiles em src/partners/amadeus.js): uma oferta que nao bate o
// shape esperado e simplesmente pulada — nunca derruba as demais nem lanca
// excecao.

import { formatBRL } from "../render/htmlRenderer.js";

// Nomes populares (pt-BR) das companhias mais comuns nas rotas do Brasil e
// America do Sul/Europa. Fora dessa lista, usa o nome do dicionario da
// propria resposta (dictionaries.carriers) e, na falta dele, o codigo IATA.
const NOMES_CIA = {
  G3: "GOL",
  AD: "Azul",
  LA: "LATAM",
  JJ: "LATAM",
  TP: "TAP Portugal",
  IB: "Iberia",
  AF: "Air France",
  KL: "KLM",
  LH: "Lufthansa",
  AA: "American Airlines",
  DL: "Delta",
  UA: "United",
  CM: "Copa Airlines",
  AV: "Avianca",
  AR: "Aerolineas Argentinas",
  UX: "Air Europa",
  TK: "Turkish Airlines",
  EK: "Emirates",
  QR: "Qatar Airways",
  BA: "British Airways",
  H2: "Sky Airline",
};

const DEFAULT_MAX = 6;

/**
 * @param {object} amadeusData corpo bruto de searchFlightOffers (res.data):
 *   { data: [ {itineraries, price, validatingAirlineCodes} ], dictionaries }
 * @param {object} [opts]
 * @param {number} [opts.max=6] quantas ofertas devolver (as mais baratas primeiro)
 * @returns {Array} voos no formato de FLIGHTS, ordenados por preco crescente,
 *   com `melhor:true` apenas no primeiro (o mais barato — o mesmo criterio
 *   que o selo "MELHOR PREÇO" da tela promete).
 */
export function mapAmadeusOffersToFlights(amadeusData, opts = {}) {
  const max = Number.isFinite(opts.max) && opts.max > 0 ? Math.trunc(opts.max) : DEFAULT_MAX;
  const offers = Array.isArray(amadeusData && amadeusData.data) ? amadeusData.data : [];
  const dictionaries = (amadeusData && amadeusData.dictionaries) || {};

  const voos = [];
  for (const offer of offers) {
    const voo = mapOneOffer(offer, dictionaries);
    if (voo) voos.push(voo);
  }

  voos.sort((a, b) => a._centavos - b._centavos);
  voos.forEach((v, i) => {
    v.melhor = i === 0;
    delete v._centavos;
  });

  return voos.slice(0, max);
}

function mapOneOffer(offer, dictionaries) {
  if (!offer || typeof offer !== "object") return null;

  const itinerarios = Array.isArray(offer.itineraries) ? offer.itineraries : null;
  if (!itinerarios || itinerarios.length === 0) return null;

  const ida = itinerarios[0];
  const segmentos = Array.isArray(ida && ida.segments) ? ida.segments : null;
  if (!segmentos || segmentos.length === 0) return null;

  const primeiro = segmentos[0];
  const ultimo = segmentos[segmentos.length - 1];
  if (!primeiro || !ultimo) return null;

  const saida = formatHora(primeiro.departure && primeiro.departure.at);
  const chegada = formatHora(ultimo.arrival && ultimo.arrival.at);
  const duracao = formatDuracao(ida.duration);
  if (!saida || !chegada || !duracao) return null;

  const centavos = extractCentavos(offer.price);
  if (centavos === null) return null;

  const codigoCia =
    (primeiro.carrierCode && String(primeiro.carrierCode).toUpperCase()) ||
    (Array.isArray(offer.validatingAirlineCodes) && offer.validatingAirlineCodes[0]) ||
    "";
  const cia = nomeCia(codigoCia, dictionaries);
  const numeroDoVoo = `${codigoCia}${primeiro.number ? " " + primeiro.number : ""}`.trim() || "Voo";

  const paradas = segmentos.length - 1;
  const direto = paradas === 0;
  const codigoConexao = !direto ? primeiro.arrival && primeiro.arrival.iataCode : "";
  const paradasLabel = direto
    ? "Direto"
    : `${paradas} parada${paradas > 1 ? "s" : ""}${codigoConexao ? " · " + codigoConexao : ""}`;
  const numero = `${numeroDoVoo} · ${direto ? "direto" : "via " + (codigoConexao || "conexão")}`;

  return {
    cia,
    numero,
    saida,
    chegada,
    duracao,
    paradas: paradasLabel,
    direto,
    preco: formatBRL(centavos),
    parcela: formatBRL(Math.round(centavos / 12)),
    melhor: false,
    // campo interno, so para ordenar por preco — removido antes de sair de mapAmadeusOffersToFlights.
    _centavos: centavos,
  };
}

// price.grandTotal e o total (ida e volta, todos os passageiros incluidos
// conforme os parametros da busca) — cai para price.total quando ausente.
function extractCentavos(price) {
  if (!price || typeof price !== "object") return null;
  const bruto = price.grandTotal ?? price.total;
  if (bruto === undefined || bruto === null || bruto === "") return null;
  const n = typeof bruto === "number" ? bruto : parseFloat(String(bruto));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

// "2026-09-01T07:00:00" -> "07:00". Entrada invalida -> "".
export function formatHora(isoDateTime) {
  if (typeof isoDateTime !== "string") return "";
  const m = /T(\d{2}):(\d{2})/.exec(isoDateTime);
  return m ? `${m[1]}:${m[2]}` : "";
}

// Duracao ISO8601 ("PT3H5M", "PT45M", "PT3H") -> "3h 05" (mesmo estilo da
// amostra em aondeContent.js). Entrada invalida -> "".
export function formatDuracao(iso) {
  if (typeof iso !== "string") return "";
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?$/.exec(iso.trim());
  if (!m || (!m[1] && !m[2])) return "";
  const h = m[1] ? parseInt(m[1], 10) : 0;
  const min = m[2] ? parseInt(m[2], 10) : 0;
  return `${h}h ${String(min).padStart(2, "0")}`;
}

// Nome popular da companhia a partir do codigo IATA de 2 letras: prioriza a
// lista curada (NOMES_CIA), depois o dicionario da propria resposta
// (dictionaries.carriers, em CAIXA ALTA -> Titulo), por ultimo o codigo cru.
export function nomeCia(codigo, dictionaries) {
  if (!codigo) return "Companhia";
  if (NOMES_CIA[codigo]) return NOMES_CIA[codigo];
  const doDicionario = dictionaries && dictionaries.carriers && dictionaries.carriers[codigo];
  if (typeof doDicionario === "string" && doDicionario.trim()) return tituloCase(doDicionario);
  return codigo;
}

function tituloCase(s) {
  return String(s)
    .toLowerCase()
    .replace(/(^|\s)([a-zà-ÿ])/g, (_, sep, c) => sep + c.toUpperCase());
}
