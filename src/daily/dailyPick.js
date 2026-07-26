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
export function chaveDoDia(date = new Date()) {
  let d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
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
 * @param {Date|string} data
 * @param {object} [opts]
 * @param {number} [opts.quantidade=2]
 * @returns {Array<{offer:object, guide:object|null}>}
 */
export function escolhaDoDia(data = new Date(), { quantidade = 2, offers = OFFERS, guides = GUIDES } = {}) {
  const candidatos = offers
    .map((offer) => ({ offer, guide: guiaDaOferta(offer, guides) }))
    .filter((c) => c.guide); // so entra quem tem roteiro de verdade

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
    itens: escolhas.map(({ offer, guide }) => ({
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
        href: `/ofertas/${offer.id}`,
      },
      roteiro: roteiroEmBullets(guide),
    })),
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
