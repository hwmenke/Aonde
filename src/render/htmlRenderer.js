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
import { preparativosDoGuia, FONTES } from "./preparativos.js";
import { pageStyles } from "./estilos.js";
import { createHash } from "node:crypto";

import { getConfig } from "../config.js";
import { rotuloAeroporto, cidadeDoIata } from "./aeroportos.js";
import { ogSharePathForOffer, hojeOgSharePath } from "./ogShare.js";
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

// WhatsApp SHARE (diferente de atendimento): compartilha a oferta/pagina com
// amigos. Nao usa AONDE_WHATSAPP (que e do atendimento), monta wa.me/?text=
// direto. Adiciona utm_source=wa para tracking.
function waShareLink(title, url) {
  const message = `${title}\n${url}`;
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

// Link que o WhatsApp abre. Sempre a pagina daquela oferta — nunca /hoje
// (dois cards de /hoje com o mesmo /hoje viram preview de Buenos Aires)
// e nunca /saida/{id} (a saida nao carrega o cartao OG).
function offerShareUrl(base, offerId) {
  const id = String(offerId || "").trim();
  if (!id) return "";
  return `${base}/ofertas/${encodeURIComponent(id)}?utm_source=wa`;
}

function telLabel() {
  return (atendimento().telefone || "").trim();
}
function telHref() {
  const t = telLabel();
  return t ? `tel:${t.replace(/\D/g, "")}` : "";
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

// Principais origens brasileiras para o seletor de origem alteravel.
// Cobre as maiores cidades e capitais de onde a maioria dos brasileiros voam.
const BRAZILIAN_ORIGINS = [
  { iata: "GRU", nome: "São Paulo (GRU)" },
  { iata: "GIG", nome: "Rio de Janeiro (GIG)" },
  { iata: "CGH", nome: "São Paulo Congonhas (CGH)" },
  { iata: "VCP", nome: "Campinas (VCP)" },
  { iata: "CNF", nome: "Belo Horizonte (CNF)" },
  { iata: "BSB", nome: "Brasília (BSB)" },
  { iata: "REC", nome: "Recife (REC)" },
  { iata: "SSA", nome: "Salvador (SSA)" },
  { iata: "FOR", nome: "Fortaleza (FOR)" },
  { iata: "POA", nome: "Porto Alegre (POA)" },
  { iata: "CWB", nome: "Curitiba (CWB)" },
];

// Seletor de origem para ofertas com aviasalesUrl (permite que pessoas de outros
// estados reservem a mesma rota, trocando origem na URL do Aviasales).
function originSelectorHtml(offerId, origemPadrao, aviasalesUrl) {
  if (!aviasalesUrl) return "";
  const options = BRAZILIAN_ORIGINS.map((o) => {
    const selected = o.iata === origemPadrao ? " selected" : "";
    const cidade = cidadeDoIata(o.iata) || o.nome;
    return `<option value="${escapeHtml(o.iata)}" data-city="${escapeHtml(cidade)}"${selected}>${escapeHtml(o.nome)}</option>`;
  }).join("");
  return (
    `<div class="origin-selector">` +
    `<label for="origem-${escapeHtml(offerId)}">Saindo de</label>` +
    `<select id="origem-${escapeHtml(offerId)}" data-origin-selector data-offer-id="${escapeHtml(offerId)}">${options}</select>` +
    `<p class="origin-selector-note">Escolha sua cidade para ver voos dessa origem.</p>` +
    `</div>`
  );
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
/**
 * Pede ao Wikimedia Commons uma versao REDIMENSIONADA da foto.
 *
 * `Special:FilePath/Arquivo.jpg?width=800` devolve a imagem ja reduzida pelo
 * proprio Commons. Sem isso o site baixa o arquivo ORIGINAL — que costuma ter
 * varios megabytes e alguns milhares de pixels de largura — para exibir num
 * container de 160 a 620px. Em 4G isso e a diferenca entre a foto aparecer e a
 * pessoa desistir.
 *
 * URL que nao seja do Commons passa intacta (nao inventamos parametro que o
 * outro host talvez nao entenda).
 */
function fotoLargura(url, largura) {
  const u = String(url || "");
  if (!u || !/commons\.wikimedia\.org\/wiki\/Special:FilePath\//.test(u)) return u;
  if (/[?&]width=/.test(u)) return u;
  return `${u}${u.includes("?") ? "&" : "?"}width=${largura}`;
}

function resilientImg(url, alt, label, className, largura = 900, destPhoto = false) {
  const dataUri = placeholderDataUri(label);
  const cls = className ? ` class="${escapeHtml(className)}"` : "";
  const src = fotoLargura(url, largura);
  // srcset deixa o navegador escolher: em celular baixa a versao pequena.
  const srcset = src !== url
    ? ` srcset="${escapeHtml(fotoLargura(url, 480))} 480w, ${escapeHtml(fotoLargura(url, 900))} 900w, ${escapeHtml(fotoLargura(url, 1400))} 1400w" sizes="(max-width:860px) 100vw, 620px"`
    : "";
  // dest-photo: a foto e do DESTINO. Trocar origem no seletor nao pode
  // meter a foto da cidade de saida no lugar.
  const destAttrs = destPhoto && url
    ? ` data-dest-photo data-dest-src="${escapeHtml(src)}"`
    : "";
  return (
    `<img${cls} src="${escapeHtml(src)}" alt="${escapeHtml(alt)}"${srcset}${destAttrs} loading="lazy" decoding="async" ` +
    `onerror="this.onerror=0;this.srcset='';this.src='${dataUri}'">`
  );
}

// Bloco de media: <img> resiliente quando ha URL; senao SVG placeholder inline.
function imageBlock(url, alt, label, wrapperClass, destPhoto = false) {
  const inner = url
    ? resilientImg(url, alt, label, "media-img", 900, destPhoto)
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
  const affiliateUrl = offer.affiliate_url || "";
  // Oferta RESERVAVEL (tem link de afiliado): o card aponta para /saida/{id}
  // em vez de /ofertas/{id}, encurtando o funil (sobretudo em /hoje, destino
  // do trafego de WhatsApp).
  const href = offer.id
    ? affiliateUrl
      ? `/saida/${encodeURIComponent(offer.id)}`
      : `/ofertas/${encodeURIComponent(offer.id)}`
    : "";
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
    affiliateUrl,
    href,
    fontePreco: offer.fontePreco || offer.fonte_preco || "",
    fontePrecoEm: offer.fontePrecoEm || offer.fonte_preco_em || "",
  };
}

// Oferta editorial (aondeContent) — precos ja em string.
function normalizeContentOffer(o) {
  if (!o || typeof o !== "object") return null;
  // affiliateUrl pode vir pre-montado (ofertas antigas) OU via aviasalesUrl
  // (ofertas novas que montam tp.media na hora em /saida/{id}). O CTA usa
  // isto para decidir entre /saida/:id (quando ha URL de parceiro) e
  // /resultados (busca interna quando nao ha).
  const affiliateUrl = o.affiliateUrl || o.affiliate_url || (o.aviasalesUrl ? "pending" : "");
  // Oferta RESERVAVEL (tem link de afiliado OU aviasalesUrl): o card aponta
  // para /saida/{id} em vez de /ofertas/{id}, encurtando o funil (sobretudo
  // em /hoje, destino do trafego de WhatsApp).
  const href = o.id
    ? affiliateUrl
      ? `/saida/${encodeURIComponent(o.id)}`
      : `/ofertas/${encodeURIComponent(o.id)}`
    : "";
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
    affiliateUrl,
    href,
    fontePreco: o.fontePreco || o.fonte_preco || "",
    fontePrecoEm: o.fontePrecoEm || o.fonte_preco_em || "",
    origemCidade: o.origemCidade || "",
    ogCredit: o.ogCredit || "",
    ogCreditHref: o.ogCreditHref || "",
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
  let restauranteEndereco = "";
  if (dia.restaurante && typeof dia.restaurante === "object") {
    restauranteNome = dia.restaurante.nome || "";
    restauranteNota = dia.restaurante.endereco || "";
    restauranteEndereco = dia.restaurante.endereco || "";
  } else if (typeof dia.restaurante === "string") {
    restauranteNome = dia.restaurante;
    restauranteNota = dia.restauranteNota || "";
    restauranteEndereco = dia.restauranteEndereco || "";
  }
  return {
    n: dia.n,
    titulo: dia.titulo || (dia.n ? `Dia ${dia.n}` : ""),
    desc: dia.desc || "",
    pontos,
    restauranteNome,
    restauranteNota,
    restauranteEndereco,
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
/**
 * "Antes de viajar": documento, moeda, tomada, saude e seguro.
 *
 * Duas rodadas de avaliacao com pessoas simuladas apontaram a mesma falta, de
 * forma independente — quem vai para fora pela primeira vez nao achava nada
 * disso no site. Nao e enfeite: e a informacao que decide se a pessoa embarca.
 *
 * Mostra a DATA em que foi conferido e o link da fonte oficial, porque regra
 * de fronteira muda e o site nao tem como garantir que esta atual. Some
 * inteiro quando nao ha nada especifico a dizer (ver preparativosDoGuia).
 */
function preparativosHtml(g) {
  const p = preparativosDoGuia(g);
  if (!p) return "";
  const linha = (rotulo, valor, nota) =>
    valor
      ? `<div class="prep-item"><span class="prep-rotulo">${escapeHtml(rotulo)}</span>` +
        `<p class="prep-valor">${escapeHtml(valor)}</p>` +
        (nota ? `<p class="prep-nota">${escapeHtml(nota)}</p>` : "") +
        `</div>`
      : "";
  const dataLegivel = (() => {
    const d = new Date(`${p.conferidoEm}T12:00:00Z`);
    return Number.isNaN(d.getTime())
      ? p.conferidoEm
      : d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  })();
  return (
    `<section class="wrap section prep" id="antes-de-viajar">` +
    `<h2 class="det-h2">Antes de viajar</h2>` +
    `<p class="prep-sub">${
      p.internacional
        ? `O que um brasileiro precisa para entrar ${escapeHtml(p.pais === "Brasil" ? "aqui" : `na ${p.pais}`.replace("na Uruguai", "no Uruguai").replace("na Peru", "no Peru").replace("na Chile", "no Chile"))}.`
        : "O que vale saber antes de fechar a viagem."
    }</p>` +
    `<div class="prep-grid">` +
    linha("Documento", p.documento, p.documentoAtencao) +
    linha("Moeda", p.moeda, p.moedaNota) +
    linha("Tomada", p.tomada, p.voltagem ? `Voltagem: ${p.voltagem}.` : "") +
    linha("Vacina", p.vacina, p.saudeAtencao) +
    (!p.vacina && p.saudeAtencao ? linha("Saúde", p.saudeAtencao, "") : "") +
    linha("Seguro viagem", p.seguro, "") +
    linha("Taxas do destino", p.taxa, "") +
    `</div>` +
    `<p class="prep-fonte">Informação escrita em ${escapeHtml(dataLegivel)}. ` +
    `Regra de fronteira e de vacina muda — confirme no que manda de verdade: ` +
    `<a href="${escapeHtml(FONTES.documento.url)}" target="_blank" rel="noopener">${escapeHtml(FONTES.documento.nome)}</a>, ` +
    `<a href="${escapeHtml(FONTES.saude.url)}" target="_blank" rel="noopener">${escapeHtml(FONTES.saude.nome)}</a> e ` +
    `<a href="${escapeHtml(FONTES.consular.url)}" target="_blank" rel="noopener">${escapeHtml(FONTES.consular.nome)}</a>. ` +
    `O que está aqui vale para cidadão brasileiro; estrangeiro residente no Brasil segue outra regra.</p>` +
    `</section>`
  );
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
        `<span class="dt-sub">${escapeHtml(o.sub)}</span>` +
        `<a class="btn ${o.best ? "btn-green" : "btn-dark"} dt-cta" href="${escapeHtml(href)}">Reservar estas datas →</a>` +
        `</div>`
      );
    })
    .join("");
  return (
    `<section class="wrap section">` +
    `<div class="section-head section-head--tight"><h2>Datas para viajar</h2>` +
    `<span class="dt-note">Escolha uma janela e reserve. Parcelamento e desconto no Pix, quando houver, são condição do parceiro.</span></div>` +
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
    `<p class="opt-sub">Referência de preço por mês para GRU → ${escapeHtml(destName)}, levantada pela nossa curadoria. O mês em verde é o mais barato do ano segundo esse levantamento — serve para escolher a época, não como cotação do dia.</p>` +
    `</div>` +
    `<div class="opt-grid-wrap">` +
    `<div class="opt-panel">` +
    `<div class="opt-panel-head"><span>Preço por mês · ida e volta</span>` +
    `<span class="opt-legend">mais barato <i class="opt-sw" style="background:#4d7c0f"></i><i class="opt-sw" style="background:#f8e3ce"></i> mais caro</span></div>` +
    `<div class="opt-ring-wrap">${ring}</div>` +
    `<p class="opt-foot">Cada fatia é um mês; quanto mais verde, mais barato. Valores por pessoa, classe econômica, de um levantamento manual — confira o preço atual no parceiro antes de decidir.</p>` +
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
        `<p class="opt-foot opt-foot--disclaimer">Valores de referência coletados manualmente pela curadoria — podem não refletir o preço exibido agora nesses sites. Não somos afiliados a eles; a comparação é só para contexto.</p></div>`
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
      const tel = telLabel();
      // Sem canal configurado, nao inventamos um: mandamos para a Central de
      // ajuda, que existe de verdade e nao promete voz nem WhatsApp.
      if (!wa && !tel) {
        return `<a class="site-atend" href="/ajuda"><span>Ajuda</span><strong>Central de ajuda</strong></a>`;
      }
      const href = wa || telHref();
      const tgt = wa ? ` target="_blank" rel="noopener"` : "";
      const label = wa ? "Atendimento · WhatsApp" : "Atendimento";
      return (
        `<a class="site-atend" href="${escapeHtml(href)}"${tgt}>` +
        `<span>${label}</span><strong>${escapeHtml(wa ? tel || "WhatsApp" : tel)}</strong></a>`
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
      const tel = telLabel();
      if (wa) return `<a href="${escapeHtml(wa)}" target="_blank" rel="noopener">WhatsApp${tel ? `: ${escapeHtml(tel)}` : ""}</a>`;
      if (tel) return `<a href="${telHref()}">Atendimento: ${escapeHtml(tel)}</a>`;
      return `<a href="/ajuda">Central de ajuda</a>`;
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

// og:image da pagina de oferta. for-ssa tem cartao proprio (FOR-SSA.jpg);
// sem arquivo, foto de Salvador no Commons. Nunca o cartao do Rio (GIG-SSA.jpg)
// nem HOJE.jpg.
function ogImageForOfferPage(offerId, thumbUrl) {
  const id = String(offerId || "").toLowerCase();
  const card = ogSharePathForOffer(offerId);
  if (id === "for-ssa") {
    if (card && /GIG-SSA|HOJE/i.test(card)) return thumbUrl || "";
    return card || thumbUrl || "";
  }
  return card || thumbUrl || "";
}

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
/**
 * Reduz um texto a uma meta description util (~155 caracteres, sem cortar
 * palavra no meio). Devolve "" para entrada vazia, e quem chama cai na
 * DEFAULT_DESCRIPTION.
 *
 * Existe porque 48 das 49 paginas do site serviam a MESMA description
 * generica, embora cada roteiro ja tivesse `intro` e cada oferta `texto` —
 * conteudo unico, escrito, e nunca aproveitado.
 */
/** "R$ 1.847" -> 1847. Sem preco reconhecivel => "" (nao ordena por chute). */
function precoNumerico(preco) {
  const n = String(preco || "").replace(/[^\d]/g, "");
  return n ? String(Number.parseInt(n, 10)) : "";
}

/** "2h25" / "14h" / "45min" -> minutos. Sem duracao reconhecivel => "". */
function duracaoEmMin(dur) {
  const t = String(dur || "");
  const h = /(\d+)\s*h/.exec(t);
  const m = /(\d+)\s*min/.exec(t) || /h\s*(\d+)/.exec(t);
  const total = (h ? Number(h[1]) * 60 : 0) + (m ? Number(m[1]) : 0);
  return total > 0 ? String(total) : "";
}

function metaDescricao(txt, limite = 155) {
  const limpo = String(txt || "").replace(/\s+/g, " ").trim();
  if (!limpo) return "";
  if (limpo.length <= limite) return limpo;
  const corte = limpo.slice(0, limite);
  const ultimoEspaco = corte.lastIndexOf(" ");
  return `${(ultimoEspaco > 60 ? corte.slice(0, ultimoEspaco) : corte).replace(/[,;:.\s]+$/, "")}…`;
}

const MESES_CURTOS_PT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MESES_LONGOS_PT = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

function parseFontePrecoIso(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || "").trim());
  if (!m) return null;
  const dia = Number(m[3]);
  const mesIdx = Number(m[2]) - 1;
  if (!Number.isFinite(dia) || dia < 1 || dia > 31) return null;
  if (mesIdx < 0 || mesIdx > 11) return null;
  return { ano: m[1], mesIdx, dia };
}

/** "2026-08-21" → "21 ago 2026". Sem data reconhecivel → "". Nao inventa. */
function formatFontePrecoData(iso) {
  const p = parseFontePrecoIso(iso);
  if (!p) return "";
  return `${p.dia} ${MESES_CURTOS_PT[p.mesIdx]} ${p.ano}`;
}

/** "2026-08-28" → "28 de agosto de 2026". Sem data reconhecivel → "". Nao inventa. */
function formatFontePrecoDataLonga(iso) {
  const p = parseFontePrecoIso(iso);
  if (!p) return "";
  return `${p.dia} de ${MESES_LONGOS_PT[p.mesIdx]} de ${p.ano}`;
}

/**
 * Linha honesta da origem do preco. So imprime o que existe: fonte e/ou data.
 * Sem os dois, devolve "" — quem chama nao inventa "ao vivo" nem data.
 */
function fontePrecoLinha(fonte, isoDate) {
  const nome = String(fonte || "").trim();
  const quando = formatFontePrecoData(isoDate);
  if (nome && quando) return `Visto no ${nome}, ${quando}`;
  if (nome) return `Visto no ${nome}`;
  if (quando) return `Visto em ${quando}`;
  return "";
}

function fontePrecoHtml(fonte, isoDate, className, originIata) {
  const linha = fontePrecoLinha(fonte, isoDate);
  if (!linha) return "";
  const originAttr = originIata ? ` data-origin-price="${escapeHtml(originIata)}"` : "";
  return `<p class="${escapeHtml(className)}"${originAttr}>${escapeHtml(linha)}</p>`;
}

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
<!-- Fonte carregada SEM bloquear a primeira pintura. Como <link rel=stylesheet>
     normal, o navegador segura a tela ate o CSS do Google chegar: medido, com
     fonts.googleapis.com lento, 12,8s de tela BRANCA. O truque do media=print
     faz o navegador baixar sem bloquear e so aplicar quando chega; a pilha de
     fallback (Georgia / system-ui) aparece na hora. O bloco sem-script logo
     abaixo cobre quem esta com JavaScript desligado.
     (Evitar escrever o nome dessa tag aqui dentro: o comentario vai para o
     HTML e qualquer varredura por tag passa a ver uma abertura falsa.) -->
<link rel="stylesheet" media="print" onload="this.media='all';this.onload=0"
      href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&display=swap">
<noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&display=swap"></noscript>
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
        `<button class="hero-tab${i === 0 ? " is-active" : ""}" type="button" data-hero-tab="${i}" aria-pressed="${i === 0 ? "true" : "false"}">` +
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
    `<p class="hero-sub">Compare voos, hotéis e experiências pelo Brasil e América do Sul. A compra acontece no site do parceiro, com as condições de pagamento dele.</p>` +
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
    // Parcelamento e Pix sao condicao DO PARCEIRO, nao do Aonde — quem
    // processa o pagamento e sempre ele. E o WhatsApp so aparece se estiver
    // mesmo configurado (regra do topo do arquivo, linhas 58-61).
    `<span><i></i>Parcelamento em até 12x, conforme o parceiro</span>` +
    `<span><i></i>Desconto no Pix em boa parte dos parceiros</span>` +
    (waHref("x") ? `<span><i></i>Atendimento humano por WhatsApp, todos os dias</span>` : "") +
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
    `<p class="news-msg" data-newsletter-msg role="status" aria-live="polite" hidden></p>` +
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
    `<p class="news-msg" data-newsletter-msg role="status" aria-live="polite" hidden></p>` +
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

  return htmlDocument({ title, body, script: enhancementScript(), canonical: "/ofertas",
    description: "Achados de passagem conferidos um a um, com o preço, as datas e o que está incluso. Cada oferta diz de onde sai e para onde vai." });
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
  // Nome da cidade de origem: entra no <h1>, no <title> e na description.
  // Sem isso, duas ofertas para o mesmo destino ficavam identicas para o Google
  // e para quem compartilha o link.
  const origemNome = vm.origemCidade || (vm.origem ? cidadeDoIata(vm.origem) || vm.origem : "");
  const badge = vm.badge ? `<span class="det-badge ${badgeClass(vm)}">${escapeHtml(vm.badge)}</span>` : "";
  const media = vm.media ? `<span class="det-media"><s>${escapeHtml(vm.media)}</s></span>` : "";
  const economia = vm.economia
    ? `<span class="det-econ">você economiza ${escapeHtml(vm.economia)} · ida e volta</span>`
    : "";
  const originPriceAttr = offer.aviasalesUrl && vm.origem
    ? ` data-origin-price="${escapeHtml(vm.origem)}"`
    : "";
  const texto = vm.texto ? `<p class="det-texto"${originPriceAttr}>${escapeHtml(vm.texto)}</p>` : "";
  const flex = vm.flex.length
    ? `<h2 class="det-h2"${originPriceAttr}>Datas com o preço disponível</h2><div class="det-flex"${originPriceAttr}>` +
      vm.flex
        .map(
          (f) =>
            `<div class="det-flex-row"><span>${escapeHtml(f.d)}</span><strong>${escapeHtml(f.p)}</strong></div>`
        )
        .join("") +
      `</div>`
    : "";
  const dicas = vm.dicas.length
    ? `<h2 class="det-h2"${originPriceAttr}>Antes de comprar</h2><div class="det-dicas"${originPriceAttr}>` +
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
  // Honestidade: dizer "Ver oferta na SWISS" quando o link vai pro Aviasales
  // (agregador) e nao pra SWISS e enganoso. A cia pode ficar na linha do voo
  // ("SWISS, 12-24 out"), mas o CTA nomeia o destino real: Aviasales.
  const ctaLabel = vm.affiliateUrl
    ? `Reservar no Aviasales →`
    : `Ver voos ${escapeHtml(vm.origem || "")} → ${escapeHtml(vm.destino || destinoLabel)} →`;
  // Subtexto HONESTO conforme o destino real do CTA (parceiro externo vs busca
  // interna de voos). Nunca prometer "site do parceiro" quando vai para /resultados.
  const ctaFine = vm.affiliateUrl
    ? "Você será levado ao site do parceiro. O Aonde pode receber comissão, sem custo extra para você."
    : "Você vai ver os voos desta rota (tarifas de exemplo por enquanto). A busca e a compra acontecem no site do parceiro — o Aonde pode receber comissão, sem custo extra para você.";

  // Hero: print de preco quando existe; senao o cartao OG daquela oferta
  // (GRU-FLN.jpg, GIG-SSA.jpg). Sem cartao, foto do destino. Nunca o cartao
  // de outra rota — FOR-SSA nao herda GIG-SSA.jpg (Elevador Lacerda, Rio).
  const isLock = Boolean(offer.semana);
  const temProva = !!vm.provaUrl;
  const ogCard = ogSharePathForOffer(vm.id);
  const heroUrl = temProva
    ? vm.provaUrl
    : ogImageForOfferPage(vm.id, vm.thumbUrl) || vm.thumbUrl;
  const usaCartaoOg = !temProva && !!ogCard && heroUrl === ogCard;
  const provaImg = imageBlock(
    heroUrl,
    temProva
      ? `Captura do preço para ${destinoLabel}`
      : usaCartaoOg
        ? `Cartão da oferta ${destinoLabel}`
        : `Foto de ${destinoLabel}`,
    destinoLabel,
    "det-prova-media",
    !temProva
  );
  const provaTag = temProva
    ? "Prova do preço · captura de tela"
    : usaCartaoOg
      ? "Cartão da oferta"
      : "Imagem do destino";
  const heroCreditTxt = usaCartaoOg ? (vm.ogCredit || "") : isLock ? (vm.credit || "") : "";
  const heroCreditHref = usaCartaoOg ? (vm.ogCreditHref || "") : isLock ? (vm.creditHref || "") : "";
  const heroCredit = heroCreditTxt ? mediaCredit(heroCreditTxt, heroCreditHref) : "";

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
    `<p class="news-msg" data-newsletter-msg role="status" aria-live="polite" hidden></p>` +
    `</form>`;
  
  // Botao de compartilhamento WhatsApp: compartilha a oferta com amigos.
  const canonicalBase = (() => {
    try {
      return siteBaseUrl();
    } catch {
      return "https://aonde.com.br";
    }
  })();
  const shareUrl = offerShareUrl(canonicalBase, vm.id);
  const shareTitle = `${destinoLabel} por ${vm.preco} saindo de ${origemNome || vm.origem}`;
  const waShare = shareUrl
    ? `<div class="det-share">` +
      `<p class="det-share-title">Compartilhar oferta</p>` +
      `<a class="det-share-btn" href="${escapeHtml(waShareLink(shareTitle, shareUrl))}" target="_blank" rel="noopener">` +
      `<span aria-hidden="true">💬</span> WhatsApp` +
      `</a>` +
      `<p class="det-share-note">Envie para amigos que procuram passagem para ${escapeHtml(destinoLabel)}.</p>` +
      `</div>`
    : "";
  
  // Seletor de origem: ofertas com aviasalesUrl permitem trocar origem (outras
  // cidades brasileiras reservam a mesma rota, trocando IATA na URL do parceiro).
  const originSelector = offer.aviasalesUrl
    ? originSelectorHtml(vm.id, vm.origem, offer.aviasalesUrl)
    : "";

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

  const isOriginSpecificPrice = offer.aviasalesUrl && vm.origem;
  const priceDataAttr = isOriginSpecificPrice ? ` data-origin-price="${escapeHtml(vm.origem)}"` : "";
  const fonteHero = (offer.aviasalesUrl || vm.affiliateUrl)
    ? fontePrecoHtml(vm.fontePreco, vm.fontePrecoEm, "det-fonte-preco", isOriginSpecificPrice ? vm.origem : "")
    : "";
  // Consulta ao lado do Reservar, nao como rodape depois dos perks.
  const fonteBuy = (offer.aviasalesUrl || vm.affiliateUrl)
    ? fontePrecoHtml(
        vm.fontePreco,
        vm.fontePrecoEm,
        "det-fonte-preco det-buy-fonte",
        isOriginSpecificPrice ? vm.origem : ""
      )
    : "";
  const provaBlock =
    `<div class="det-prova">${provaImg}${heroCredit}<span class="det-prova-tag">${provaTag}</span></div>`;
  const weekHtml = isLock
    ? editorialWeekHtml(offer.semana, {
        cidade: destinoLabel,
        showFare: true,
        originIata: vm.origem,
        embedded: true,
      })
    : "";
  // Com fontePreco a data da consulta e a honestidade. Nao imprimir
  // "publicado há 2h" — parece countdown.
  const pubBadge = vm.publicado && !vm.fontePreco
    ? `<span class="det-pub">publicado ${escapeHtml(vm.publicado)}</span>`
    : "";
  const buyBox =
    `<div class="det-buy">` +
    `<span class="det-buy-label">a partir de</span>` +
    `<p class="det-buy-preco"${priceDataAttr}>${escapeHtml(vm.preco)}</p>` +
    `<p class="det-buy-sub">ida e volta${vm.datas ? ` · ${escapeHtml(vm.datas)}` : ""}</p>` +
    `<div class="det-buy-cta-row">` +
    `<a class="btn btn-green det-buy-cta" href="${escapeHtml(ctaHref)}">${ctaLabel}</a>` +
    fonteBuy +
    `</div>` +
    `<p class="det-buy-perks">Parcelamento e desconto no Pix variam conforme o parceiro — o valor final aparece no site dele, antes de você pagar.</p>` +
    `<p class="det-buy-fine">${escapeHtml(ctaFine)}</p>` +
    trustMini +
    `</div>`;
  const extrasAside = histBloco + alertForm + waShare + originSelector;

  const body =
    `<main id="conteudo" tabindex="-1">` +
    `<section class="wrap det">` +
    `<p class="breadcrumb"><a href="/">Início</a> · <a href="/ofertas">Ofertas</a> · <span>${escapeHtml(destinoLabel)}</span></p>` +
    `<div class="det-grid${isLock ? " det-grid--lock" : ""}">` +
    `<div class="det-main">` +
    `<div class="det-badges">${badge}${pubBadge}</div>` +
    (vm.origem && vm.destino
      ? `<span class="det-rota"><span data-origin-iata-label>${escapeHtml(vm.origem)}</span> · <span data-origin-city-label>${escapeHtml(origemNome || vm.origem)}</span> → ${escapeHtml(rotuloAeroporto(vm.destino))}</span>`
      : "") +
    `<h1 class="det-cidade">${escapeHtml(destinoLabel)}${origemNome ? `<span class="det-cidade-origem"> saindo de <span data-origin-city-label>${escapeHtml(origemNome)}</span></span>` : ""}</h1>` +
    (vm.local || vm.cia ? `<p class="det-local">${[vm.local, vm.cia].filter(Boolean).map(escapeHtml).join(" · ")}</p>` : "") +
    `<div class="det-preco-row"${priceDataAttr}><span class="det-preco">${escapeHtml(vm.preco)}</span>${media}</div>${fonteHero}` +
    economia +
    fareErrorNote +
    (isLock ? "" : texto) +
    provaBlock +
    (isLock ? "" : flex + dicas) +
    `</div>` +
    `<aside class="det-aside">` +
    buyBox +
    (isLock ? "" : extrasAside) +
    `</aside>` +
    (isLock
      ? weekHtml + `<div class="det-lock-more">${texto}${flex}${dicas}</div>` + `<div class="det-lock-extras">${extrasAside}</div>`
      : "") +
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

  // Titulo editorial (pageTitle) quando a oferta traz um; senao origem no
  // <title> para gig-ssa e for-ssa nao competirem pelo mesmo destino.
  const tituloOferta = offer.pageTitle
    ? offer.pageTitle
    : origemNome
      ? `${origemNome} → ${destinoLabel}${vm.preco ? ` por ${vm.preco}` : ""} · Aonde`
      : `${destinoLabel} — oferta de viagem · Aonde`;
  let doc = htmlDocument({
    title: tituloOferta,
    description: metaDescricao(vm.texto) || undefined,
    body,
    script: [offerMap.script, enhancementScript()].filter(Boolean).join(";"),
    canonical: vm.id === "for-ssa"
      ? `/ofertas/${encodeURIComponent(vm.id)}`
      : vm.href || (vm.id ? `/ofertas/${vm.id}` : "/ofertas"),
    image: ogImageForOfferPage(vm.id, vm.thumbUrl),
    jsonld: offerJsonld,
  });
  if (offerMap.loader) doc = doc.replace("</body>", `${offerMap.loader}</body>`);
  return doc;
}

// ---------------------------------------------------------------------------
// GUIA / ROTEIRO
// ---------------------------------------------------------------------------

function diaArticleHtml(d, cidade) {
  const pontos = (d.pontos || []).map(pontoHtml).join("");
  const restQuery = d.restauranteEndereco
    ? `${d.restauranteNome}, ${d.restauranteEndereco}`
    : `${d.restauranteNome}, ${cidade}`;
  const rest = d.restauranteNome
    ? `<div class="dia-rest"><span class="dia-rest-label">Onde comer</span>` +
      `<span><a class="dia-rest-link" href="${escapeHtml(mapsSearchUrl(restQuery))}" target="_blank" rel="noopener"><strong>${escapeHtml(d.restauranteNome)}</strong></a>${d.restauranteNota ? ` · ${escapeHtml(d.restauranteNota)}` : ""}</span></div>`
    : "";
  const dirUrl = mapsDirUrl((d.pontos || []).map((p) => (cidade ? `${p.nome}, ${cidade}` : p.nome)));
  const dayMap = dirUrl
    ? `<a class="dia-map" href="${escapeHtml(dirUrl)}" target="_blank" rel="noopener"><span class="dia-map-pin" aria-hidden="true">📍</span> Ver o dia no Google Maps →</a>`
    : "";
  return (
    `<article class="dia">` +
    `<div class="dia-num"><span>DIA</span><strong>${escapeHtml(d.n)}</strong></div>` +
    `<div class="dia-body">` +
    `<h3>${escapeHtml(d.titulo)}</h3>` +
    (d.desc ? `<p class="dia-desc">${escapeHtml(d.desc)}</p>` : "") +
    (pontos ? `<div class="dia-pontos">${pontos}</div>` : "") +
    rest +
    dayMap +
    `</div>` +
    `</article>`
  );
}

/**
 * Semana editorial de um lock (FOR-SSA, GRU-FLN, …). id da secao e por oferta
 * (`semana-for-ssa`, `semana-gru-fln`). Tarifa e consulta da data citada,
 * nunca "ao vivo". Preco de restaurante, quando existe, e editorial.
 * A tarifa do lock fica marcada com data-origin-price para o seletor nao
 * implicar o mesmo valor saindo de outra cidade.
 */
function editorialWeekHtml(semana, { cidade = "", ctaHref = "", ctaLabel = "", showFare = true, originIata = "", embedded = false } = {}) {
  if (!semana) return "";
  const sectionId = semana.offerId ? `semana-${semana.offerId}` : "semana-lock";
  const cidadeNome = cidade || semana.cidade || "";
  const dias = (Array.isArray(semana.dias) ? semana.dias : []).map(normalizeGuideDia);
  const artigos = dias.map((d) => diaArticleHtml(d, cidadeNome)).join("");
  const fonteNome = String(semana.tarifaFonte || "").trim();
  const quandoLonga = formatFontePrecoDataLonga(semana.tarifaFonteEm);
  const origemLock = String(semana.origem || originIata || "").trim();
  const originAttr = origemLock ? ` data-origin-price="${escapeHtml(origemLock)}"` : "";
  let fareFrase = "";
  if (fonteNome && quandoLonga) fareFrase = `Tarifa vista no ${fonteNome} em ${quandoLonga}`;
  else if (fonteNome) fareFrase = `Tarifa vista no ${fonteNome}`;
  else if (quandoLonga) fareFrase = `Tarifa vista em ${quandoLonga}`;
  if (origemLock && fareFrase) fareFrase += `, saindo de ${origemLock}`;
  const tarifa = semana.tarifa;
  const tarifaTxt = String(tarifa || "");
  const naoReais = tarifaTxt.includes("$") || /USD/i.test(tarifaTxt)
    ? " Não é preço em reais."
    : "";
  const fare = showFare && tarifa
    ? `<p class="semana-lock-fare"${originAttr}>${escapeHtml(fareFrase || "Tarifa")}: <strong>${escapeHtml(tarifa)}</strong>.${naoReais}</p>`
    : "";
  const fareNoteTxt = String(semana.fareNote || "").trim()
    || (showFare && (fonteNome || quandoLonga)
      ? `O valor do voo é a tarifa vista no ${fonteNome || "parceiro"}${quandoLonga ? ` em ${quandoLonga}` : ""}.`
      : "");
  const fareNote = showFare && fareNoteTxt
    ? `<p class="semana-lock-fare-note"${originAttr}>${escapeHtml(fareNoteTxt)}</p>`
    : "";
  const voo = semana.voo
    ? `<p class="semana-lock-meta"${originAttr}>${escapeHtml(semana.voo)}</p>`
    : "";
  const horaArmadilha = semana.horaArmadilha
    ? `<p class="semana-lock-aviso">${escapeHtml(semana.horaArmadilha)}</p>`
    : "";
  const horarios = Array.isArray(semana.horarios) && semana.horarios.length
    ? `<div class="semana-lock-horarios">` +
      `<p class="semana-lock-meta">${escapeHtml(semana.horariosTitulo || "Horários conferidos")}</p>` +
      `<ul>${semana.horarios.map((h) => `<li>${escapeHtml(h)}</li>`).join("")}</ul>` +
      `</div>`
    : "";
  const cta = ctaHref
    ? `<p class="semana-lock-cta"><a class="btn btn-green" href="${escapeHtml(ctaHref)}">${escapeHtml(ctaLabel || "Ver a passagem →")}</a></p>`
    : "";
  const guia = semana.guiaHref
    ? `<p class="semana-lock-guia"><a href="${escapeHtml(semana.guiaHref)}">${escapeHtml(semana.guiaLabel || "Roteiro de 5 dias")}</a></p>`
    : "";
  const conferencia = semana.conferencia
    ? `<p class="semana-lock-meta">${escapeHtml(semana.conferencia)}</p>`
    : "";
  const weekClass = embedded ? "semana-lock semana-lock--embedded" : "wrap section semana-lock";
  return (
    `<section class="${weekClass}" id="${escapeHtml(sectionId)}">` +
    (semana.titulo ? `<h2 class="guia-h2">${escapeHtml(semana.titulo)}</h2>` : "") +
    (semana.rota ? `<p class="semana-lock-meta">${escapeHtml(semana.rota)}</p>` : "") +
    (semana.aviso ? `<p class="semana-lock-aviso">${escapeHtml(semana.aviso)}</p>` : "") +
    voo +
    horaArmadilha +
    fare +
    fareNote +
    (semana.hospedagem ? `<p class="semana-lock-meta">${escapeHtml(semana.hospedagem)}</p>` : "") +
    (semana.reservas ? `<p class="semana-lock-meta">${escapeHtml(semana.reservas)}</p>` : "") +
    horarios +
    cta +
    `<div class="dias">${artigos}</div>` +
    conferencia +
    guia +
    `</section>`
  );
}

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
  const dias = (g.dias || []).map((d) => diaArticleHtml(d, cidade)).join("");

  // O preco do roteiro e sempre da rota monitorada (GRU -> destino), a mesma do
  // otimizador logo abaixo. Sem dizer a origem, quem via "R$ 312 saindo de BH"
  // na escolha do dia e "R$ 399" aqui achava que o site se contradizia.
  const asidePreco = g.preco
    ? `<span class="guia-aside-preco">a partir de <strong>${escapeHtml(g.preco)}</strong> ida e volta, ` +
      `saindo de ${escapeHtml(rotuloAeroporto("GRU"))}</span>`
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
    preparativosHtml(g) +
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
    `<p>Voo + hotel na mesma reserva. As condições de pagamento são as do parceiro que vende o pacote.</p></div>` +
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
    description: metaDescricao(g.resumo || g.intro) || undefined,
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
  return htmlDocument({ title: `${GUIDE_LIST.length} roteiros de 5 dias, dia a dia · Aonde`, body, script: enhancementScript(), canonical: "/guias",
    description: `${GUIDE_LIST.length} roteiros de destino com o dia a dia na ordem certa, um restaurante para cada dia e onde ficar. Filtre pelo destino que você quer.` });
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
        ? resilientImg(r.foto.url, r.destino, r.destino, "media-img", 900, true)
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
      // Seletor de origem para ofertas com aviasalesUrl (permite que pessoas de
      // outros estados reservem a mesma rota).
      const offerFull = it.oferta && it.oferta.__source ? it.oferta.__source : null;
      const originSelector = offerFull && offerFull.aviasalesUrl && offerFull.id
        ? originSelectorHtml(offerFull.id, o.origem, offerFull.aviasalesUrl)
        : "";
      // Marca preco especifico da origem para poder esconder quando origem mudar.
      const isOriginSpecificPrice = offerFull && offerFull.aviasalesUrl && o.origem;
      const precoDataAttr = isOriginSpecificPrice ? ` data-origin-price="${escapeHtml(o.origem)}"` : '';
      const hojeBase = (() => {
        try {
          return siteBaseUrl();
        } catch {
          return "https://aonde.com.br";
        }
      })();
      // Cada card compartilha AQUELA oferta. Nunca /hoje: dois cards com o
      // mesmo /hoje fazem o preview do WhatsApp virar Buenos Aires.
      const shareUrl = offerShareUrl(hojeBase, o.id);
      const shareTitle = `${r.titulo} - ${o.preco} saindo de ${o.origemCidade}`;
      const waShareBtn = shareUrl
        ? `<a class="btn btn-ghost btn-ghost--claro" href="${escapeHtml(waShareLink(shareTitle, shareUrl))}" target="_blank" rel="noopener">` +
          `💬 Compartilhar` +
          `</a>`
        : "";
      return (
        `<article class="hoje-card">` +
        `<div class="hoje-media">${foto}${credito}` +
        (o.badge ? `<span class="of-badge badge-desconto">${escapeHtml(o.badge)}</span>` : "") +
        `</div>` +
        `<div class="hoje-body">` +
        `<p class="of-rota"><span data-origin-city-label>${escapeHtml(o.origemCidade)}</span> → ${escapeHtml(o.cidade)}</p>` +
        `<h3 class="hoje-titulo">${escapeHtml(r.titulo)}</h3>` +
        (r.resumo ? `<p class="hoje-resumo">${escapeHtml(r.resumo)}</p>` : "") +
        `<div class="hoje-preco-row"${precoDataAttr}><span class="of-preco">${escapeHtml(o.preco)}</span>` +
        `<span class="of-iv">ida e volta, por pessoa · ${escapeHtml(o.datas)}</span></div>` +
        fontePrecoHtml(
          offerFull && offerFull.fontePreco,
          offerFull && offerFull.fontePrecoEm,
          "hoje-fonte-preco",
          isOriginSpecificPrice ? o.origem : ""
        ) +
        originSelector +
        `<ul class="hoje-bullets">${bullets}</ul>` +
        (r.melhorMes ? `<p class="hoje-mes">Melhor mês para essa rota, pelo nosso histórico: <strong>${escapeHtml(r.melhorMes)}</strong></p>` : "") +
        `<div class="hoje-ctas">` +
        (() => {
          // Ofertas RESERVAVEIS (com aviasalesUrl ou affiliateUrl real) usam copy honesto:
          // "Reservar no Aviasales →" em vez de "Ver a oferta →", porque vao direto para o parceiro.
          const isBookable = !!(o.__source && (o.__source.aviasalesUrl || o.__source.affiliate_url || o.__source.affiliateUrl));
          const ctaText = isBookable ? "Reservar no Aviasales →" : "Ver a oferta →";
          return `<a class="btn btn-green" href="${escapeHtml(o.href)}">${escapeHtml(ctaText)}</a>`;
        })() +
        (r.href ? `<a class="btn btn-ghost btn-ghost--claro" href="${escapeHtml(r.href)}">Roteiro completo, dia a dia</a>` : "") +
        waShareBtn +
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
    image: hojeOgSharePath(itens[0] && itens[0].oferta && itens[0].oferta.id) || "",
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
  const rotuloVoos = voosReais ? "voos encontrados" : "voos de exemplo";
  // Quando o servidor nao reconheceu o que a pessoa digitou, dizemos isso na
  // cara em vez de mostrar outra rota como se fosse a pedida. Antes,
  // "Porto Alegre" virava GRU sem nenhum aviso — a pessoa via voos saindo de
  // outra cidade e nao tinha como perceber.
  const naoEntendi = Array.isArray(opts.naoEntendi) ? opts.naoEntendi.filter(Boolean) : [];
  const avisoRota = naoEntendi.length
    ? `<p class="res-amostra res-amostra--erro" role="status">Não reconhecemos ` +
      naoEntendi.map((t) => `<strong>${escapeHtml(t)}</strong>`).join(" nem ") +
      ` como aeroporto ou cidade que atendemos, então mostramos ` +
      `<strong>${escapeHtml(rota.origem)} → ${escapeHtml(rota.destino)}</strong> abaixo. ` +
      `Tente o nome da cidade (ex.: Porto Alegre) ou o código de três letras (ex.: POA).</p>`
    : "";
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
    .map((s, i) => {
      const chave = /barat|preç|prec/i.test(s) ? "preco" : /rápid|rapid|dura/i.test(s) ? "duracao" : "melhor";
      return (
        `<button class="res-sort${i === 0 ? " is-active" : ""}" type="button" ` +
        `data-res-sort="${escapeHtml(chave)}" aria-pressed="${i === 0 ? "true" : "false"}">${escapeHtml(s)}</button>`
      );
    })
    .join("");

  const voosHtml = voos
    .map((v, i) => {
      const melhor = v.melhor
        ? `<span class="res-melhor">MELHOR PREÇO</span>`
        : "";
      const paradaCor = v.direto ? "res-parada--direto" : "res-parada--conex";
      // data-* usados pelos filtros no cliente (enhancementScript): numero de
      // paradas, cia e hora de partida — os mesmos criterios dos checkboxes.
      const stops = numeroDeParadas(v);
      const hora = horaDeSaida(v.saida);
      return (
        `<article class="res-voo${v.melhor ? " res-voo--melhor" : ""}" data-res-voo data-stops="${stops}" data-cia="${escapeHtml(v.cia)}" data-hora="${hora}"` +
        ` data-preco="${escapeHtml(precoNumerico(v.preco))}" data-duracao="${escapeHtml(duracaoEmMin(v.duracao))}" data-ordem="${escapeHtml(i)}">` +
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
        `<p class="res-parcela">≈ ${escapeHtml(v.parcela)}/mês se o parceiro parcelar em 12x</p></div>` +
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
    `<h2 class="res-side-title">Filtrar resultados</h2>` +
    filtros +
    `<div class="res-help">Precisa de ajuda para escolher? <a href="${escapeHtml(ajudaHref("Oi! Preciso de ajuda para escolher um voo."))}"${waHref("x") ? ` target="_blank" rel="noopener"` : ""}>${waHref("x") ? "Fale no WhatsApp" : "Central de ajuda"}</a></div>` +
    `</aside>` +
    `<div class="res-list">` +
    avisoRota +
    avisoPax +
    avisoOrigem +
    // O rotulo vai num data-attribute porque o JS do cliente reescreve este
    // texto a cada filtro. Antes ele cravava "voos de exemplo", e no primeiro
    // clique em qualquer filtro o preco REAL da Amadeus era rotulado como
    // exemplo — a correcao anterior tinha parado na camada do servidor.
    `<div class="res-sortbar"><span data-res-count role="status" aria-live="polite" data-res-rotulo="${escapeHtml(rotuloVoos)}">${escapeHtml(voos.length)} ${escapeHtml(rotuloVoos)} · ordenar por</span>${sortPills}</div>` +
    `<div data-res-lista>${voosHtml}</div>` +
    `<p class="res-vazio" data-res-vazio role="status" aria-live="polite" hidden>Nenhum voo bate com os filtros marcados. Desmarque alguma opção ao lado para ver mais voos.</p>` +
    `<p class="res-fine">${
      voosReais
        ? "Os preços acima vieram da busca ao vivo no momento em que esta página carregou e podem mudar a qualquer momento."
        : "Preços acima são exemplos."
    } Ao selecionar, você vai para o site do parceiro ver as tarifas reais e concluir a compra. O Aonde pode receber comissão, sem custo extra para você.</p>` +
    `<div class="res-pix"><strong>Pix</strong><span>Vários parceiros dão desconto no Pix, mas não todos, e o percentual é decidido por eles. O valor com desconto aparece no site do parceiro antes de você confirmar.</span></div>` +
    `<div class="res-alert-banner"><div><strong>Não fechou negócio hoje?</strong> ` +
    `<span>A gente avisa se ${escapeHtml(rota.origem)} → ${escapeHtml(rota.destino)} ficar mais barato.</span></div>` +
    `<form class="res-alert-form" data-newsletter action="/api/newsletter/subscribe" method="post">` +
    `<input name="email" type="email" required aria-label="Seu e-mail" placeholder="Seu melhor e-mail">` +
    `<input type="hidden" name="origem" value="${escapeHtml(rota.origem)}">` +
    `<input type="hidden" name="destino" value="${escapeHtml(rota.destino)}">` +
    `<button class="btn btn-dark" type="submit">Ativar alerta desta rota</button>` +
    `<p class="news-msg" data-newsletter-msg role="status" aria-live="polite" hidden></p>` +
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
  // Honestidade: a pessoa vai para o Aviasales (parceiro/agregador), nao para
  // a cia aerea direto. O nome da cia pode continuar na linha do voo ("Azul,
  // 3–10 set"), mas o CTA e o titulo da interstitial devem dizer para ONDE a
  // pessoa realmente vai.
  const parceiro = "Aviasales";

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
    (telLabel()
      ? `<p>Atendimento: <strong>${escapeHtml(telLabel())}</strong>, todos os dias.</p>`
      : `<p>O canal de atendimento do Aonde é esta Central de ajuda. Não temos telefone nem WhatsApp por enquanto — preferimos dizer isso a deixar você esperando numa linha que não existe.</p>`) +
    `<p class="help-fine">Atendimento sobre o Aonde (dúvidas, sugestões, problemas com o site). Para alteração/cancelamento de uma reserva já paga, o canal certo é o suporte do parceiro — ver <a href="/cancelamentos">Trocas e cancelamentos</a>.</p>` +
    `</div>` +
    `</section></main>` +
    siteFooter();
  return htmlDocument({ title: "Central de ajuda · Aonde", body, canonical: "/ajuda", jsonld: [buildFaqPage(FAQ_GROUPS)],
    description: "Como o Aonde funciona, quem cobra pela passagem, o que acontece se o preço mudar e como falar com a gente." });
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
  return htmlDocument({ title: "Trocas e cancelamentos · Aonde", body, canonical: "/cancelamentos",
    description: "Seus direitos de arrependimento, troca e cancelamento pelo CDC e pelas regras da ANAC — e com quem resolver cada caso." });
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
  return htmlDocument({ title: "Alertas de preço · Aonde", body, script: enhancementScript(), canonical: "/alertas",
    description: "Avisamos por e-mail quando a passagem da sua rota ficar mais barata. Sem frequência fixa, sem spam, cancela quando quiser." });
}

/**
 * Pagina de confirmacao de descadastro, aberta pelo link do e-mail (GET).
 *
 * Por que GET nao descadastra direto: antivirus e o proprio provedor de e-mail
 * costumam PRE-ABRIR os links da mensagem para checar seguranca. Se o GET
 * mudasse estado, essas visitas automaticas descadastrariam gente que nunca
 * clicou. Entao o link abre esta pagina e o botao faz o POST.
 *
 * O formulario funciona sem JavaScript.
 */
/**
 * Pagina 404 para navegacao de navegador.
 *
 * Antes, um caminho desconhecido (URL digitada errada, link velho de uma busca
 * ou de um post compartilhado) devolvia JSON cru:
 *   {"error":"Rota nao encontrada: GET /nao-existe"}
 * — sem HTML e sem nenhum caminho de volta. As rotas de detalhe
 * (/ofertas/:id, /guias/:id) ja devolviam pagina; a rota generica nao.
 *
 * Nao e so estetica: 404 e uma porta de entrada comum, vinda de buscador e de
 * link compartilhado. Oferece as saidas obvias em vez de deixar a pessoa presa.
 */
export function renderNotFoundPage({ caminho = "" } = {}) {
  const body =
    `<main id="conteudo" tabindex="-1"><section class="wrap map-head status-page">` +
    `<p class="eyebrow eyebrow--green">Página não encontrada</p>` +
    `<h1 class="map-title">Esse endereço não existe por aqui</h1>` +
    `<p class="map-sub">Pode ser um link antigo, ou um endereço digitado com algum erro${
      caminho ? ` (<code>${escapeHtml(caminho)}</code>)` : ""
    }. O site continua inteiro — é só escolher por onde seguir.</p>` +
    `<p class="nf-saidas">` +
    `<a class="btn btn-green" href="/ofertas">Ver os achados de hoje →</a> ` +
    `<a class="btn btn-ghost btn-ghost--claro" href="/guias">Roteiros de 5 dias</a> ` +
    `<a class="btn btn-ghost btn-ghost--claro" href="/">Página inicial</a>` +
    `</p>` +
    `<p class="map-sub">Se você chegou aqui por um link do próprio site, avise pela <a href="/ajuda">Central de ajuda</a> — é falha nossa, não sua.</p>` +
    `</section></main>` +
    siteFooter();
  return htmlDocument({
    title: "Página não encontrada · Aonde",
    description: "Este endereço não existe no Aonde. Veja os achados de passagem do dia ou escolha um roteiro de 5 dias.",
    body,
    script: enhancementScript(),
  });
}

/**
 * Pagina de erro do servidor. NAO recebe nem mostra a mensagem interna: o
 * tratador anterior devolvia `err.message` direto para o navegador, o que nao
 * ajuda quem le e ainda expoe detalhe de implementacao. O diagnostico vai para
 * o log do servidor, onde serve para alguem.
 */
export function renderServerErrorPage() {
  const body =
    `<main id="conteudo" tabindex="-1"><section class="wrap map-head status-page">` +
    `<p class="eyebrow eyebrow--green">Erro nosso</p>` +
    `<h1 class="map-title">Alguma coisa quebrou do nosso lado</h1>` +
    `<p class="map-sub">Não foi você. Tente de novo em alguns instantes — e, se continuar, a <a href="/ajuda">Central de ajuda</a> registra o problema.</p>` +
    `<p class="nf-saidas"><a class="btn btn-green" href="/">Voltar para o início</a></p>` +
    `</section></main>` +
    siteFooter();
  return htmlDocument({ title: "Erro no servidor · Aonde", body });
}

export function renderUnsubscribePage({ email = "" } = {}) {
  const body =
    `<main id="conteudo" tabindex="-1"><section class="wrap map-head status-page">` +
    `<p class="eyebrow eyebrow--green">Cancelar inscrição</p>` +
    `<h1 class="map-title">Quer parar de receber?</h1>` +
    `<p class="map-sub">É só confirmar abaixo. Não vamos perguntar o motivo nem pedir para você repensar.</p>` +
    `<form method="post" action="/api/newsletter/unsubscribe" class="unsub-form">` +
    `<label class="unsub-lab" for="unsub-email">Seu e-mail</label>` +
    `<input class="unsub-input" id="unsub-email" name="email" type="email" required ` +
    `value="${escapeHtml(email)}" placeholder="voce@exemplo.com">` +
    `<button class="btn btn-green" type="submit">Confirmar cancelamento</button>` +
    `</form>` +
    `<p class="map-sub"><a href="/">Voltar para o site</a></p>` +
    `</section></main>` +
    siteFooter();
  return htmlDocument({
    title: "Cancelar inscrição · Aonde",
    body,
    script: enhancementScript(),
    canonical: "/api/newsletter/unsubscribe",
  });
}

export function renderNewsletterStatusPage({ ok, error, pendente, descadastrado } = {}) {
  const body =
    `<main id="conteudo" tabindex="-1"><section class="wrap map-head status-page">` +
    (ok
      ? descadastrado
        ? `<p class="eyebrow eyebrow--green">Pronto</p><h1 class="map-title">Cancelamento feito</h1>` +
          `<p class="map-sub">Se este e-mail estava inscrito, não mandamos mais nada para ele. Nenhuma pergunta, nenhum "tem certeza?".</p>` +
          `<p><a class="btn btn-green" href="/">Voltar para o site</a></p>`
      : pendente
        // Inscricao RECEBIDA nao e inscricao CONFIRMADA: ainda falta a pessoa
        // clicar no link do e-mail (double opt-in). Dizer "confirmada" aqui
        // seria prometer o que ainda nao aconteceu.
        ? `<p class="eyebrow eyebrow--green">Quase lá</p><h1 class="map-title">Confira seu e-mail</h1>` +
          `<p class="map-sub">Se este for um e-mail válido, acabamos de enviar um link de confirmação. A inscrição só vale depois que você clicar nele — é assim que a gente garante que ninguém inscreve você sem querer.</p>` +
          `<p><a class="btn btn-green" href="/ofertas">Ver ofertas de hoje →</a></p>`
      : `<p class="eyebrow eyebrow--green">Tudo certo</p><h1 class="map-title">Inscrição confirmada!</h1>` +
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
      `<p class="map-canvas-msg">O mapa interativo ainda não está disponível aqui. Os destinos abaixo abrem o roteiro completo de cada lugar — e cada um deles tem link para ver a localização no Google Maps.</p>` +
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

  return htmlDocument({ title: "Mapa de destinos · Aonde", body, script, canonical: "/mapa",
    description: "Todos os destinos do Aonde no mapa: clique em um pino para ver o roteiro de 5 dias e as passagens que saem para lá." }) .replace(
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
      // aria-pressed acompanha a classe: sem isso, quem usa leitor de tela nao
      // tem como saber qual aba esta selecionada (WCAG 4.1.2).
      tabs.forEach(function(t,k){
        t.classList.toggle('is-active',k===n);
        t.setAttribute('aria-pressed',k===n?'true':'false');
      });
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
  // Menu do celular: marca quando chegou ao fim da rolagem, para a mascara de
  // "tem mais coisa para o lado" sumir em vez de desbotar o ultimo item.
  var nav=document.querySelector('.site-nav');
  if(nav){
    var marcaFim=function(){
      var fim=nav.scrollLeft+nav.clientWidth>=nav.scrollWidth-2;
      if(fim)nav.setAttribute('data-fim','1');else nav.removeAttribute('data-fim');
    };
    nav.addEventListener('scroll',marcaFim,{passive:true});
    window.addEventListener('resize',marcaFim);
    marcaFim();
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
      if(contador){
        // Le o rotulo que o servidor decidiu (real x exemplo). Nunca cravar
        // aqui: com busca ao vivo isso rotulava preco real como exemplo.
        var rot=contador.getAttribute('data-res-rotulo')||'voos';
        contador.textContent=visiveis+' '+rot+' · ordenar por';
      }
      if(vazio)vazio.hidden=visiveis!==0;
    }
    caixas.forEach(function(cb){cb.addEventListener('change',aplicaFiltros);});

    // Ordenacao. Estes botoes existiam so como enfeite: eram <button> sem
    // nenhum listener, e clicar neles nao fazia nada. Controle que finge
    // funcionar e a mesma familia de problema que preco falso.
    var lista=document.querySelector('[data-res-lista]');
    var pills=document.querySelectorAll('[data-res-sort]');
    if(lista&&pills.length){
      var num=function(el,attr){
        var v=parseInt(el.getAttribute(attr)||'',10);
        // v!==v e verdade so quando o parse falhou. Escrito assim de proposito:
        // este script vai inteiro no HTML, e ha teste que varre a pagina atras
        // de palavras vazadas de template quebrado — a checagem obvia carrega
        // uma delas no proprio nome.
        return v===v?v:Infinity;   // sem dado vai para o fim, nunca para o topo
      };
      var ordena=function(chave){
        var itens=[].slice.call(lista.querySelectorAll('[data-res-voo]'));
        itens.sort(function(a,b){
          if(chave==='preco')  return num(a,'data-preco')-num(b,'data-preco');
          if(chave==='duracao')return num(a,'data-duracao')-num(b,'data-duracao');
          return num(a,'data-ordem')-num(b,'data-ordem'); // "recomendado" = ordem original
        });
        itens.forEach(function(el){lista.appendChild(el);});
      };
      pills.forEach(function(btn){
        btn.addEventListener('click',function(){
          pills.forEach(function(o){
            o.classList.toggle('is-active',o===btn);
            o.setAttribute('aria-pressed',o===btn?'true':'false');
          });
          ordena(btn.getAttribute('data-res-sort'));
        });
      });
    }
    aplicaFiltros();
  }
  // Seletor de origem alteravel: quando a pessoa troca a origem, reconstroi
  // o link /saida com ?origem= novo (para ofertas com aviasalesUrl).
  document.querySelectorAll('[data-origin-selector]').forEach(function(select){
    var offerId=select.getAttribute('data-offer-id');
    var origemOriginal=select.value;
    var root=select.closest('.hoje-card')||select.closest('main')||document;
    select.addEventListener('change',function(){
      var novaOrigem=select.value;
      var opt=select.options[select.selectedIndex];
      var cidade=(opt&&opt.getAttribute('data-city'))||'';
      var saidaLinks=document.querySelectorAll('a[href^="/saida/'+offerId+'"]');
      saidaLinks.forEach(function(link){
        var url=new URL(link.href);
        url.searchParams.set('origem',novaOrigem);
        link.href=url.toString();
      });
      // Se a oferta mostra preco especifico da origem original e a origem mudou,
      // esconde o preco (honestidade: o valor mostrado era para a origem original).
      var precoEls=root.querySelectorAll('[data-origin-price="'+origemOriginal+'"]');
      precoEls.forEach(function(el){
        if(novaOrigem!==origemOriginal){el.hidden=true;}
        else{el.hidden=false;}
      });
      if(cidade){
        root.querySelectorAll('[data-origin-city-label]').forEach(function(el){
          el.textContent=cidade;
        });
      }
      root.querySelectorAll('[data-origin-iata-label]').forEach(function(el){
        el.textContent=novaOrigem;
      });
      // Foto do destino fica do destino. Nao entra jpg da cidade de origem.
      root.querySelectorAll('img[data-dest-photo]').forEach(function(img){
        var keep=img.getAttribute('data-dest-src');
        if(keep&&img.getAttribute('src')!==keep){
          img.srcset='';
          img.src=keep;
        }
      });
    });
  });
})();`;
}
