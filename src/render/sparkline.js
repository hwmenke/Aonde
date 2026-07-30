// Grafico de evolucao de preco por rota (sparkline), em SVG inline.
//
// Modulo PURO: nada de I/O, nada de rede, nada de Date.now() usado para
// decisao (a "hora atual" ja vem resolvida dentro do objeto `series`
// devolvido por getRouteSeries() em src/store/priceHistory.js). A funcao
// so desenha o que recebe.
//
// VALOR CENTRAL DO PROJETO: honestidade. Este modulo nunca desenha uma
// linha de tendencia com base em poucos pontos. Se a amostra da rota for
// menor que o minimo (series.ok === false, ou poucos pontos), a funcao
// devolve um aviso textual — nao um grafico fingindo precisao.
//
// Como usar (para quem for integrar na pagina de oferta):
//
//   import { getRouteSeries } from "../store/priceHistory.js";
//   import { renderRouteSparkline } from "./sparkline.js";
//
//   const series = getRouteSeries(offer.origem, offer.destino, { windowDays: 90 });
//   const svgCompacto = renderRouteSparkline(series, { variant: "compact" });
//   const svgComRotulos = renderRouteSparkline(series, { variant: "labeled" });
//
// `renderRouteSparkline` decide sozinho se ha amostra suficiente. Se nao
// houver, devolve o aviso honesto (mesma assinatura, string HTML/SVG),
// entao pode ser encaixado direto no lugar do grafico sem `if` extra no
// chamador.

import { escapeHtml, formatBRL } from "./texto.js";

// Minimo de pontos na serie para desenhar uma linha de tendencia. Espelha
// o default de getRouteStats/getRouteSeries (DEFAULT_MIN_SAMPLES = 5), mas
// e reavaliado por serie: se quem chamou getRouteSeries() passou um
// minSamples diferente, usamos o que veio em series.minSamples.
export const MIN_SAMPLES_FOR_CHART = 5;

function slugify(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "") || "rota";
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

/** Numero de amostras exigido para esta serie (respeita o que veio nela). */
function minSamplesOf(series) {
  const n = series && typeof series.minSamples === "number" ? series.minSamples : MIN_SAMPLES_FOR_CHART;
  return n > 0 ? n : MIN_SAMPLES_FOR_CHART;
}

/** Amostra suficiente para desenhar linha de tendencia (nao so um numero). */
function isChartable(series) {
  if (!series || series.ok !== true) return false;
  if (!Array.isArray(series.points)) return false;
  return series.points.length >= minSamplesOf(series);
}

function formatDateBR(iso) {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return "";
  try {
    return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(ts));
  } catch {
    return "";
  }
}

/**
 * Texto (em portugues, com os numeros reais) que descreve a tendencia de
 * preco. Usado como aria-label do SVG para quem usa leitor de tela receber
 * a MESMA informacao de quem enxerga o desenho.
 *
 * So deve ser chamada com series "chartable" (ok:true e amostra suficiente).
 */
export function buildTrendAriaLabel(series) {
  const origem = escapeHtml(series.origin);
  const destino = escapeHtml(series.destination);
  const hoje = formatBRL(series.latestCentavos);
  const media = formatBRL(series.mediaCentavos);
  const minimo = formatBRL(series.minCentavos);
  const maximo = formatBRL(series.maxCentavos);
  return (
    `Preço de ${origem} para ${destino}: hoje ${hoje}, média dos últimos ` +
    `${series.windowDays} dias ${media}, mínimo ${minimo}, máximo ${maximo} ` +
    `(${series.sampleCount} observações no período).`
  );
}

/** Texto honesto para quando a amostra ainda e pequena demais. */
export function buildInsufficientLabel(series) {
  const origem = escapeHtml(series && series.origin);
  const destino = escapeHtml(series && series.destination);
  const sampleCount = (series && series.sampleCount) || 0;
  const windowDays = (series && series.windowDays) || "";
  const minSamples = minSamplesOf(series);
  return (
    `Ainda estamos juntando histórico de preço para ${origem} para ${destino}: ` +
    `${sampleCount} observação(ões) nos últimos ${windowDays} dias ` +
    `(mínimo ${minSamples} para mostrar a tendência). Assim que tivermos ` +
    `amostra suficiente, o gráfico aparece aqui.`
  );
}

/**
 * Aviso honesto de amostra insuficiente. NAO e um grafico de tendencia —
 * de proposito nao ha polyline/linha nenhuma aqui, so um icone neutro
 * (pontinhos "coletando dados") e o texto real explicando a situacao.
 *
 * @param {object} series objeto de getRouteSeries() (pode ser ok:false)
 * @param {object} [options]
 * @param {"compact"|"labeled"} [options.variant="compact"]
 * @param {number} [options.width]
 * @param {number} [options.height]
 * @returns {string} SVG inline
 */
export function renderInsufficientNotice(series, options = {}) {
  const variant = options.variant === "labeled" ? "labeled" : "compact";
  const width = options.width ?? (variant === "labeled" ? 520 : 160);
  const height = options.height ?? (variant === "labeled" ? 120 : 44);
  // buildInsufficientLabel ja escapa origem/destino internamente — nao
  // escapar de novo aqui (evitar "&amp;lt;" em vez de "&lt;").
  const label = buildInsufficientLabel(series);
  const cx = width / 2;
  const cy = variant === "labeled" ? height / 2 - 10 : height / 2;
  const dotSpacing = 10;
  const dots = [-1, 0, 1]
    .map((i) => `<circle cx="${round1(cx + i * dotSpacing)}" cy="${round1(cy)}" r="2.5" fill="var(--muted)" opacity="0.6"/>`)
    .join("");
  const textEl =
    variant === "labeled"
      ? `<text x="${round1(cx)}" y="${round1(cy + 24)}" text-anchor="middle" font-size="12" fill="var(--muted)">Coletando histórico desta rota</text>`
      : "";
  return (
    `<svg role="img" aria-label="${label}" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" ` +
    `class="of-sparkline of-sparkline--insuficiente" xmlns="http://www.w3.org/2000/svg">` +
    dots +
    textEl +
    `</svg>`
  );
}

/**
 * Monta as coordenadas (x,y) em pixels para cada ponto da serie dentro de
 * uma area util [padX, width-padX] x [padY, height-padY]. Preco maior =>
 * y menor (mais pro topo do SVG), como em qualquer grafico de linha.
 */
function scalePoints(series, width, height, padX, padY) {
  const points = series.points;
  const n = points.length;
  let domainMin = series.minCentavos;
  let domainMax = series.maxCentavos;
  if (domainMin === domainMax) {
    // Toda a amostra tem o mesmo preco: sem faixa nenhuma a escala colapsa
    // (divisao por zero). Abre uma folga fixa soh pra desenhar uma linha
    // reta no meio — nao inventa variacao que nao existe nos dados.
    domainMin -= 100;
    domainMax += 100;
  }
  const usableW = width - 2 * padX;
  const usableH = height - 2 * padY;
  return points.map((p, i) => {
    const x = n === 1 ? width / 2 : padX + (i * usableW) / (n - 1);
    const y = padY + ((domainMax - p.priceCentavos) / (domainMax - domainMin)) * usableH;
    return [round1(x), round1(y)];
  });
}

/**
 * Sparkline compacto: linha do historico, ponto do preco atual destacado,
 * faixa min-max e linha tracejada da media. Pensado pra caber num card ou
 * ao lado do preco na pagina de oferta.
 *
 * So chame diretamente se ja souber que a serie tem amostra suficiente;
 * caso contrario use renderRouteSparkline (que decide sozinho).
 */
export function renderCompactSparkline(series, options = {}) {
  const width = options.width ?? 160;
  const height = options.height ?? 44;
  const padX = 6;
  const padY = 6;

  const coords = scalePoints(series, width, height, padX, padY);
  const polylinePoints = coords.map(([x, y]) => `${x},${y}`).join(" ");
  const [lastX, lastY] = coords[coords.length - 1];

  let domainMin = series.minCentavos;
  let domainMax = series.maxCentavos;
  if (domainMin === domainMax) {
    domainMin -= 100;
    domainMax += 100;
  }
  const mediaY = round1(padY + ((domainMax - series.mediaCentavos) / (domainMax - domainMin)) * (height - 2 * padY));
  const bandTopY = round1(padY + ((domainMax - series.maxCentavos) / (domainMax - domainMin)) * (height - 2 * padY));
  const bandBottomY = round1(padY + ((domainMax - series.minCentavos) / (domainMax - domainMin)) * (height - 2 * padY));

  // buildTrendAriaLabel ja escapa origem/destino internamente.
  const label = buildTrendAriaLabel(series);

  return (
    `<svg role="img" aria-label="${label}" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" ` +
    `class="of-sparkline" xmlns="http://www.w3.org/2000/svg">` +
    // faixa min-max da amostra (contexto visual da variacao historica)
    `<rect x="${padX}" y="${bandTopY}" width="${round1(width - 2 * padX)}" height="${round1(Math.max(1, bandBottomY - bandTopY))}" fill="var(--lime)" opacity="0.15"/>` +
    // linha tracejada na media
    `<line x1="${padX}" y1="${mediaY}" x2="${round1(width - padX)}" y2="${mediaY}" stroke="var(--muted)" stroke-width="1" stroke-dasharray="2,2"/>` +
    // curva do historico
    `<polyline points="${polylinePoints}" fill="none" stroke="var(--green)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>` +
    // ponto do preco atual, destacado
    `<circle cx="${lastX}" cy="${lastY}" r="3.5" fill="var(--lime)" stroke="var(--green)" stroke-width="1.5"/>` +
    `</svg>`
  );
}

/**
 * Sparkline com rotulos: minimo, media e preco de hoje (com data), pra
 * pagina de detalhe da oferta — onde da pra gastar mais espaco explicando
 * de onde vem o "abaixo da media".
 */
export function renderLabeledSparkline(series, options = {}) {
  const width = options.width ?? 520;
  const height = options.height ?? 160;
  const padX = 16;
  const padTop = 16;
  const padBottom = 46;
  const chartHeight = height - padTop - padBottom;

  const coords = scalePoints(series, width, height - padBottom, padX, padTop);
  const polylinePoints = coords.map(([x, y]) => `${x},${y}`).join(" ");
  const [lastX, lastY] = coords[coords.length - 1];

  let domainMin = series.minCentavos;
  let domainMax = series.maxCentavos;
  if (domainMin === domainMax) {
    domainMin -= 100;
    domainMax += 100;
  }
  const mediaY = round1(padTop + ((domainMax - series.mediaCentavos) / (domainMax - domainMin)) * chartHeight);
  const bandTopY = round1(padTop + ((domainMax - series.maxCentavos) / (domainMax - domainMin)) * chartHeight);
  const bandBottomY = round1(padTop + ((domainMax - series.minCentavos) / (domainMax - domainMin)) * chartHeight);

  // buildTrendAriaLabel ja escapa origem/destino internamente.
  const label = buildTrendAriaLabel(series);
  const hojeTxt = escapeHtml(`Hoje ${formatBRL(series.latestCentavos)} · ${formatDateBR(series.latestObservedAt)}`);
  const mediaTxt = escapeHtml(`Média (${series.windowDays}d) ${formatBRL(series.mediaCentavos)}`);
  const minTxt = escapeHtml(`Mínimo ${formatBRL(series.minCentavos)}`);

  const labelsY = height - 12;

  return (
    `<svg role="img" aria-label="${label}" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" ` +
    `class="of-sparkline of-sparkline--labeled" xmlns="http://www.w3.org/2000/svg">` +
    `<rect x="${padX}" y="${bandTopY}" width="${round1(width - 2 * padX)}" height="${round1(Math.max(1, bandBottomY - bandTopY))}" fill="var(--lime)" opacity="0.15"/>` +
    `<line x1="${padX}" y1="${mediaY}" x2="${round1(width - padX)}" y2="${mediaY}" stroke="var(--muted)" stroke-width="1" stroke-dasharray="3,3"/>` +
    `<polyline points="${polylinePoints}" fill="none" stroke="var(--green)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<circle cx="${lastX}" cy="${lastY}" r="4.5" fill="var(--lime)" stroke="var(--green)" stroke-width="2"/>` +
    `<text x="${padX}" y="${labelsY}" font-size="12" fill="var(--muted)">${minTxt}</text>` +
    `<text x="${round1(width / 2)}" y="${labelsY}" text-anchor="middle" font-size="12" fill="var(--muted)">${mediaTxt}</text>` +
    `<text x="${round1(width - padX)}" y="${labelsY}" text-anchor="end" font-size="12" fill="var(--green)">${hojeTxt}</text>` +
    `</svg>`
  );
}

/**
 * Ponto de entrada recomendado para quem for integrar na pagina. Recebe o
 * objeto de getRouteSeries() e decide sozinho:
 *   - amostra suficiente => desenha o sparkline (compact ou labeled)
 *   - amostra insuficiente => devolve o aviso honesto (NUNCA um grafico
 *     com poucos pontos fingindo tendencia)
 *
 * @param {object} series retorno de getRouteSeries(origin, destination, opts)
 * @param {object} [options]
 * @param {"compact"|"labeled"} [options.variant="compact"]
 * @param {number} [options.width]
 * @param {number} [options.height]
 * @returns {string} SVG inline pronto para embutir no HTML
 */
export function renderRouteSparkline(series, options = {}) {
  const variant = options.variant === "labeled" ? "labeled" : "compact";
  if (!isChartable(series)) {
    return renderInsufficientNotice(series, { ...options, variant });
  }
  return variant === "labeled" ? renderLabeledSparkline(series, options) : renderCompactSparkline(series, options);
}

// Exportado para permitir testes/consumidores checarem "esta serie da pra
// desenhar grafico?" sem duplicar a regra do minimo de amostra.
export { isChartable };
