// FAQ da semana de LLM-search — fonte unica de Bloco A/B/C (faq.md).
// O HTML visivel e o FAQPage JSON-LD leem DAQUI, para pergunta/resposta
// nao divergirem. Respostas no objeto sao o texto aprovado (markdown inline
// **negrito** so onde o rascunho tinha); o HTML converte, o JSON-LD tira.

import { escapeHtml } from "./texto.js";
import { GUIDES } from "./aondeContent.js";

export const METODOLOGIA_OG_TITLE = "Metodologia · Aonde";
export const METODOLOGIA_OG_DESCRIPTION =
  "O Aonde é uma revista de viagem com busca: a gente aponta uma passagem e um roteiro dia a dia; você reserva no site do parceiro. O Aonde não vende a passagem e não processa pagamento.";
export const METODOLOGIA_REVISADO_EM = "2026-10-25";

/** Bloco A — FAQ global (usar em /hoje e no rodape de /metodologia). */
export const FAQ_BLOCO_A = [
  {
    q: "O Aonde vende passagens?",
    a: "Não. O Aonde mostra ofertas e roteiros. A reserva e o pagamento acontecem no site da companhia ou do parceiro (por exemplo Aviasales).",
  },
  {
    q: "O preço que eu vejo é o preço da reserva?",
    a: "Não necessariamente. Muitos preços são **consulta**: o valor visto num motor (Google Flights ou Aviasales) na data marcada na página. O preço final é o que o parceiro mostrar na hora da compra.",
  },
  {
    q: "O que significa “consulta em DD/MM”?",
    a: "É a data em que vimos aquele valor. Tarifas mudam; use a data para saber se o número ainda é fresco.",
  },
  {
    q: "Por que o botão às vezes diz “Ver busca” e não “Reservar”?",
    a: "Quando não há compra confirmada no parceiro (por exemplo a busca carrega sem botão de compra), somos honestos: abrimos a busca, sem prometer reserva.",
  },
  {
    q: "O Aonde acrescenta taxa?",
    a: "Não. Você paga o preço do parceiro. Se houver comissão de afiliado, ela vem do parceiro para o Aonde, sem mudar o que você paga.",
  },
  {
    q: "Posso mudar a cidade de origem?",
    a: "Nas ofertas que permitem troca de origem, use o seletor na página. O preço e as datas podem mudar; trate o novo valor como nova consulta.",
  },
  {
    q: "Os roteiros são pacotes?",
    a: "Não. São guias editoriais dia a dia. Hospedagem e restaurantes são sugestões; você reserva por conta própria (ou pelo link do parceiro, quando houver).",
  },
  {
    q: "Como denunciam erro de preço?",
    a: "Se uma tarifa parecer boa demais para ser verdade, trate como risco de erro de sistema: confirme no parceiro e leve em conta cancelamento/reemissão. Preferimos perder um clique a vender uma mentira.",
  },
];

/** Bloco C — tres FAQs curtos so para /hoje (acima da dobra, se couber). */
export const FAQ_BLOCO_C = [
  {
    q: "Isso é o preço da passagem?",
    a: "É consulta na data marcada; a reserva fecha no parceiro.",
  },
  {
    q: "O Aonde emite o bilhete?",
    a: "Não. Compra e suporte são no parceiro.",
  },
  {
    q: "Por que confiar no número?",
    a: "Porque datamos a consulta e não inventamos urgência. Se não der para comprar, o botão diz “Ver busca”.",
  },
];

export function stripFaqMarkdown(text) {
  return String(text || "").replace(/\*\*(.+?)\*\*/g, "$1");
}

export function faqAnswerHtml(text) {
  return escapeHtml(stripFaqMarkdown(text)).replace(
    /\{\{strong:(.+?)\}\}/g,
    "<strong>$1</strong>"
  );
}

function answerToHtml(text) {
  const raw = String(text || "");
  const withMarks = raw.replace(/\*\*(.+?)\*\*/g, "{{strong:$1}}");
  return faqAnswerHtml(withMarks);
}

export function faqItemsForJsonLd(items) {
  return (Array.isArray(items) ? items : [])
    .filter((it) => it && it.q && it.a)
    .map((it) => ({ q: it.q, a: stripFaqMarkdown(it.a) }));
}

/**
 * <h2> + <dl> com <h3> em cada pergunta. Conteudo no HTML (crawlers leem
 * sem JS). `leadHtml` ja vem escapado/seguro do chamador.
 */
export function faqDlHtml(items, { heading, id, leadHtml = "", className = "" } = {}) {
  const list = (Array.isArray(items) ? items : []).filter((it) => it && it.q && it.a);
  if (!list.length) return "";
  const headingId = id ? `${id}-titulo` : "";
  const cls = ["faq-bloco", className].filter(Boolean).join(" ");
  const h2 = heading
    ? `<h2 class="det-h2"${headingId ? ` id="${escapeHtml(headingId)}"` : ""}>${escapeHtml(heading)}</h2>`
    : "";
  const lead = leadHtml ? `<p class="faq-como">${leadHtml}</p>` : "";
  const rows = list
    .map(
      (it) =>
        `<div class="faq-item">` +
        `<dt><h3>${escapeHtml(it.q)}</h3></dt>` +
        `<dd>${answerToHtml(it.a)}</dd>` +
        `</div>`
    )
    .join("");
  return (
    `<section class="${escapeHtml(cls)}"${id ? ` id="${escapeHtml(id)}"` : ""}${
      headingId ? ` aria-labelledby="${escapeHtml(headingId)}"` : ""
    }>` +
    h2 +
    lead +
    `<dl class="faq-dl">${rows}</dl>` +
    `</section>`
  );
}

function isoToDdMmAaaa(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || "").trim());
  if (!m) return "";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function textoOferta(offer, vm) {
  const dicas = Array.isArray(vm && vm.dicas) ? vm.dicas : Array.isArray(offer.dicas) ? offer.dicas : [];
  return [vm && vm.badge, vm && vm.texto, offer.badge, offer.texto, offer.pageTitle, ...dicas]
    .filter(Boolean)
    .join(" ");
}

function inferConexao(offer, vm) {
  const blob = textoOferta(offer, vm).toLowerCase();
  if (
    /não é direto|nao e direto|1 parada|1 escala|uma escala|com conexão|com conexao/.test(blob)
  ) {
    return "com conexão";
  }
  if (/\bdireto\b/.test(blob)) return "direto";
  return "sem confirmar se é direto ou com conexão";
}

function inferBagagem(offer, vm) {
  const blob = textoOferta(offer, vm).toLowerCase();
  const mao = /bagagem de mão inclusa|inclui 1 bagagem de mão|inclui 1 bagagem/.test(blob);
  const despachadaPaga = /despachada é paga|despachada e paga|despachada cobrada/.test(blob);
  if (mao && despachadaPaga) {
    return "Bagagem de mão inclusa nesta consulta; despachada é paga à parte. Confirme no parceiro antes de pagar.";
  }
  if (mao) return "Sim — a consulta menciona bagagem de mão. Confirme no parceiro antes de pagar.";
  if (despachadaPaga) {
    return "Não está claro o que entra na tarifa; despachada costuma ser paga à parte. Confirme no parceiro antes de pagar.";
  }
  return "Não está claro na consulta — confirme no parceiro antes de pagar.";
}

function primeiraFrase(texto) {
  const t = String(texto || "").trim();
  if (!t) return "";
  const corte = t.split(/(?<=\.)\s/)[0];
  return corte.replace(/\.$/, "").trim();
}

function inferBase(offer, vm) {
  const semana = offer && offer.semana;
  if (semana && semana.hospedagem) {
    const trecho = primeiraFrase(semana.hospedagem);
    if (trecho) return `${trecho}. O roteiro é editorial; hotel não está incluso no preço da passagem.`;
  }
  const cidade = (vm && vm.cidade) || offer.cidade || "";
  const dest = (vm && vm.destino) || offer.destino || "";
  const guide = Object.values(GUIDES).find((g) => {
    if (!g) return false;
    if (cidade && g.breadcrumb === cidade) return true;
    const metaDest = g.opt && g.opt.dest;
    if (dest && metaDest && String(metaDest).toUpperCase() === String(dest).toUpperCase()) return true;
    return false;
  });
  if (guide) {
    const meta = (guide.meta || []).find((m) => m && /base/i.test(m.k));
    if (meta && meta.v) {
      return `${meta.v}. O roteiro é editorial; hotel não está incluso no preço da passagem.`;
    }
    if (guide.hospedagem && guide.hospedagem.texto) {
      const trecho = primeiraFrase(guide.hospedagem.texto);
      if (trecho) return `${trecho}. O roteiro é editorial; hotel não está incluso no preço da passagem.`;
    }
  }
  return "Não há uma base de hotel fechada nesta oferta. O roteiro é editorial; hotel não está incluso no preço da passagem.";
}

function temParceiro(offer, vm) {
  return !!(
    (vm && vm.affiliateUrl) ||
    offer.affiliateUrl ||
    offer.affiliate_url ||
    offer.aviasalesUrl
  );
}

function ctaFaqLabel(offer, vm) {
  const buy = vm && "aviasalesBuy" in vm ? vm.aviasalesBuy !== false : offer.aviasalesBuy !== false;
  if (!temParceiro(offer, vm) || buy === false) return "Ver busca";
  return "Reservar no Aviasales";
}

/**
 * Bloco B — FAQ por oferta. Preenche o template aprovado com campos reais.
 * Nao inventa data de consulta, preco, cia, bagagem nem base.
 */
export function fillBlocoB(offer = {}, vm = {}) {
  const origem = vm.origem || offer.origem || "";
  const destino = vm.destino || offer.destino || "";
  const rota = origem && destino ? `${origem}–${destino}` : origem || destino || "esta rota";
  const preco = vm.preco || offer.preco || "o valor marcado nesta página";
  const consultaIso = vm.fontePrecoEm || offer.fontePrecoEm || offer.fonte_preco_em || "";
  const consultaData = isoToDdMmAaaa(consultaIso);
  const fonte = String(vm.fontePreco || offer.fontePreco || offer.fonte_preco || "").trim();
  const fonteTxt = fonte || "Google Flights ou Aviasales";
  const conexao = inferConexao(offer, vm);
  const cia = String(vm.cia || offer.cia || "").trim();
  const ciaTxt = cia || "não informada nesta consulta";
  const dataConsultaTxt = consultaData || "data marcada nesta página";

  const idaIso = vm.ida || offer.ida || offer.dataIda || "";
  const voltaIso = vm.volta || offer.volta || offer.dataVolta || "";
  const idaBr = isoToDdMmAaaa(idaIso);
  const voltaBr = isoToDdMmAaaa(voltaIso);
  const datas = vm.datas || offer.datas || "";
  let datasTxt;
  if (idaBr && voltaBr) {
    datasTxt = `Ida **${idaBr}** · volta **${voltaBr}** (fuso local dos aeroportos). Confira horários no parceiro — madrugada / “hour trap” às vezes aparece e a gente avisa no texto quando souber.`;
  } else if (datas) {
    datasTxt = `Ida e volta **${datas}** (fuso local dos aeroportos). Confira horários no parceiro — madrugada / “hour trap” às vezes aparece e a gente avisa no texto quando souber.`;
  } else {
    datasTxt =
      "As datas desta oferta estão no texto da página (fuso local dos aeroportos). Confira horários no parceiro — madrugada / “hour trap” às vezes aparece e a gente avisa no texto quando souber.";
  }

  const cta = ctaFaqLabel(offer, vm);

  return [
    {
      q: `Quanto custa voar ${rota}?`,
      a: `Na última consulta do Aonde (**${dataConsultaTxt}**), vimos cerca de **${preco}** em ${fonteTxt}, ${conexao}, companhia ${ciaTxt}. Isso é consulta, não reserva.`,
    },
    {
      q: "Quais datas dessa oferta?",
      a: datasTxt,
    },
    {
      q: "Tem bagagem inclusa?",
      a: inferBagagem(offer, vm),
    },
    {
      q: "Onde fica a base sugerida no roteiro?",
      a: inferBase(offer, vm),
    },
    {
      q: "Como reservar?",
      a: `Use o botão da página (${cta}). Você sai do Aonde e conclui no parceiro.`,
    },
  ];
}
