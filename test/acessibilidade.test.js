// Acessibilidade que o Lighthouse ainda reprovava: contraste de texto esmaecido
// por opacity, links que só se distinguiam pela cor, nome do mapa e cinza
// miúdo da roda de meses.

import { test } from "node:test";
import assert from "node:assert/strict";

import { renderGuidePage, renderGuidesIndexPage, renderHomePage, renderResultsPage } from "../src/render/htmlRenderer.js";
import { pageStyles } from "../src/render/estilos.js";
import { GUIDE_LIST } from "../src/render/aondeContent.js";

test("opacidade não esmaece texto que a pessoa precisa ler", () => {
  const css = pageStyles();
  assert.doesNotMatch(css, /\.style-item\{[^}]*opacity/, "estilos de viagem");
  assert.doesNotMatch(css, /\.sc-tab--soon\{[^}]*opacity/, "abas em breve");
  assert.doesNotMatch(css, /\.foot-link--soon\{[^}]*opacity/, "rodapé em breve");
  assert.match(css, /\.style-item\.is-active\{box-shadow:inset 3px 0 0 var\(--green\)/);
});

test("link no meio da frase ganha sublinhado, botão não", () => {
  const css = pageStyles();
  assert.match(
    css,
    /p a:not\(\.btn\),\.prep-fonte a,\.dia-ponto-meta a,\.dia-ponto-credit a,\.res-help a\{text-decoration:underline/,
  );
});

test("fontes oficiais do guia ficam dentro do parágrafo que é sublinhado", () => {
  for (const id of ["buenosaires", "bariloche", "montevideu", "cusco", "noronha"]) {
    const html = renderGuidePage(id);
    assert.match(html, /<p class="prep-fonte">[\s\S]*Polícia Federal/, id);
    assert.match(html, /href="https:\/\/www\.gov\.br\/anvisa\/pt-br\/assuntos\/paf\/certificado-internacional-de-vacinacao"/, id);
    assert.match(html, /href="https:\/\/www\.gov\.br\/mre\/pt-br\/assuntos\/portal-consular"/, id);
    assert.ok(!html.includes('fill="#8a8a84"'), `${id}: cinza da roda abaixo de AA`);
    assert.match(html, /fill="#50504a">MELHOR ÉPOCA</, id);
  }
});

test("índice de guias: links de oferta e de /hoje estão em texto corrido", () => {
  const html = renderGuidesIndexPage();
  assert.match(html, /<p class="map-sub map-sub--links">[\s\S]*<a href="\/ofertas">[\s\S]*<a href="\/hoje">/);
});

test("selo do mapa usa a quantidade real de roteiros", () => {
  const home = renderHomePage({});
  const n = GUIDE_LIST.length;
  assert.match(home, /<a class="explore-map" href="\/mapa">/);
  assert.match(home, new RegExp(`<span class="explore-map-badge">📍 ${n} destinos</span>`));
});

test("resultados: o pedido de ajuda é um link no meio da frase", () => {
  const html = renderResultsPage({});
  assert.match(html, /<div class="res-help">Precisa de ajuda para escolher\? <a href="\/ajuda">Central de ajuda<\/a><\/div>/);
});
