// Testes do aviao da marca e das animacoes 3D de fundo. Sao elementos
// puramente decorativos: o que importa garantir e (a) que existem, (b) que nao
// poluem a arvore de acessibilidade e (c) que somem em prefers-reduced-motion.

import { test } from "node:test";
import assert from "node:assert/strict";

import { renderHomePage, renderGuidePage, renderResultsPage, currentSeasonIndex } from "../src/render/htmlRenderer.js";

const home = renderHomePage({});

test("aviao da marca decola no header e no rodape", () => {
  const planes = home.match(/<span class="brand-plane"/g) || [];
  assert.equal(planes.length, 2, "um aviao no header, outro no rodape");
  // Decorativo: fora da arvore de acessibilidade e sem texto alternativo.
  assert.match(home, /<span class="brand-plane" aria-hidden="true">/);
  assert.ok(home.includes("brandFly"), "keyframes do voo presentes");
  assert.ok(home.includes("brandLand"), "keyframes do pouso no ponto presentes");
});

test("o ponto lime da marca continua sendo o destino do aviao", () => {
  // A ordem no DOM e o que faz o aviao pousar no ponto: aviao -> palavra -> ponto.
  const brand = home.slice(home.indexOf('<a class="brand"'));
  const plane = brand.indexOf("brand-plane");
  const word = brand.indexOf("brand-word");
  const dot = brand.indexOf("brand-dot");
  assert.ok(plane < word && word < dot, "aviao vem antes da palavra, ponto por ultimo");
});

test("globo 3D de arame no fundo da secao de roteiros", () => {
  assert.match(home, /<div class="globe3d" aria-hidden="true">/, "decorativo e aria-hidden");
  assert.equal((home.match(/class="g3-mer"/g) || []).length, 8, "8 meridianos");
  assert.equal((home.match(/class="g3-par"/g) || []).length, 5, "5 paralelos");
  assert.ok(home.includes("g3-orbit-dot"), "ponto orbitando o globo");
  assert.ok(home.includes("g3Spin"), "keyframes de rotacao presentes");
  // CSS 3D puro: nada de canvas/WebGL nem script de terceiro (a CSP barraria).
  assert.ok(!/<canvas/.test(home), "sem canvas");
  assert.ok(home.includes("transform-style:preserve-3d"), "usa 3D de verdade");
});

test("cenario 3D das estacoes forra todas as paginas", () => {
  for (const [nome, html] of [["home", home], ["roteiro", renderGuidePage("salvador", { apiKey: "" })]]) {
    assert.match(html, /<div class="seasons3d" aria-hidden="true">/, `${nome}: cenario presente e decorativo`);
    assert.equal((html.match(/class="s3-season/g) || []).length, 4, `${nome}: as 4 estacoes`);
    assert.equal((html.match(/class="s3-orb"/g) || []).length, 12, `${nome}: 3 esferas por estacao`);
    assert.ok(html.includes("s3-veil"), `${nome}: veu de legibilidade`);
  }
  // 3D de verdade: perspectiva + profundidade, sem canvas/WebGL.
  assert.ok(home.includes("perspective:900px"), "perspectiva por estacao");
  assert.ok(/translateZ\(-\d+px\)/.test(home), "esferas em profundidades diferentes");
  // Sem canvas/WebGL de verdade (o texto "canvas" aparece em .map-canvas, do
  // container do Google Maps — por isso o teste olha o ELEMENTO e a chamada).
  assert.ok(!/<canvas[\s>]/i.test(home), "nenhum elemento <canvas>");
  assert.ok(!/getContext\s*\(/.test(home), "nenhum contexto 2d/WebGL criado");
});

test("a estacao das cores segue o hemisferio SUL", () => {
  const emJulho = currentSeasonIndex(new Date("2026-07-24T12:00:00"));
  const emJaneiro = currentSeasonIndex(new Date("2026-01-15T12:00:00"));
  assert.equal(emJulho, 2, "julho e inverno no Brasil");
  assert.equal(emJaneiro, 0, "janeiro e verao no Brasil");
  assert.notEqual(emJulho, emJaneiro);
});

test("o ciclo comeca na estacao de hoje (sem atraso na primeira cena)", () => {
  // A cena de indice 0 e a estacao atual: entra em cena imediatamente.
  assert.match(home, /class="s3-season s3-season--\w+" style="animation-delay:0s"/);
  // As outras tres entram depois, via atraso negativo.
  for (const s of ["-54s", "-36s", "-18s"]) {
    assert.ok(home.includes(`animation-delay:${s}`), `cena atrasada em ${s}`);
  }
});

test("carrossel do hero obedece a WCAG 2.2.2 (pausar/parar)", () => {
  // Achado por usuaria com sensibilidade a movimento: o setInterval rodava
  // sempre, ignorando prefers-reduced-motion, e ainda voltava a trocar sozinho
  // 6s depois de a pessoa escolher um slide na mao.
  assert.match(home, /data-hero-pause/, "existe controle de pausa");
  assert.match(home, /aria-label="Pausar troca automática de fotos"/, "controle tem nome acessivel");
  assert.ok(
    home.includes("matchMedia('(prefers-reduced-motion: reduce)')"),
    "o JS consulta a preferencia antes de armar o timer"
  );
  // Escolha manual precisa parar o automatico antes de trocar de slide.
  assert.match(home, /t\.addEventListener\('click',function\(\)\{para\(\);show\(k\);\}\)/, "clique manual para o carrossel");
});

test("paginas tem link de pular para o conteudo apontando para o <main>", () => {
  for (const [nome, html] of [["home", home], ["roteiro", renderGuidePage("salvador", { apiKey: "" })]]) {
    assert.match(html, /<a class="skip-link" href="#conteudo">/, `${nome}: link existe`);
    assert.match(html, /<main id="conteudo" tabindex="-1">/, `${nome}: alvo existe e recebe foco`);
    // O link precisa vir ANTES do cabecalho, senao nao adianta.
    assert.ok(html.indexOf("skip-link") < html.indexOf("site-header"), `${nome}: link vem antes do cabecalho`);
  }
});

test("hierarquia de titulos: /resultados tem h1 e o roteiro nao pula nivel", () => {
  const res = renderResultsPage({ searched: true, rota: { origem: "GRU", destino: "REC", resumo: "1-8 set" } });
  assert.equal((res.match(/<h1/g) || []).length, 1, "resultados anuncia a rota buscada num h1");
  // Antes o roteiro ia de h1 direto para h3, quebrando a navegacao por titulos.
  const niveis = (renderGuidePage("gramado", { apiKey: "" }).match(/<h([1-6])/g) || []).map((t) => +t.slice(2));
  assert.equal(niveis[0], 1, "roteiro comeca em h1");
  assert.ok(niveis[1] <= 2, `depois do h1 vem no maximo h2, veio h${niveis[1]}`);
});

test("no celular a imagem de estilos nao pode escapar do seu container", () => {
  // Regressao: com .styles-imgs em "position:static", a .style-img (que e
  // absolute;inset:0) escapava para o ancestral posicionado e virava uma camada
  // de ~9000px por cima do feed de ofertas — os cards paravam de receber toque.
  const mobile = home.slice(home.indexOf("@media (max-width:900px)"));
  const regra = mobile.match(/\.styles-imgs\{[^}]*\}/);
  assert.ok(regra, "regra mobile de .styles-imgs existe");
  assert.ok(
    /position:relative/.test(regra[0]),
    `.styles-imgs precisa ser o bloco container no mobile, veio: ${regra[0]}`
  );
  assert.ok(!/position:static/.test(regra[0]), "static quebra o container da .style-img");
});

test("as animacoes 3D somem em prefers-reduced-motion", () => {
  const blocks = home.match(/@media \(prefers-reduced-motion:reduce\)\{[\s\S]*?\}\s*\}/g) || [];
  const all = blocks.join("\n");
  assert.ok(all.includes(".brand-plane{display:none;}"), "aviao desligado");
  assert.ok(all.includes(".globe3d{display:none;}"), "globo desligado");
  assert.ok(/\.hero-bg\.is-active\{animation:none;\}/.test(all), "deriva do hero desligada");
  // O cenario nao some: congela na estacao atual (fundo vazio seria pior).
  assert.ok(all.includes(".s3-season{animation:none;}"), "estacoes param de girar");
  assert.ok(all.includes(".s3-motes{display:none;}"), "particulas desligadas");
  assert.ok(all.includes(".s3-season:first-child{opacity:1;}"), "estacao atual continua visivel");
});
