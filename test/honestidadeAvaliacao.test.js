// Testes nascidos da avaliacao de julho (10 avaliadores). Cada um existe
// porque o site AFIRMAVA alguma coisa que o codigo nao sustentava.
// Ver docs/AVALIACAO-2026-07.md.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  renderHomePage,
  renderResultsPage,
  renderGuidePage,
  renderGuidesIndexPage,
  renderOfferPage,
  renderOffersPage,
  renderMapPage,
  pageStylesCss,
} from "../src/render/htmlRenderer.js";
import { OFFERS, GUIDES, formatRelativePublicado } from "../src/render/aondeContent.js";
import { resolveAeroporto } from "../src/render/aeroportos.js";
import { buildOfferProduct } from "../src/render/structuredData.js";

// ---------------------------------------------------------------------------
// Urgencia fabricada e superlativo
// ---------------------------------------------------------------------------

test("nenhuma oferta finge urgencia que o codigo nao sustenta", () => {
  // "Preco encontrado as 9h de hoje — tarifas assim somem em horas" era uma
  // string ESTATICA, exibida ao lado de "publicado ha 6 dias" na mesma dobra.
  const proibido = [
    /somem em horas/i,
    /encontrado às \d+h de hoje/i,
    /últimas? \d+ (vagas?|lugares?)/i,
    /corre que (vai )?acaba/i,
    /só hoje/i,
  ];
  for (const o of OFFERS) {
    const txt = [o.texto, ...(o.dicas || [])].join(" ");
    for (const re of proibido) {
      assert.doesNotMatch(txt, re, `oferta ${o.id} usa urgencia fabricada: ${re}`);
    }
  }
});

test("nenhuma oferta faz alegacao superlativa que nao da para provar", () => {
  const proibido = [/somos o melhor preço/i, /o menor preço do brasil/i, /imbatível/i, /o mais barato do mercado/i];
  for (const o of OFFERS) {
    for (const re of proibido) {
      assert.doesNotMatch(String(o.texto || ""), re, `oferta ${o.id}: alegacao insustentavel ${re}`);
    }
  }
});

// ---------------------------------------------------------------------------
// Tempo relativo
// ---------------------------------------------------------------------------

test("o tempo decorrido nunca e arredondado para cima", () => {
  // round() INVENTAVA tempo: 6,6 dias virava "ha mais de uma semana" (falso).
  const atras = (ms) => new Date(Date.now() - ms).toISOString();
  assert.equal(formatRelativePublicado(atras(6.6 * 86400000)), "há 6 dias");
  assert.equal(formatRelativePublicado(atras(6.99 * 86400000)), "há 6 dias");
  assert.equal(formatRelativePublicado(atras(7.1 * 86400000)), "há mais de uma semana");
  assert.equal(formatRelativePublicado(atras(23.9 * 3600000)), "há 23 horas");
  assert.equal(formatRelativePublicado(atras(59.9 * 60000)), "há 59 minutos");
});

// ---------------------------------------------------------------------------
// Promessas condicionais
// ---------------------------------------------------------------------------

test("a home so promete WhatsApp quando ha WhatsApp configurado", () => {
  // Sem AONDE_WHATSAPP, esta era a unica frase do site que prometia
  // atendimento por WhatsApp mesmo assim.
  const h = renderHomePage();
  if (!h.includes("wa.me")) {
    assert.doesNotMatch(
      h,
      /Atendimento humano por WhatsApp/,
      "prometeu WhatsApp sem ter WhatsApp configurado"
    );
  }
});

test("parcelamento e Pix nao sao apresentados como garantia do Aonde", () => {
  // Quem processa o pagamento e sempre o parceiro — o proprio FAQ diz isso.
  const h = renderHomePage();
  assert.doesNotMatch(h, /No Aonde o valor já inclui 12x sem juros/i);
  if (/12x/.test(h)) {
    assert.match(h, /conforme o parceiro|no parceiro|dos parceiros/i,
      "se cita 12x, precisa deixar claro que a condicao e do parceiro");
  }
});

test("o otimizador de datas nao afirma monitoramento diario que nao existe", () => {
  // O bloco se contradizia: manchete dizia "monitoramos todos os dias" e
  // "atualizados nas ultimas 24h"; o rodape do MESMO bloco admitia coleta
  // manual que "pode nao refletir o preco agora".
  const g = GUIDES[Object.keys(GUIDES)[0]];
  const h = renderGuidePage(g);
  assert.doesNotMatch(h, /Monitoramos as tarifas/i);
  assert.doesNotMatch(h, /atualizados nas últimas 24h/i);
});

// ---------------------------------------------------------------------------
// Dado estruturado
// ---------------------------------------------------------------------------

test("o JSON-LD nao anuncia preco garantido sem preco garantido", () => {
  const semLink = buildOfferProduct({ cidade: "Lisboa", preco: "R$ 1.847", href: "/ofertas/a" });
  assert.equal(semLink.offers, undefined, "sem link de afiliado nao ha preco garantido");

  const erro = buildOfferProduct({
    cidade: "Recife", preco: "R$ 587", href: "/ofertas/b",
    affiliateUrl: "https://parceiro.exemplo/x", erro: true,
  });
  assert.equal(erro.offers, undefined, "erro de tarifa nao pode virar InStock");
});

// ---------------------------------------------------------------------------
// Busca de rota: entender ou avisar, nunca adivinhar em silencio
// ---------------------------------------------------------------------------

test("nome de cidade vira o aeroporto certo", () => {
  assert.equal(resolveAeroporto("Porto Alegre"), "POA");
  assert.equal(resolveAeroporto("porto alegre"), "POA");
  assert.equal(resolveAeroporto("Sao Paulo"), "GRU");
  assert.equal(resolveAeroporto("São Paulo"), "GRU");
  assert.equal(resolveAeroporto("Rio de Janeiro"), "GIG");
  assert.equal(resolveAeroporto("GRU"), "GRU");
  assert.equal(resolveAeroporto("gru"), "GRU");
});

test("entrada irreconhecivel devolve null em vez de inventar aeroporto", () => {
  // extractIata() pegava QUALQUER palavra de 3 letras: "xyz" virava aeroporto
  // XYZ, e "Porto Alegre" (sem palavra de 3 letras) caia no padrao GRU.
  for (const lixo of ["xyz", "abc", "", "   ", "asdfghjkl", "123"]) {
    assert.equal(resolveAeroporto(lixo), null, `"${lixo}" nao deveria virar aeroporto`);
  }
});

test("a pagina avisa quando nao entendeu a rota, em vez de trocar em silencio", () => {
  const h = renderResultsPage({
    rota: { origem: "GRU", destino: "REC", resumo: "" },
    searched: true,
    naoEntendi: ["xyz"],
  });
  assert.match(h, /Não reconhecemos/, "sem aviso de rota nao reconhecida");
  assert.match(h, /<strong>xyz<\/strong>/, "o aviso precisa citar o que a pessoa digitou");

  const ok = renderResultsPage({ rota: { origem: "POA", destino: "GRU", resumo: "" }, searched: true, naoEntendi: [] });
  assert.doesNotMatch(ok, /Não reconhecemos/, "avisou sem ter o que avisar");
});

// ---------------------------------------------------------------------------
// O rotulo real x exemplo tambem no JS do cliente
// ---------------------------------------------------------------------------

test("o contador de voos do cliente le o rotulo do servidor", () => {
  // O JS cravava "voos de exemplo": com busca ao vivo, o primeiro clique em
  // qualquer filtro rotulava preco REAL da Amadeus como exemplo.
  const reais = [{ cia: "LATAM", saida: "08:10", chegada: "10:35", duracao: "2h25", paradas: "Direto", direto: true, preco: "R$ 612", melhor: true }];
  const h = renderResultsPage({ searched: true, voos: reais, voosReais: true });
  assert.match(h, /data-res-rotulo="voos encontrados"/, "o servidor precisa publicar o rotulo");
  assert.doesNotMatch(h, /'\s*voos de exemplo · ordenar por'/, "o JS nao pode cravar o rotulo");

  const exemplo = renderResultsPage({ searched: true });
  assert.match(exemplo, /data-res-rotulo="voos de exemplo"/);
});

// ---------------------------------------------------------------------------
// Segunda rodada de avaliacao — o que escapou da primeira
// ---------------------------------------------------------------------------

test("o site nunca inventa um telefone de atendimento", () => {
  // ISSO ERA GRAVE: havia um 0800 cravado em src/config.js como padrao, e ele
  // aparecia em toda pagina como "Atendimento ... todos os dias" mesmo sem
  // ninguem configurar nada. Um 0800 real pertence a ALGUMA empresa — anunciar
  // o numero de terceiro como seu atendimento manda o cliente ligar errado.
  const paginas = [renderHomePage(), renderGuidesIndexPage(), renderResultsPage({ searched: true })];
  for (const h of paginas) {
    assert.doesNotMatch(h, /0800\s*942\s*0842/, "telefone cravado voltou ao HTML");
  }
});

test("sem telefone e sem WhatsApp configurados, a home nao promete canal de voz", () => {
  const h = renderHomePage();
  if (!h.includes("wa.me")) {
    // Pode oferecer a Central de ajuda (que existe), nunca um telefone.
    assert.doesNotMatch(h, /href="tel:\d/, "link tel: sem telefone configurado");
  }
});

test("a secao 'como funciona' descreve o que o site faz de verdade", () => {
  // A versao anterior prometia "Robos de olho 24h", "milhares de rotas" e
  // "media historica dos ultimos anos". Nao ha cron no projeto, o feed tem 18
  // ofertas de curadoria manual, e a media de referencia e de 90 dias.
  const h = renderOffersPage();
  assert.doesNotMatch(h, /Robôs de olho 24h/i);
  assert.doesNotMatch(h, /milhares de rotas/i);
  assert.doesNotMatch(h, /média histórica dos últimos anos/i);
  assert.match(h, /90 dias/, "a janela real de comparacao precisa aparecer");
});

test("condicao de pagamento e sempre atribuida ao parceiro, em toda tela", () => {
  // Quem processa o pagamento e sempre o parceiro — o proprio FAQ do site diz
  // isso. A home ja tinha sido corrigida numa rodada anterior; a pagina de
  // oferta, a de resultados e a de roteiro tinham ficado para tras.
  const telas = {
    home: renderHomePage(),
    oferta: renderOfferPage(OFFERS[0]),
    resultados: renderResultsPage({ searched: true }),
    roteiro: renderGuidePage(Object.keys(GUIDES)[0]),
  };
  for (const [nome, h] of Object.entries(telas)) {
    const semEspaco = h.replace(/\s+/g, " ");
    assert.doesNotMatch(
      semEspaco,
      /12x sem juros(?!.{0,80}(parceiro|conforme))/,
      `${nome}: promete 12x sem dizer que a condicao e do parceiro`
    );
    assert.doesNotMatch(
      semEspaco,
      /todos os preços acima ganham <strong>5% de desconto/,
      `${nome}: promete desconto de Pix que o Aonde nao controla`
    );
  }
});

test("a parcela por voo e apresentada como conta, nao como oferta do parceiro", () => {
  // "12x de R$ 98" era preco dividido por 12 — aritmetica nossa — exibida como
  // se fosse condicao oferecida, inclusive para voo real vindo da Amadeus.
  const h = renderResultsPage({ searched: true });
  if (/\/mês/.test(h)) {
    assert.match(h, /se o parceiro parcelar/, "a parcela precisa vir condicionada");
  }
  assert.doesNotMatch(h, /<p class="res-parcela">12x de /, "parcela apresentada como oferta");
});

// ---------------------------------------------------------------------------
// Layout que quebra o texto — achado por inspecao visual, nao por teste
// ---------------------------------------------------------------------------

test("paragrafo com texto corrido nunca usa display:flex", () => {
  // BUG REAL, na primeira dobra da home: `.sc-notice` era um <p> com
  // display:flex. Cada trecho de texto solto e cada <strong> viravam ITEM
  // FLEX, e a frase se quebrava em colunas verticais ilegiveis — medido no
  // navegador: 4 pedacos lado a lado, 446px de altura no celular. Nenhum
  // teste pegava porque o HTML estava correto; so o CSS estava errado.
  const css = pageStylesCss();
  const regra = /\.sc-notice\{([^}]*)\}/.exec(css);
  assert.ok(regra, "regra .sc-notice sumiu");
  assert.doesNotMatch(regra[1], /display:\s*flex/, ".sc-notice voltou a ser flex — o texto quebra");
});

test("a pagina de mapa sem chave fala com o visitante, nao com o programador", () => {
  // A mensagem de fallback mandava "defina GOOGLE_MAPS_API_KEY (e ative a
  // Maps JavaScript API)" — instrucao de configuracao interna exibida para
  // quem entrou para viajar.
  const h = renderMapPage();
  if (!h.includes("maps.googleapis.com/maps/api/js")) {
    assert.doesNotMatch(h, /GOOGLE_MAPS_API_KEY/, "nome de variavel de ambiente na tela do usuario");
    assert.doesNotMatch(h, /Maps JavaScript API/, "instrucao de console do Google na tela do usuario");
  }
});

test("a fonte externa nunca bloqueia a primeira pintura", () => {
  // MEDIDO: com fonts.googleapis.com lento, o <link rel=stylesheet> comum
  // segurava a tela BRANCA por 12,8s. Com media=print + onload o texto
  // aparece em ~160ms na pilha de fallback.
  const h = renderHomePage();
  // O <link> dentro de <noscript> so vale quando nao ha JS — e ai nao existe
  // como carregar de forma assincrona mesmo. Ele nao conta como bloqueante.
  const semNoscript = h.replace(/<noscript>[\s\S]*?<\/noscript>/g, "");
  const links = [...semNoscript.matchAll(/<link[^>]*fonts\.googleapis\.com[^>]*rel="stylesheet"[^>]*>|<link[^>]*rel="stylesheet"[^>]*fonts\.googleapis\.com[^>]*>/g)].map((m) => m[0]);
  assert.ok(links.length > 0, "sem link de fonte");
  const bloqueantes = links.filter(
    (l) => /rel="stylesheet"/.test(l) && !/media="print"/.test(l) && !/onload=/.test(l)
  );
  assert.deepEqual(bloqueantes, [], "link de fonte bloqueando a renderizacao");
  assert.match(h, /<noscript>[^<]*<link[^>]*fonts\.googleapis/, "sem fallback para quem esta sem JS");
});

test("as fotos do Commons sao pedidas redimensionadas", () => {
  // Sem ?width=, o site baixa o arquivo ORIGINAL (varios MB, milhares de px)
  // para exibir num container de 160-620px. Em 4G isso decide se a foto
  // aparece ou se a pessoa desiste.
  const h = renderOffersPage();
  const imgs = [...h.matchAll(/<img[^>]*commons\.wikimedia\.org[^>]*>/g)].map((m) => m[0]);
  assert.ok(imgs.length > 0, "nenhuma foto do Commons na pagina");
  for (const img of imgs) {
    const src = (/src="([^"]+)"/.exec(img) || [])[1] || "";
    assert.match(src, /[?&]width=\d+/, `foto sem largura pedida: ${src.slice(0, 80)}`);
    assert.match(img, /srcset="/, "sem srcset: o celular baixa a versao grande");
  }
});

test("todo <button> visivel tem aparencia propria, nao a caixa padrao do navegador", () => {
  // O botao de tema foi adicionado sem NENHUMA regra de CSS: renderizava com a
  // aparencia padrao do navegador — um retangulo branco no meio da barra, e no
  // tema escuro destoava de tudo. Nenhum teste pegava porque o markup estava
  // correto; so a folha de estilo estava incompleta. Achado olhando a tela.
  //
  // A regra vale para <button>, que traz caixa cinza e borda de sistema por
  // padrao. Um <a> nao tem esse problema, entao nao entra aqui.
  const css = pageStylesCss();
  const html = renderHomePage();
  const classesDeBotao = new Set();
  for (const m of html.matchAll(/<button[^>]*class="([^"]+)"/g)) {
    // pega a primeira classe (a "base" do componente)
    const base = m[1].trim().split(/\s+/)[0];
    if (base) classesDeBotao.add(base);
  }
  assert.ok(classesDeBotao.size > 0, "nenhum <button> com classe na home");
  for (const cls of classesDeBotao) {
    const m = new RegExp(`\\.${cls}\\{([^}]*)\\}`).exec(css);
    assert.ok(m, `.${cls} e um <button> sem nenhuma regra de estilo`);
    assert.match(
      m[1],
      /background|border|appearance/,
      `.${cls} nao define aparencia — cai na caixa padrao do navegador`
    );
  }
});
