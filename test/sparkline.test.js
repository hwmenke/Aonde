import test from "node:test";
import assert from "node:assert/strict";

import {
  renderRouteSparkline,
  renderCompactSparkline,
  renderLabeledSparkline,
  renderInsufficientNotice,
  buildTrendAriaLabel,
  buildInsufficientLabel,
  isChartable,
  MIN_SAMPLES_FOR_CHART,
} from "../src/render/sparkline.js";

// Helper: monta uma serie no mesmo shape de getRouteSeries(), com pontos em
// ordem cronologica crescente (mais antigo primeiro), como o store devolve.
function makeSeries(prices, overrides = {}) {
  const windowDays = overrides.windowDays ?? 90;
  const now = Date.parse("2026-07-29T12:00:00Z");
  const points = prices.map((price, i) => {
    const ts = now - (prices.length - 1 - i) * 24 * 60 * 60 * 1000;
    return {
      observedAt: new Date(ts).toISOString(),
      ts,
      priceCentavos: Math.round(price * 100),
    };
  });
  const centavosList = points.map((p) => p.priceCentavos);
  const sampleCount = centavosList.length;
  const minSamples = overrides.minSamples ?? MIN_SAMPLES_FOR_CHART;
  const ok = sampleCount >= minSamples;

  const base = {
    ok,
    route: `${overrides.origin || "GRU"}-${overrides.destination || "REC"}`,
    origin: overrides.origin || "GRU",
    destination: overrides.destination || "REC",
    points,
    sampleCount,
    windowDays,
    minSamples,
  };

  if (!ok) {
    return { ...base, error: "insuficiente" };
  }

  const sum = centavosList.reduce((a, c) => a + c, 0);
  return {
    ...base,
    mediaCentavos: Math.round(sum / sampleCount),
    minCentavos: Math.min(...centavosList),
    maxCentavos: Math.max(...centavosList),
    latestCentavos: points[points.length - 1].priceCentavos,
    latestObservedAt: points[points.length - 1].observedAt,
    periodStart: points[0].observedAt,
    periodEnd: points[points.length - 1].observedAt,
  };
}

function parseNumericPairs(pointsAttr) {
  return pointsAttr
    .trim()
    .split(/\s+/)
    .map((pair) => pair.split(",").map(Number));
}

// ---------------------------------------------------------------------------
// SVG bem formado
// ---------------------------------------------------------------------------

test("renderCompactSparkline devolve SVG bem formado com role=img e aria-label", () => {
  const series = makeSeries([1200, 1100, 1180, 1050, 900, 587]);
  const svg = renderCompactSparkline(series);

  assert.match(svg, /^<svg role="img" aria-label="[^"]*"/);
  assert.match(svg, /viewBox="0 0 \d+ \d+"/);
  assert.match(svg, /xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.ok(svg.trim().endsWith("</svg>"));

  // tags balanceadas (abertura == fechamento) para os elementos usados
  for (const tag of ["svg", "rect", "line", "polyline", "circle"]) {
    const opens = (svg.match(new RegExp(`<${tag}[ />]`, "g")) || []).length;
    const selfClosing = (svg.match(new RegExp(`<${tag}[^>]*/>`, "g")) || []).length;
    const explicitCloses = (svg.match(new RegExp(`</${tag}>`, "g")) || []).length;
    assert.equal(opens, selfClosing + explicitCloses, `tag <${tag}> desbalanceada`);
  }
});

test("renderLabeledSparkline devolve SVG bem formado com textos de rotulo", () => {
  const series = makeSeries([1200, 1100, 1180, 1050, 900, 587]);
  const svg = renderLabeledSparkline(series);

  assert.match(svg, /^<svg role="img" aria-label="[^"]*"/);
  assert.ok(svg.includes("<text"));
  assert.equal((svg.match(/<text/g) || []).length, (svg.match(/<\/text>/g) || []).length);
  assert.ok(svg.trim().endsWith("</svg>"));
});

// ---------------------------------------------------------------------------
// A curva reflete os dados
// ---------------------------------------------------------------------------

test("polyline: preco maior vira ponto mais alto (y menor) que preco menor", () => {
  // primeiro ponto barato, ultimo ponto caro
  const series = makeSeries([500, 600, 700, 800, 900, 2000]);
  const svg = renderCompactSparkline(series);
  const match = svg.match(/<polyline points="([^"]+)"/);
  assert.ok(match, "polyline deveria existir para amostra suficiente");

  const coords = parseNumericPairs(match[1]);
  assert.equal(coords.length, series.points.length);

  const firstY = coords[0][1];
  const lastY = coords[coords.length - 1][1];
  // preco do ultimo ponto (2000) e maior que o do primeiro (500) =>
  // no SVG (y cresce pra baixo) o ultimo deve estar MAIS ACIMA (y menor).
  assert.ok(lastY < firstY, `esperava y do ultimo (${lastY}) < y do primeiro (${firstY})`);
});

test("polyline: serie decrescente produz y crescente (preco caindo = linha descendo na tela)", () => {
  const series = makeSeries([2000, 1500, 1000, 800, 600, 400]);
  const svg = renderCompactSparkline(series);
  const match = svg.match(/<polyline points="([^"]+)"/);
  const coords = parseNumericPairs(match[1]);

  const firstY = coords[0][1];
  const lastY = coords[coords.length - 1][1];
  // preco caiu ao longo do tempo (2000 -> 400) => o ponto final (preco
  // MENOR) fica mais pra BAIXO na tela (y maior) que o inicial (preco
  // maior, y menor). Confirma que a curva segue os dados, nao so a ordem
  // dos pontos.
  assert.ok(lastY > firstY, `esperava y do ultimo (${lastY}) > y do primeiro (${firstY})`);
});

test("serie com todos os precos iguais nao quebra (linha reta, sem divisao por zero)", () => {
  const series = makeSeries([1000, 1000, 1000, 1000, 1000]);
  const svg = renderCompactSparkline(series);
  const match = svg.match(/<polyline points="([^"]+)"/);
  const coords = parseNumericPairs(match[1]);
  for (const [, y] of coords) {
    assert.ok(Number.isFinite(y));
  }
  // todos os y devem ser iguais (linha reta) ja que os precos sao iguais
  const ys = coords.map(([, y]) => y);
  assert.ok(ys.every((y) => y === ys[0]));
});

// ---------------------------------------------------------------------------
// Amostra insuficiente => aviso honesto, NAO grafico
// ---------------------------------------------------------------------------

test("isChartable retorna false com menos de minSamples pontos", () => {
  const series = makeSeries([1200, 1100]); // so 2 pontos, minimo padrao e 5
  assert.equal(series.ok, false);
  assert.equal(isChartable(series), false);
});

test("renderRouteSparkline com amostra insuficiente NAO desenha polyline/linha de tendencia", () => {
  const series = makeSeries([1200, 1100]);
  const svg = renderRouteSparkline(series);

  assert.ok(!svg.includes("<polyline"), "nao deveria haver linha de tendencia com amostra insuficiente");
  assert.ok(svg.includes("of-sparkline--insuficiente"), "deveria marcar visualmente como aviso, nao grafico de dados");
  assert.match(svg, /role="img"/);
  assert.match(svg, /aria-label="[^"]*"/);
});

test("renderInsufficientNotice menciona explicitamente que ainda esta juntando historico", () => {
  const series = makeSeries([1200, 1100, 1300]); // 3 pontos, abaixo do minimo 5
  const svg = renderInsufficientNotice(series);
  const label = buildInsufficientLabel(series);

  assert.match(label, /Ainda estamos juntando/);
  assert.ok(svg.includes(label.replace(/&/g, "&amp;")) || svg.includes(label));
});

test("amostra zero (rota sem nenhum historico) tambem produz aviso, nao erro", () => {
  const series = makeSeries([]);
  assert.doesNotThrow(() => renderRouteSparkline(series));
  const svg = renderRouteSparkline(series);
  assert.ok(!svg.includes("<polyline"));
});

// ---------------------------------------------------------------------------
// aria-label contem os numeros reais
// ---------------------------------------------------------------------------

test("buildTrendAriaLabel contem origem, destino, preco de hoje, media e minimo em R$", () => {
  const series = makeSeries([1200, 1100, 1180, 1050, 900, 587], { origin: "GRU", destination: "REC" });
  const label = buildTrendAriaLabel(series);

  assert.match(label, /GRU/);
  assert.match(label, /REC/);
  assert.match(label, /hoje R\$\s?587/);
  assert.match(label, new RegExp(`média dos últimos ${series.windowDays} dias`));
  assert.match(label, /mínimo R\$\s?587/);
  assert.match(label, /máximo R\$\s?1\.200/);
});

test("aria-label do SVG compacto bate com buildTrendAriaLabel (escapado)", () => {
  const series = makeSeries([1200, 1100, 1180, 1050, 900, 587]);
  const svg = renderCompactSparkline(series);
  const match = svg.match(/aria-label="([^"]*)"/);
  assert.ok(match);
  // o texto no atributo deve conter os mesmos numeros formatados
  assert.match(match[1], /hoje R\$\s?587/);
});

// ---------------------------------------------------------------------------
// Escape de dados nao confiaveis
// ---------------------------------------------------------------------------

test("origem/destino maliciosos sao escapados no aria-label (nao injetam HTML/SVG)", () => {
  const series = makeSeries([1200, 1100, 1180, 1050, 900, 587], {
    origin: '"><script>alert(1)</script>',
    destination: "REC",
  });
  const svg = renderCompactSparkline(series);

  assert.ok(!svg.includes("<script>"), "script cru nao deveria aparecer no SVG");
  assert.ok(svg.includes("&lt;script&gt;") || svg.includes("&amp;lt;script"), "deveria estar escapado");
  // o atributo aria-label continua bem formado (aspas fechadas corretamente)
  assert.match(svg, /^<svg role="img" aria-label="[^"]*" viewBox=/);
});

test("origem/destino maliciosos tambem sao escapados no aviso de amostra insuficiente", () => {
  const series = makeSeries(["<img src=x onerror=alert(1)>", "b"].map(() => 1000), {
    origin: "<img src=x onerror=alert(1)>",
    destination: "REC",
    minSamples: 5,
  });
  // forca amostra insuficiente (so 2 pontos)
  const svg = renderInsufficientNotice(series);
  assert.ok(!svg.includes("<img src=x"));
  assert.ok(svg.includes("&lt;img"));
});

// ---------------------------------------------------------------------------
// renderRouteSparkline: dispatcher compact vs labeled
// ---------------------------------------------------------------------------

test("renderRouteSparkline variant=labeled inclui rotulos de texto quando amostra e suficiente", () => {
  const series = makeSeries([1200, 1100, 1180, 1050, 900, 587]);
  const svg = renderRouteSparkline(series, { variant: "labeled" });
  assert.ok(svg.includes("<text"));
});

test("renderRouteSparkline variant=compact nao inclui rotulos de texto", () => {
  const series = makeSeries([1200, 1100, 1180, 1050, 900, 587]);
  const svg = renderRouteSparkline(series, { variant: "compact" });
  assert.ok(!svg.includes("<text"));
});

test("respeita minSamples customizado vindo da serie (nao hardcoded)", () => {
  const series = makeSeries([1000, 1100, 1200], { minSamples: 3 });
  assert.equal(series.ok, true);
  assert.equal(isChartable(series), true);
  const svg = renderRouteSparkline(series);
  assert.ok(svg.includes("<polyline"));
});
