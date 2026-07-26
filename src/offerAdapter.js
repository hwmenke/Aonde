// offerAdapter — traduz um `deal` retornado por `searchDeals()` (formato
// normalizado do Travelpayouts Data API, ver src/partners/travelpayouts.js)
// para um objeto `Offer` **parcial**, no formato de domínio usado pelo
// backend de curadoria do Aonde.com.br.
//
// IMPORTANTE — este adapter NUNCA preenche os campos abaixo, porque exigem
// curadoria editorial humana ou dados que este módulo simplesmente não tem
// (lookup geográfico, textos, histórico de preços):
//   cidade, local, texto, dicas, prova_url, datas_flex,
//   published_at, expires_at, created_by
// O objeto retornado por `toOffer`/`toOffers` é sempre um SUBCONJUNTO de
// `Offer` — cabe ao chamador completar os campos restantes antes de
// persistir/publicar uma oferta.
//
// EXCEÇÃO — `thumb_url`: `toOffer` mantém-se puro/síncrono (NUNCA faz rede) e
// sai com `thumb_url: null` por padrão, mas aceita `options.thumbUrl` quando o
// chamador já tem a imagem. Para preencher a imagem real de destino a partir do
// Wikimedia Commons, use a função async `enrichOfferWithImage` (faz 1-2
// chamadas de rede por oferta — pertence ao pipeline de curadoria/build, não ao
// hot path de request).
//
// Da mesma forma, `desconto_pct` e `economia_centavos` só são calculados
// quando o chamador fornece `options.mediaCentavos` explicitamente — este
// módulo não tem banco de dados histórico de preços (isso é responsabilidade
// de um job separado, o "monitor de tarifas", fora de escopo aqui). Sem
// `mediaCentavos`, ambos os campos saem como `null`.

// Lista NÃO EXAUSTIVA e heurística de códigos IATA de aeroportos brasileiros,
// usada só para decidir se uma rota é "Nacional" ou "Internacional"
// (`deriveTipo`). Cobre as principais capitais e destinos turísticos citados
// no protótipo do Aonde — fácil de estender conforme novas rotas apareçam.
export const BRAZILIAN_AIRPORTS = new Set([
  "GRU", "CGH", "VCP", // Sao Paulo
  "GIG", "SDU", // Rio de Janeiro
  "BSB", // Brasilia
  "CNF", "PLU", // Belo Horizonte
  "SSA", // Salvador
  "REC", // Recife
  "FOR", // Fortaleza
  "POA", // Porto Alegre
  "CWB", // Curitiba
  "FLN", // Florianopolis
  "MAO", // Manaus
  "BEL", // Belem
  "GYN", // Goiania
  "VIX", // Vitoria
  "NAT", // Natal
  "MCZ", // Maceio
  "JPA", // Joao Pessoa
  "THE", // Teresina
  "SLZ", // Sao Luis
  "CGB", // Cuiaba
  "CGR", // Campo Grande
  "IGU", // Foz do Iguacu
  "JOI", // Joinville
  "LDB", // Londrina
  "UDI", // Uberlandia
  "PVH", // Porto Velho
  "RBR", // Rio Branco
  "BVB", // Boa Vista
  "PMW", // Palmas
  "AJU", // Aracaju
  "IOS", // Ilheus
  "JJD", // Jericoacoara
  "PNZ", // Petrolina
  "IPN", // Ipatinga
]);

// Mapa estático pequeno de códigos IATA de companhias aéreas comuns em rotas
// do/para o Brasil. Fallback: quando o código não está no mapa, usa-se o
// próprio código IATA cru (não inventamos nome de companhia desconhecida).
export const AIRLINE_NAMES = {
  LA: "LATAM",
  G3: "GOL",
  AD: "Azul",
  TP: "TAP",
  AF: "Air France",
  IB: "Iberia",
  UX: "Air Europa",
  AZ: "ITA Airways",
  LH: "Lufthansa",
  KL: "KLM",
  DL: "Delta",
  UA: "United",
  AA: "American Airlines",
  CM: "Copa Airlines",
  AR: "Aerolíneas Argentinas",
};

const MONTHS_PT_BR = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

/**
 * Deriva "Nacional" ou "Internacional" a partir dos aeroportos de origem e
 * destino. Só é "Nacional" quando AMBOS estão na lista heurística de
 * aeroportos brasileiros (`BRAZILIAN_AIRPORTS`).
 *
 * @param {string|null|undefined} origin código IATA
 * @param {string|null|undefined} destination código IATA
 * @returns {"Nacional"|"Internacional"}
 */
export function deriveTipo(origin, destination) {
  const isNacional =
    BRAZILIAN_AIRPORTS.has(String(origin || "").toUpperCase()) &&
    BRAZILIAN_AIRPORTS.has(String(destination || "").toUpperCase());
  return isNacional ? "Nacional" : "Internacional";
}

function parseDateSafe(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function padDay(day) {
  return String(day).padStart(2, "0");
}

function formatDayMonth(date) {
  const day = padDay(date.getDate());
  const month = MONTHS_PT_BR[date.getMonth()];
  return `${day} ${month}`;
}

/**
 * Formata um intervalo de datas no estilo usado pelo feed de ofertas do
 * Aonde, ex.: "12–24 out". Parse defensivo: nunca lança exceção — datas
 * ausentes ou inválidas resultam em `null` (ou em formato parcial quando só
 * a ida é válida).
 *
 * @param {string|null|undefined} departDate
 * @param {string|null|undefined} returnDate
 * @returns {string|null}
 */
export function formatDateRangePtBr(departDate, returnDate) {
  const depart = parseDateSafe(departDate);
  const ret = parseDateSafe(returnDate);

  if (depart && ret) {
    // Mesmo mes: "12-24 out". Meses diferentes: "28 set-03 out".
    if (depart.getMonth() === ret.getMonth() && depart.getFullYear() === ret.getFullYear()) {
      return `${padDay(depart.getDate())}–${formatDayMonth(ret)}`;
    }
    return `${formatDayMonth(depart)}–${formatDayMonth(ret)}`;
  }

  if (depart) {
    return `a partir de ${formatDayMonth(depart)}`;
  }

  return null;
}

/**
 * Converte um preço numérico (na moeda do deal, ex.: reais) para centavos.
 *
 * @param {number|null|undefined} price
 * @returns {number|null}
 */
export function centavosFromPrice(price) {
  if (price === null || price === undefined || typeof price !== "number" || Number.isNaN(price)) {
    return null;
  }
  return Math.round(price * 100);
}

/**
 * Calcula `desconto_pct` e `economia_centavos` a partir do preço atual e da
 * média histórica da rota — só quando `mediaCentavos` é fornecido pelo
 * chamador (este módulo não calcula médias históricas sozinho; isso é
 * responsabilidade do job de monitoramento de tarifas, fora de escopo aqui).
 * Desconto nunca é negativo: se o preço atual for maior que a média, ambos
 * os campos saem como 0.
 *
 * @param {number|null} precoCentavos
 * @param {number|null|undefined} mediaCentavos
 * @returns {{desconto_pct: number|null, economia_centavos: number|null}}
 */
export function computeDiscount(precoCentavos, mediaCentavos) {
  if (
    typeof mediaCentavos !== "number" ||
    Number.isNaN(mediaCentavos) ||
    mediaCentavos <= 0 ||
    typeof precoCentavos !== "number" ||
    Number.isNaN(precoCentavos)
  ) {
    return { desconto_pct: null, economia_centavos: null };
  }

  const descontoPct = Math.max(0, Math.round(((mediaCentavos - precoCentavos) / mediaCentavos) * 100));
  const economiaCentavos = Math.max(0, mediaCentavos - precoCentavos);

  return { desconto_pct: descontoPct, economia_centavos: economiaCentavos };
}

/**
 * Mapeia um item de `deals` (retornado por `searchDeals()`) para um `Offer`
 * parcial (ver comentário no topo do arquivo sobre quais campos ficam de
 * fora). Não lança exceção — parse de datas/preço é sempre defensivo.
 *
 * @param {object} deal item do array `deals` de `searchDeals()`
 * @param {object} [options]
 * @param {string} [options.id] id/slug da oferta; default `${origin}-${destination}` em minusculas
 * @param {number|null} [options.mediaCentavos] média histórica da rota, se disponível (job de monitoramento)
 * @param {boolean} [options.isErroTarifa] default `false`
 * @param {"rascunho"|"publicada"|"expirada"} [options.status] default `"rascunho"`
 * @param {string|null} [options.thumbUrl] URL de imagem já conhecida; sem ela, `thumb_url` sai `null`
 * @returns {object} Offer parcial
 */
export function toOffer(deal, options = {}) {
  const precoCentavos = centavosFromPrice(deal.price);
  const { desconto_pct, economia_centavos } = computeDiscount(precoCentavos, options.mediaCentavos);

  return {
    id: options.id || `${(deal.origin || "").toLowerCase()}-${(deal.destination || "").toLowerCase()}`,
    origem: deal.origin,
    destino: deal.destination,
    tipo: deriveTipo(deal.origin, deal.destination),
    cia: AIRLINE_NAMES[deal.airline] || deal.airline || null,
    preco_centavos: precoCentavos,
    media_centavos: options.mediaCentavos ?? null,
    desconto_pct,
    economia_centavos,
    is_erro_tarifa: options.isErroTarifa ?? false,
    datas_sugeridas: formatDateRangePtBr(deal.departDate, deal.returnDate),
    affiliate_url: deal.link || null,
    // `thumb_url` puro: usa options.thumbUrl se dado; senao null (sem rede aqui).
    // Para preencher com imagem real do Wikimedia, use enrichOfferWithImage.
    thumb_url: options.thumbUrl ?? null,
    status: options.status || "rascunho",
  };
}

/**
 * Conveniência para mapear o array `deals` inteiro vindo de `searchDeals()`.
 * As mesmas `options` (ex.: `mediaCentavos`) são aplicadas a todos os itens
 * — use com cuidado quando a média histórica varia por rota/data.
 *
 * @param {Array<object>} deals
 * @param {object} [options]
 * @returns {Array<object>} array de Offers parciais
 */
export function toOffers(deals, options = {}) {
  return deals.map((deal) => toOffer(deal, options));
}

// ---------------------------------------------------------------------------
// Enriquecimento com imagens reais de destino (Wikimedia Commons)
// ---------------------------------------------------------------------------
// As funcoes abaixo fazem REDE (via wikimediaProvider.getDestinationImage) e por
// isso sao async e ficam SEPARADAS de toOffer (que continua puro/sincrono).
// Uso previsto: pipeline de curadoria/build, NAO o hot path de request.

/**
 * Retorna uma CÓPIA do offer com `thumb_url` e `thumb_attribution` preenchidos a
 * partir de uma imagem real do Wikimedia. Faz 1-2 chamadas de rede por oferta
 * (1 busca + 1 imageinfo). Resiliente: se o provider falhar ou nao achar imagem,
 * devolve o offer INALTERADO (nunca lanca).
 *
 * @param {object} offer Offer (parcial) a enriquecer
 * @param {object} [opts]
 * @param {string} [opts.query] termo de busca; default `offer.cidade || offer.destino`
 * @param {string} [opts.lang="pt"] idioma da Wikipedia
 * @param {number} [opts.width] tamanho do thumbnail
 * @returns {Promise<object>} cópia do offer (com thumb_url/thumb_attribution) ou o próprio offer em falha
 */
export async function enrichOfferWithImage(offer, opts = {}) {
  if (!offer || typeof offer !== "object") return offer;
  const query = opts.query || offer.cidade || offer.destino;
  if (!query) return offer;

  try {
    // Import dinamico evita acoplar o caminho puro de toOffer ao provider de
    // rede e mantem o modulo carregavel mesmo sem tocar a camada HTTP.
    const { getDestinationImage } = await import("./images/wikimediaProvider.js");
    const res = await getDestinationImage({ query, lang: opts.lang, width: opts.width });
    if (!res || !res.ok || !res.thumbUrl) return offer;

    return {
      ...offer,
      thumb_url: res.thumbUrl,
      thumb_attribution: res.attribution || null,
    };
  } catch {
    // Qualquer falha inesperada: preserva o offer original (resiliencia).
    return offer;
  }
}

/**
 * Enriquece um array de offers com imagens, isolando falhas por oferta via
 * `Promise.allSettled` (uma oferta que falha nao derruba as demais). Faz 1-2
 * chamadas de rede POR oferta — use no pipeline de curadoria, com moderacao.
 *
 * @param {Array<object>} offers
 * @param {object} [opts] repassado a enrichOfferWithImage (lang/width); a
 *   `query` default continua sendo `cidade || destino` de cada oferta
 * @returns {Promise<Array<object>>} offers na mesma ordem (enriquecidos ou originais)
 */
export async function enrichOffersWithImages(offers, opts = {}) {
  if (!Array.isArray(offers)) return [];
  const settled = await Promise.allSettled(
    offers.map((offer) => enrichOfferWithImage(offer, opts))
  );
  return settled.map((outcome, i) =>
    outcome.status === "fulfilled" ? outcome.value : offers[i]
  );
}
