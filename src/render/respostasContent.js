// Páginas evergreen /respostas/:slug — perguntas que brasileiros e LLMs
// fazem de preço. Copy editorial (H1, resposta curta, FAQ) vive AQUI para o
// HTML visível e o FAQPage JSON-LD lerem a mesma fonte. Preço numérico só
// entra quando `consultaVivaDaOferta` acha consulta datada numa oferta
// ainda no ar; senão a página aponta para a oferta/busca sem inventar
// "hoje" nem promo.

import { formatBRL } from "./texto.js";
import { ofertaEncerrada } from "../offerDeparture.js";

export const RESPOSTAS_REVISADO_EM = "2026-10-26";

/** "2026-09-10" → "10/09/2026". Sem ISO reconhecível → "". */
export function isoParaDdMmAaaa(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || "").trim());
  if (!m) return "";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/**
 * Superfície honesta de preço: precisa de valor + data de consulta, e a
 * tarifa não pode estar encerrada. Sem os dois, devolve null — quem chama
 * omite o número. Nunca usa Date.now() como data de consulta.
 */
export function consultaVivaDaOferta(offer, hoje) {
  if (!offer || typeof offer !== "object") return null;
  if (offer.erro || offer.is_erro_tarifa) return null;
  if (ofertaEncerrada(offer, hoje)) return null;
  const iso = String(offer.fontePrecoEm || offer.fonte_preco_em || "")
    .trim()
    .slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  let preco = offer.preco;
  if ((preco == null || preco === "") && typeof offer.preco_centavos === "number") {
    preco = formatBRL(offer.preco_centavos);
  }
  preco = String(preco || "").trim();
  if (!preco) return null;
  const dataBr = isoParaDdMmAaaa(iso);
  if (!dataBr) return null;
  return {
    preco,
    fonte: String(offer.fontePreco || offer.fonte_preco || "").trim(),
    iso,
    dataBr,
  };
}

export const RESPOSTAS = {
  "sao-paulo-florianopolis": {
    slug: "sao-paulo-florianopolis",
    offerId: "gru-fln",
    guideId: "florianopolis",
    h1: "Quanto custa voar de São Paulo a Florianópolis?",
    title: "Quanto custa voar de São Paulo a Florianópolis? · Aonde",
    meta: "Faixa típica, o que é “consulta”, e o roteiro na Lagoa. Preços com data — sem urgência falsa.",
    respostaCurta:
      "Voos diretos GRU–FLN costumam aparecer na casa de algumas centenas a pouco mais de mil reais ida e volta, conforme temporada e antecedência. No Aonde o valor da página de oferta é consulta (Google Flights ou Aviasales na data marcada), não o preço travado da reserva. Veja a oferta atual em /ofertas/gru-fln e o roteiro em /guias/florianopolis.",
    afetaPreco: [
      "Temporada de verão, Réveillon e feriados prolongados sobem a tarifa.",
      "Voo direto versus conexão.",
      "Horário “hour trap” (ida à tarde, volta de madrugada) às vezes sai mais barato — e cansa.",
      "Bagagem: se a consulta não deixar claro, confirme no parceiro.",
    ],
    mostra: [
      "Oferta curada: /ofertas/gru-fln (base sugerida: Lagoa da Conceição).",
      "Metodologia: /metodologia (o que é consulta).",
      "Compra: no parceiro (Aviasales / companhia), não no Aonde.",
    ],
    faq: [
      {
        q: "Quanto tempo dura o voo GRU–FLN?",
        a: "Cerca de 1h15 em voo direto (confira o horário no parceiro).",
      },
      {
        q: "De qual aeroporto em São Paulo?",
        a: "A oferta curada usa **GRU**. Outros aeroportos (CGH, VCP) mudam preço e duração.",
      },
      {
        q: "O Aonde garante o preço da página?",
        a: "Não. É consulta datada. O preço final é o do parceiro na hora.",
      },
    ],
  },
  "rio-salvador": {
    slug: "rio-salvador",
    offerId: "gig-ssa",
    guideId: "salvador",
    altOfferId: "for-ssa",
    h1: "Quanto custa voar do Rio a Salvador?",
    title: "Quanto custa voar do Rio a Salvador? · Aonde",
    meta: "Direto GIG–SSA, o que esperar de preço, e o roteiro no Pelourinho / orla.",
    respostaCurta:
      "Trechos GIG–SSA diretos (cerca de 2h) aparecem com frequência no feed nacional. O Aonde trata o valor em /ofertas/gig-ssa como consulta na data da página. Roteiro editorial: /guias/salvador. Origem alternativa comum: Fortaleza → Salvador em /ofertas/for-ssa — preço e duração diferentes, em outra consulta.",
    afetaPreco: [
      "Alta temporada em Salvador (verão, carnaval, festas).",
      "Ida e volta versus só ida.",
      "Escolha GIG versus SDU (a oferta curada é **GIG**).",
    ],
    mostra: [
      "Oferta curada: /ofertas/gig-ssa.",
      "Quem sai de Fortaleza usa outra consulta: /ofertas/for-ssa.",
      "Roteiro: /guias/salvador.",
      "Metodologia: /metodologia.",
    ],
    faq: [
      {
        q: "É voo direto?",
        a: "Na oferta GIG–SSA curada, sim — confira sempre no parceiro.",
      },
      {
        q: "O guia inclui hotel?",
        a: "Não. O guia é editorial; hospedagem você reserva à parte.",
      },
      {
        q: "Posso sair de Fortaleza em vez do Rio?",
        a: "Sim — use /ofertas/for-ssa e o mesmo guia de Salvador. São consultas diferentes.",
      },
    ],
  },
  "sao-paulo-buenos-aires": {
    slug: "sao-paulo-buenos-aires",
    offerId: "gru-eze",
    guideId: "buenosaires",
    altOfferId: "vcp-bue",
    h1: "Quanto custa voar de São Paulo a Buenos Aires?",
    title: "Quanto custa voar de São Paulo a Buenos Aires? · Aonde",
    meta: "GRU–EZE (e VCP–BUE), consulta vs reserva, roteiro de 5 dias.",
    respostaCurta:
      "São Paulo → Buenos Aires é uma das rotas internacionais mais buscadas a partir do Brasil. O Aonde cura /ofertas/gru-eze; há também /ofertas/vcp-bue no catálogo, outra consulta. Preços na página são consulta datada; a reserva fecha no parceiro. O roteiro de 5 dias está em /guias/buenosaires.",
    afetaPreco: [
      "Câmbio e temporada (feriados argentinos e brasileiros).",
      "Direto versus conexão; companhia (low-cost versus full-service).",
      "Aeroporto: **EZE** versus **AEP** (e origem GRU versus VCP) — não compare preços sem igualar o aeroporto.",
    ],
    mostra: [
      "Oferta curada: /ofertas/gru-eze.",
      "Campinas (VCP–BUE) é outra consulta: /ofertas/vcp-bue.",
      "Roteiro: /guias/buenosaires.",
      "Metodologia: /metodologia.",
    ],
    faq: [
      {
        q: "GRU–EZE e VCP–BUE são a mesma coisa?",
        a: "Não. Aeroportos e horários mudam. Use a oferta certa ou trate como duas consultas.",
      },
      {
        q: "Preciso de seguro ou chip?",
        a: "O Aonde pode indicar parceiros no futuro; hoje foque na passagem e no roteiro. Seguro e eSIM não estão inventados nesta página.",
      },
      {
        q: "O Aonde emite o bilhete internacional?",
        a: "Não. Compra e suporte no parceiro.",
      },
    ],
  },
  "fortaleza-salvador": {
    slug: "fortaleza-salvador",
    offerId: "for-ssa",
    guideId: "salvador",
    altOfferId: "gig-ssa",
    h1: "Quanto custa voar de Fortaleza a Salvador?",
    title: "Quanto custa voar de Fortaleza a Salvador? · Aonde",
    meta: "Direto FOR–SSA, o que é consulta, e o roteiro no Pelourinho. GIG–SSA é outra origem.",
    respostaCurta:
      "Trechos FOR–SSA diretos (cerca de 1h50) ligam o Nordeste sem passar pelo Sudeste. O Aonde trata o valor em /ofertas/for-ssa como consulta na data da página. Roteiro editorial: /guias/salvador. Quem sai do Rio usa outra consulta: /ofertas/gig-ssa — preço e duração diferentes, não misture as duas.",
    afetaPreco: [
      "Alta temporada em Salvador (verão, carnaval, festas).",
      "Ida e volta versus só ida.",
      "Escolha FOR versus outra origem (a oferta curada é **FOR**).",
    ],
    mostra: [
      "Oferta curada: /ofertas/for-ssa.",
      "Quem sai do Rio usa outra consulta: /ofertas/gig-ssa.",
      "Roteiro: /guias/salvador.",
      "Metodologia: /metodologia.",
    ],
    faq: [
      {
        q: "É voo direto?",
        a: "Na oferta FOR–SSA curada, sim — cerca de 1h50. Confira sempre no parceiro.",
      },
      {
        q: "É a mesma consulta que Rio–Salvador?",
        a: "Não. GIG–SSA é /ofertas/gig-ssa, outra origem e outro preço. Não misture as duas.",
      },
      {
        q: "O Aonde garante o preço da página?",
        a: "Não. É consulta datada. O preço final é o do parceiro na hora.",
      },
    ],
  },
  "sao-paulo-santiago": {
    slug: "sao-paulo-santiago",
    offerId: "gru-scl",
    guideId: "santiago",
    h1: "Quanto custa voar de São Paulo a Santiago?",
    title: "Quanto custa voar de São Paulo a Santiago? · Aonde",
    meta: "Direto GRU–SCL, consulta vs reserva, e a semana editorial em Santiago.",
    respostaCurta:
      "São Paulo → Santiago é uma rota internacional frequente a partir do Brasil, com voos diretos GRU–SCL. O Aonde cura /ofertas/gru-scl; o valor da página é consulta datada, não o preço travado da reserva. Dólar de tela não é real na mão. A reserva fecha no parceiro. Roteiro: /guias/santiago.",
    afetaPreco: [
      "Câmbio e temporada (feriados chilenos e brasileiros).",
      "Direto versus conexão; companhia (low-cost versus full-service).",
      "Aeroporto de origem: a oferta curada é **GRU**.",
    ],
    mostra: [
      "Oferta curada: /ofertas/gru-scl.",
      "Roteiro: /guias/santiago.",
      "Metodologia: /metodologia.",
    ],
    faq: [
      {
        q: "De qual aeroporto em São Paulo?",
        a: "A oferta curada usa **GRU**. Outros aeroportos mudam preço e duração.",
      },
      {
        q: "O preço está em real?",
        a: "A consulta da oferta pode aparecer em dólar de tela. Não trocamos isso por real “na mão”.",
      },
      {
        q: "O Aonde emite o bilhete internacional?",
        a: "Não. Compra e suporte no parceiro.",
      },
    ],
  },
  "sao-paulo-foz-do-iguacu": {
    slug: "sao-paulo-foz-do-iguacu",
    offerId: "cgh-igu",
    guideId: "foz",
    h1: "Quanto custa voar de São Paulo a Foz do Iguaçu?",
    title: "Quanto custa voar de São Paulo a Foz do Iguaçu? · Aonde",
    meta: "Direto CGH–IGU (Congonhas, não GRU), consulta vs reserva, e o roteiro das cataratas.",
    respostaCurta:
      "Voos diretos de São Paulo a Foz do Iguaçu na oferta curada partem de Congonhas (CGH), não de Guarulhos (GRU). O Aonde trata o valor em /ofertas/cgh-igu como consulta na data da página. GRU–IGU seria outra consulta, com outro preço. Roteiro das cataratas: /guias/foz.",
    afetaPreco: [
      "Feriados e alta nas Cataratas (inclusive lado argentino).",
      "Voo direto versus conexão.",
      "Aeroporto: a oferta curada é **CGH** (Congonhas), não GRU.",
    ],
    mostra: [
      "Oferta curada: /ofertas/cgh-igu (origem **CGH**, não GRU).",
      "Roteiro: /guias/foz.",
      "Metodologia: /metodologia.",
    ],
    faq: [
      {
        q: "De qual aeroporto em São Paulo?",
        a: "A oferta curada usa **CGH** (Congonhas), não GRU. Guarulhos seria outra consulta.",
      },
      {
        q: "É voo direto?",
        a: "Na oferta CGH–IGU curada, sim — confira sempre no parceiro.",
      },
      {
        q: "O guia inclui hotel?",
        a: "Não. O guia é editorial; hospedagem você reserva à parte.",
      },
    ],
  },
};

export function respostaPorSlug(slug) {
  const key = String(slug || "").trim();
  return RESPOSTAS[key] || null;
}

export function listaRespostas() {
  return Object.values(RESPOSTAS);
}
