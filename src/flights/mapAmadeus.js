// Mapeia a resposta da Amadeus Flight Offers Search (GET /v2/shopping/
// flight-offers, ver searchFlightOffers em src/partners/amadeus.js) para o
// MESMO formato que FLIGHTS usa em src/render/aondeContent.js:
//   { cia, numero, saida, chegada, duracao, paradas, direto, preco, parcela, melhor }
// E o unico ponto de contato entre o shape bruto da Amadeus e o shape que
// renderResultsPage (src/render/htmlRenderer.js) ja sabe desenhar.
//
// O preço exibido é o grandTotal da oferta (total do grupo), com a moeda que
// a resposta trouxe. O rótulo diz "por pessoa" só quando há um adulto e
// nenhum outro passageiro, ou um único travelerPricing. A volta, quando o
// segundo itinerário vem completo, segue no campo `volta`.
//
// Tolerante como o resto do parsing de Amadeus no projeto (ver
// extractQuartiles em src/partners/amadeus.js): uma oferta que nao bate o
// shape esperado e simplesmente pulada — nunca derruba as demais nem lanca
// excecao.

import { formatBRL } from "../render/texto.js";

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
  const pax = opts.pax && typeof opts.pax === "object" ? opts.pax : null;

  const voos = [];
  for (const offer of offers) {
    const voo = mapOneOffer(offer, dictionaries, pax);
    if (voo) voos.push(voo);
  }

  voos.sort((a, b) => a._centavos - b._centavos);
  voos.forEach((v, i) => {
    v.melhor = i === 0;
    delete v._centavos;
  });

  return voos.slice(0, max);
}

function mapOneOffer(offer, dictionaries, pax) {
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

  const precoOferta = extractPrecoOferta(offer.price);
  if (!precoOferta) return null;
  const { centavos, moeda, bruto } = precoOferta;
  const viajantes = viajantesDaOferta(offer.travelerPricings);
  const { precoRotulo, precoEscopo } = rotuloDoPreco(pax, viajantes);
  const emReal = !moeda || moeda === "BRL";

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
    // grandTotal (ou total) é o valor do grupo pedido na busca, não uma tarifa
    // por pessoa inventada. A parcela ilustra esse mesmo valor.
    preco: formatValor(centavos, moeda, bruto),
    parcela: emReal ? formatBRL(Math.round(centavos / 12)) : "",
    precoRotulo,
    precoEscopo,
    moeda: moeda || "BRL",
    viajantes,
    idaTrechos: trechosDe(segmentos, dictionaries),
    volta: resumoItinerario(itinerarios[1], dictionaries),
    melhor: false,
    // campo interno, so para ordenar por preco — removido antes de sair de mapAmadeusOffersToFlights.
    _centavos: centavos,
  };
}

// price.grandTotal é o total da oferta (ida e volta, passageiros pedidos).
// Sem grandTotal, usa price.total. Não converte moeda: o número exibido é o
// que a resposta trouxe, na moeda que a resposta declarou.
function extractPrecoOferta(price) {
  if (!price || typeof price !== "object") return null;
  const bruto = price.grandTotal ?? price.total;
  if (bruto === undefined || bruto === null || bruto === "") return null;
  const n = typeof bruto === "number" ? bruto : parseFloat(String(bruto));
  if (!Number.isFinite(n) || n <= 0) return null;
  const moeda = typeof price.currency === "string" && price.currency.trim() ? price.currency.trim().toUpperCase() : "";
  return { centavos: Math.round(n * 100), moeda, bruto: String(bruto) };
}

function formatValor(centavos, moeda, bruto) {
  if (!moeda || moeda === "BRL") return formatBRL(centavos);
  return `${moeda} ${bruto}`;
}

const TIPO_VIAJANTE = {
  ADULT: "Adulto",
  CHILD: "Criança",
  HELD_INFANT: "Bebê de colo",
  SEATED_INFANT: "Bebê com assento",
  YOUNG: "Jovem",
  SENIOR: "Sênior",
};

// Só entra na tela o que a resposta listou em travelerPricings. Sem essa
// lista, não há valor por viajante para mostrar.
function viajantesDaOferta(travelerPricings) {
  if (!Array.isArray(travelerPricings) || travelerPricings.length === 0) return null;
  const saida = [];
  for (const viajante of travelerPricings) {
    const price = viajante && viajante.price;
    if (!price || typeof price !== "object") continue;
    const bruto = price.total ?? price.grandTotal;
    if (bruto === undefined || bruto === null || bruto === "") continue;
    const n = typeof bruto === "number" ? bruto : parseFloat(String(bruto));
    if (!Number.isFinite(n) || n < 0) continue;
    const moeda = typeof price.currency === "string" && price.currency.trim() ? price.currency.trim().toUpperCase() : "";
    const tipoBruto = typeof viajante.travelerType === "string" ? viajante.travelerType.trim().toUpperCase() : "";
    saida.push({
      tipo: TIPO_VIAJANTE[tipoBruto] || tipoBruto || "Viajante",
      moeda: moeda || "BRL",
      preco: formatValor(Math.round(n * 100), moeda, String(bruto)),
    });
  }
  return saida.length ? saida : null;
}

function resumoPax(pax) {
  const partes = [];
  const add = (n, sing, plur) => {
    if (n > 0) partes.push(`${n} ${n === 1 ? sing : plur}`);
  };
  add(pax.adultos || 0, "adulto", "adultos");
  add(pax.criancas || 0, "criança", "crianças");
  add(pax.bebes || 0, "bebê de colo", "bebês de colo");
  if (partes.length <= 1) return partes[0] || "";
  return partes.slice(0, -1).join(", ") + " e " + partes[partes.length - 1];
}

function rotuloDoPreco(pax, viajantes) {
  const adultos = pax && Number.isFinite(Number(pax.adultos)) ? Number(pax.adultos) : null;
  const criancas = pax && Number.isFinite(Number(pax.criancas)) ? Number(pax.criancas) : 0;
  const bebes = pax && Number.isFinite(Number(pax.bebes)) ? Number(pax.bebes) : 0;
  if (adultos === 1 && criancas === 0 && bebes === 0) {
    return { precoRotulo: "ida e volta, por pessoa", precoEscopo: "pessoa" };
  }
  if (adultos !== null && adultos + criancas + bebes > 1) {
    return {
      precoRotulo: `ida e volta, total para ${resumoPax({ adultos, criancas, bebes })}`,
      precoEscopo: "grupo",
    };
  }
  if (Array.isArray(viajantes) && viajantes.length === 1) {
    return { precoRotulo: "ida e volta, por pessoa", precoEscopo: "pessoa" };
  }
  return { precoRotulo: "ida e volta, total da oferta", precoEscopo: "oferta" };
}

function dataDoInstante(isoDateTime) {
  if (typeof isoDateTime !== "string") return "";
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(isoDateTime);
  return m ? m[1] : "";
}

function trechosDe(segmentos, dictionaries) {
  if (!Array.isArray(segmentos)) return [];
  const saida = [];
  let chegadaAnterior = "";
  for (let i = 0; i < segmentos.length; i++) {
    const seg = segmentos[i];
    if (!seg || typeof seg !== "object") continue;
    const dep = seg.departure || {};
    const arr = seg.arrival || {};
    const saidaData = dataDoInstante(dep.at);
    const chegadaData = dataDoInstante(arr.at);
    const codigoOperadora =
      seg.operating && typeof seg.operating.carrierCode === "string" ? seg.operating.carrierCode.trim().toUpperCase() : "";
    saida.push({
      origem: typeof dep.iataCode === "string" ? dep.iataCode : "",
      destino: typeof arr.iataCode === "string" ? arr.iataCode : "",
      saida: formatHora(dep.at),
      chegada: formatHora(arr.at),
      saidaData,
      chegadaData,
      mudaDia: Boolean(saidaData && chegadaData && saidaData !== chegadaData),
      conexao: i < segmentos.length - 1 && typeof arr.iataCode === "string" ? arr.iataCode : "",
      cia: nomeCia(seg.carrierCode, dictionaries),
      numero: seg.number ? String(seg.number) : "",
      operadora: codigoOperadora ? nomeCia(codigoOperadora, dictionaries) : "",
    });
    if (chegadaAnterior && saidaData && chegadaAnterior !== saidaData) {
      saida[saida.length - 1].mudaDia = true;
    }
    chegadaAnterior = chegadaData || chegadaAnterior;
  }
  return saida;
}

function resumoItinerario(itinerario, dictionaries) {
  if (!itinerario || typeof itinerario !== "object") return null;
  const segmentos = Array.isArray(itinerario.segments) ? itinerario.segments : null;
  if (!segmentos || segmentos.length === 0) return null;
  const primeiro = segmentos[0];
  const ultimo = segmentos[segmentos.length - 1];
  const saida = formatHora(primeiro && primeiro.departure && primeiro.departure.at);
  const chegada = formatHora(ultimo && ultimo.arrival && ultimo.arrival.at);
  const duracao = formatDuracao(itinerario.duration);
  if (!saida || !chegada || !duracao) return null;
  const paradas = segmentos.length - 1;
  return {
    saida,
    chegada,
    duracao,
    direto: paradas === 0,
    paradas: paradas === 0 ? "Direto" : `${paradas} parada${paradas > 1 ? "s" : ""}`,
    trechos: trechosDe(segmentos, dictionaries),
  };
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
