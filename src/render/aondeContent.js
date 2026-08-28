// aondeContent — CONTEUDO EDITORIAL do Aonde.com.br, portado fielmente do
// prototipo de design (docs/handoff/design/Aonde.dc.html).
//
// O prototipo era um "design canvas" (runtime React proprietario, com
// {{ mustache }} e <image-slot>). Aqui o MESMO conteudo vira dados puros que
// o htmlRenderer transforma em paginas HTML de producao. As paginas de
// OFERTAS e ROTEIRO tambem podem ser alimentadas por dados AO VIVO do
// back-end (offersStore / buildItinerary); este modulo e a curadoria fixa
// (home, guias editoriais) e o fallback quando nao ha dados ao vivo.
//
// Precos aqui sao STRINGS editoriais ("R$ 986") — sao conteudo, nao a tarifa
// ao vivo. As ofertas ao vivo do back-end chegam em centavos e sao formatadas
// pelo htmlRenderer.

import { EXTRA_GUIDES } from "./moreGuides.js";

export const MONTH_NAMES = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

// Imagens de destaque: Wikimedia Commons no form canonico e estavel
// (Special:FilePath), que resolve para o arquivo original. Se falhar
// (offline/arquivo movido), o htmlRenderer troca por um placeholder SVG.
const COMMONS = "https://commons.wikimedia.org/wiki/Special:FilePath/";
const wiki = (file) => COMMONS + encodeURIComponent(file);

// ---------------------------------------------------------------------------
// HOME — hero, estilos de viagem, extras, confianca
// ---------------------------------------------------------------------------

export const HERO_SLIDES = [
  {
    label: "Praia",
    legenda: "Fernando de Noronha · Pernambuco",
    src: wiki("Baía do Sancho, Fernando de Noronha.jpg"),
    credit: "Baía do Sancho — Wikimedia Commons",
    creditHref: "https://commons.wikimedia.org/wiki/Category:Fernando_de_Noronha",
    foto: "praia do Nordeste, mar verde e jangada",
  },
  {
    label: "Montanha & neve",
    legenda: "Cerro Catedral · Bariloche",
    src: wiki("Cerro Catedral, Bariloche.jpg"),
    credit: "Cerro Catedral — Wikimedia Commons",
    creditHref: "https://commons.wikimedia.org/wiki/Category:Cerro_Catedral",
    foto: "Cerro Catedral nevado, Bariloche",
  },
  {
    label: "Urbano",
    legenda: "Pelourinho · Salvador",
    src: wiki("Pelourinho, Salvador, Bahia.jpg"),
    credit: "Pelourinho — Wikimedia Commons",
    creditHref: "https://commons.wikimedia.org/wiki/Category:Pelourinho",
    foto: "casario histórico de Salvador ao entardecer",
  },
];

export const TRIP_STYLES = [
  {
    numero: "01 · Praia",
    titulo: "Mar morno o ano inteiro",
    desc: "O Nordeste tem 3.300 km de litoral e sol em qualquer mês. Piscinas naturais em Pernambuco, falésias em Alagoas, dunas no Ceará — sempre com voo direto saindo das capitais.",
    chips: ["Porto de Galinhas", "Maragogi", "Jericoacoara", "Morro de SP"],
    cta: "Ver ofertas de praia",
    legenda: "Fernando de Noronha · PE",
    src: HERO_SLIDES[0].src, credit: HERO_SLIDES[0].credit, creditHref: HERO_SLIDES[0].creditHref,
    foto: "mar verde e jangada, Nordeste",
  },
  {
    numero: "02 · Cidade histórica",
    titulo: "Quinhentos anos de história",
    desc: "Salvador, Ouro Preto, Paraty, Olinda: centros históricos para percorrer a pé, entre igrejas barrocas, museus e a melhor gastronomia regional do país.",
    chips: ["Salvador", "Ouro Preto", "Paraty", "Olinda"],
    cta: "Ver roteiros históricos",
    legenda: "Pelourinho · BA",
    src: HERO_SLIDES[2].src, credit: HERO_SLIDES[2].credit, creditHref: HERO_SLIDES[2].creditHref,
    foto: "casario colonial colorido",
  },
  {
    numero: "03 · Neve",
    titulo: "Neve a quatro horas de voo",
    desc: "De julho a setembro, Bariloche e o Valle Nevado ficam a um voo direto do Brasil. Ski, fondue e paisagem dos Andes — sem visto e com atendimento em português.",
    chips: ["Bariloche", "Valle Nevado", "Ushuaia", "San Martín"],
    cta: "Ver pacotes de neve",
    legenda: "Cerro Catedral · ARG",
    src: HERO_SLIDES[1].src, credit: HERO_SLIDES[1].credit, creditHref: HERO_SLIDES[1].creditHref,
    foto: "pista de ski nos Andes",
  },
];

export const EXTRAS = [
  { sigla: "H", titulo: "Hotéis e pousadas", desc: "Mais de 40 mil opções no Brasil, com café da manhã e cancelamento grátis sinalizados com clareza.", cta: "Buscar hospedagem" },
  { sigla: "C", titulo: "Aluguel de carros", desc: "Retire no aeroporto e devolva em outra cidade. Proteção completa já incluída no preço mostrado.", cta: "Ver diárias" },
  { sigla: "S", titulo: "Seguro viagem", desc: "Cobertura médica e de bagagem a partir de R$ 12 por dia, aceito em toda a América do Sul.", cta: "Simular seguro" },
];

export const CONFIANCA = [
  { valor: "12x", desc: "sem juros no cartão, ou 5% off no Pix" },
  { valor: "7 dias", desc: "por semana, atendimento humano de verdade" },
  { valor: "0 taxa", desc: "você paga o preço do parceiro — o Aonde nunca cobra a mais" },
];

// Estes tres passos descrevem o que o site FAZ, nao o que soaria bem.
// A versao anterior dizia "Robos de olho 24h", "milhares de rotas" e "media
// historica dos ultimos anos". Nada disso existia: nao ha cron no projeto, o
// feed tem 18 ofertas de curadoria manual, e a media de referencia e de 90
// dias (ver src/store/priceHistory.js). Tambem prometia "regras de bagagem
// checadas" quando a maioria das ofertas nao menciona bagagem.
export const COMO_FUNCIONA = [
  {
    n: "1",
    titulo: "Garimpo de tarifa",
    desc: "Acompanhamos as rotas que mais saem do Brasil e comparamos cada tarifa com o que ela costuma custar nos últimos 90 dias.",
  },
  {
    n: "2",
    titulo: "Conferido por uma pessoa",
    desc: "Nada entra no feed sem alguém abrir a oferta e checar preço, datas e o que está incluído. Quando a bagagem não está clara, a gente diz que não está.",
  },
  {
    n: "3",
    titulo: "Você compra direto",
    desc: "O botão leva ao site da companhia ou de um parceiro. A reserva, o pagamento e o suporte acontecem lá — o Aonde não processa pagamento.",
  },
];

// ---------------------------------------------------------------------------
// OFERTAS (curadoria editorial) — feed + detalhe. Precos como strings.
// Usadas quando nao ha ofertas AO VIVO do offersStore.
// ---------------------------------------------------------------------------

// "publicado" NAO PODE ser uma string fixa ("ha 2h") — isso e gatilho de
// urgencia falsa: quem le a oferta daqui a um mes ainda veria "ha 2h", o que
// e simplesmente mentira. Em vez disso cada oferta guarda um instante REAL
// (`publicadoEm`, ISO) e expoe `publicado` como getter, calculado a cada
// leitura a partir do relogio atual. O htmlRenderer continua lendo `o.publicado`
// normalmente — nao precisou mudar nada.
//
// Os instantes abaixo sao dados EDITORIAIS DE DEMONSTRACAO (nao ha feed ao
// vivo aqui): foram ancorados perto de quando este catalogo foi escrito, so
// para o feed abrir com as ofertas "mais novas" no topo. Como o rotulo e
// sempre calculado na hora da leitura, ele vai evoluir sozinho com o tempo
// real (de "ha 2 horas" para "ha 3 dias" etc.) e nunca fica congelado numa
// mentira. Depois de uma semana o rotulo degrada para algo honesto ("ha mais
// de uma semana") em vez de virar um numero absurdo tipo "ha 8000 horas".
const MINUTO_MS = 60 * 1000;
const HORA_MS = 60 * MINUTO_MS;
const DIA_MS = 24 * HORA_MS;

export function formatRelativePublicado(isoInstant, now = new Date()) {
  const then = new Date(isoInstant);
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const diffMs = Math.max(0, nowMs - then.getTime());

  if (diffMs < MINUTO_MS) return "agora mesmo";

  // floor, nao round: arredondar para cima INVENTA tempo que nao passou. Uma
  // oferta de 6,6 dias virava "ha mais de uma semana" (round(6.6)=7), o que e
  // simplesmente falso. Com floor o rotulo e sempre "ja se passaram pelo menos
  // isto", que e verdade em qualquer ponto do intervalo.
  const diffMin = Math.floor(diffMs / MINUTO_MS);
  if (diffMin < 60) return `há ${diffMin} minuto${diffMin === 1 ? "" : "s"}`;

  const diffH = Math.floor(diffMs / HORA_MS);
  if (diffH < 24) return `há ${diffH} hora${diffH === 1 ? "" : "s"}`;

  const diffDias = Math.floor(diffMs / DIA_MS);
  if (diffDias < 7) return `há ${diffDias} dia${diffDias === 1 ? "" : "s"}`;

  return "há mais de uma semana";
}

export const OFFERS = [
  { id: "gru-lis", origem: "GRU", destino: "LIS", cidade: "Lisboa", local: "Portugal", preco: "R$ 1.847", media: "R$ 3.540", economia: "R$ 1.693", cia: "TAP", datas: "12–24 out", tipo: "Internacional", publicadoEm: "2026-07-25T10:49:29Z", get publicado() { return formatRelativePublicado(this.publicadoEm); }, erro: false, badge: "48% abaixo da média",
    thumbUrl: wiki("Belem Tower, Lisbon (8038548360).jpg"), credit: "Torre de Belém — Wikimedia Commons", creditHref: "https://commons.wikimedia.org/wiki/Category:Lisbon",
    texto: "Tarifa cheia São Paulo–Lisboa raramente cai abaixo de R$ 2.500 na alta. Achamos assentos em outubro por menos de R$ 1.900 ida e volta, com uma escala curta em algumas datas.",
    dicas: ["Inclui 1 bagagem de mão; despachada é paga à parte na TAP", "Datas de terça e quarta são as mais baratas do período"],
    flex: [{ d: "12–24 out", p: "R$ 1.847" }, { d: "15–27 out", p: "R$ 1.912" }, { d: "19–31 out", p: "R$ 2.045" }] },
  { id: "gru-rec", origem: "GRU", destino: "REC", cidade: "Recife", local: "Pernambuco", preco: "R$ 587", media: "R$ 1.180", economia: "R$ 593", cia: "Azul", datas: "9–16 set", tipo: "Nacional", publicadoEm: "2026-07-25T12:29:29Z", get publicado() { return formatRelativePublicado(this.publicadoEm); }, erro: true, badge: "Erro de tarifa",
    thumbUrl: wiki("Marco Zero Recife.jpg"), credit: "Marco Zero, Recife — Wikimedia Commons", creditHref: "https://commons.wikimedia.org/wiki/Category:Marco_Zero_(Recife)",
    texto: "Possível erro de tarifa: São Paulo–Recife ida e volta por menos de R$ 600, menos da metade da média histórica. Erros de tarifa costumam ser corrigidos rápido — se for viajar, compre já e só marque hotel depois da confirmação por e-mail.",
    dicas: ["Erros de tarifa podem ser cancelados pela cia; espere a confirmação antes de reservar hotel", "Voo direto de 3h05 pela Azul", "Não some datas ao carrinho: reserve exatamente as que aparecem"],
    flex: [{ d: "9–16 set", p: "R$ 587" }, { d: "11–18 set", p: "R$ 612" }, { d: "16–23 set", p: "R$ 634" }] },
  { id: "vcp-bue", origem: "VCP", destino: "BUE", cidade: "Buenos Aires", local: "Argentina", preco: "R$ 989", media: "R$ 1.520", economia: "R$ 531", cia: "GOL", datas: "3–10 set", tipo: "Internacional", publicadoEm: "2026-07-25T11:49:29Z", get publicado() { return formatRelativePublicado(this.publicadoEm); }, erro: false, badge: "35% abaixo da média",
    thumbUrl: wiki("Caminito, La Boca, Buenos Aires.jpg"), credit: "Buenos Aires — Wikimedia Commons", creditHref: "https://commons.wikimedia.org/wiki/Category:Caminito",
    texto: "Saindo de Campinas (VCP), Buenos Aires por menos de mil reais ida e volta. Ótimo para um fim de semana esticado de tango, parrilla e compras, com o câmbio jogando a favor.",
    dicas: ["Voo direto de Campinas, sem passar por Guarulhos", "Tarifa promocional GOL: bagagem de mão inclusa", "Setembro tem clima ameno e cidade em ritmo normal"],
    flex: [{ d: "3–10 set", p: "R$ 989" }, { d: "10–17 set", p: "R$ 1.048" }, { d: "17–24 set", p: "R$ 1.096" }] },
  { id: "gru-eze", origem: "GRU", destino: "EZE", cidade: "Buenos Aires", local: "Argentina", preco: "R$ 1.570", media: "R$ 1.950", economia: "R$ 380", cia: "SWISS", datas: "12–19 set", tipo: "Internacional", publicadoEm: "2026-08-21T00:00:00Z", get publicado() { return formatRelativePublicado(this.publicadoEm); }, erro: false, badge: "19% abaixo da média",
    thumbUrl: wiki("Obelisco de Buenos Aires.jpg"), credit: "Obelisco de Buenos Aires — Wikimedia Commons, Roberto Fiadone, CC BY-SA 4.0", creditHref: "https://commons.wikimedia.org/wiki/Category:Obelisco_de_Buenos_Aires",
    texto: "São Paulo–Buenos Aires por R$ 1.570 ida e volta em setembro, voo direto pela SWISS. Preço visto no Google Flights em 21 de agosto de 2026 — o mesmo voo aparece a USD $298 no Aviasales.",
    dicas: ["Voo direto SWISS, sem escalas: 12 set 07:45 GRU→10:50 EZE, volta 19 set 13:30 EZE→16:10 GRU", "Bagagem de mão inclusa; despachada é paga à parte", "Setembro tem clima ameno em Buenos Aires, fora do pico turístico"],
    flex: [{ d: "12–19 set", p: "R$ 1.570" }, { d: "15–22 set", p: "R$ 1.648" }, { d: "19–26 set", p: "R$ 1.720" }],
    aviasalesUrl: "https://www.aviasales.com/search/GRU1209BUE19091",
    fontePreco: "Google Flights",
    fontePrecoEm: "2026-08-21" },
  { id: "gru-fln", origem: "GRU", destino: "FLN", cidade: "Florianópolis", local: "Santa Catarina", preco: "R$ 770", preco_usd: "$149", cia: "LATAM", datas: "27 set–3 out", tipo: "Nacional", publicadoEm: "2026-08-21T00:15:00Z", get publicado() { return formatRelativePublicado(this.publicadoEm); }, erro: false, badge: "Direto · 1h15",
    thumbUrl: wiki("Barra da Lagoa, Florianópolis - SC (2).JPG"), credit: "Florianópolis — Wikimedia Commons", creditHref: "https://commons.wikimedia.org/wiki/Category:Lagoa_da_Conceição",
    texto: "São Paulo–Florianópolis por R$ 770 ida e volta em setembro/outubro, voo direto pela LATAM. Preço visto no Google Flights em 21 de agosto de 2026 (a partir de R$ 768). Aviasales mostra USD $149 para a mesma rota.",
    dicas: ["Voo direto LATAM, 1h15 de duração", "Alta temporada em Floripa: setembro ainda é ombro de temporada, preços mais baixos que no verão", "Clima em setembro/outubro: 16–23°C, ainda frio para banho de mar (água ~18°C)", "Praias do norte (Jurerê, Canasvieiras) são mais calmas; do leste (Joaquina, Mole) têm ondas"],
    flex: [{ d: "27 set–3 out", p: "R$ 770" }, { d: "30 set–6 out", p: "R$ 814" }, { d: "4–11 out", p: "R$ 856" }],
    aviasalesUrl: "https://www.aviasales.com/search/GRU2709FLN03101",
    fontePreco: "Google Flights",
    fontePrecoEm: "2026-08-21" },
  { id: "gig-ssa", origem: "GIG", destino: "SSA", cidade: "Salvador", local: "Bahia", preco: "R$ 1.320", preco_usd: "$273", cia: "LATAM", datas: "7–14 nov", tipo: "Nacional", publicadoEm: "2026-08-21T00:30:00Z", get publicado() { return formatRelativePublicado(this.publicadoEm); }, erro: false, badge: "Direto · 2h",
    thumbUrl: wiki("Pelourinho, Salvador, Bahia.jpg"), credit: "Pelourinho — Wikimedia Commons", creditHref: "https://commons.wikimedia.org/wiki/Category:Pelourinho",
    texto: "Rio de Janeiro–Salvador por R$ 1.320 ida e volta em novembro, voo direto pela LATAM. Preço visto no Google Flights em 21 de agosto de 2026 (a partir de R$ 1.253). Aviasales mostra USD $273 para o mesmo voo direto.",
    dicas: ["Voo direto LATAM, 2h de duração", "Novembro tem sol e menos chuva em Salvador", "Pelourinho, praia e acarajé com voo direto do Rio", "Tarifa leve: bagagem de mão inclusa, despachada paga à parte"],
    flex: [{ d: "7–14 nov", p: "R$ 1.320" }, { d: "10–17 nov", p: "R$ 1.384" }, { d: "14–21 nov", p: "R$ 1.426" }],
    aviasalesUrl: "https://www.aviasales.com/search/GIG0711SSA14111",
    fontePreco: "Google Flights",
    fontePrecoEm: "2026-08-21" },
  { id: "cnf-fln", origem: "CNF", destino: "FLN", cidade: "Florianópolis", local: "Santa Catarina", preco: "R$ 312", media: "R$ 690", economia: "R$ 378", cia: "GOL", datas: "14–21 out", tipo: "Nacional", publicadoEm: "2026-07-25T09:49:29Z", get publicado() { return formatRelativePublicado(this.publicadoEm); }, erro: false, badge: "55% abaixo da média",
    thumbUrl: wiki("Barra da Lagoa, Florianópolis - SC (2).JPG"), credit: "Florianópolis — Wikimedia Commons", creditHref: "https://commons.wikimedia.org/wiki/Category:Lagoa_da_Conceição",
    texto: "Belo Horizonte–Florianópolis por R$ 312 ida e volta em outubro, antes da temporada de verão explodir os preços. Praia, lagoa e ostras a preço de passagem de ônibus.",
    dicas: ["Outubro é baixa temporada em Floripa: preços de hotel também caem", "Voo com 1 conexão rápida", "Leve casaco leve — o mar ainda está frio nessa época"],
    flex: [{ d: "14–21 out", p: "R$ 312" }, { d: "18–25 out", p: "R$ 344" }, { d: "21–28 out", p: "R$ 369" }] },
  { id: "gig-mia", origem: "GIG", destino: "MIA", cidade: "Miami", local: "Estados Unidos", preco: "R$ 2.190", media: "R$ 3.580", economia: "R$ 1.390", cia: "LATAM", datas: "5–18 nov", tipo: "Internacional", publicadoEm: "2026-07-25T07:49:29Z", get publicado() { return formatRelativePublicado(this.publicadoEm); }, erro: false, badge: "39% abaixo da média",
    thumbUrl: wiki("Miami Skyline 2020.jpg"), credit: "Miami — Wikimedia Commons", creditHref: "https://commons.wikimedia.org/wiki/Category:Miami_skylines",
    texto: "Rio–Miami por R$ 2.190 ida e volta em novembro, fora do pico das festas. Excelente janela para compras e parques, com voo direto e boa malha de conexões nos EUA.",
    dicas: ["Voo direto GIG–MIA pela LATAM", "Novembro evita a alta de dezembro e janeiro", "Lembre do visto americano válido antes de comprar"],
    flex: [{ d: "5–18 nov", p: "R$ 2.190" }, { d: "8–21 nov", p: "R$ 2.264" }, { d: "12–25 nov", p: "R$ 2.390" }] },
  { id: "gru-scl", origem: "GRU", destino: "SCL", cidade: "Santiago", local: "Chile", preco: "R$ 1.290", media: "R$ 1.940", economia: "R$ 650", cia: "LATAM", datas: "2–12 nov", tipo: "Internacional", publicadoEm: "2026-07-25T04:49:29Z", get publicado() { return formatRelativePublicado(this.publicadoEm); }, erro: false, badge: "34% abaixo da média",
    thumbUrl: wiki("Skyline of Santiago, Chile.jpg"), credit: "Santiago — Wikimedia Commons", creditHref: "https://commons.wikimedia.org/wiki/Category:Skylines_of_Santiago_de_Chile",
    texto: "São Paulo–Santiago por R$ 1.290 ida e volta. Vinhos, cordilheira e a porta de entrada para o Atacama e Valparaíso — tudo com voo direto de menos de 4 horas.",
    dicas: ["Voo direto de aproximadamente 3h50", "Novembro é primavera no Chile: dias longos e clima agradável", "Bagagem despachada é paga à parte nesta tarifa"],
    flex: [{ d: "2–12 nov", p: "R$ 1.290" }, { d: "6–16 nov", p: "R$ 1.352" }, { d: "9–19 nov", p: "R$ 1.418" }] },
  { id: "gru-mco", origem: "GRU", destino: "MCO", cidade: "Orlando", local: "Estados Unidos", preco: "R$ 2.560", media: "R$ 3.660", economia: "R$ 1.100", cia: "Azul", datas: "10–24 jan", tipo: "Internacional", publicadoEm: "2026-07-25T00:49:29Z", get publicado() { return formatRelativePublicado(this.publicadoEm); }, erro: false, badge: "30% abaixo da média",
    thumbUrl: wiki("Orlando, Florida.jpg"), credit: "Orlando — Wikimedia Commons", creditHref: "https://commons.wikimedia.org/wiki/Category:Downtown_Orlando,_Florida",
    texto: "São Paulo–Orlando por R$ 2.560 ida e volta em janeiro. O destino dos parques com uma das melhores tarifas do verão, ideal para famílias que planejam com antecedência.",
    dicas: ["Voo direto GRU–MCO pela Azul", "Janeiro ainda pega parte das férias escolares — reserve cedo", "Confira a validade do visto de todos os viajantes"],
    flex: [{ d: "10–24 jan", p: "R$ 2.560" }, { d: "13–27 jan", p: "R$ 2.648" }, { d: "17–31 jan", p: "R$ 2.790" }] },
  // Saidas do NORDESTE. O feed nascia so com GRU/VCP/GIG/CNF e uma leitora de
  // Recife concluiu "esse site nao e pra mim" — com razao: nem no filtro a
  // cidade dela aparecia. Percentual do badge conferido contra preco/media.
  { id: "rec-gru", origem: "REC", destino: "GRU", cidade: "São Paulo", local: "São Paulo", preco: "R$ 398", media: "R$ 720", economia: "R$ 322", cia: "Azul", datas: "5–12 set", tipo: "Nacional", publicadoEm: "2026-07-25T05:19:29Z", get publicado() { return formatRelativePublicado(this.publicadoEm); }, erro: false, badge: "45% abaixo da média",
    thumbUrl: wiki("Avenida Paulista Skyline 2012.jpg"), credit: "Avenida Paulista, São Paulo — Wikimedia Commons", creditHref: "https://commons.wikimedia.org/wiki/Category:Avenida_Paulista",
    texto: "Recife–São Paulo por R$ 398 ida e volta em setembro. Bom para quem vai resolver a vida na capital ou emendar conexão para o Sul.",
    dicas: ["Voo direto de cerca de 3h", "Setembro é baixa temporada nas duas pontas", "Tarifa promocional: bagagem despachada cobrada à parte"],
    flex: [{ d: "5–12 set", p: "R$ 398" }, { d: "9–16 set", p: "R$ 421" }, { d: "16–23 set", p: "R$ 447" }] },
  { id: "rec-gig", origem: "REC", destino: "GIG", cidade: "Rio de Janeiro", local: "Rio de Janeiro", preco: "R$ 429", media: "R$ 715", economia: "R$ 286", cia: "GOL", datas: "12–19 jul", tipo: "Nacional", publicadoEm: "2026-07-25T02:49:29Z", get publicado() { return formatRelativePublicado(this.publicadoEm); }, erro: false, badge: "40% abaixo da média",
    thumbUrl: wiki("Pão de Açúcar visto do Corcovado.jpg"), credit: "Rio de Janeiro — Wikimedia Commons", creditHref: "https://commons.wikimedia.org/wiki/Category:Rio_de_Janeiro_(city)",
    texto: "Recife–Rio por R$ 429 ida e volta em julho, dentro das férias escolares — raro achar a rota nesse patamar no meio do mês de maior procura.",
    dicas: ["Direto, pouco menos de 3h", "Julho é férias: as datas do meio do mês somem primeiro", "Confira a franquia de bagagem antes de fechar"],
    flex: [{ d: "12–19 jul", p: "R$ 429" }, { d: "15–22 jul", p: "R$ 468" }, { d: "19–26 jul", p: "R$ 512" }] },
  { id: "ssa-cnf", origem: "SSA", destino: "CNF", cidade: "Belo Horizonte", local: "Minas Gerais", preco: "R$ 341", media: "R$ 620", economia: "R$ 279", cia: "Azul", datas: "20–27 ago", tipo: "Nacional", publicadoEm: "2026-07-24T21:49:29Z", get publicado() { return formatRelativePublicado(this.publicadoEm); }, erro: false, badge: "45% abaixo da média",
    thumbUrl: wiki("IgrejaPampulha.jpg"), credit: "Igreja da Pampulha, Belo Horizonte — Wikimedia Commons", creditHref: "https://commons.wikimedia.org/wiki/Category:Igreja_de_São_Francisco_de_Assis_(Belo_Horizonte)",
    texto: "Salvador–Belo Horizonte por R$ 341 ida e volta em agosto. Rota curta e barata para quem quer trocar o litoral pela serra mineira.",
    dicas: ["Cerca de 2h de voo direto", "Agosto é seco em Minas, bom para estrada", "Dá para emendar Ouro Preto e Tiradentes de carro"],
    flex: [{ d: "20–27 ago", p: "R$ 341" }, { d: "24–31 ago", p: "R$ 368" }, { d: "27 ago–3 set", p: "R$ 389" }] },
  { id: "for-ssa", origem: "FOR", destino: "SSA", cidade: "Salvador", local: "Bahia", preco: "R$ 287", media: "R$ 505", economia: "R$ 218", cia: "GOL", datas: "3–10 out", tipo: "Nacional", publicadoEm: "2026-07-24T18:49:29Z", get publicado() { return formatRelativePublicado(this.publicadoEm); }, erro: false, badge: "43% abaixo da média",
    thumbUrl: wiki("Pelourinho, Salvador, Bahia.jpg"), credit: "Pelourinho — Wikimedia Commons", creditHref: "https://commons.wikimedia.org/wiki/Category:Pelourinho",
    texto: "Fortaleza–Salvador por R$ 287 ida e volta em outubro. Uma das passagens mais baratas do feed hoje, ligando duas capitais do Nordeste.",
    dicas: ["Voo direto de cerca de 1h40", "Outubro pega o fim da baixa temporada", "Bagagem de mão inclusa; despachada à parte"],
    flex: [{ d: "3–10 out", p: "R$ 287" }, { d: "8–15 out", p: "R$ 305" }, { d: "15–22 out", p: "R$ 331" }] },
  // Ofertas para destinos que JA tem roteiro editorial (ver GUIDES), para o
  // "robo do dia" (src/daily/dailyPick.js) ter mais de 6 candidatos e nao
  // repetir o mesmo par a cada 3 dias. Foto reaproveitada do roteiro quando o
  // roteiro mostra o proprio destino da oferta (ja conferida no Commons);
  // Montevideu ganhou foto propria porque a foto do roteiro e de Colonia del
  // Sacramento, outra cidade do Uruguai.
  { id: "gru-cuz", origem: "GRU", destino: "CUZ", cidade: "Cusco", local: "Peru", preco: "R$ 2.100", media: "R$ 3.200", economia: "R$ 1.100", cia: "LATAM", datas: "10–20 ago", tipo: "Internacional", publicadoEm: "2026-07-29T08:15:00Z", get publicado() { return formatRelativePublicado(this.publicadoEm); }, erro: false, badge: "34% abaixo da média",
    thumbUrl: wiki("Machu Picchu, Peru.jpg"), credit: "Machu Picchu — Wikimedia Commons", creditHref: "https://commons.wikimedia.org/wiki/Category:Machu_Picchu",
    texto: "São Paulo–Cusco por R$ 2.100 ida e volta em agosto, dentro da estação seca. A rota tem uma escala em Lima (cerca de 7h de viagem no total) — dá tempo de aclimatar antes de subir a Machu Picchu.",
    dicas: ["1 escala em Lima; confira o tempo de conexão antes de comprar", "Agosto é seca no Peru: céu mais limpo para as fotos da citadela", "Ingresso de Machu Picchu e trem esgotam semanas antes na alta temporada — compre à parte e com antecedência"],
    flex: [{ d: "10–20 ago", p: "R$ 2.100" }, { d: "14–24 ago", p: "R$ 2.185" }, { d: "18–28 ago", p: "R$ 2.260" }] },
  { id: "gru-brc", origem: "GRU", destino: "BRC", cidade: "Bariloche", local: "Argentina", preco: "R$ 1.980", media: "R$ 2.680", economia: "R$ 700", cia: "LATAM", datas: "12–19 ago", tipo: "Internacional", publicadoEm: "2026-07-29T05:40:00Z", get publicado() { return formatRelativePublicado(this.publicadoEm); }, erro: false, badge: "26% abaixo da média",
    thumbUrl: HERO_SLIDES[1].src, credit: HERO_SLIDES[1].credit, creditHref: HERO_SLIDES[1].creditHref,
    texto: "São Paulo–Bariloche por R$ 1.980 ida e volta em agosto, ainda dentro da temporada de neve. Pistas abertas no Cerro Catedral e preço melhor que o pico de julho.",
    dicas: ["Confira se a tarifa é direta ou com conexão antes de reservar — varia por data", "Agosto ainda tem neve, com fila menor que em julho", "Roupa de neve pode ser alugada em Bariloche; sai mais barato que trazer de casa"],
    flex: [{ d: "12–19 ago", p: "R$ 1.980" }, { d: "15–22 ago", p: "R$ 2.048" }, { d: "19–26 ago", p: "R$ 2.120" }] },
  { id: "cnf-mao", origem: "CNF", destino: "MAO", cidade: "Manaus", local: "Amazonas", preco: "R$ 1.180", media: "R$ 1.780", economia: "R$ 600", cia: "Azul", datas: "20–27 set", tipo: "Nacional", publicadoEm: "2026-07-28T22:10:00Z", get publicado() { return formatRelativePublicado(this.publicadoEm); }, erro: false, badge: "34% abaixo da média",
    thumbUrl: wiki("Amazon Theatre (Manaus, Brazil) (edited).jpg"), credit: "Teatro Amazonas, Manaus — Wikimedia Commons", creditHref: "https://commons.wikimedia.org/wiki/Category:Teatro_Amazonas",
    texto: "Belo Horizonte–Manaus por R$ 1.180 ida e volta em setembro, começo da seca no Amazonas — rio mais baixo, mas trilhas de floresta mais fáceis de andar.",
    dicas: ["Rota com conexão; confira o tempo de escala", "Setembro é seca: bom para hospedagem em terra firme, ruim para passeio de igapó alagado", "Vacina de febre amarela é recomendada para quem sai da cidade"],
    flex: [{ d: "20–27 set", p: "R$ 1.180" }, { d: "23–30 set", p: "R$ 1.224" }, { d: "27 set–4 out", p: "R$ 1.268" }] },
  { id: "gig-cnf-op", origem: "GIG", destino: "CNF", cidade: "Ouro Preto", local: "Minas Gerais", preco: "R$ 310", media: "R$ 560", economia: "R$ 250", cia: "GOL", datas: "15–22 ago", tipo: "Nacional", publicadoEm: "2026-07-28T19:05:00Z", get publicado() { return formatRelativePublicado(this.publicadoEm); }, erro: false, badge: "45% abaixo da média",
    thumbUrl: wiki("Ouro Preto, Minas Gerais.jpg"), credit: "Ouro Preto — Wikimedia Commons", creditHref: "https://commons.wikimedia.org/wiki/Category:Ouro_Preto",
    texto: "Rio–Belo Horizonte por R$ 310 ida e volta em agosto. O voo pousa em Confins; Ouro Preto fica a cerca de 1h30 de carro ou van a partir daí.",
    dicas: ["Voo direto de pouco mais de 1h até Confins (CNF)", "De Confins, some 1h30 de estrada até o centro histórico de Ouro Preto", "Ladeiras de pedra: leve calçado fechado e confortável"],
    flex: [{ d: "15–22 ago", p: "R$ 310" }, { d: "18–25 ago", p: "R$ 328" }, { d: "22–29 ago", p: "R$ 347" }] },
  { id: "poa-mvd", origem: "POA", destino: "MVD", cidade: "Montevidéu", local: "Uruguai", preco: "R$ 890", media: "R$ 1.320", economia: "R$ 430", cia: "LATAM", datas: "5–12 set", tipo: "Internacional", publicadoEm: "2026-07-28T14:30:00Z", get publicado() { return formatRelativePublicado(this.publicadoEm); }, erro: false, badge: "33% abaixo da média",
    thumbUrl: wiki("Palacio Salvo, Montevideo, Uruguay.jpg"), credit: "Palácio Salvo, Montevidéu — Wikimedia Commons", creditHref: "https://commons.wikimedia.org/wiki/Category:Palacio_Salvo",
    texto: "Porto Alegre–Montevidéu por R$ 890 ida e volta em setembro, início da primavera uruguaia. Cidade pequena para caminhar, com boa gastronomia e câmbio favorável.",
    dicas: ["Confira se a tarifa é direta ou com conexão antes de reservar", "Setembro tem clima ameno, sem o frio pesado do inverno", "Uruguai aceita o real como referência em vários comércios, mas leve pesos para o dia a dia"],
    flex: [{ d: "5–12 set", p: "R$ 890" }, { d: "9–16 set", p: "R$ 924" }, { d: "12–19 set", p: "R$ 958" }] },
  { id: "bsb-cgr", origem: "BSB", destino: "CGR", cidade: "Bonito", local: "Mato Grosso do Sul", preco: "R$ 680", media: "R$ 980", economia: "R$ 300", cia: "Azul", datas: "8–15 ago", tipo: "Nacional", publicadoEm: "2026-07-28T09:50:00Z", get publicado() { return formatRelativePublicado(this.publicadoEm); }, erro: false, badge: "31% abaixo da média",
    thumbUrl: wiki("Gruta do Lago Azul - Bonito, MS.JPG"), credit: "Bonito — Wikimedia Commons", creditHref: "https://commons.wikimedia.org/wiki/Category:Monumento_Natural_da_Gruta_do_Lago_Azul",
    texto: "Brasília–Campo Grande por R$ 680 ida e volta em agosto, dentro da seca — água dos rios mais clara para flutuação. De Campo Grande, Bonito fica a cerca de 5h de estrada.",
    dicas: ["Voo até Campo Grande (CGR); o roteiro de Bonito continua de van ou carro", "Passeios de flutuação têm vagas limitadas por dia — reserve antes de comprar a passagem", "Água mais clara na seca (ago–out); leve protetor solar biodegradável, é exigido em vários atrativos"],
    flex: [{ d: "8–15 ago", p: "R$ 680" }, { d: "12–19 ago", p: "R$ 705" }, { d: "15–22 ago", p: "R$ 730" }] },
];

// Origens do filtro, DERIVADAS das ofertas reais em vez de fixas na mao. Antes
// a lista era ["Todas","GRU","VCP","GIG","CNF"] e nao acompanhava o feed: uma
// usuaria de Recife nao encontrava a propria cidade nem para tentar, e concluiu
// "esse site nao e pra mim". Derivando, qualquer oferta nova de uma cidade nova
// aparece no filtro sozinha.
export const OFFER_ORIGINS = ["Todas", ...[...new Set(OFFERS.map((o) => o.origem))].sort()];

// Coordenadas das CIDADES-destino das ofertas editoriais (por id), para o
// mini-mapa "Onde fica" na página de detalhe. Ofertas ao vivo sem coordenada
// caem para um link de busca no Google Maps.
export const OFFER_COORDS = {
  "gru-lis": { lat: 38.7223, lng: -9.1393 }, // Lisboa
  "gru-rec": { lat: -8.0476, lng: -34.877 }, // Recife
  "vcp-bue": { lat: -34.6037, lng: -58.3816 }, // Buenos Aires
  "gru-eze": { lat: -34.6037, lng: -58.3816 }, // Buenos Aires
  "gru-fln": { lat: -27.5935, lng: -48.5582 }, // Florianópolis
  "gig-ssa": { lat: -12.9714, lng: -38.5014 }, // Salvador
  "cnf-fln": { lat: -27.5954, lng: -48.548 }, // Florianópolis
  "gig-mia": { lat: 25.7617, lng: -80.1918 }, // Miami
  "gru-scl": { lat: -33.4489, lng: -70.6693 }, // Santiago
  "gru-mco": { lat: 28.5383, lng: -81.3792 }, // Orlando
  "gig-ssa": { lat: -12.9714, lng: -38.5014 }, // Salvador
  // Saidas do Nordeste. Sem coordenada aqui o mini-mapa "Onde fica" da pagina de
  // detalhe cai no link de busca do Google Maps em vez de mostrar o mapa.
  "rec-gru": { lat: -23.5505, lng: -46.6333 }, // Sao Paulo
  "rec-gig": { lat: -22.9068, lng: -43.1729 }, // Rio de Janeiro
  "ssa-cnf": { lat: -19.9167, lng: -43.9345 }, // Belo Horizonte
  "for-ssa": { lat: -12.9714, lng: -38.5014 }, // Salvador
  // Ofertas novas para destinos com roteiro editorial (ver comentario acima
  // de "gru-cuz" em OFFERS).
  "gru-cuz": { lat: -13.5319, lng: -71.9675 }, // Cusco
  "gru-brc": { lat: -41.1335, lng: -71.3103 }, // Bariloche
  "cnf-mao": { lat: -3.119, lng: -60.0217 }, // Manaus
  "gig-cnf-op": { lat: -20.3855, lng: -43.5035 }, // Ouro Preto
  "poa-mvd": { lat: -34.9011, lng: -56.1645 }, // Montevidéu
  "bsb-cgr": { lat: -21.1261, lng: -56.4836 }, // Bonito
};

// ---------------------------------------------------------------------------
// RESULTADOS DE VOO (tela "results" do prototipo)
//
// Dados de amostra (o back-end ainda nao tem busca de voos ao vivo). A tela
// esta portada e pronta para receber uma integracao de flight search: basta
// alimentar renderResultsPage com { rota, voos } no mesmo shape.
// ---------------------------------------------------------------------------

export const RESULTS_ROUTE = {
  origem: "GRU",
  destino: "REC",
  resumo: "12 – 19 ago · 2 adultos · Econômica",
};

export const FLIGHT_SORTS = ["Mais barato", "Mais rápido", "Recomendado"];

export const FLIGHTS = [
  { cia: "Azul", numero: "AD 4102 · direto", saida: "07:15", chegada: "10:20", duracao: "3h 05", paradas: "Direto", direto: true, preco: "R$ 1.184", parcela: "R$ 98,67", melhor: true },
  { cia: "GOL", numero: "G3 1748 · direto", saida: "09:40", chegada: "12:50", duracao: "3h 10", paradas: "Direto", direto: true, preco: "R$ 1.236", parcela: "R$ 103,00", melhor: false },
  { cia: "LATAM", numero: "LA 3342 · via BSB", saida: "06:30", chegada: "11:45", duracao: "5h 15", paradas: "1 parada · BSB", direto: false, preco: "R$ 1.092", parcela: "R$ 91,00", melhor: false },
  { cia: "Azul", numero: "AD 2917 · via CNF", saida: "13:05", chegada: "18:10", duracao: "5h 05", paradas: "1 parada · CNF", direto: false, preco: "R$ 1.148", parcela: "R$ 95,67", melhor: false },
  { cia: "LATAM", numero: "LA 3260 · direto", saida: "16:20", chegada: "19:25", duracao: "3h 05", paradas: "Direto", direto: true, preco: "R$ 1.310", parcela: "R$ 109,17", melhor: false },
];

export const FLIGHT_FILTERS = [
  { titulo: "Paradas", opcoes: [{ label: "Voo direto", on: true }, { label: "1 parada", on: true }, { label: "2+ paradas", on: false }] },
  { titulo: "Companhias", opcoes: [{ label: "Azul", on: true }, { label: "GOL", on: true }, { label: "LATAM", on: true }] },
  { titulo: "Horário de partida", opcoes: [{ label: "Manhã (6h – 12h)", on: true }, { label: "Tarde (12h – 18h)", on: true }, { label: "Noite (18h – 0h)", on: false }] },
];

// ---------------------------------------------------------------------------
// GUIAS DE DESTINO (roteiros editoriais de 5 dias, dia a dia)
// ---------------------------------------------------------------------------

const BASE_GUIDES = {
  portodegalinhas: {
    id: "portodegalinhas", breadcrumb: "Recife e Porto de Galinhas", tag: "Praia · Nordeste",
    titulo: "Recife e Porto de Galinhas em 5 dias",
    resumo: "Dois dias de cultura entre Recife Antigo e Olinda, três de piscinas naturais — com o restaurante certo em cada dia.",
    intro: "Um roteiro que junta o melhor dos dois mundos: dois dias de cultura entre Recife Antigo e Olinda, depois três dias de mar morno e piscinas naturais no litoral sul de Pernambuco. Feito para quem quer descansar sem abrir mão de conhecer.",
    heroFoto: "jangadas nas piscinas naturais de Porto de Galinhas",
    heroSrc: wiki("Porto de Galinhas, Pernambuco.jpg"),
    heroCredit: "Porto de Galinhas — Wikimedia Commons",
    heroCreditHref: "https://commons.wikimedia.org/wiki/Category:Porto_de_Galinhas",
    preco: "R$ 986", ctaVoos: "Buscar voos para Recife", ctaTitulo: "Pronto para as piscinas naturais?",
    meta: [
      { k: "Duração", v: "5 dias / 4 noites" }, { k: "Melhor época", v: "set a mar (menos chuva)" },
      { k: "Voo de GRU", v: "3h05 direto" }, { k: "Base do roteiro", v: "2n Recife + 2n Porto" },
      { k: "Estilo", v: "praia + cultura, ritmo calmo" },
    ],
    hospedagem: { texto: "Dá pra dividir a base em dois, como o roteiro sugere: os dois primeiros dias no bairro do Recife, a pé de tudo o que aparece no dia 1, e os três seguintes na vila de Porto de Galinhas, a poucos minutos das piscinas naturais e do ponto de partida do buggy. Ficar num só lugar fixo significa pelo menos 40 minutos de transfer todo dia até o outro lado do roteiro." },
    opt: {
      destName: "Recife (REC)", months: [1480, 1360, 1020, 986, 1010, 1120, 1390, 1180, 1040, 1090, 1210, 1560],
      window: { label: "14 – 21 abr 2026", price: "R$ 986", save: "33%", note: "terça a terça, voo direto — a combinação mais barata do trimestre" },
      sources: [{ name: "Aonde", price: "R$ 986", note: "tarifa encontrada pela nossa curadoria", best: true }, { name: "Google Flights", price: "R$ 1.058", note: "melhor tarifa encontrada" }, { name: "Kayak", price: "R$ 1.041" }, { name: "Skyscanner", price: "R$ 1.072" }],
    },
    dias: [
      { n: 1, titulo: "Recife Antigo", desc: "Chegada, hotel no bairro do Recife e tarde inteira no centro histórico, tudo a pé.",
        pontos: [{ nome: "Marco Zero", nota: "a praça que abre o roteiro, com vista para o Parque das Esculturas" }, { nome: "Paço do Frevo", nota: "museu vivo do frevo; vale pegar uma aula-relâmpago de sombrinha" }, { nome: "Rua do Bom Jesus", nota: "uma das ruas mais bonitas do país e a sinagoga Kahal Zur Israel" }],
        restaurante: "Leite", restauranteNota: "restaurante em atividade desde 1882; peça a cartola de sobremesa" },
      { n: 2, titulo: "Olinda, a vizinha de 500 anos", desc: "Suba as ladeiras de manhã, quando o calor ainda perdoa, e desça no ritmo dos ateliês.",
        pontos: [{ nome: "Alto da Sé", nota: "o cartão-postal: Olinda no primeiro plano, Recife ao fundo" }, { nome: "Mosteiro de São Bento", nota: "altar barroco folheado a ouro; missa com canto gregoriano aos domingos" }, { nome: "Ateliês da Rua do Amparo", nota: "arte pernambucana para levar na mala" }],
        restaurante: "Oficina do Sabor", restauranteNota: "jerimum recheado com camarão, com vista para o casario" },
      { n: 3, titulo: "Chegada a Porto de Galinhas", desc: "Transfer de 1h saindo cedo. Dia de piscinas naturais — a maré baixa manda no horário, confira a tábua na véspera.",
        pontos: [{ nome: "Piscinas naturais", nota: "de jangada, na maré baixa; corais e peixes a meio metro de você" }, { nome: "Vila de Porto", nota: "fim de tarde entre as lojinhas e o letreiro das galinhas coloridas" }],
        restaurante: "Beijupirá", restauranteNota: "o clássico da vila; peixe com tamarindo e camarão com maracujá" },
      { n: 4, titulo: "Muro Alto e Praia do Cupe", desc: "Dia de buggy ponta a ponta pelas praias do litoral, terminando na piscina natural mais calma da região.",
        pontos: [{ nome: "Praia de Muro Alto", nota: "mar de piscina, ideal para quem viaja com crianças ou quer só boiar" }, { nome: "Passeio de buggy", nota: "ponta a ponta com paradas livres; feche na associação oficial da vila" }],
        restaurante: "Barcaxeira", restauranteNota: "cozinha regional criativa; a macaxeira aparece até na sobremesa" },
      { n: 5, titulo: "Praia dos Carneiros", desc: "Day trip de despedida: 40 minutos ao sul, a praia da igrejinha à beira-mar. Volta a Recife ao entardecer para o voo.",
        pontos: [{ nome: "Igrejinha de São Benedito", nota: "a capela na areia, cenário mais fotografado de Pernambuco" }, { nome: "Catamarã pelo rio Formoso", nota: "manguezal, bancos de areia e banho no encontro do rio com o mar" }],
        restaurante: "Bora Bora Beach", restauranteNota: "clube de praia com mesas na água; peixe na brasa e caju amigo" },
    ],
  },
  salvador: {
    id: "salvador", breadcrumb: "Salvador", tag: "Cidade histórica · Bahia",
    titulo: "Salvador em 5 dias, sem pressa",
    resumo: "Pelourinho, Bonfim, Rio Vermelho e Itapuã na ordem certa, do acarajé da Dinha à moqueca da Casa de Tereza.",
    intro: "A primeira capital do Brasil pede tempo: ladeiras do Pelourinho, igrejas cobertas de ouro, acarajé no fim da tarde e o mar de Itapuã para fechar. Este roteiro organiza tudo em cinco dias no ritmo certo — muito a pé, sempre com um bom almoço marcado.",
    heroFoto: "casario colorido do Pelourinho ao entardecer",
    heroSrc: HERO_SLIDES[2].src, heroCredit: HERO_SLIDES[2].credit, heroCreditHref: HERO_SLIDES[2].creditHref,
    preco: "R$ 874", ctaVoos: "Buscar voos para Salvador", ctaTitulo: "Salvador está chamando.",
    meta: [
      { k: "Duração", v: "5 dias / 4 noites" }, { k: "Melhor época", v: "set a mar (verão baiano)" },
      { k: "Voo de GRU", v: "2h20 direto" }, { k: "Base do roteiro", v: "Barra ou Rio Vermelho" },
      { k: "Estilo", v: "história + gastronomia" },
    ],
    hospedagem: { texto: "Barra e Rio Vermelho resolvem o roteiro por ângulos diferentes: a Barra deixa você a pé do Porto da Barra e do Farol do dia 2, enquanto o Rio Vermelho põe a Casa do Rio Vermelho e o acarajé da Dinha, do dia 4, na porta de casa. Os dois exigem carro ou app até o Pelourinho e até Itapuã, que ficam nas pontas opostas da cidade." },
    opt: {
      destName: "Salvador (SSA)", months: [1320, 1180, 874, 910, 940, 1040, 1330, 1120, 980, 1010, 1150, 1480],
      window: { label: "3 – 10 mar 2026", price: "R$ 874", save: "34%", note: "fim do verão baiano, mar ainda quente e cidade mais vazia" },
      sources: [{ name: "Aonde", price: "R$ 874", note: "tarifa encontrada pela nossa curadoria", best: true }, { name: "Google Flights", price: "R$ 946", note: "melhor tarifa encontrada" }, { name: "Kayak", price: "R$ 928" }, { name: "Skyscanner", price: "R$ 961" }],
    },
    dias: [
      { n: 1, titulo: "Pelourinho e Centro Histórico", desc: "O coração de Salvador em um dia: chegue às 9h, quando os largos ainda estão vazios, e vá descendo.",
        pontos: [{ nome: "Igreja de São Francisco", nota: "interior barroco com quase um quilo de ouro por metro; imperdível" }, { nome: "Largo do Pelourinho", nota: "casario colorido, Fundação Casa de Jorge Amado e música ao vivo" }, { nome: "Elevador Lacerda + Mercado Modelo", nota: "desça para a Cidade Baixa no elevador art déco de 1873" }],
        restaurante: "Restaurante do SENAC-Pelourinho", restauranteNota: "buffet-escola com mais de 40 pratos baianos; a melhor aula de Bahia que existe" },
      { n: 2, titulo: "Barra e o pôr do sol", desc: "Dia de orla: manhã de praia, tarde de museu e o pôr do sol mais famoso da cidade.",
        pontos: [{ nome: "Farol da Barra", nota: "suba os 22 metros; o museu náutico conta os naufrágios da Baía" }, { nome: "Porto da Barra", nota: "praia pequena e calma, eleita entre as melhores urbanas do mundo" }, { nome: "Museu de Arte Moderna (MAM), na Solar do Unhão", nota: "sexta tem jazz ao pôr do sol (a JAM no MAM)" }],
        restaurante: "Pereira", restauranteNota: "frente para o Farol; moqueca de camarão e drinques de frutas do cerrado" },
      { n: 3, titulo: "Bonfim, fitinhas e Ribeira", desc: "Manhã na Cidade Baixa, entre fé e sorvete: o eixo mais soteropolitano do roteiro.",
        pontos: [{ nome: "Igreja do Bonfim", nota: "amarre a fitinha com os três pedidos; a sala dos milagres emociona" }, { nome: "Ponta de Humaitá", nota: "farol, igrejinha e a vista mais bonita da Baía de Todos-os-Santos" }, { nome: "Sorveteria da Ribeira", nota: "desde 1931; sorvete de tapioca é o pedido certo" }],
        restaurante: "Boteco do França", restauranteNota: "lambreta (marisco) aos montes e cerveja gelada, cara da Bahia" },
      { n: 4, titulo: "Rio Vermelho, o bairro boêmio", desc: "Dia de andar devagar: livrarias, casas de escritores e o acarajé mais famoso do Brasil na praça.",
        pontos: [{ nome: "Casa do Rio Vermelho", nota: "a casa-museu de Jorge Amado e Zélia Gattai; jardim com as cinzas do casal" }, { nome: "Acarajé da Dinha", nota: "na praça de Santana desde 1967; peça quente e com tudo" }, { nome: "Largo da Mariquita", nota: "feirinha, música e o mar de fundo para fechar a noite" }],
        restaurante: "Casa de Tereza", restauranteNota: "cozinha baiana contemporânea; a moqueca sai na panela de barro" },
      { n: 5, titulo: "Itapuã e a despedida", desc: "O dia do mar: a praia cantada por Dorival Caymmi e Vinicius, com lagoa escondida atrás das dunas.",
        pontos: [{ nome: "Praia de Itapuã", nota: "coqueiros, jangadas e barracas de peixe frito na areia" }, { nome: "Lagoa do Abaeté", nota: "água escura contra dunas brancas; fim de tarde bonito e tranquilo" }, { nome: "Farol de Itapuã", nota: "listrado, pequeno e perfeito para a última foto da viagem" }],
        restaurante: "Barraca do Lôro", restauranteNota: "peixe frito com baião na areia de Itapuã; peça o de escama" },
    ],
  },
  noronha: {
    id: "noronha", breadcrumb: "Fernando de Noronha", tag: "Praia · Fernando de Noronha",
    titulo: "Fernando de Noronha em 5 dias",
    resumo: "Baía do Sancho, golfinhos ao amanhecer e o mar mais bonito do Brasil — com o roteiro que resolve as taxas e agendamentos.",
    intro: "O arquipélago que muita gente coloca no topo da lista da vida: o mar mais bonito do Brasil, praias de tirar o fôlego, golfinhos ao amanhecer e mergulho de outro planeta. Exige planejamento (taxa ambiental e ingresso do parque), mas devolve em dobro.",
    heroFoto: "Baía do Sancho vista do alto",
    heroSrc: HERO_SLIDES[0].src, heroCredit: HERO_SLIDES[0].credit, heroCreditHref: HERO_SLIDES[0].creditHref,
    preco: "R$ 1.680", ctaVoos: "Buscar voos para Noronha", ctaTitulo: "Noronha entra na lista da vida.",
    meta: [{ k: "Duração", v: "5 dias / 4 noites" }, { k: "Melhor época", v: "ago–dez (mar calmo)" }, { k: "Voo via", v: "REC ou NAT · ~1h" }, { k: "Base do roteiro", v: "Vila dos Remédios" }, { k: "Atenção", v: "taxa ambiental + ingresso do parque" }],
    hospedagem: { texto: "Fique na Vila dos Remédios: é dali que saem os passeios para o Sancho e a Baía dos Porcos, e as praias do primeiro dia — Cachorro, Conceição, Boldró — ficam a pé. Fora da Vila as opções de pousada rareiam e o transporte pela ilha é limitado, então vale reservar com meses de antecedência na alta temporada." },
    opt: {
      destName: "Fernando de Noronha (FEN)", months: [2200, 2100, 1780, 1690, 1720, 1880, 2050, 1780, 1680, 1740, 1980, 2260],
      window: { label: "3 – 7 set 2026", price: "R$ 1.680", save: "26%", note: "início da melhor temporada de mergulho, antes do pico de dezembro" },
      sources: [{ name: "Aonde", price: "R$ 1.680", note: "tarifa encontrada pela nossa curadoria", best: true }, { name: "Google Flights", price: "R$ 1.795", note: "melhor tarifa encontrada" }, { name: "Kayak", price: "R$ 1.762" }, { name: "Skyscanner", price: "R$ 1.810" }],
    },
    dias: [
      { n: 1, titulo: "Mar de Dentro", desc: "Chegada, taxa ambiental e ingresso do parque resolvidos, e as primeiras praias, todas pertinho da Vila.",
        pontos: [{ nome: "Praia do Cachorro e Conceição", nota: "as praias urbanas da Vila, ótimas para o primeiro mergulho" }, { nome: "Forte e Praia do Boldró", nota: "o pôr do sol clássico da ilha, do alto do forte holandês" }],
        restaurante: "Bar do Meio", restauranteNota: "pé na areia da Conceição para o pôr do sol; drink de cajá e petiscos de frutos do mar" },
      { n: 2, titulo: "Baía do Sancho", desc: "A praia eleita a mais bonita do mundo mais de uma vez. Desça pela fenda na rocha e reserve o dia.",
        pontos: [{ nome: "Baía do Sancho", nota: "escadas verticais dentro de uma fenda; a recompensa é indescritível" }, { nome: "Baía dos Porcos", nota: "piscininhas entre pedras com o Morro Dois Irmãos de cenário" }],
        restaurante: "Restaurante do Zé Maria", restauranteNota: "o Festival Noronhense (terças e sábados): dezenas de pratos e o Morro do Pico ao fundo" },
      { n: 3, titulo: "Passeio de barco e golfinhos", desc: "Manhã no mar contornando a ilha, com os golfinhos-rotadores e paradas para snorkel.",
        pontos: [{ nome: "Baía dos Golfinhos", nota: "centenas de rotadores ao amanhecer; um dos maiores santuários do mundo" }, { nome: "Snorkel na Baía do Sueste", nota: "nade com tartarugas em água rasa e transparente" }],
        restaurante: "Mergulhão", restauranteNota: "na marina, com vista para os barcos; risoto de camarão e a melhor carta de drinks" },
      { n: 4, titulo: "Atalaia e Mar de Fora", desc: "A piscina natural mais famosa (com horário agendado) e as praias mais bravas do outro lado.",
        pontos: [{ nome: "Piscina natural da Atalaia", nota: "agendamento obrigatório; 30 min entre corais, peixes e tubarões-bebê" }, { nome: "Praia do Leão", nota: "desova de tartarugas e a paisagem mais selvagem da ilha" }],
        restaurante: "Xica da Silva", restauranteNota: "moqueca de cavala e caldeirada; simples, gostoso e queridinho dos ilhéus" },
      { n: 5, titulo: "Trilha e despedida", desc: "Uma última caminhada histórica e as compras antes do voo de volta ao continente.",
        pontos: [{ nome: "Capela e Forte dos Remédios", nota: "o conjunto histórico da Vila, com vista para o mar" }, { nome: "Mirante do Boldró", nota: "a última foto do arquipélago inteiro, do alto" }],
        restaurante: "Cacimba Bistrô", restauranteNota: "cozinha autoral na Cacimba do Padre; peça o peixe do dia grelhado" },
    ],
  },
  rio: {
    id: "rio", breadcrumb: "Rio de Janeiro", tag: "Cidade · Rio de Janeiro",
    titulo: "Rio de Janeiro em 5 dias clássicos",
    resumo: "Cristo, Pão de Açúcar e praias nos horários certos, mais Santa Teresa e um dia de praias selvagens em Niterói.",
    intro: "O cartão-postal do Brasil sem estresse: praias da Zona Sul, Cristo e Pão de Açúcar nos horários certos, um dia em Santa Teresa e outro nas praias selvagens. Um roteiro que dá conta do essencial sem correr — e ainda sobra tempo de esticar na areia.",
    heroFoto: "enseada de Botafogo com o Pão de Açúcar ao fundo",
    heroSrc: wiki("Pão de Açúcar visto do Corcovado.jpg"),
    heroCredit: "Rio de Janeiro — Wikimedia Commons", heroCreditHref: "https://commons.wikimedia.org/wiki/Category:Rio_de_Janeiro_(city)",
    preco: "R$ 640", ctaVoos: "Buscar voos para o Rio", ctaTitulo: "O Rio continua lindo.",
    meta: [{ k: "Duração", v: "5 dias / 4 noites" }, { k: "Melhor época", v: "abr–jun e ago–out" }, { k: "Voo de GRU", v: "1h05 · ponte aérea" }, { k: "Base do roteiro", v: "Copacabana ou Ipanema" }, { k: "Estilo", v: "praia + cidade" }],
    hospedagem: { texto: "Copacabana bota o calçadão e o Arpoador do primeiro dia na porta de casa; Ipanema fica mais perto do posto 9 e costuma ser mais tranquila à noite. As duas encostam no metrô, que evita o trânsito até o Corcovado e o Pão de Açúcar nos dias de subida." },
    opt: {
      destName: "Rio de Janeiro (GIG)", months: [980, 880, 700, 640, 690, 760, 900, 780, 690, 720, 810, 1060],
      window: { label: "14 – 18 mai 2026", price: "R$ 640", save: "28%", note: "quinta a segunda, fora de temporada e de feriado" },
      sources: [{ name: "Aonde", price: "R$ 640", note: "tarifa encontrada pela nossa curadoria", best: true }, { name: "Google Flights", price: "R$ 712", note: "melhor tarifa encontrada" }, { name: "Kayak", price: "R$ 698" }, { name: "Skyscanner", price: "R$ 725" }],
    },
    dias: [
      { n: 1, titulo: "Zona Sul e as praias", desc: "Aterrisse, largue a mala e vá direto para a areia. Termine no Arpoador para o pôr do sol aplaudido.",
        pontos: [{ nome: "Copacabana e Ipanema", nota: "calçadão de ponta a ponta; posto 9 em Ipanema é o point" }, { nome: "Pedra do Arpoador", nota: "o pôr do sol que a cidade inteira aplaude, entre as duas praias" }],
        restaurante: "Bar Urca", restauranteNota: "petiscos na mureta da Urca com vista para a baía; bolinho de bacalhau e chope" },
      { n: 2, titulo: "Cristo e Santa Teresa", desc: "Suba cedo ao Corcovado (menos fila e névoa) e passe a tarde no bairro-ateliê mais charmoso do Rio.",
        pontos: [{ nome: "Cristo Redentor", nota: "van oficial do Cosme Velho; vá no primeiro horário" }, { nome: "Santa Teresa e Escadaria Selarón", nota: "bondinho, ateliês e os degraus de azulejo do Jorge Selarón" }],
        restaurante: "Aprazível", restauranteNota: "cozinha brasileira em um jardim com vista para a Guanabara; reserve mesa na varanda" },
      { n: 3, titulo: "Pão de Açúcar e Centro", desc: "Manhã de museus no Centro histórico, fim de tarde no bondinho para ver a cidade acender.",
        pontos: [{ nome: "Pão de Açúcar", nota: "dois teleféricos até 396 m; suba uma hora antes do pôr do sol" }, { nome: "Centro histórico", nota: "Theatro Municipal, Cinelândia e a Confeitaria Colombo art nouveau" }],
        restaurante: "Confeitaria Colombo", restauranteNota: "salão de 1894 com espelhos belgas; pare para o chá da tarde com pastéis de Belém" },
      { n: 4, titulo: "Jardim Botânico e Lagoa", desc: "Um dia mais verde e tranquilo, longe da agitação da praia, com a Lagoa de bike ou pedalinho.",
        pontos: [{ nome: "Jardim Botânico", nota: "aleia das palmeiras imperiais e o jardim dos beija-flores" }, { nome: "Parque Lage", nota: "o palacete com a piscina e a vista do Cristo emoldurado" }],
        restaurante: "Braseiro da Gávea", restauranteNota: "a picanha e o galeto que são tradição carioca; sente na calçada da Gávea" },
      { n: 5, titulo: "Niterói e praias selvagens", desc: "Atravesse a ponte para ver o Rio de fora e fechar a viagem numa praia de mar aberto.",
        pontos: [{ nome: "MAC de Niterói", nota: "o disco voador do Niemeyer com a mais bela vista da orla do Rio" }, { nome: "Praia de Itacoatiara", nota: "mar forte e cercado por morros; ou fique na Prainha, no lado carioca" }],
        restaurante: "Barraca na Prainha", restauranteNota: "peixe grelhado e água de coco na areia; o encerramento pé na areia perfeito" },
    ],
  },
  bariloche: {
    id: "bariloche", breadcrumb: "Bariloche", tag: "Neve · Argentina",
    titulo: "Bariloche na neve: ski e chocolate",
    resumo: "Dois dias de Cerro Catedral, Circuito Chico e fondue — um roteiro que funciona até para quem nunca esquiou.",
    intro: "De julho a setembro, a Patagônia argentina vira o destino de neve mais acessível para quem sai do Brasil: voo direto, ski no Cerro Catedral, fondue à noite e chocolate em todas as esquinas. Este roteiro equilibra dois dias de pista com passeios para quem não esquia.",
    heroFoto: "Cerro Catedral nevado com o lago Nahuel Huapi ao fundo",
    heroSrc: HERO_SLIDES[1].src, heroCredit: HERO_SLIDES[1].credit, heroCreditHref: HERO_SLIDES[1].creditHref,
    preco: "R$ 2.190", ctaVoos: "Buscar voos para Bariloche", ctaTitulo: "A neve tem data para acabar.",
    meta: [{ k: "Duração", v: "5 dias / 4 noites" }, { k: "Temporada de neve", v: "julho a setembro" }, { k: "Voo de GRU", v: "4h10 direto" }, { k: "Base do roteiro", v: "centro, perto da Mitre" }, { k: "Estilo", v: "neve + gastronomia; serve para quem não esquia" }],
    hospedagem: { texto: "O centro, perto da Avenida Mitre, deixa a rota do chocolate e o El Boliche de Alberto do dia 1 a pé. Para o Cerro Catedral e o Circuito Chico, que tomam os dias 2 a 4, ainda assim é preciso van ou carro alugado — a montanha fica a uns 20 km do centro, seja qual for a base escolhida." },
    opt: {
      destName: "Bariloche (BRC)", months: [2980, 2760, 2190, 2090, 2150, 2620, 3480, 3060, 2340, 2280, 2520, 3120],
      window: { label: "2 – 9 set 2026", price: "R$ 2.340", save: "24%", note: "fim da temporada de neve: pistas abertas e preço já em queda" },
      sources: [{ name: "Aonde", price: "R$ 2.340", note: "tarifa encontrada pela nossa curadoria", best: true }, { name: "Google Flights", price: "R$ 2.512", note: "melhor tarifa encontrada" }, { name: "Kayak", price: "R$ 2.468" }, { name: "Skyscanner", price: "R$ 2.529" }],
    },
    dias: [
      { n: 1, titulo: "Chegada e Centro Cívico", desc: "Instale-se, alugue as roupas de neve ainda hoje (fila menor) e caminhe pelo centro de pedra e madeira.",
        pontos: [{ nome: "Centro Cívico", nota: "a praça suíço-patagônica com vista para o lago Nahuel Huapi" }, { nome: "Calle Mitre", nota: "rota do chocolate: prove o da Rapa Nui e o da Mamuschka, e escolha seu lado" }],
        restaurante: "El Boliche de Alberto", restauranteNota: "a parrilla clássica da cidade; bife de chorizo no ponto e fila que anda" },
      { n: 2, titulo: "Cerro Catedral — dia 1", desc: "O maior centro de ski da América do Sul. Comece na área de iniciantes com aula; o passe pode ser de meio período.",
        pontos: [{ nome: "Aula de ski ou snowboard", nota: "instrutores falam português na alta temporada; reserve antes" }, { nome: "Teleférico até 2.000 m", nota: "mesmo sem esquiar, a vista do topo justifica o bilhete" }],
        restaurante: "Punta Princesa", restauranteNota: "almoço na montanha, a 1.700 m; sopa e vinho quente com vista" },
      { n: 3, titulo: "Cerro Catedral — dia 2", desc: "Dia de praticar o que aprendeu ou de trenó e neve livre para quem não esquia. Noite de fondue.",
        pontos: [{ nome: "Pistas verdes e azuis", nota: "agora sem instrutor; a Princesa I é a queda favorita dos iniciantes" }, { nome: "Parque de trenós", nota: "diversão garantida para todas as idades, sem precisar de aula" }],
        restaurante: "Alto el Fuego", restauranteNota: "parrilla pequena e disputada; reserve a fondue de queijo na véspera" },
      { n: 4, titulo: "Circuito Chico", desc: "O passeio clássico de 60 km pelas paisagens dos lagos, de carro alugado ou excursão de meio dia.",
        pontos: [{ nome: "Cerro Campanario", nota: "suba de cadeirinha: eleita uma das vistas mais bonitas do mundo" }, { nome: "Hotel Llao Llao e Capela San Eduardo", nota: "parada para o chá da tarde com vista para os Andes" }, { nome: "Colonia Suiza", nota: "vilarejo de fundação suíça; o curanto sai da terra aos domingos" }],
        restaurante: "Cervecería Patagonia", restauranteNota: "cerveja própria e vista panorâmica do lago Moreno; vá antes do pôr do sol" },
      { n: 5, titulo: "Cerro Otto e despedida", desc: "Manhã no morro giratório e tarde livre para os últimos chocolates antes do voo.",
        pontos: [{ nome: "Confeitaria giratória do Cerro Otto", nota: "gira 360° em 20 minutos, com os Andes em volta" }, { nome: "Feira artesanal do Centro Cívico", nota: "lãs, madeiras e doces regionais para as lembranças" }],
        restaurante: "Butterfly", restauranteNota: "menu-degustação patagônico à beira do lago; a despedida à altura" },
    ],
  },
  gramado: {
    id: "gramado", breadcrumb: "Gramado e Canela", tag: "Serra · Rio Grande do Sul",
    titulo: "Gramado e Canela em 5 dias",
    resumo: "Fondue, cascatas e catedrais de pedra, um day trip ao Vale dos Vinhedos e a rota do chocolate artesanal.",
    intro: "A serra gaúcha com jeito europeu: fondue e vinho no frio, cascatas e catedrais de pedra, chocolate artesanal em cada esquina e um day trip ao Vale dos Vinhedos. Funciona no inverno e brilha ainda mais no Natal Luz.",
    heroFoto: "Rua Coberta de Gramado iluminada no inverno",
    heroSrc: wiki("Rua Coberta, Gramado.jpg"),
    heroCredit: "Gramado — Wikimedia Commons", heroCreditHref: "https://commons.wikimedia.org/wiki/Category:Gramado",
    preco: "R$ 792", ctaVoos: "Buscar voos para Porto Alegre", ctaTitulo: "A serra está te esperando.",
    meta: [{ k: "Duração", v: "5 dias / 4 noites" }, { k: "Melhor época", v: "inverno (jun–ago) e Natal Luz" }, { k: "Voo de GRU", v: "1h30 a POA + 2h de carro" }, { k: "Base do roteiro", v: "centro de Gramado" }, { k: "Estilo", v: "serra + gastronomia" }],
    hospedagem: { texto: "O centro de Gramado deixa a Rua Coberta e o Lago Negro do dia 1 a poucos passos, e é de lá que saem os passeios para Canela, o Vale dos Vinhedos e a Snowland. Na época do Natal Luz a região central fica cheia e mais cara; vale olhar hospedagem um pouco afastada e contar com carro para os passeios dos outros dias." },
    opt: {
      destName: "Porto Alegre (POA)", months: [1180, 980, 760, 720, 700, 980, 1320, 1160, 820, 1240, 1360, 1280],
      window: { label: "6 – 10 mai 2026", price: "R$ 700", save: "32%", note: "outono na serra, antes do pico do inverno e do Natal Luz" },
      sources: [{ name: "Aonde", price: "R$ 700", note: "tarifa encontrada pela nossa curadoria", best: true }, { name: "Google Flights", price: "R$ 772", note: "melhor tarifa encontrada" }, { name: "Kayak", price: "R$ 758" }, { name: "Skyscanner", price: "R$ 781" }],
    },
    dias: [
      { n: 1, titulo: "Centro de Gramado", desc: "Chegue, pegue o carro em POA e passe a tarde no coração fofo da cidade, a pé.",
        pontos: [{ nome: "Rua Coberta e Lago Negro", nota: "a rua dos plátanos e o pedalinho de cisne no lago cercado de hortênsias" }, { nome: "Mini Mundo", nota: "as maquetes que encantam todas as idades, boas para famílias" }],
        restaurante: "Gasthof Edelweiss", restauranteNota: "a casa do fondue em Gramado desde 1979; feche o combo carne + queijo + chocolate" },
      { n: 2, titulo: "Canela e as cascatas", desc: "A vizinha a 8 km reúne a maior cachoeira da região e a catedral que virou cartão-postal.",
        pontos: [{ nome: "Parque do Caracol", nota: "a queda de 130 m vista do mirante e do elevador panorâmico" }, { nome: "Catedral de Pedra", nota: "estilo gótico inglês, com carrilhão de sinos importados" }],
        restaurante: "Café colonial Bela Vista", restauranteNota: "a mesa farta gaúcha: dezenas de doces, cucas e frios — vá com fome e sem hora" },
      { n: 3, titulo: "Vale dos Vinhedos", desc: "Day trip a Bento Gonçalves (1h30) para o principal roteiro de vinho do país.",
        pontos: [{ nome: "Vinícolas Miolo e Casa Valduga", nota: "visita guiada, degustação e almoço harmonizado entre os parreirais" }, { nome: "Maria Fumaça", nota: "opcional: o trem histórico com música e vinho entre Bento e Garibaldi" }],
        restaurante: "Almoço na vinícola", restauranteNota: "menu harmonizado da Casa Valduga; peça o espumante método tradicional da casa" },
      { n: 4, titulo: "Parques e neve indoor", desc: "Dia de atrações temáticas — escolha conforme a idade do grupo e o humor do tempo.",
        pontos: [{ nome: "Snowland", nota: "a única estação de neve indoor da América Latina; esqui e trenó de verdade" }, { nome: "Le Jardin / Gramado Zoo", nota: "lavandário perfumado ou o zoo de conservação, ambos na estrada" }],
        restaurante: "Bördó", restauranteNota: "contemporâneo premiado; o cordeiro e a carta de vinhos gaúchos valem a reserva" },
      { n: 5, titulo: "Chocolate e compras", desc: "Última manhã para levar a serra na mala: malharias, cristais e chocolate artesanal.",
        pontos: [{ nome: "Rota do chocolate", nota: "Lugano, Prawer e Caracol; muitas oferecem visita à fábrica com degustação" }, { nome: "Av. Borges de Medeiros", nota: "malhas, couro e decoração; o comércio clássico de Gramado" }],
        restaurante: "Belle du Valais", restauranteNota: "raclete e fondue suíços num chalé; a despedida no clima de Alpes" },
    ],
  },
  chapada: {
    id: "chapada", breadcrumb: "Chapada Diamantina", tag: "Natureza · Bahia",
    titulo: "Chapada Diamantina em 5 dias",
    resumo: "Cachoeiras gigantes, grutas de água azul-safira e a trilha da Fumaça — aventura leve com base em Lençóis.",
    intro: "O interior da Bahia guarda cachoeiras gigantes, grutas de água azul-safira e trilhas para todos os fôlegos. Um roteiro de aventura leve, com base em Lençóis, para quem quer natureza de verdade sem abrir mão de uma boa cama e comida no fim do dia.",
    heroFoto: "mirante da Cachoeira da Fumaça",
    heroSrc: wiki("Cachoeira da Fumaça, Chapada Diamantina.jpg"),
    heroCredit: "Chapada Diamantina — Wikimedia Commons", heroCreditHref: "https://commons.wikimedia.org/wiki/Category:Chapada_Diamantina",
    preco: "R$ 940", ctaVoos: "Buscar voos para Lençóis", ctaTitulo: "A Chapada é para caminhar.",
    meta: [{ k: "Duração", v: "5 dias / 4 noites" }, { k: "Melhor época", v: "abr–out (seca, trilhas seguras)" }, { k: "Voo de GRU", v: "via SSA + estrada, ou voo a LEC" }, { k: "Base do roteiro", v: "Lençóis" }, { k: "Estilo", v: "aventura leve, trilhas" }],
    hospedagem: { texto: "Lençóis é a base natural: além do centro histórico e da Cachoeira do Serrano do dia 1, é de lá que saem as vans para os poços, a Fumaça e as grutas do resto do roteiro. No Vale do Capão, onde o dia 3 passa, também há pousadas simples para quem preferir dormir mais perto da trilha da Fumaça e fracionar a viagem em duas bases." },
    opt: {
      destName: "Salvador (SSA)", months: [1120, 1040, 980, 940, 960, 1010, 1180, 1090, 980, 1000, 1160, 1280],
      window: { label: "20 – 24 abr 2026", price: "R$ 940", save: "25%", note: "começo da estação seca: cachoeiras cheias e trilhas firmes" },
      sources: [{ name: "Aonde", price: "R$ 940", note: "tarifa encontrada pela nossa curadoria", best: true }, { name: "Google Flights", price: "R$ 1.012", note: "melhor tarifa encontrada" }, { name: "Kayak", price: "R$ 998" }, { name: "Skyscanner", price: "R$ 1.026" }],
    },
    dias: [
      { n: 1, titulo: "Lençóis, a base", desc: "Chegada à vila garimpeira mais charmosa da Chapada e um banho de rio para aquecer as pernas.",
        pontos: [{ nome: "Centro histórico de Lençóis", nota: "casario colonial, artesanato e a agência para fechar os passeios" }, { nome: "Cachoeira do Serrano e Salão de Areias", nota: "toboágua natural a 15 min a pé do centro" }],
        restaurante: "Cozinha Aberta (Deby & Rai)", restauranteNota: "menu autoral que reinventa a cozinha do sertão; reserve, são poucas mesas" },
      { n: 2, titulo: "Grutas de água azul", desc: "Dia dos poços iluminados por dentro — o horário do sol define o espetáculo, então saia cedo.",
        pontos: [{ nome: "Poço Azul", nota: "entre maio e setembro, ao meio-dia, um raio de sol acende a água" }, { nome: "Poço Encantado", nota: "o cartão-postal: água azul-safira translúcida numa caverna" }],
        restaurante: "Almoço em Andaraí", restauranteNota: "comida caseira baiana na estrada dos poços; galinha caipira e feijão de corda" },
      { n: 3, titulo: "Cachoeira da Fumaça", desc: "A trilha assinatura da Chapada: 6 km ida e volta até o mirante da 2ª maior queda do Brasil (340 m).",
        pontos: [{ nome: "Mirante da Fumaça", nota: "no Vale do Capão; a água vira névoa antes de tocar o chão" }, { nome: "Vale do Capão", nota: "a vila alternativa da Chapada, de energia hippie e boa comida" }],
        restaurante: "Pão de Beto (Vale do Capão)", restauranteNota: "pães e tortas de forno a lenha; o combustível certo pós-trilha" },
      { n: 4, titulo: "Poço do Diabo e Mucugezinho", desc: "Um dia mais leve, de cachoeira com salto e boia, para descansar as pernas.",
        pontos: [{ nome: "Poço do Diabo", nota: "queda com poço fundo e balanço de corda para os corajosos" }, { nome: "Rio Mucugezinho", nota: "sequência de piscininhas para boiar entre as pedras" }],
        restaurante: "Loralu (Lençóis)", restauranteNota: "pizzas de forno a lenha no quintal; a noite mais animada da vila" },
      { n: 5, titulo: "Gruta da Lapa Doce e Pratinha", desc: "Espeleologia tranquila de manhã e flutuação em água cristalina antes de voltar.",
        pontos: [{ nome: "Gruta da Lapa Doce", nota: "quilômetros de salões com estalactites, guiado à luz de lampião" }, { nome: "Pratinha", nota: "rio de água azul saindo da gruta; snorkel e tirolesa no mesmo lugar" }],
        restaurante: "Restaurante da Pratinha", restauranteNota: "peixe e petiscos à beira do rio azul; o último mergulho antes da estrada" },
    ],
  },
  foz: {
    id: "foz", breadcrumb: "Foz do Iguaçu", tag: "Natureza · Paraná",
    titulo: "Foz do Iguaçu em 4 dias (3 países)",
    resumo: "As Cataratas pelos dois lados, Itaipu, o Parque das Aves e a chance de pisar em três países num só dia.",
    intro: "Uma das sete maravilhas naturais do mundo em dose dupla: as Cataratas pelos lados brasileiro e argentino, a usina de Itaipu, o Parque das Aves e a chance de pisar em três países em um só dia. Compacto, impressionante e ótimo para famílias.",
    heroFoto: "Garganta do Diabo nas Cataratas do Iguaçu",
    heroSrc: wiki("Cataratas do Iguaçu, Paraná.jpg"),
    heroCredit: "Cataratas do Iguaçu — Wikimedia Commons", heroCreditHref: "https://commons.wikimedia.org/wiki/Category:Iguazu_Falls",
    preco: "R$ 720", ctaVoos: "Buscar voos para Foz", ctaTitulo: "As Cataratas são inesquecíveis.",
    meta: [{ k: "Duração", v: "4 dias / 3 noites" }, { k: "Melhor época", v: "ano todo (evite feriados)" }, { k: "Voo de GRU", v: "1h30 direto" }, { k: "Base do roteiro", v: "av. das Cataratas" }, { k: "Estilo", v: "natureza + família" }],
    hospedagem: { texto: "A avenida das Cataratas concentra a maior parte da hospedagem e fica a poucos minutos do parque nacional brasileiro do dia 1. Para o lado argentino e para Itaipu, nos dias 2 e 3, ainda assim é melhor contar com transfer ou carro: são outro país e outra represa, não dá pra ir a pé de lugar nenhum." },
    opt: {
      destName: "Foz do Iguaçu (IGU)", months: [980, 900, 760, 720, 740, 700, 880, 760, 720, 760, 860, 1040],
      window: { label: "9 – 12 jun 2026", price: "R$ 700", save: "27%", note: "terça a sexta, longe de feriado — as Cataratas mais vazias" },
      sources: [{ name: "Aonde", price: "R$ 700", note: "tarifa encontrada pela nossa curadoria", best: true }, { name: "Google Flights", price: "R$ 768", note: "melhor tarifa encontrada" }, { name: "Kayak", price: "R$ 752" }, { name: "Skyscanner", price: "R$ 779" }],
    },
    dias: [
      { n: 1, titulo: "Cataratas — lado brasileiro", desc: "A trilha panorâmica que abre a vista completa e termina encharcado na Garganta do Diabo.",
        pontos: [{ nome: "Trilha das Cataratas", nota: "1,2 km de mirantes com o panorama aberto dos saltos" }, { nome: "Macuco Safari", nota: "bote que entra embaixo das quedas; leve capa e câmera à prova d'água" }],
        restaurante: "Porto Canoas", restauranteNota: "buffet dentro do parque, com deck sobre o rio Iguaçu; almoço com vista das corredeiras" },
      { n: 2, titulo: "Cataratas — lado argentino", desc: "O lado das passarelas: você caminha por cima e por dentro das quedas. Reserve o dia inteiro.",
        pontos: [{ nome: "Garganta del Diablo", nota: "trem ecológico + passarela até a borda do maior salto; ensurdecedor" }, { nome: "Circuitos Superior e Inferior", nota: "passarelas que cercam dezenas de quedas menores" }],
        restaurante: "Parrilla em Puerto Iguazú", restauranteNota: "bife de chorizo e provoleta do outro lado da fronteira; leve pesos ou cartão" },
      { n: 3, titulo: "Itaipu e as Três Fronteiras", desc: "A engenharia gigante de dia ou iluminada à noite, e o pôr do sol no encontro dos três países.",
        pontos: [{ nome: "Usina de Itaipu", nota: "circuito panorâmico; a versão iluminada à noite é o destaque" }, { nome: "Marco das Três Fronteiras", nota: "Brasil, Argentina e Paraguai num só olhar, com show ao pôr do sol" }],
        restaurante: "Búfalo Branco", restauranteNota: "o rodízio de carnes mais tradicional de Foz; mais de 30 cortes e buffet completo" },
      { n: 4, titulo: "Parque das Aves e compras", desc: "Manhã imersiva entre tucanos e araras, ao lado das Cataratas, antes do voo.",
        pontos: [{ nome: "Parque das Aves", nota: "viveiros que você atravessa por dentro; reabilitação de aves da Mata Atlântica" }, { nome: "Compras no Paraguai (opcional)", nota: "Ciudad del Este para eletrônicos; leve documento e atenção à cota" }],
        restaurante: "Vila Yá", restauranteNota: "cozinha regional em casa charmosa; peça o surubim e o chipa paraguaio" },
    ],
  },
  jeri: {
    id: "jeri", breadcrumb: "Jericoacoara", tag: "Praia · Ceará",
    titulo: "Jericoacoara em 5 dias",
    resumo: "Dunas, lagoas com redes dentro d'água, Pedra Furada e o pôr do sol que virou ritual na vila de areia.",
    intro: "A vila de ruas de areia dentro de um parque nacional: dunas para escorregar, lagoas de água doce com redes dentro d'água, kitesurf de nível mundial e o pôr do sol na duna que virou ritual. Rústica no melhor sentido — e mágica ao entardecer.",
    heroFoto: "pôr do sol na Duna do Pôr do Sol, Jericoacoara",
    heroSrc: wiki("Jericoacoara, Ceará.jpg"),
    heroCredit: "Jericoacoara — Wikimedia Commons", heroCreditHref: "https://commons.wikimedia.org/wiki/Category:Jericoacoara",
    preco: "R$ 1.120", ctaVoos: "Buscar voos para Jericoacoara", ctaTitulo: "Jeri é sobre desacelerar.",
    meta: [{ k: "Duração", v: "5 dias / 4 noites" }, { k: "Melhor época", v: "jul–fev (vento p/ kite jul–jan)" }, { k: "Voo de GRU", v: "via FOR + transfer, ou voo a JJD" }, { k: "Base do roteiro", v: "vila de Jeri" }, { k: "Estilo", v: "praia + aventura" }],
    hospedagem: { texto: "Dentro da vila de Jeri, sem carro nem asfalto, tudo é a pé ou de bugue — inclusive a subida diária à Duna do Pôr do Sol. É a única base que faz sentido: os passeios de leste (Tatajuba) e de oeste (Mangue Seco, Guriú) já saem de lá de bugue, então hospedar-se fora da vila só soma deslocamento." },
    opt: {
      destName: "Fortaleza (FOR)", months: [1180, 1120, 980, 1020, 1060, 1140, 1360, 1240, 1060, 1120, 1280, 1320],
      window: { label: "10 – 14 mar 2026", price: "R$ 980", save: "26%", note: "fim do verão, praia cheia de sol e preços já mais baixos" },
      sources: [{ name: "Aonde", price: "R$ 980", note: "tarifa encontrada pela nossa curadoria", best: true }, { name: "Google Flights", price: "R$ 1.052", note: "melhor tarifa encontrada" }, { name: "Kayak", price: "R$ 1.038" }, { name: "Skyscanner", price: "R$ 1.066" }],
    },
    dias: [
      { n: 1, titulo: "A vila e a Duna do Pôr do Sol", desc: "Transfer 4x4 desde Fortaleza (4h) e a subida obrigatória à duna para o primeiro pôr do sol.",
        pontos: [{ nome: "Ruas de areia de Jeri", nota: "sem asfalto e sem carro; a vida acontece a pé, de bike ou de bugue" }, { nome: "Duna do Pôr do Sol", nota: "todo mundo sobe no fim da tarde; aplausos quando o sol some no mar" }],
        restaurante: "Tamboo", restauranteNota: "mesas na areia com o mar de fundo; frutos do mar e drinks ao som do vento" },
      { n: 2, titulo: "Lagoas do Paraíso e Azul", desc: "O passeio mais fotografado de Jeri: redes dentro da água doce e o dia inteiro de day use.",
        pontos: [{ nome: "Lagoa do Paraíso", nota: "as redes e balanços dentro da água azul-turquesa; chegue cedo" }, { nome: "Lagoa Azul", nota: "mais tranquila, ótima para o fim da tarde longe da multidão" }],
        restaurante: "Rancho do Peixe (day use)", restauranteNota: "à beira da lagoa; peixe grelhado e a rede esperando depois do almoço" },
      { n: 3, titulo: "Leste: Tatajuba e Pedra Furada", desc: "Passeio de bugue pelas dunas móveis até a lagoa escondida e o arco de pedra, cartão-postal de Jeri.",
        pontos: [{ nome: "Pedra Furada", nota: "o arco natural na praia; só acessível na maré baixa, confira o horário" }, { nome: "Duna e Lagoa de Tatajuba", nota: "tirolesa que joga você na lagoa e a duna móvel gigante" }],
        restaurante: "Barraca de Tatajuba", restauranteNota: "camarão na moranga e caranguejo na beira da lagoa; simples e fresquíssimo" },
      { n: 4, titulo: "Oeste: Mangue Seco e Guriú", desc: "Travessia de balsa e cavalos, o santuário de cavalos-marinhos e o vilarejo de pescadores.",
        pontos: [{ nome: "Cavalos-marinhos do Guriú", nota: "passeio de caiaque no mangue com guia local para vê-los de perto" }, { nome: "Árvore da Preguiça", nota: "a árvore deitada sobre a água virou o point da foto e do banho" }],
        restaurante: "Restaurante no Preá", restauranteNota: "peixada e moqueca na praia vizinha, a capital cearense do kite" },
      { n: 5, titulo: "Kitesurf ou dia de rede", desc: "Aula de kite na Preá (vento garantido de jul a jan) ou simplesmente um dia sem plano.",
        pontos: [{ nome: "Aula de kitesurf", nota: "a Preá tem vento constante e escolas com instrutores brasileiros" }, { nome: "Manhã livre na vila", nota: "café da manhã longo, feirinha de artesanato e última rede no mar" }],
        restaurante: "Naturalmente (crepe na duna)", restauranteNota: "a barraca de crepes na Duna do Pôr do Sol; o encerramento doce da viagem" },
    ],
  },
  buenosaires: {
    id: "buenosaires", breadcrumb: "Buenos Aires", tag: "Cidade · Argentina",
    titulo: "Buenos Aires em 5 dias",
    resumo: "Tango, parrillas e cafés centenários entre Recoleta, San Telmo e Palermo — o clássico portenho, sem pressa.",
    intro: "A capital que os brasileiros amam voltar: tango e livrarias, parrillas e cafés centenários, bairros para caminhar sem pressa e o câmbio que costuma jogar a favor. Um clássico da América do Sul, com voo direto e sem visto.",
    heroFoto: "casario colorido do Caminito, La Boca",
    heroSrc: wiki("Caminito, La Boca, Buenos Aires.jpg"),
    heroCredit: "Buenos Aires — Wikimedia Commons", heroCreditHref: "https://commons.wikimedia.org/wiki/Category:Caminito",
    preco: "R$ 1.480", ctaVoos: "Buscar voos para Buenos Aires", ctaTitulo: "Buenos Aires nunca cansa.",
    meta: [{ k: "Duração", v: "5 dias / 4 noites" }, { k: "Melhor época", v: "mar–mai e set–nov" }, { k: "Voo de GRU", v: "2h50 direto" }, { k: "Base do roteiro", v: "Palermo ou Recoleta" }, { k: "Estilo", v: "cidade + gastronomia" }],
    hospedagem: { texto: "Palermo entrega os bares e as lojas de design do dia 3 a pé e fica perto do metrô; Recoleta é mais central para o Centro Histórico do dia 1 e para o Cemitério do dia 2. Das duas, La Boca e o passeio a Tigre, que ficam nas pontas do roteiro, pedem táxi ou trem de qualquer jeito." },
    opt: {
      destName: "Buenos Aires (EZE)", months: [1720, 1640, 1420, 1380, 1460, 1620, 1840, 1700, 1480, 1520, 1660, 1880],
      window: { label: "13 – 17 abr 2026", price: "R$ 1.380", save: "27%", note: "outono portenho, clima ameno e cidade em ritmo normal" },
      sources: [{ name: "Aonde", price: "R$ 1.380", note: "tarifa encontrada pela nossa curadoria", best: true }, { name: "Google Flights", price: "R$ 1.472", note: "melhor tarifa encontrada" }, { name: "Kayak", price: "R$ 1.451" }, { name: "Skyscanner", price: "R$ 1.489" }],
    },
    dias: [
      { n: 1, titulo: "Centro histórico", desc: "Comece pelo coração cívico da cidade, entre praças, a Casa Rosada e o café mais famoso do país.",
        pontos: [{ nome: "Plaza de Mayo e Casa Rosada", nota: "a sacada dos discursos e a catedral onde o Papa Francisco foi cardeal" }, { nome: "Avenida de Mayo", nota: "arquitetura art nouveau até o Congresso; pare no Café Tortoni" }],
        restaurante: "Café Tortoni", restauranteNota: "aberto desde 1858; chocolate quente com churros no salão de vitrais — vá fora do pico" },
      { n: 2, titulo: "Recoleta e San Telmo", desc: "Da elegância da Recoleta à boemia antiquária de San Telmo (imperdível se cair num domingo).",
        pontos: [{ nome: "Cemitério da Recoleta", nota: "mausoléus monumentais, incluindo o de Evita; um museu a céu aberto" }, { nome: "Feira de San Telmo", nota: "domingo: antiguidades, tango na rua e a Plaza Dorrego lotada" }],
        restaurante: "El Desnivel", restauranteNota: "parrilla sem frescura em San Telmo; bife de chorizo, batata e vinho da casa" },
      { n: 3, titulo: "Palermo", desc: "O bairro mais gostoso de caminhar: parques, arte moderna e as melhores lojas e bares da cidade.",
        pontos: [{ nome: "Bosques de Palermo e MALBA", nota: "os jardins e o museu de arte latino-americana num só passeio" }, { nome: "Palermo Soho", nota: "ruas arborizadas de lojas de design, cafés de especialidade e bares" }],
        restaurante: "Don Julio", restauranteNota: "a parrilla mais premiada de BA; reserve com semanas de antecedência e peça o ojo de bife" },
      { n: 4, titulo: "La Boca e Puerto Madero", desc: "Do bairro mais colorido e futebolístico à orla mais moderna, reformada nas antigas docas.",
        pontos: [{ nome: "Caminito e La Bombonera", nota: "o beco de casas coloridas e o estádio do Boca; visite de dia e em grupo" }, { nome: "Puerto Madero", nota: "passeio à beira d'água pela Ponte da Mulher, de Calatrava" }],
        restaurante: "Parrilla em Puerto Madero", restauranteNota: "jantar à beira da água com carta de Malbec; peça o cordeiro patagônico" },
      { n: 5, titulo: "Tigre ou compras", desc: "Escape ao delta de trem para fechar leve, ou dedique a manhã às compras de couro e vinho.",
        pontos: [{ nome: "Delta do Tigre", nota: "trem suburbano + passeio de barco entre as casas sobre a água" }, { nome: "Av. Santa Fe", nota: "couro, calçados e vinho a preço bom; a rua de compras dos brasileiros" }],
        restaurante: "Café portenho de despedida", restauranteNota: "medialunas e submarino (chocolate no leite quente) antes do aeroporto" },
    ],
  },
};

// Todos os guias: os 10 editoriais-base + os 12 escritos pelos agentes de
// turismo (um por regiao). Ver src/render/moreGuides.js.
export const GUIDES = { ...BASE_GUIDES, ...EXTRA_GUIDES };

// Ordem dos cards de guia na home / listagem: base primeiro, depois os novos
// destinos agrupados por regiao (Nordeste, Sudeste/Sul, Centro-Oeste/Norte,
// America do Sul).
export const GUIDE_LIST = [
  "portodegalinhas", "salvador", "noronha", "rio", "bariloche",
  "chapada", "foz", "jeri", "buenosaires", "gramado",
  "maceio", "lencois", "trancoso",
  "ouropreto", "florianopolis", "paraty",
  "bonito", "veadeiros", "manaus",
  "cusco", "atacama", "montevideu",
].map((id) => GUIDES[id]);

// Coordenadas (lat/lng) dos destinos dos guias, para os pins do mapa-múndi
// (Google Maps JS API). Aproximadas ao centro/cartão-postal do destino.
const BASE_COORDS = {
  portodegalinhas: { lat: -8.5085, lng: -35.0053 },
  salvador: { lat: -12.9714, lng: -38.5014 },
  noronha: { lat: -3.8549, lng: -32.4238 },
  rio: { lat: -22.9068, lng: -43.1729 },
  bariloche: { lat: -41.1335, lng: -71.3103 },
  gramado: { lat: -29.3789, lng: -50.876 },
  chapada: { lat: -12.5605, lng: -41.3903 },
  foz: { lat: -25.6953, lng: -54.4367 },
  jeri: { lat: -2.7936, lng: -40.5137 },
  buenosaires: { lat: -34.6037, lng: -58.3816 },
};

// Coordenadas de todos os destinos: base + as que cada guia novo traz em `coords`.
export const GUIDE_COORDS = Object.fromEntries([
  ...Object.entries(BASE_COORDS),
  ...Object.values(EXTRA_GUIDES)
    .filter((g) => g && g.coords)
    .map((g) => [g.id, g.coords]),
]);

// Mes mais barato de um guia (menor valor no otimizador), p/ o selo "melhor
// preço em <mes>" nos cards.
export function melhorMesDoGuia(guide) {
  const m = guide && guide.opt && Array.isArray(guide.opt.months) ? guide.opt.months : null;
  if (!m || !m.length) return "";
  return MONTH_NAMES[m.indexOf(Math.min(...m))];
}
