// htmlRenderer — PAGINAS HTML de producao do Aonde.com.br.
//
// Este renderizador e a PORTA FIEL do prototipo de design entregue em
// docs/handoff/design/Aonde.dc.html. O prototipo era um "design canvas"
// (runtime React proprietario, com {{ mustache }}, <image-slot>, <sc-for>,
// <sc-if> e um seletor de telas <x-dc>). Aqui, o MESMO markup, as MESMAS
// secoes, copy e design tokens viram HTML server-side, com:
//   - {{ mustache }}   -> interpolacao de dados (escapada)
//   - <sc-for>/<sc-if> -> loops/condicionais em JS
//   - <image-slot>     -> <img> resiliente (fallback SVG via onerror) ou
//                         placeholder SVG inline quando nao ha URL
//   - navegacao por estado -> URLs reais (/, /ofertas, /ofertas/:id, /guias/:id)
//
// As paginas de OFERTAS e ROTEIRO podem ser alimentadas por dados AO VIVO do
// back-end (offersStore / buildItinerary); a curadoria editorial fixa
// (home, guias) vem de aondeContent.js.
//
// AUTOCONTENCAO: toda <img> externa tem `onerror` que troca por um placeholder
// SVG embutido (data-URI) — as paginas renderizam sempre, mesmo offline ou sem
// credenciais de imagem.

import {
  HERO_SLIDES,
  TRIP_STYLES,
  EXTRAS,
  CONFIANCA,
  COMO_FUNCIONA,
  OFFERS as CONTENT_OFFERS,
  OFFER_ORIGINS,
  OFFER_COORDS,
  GUIDE_LIST,
  GUIDES,
  GUIDE_COORDS,
  MONTH_NAMES,
  melhorMesDoGuia,
  RESULTS_ROUTE,
  FLIGHT_SORTS,
  FLIGHTS,
  FLIGHT_FILTERS,
} from "./aondeContent.js";
import { escapeHtml, formatBRL, semAcento } from "./texto.js";
import { getRouteSeries } from "../store/priceHistory.js";
import { renderRouteSparkline } from "./sparkline.js";
import { createHash } from "node:crypto";

import { getConfig } from "../config.js";
import { rotuloAeroporto, cidadeDoIata } from "./aeroportos.js";
import {
  FAQ_GROUPS,
  buildOrganization,
  buildWebSite,
  buildBreadcrumbList,
  buildFaqPage,
  buildTouristTrip,
  buildOfferProduct,
} from "./structuredData.js";

// ---------------------------------------------------------------------------
// Atendimento — WhatsApp so quando ha um numero REAL configurado
// (AONDE_WHATSAPP). Sem numero, o site nao promete WhatsApp: usa o telefone
// (0800) por voz. 0800 e linha fixa e NAO recebe WhatsApp — nunca rotular como.
// ---------------------------------------------------------------------------

// JSON seguro para embutir DENTRO de <script>: neutraliza "</script>" e os
// separadores de linha U+2028/U+2029 (senao um dado com "</script>" quebra o
// script e injeta HTML/JS depois — breakout classico).
function jsonForScript(value) {
  // Escapa "<" (evita "</script>") e os separadores de linha U+2028/U+2029.
  return JSON.stringify(value).replace(/[<\u2028\u2029]/g, function (c) {
    return "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0");
  });
}

function atendimento() {
  try {
    return getConfig().atendimento || {};
  } catch {
    return {};
  }
}
function waHref(text) {
  const num = (atendimento().whatsapp || "").trim();
  if (!num) return "";
  return `https://wa.me/${num}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}
function telLabel() {
  return atendimento().telefone || "0800 942 0842";
}
function telHref() {
  return `tel:${telLabel().replace(/\D/g, "")}`;
}
// Link de ajuda humana: WhatsApp real quando houver; senao a Central de ajuda.
function ajudaHref(text) {
  return waHref(text) || "/ajuda";
}

// Marker de afiliado do Travelpayouts (comissao). Vazio => links sem marker
// (ainda funcionam, so nao rastreiam/monetizam).
function tpMarker() {
  try {
    return (getConfig().travelpayouts && getConfig().travelpayouts.marker) || "";
  } catch {
    return "";
  }
}
function withMarker(url) {
  const m = tpMarker();
  if (!m) return url;
  return url + (url.includes("?") ? "&" : "?") + "marker=" + encodeURIComponent(m);
}
// Rota do interstitial de saida para a busca generica de voos (sem oferta
// especifica por tras): a MESMA pagina de aviso que /saida/:id ja usa para
// ofertas com link de afiliado — "voce esta indo para X, quem processa a
// reserva e o parceiro". O "Selecionar" da lista de resultados NUNCA pula
// direto para o parceiro; ele sempre passa por aqui primeiro.
function saidaVooHref(origem, destino) {
  return `/saida/voo?origem=${encodeURIComponent(origem)}&destino=${encodeURIComponent(destino)}`;
}
// Busca de hospedagem no parceiro (Hotellook), com marker de comissao.
function hotellookSearch(destino) {
  const base = destino
    ? `https://search.hotellook.com/?destination=${encodeURIComponent(destino)}`
    : "https://search.hotellook.com/";
  return withMarker(base);
}

// ---------------------------------------------------------------------------
// Filtros de voo (/resultados) — o "tipo" vem do TITULO do grupo (paradas,
// companhias, horario) e o "valor" de cada opcao vem do proprio TEXTO do
// rotulo (numero de paradas, nome da cia, faixa de horas). Assim o filtro
// funciona de verdade no cliente sem depender de um enum paralelo em
// aondeContent.js — se o texto mudar mas continuar dizendo "1 parada" ou
// "9h – 12h", o filtro ainda entende.
// ---------------------------------------------------------------------------
function filtroTipo(titulo) {
  const t = String(titulo || "").toLowerCase();
  if (t.indexOf("parada") !== -1) return "paradas";
  if (t.indexOf("companhia") !== -1) return "cia";
  if (t.indexOf("horário") !== -1 || t.indexOf("horario") !== -1) return "horario";
  return "outro";
}
function filtroValor(tipo, label) {
  const l = String(label || "");
  if (tipo === "paradas") {
    const m = l.match(/(\d+)/);
    const min = m ? m[1] : "0";
    return min + (l.indexOf("+") !== -1 ? "+" : "");
  }
  if (tipo === "horario") {
    const m = l.match(/(\d+)\s*h.*?(\d+)\s*h/i);
    return m ? `${m[1]}-${m[2]}` : "";
  }
  // "cia": o proprio nome da companhia, como aparece no rotulo.
  return l.trim();
}
// Hora (0-23) de partida a partir de "07:15"; -1 quando o formato nao bate.
function horaDeSaida(saida) {
  const m = String(saida || "").match(/^(\d{1,2})/);
  return m ? Number(m[1]) : -1;
}
// Numero de paradas: usa v.direto quando presente; senao tenta extrair da
// descricao ("1 parada · BSB" -> 1); sem nenhuma pista, assume 1 (conexao).
function numeroDeParadas(v) {
  if (v && v.direto) return 0;
  const m = String((v && v.paradas) || "").match(/(\d+)/);
  return m ? Number(m[1]) : 1;
}

// ---------------------------------------------------------------------------
// Design do Google Maps — estilo proprio do Aonde (claro, verde, sem POIs
// ruidosos) + pin da marca. Usados no /mapa e no mini-mapa dos roteiros.
// ---------------------------------------------------------------------------

// Estilo enxuto e claro que combina com a paleta do site (fundo off-white,
// água verde-água, parques verdes, sem excesso de rótulos/POIs).
const AONDE_MAP_STYLE = JSON.stringify([
  { elementType: "geometry", stylers: [{ color: "#f4f4f0" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#6b6b66" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#f7f7f5" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ visibility: "off" }] },
  { featureType: "administrative.country", elementType: "geometry.stroke", stylers: [{ color: "#dcdcd6" }, { visibility: "on" }] },
  { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#e3efce" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road", elementType: "labels", stylers: [{ visibility: "simplified" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#eceae2" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#cfe6df" }] },
]);

// Pin teardrop verde da marca (SVG -> data URI), usado como icone dos markers.
const AONDE_MAP_PIN =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="30" height="40" viewBox="0 0 30 40">' +
      '<path d="M15 0C6.7 0 0 6.7 0 15c0 10.8 15 25 15 25s15-14.2 15-25C30 6.7 23.3 0 15 0z" fill="#4d7c0f"/>' +
      '<circle cx="15" cy="15" r="6" fill="#f7f7f5"/><circle cx="15" cy="15" r="3" fill="#84cc16"/>' +
      "</svg>"
  ).replace(/'/g, "%27");

// Snippet JS (para injetar no init do mapa) que devolve o objeto `icon` do pin.
const MAP_PIN_ICON_JS =
  `{url:"${AONDE_MAP_PIN}",scaledSize:new google.maps.Size(30,40),anchor:new google.maps.Point(15,40)}`;

// Link do Google Maps (Maps URLs API — sem chave, sempre funciona e preciso)
// para uma BUSCA de um lugar.
function mapsSearchUrl(q) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}
// ...e para uma ROTA passando por vários pontos (dia do roteiro).
function mapsDirUrl(pontos) {
  const stops = pontos.filter(Boolean).map((p) => encodeURIComponent(p));
  return stops.length ? `https://www.google.com/maps/dir/${stops.join("/")}` : "";
}

// ---------------------------------------------------------------------------
// Utilitarios de texto e seguranca
// ---------------------------------------------------------------------------

// escapeHtml/formatBRL moram em texto.js (ver o porque la: quebra o ciclo
// de importacao com sparkline.js). Reexportados para nao quebrar quem
// ja importava daqui.
export { escapeHtml, formatBRL };

// ---------------------------------------------------------------------------
// Placeholder de imagem (SVG "image-slot") + <img> resiliente
// ---------------------------------------------------------------------------

// Placeholder no estilo image-slot: tint verde, "montanhas" e o rotulo.
function placeholderSvgMarkup(label) {
  const safe = escapeHtml(label || "Aonde");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 260" role="img" aria-label="${safe}">` +
    `<rect width="400" height="260" fill="#f1f8e4"/>` +
    `<rect x="0" y="0" width="400" height="260" fill="none" stroke="#dededa" stroke-width="2"/>` +
    `<path d="M0 200 L110 120 L175 175 L250 105 L400 210 L400 260 L0 260 Z" fill="#a3e635" opacity="0.55"/>` +
    `<path d="M0 225 L90 165 L180 220 L280 150 L400 235 L400 260 L0 260 Z" fill="#84cc16" opacity="0.65"/>` +
    `<circle cx="315" cy="70" r="26" fill="#a3e635"/>` +
    `<text x="200" y="60" text-anchor="middle" font-family="Georgia, serif" font-size="22" fill="#4d7c0f">Aonde</text>` +
    `<text x="200" y="130" text-anchor="middle" font-family="Arial, sans-serif" font-size="19" font-weight="bold" fill="#18181b">${safe}</text>` +
    `</svg>`
  );
}

function placeholderDataUri(label) {
  const encoded = encodeURIComponent(placeholderSvgMarkup(label))
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29");
  return `data:image/svg+xml,${encoded}`;
}

// <img> que cai para o placeholder data-URI se a URL externa falhar.
function resilientImg(url, alt, label, className) {
  const dataUri = placeholderDataUri(label);
  const cls = className ? ` class="${escapeHtml(className)}"` : "";
  return (
    `<img${cls} src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" loading="lazy" ` +
    `onerror="this.onerror=null;this.src='${dataUri}'">`
  );
}

// Bloco de media: <img> resiliente quando ha URL; senao SVG placeholder inline.
function imageBlock(url, alt, label, wrapperClass) {
  const inner = url
    ? resilientImg(url, alt, label, "media-img")
    : `<div class="media-placeholder">${placeholderSvgMarkup(label)}</div>`;
  return `<div class="${escapeHtml(wrapperClass)}">${inner}</div>`;
}

// Credito curto de imagem sobreposto (canto da media).
function mediaCredit(credit, href) {
  if (!credit) return "";
  const texto = escapeHtml(credit);
  const conteudo = href
    ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener nofollow">${texto}</a>`
    : texto;
  return `<span class="media-credit-overlay">${conteudo}</span>`;
}

// Credito de imagem de oferta (thumb_attribution do enrichOfferWithImage).
function offerAttrCredit(attr) {
  if (!attr || typeof attr !== "object") return { credit: "", href: "" };
  const partes = [];
  if (attr.author) partes.push(attr.author);
  if (attr.license) partes.push(attr.license);
  return {
    credit: partes.join(" · "),
    href: attr.sourceUrl || attr.licenseUrl || "",
  };
}

// ---------------------------------------------------------------------------
// Normalizacao de ofertas (dados ao vivo do back-end OU curadoria editorial)
// para o view model unico consumido pelos cards e pela pagina de detalhe.
// ---------------------------------------------------------------------------

function normalizeLiveOffer(offer) {
  if (!offer || typeof offer !== "object") return null;
  const preco = formatBRL(offer.preco_centavos);
  const media =
    typeof offer.media_centavos === "number" &&
    typeof offer.preco_centavos === "number" &&
    offer.media_centavos > offer.preco_centavos
      ? formatBRL(offer.media_centavos)
      : "";
  const economia =
    typeof offer.economia_centavos === "number"
      ? formatBRL(offer.economia_centavos)
      : "";
  const erro = !!offer.is_erro_tarifa;
  const badge = erro
    ? "Erro de tarifa"
    : typeof offer.desconto_pct === "number" && offer.desconto_pct > 0
      ? `${offer.desconto_pct}% abaixo da média`
      : "";
  const attr = offerAttrCredit(offer.thumb_attribution);
  return {
    id: offer.id || "",
    origem: offer.origem || "",
    destino: offer.destino || "",
    cidade: offer.cidade || "",
    local: offer.local || "",
    tipo: offer.tipo || "",
    cia: offer.cia || "",
    preco,
    media,
    economia,
    erro,
    badge,
    datas: offer.datas_sugeridas || offer.datas || "",
    publicado: offer.publicado || "",
    thumbUrl: offer.thumb_url || "",
    provaUrl: offer.prova_url || "",
    credit: attr.credit,
    creditHref: attr.href,
    texto: offer.texto || "",
    dicas: Array.isArray(offer.dicas) ? offer.dicas : [],
    flex: Array.isArray(offer.flex) ? offer.flex : [],
    affiliateUrl: offer.affiliate_url || "",
    href: offer.id ? `/ofertas/${encodeURIComponent(offer.id)}` : "",
  };
}

// Oferta editorial (aondeContent) — precos ja em string.
function normalizeContentOffer(o) {
  if (!o || typeof o !== "object") return null;
  return {
    id: o.id || "",
    origem: o.origem || "",
    destino: o.destino || "",
    cidade: o.cidade || "",
    local: o.local || "",
    tipo: o.tipo || "",
    cia: o.cia || "",
    preco: o.preco || "",
    media: o.media || "",
    economia: o.economia || "",
    erro: !!o.erro,
    badge: o.badge || "",
    datas: o.datas || "",
    publicado: o.publicado || "",
    thumbUrl: o.thumbUrl || "",
    provaUrl: o.provaUrl || o.prova_url || "",
    credit: o.credit || "",
    creditHref: o.creditHref || "",
    texto: o.texto || "",
    dicas: Array.isArray(o.dicas) ? o.dicas : [],
    flex: Array.isArray(o.flex) ? o.flex : [],
    affiliateUrl: o.affiliateUrl || o.affiliate_url || "",
    href: o.id ? `/ofertas/${encodeURIComponent(o.id)}` : "",
  };
}

const badgeClass = (vm) => (vm.erro ? "badge-erro" : "badge-desconto");

// ---------------------------------------------------------------------------
// Card de oferta (feed) — fiel ao card da tela "ofertas" do prototipo.
// ---------------------------------------------------------------------------

function offerCardVM(vm) {
  if (!vm) return "";
  const destinoLabel = vm.cidade || vm.destino || "Destino";
  const alt = `Oferta para ${destinoLabel}`;

  const badge = vm.badge
    ? `<span class="of-badge ${badgeClass(vm)}">${escapeHtml(vm.badge)}</span>`
    : "";
  const publicado = vm.publicado
    ? `<span class="of-publicado">${escapeHtml(vm.publicado)}</span>`
    : "";
  // Codigo IATA sozinho e barreira real: um usuario de 68 anos leu "GRU" e nao
  // soube que era Sao Paulo. Nomeamos a cidade de origem; o destino ja vem no h3.
  const rota = vm.origem
    ? `saindo de ${escapeHtml(cidadeDoIata(vm.origem) || vm.origem)}${cidadeDoIata(vm.origem) ? ` (${escapeHtml(vm.origem)})` : ""}`
    : escapeHtml(destinoLabel);
  const media = vm.media
    ? `<span class="of-de"><s>${escapeHtml(vm.media)}</s></span>`
    : "";
  const preco = vm.preco
    ? `<span class="of-preco">${escapeHtml(vm.preco)}</span>`
    : "";
  const precoRow =
    media || preco
      ? `<div class="of-preco-row">${media}${preco}<span class="of-iv">ida e volta</span></div>`
      : "";
  const ciaDatas = [vm.cia, vm.datas].filter(Boolean).map(escapeHtml).join(" · ");
  const ciaLinha = ciaDatas ? `<span class="of-cia">${ciaDatas}</span>` : "";
  // Dois avaliadores independentes travaram no termo "erro de tarifa" sem
  // saber o que significa. Texto reescrito para ser autoexplicativo no
  // proprio card (o card e um <a>, entao nao da para linkar a FAQ aqui dentro).
  const erroNote = vm.erro
    ? `<span class="of-erro-note">⚠ Preço abaixo do normal por engano da companhia — ela pode corrigir ou cancelar depois da compra. Não reserve hotel/passeio antes de confirmar.</span>`
    : "";
  const wrapTag = vm.href ? "a" : "article";
  const hrefAttr = vm.href ? ` href="${escapeHtml(vm.href)}"` : "";

  return (
    `<${wrapTag} class="of-card${vm.erro ? " of-card--erro" : ""}"${hrefAttr}>` +
    `<div class="of-media">` +
    imageBlock(vm.thumbUrl, alt, destinoLabel, "of-media-inner") +
    badge +
    publicado +
    `</div>` +
    `<div class="of-body">` +
    `<span class="of-rota">${rota}</span>` +
    `<h3 class="of-cidade">${escapeHtml(destinoLabel)}</h3>` +
    precoRow +
    ciaLinha +
    erroNote +
    `<span class="of-cta">Ver oferta →</span>` +
    `</div>` +
    `</${wrapTag}>`
  );
}

/**
 * Card de oferta a partir do shape de PRODUCAO (toOffer + enrichOfferWithImage).
 * Mantido para compatibilidade e usado pela pagina de feed. Campos ausentes
 * somem; nunca vaza "undefined"/"null".
 */
export function renderOfferCard(offer) {
  return offerCardVM(normalizeLiveOffer(offer));
}

// ---------------------------------------------------------------------------
// Guias / roteiros — normalizacao (editorial OU buildItinerary) p/ view model.
// ---------------------------------------------------------------------------

function normalizeGuideDia(dia) {
  const pontos = (Array.isArray(dia.pontos) ? dia.pontos : []).map((p) => ({
    nome: p.nome || "",
    // editorial: `nota`; itinerario: `resumo`.
    nota: p.nota || p.resumo || "",
    foto: p.foto && p.foto.url ? p.foto.url : "",
    fotoCredit:
      p.foto && p.foto.attribution && p.foto.attribution.text
        ? { text: p.foto.attribution.text, uri: p.foto.attribution.uri || "" }
        : null,
    rating: typeof p.rating === "number" ? p.rating : null,
    mapsUri: p.mapsUri || "",
    rich: !!(p.foto || p.resumo || typeof p.rating === "number"),
  }));
  let restauranteNome = "";
  let restauranteNota = "";
  if (dia.restaurante && typeof dia.restaurante === "object") {
    restauranteNome = dia.restaurante.nome || "";
    restauranteNota = dia.restaurante.endereco || "";
  } else if (typeof dia.restaurante === "string") {
    restauranteNome = dia.restaurante;
    restauranteNota = dia.restauranteNota || "";
  }
  return {
    n: dia.n,
    titulo: dia.titulo || (dia.n ? `Dia ${dia.n}` : ""),
    desc: dia.desc || "",
    pontos,
    restauranteNome,
    restauranteNota,
  };
}

// Guia editorial (aondeContent) -> view model.
function guideFromContent(g) {
  return {
    id: g.id || "",
    breadcrumb: g.breadcrumb || g.titulo || "",
    tag: g.tag || "",
    titulo: g.titulo || "",
    intro: g.intro || "",
    hero: { url: g.heroSrc || "", credit: g.heroCredit || "", href: g.heroCreditHref || "", foto: g.heroFoto || g.titulo || "" },
    preco: g.preco || "",
    ctaVoos: g.ctaVoos || "Buscar voos",
    ctaTitulo: g.ctaTitulo || "Pronto para viajar?",
    meta: Array.isArray(g.meta) ? g.meta : [],
    opt: g.opt || null,
    // Conselho de hospedagem proprio do destino (ver lodgingHtml). Sem isto aqui
    // o texto ficava no dado e nunca chegava a tela.
    hospedagem: g.hospedagem || null,
    dias: (Array.isArray(g.dias) ? g.dias : []).map(normalizeGuideDia),
    places: false,
  };
}

// buildItinerary (Google Places) -> view model do mesmo guia.
function guideFromItinerary(it) {
  const o = it && typeof it === "object" ? it : {};
  const destino = o.destination || "Destino";
  const days = Array.isArray(o.days) ? o.days : [];
  const hero = o.hero || null;
  return {
    id: "",
    breadcrumb: destino,
    tag: "Roteiro",
    titulo: destino,
    intro: `Roteiro de ${days.length} dias em ${destino}, montado a partir de pontos turísticos reais — na ordem certa, com um bom restaurante para cada dia.`,
    hero: {
      url: hero && hero.url ? hero.url : "",
      credit: hero && hero.attribution ? hero.attribution.text || "" : "",
      href: hero && hero.attribution ? hero.attribution.uri || "" : "",
      foto: destino,
    },
    preco: "",
    ctaVoos: `Buscar voos para ${destino}`,
    ctaTitulo: `${destino} está te esperando.`,
    meta: [{ k: "Duração", v: `${days.length} dias` }],
    opt: null,
    dias: days.map(normalizeGuideDia),
    places: true,
    attribution: o.attribution || "Dados de lugares: Google",
  };
}

// Estrelas decorativas a partir de uma nota 0-5.
function starsHtml(rating) {
  if (typeof rating !== "number" || Number.isNaN(rating)) return "";
  const cheias = Math.floor(rating);
  const frac = rating - cheias;
  const meia = frac >= 0.25 && frac < 0.75 ? 1 : 0;
  const arred = frac >= 0.75 ? 1 : 0;
  const total = cheias + arred;
  let s = "";
  for (let i = 0; i < total && i < 5; i++) s += "★";
  if (meia && total < 5) s += "⯪";
  while (s.length < 5) s += "☆";
  return `<span class="stars" aria-hidden="true">${s}</span>`;
}

// Ponto de um dia: bullet editorial, ou linha rica (foto/rating/mapa).
function pontoHtml(p) {
  const nome = escapeHtml(p.nome);
  const nota = p.nota ? ` — ${escapeHtml(p.nota)}` : "";
  if (!p.rich) {
    return `<div class="dia-ponto"><span class="dia-bullet">•</span><span><strong>${nome}</strong>${nota}</span></div>`;
  }
  const thumb = p.foto
    ? resilientImg(p.foto, p.nome, p.nome, "dia-ponto-thumb")
    : `<div class="dia-ponto-thumb media-placeholder">${placeholderSvgMarkup(p.nome)}</div>`;
  const meta = [];
  if (typeof p.rating === "number") meta.push(`${starsHtml(p.rating)} ${escapeHtml(p.rating)}`);
  if (p.mapsUri) meta.push(`<a href="${escapeHtml(p.mapsUri)}" target="_blank" rel="noopener nofollow">Ver no mapa</a>`);
  const credit =
    p.fotoCredit && p.fotoCredit.text
      ? `<span class="dia-ponto-credit">Foto: ${
          p.fotoCredit.uri
            ? `<a href="${escapeHtml(p.fotoCredit.uri)}" target="_blank" rel="noopener nofollow">${escapeHtml(p.fotoCredit.text)}</a>`
            : escapeHtml(p.fotoCredit.text)
        }</span>`
      : "";
  return (
    `<div class="dia-ponto dia-ponto--rich">` +
    thumb +
    `<div class="dia-ponto-body"><strong>${nome}</strong>` +
    (p.nota ? `<span class="dia-ponto-nota">${escapeHtml(p.nota)}</span>` : "") +
    (meta.length ? `<span class="dia-ponto-meta">${meta.join(" · ")}</span>` : "") +
    credit +
    `</div></div>`
  );
}

// ---------------------------------------------------------------------------
// Circulo das estacoes — roda de 12 meses (SVG inline, sem rede) colorida por
// preco (barato->caro), com o mes mais barato em destaque, as 4 estacoes do
// Hemisferio Sul rotuladas e a "melhor epoca" no centro. Renderiza em qualquer
// lugar, inclusive offline / no preview.
// ---------------------------------------------------------------------------

function seasonalRingSvg(months, win) {
  const cx = 160, cy = 160, R = 132, r = 86, midR = (R + r) / 2;
  const min = Math.min(...months), max = Math.max(...months);
  const lerp = (a, b, t) => Math.round(a + (b - a) * t);
  const cheap = [234, 244, 214], pricey = [248, 227, 206];
  const brl = (n) => "R$ " + n.toLocaleString("pt-BR");
  const P = (rad, ang) => {
    const a = ((ang - 90) * Math.PI) / 180;
    return [(cx + rad * Math.cos(a)).toFixed(2), (cy + rad * Math.sin(a)).toFixed(2)];
  };

  let segs = "";
  months.forEach((n, i) => {
    const a0 = i * 30, a1 = a0 + 30;
    const t = max === min ? 0 : (n - min) / (max - min);
    const best = n === min;
    const c = [0, 1, 2].map((k) => lerp(cheap[k], pricey[k], t));
    const fill = best ? "#4d7c0f" : `rgb(${c[0]},${c[1]},${c[2]})`;
    const [ox0, oy0] = P(R, a0), [ox1, oy1] = P(R, a1);
    const [ix1, iy1] = P(r, a1), [ix0, iy0] = P(r, a0);
    const d = `M${ox0} ${oy0} A${R} ${R} 0 0 1 ${ox1} ${oy1} L${ix1} ${iy1} A${r} ${r} 0 0 0 ${ix0} ${iy0} Z`;
    const [mx, my] = P(midR, a0 + 15);
    const lbl = best ? "#fbfbfa" : "#3f4a2a";
    segs +=
      `<path d="${d}" fill="${fill}" stroke="#fff" stroke-width="2"><title>${escapeHtml(MONTH_NAMES[i])}: ${escapeHtml(brl(n))}</title></path>` +
      `<text x="${mx}" y="${my}" text-anchor="middle" dominant-baseline="central" font-family="Archivo,sans-serif" font-size="11" font-weight="${best ? 700 : 600}" fill="${lbl}">${escapeHtml(MONTH_NAMES[i])}</text>`;
  });

  // Estacoes (Hemisferio Sul), centradas em Jan/Abr/Jul/Out.
  const seasons = [["Verão", 15], ["Outono", 105], ["Inverno", 195], ["Primavera", 285]];
  const slabels = seasons
    .map(([name, ang]) => {
      const [sx, sy] = P(R + 16, ang);
      return `<text x="${sx}" y="${sy}" text-anchor="middle" dominant-baseline="central" font-family="Archivo,sans-serif" font-size="10" font-weight="700" letter-spacing="1" fill="#8a8a84">${escapeHtml(name)}</text>`;
    })
    .join("");

  const centerPrice = win && win.price ? escapeHtml(win.price) : escapeHtml(brl(min));
  const centerLabel = win && win.label ? escapeHtml(withFutureYear(win.label)) : "";
  return (
    `<svg class="season-ring" viewBox="0 0 320 320" role="img" aria-label="Melhor época para viajar, mês a mês">` +
    segs +
    `<circle cx="160" cy="160" r="${r}" fill="#fff"/>` +
    slabels +
    `<text x="160" y="142" text-anchor="middle" font-family="Archivo,sans-serif" font-size="10" font-weight="700" letter-spacing="1.5" fill="#8a8a84">MELHOR ÉPOCA</text>` +
    `<text x="160" y="168" text-anchor="middle" font-family="Archivo,sans-serif" font-size="26" font-weight="700" fill="#3f6212">${centerPrice}</text>` +
    (centerLabel ? `<text x="160" y="190" text-anchor="middle" font-family="Archivo,sans-serif" font-size="11" fill="#6b6b66">${centerLabel}</text>` : "") +
    `</svg>`
  );
}

// ---------------------------------------------------------------------------
// Datas para viajar — algumas janelas de data (a melhor + os meses mais
// baratos) que o cliente clica para reservar. O CTA leva ao fluxo de voos.
// ---------------------------------------------------------------------------

// Ano futuro para um mês: se o mês já passou neste ano, é o próximo ano. Evita
// datas de viagem "no passado" — nada de ano hardcoded.
function nextYearForMonth(monthIdx) {
  const now = new Date();
  return monthIdx >= now.getMonth() ? now.getFullYear() : now.getFullYear() + 1;
}
// Corrige o ano num rótulo editorial tipo "3 – 10 mar 2026" para o próximo
// ano em que aquele mês ocorre (ou anexa o ano quando não houver).
function withFutureYear(label) {
  if (!label) return label;
  const low = String(label).toLowerCase();
  let mi = -1;
  for (let i = 0; i < MONTH_NAMES.length; i++) {
    if (low.includes(MONTH_NAMES[i].toLowerCase())) { mi = i; break; }
  }
  if (mi < 0) return label;
  const y = String(nextYearForMonth(mi));
  return /20\d\d/.test(label) ? label.replace(/20\d\d/, y) : `${label} ${y}`;
}

function travelDateOptions(opt) {
  if (!opt || !Array.isArray(opt.months) || !opt.months.length) return [];
  const months = opt.months;
  const brl = (n) => "R$ " + n.toLocaleString("pt-BR");
  const idx = months.map((n, i) => [n, i]).sort((a, b) => a[0] - b[0]);
  const bestI = idx[0][1];
  const opts = [];
  if (opt.window && opt.window.label) {
    opts.push({
      label: withFutureYear(opt.window.label),
      price: opt.window.price || brl(months[bestI]),
      sub: opt.window.save ? `economize ${opt.window.save} vs. a média` : "melhor preço do ano",
      best: true,
    });
  } else {
    opts.push({ label: `${MONTH_NAMES[bestI]} ${nextYearForMonth(bestI)}`, price: brl(months[bestI]), sub: "mês mais barato", best: true });
  }
  for (const [n, i] of idx) {
    if (i === bestI) continue;
    opts.push({ label: `${MONTH_NAMES[i]} ${nextYearForMonth(i)}`, price: brl(n), sub: "boa janela de preço", best: false });
    if (opts.length >= 3) break;
  }
  return opts;
}

// Link para a busca de voos JÁ com o destino do roteiro (o servidor extrai o
// IATA de destName, ex.: "Salvador (SSA)" -> SSA).
function guideResultsHref(opt) {
  const dest = opt && opt.destName ? opt.destName : "";
  return dest ? `/resultados?destino=${encodeURIComponent(dest)}` : "/resultados";
}

// Seção "Onde ficar" do roteiro — usa a "Base do roteiro" que cada guia já traz
// no meta, com um CTA de busca de hospedagem no parceiro (Hotellook, do mesmo
// ecossistema TravelPayouts dos voos). Honesto: a reserva é feita no parceiro.
function guideBaseArea(g) {
  const m = (g.meta || []).find((x) => /base/i.test(x.k));
  return m ? m.v : "";
}
function lodgingHtml(g) {
  const cidade = g.breadcrumb || g.titulo || "seu destino";
  const base = guideBaseArea(g);
  const busca = hotellookSearch(cidade);
  return (
    `<section class="wrap section">` +
    `<div class="section-head section-head--tight"><h2>Onde ficar</h2>` +
    `<span class="dt-note">Hospedagem é reservada no parceiro — sem custo extra para você.</span></div>` +
    `<div class="lodging">` +
    // Cada roteiro tem conselho de hospedagem PROPRIO (hospedagem.texto), escrito
    // a partir do itinerario daquele destino. A frase-molde abaixo e so fallback:
    // uma leitora percebeu que ela se repetia identica nos 22 roteiros, mudando
    // apenas o nome do bairro, e que isso "quebra a magica de alguem esteve la".
    (g.hospedagem && g.hospedagem.texto
      ? `<p class="lodging-base">${escapeHtml(g.hospedagem.texto)}</p>`
      : base
        ? `<p class="lodging-base">Fique em <strong>${escapeHtml(base)}</strong> — a base que deixa o roteiro todo a curta distância, com boas opções de pousada e hotel.</p>`
        : `<p class="lodging-base">Escolha uma base central para ficar perto dos pontos deste roteiro.</p>`) +
    `<a class="btn btn-green" href="${escapeHtml(busca)}" target="_blank" rel="noopener sponsored">Ver hospedagem em ${escapeHtml(cidade)} →</a>` +
    `</div>` +
    `</section>`
  );
}

function travelDatesHtml(g) {
  const opts = travelDateOptions(g.opt);
  if (!opts.length) return "";
  const dest = (g.opt && g.opt.destName) || g.titulo || "";
  const cards = opts
    .map((o) => {
      const href = `/resultados?destino=${encodeURIComponent(dest)}&periodo=${encodeURIComponent(o.label)}`;
      return (
        `<div class="dt-card${o.best ? " dt-card--best" : ""}">` +
        (o.best ? `<span class="dt-flag">melhor preço</span>` : "") +
        `<span class="dt-when">${escapeHtml(o.label)}</span>` +
        `<span class="dt-price">${escapeHtml(o.price)}</span>` +
        `<span class="dt-sub">${escapeHtml(o.sub)} · 12x sem juros</span>` +
        `<a class="btn ${o.best ? "btn-green" : "btn-dark"} dt-cta" href="${escapeHtml(href)}">Reservar estas datas →</a>` +
        `</div>`
      );
    })
    .join("");
  return (
    `<section class="wrap section">` +
    `<div class="section-head section-head--tight"><h2>Datas para viajar</h2>` +
    `<span class="dt-note">Escolha uma janela e reserve — 12x sem juros ou 5% no Pix.</span></div>` +
    `<div class="dt-grid">${cards}</div>` +
    `</section>`
  );
}

// Mini-mapa reutilizável (Google Maps JS, estilo/pin da marca, 1 pin). Sem
// chave OU sem coordenada, cai para um placeholder + link (o `fallbackHref`).
// Retorna { html, script, loader }.
function miniMapSection({ domId, callback, title, caption, coords, label, apiKey, fallbackHref, fallbackText }) {
  const hasKey = typeof apiKey === "string" && apiKey.trim() !== "";
  const hasCoords = coords && typeof coords.lat === "number" && typeof coords.lng === "number";
  const head =
    `<section class="wrap section"><div class="section-head section-head--tight"><h2>${escapeHtml(title)}</h2>` +
    (caption ? `<span class="dt-note">${escapeHtml(caption)}</span>` : "") +
    `</div>`;
  if (hasKey && hasCoords) {
    return {
      html: head + `<div id="${domId}" class="guia-map" role="application" aria-label="Mapa de ${escapeHtml(label)}"></div></section>`,
      script:
        `function ${callback}(){var m=new google.maps.Map(document.getElementById("${domId}"),` +
        `{center:{lat:${coords.lat},lng:${coords.lng}},zoom:9,mapTypeControl:false,streetViewControl:false,fullscreenControl:false,styles:${AONDE_MAP_STYLE}});` +
        `new google.maps.Marker({position:{lat:${coords.lat},lng:${coords.lng}},map:m,title:${jsonForScript(label)},icon:${MAP_PIN_ICON_JS}});}`,
      loader: `<script async src="https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
        apiKey.trim()
      )}&callback=${callback}&loading=async"></script>`,
    };
  }
  const ext = /^https?:/.test(fallbackHref) ? ` target="_blank" rel="noopener"` : "";
  return {
    html:
      head +
      `<div class="guia-map guia-map--placeholder"><div class="media-placeholder">${placeholderSvgMarkup(label)}</div>` +
      `<a class="btn btn-green guia-map-link" href="${escapeHtml(fallbackHref)}"${ext}>${escapeHtml(fallbackText)} →</a></div></section>`,
    script: "",
    loader: "",
  };
}

// Mini-mapa do roteiro.
function guideMiniMap(g, apiKey) {
  const co = g.id ? GUIDE_COORDS[g.id] : null;
  if (!co) return { html: "", script: "", loader: "" };
  return miniMapSection({
    domId: "guia-map",
    callback: "aondeGuiaMap",
    title: "Onde fica",
    caption: "Explore o destino no mapa — e abra cada dia do roteiro no Google Maps abaixo.",
    coords: co,
    label: g.titulo,
    apiKey,
    fallbackHref: "/mapa",
    fallbackText: "Ver no mapa-múndi",
  });
}

// ---------------------------------------------------------------------------
// Otimizador de datas — o circulo das estacoes + a melhor janela + comparacao.
// ---------------------------------------------------------------------------

function optimizerHtml(opt) {
  if (!opt || !Array.isArray(opt.months) || !opt.months.length) return "";
  const months = opt.months;
  const ring = seasonalRingSvg(months, opt.window || {});
  const win = opt.window || {};
  const sources = Array.isArray(opt.sources) ? opt.sources : [];
  const sourcesHtml = sources
    .map((s) => {
      const best = !!s.best;
      return (
        `<div class="opt-src${best ? " opt-src--best" : ""}">` +
        `<div><span class="opt-src-name">${escapeHtml(s.name)}</span>` +
        (s.note ? `<span class="opt-src-note">${escapeHtml(s.note)}</span>` : "") +
        `</div><span class="opt-src-price">${escapeHtml(s.price)}</span>` +
        `</div>`
      );
    })
    .join("");

  const destName = opt.destName || "o destino";

  return (
    `<section class="wrap opt">` +
    `<div class="opt-head">` +
    `<div><p class="eyebrow eyebrow--green">Otimizador de datas</p>` +
    `<h2>Quando ir e por quanto</h2></div>` +
    `<p class="opt-sub">Monitoramos as tarifas GRU → ${escapeHtml(destName)} todos os dias e comparamos com Google Flights, Kayak e Skyscanner. O mês em verde é o mais barato do ano.</p>` +
    `</div>` +
    `<div class="opt-grid-wrap">` +
    `<div class="opt-panel">` +
    `<div class="opt-panel-head"><span>Preço por mês · ida e volta</span>` +
    `<span class="opt-legend">mais barato <i class="opt-sw" style="background:#4d7c0f"></i><i class="opt-sw" style="background:#f8e3ce"></i> mais caro</span></div>` +
    `<div class="opt-ring-wrap">${ring}</div>` +
    `<p class="opt-foot">Cada fatia é um mês; quanto mais verde, mais barato. Valores por pessoa, classe econômica, atualizados nas últimas 24h.</p>` +
    `</div>` +
    `<div class="opt-side">` +
    (win.label
      ? `<div class="opt-window"><span class="eyebrow eyebrow--lime">Melhor janela para viajar</span>` +
        `<h3>${escapeHtml(withFutureYear(win.label))}</h3>` +
        `<div class="opt-window-price"><span>${escapeHtml(win.price || "")}</span><small>ida e volta</small></div>` +
        (win.save ? `<span class="opt-save">economize ${escapeHtml(win.save)} vs. a média</span>` : "") +
        (win.note ? `<p>${escapeHtml(win.note)}</p>` : "") +
        `<a class="btn btn-lime" href="${escapeHtml(guideResultsHref(opt))}">Ver voos nessas datas →</a></div>`
      : "") +
    (sourcesHtml
      ? `<div class="opt-sources"><span class="opt-sources-title">Comparado com outros sites</span>` +
        `<div class="opt-sources-list">${sourcesHtml}</div>` +
        `<p class="opt-foot opt-foot--disclaimer">Valores de referência coletados manualmente pela curadoria — podem não refletir o preço exibido agora nesses sites. Não somos afiliados a eles; a comparação é só para contexto. No Aonde o valor já inclui 12x sem juros e 5% no Pix.</p></div>`
      : "") +
    `</div>` +
    `</div>` +
    `</section>`
  );
}

// ---------------------------------------------------------------------------
// Chrome: header, footer, documento
// ---------------------------------------------------------------------------

/**
 * Aviaozinho da marca: decola a esquerda do "a" e pousa no ponto lime depois
 * do "e" (o ponto ja existia na marca do prototipo). E puramente decorativo —
 * aria-hidden, sem texto — e a animacao mora no CSS (.brand-plane), respeitando
 * prefers-reduced-motion.
 */
function brandPlaneSvg() {
  return (
    `<span class="brand-plane" aria-hidden="true">` +
    `<svg viewBox="0 0 24 24" focusable="false"><path d="M2.2 20.6 22 12 2.2 3.4l0 6.9L15 12 2.2 13.7z"/></svg>` +
    `</span>`
  );
}

function siteHeader() {
  return (
    `<header class="site-header">` +
    `<div class="wrap site-header-in">` +
    `<a class="brand" href="/">${brandPlaneSvg()}<span class="brand-word">aonde</span><span class="brand-dot"></span></a>` +
    `<nav class="site-nav">` +
    // "Passagens" e "Ofertas" pareciam a mesma coisa para quem chega pela
    // primeira vez (achado de teste de navegabilidade). title="" da a pista
    // sem precisar de subtitulo visual permanente no menu.
    `<a href="/resultados" title="Buscar um voo específico, por origem e destino">Passagens</a>` +
    `<a href="/hoje">A escolha do dia <span class="nav-pill">NOVO</span></a>` +
    `<a href="/ofertas" title="Ver os achados de passagem já conferidos pela curadoria">Ofertas</a>` +
    // "Hotéis" sai do site (Hotellook) — o icone deixa isso visivel antes do
    // clique, nao so depois de abrir a aba nova.
    `<a href="${escapeHtml(hotellookSearch())}" target="_blank" rel="noopener sponsored" title="Abre o site do parceiro Hotellook em nova aba">Hotéis <span class="nav-ext" aria-hidden="true">↗</span></a>` +
    `<a href="/guias">Guias de destino</a>` +
    `<a href="/mapa">Mapa</a>` +
    `</nav>` +
    `<div class="site-header-right">` +
    (() => {
      const wa = waHref("Oi! Vim do site do Aonde e preciso de ajuda.");
      const href = wa || telHref();
      const tgt = wa ? ` target="_blank" rel="noopener"` : "";
      const label = wa ? "Atendimento · WhatsApp" : "Atendimento";
      return (
        `<a class="site-atend" href="${escapeHtml(href)}"${tgt}>` +
        `<span>${label}</span><strong>${escapeHtml(telLabel())}</strong></a>`
      );
    })() +
    // Alternador de tema: comeca neutro no servidor (nao sabemos ainda a
    // preferencia do sistema nem o que a pessoa escolheu antes) — o
    // enhancementScript() acerta icone/rotulo/estado assim que a pagina carrega
    // e guarda a escolha em localStorage. Sem JS, o botao so nao faz nada; o
    // tema escuro pelo sistema operacional continua funcionando via CSS puro.
    `<button type="button" class="tema-toggle" data-tema-toggle aria-pressed="false" aria-label="Alternar tema claro/escuro">` +
    `<span class="tema-toggle-ico" aria-hidden="true" data-tema-toggle-ico>🌙</span>` +
    `<span data-tema-toggle-label>Escuro</span>` +
    `</button>` +
    `<a class="btn btn-dark" href="/alertas">Meus alertas</a>` +
    `</div>` +
    `</div>` +
    `</header>`
  );
}

// Rodape do prototipo + nota de afiliado (LGPD) e, em roteiros, a atribuicao
// obrigatoria de lugares/fotos.
function siteFooter({ places, attribution } = {}) {
  const placesNote = places
    ? `<p class="foot-places"><strong>${escapeHtml(attribution || "Dados de lugares: Google")}.</strong> Fotos e créditos indicados em cada card.</p>`
    : "";
  return (
    `<footer class="site-footer">` +
    `<div class="wrap foot-grid">` +
    `<div class="foot-brand"><div class="brand brand--foot">${brandPlaneSvg()}<span class="brand-word">aonde</span><span class="brand-dot"></span></div>` +
    `<p>Viagens pelo Brasil e América do Sul, do jeito que você gosta de viajar.</p></div>` +
    `<div class="foot-col"><span class="foot-title">Reservas</span>` +
    `<a href="/resultados">Passagens aéreas</a>` +
    // "Hotéis" vai para a busca real de hospedagem (Hotellook), a mesma do
    // menu do topo — nunca para /ofertas, que e lista de PASSAGENS. Carro e
    // seguro ainda nao tem parceiro: marcados "em breve" e SEM link, para nao
    // levar a lugar nenhum (mesmo padrao visual/semantico do extras da home).
    `<a href="${escapeHtml(hotellookSearch())}" target="_blank" rel="noopener sponsored">Hotéis</a>` +
    `<span class="foot-link--soon" aria-disabled="true" title="Em breve">Aluguel de carros</span>` +
    `<span class="foot-link--soon" aria-disabled="true" title="Em breve">Seguro viagem</span>` +
    `</div>` +
    `<div class="foot-col"><span class="foot-title">Conteúdo</span>` +
    `<a href="/guias">Guias de destino</a><a href="/#estilos">Dicas de viagem</a><a href="/#roteiros">Revista Aonde</a></div>` +
    `<div class="foot-col"><span class="foot-title">Atendimento</span>` +
    (() => {
      const wa = waHref("Oi! Vim do site do Aonde e preciso de ajuda.");
      return wa
        ? `<a href="${escapeHtml(wa)}" target="_blank" rel="noopener">WhatsApp: ${escapeHtml(telLabel())}</a>`
        : `<a href="${telHref()}">Atendimento: ${escapeHtml(telLabel())}</a>`;
    })() +
    `<a href="/ajuda">Central de ajuda</a><a href="/cancelamentos">Trocas e cancelamentos</a></div>` +
    `</div>` +
    `<div class="foot-bar"><div class="wrap foot-bar-in">` +
    placesNote +
    `<p class="foot-lgpd">Alguns links são de parceiros afiliados: se você comprar por eles, podemos receber uma comissão, <strong>sem custo extra para você</strong>. Isso ajuda a manter o Aonde no ar. Preços e disponibilidade mudam sem aviso — confira sempre no site do parceiro.</p>` +
    `<p class="foot-legal">© 2026 Aonde Viagens Ltda · Reservas operadas em parceria com plataformas certificadas de turismo.</p>` +
    `</div></div>` +
    `</footer>`
  );
}

// Favicon inline (o pin verde da marca) — sem requisição de rede.
const FAVICON_SVG =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 40"><path d="M15 0C6.7 0 0 6.7 0 15c0 10.8 15 25 15 25s15-14.2 15-25C30 6.7 23.3 0 15 0z" fill="#4d7c0f"/><circle cx="15" cy="15" r="6" fill="#f7f7f5"/><circle cx="15" cy="15" r="3" fill="#84cc16"/></svg>'
  ).replace(/'/g, "%27");

const DEFAULT_DESCRIPTION =
  "Aonde — achados de passagem abaixo da média, roteiros de 5 dias dia a dia e alertas de preço grátis. Compare voos, hotéis e experiências pelo Brasil e América do Sul.";

// Imagem padrao de compartilhamento: a foto do primeiro slide do hero (Wikimedia,
// URL absoluta e publica — requisito do og:image, que nao aceita data: URI).
// Paginas com foto propria (roteiro, oferta) passam a sua.
const DEFAULT_SHARE_IMAGE = (HERO_SLIDES[0] && HERO_SLIDES[0].src) || "";

// Emite um <script type="application/ld+json"> por objeto em `jsonld`
// (array de objetos JS schema.org). Ausente/vazio => "". Reusa jsonForScript
// para a mesma embutição SEGURA usada nos scripts inline (neutraliza
// "</script>" e U+2028/U+2029 — um titulo/nome com "</script>" nao quebra o
// bloco nem escapa para o HTML ao redor).
function jsonLdTags(jsonld) {
  if (!Array.isArray(jsonld)) return "";
  return jsonld
    .filter(Boolean)
    .map((obj) => `<script type="application/ld+json">${jsonForScript(obj)}</script>`)
    .join("\n");
}

// ---------------------------------------------------------------------------
// CSS: inline (default) ou arquivo externo cacheavel.
//
// O CSS tem ~39 KB e ia INLINE em toda pagina — quem lia 5 roteiros baixava o
// mesmo CSS 5 vezes. Em arquivo externo com hash no nome, o navegador baixa uma
// vez e reusa (Cache-Control immutable), e o hash troca sozinho quando o CSS
// muda, entao nao existe cache velho.
//
// O renderer sempre emite o CSS INLINE — inclusive porque as amostras de
// scripts/render-samples.js e o preview sao abertos direto do disco (file://),
// onde um <link> para /assets nao resolveria. Quem troca pelo <link> e o
// SERVIDOR, na saida (ver externalizeStyles em src/server.js), justamente por
// ser quem serve o arquivo. Fazer assim, e nao com um "modo" global mutavel no
// renderer, evita que o estado de um teste vaze para o seguinte.
//
// Contrapartida honesta: com CSS externo a PRIMEIRA visita paga um round-trip a
// mais antes de pintar. Compensa a partir da segunda pagina — e este e um site
// de conteudo, feito para navegar entre roteiros.

let _styleHashCache = null;

/** Hash curto do CSS atual — vira o nome do arquivo e invalida o cache sozinho. */
export function styleAssetHash() {
  if (_styleHashCache === null) {
    _styleHashCache = createHash("sha256").update(pageStyles()).digest("hex").slice(0, 12);
  }
  return _styleHashCache;
}

/** Caminho do CSS servido pelo servidor (com hash). */
export function styleAssetPath() {
  return `/assets/estilo-${styleAssetHash()}.css`;
}

/** O CSS cru, para o servidor responder na rota do asset. */
export function pageStylesCss() {
  return pageStyles();
}

/** Marcador que o servidor troca pelo <link> do CSS externo. */
export const STYLE_TAG_RE = /<style>[\s\S]*?<\/style>/;

function styleTag() {
  return `<style>${pageStyles()}</style>`;
}

// Script BLOQUEANTE, minusculo, executado antes de qualquer CSS: aplica a
// escolha de tema SALVA (se houver) no <html> antes da primeira pintura, para
// nao piscar claro->escuro quando a pessoa ja escolheu escuro antes. Sem
// escolha salva, o CSS puro (prefers-color-scheme) ja resolve sozinho —
// este script so entra em cena quando ha uma preferencia EXPLICITA gravada.
const THEME_INIT_SCRIPT =
  `(function(){try{var t=localStorage.getItem('aonde-tema');` +
  `if(t==='escuro'||t==='claro'){document.documentElement.setAttribute('data-tema',t);}` +
  `}catch(e){}})();`;

/** URL absoluta a partir de um caminho do site ("/guias/rio" -> "https://.../guias/rio"). */
function absoluteUrl(path) {
  const base = getConfig().siteUrl;
  if (!path) return base;
  if (/^https?:\/\//i.test(path)) return path;
  return base + (path.startsWith("/") ? path : "/" + path);
}

/**
 * @param {object}  p
 * @param {string} [p.canonical] caminho canonico da pagina ("/ofertas"). Sem
 *   querystring: /ofertas?origem=GRU e /ofertas sao a MESMA pagina para busca,
 *   e sem isso o Google divide a forca entre as variantes.
 * @param {string} [p.image] imagem de compartilhamento (URL absoluta). Sem ela,
 *   link colado no WhatsApp aparece como retangulo de texto — num site de
 *   viagem isso e perda direta.
 */
function htmlDocument({ title, body, script, description, jsonld, canonical, image }) {
  const desc = description || DEFAULT_DESCRIPTION;
  const t = escapeHtml(title);
  const d = escapeHtml(desc);
  const img = escapeHtml(absoluteUrl(image || DEFAULT_SHARE_IMAGE));
  const canonicalTag = canonical
    ? `<link rel="canonical" href="${escapeHtml(absoluteUrl(canonical))}">\n<meta property="og:url" content="${escapeHtml(absoluteUrl(canonical))}">\n`
    : "";
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script>${THEME_INIT_SCRIPT}</script>
<title>${t}</title>
<meta name="description" content="${d}">
<link rel="icon" href="${FAVICON_SVG}">
${canonicalTag}
<meta property="og:type" content="website">
<meta property="og:site_name" content="Aonde">
<meta property="og:title" content="${t}">
<meta property="og:description" content="${d}">
<meta property="og:image" content="${img}">
<meta property="og:locale" content="pt_BR">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${img}">
<meta name="twitter:title" content="${t}">
<meta name="twitter:description" content="${d}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet">
${styleTag()}
${jsonLdTags(jsonld)}
</head>
<body>
${seasons3dHtml()}
<a class="skip-link" href="#conteudo">Pular para o conteúdo</a>
${siteHeader()}
${body}
${script ? `<script>${script}</script>` : ""}
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// HOME
// ---------------------------------------------------------------------------

function heroHtml(slides) {
  const layers = slides
    .map(
      (s, i) =>
        `<div class="hero-bg${i === 0 ? " is-active" : ""}" data-hero="${i}">` +
        (s.src
          ? resilientImg(s.src, s.legenda || s.label, s.foto, "media-img")
          : `<div class="media-placeholder">${placeholderSvgMarkup(s.foto)}</div>`) +
        `</div>`
    )
    .join("");
  const tabs = slides
    .map(
      (s, i) =>
        `<button class="hero-tab${i === 0 ? " is-active" : ""}" data-hero-tab="${i}">` +
        `<span>${escapeHtml(s.label)}</span><span class="hero-bar"></span></button>`
    )
    .join("");
  const legenda = slides.length ? escapeHtml(slides[0].legenda) : "";
  return (
    `<section class="hero">` +
    `<div class="hero-bgs">${layers}</div>` +
    `<div class="hero-scrim"></div>` +
    `<div class="wrap hero-in">` +
    `<p class="eyebrow eyebrow--lime">Passagens · Hotéis · Experiências</p>` +
    `<h1 class="hero-title">Aonde você quer <em>estar</em> na próxima semana?</h1>` +
    `<p class="hero-sub">Compare voos, hotéis e experiências pelo Brasil e América do Sul — com parcelamento em até 12x e pagamento por Pix.</p>` +
    `<div class="hero-tabs">${tabs}` +
    `<button type="button" class="hero-pause" data-hero-pause aria-pressed="false" ` +
    `aria-label="Pausar troca automática de fotos">Pausar</button>` +
    `</div>` +
    `</div>` +
    `<div class="hero-legenda" data-hero-legenda>${legenda}</div>` +
    `</section>`
  );
}

function searchCardHtml() {
  const field = (label, name, value) =>
    `<label class="sc-field"><span>${escapeHtml(label)}</span>` +
    `<input name="${escapeHtml(name)}" value="${escapeHtml(value)}"></label>`;
  // Seletor numerico em vez de texto livre: uma mae de familia parou aqui
  // porque so havia "2 adultos" e ela viaja com dois filhos — "se nao perguntam
  // a idade dos meus filhos, nao confio que o preco final vai bater". Crianca
  // tem tarifa e regra propria, entao a conta precisa nascer certa.
  const numField = (label, name, max, selecionado, dica) => {
    const opts = Array.from({ length: max + 1 }, (_, n) => n)
      .filter((n) => (name === "adultos" ? n >= 1 : true))
      .map((n) => `<option value="${n}"${n === selecionado ? " selected" : ""}>${n}</option>`)
      .join("");
    return (
      `<label class="sc-field sc-field--num"><span>${escapeHtml(label)}</span>` +
      `<select name="${escapeHtml(name)}">${opts}</select>` +
      (dica ? `<small class="sc-hint">${escapeHtml(dica)}</small>` : "") +
      `</label>`
    );
  };
  return (
    `<section class="wrap search-wrap">` +
    `<form class="search-card" action="/resultados" method="get">` +
    `<div class="sc-tabs">` +
    `<span class="sc-tab is-active">Passagens</span>` +
    `<span class="sc-tab sc-tab--soon" aria-disabled="true" title="Em breve">Hotéis</span>` +
    `<span class="sc-tab sc-tab--soon" aria-disabled="true" title="Em breve">Carros</span>` +
    `<span class="sc-tab sc-tab--soon" aria-disabled="true" title="Em breve">Experiências</span>` +
    `</div>` +
    // Aviso ANTES da busca, nao depois: sem isso, a pessoa preenche tudo,
    // clica em "Buscar voos" e SO ENTAO descobre nos resultados que o preco
    // nao e real. Aqui, em texto normal (nao letra miuda), ela ja sabe o que
    // vai ver antes de gastar o clique.
    // Texto reescrito: uma pessoa de primeira viagem leu a versao anterior
    // ("a busca... ainda nao existe aqui") e achou que o site estava quebrado.
    // A informacao e a mesma (nao ha preco em tempo real, os voos sao
    // exemplo) mas comeca pelo que JA funciona, com um rotulo curto antes do
    // texto para dar hierarquia visual sem esconder nada em letra miuda.
    `<p class="sc-notice"><strong class="sc-notice-tag">Como funciona por aqui:</strong> os voos que aparecem abaixo são <strong>exemplos</strong>, para você ver como fica — ainda não temos busca de preço em tempo real. O valor certo você sempre confere no site do parceiro.</p>` +
    `<div class="sc-grid">` +
    field("Origem", "origem", "São Paulo · GRU") +
    field("Destino", "destino", "Recife · REC") +
    field("Ida", "ida", "12 ago 2026") +
    field("Volta", "volta", "19 ago 2026") +
    numField("Adultos", "adultos", 9, 2) +
    numField("Crianças", "criancas", 8, 0, "2 a 11 anos") +
    numField("Bebês", "bebes", 4, 0, "até 2 anos, no colo") +
    `<button class="btn btn-green sc-submit" type="submit">Buscar voos</button>` +
    `</div>` +
    `</form>` +
    `<div class="search-perks">` +
    `<span><i></i>Em até 12x sem juros no cartão</span>` +
    `<span><i></i>5% de desconto no Pix</span>` +
    `<span><i></i>Atendimento humano por WhatsApp, todos os dias</span>` +
    `</div>` +
    `</section>`
  );
}

function homeOffersHtml(offers) {
  const cards = offers
    .map((vm) => {
      const destinoLabel = vm.cidade || vm.destino || "Destino";
      const badge = vm.badge
        ? `<span class="of-badge ${badgeClass(vm)}">${escapeHtml(vm.badge)}</span>`
        : "";
      const media = vm.media ? `<span class="of-de"><s>${escapeHtml(vm.media)}</s></span>` : "";
      const preco = vm.preco ? `<span class="of-preco of-preco--sm">${escapeHtml(vm.preco)}</span>` : "";
      const rota = vm.origem
        ? `saindo de ${escapeHtml(cidadeDoIata(vm.origem) || vm.origem)}${cidadeDoIata(vm.origem) ? ` (${escapeHtml(vm.origem)})` : ""}`
        : escapeHtml(vm.tipo || "");
      return (
        `<a class="of-card${vm.erro ? " of-card--erro" : ""}" href="${escapeHtml(vm.href || "/ofertas")}">` +
        `<div class="of-media">` +
        imageBlock(vm.thumbUrl, `Oferta para ${destinoLabel}`, destinoLabel, "of-media-inner") +
        badge +
        `</div>` +
        `<div class="of-body">` +
        (rota ? `<span class="of-rota">${rota}</span>` : "") +
        `<h3 class="of-cidade">${escapeHtml(destinoLabel)}</h3>` +
        (vm.datas ? `<span class="of-periodo">${escapeHtml(vm.datas)}</span>` : "") +
        `<div class="of-preco-row">${media}${preco}</div>` +
        (vm.erro ? `<span class="of-erro-note">⚠ Preço abaixo do normal por engano da companhia — ela pode corrigir ou cancelar depois da compra. Não reserve hotel/passeio antes de confirmar.</span>` : "") +
        `<span class="of-cta">Ver voos →</span>` +
        `</div>` +
        `</a>`
      );
    })
    .join("");
  return (
    `<section class="wrap section" id="ofertas">` +
    `<div class="section-head">` +
    `<div><h2>Ofertas da semana</h2>` +
    `<p>Tarifas negociadas com as companhias — válidas até <strong>domingo, 23h59</strong>, ou enquanto durarem os assentos.</p></div>` +
    `<a class="section-link" href="/ofertas">Ver todas as ofertas →</a>` +
    `</div>` +
    `<div class="of-grid">${cards}</div>` +
    `</section>`
  );
}

function stylesSectionHtml(trips) {
  const items = trips
    .map((t, i) => {
      const chips = (t.chips || [])
        .map((c) => `<span class="chip">${escapeHtml(c)}</span>`)
        .join("");
      return (
        `<div class="style-item${i === 0 ? " is-active" : ""}">` +
        `<span class="style-num">${escapeHtml(t.numero)}</span>` +
        `<h3>${escapeHtml(t.titulo)}</h3>` +
        `<p>${escapeHtml(t.desc)}</p>` +
        `<div class="chips">${chips}</div>` +
        `<p class="style-cta"><a href="/ofertas">${escapeHtml(t.cta)} →</a></p>` +
        `</div>`
      );
    })
    .join("");
  const imgs = trips
    .map((t, i) => {
      const media = t.src
        ? resilientImg(t.src, t.legenda || t.titulo, t.foto, "media-img")
        : `<div class="media-placeholder">${placeholderSvgMarkup(t.foto)}</div>`;
      return (
        `<div class="style-img${i === 0 ? " is-active" : ""}">` +
        media +
        `<span class="style-legenda">${escapeHtml(t.legenda)}</span>` +
        `</div>`
      );
    })
    .join("");
  return (
    `<section class="wrap section" id="estilos">` +
    `<p class="eyebrow eyebrow--green">Para cada estilo de viagem</p>` +
    `<h2 class="section-title-wide">Praia, história ou neve — a imagem muda, o cuidado é o mesmo.</h2>` +
    `<div class="styles-grid">` +
    `<div class="styles-list">${items}</div>` +
    `<div class="styles-imgs">${imgs}</div>` +
    `</div>` +
    `</section>`
  );
}

// ---------------------------------------------------------------------------
// CENARIO 3D DAS ESTACOES — fundo fixo de toda a pagina.
//
// Quatro cenas (verao, outono, inverno, primavera) empilhadas, cada uma com
// esferas de luz em profundidades diferentes (translateZ) dentro da sua propria
// perspectiva. O palco balanca devagar em 3D, entao as esferas se deslocam uma
// em relacao a outra — e isso, e nao um desenho, que da a sensacao de espaco.
//
// Tudo e gradiente radial: nada de filter:blur (caro), canvas ou WebGL. Roda no
// compositor (so transform/opacity) e a CSP do site nem precisaria ser afrouxada.
//
// O ciclo COMECA na estacao real do Brasil (hemisferio sul) e segue a ordem do
// ano a partir dela.
// ---------------------------------------------------------------------------

const S3_PERSPECTIVE = 900; // px — precisa bater com o CSS de .s3-season
const S3_CICLO = 72; // s — volta inteira pelas 4 estacoes
const S3_PASSO = 18; // s — tempo de cada estacao em cena

/** Escala que compensa o encolhimento causado pela perspectiva. */
function s3Scale(z) {
  return Number(((S3_PERSPECTIVE - z) / S3_PERSPECTIVE).toFixed(3));
}

// Paletas propositalmente dessaturadas: o fundo e um clima, nao um desenho.
// Verde/lime sao os da marca; as demais cores giram em volta deles.
const SEASONS_3D = [
  {
    id: "verao",
    sol: { top: "14%", left: "76%", cor: "rgba(253,224,71,.80)", tam: "18vw" },
    horizonte: "rgba(163,230,53,.26)",
    orbes: [
      { cor: "rgba(250,204,21,.92)", x: "8%",  y: "26%", tam: "52vw", z: -320 },
      { cor: "rgba(132,204,22,.80)", x: "93%", y: "70%", tam: "46vw", z: -120 },
      { cor: "rgba(56,189,248,.58)", x: "50%", y: "-6%", tam: "64vw", z: -520 },
    ],
  },
  {
    id: "outono",
    sol: { top: "26%", left: "70%", cor: "rgba(251,191,36,.70)", tam: "16vw" },
    horizonte: "rgba(180,83,9,.24)",
    orbes: [
      { cor: "rgba(234,138,54,.62)", x: "7%",  y: "28%", tam: "54vw", z: -300 },
      { cor: "rgba(202,138,4,.56)", x: "94%", y: "68%", tam: "46vw", z: -110 },
      { cor: "rgba(146,64,14,.38)", x: "50%", y: "-8%", tam: "62vw", z: -500 },
    ],
  },
  {
    id: "inverno",
    sol: { top: "34%", left: "64%", cor: "rgba(226,232,240,.72)", tam: "14vw" },
    horizonte: "rgba(94,151,190,.22)",
    orbes: [
      { cor: "rgba(129,187,224,.96)", x: "8%",  y: "27%", tam: "54vw", z: -340 },
      { cor: "rgba(186,203,224,.92)", x: "93%", y: "69%", tam: "46vw", z: -130 },
      { cor: "rgba(94,151,190,.70)", x: "50%", y: "-7%", tam: "64vw", z: -520 },
    ],
  },
  {
    id: "primavera",
    sol: { top: "20%", left: "72%", cor: "rgba(254,215,226,.76)", tam: "17vw" },
    horizonte: "rgba(132,204,22,.24)",
    orbes: [
      { cor: "rgba(244,150,182,.88)", x: "8%",  y: "27%", tam: "52vw", z: -310 },
      { cor: "rgba(163,230,53,.86)", x: "93%", y: "69%", tam: "46vw", z: -125 },
      { cor: "rgba(216,180,254,.46)", x: "50%", y: "-7%", tam: "62vw", z: -510 },
    ],
  },
];

/**
 * Estacao do ano no HEMISFERIO SUL (o site e brasileiro). Datas aproximadas
 * dos solsticios/equinocios — o fundo e ambiente, nao efemeride.
 */
export function currentSeasonIndex(date = new Date()) {
  const md = (date.getMonth() + 1) * 100 + date.getDate();
  if (md >= 1221 || md <= 320) return 0; // verao
  if (md <= 620) return 1; // outono
  if (md <= 922) return 2; // inverno
  return 3; // primavera
}

/** Fundo 3D das estacoes. Decorativo: aria-hidden, sem texto, sem foco. */
function seasons3dHtml(date = new Date()) {
  const inicio = currentSeasonIndex(date);
  const cenas = SEASONS_3D.map((_, k) => {
    const s = SEASONS_3D[(inicio + k) % SEASONS_3D.length];
    // k=0 entra em cena agora; as outras entram a cada S3_PASSO segundos.
    const atraso = k === 0 ? 0 : -(S3_CICLO - k * S3_PASSO);
    const orbes = s.orbes
      .map(
        (o) =>
          `<span class="s3-orb" style="left:${o.x};top:${o.y};width:${o.tam};height:${o.tam};` +
          `background:radial-gradient(circle,${o.cor} 0%,transparent 68%);` +
          `transform:translate(-50%,-50%) translateZ(${o.z}px) scale(${s3Scale(o.z)})"></span>`
      )
      .join("");
    return (
      `<div class="s3-season s3-season--${s.id}" style="animation-delay:${atraso}s">` +
      `<div class="s3-stage">${orbes}` +
      `<span class="s3-sun" style="top:${s.sol.top};left:${s.sol.left};width:${s.sol.tam};height:${s.sol.tam};` +
      `background:radial-gradient(circle,${s.sol.cor} 0%,transparent 70%)"></span>` +
      `</div>` +
      `<span class="s3-horizon" style="background:linear-gradient(to top,${s.horizonte},transparent)"></span>` +
      `</div>`
    );
  }).join("");

  // Particulas de luz: uma camada so, compartilhada pelas 4 estacoes.
  const motes = Array.from({ length: 9 }, (_, i) => {
    const left = 6 + i * 10.5;
    const dur = 26 + ((i * 7) % 17);
    const delay = -(i * 4);
    const size = i % 3 === 0 ? 4 : 3;
    return (
      `<span class="s3-mote" style="left:${left}%;width:${size}px;height:${size}px;` +
      `animation-duration:${dur}s;animation-delay:${delay}s"></span>`
    );
  }).join("");

  return (
    `<div class="seasons3d" aria-hidden="true">${cenas}` +
    `<div class="s3-motes">${motes}</div>` +
    `<div class="s3-veil"></div></div>`
  );
}

/**
 * Globo 3D de arame (wireframe) para o fundo das secoes escuras. E CSS 3D puro
 * — meridianos e paralelos sao divs com border-radius girados em preserve-3d,
 * sem canvas, sem WebGL e sem nenhuma biblioteca externa (a CSP do site nao
 * permitiria script de terceiro). Decorativo: aria-hidden e desligado inteiro
 * em prefers-reduced-motion.
 */
function globe3dHtml() {
  const R = 96; // raio do globo, em px
  const meridians = Array.from(
    { length: 8 },
    (_, i) => `<i class="g3-mer" style="transform:rotateY(${i * 22.5}deg)"></i>`
  ).join("");
  const parallels = [-58, -30, 0, 30, 58]
    .map((lat) => {
      const rad = (lat * Math.PI) / 180;
      const r = Math.round(R * Math.cos(rad)); // raio do paralelo
      const y = Math.round(R * Math.sin(rad)); // altura no eixo do globo
      return (
        `<i class="g3-par" style="width:${r * 2}px;height:${r * 2}px;margin:-${r}px 0 0 -${r}px;` +
        `transform:rotateX(90deg) translateZ(${y}px)"></i>`
      );
    })
    .join("");
  return (
    `<div class="globe3d" aria-hidden="true">` +
    `<div class="g3-inner">${meridians}${parallels}` +
    `<div class="g3-orbit"><div class="g3-orbit-spin"><span class="g3-orbit-dot"></span></div></div>` +
    `</div></div>`
  );
}

function roteirosSectionHtml(guides) {
  const cards = guides
    .map((g) => {
      const melhor = melhorMesDoGuia(g);
      const media = g.heroSrc
        ? resilientImg(g.heroSrc, g.titulo, g.heroFoto, "media-img")
        : `<div class="media-placeholder">${placeholderSvgMarkup(g.heroFoto || g.titulo)}</div>`;
      // Palheiro de busca montado no servidor (sem acento) para o filtro do
      // /guias nao precisar remexer no DOM para descobrir o que cada cartao diz.
      const palheiro = semAcento(
        [g.titulo, g.tag, g.resumo, g.breadcrumb, g.id].filter(Boolean).join(" ")
      );
      return (
        `<a class="rot-card" href="/guias/${escapeHtml(g.id)}" data-rot-busca="${escapeHtml(palheiro)}">` +
        `<div class="rot-media">${media}<span class="rot-flag">ROTEIRO DE ${escapeHtml((g.dias || []).length)} DIAS</span></div>` +
        `<div class="rot-body">` +
        `<span class="rot-tag">${escapeHtml(g.tag)}</span>` +
        `<h3>${escapeHtml(g.titulo)}</h3>` +
        `<p>${escapeHtml(g.resumo)}</p>` +
        `<div class="rot-foot"><span class="rot-cta">Ler o roteiro completo →</span>` +
        (melhor ? `<span class="rot-mes">melhor preço em ${escapeHtml(melhor)}</span>` : "") +
        `</div>` +
        `</div>` +
        `</a>`
      );
    })
    .join("");
  return (
    `<section class="roteiros" id="roteiros">` +
    globe3dHtml() +
    `<div class="wrap">` +
    `<div class="roteiros-head" id="guias">` +
    `<p class="eyebrow eyebrow--lime">Revista Aonde · Roteiros prontos</p>` +
    `<h2>5 dias, dia a dia, com onde comer</h2>` +
    `<p>Roteiros escritos por quem conhece o destino: pontos turísticos na ordem certa e um bom restaurante para cada dia. É só seguir.</p>` +
    `<p class="roteiros-all"><a href="/guias">Ver todos os roteiros →</a></p>` +
    `</div>` +
    `<div class="rot-grid">${cards}</div>` +
    `</div>` +
    `</section>`
  );
}

function extrasSectionHtml(extras) {
  const cards = extras
    .map((ex) => {
      // Hospedagem já tem parceiro real (Hotellook); carros/seguro ainda não.
      const isHotel = ex.sigla === "H";
      const inner =
        `<span class="extra-sigla">${escapeHtml(ex.sigla)}</span>` +
        `<h3>${escapeHtml(ex.titulo)}</h3>` +
        `<p>${escapeHtml(ex.desc)}</p>` +
        (isHotel
          ? `<span class="extra-cta">${escapeHtml(ex.cta)} →</span>`
          : `<span class="extra-cta extra-cta--soon">em breve</span>`);
      return isHotel
        ? `<a class="extra-card" href="${escapeHtml(hotellookSearch())}" target="_blank" rel="noopener sponsored">${inner}</a>`
        : `<article class="extra-card extra-card--soon">${inner}</article>`;
    })
    .join("");
  return (
    `<section class="wrap section" id="extras">` +
    `<h2>Além da passagem</h2>` +
    `<p class="section-sub">Monte a viagem completa: hospedagem, carro e seguro em um só lugar, com a mesma curadoria de sempre. Cada reserva é feita e paga no parceiro.</p>` +
    `<div class="extras-grid">${cards}</div>` +
    `</section>`
  );
}

// Seção "explore no mapa" da home — chama o /mapa (mapa-múndi de destinos).
function mapExploreHtml() {
  return (
    `<section class="wrap section">` +
    `<div class="explore">` +
    `<div class="explore-copy"><p class="eyebrow eyebrow--green">Explore o mundo</p>` +
    `<h2>Todos os roteiros no mapa</h2>` +
    `<p>Navegue o mapa e clique num destino para abrir o roteiro de 5 dias, dia a dia, com onde comer.</p>` +
    `<a class="btn btn-green" href="/mapa">Abrir o mapa de destinos →</a></div>` +
    `<a class="explore-map" href="/mapa" aria-label="Abrir o mapa de destinos">` +
    `<div class="media-placeholder">${placeholderSvgMarkup("Mapa dos destinos")}</div>` +
    `<span class="explore-map-badge">📍 22 destinos</span></a>` +
    `</div>` +
    `</section>`
  );
}

function confiancaSectionHtml(stats) {
  const cols = stats
    .map(
      (s) =>
        `<div class="conf-stat"><p class="conf-valor">${escapeHtml(s.valor)}</p><p>${escapeHtml(s.desc)}</p></div>`
    )
    .join("");
  return (
    `<section class="wrap section">` +
    `<div class="conf-card"><h2>Viajar bem começa com confiança.</h2>${cols}</div>` +
    `</section>`
  );
}

/** Pagina inicial (home) — porta fiel da tela "home" do prototipo. */
export function renderHomePage(opts = {}) {
  const liveOffers = Array.isArray(opts.offers) ? opts.offers : null;
  const offerVMs = (liveOffers && liveOffers.length
    ? liveOffers.map(normalizeLiveOffer)
    : CONTENT_OFFERS.map(normalizeContentOffer)
  )
    .filter(Boolean)
    .slice(0, 4);
  const guides = Array.isArray(opts.guides) && opts.guides.length ? opts.guides : GUIDE_LIST.slice(0, 3);

  const body =
    `<main id="conteudo" tabindex="-1">` +
    heroHtml(HERO_SLIDES) +
    searchCardHtml() +
    homeOffersHtml(offerVMs) +
    newsletterStripHtml() +
    stylesSectionHtml(TRIP_STYLES) +
    roteirosSectionHtml(guides) +
    mapExploreHtml() +
    extrasSectionHtml(EXTRAS) +
    confiancaSectionHtml(CONFIANCA) +
    `</main>` +
    siteFooter();

  return htmlDocument({
    title: "Aonde — passagens, hotéis e roteiros pelo Brasil e América do Sul",
    body,
    script: enhancementScript(),
    canonical: "/",
    jsonld: [buildOrganization(), buildWebSite()],
  });
}

// ---------------------------------------------------------------------------
// OFERTAS (feed)
// ---------------------------------------------------------------------------

// Opcoes de origem alinhadas ao feed real (OFFER_ORIGINS, menos "Todas"), com
// rotulo por cidade. Fonte unica de verdade — nao duplicar a lista.
const ORIGIN_CITIES = { GRU: "São Paulo (GRU)", VCP: "Campinas (VCP)", GIG: "Rio de Janeiro (GIG)", CNF: "Belo Horizonte (CNF)" };
function originOptionsHtml(active) {
  return OFFER_ORIGINS.filter((o) => o !== "Todas")
    .map((o) => `<option value="${o}"${active === o ? " selected" : ""}>${escapeHtml(ORIGIN_CITIES[o] || o)}</option>`)
    .join("");
}

function newsletterHeroHtml() {
  return (
    `<section class="wrap news-wrap">` +
    `<div class="news-card">` +
    `<div class="news-copy">` +
    `<p class="eyebrow eyebrow--lime">Alertas de preço</p>` +
    `<h1>Os achados de passagem antes que acabem</h1>` +
    `<p>Preços muito abaixo da média e erros de tarifa, garimpados todos os dias. Comparamos cada tarifa com a média dos últimos 90 dias antes de avisar você.</p>` +
    `</div>` +
    `<form class="news-form" data-newsletter action="/api/newsletter/subscribe" method="post">` +
    `<input name="email" type="email" required aria-label="Seu e-mail" placeholder="Seu melhor e-mail">` +
    `<div class="news-row">` +
    `<input name="whatsapp" aria-label="Seu WhatsApp (opcional)" placeholder="WhatsApp (opcional)">` +
    `<select name="origem" aria-label="Sua cidade de origem">${originOptionsHtml("GRU")}</select>` +
    `</div>` +
    `<span class="news-whatsapp-note">Se informar o WhatsApp, também avisamos por lá — só depois de você confirmar por e-mail.</span>` +
    `<button class="btn btn-lime" type="submit">Quero receber os alertas</button>` +
    `<span class="news-fine">Grátis. Sem spam. Cancele quando quiser.</span>` +
    `<p class="news-msg" data-newsletter-msg hidden></p>` +
    `</form>` +
    `</div>` +
    `</section>`
  );
}

// Faixa compacta de captura para paginas cujo objetivo primario nao e a
// newsletter (home, guias). `destinoContexto` pre-preenche um alerta de rota.
function newsletterStripHtml({ titulo, sub, origemDefault = "GRU" } = {}) {
  return (
    `<section class="wrap news-strip-wrap">` +
    `<div class="news-strip">` +
    `<div class="news-strip-copy">` +
    `<p class="eyebrow eyebrow--lime">Alertas de preço</p>` +
    `<h2>${escapeHtml(titulo || "Essa passagem pode sumir até amanhã.")}</h2>` +
    `<p>${escapeHtml(sub || "Garimpamos passagens abaixo da média todos os dias. Deixe seu e-mail e a gente avisa quando aparecer uma da sua cidade.")}</p>` +
    `</div>` +
    `<form class="news-form news-form--strip" data-newsletter action="/api/newsletter/subscribe" method="post">` +
    `<input name="email" type="email" required aria-label="Seu e-mail" placeholder="Seu melhor e-mail">` +
    `<select name="origem" aria-label="Sua cidade de origem">${originOptionsHtml(origemDefault)}</select>` +
    `<button class="btn btn-lime" type="submit">Quero receber os alertas</button>` +
    `<p class="news-msg" data-newsletter-msg hidden></p>` +
    `</form>` +
    `</div>` +
    `<span class="news-fine news-fine--strip">Grátis. Sem spam. Cancele quando quiser.</span>` +
    `</section>`
  );
}

function originFilterHtml(active) {
  const buttons = OFFER_ORIGINS.map((o) => {
    const on = (active || "Todas") === o;
    const label = o === "Todas" ? "Todas as origens" : rotuloAeroporto(o);
    const href = o === "Todas" ? "/ofertas" : `/ofertas?origem=${encodeURIComponent(o)}`;
    return `<a class="orig-pill${on ? " is-active" : ""}" href="${href}">${escapeHtml(label)}</a>`;
  }).join("");
  return (
    `<div class="orig-bar"><div class="wrap orig-in">` +
    `<span class="orig-label">Partindo de</span>` +
    `<div class="orig-pills">${buttons}</div>` +
    `</div></div>`
  );
}

function comoFuncionaHtml() {
  const cards = COMO_FUNCIONA.map(
    (cf) =>
      `<div class="cf-card"><span class="cf-num">${escapeHtml(cf.n)}</span>` +
      `<h3>${escapeHtml(cf.titulo)}</h3><p>${escapeHtml(cf.desc)}</p></div>`
  ).join("");
  return (
    `<section class="wrap section" id="como-funciona">` +
    `<h2>Como a gente acha essas tarifas</h2>` +
    `<p class="section-sub">Transparência total: nada de preço milagroso sem explicação. Veja como o Aonde garimpa e por que você pode confiar.</p>` +
    `<div class="cf-grid">${cards}</div>` +
    `<p class="cf-note">O Aonde recebe comissão de parceiros quando você compra pelo nosso link — sem custo extra para você. Isso mantém o serviço de alertas gratuito. Só indicamos tarifas que nós mesmos compraríamos.</p>` +
    `</section>`
  );
}

/**
 * Pagina de OFERTAS (feed) — porta fiel da tela "ofertas" do prototipo.
 * `offers` no shape de producao (toOffer + enrichOfferWithImage); se vazio,
 * usa a curadoria editorial de aondeContent.
 */
export function renderOffersPage(offers = [], { title = "Ofertas de viagem — Aonde", origem } = {}) {
  const list = Array.isArray(offers) ? offers : [];
  const vms = (list.length ? list.map(normalizeLiveOffer) : CONTENT_OFFERS.map(normalizeContentOffer)).filter(Boolean);
  const filtered = origem && origem !== "Todas" ? vms.filter((v) => v.origem === origem) : vms;
  // Filtro sem resultado nao pode virar tela em branco: em vez do vazio, aponta
  // o caminho (alerta da rota, que e recurso real) e devolve para o feed todo.
  const cards = filtered.length
    ? filtered.map(offerCardVM).join("\n")
    : `<p class="feed-vazio">Nenhum achado saindo de <strong>${escapeHtml(
        cidadeDoIata(origem) || origem
      )}</strong> hoje. Os achados mudam todo dia — <a href="/alertas">crie um alerta grátis</a> e a gente avisa quando aparecer um, ou <a href="/ofertas">veja todas as origens</a>.</p>`;

  const body =
    `<main id="conteudo" tabindex="-1">` +
    originFilterHtml(origem) +
    // No celular a captura de e-mail desce para DEPOIS da lista (ver CSS
    // .feed-ordem): um usuario de primeira viagem rolou 1,5 tela ate achar as
    // ofertas e perguntou "cade a lista, gente?".
    `<div class="feed-ordem">` +
    newsletterHeroHtml() +
    `<section class="wrap section feed-lista">` +
    `<div class="section-head section-head--tight">` +
    `<h2>Achados de hoje</h2>` +
    `<span class="feed-count">${escapeHtml(filtered.length)} ofertas ativas</span>` +
    `</div>` +
    `<div class="of-grid">${cards}</div>` +
    `</section>` +
    `</div>` +
    comoFuncionaHtml() +
    `</main>` +
    siteFooter();

  return htmlDocument({ title, body, script: enhancementScript(), canonical: "/ofertas" });
}

// ---------------------------------------------------------------------------
// OFERTA (detalhe)
// ---------------------------------------------------------------------------

/** Pagina de detalhe de uma oferta — porta fiel da tela "oferta". */
export function renderOfferPage(offer, { related = [], apiKey = "" } = {}) {
  const vm =
    offer && typeof offer === "object" && ("preco_centavos" in offer || "is_erro_tarifa" in offer)
      ? normalizeLiveOffer(offer)
      : normalizeContentOffer(offer);
  if (!vm) return renderOffersPage([]);

  const destinoLabel = vm.cidade || vm.destino || "Destino";
  const badge = vm.badge ? `<span class="det-badge ${badgeClass(vm)}">${escapeHtml(vm.badge)}</span>` : "";
  const media = vm.media ? `<span class="det-media"><s>${escapeHtml(vm.media)}</s></span>` : "";
  const economia = vm.economia
    ? `<span class="det-econ">você economiza ${escapeHtml(vm.economia)} · ida e volta</span>`
    : "";
  const texto = vm.texto ? `<p class="det-texto">${escapeHtml(vm.texto)}</p>` : "";
  const flex = vm.flex.length
    ? `<h2 class="det-h2">Datas com o preço disponível</h2><div class="det-flex">` +
      vm.flex
        .map(
          (f) =>
            `<div class="det-flex-row"><span>${escapeHtml(f.d)}</span><strong>${escapeHtml(f.p)}</strong></div>`
        )
        .join("") +
      `</div>`
    : "";
  const dicas = vm.dicas.length
    ? `<h2 class="det-h2">Antes de comprar</h2><div class="det-dicas">` +
      vm.dicas.map((d) => `<div class="det-dica"><span>•</span><span>${escapeHtml(d)}</span></div>`).join("") +
      `</div>`
    : "";

  // Aviso fixo e sistematico para "erro de tarifa" (nao depende de o editorial
  // ter escrito o alerta nas dicas).
  const fareErrorNote = vm.erro
    ? `<div class="fare-error-note"><strong>O que é "erro de tarifa"?</strong> ` +
      `É um preço muito abaixo do normal que a companhia pode corrigir ou cancelar a qualquer momento — inclusive depois da compra. ` +
      `Se for reservar, compre rápido e só marque hotel/passeio depois da confirmação por e-mail da companhia.</div>`
    : "";

  // CTA de compra:
  //  - oferta AO VIVO (tem affiliate_url): passa pela pagina /saida/:id, que
  //    registra o clique no servidor e resolve o link do parceiro;
  //  - oferta EDITORIAL (sem affiliate_url): leva a busca de voos da rota
  //    (honesto — nao finge ir a um parceiro que nao existe).
  const rotaQS =
    vm.origem && vm.destino
      ? `/resultados?origem=${encodeURIComponent(vm.origem)}&destino=${encodeURIComponent(vm.destino)}`
      : "/resultados";
  const ctaHref = vm.affiliateUrl ? `/saida/${encodeURIComponent(vm.id)}` : rotaQS;
  const ciaLabel = vm.cia ? `na ${escapeHtml(vm.cia)}` : "no parceiro";
  const ctaLabel = vm.affiliateUrl
    ? `Ver oferta ${ciaLabel} →`
    : `Ver voos ${escapeHtml(vm.origem || "")} → ${escapeHtml(vm.destino || destinoLabel)} →`;
  // Subtexto HONESTO conforme o destino real do CTA (parceiro externo vs busca
  // interna de voos). Nunca prometer "site do parceiro" quando vai para /resultados.
  const ctaFine = vm.affiliateUrl
    ? "Você será levado ao site do parceiro. O Aonde pode receber comissão, sem custo extra para você."
    : "Você vai ver os voos desta rota (tarifas de exemplo por enquanto). A busca e a compra acontecem no site do parceiro — o Aonde pode receber comissão, sem custo extra para você.";

  // "Prova do preço" HONESTA: so mostra a etiqueta de captura de tela quando ha
  // um print real (prova_url). Sem isso, e a foto do destino, rotulada como tal.
  const temProva = !!vm.provaUrl;
  const provaImg = imageBlock(
    temProva ? vm.provaUrl : vm.thumbUrl,
    temProva ? `Captura do preço para ${destinoLabel}` : `Foto de ${destinoLabel}`,
    destinoLabel,
    "det-prova-media"
  );
  const provaTag = temProva ? "Prova do preço · captura de tela" : "Imagem do destino";

  // Alerta de preço da propria rota (form real, 1 campo visivel) no lugar do
  // link estatico antigo.
  const origensSel = originOptionsHtml(vm.origem);
  const alertForm =
    `<form class="det-alert" data-newsletter action="/api/newsletter/subscribe" method="post">` +
    `<p class="det-alert-title">Perdeu essa? A gente avisa da próxima.</p>` +
    (vm.origem && vm.destino
      ? `<p>Alerta para <strong>${escapeHtml(vm.origem)} → ${escapeHtml(vm.destino)}</strong>${vm.preco ? ` abaixo de ${escapeHtml(vm.preco)}` : ""}.</p>` +
        `<input type="hidden" name="origem" value="${escapeHtml(vm.origem)}">` +
        `<input type="hidden" name="destino" value="${escapeHtml(vm.destino)}">`
      : `<p>Alertas de preço da sua cidade, direto no e-mail.</p>` +
        `<label class="det-alert-orig"><span>Sua origem</span><select name="origem">${origensSel}</select></label>`) +
    (typeof offer.preco_centavos === "number"
      ? `<input type="hidden" name="precoAlvoCentavos" value="${escapeHtml(offer.preco_centavos)}">`
      : "") +
    `<input class="det-alert-input" name="email" type="email" required aria-label="Seu e-mail" placeholder="Seu melhor e-mail">` +
    `<button class="btn btn-lime" type="submit">Ativar alerta grátis</button>` +
    `<p class="news-msg" data-newsletter-msg hidden></p>` +
    `</form>`;

  // HISTORICO DE PRECO desta rota. O modulo decide sozinho se ha amostra
  // suficiente (minimo 5 observacoes em 90 dias): abaixo disso ele NAO desenha
  // curva, mostra "ainda estamos juntando historico". Nao ponho `if` aqui de
  // proposito — quem chama nao deve poder escolher desenhar uma tendencia que
  // os dados nao sustentam. Rota sem historico nenhum tambem cai nesse caminho.
  const histBloco = (() => {
    if (!vm.origem || !vm.destino) return "";
    let serie;
    try {
      serie = getRouteSeries(vm.origem, vm.destino, { windowDays: 90 });
    } catch {
      return ""; // historico e enfeite util, nunca motivo para derrubar a pagina
    }
    return (
      `<div class="det-hist">` +
      `<p class="det-hist-title">Preço desta rota nos últimos 90 dias</p>` +
      renderRouteSparkline(serie, { variant: "labeled" }) +
      `<p class="det-hist-fine">${
        serie && serie.ok
          ? "São os preços que o Aonde registrou nesta rota no período — não é previsão do que vai acontecer."
          : "Assim que tivermos observações suficientes, o gráfico aparece aqui."
      }</p>` +
      `</div>`
    );
  })();

  // Reforco de confianca imediatamente antes/depois do CTA (alegacoes reais).
  const trustMini =
    `<div class="trust-mini">` +
    `<div class="trust-mini-item"><span class="trust-mini-ico" aria-hidden="true">🔒</span>` +
    `<span>Você paga direto no site oficial do parceiro — o Aonde nunca vê nem guarda seu cartão.</span></div>` +
    `<div class="trust-mini-item"><span class="trust-mini-ico" aria-hidden="true">👤</span>` +
    `<span>Toda oferta é conferida por um humano antes de publicar — <a href="/ofertas#como-funciona">veja como</a>.</span></div>` +
    `</div>`;

  const relatedCards = (Array.isArray(related) ? related : [])
    .map((r) => {
      const rv = "preco_centavos" in r || "is_erro_tarifa" in r ? normalizeLiveOffer(r) : normalizeContentOffer(r);
      if (!rv) return "";
      const rb = rv.badge ? `<span class="rel-badge ${badgeClass(rv)}">${escapeHtml(rv.badge)}</span>` : "";
      return (
        `<a class="rel-card" href="${escapeHtml(rv.href || "/ofertas")}">` +
        `<div class="rel-top"><span class="rel-rota">${escapeHtml(rv.origem)} → ${escapeHtml(rv.destino)}</span>${rb}</div>` +
        `<h3>${escapeHtml(rv.cidade || rv.destino)}</h3>` +
        `<span class="rel-preco">${escapeHtml(rv.preco)}</span>` +
        (rv.cia || rv.datas ? `<span class="rel-cia">${[rv.cia, rv.datas].filter(Boolean).map(escapeHtml).join(" · ")}</span>` : "") +
        `</a>`
      );
    })
    .join("");
  const relatedBlock = relatedCards
    ? `<section class="wrap section"><h2 class="det-h2">Outras ofertas parecidas</h2><div class="rel-grid">${relatedCards}</div></section>`
    : "";

  // Mini-mapa "Onde fica" do destino da oferta (estilo/pin da marca). Sem
  // coordenada (oferta ao vivo) ou sem chave, cai para um link do Google Maps.
  const offerMap = miniMapSection({
    domId: "oferta-map",
    callback: "aondeOfertaMap",
    title: "Onde fica",
    caption: `Veja onde é ${destinoLabel} e o que há por perto.`,
    coords: OFFER_COORDS[vm.id],
    label: destinoLabel,
    apiKey,
    fallbackHref: mapsSearchUrl(destinoLabel),
    fallbackText: `Ver ${destinoLabel} no Google Maps`,
  });

  const body =
    `<main id="conteudo" tabindex="-1">` +
    `<section class="wrap det">` +
    `<p class="breadcrumb"><a href="/">Início</a> · <a href="/ofertas">Ofertas</a> · <span>${escapeHtml(destinoLabel)}</span></p>` +
    `<div class="det-grid">` +
    `<div class="det-main">` +
    `<div class="det-badges">${badge}${vm.publicado ? `<span class="det-pub">publicado ${escapeHtml(vm.publicado)}</span>` : ""}</div>` +
    (vm.origem && vm.destino ? `<span class="det-rota">${escapeHtml(rotuloAeroporto(vm.origem))} → ${escapeHtml(rotuloAeroporto(vm.destino))}</span>` : "") +
    `<h1 class="det-cidade">${escapeHtml(destinoLabel)}</h1>` +
    (vm.local || vm.cia ? `<p class="det-local">${[vm.local, vm.cia].filter(Boolean).map(escapeHtml).join(" · ")}</p>` : "") +
    `<div class="det-preco-row"><span class="det-preco">${escapeHtml(vm.preco)}</span>${media}</div>` +
    economia +
    fareErrorNote +
    texto +
    `<div class="det-prova">${provaImg}<span class="det-prova-tag">${provaTag}</span></div>` +
    flex +
    dicas +
    `</div>` +
    `<aside class="det-aside">` +
    `<div class="det-buy">` +
    `<span class="det-buy-label">a partir de</span>` +
    `<p class="det-buy-preco">${escapeHtml(vm.preco)}</p>` +
    `<p class="det-buy-sub">ida e volta${vm.datas ? ` · ${escapeHtml(vm.datas)}` : ""}</p>` +
    `<a class="btn btn-green det-buy-cta" href="${escapeHtml(ctaHref)}">${ctaLabel}</a>` +
    `<p class="det-buy-perks">Em até <strong>12x sem juros</strong> no cartão ou <strong>5% off</strong> no Pix.</p>` +
    `<p class="det-buy-fine">${escapeHtml(ctaFine)}</p>` +
    trustMini +
    `</div>` +
    histBloco +
    alertForm +
    `</aside>` +
    `</div>` +
    `</section>` +
    offerMap.html +
    relatedBlock +
    `</main>` +
    siteFooter();

  const offerJsonld = [
    buildOfferProduct(vm),
    buildBreadcrumbList([
      { name: "Início", url: "/" },
      { name: "Ofertas", url: "/ofertas" },
      { name: destinoLabel, url: vm.href },
    ]),
  ].filter(Boolean);

  let doc = htmlDocument({
    title: `${destinoLabel} — oferta de viagem · Aonde`,
    body,
    script: offerMap.script,
    canonical: vm.href || (vm.id ? `/ofertas/${vm.id}` : "/ofertas"),
    image: vm.thumbUrl || "",
    jsonld: offerJsonld,
  });
  if (offerMap.loader) doc = doc.replace("</body>", `${offerMap.loader}</body>`);
  return doc;
}

// ---------------------------------------------------------------------------
// GUIA / ROTEIRO
// ---------------------------------------------------------------------------

function renderGuideVM(g, apiKey) {
  const map = guideMiniMap(g, apiKey);
  const hero = g.hero || {};
  const heroMedia = hero.url
    ? resilientImg(hero.url, g.titulo, hero.foto || g.titulo, "media-img")
    : `<div class="media-placeholder">${placeholderSvgMarkup(hero.foto || g.titulo)}</div>`;

  const meta = (g.meta || [])
    .map((m) => `<div class="guia-meta-row"><span>${escapeHtml(m.k)}</span><strong>${escapeHtml(m.v)}</strong></div>`)
    .join("");

  const cidade = g.breadcrumb || g.titulo || "";
  const dias = (g.dias || [])
    .map((d) => {
      const pontos = d.pontos.map(pontoHtml).join("");
      // Restaurante vira link para o Google Maps (busca do lugar).
      const rest = d.restauranteNome
        ? `<div class="dia-rest"><span class="dia-rest-label">Onde comer</span>` +
          `<span><a class="dia-rest-link" href="${escapeHtml(mapsSearchUrl(`${d.restauranteNome}, ${cidade}`))}" target="_blank" rel="noopener"><strong>${escapeHtml(d.restauranteNome)}</strong></a>${d.restauranteNota ? ` · ${escapeHtml(d.restauranteNota)}` : ""}</span></div>`
        : "";
      // "Ver o dia no mapa": rota do Google Maps passando pelos pontos do dia
      // (Maps URLs API — sem chave, preciso, abre no app/site do Google Maps).
      const dirUrl = mapsDirUrl(d.pontos.map((p) => (cidade ? `${p.nome}, ${cidade}` : p.nome)));
      const dayMap = dirUrl
        ? `<a class="dia-map" href="${escapeHtml(dirUrl)}" target="_blank" rel="noopener"><span class="dia-map-pin" aria-hidden="true">📍</span> Ver o dia no Google Maps →</a>`
        : "";
      return (
        `<article class="dia">` +
        `<div class="dia-num"><span>DIA</span><strong>${escapeHtml(d.n)}</strong></div>` +
        `<div class="dia-body">` +
        `<h3>${escapeHtml(d.titulo)}</h3>` +
        (d.desc ? `<p class="dia-desc">${escapeHtml(d.desc)}</p>` : "") +
        `<div class="dia-pontos">${pontos}</div>` +
        rest +
        dayMap +
        `</div>` +
        `</article>`
      );
    })
    .join("");

  // O preco do roteiro e sempre da rota monitorada (GRU -> destino), a mesma do
  // otimizador logo abaixo. Sem dizer a origem, quem via "R$ 312 saindo de BH"
  // na escolha do dia e "R$ 399" aqui achava que o site se contradizia.
  const asidePreco = g.preco
    ? `<span class="guia-aside-preco">a partir de <strong>${escapeHtml(g.preco)}</strong> ida e volta, ` +
      `saindo de ${escapeHtml(rotuloAeroporto("GRU"))} · 12x sem juros</span>`
    : "";

  // O que este preco NAO cobre. Uma leitora planejando lua de mel com orcamento
  // fechado disse que o site nao respondia "quanto custa a viagem inteira" e que
  // por isso nao conseguia bater o martelo. Nao inventamos estimativa de gasto
  // total (seria numero chutado); dizemos com todas as letras o que fica de fora,
  // para ela montar a conta com dado real em vez de descobrir depois.
  const escopoPreco = g.preco
    ? `<section class="wrap section escopo">` +
      `<div class="escopo-card">` +
      `<h2 class="escopo-h">O que esse valor cobre — e o que não cobre</h2>` +
      `<div class="escopo-cols">` +
      `<div><p class="escopo-tit escopo-tit--sim">Está incluído</p><ul>` +
      `<li>Passagem aérea de ida e volta, <strong>por pessoa</strong>, saindo de ${escapeHtml(rotuloAeroporto("GRU"))}. Saindo de outra cidade o valor muda.</li>` +
      `</ul></div>` +
      `<div><p class="escopo-tit escopo-tit--nao">Não está incluído</p><ul>` +
      `<li>Hospedagem (veja a seção “Onde ficar” logo abaixo).</li>` +
      `<li>Comida, transporte no destino e passeios.</li>` +
      `<li>Taxas e ingressos cobrados no próprio destino, quando houver.</li>` +
      `</ul></div>` +
      `</div>` +
      `<p class="escopo-nota">Alguns destinos cobram taxa de visitação, ingresso de parque ou entrada que precisa ser comprada com antecedência. Confira as regras atuais no site oficial do destino antes de fechar a viagem — elas mudam de valor com frequência e a gente não repassa número que não dá para garantir.</p>` +
      `</div></section>`
    : "";

  const body =
    `<main id="conteudo" tabindex="-1">` +
    `<section class="wrap guia-top">` +
    `<p class="breadcrumb"><a href="/">Início</a> · <a href="/guias">Guias de destino</a> · <span>${escapeHtml(g.breadcrumb)}</span></p>` +
    `<div class="guia-hero">${heroMedia}` +
    `<div class="guia-hero-flags"><span class="flag flag-lime">ROTEIRO DE ${escapeHtml((g.dias || []).length)} DIAS</span>` +
    (g.tag ? `<span class="flag flag-dark">${escapeHtml(g.tag)}</span>` : "") +
    `</div>` +
    (hero.credit ? mediaCredit(hero.credit, hero.href) : "") +
    `</div>` +
    `<div class="guia-intro-grid">` +
    `<div><h1 class="guia-title">${escapeHtml(g.titulo)}</h1>` +
    (g.intro ? `<p class="guia-intro">${escapeHtml(g.intro)}</p>` : "") + `</div>` +
    `<aside class="guia-aside">` +
    `<h2 class="guia-aside-h">Na prática</h2>${meta}` +
    `<a class="btn btn-green" href="${escapeHtml(guideResultsHref(g.opt))}">${escapeHtml(g.ctaVoos)}</a>` +
    asidePreco +
    `</aside>` +
    `</div>` +
    `</section>` +
    map.html +
    `<section class="wrap section">` +
    `<h2 class="guia-h2">O roteiro, dia a dia</h2>` +
    `<div class="dias">${dias}</div>` +
    `</section>` +
    escopoPreco +
    (g.id ? lodgingHtml(g) : "") +
    optimizerHtml(g.opt) +
    travelDatesHtml(g) +
    (g.id
      ? newsletterStripHtml({
          titulo: `Ainda não é a hora? A gente avisa quando ${g.titulo} ficar mais barato.`,
          sub: "Alerta de preço abaixo da média — sem lotar sua caixa de entrada com outros destinos.",
        })
      : "") +
    `<section class="wrap section">` +
    `<div class="guia-cta"><div><h2>${escapeHtml(g.ctaTitulo)}</h2>` +
    `<p>Voo + hotel na mesma reserva, em até 12x sem juros ou 5% off no Pix.</p></div>` +
    `<div class="guia-cta-btns"><a class="btn btn-lime" href="${escapeHtml(guideResultsHref(g.opt))}">${escapeHtml(g.ctaVoos)}</a>` +
    `<a class="btn btn-ghost" href="/guias">Outros roteiros</a></div></div>` +
    `</section>` +
    `</main>` +
    siteFooter({ places: g.places, attribution: g.attribution });

  const guideJsonld = [
    buildTouristTrip(g),
    buildBreadcrumbList([
      { name: "Início", url: "/" },
      { name: "Guias de destino", url: "/guias" },
      { name: g.breadcrumb, url: g.id ? `/guias/${g.id}` : "" },
    ]),
  ].filter(Boolean);

  let doc = htmlDocument({
    title: `${g.titulo} · Aonde`,
    body,
    script: map.script,
    canonical: g.id ? `/guias/${g.id}` : "/guias",
    image: (g.hero && g.hero.url) || "",
    jsonld: guideJsonld,
  });
  if (map.loader) doc = doc.replace("</body>", `${map.loader}</body>`);
  return doc;
}

/** Indice de todos os guias/roteiros editoriais (grid da "Revista Aonde"). */
export function renderGuidesIndexPage() {
  const body =
    `<main id="conteudo" tabindex="-1">` +
    `<section class="wrap map-head"><p class="eyebrow eyebrow--green">Revista Aonde</p>` +
    `<h1 class="map-title">Roteiros prontos, dia a dia</h1>` +
    `<p class="map-sub">${escapeHtml(GUIDE_LIST.length)} destinos com roteiro de 5 dias na ordem certa e um bom restaurante para cada dia. Escolha o seu.</p>` +
    // O campo nasce com "hidden": sem JS ele nunca aparece, entao ninguem ve
    // uma caixa de busca que nao filtra nada. O enhancementScript() tira o
    // hidden. A lista inteira continua ali, so escondemos cartoes ao filtrar.
    `<div class="guia-busca" data-guia-busca hidden>` +
    `<label class="guia-busca-lab" for="guia-busca-campo">Filtrar por destino</label>` +
    `<input class="guia-busca-campo" id="guia-busca-campo" type="search" autocomplete="off" ` +
    `placeholder="ex.: Rio, praia, Nordeste" data-guia-busca-campo>` +
    `<p class="guia-busca-conta" data-guia-busca-conta role="status" aria-live="polite"></p>` +
    `</div>` +
    `</section>` +
    roteirosSectionHtml(GUIDE_LIST) +
    `</main>` +
    siteFooter();
  return htmlDocument({ title: "Guias de destino · Aonde", body, script: enhancementScript(), canonical: "/guias" });
}

/**
 * PAGINA DO DIA (/hoje) — o que o robo diario publica: uma ou duas ofertas com
 * o roteiro em topicos, foto e melhor epoca. Ver src/daily/dailyPick.js.
 */
export function renderTodayPage(pacote) {
  const itens = (pacote && Array.isArray(pacote.itens) ? pacote.itens : []).filter((i) => i && i.roteiro);
  const dataLonga = (() => {
    const d = new Date(`${(pacote && pacote.dia) || ""}T12:00:00`);
    return Number.isNaN(d.getTime())
      ? ""
      : d.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
  })();

  const cards = itens
    .map((it) => {
      const o = it.oferta;
      const r = it.roteiro;
      const foto = r.foto && r.foto.url
        ? resilientImg(r.foto.url, r.destino, r.destino, "media-img")
        : `<div class="media-placeholder">${placeholderSvgMarkup(r.destino)}</div>`;
      const credito = r.foto && r.foto.credito
        ? `<span class="media-credit-overlay">${
            r.foto.href
              ? `<a href="${escapeHtml(r.foto.href)}" target="_blank" rel="noopener">${escapeHtml(r.foto.credito)}</a>`
              : escapeHtml(r.foto.credito)
          }</span>`
        : "";
      const bullets = (r.bullets || [])
        .map(
          (b) =>
            `<li class="hoje-bullet"><span class="hoje-dia">Dia ${escapeHtml(b.dia)}</span>` +
            `<div><strong>${escapeHtml(b.titulo)}</strong>` +
            (b.pontos && b.pontos.length ? `<p class="hoje-pontos">${escapeHtml(b.pontos.join(" · "))}</p>` : "") +
            (b.ondeComer ? `<p class="hoje-comer">Onde comer: <strong>${escapeHtml(b.ondeComer)}</strong></p>` : "") +
            `</div></li>`
        )
        .join("");
      return (
        `<article class="hoje-card">` +
        `<div class="hoje-media">${foto}${credito}` +
        (o.badge ? `<span class="of-badge badge-desconto">${escapeHtml(o.badge)}</span>` : "") +
        `</div>` +
        `<div class="hoje-body">` +
        `<p class="of-rota">${escapeHtml(o.origemCidade)} → ${escapeHtml(o.cidade)}</p>` +
        `<h3 class="hoje-titulo">${escapeHtml(r.titulo)}</h3>` +
        (r.resumo ? `<p class="hoje-resumo">${escapeHtml(r.resumo)}</p>` : "") +
        `<div class="hoje-preco-row"><span class="of-preco">${escapeHtml(o.preco)}</span>` +
        `<span class="of-iv">ida e volta, por pessoa · ${escapeHtml(o.datas)}</span></div>` +
        `<ul class="hoje-bullets">${bullets}</ul>` +
        (r.melhorMes ? `<p class="hoje-mes">Melhor mês para essa rota, pelo nosso histórico: <strong>${escapeHtml(r.melhorMes)}</strong></p>` : "") +
        `<div class="hoje-ctas">` +
        `<a class="btn btn-green" href="${escapeHtml(o.href)}">Ver a oferta →</a>` +
        (r.href ? `<a class="btn btn-ghost btn-ghost--claro" href="${escapeHtml(r.href)}">Roteiro completo, dia a dia</a>` : "") +
        `</div>` +
        `</div></article>`
      );
    })
    .join("");

  const vazio =
    `<p class="feed-vazio">Ainda não há escolha publicada para hoje. Veja os <a href="/ofertas">achados de hoje</a> ` +
    `ou os <a href="/guias">roteiros prontos</a>.</p>`;

  const body =
    `<main id="conteudo" tabindex="-1">` +
    `<section class="wrap section hoje-head">` +
    `<p class="eyebrow eyebrow--green">A escolha do dia${dataLonga ? ` · ${escapeHtml(dataLonga)}` : ""}</p>` +
    `<h1 class="section-title-wide">Hoje a gente iria para cá</h1>` +
    `<p class="section-sub">Todo dia escolhemos um ou dois achados e mostramos o roteiro em tópicos — o que ver em cada dia e onde comer. Os preços são conferidos no site do parceiro antes de você comprar.</p>` +
    `</section>` +
    `<section class="wrap section hoje-grid">${cards || vazio}</section>` +
    `</main>` +
    siteFooter();

  return htmlDocument({
    title: "A escolha do dia · Aonde",
    description:
      "Todo dia um ou dois achados de passagem com roteiro pronto em tópicos: o que ver em cada dia, onde comer e a melhor época para ir.",
    body,
    script: enhancementScript(),
    canonical: "/hoje",
    image: (itens[0] && itens[0].roteiro.foto && itens[0].roteiro.foto.url) || "",
  });
}

/** Guia editorial (aondeContent) por id, ou objeto de guia. */
export function renderGuidePage(guideOrId, { apiKey = "" } = {}) {
  const g = typeof guideOrId === "string" ? GUIDES[guideOrId] : guideOrId;
  if (!g) return renderHomePage();
  return renderGuideVM(guideFromContent(g), apiKey);
}

/**
 * Pagina de ROTEIRO a partir da saida de buildItinerary (Google Places),
 * renderizada na MESMA tela "guia" do prototipo. Mantida para compatibilidade
 * (testes + scripts). Inclui a atribuicao obrigatoria de lugares.
 */
export function renderItineraryPage(itinerary) {
  return renderGuideVM(guideFromItinerary(itinerary));
}

// ---------------------------------------------------------------------------
// RESULTADOS DE VOO — porta fiel da tela "results" do prototipo.
//
// Ainda sem busca de voos ao vivo no back-end: renderiza os dados de amostra
// de aondeContent. Pronta para integracao — aceita { rota, voos, sorts } no
// mesmo shape.
// ---------------------------------------------------------------------------

export function renderResultsPage(opts = {}) {
  const rota = opts.rota || RESULTS_ROUTE;
  const voos = Array.isArray(opts.voos) && opts.voos.length ? opts.voos : FLIGHTS;
  // Crianca e bebe de colo tem tarifa e regra propria. Se a pessoa informou que
  // viaja com eles, dizemos na cara que o valor de exemplo abaixo e por adulto —
  // uma mae de familia travou exatamente aqui na auditoria.
  const pax = opts.pax || null;
  // voosReais so e verdade quando a busca ao vivo (Amadeus) respondeu de fato —
  // ver src/flights/buscarVoos.js. Nunca deduzir de opts.voos existir: em
  // fallback o servidor nao manda voos e caimos em FLIGHTS, que E exemplo.
  // Rotular exemplo como preco real seria a pior mentira possivel aqui.
  const voosReais = opts.voosReais === true && Array.isArray(opts.voos) && opts.voos.length > 0;
  const avisoPax =
    pax && (pax.criancas > 0 || pax.bebes > 0)
      ? `<p class="res-amostra res-amostra--pax">Você marcou que viaja com ${
          pax.criancas > 0 ? "criança" : ""
        }${pax.criancas > 0 && pax.bebes > 0 ? " e " : ""}${
          pax.bebes > 0 ? "bebê de colo" : ""
        }: os valores ${voosReais ? "" : "de exemplo "}abaixo são <strong>por adulto</strong>. Criança e bebê pagam tarifa própria, calculada pela companhia no site do parceiro — leve isso em conta antes de fechar a conta da viagem.</p>`
      : "";
  const avisoOrigem = voosReais
    ? `<p class="res-amostra res-amostra--vivo"><strong>Preços buscados ao vivo agora.</strong> Estes são os voos que a busca devolveu para ${escapeHtml(rota.origem)} → ${escapeHtml(rota.destino)}, com o preço do momento. Tarifa de avião muda rápido: o valor final é o que aparecer no site do parceiro ao clicar em "Selecionar".</p>`
    : `<p class="res-amostra"><strong>Busca de voos ao vivo em breve.</strong> Os voos abaixo são <strong>exemplos</strong> da rota ${escapeHtml(rota.origem)} → ${escapeHtml(rota.destino)} — não são tarifas garantidas. O preço real é confirmado no site do parceiro ao clicar em "Selecionar". Prefere algo já conferido pela nossa curadoria? Veja os <a href="/ofertas">achados de hoje</a>.</p>`;
  const sorts = Array.isArray(opts.sorts) && opts.sorts.length ? opts.sorts : FLIGHT_SORTS;
  // Destino do "Selecionar": SEMPRE a pagina de saida do proprio site, nunca
  // direto pro parceiro — e a mesma tela de aviso que /saida/:id ja usa para
  // ofertas, so que aqui para a busca de voos generica desta rota.
  const selecionarHref = saidaVooHref(rota.origem, rota.destino);
  const searched = !!opts.searched;

  const filtros = FLIGHT_FILTERS.map((grp) => {
    const tipo = filtroTipo(grp.titulo);
    return (
      `<div class="res-filtro"><span class="res-filtro-title">${escapeHtml(grp.titulo)}</span>` +
      grp.opcoes
        .map((o) => {
          const valor = filtroValor(tipo, o.label);
          return (
            `<label class="res-check"><input type="checkbox" data-res-filtro data-ftype="${escapeHtml(tipo)}" data-fval="${escapeHtml(valor)}"${o.on ? " checked" : ""}>` +
            `${escapeHtml(o.label)}</label>`
          );
        })
        .join("") +
      `</div>`
    );
  }).join("");

  const sortPills = sorts
    .map((s, i) => `<button class="res-sort${i === 0 ? " is-active" : ""}" type="button">${escapeHtml(s)}</button>`)
    .join("");

  const voosHtml = voos
    .map((v) => {
      const melhor = v.melhor
        ? `<span class="res-melhor">MELHOR PREÇO</span>`
        : "";
      const paradaCor = v.direto ? "res-parada--direto" : "res-parada--conex";
      // data-* usados pelos filtros no cliente (enhancementScript): numero de
      // paradas, cia e hora de partida — os mesmos criterios dos checkboxes.
      const stops = numeroDeParadas(v);
      const hora = horaDeSaida(v.saida);
      return (
        `<article class="res-voo${v.melhor ? " res-voo--melhor" : ""}" data-res-voo data-stops="${stops}" data-cia="${escapeHtml(v.cia)}" data-hora="${hora}">` +
        melhor +
        `<div class="res-cia"><strong>${escapeHtml(v.cia)}</strong><span>${escapeHtml(v.numero)}</span></div>` +
        `<div class="res-trecho">` +
        `<div class="res-hora"><p>${escapeHtml(v.saida)}</p><span>${escapeHtml(rota.origem)}</span></div>` +
        `<div class="res-linha"><span class="res-dur">${escapeHtml(v.duracao)}</span><div class="res-track"><i></i></div>` +
        `<span class="res-parada ${paradaCor}">${escapeHtml(v.paradas)}</span></div>` +
        `<div class="res-hora"><p>${escapeHtml(v.chegada)}</p><span>${escapeHtml(rota.destino)}</span></div>` +
        `</div>` +
        `<div class="res-preco"><p class="res-preco-label">ida e volta, por pessoa</p>` +
        `<p class="res-preco-val">${escapeHtml(v.preco)}</p>` +
        `<p class="res-parcela">12x de ${escapeHtml(v.parcela)}</p></div>` +
        `<a class="btn res-sel" href="${escapeHtml(selecionarHref)}">Selecionar →</a>` +
        `</article>`
      );
    })
    .join("");

  const body =
    `<main id="conteudo" tabindex="-1">` +
    `<section class="res-topbar">` +
    `<div class="wrap res-topbar-in">` +
    // h1 real: quem navega por titulos (tecla H no leitor de tela) precisa
    // ouvir QUAL busca esta vendo — antes o primeiro titulo era "Filtrar
    // resultados", no menu lateral.
    `<h1 class="res-rota"><span>${escapeHtml(rota.origem)}</span><i aria-hidden="true">⇄</i><span>${escapeHtml(rota.destino)}</span></h1>` +
    `<span class="res-resumo">${escapeHtml(rota.resumo || "")}</span>` +
    `<a class="btn btn-ghost res-alterar" href="/">Alterar busca</a>` +
    `</div>` +
    `</section>` +
    `<section class="wrap res-grid">` +
    `<aside class="res-side">` +
    `<h3>Filtrar resultados</h3>` +
    filtros +
    `<div class="res-help">Precisa de ajuda para escolher? <a href="${escapeHtml(ajudaHref("Oi! Preciso de ajuda para escolher um voo."))}"${waHref("x") ? ` target="_blank" rel="noopener"` : ""}>${waHref("x") ? "Fale no WhatsApp" : "Central de ajuda"}</a></div>` +
    `</aside>` +
    `<div class="res-list">` +
    avisoPax +
    avisoOrigem +
    `<div class="res-sortbar"><span data-res-count>${escapeHtml(voos.length)} ${voosReais ? "voos encontrados" : "voos de exemplo"} · ordenar por</span>${sortPills}</div>` +
    `<div data-res-lista>${voosHtml}</div>` +
    `<p class="res-vazio" data-res-vazio hidden>Nenhum voo bate com os filtros marcados. Desmarque alguma opção ao lado para ver mais voos.</p>` +
    `<p class="res-fine">${
      voosReais
        ? "Os preços acima vieram da busca ao vivo no momento em que esta página carregou e podem mudar a qualquer momento."
        : "Preços acima são exemplos."
    } Ao selecionar, você vai para o site do parceiro ver as tarifas reais e concluir a compra. O Aonde pode receber comissão, sem custo extra para você.</p>` +
    `<div class="res-pix"><strong>Pix</strong><span>Pagando por Pix, todos os preços acima ganham <strong>5% de desconto</strong>, aplicado na hora de finalizar a compra.</span></div>` +
    `<div class="res-alert-banner"><div><strong>Não fechou negócio hoje?</strong> ` +
    `<span>A gente avisa se ${escapeHtml(rota.origem)} → ${escapeHtml(rota.destino)} ficar mais barato.</span></div>` +
    `<form class="res-alert-form" data-newsletter action="/api/newsletter/subscribe" method="post">` +
    `<input name="email" type="email" required aria-label="Seu e-mail" placeholder="Seu melhor e-mail">` +
    `<input type="hidden" name="origem" value="${escapeHtml(rota.origem)}">` +
    `<input type="hidden" name="destino" value="${escapeHtml(rota.destino)}">` +
    `<button class="btn btn-dark" type="submit">Ativar alerta desta rota</button>` +
    `<p class="news-msg" data-newsletter-msg hidden></p>` +
    `</form></div>` +
    `</div>` +
    `</section>` +
    `</main>` +
    siteFooter();

  return htmlDocument({ title: `Voos ${rota.origem} ⇄ ${rota.destino} · Aonde`, body, script: enhancementScript(), canonical: "/resultados" });
}

// ---------------------------------------------------------------------------
// SAIDA — interstitial "Voce esta indo para o parceiro". O servidor registra
// o clique e resolve o affiliate_url; esta pagina tranquiliza e redireciona.
// ---------------------------------------------------------------------------

/**
 * Interstitial de saida. `notaExtra` permite a quem chama acrescentar um aviso
 * proprio dentro da pagina (usado pela saida de BUSCA de voo, onde a pessoa
 * ainda vai escolher entre varias opcoes no parceiro antes de pagar) — antes
 * isso era feito com replace("</main>") por quem chamava, o que era fragil.
 */
export function renderExitPage(offer, { affiliateUrl, notaExtra = "" } = {}) {
  const vm =
    offer && typeof offer === "object" && ("preco_centavos" in offer || "is_erro_tarifa" in offer)
      ? normalizeLiveOffer(offer)
      : normalizeContentOffer(offer);
  if (!vm || !affiliateUrl) return renderOffersPage([]);

  const destinoLabel = vm.cidade || vm.destino || "seu destino";
  const parceiro = vm.cia || "o parceiro";

  const body =
    `<main id="conteudo" tabindex="-1"><section class="wrap exit">` +
    `<p class="breadcrumb"><a href="/">Início</a> · <a href="/ofertas">Ofertas</a> · <a href="${escapeHtml(vm.href || "/ofertas")}">${escapeHtml(destinoLabel)}</a> · <span>Saindo do Aonde</span></p>` +
    `<div class="exit-card">` +
    `<p class="eyebrow eyebrow--lime">Redirecionando</p>` +
    `<h1>Você está indo para ${escapeHtml(parceiro)}</h1>` +
    `<p class="exit-sub">A reserva de <strong>${escapeHtml(destinoLabel)}</strong> é feita e paga direto no site deles — o Aonde não processa pagamento nem emite passagem.</p>` +
    `<a class="btn btn-green exit-cta" href="${escapeHtml(affiliateUrl)}" target="_blank" rel="noopener sponsored">Continuar para ${escapeHtml(parceiro)} →</a>` +
    `<p class="exit-fine">Preço e disponibilidade podem mudar no site do parceiro — as vagas e as tarifas são controladas por eles, não pelo Aonde.</p>` +
    `</div>` +
    `<div class="exit-grid">` +
    `<div class="exit-block"><h2 class="det-h2">O que esperar agora</h2><ol class="exit-steps">` +
    `<li>Confira datas, nome dos passageiros e bagagem antes de pagar — são regras do parceiro.</li>` +
    `<li>A confirmação da reserva chega no seu e-mail <strong>direto do parceiro</strong>, não do Aonde.</li>` +
    `<li>Guarde o código da reserva (algumas empresas chamam de "localizador"): é o que qualquer atendimento vai pedir primeiro.</li>` +
    `</ol></div>` +
    `<div class="exit-block exit-help"><h2 class="det-h2">Precisa de ajuda?</h2>` +
    `<p>Dúvida sobre <em>esta oferta</em> antes de comprar? Fale com a gente.</p>` +
    `<a class="btn btn-dark" href="/ajuda">Central de ajuda</a>` +
    `<p class="exit-help-note">Depois da compra, alteração, cancelamento e reembolso da reserva são com <strong>o parceiro</strong> — só quem processou seu pagamento pode agir sobre ele. Explicamos o caminho em <a href="/cancelamentos">Trocas e cancelamentos</a>.</p>` +
    `</div>` +
    `</div>` +
    (notaExtra ? `<p class="exit-fine exit-nota-extra">${escapeHtml(notaExtra)}</p>` : "") +
    `</section></main>` +
    siteFooter();

  return htmlDocument({ title: `Indo para ${parceiro} — ${destinoLabel} · Aonde`, body });
}

// ---------------------------------------------------------------------------
// Paginas de suporte (estaticas) — Central de ajuda e Trocas/cancelamentos.
// ---------------------------------------------------------------------------

function faqItem(q, a) {
  return `<details class="faq-item"><summary>${escapeHtml(q)}</summary><p>${a}</p></details>`;
}

export function renderHelpPage() {
  const faqGroupsHtml = FAQ_GROUPS.map(
    (grp) =>
      `<div class="help-group"><h2 class="det-h2">${escapeHtml(grp.titulo)}</h2>` +
      grp.items.map((it) => faqItem(it.q, it.a)).join("") +
      `</div>`
  ).join("");

  const body =
    `<main id="conteudo" tabindex="-1">` +
    `<section class="wrap map-head"><p class="eyebrow eyebrow--green">Suporte</p>` +
    `<h1 class="map-title">Central de ajuda</h1>` +
    `<p class="map-sub">Respostas rápidas sobre como o Aonde funciona. Para uma reserva já feita, veja também <a href="/cancelamentos">Trocas e cancelamentos</a>.</p></section>` +
    `<section class="wrap section help-grid">` +
    faqGroupsHtml +
    `<div class="help-group"><h2 class="det-h2">Fale com a gente</h2>` +
    `<p>Atendimento: <strong>${escapeHtml(telLabel())}</strong>, todos os dias.</p>` +
    `<p class="help-fine">Atendimento sobre o Aonde (dúvidas, sugestões, problemas com o site). Para alteração/cancelamento de uma reserva já paga, o canal certo é o suporte do parceiro — ver <a href="/cancelamentos">Trocas e cancelamentos</a>.</p>` +
    `</div>` +
    `</section></main>` +
    siteFooter();
  return htmlDocument({ title: "Central de ajuda · Aonde", body, canonical: "/ajuda", jsonld: [buildFaqPage(FAQ_GROUPS)] });
}

export function renderCancelPage() {
  const body =
    `<main id="conteudo" tabindex="-1">` +
    `<section class="wrap map-head"><p class="eyebrow eyebrow--green">Suporte</p>` +
    `<h1 class="map-title">Trocas e cancelamentos</h1>` +
    `<p class="map-sub">O Aonde compara ofertas e leva você ao site do parceiro — a compra, o pagamento e a reserva são <strong>deles</strong>. Por isso, cancelamento e reembolso também são tratados por eles. Aqui vai o caminho certo.</p></section>` +
    `<section class="wrap section help-grid">` +
    `<div class="help-group"><h2 class="det-h2">Onde cancelar ou alterar</h2>` +
    `<p>Procure o e-mail de confirmação que você recebeu <strong>do parceiro</strong> (a companhia aérea ou o site de viagens onde você finalizou a compra) no momento da compra — ele traz o link/telefone de atendimento e o localizador da reserva. Quem processou seu pagamento é quem pode estornar ou reemitir.</p>` +
    `<p>Se não achar o e-mail, procure "minha viagem" / "central do cliente" no site onde você comprou, com o mesmo e-mail ou CPF do cadastro.</p></div>` +
    `<div class="help-group"><h2 class="det-h2">O que a lei garante</h2>` +
    `<p>Compras pela internet têm, em geral, <strong>7 dias de direito de arrependimento</strong> a partir da compra (Art. 49 do CDC), sem multa e sem justificar. Para passagem aérea há também a regra da ANAC de <strong>24 horas</strong> de desistência sem multa quando a compra é feita com 7+ dias de antecedência do voo. Qual regra vale pode variar — isto é uma explicação geral, não parecer jurídico; a política definitiva é sempre a mostrada pelo parceiro na compra.</p></div>` +
    `<div class="help-group"><h2 class="det-h2">Quando o Aonde entra</h2>` +
    `<p>Se você comprou por um link do Aonde e o parceiro não responde, ou se a oferta parecia enganosa, fale com a gente — não resolvemos a reserva por você, mas ajudamos a cobrar o parceiro certo e revisamos a oferta.</p>` +
    `<p><strong>${escapeHtml(telLabel())}</strong>, todos os dias · ou <a href="/ajuda">Central de ajuda</a></p></div>` +
    `<div class="help-group"><h2 class="det-h2">Erros de tarifa</h2>` +
    `<p>Ofertas marcadas "Erro de tarifa" são preços fora do padrão que podem ser corrigidos ou cancelados pela própria companhia após a compra — é um risco conhecido desse tipo de achado, não uma promessa de preço. Avisamos isso na oferta; a decisão de honrar é do parceiro.</p></div>` +
    `</section></main>` +
    siteFooter();
  return htmlDocument({ title: "Trocas e cancelamentos · Aonde", body, canonical: "/cancelamentos" });
}

export function renderAlertsPage() {
  const body =
    `<main id="conteudo" tabindex="-1">` +
    `<section class="wrap map-head"><p class="eyebrow eyebrow--green">Sua inscrição</p>` +
    `<h1 class="map-title">Gerenciar meus alertas</h1>` +
    `<p class="map-sub">Alertas de preço chegam só para quem confirmou a inscrição pelo link que enviamos por e-mail. Cancele quando quiser abaixo.</p></section>` +
    `<section class="wrap section">` +
    `<form class="alerts-form" data-unsubscribe action="/api/newsletter/unsubscribe" method="post">` +
    `<input name="email" type="email" required aria-label="Seu e-mail" placeholder="Seu e-mail cadastrado">` +
    `<button class="btn btn-dark" type="submit">Cancelar meus alertas</button>` +
    `<p class="news-msg" data-unsubscribe-msg hidden></p>` +
    `<noscript><p class="help-fine">Ative o JavaScript ou fale com a gente pela Central de ajuda para cancelar.</p></noscript>` +
    `</form>` +
    `<p class="help-fine">Quer mudar a rota ou o preço-alvo em vez de cancelar tudo? Fale com a gente pelo <strong>${escapeHtml(telLabel())}</strong> ou pela <a href="/ajuda">Central de ajuda</a> — ajustamos manualmente por enquanto.</p>` +
    `</section></main>` +
    siteFooter();
  return htmlDocument({ title: "Gerenciar meus alertas · Aonde", body, script: enhancementScript(), canonical: "/alertas" });
}

export function renderNewsletterStatusPage({ ok, error } = {}) {
  const body =
    `<main id="conteudo" tabindex="-1"><section class="wrap map-head status-page">` +
    (ok
      ? `<p class="eyebrow eyebrow--green">Tudo certo</p><h1 class="map-title">Inscrição confirmada!</h1>` +
        `<p class="map-sub">Pronto — você vai receber os próximos achados de passagem que saem da sua cidade. É só ficar de olho no e-mail.</p>` +
        `<p><a class="btn btn-green" href="/ofertas">Ver ofertas de hoje →</a></p>`
      : `<p class="eyebrow eyebrow--green">Ops</p><h1 class="map-title">Não foi possível confirmar</h1>` +
        `<p class="map-sub">${escapeHtml(error || "O link pode ter expirado ou já ter sido usado.")} Tente se inscrever de novo — é rápido.</p>` +
        `<p><a class="btn btn-green" href="/ofertas">Voltar às ofertas →</a></p>`) +
    `</section></main>` +
    siteFooter();
  return htmlDocument({ title: ok ? "Inscrição confirmada · Aonde" : "Confirmação · Aonde", body });
}

// ---------------------------------------------------------------------------
// MAPA — mapa-mundi interativo (Google Maps JavaScript API) com um pin
// clicavel por roteiro. Cada pin abre um balao com o titulo do destino e um
// link para o guia (/guias/:id).
//
// A chave (GOOGLE_MAPS_API_KEY, a MESMA do gerador de roteiros — basta ativar
// a "Maps JavaScript API" no mesmo projeto do Google Cloud) e injetada pelo
// servidor em tempo de request. SEM chave, a pagina cai para uma lista de
// destinos clicavel (ainda util e navegavel) com um aviso de configuracao.
// A chave e restrita por referrer no console do Google — exposta no cliente
// por design, como toda Maps JS key.
// ---------------------------------------------------------------------------

// Destinos com coordenadas, prontos para os pins e para a lista lateral.
function mapDestinos() {
  return GUIDE_LIST.filter((g) => GUIDE_COORDS[g.id]).map((g) => ({
    id: g.id,
    titulo: g.titulo,
    tag: g.tag || "",
    resumo: g.resumo || "",
    preco: g.preco || "",
    lat: GUIDE_COORDS[g.id].lat,
    lng: GUIDE_COORDS[g.id].lng,
    href: `/guias/${g.id}`,
  }));
}

// Lista lateral de destinos: links reais para os guias (funcionam sem JS);
// com o mapa carregado, o clique centraliza o pin e abre o balao.
function mapListHtml(destinos) {
  return destinos
    .map(
      (d, i) =>
        `<a class="map-dest" href="${escapeHtml(d.href)}" data-dest="${i}">` +
        `<span class="map-dest-pin" aria-hidden="true">●</span>` +
        `<span class="map-dest-body"><strong>${escapeHtml(d.titulo)}</strong>` +
        (d.tag ? `<span class="map-dest-tag">${escapeHtml(d.tag)}</span>` : "") +
        `</span>` +
        (d.preco ? `<span class="map-dest-preco">${escapeHtml(d.preco)}</span>` : "") +
        `</a>`
    )
    .join("");
}

export function renderMapPage({ apiKey = "" } = {}) {
  const destinos = mapDestinos();
  const listHtml = mapListHtml(destinos);
  const hasKey = typeof apiKey === "string" && apiKey.trim() !== "";

  const destinosJson = jsonForScript(destinos);

  const head =
    `<section class="wrap map-head">` +
    `<p class="eyebrow eyebrow--green">Explorar o mundo</p>` +
    `<h1 class="map-title">Onde a gente já tem roteiro pronto</h1>` +
    `<p class="map-sub">Navegue o mapa e clique num destino para abrir o roteiro de 5 dias, dia a dia, com onde comer.</p>` +
    `</section>`;

  let panel;
  let script = "";
  if (hasKey) {
    panel =
      `<section class="wrap map-grid">` +
      `<div id="aonde-map" class="map-canvas" role="application" aria-label="Mapa de destinos"></div>` +
      `<aside class="map-list">${listHtml}</aside>` +
      `</section>`;
    script =
      `var AONDE_DESTINOS=${destinosJson};` +
      `function aondeInitMap(){` +
      `var map=new google.maps.Map(document.getElementById("aonde-map"),{center:{lat:-15,lng:-50},zoom:3,mapTypeControl:false,streetViewControl:false,fullscreenControl:false,styles:${AONDE_MAP_STYLE}});` +
      `var iw=new google.maps.InfoWindow();` +
      `var markers=AONDE_DESTINOS.map(function(d){return new google.maps.Marker({position:{lat:d.lat,lng:d.lng},map:map,title:d.titulo,icon:${MAP_PIN_ICON_JS}});});` +
      `function openDest(i){var d=AONDE_DESTINOS[i];var el=document.createElement("div");el.className="map-iw";` +
      `var h=document.createElement("strong");h.textContent=d.titulo;el.appendChild(h);` +
      `if(d.tag){var t=document.createElement("span");t.className="map-iw-tag";t.textContent=d.tag;el.appendChild(t);}` +
      `if(d.resumo){var r=document.createElement("span");r.className="map-iw-resumo";r.textContent=d.resumo;el.appendChild(r);}` +
      `var a=document.createElement("a");a.href=d.href;a.className="map-iw-link";a.textContent="Ler o roteiro \\u2192";el.appendChild(a);` +
      `iw.setContent(el);iw.open(map,markers[i]);map.panTo(markers[i].getPosition());}` +
      `markers.forEach(function(m,i){m.addListener("click",function(){openDest(i);});});` +
      `document.querySelectorAll("[data-dest]").forEach(function(li){li.addEventListener("click",function(e){e.preventDefault();openDest(+li.getAttribute("data-dest"));});});` +
      `}` +
      `window.gm_authFailure=function(){var c=document.getElementById("aonde-map");if(c){c.classList.add("map-canvas--err");c.innerHTML="";var p=document.createElement("p");p.className="map-canvas-msg";p.textContent="Não foi possível carregar o mapa (verifique a chave e a Maps JavaScript API). A lista ao lado continua funcionando.";c.appendChild(p);}};`;
  } else {
    panel =
      `<section class="wrap map-grid map-grid--nokey">` +
      `<div class="map-canvas map-canvas--placeholder">` +
      `<div class="media-placeholder">${placeholderSvgMarkup("Mapa dos destinos")}</div>` +
      `<p class="map-canvas-msg">Mapa interativo do Google — defina <code>GOOGLE_MAPS_API_KEY</code> (e ative a <em>Maps JavaScript API</em>) para navegar o mundo aqui. Enquanto isso, os destinos abaixo já abrem os roteiros.</p>` +
      `</div>` +
      `<aside class="map-list">${listHtml}</aside>` +
      `</section>`;
  }

  const body = `<main id="conteudo" tabindex="-1">${head}${panel}</main>${siteFooter()}`;

  const loader = hasKey
    ? `<script async src="https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
        apiKey.trim()
      )}&callback=aondeInitMap&loading=async"></script>`
    : "";

  return htmlDocument({ title: "Mapa de destinos · Aonde", body, script, canonical: "/mapa" }) .replace(
    "</body>",
    `${loader}</body>`
  );
}

// ---------------------------------------------------------------------------
// JS de realce (progressive enhancement) — carrossel do hero, abas e a
// submissao AJAX da newsletter. As paginas funcionam SEM ele (links/forms
// reais); o script apenas melhora a experiencia.
// ---------------------------------------------------------------------------

function enhancementScript() {
  return `(function(){
  var bgs=document.querySelectorAll('[data-hero]');
  var tabs=document.querySelectorAll('[data-hero-tab]');
  var leg=document.querySelector('[data-hero-legenda]');
  if(bgs.length>1){
    var i=0;
    function show(n){
      i=n;
      bgs.forEach(function(b,k){b.classList.toggle('is-active',k===n);});
      tabs.forEach(function(t,k){t.classList.toggle('is-active',k===n);});
    }
    // WCAG 2.2.2 (Pause, Stop, Hide): movimento automatico precisa (a) respeitar
    // prefers-reduced-motion, (b) parar quando a pessoa escolhe um slide na mao
    // e (c) ter um controle de pausa de verdade.
    var pausa=document.querySelector('[data-hero-pause]');
    var mq=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)');
    var reduz=!!(mq&&mq.matches);
    // 0 = parado (setInterval sempre devolve id positivo no navegador). O
    // sentinela e 0 de proposito: os testes varrem o HTML atras de palavras
    // vazadas de template quebrado, e este script vai inteiro no HTML.
    var timer=0;
    function rodando(){return timer!==0;}
    function sinaliza(){
      if(!pausa)return;
      pausa.setAttribute('aria-pressed',rodando()?'false':'true');
      pausa.setAttribute('aria-label',rodando()?'Pausar troca automática de fotos':'Retomar troca automática de fotos');
      pausa.textContent=rodando()?'Pausar':'Retomar';
    }
    function liga(){ if(timer===0){timer=setInterval(function(){show((i+1)%bgs.length);},5500);} sinaliza(); }
    function para(){ if(timer!==0){clearInterval(timer);timer=0;} sinaliza(); }
    // Escolha manual manda: para o carrossel em vez de brigar com a pessoa.
    tabs.forEach(function(t,k){t.addEventListener('click',function(){para();show(k);});});
    if(pausa){pausa.addEventListener('click',function(){rodando()?para():liga();});}
    if(reduz){para();}else{liga();}
    // Se a preferencia mudar com a pagina aberta, obedece na hora.
    if(mq&&mq.addEventListener){mq.addEventListener('change',function(e){e.matches?para():liga();});}
  }
  // Alternador de tema claro/escuro (persistido em localStorage). O CSS puro
  // ja cobre "prefers-color-scheme" sozinho; aqui so tratamos a ESCOLHA
  // manual — ler o que esta salvo, aplicar no <html>, e o clique do botao.
  var temaBtn=document.querySelector('[data-tema-toggle]');
  if(temaBtn){
    var temaIco=temaBtn.querySelector('[data-tema-toggle-ico]');
    var temaLabel=temaBtn.querySelector('[data-tema-toggle-label]');
    var temaMq=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)');
    function temaSalvo(){
      var v=0;
      try{v=localStorage.getItem('aonde-tema')||0;}catch(e){v=0;}
      return (v==='claro'||v==='escuro')?v:0;
    }
    function temaEfetivo(){
      var salvo=temaSalvo();
      if(salvo)return salvo;
      return (temaMq&&temaMq.matches)?'escuro':'claro';
    }
    function temaAplica(t){
      document.documentElement.setAttribute('data-tema',t);
      var proximo=t==='escuro'?'claro':'escuro';
      temaBtn.setAttribute('aria-pressed',t==='escuro'?'true':'false');
      temaBtn.setAttribute('aria-label','Mudar para o tema '+proximo);
      if(temaIco)temaIco.textContent=t==='escuro'?'☀️':'🌙';
      if(temaLabel)temaLabel.textContent=t==='escuro'?'Claro':'Escuro';
    }
    temaAplica(temaEfetivo());
    temaBtn.addEventListener('click',function(){
      var novo=temaEfetivo()==='escuro'?'claro':'escuro';
      try{localStorage.setItem('aonde-tema',novo);}catch(e){}
      temaAplica(novo);
    });
    // Se a pessoa nunca escolheu no site (nada salvo) e o sistema mudar de
    // tema com a pagina aberta, acompanha — mesma logica do carrossel acima.
    if(temaMq&&temaMq.addEventListener){
      temaMq.addEventListener('change',function(){ if(!temaSalvo())temaAplica(temaEfetivo()); });
    }
  }
  // Filtro de roteiros do /guias. Compara o que foi digitado (sem acento)
  // com o palheiro que o servidor ja montou em data-rot-busca. Esconde
  // cartao por cartao — nao reescreve a lista, entao a ordem nunca muda.
  var buscaCx=document.querySelector('[data-guia-busca]');
  if(buscaCx){
    var buscaCampo=buscaCx.querySelector('[data-guia-busca-campo]');
    var buscaConta=buscaCx.querySelector('[data-guia-busca-conta]');
    var rotCards=[].slice.call(document.querySelectorAll('.rot-card[data-rot-busca]'));
    if(buscaCampo&&rotCards.length){
      buscaCx.removeAttribute('hidden');
      var semAc=function(s){
        return String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim();
      };
      var filtra=function(){
        var q=semAc(buscaCampo.value);
        var vis=0;
        rotCards.forEach(function(c){
          var bate=!q||String(c.getAttribute('data-rot-busca')||'').indexOf(q)!==-1;
          if(bate){c.removeAttribute('hidden');vis++;}
          else{c.setAttribute('hidden','');}
        });
        if(!buscaConta)return;
        if(!q){buscaConta.textContent='';return;}
        // Contagem falada em voz alta para leitor de tela (role=status), e o
        // caso zero diz o que fazer em vez de so mostrar lista vazia.
        buscaConta.textContent=vis===0
          ?'Nenhum roteiro com "'+buscaCampo.value.trim()+'". Apague o texto para ver os '+rotCards.length+' roteiros.'
          :(vis===1?'1 roteiro encontrado':vis+' roteiros encontrados');
      };
      buscaCampo.addEventListener('input',filtra);
      // Esc limpa o campo e devolve a lista inteira.
      buscaCampo.addEventListener('keydown',function(e){
        if(e.key==='Escape'&&buscaCampo.value){buscaCampo.value='';filtra();}
      });
      filtra();
    }
  }
  // Pode haver mais de um form de captura por pagina (hero + faixa + widget de rota).
  document.querySelectorAll('[data-newsletter]').forEach(function(form){
    var msg=form.querySelector('[data-newsletter-msg]');
    form.addEventListener('submit',function(ev){
      ev.preventDefault();
      var body={email:form.email.value};
      if(form.whatsapp&&form.whatsapp.value)body.whatsapp=form.whatsapp.value;
      if(form.origem&&form.origem.value)body.origem=form.origem.value;
      if(form.destino&&form.destino.value)body.destino=form.destino.value;
      if(form.precoAlvoCentavos&&form.precoAlvoCentavos.value)body.precoAlvoCentavos=Number(form.precoAlvoCentavos.value);
      fetch(form.action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
        .then(function(r){return r.json();})
        .then(function(d){
          if(msg){
            msg.hidden=false;
            if(d.status==='already_confirmed'){msg.textContent='Você já está inscrito! Fique de olho no e-mail.';}
            else if(d.status){msg.textContent='Quase lá! Confira seu e-mail e clique no link para confirmar.';}
            else{msg.textContent=d.error||'Não foi possível inscrever agora. Tente novamente.';}
          }
          if(d.status)form.reset();
        })
        .catch(function(){if(msg){msg.hidden=false;msg.textContent='Falha de conexão. Tente novamente.';}});
    });
  });
  // Formulario de descadastro (/alertas).
  var unsub=document.querySelector('[data-unsubscribe]');
  if(unsub){
    var umsg=unsub.querySelector('[data-unsubscribe-msg]');
    unsub.addEventListener('submit',function(ev){
      ev.preventDefault();
      fetch(unsub.action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:unsub.email.value})})
        .then(function(r){return r.json();})
        .then(function(){if(umsg){umsg.hidden=false;umsg.textContent='Pronto — se o e-mail estava inscrito, foi cancelado.';}unsub.reset();})
        .catch(function(){if(umsg){umsg.hidden=false;umsg.textContent='Falha de conexão. Tente de novo mais tarde.';}});
    });
  }
  // Filtros de voo (/resultados): paradas, companhias e horario filtram de
  // verdade a lista ja renderizada — cada checkbox carrega data-ftype/data-fval
  // (montados no servidor a partir do proprio rotulo) e cada voo carrega
  // data-stops/data-cia/data-hora. Sem nenhum voo casando um grupo, o grupo
  // simplesmente nao filtra (nenhuma opcao marcada = grupo nao restringe).
  var caixas=document.querySelectorAll('[data-res-filtro]');
  var voosEls=document.querySelectorAll('[data-res-voo]');
  if(caixas.length&&voosEls.length){
    var contador=document.querySelector('[data-res-count]');
    var vazio=document.querySelector('[data-res-vazio]');
    function bateParadas(marcados,stops){
      var i;
      for(i=0;i<marcados.length;i++){
        var aberto=marcados[i].indexOf('+')!==-1;
        var min=parseInt(marcados[i],10);
        if(aberto?stops>=min:stops===min)return true;
      }
      return false;
    }
    function bateHorario(marcados,hora){
      var i;
      for(i=0;i<marcados.length;i++){
        var partes=marcados[i].split('-');
        var ini=parseInt(partes[0],10);
        var fim=parseInt(partes[1],10);
        if(fim<=ini)fim+=24;
        var h=hora<ini?hora+24:hora;
        if(h>=ini&&h<fim)return true;
      }
      return false;
    }
    function aplicaFiltros(){
      var grupos={};
      caixas.forEach(function(cb){
        var t=cb.getAttribute('data-ftype');
        if(!grupos[t])grupos[t]=[];
        if(cb.checked)grupos[t].push(cb.getAttribute('data-fval'));
      });
      var visiveis=0;
      voosEls.forEach(function(art){
        var ok=true;
        Object.keys(grupos).forEach(function(t){
          var marcados=grupos[t];
          if(!marcados.length)return;
          if(t==='paradas'){ok=ok&&bateParadas(marcados,Number(art.getAttribute('data-stops')));}
          else if(t==='cia'){ok=ok&&marcados.indexOf(art.getAttribute('data-cia'))!==-1;}
          else if(t==='horario'){ok=ok&&bateHorario(marcados,Number(art.getAttribute('data-hora')));}
        });
        art.hidden=!ok;
        if(ok)visiveis++;
      });
      if(contador)contador.textContent=visiveis+' voos de exemplo · ordenar por';
      if(vazio)vazio.hidden=visiveis!==0;
    }
    caixas.forEach(function(cb){cb.addEventListener('change',aplicaFiltros);});
    aplicaFiltros();
  }
})();`;
}

// ---------------------------------------------------------------------------
// CSS — reproduz os Design Tokens e o layout do prototipo (cores, tipografia,
// raios, sombras). Instrument Serif nos titulos, Archivo no corpo; fallback
// garantido caso as Google Fonts nao carreguem.
// ---------------------------------------------------------------------------

let _pageStylesCache = null;
function pageStyles() {
  if (_pageStylesCache !== null) return _pageStylesCache;
  _pageStylesCache = `
  :root{
    /* Cinzas escurecidos de proposito: dao folga de contraste para o cenario
       das estacoes aparecer no fundo sem derrubar a legibilidade (AA). */
    --bg:#f7f7f5;--text:#18181b;--muted:#4f4f48;--muted-2:#50504a;
    --border:#e7e7e3;--border-2:#c9c9c2;--tint:#f1f8e4;--tint-border:#d9edb8;--dark:#18181b;
    --green:#4d7c0f;--green-2:#3f6212;--lime:#84cc16;--lime-2:#a3e635;--on-green:#fff;
    --erro-bg:#fde3cf;--erro-text:#9a3412;
    /* Superficies (cartoes/inputs) e o par "inverso" (chip solido de maximo
       contraste, usado em botao escuro/estado ativo) — em modo claro e
       quase-preto sobre quase-branco; em escuro, invertemos os dois. */
    --surface:#fff;--input-bg:#fbfbfa;--bg-rgb:247,247,245;
    --invert-bg:#18181b;--invert-bg-hover:#2d2d29;--invert-text:#fff;
    /* Veu do fundo 3D das estacoes: cor + 3 paradas de opacidade, separadas
       para poder escurecer mais no tema escuro sem mudar o desenho do gradiente. */
    --veil-rgb:247,247,245;--veil-a1:.30;--veil-a2:.44;--veil-a3:.36;
    /* Tratamento de risco (erro de tarifa) — paleta laranja/marrom, deliberadamente
       fora do verde/lime da marca para não parecer "mais uma promoção". */
    --risk-bg:#fff7ed;--risk-border:#fed7aa;--risk-note-bg:#ffedd5;--risk-text:#9a3412;--risk-line:#f97316;
    --serif:"Instrument Serif",Georgia,"Times New Roman",serif;
    --sans:"Archivo",system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;
    --maxw:1200px;--r:16px;--r-lg:20px;--pill:999px;
  }
  /* --- Tema escuro ---------------------------------------------------------
     1) @media respeita a preferencia do sistema (prefers-color-scheme) quando
        a pessoa nunca escolheu nada no site.
     2) [data-tema="escuro"|"claro"] e a escolha manual (botao no cabecalho,
        persistida em localStorage) — como o seletor de atributo tem mais
        especificidade que o ":root" sozinho do bloco @media, a escolha manual
        sempre vence, em qualquer sentido, sem precisar de :not(). */
  @media (prefers-color-scheme:dark){
    :root{
      --bg:#131315;--text:#f2f2ef;--muted:#b9b9b0;--muted-2:#c9c9c0;
      --border:#303034;--border-2:#46464b;--tint:#16210c;--tint-border:#2f4a1a;
      --green:#84cc16;--green-2:#a3e635;--on-green:#18181b;
      --erro-bg:#fde3cf;--erro-text:#9a3412;
      --surface:#1c1c1f;--input-bg:#232326;--bg-rgb:19,19,21;
      --invert-bg:#f2f2ef;--invert-bg-hover:#e2e2dc;--invert-text:#18181b;
      --veil-rgb:10,10,9;--veil-a1:.55;--veil-a2:.70;--veil-a3:.62;
      --risk-bg:#2a1608;--risk-border:#7c3a12;--risk-note-bg:#341507;--risk-text:#ffd9b3;--risk-line:#fb923c;
    }
  }
  :root[data-tema="escuro"]{
    --bg:#131315;--text:#f2f2ef;--muted:#b9b9b0;--muted-2:#c9c9c0;
    --border:#303034;--border-2:#46464b;--tint:#16210c;--tint-border:#2f4a1a;
    --green:#84cc16;--green-2:#a3e635;--on-green:#18181b;
    /* Estavam so no bloco do @media: quem escolhia escuro NO BOTAO ficava com
       o selo de "Erro de tarifa" nas cores do tema claro. Os dois caminhos
       para o escuro tem de dar exatamente no mesmo lugar. */
    --erro-bg:#fde3cf;--erro-text:#9a3412;
    --surface:#1c1c1f;--input-bg:#232326;--bg-rgb:19,19,21;
    --invert-bg:#f2f2ef;--invert-bg-hover:#e2e2dc;--invert-text:#18181b;
    --veil-rgb:10,10,9;--veil-a1:.55;--veil-a2:.70;--veil-a3:.62;
    --risk-bg:#2a1608;--risk-border:#7c3a12;--risk-note-bg:#341507;--risk-text:#ffd9b3;--risk-line:#fb923c;
  }
  :root[data-tema="claro"]{
    --bg:#f7f7f5;--text:#18181b;--muted:#4f4f48;--muted-2:#50504a;
    --border:#e7e7e3;--border-2:#c9c9c2;--tint:#f1f8e4;--tint-border:#d9edb8;
    --green:#4d7c0f;--green-2:#3f6212;--on-green:#fff;
    --surface:#fff;--input-bg:#fbfbfa;--bg-rgb:247,247,245;
    --invert-bg:#18181b;--invert-bg-hover:#2d2d29;--invert-text:#fff;
    --veil-rgb:247,247,245;--veil-a1:.30;--veil-a2:.44;--veil-a3:.36;
    --risk-bg:#fff7ed;--risk-border:#fed7aa;--risk-note-bg:#ffedd5;--risk-text:#9a3412;--risk-line:#f97316;
  }
  *{box-sizing:border-box;}
  html,body{margin:0;padding:0;}
  body{background:var(--bg);color:var(--text);font-family:var(--sans);line-height:1.55;-webkit-font-smoothing:antialiased;transition:background-color .15s,color .15s;}
  h1,h2,h3{font-family:var(--serif);font-weight:400;line-height:1.08;margin:0;letter-spacing:-.5px;}
  a{color:var(--green);text-decoration:none;}
  a:hover{color:var(--green-2);}
  a:focus-visible,button:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible,[tabindex]:focus-visible{outline:3px solid var(--lime);outline-offset:2px;border-radius:4px;}
  @media (prefers-reduced-motion:reduce){*{animation-duration:.001ms!important;transition-duration:.001ms!important;}}
  img{max-width:100%;display:block;}
  .wrap{max-width:var(--maxw);margin:0 auto;padding:0 32px;}
  .media-img{width:100%;height:100%;object-fit:cover;}
  .media-placeholder{width:100%;height:100%;}
  .media-placeholder svg{width:100%;height:100%;display:block;}
  .media-credit-overlay{position:absolute;top:10px;right:12px;background:rgba(24,24,27,.55);color:#fff;font-size:11px;padding:3px 9px;border-radius:var(--pill);}
  .media-credit-overlay a{color:#fff;text-decoration:underline;}
  .eyebrow{margin:0 0 12px;font-size:13px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;}
  .eyebrow--green{color:var(--green);}
  .eyebrow--lime{color:var(--lime-2);}
  .section{padding:72px 32px 0;}
  .section-sub{margin:12px 0 0;font-size:17px;color:var(--muted);max-width:56ch;}
  .section-title-wide{font-size:clamp(30px,4.5vw,44px);max-width:600px;line-height:1.08;margin-bottom:8px;}
  .section-head{display:flex;align-items:baseline;justify-content:space-between;gap:16px;flex-wrap:wrap;}
  .section-head h2{font-size:40px;}
  .section-head p{margin:10px 0 0;font-size:16px;color:var(--muted);}
  .section-head--tight{margin-bottom:24px;}
  .section-link{font-size:15px;font-weight:600;}
  .breadcrumb{margin:0 0 20px;font-size:14px;color:var(--muted-2);}
  .breadcrumb span{color:var(--muted);}

  .btn{display:inline-block;border:none;border-radius:12px;padding:13px 22px;font-family:var(--sans);font-size:15px;font-weight:700;cursor:pointer;text-align:center;transition:background .15s,border-color .15s;}
  .btn-green{background:var(--green);color:var(--on-green);}
  .btn-green:hover{background:var(--green-2);color:#fff;}
  .btn-lime{background:var(--lime-2);color:#18181b;}
  .btn-lime:hover{background:#bef264;color:#18181b;}
  .btn-dark{background:#18181b;color:#fff;border-radius:var(--pill);padding:10px 20px;font-size:14px;font-weight:600;}
  .btn-dark:hover{background:#2d2d29;color:#fff;}
  .btn-ghost{background:transparent;color:#f7f7f5;border:1px solid #3f3f42;}
  .btn-ghost:hover{border-color:var(--lime-2);color:#f7f7f5;}

  /* ---- Cenario 3D das estacoes (fundo fixo de toda a pagina) ----
     Fica atras do conteudo; o conteudo sobe para z-index 1. O veu por cima
     garante que o texto continue legivel sobre qualquer estacao. */
  .seasons3d{position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden;}
  main,.site-footer{position:relative;z-index:1;}
  .s3-season{position:absolute;inset:0;opacity:0;
    /* a perspectiva mora AQUI: opacity<1 achataria um preserve-3d de fora */
    perspective:900px;
    animation:s3Fade 72s linear infinite both;}
  .s3-stage{position:absolute;inset:0;transform-style:preserve-3d;
    animation:s3Sway 46s ease-in-out infinite alternate;}
  .s3-orb{position:absolute;border-radius:50%;}
  .s3-sun{position:absolute;border-radius:50%;transform:translate(-50%,-50%);}
  .s3-horizon{position:absolute;left:0;right:0;bottom:0;height:38%;}
  @keyframes s3Fade{
    0%,18%{opacity:1;}
    25%,93%{opacity:0;}
    100%{opacity:1;}
  }
  @keyframes s3Sway{
    from{transform:rotateY(-5deg) rotateX(1.5deg) translateZ(0);}
    to{transform:rotateY(5deg) rotateX(-1.5deg) translateZ(40px);}
  }
  .s3-motes{position:absolute;inset:0;}
  .s3-mote{position:absolute;bottom:-8px;border-radius:50%;background:rgba(255,255,255,.85);
    box-shadow:0 0 6px 1px rgba(255,255,255,.5);opacity:0;
    animation-name:s3Rise;animation-timing-function:linear;animation-iteration-count:infinite;}
  @keyframes s3Rise{
    0%{transform:translateY(0) translateX(0);opacity:0;}
    12%{opacity:.75;}
    88%{opacity:.55;}
    100%{transform:translateY(-102vh) translateX(26px);opacity:0;}
  }
  /* Veu de legibilidade: sem ele o texto cinza claro brigaria com a cena. */
  .s3-veil{position:absolute;inset:0;
    background:linear-gradient(180deg,rgba(var(--veil-rgb),var(--veil-a1)) 0%,rgba(var(--veil-rgb),var(--veil-a2)) 42%,rgba(var(--veil-rgb),var(--veil-a3)) 100%);}
  @media (prefers-reduced-motion:reduce){
    /* Nada se move: fica so a estacao atual, parada. */
    .s3-season{animation:none;}
    .s3-season:first-child{opacity:1;}
    .s3-stage{animation:none;}
    .s3-motes{display:none;}
  }

  /* Pular para o conteudo: invisivel ate receber foco pelo teclado. Evita
     percorrer as ~8 paradas do cabecalho em CADA pagina. */
  .skip-link{position:absolute;left:12px;top:-100px;z-index:100;background:#365314;color:#fff;
    padding:12px 20px;border-radius:0 0 12px 12px;font-weight:700;font-size:15px;transition:top .15s;}
  .skip-link:focus{top:0;color:#fff;}
  main:focus{outline:none;}

  /* Controle de pausa do carrossel do hero (WCAG 2.2.2) */
  .hero-pause{align-self:center;background:rgba(24,24,27,.55);color:#f7f7f5;border:1px solid rgba(247,247,245,.35);
    border-radius:var(--pill);padding:6px 14px;font-family:var(--sans);font-size:12px;font-weight:600;
    cursor:pointer;margin-left:8px;transition:background .15s;}
  .hero-pause:hover{background:rgba(24,24,27,.8);}

  /* Header */
  .site-header{position:sticky;top:0;z-index:50;background:rgba(var(--bg-rgb),.92);backdrop-filter:blur(12px);border-bottom:1px solid var(--border);}
  .site-header-in{height:68px;display:flex;align-items:center;justify-content:space-between;gap:24px;}
  /* --brand-fly = distancia do "a" ate o CENTRO do ponto lime (medida no
     navegador: centro do ponto a 76px da borda esquerda da marca, menos os
     7px de meio-aviao e o -1px de offset inicial). */
  .brand{display:flex;align-items:baseline;gap:3px;color:var(--text);position:relative;--brand-fly:70px;}
  .brand:hover{color:var(--text);}
  .brand-word{font-family:var(--serif);font-size:30px;letter-spacing:-.5px;}
  .brand-dot{width:8px;height:8px;border-radius:50%;background:var(--lime);display:inline-block;transform:translateY(-2px);
    animation:brandLand .9s ease-out 2.5s 1 both;}
  /* Aviao da marca: decola no "a", pousa no ponto depois do "e". */
  .brand-plane{position:absolute;left:-1px;top:50%;width:14px;height:14px;margin-top:-13px;
    color:var(--green);opacity:0;pointer-events:none;
    animation:brandFly 2.7s cubic-bezier(.38,.02,.28,1) .3s 1 both;}
  .brand-plane svg{display:block;width:100%;height:100%;fill:currentColor;}
  @keyframes brandFly{
    0%{opacity:0;transform:translate(0,7px) rotate(-16deg) scale(.65);}
    14%{opacity:1;}
    62%{transform:translate(calc(var(--brand-fly) * .66),-8px) rotate(-5deg) scale(1);}
    88%{opacity:1;transform:translate(var(--brand-fly),-2px) rotate(0deg) scale(.85);}
    100%{opacity:0;transform:translate(var(--brand-fly),-2px) rotate(0deg) scale(.75);}
  }
  @keyframes brandLand{
    0%,55%{transform:translateY(-2px) scale(1);box-shadow:0 0 0 0 rgba(132,204,22,0);}
    72%{transform:translateY(-2px) scale(1.6);box-shadow:0 0 0 5px rgba(132,204,22,.22);}
    100%{transform:translateY(-2px) scale(1);box-shadow:0 0 0 0 rgba(132,204,22,0);}
  }
  @media (prefers-reduced-motion:reduce){
    .brand-plane{display:none;}
    .brand-dot{animation:none;}
  }
  .site-nav{display:flex;gap:28px;font-size:15px;font-weight:500;}
  .site-nav a{color:var(--muted);display:flex;align-items:center;gap:6px;}
  .site-nav a:hover{color:#18181b;}
  .nav-pill{background:var(--lime);color:#18181b;font-size:10px;font-weight:700;letter-spacing:.04em;padding:2px 6px;border-radius:var(--pill);}
  .nav-ext{font-size:12px;opacity:.6;}
  .site-header-right{display:flex;align-items:center;gap:20px;}
  .site-atend{display:flex;flex-direction:column;align-items:flex-end;line-height:1.25;}
  .site-atend span{font-size:11px;color:var(--muted-2);letter-spacing:.04em;text-transform:uppercase;}
  .site-atend strong{font-size:14px;font-weight:600;}

  /* Hero */
  .hero{position:relative;height:620px;overflow:hidden;background:#18181b;}
  .hero-bgs{position:absolute;inset:0;}
  .hero-bg{position:absolute;inset:0;opacity:0;transition:opacity 1.2s ease;}
  .hero-bg.is-active{opacity:1;}
  .hero-scrim{position:absolute;inset:0;background:linear-gradient(90deg,rgba(24,24,27,.82) 0%,rgba(24,24,27,.55) 40%,rgba(24,24,27,.15) 100%);}
  .hero-in{position:relative;height:100%;display:flex;flex-direction:column;justify-content:center;}
  .hero-title{font-size:clamp(40px,7vw,76px);color:#fbfbfa;max-width:760px;line-height:1;text-shadow:0 2px 30px rgba(0,0,0,.35);}
  .hero-title em{font-style:italic;}
  .hero-sub{margin:22px 0 0;font-size:19px;color:#e7e7e3;max-width:520px;line-height:1.5;}
  .hero-tabs{display:flex;gap:20px;margin-top:32px;}
  .hero-tab{background:transparent;border:none;padding:0;cursor:pointer;display:flex;flex-direction:column;gap:8px;opacity:.5;transition:opacity .3s;}
  .hero-tab.is-active{opacity:1;}
  .hero-tab span:first-child{font-size:14px;font-weight:600;color:#fbfbfa;}
  .hero-bar{width:40%;height:3px;border-radius:2px;background:var(--lime-2);transition:width .4s;}
  .hero-tab.is-active .hero-bar{width:100%;}
  .hero-legenda{position:absolute;bottom:20px;right:32px;background:rgba(24,24,27,.6);backdrop-filter:blur(8px);color:#f7f7f5;border-radius:12px;padding:9px 15px;font-size:13px;font-weight:600;}

  /* Search card */
  .search-wrap{margin-top:-52px;position:relative;z-index:10;padding-bottom:24px;}
  .search-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-lg);box-shadow:0 24px 48px -32px rgba(24,24,27,.25);overflow:hidden;}
  .sc-tabs{display:flex;gap:4px;padding:12px 16px 0;border-bottom:1px solid var(--border);}
  .sc-tab{font-size:14px;font-weight:600;color:var(--muted);padding:10px 18px;border-radius:10px 10px 0 0;border-bottom:2px solid transparent;}
  .sc-tab.is-active{background:var(--tint);color:var(--green-2);border-bottom-color:var(--green);}
  .sc-tab--soon{opacity:.45;cursor:not-allowed;}
  .sc-tab--soon::after{content:" · em breve";font-size:11px;font-weight:400;}
  /* Aviso "como funciona por aqui": tom informativo (verde da marca, nao
     laranja/vermelho de alerta) com um icone circular no lugar de comecar a
     frase com uma negativa — a mesma informacao, com menos susto. */
  .sc-notice{margin:14px 20px 0;display:flex;align-items:flex-start;gap:10px;background:var(--tint);border:1px solid var(--tint-border);border-radius:12px;padding:12px 16px;font-size:14px;line-height:1.5;color:var(--green-2);}
  .sc-notice::before{content:"i";flex:0 0 auto;width:20px;height:20px;border-radius:50%;background:var(--green);color:#fff;font-family:Georgia,serif;font-style:italic;font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:center;line-height:1;margin-top:1px;}
  .sc-notice-tag{display:block;font-weight:700;}
  .sc-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;padding:20px;align-items:end;}
  .sc-field{display:flex;flex-direction:column;gap:6px;}
  .sc-field span{font-size:12px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--muted-2);}
  .sc-field input{border:1px solid var(--border-2);border-radius:12px;padding:13px 14px;font-family:var(--sans);font-size:15px;background:var(--input-bg);color:#18181b;}
  .sc-submit{min-width:150px;white-space:nowrap;}
  .sc-field--num{min-width:0;}
  .sc-field select{border:1px solid var(--border-2);border-radius:12px;padding:13px 14px;
    font-family:var(--sans);font-size:15px;background:var(--input-bg);color:#18181b;width:100%;}
  .sc-hint{font-size:11px;color:var(--muted-2);line-height:1.3;}
  .search-perks{display:flex;gap:28px;padding:18px 8px 0;font-size:14px;color:var(--muted);flex-wrap:wrap;}
  .search-perks span{display:flex;align-items:center;gap:8px;}
  .search-perks i{width:6px;height:6px;border-radius:50%;background:var(--lime);}

  /* Offer cards */
  .of-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:20px;margin-top:28px;}
  .of-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);overflow:hidden;display:flex;flex-direction:column;color:inherit;transition:box-shadow .2s,transform .2s;}
  .of-card:hover{box-shadow:0 16px 32px -24px rgba(24,24,27,.35);transform:translateY(-2px);color:inherit;}
  .of-card--erro{border-color:#f3c6a8;}
  .of-media{position:relative;height:160px;}
  .of-media-inner{width:100%;height:100%;}
  .of-badge{position:absolute;top:12px;left:12px;font-size:12px;font-weight:700;padding:5px 12px;border-radius:var(--pill);}
  .badge-desconto{background:var(--lime);color:#18181b;}
  .badge-erro{background:var(--erro-bg);color:var(--erro-text);}
  .of-publicado{position:absolute;top:12px;right:12px;background:rgba(24,24,27,.72);color:#f7f7f5;font-size:12px;font-weight:600;padding:4px 10px;border-radius:var(--pill);}
  .of-body{padding:16px 18px 18px;display:flex;flex-direction:column;gap:5px;flex:1;}
  .of-rota{font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--muted-2);}
  .of-cidade{font-size:20px;font-weight:600;font-family:var(--sans);letter-spacing:-.2px;}
  .of-periodo{font-size:13px;color:var(--muted);}
  .of-preco-row{display:flex;align-items:baseline;gap:8px;margin-top:auto;padding-top:8px;flex-wrap:wrap;}
  .of-de s{font-size:14px;color:var(--muted);}
  .of-preco{font-size:30px;font-weight:700;color:var(--green-2);letter-spacing:-.5px;}
  .of-preco--sm{font-size:23px;margin-left:auto;}
  .of-iv{font-size:13px;color:var(--muted-2);}
  .of-cia{font-size:13px;color:var(--muted);}
  .of-erro-note{font-size:12px;line-height:1.4;color:#9a3412;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:6px 9px;margin-top:2px;}
  .of-cta{margin-top:8px;font-size:14px;font-weight:700;color:var(--green);}

  /* Styles / estilos de viagem */
  .styles-grid{display:grid;grid-template-columns:1fr 1.1fr;gap:56px;margin-top:40px;align-items:start;}
  .style-item{padding:36px 0;border-top:1px solid var(--border);opacity:.55;}
  .style-item.is-active{opacity:1;}
  .style-num{font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--green);}
  .style-item h3{margin:12px 0 10px;font-size:32px;}
  .style-item p{margin:0 0 18px;font-size:16px;line-height:1.6;color:var(--muted);}
  .chips{display:flex;gap:8px;flex-wrap:wrap;}
  .chip{border:1px solid var(--border-2);background:var(--surface);border-radius:var(--pill);padding:7px 14px;font-size:13px;font-weight:600;color:var(--muted);}
  .style-cta{margin:18px 0 0;}
  .styles-imgs{position:sticky;top:96px;height:560px;}
  .style-img{position:absolute;inset:0;opacity:0;transition:opacity .5s;border-radius:24px;overflow:hidden;}
  .style-img.is-active{opacity:1;}
  .style-legenda{position:absolute;bottom:16px;right:16px;background:rgba(24,24,27,.75);color:#f7f7f5;border-radius:12px;padding:9px 15px;font-size:13px;font-weight:600;}

  /* Roteiros (revista) */
  .roteiros{background:#18181b;color:#f7f7f5;margin-top:56px;position:relative;overflow:hidden;}
  .roteiros .wrap{padding-top:72px;padding-bottom:72px;position:relative;z-index:1;}

  /* Globo 3D de arame (CSS 3D puro, sem canvas/WebGL) */
  .globe3d{position:absolute;top:56px;right:-40px;width:192px;height:192px;z-index:0;
    perspective:620px;opacity:.4;pointer-events:none;}
  .g3-inner{position:absolute;inset:0;transform-style:preserve-3d;will-change:transform;
    animation:g3Spin 34s linear infinite;}
  .g3-mer,.g3-par{position:absolute;border:1px solid var(--lime);border-radius:50%;}
  .g3-mer{inset:0;}
  .g3-par{top:50%;left:50%;border-color:rgba(163,230,53,.55);}
  .g3-orbit{position:absolute;inset:0;transform:rotateX(74deg);transform-style:preserve-3d;}
  .g3-orbit-spin{position:absolute;inset:0;transform-style:preserve-3d;animation:g3Spin 11s linear infinite reverse;}
  .g3-orbit-dot{position:absolute;top:50%;left:50%;width:7px;height:7px;margin:-3.5px 0 0 -3.5px;
    border-radius:50%;background:var(--lime-2);box-shadow:0 0 10px 2px rgba(163,230,53,.65);
    transform:translateX(112px);}
  @keyframes g3Spin{from{transform:rotateY(0deg);}to{transform:rotateY(360deg);}}
  @media (max-width:900px){ .globe3d{display:none;} }

  /* Profundidade 3D do hero: a foto ativa deriva lentamente no eixo Z. */
  .hero{perspective:1000px;}
  .hero-bgs{transform-style:preserve-3d;}
  .hero-bg.is-active{animation:heroDrift 22s ease-in-out infinite alternate;}
  @keyframes heroDrift{
    from{transform:translateZ(0) scale(1.02) rotate(0deg);}
    to{transform:translateZ(52px) scale(1.02) rotate(.6deg);}
  }

  @media (prefers-reduced-motion:reduce){
    .globe3d{display:none;}
    .hero-bg.is-active{animation:none;}
  }
  .roteiros-head h2{font-size:44px;}
  .roteiros-head p{margin:14px 0 0;font-size:16px;color:#a1a1a6;max-width:560px;}
  .roteiros-all a{color:var(--lime-2);font-weight:600;font-size:15px;}
  .rot-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:24px;margin-top:36px;}
  .rot-card{display:flex;flex-direction:column;gap:14px;color:#f7f7f5;}
  .rot-card:hover{color:#f7f7f5;transform:translateY(-3px);}
  .rot-media{height:240px;position:relative;border-radius:14px;overflow:hidden;}
  .rot-flag{position:absolute;top:12px;left:12px;background:var(--lime-2);color:#18181b;font-size:12px;font-weight:700;letter-spacing:.04em;padding:5px 12px;border-radius:var(--pill);}
  .rot-tag{font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--lime-2);}
  .rot-body h3{margin:8px 0 6px;font-size:26px;line-height:1.15;}
  .rot-body p{margin:0 0 10px;font-size:15px;line-height:1.5;color:#a1a1a6;}
  .rot-foot{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}
  .rot-cta{font-size:14px;font-weight:600;color:var(--lime-2);}
  .rot-mes{font-size:12px;font-weight:600;color:#a1a1a6;border:1px solid #3f3f42;border-radius:var(--pill);padding:3px 10px;}

  /* Extras + confianca */
  .extras-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:20px;margin-top:32px;}
  .extra-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:26px;display:flex;flex-direction:column;gap:10px;color:inherit;}
  .extra-card:hover{border-color:var(--lime);color:inherit;}
  .extra-card--soon{opacity:.72;}
  .extra-cta--soon{color:var(--muted-2);font-style:italic;}
  .extra-sigla{width:38px;height:38px;border-radius:10px;background:var(--tint);color:var(--green);display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:700;}
  .extra-card h3{font-size:20px;font-weight:600;font-family:var(--sans);}
  .extra-card p{margin:0;font-size:15px;color:var(--muted);line-height:1.5;}
  .extra-cta{font-size:14px;font-weight:600;color:var(--green);}
  .conf-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-lg);padding:40px;display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:32px;align-items:center;}
  .conf-card h2{font-size:30px;line-height:1.15;}
  .conf-valor{margin:0;font-size:26px;font-weight:700;color:var(--green-2);}
  .conf-stat p:last-child{margin:4px 0 0;font-size:14px;color:var(--muted);line-height:1.4;}

  /* Ofertas: filtro de origem + newsletter + como funciona */
  .orig-bar{position:sticky;top:68px;z-index:40;background:var(--surface);border-bottom:1px solid var(--border);}
  .orig-in{padding-top:14px;padding-bottom:14px;display:flex;align-items:center;gap:14px;flex-wrap:wrap;}
  .orig-label{font-size:13px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--muted-2);}
  .orig-pills{display:flex;gap:8px;flex-wrap:wrap;}
  .orig-pill{border:1px solid var(--border-2);background:var(--surface);color:var(--muted);border-radius:var(--pill);padding:8px 16px;font-size:14px;font-weight:600;}
  .orig-pill.is-active{background:#18181b;color:#fff;border-color:#18181b;}
  .news-wrap{padding-top:32px;padding-bottom:8px;}
  .news-card{background:#18181b;color:#f7f7f5;border-radius:var(--r-lg);padding:40px;display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:32px;align-items:center;}
  .news-copy h1{font-size:44px;line-height:1.05;}
  .news-copy p{margin:16px 0 0;font-size:16px;color:#a1a1a6;line-height:1.5;max-width:440px;}
  .news-form{display:flex;flex-direction:column;gap:12px;}
  .news-form input,.news-form select{border:1px solid #3f3f42;background:#26262a;border-radius:12px;padding:14px 16px;font-family:var(--sans);font-size:15px;color:#f7f7f5;}
  .news-row{display:flex;gap:12px;flex-wrap:wrap;}
  .news-row input{flex:1;min-width:140px;}
  .news-fine{font-size:12px;color:#a1a1a6;text-align:center;}
  .news-msg{margin:4px 0 0;font-size:14px;color:var(--lime-2);text-align:center;}
  .feed-count{font-size:14px;color:var(--muted-2);}
  /* Escolha do dia (/hoje) */
  .hoje-head{padding-bottom:0;}
  .hoje-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:28px;}
  .hoje-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-lg);overflow:hidden;display:flex;flex-direction:column;}
  .hoje-media{position:relative;height:220px;}
  .hoje-body{padding:24px 26px 26px;display:flex;flex-direction:column;gap:10px;flex:1;}
  .hoje-titulo{font-size:28px;line-height:1.12;margin:2px 0 0;}
  .hoje-resumo{margin:0;font-size:15px;color:var(--muted);line-height:1.55;}
  .hoje-preco-row{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;padding:4px 0 2px;}
  .hoje-bullets{list-style:none;margin:6px 0 0;padding:0;display:flex;flex-direction:column;gap:12px;}
  .hoje-bullet{display:flex;gap:12px;align-items:flex-start;font-size:15px;line-height:1.5;}
  .hoje-dia{flex-shrink:0;background:var(--tint);color:var(--green-2);font-size:12px;font-weight:700;
    padding:3px 10px;border-radius:var(--pill);margin-top:2px;white-space:nowrap;}
  .hoje-bullet strong{font-weight:600;}
  .hoje-pontos{margin:2px 0 0;color:var(--muted);font-size:14px;}
  .hoje-comer{margin:2px 0 0;font-size:14px;color:var(--muted);}
  .hoje-mes{margin:8px 0 0;font-size:14px;color:var(--muted);}
  .hoje-ctas{display:flex;gap:10px;flex-wrap:wrap;margin-top:auto;padding-top:14px;}
  .btn-ghost--claro{color:var(--text);border-color:var(--border-2);}
  .btn-ghost--claro:hover{color:var(--text);border-color:var(--green);}
  .feed-vazio{grid-column:1/-1;margin:0;background:var(--surface);border:1px solid var(--border);border-radius:var(--r);
    padding:28px;font-size:16px;line-height:1.6;color:var(--muted);}
  .cf-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:20px;margin-top:8px;}
  .cf-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:26px;}
  .cf-num{display:inline-flex;width:36px;height:36px;border-radius:10px;background:var(--tint);color:var(--green);align-items:center;justify-content:center;font-size:16px;font-weight:700;}
  .cf-card h3{margin:14px 0 6px;font-size:19px;font-weight:600;font-family:var(--sans);}
  .cf-card p{margin:0;font-size:15px;color:var(--muted);line-height:1.55;}
  .cf-note{margin:24px 0 0;font-size:13px;color:var(--muted);line-height:1.6;max-width:640px;}

  /* Oferta detalhe */
  .det{padding-top:32px;}
  .det-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:40px;align-items:start;}
  .det-badges{display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap;}
  .det-badge{font-size:13px;font-weight:700;padding:5px 14px;border-radius:var(--pill);}
  .det-pub{font-size:13px;color:var(--muted-2);}
  .det-rota{font-size:15px;font-weight:600;letter-spacing:.06em;color:var(--muted-2);}
  .det-cidade{margin:6px 0 0;font-size:clamp(38px,6vw,52px);line-height:1.02;}
  .det-local{margin:2px 0 0;font-size:17px;color:var(--muted);}
  .det-preco-row{display:flex;align-items:baseline;gap:14px;margin:24px 0 6px;flex-wrap:wrap;}
  .det-preco{font-size:clamp(40px,8vw,56px);font-weight:700;color:var(--green-2);letter-spacing:-1.5px;line-height:1;}
  .det-media s{font-size:18px;color:var(--muted);}
  .det-econ{display:inline-block;background:var(--tint);color:var(--green-2);font-size:14px;font-weight:700;padding:6px 14px;border-radius:var(--pill);}
  .det-texto{margin:24px 0 0;font-size:17px;line-height:1.6;color:var(--muted);}
  .det-prova{margin-top:28px;position:relative;height:280px;border-radius:14px;overflow:hidden;background:var(--tint);}
  .det-prova-media{width:100%;height:100%;}
  .det-prova-tag{position:absolute;top:12px;left:12px;background:rgba(24,24,27,.75);color:#f7f7f5;font-size:12px;font-weight:600;padding:5px 12px;border-radius:var(--pill);}
  .det-h2{margin:36px 0 14px;font-size:22px;font-weight:700;font-family:var(--sans);}
  .det-flex{display:flex;flex-direction:column;gap:8px;}
  .det-flex-row{display:flex;align-items:center;justify-content:space-between;gap:12px;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px 18px;}
  .det-flex-row strong{color:var(--green-2);font-size:17px;}
  .det-dicas{display:flex;flex-direction:column;gap:10px;}
  .det-dica{display:flex;gap:10px;font-size:15px;line-height:1.5;color:var(--muted);}
  .det-dica span:first-child{color:var(--green);font-weight:700;}
  .det-aside{position:sticky;top:92px;display:flex;flex-direction:column;gap:16px;}
  .det-buy{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:24px;box-shadow:0 24px 48px -34px rgba(24,24,27,.3);}
  .det-buy-label{font-size:13px;color:var(--muted-2);}
  .det-buy-preco{margin:2px 0 0;font-size:36px;font-weight:700;color:var(--green-2);letter-spacing:-1px;}
  .det-buy-sub{margin:2px 0 16px;font-size:14px;color:var(--muted);}
  .det-buy-cta{width:100%;font-size:16px;}
  .det-buy-fine{margin:12px 0 0;font-size:12px;color:var(--muted);line-height:1.5;text-align:center;}
  /* Historico de preco (sparkline). Fica no mesmo cartao claro do aside. */
  .det-hist{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:18px;margin-bottom:16px;}
  .det-hist-title{margin:0 0 10px;font-size:14px;font-weight:700;color:var(--text);}
  .det-hist svg{display:block;width:100%;height:auto;max-width:100%;}
  .det-hist-fine{margin:10px 0 0;font-size:12px;color:var(--muted);line-height:1.45;}
  .det-alert{background:#18181b;color:#f7f7f5;border-radius:var(--r);padding:22px;}
  .det-alert-title{margin:0 0 4px;font-size:15px;font-weight:700;}
  .det-alert p{margin:0 0 14px;font-size:13px;color:#a1a1a6;line-height:1.5;}
  .det-alert .btn{width:100%;}
  .rel-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:20px;}
  .rel-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:20px;display:flex;flex-direction:column;gap:4px;color:inherit;}
  .rel-card:hover{border-color:var(--lime);color:inherit;}
  .rel-top{display:flex;align-items:center;justify-content:space-between;gap:8px;}
  .rel-rota{font-size:13px;font-weight:600;letter-spacing:.06em;color:var(--muted-2);}
  .rel-badge{font-size:11px;font-weight:700;padding:3px 9px;border-radius:var(--pill);}
  .rel-card h3{margin:2px 0 4px;font-size:19px;font-weight:600;font-family:var(--sans);}
  .rel-preco{font-size:26px;font-weight:700;color:var(--green-2);letter-spacing:-.5px;}
  .rel-cia{font-size:13px;color:var(--muted);}

  /* Guia / roteiro */
  .guia-top{padding-top:40px;}
  .guia-hero{position:relative;height:420px;border-radius:24px;overflow:hidden;background:var(--tint);}
  .guia-hero-flags{position:absolute;left:24px;bottom:24px;display:flex;gap:10px;}
  .flag{font-size:12px;font-weight:700;letter-spacing:.04em;padding:6px 14px;border-radius:var(--pill);}
  .flag-lime{background:var(--lime-2);color:#18181b;}
  .flag-dark{background:rgba(24,24,27,.75);color:#f7f7f5;text-transform:uppercase;letter-spacing:.05em;}
  .guia-intro-grid{display:grid;grid-template-columns:1.4fr 1fr;gap:48px;margin-top:36px;align-items:start;}
  .guia-title{font-size:clamp(38px,6vw,54px);line-height:1.05;}
  .guia-intro{margin:18px 0 0;font-size:18px;line-height:1.6;color:var(--muted);}
  .guia-aside{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:24px;display:flex;flex-direction:column;gap:14px;position:sticky;top:92px;}
  .guia-aside h3,.guia-aside-h{font-size:16px;font-weight:700;font-family:var(--sans);margin:0;line-height:1.3;}
  .guia-meta-row{display:flex;justify-content:space-between;gap:12px;font-size:14px;border-bottom:1px solid var(--border);padding-bottom:10px;}
  .guia-meta-row span{color:var(--muted-2);}
  .guia-meta-row strong{text-align:right;}
  .guia-aside-preco{font-size:13px;color:var(--muted);text-align:center;}
  .escopo-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:26px 28px;max-width:860px;}
  .escopo-h{font-size:22px;font-weight:700;font-family:var(--sans);margin:0 0 16px;}
  .escopo-cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:24px;}
  .escopo-tit{margin:0 0 8px;font-size:13px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;}
  .escopo-tit--sim{color:var(--green-2);}
  .escopo-tit--nao{color:#9a3412;}
  .escopo-cols ul{margin:0;padding-left:18px;display:flex;flex-direction:column;gap:6px;font-size:15px;line-height:1.5;color:var(--muted);}
  .escopo-nota{margin:18px 0 0;font-size:13px;line-height:1.6;color:var(--muted);border-top:1px solid var(--border);padding-top:14px;}
  .guia-h2{font-size:36px;margin-bottom:28px;}
  .dias{display:flex;flex-direction:column;gap:20px;max-width:860px;}
  .dia{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:28px;display:grid;grid-template-columns:64px 1fr;gap:24px;}
  .dia-num{width:56px;height:56px;border-radius:14px;background:#18181b;color:var(--lime-2);display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1;}
  .dia-num span{font-size:10px;font-weight:700;letter-spacing:.08em;}
  .dia-num strong{font-size:24px;}
  .dia-body h3{font-size:22px;font-weight:600;font-family:var(--sans);}
  .dia-desc{margin:6px 0 14px;font-size:15px;color:var(--muted);line-height:1.55;}
  .dia-pontos{display:flex;flex-direction:column;gap:10px;}
  .dia-ponto{display:flex;gap:10px;font-size:15px;line-height:1.5;}
  .dia-bullet{color:var(--green);font-weight:700;flex-shrink:0;}
  .dia-ponto--rich{gap:14px;align-items:flex-start;}
  .dia-ponto-thumb{width:76px;height:56px;border-radius:10px;overflow:hidden;flex-shrink:0;background:var(--tint);}
  .dia-ponto-thumb.media-img,.dia-ponto-thumb .media-img{width:100%;height:100%;object-fit:cover;}
  .dia-ponto-body{display:flex;flex-direction:column;gap:2px;}
  .dia-ponto-nota{color:var(--muted);}
  .dia-ponto-meta{font-size:13px;color:var(--muted-2);}
  .dia-ponto-credit{font-size:11px;color:var(--muted-2);}
  .stars{color:var(--lime);letter-spacing:1px;}
  .dia-rest{margin-top:16px;background:var(--tint);border-radius:12px;padding:14px 18px;display:flex;gap:12px;align-items:baseline;flex-wrap:wrap;}
  .dia-rest-label{font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--green);white-space:nowrap;}
  .dia-rest span:last-child{font-size:15px;color:#3f4a2a;line-height:1.5;}
  .dia-rest-link{color:inherit;}
  .dia-rest-link:hover{color:var(--green-2);}
  .dia-map{display:inline-flex;align-items:center;gap:6px;margin-top:14px;font-size:13px;font-weight:600;color:var(--green);}
  .dia-map:hover{color:var(--green-2);}
  .dia-map-pin{font-size:13px;}
  .lodging{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:24px;display:flex;flex-direction:column;gap:14px;align-items:flex-start;max-width:860px;}
  .lodging-base{margin:0;font-size:16px;color:var(--muted);line-height:1.6;}
  .explore{background:#18181b;color:#f7f7f5;border-radius:var(--r-lg);padding:36px;display:grid;grid-template-columns:1fr 1fr;gap:32px;align-items:center;overflow:hidden;}
  .explore-copy h2{font-size:34px;line-height:1.1;margin:2px 0 0;}
  .explore-copy p{margin:12px 0 20px;font-size:16px;color:#a1a1a6;max-width:44ch;}
  .explore-map{position:relative;display:block;height:220px;border-radius:var(--r);overflow:hidden;border:1px solid #3f3f42;}
  .explore-map .media-placeholder{position:absolute;inset:0;}
  .explore-map-badge{position:absolute;left:14px;bottom:14px;background:rgba(24,24,27,.72);color:#f7f7f5;font-size:13px;font-weight:600;padding:6px 12px;border-radius:var(--pill);}

  /* Otimizador */
  .opt{padding-top:16px;padding-bottom:40px;}
  .opt-head{display:flex;align-items:flex-end;gap:24px;flex-wrap:wrap;margin-bottom:24px;}
  .opt-head h2{font-size:36px;}
  .opt-sub{margin:0;font-size:15px;color:var(--muted);max-width:460px;line-height:1.5;}
  .opt-grid-wrap{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:24px;align-items:start;}
  .opt-panel{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:24px;}
  .opt-panel-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px;flex-wrap:wrap;font-size:13px;font-weight:700;}
  .opt-legend{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted-2);font-weight:400;}
  .opt-sw{width:14px;height:10px;border-radius:3px;display:inline-block;}
  .opt-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(80px,1fr));gap:8px;}
  .opt-cell{border:1px solid;border-radius:10px;padding:11px 6px;text-align:center;}
  .opt-mon{font-size:12px;font-weight:600;opacity:.8;}
  .opt-price{font-size:14px;font-weight:700;margin-top:3px;}
  .opt-foot{margin:16px 0 0;font-size:12px;color:var(--muted);line-height:1.5;}
  .opt-side{display:flex;flex-direction:column;gap:16px;}
  .opt-window{background:#18181b;color:#f7f7f5;border-radius:var(--r);padding:24px;}
  .opt-window h3{font-size:30px;margin:10px 0 8px;}
  .opt-window-price{display:flex;align-items:baseline;gap:8px;}
  .opt-window-price span{font-size:30px;font-weight:700;color:var(--lime-2);}
  .opt-window-price small{font-size:14px;color:#a1a1a6;}
  .opt-save{display:inline-block;margin:12px 0;background:rgba(163,230,53,.15);color:var(--lime-2);font-size:13px;font-weight:700;padding:5px 12px;border-radius:var(--pill);}
  .opt-window p{margin:0 0 18px;font-size:14px;color:#a1a1a6;line-height:1.5;}
  .opt-window .btn{width:100%;}
  .opt-sources{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:22px;}
  .opt-sources-title{font-size:13px;font-weight:700;}
  .opt-sources-list{display:flex;flex-direction:column;gap:8px;margin-top:14px;}
  .opt-src{display:flex;align-items:center;justify-content:space-between;gap:12px;background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:12px 14px;}
  .opt-src--best{background:var(--tint);border-color:#d9edb8;}
  .opt-src-name{font-size:15px;font-weight:700;}
  .opt-src--best .opt-src-name,.opt-src--best .opt-src-price{color:var(--green-2);}
  .opt-src-note{display:block;font-size:12px;color:var(--muted-2);}
  .opt-src-price{font-size:17px;font-weight:700;white-space:nowrap;}
  .opt-ring-wrap{display:flex;justify-content:center;padding:6px 0 2px;}
  .season-ring{width:100%;max-width:300px;height:auto;display:block;}

  /* Datas para viajar (clicar e reservar) */
  .dt-note{font-size:14px;color:var(--muted-2);}
  .dt-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin-top:24px;}
  .dt-card{position:relative;background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:22px;display:flex;flex-direction:column;gap:4px;}
  .dt-card--best{border-color:var(--lime);box-shadow:0 16px 32px -26px rgba(24,24,27,.35);}
  .dt-flag{position:absolute;top:-11px;left:20px;background:var(--lime);color:#18181b;font-size:12px;font-weight:700;letter-spacing:.04em;padding:4px 12px;border-radius:var(--pill);}
  .dt-when{font-size:18px;font-weight:700;color:var(--text);}
  .dt-price{font-size:28px;font-weight:700;color:var(--green-2);letter-spacing:-.5px;}
  .dt-sub{font-size:13px;color:var(--muted);}
  .dt-cta{margin-top:12px;width:100%;font-size:15px;}

  /* Mini-mapa do destino */
  .guia-map{height:340px;border-radius:var(--r-lg);overflow:hidden;border:1px solid var(--border);background:var(--tint);}
  .guia-map--placeholder{position:relative;display:flex;align-items:center;justify-content:center;}
  .guia-map--placeholder .media-placeholder{position:absolute;inset:0;opacity:.5;}
  .guia-map-link{position:relative;}

  .guia-cta{background:#18181b;color:#f7f7f5;border-radius:var(--r-lg);padding:44px;display:flex;align-items:center;justify-content:space-between;gap:32px;flex-wrap:wrap;}
  .guia-cta h2{font-size:34px;}
  .guia-cta p{margin:10px 0 0;font-size:16px;color:#a1a1a6;}
  .guia-cta-btns{display:flex;gap:12px;flex-wrap:wrap;}

  /* Resultados de voo */
  .res-topbar{background:#18181b;color:#f7f7f5;}
  .res-topbar-in{padding:28px 32px;display:flex;align-items:center;gap:28px;flex-wrap:wrap;}
  .res-rota{display:flex;align-items:center;gap:14px;margin:0;font-weight:400;}
  .res-rota span{font-family:var(--serif);font-size:26px;}
  .res-rota i{color:var(--lime);font-size:18px;font-style:normal;}
  .res-resumo{font-size:15px;color:#a1a1a6;}
  .res-alterar{margin-left:auto;padding:9px 18px;font-size:14px;font-weight:600;border-radius:var(--pill);}
  .res-grid{padding-top:32px;padding-bottom:88px;display:grid;grid-template-columns:minmax(220px,260px) minmax(0,1fr);gap:28px;align-items:start;}
  .res-side{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:22px;display:flex;flex-direction:column;gap:22px;position:sticky;top:92px;}
  .res-side h3{font-size:16px;font-weight:700;font-family:var(--sans);}
  .res-filtro{display:flex;flex-direction:column;gap:10px;}
  .res-filtro-title{font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--muted-2);}
  .res-check{display:flex;align-items:center;gap:10px;font-size:15px;cursor:pointer;}
  .res-check input{accent-color:var(--green);width:16px;height:16px;}
  .res-help{border-top:1px solid var(--border);padding-top:16px;font-size:13px;color:var(--muted);line-height:1.5;}
  .res-list{display:flex;flex-direction:column;gap:16px;}
  .res-sortbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:15px;color:var(--muted);}
  .res-sort{border:1px solid var(--border-2);background:var(--surface);color:var(--muted);border-radius:var(--pill);padding:7px 15px;font-family:var(--sans);font-size:14px;font-weight:600;cursor:pointer;white-space:nowrap;}
  .res-sort.is-active{background:#18181b;color:#fff;border-color:#18181b;}
  .res-voo{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:22px 24px;display:flex;flex-wrap:wrap;gap:20px;align-items:center;position:relative;}
  .res-voo--melhor{border-color:var(--lime);}
  .res-melhor{position:absolute;top:-11px;left:20px;background:var(--lime);color:#18181b;font-size:12px;font-weight:700;letter-spacing:.04em;padding:4px 12px;border-radius:var(--pill);}
  .res-cia{display:flex;flex-direction:column;gap:4px;width:110px;flex-shrink:0;}
  .res-cia strong{font-size:15px;}
  .res-cia span{font-size:13px;color:var(--muted-2);}
  .res-trecho{display:flex;align-items:center;gap:16px;flex:1 1 300px;min-width:260px;}
  .res-hora{text-align:center;}
  .res-hora p{margin:0;font-size:22px;font-weight:600;}
  .res-hora span{font-size:13px;color:var(--muted-2);}
  .res-linha{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;}
  .res-dur{font-size:12px;color:var(--muted-2);}
  .res-track{width:100%;height:2px;background:var(--border);position:relative;}
  .res-track i{position:absolute;right:-1px;top:-3px;width:8px;height:8px;border-radius:50%;background:var(--green);}
  .res-parada{font-size:12px;font-weight:600;}
  .res-parada--direto{color:var(--green-2);}
  .res-parada--conex{color:var(--muted-2);}
  .res-preco{text-align:right;border-left:1px solid var(--border);padding-left:20px;margin-left:auto;}
  .res-preco-label{margin:0;font-size:13px;color:var(--muted-2);}
  .res-preco-val{margin:4px 0 0;font-size:24px;font-weight:700;color:var(--green-2);}
  .res-parcela{margin:2px 0 0;font-size:13px;color:var(--muted);}
  .res-sel{background:#18181b;color:#fff;padding:14px 24px;white-space:nowrap;}
  .res-sel:hover{background:var(--green-2);}
  .res-pix{background:var(--tint);border:1px solid #d9edb8;border-radius:var(--r);padding:18px 24px;display:flex;align-items:center;gap:14px;font-size:15px;color:var(--green-2);}
  .res-pix>strong:first-child{font-size:18px;}

  /* Mapa */
  .map-head{padding-top:40px;}
  .map-title{font-size:clamp(32px,5vw,44px);margin:0 0 8px;}
  .map-sub{margin:0;font-size:17px;color:var(--muted);max-width:60ch;}
  /* Filtro do /guias. Nasce com [hidden] no HTML; o JS tira. */
  .guia-busca{margin:20px 0 0;max-width:420px;}
  .guia-busca[hidden]{display:none;}
  .guia-busca-lab{display:block;font-size:13px;font-weight:600;color:var(--muted);margin-bottom:6px;}
  .guia-busca-campo{width:100%;padding:12px 14px;border:1px solid var(--border-2);border-radius:var(--pill);
    background:var(--input-bg);color:var(--text);font:inherit;font-size:16px;}
  .guia-busca-campo:focus-visible{outline:2px solid var(--green);outline-offset:2px;border-color:var(--green);}
  .guia-busca-conta{margin:8px 0 0;font-size:14px;color:var(--muted);min-height:1.3em;}
  .rot-card[hidden]{display:none;}
  .map-grid{margin-top:28px;padding-bottom:88px;display:grid;grid-template-columns:minmax(0,1fr) minmax(260px,340px);gap:24px;align-items:start;}
  .map-canvas{height:560px;border-radius:var(--r-lg);overflow:hidden;border:1px solid var(--border);background:var(--tint);}
  .map-canvas--placeholder{position:relative;display:flex;align-items:center;justify-content:center;}
  .map-canvas--placeholder .media-placeholder{position:absolute;inset:0;opacity:.5;}
  .map-canvas--err{display:flex;align-items:center;justify-content:center;}
  .map-canvas-msg{position:relative;max-width:360px;margin:0;background:rgba(255,255,255,.92);border:1px solid var(--border);border-radius:12px;padding:16px 18px;font-size:14px;color:var(--muted);line-height:1.5;text-align:center;}
  .map-canvas-msg code{background:var(--tint);color:var(--green-2);padding:1px 6px;border-radius:6px;font-size:13px;}
  .map-list{display:flex;flex-direction:column;gap:8px;max-height:560px;overflow-y:auto;}
  .map-dest{display:flex;align-items:center;gap:12px;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:12px 14px;color:inherit;}
  .map-dest:hover{border-color:var(--lime);color:inherit;background:var(--surface);}
  .map-dest-pin{color:var(--green);font-size:13px;flex-shrink:0;}
  .map-dest-body{display:flex;flex-direction:column;gap:2px;flex:1;min-width:0;}
  .map-dest-body strong{font-size:15px;font-weight:600;}
  .map-dest-tag{font-size:12px;color:var(--muted-2);}
  .map-dest-preco{font-size:14px;font-weight:700;color:var(--green-2);white-space:nowrap;}
  .map-iw{max-width:220px;font-family:var(--sans);}
  .map-iw strong{display:block;font-size:15px;color:#18181b;margin-bottom:2px;}
  .map-iw-tag{display:block;font-size:12px;color:var(--muted);}
  .map-iw-resumo{display:block;font-size:13px;color:var(--muted);line-height:1.4;margin:6px 0;}
  .map-iw-link{font-size:14px;font-weight:700;color:var(--green);}

  /* Integridade / confianca no detalhe da oferta */
  .fare-error-note{background:#fff7ed;border:1px solid #fed7aa;border-radius:var(--r);padding:14px 16px;font-size:13px;line-height:1.5;color:#7c2d12;margin:18px 0 0;}
  .fare-error-note strong{color:#9a3412;}
  .det-buy-perks{margin:12px 0 0;font-size:13px;font-weight:700;color:var(--green-2);text-align:center;}
  .trust-mini{display:flex;flex-direction:column;gap:10px;background:var(--tint);border:1px solid #d9edb8;border-radius:var(--r);padding:16px;margin-top:14px;}
  .trust-mini-item{display:flex;gap:10px;align-items:flex-start;font-size:13px;line-height:1.5;color:var(--green-2);}
  .trust-mini-ico{flex-shrink:0;font-size:15px;line-height:1.4;}
  .det-alert .det-alert-input,.det-alert input[type=email],.det-alert select{width:100%;border:1px solid #3f3f42;background:#26262a;border-radius:10px;padding:12px 14px;font-family:var(--sans);font-size:14px;color:#f7f7f5;margin-top:6px;}
  .det-alert .btn{width:100%;margin-top:8px;}
  .det-alert-orig{display:block;font-size:12px;color:#a1a1a6;}
  .opt-foot--disclaimer{color:#8a8a84;}

  /* Faixa de captura (strip) */
  .news-whatsapp-note{font-size:11px;color:#a1a1a6;display:block;margin-top:-4px;}
  .news-strip-wrap{padding:48px 32px 0;}
  .news-strip{background:#18181b;color:#f7f7f5;border-radius:var(--r-lg);padding:28px 32px;display:flex;align-items:center;justify-content:space-between;gap:24px;flex-wrap:wrap;}
  .news-strip-copy{max-width:480px;}
  .news-strip-copy h2{font-size:26px;line-height:1.15;margin:2px 0 0;}
  .news-strip-copy p{margin:8px 0 0;font-size:14px;color:#a1a1a6;}
  .news-form--strip{display:flex;gap:10px;flex-wrap:wrap;flex:1;min-width:280px;max-width:440px;}
  .news-form--strip input,.news-form--strip select{border:1px solid #3f3f42;background:#26262a;border-radius:10px;padding:11px 14px;font-family:var(--sans);font-size:14px;color:#f7f7f5;flex:1;min-width:150px;}
  .news-form--strip .btn{flex-basis:100%;}
  .news-fine--strip{display:block;text-align:right;padding:6px 32px 0;font-size:11px;color:var(--muted-2);}

  /* Resultados: transparencia + captura */
  .res-fine{margin-top:4px;font-size:12px;color:var(--muted-2);text-align:center;}
  .res-amostra--pax{background:#fff7ed;border-color:#fed7aa;color:#9a3412;}
  /* Busca ao vivo: borda verde solida e fundo mais forte, para separar na
     hora do aviso de "exemplo". Cor nao e o unico sinal — o texto muda. */
  .res-amostra--vivo{background:var(--tint);border:1px solid var(--green);border-left-width:4px;color:var(--green-2);}
  .res-amostra{background:var(--tint);border:1px solid #d9edb8;border-radius:var(--r);padding:14px 18px;font-size:14px;color:var(--green-2);margin-bottom:4px;}
  .res-vazio{background:var(--surface);border:1px dashed var(--border-2);border-radius:var(--r);padding:22px;text-align:center;color:var(--muted);font-size:14px;}
  .res-alert-banner{background:#18181b;color:#f7f7f5;border-radius:var(--r);padding:20px 24px;display:flex;align-items:center;justify-content:space-between;gap:20px;flex-wrap:wrap;font-size:15px;}
  .res-alert-banner strong{color:#fff;}
  .res-alert-banner span{color:#a1a1a6;}
  .res-alert-form{display:flex;gap:10px;flex-wrap:wrap;flex:1;min-width:260px;max-width:420px;}
  .res-alert-form input[type=email]{flex:1;min-width:150px;border:1px solid #3f3f42;background:#26262a;border-radius:10px;padding:11px 14px;font-family:var(--sans);font-size:14px;color:#f7f7f5;}
  .res-alert-form .news-msg{flex-basis:100%;margin:0;color:var(--lime-2);font-size:13px;}

  /* Pagina de saida (interstitial) */
  .exit{padding:48px 32px 72px;max-width:920px;}
  .exit-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-lg);padding:36px;text-align:center;}
  .exit-card h1{font-size:32px;margin:8px 0 12px;}
  .exit-sub{color:var(--muted);max-width:52ch;margin:0 auto 24px;}
  .exit-cta{font-size:17px;padding:16px 28px;}
  .exit-fine{margin:14px 0 0;font-size:13px;color:var(--muted-2);}
  .exit-grid{display:grid;grid-template-columns:1fr 1fr;gap:32px;margin-top:40px;}
  .exit-steps{margin:12px 0 0;padding-left:20px;color:var(--muted);line-height:1.6;}
  .exit-help{background:var(--tint);border-radius:var(--r);padding:24px;}
  .exit-help .btn{margin-top:6px;}
  .exit-help-note{font-size:13px;color:var(--muted);margin-top:14px;}

  /* Paginas de suporte (FAQ) */
  .help-grid{display:grid;grid-template-columns:1fr 1fr;gap:32px 48px;}
  .help-group>p{color:var(--muted);}
  .faq-item{border-top:1px solid var(--border);padding:14px 0;}
  .faq-item summary{cursor:pointer;font-weight:600;list-style:none;}
  .faq-item summary::-webkit-details-marker{display:none;}
  .faq-item summary::after{content:"+";float:right;color:var(--green);font-weight:700;}
  .faq-item[open] summary::after{content:"–";}
  .faq-item p{margin:10px 0 0;color:var(--muted);line-height:1.55;}
  .help-fine{font-size:13px;color:var(--muted-2);}
  .alerts-form{display:flex;flex-direction:column;gap:12px;max-width:420px;}
  .alerts-form input[type=email]{border:1px solid var(--border-2);border-radius:12px;padding:13px 14px;font-family:var(--sans);font-size:15px;}
  .status-page{max-width:720px;}
  .status-page .btn{margin-top:8px;}

  /* Footer */
  .site-footer{background:var(--surface);border-top:1px solid var(--border);margin-top:56px;}
  .foot-grid{padding:56px 32px 40px;display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:40px;}
  .brand--foot{--brand-fly:62px;}
  .brand--foot .brand-word{font-size:26px;}
  .brand--foot .brand-plane{color:var(--lime-2);width:12px;height:12px;margin-top:-11px;}
  .foot-brand p{margin:14px 0 0;font-size:14px;color:var(--muted);line-height:1.6;max-width:280px;}
  .foot-col{display:flex;flex-direction:column;gap:10px;font-size:14px;}
  .foot-title{font-weight:700;margin-bottom:4px;}
  .foot-link--soon{color:var(--muted-2);opacity:.7;cursor:not-allowed;}
  .foot-link--soon::after{content:" · em breve";font-size:11px;font-weight:400;}
  .foot-bar{border-top:1px solid var(--border);}
  .foot-bar-in{padding-top:20px;padding-bottom:24px;display:flex;flex-direction:column;gap:8px;}
  .foot-places{margin:0;font-size:13px;color:var(--muted);}
  .foot-lgpd{margin:0;font-size:12.5px;color:var(--muted);line-height:1.6;max-width:78ch;}
  .foot-legal{margin:0;font-size:12px;color:var(--muted-2);}

  @media(max-width:860px){
    /* A LISTA vem primeiro no celular. Filtro e captura de e-mail sao uteis,
       mas nao na frente do que a pessoa veio ver. */
    .feed-ordem{display:flex;flex-direction:column;}
    .feed-ordem .feed-lista{order:1;}
    .feed-ordem .news-wrap{order:2;}
    .res-grid{display:flex;flex-direction:column;}
    .res-side{order:2;}
    .res-list{order:1;}
    .wrap{padding:0 20px;}
    /* padding LATERAL preservado: "padding:10px 0" zerava o respiro do .wrap e
       colava a marca na borda esquerda e o "Meus alertas" na direita — duas
       personas diferentes reclamaram disso na auditoria. */
    .site-header-in{height:auto;flex-wrap:wrap;padding:10px 20px;gap:10px 16px;}
    .site-nav{order:3;width:100%;gap:18px;overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:2px;font-size:14px;}
    .site-nav a{white-space:nowrap;}
    /* O telefone NAO some mais no celular: a auditoria pegou um usuario de 68
       anos que rolou a home inteira procurando e "quase desistiu achando que
       nao tinha telefone nenhum". Some so o rotulo ATENDIMENTO, fica o numero. */
    .site-atend{align-items:flex-start;}
    .site-atend span{display:none;}
    .site-atend strong{font-size:15px;color:var(--green-2);text-decoration:underline;}
    .site-header-right{gap:10px;}
    .styles-grid{grid-template-columns:1fr;gap:24px;}
    /* relative, NAO static: .style-img e position:absolute;inset:0 e precisa
       deste elemento como bloco container. Com "static" ela escapava para o
       ancestral posicionado la em cima e virava uma camada de ~9000px por
       cima do feed de ofertas, roubando o toque dos cards no celular. */
    .styles-imgs{position:relative;height:320px;}
    .style-item{opacity:1;}
    .style-img{opacity:0;}.style-img.is-active{opacity:1;}
    .guia-intro-grid{grid-template-columns:1fr;gap:24px;}
    .det-aside{position:static;}
    .hero{height:520px;}
    .dia{grid-template-columns:1fr;gap:16px;}
    .dia-num{flex-direction:row;gap:6px;width:auto;padding:8px 14px;height:auto;}
    .res-grid{grid-template-columns:1fr;}
    .res-side{position:static;}
    .res-voo{gap:14px;}
    .res-preco{border-left:0;padding-left:0;text-align:left;}
    .exit-grid{grid-template-columns:1fr;}
    .help-grid{grid-template-columns:1fr;}
    .news-strip{flex-direction:column;align-items:stretch;}
    .explore{grid-template-columns:1fr;}
    .news-fine--strip{text-align:center;padding:6px 0 0;}
    .map-grid{grid-template-columns:1fr;}
    .map-canvas{height:380px;}
    .map-list{max-height:none;}
  }
  `;
  return _pageStylesCache;
}
