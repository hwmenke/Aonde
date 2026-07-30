// Store de historico de precos por rota.
//
// Persistencia em arquivo JSON, zero dependencias (NAO usa node:sqlite —
// indisponivel no Node 20 da matrix de CI). Um arquivo por rota em
// "<AONDE_DATA_DIR>/history/<ORIGEM-DESTINO>.json", contendo um array de
// observacoes. Escrita atomica (tmp + rename) e tolerante a arquivo corrompido
// (recomeca com aviso, nao lanca).
//
// Este e o "banco de dados historico de precos" que o offerAdapter e o job de
// monitoramento mencionam: com ele passa a ser possivel calcular a media de
// uma rota e, a partir dela, desconto/economia e a heuristica de erro de tarifa.
//
// Observacao (shape gravado por deal):
//   { route: "GRU-LIS", observedAt, departDate, price, currency, airline }

import path from "node:path";
import { readdirSync, existsSync } from "node:fs";

import { resolveDataDir, readJsonSafe, writeJsonAtomic } from "./dataDir.js";

// Minimo de observacoes (dentro da janela) para getRouteStats considerar a
// estatistica confiavel. Configuravel por chamada via options.minSamples.
const DEFAULT_MIN_SAMPLES = 5;
const DEFAULT_WINDOW_DAYS = 90;

function historyDir() {
  return path.join(resolveDataDir(), "history");
}

/** Monta a chave de rota canonica "ORIGEM-DESTINO" (maiusculas). */
export function routeKey(origin, destination) {
  return `${String(origin || "").toUpperCase()}-${String(destination || "").toUpperCase()}`;
}

function routeFile(route) {
  return path.join(historyDir(), `${route}.json`);
}

/**
 * Converte preco (na moeda do deal) para centavos, com o MESMO criterio do
 * offerAdapter (Math.round(price*100)). Retorna null para valores invalidos.
 */
export function priceToCentavos(price) {
  if (typeof price !== "number" || Number.isNaN(price)) return null;
  return Math.round(price * 100);
}

/**
 * Grava uma observacao por deal do array normalizado do modulo. Agrupa por
 * rota e faz append no arquivo da rota (escrita atomica). Deals sem
 * origin/destination ou sem preco numerico sao ignorados.
 *
 * @param {Array<object>} deals array de deals de searchDeals()/searchDealsTravelpayouts()
 * @param {object} [options]
 * @param {string} [options.observedAt] timestamp ISO da observacao (default: agora)
 * @returns {{ recorded: number, routes: string[] }}
 */
export function recordPrices(deals, options = {}) {
  if (!Array.isArray(deals) || deals.length === 0) {
    return { recorded: 0, routes: [] };
  }

  const observedAt = options.observedAt || new Date().toISOString();

  // Agrupa observacoes validas por rota antes de gravar (um append por rota,
  // em vez de um por deal).
  const byRoute = new Map();
  for (const deal of deals) {
    if (!deal || !deal.origin || !deal.destination) continue;
    if (typeof deal.price !== "number" || Number.isNaN(deal.price)) continue;

    const route = routeKey(deal.origin, deal.destination);
    const observation = {
      route,
      observedAt,
      departDate: deal.departDate || null,
      price: deal.price,
      currency: deal.currency || null,
      airline: deal.airline || null,
    };
    if (!byRoute.has(route)) byRoute.set(route, []);
    byRoute.get(route).push(observation);
  }

  let recorded = 0;
  for (const [route, observations] of byRoute) {
    const file = routeFile(route);
    const existing = readJsonSafe(file, []);
    const list = Array.isArray(existing) ? existing : [];
    list.push(...observations);
    writeJsonAtomic(file, list);
    recorded += observations.length;
  }

  return { recorded, routes: [...byRoute.keys()] };
}

/**
 * Estatisticas de preco de uma rota, calculadas sobre as observacoes dentro
 * de uma janela de tempo (windowDays). Precos sao convertidos para centavos
 * (Math.round(price*100)) antes de agregar.
 *
 * @param {string} origin código IATA de origem
 * @param {string} destination código IATA de destino
 * @param {object} [options]
 * @param {number} [options.windowDays=90] janela em dias a partir de agora
 * @param {number} [options.minSamples=5] minimo de observacoes para ok:true
 * @returns {{ ok: boolean, route: string, mediaCentavos?: number, minCentavos?: number,
 *   maxCentavos?: number, sampleCount: number, windowDays: number, error?: string }}
 */
export function getRouteStats(origin, destination, options = {}) {
  const windowDays = options.windowDays ?? DEFAULT_WINDOW_DAYS;
  const minSamples = options.minSamples ?? DEFAULT_MIN_SAMPLES;
  const route = routeKey(origin, destination);
  const file = routeFile(route);

  const all = readJsonSafe(file, []);
  const observations = Array.isArray(all) ? all : [];

  const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;
  const centavos = [];
  for (const obs of observations) {
    if (!obs) continue;
    const ts = Date.parse(obs.observedAt);
    if (Number.isNaN(ts) || ts < cutoff) continue;
    const c = priceToCentavos(obs.price);
    if (c === null) continue;
    centavos.push(c);
  }

  const sampleCount = centavos.length;

  if (sampleCount < minSamples) {
    return {
      ok: false,
      route,
      sampleCount,
      windowDays,
      error: `Dados insuficientes para a rota ${route}: ${sampleCount} observacao(oes) na janela de ${windowDays} dias (minimo ${minSamples}).`,
    };
  }

  const sum = centavos.reduce((acc, c) => acc + c, 0);
  const mediaCentavos = Math.round(sum / sampleCount);
  const minCentavos = Math.min(...centavos);
  const maxCentavos = Math.max(...centavos);

  return {
    ok: true,
    route,
    mediaCentavos,
    minCentavos,
    maxCentavos,
    sampleCount,
    windowDays,
  };
}

/**
 * Serie de preco de uma rota, pronta para desenhar um grafico (ver
 * src/render/sparkline.js). Diferente de getRouteStats, devolve tambem os
 * pontos individuais (ordenados por data) e o periodo coberto, para que o
 * grafico mostre a evolucao real e nao so um numero agregado.
 *
 * Honestidade antes de estetica: se a amostra for menor que minSamples,
 * ok:false e NENHUM ponto deve virar linha de tendencia no render (o
 * consumidor deve mostrar o aviso, nao um grafico com poucos pontos).
 *
 * @param {string} origin código IATA de origem
 * @param {string} destination código IATA de destino
 * @param {object} [options]
 * @param {number} [options.windowDays=90] janela em dias a partir de agora
 * @param {number} [options.minSamples=5] minimo de observacoes para ok:true
 * @returns {{
 *   ok: boolean, route: string, origin: string, destination: string,
 *   points: Array<{observedAt: string, ts: number, priceCentavos: number}>,
 *   sampleCount: number, windowDays: number, minSamples: number,
 *   mediaCentavos?: number, minCentavos?: number, maxCentavos?: number,
 *   latestCentavos?: number, latestObservedAt?: string,
 *   periodStart?: string, periodEnd?: string, error?: string
 * }}
 */
export function getRouteSeries(origin, destination, options = {}) {
  const windowDays = options.windowDays ?? DEFAULT_WINDOW_DAYS;
  const minSamples = options.minSamples ?? DEFAULT_MIN_SAMPLES;
  const originUp = String(origin || "").toUpperCase();
  const destUp = String(destination || "").toUpperCase();
  const route = routeKey(originUp, destUp);
  const file = routeFile(route);

  const all = readJsonSafe(file, []);
  const observations = Array.isArray(all) ? all : [];

  const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;
  const points = [];
  for (const obs of observations) {
    if (!obs) continue;
    const ts = Date.parse(obs.observedAt);
    if (Number.isNaN(ts) || ts < cutoff) continue;
    const c = priceToCentavos(obs.price);
    if (c === null) continue;
    points.push({ observedAt: obs.observedAt, ts, priceCentavos: c });
  }
  // Ordem cronologica: o grafico le da esquerda (mais antigo) pra direita
  // (mais recente).
  points.sort((a, b) => a.ts - b.ts);

  const sampleCount = points.length;

  if (sampleCount < minSamples) {
    return {
      ok: false,
      route,
      origin: originUp,
      destination: destUp,
      points,
      sampleCount,
      windowDays,
      minSamples,
      error: `Dados insuficientes para a rota ${route}: ${sampleCount} observacao(oes) na janela de ${windowDays} dias (minimo ${minSamples}).`,
    };
  }

  const centavosList = points.map((p) => p.priceCentavos);
  const sum = centavosList.reduce((acc, c) => acc + c, 0);
  const mediaCentavos = Math.round(sum / sampleCount);
  const minCentavos = Math.min(...centavosList);
  const maxCentavos = Math.max(...centavosList);
  const latest = points[points.length - 1];
  const first = points[0];

  return {
    ok: true,
    route,
    origin: originUp,
    destination: destUp,
    points,
    sampleCount,
    windowDays,
    minSamples,
    mediaCentavos,
    minCentavos,
    maxCentavos,
    latestCentavos: latest.priceCentavos,
    latestObservedAt: latest.observedAt,
    periodStart: first.observedAt,
    periodEnd: latest.observedAt,
  };
}

/**
 * Lista as rotas que possuem historico gravado (arquivos em history/).
 * @returns {string[]} rotas no formato "ORIGEM-DESTINO"
 */
export function listRoutes() {
  const dir = historyDir();
  if (!existsSync(dir)) return [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.slice(0, -".json".length))
    .sort();
}
