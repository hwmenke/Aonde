// Cache em memoria com TTL para respostas GET bem-sucedidas.
//
// A chave combina a URL completa com um hash simples do token de autenticacao
// relevante (X-Access-Token / Authorization). Isso evita que a resposta obtida
// com um token vaze para uma chamada feita com outro token — sem nunca guardar
// o token em claro na chave.
//
// LIMITACAO: assim como o rate limiter, o cache vive em memoria do processo e
// nao e compartilhado entre processos/instancias.

// url+authHash -> { value, expiresAt }
const store = new Map();

/**
 * Hash nao-criptografico (djb2) de uma string, retornado em hexadecimal.
 * Serve apenas para diferenciar tokens na chave de cache — NAO e seguranca.
 */
function simpleHash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h + str.charCodeAt(i)) >>> 0; // h * 33 + c, mantido em 32 bits
  }
  return h.toString(16);
}

/** Extrai o valor do header de auth relevante (case-insensitive), se houver. */
function extractAuthValue(headers = {}) {
  for (const [name, value] of Object.entries(headers)) {
    const lower = name.toLowerCase();
    if (lower === "x-access-token" || lower === "authorization") {
      return `${lower}:${value}`;
    }
  }
  return "";
}

/**
 * Monta a chave de cache a partir da URL e dos headers de auth. Diferentes
 * tokens produzem chaves diferentes; ausencia de token gera hash "anon".
 */
export function makeCacheKey(url, headers) {
  const auth = extractAuthValue(headers);
  const authHash = auth ? simpleHash(auth) : "anon";
  return `${url}::${authHash}`;
}

/**
 * Retorna uma copia do valor em cache se existir e nao estiver expirado.
 * Entradas expiradas sao removidas na leitura (limpeza preguicosa).
 * @returns {any|undefined}
 */
export function getCache(key, now = Date.now()) {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (now > entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return cloneValue(entry.value);
}

/** Guarda um valor no cache com TTL em ms. ttlMs <= 0 nao guarda nada. */
export function setCache(key, value, ttlMs, now = Date.now()) {
  if (!(ttlMs > 0)) return;
  store.set(key, { value: cloneValue(value), expiresAt: now + ttlMs });
}

/** Limpa todo o cache (uso: testes e invalidacao manual). */
export function clearHttpCache() {
  store.clear();
}

// Clona o valor para que o chamador nao consiga mutar o objeto armazenado
// (nem vice-versa). structuredClone existe no Node >= 18.
function cloneValue(value) {
  try {
    return structuredClone(value);
  } catch {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }
}
