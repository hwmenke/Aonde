// ---------------------------------------------------------------------------
// LINKS INTERNOS DOS ROTEIROS DE 5 DIAS.
//
// Tudo aqui sai de dado que ja existe no repositorio: o guia (tag, resumo,
// opt), as ofertas editoriais (OFFERS) e a escolha do dia (escolhaDoDia).
// Nada e inventado: sem oferta para o destino, a secao diz isso e aponta para
// /ofertas; sem escolha do dia, aponta para /hoje sem prometer nada.
//
// Vive num arquivo proprio para o htmlRenderer.js (que e o gargalo de toda
// mudanca de tela) ganhar so uma chamada, e para a logica ser testavel sem
// renderizar a pagina.
// ---------------------------------------------------------------------------

import { OFFERS, GUIDES, GUIDE_LIST, melhorMesDoGuia } from "./aondeContent.js";
import { cidadeDoIata } from "./aeroportos.js";
import { escapeHtml, semAcento } from "./texto.js";
import { escolhaDoDia, guiaDaOferta } from "../daily/dailyPick.js";

/** "Praia · Alagoas" -> { categoria: "Praia", regiao: "Alagoas" }. */
export function partesDaTag(tag) {
  const [categoria = "", regiao = ""] = String(tag || "")
    .split("·")
    .map((s) => s.trim());
  return { categoria, regiao };
}

// "Praia" e "Praias e lagoa" contam como o mesmo estilo; "Cidade" e
// "Cidades historicas" tambem. Compara a primeira palavra sem acento, sem o
// plural.
function raizDoEstilo(categoria) {
  const palavra = semAcento(String(categoria || "")).split(/\s+/)[0] || "";
  return palavra.replace(/s$/, "");
}

/**
 * Roteiros para continuar lendo. Prefere o mesmo estado/pais (regiao da tag),
 * depois o mesmo estilo; o que faltar vem da ordem geografica de GUIDE_LIST,
 * a partir do guia atual (cada guia aponta para vizinhos diferentes, em vez de
 * todos apontarem para os mesmos tres).
 *
 * @returns {Array<{guide:object, motivo:string}>} `motivo` so existe quando ha
 *   algo verdadeiro a dizer (mesma regiao/mesmo estilo).
 */
export function roteirosRelacionados(guide, { max = 3, lista = GUIDE_LIST } = {}) {
  if (!guide || !guide.id) return [];
  const eu = partesDaTag(guide.tag);
  const outros = lista.filter((g) => g && g.id && g.id !== guide.id);
  const pontuados = outros.map((g, ordem) => {
    const t = partesDaTag(g.tag);
    const mesmaRegiao = !!eu.regiao && t.regiao === eu.regiao;
    const mesmoEstilo = !!eu.categoria && raizDoEstilo(t.categoria) === raizDoEstilo(eu.categoria);
    let motivo = "";
    if (mesmaRegiao) motivo = `Também em ${t.regiao}`;
    else if (mesmoEstilo) motivo = `Mesmo estilo: ${t.categoria.toLowerCase()}`;
    return { guide: g, motivo, ordem, score: (mesmaRegiao ? 3 : 0) + (mesmoEstilo ? 2 : 0) };
  });
  const comMotivo = pontuados.filter((p) => p.score > 0).sort((a, b) => b.score - a.score || a.ordem - b.ordem);
  const escolhidos = comMotivo.slice(0, max);
  if (escolhidos.length < max) {
    const ids = new Set(escolhidos.map((p) => p.guide.id));
    const inicio = lista.findIndex((g) => g && g.id === guide.id);
    const vizinhos = lista
      .map((_, i) => lista[(inicio + 1 + i) % lista.length])
      .filter((g) => g && g.id && g.id !== guide.id && !ids.has(g.id));
    for (const g of vizinhos) {
      if (escolhidos.length >= max) break;
      escolhidos.push({ guide: g, motivo: "", ordem: 0, score: 0 });
    }
  }
  return escolhidos.map(({ guide: g, motivo }) => ({ guide: g, motivo }));
}

/**
 * Ofertas editoriais do MESMO destino do roteiro. Usa o mesmo casamento por
 * cidade de /hoje (guiaDaOferta), entao as duas paginas nunca discordam sobre
 * qual oferta pertence a qual roteiro.
 */
export function ofertasDoRoteiro(guide, { offers = OFFERS, max = 3 } = {}) {
  if (!guide || !guide.id) return [];
  const so = { [guide.id]: guide };
  return offers.filter((o) => o && o.id && guiaDaOferta(o, so)).slice(0, max);
}

/**
 * O que /hoje esta mostrando no dia. `eEsteRoteiro` e verdadeiro so quando o
 * destino deste roteiro e uma das escolhas.
 */
export function hojeParaRoteiro(guide, data = new Date()) {
  let escolhas = [];
  try {
    escolhas = escolhaDoDia(data);
  } catch {
    escolhas = [];
  }
  const cidades = escolhas.map((e) => e && e.offer && e.offer.cidade).filter(Boolean);
  const eEsteRoteiro = !!guide && escolhas.some((e) => e && e.guide && e.guide.id === guide.id);
  return { cidades, eEsteRoteiro };
}

function listaEm(nomes) {
  if (nomes.length <= 1) return nomes[0] || "";
  return `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
}

function ofertaCardHtml(o) {
  const origem = cidadeDoIata(o.origem) || o.origem;
  const rota = `${origem} → ${o.cidade || o.destino}`;
  const detalhe = [o.cia, o.datas].filter(Boolean).map(escapeHtml).join(" · ");
  return (
    `<a class="rel-card" href="/ofertas/${encodeURIComponent(o.id)}">` +
    `<div class="rel-top"><span class="rel-rota">${escapeHtml(rota)}</span>` +
    (o.badge ? `<span class="rel-badge ${o.erro ? "badge-erro" : "badge-desconto"}">${escapeHtml(o.badge)}</span>` : "") +
    `</div>` +
    (o.preco ? `<span class="rel-preco">${escapeHtml(o.preco)}</span>` : "") +
    (detalhe ? `<span class="rel-cia">${detalhe}</span>` : "") +
    `<span class="guia-mais-ver">Ver a oferta →</span>` +
    `</a>`
  );
}

/** Link discreto na caixa "Na pratica" (alto da pagina) para o achado do destino. */
export function ofertaNaCaixaHtml(guide, opts = {}) {
  const [o] = ofertasDoRoteiro(guide, { ...opts, max: 1 });
  if (!o) return "";
  const origem = cidadeDoIata(o.origem) || o.origem;
  return (
    `<a class="guia-aside-oferta" href="/ofertas/${encodeURIComponent(o.id)}">` +
    `Achado de passagem: ${escapeHtml(origem)} → ${escapeHtml(o.cidade || o.destino)}` +
    `${o.datas ? `, ${escapeHtml(o.datas)}` : ""} →</a>`
  );
}

function roteiroCardHtml({ guide: g, motivo }) {
  const melhor = melhorMesDoGuia(g);
  return (
    `<a class="guia-rel-card" href="/guias/${encodeURIComponent(g.id)}">` +
    `<span class="guia-rel-tag">${escapeHtml(g.tag)}</span>` +
    `<strong class="guia-rel-titulo">${escapeHtml(g.titulo)}</strong>` +
    (g.resumo ? `<span class="guia-rel-resumo">${escapeHtml(g.resumo)}</span>` : "") +
    (motivo || melhor
      ? `<span class="guia-rel-foot">${[motivo, melhor ? `melhor preço em ${melhor}` : ""].filter(Boolean).map(escapeHtml).join(" · ")}</span>`
      : "") +
    `</a>`
  );
}

/**
 * Secao "Continue planejando": passagens do destino, /hoje e outros roteiros.
 * `data` fixa o dia de /hoje (testes); em producao e o instante atual.
 */
export function continuePlanejandoHtml(guide, { data = new Date(), offers = OFFERS, guides = GUIDE_LIST } = {}) {
  if (!guide || !guide.id || !GUIDES[guide.id]) return "";
  const destino = guide.breadcrumb || guide.titulo || "este destino";
  const ofertas = ofertasDoRoteiro(guide, { offers });
  const hoje = hojeParaRoteiro(guide, data);
  const relacionados = roteirosRelacionados(guide, { lista: guides });

  const passagens = ofertas.length
    ? `<div class="rel-grid">${ofertas.map(ofertaCardHtml).join("")}</div>` +
      `<p class="guia-mais-fine">Preço e datas são os da página de cada oferta. A compra é feita no site do parceiro, que confirma o valor final.</p>`
    : `<p class="guia-mais-txt">Ainda não temos um achado de passagem publicado para ${escapeHtml(destino)} na nossa lista. ` +
      `Os achados mudam; veja os que estão no ar agora.</p>` +
      `<a class="btn btn-ghost btn-ghost--claro" href="/ofertas">Ver todos os achados de passagem →</a>`;

  let hojeTxt;
  if (hoje.eEsteRoteiro) {
    hojeTxt = `<strong>${escapeHtml(destino)}</strong> é uma das escolhas de hoje, com o roteiro em tópicos e a passagem do dia.`;
  } else if (hoje.cidades.length) {
    hojeTxt = `Hoje a escolha do dia é <strong>${escapeHtml(listaEm(hoje.cidades))}</strong>, com o roteiro em tópicos e onde comer.`;
  } else {
    hojeTxt = "Todo dia escolhemos um ou dois achados, com o roteiro em tópicos e onde comer.";
  }

  return (
    `<section class="wrap section guia-mais" id="continue-planejando">` +
    `<h2 class="guia-h2">Continue planejando</h2>` +
    `<div class="guia-mais-bloco"><h3 class="guia-mais-h">Passagens para ${escapeHtml(destino)}</h3>${passagens}</div>` +
    `<div class="guia-mais-bloco"><h3 class="guia-mais-h">A escolha do dia</h3>` +
    `<p class="guia-mais-txt">${hojeTxt}</p>` +
    `<a class="btn btn-ghost btn-ghost--claro" href="/hoje">Ver a escolha do dia →</a></div>` +
    (relacionados.length
      ? `<div class="guia-mais-bloco"><h3 class="guia-mais-h">Outros roteiros de 5 dias</h3>` +
        `<div class="guia-rel-grid">${relacionados.map(roteiroCardHtml).join("")}</div>` +
        `<p class="guia-mais-fine"><a href="/guias">Ver todos os roteiros →</a></p></div>`
      : "") +
    `</section>`
  );
}

/**
 * Indice do roteiro (dia a dia + secoes da pagina). Cada item aponta para um
 * id que existe de verdade na pagina (ver renderGuideVM).
 */
export function indiceDoRoteiroHtml(dias, { temHospedagem = false, temEpoca = false, temPreparativos = false, temMais = false } = {}) {
  const itens = (Array.isArray(dias) ? dias : [])
    .filter((d) => d && d.n)
    .map(
      (d) =>
        `<li><a href="#dia-${escapeHtml(d.n)}"><span class="guia-toc-n">Dia ${escapeHtml(d.n)}</span>` +
        `<span class="guia-toc-t">${escapeHtml(d.titulo)}</span></a></li>`
    )
    .join("");
  if (!itens) return "";
  const extras = [
    temHospedagem ? ["#onde-ficar", "Onde ficar"] : null,
    temEpoca ? ["#quando-ir", "Quando ir"] : null,
    temPreparativos ? ["#antes-de-viajar", "Antes de viajar"] : null,
    temMais ? ["#continue-planejando", "Passagens e outros roteiros"] : null,
  ]
    .filter(Boolean)
    .map(([href, rotulo]) => `<a href="${href}">${escapeHtml(rotulo)}</a>`)
    .join("");
  return (
    `<nav class="guia-toc" aria-labelledby="guia-toc-h">` +
    `<h2 class="guia-toc-h" id="guia-toc-h">Neste roteiro</h2>` +
    `<ol class="guia-toc-lista">${itens}</ol>` +
    (extras ? `<p class="guia-toc-extras"><span>Mais nesta página:</span>${extras}</p>` : "") +
    `</nav>`
  );
}
