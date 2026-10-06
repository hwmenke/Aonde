// Links internos e leitura dos roteiros de 5 dias: indice, "Continue planejando",
// ofertas do destino e /hoje. Puros (sem rede). Tudo vem de dado existente.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  renderGuidePage,
  renderGuidesIndexPage,
  renderOfferPage,
} from "../src/render/htmlRenderer.js";
import { pageStyles } from "../src/render/estilos.js";
import { GUIDES, GUIDE_LIST, OFFERS } from "../src/render/aondeContent.js";
import {
  partesDaTag,
  roteirosRelacionados,
  ofertasDoRoteiro,
  hojeParaRoteiro,
  continuePlanejandoHtml,
  indiceDoRoteiroHtml,
  ofertaNaCaixaHtml,
  roteiroStickyCtaHtml,
} from "../src/render/guideLinks.js";

const DATA = new Date("2026-10-03T12:00:00-03:00");

test("partesDaTag separa categoria e regiao", () => {
  assert.deepEqual(partesDaTag("Praia · Alagoas"), { categoria: "Praia", regiao: "Alagoas" });
  assert.deepEqual(partesDaTag(""), { categoria: "", regiao: "" });
  assert.deepEqual(partesDaTag(undefined), { categoria: "", regiao: "" });
});

test("roteirosRelacionados: 3 itens, sem o proprio guia, ids reais e sem repeticao", () => {
  for (const g of GUIDE_LIST) {
    const rel = roteirosRelacionados(g);
    assert.equal(rel.length, 3, g.id);
    const ids = rel.map((r) => r.guide.id);
    assert.ok(!ids.includes(g.id), `${g.id} nao aponta para si mesmo`);
    assert.equal(new Set(ids).size, 3, `${g.id} sem repetidos`);
    for (const id of ids) assert.ok(GUIDES[id], `${id} existe em GUIDES`);
  }
});

test("roteirosRelacionados: so afirma motivo quando e verdade", () => {
  for (const g of GUIDE_LIST.slice(0, 20)) {
    const eu = partesDaTag(g.tag);
    for (const { guide: o, motivo } of roteirosRelacionados(g)) {
      const t = partesDaTag(o.tag);
      if (motivo.startsWith("Também em")) assert.equal(t.regiao, eu.regiao);
      else if (motivo.startsWith("Mesmo estilo")) assert.ok(eu.categoria && t.categoria);
      else assert.equal(motivo, "");
    }
  }
});

test("roteirosRelacionados prefere a mesma regiao e tolera entrada vazia", () => {
  const lista = [
    { id: "a", tag: "Praia · Bahia" },
    { id: "b", tag: "Cidade · Sul" },
    { id: "c", tag: "Serra · Bahia" },
    { id: "d", tag: "Praia · Sul" },
  ];
  const rel = roteirosRelacionados(lista[0], { lista, max: 2 });
  assert.equal(rel[0].guide.id, "c");
  assert.equal(rel[0].motivo, "Também em Bahia");
  assert.deepEqual(roteirosRelacionados(null), []);
  assert.deepEqual(roteirosRelacionados({}), []);
});

test("ofertasDoRoteiro so devolve ofertas do mesmo destino", () => {
  for (const g of GUIDE_LIST) {
    for (const o of ofertasDoRoteiro(g)) {
      assert.ok(OFFERS.includes(o));
      assert.ok(o.id, "oferta com id para o link");
    }
  }
  const salvador = ofertasDoRoteiro(GUIDES.salvador);
  assert.ok(salvador.length >= 1, "ha achado para Salvador nos dados");
  assert.ok(salvador.every((o) => /salvador/i.test(o.cidade || o.destino || "")));
  assert.deepEqual(ofertasDoRoteiro(GUIDES.salvador, { offers: [] }), []);
  assert.deepEqual(ofertasDoRoteiro(null), []);
});

test("hojeParaRoteiro lista as cidades do dia sem inventar", () => {
  const h = hojeParaRoteiro(GUIDES.salvador, DATA);
  assert.ok(Array.isArray(h.cidades));
  assert.equal(typeof h.eEsteRoteiro, "boolean");
  assert.equal(hojeParaRoteiro(null, DATA).eEsteRoteiro, false);
});

test("continuePlanejandoHtml linka so /ofertas/:id, /hoje, /ofertas e /guias", () => {
  const html = continuePlanejandoHtml(GUIDES.salvador, { data: DATA });
  assert.ok(html.includes('id="continue-planejando"'));
  assert.ok(html.includes("Continue planejando"));
  assert.ok(html.includes('href="/hoje"'));
  assert.ok(html.includes('href="/guias"'));
  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  for (const h of hrefs) {
    assert.ok(/^\/(ofertas(\/[\w-]+)?|hoje|guias(\/[\w-]+)?)$/.test(h), `href interno inesperado: ${h}`);
  }
  assert.ok(!html.includes("/saida"), "nao toca em links de afiliado");
});

test("continuePlanejandoHtml sem oferta diz isso e aponta para /ofertas", () => {
  const html = continuePlanejandoHtml(GUIDES.salvador, { data: DATA, offers: [] });
  assert.ok(html.includes("Ainda não temos um achado de passagem publicado"));
  assert.ok(html.includes('href="/ofertas"'));
  assert.ok(!html.includes('class="rel-card"'));
});

test("continuePlanejandoHtml com oferta mostra o card sem inventar preco", () => {
  const oferta = {
    id: "x-ssa",
    origem: "GRU",
    destino: "SSA",
    cidade: "Salvador",
    cia: "Cia Teste",
    datas: "10–15 mar",
  };
  const html = continuePlanejandoHtml(GUIDES.salvador, { data: DATA, offers: [oferta] });
  assert.ok(html.includes('href="/ofertas/x-ssa"'));
  assert.ok(!/R\$/.test(html.split("guia-mais-bloco")[1] || ""), "sem preco no dado = sem preco na tela");
  assert.equal(continuePlanejandoHtml(null), "");
  assert.equal(continuePlanejandoHtml({ id: "nao-existe" }), "");
});

test("ofertaNaCaixaHtml: vazio sem oferta, link para /ofertas/:id com oferta", () => {
  assert.equal(ofertaNaCaixaHtml(GUIDES.salvador, { offers: [] }), "");
  const html = ofertaNaCaixaHtml(GUIDES.salvador);
  assert.ok(/href="\/ofertas\/[\w-]+"/.test(html));
});

test("roteiroStickyCtaHtml: so /ofertas ou /ofertas/:id, textos existentes", () => {
  assert.equal(roteiroStickyCtaHtml(null), "");
  assert.equal(roteiroStickyCtaHtml({ id: "nao-existe" }), "");
  const comOferta = roteiroStickyCtaHtml(GUIDES.salvador);
  assert.ok(comOferta.includes('class="guia-sticky-cta"'));
  assert.ok(comOferta.includes("Ver a oferta →"));
  assert.ok(/href="\/ofertas\/[\w-]+"/.test(comOferta));
  assert.ok(comOferta.includes('id="guia-sticky-titulo"'));
  const semOferta = roteiroStickyCtaHtml(GUIDES.salvador, { offers: [] });
  assert.ok(semOferta.includes('href="/ofertas"'));
  assert.ok(semOferta.includes("Ver todos os achados de passagem →"));
  assert.ok(!semOferta.includes("/saida"));
});

test("indiceDoRoteiroHtml aponta para dias e secoes, e escapa titulos", () => {
  const html = indiceDoRoteiroHtml(
    [{ n: 1, titulo: "A <b>x</b>" }, { n: 2, titulo: "B" }, { titulo: "sem n" }],
    { temHospedagem: true, temEpoca: true, temPreparativos: true, temMais: true },
  );
  for (const a of ["#dia-1", "#dia-2", "#onde-ficar", "#quando-ir", "#antes-de-viajar", "#continue-planejando"]) {
    assert.ok(html.includes(`href="${a}"`), a);
  }
  assert.ok(!html.includes("<b>x</b>"));
  assert.ok(!html.includes("sem n"));
  assert.equal(indiceDoRoteiroHtml([]), "");
});

test("pagina do guia: todo link de ancora tem um alvo na propria pagina", () => {
  for (const id of ["salvador", "maceio", GUIDE_LIST[GUIDE_LIST.length - 1].id]) {
    const html = renderGuidePage(id, { hoje: DATA });
    const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
    const ancoras = [...html.matchAll(/href="#([\w-]+)"/g)].map((m) => m[1]);
    assert.ok(ancoras.some((a) => a.startsWith("dia-")), `${id}: indice dos dias`);
    for (const a of ancoras) assert.ok(ids.has(a), `${id}: #${a} sem alvo`);
    for (const alvo of ["continue-planejando", "guia-toc-h"]) assert.ok(ids.has(alvo), `${id}: ${alvo}`);
    assert.ok(html.includes('<dl class="guia-meta">'));
    assert.ok(html.includes("Continue planejando"));
    const sticky = html.match(/<aside class="guia-sticky-cta"[\s\S]*?<\/aside>/);
    assert.ok(sticky, `${id}: barra fixa de passagens`);
    assert.ok(/href="\/ofertas(\/[\w-]+)?"/.test(sticky[0]), `${id}: link da barra fixa`);
  }
});

test("textos pt-BR do guia: sem promessas nao verificaveis", () => {
  const html = renderGuidePage("salvador", { hoje: DATA });
  assert.ok(!html.includes("Voo + hotel na mesma reserva"));
  assert.ok(!html.includes("mapa-múndi"));
  assert.ok(!html.includes("Reservar estas datas"));
  assert.ok(!html.includes("nessas datas"));
  assert.ok(!html.includes("Roteiros escritos por quem conhece"));
  const idx = renderGuidesIndexPage();
  assert.ok(idx.includes('href="/ofertas"'));
  assert.ok(idx.includes('href="/hoje"'));
});

test("semanas das ofertas nao ganham ancoras de dia (helper compartilhado intacto)", () => {
  const comSemana = OFFERS.find((o) => o.semana);
  if (!comSemana) return;
  const html = renderOfferPage(comSemana.id);
  assert.ok(!/id="dia-\d/.test(html));
});

test("CSS: contraste do aviso das fontes e regras mobile do guia", () => {
  const css = pageStyles();
  assert.ok(/\.opt-foot--disclaimer\s*\{[^}]*color/.test(css));
  assert.ok(css.includes(".guia-toc"));
  assert.ok(css.includes(".guia-rel-card"));
  assert.ok(css.includes(".guia-sticky-cta"));
  assert.ok(css.includes("safe-area-inset-bottom"));
  assert.ok(css.includes("main#conteudo:has(.guia-sticky-cta)"));
});

test("arquivos novos nao mexem em afiliados", () => {
  const fonte = readFileSync(new URL("../src/render/guideLinks.js", import.meta.url), "utf8");
  assert.ok(!/TRAVELPAYOUTS|MARKER|marker=/i.test(fonte));
});
