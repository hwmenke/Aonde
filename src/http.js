// Wrapper fino sobre fetch nativo: timeout, parse de JSON e formato de
// resultado uniforme (nunca lanca excecao — o chamador sempre recebe um
// objeto { ok, status, data, error }).
//
// Alem do basico, esta camada concentra 4 melhorias de robustez transversais,
// aplicadas a TODAS as chamadas de rede dos parceiros (todas passam por aqui):
//   1. Rate limiting client-side (token bucket) por prefixo de URL.
//   2. Retry com backoff exponencial + jitter para erros de rede, 5xx e 429.
//   3. Cache em memoria com TTL para GET bem-sucedido (default: Data API).
//   4. (Validacao de entrada mora em src/validate.js, acionada no index.js.)
//
// A implementacao de fetch, o relogio e o "sleep" sao injetaveis (via setters)
// para permitir testes deterministicos sem bater na internet nem esperar
// tempo real.

import { createRateLimiter } from "./rateLimiter.js";
import { makeCacheKey, getCache, setCache, clearHttpCache } from "./httpCache.js";

const realSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// Em modo mock (fetch injetado), o sleep vira imediato para nao atrasar os
// testes que exercitam retry/backoff sem se importar com o tempo real.
const mockSleep = () => Promise.resolve();

const state = {
  fetchImpl: globalThis.fetch,
  now: () => Date.now(),
  sleep: realSleep,
};

// Limitador de taxa unico do processo. O relogio e lido de state.now em toda
// chamada (permite injetar clock falso nos testes de modo "wait").
const limiter = createRateLimiter({ now: () => state.now() });

/** Substitui a implementacao de fetch usada internamente (uso: testes). */
export function setFetchImpl(fn) {
  state.fetchImpl = fn;
  // Ao entrar em modo mock, isolamos o estado transversal entre testes:
  // sleep imediato, baldes de rate limit zerados e cache limpo.
  state.sleep = mockSleep;
  limiter.reset();
  clearHttpCache();
}

/** Restaura a implementacao padrao (fetch nativo global) e o estado real. */
export function resetFetchImpl() {
  state.fetchImpl = globalThis.fetch;
  state.sleep = realSleep;
  state.now = () => Date.now();
  limiter.reset();
  clearHttpCache();
}

/** Injeta o "sleep" usado por retry/rate-limit (uso: testes de timing). */
export function setSleepImpl(fn) {
  state.sleep = fn;
}
/** Restaura o sleep imediato de modo mock. */
export function resetSleepImpl() {
  state.sleep = mockSleep;
}

/** Injeta o relogio usado pelo rate limiter e cache (uso: testes). */
export function setClockImpl(fn) {
  state.now = fn;
}
/** Restaura o relogio real (Date.now). */
export function resetClockImpl() {
  state.now = () => Date.now();
}

/** Zera todos os baldes do rate limiter (uso: testes). */
export function resetRateLimiter() {
  limiter.reset();
}

// Reexporta o clear do cache para uso em testes/invalidacao manual.
export { clearHttpCache };

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_RETRIES = 2;
const DEFAULT_RETRY_BASE_MS = 500;
const DEFAULT_RETRY_MAX_MS = 30_000; // teto do backoff exponencial calculado
const DEFAULT_RETRY_AFTER_CAP_MS = 30_000; // teto ao respeitar header Retry-After
const DEFAULT_MAX_WAIT_MS = 30_000; // teto de espera no modo rateLimit:"wait"
const DEFAULT_AVIASALES_TTL_MS = 15 * 60_000; // 15 min para a Data API

// Regras de rate limit por prefixo de URL (casamento por substring, sem se
// prender ao esquema http/https). Ver docs/PESQUISA-PARCEIROS.md e os limites
// documentados nos proprios parceiros.
const RATE_RULES = [
  {
    prefix: "api.travelpayouts.com/aviasales/",
    key: "tp-data",
    capacity: 200,
    windowMs: 60 * 60_000, // 200 req/hora (Data API, por IP)
    label: "Travelpayouts Data API",
  },
  {
    prefix: "api.travelpayouts.com/links/",
    key: "tp-links",
    capacity: 100,
    windowMs: 60_000, // 100 req/min
    label: "Travelpayouts Links API",
  },
  {
    prefix: "api.awin.com/",
    key: "awin",
    capacity: 20,
    windowMs: 60_000, // 20 req/min
    label: "Awin API",
  },
  {
    // O prefixo "amadeus.com/" casa tanto o host de teste (test.api.amadeus.com)
    // quanto o de producao (api.amadeus.com), e cobre os DOIS endpoints usados:
    // /v1/security/oauth2/token e /v1/analytics/itinerary-price-metrics. Limite
    // documentado do tier de teste da Amadeus: 10 req/s (ver docs/PESQUISA-GOOGLE.md).
    prefix: "amadeus.com/",
    key: "amadeus",
    capacity: 10,
    windowMs: 1000, // 10 req/s (limite documentado do tier test)
    label: "Amadeus Flight Price Analysis API",
  },
];

const AVIASALES_PREFIX = "api.travelpayouts.com/aviasales/";

function rateLimitEnabled() {
  const raw = process.env.AONDE_RATE_LIMIT;
  return !(raw && raw.trim().toLowerCase() === "off");
}

function matchRateRule(url) {
  const u = String(url);
  return RATE_RULES.find((rule) => u.includes(rule.prefix)) || null;
}

function humanWindow(windowMs) {
  if (windowMs % (60 * 60_000) === 0) return `${windowMs / (60 * 60_000)}h`;
  if (windowMs % 60_000 === 0) return `${windowMs / 60_000}min`;
  return `${Math.round(windowMs / 1000)}s`;
}

function rateLimitErrorResult(rule, retryAfterMs, maxWaitMs) {
  const secs = (retryAfterMs / 1000).toFixed(1);
  let error =
    `Limite de requisicoes atingido para ${rule.label} ` +
    `(${rule.capacity} req/${humanWindow(rule.windowMs)}). ` +
    `Libera em ~${secs}s.`;
  if (maxWaitMs != null) {
    error += ` Espera excedeu o teto de ${(maxWaitMs / 1000).toFixed(1)}s.`;
  }
  return { ok: false, status: 0, data: null, error, rateLimited: true };
}

/**
 * Adquire uma ficha do rate limiter para `rule`. Em modo "fail" retorna erro
 * imediato ao esgotar; em modo "wait" aguarda (via sleep) ate `maxWaitMs`.
 * @returns {Promise<{ok: true} | {ok: false, result: object}>}
 */
async function acquireToken(rule, mode, maxWaitMs, sleep) {
  let waited = 0;
  // Limite de iteracoes por seguranca (nunca deve ser atingido na pratica).
  for (let i = 0; i < 10_000; i++) {
    const r = limiter.take(rule.key, { capacity: rule.capacity, windowMs: rule.windowMs });
    if (r.ok) return { ok: true };

    if (mode !== "wait") {
      return { ok: false, result: rateLimitErrorResult(rule, r.retryAfterMs) };
    }

    if (waited + r.retryAfterMs > maxWaitMs) {
      return { ok: false, result: rateLimitErrorResult(rule, r.retryAfterMs, maxWaitMs) };
    }
    await sleep(r.retryAfterMs);
    waited += r.retryAfterMs;
  }
  return { ok: false, result: rateLimitErrorResult(rule, maxWaitMs, maxWaitMs) };
}

function isRetryableResult(res) {
  if (res.networkError) return true;
  if (res.status === 429) return true;
  if (res.status >= 500 && res.status <= 599) return true;
  return false;
}

function backoffDelay(attempt, baseMs, maxMs, jitterFn) {
  const exp = Math.min(baseMs * 2 ** attempt, maxMs);
  // "Equal jitter": metade fixa + metade aleatoria, evita thundering herd sem
  // zerar o backoff. jitterFn injetavel torna o teste deterministico.
  const half = exp / 2;
  return Math.round(half + jitterFn() * half);
}

function parseRetryAfter(headerValue, nowMs) {
  if (!headerValue) return null;
  const asNumber = Number(headerValue);
  if (Number.isFinite(asNumber)) return Math.max(0, asNumber * 1000);
  const asDate = Date.parse(headerValue);
  if (!Number.isNaN(asDate)) return Math.max(0, asDate - nowMs);
  return null;
}

function resolveCacheTtl(url, options) {
  if (options.cacheTtlMs != null) {
    const n = Number(options.cacheTtlMs);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
  const isCacheable = String(url).includes(AVIASALES_PREFIX);
  const raw = process.env.AONDE_CACHE_TTL_MS;
  if (raw != null && raw.trim() !== "") {
    const n = parseInt(raw, 10);
    if (Number.isNaN(n)) return isCacheable ? DEFAULT_AVIASALES_TTL_MS : 0;
    if (n === 0) return 0; // desliga o cache globalmente
    return isCacheable ? n : 0;
  }
  return isCacheable ? DEFAULT_AVIASALES_TTL_MS : 0;
}

/**
 * Executa UMA tentativa de requisicao (sem retry/rate-limit/cache) e normaliza
 * o resultado, sinalizando se foi erro de rede/timeout (networkError) e o
 * Retry-After eventualmente informado pelo servidor.
 */
async function doFetchOnce(url, { method, headers, body, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await state.fetchImpl(url, {
      method,
      headers,
      body,
      signal: controller.signal,
    });

    const text = await response.text();
    let data = null;
    let parseError = false;

    if (text && text.length > 0) {
      try {
        data = JSON.parse(text);
      } catch {
        parseError = true;
      }
    }

    if (!response.ok) {
      let retryAfterMs = null;
      if (response.status === 429 || response.status === 503) {
        const header =
          typeof response.headers?.get === "function"
            ? response.headers.get("retry-after")
            : null;
        retryAfterMs = parseRetryAfter(header, state.now());
      }
      return {
        ok: false,
        status: response.status,
        data,
        error: `HTTP ${response.status} ${response.statusText || ""}`.trim(),
        networkError: false,
        retryAfterMs,
      };
    }

    if (parseError) {
      return {
        ok: false,
        status: response.status,
        data: null,
        error: "Resposta HTTP nao e um JSON valido",
        networkError: false,
        retryAfterMs: null,
      };
    }

    return { ok: true, status: response.status, data, error: null };
  } catch (err) {
    if (err && err.name === "AbortError") {
      return {
        ok: false,
        status: 0,
        data: null,
        error: `Tempo limite excedido (${timeoutMs}ms) ao chamar ${url}`,
        networkError: true,
        retryAfterMs: null,
      };
    }
    return {
      ok: false,
      status: 0,
      data: null,
      error: (err && err.message) || String(err),
      networkError: true,
      retryAfterMs: null,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Executa uma requisicao HTTP com robustez (rate limit + retry + cache) e
 * normaliza o resultado. Nunca lanca excecao.
 *
 * @param {string} url
 * @param {object} [options]
 * @param {"GET"|"POST"|string} [options.method]
 * @param {object} [options.headers]
 * @param {string} [options.body]
 * @param {number} [options.timeoutMs]
 * @param {number} [options.retries] tentativas extras apos a 1a (default 2)
 * @param {number} [options.retryBaseMs] base do backoff exponencial (default 500)
 * @param {"fail"|"wait"} [options.rateLimit] comportamento ao esgotar fichas
 * @param {number} [options.maxWaitMs] teto de espera no modo "wait" (default 30s)
 * @param {number} [options.cacheTtlMs] TTL de cache para este GET (ms)
 * @param {() => number} [options.jitterFn] fonte de jitter (default Math.random)
 * @param {(ms:number)=>Promise<void>} [options.sleepImpl] sleep injetavel
 * @returns {Promise<{ok: boolean, status: number, data: any, error: string|null}>}
 */
export async function httpRequest(url, options = {}) {
  const {
    method = "GET",
    headers = {},
    body,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = DEFAULT_RETRIES,
    retryBaseMs = DEFAULT_RETRY_BASE_MS,
    retryMaxMs = DEFAULT_RETRY_MAX_MS,
    retryAfterCapMs = DEFAULT_RETRY_AFTER_CAP_MS,
    rateLimit = "fail",
    maxWaitMs = DEFAULT_MAX_WAIT_MS,
    jitterFn = Math.random,
    sleepImpl,
  } = options;

  if (typeof state.fetchImpl !== "function") {
    return {
      ok: false,
      status: 0,
      data: null,
      error:
        "fetch nao esta disponivel neste ambiente (requer Node.js >= 18 ou fetch injetado via setFetchImpl)",
    };
  }

  const sleep = sleepImpl || state.sleep;

  // ---- Cache (somente GET bem-sucedido) ----
  const isGet = String(method).toUpperCase() === "GET";
  const cacheTtl = isGet ? resolveCacheTtl(url, options) : 0;
  const cacheKey = cacheTtl > 0 ? makeCacheKey(url, headers) : null;
  if (cacheKey) {
    const cached = getCache(cacheKey, state.now());
    if (cached) return { ...cached, fromCache: true }; // hit NAO consome ficha
  }

  const rule = rateLimitEnabled() ? matchRateRule(url) : null;

  let attempt = 0;
  for (;;) {
    // Adquire uma ficha do rate limiter (cada tentativa real conta uma ficha).
    if (rule) {
      const gate = await acquireToken(rule, rateLimit, maxWaitMs, sleep);
      if (!gate.ok) return gate.result;
    }

    const res = await doFetchOnce(url, { method, headers, body, timeoutMs });

    if (res.ok) {
      if (cacheKey) {
        setCache(
          cacheKey,
          { ok: true, status: res.status, data: res.data, error: null },
          cacheTtl,
          state.now()
        );
      }
      return { ok: true, status: res.status, data: res.data, error: null };
    }

    if (attempt >= retries || !isRetryableResult(res)) {
      // Devolve o formato publico estavel (sem os campos internos de controle).
      return { ok: false, status: res.status, data: res.data, error: res.error };
    }

    let delay = backoffDelay(attempt, retryBaseMs, retryMaxMs, jitterFn);
    if (res.retryAfterMs != null) {
      delay = Math.min(res.retryAfterMs, retryAfterCapMs);
    }
    await sleep(delay);
    attempt++;
  }
}
