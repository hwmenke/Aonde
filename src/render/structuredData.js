// structuredData — builders PUROS (sem rede, sem I/O) de dados estruturados
// schema.org (JSON-LD) para SEO do Aonde. Cada builder devolve um objeto JS
// simples pronto para ser embutido num <script type="application/ld+json">
// pelo chamador (ver `htmlDocument`/`jsonForScript` em htmlRenderer.js, que
// faz a serializacao SEGURA — este modulo nao serializa nada, so monta dados).
//
// Principios:
//   - Nunca inventar fatos (SearchAction sem busca real, geo sem coordenada
//     verificada, avaliacoes sem dado, etc.) — so schema.org do que existe.
//   - Builders retornam `null` quando nao ha dado suficiente para um bloco
//     valido; o chamador filtra os nulos antes de passar para `htmlDocument`.
//   - Cada objeto de topo carrega o proprio "@context" para poder viver em um
//     <script> independente (varios blocos JSON-LD por pagina, cada um
//     autocontido).

export const SITE_URL = "https://aonde.com.br";

// Absolutiza um caminho relativo ("/guias/salvador") usando SITE_URL. URLs
// absolutas (http/https) passam intactas. Vazio/invalido => "".
function absUrl(u) {
  if (!u || typeof u !== "string") return "";
  if (/^https?:\/\//.test(u)) return u;
  return `${SITE_URL}${u.startsWith("/") ? "" : "/"}${u}`;
}

// ---------------------------------------------------------------------------
// Organization + WebSite (home)
// ---------------------------------------------------------------------------

export function buildOrganization() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: "Aonde",
    url: SITE_URL,
    description:
      "Aonde compara passagens aereas, hospedagem e roteiros de viagem pelo Brasil e America do Sul.",
  };
}

// Sem SearchAction: o site nao tem uma caixa de busca por palavra-chave com
// um padrao de URL generico (so paginas de categoria, ex. /ofertas) —
// declarar um SearchAction fabricado seria enganoso.
export function buildWebSite() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    name: "Aonde",
    url: SITE_URL,
    publisher: { "@id": `${SITE_URL}/#organization` },
  };
}

// ---------------------------------------------------------------------------
// BreadcrumbList — generico e reutilizavel.
// `items`: [{ name, url? }], na ordem (raiz -> pagina atual). `url` relativo
// ("/guias") ou absoluto; item sem `url` fica sem a propriedade `item` (ainda
// valido, mas preferimos sempre informar quando disponivel).
// ---------------------------------------------------------------------------

export function buildBreadcrumbList(items) {
  const valid = (Array.isArray(items) ? items : []).filter((it) => it && it.name);
  if (!valid.length) return null;
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: valid.map((it, i) => {
      const el = { "@type": "ListItem", position: i + 1, name: String(it.name) };
      const url = absUrl(it.url);
      if (url) el.item = url;
      return el;
    }),
  };
}

// ---------------------------------------------------------------------------
// FAQPage — Central de ajuda. Conteudo centralizado aqui (fonte unica de
// verdade) para nao duplicar pergunta/resposta entre o HTML renderizado e o
// JSON-LD; `renderHelpPage` (htmlRenderer.js) consome FAQ_GROUPS para montar
// os <details> visiveis, e `buildFaqPage` monta o mainEntity a partir do
// MESMO conteudo.
//
// `a` pode conter marcacao inline simples (<a href>) — o Google aceita um
// subconjunto de HTML (a, b, br, h2-h6, li, ol, p, ul) dentro de Answer.text,
// entao mantemos o link em vez de descartar a referencia a outra pagina.
// ---------------------------------------------------------------------------

export const FAQ_GROUPS = [
  {
    titulo: "Antes de comprar",
    items: [
      {
        q: "Os preços do Aonde são garantidos?",
        a: "Não. O Aonde compara e destaca tarifas encontradas nos sites dos parceiros; o preço final é sempre o que o parceiro mostrar no pagamento. Datas concorridas e promoções relâmpago podem esgotar em minutos.",
      },
      {
        q: "Por que o preço muda quando chego no parceiro?",
        a: "Quem controla estoque e tarifa é o parceiro, não o Aonde. Assentos promocionais são limitados e o preço pode subir (ou o voo sumir) entre o momento em que publicamos e o da compra.",
      },
      {
        q: "O Aonde cobra alguma taxa a mais?",
        a: "Não. Quando você compra por um link do Aonde, o parceiro pode nos pagar uma comissão — isso não muda o preço que você paga.",
      },
    ],
  },
  {
    titulo: "Depois de comprar",
    items: [
      {
        q: "Quem processa minha reserva?",
        a: "A companhia aérea, agência ou plataforma parceira que você acessou pelo nosso link. O Aonde não processa pagamento, não emite bilhete e não guarda seus dados de reserva.",
      },
      {
        q: "Não recebi a confirmação. E agora?",
        a: "Confira o spam usando o e-mail que você digitou no site do parceiro. Se não aparecer, fale direto com o suporte deles — eles têm acesso ao seu pagamento e à sua reserva, o Aonde não tem.",
      },
      {
        q: "Quero cancelar ou alterar minha reserva.",
        a: 'Veja <a href="/cancelamentos">Trocas e cancelamentos</a> — explicamos com quem falar e o que a lei garante.',
      },
    ],
  },
  {
    titulo: "Alertas de preço",
    items: [
      {
        q: "Como recebo alertas de preço?",
        a: "Cadastre seu e-mail em qualquer página de ofertas. Você confirma a inscrição por e-mail (double opt-in) antes de receber qualquer coisa.",
      },
      {
        q: "Como cancelo a inscrição?",
        a: 'Todo e-mail nosso tem um link de descadastro. Você também pode cancelar em <a href="/alertas">Gerenciar meus alertas</a>.',
      },
    ],
  },
];

export function buildFaqPage(groups) {
  const src = Array.isArray(groups) ? groups : FAQ_GROUPS;
  const items = src.flatMap((g) => (Array.isArray(g.items) ? g.items : [])).filter((it) => it && it.q && it.a);
  if (!items.length) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((it) => ({
      "@type": "Question",
      name: it.q,
      acceptedAnswer: { "@type": "Answer", text: it.a },
    })),
  };
}

// ---------------------------------------------------------------------------
// TouristTrip — roteiro/guia (dia a dia). `g` e o view model ja normalizado
// por guideFromContent/guideFromItinerary em htmlRenderer.js: espera
// { id, titulo, breadcrumb, intro, dias: [{ pontos: [{ nome, nota }] }] }.
// ---------------------------------------------------------------------------

export function buildTouristTrip(g) {
  if (!g || !g.titulo) return null;
  const cidade = g.breadcrumb || g.titulo || "";
  const dias = Array.isArray(g.dias) ? g.dias : [];

  const itineraryItems = [];
  let pos = 1;
  for (const dia of dias) {
    const pontos = Array.isArray(dia.pontos) ? dia.pontos : [];
    for (const p of pontos) {
      if (!p || !p.nome) continue;
      const attraction = { "@type": "TouristAttraction", name: p.nome };
      if (p.nota) attraction.description = p.nota;
      if (cidade) attraction.address = cidade;
      itineraryItems.push({ "@type": "ListItem", position: pos++, item: attraction });
    }
  }

  const trip = {
    "@context": "https://schema.org",
    "@type": "TouristTrip",
    name: g.titulo,
  };
  if (g.intro) trip.description = g.intro;
  if (g.id) trip.url = absUrl(`/guias/${encodeURIComponent(g.id)}`);
  if (itineraryItems.length) {
    trip.itinerary = { "@type": "ItemList", itemListElement: itineraryItems };
  }
  return trip;
}

// ---------------------------------------------------------------------------
// Offer/Product — detalhe de oferta. `vm` e o view model normalizado
// (normalizeLiveOffer/normalizeContentOffer em htmlRenderer.js): espera
// { id, origem, destino, cidade, preco, thumbUrl, href }. `preco` chega
// como string formatada em pt-BR (ex. "R$ 1.847" ou "R$ 1.847,50").
// ---------------------------------------------------------------------------

// "R$ 1.847,50" -> 1847.5 ; "R$ 587" -> 587. Entrada invalida => null.
function parseBRLToNumber(str) {
  if (typeof str !== "string" || !str.trim()) return null;
  const cleaned = str.replace(/[^\d,.-]/g, "");
  if (!cleaned) return null;
  const normalized = cleaned.replace(/\./g, "").replace(",", ".");
  const n = Number.parseFloat(normalized);
  return Number.isFinite(n) ? n : null;
}

export function buildOfferProduct(vm) {
  if (!vm) return null;
  const destinoLabel = vm.cidade || vm.destino || "";
  if (!destinoLabel) return null;

  const name = `Passagem aérea para ${destinoLabel}`;
  const product = {
    "@context": "https://schema.org",
    "@type": "Product",
    name,
  };
  const desc =
    vm.origem && vm.destino
      ? `Oferta de passagem aérea de ${vm.origem} para ${vm.destino}.`
      : `Oferta de passagem aérea para ${destinoLabel}.`;
  product.description = desc;
  if (vm.thumbUrl) product.image = vm.thumbUrl;

  // O preco so entra no dado estruturado quando o site tambem o apresenta
  // como preco de verdade. Duas situacoes em que NAO entra:
  //   1) erro de tarifa — a propria pagina avisa que a cia pode cancelar;
  //   2) oferta sem link de afiliado — o CTA cai na busca de exemplo, entao
  //      nao ha preco garantido nenhum por tras.
  // Antes, o JSON-LD afirmava availability:InStock com preco firme nos dois
  // casos, contradizendo o texto visivel da mesma pagina. Isso e desonesto
  // com o usuario que ve o resultado na busca e ainda arrisca penalizacao por
  // dado estruturado enganoso.
  const price = parseBRLToNumber(vm.preco);
  const precoGarantido = price !== null && !vm.erro && !!vm.affiliateUrl;
  if (precoGarantido) {
    product.offers = {
      "@type": "Offer",
      price,
      priceCurrency: "BRL",
      availability: "https://schema.org/InStock",
      url: absUrl(vm.href || (vm.id ? `/ofertas/${encodeURIComponent(vm.id)}` : "")),
    };
  }
  return product;
}
