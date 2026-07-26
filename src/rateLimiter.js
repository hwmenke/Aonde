// Rate limiting client-side via algoritmo de "token bucket" (balde de fichas).
//
// Cada chave (ex.: um grupo de endpoints de um parceiro) tem um balde com
// capacidade maxima e uma taxa de recarga continua. Cada requisicao consome
// uma ficha; quando o balde esvazia, novas requisicoes falham ate haver
// recarga suficiente.
//
// O relogio e injetavel (parametro `now`) para permitir testes deterministicos
// com um clock falso, sem depender de tempo real.
//
// LIMITACAO IMPORTANTE: o estado vive em memoria do processo. Multiplos
// processos/instancias (ex.: varios workers, varias replicas) NAO coordenam
// entre si — cada um mantem seus proprios baldes. Portanto os limites aqui
// sao aproximacoes por processo, uteis para nao estourar limites com folga,
// mas nao substituem um limitador distribuido.

/**
 * Cria um limitador de taxa com baldes independentes por chave.
 *
 * @param {object} [opts]
 * @param {() => number} [opts.now] funcao que retorna o tempo atual em ms
 *        (default: Date.now). Injetavel para testes.
 * @returns {{
 *   take: (key: string, cfg: {capacity: number, windowMs: number}) => {ok: boolean, retryAfterMs: number, remaining: number},
 *   peek: (key: string) => number,
 *   reset: (key?: string) => void
 * }}
 */
export function createRateLimiter({ now = () => Date.now() } = {}) {
  // key -> { tokens, capacity, refillPerMs, last }
  const buckets = new Map();

  function refill(bucket, at) {
    const elapsed = at - bucket.last;
    if (elapsed <= 0) return;
    bucket.tokens = Math.min(bucket.capacity, bucket.tokens + elapsed * bucket.refillPerMs);
    bucket.last = at;
  }

  /**
   * Tenta consumir uma ficha do balde `key`. Se o balde ainda nao existe, e
   * criado cheio (capacity) com a configuracao informada. Reconfigura a taxa
   * caso a config mude entre chamadas.
   *
   * @returns {{ok: boolean, retryAfterMs: number, remaining: number}}
   *   ok=true e ficha consumida; ok=false e retryAfterMs indica em quanto
   *   tempo (ms) havera >= 1 ficha disponivel.
   */
  function take(key, { capacity, windowMs }) {
    const at = now();
    const refillPerMs = capacity / windowMs;

    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { tokens: capacity, capacity, refillPerMs, last: at };
      buckets.set(key, bucket);
    } else {
      // Mantem a config atualizada (capacity/taxa podem ter mudado).
      bucket.capacity = capacity;
      bucket.refillPerMs = refillPerMs;
      refill(bucket, at);
    }

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return { ok: true, retryAfterMs: 0, remaining: Math.floor(bucket.tokens) };
    }

    const needed = 1 - bucket.tokens;
    const retryAfterMs = Math.ceil(needed / bucket.refillPerMs);
    return { ok: false, retryAfterMs, remaining: 0 };
  }

  /** Retorna quantas fichas inteiras estao disponiveis agora (sem consumir). */
  function peek(key) {
    const bucket = buckets.get(key);
    if (!bucket) return Infinity;
    refill(bucket, now());
    return Math.floor(bucket.tokens);
  }

  /** Zera o estado de um balde especifico ou de todos (util em testes). */
  function reset(key) {
    if (key === undefined) buckets.clear();
    else buckets.delete(key);
  }

  return { take, peek, reset };
}
