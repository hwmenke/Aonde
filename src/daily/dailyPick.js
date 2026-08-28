// ---------------------------------------------------------------------------
// ROBO DO DIA — escolhe 1-2 ofertas por dia e monta um roteiro em bullets.
//
// A ideia: todo dia o site (e o e-mail/rede social, se quiser) mostra um ou
// dois achados com um roteiro bacana ja pronto, em topicos curtos e com foto.
//
// Duas fontes de conteudo, nessa ordem:
//   1. ROTEIRO EDITORIAL (src/render/aondeContent.js + moreGuides.js) — texto
//      escrito por gente, com restaurante por dia. E o caminho preferido.
//   2. PESQUISA AO VIVO (src/guides/itineraryBuilder.js, Google Places) — para
//      destino que ainda nao tem roteiro editorial. Precisa de GOOGLE_MAPS_API_KEY;
//      sem chave, a funcao devolve ok:false e o robo simplesmente nao usa esse
//      destino (nunca inventa conteudo para preencher espaco).
//
// A escolha e DETERMINISTICA por data: o mesmo dia sempre da o mesmo par. Isso
// deixa a pagina cacheavel, o resultado reproduzivel em teste e evita que dois
// processos rodando no mesmo dia mostrem coisas diferentes.
// ---------------------------------------------------------------------------

import { OFFERS, GUIDES, melhorMesDoGuia } from "../render/aondeContent.js";
import { cidadeDoIata } from "../render/aeroportos.js";

/**
 * Data como "AAAA-MM-DD" no fuso local.
 *
 * Data invalida cai para HOJE em vez de propagar NaN. Sem isso, `new Date("lixo")`
 * virava a chave "NaN-NaN-NaN", que virava indice NaN, que virava item undefined
 * e derrubava o robo inteiro com "Cannot destructure property 'offer'" — um cron
 * com parametro errado tirava a pagina do dia do ar.
 */
/**
 * Fuso do produto. O Aonde e brasileiro: "hoje" e o hoje de quem le, nao o do
 * servidor. Sem isto, `getFullYear/getMonth/getDate` usavam o fuso do PROCESSO
 * — rodando em UTC, a partir de ~21h em Brasilia a pagina /hoje ja mostrava a
 * escolha do dia seguinte, com a data rotulada errada.
 */
const FUSO_PRODUTO = process.env.AONDE_TIMEZONE || "America/Sao_Paulo";

// /hoje mostra so os tres achados conferidos (gru-eze, gru-fln, gig-ssa).
// for-ssa e inventario com wrap Aviasales; nao entra na rotacao diaria.
const HOJE_LOCK_IDS = new Set(["gru-eze", "gru-fln", "gig-ssa"]);

export function chaveDoDia(date = new Date()) {
  // "2026-07-26" ja E uma data de calendario, nao um instante: converter para
  // fuso jogaria para o dia anterior (meia-noite UTC = 21h do dia anterior em
  // Brasilia). So instante vira dia; dia continua dia.
  if (typeof date === "string") {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
    if (m) {
      const [, a, mes, dia] = m;
      const valida = new Date(`${a}-${mes}-${dia}T12:00:00Z`);
      if (!Number.isNaN(valida.getTime()) && valida.getUTCDate() === Number(dia)) {
        return `${a}-${mes}-${dia}`;
      }
    }
  }
  let d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) d = new Date();
  try {
    // en-CA formata como AAAA-MM-DD, que e exatamente a chave que queremos.
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: FUSO_PRODUTO,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  } catch {
    // Ambiente sem base de fusos (build minimo do ICU): cai no fuso local.
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
}

/** True quando a data e utilizavel. Serve para quem quiser AVISAR em vez de cair para hoje. */
export function dataValida(date) {
  if (date === undefined || date === null) return true; // ausente = hoje, de proposito
  const d = date instanceof Date ? date : new Date(date);
  return !Number.isNaN(d.getTime());
}

/** Hash estavel (FNV-1a) da chave do dia — a "moeda" do sorteio diario. */
function semente(chave) {
  let h = 0x811c9dc5;
  for (let i = 0; i < chave.length; i++) {
    h ^= chave.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Casa uma oferta com o roteiro editorial do MESMO destino, quando existe.
 * O casamento e pela cidade (a oferta guarda `cidade`; o roteiro, `breadcrumb`),
 * comparadas sem acento e sem caixa.
 */
function normalizar(txt) {
  return String(txt || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export function guiaDaOferta(offer, guides = GUIDES) {
  if (!offer) return null;
  const alvo = normalizar(offer.cidade);
  if (!alvo) return null;
  for (const g of Object.values(guides)) {
    const cidadeGuia = normalizar(g.breadcrumb);
    if (cidadeGuia === alvo) return g;
    // "Recife e Porto de Galinhas" cobre a oferta de "Recife".
    if (cidadeGuia.includes(alvo) || alvo.includes(cidadeGuia)) return g;
  }
  return null;
}

/**
 * Escolhe as ofertas do dia. Prefere as que TEM roteiro editorial — sem
 * roteiro nao ha o que mostrar de bacana, que e o ponto da secao.
 *
 * LOCK DE 21 AGO 2026: GRU-EZE e o achado do dia, com o roteiro de Buenos
 * Aires. O preco foi visto no Google Flights naquele dia (R$ 1.570) e
 * confirmado no Aviasales a USD $298 para o mesmo voo SWISS. Esse lock
 * garante que /hoje mostre exatamente essa oferta naquele dia, em vez de
 * seguir a rotacao automatica.
 *
 * @param {Date|string} data
 * @param {object} [opts]
 * @param {number} [opts.quantidade=2]
 * @returns {Array<{offer:object, guide:object|null}>}
 */
export function escolhaDoDia(data = new Date(), { quantidade = 2, offers = OFFERS, guides = GUIDES } = {}) {
  const chave = chaveDoDia(data);
  
  // LOCK para 21 de agosto de 2026: mostra GRU-EZE com o roteiro de Buenos Aires.
  if (chave === "2026-08-21") {
    const gruEze = offers.find((o) => o.id === "gru-eze");
    if (gruEze) {
      const guide = guides.buenosaires;
      return [{ offer: gruEze, guide }];
    }
  }
  
  // LOCK para 22 de agosto de 2026: mostra GRU-FLN com o roteiro de Florianópolis.
  if (chave === "2026-08-22") {
    const gruFln = offers.find((o) => o.id === "gru-fln");
    if (gruFln) {
      const guide = guides.florianopolis;
      return [{ offer: gruFln, guide }];
    }
  }
  
  // LOCK para 23 de agosto de 2026: mostra GIG-SSA com o roteiro de Salvador.
  if (chave === "2026-08-23") {
    const gigSsa = offers.find((o) => o.id === "gig-ssa");
    if (gigSsa) {
      const guide = guides.salvador;
      return [{ offer: gigSsa, guide }];
    }
  }
  
  const candidatos = offers
    .map((offer) => ({ offer, guide: guiaDaOferta(offer, guides) }))
    .filter((c) => c.guide) // so entra quem tem roteiro de verdade
    .filter((c) => c.offer.aviasalesUrl || c.offer.affiliate_url || c.offer.affiliateUrl) // e so entra quem e RESERVAVEL (tem wrap do Aviasales)
    .filter((c) => HOJE_LOCK_IDS.has(c.offer.id)); // for-ssa e inventario, nao /hoje

  if (!candidatos.length) return [];

  // Rotacao SEQUENCIAL por dia: o dia N mostra os proximos `total` candidatos
  // depois de onde o dia N-1 parou. Assim quem entra dois dias seguidos ve
  // ofertas diferentes, e todo destino da vez sem depender de sorte.
  // (A primeira versao sorteava por hash da data e caiu no caso obvio: dois
  // dias seguidos com o mesmo par, so trocado de ordem.)
  const total = Math.max(1, Math.min(quantidade, candidatos.length));
  // Cinto de seguranca: mesmo que a chave chegue estranha, o indice nunca vira
  // NaN (que faria ordem[NaN] devolver undefined e estourar em quem consome).
  const ms = Date.parse(`${chaveDoDia(data)}T00:00:00Z`);
  const diaIndex = Number.isFinite(ms) ? Math.floor(ms / 86400000) : 0;
  // Ordem base embaralhada uma vez (estavel), para nao seguir a ordem do arquivo.
  const ordem = candidatos
    .map((c, i) => ({ c, k: semente(c.offer.id) ^ i }))
    .sort((x, y) => x.k - y.k)
    .map((x) => x.c);

  const base = ((diaIndex * total) % ordem.length + ordem.length) % ordem.length;
  const escolhidos = [];
  for (let i = 0; i < total; i++) escolhidos.push(ordem[(base + i) % ordem.length]);
  return escolhidos.filter(Boolean);
}

/**
 * Roteiro em BULLETS a partir de um roteiro editorial: um topico por dia, com
 * o que ver e onde comer. Texto so do que existe no roteiro — nada inventado.
 *
 * @returns {{titulo:string, destino:string, bullets:Array, foto:object|null, melhorMes:string}}
 */
export function roteiroEmBullets(guide, { maxDias = 5, maxPontosPorDia = 2 } = {}) {
  if (!guide) return null;
  const dias = Array.isArray(guide.dias) ? guide.dias.slice(0, maxDias) : [];
  const bullets = dias.map((d) => {
    const pontos = (d.pontos || []).slice(0, maxPontosPorDia).map((p) => p.nome).filter(Boolean);
    return {
      dia: d.n,
      titulo: d.titulo || "",
      pontos,
      // Resumo curto: a primeira nota do dia, que ja e escrita para ser lida rapido.
      nota: ((d.pontos || [])[0] || {}).nota || "",
      ondeComer: d.restaurante || "",
      ondeComerNota: d.restauranteNota || "",
    };
  });
  return {
    id: guide.id,
    titulo: guide.titulo || "",
    destino: guide.breadcrumb || "",
    resumo: guide.resumo || "",
    foto: guide.heroSrc ? { url: guide.heroSrc, credito: guide.heroCredit || "", href: guide.heroCreditHref || "" } : null,
    melhorMes: melhorMesDoGuia(guide) || "",
    bullets,
    href: guide.id ? `/guias/${guide.id}` : "",
  };
}

/**
 * Pacote completo do dia: ofertas + roteiro em bullets + rota por extenso.
 * E o que a pagina /hoje, o script de cron e (no futuro) o e-mail consomem.
 */
export function pacoteDoDia(data = new Date(), opts = {}) {
  const escolhas = escolhaDoDia(data, opts);
  return {
    dia: chaveDoDia(data),
    itens: escolhas.map(({ offer, guide }) => {
      // Oferta RESERVAVEL (tem affiliateUrl OU aviasalesUrl): o botao primario
      // vai direto para /saida/{id} em vez de passar por /ofertas/{id}. Isso
      // encurta o funil de conversao de /hoje (onde o WhatsApp aterra) em um
      // clique. aviasalesUrl e envolvido em tp.media dentro de /saida/{id}.
      const bookable = !!(offer.affiliateUrl || offer.affiliate_url || offer.aviasalesUrl);
      const href = bookable && offer.id ? `/saida/${offer.id}` : `/ofertas/${offer.id}`;
      return {
        oferta: {
          id: offer.id,
          origem: offer.origem,
          destino: offer.destino,
          origemCidade: cidadeDoIata(offer.origem) || offer.origem,
          cidade: offer.cidade,
          preco: offer.preco,
          media: offer.media,
          badge: offer.badge,
          datas: offer.datas,
          cia: offer.cia,
          href,
          __source: offer, // para o renderer acessar aviasalesUrl e outros campos
        },
        roteiro: roteiroEmBullets(guide),
      };
    }),
  };
}

/**
 * Pesquisa um destino que ainda NAO tem roteiro editorial, via Google Places.
 * Import dinamico para o modulo do dia nao arrastar o cliente HTTP quando
 * ninguem usa. Sem GOOGLE_MAPS_API_KEY devolve ok:false — e o robo deixa o
 * destino de fora em vez de publicar conteudo inventado.
 */
export async function pesquisarDestino(destino, { dias = 5 } = {}) {
  const { buildItinerary } = await import("../guides/itineraryBuilder.js");
  const it = await buildItinerary({ destination: destino, days: dias });
  if (!it || !it.ok) {
    return { ok: false, destino, motivo: (it && it.error) || "pesquisa indisponivel", bullets: [] };
  }
  const bullets = (it.days || []).map((d, i) => ({
    dia: d.day || i + 1,
    titulo: d.title || "",
    pontos: (d.places || d.pontos || []).slice(0, 2).map((p) => p.nome || p.name).filter(Boolean),
    nota: "",
    ondeComer: (d.restaurant && (d.restaurant.nome || d.restaurant.name)) || "",
    ondeComerNota: "",
  }));
  return {
    ok: true,
    destino,
    bullets,
    foto: it.hero && it.hero.url ? { url: it.hero.url, credito: (it.hero.attribution && it.hero.attribution.text) || "", href: (it.hero.attribution && it.hero.attribution.uri) || "" } : null,
    atribuicao: it.attribution || "Dados de lugares: Google",
  };
}
