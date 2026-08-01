// Testes das novas paginas portadas do prototipo: home, detalhe de oferta e
// guia/roteiro editorial. Puros (sem rede).

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  renderHomePage,
  renderOfferPage,
  renderGuidePage,
  renderGuidesIndexPage,
  renderResultsPage,
  renderMapPage,
} from "../src/render/htmlRenderer.js";
import { OFFERS as CONTENT_OFFERS, GUIDES, GUIDE_LIST } from "../src/render/aondeContent.js";

function isDoc(html) {
  return html.trimStart().toLowerCase().startsWith("<!doctype html>") && /<title>[^<]+<\/title>/.test(html);
}

// --- Home ---

test("renderHomePage e um documento completo com hero e navegacao", () => {
  const html = renderHomePage({});
  assert.ok(isDoc(html), "deve ser documento HTML com titulo");
  assert.ok(html.includes("Aonde você quer"), "deve conter o titulo do hero");
  assert.ok(html.includes("Ofertas da semana"), "deve conter a secao de ofertas");
  assert.ok(html.includes("5 dias, dia a dia"), "deve conter a secao de roteiros");
});

test("renderHomePage sem ofertas ao vivo usa a curadoria editorial", () => {
  const html = renderHomePage({ offers: [] });
  // Cards de guia linkam para /guias/:id
  assert.ok(/href="\/guias\/salvador"/.test(html), "deve linkar guias editoriais");
  assert.ok(/href="\/ofertas\/[a-z-]+"/.test(html), "cards de oferta linkam para o detalhe");
});

test("renderHomePage alimentada por ofertas ao vivo mostra o preco formatado", () => {
  const live = [{
    id: "gru-rec", origem: "GRU", destino: "REC", cidade: "Recife", tipo: "Nacional",
    cia: "GOL", preco_centavos: 47900, media_centavos: 92000, desconto_pct: 48,
    is_erro_tarifa: false, datas_sugeridas: "12–24 out", status: "publicada",
  }];
  const html = renderHomePage({ offers: live });
  assert.ok(html.includes("R$ 479"), "deve conter o preco ao vivo formatado");
  assert.ok(html.includes("48% abaixo da média"), "deve conter o badge de desconto");
});

// --- Detalhe de oferta ---

test("renderOfferPage mostra preco, economia e CTA de afiliado", () => {
  const offer = CONTENT_OFFERS.find((o) => o.id === "gru-lis");
  const related = CONTENT_OFFERS.filter((o) => o.id !== offer.id && o.tipo === offer.tipo).slice(0, 3);
  const html = renderOfferPage(offer, { related });
  assert.ok(isDoc(html), "documento completo");
  assert.ok(html.includes("R$ 1.847"), "deve conter o preco");
  assert.ok(html.includes("Datas com o preço disponível"), "deve listar datas flexiveis");
  assert.ok(html.includes("Antes de comprar"), "deve trazer as dicas");
  assert.ok(html.includes("Outras ofertas parecidas"), "deve trazer relacionadas");
  // Oferta editorial (sem affiliate_url): o CTA leva a busca de voos da rota
  // (honesto — nao finge ir a um parceiro inexistente), nunca a uma rota POST-only.
  assert.ok(/href="\/resultados\?origem=/.test(html), "CTA leva à busca de voos da rota");
  assert.ok(!/href="\/api\/offers\/[^"]*\/click"/.test(html), "CTA nunca aponta para rota POST-only");
});

test("renderOfferPage de oferta AO VIVO leva ao interstitial /saida (com tracking)", () => {
  const live = {
    id: "gru-rec", origem: "GRU", destino: "REC", cidade: "Recife", tipo: "Nacional",
    cia: "GOL", preco_centavos: 47900, media_centavos: 92000, is_erro_tarifa: false,
    datas_sugeridas: "12–24 out", affiliate_url: "https://tp.media/r?p=gru-rec", status: "publicada",
  };
  const html = renderOfferPage(live, {});
  assert.ok(html.includes('href="/saida/gru-rec"'), "CTA passa pela página de saída");
  // O buy-box nao afirma mais "12x sem juros" como se fosse condicao do Aonde.
  // Quem processa o pagamento e sempre o parceiro — o proprio FAQ diz isso.
  assert.match(html, /Parcelamento e desconto no Pix variam conforme o parceiro/, "condicao de pagamento atribuida ao parceiro");
  assert.doesNotMatch(html, /Em até <strong>12x sem juros<\/strong>/, "nao prometer parcelamento que nao controlamos");
  assert.ok(html.includes("Você paga direto no site oficial"), "bloco de confiança perto do CTA");
});

test("renderOfferPage aceita o shape de producao (centavos)", () => {
  const live = {
    id: "gru-rec", origem: "GRU", destino: "REC", cidade: "Recife", tipo: "Nacional",
    cia: "GOL", preco_centavos: 47900, media_centavos: 92000, economia_centavos: 44100,
    is_erro_tarifa: true, datas_sugeridas: "12–24 out",
    affiliate_url: "https://tp.media/r?p=gru-rec", status: "publicada",
  };
  const html = renderOfferPage(live, {});
  assert.ok(html.includes("R$ 479"), "preco formatado de centavos");
  assert.ok(html.includes("Erro de tarifa"), "badge de erro de tarifa");
  assert.ok(html.includes("você economiza R$ 441"), "economia formatada");
});

// --- Guia / roteiro editorial ---

test("renderGuidePage monta o roteiro dia a dia com otimizador", () => {
  const html = renderGuidePage("salvador");
  assert.ok(isDoc(html), "documento completo");
  assert.ok(html.includes("Salvador em 5 dias"), "titulo do guia");
  assert.ok(html.includes("O roteiro, dia a dia"), "secao do roteiro");
  assert.ok(html.includes("Onde comer"), "bloco de restaurante do dia");
  assert.ok(html.includes("Quando ir e por quanto"), "otimizador de datas");
  assert.ok(html.includes("Na prática"), "sidebar de meta");
});

test("renderGuidePage tem o círculo das estações (SVG) com meses e estações", () => {
  const html = renderGuidePage("salvador");
  assert.ok(html.includes("season-ring"), "deve ter o círculo das estações");
  assert.ok(html.includes("<path"), "o anel é desenhado com arcos SVG");
  for (const s of ["Verão", "Outono", "Inverno", "Primavera"]) {
    assert.ok(html.includes(s), `deve rotular a estação ${s}`);
  }
  for (const m of ["Jan", "Jul", "Dez"]) {
    assert.ok(html.includes(`>${m}<`), `deve ter o mês ${m} no anel`);
  }
});

test("renderGuidePage usa o Google Maps no dia a dia (rota do dia + restaurante) e estilo próprio no mini-mapa", () => {
  const html = renderGuidePage("salvador");
  // "Ver o dia no Google Maps" -> rota (Maps URLs API, sem chave)
  assert.ok(html.includes("Ver o dia no Google Maps"), "link de rota do dia");
  assert.ok(html.includes("https://www.google.com/maps/dir/"), "rota do Google Maps com os pontos");
  // restaurante vira link de busca no Google Maps (o & sai escapado como &amp;)
  assert.ok(html.includes("https://www.google.com/maps/search/?api=1&amp;query="), "restaurante linka o Google Maps");
  // mini-mapa com chave aplica o estilo próprio e o pin da marca
  const comChave = renderGuidePage("salvador", { apiKey: "KMAP" });
  assert.ok(comChave.includes("styles:"), "mini-mapa aplica estilo próprio");
  assert.ok(comChave.includes("data:image/svg+xml"), "pin customizado (data URI)");
});

test("renderGuidePage tem a seção 'Onde ficar' com a base e CTA de hospedagem", () => {
  const html = renderGuidePage("salvador");
  assert.ok(html.includes("Onde ficar"), "seção de hospedagem");
  assert.ok(html.includes("Ver hospedagem em"), "CTA de hospedagem");
  assert.ok(/href="https:\/\/search\.hotellook\.com/.test(html), "busca de hospedagem no parceiro");
  // usa a 'Base do roteiro' do meta do guia (Salvador: Barra ou Rio Vermelho)
  assert.ok(html.includes("Barra ou Rio Vermelho"), "cita a base do roteiro");
});

test("renderGuidePage tem datas clicáveis para reservar", () => {
  const html = renderGuidePage("salvador");
  assert.ok(html.includes("Datas para viajar"), "seção de datas");
  assert.ok(html.includes("Reservar estas datas"), "CTA de reserva");
  assert.ok(/href="\/resultados\?destino=/.test(html), "CTA leva ao fluxo de voos com o destino");
  assert.ok(html.includes("melhor preço"), "destaca a melhor janela");
});

test("renderGuidePage embute o mini-mapa do Google quando há chave", () => {
  const semChave = renderGuidePage("salvador");
  assert.ok(semChave.includes("Ver no mapa-múndi"), "sem chave: fallback com link para /mapa");
  assert.ok(!semChave.includes("maps.googleapis.com"), "sem chave: não carrega o Maps");
  const comChave = renderGuidePage("salvador", { apiKey: "KMAP" });
  assert.ok(comChave.includes('id="guia-map"'), "com chave: container do mapa");
  assert.ok(comChave.includes("callback=aondeGuiaMap"), "com chave: init do mini-mapa");
  assert.ok(comChave.includes("key=KMAP"), "com chave: usa a chave");
});

test("datas de viagem usam ano dinâmico (nunca no passado)", () => {
  const html = renderGuidePage("salvador");
  const now = new Date();
  // Salvador: melhor janela em março; o ano exibido é o próximo em que março ocorre.
  const marYear = 2 >= now.getMonth() ? now.getFullYear() : now.getFullYear() + 1;
  assert.ok(html.includes(`mar ${marYear}`), `deve exibir março de ${marYear}`);
  assert.ok(!html.includes(`mar ${marYear - 1}`), "não pode exibir março do ano anterior (data no passado)");
});

test("renderGuidePage com id invalido cai para a home sem quebrar", () => {
  const html = renderGuidePage("nao-existe");
  assert.ok(isDoc(html), "ainda retorna um documento valido");
});

// --- Resultados de voo ---

test("renderResultsPage monta a lista de voos com melhor preco e Pix", () => {
  const html = renderResultsPage();
  assert.ok(isDoc(html), "documento completo");
  assert.ok(html.includes("voos de exemplo"), "contador de voos");
  assert.ok(html.includes("MELHOR PREÇO"), "destaque do melhor preço");
  assert.ok(html.includes("Filtrar resultados"), "sidebar de filtros");
  // O banner nao promete mais "5% de desconto" como fato: quem decide o
  // desconto do Pix e o parceiro, nao o Aonde. O que precisa continuar la e a
  // MENCAO ao Pix, com a ressalva de quem manda nela.
  assert.ok(html.includes("Pix"), "banner de Pix");
  assert.match(html, /parceiro/, "o banner precisa dizer de quem e a condicao");
  assert.doesNotMatch(html, /todos os preços acima ganham/, "nao prometer desconto que nao controlamos");
  assert.ok(html.replace(/onerror="[^"]*"/g, "").match(/\bundefined\b/) === null, "sem undefined");
});

test("renderResultsPage aceita voos e rota customizados", () => {
  const html = renderResultsPage({
    rota: { origem: "GRU", destino: "SSA", resumo: "1 – 8 set" },
    voos: [{ cia: "Azul", numero: "AD 1", saida: "08:00", chegada: "10:20", duracao: "2h20", paradas: "Direto", direto: true, preco: "R$ 874", parcela: "R$ 72,83", melhor: true }],
  });
  assert.ok(html.includes("R$ 874"), "usa o preço fornecido");
  assert.ok(html.includes(">SSA<") || html.includes("SSA"), "usa o destino fornecido");
  assert.ok(html.includes("1 voos de exemplo"), "conta os voos fornecidos");
});

// --- Mapa (Google Maps) ---

test("renderMapPage sem chave cai para a lista clicavel de destinos", () => {
  const html = renderMapPage({ apiKey: "" });
  assert.ok(isDoc(html), "documento completo");
  assert.ok(!html.includes("maps.googleapis.com"), "nao carrega a Maps API sem chave");
  // A mensagem de fallback agora fala com o VISITANTE, nao com o programador:
  // "defina GOOGLE_MAPS_API_KEY (e ative a Maps JavaScript API)" era instrucao
  // de configuracao interna exibida para quem entrou no site para viajar.
  assert.doesNotMatch(html, /GOOGLE_MAPS_API_KEY/, "nome de variavel de ambiente na tela do usuario");
  assert.match(html, /mapa interativo ainda não está disponível/i, "explica a ausencia em portugues comum");
  assert.ok(/href="\/guias\/salvador"[^>]*data-dest=/.test(html), "lista destinos linkando os guias");
});

test("renderMapPage com chave injeta o loader e os dados dos pins", () => {
  const html = renderMapPage({ apiKey: "DUMMY_KEY_123" });
  assert.ok(html.includes("maps.googleapis.com/maps/api/js"), "carrega a Maps JavaScript API");
  assert.ok(html.includes("key=DUMMY_KEY_123"), "usa a chave fornecida");
  assert.ok(html.includes("callback=aondeInitMap"), "usa o callback de init");
  assert.ok(html.includes("AONDE_DESTINOS"), "embute os dados dos destinos");
  assert.ok(html.includes('"lat"') && html.includes('"lng"'), "coordenadas nos pins");
});

test("renderMapPage nao vaza a chave em HTML nem quebra o script", () => {
  const html = renderMapPage({ apiKey: "abc&def" });
  // a chave vai encodada na URL do loader
  assert.ok(html.includes("key=abc%26def"), "chave escapada na URL");
  assert.ok(!/<\/script>\s*<\/script>/.test(html), "sem script vazio/quebrado");
});

test("todos os guias editoriais renderizam sem undefined/null", () => {
  for (const id of Object.keys(GUIDES)) {
    const html = renderGuidePage(id).replace(/onerror="[^"]*"/g, "");
    assert.ok(!/\bundefined\b/.test(html), `guia ${id}: contém "undefined"`);
    assert.ok(!/\bnull\b/.test(html), `guia ${id}: contém "null"`);
  }
});

test("há os 22 guias (10 base + 12 dos agentes) e todos entram no índice", () => {
  assert.equal(Object.keys(GUIDES).length, 22, "22 guias no total");
  assert.equal(GUIDE_LIST.length, 22, "todos na listagem");
  const html = renderGuidesIndexPage();
  assert.ok(isDoc(html), "índice é documento completo");
  // Uma amostra dos destinos novos deve aparecer, linkando o guia.
  for (const id of ["maceio", "cusco", "bonito", "paraty", "montevideu"]) {
    assert.ok(html.includes(`/guias/${id}`), `índice deve linkar ${id}`);
  }
});
