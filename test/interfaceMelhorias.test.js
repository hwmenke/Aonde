// Testes da rodada de interface: filtro do /guias, tema escuro, distincao
// entre voo real e voo de exemplo, e o historico de preco na pagina de oferta.
//
// Parte disso existe porque quebrou de verdade durante a integracao (ver o
// teste do espaco nao-quebravel no fim do arquivo).

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  renderGuidesIndexPage,
  renderResultsPage,
  renderOfferPage,
  renderHomePage,
  pageStylesCss,
  formatBRL,
  escapeHtml,
} from "../src/render/htmlRenderer.js";
import { semAcento } from "../src/render/texto.js";
import { GUIDE_LIST, OFFERS, FLIGHTS } from "../src/render/aondeContent.js";

// ---------------------------------------------------------------------------
// Filtro de roteiros no /guias
// ---------------------------------------------------------------------------

test("/guias traz o campo de busca e um palheiro por cartao", () => {
  const h = renderGuidesIndexPage();
  assert.match(h, /data-guia-busca-campo/, "sem campo de busca");
  assert.match(h, /type="search"/, "o campo deveria ser type=search");
  const palheiros = h.match(/data-rot-busca="/g) || [];
  assert.equal(
    palheiros.length,
    GUIDE_LIST.length,
    `esperava ${GUIDE_LIST.length} cartoes com palheiro, achei ${palheiros.length}`
  );
});

test("o campo de busca nasce escondido: sem JS ninguem ve controle que nao funciona", () => {
  const h = renderGuidesIndexPage();
  const bloco = h.slice(h.indexOf("data-guia-busca"), h.indexOf("data-guia-busca") + 400);
  assert.match(bloco, /hidden/, "o container do filtro precisa nascer com [hidden]");
  // e o JS precisa ser quem tira o hidden
  assert.match(h, /removeAttribute\('hidden'\)/, "o script nao remove o hidden do filtro");
});

test("o palheiro esta sem acento, para 'florianopolis' achar 'Florianopolis'", () => {
  const h = renderGuidesIndexPage();
  const valores = [...h.matchAll(/data-rot-busca="([^"]*)"/g)].map((m) => m[1]);
  assert.ok(valores.length > 0);
  for (const v of valores) {
    assert.equal(v, semAcento(v), `palheiro com acento ou caixa alta: ${v}`);
  }
  // um destino com acento no titulo tem de estar achavel sem acento
  const comAcento = GUIDE_LIST.find((g) => /[áàâãéêíóôõúç]/i.test(g.titulo));
  if (comAcento) {
    const alvo = semAcento(comAcento.titulo).split(" ")[0];
    assert.ok(
      valores.some((v) => v.includes(alvo)),
      `"${alvo}" (de "${comAcento.titulo}") deveria aparecer em algum palheiro`
    );
  }
});

test("a contagem do filtro e anunciada para leitor de tela", () => {
  const h = renderGuidesIndexPage();
  assert.match(h, /data-guia-busca-conta[^>]*role="status"/, "a contagem precisa de role=status");
  assert.match(h, /aria-live="polite"/, "a contagem precisa de aria-live");
});

test("o caso zero resultados diz o que fazer, nao deixa a lista vazia sem explicacao", () => {
  const h = renderGuidesIndexPage();
  assert.match(h, /Nenhum roteiro com/, "sem mensagem para busca sem resultado");
  assert.match(h, /Apague o texto/, "a mensagem de zero precisa dizer como voltar");
});

// ---------------------------------------------------------------------------
// Tema escuro
// ---------------------------------------------------------------------------

test("o botao de tema existe e e um botao de verdade, com estado acessivel", () => {
  const h = renderHomePage();
  assert.match(h, /data-tema-toggle/, "sem botao de tema");
  assert.match(h, /<button[^>]*class="tema-toggle"[^>]*aria-pressed=/, "o toggle precisa de aria-pressed");
  assert.match(h, /aria-label="Alternar tema claro\/escuro"/, "o toggle precisa de nome acessivel");
});

test("o tema salvo e aplicado antes da primeira pintura (sem piscar claro->escuro)", () => {
  const h = renderHomePage();
  const cabeca = h.slice(0, h.indexOf("</head>"));
  assert.match(cabeca, /localStorage\.getItem\('aonde-tema'\)/, "o script de tema tem de estar no <head>");
  // e antes do CSS, senao pisca
  assert.ok(
    cabeca.indexOf("aonde-tema") < cabeca.indexOf("<title>"),
    "o script de tema deveria vir antes do resto do <head>"
  );
});

test("o tema escuro funciona pelo sistema operacional, mesmo sem JS", () => {
  const css = pageStylesCss();
  assert.match(css, /prefers-color-scheme: *dark/, "sem suporte a prefers-color-scheme");
  assert.match(css, /\[data-tema="escuro"\]/, "sem seletor para a escolha manual");
});

// ---------------------------------------------------------------------------
// Voo real x voo de exemplo — o ponto mais sensivel de honestidade da pagina
// ---------------------------------------------------------------------------

const VOOS_REAIS = [
  { cia: "LATAM", saida: "08:10", chegada: "10:35", duracao: "2h25", paradas: "Direto", direto: true, preco: "R$ 612", melhor: true },
  { cia: "GOL", saida: "13:40", chegada: "16:20", duracao: "2h40", paradas: "Direto", direto: true, preco: "R$ 688", melhor: false },
];

test("sem busca ao vivo, a pagina diz que os voos sao exemplo", () => {
  const h = renderResultsPage({ searched: true });
  assert.match(h, /são <strong>exemplos<\/strong>/, "deveria rotular como exemplo");
  assert.match(h, /voos de exemplo · ordenar por/, "a contagem deveria dizer 'de exemplo'");
  assert.match(h, /Preços acima são exemplos\./, "a letra miuda deveria dizer exemplo");
});

test("com busca ao vivo, a pagina para de chamar os precos de exemplo", () => {
  const h = renderResultsPage({ searched: true, voos: VOOS_REAIS, voosReais: true });
  assert.match(h, /Preços buscados ao vivo agora/, "deveria anunciar a busca ao vivo");
  assert.match(h, /voos encontrados · ordenar por/, "a contagem nao deveria dizer 'de exemplo'");
  assert.doesNotMatch(h, /são <strong>exemplos<\/strong>/, "nao pode chamar preco real de exemplo");
  assert.doesNotMatch(h, /Preços acima são exemplos\./, "a letra miuda ficou desatualizada");
  assert.doesNotMatch(h, /Busca de voos ao vivo em breve/, "nao pode dizer 'em breve' com busca funcionando");
});

test("voosReais so vale com voos de verdade na mao — nunca rotula exemplo como real", () => {
  // Estes tres casos JA aconteceriam se alguem deduzisse "real" de opts.voos.
  for (const opts of [
    { searched: true, voosReais: true },                 // flag sem voos
    { searched: true, voosReais: true, voos: [] },        // flag com lista vazia
    { searched: true, voos: VOOS_REAIS },                 // voos sem a flag
  ]) {
    const h = renderResultsPage(opts);
    assert.match(
      h,
      /são <strong>exemplos<\/strong>/,
      `deveria cair para "exemplo" com opts=${JSON.stringify(Object.keys(opts))}`
    );
    assert.doesNotMatch(h, /Preços buscados ao vivo agora/, "prometeu busca ao vivo sem ter");
  }
});

test("o aviso de crianca/bebe acompanha real x exemplo", () => {
  const pax = { adultos: 2, criancas: 1, bebes: 0 };
  const exemplo = renderResultsPage({ searched: true, pax });
  assert.match(exemplo, /valores de exemplo abaixo são <strong>por adulto<\/strong>/);
  const real = renderResultsPage({ searched: true, pax, voos: VOOS_REAIS, voosReais: true });
  assert.match(real, /valores abaixo são <strong>por adulto<\/strong>/);
  assert.doesNotMatch(real, /valores de exemplo abaixo/, "diz 'exemplo' com preco real na tela");
});

test("a distincao real x exemplo nao depende so de cor", () => {
  const real = renderResultsPage({ searched: true, voos: VOOS_REAIS, voosReais: true });
  const exemplo = renderResultsPage({ searched: true });
  // o texto tem de mudar, nao apenas a classe de estilo
  const semTag = (s) => s.replace(/<[^>]+>/g, " ");
  assert.notEqual(
    semTag(real).includes("Preços buscados ao vivo agora"),
    semTag(exemplo).includes("Preços buscados ao vivo agora")
  );
});

// ---------------------------------------------------------------------------
// Historico de preco na pagina de oferta
// ---------------------------------------------------------------------------

test("a pagina de oferta mostra o bloco de historico sem inventar tendencia", () => {
  const oferta = OFFERS[0];
  const h = renderOfferPage(oferta);
  assert.match(h, /class="det-hist"/, "sem bloco de historico");
  assert.match(h, /Preço desta rota nos últimos 90 dias/);
  // Sem historico gravado, NAO pode existir curva desenhada.
  if (!/det-hist[\s\S]*?<polyline/.test(h)) {
    assert.match(h, /juntando histórico|observações suficientes/i, "sem curva, precisa explicar por que");
  }
});

test("o historico nunca derruba a pagina de oferta", () => {
  for (const o of OFFERS) {
    assert.doesNotThrow(() => renderOfferPage(o), `oferta ${o.id} estourou ao renderizar historico`);
  }
});

test("o grafico de historico e legivel por leitor de tela", () => {
  const h = renderOfferPage(OFFERS[0]);
  // Procura a MARCACAO, nao o CSS: "det-hist" aparece primeiro dentro do
  // <style> inline, e foi assim que este teste passou errado de inicio.
  const i = h.indexOf('class="det-hist"');
  assert.ok(i !== -1, "nao achei a marcacao do bloco de historico");
  const bloco = h.slice(i, i + 2500);
  assert.match(bloco, /role="img"/, "o SVG precisa de role=img");
  assert.match(bloco, /aria-label="/, "o SVG precisa de aria-label com os numeros");
});

// ---------------------------------------------------------------------------
// texto.js — o ciclo de importacao e o espaco invisivel
// ---------------------------------------------------------------------------

test("escapeHtml e formatBRL continuam exportados pelo htmlRenderer", () => {
  // Foram movidos para texto.js para quebrar o ciclo com sparkline.js; quem
  // importava do renderer nao pode ter quebrado.
  assert.equal(typeof escapeHtml, "function");
  assert.equal(typeof formatBRL, "function");
  assert.equal(escapeHtml("<script>"), "&lt;script&gt;");
});

test("formatBRL usa espaco comum, nao o nao-quebravel do Intl", () => {
  // ISSO QUEBROU DE VERDADE: ao mover formatBRL para texto.js, o regex
  // / / foi copiado como espaco comum (o caractere e invisivel no
  // editor). O replace virou no-op, "R$ 1.847" passou a sair com U+00A0 no
  // meio, e 11 testes cairam com uma diferenca que nao da para ver.
  const s = formatBRL(184700);
  assert.equal(s, "R$ 1.847");
  assert.ok(!s.includes(" "), "sobrou espaco nao-quebravel (U+00A0) no valor formatado");
  assert.ok(!s.includes(" "), "sobrou espaco estreito nao-quebravel (U+202F) no valor formatado");
  for (const v of [100, 99, 184750, 1000000]) {
    assert.ok(!formatBRL(v).includes(" "), `formatBRL(${v}) tem espaco nao-quebravel`);
  }
});

test("nenhum preco de voo de exemplo carrega espaco nao-quebravel", () => {
  for (const f of FLIGHTS) {
    assert.ok(!String(f.preco).includes(" "), `voo ${f.cia}: preco com U+00A0`);
  }
});

// ---------------------------------------------------------------------------
// Guarda do tema: superficies e textos precisam usar token, nao hex cravado
// ---------------------------------------------------------------------------

test("nenhuma superficie de cartao volta a cravar branco no CSS", () => {
  // ISSO QUEBROU DE VERDADE: .of-card/.rel-card/.res-voo/.site-footer tinham
  // "background:#fff". No modo escuro o cartao ficava branco enquanto o texto
  // virava claro — 201 trechos abaixo de AA em 3 paginas. O token --surface
  // acompanha o tema; hex cravado nao.
  const css = pageStylesCss();
  const semTemas = css
    .replace(/:root(\[data-tema="[^"]*"\])?\{[^}]*\}/g, "")
    .replace(/@media \(prefers-color-scheme:dark\)\{[\s\S]*?\n {2}\}/g, "");
  const brancos = semTemas.match(/background:#fff[;}]/g) || [];
  assert.deepEqual(brancos, [], `${brancos.length} regra(s) ainda cravam background:#fff`);
});

test("o cabecalho fixo acompanha o tema", () => {
  // Era rgba(247,247,245,.92): no escuro a barra ficava creme com texto claro,
  // e os links do menu mediam 1.84 de contraste.
  const css = pageStylesCss();
  assert.match(css, /\.site-header\{[^}]*rgba\(var\(--bg-rgb\)/, "o cabecalho precisa usar --bg-rgb");
  assert.doesNotMatch(css, /\.site-header\{[^}]*rgba\(247,247,245/, "cabecalho com creme cravado de novo");
});

test("o botao verde tem cor de texto por tema", () => {
  // Branco sobre --green da 3.09 no escuro. --on-green troca com o tema.
  const css = pageStylesCss();
  assert.match(css, /\.btn-green\{background:var\(--green\);color:var\(--on-green\);\}/);
  for (const bloco of ['--on-green:#fff', '--on-green:#18181b']) {
    assert.ok(css.includes(bloco), `falta declarar ${bloco} em algum tema`);
  }
});

test("todo token de cor existe nos tres blocos de tema", () => {
  const css = pageStylesCss();
  const blocos = {
    claro: (css.match(/:root\[data-tema="claro"\]\{([^}]*)\}/) || [])[1] || "",
    escuro: (css.match(/:root\[data-tema="escuro"\]\{([^}]*)\}/) || [])[1] || "",
    sistema: (css.match(/@media \(prefers-color-scheme:dark\)\{\s*:root\{([^}]*)\}/) || [])[1] || "",
  };
  for (const [nome, txt] of Object.entries(blocos)) {
    assert.ok(txt.length > 50, `bloco de tema "${nome}" nao encontrado ou vazio`);
  }
  const nomes = (t) => new Set((t.match(/--[a-z0-9-]+(?=:)/g) || []));
  const escuro = nomes(blocos.escuro);
  const sistema = nomes(blocos.sistema);
  // O bloco do sistema e o da escolha manual precisam cobrir os mesmos tokens,
  // senao o tema muda de aparencia dependendo de COMO foi ativado.
  for (const t of escuro) {
    assert.ok(sistema.has(t), `${t} existe na escolha manual mas nao em prefers-color-scheme`);
  }
  for (const t of sistema) {
    assert.ok(escuro.has(t), `${t} existe em prefers-color-scheme mas nao na escolha manual`);
  }
});
