// Rate limiting INBOUND (por IP, janela fixa, em memoria) para os endpoints
// publicos de ESCRITA da API (POST). Objetivo: conter abuso/spam simples
// (bots batendo em /subscribe, /unsubscribe, /alerts ou /click em loop) sem
// exigir infraestrutura externa (Redis, etc.) — coerente com o resto do
// modulo, que e zero-dependencia.
//
// Algoritmo: janela fixa ("fixed window"). Cada chave (IP + classe de rota)
// tem um contador que zera quando a janela expira. E mais simples que um
// token bucket (ver src/rateLimiter.js, usado para o trafego OUTBOUND aos
// parceiros) e suficiente para essa finalidade: nao precisamos de suavizacao
// entre janelas, so de um teto aproximado por minuto.
//
// Configuravel por env (defaults sensatos para um site publico de baixo/medio
// trafego, calibrados para nao incomodar um visitante legitimo comparando
// varias ofertas em sequencia):
//   AONDE_INBOUND_RATE_LIMIT_WINDOW_MS - duracao da janela em ms.
//                                        Default: 60000 (1 minuto).
//   AONDE_INBOUND_RATE_LIMIT_MAX       - requisicoes permitidas por IP, por
//                                        classe de rota, dentro da janela.
//                                        Default: 20.
//   AONDE_INBOUND_RATE_LIMIT_DISABLED  - "1" desliga o limitador por completo
//                                        (util em dev/carga). NUNCA usar em
//                                        producao.
// Valores invalidos/ausentes no env caem no default (nunca derrubam o
// processo por causa de uma env var malformada).
//
// IP do cliente: usa req.socket.remoteAddress por padrao; se o header
// `x-forwarded-for` estiver presente (tipico atras de proxy/load balancer),
// usa o PRIMEIRO IP da lista (o mais proximo do cliente original). Isso e uma
// aproximacao razoavel — em producao atras de um proxy confiavel, o ideal e
// esse proxy normalizar/sanitizar o header antes de repassar.
//
// LIMITACAO: estado em memoria de UM processo — nao coordena entre workers ou
// replicas (mesma limitacao documentada em src/rateLimiter.js). Para essa
// finalidade (conter abuso grosseiro, nao um SLA rigoroso) e uma aproximacao
// aceitavel.
//
// Resiliencia: qualquer erro interno inesperado faz o limitador LIBERAR a
// requisicao (falha aberta) — nunca deve ser a causa de o processo cair ou de
// trafego legitimo ser bloqueado por um bug.

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX = 20;

function envPositiveInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || String(raw).trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function isDisabled() {
  return process.env.AONDE_INBOUND_RATE_LIMIT_DISABLED === "1";
}

/**
 * Extrai o IP do cliente de uma requisicao http.IncomingMessage: primeiro IP
 * de `x-forwarded-for` (se presente), senao o IP do socket TCP. Nunca lanca —
 * cai em "unknown" se nada estiver disponivel (o request ainda e limitado,
 * so compartilha o balde "unknown" entre si).
 */
export function clientIp(req) {
  try {
    const fwd = req && req.headers && req.headers["x-forwarded-for"];
    if (typeof fwd === "string" && fwd.trim() !== "") {
      const first = fwd.split(",")[0].trim();
      if (first) return first;
    }
    const remote = req && req.socket && req.socket.remoteAddress;
    return remote || "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Cria um limitador de taxa inbound independente (baldes proprios). Uma
 * instancia nova e criada por servidor (ver src/server.js: createServer()
 * chama isso uma vez por chamada), o que tambem isola o estado entre testes
 * que sobem servidores diferentes.
 *
 * @param {object} [opts]
 * @param {() => number} [opts.now] funcao que retorna o tempo atual em ms
 *        (default: Date.now). Injetavel para testes deterministicos.
 * @returns {{
 *   take: (key: string) => {ok: boolean, retryAfterMs: number},
 *   reset: (key?: string) => void
 * }}
 */
export function createInboundRateLimiter({ now = () => Date.now() } = {}) {
  // key ("classe-de-rota:ip") -> { count, windowStart }
  const buckets = new Map();

  /**
   * Consome uma "requisicao" da chave informada. Le a config (janela/limite)
   * do env A CADA CHAMADA — permite ajustar via env em runtime/testes sem
   * recriar o limitador.
   */
  function take(key) {
    if (isDisabled()) return { ok: true, retryAfterMs: 0 };
    try {
      const at = now();
      const windowMs = envPositiveInt("AONDE_INBOUND_RATE_LIMIT_WINDOW_MS", DEFAULT_WINDOW_MS);
      const max = envPositiveInt("AONDE_INBOUND_RATE_LIMIT_MAX", DEFAULT_MAX);

      let bucket = buckets.get(key);
      if (!bucket || at - bucket.windowStart >= windowMs) {
        bucket = { count: 0, windowStart: at };
        buckets.set(key, bucket);
      }
      bucket.count += 1;

      if (bucket.count > max) {
        const retryAfterMs = Math.max(0, windowMs - (at - bucket.windowStart));
        return { ok: false, retryAfterMs };
      }
      return { ok: true, retryAfterMs: 0 };
    } catch {
      // Falha aberta: um bug aqui nunca deve bloquear trafego legitimo nem
      // derrubar o processo.
      return { ok: true, retryAfterMs: 0 };
    }
  }

  /** Zera o estado de uma chave especifica ou de todas (util em testes). */
  function reset(key) {
    if (key === undefined) buckets.clear();
    else buckets.delete(key);
  }

  return { take, reset };
}
