// Montador de roteiros de viagem com pontos turisticos reais (Google Places
// API New, via src/guides/placesClient.js). Entrega a "espinha dorsal" de um
// Guide do produto Aonde (roteiro de N dias, cada dia com titulo, pontos e um
// restaurante opcional) — com dados reais, para a curadoria depois enriquecer
// com o texto editorial rico do site.
//
// Formato de saida: parcial do modelo `Guide` do produto
//   { ok, destination, days: [{ n, titulo, pontos: [{ nome, nota, ... }],
//     restaurante? }], attribution, error? }
//
// IMPORTANTE (politica Google Maps): NAO inventamos descricoes editoriais — o
// campo `resumo` de cada ponto vem exclusivamente do `editorialSummary` do
// Google quando existe; se nao existir, fica ausente. A atribuicao "Dados de
// lugares: Google" e obrigatoria e acompanha o roteiro (campo `attribution` e
// rodape do markdown).

import { searchPlaces } from "./placesClient.js";
import { firstPhotoFrom } from "./placePhotos.js";

/**
 * Nota ponderada de um lugar: combina a media de avaliacoes (`rating`, 0-5)
 * com o volume de avaliacoes (`ratingCount`), para nao deixar um lugar com
 * nota 5,0 e 3 avaliacoes vencer um com 4,7 e 20.000.
 *
 * Formula (documentada):  score = rating * log10(ratingCount + 1)
 *
 * - log10(ratingCount + 1) cresce devagar (retornos decrescentes): mais
 *   avaliacoes ajudam, mas nao dominam a nota.
 * - "+1" evita log(0) e mantem score 0 quando nao ha avaliacoes.
 * - Lugares sem `rating` recebem score 0 (vao para o fim da fila).
 */
export function weightedScore(place) {
  const rating = typeof place?.rating === "number" ? place.rating : 0;
  const count = typeof place?.ratingCount === "number" ? place.ratingCount : 0;
  return rating * Math.log10(count + 1);
}

// Distribui uma lista JA ORDENADA (melhores primeiro) em `days` dias no estilo
// round-robin: o 1o dia leva os itens 0, days, 2*days...; o 2o leva 1, days+1...
// Assim cada dia recebe uma fatia equilibrada dos melhores pontos (nao concentra
// os top-N todos no dia 1). Resulta em ~ceil(total/days) pontos por dia.
function roundRobinDistribute(items, days) {
  const buckets = Array.from({ length: days }, () => []);
  items.forEach((item, i) => {
    buckets[i % days].push(item);
  });
  return buckets;
}

// Agrupamento grosseiro por proximidade geografica DENTRO de um dia: ordena os
// pontos do dia pelo angulo (atan2) em torno do centroide do proprio dia. E uma
// HEURISTICA simples (nao e otimizacao de rota / TSP real) so para que pontos
// vizinhos tendam a ficar adjacentes na lista do dia. Pontos sem lat/lng vao
// para o fim, preservando a ordem relativa por nota.
function orderByProximity(points) {
  const withGeo = points.filter((p) => p.lat != null && p.lng != null);
  const withoutGeo = points.filter((p) => p.lat == null || p.lng == null);

  if (withGeo.length <= 2) return points; // nada a ganhar reordenando

  const cLat = withGeo.reduce((s, p) => s + p.lat, 0) / withGeo.length;
  const cLng = withGeo.reduce((s, p) => s + p.lng, 0) / withGeo.length;

  const ordered = [...withGeo].sort(
    (a, b) => Math.atan2(a.lat - cLat, a.lng - cLng) - Math.atan2(b.lat - cLat, b.lng - cLng)
  );

  return [...ordered, ...withoutGeo];
}

// Extrai a foto (Place Photos) de um place normalizado para o shape `foto` do
// ponto do Guide: { url, attribution: {text, uri}, width, height } | null.
// Usa buildPhotoMediaUrl (URL direta, SEM gastar chamada extra de rede no
// build); a resolucao via /media (resolvePhotoUri) fica opcional para o
// consumidor. Sem fotos (ou sem API key) => null, sem "undefined".
function placeToFoto(place, photoOpts) {
  const first = firstPhotoFrom(place, photoOpts);
  if (!first) return null;
  return {
    url: first.mediaUrl,
    attribution: first.attribution, // { text, uri }
    width: first.widthPx,
    height: first.heightPx,
  };
}

// Mapeia um `place` normalizado (placesClient) para um `ponto` do Guide.
// `resumo` so aparece quando ha editorialSummary (nunca inventado).
function placeToPonto(place, photoOpts) {
  const ponto = {
    nome: place.name || null,
    // `nota` = nota exibida ao usuario (o rating do Google, 0-5). Mantemos o
    // nome do campo do modelo Guide (pontos: [{ nome, nota }]).
    nota: place.rating != null ? place.rating : null,
    endereco: place.address || null,
    rating: place.rating != null ? place.rating : null,
    ratingCount: place.ratingCount != null ? place.ratingCount : null,
    mapsUri: place.mapsUri || null,
    // Foto real do ponto (Google Place Photos) ou null quando indisponivel.
    foto: placeToFoto(place, photoOpts),
  };
  if (place.summary) ponto.resumo = place.summary; // omite quando ausente
  return ponto;
}

/**
 * Monta um roteiro de N dias para um destino, usando pontos turisticos reais
 * da Google Places API (New).
 *
 * @param {object} params
 * @param {string} params.destination  ex.: "Recife"
 * @param {number} [params.days=5]
 * @param {string} [params.regionCode] bias regional da Places API (ex.: "BR")
 * @param {number} [params.maxPlaces=25] teto de pontos turisticos considerados
 * @param {boolean} [params.withRestaurants=true] busca tambem 1 restaurante/dia
 * @param {number} [params.photoMaxWidthPx=800] largura maxima das fotos (1..4800)
 * @returns {Promise<{ok, destination, days, hero, attribution, error?}>}
 *   hero: { url, attribution: {text, uri} } | null — foto de capa do guia,
 *   tirada do ponto de maior nota ponderada que tenha foto.
 *
 * Resiliente: nunca lanca excecao. Falha na busca de pontos turisticos =>
 * { ok:false, error }. A busca (opcional) de restaurantes e best-effort: se
 * falhar, o roteiro sai sem restaurantes, ainda ok:true.
 */
export async function buildItinerary({
  destination,
  days = 5,
  regionCode,
  maxPlaces = 25,
  withRestaurants = true,
  photoMaxWidthPx = 800,
} = {}) {
  const attribution = "Dados de lugares: Google";
  // Options repassadas ao extrator de fotos (Place Photos). apiKey vem do
  // config por padrao (firstPhotoFrom resolve); sem chave, foto vira null.
  const photoOpts = { maxWidthPx: photoMaxWidthPx };

  if (!destination || typeof destination !== "string" || destination.trim() === "") {
    return { ok: false, destination: destination || null, days: [], hero: null, attribution, error: "destination e obrigatorio" };
  }
  const numDays = Number.isInteger(days) && days > 0 ? days : 5;

  // 1) Pontos turisticos.
  const attractionsRes = await searchPlaces({
    query: `pontos turisticos em ${destination}`,
    includedType: "tourist_attraction",
    maxResults: maxPlaces,
    regionCode,
  });

  if (!attractionsRes.ok) {
    return { ok: false, destination, days: [], hero: null, attribution, error: attractionsRes.error };
  }

  // Ordena por nota ponderada (melhores primeiro) e corta em maxPlaces.
  const ranked = [...attractionsRes.places]
    .sort((a, b) => weightedScore(b) - weightedScore(a))
    .slice(0, maxPlaces);

  if (ranked.length === 0) {
    return {
      ok: false,
      destination,
      days: [],
      hero: null,
      attribution,
      error: `Nenhum ponto turistico encontrado para "${destination}".`,
    };
  }

  // 2) Restaurantes (opcional, best-effort). Busca menos itens: ~1 por dia.
  let restaurants = [];
  if (withRestaurants) {
    const restRes = await searchPlaces({
      query: `restaurantes recomendados em ${destination}`,
      includedType: "restaurant",
      maxResults: Math.max(numDays, 5),
      regionCode,
    });
    if (restRes.ok) {
      restaurants = [...restRes.places].sort((a, b) => weightedScore(b) - weightedScore(a));
    }
    // Se falhar, seguimos sem restaurantes (nao derruba o roteiro).
  }

  // 3) Distribui os pontos nos dias e ordena cada dia por proximidade.
  const buckets = roundRobinDistribute(ranked, numDays);

  const daysOut = buckets.map((bucketPlaces, index) => {
    const ordered = orderByProximity(bucketPlaces);
    const pontos = ordered.map((p) => placeToPonto(p, photoOpts));

    const day = {
      n: index + 1,
      titulo: makeDayTitle(index + 1, ordered),
      pontos,
    };

    // 1 restaurante por dia, se houver (distribuido em round-robin tambem).
    const rest = restaurants[index];
    if (rest) {
      day.restaurante = {
        nome: rest.name || null,
        rating: rest.rating != null ? rest.rating : null,
        endereco: rest.address || null,
      };
    }

    return day;
  });

  // Foto de capa (hero) = foto do ponto de MAIOR nota ponderada que tenha foto.
  // `ranked` ja esta ordenado por weightedScore desc; pegamos a 1a foto valida
  // (o topo costuma ter foto; o fallback evita capa vazia se o 1o nao tiver).
  const hero = pickHero(ranked, photoOpts);

  return { ok: true, destination, days: daysOut, hero, attribution, error: null };
}

// Escolhe a foto de capa: percorre os lugares JA ordenados por nota ponderada e
// retorna { url, attribution } da 1a foto encontrada (ou null se nenhum ponto
// tiver foto). Prioriza o ponto de maior nota que tenha imagem exibivel.
function pickHero(rankedPlaces, photoOpts) {
  for (const place of rankedPlaces) {
    const first = firstPhotoFrom(place, photoOpts);
    if (first) {
      return { url: first.mediaUrl, attribution: first.attribution };
    }
  }
  return null;
}

// Titulo do dia: NEUTRO e derivado dos dados. So enriquecemos o titulo quando
// da para deriva-lo de um ponto de referencia real (o 1o ponto do dia); nunca
// inventamos um tema editorial. Sem dado util => "Dia N".
function makeDayTitle(n, orderedPlaces) {
  const base = `Dia ${n}`;
  const first = orderedPlaces[0];
  if (first && first.name) {
    return `${base} — ${first.name} e arredores`;
  }
  return base;
}

// ---------------------------------------------------------------------------
// Renderizacao em markdown — TODA em bullet points (requisito explicito).
// ---------------------------------------------------------------------------

// Formata a linha de avaliacoes "(4.7★, 1.234 avaliacoes)" omitindo com
// elegancia o que estiver ausente (sem "undefined"). Retorna "" se nao houver
// nem rating nem contagem.
function formatRatingInfo(ponto) {
  const parts = [];
  if (ponto.rating != null) parts.push(`${ponto.rating}★`);
  if (ponto.ratingCount != null) {
    parts.push(`${ponto.ratingCount} avaliacoes`);
  }
  return parts.length ? ` (${parts.join(", ")})` : "";
}

// Formata o credito de uma foto (atribuicao OBRIGATORIA por politica do Google).
// Com uri, vira link markdown; sem, so o texto. `attr` pode ser null.
function formatPhotoCredit(attr) {
  const text = (attr && attr.text) || "Google";
  if (attr && attr.uri) return `— Foto: [${text}](${attr.uri})`;
  return `— Foto: ${text}`;
}

/**
 * Renderiza o roteiro (saida de buildItinerary) como markdown TODO em bullet
 * points. Campos ausentes sao omitidos sem deixar "undefined" no texto.
 *
 * Estrutura:
 *   # Roteiro de {days} dias — {destination}
 *   - ![Capa — {destination}]({hero.url})        (quando ha foto de capa)
 *     - — Foto: {hero.attribution.text}
 *   - **Dia N — ...**
 *     - **{nome}** (rating★, N avaliacoes) — {resumo} — [ver no mapa]({uri})
 *       - ![{nome}]({foto.url})                   (quando ha foto do ponto)
 *         - — Foto: {foto.attribution.text}
 *     - ...
 *     - _Sugestao de restaurante:_ **{nome}** (rating★) — {endereco}
 *   ...
 *   - Dados de lugares: Google (+ credito por foto exibida, exigido)
 *   - Roteiro gerado em {data}
 *
 * @param {object} itinerary saida de buildItinerary
 * @returns {string} markdown
 */
export function renderItineraryMarkdown(itinerary) {
  if (!itinerary || !itinerary.ok) {
    const msg = itinerary?.error || "roteiro invalido";
    return `# Roteiro indisponivel\n\n- Nao foi possivel gerar o roteiro: ${msg}`;
  }

  const days = Array.isArray(itinerary.days) ? itinerary.days : [];
  const lines = [];

  lines.push(`# Roteiro de ${days.length} dias — ${itinerary.destination}`);
  lines.push("");

  // Bullet de capa (hero) no topo, quando ha foto — imagem + credito obrigatorio.
  if (itinerary.hero && itinerary.hero.url) {
    lines.push(`- ![Capa — ${itinerary.destination}](${itinerary.hero.url})`);
    lines.push(`  - ${formatPhotoCredit(itinerary.hero.attribution)}`);
  }

  for (const day of days) {
    lines.push(`- **${day.titulo}**`);

    for (const ponto of day.pontos || []) {
      if (!ponto.nome) continue;
      // Monta a linha do ponto por segmentos, unindo so os presentes com " — ".
      let line = `  - **${ponto.nome}**${formatRatingInfo(ponto)}`;
      const tail = [];
      if (ponto.resumo) tail.push(ponto.resumo);
      if (ponto.mapsUri) tail.push(`[ver no mapa](${ponto.mapsUri})`);
      if (tail.length) line += ` — ${tail.join(" — ")}`;
      lines.push(line);

      // Imagem real do ponto (quando houver), como sub-bullets: a imagem e o
      // credito da foto (atribuicao obrigatoria). Sem foto, nada e emitido
      // (nenhum "undefined").
      if (ponto.foto && ponto.foto.url) {
        lines.push(`    - ![${ponto.nome}](${ponto.foto.url})`);
        lines.push(`      - ${formatPhotoCredit(ponto.foto.attribution)}`);
      }
    }

    if (day.restaurante && day.restaurante.nome) {
      const r = day.restaurante;
      let line = `  - _Sugestao de restaurante:_ **${r.nome}**`;
      if (r.rating != null) line += ` (${r.rating}★)`;
      if (r.endereco) line += ` — ${r.endereco}`;
      lines.push(line);
    }
  }

  lines.push("");
  // Rodape (bullets): atribuicao obrigatoria + data de geracao.
  lines.push(`- ${itinerary.attribution || "Dados de lugares: Google"}`);
  lines.push(`- Roteiro gerado em ${new Date().toISOString().slice(0, 10)}`);

  return lines.join("\n");
}
